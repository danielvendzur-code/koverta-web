'use strict';

const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { prepareContext, watchErrors } = require('./browser-qa');

const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: 'Iba nevyhnutné' });
  if (await reject.count()) {
    await reject.first().click();
    await page.waitForTimeout(100);
  }
}

async function gotoControl(page, selector) {
  const control = page.locator(selector).first();
  await control.waitFor({ state: 'attached' });
  const step = await control.evaluate(el => {
    const host = el.closest('[data-sp-stepno]');
    return host ? Number(host.dataset.spStepno) : null;
  });
  if (step != null) {
    await page.locator(`[data-sp-goto="${step}"]`).click();
    await page.waitForTimeout(80);
  }
}

async function setSize(page, width, length) {
  await gotoControl(page, '[data-sp-w]');
  await page.evaluate(({ width, length }) => {
    const set = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error('Missing control ' + selector);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('[data-sp-w]', width);
    set('[data-sp-l]', length);
  }, { width, length });
  await page.waitForTimeout(220);
}

async function svgState(page) {
  return page.locator('[data-sp-canvas]').evaluate(svg => ({
    markup: svg.outerHTML,
    polygons: svg.querySelectorAll('polygon').length,
    paths: svg.querySelectorAll('path').length
  }));
}

async function selectDrainage(page, wanted) {
  await gotoControl(page, '[data-sp-add-opt="pick:odkvap"]');
  const options = page.locator('[data-sp-add-opt="pick:odkvap"]');
  const option = wanted === 'ano'
    ? options.filter({ hasText: 'So žľabom a zvodom' }).first()
    : options.filter({ hasText: 'Bez odkvapu' }).first();
  await option.click();
  await page.waitForTimeout(180);
}

async function enableExtra(page, id) {
  const group = page.locator('[data-sp-add-on="x-kv"]').first();
  await gotoControl(page, '[data-sp-add-on="x-kv"]');
  if (!await group.isChecked()) {
    await group.locator('xpath=ancestor::label[1]').click();
    await page.waitForTimeout(100);
  }
  const plus = page.locator(`[data-sp-x="${id}"][data-sp-xd="1"]`).first();
  await plus.waitFor({ state: 'visible' });
  await plus.click();
  await page.waitForTimeout(180);
}

(async () => {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [device, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }]
    ]) {
      const context = await browser.newContext({ viewport });
      await prepareContext(context);
      const page = await context.newPage();
      const checkErrors = watchErrors(page);

      await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(page);
      await page.waitForFunction(() =>
        Boolean(window.SP_TEST && window.SP_TEST.snapshot && document.querySelector('[data-sp-canvas] polygon')));
      await page.waitForTimeout(180);

      const initial = windowState(await page.evaluate(() => window.SP_TEST.snapshot()));
      assert(initial.page === 'koverta', `${device}: wrong configurator route`);

      await selectDrainage(page, 'ano');
      const drainageOn = await svgState(page);
      const drainageSnap = windowState(await page.evaluate(() => window.SP_TEST.snapshot()));
      assert(drainageSnap.picks.odkvap === 'ano', `${device}: drainage did not enable`);

      await selectDrainage(page, 'nie');
      const drainageOff = await svgState(page);
      assert(windowState(await page.evaluate(() => window.SP_TEST.snapshot())).picks.odkvap === 'nie',
        `${device}: drainage did not disable`);
      assert(drainageOn.polygons > drainageOff.polygons,
        `${device}: enabling gutter/downpipe did not add physical geometry`);
      assert(drainageOn.markup !== drainageOff.markup,
        `${device}: drainage selection did not change SVG`);
      await selectDrainage(page, 'ano');

      /* Insulation is bonded to the roof underside, so verify it from an
         underside view instead of weakening culling just for the test. */
      await page.locator('[data-sp-view="under"]').click();
      await page.waitForTimeout(220);
      const beforeInsulation = await svgState(page);
      await enableExtra(page, 'kv-izol');
      const withInsulation = await svgState(page);
      const insulationSnap = windowState(await page.evaluate(() => window.SP_TEST.snapshot()));
      assert(insulationSnap.extras['kv-izol'] === 1, `${device}: insulation state missing`);
      assert(withInsulation.markup !== beforeInsulation.markup,
        `${device}: insulation did not alter the bonded roof underside render`);

      const beforeLed = await svgState(page);
      await enableExtra(page, 'kv-led');
      const withLed = await svgState(page);
      const ledSnap = windowState(await page.evaluate(() => window.SP_TEST.snapshot()));
      assert(ledSnap.extras['kv-led'] === 1, `${device}: LED state missing`);
      assert(withLed.markup !== beforeLed.markup,
        `${device}: LED selection did not change the physical SVG render`);
      assert(/f5e8c5/i.test(withLed.markup),
        `${device}: LED diffuser surface is missing from the rendered SVG`);

      for (const [width, expectedRows] of [[6200, 2], [7000, 3]]) {
        await setSize(page, width, 6000);
        const snap = windowState(await page.evaluate(() => window.SP_TEST.snapshot()));
        assert(snap.width === width && snap.length === 6000,
          `${device}: size did not update to ${width}x6000`);
        assert(snap.geometry && snap.geometry.postAxes.length === expectedRows,
          `${device}: ${width}x6000 expected ${expectedRows} post rows, got ${snap.geometry && snap.geometry.postAxes.length}`);
        assert(snap.extras['kv-izol'] === 1 && snap.extras['kv-led'] === 1 && snap.picks.odkvap === 'ano',
          `${device}: accessory state was lost after resize`);

        for (let i = 0; i < 24; i++) {
          const az = -Math.PI + i * Math.PI * 2 / 24;
          await page.evaluate(az => {
            window.SP_TEST.setView(az, 0.22);
            window.SP_TEST.redraw();
          }, az);
          await page.waitForTimeout(12);
          const state = await svgState(page);
          assert(state.polygons > 100, `${device}: model vanished at azimuth ${az}`);
          assert(!/(?:NaN|Infinity)/.test(state.markup),
            `${device}: non-finite accessory geometry at ${width}x6000 azimuth ${az}`);
        }

        await page.locator('.sp-stage').screenshot({
          path: `qa-artifacts/koverta-accessories-${width}x6000-${device}.png`
        });
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 4, `${device}: accessory configuration causes horizontal overflow: ${overflow}`);
      checkErrors();
      console.log(`ACCESSORIES_PASS ${device}: drainage, insulation, LED, 4/6-post resize, rotation`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});

function windowState(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}
