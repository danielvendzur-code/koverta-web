/*
  Sedia rady stĺpov s modelmi v Expivi?

  Toto je jediná kontrola, ktorá vie povedať „stĺpy sú tam, kde majú byť".
  Berie odmerané polohy z exportov (`archiv-expivi`, súbor kv-mer4.json, ktorý
  vyrobí archiv-expivi/meranie-stlpov-a-vaznic.py) a porovná ich s pásmami
  `kvGeom` v dátach stránky. Nič nerenderuje — porovnávajú sa čísla.

  Pozor na dve veci, ktoré nie sú chyby:
   * Novšie katalógy (3,0 / 3,8 / 4,5 / 5,0 / 5,4 / 6,2 / 6,6 m) majú stĺp
     100 × 100 namiesto 150 × 150. Os stĺpa preto vyjde o 25 – 58 mm inde,
     hoci líce sedí. Tolerancia je preto 70 mm.
   * Export katalógu 7,0 × 5,6 m nesie geometriu 5,2 m a pri hĺbke 5,2 m má
     šesťstĺpová varianta v exporte len stredný rad. Tie sa preskočia.

  Spustenie:
      node konfigurator/test/stlpy-podla-expivi.js
*/
const fs = require('fs');
const path = require('path');
const KOREN = path.resolve(__dirname, '..', '..');
const MER = process.env.KV_MER || path.join(KOREN, 'archiv-expivi', 'stlpy-a-vaznice-odmerane.json');
const TOL = Number(process.env.KV_TOL || 70);

if (!fs.existsSync(MER)) {
  console.log('chýba odmeraný súbor:', MER);
  console.log('vyrobí ho archiv-expivi/meranie-stlpov-a-vaznic.py nad stiahnutými exportmi');
  process.exit(2);
}
const mer = JSON.parse(fs.readFileSync(MER, 'utf8'));

const idx = fs.readFileSync(path.join(KOREN, 'konfigurator', 'index.html'), 'utf8');
const i = idx.indexOf('  var PAGES = ');
const j = idx.indexOf('\n', i);
const PAGES = JSON.parse(idx.slice(i + '  var PAGES = '.length, j).trim().replace(/;$/, ''));
const bio = JSON.parse(/data-sp-bio-data>([\s\S]*?)<\/script>/.exec(PAGES.koverta)[1].replace(/<\\\//g, '</'));
const GEOM = bio.models.K.kvGeom;
const RAM = 158;                     // rám je toľko dnu od vonkajšej hrany strechy

const pasmo = (w) => GEOM.find((g) => w <= g.max) || GEOM[GEOM.length - 1];
const sekcia = (s) => s.replace(/[()\s]/g, '').split(',').map(Number);

const zle = [];
const riadky = [];
Object.keys(mer).sort((a, b) => {
  const [aw, al] = a.split('x').map(Number), [bw, bl] = b.split('x').map(Number);
  return al - bl || aw - bw;
}).forEach((k) => {
  const v = mer[k];
  if (Math.max.apply(null, v.fit) > 120) return;          // pokazený export
  const g = pasmo(v.W);
  const moje = g.poDlzke[String(v.L)].rows.map((r) => Math.round(r + g.postD / 2 + RAM));
  let kand = null;
  for (const s of Object.keys(v.stlpy)) {
    const d = sekcia(s);
    if (d[2] < 2000) continue;
    const rady = Array.from(new Set(v.stlpy[s].map((p) => p[0]))).sort((a, b) => a - b);
    const stvorec = Math.abs(d[0] - 150) < 9 && Math.abs(d[1] - 150) < 9;
    const maly = Math.abs(d[0] - 100) < 9 && Math.abs(d[1] - 100) < 9;
    const sest = Math.min(d[0], d[1]) === 110 && Math.max(d[0], d[1]) === 190;
    if (g.postsPerSide === 2 && (stvorec || maly)) { kand = [rady[0], rady[rady.length - 1]]; break; }
    if (g.postsPerSide === 3 && sest && rady.length >= 3) { kand = rady.slice(-3); break; }
    if (g.postsPerSide === 3 && maly && rady.length >= 3) { kand = [rady[0], rady[rady.length >> 1], rady[rady.length - 1]]; break; }
  }
  if (!kand) return;
  const roz = kand.map((a, n) => a - moje[n]);
  const zly = roz.some((r) => Math.abs(r) > TOL);
  if (zly) zle.push(`${k}: export ${kand} vs model ${moje} (rozdiel ${roz})`);
  riadky.push(`${k.padEnd(11)} export ${String(kand).padEnd(22)} model ${String(moje).padEnd(22)} rozdiel ${roz}${zly ? '   << MIMO' : ''}`);
});

riadky.forEach((r) => console.log(r));
console.log();
console.log(zle.length ? `RADY STĹPOV NESEDIA (${zle.length}):` : `rady stĺpov sedia s Expivi na všetkých ${riadky.length} porovnateľných veľkostiach (tolerancia ${TOL} mm)`);
zle.forEach((z) => console.log('  ' + z));
process.exit(zle.length ? 1 : 0);
