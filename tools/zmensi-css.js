#!/usr/bin/env node
/* Štýl webu bez komentárov.
 *
 * `assets/koverta-2026.css` sa načítava na každej stránke a blokuje prvé
 * vykreslenie: kým ho prehliadač nemá celý, neukáže nič. So všetkými
 * komentármi mal 612 kB (164 kB po gzip) a telefón ho na pomalej linke
 * sťahoval dlhšie než úvodnú fotografiu — PageSpeed to počítal ako hlavnú
 * brzdu LCP. Komentáre sú ale to cenné, čo vysvetľuje, prečo je čo tak,
 * takže sa nemažú zo zdroja:
 *
 *   assets/koverta-2026.zdroj.css   zdroj s komentármi — upravuje sa TENTO
 *   assets/koverta-2026.css         to isté bez komentárov a medzier (stránky)
 *
 *   node tools/zmensi-css.js            prestaví koverta-2026.css zo zdroja
 *   node tools/zmensi-css.js --kontrola len overí, že sa zhodujú
 *
 * Mažú sa len komentáre a nadbytočné medzery. Reťazce a url() ostávajú,
 * nič, čo by zmenilo význam selektora. Tú istú funkciu používa prevod
 * do Shopify témy, takže web aj obchod dostanú rovnaký štýl.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function zmensiCss(css) {
  let von = '', i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const k = css.indexOf('*/', i + 2); i = k === -1 ? css.length : k + 2; continue; }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < css.length && css[k] !== c) { if (css[k] === '\\') k++; k++; }
      von += css.slice(i, k + 1); i = k + 1; continue;
    }
    if (/\s/.test(c)) {
      while (i < css.length && /\s/.test(css[i])) i++;
      const pred = von.slice(-1), po = css[i] || '';
      if (!/[{};,>]/.test(pred) && !/[{};,>]/.test(po) && pred !== '' && po !== '') von += ' ';
      continue;
    }
    von += c; i++;
  }
  return von.replace(/;}/g, '}');
}

module.exports = { zmensiCss };

if (require.main === module) {
  const KOREN = path.resolve(__dirname, '..');
  const ZDROJ = path.join(KOREN, 'assets', 'koverta-2026.zdroj.css');
  const CIEL = path.join(KOREN, 'assets', 'koverta-2026.css');
  const hlavicka = '/* Generované z koverta-2026.zdroj.css príkazom node tools/zmensi-css.js — upravuj zdroj, nie tento súbor. */\n';
  const novy = hlavicka + zmensiCss(fs.readFileSync(ZDROJ, 'utf8')) + '\n';
  const stary = fs.existsSync(CIEL) ? fs.readFileSync(CIEL, 'utf8') : '';
  if (process.argv.includes('--kontrola')) {
    if (novy !== stary) {
      console.error('assets/koverta-2026.css nezodpovedá zdroju koverta-2026.zdroj.css.\n' +
        'Upravuje sa zdroj; potom: node tools/zmensi-css.js && node tools/verzie-suborov.js --oprav');
      process.exit(1);
    }
    console.log('koverta-2026.css zodpovedá zdroju');
  } else {
    fs.writeFileSync(CIEL, novy);
    console.log('koverta-2026.css: ' + Buffer.byteLength(novy) + ' B (zdroj ' + fs.statSync(ZDROJ).size + ' B)');
  }
}
