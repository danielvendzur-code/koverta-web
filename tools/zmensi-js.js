#!/usr/bin/env node
/* Skript webu bez komentárov.
 *
 * `assets/koverta-2026.js` je na každej stránke a s komentármi mal 205 kB
 * (63 kB gzip). Na mobile ho Lighthouse sťahuje ešte pred vykreslením úvodnej
 * fotografie, na pomalej linke o ňu súperí a PageSpeed ho hlási ako
 * nepoužitý JavaScript. Komentáre však vysvetľujú, prečo je čo tak, preto
 * ostávajú v zdroji:
 *
 *   assets/koverta-2026.zdroj.js   zdroj s komentármi — upravuje sa TENTO
 *   assets/koverta-2026.js         to isté bez komentárov a medzier (stránky)
 *
 *   node tools/zmensi-js.js            prestaví koverta-2026.js zo zdroja
 *   node tools/zmensi-js.js --kontrola len overí, že sa zhodujú
 *
 * Terser tu len zahodí komentáre a medzery: bez `compress` a bez `mangle`,
 * úvodzovky ostávajú pôvodné. Kód, mená premenných aj reťazce (cesty,
 * názvy udalostí pre GTM) sú tie isté. Verzia je pevná, aby výstup nezávisel
 * od toho, kto ho spustil: npm install --no-save terser@5.51.2
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const VERZIA = '5.51.2';
const KOREN = path.resolve(__dirname, '..');
const ZDROJ = path.join(KOREN, 'assets', 'koverta-2026.zdroj.js');
const CIEL = path.join(KOREN, 'assets', 'koverta-2026.js');

let terser;
try { terser = require('terser'); } catch (e) {
  console.error('Chýba terser. Nainštaluj ho: npm install --no-save terser@' + VERZIA);
  process.exit(2);
}
const nainstalovana = require('terser/package.json').version;
if (nainstalovana !== VERZIA) {
  console.error('Terser ' + nainstalovana + ' namiesto ' + VERZIA + ' — výstup by sa mohol líšiť. npm install --no-save terser@' + VERZIA);
  process.exit(2);
}

(async () => {
  const zdroj = fs.readFileSync(ZDROJ, 'utf8');
  const vysledok = await terser.minify(zdroj, {
    compress: false,
    mangle: false,
    ecma: 2020,
    format: { comments: false, quote_style: 3 }
  });
  const hlavicka = '/* Generované z koverta-2026.zdroj.js príkazom node tools/zmensi-js.js — upravuj zdroj, nie tento súbor. */\n';
  const novy = hlavicka + vysledok.code + '\n';
  const stary = fs.existsSync(CIEL) ? fs.readFileSync(CIEL, 'utf8') : '';
  if (process.argv.includes('--kontrola')) {
    if (novy !== stary) {
      console.error('assets/koverta-2026.js nezodpovedá zdroju koverta-2026.zdroj.js.\n' +
        'Upravuje sa zdroj; potom: node tools/zmensi-js.js && node tools/verzie-suborov.js --oprav');
      process.exit(1);
    }
    console.log('koverta-2026.js zodpovedá zdroju');
  } else {
    fs.writeFileSync(CIEL, novy);
    console.log('koverta-2026.js: ' + Buffer.byteLength(novy) + ' B (zdroj ' + Buffer.byteLength(zdroj) + ' B)');
  }
})();
