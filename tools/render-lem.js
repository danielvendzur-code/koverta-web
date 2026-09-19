'use strict';
/* Vykreslí prístrešok Koverta zo štyroch pohľadov do qa-artifacts/lem-*.png.
   Pohľady sú tie, na ktorých sa z-fighting na lemovaní prejavuje najviac:
   z rohu a zhora. Spredu a zdola slúžia ako kontrola, že oprava nerozbila
   podhľad. Meria sa až v tools/bodky-na-leme.py. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { prepareContext } = require('../konfigurator/test/browser-qa');
const ZAKLAD = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const POHLADY = [['roh', -0.9, 0.30], ['spredu', -1.6, 0.22], ['zhora', -0.9, 0.75], ['zdola', -0.9, -0.18]];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 3 });
  await prepareContext(context);
  const page = await context.newPage();
  await page.goto(`${ZAKLAD}/konfigurator/?page=koverta&w=7000&l=6000`, { waitUntil: 'load' });
  const suhlas = page.getByRole('button', { name: 'Iba nevyhnutné' });
  if (await suhlas.count()) { await suhlas.first().click(); await page.waitForTimeout(80); }
  await page.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('.sp-zoom,.sp-stage__hint,.sp-scene-dock,.sp-stage__bar,.sp-cfg__close')
    .forEach((n) => { n.style.visibility = 'hidden'; }));
  for (const [meno, az, el] of POHLADY) {
    await page.evaluate(([a, e]) => { window.SP_TEST.setView(a, e); window.SP_TEST.redraw(); }, [az, el]);
    await page.waitForTimeout(1100);
    await page.locator('.sp-stage').screenshot({ path: `qa-artifacts/lem-${meno}.png` });
    console.log('lem-' + meno + '.png');
  }
  await browser.close();
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
