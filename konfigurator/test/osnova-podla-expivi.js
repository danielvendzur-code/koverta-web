/*
  Dáva osnova v engine tie osi, ktoré sú naozaj v modeloch Expivi?

  Toto je hlavná číselná kontrola prístreška Koverta. Nič nerenderuje —
  prepočíta vzorec osnovy a porovná ho s dielmi odmeranými z kompletných scén
  (`archiv-expivi/diely-zo-sceny.json`, vyrobí ho `diely-zo-sceny.py`).

  Prečo „kompletných": zip exportu obsahuje aj siete variánt, ktoré v scéne
  nie sú — katalóg má materiálové skupiny 4NOHY aj 6NOH a v zipe sú obe.
  Kým sa meral celý zip, vyšla ich zjednotená množina a šesťstĺpová varianta
  z nej mala všetky tri rady vtiahnuté dnu. Skript preto berie len tie siete,
  ktoré scéna naozaj kreslí, a každú rozdelí na súvislé komponenty — jedna
  sieť totiž môže nesť viac dielov.

  Kontroluje sa:
   * os čelných rámov — 52 mm od jednej a 196 mm od druhej hrany strechy,
   * osi väzníc — delia rozpätie medzi tými osami na rovnaké polia,
   * osi stĺpov — krajné na osiach rámu, stredný na prostrednej väznici,
   * prierezy stĺpov — 150 × 150 v rohoch, 110 × 190 v strednom rade.

  Spustenie:
      node konfigurator/test/osnova-podla-expivi.js
*/
const fs = require('fs');
const path = require('path');
const KOREN = path.resolve(__dirname, '..', '..');
const MER = process.env.KV_DIELY || path.join(KOREN, 'archiv-expivi', 'diely-zo-sceny.json');
const TOL = Number(process.env.KV_TOL || 50);

