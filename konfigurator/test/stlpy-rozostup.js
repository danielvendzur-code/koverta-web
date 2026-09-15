/* Pole medzi stĺpmi nesmie byť dlhšie než dĺžka, ktorú model nesie na dvoch
   radoch stĺpov (post4). Trojstĺpová varianta stavia stredný rad na pevný
   odstup P5 z katalógu; na dlhej streche z toho vyjde pole cez šesť metrov
   a stĺp vyzerá, akoby sa zošmykol ku kraju. Kontrola prejde všetky dĺžky
   každého modelu na oboch stránkach s pevnou strechou a odmeria polia. */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, watchErrors } = require('./browser-qa');

const BASE = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await prepareContext(context);
  const page = await context.newPage();
  const assertNoErrors = watchErrors(page);
  const zle = [];
  let meraných = 0;

  for (const stranka of ['canopy', 'carport']) {
    await page.goto(`${BASE}?page=${stranka}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2000);
    const modely = await page.evaluate(() =>
      JSON.parse(document.querySelector('[data-sp-bio-data]').textContent).order.slice());

    for (const model of modely) {
      const dĺžky = await page.evaluate((m) => {
        const el = [...document.querySelectorAll('[data-sp-model]')].find(e => e.dataset.spModel === m);
        if (el) el.click();
        return JSON.parse(document.querySelector('[data-sp-bio-data]').textContent).models[m].lengths.slice();
      }, model);
      await page.waitForTimeout(150);

      for (const L of dĺžky) {
        const snap = await page.evaluate(async (dĺžka) => {
          const el = document.querySelector('[data-sp-l]');
          el.value = dĺžka;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 40));
          return window.SP_TEST.snapshot();
        }, L);
        const p = snap.posts;
        if (!p || !p.carry || p.xs.length < 2) continue;
        meraných += 1;
        /* Osi stĺpov: ľavé líce plus polovica prierezu. Krajné stĺpy stoja
           lícom na hrane strechy, tak sa polia merajú medzi osami. */
        const osi = p.xs.map(x => x + p.d / 2);
        for (let i = 1; i < osi.length; i++) {
          const pole = Math.round(osi[i] - osi[i - 1]);
          if (pole > p.carry + 1) {
            zle.push(`${stranka}/${snap.model} ${L} mm: pole ${pole} mm > post4 ${p.carry} mm`
              + ` (osi ${osi.map(Math.round).join(', ')})`);
          }
        }
      }
    }
  }

  await browser.close();
  assertNoErrors();
  if (meraných < 60) {
    throw new Error(`Rozostup stĺpov: odmeraných len ${meraných} zostáv, sonda nečíta polohy stĺpov`);
  }
  if (zle.length) {
    console.error(zle.slice(0, 20).join('\n'));
    throw new Error(`Rozostup stĺpov: ${zle.length} zostáv má pole dlhšie než post4`);
  }
  console.log(`Post spacing PASS: ${meraných} zostáv, žiadne pole dlhšie než post4.`);
})().catch((error) => { console.error(error.message || error); process.exit(1); });
