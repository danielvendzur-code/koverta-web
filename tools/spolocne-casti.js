#!/usr/bin/env node
/* Hlavička a pätička musia byť na celom webe jedny.
 *
 * Navigácia je jeden komponent, ale na webe existovala v jedenástich verziách:
 * 67 stránok malo jednu, sedem druhú a deväť stránok malo každá svoju vlastnú.
 * Líšili sa fotografiami v mega-menu, ich popismi a uvádzanými rozmermi — tá
 * istá fotografia mala raz 1800 × 1350, inde 1600 × 1200, hoci súbor má
 * 1000 × 750. Návštevník tak pri prechode medzi stránkami videl v ponuke iné
 * obrázky a pri prenose na Shopify by z jedného komponentu vzniklo jedenásť
 * sekcií.
 *
 *   node tools/spolocne-casti.js            zjednotí hlavičku aj pätičku
 *   node tools/spolocne-casti.js --kontrola len overí, či sú jedny
 *
 * Predlohou je verzia, ktorú nesie najviac stránok. Cesty sa prepisujú podľa
 * hĺbky stránky, takže `../` na podstránke a `./` na úvode sú to isté a za
 * rozdiel sa nepovažujú. Rozmery obrázkov sa berú zo súborov.
 *
 * Jediná povolená odchýlka je v pätičke: tlačidlo na dopyt nesie na stránkach
 * katalógových rozmerov zvolený rozmer (`?w=4000&l=6000#ponuka`). Tá sa
 * zachováva — nie je to nepozornosť, ale zámer.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const LEN_KONTROLA = process.argv.includes('--kontrola');
const PRESKOC = new Set(['node_modules', '.git', 'coordination', 'qa-artifacts',
  'archiv-expivi', 'shopify-tema', 'tools', 'interny-odhad-patiek']);

const CASTI = [
  { meno: 'hlavička', od: '<header class="kv-header"', po: '</header>' },
  { meno: 'pätička', od: '<footer class="k kf"', po: '</footer>' },
];

/* Atribúty, v ktorých je cesta a treba ju prepísať podľa hĺbky stránky. */
const CESTY = /\b(src|href|srcset|data-k-menu-src|poster)="([^"]*)"/g;

function stranky(adresar, zoznam = []) {
  for (const p of fs.readdirSync(adresar, { withFileTypes: true })) {
    if (PRESKOC.has(p.name)) continue;
    const cesta = path.join(adresar, p.name);
    if (p.isDirectory()) stranky(cesta, zoznam);
    else if (p.name.endsWith('.html')) zoznam.push(cesta);
  }
  return zoznam;
}

/* Hĺbka stránky pod koreňom: `index.html` je 0, `kontakt/index.html` je 1. */
function hlbka(subor) {
  return path.relative(KOREN, subor).split(path.sep).length - 1;
}

/* Cesta z pohľadu stránky na koreňovú cestu a späť. Koreňová cesta je bez
   predpony, teda `assets/x.jpg` alebo `kontakt/`. */
function naKoren(hodnota, h) {
  if (/^(?:https?:|mailto:|tel:|data:|#|\/)/.test(hodnota)) return null;
  return hodnota.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '');
}
function zKorena(hodnota, h) {
  if (hodnota === '') return h === 0 ? './' : '../'.repeat(h);
  return (h === 0 ? './' : '../'.repeat(h)) + hodnota;
}

/* Predloha sa ukladá s cestami od koreňa, aby sa dali porovnať stránky
   z rôznej hĺbky. */
function naPredlohu(text, h) {
  return text.replace(CESTY, (cele, meno, hodnota) => {
    const k = naKoren(hodnota, h);
    return k === null ? cele : meno + '="@' + k + '"';
  });
}
function zPredlohy(text, h) {
  return text.replace(/\b(src|href|srcset|data-k-menu-src|poster)="@([^"]*)"/g,
    (cele, meno, hodnota) => meno + '="' + zKorena(hodnota, h) + '"');
}

const zoznam = stranky(KOREN);
const nalezy = [];
let prepisanych = 0;

for (const cast of CASTI) {
  /* 1 · zozbierať verzie */
  const verzie = new Map();     // predloha → [súbory]
  const kusy = new Map();       // súbor → { a, b, predloha }
  for (const subor of zoznam) {
    const html = fs.readFileSync(subor, 'utf8');
    const a = html.indexOf(cast.od);
    if (a === -1) continue;
    const b = html.indexOf(cast.po, a);
    if (b === -1) { nalezy.push(path.relative(KOREN, subor) + ': ' + cast.meno + ' nemá koniec'); continue; }
    const text = html.slice(a, b + cast.po.length);
    const pred = naPredlohu(text, hlbka(subor));
    /* Tlačidlo na dopyt nesie na stránkach rozmerov zvolený rozmer. Je to
       zámer, takže sa pri porovnávaní nahradí značkou a za rozdiel sa
       nepovažuje; pri zápise sa každej stránke vráti tá jej. */
    const kluc = pred.replace(/(<a class="k-btn k-btn--primary" href=")[^"]*#ponuka(")/, '$1@dopyt$2');
    kusy.set(subor, { a, b: b + cast.po.length, pred, kluc });
    if (!verzie.has(kluc)) verzie.set(kluc, []);
    verzie.get(kluc).push(subor);
  }
  if (!verzie.size) continue;

  /* 2 · predlohou je verzia, ktorú nesie najviac stránok */
  const zoradene = [...verzie].sort((x, y) => y[1].length - x[1].length);
  const predloha = zoradene[0][0];
  if (zoradene.length > 1) {
    nalezy.push(cast.meno + ': ' + zoradene.length + ' verzií (' +
      zoradene.map(([, kde]) => kde.length).join(' + ') + ' stránok)');
  }

  if (LEN_KONTROLA) continue;

  /* 3 · zapísať ju všade */
  for (const [subor, kus] of kusy) {
    if (kus.kluc === predloha) continue;
    const h = hlbka(subor);
    let novy = zPredlohy(predloha.replace('href="@dopyt"', 'href="#ponuka"'), h);
    /* Tlačidlo na dopyt v pätičke si stránka nechá vlastné — nesie rozmer. */
    const vlastny = zPredlohy(kus.pred, h).match(/<a class="k-btn k-btn--primary" href="([^"]*#ponuka)"/);
    if (vlastny) novy = novy.replace(/(<a class="k-btn k-btn--primary" href=")[^"]*#ponuka(")/, '$1' + vlastny[1] + '$2');
    const html = fs.readFileSync(subor, 'utf8');
    fs.writeFileSync(subor, html.slice(0, kus.a) + novy + html.slice(kus.b));
    prepisanych++;
  }
}

if (LEN_KONTROLA) {
  if (!nalezy.length) { console.log('Hlavička aj pätička sú na celom webe jedny.'); process.exit(0); }
  console.error('Spoločné časti sa rozišli:\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nSpravte to príkazom: node tools/spolocne-casti.js');
  process.exit(1);
}

console.log('Prepísaných častí: ' + prepisanych);
for (const n of nalezy) console.log('  bolo: ' + n);
