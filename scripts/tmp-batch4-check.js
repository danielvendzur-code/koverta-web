const { chromium } = require('playwright');
const path = require('path');
const p = require('node:process');

const root = p.env.GITHUB_WORKSPACE;
const base = 'http://127.0.0.1:8904';

async function dismiss(page) {
  const c = page.getByRole('button', { name: /Iba nevyhnutné|Odmietnuť|Nevyhnutné/i }).first();
  if (await c.count()) {
    try { await c.click({ timeout: 1200 }); } catch (_) {}
  }
}

async function overflow(page, label) {
  const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (d > 2) throw new Error(`${label}: horizontal overflow ${d}px`);
}

async function openAllDetails(section) {
  const details = section.locator('details.kh-size__viac');
  for (let i = 0; i < await details.count(); i++) {
    const d = details.nth(i);
    if (!(await d.getAttribute('open'))) {
      await d.locator('summary').click();
      await d.page().waitForTimeout(120);
    }
  }
}

async function assertCfgTargets(section, label) {
  await openAllDetails(section);
  const cfg = section.locator('.kh-size__cfg');
  const count = await cfg.count();
  if (!count) throw new Error(`${label}: no 3D actions found`);
  for (let i = 0; i < count; i++) {
    const box = await cfg.nth(i).boundingBox();
    if (!box) throw new Error(`${label}: 3D action ${i + 1} is not visible after details open`);
    if (box.width < 43.5 || box.height < 43.5) {
      throw new Error(`${label}: 3D target ${i + 1} too small (${box.width.toFixed(1)}×${box.height.toFixed(1)})`);
    }
  }
}

async function checkCar(browser, viewport, suffix) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/pristresky-pre-auta/#rozTitle', { waitUntil: 'load', timeout: 60000 });
  await dismiss(page);
  const sec = page.locator('section:has(#rozTitle)');
  if (await sec.count() !== 1) throw new Error('car: dimensions section missing');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(750);
  await overflow(page, `car ${suffix} closed`);

  if (await sec.locator('.kh-size__chip').count() !== 55) throw new Error('car: product option count is not 55');
  if (await sec.locator('.kh-size-pick > a').count() !== 3) throw new Error('car: quick group picker is not 3 items');
  for (const id of ['roz-1-auto', 'roz-2-auta', 'roz-3-auta']) {
    if (await sec.locator('#' + id).count() !== 1) throw new Error('car: missing target #' + id);
  }
  const exact = 'Toto sú hotové veľkosti z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer je vec výroby, nie výberu z tabuľky.';
  const custom = await sec.locator('.kh-size-custom__text').innerText();
  if (custom.trim() !== exact) throw new Error('car: custom-size statement drifted');
  const img = await sec.locator('#roz-1-auto .kh-size__media img').getAttribute('src');
  if (!img || !img.endsWith('/assets/koverta-pristresok-auto-trnava-sikmy.jpg')) throw new Error('car: one-car catalog photo is not the approved local angle');

  // The selector is navigation, not a stateful filter: every option stays in DOM.
  const picker = sec.locator('.kh-size-pick > a');
  for (let i = 0; i < 3; i++) {
    const href = await picker.nth(i).getAttribute('href');
    await picker.nth(i).click();
    await page.waitForTimeout(180);
    if (new URL(page.url()).hash !== href) throw new Error(`car: quick picker ${i + 1} did not navigate to ${href}`);
    if (await sec.locator('.kh-size__chip').count() !== 55) throw new Error('car: quick picker hid catalog options');
  }

  // Capture the normal compact state before opening all extended widths.
  for (const d of await sec.locator('details.kh-size__viac').all()) {
    if (await d.getAttribute('open')) await d.locator('summary').click();
  }
  await page.waitForTimeout(180);
  await sec.screenshot({ path: path.join(root, 'qa-batch4', `car-sizes-${suffix}.png`) });

  await assertCfgTargets(sec, `car ${suffix}`);
  await overflow(page, `car ${suffix} expanded`);
  const single = sec.locator('#roz-3-auta');
  if (await single.locator('.kh-size__chip').count() !== 1) throw new Error('car: three-car single group is not one option');
  if (suffix === 'desktop') await single.screenshot({ path: path.join(root, 'qa-batch4', 'car-three-cars-single.png') });
  if (errors.length) throw new Error('car page errors: ' + errors.join(' | '));
  await ctx.close();
}

async function checkGarden(browser, viewport, suffix) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/zahradne-pristresky/#rozTitle', { waitUntil: 'load', timeout: 60000 });
  await dismiss(page);
  const sec = page.locator('section:has(#rozTitle)');
  if (await sec.count() !== 1) throw new Error('garden: dimensions section missing');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(750);
  await overflow(page, `garden ${suffix} closed`);
  if (await sec.locator('.kh-size__chip').count() !== 12) throw new Error('garden: product option count is not 12');
  if (await sec.locator('#roz-zahrada').count() !== 1) throw new Error('garden: decision group id missing');
  const exact = 'Toto sú hotové veľkosti z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer je vec výroby, nie výberu z tabuľky.';
  const custom = await sec.locator('.kh-size-custom__text').innerText();
  if (custom.trim() !== exact) throw new Error('garden: custom-size statement drifted');
  await sec.screenshot({ path: path.join(root, 'qa-batch4', `garden-sizes-${suffix}.png`) });
  await assertCfgTargets(sec, `garden ${suffix}`);
  await overflow(page, `garden ${suffix} expanded`);
  if (errors.length) throw new Error('garden page errors: ' + errors.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: p.env.CHROME,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  await checkCar(browser, { width: 1440, height: 1000 }, 'desktop');
  await checkGarden(browser, { width: 1440, height: 1000 }, 'desktop');
  await checkCar(browser, { width: 390, height: 844 }, 'mobile');
  await checkGarden(browser, { width: 390, height: 844 }, 'mobile');
  await browser.close();
})().catch(e => {
  console.error(e);
  p.exit(1);
});
