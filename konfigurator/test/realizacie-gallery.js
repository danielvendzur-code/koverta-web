'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const URL = process.env.KV_REALIZACIE_URL || 'http://127.0.0.1:8901/realizacie/';

async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: 'Iba nevyhnutné' });
  if (await reject.count()) await reject.first().click();
}

(async () => {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);
  await page.waitForSelector('#realGrid .kh-work__item[role="button"]');

  const all = page.locator('#realGrid .kh-work__item:not([hidden])');
  assert.equal(await all.count(), 200, 'The complete realization gallery must remain available');
  await all.first().click();
  const dialog = page.locator('.kv-lupa');
  await dialog.waitFor({ state: 'visible' });
  assert.equal((await page.locator('.kv-lupa__pocitadlo').textContent()).trim(), '1 / 200');
  const firstSource = await page.locator('.kv-lupa__ram img').getAttribute('src');
  await page.locator('.kv-lupa__sipka--dalsi').click();
  const secondSource = await page.locator('.kv-lupa__ram img').getAttribute('src');
  assert.notEqual(secondSource, firstSource, 'Next arrow must advance to another photograph');
  await page.screenshot({ path: 'qa-artifacts/realizacie-gallery-desktop.png' });
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.kv-lupa__ram img').getAttribute('src'), firstSource,
    'Keyboard navigation must return to the previous photograph');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Tienenie', exact: true }).click();
  const shaded = page.locator('#realGrid .kh-work__item:not([hidden])');
  assert.equal(await shaded.count(), 26, 'Gallery filters must still limit the lightbox sequence');
  await shaded.first().click();
  assert.equal((await page.locator('.kv-lupa__pocitadlo').textContent()).trim(), '1 / 26');
  await page.keyboard.press('Escape');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(URL, { waitUntil: 'domcontentloaded' });
  await dismissConsent(mobile);
  await mobile.waitForSelector('#realGrid .kh-work__item[role="button"]');
  const layout = await mobile.locator('#realGrid').evaluate((grid) => {
    const card = grid.querySelector('.kh-work__item:not([hidden])');
    const style = getComputedStyle(grid);
    return {
      display: style.display,
      overflowX: style.overflowX,
      snap: style.scrollSnapType,
      cardWidth: card.getBoundingClientRect().width,
      viewport: innerWidth
    };
  });
  assert.equal(layout.display, 'flex');
  assert.equal(layout.overflowX, 'auto');
  assert.match(layout.snap, /x/);
  assert(layout.cardWidth > layout.viewport * 0.7 && layout.cardWidth < layout.viewport,
    `Mobile gallery card has an invalid width: ${JSON.stringify(layout)}`);
  await mobile.locator('#realGrid').scrollIntoViewIfNeeded();
  await mobile.locator('#realGrid img').first().waitFor({ state: 'visible' });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: 'qa-artifacts/realizacie-gallery-mobile.png' });

  await browser.close();
  console.log('REALIZACIE_GALLERY_PASS 200-photo modal, arrows, keyboard, filtered sequence and mobile snap slider');
})().catch((error) => { console.error(error); process.exit(1); });