if (!fs.existsSync(MER)) {
  console.log('chýba odmeraný súbor:', MER);
  console.log('vyrobí ho archiv-expivi/diely-zo-sceny.py nad stiahnutými exportmi');
  process.exit(2);
}
const mer = JSON.parse(fs.readFileSync(MER, 'utf8'));
const templates = fs.readFileSync(path.join(KOREN, 'konfigurator', 'cfg-pages.js'), 'utf8');
const assignment = /^window\.KV_PAGES\s*=\s*(\{.*\});?\s*$/m.exec(templates);
if (!assignment) throw new Error('Missing JSON template assignment in cfg-pages.js');
const PAGES = JSON.parse(assignment[1]);
const bio = JSON.parse(/data-sp-bio-data>([\s\S]*?)<\/script>/.exec(PAGES.koverta)[1].replace(/<\\\//g, '</'));
const M = bio.models.K;
const REF = M.kvRef;
const GEOM = M.kvGeom;
const pasmo = (w) => GEOM.find((g) => w <= g.max) || GEOM[GEOM.length - 1];

/* Ten istý vzorec, aký beží v soltec-premium.js. Keby sa rozišli, rozíde sa
   aj tento test s modelom — preto sú tu obe strany napísané z tých istých
   čísel v kvRef, nie prepísané rukou. */
const osiRamu = (L) => ({ zad: REF.ramZad + REF.ramW / 2, odk: L - REF.ramOdkvap - REF.ramW / 2 });
/* Štvorstĺpová varianta: tri väznice po L/4 + 250 od stredu, stĺpy pod
   krajnými dvoma. Existuje v exporte pri každej veľkosti, aj tam, kde ju
   konfigurátor nekreslí, tak sa dá overiť všade. */
const styri = (L) => {
  const o = osiRamu(L), stred = (o.zad + o.odk) / 2, sm = L / 4 + 250;
  const vaz = [stred - sm, stred, stred + sm];
  return { zad: o.zad, odk: o.odk, stred, vaz, stlpy: [vaz[0], vaz[2]] };
};
const osnova = (W, L) => {
  const measured = M.kvBySize && M.kvBySize[`${W}x${L}`];
  if (measured) return { zad: measured.frameAxes[0], odk: measured.frameAxes[1], vaz: measured.purlinAxes, stlpy: measured.postAxes, nv: measured.purlinAxes.length };
  const b = pasmo(W), o = osiRamu(L);
  if (b.vaznicStred) {
    const s = styri(L);
    return { zad: o.zad, odk: o.odk, vaz: s.vaz, stlpy: s.stlpy, nv: 3 };
  }
  const nv = b.vaznicPole > 0
    ? Math.max(1, Math.ceil((o.odk - o.zad) / b.vaznicPole) - 1)
    : Math.max(1, b.vaznic);
  const pole = (o.odk - o.zad) / (nv + 1);
  const vaz = [];
  for (let k = 1; k <= nv; k++) vaz.push(o.zad + pole * k);
  const n = Math.max(2, b.postsPerSide);
  const stlpy = [o.zad];
  for (let k = 1; k < n - 1; k++) stlpy.push(vaz[Math.round(((vaz.length - 1) * k) / (n - 1))]);
  stlpy.push(o.odk);
  return { zad: o.zad, odk: o.odk, vaz, stlpy, nv };
};

/* Odmerané diely: nájdi os hĺbky, potom vyber rámy, väznice a stĺpy. Diel
   pozná len svoj obrys a polohu, tak sa zaraďuje podľa prierezu. */
const rozober = (v) => {
  const ext = v.ext, W = v.W, L = v.L;
  let ord = [0, 1, 2].sort((a, b) => Math.abs(ext[a] - W) - Math.abs(ext[b] - W));
  const aw = ord[0];
  ord = [0, 1, 2].filter((a) => a !== aw).sort((a, b) => Math.abs(ext[a] - L) - Math.abs(ext[b] - L));
  const al = ord[0];
  const az = [0, 1, 2].filter((a) => a !== aw && a !== al)[0];
  if (Math.abs(ext[al] - L) > 120) return null;      // scéna nesie inú hĺbku
  const os = (d) => d.p[al] + d.r[al] / 2;
  /* Väznica je dvojica C profilov chrbtami k sebe, teda dva diely 29 mm od
     osi dvojice. Zoskupené hodnoty sa preto priemerujú — os dvojice je medzi
     nimi, nie na prvom z nich. */
  const uniq = (xs) => {
    const g = [];
    xs.slice().sort((a, b) => a - b).forEach((x) => {
      if (g.length && x - g[g.length - 1][g[g.length - 1].length - 1] <= 70) g[g.length - 1].push(x);
      else g.push([x]);
    });
    return g.map((q) => q.reduce((a, b) => a + b, 0) / q.length);
  };
  const D = v.diely;
  const ram = uniq(D.filter((d) => d.r[az] >= 200 && d.r[az] <= 240 && d.r[al] < 120 && d.r[aw] > 1000).map(os));
  const vaz = uniq(D.filter((d) => d.r[az] >= 170 && d.r[az] <= 190 && d.r[al] < 70 && d.r[aw] > 1000).map(os));
  const st = D.filter((d) => d.r[az] > 2000 && Math.max(d.r[aw], d.r[al]) <= 260);
  const stlpy = [];
  st.slice().sort((a, b) => os(a) - os(b)).forEach((d) => {
    if (stlpy.length && os(d) - stlpy[stlpy.length - 1].os <= 70) return;
    stlpy.push({ os: os(d), w: d.r[aw], d: d.r[al] });
  });
  /* Osi sa merajú od hrany strechy, nie od obrysu modelu — ten je väčší,
     lebo doň patria aj kotevné pätky. Hranu strechy dá lemovanie: jeho bočný
     kus je dlhý presne hĺbku prístreška, tak jeho začiatok je nula. */
  const lem = D.filter((d) => Math.abs(d.r[al] - L) <= 30 && d.r[az] > 150).map((d) => d.p[al]);
  const posun = lem.length ? Math.min.apply(null, lem) : Math.min.apply(null, D.map((d) => d.p[al]));
  return { aw, al, az, ram, vaz, stlpy, posun };
};

let zle = 0, ok = 0;
const chyba = (m) => { console.log('  ✗ ' + m); zle += 1; };
Object.keys(mer).sort().forEach((k) => {
  const v = mer[k];
  const r = rozober(v);
  if (!r) return;
  if (!r.stlpy.length && !r.vaz.length) return;      // len strecha, niet čo porovnať
  const L = v.L, W = v.W;
  if (v.W !== 7000) return;   // kompletné scény so stĺpmi má len sedemmetrový
  if (L < 5000) return;       // 3,0 a 4,0 m hĺbka je iný výrobok (stĺp 200 × 200)
  const o = osnova(W, L);
  /* Model má osi číslované od druhej hrany než engine, tak sa porovnáva
     zrkadlovo — obe orientácie a berie sa tá lepšia. */
  const zrkadlo = (xs) => xs.map((x) => L - x).sort((a, b) => a - b);
  const priamo = (xs) => xs.slice().sort((a, b) => a - b);
  const odchylka = (a, b) => (a.length !== b.length ? Infinity
    : Math.max(...a.map((x, n) => Math.abs(x - b[n]))));
  const porovnaj = (meno, mera, moje) => {
    const m = mera.map((x) => x - r.posun);
    const d = Math.min(odchylka(priamo(m), priamo(moje)), odchylka(zrkadlo(m), priamo(moje)));
    if (!isFinite(d)) chyba(k + ' ' + meno + ': model má ' + mera.length + ', engine ' + moje.length);
    else if (d > TOL) chyba(k + ' ' + meno + ': odchýlka ' + Math.round(d) + ' mm > ' + TOL
                            + ' (model ' + priamo(m).map(Math.round) + ', engine ' + priamo(moje).map(Math.round) + ')');
    else ok += 1;
  };
  porovnaj('osi rámu', r.ram, [o.zad, o.odk]);
  porovnaj('osi väzníc', r.vaz, o.vaz);
  porovnaj('osi stĺpov', r.stlpy.map((s) => s.os), o.stlpy);
  /* Prierezy: rohový stĺp je štvorec, stredný má hlbší prierez cez hĺbku. */
  const roh = r.stlpy.filter((s) => s.w === s.d);
  const stred = r.stlpy.filter((s) => s.w !== s.d);
  if (roh.length && (roh[0].w !== REF.postD || roh[0].d !== REF.postW))
    chyba(k + ' prierez rohového stĺpa: model ' + roh[0].w + '×' + roh[0].d
          + ', dáta ' + REF.postD + '×' + REF.postW);
  else if (roh.length) ok += 1;
  if (stred.length && (stred[0].w !== REF.stredW || stred[0].d !== REF.stredD))
    chyba(k + ' prierez stredného stĺpa: model ' + stred[0].w + '×' + stred[0].d
          + ', dáta ' + REF.stredW + '×' + REF.stredD);
  else if (stred.length) ok += 1;
});
/* Aj tie scény, v ktorých je len strecha, vedia povedať jednu vec: kde má
   obvodový rám os. Tú porovnáme na všetkých. */
let ramOk = 0;
Object.keys(mer).sort().forEach((k) => {
  const v = mer[k], r = rozober(v);
  if (!r || r.ram.length !== 2 || v.L < 5000) return;
  const o = osnova(v.W, v.L);
  const m = r.ram.map((x) => x - r.posun).sort((a, b) => a - b);
  const mine = [o.zad, o.odk].sort((a, b) => a - b);
  const zr = m.map((x) => v.L - x).sort((a, b) => a - b);
  const d = Math.min(Math.max(Math.abs(m[0] - mine[0]), Math.abs(m[1] - mine[1])),
                     Math.max(Math.abs(zr[0] - mine[0]), Math.abs(zr[1] - mine[1])));
  if (d > TOL) chyba(k + ' os obvodového rámu: odchýlka ' + Math.round(d) + ' mm');
  else ramOk += 1;
});
/* Rohové stĺpy 150 × 150 sa dajú overiť na každom katalógu, nielen na tých
   s kompletnou scénou: v zipe exportu sú síce siete oboch variánt naraz,
   ale prierez 150 × 150 má len štvorstĺpová a sú presne štyri. Ich osi teda
   nie je s čím zameniť. Meria ich archiv-expivi/meranie-stlpov-a-vaznic.py
   do stlpy-a-vaznice-odmerane.json. */
const fs2 = require('fs');
const UNIA = path.join(KOREN, 'archiv-expivi', 'stlpy-a-vaznice-odmerane.json');
if (!fs.existsSync(UNIA)) throw new Error('Missing required Expivi measurements: ' + UNIA);
let rohOk = 0, styriOk = 0;
if (fs2.existsSync(UNIA)) {
  const u = JSON.parse(fs2.readFileSync(UNIA, 'utf8'));
  Object.keys(u).sort().forEach((k) => {
    const v = u[k];
    const rez = v.stlpy && v.stlpy['(150, 150, 2398)'];
    if (!rez || rez.length !== 4) return;
    /* Prvá zložka bodu je os po hĺbke. Nula je hrana strechy: obrys modelu
       je o kus väčší, lebo doň patria aj kotevné pätky. */
    const osi = [];
    rez.map((p) => p[0]).sort((a, b) => a - b).forEach((x) => {
      if (!osi.length || x - osi[osi.length - 1] > 70) osi.push(x);
    });
    if (osi.length !== 2) return;
    /* Obrys modelu je dlhší než strecha, lebo na odkvapovom konci prečnieva
       kotevná pätka: jej os je 52 mm od hrany a doska má 250, takže vytŕča
       125 − 52 = 73 mm. O toľko je obrys dlhší a o toľko treba osi posunúť.
       Export, ktorý nesie geometriu inej hĺbky (14198), sa preskočí. */
    if (Math.abs(v.ext[1] - v.L) > 150) return;
    const nula = v.ext[1] - v.L - (REF.plate / 2 - (REF.ramZad + REF.ramW / 2));
    const m = osi.map((x) => x - nula).sort((a, b) => a - b);
    const o = osiRamu(v.L);
    const moje = [o.zad, o.odk].sort((a, b) => a - b);
    const zr = m.map((x) => v.L - x).sort((a, b) => a - b);
    const d = Math.min(Math.max(Math.abs(m[0] - moje[0]), Math.abs(m[1] - moje[1])),
                       Math.max(Math.abs(zr[0] - moje[0]), Math.abs(zr[1] - moje[1])));
    if (d > TOL) chyba(k + ' osi rohových stĺpov: odchýlka ' + Math.round(d)
                       + ' mm (model ' + m.map(Math.round) + ', engine ' + moje.map(Math.round) + ')');
    else rohOk += 1;
  });
  /* Rady štvorstĺpovej varianty: prierez 110 × 190 majú jej štyri stĺpy aj
     stredný rad šesťstĺpovej, takže v zipe je z nich zjednotenie {krajný,
     stredný, krajný}. Porovnáva sa celá trojica proti vzorcu. */
  Object.keys(u).sort().forEach((k) => {
    const v = u[k];
    const rez = v.stlpy && v.stlpy['(110, 190, 2398)'];
    /* Od 6,6 m sa štvorstĺpová varianta nepredáva a v jej exporte je
       päťväznicová sada, takže tie rady sú inde a niet ich s čím porovnať. */
    if (!rez || Math.abs(v.ext[1] - v.L) > 150 || v.W > 6200) return;
    const osiM = [];
    rez.map((p) => p[0]).sort((a, b) => a - b).forEach((x) => {
      if (!osiM.length || x - osiM[osiM.length - 1] > 70) osiM.push(x);
    });
    if (osiM.length !== 3) return;
    const nula = v.ext[1] - v.L - (REF.plate / 2 - (REF.ramZad + REF.ramW / 2));
    const m = osiM.map((x) => x - nula);
    const s4 = styri(v.L);
    const moje = s4.vaz.slice().sort((a, b) => a - b);
    const zr = m.map((x) => v.L - x).sort((a, b) => a - b);
    const roz = (A, B) => Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
    const d = Math.min(roz(m, moje), roz(zr, moje));
    if (d > TOL) chyba(k + ' rady štvorstĺpovej: odchýlka ' + Math.round(d)
                       + ' mm (model ' + m.map(Math.round) + ', engine ' + moje.map(Math.round) + ')');
    else styriOk += 1;
  });
}
if (!ok || !ramOk || !rohOk || !styriOk) throw new Error('Incomplete Expivi coverage; refusing to report PASS');
if (zle) { console.log('osnova nesedí s Expivi: ' + zle + ' rozdielov'); process.exit(1); }
console.log('Historická kontrola vzorcov a dát (presný runtime kontroluje routing-smoke): (' + ok + ' porovnaní osí a prierezov, '
            + ramOk + ' katalógov s osou rámu, ' + rohOk + ' s rohovými stĺpmi, '
            + styriOk + ' s radmi štvorstĺpovej, tolerancia ' + TOL + ' mm)');
