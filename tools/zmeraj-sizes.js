#!/usr/bin/env node
'use strict';
/* Prepočíta `sizes` obrázkov podľa šírky, na akej sa naozaj zobrazujú.
 *
 * Hodnoty ako `(max-width: 900px) 303px, 1555px` boli odmerané raz, na
 * jednom okne. Karta, ktorá je na počítači 549 px široká, tak sťahovala
 * 1600-pixelovú verziu. Nástroj otvorí každú stránku na 390 a 1440 px,
 * zmeria vykreslenú šírku každého obrázka so `srcset` a zapíše ju v `vw`,
 * takže platí aj na iných šírkach okna.
 *
 *   node tools/zmeraj-sizes.js      (potrebuje statický server na 8904)
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const KOREN = path.resolve(__dirname, '..');
const ZAKLAD = process.env.KV_SERVER || 'http://127.0.0.1:8904';
const STRANKY = ['', 'pristresky-pre-auta', 'zahradne-pristresky', 'bioklimaticke-pergoly', 'carport-soltec',
  'pevne-prestresenia', 'tienenie', 'outdoor-kuchyne', 'realizacie', 'kontakt', 'produkty', 'konfigurator'];

async function zmeraj(page, url, sirka) {
  await page.setViewportSize({ width: sirka, height: 900 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page.evaluate(() => [...document.querySelectorAll('img[srcset]')].map((i) => ({
    src: i.getAttribute('src'), w: Math.round(i.getBoundingClientRect().width)
  })));
}

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  let zmenene = 0;
  for (const s of STRANKY) {
    const subor = path.join(KOREN, s, 'index.html');
    const url = ZAKLAD + '/' + (s ? s + '/' : '');
    const mob = await zmeraj(page, url, 390);
    const pc = await zmeraj(page, url, 1440);
    let html = fs.readFileSync(subor, 'utf8');
    let i = 0;
    html = html.replace(/<img\b[^>]*\bsrcset="[^"]*"[^>]*>/g, (tag) => {
      const m = mob[i], d = pc[i]; i++;
      if (!m || !d || !/\ssizes="/.test(tag)) return tag;
      if (!m.w || !d.w) return tag;                      // skrytý obrázok: nechať
      const vm = Math.min(100, Math.ceil(m.w / 390 * 100));
      const vd = Math.min(100, Math.ceil(d.w / 1440 * 100));
      const nove = `sizes="(max-width: 900px) ${vm}vw, ${vd}vw"`;
      const upravene = tag.replace(/\ssizes="[^"]*"/, ' ' + nove);
      if (upravene !== tag) zmenene++;
      return upravene;
    });
    fs.writeFileSync(subor, html);
  }
  await b.close();
  console.log('Upravených sizes: ' + zmenene);
})();
