const { chromium } = require('playwright');
const path = require('path');
const p = require('node:process');

const root = p.env.GITHUB_WORKSPACE;
const base = 'http://127.0.0.1:8906';

async function dismissConsent(page) {
  const candidates = [
    /Iba nevyhnutné/i,
    /Odmietnuť/i,
    /Nevyhnutné/i,
  ];
  for (const name of candidates) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count()) {
      try { await b.click({ timeout: 800 }); return; } catch (_) {}
    }
  }
}

async function assertNoOverflow(page, label) {
  const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (d > 2) throw new Error(`${label}: horizontal overflow ${d}px`);
}

async function assertImages(locator, label) {
  const imgs = locator.locator('img');
  const count = await imgs.count();
  if (!count) throw new Error(`${label}: no images found`);
  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded().catch(() => {});
    await img.page().waitForTimeout(80);
    const s = await img.evaluate(el => ({
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      src: el.currentSrc || el.src,
      alt: el.alt,
    }));
    if (!s.complete || s.naturalWidth < 40 || s.naturalHeight < 16) {
      throw new Error(`${label}: broken image ${i + 1}: ${JSON.stringify(s)}`);
    }
  }
}

async function openMenu(page, label) {
  const trigger = page.locator('[data-k-mega-trigger]').filter({ hasText: label }).first();
  if (await trigger.count() !== 1) throw new Error(`missing trigger ${label}`);
  await trigger.click();
  await page.waitForTimeout(240);
  if (await trigger.getAttribute('aria-expanded') !== 'true') throw new Error(`${label}: aria-expanded not true`);
  const item = trigger.locator('xpath=ancestor::*[@data-k-mega-item][1]');
  if (!(await item.evaluate(el => el.classList.contains('is-open')))) throw new Error(`${label}: item not open`);
  const panel = item.locator('.kv-mega');
  if (!(await panel.isVisible())) throw new Error(`${label}: panel not visible`);
  return { trigger, item, panel };
}

async function desktopQA(browser, pagePath, width, height, suffix, screenshots) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  const failedImages = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => { if (r.resourceType() === 'image') failedImages.push(r.url()); });
  await page.goto(base + pagePath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(900);
  await dismissConsent(page);
  await assertNoOverflow(page, `${suffix} closed`);

  const directItems = page.locator('.kv-nav > .kv-nav__item');
  if (await directItems.count() !== 5) throw new Error(`${suffix}: expected 5 main nav items, got ${await directItems.count()}`);
  if (!(await page.locator('.kv-nav').isVisible())) throw new Error(`${suffix}: desktop nav hidden`);

  if (screenshots) await page.screenshot({ path: path.join(root, 'qa-batch5', `header-closed-${suffix}.png`) });

  const cars = await openMenu(page, 'Pre autá');
  if (await cars.panel.locator('.kv-mega__brand-grid > li').count() !== 2) throw new Error(`${suffix}: Pre autá item count drift`);
  if (await cars.panel.locator('.kv-mega__brand').count() !== 2) throw new Error(`${suffix}: Pre autá brand count drift`);
  if (await cars.panel.locator('.k-btn, [class*="cta"], .kv-mega__foot').count()) throw new Error(`${suffix}: CTA found in Pre autá menu`);
  await assertImages(cars.panel, `${suffix} Pre autá`);
  let box = await cars.panel.boundingBox();
  if (!box || box.height > height * 0.5 + 1) throw new Error(`${suffix}: Pre autá panel too tall (${box && box.height})`);
  if (box.x < -1 || box.x + box.width > width + 1) throw new Error(`${suffix}: Pre autá panel clipped horizontally`);
  if (screenshots) await page.screenshot({ path: path.join(root, 'qa-batch5', `menu-cars-${suffix}.png`) });

  const home = await openMenu(page, 'Pre dom a záhradu');
  if (await cars.trigger.getAttribute('aria-expanded') !== 'false') throw new Error(`${suffix}: opening home did not close cars`);
  if (await home.panel.locator('.kv-mega__brand-grid > li').count() !== 5) throw new Error(`${suffix}: home item count drift`);
  if (await home.panel.locator('.kv-mega__brand--koverta li').count() !== 1) throw new Error(`${suffix}: home Koverta group is not 1 item`);
  if (await home.panel.locator('.kv-mega__brand--soltec li').count() !== 4) throw new Error(`${suffix}: home Soltec group is not 4 items`);
  await assertImages(home.panel, `${suffix} home`);
  box = await home.panel.boundingBox();
  if (!box || box.height > height * 0.5 + 1) throw new Error(`${suffix}: home panel too tall (${box && box.height})`);
  if (screenshots) await page.screenshot({ path: path.join(root, 'qa-batch5', `menu-home-${suffix}.png`) });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  if (await home.trigger.getAttribute('aria-expanded') !== 'false') throw new Error(`${suffix}: Escape did not close home`);

  const real = await openMenu(page, 'Realizácie');
  if (await real.panel.locator('.kv-mega__real-grid > li').count() !== 2) throw new Error(`${suffix}: realizacie item count drift`);
  if (await real.panel.locator('.kv-mega__real-grid .kv-mega__foto img').count() !== 2) throw new Error(`${suffix}: realizacie thumbnails missing`);
  await assertImages(real.panel, `${suffix} realizacie`);
  box = await real.panel.boundingBox();
  if (!box || box.height > height * 0.5 + 1) throw new Error(`${suffix}: realizacie panel too tall (${box && box.height})`);
  if (screenshots) await page.screenshot({ path: path.join(root, 'qa-batch5', `menu-realizacie-${suffix}.png`) });

  // Clicking outside the header/panel must close it.
  const y = Math.min(height - 12, Math.max(130, box.y + box.height + 20));
  await page.mouse.click(12, y);
  await page.waitForTimeout(120);
  if (await real.trigger.getAttribute('aria-expanded') !== 'false') throw new Error(`${suffix}: outside click did not close realizacie`);

  // Asset version must be the new global cache key on root and nested pages.
  const refs = await page.evaluate(() => [...document.querySelectorAll('link[href*="koverta-2026.css"],script[src*="koverta-2026.js"]')].map(x => x.getAttribute('href') || x.getAttribute('src')));
  if (!refs.length || refs.some(x => !x.includes('?v=2026091105'))) throw new Error(`${suffix}: stale asset key ${JSON.stringify(refs)}`);

  if (errors.length) throw new Error(`${suffix}: page errors: ${errors.join(' | ')}`);
  const relevantFailures = failedImages.filter(u => /koverta|soltec/i.test(u));
  if (relevantFailures.length) throw new Error(`${suffix}: failed menu/product image requests: ${relevantFailures.join(' | ')}`);
  await ctx.close();
}

async function mobileQA(browser, pagePath, suffix) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + pagePath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  await dismissConsent(page);
  if (await page.locator('.kv-nav').isVisible()) throw new Error(`${suffix}: desktop nav visible on mobile`);
  const burger = page.locator('[data-k-drawer-open]');
  await burger.click();
  await page.waitForTimeout(220);
  const drawer = page.locator('[data-k-drawer]');
  if (!(await drawer.evaluate(el => el.classList.contains('is-open')))) throw new Error(`${suffix}: drawer did not open`);

  const groups = drawer.locator('.kv-drawer__sk');
  if (await groups.count() !== 3) throw new Error(`${suffix}: expected 3 drawer groups, got ${await groups.count()}`);
  for (let i = 0; i < await groups.count(); i++) {
    await groups.nth(i).evaluate(el => { el.open = true; });
  }
  await page.waitForTimeout(300);

  const real = groups.filter({ hasText: 'Realizácie' }).first();
  if (await real.locator('.kv-drawer__foto img').count() !== 2) throw new Error(`${suffix}: mobile realizacie thumbnails missing`);

  const imgs = drawer.locator('.kv-drawer__foto img');
  for (let i = 0; i < await imgs.count(); i++) {
    await imgs.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
  }
  await assertImages(drawer.locator('.kv-drawer__rad'), `${suffix} drawer`);

  const overflow = await drawer.evaluate(el => el.scrollWidth - el.clientWidth);
  if (overflow > 2) throw new Error(`${suffix}: drawer horizontal overflow ${overflow}px`);
  await assertNoOverflow(page, `${suffix} mobile`);
  await page.screenshot({ path: path.join(root, 'qa-batch5', `drawer-${suffix}.png`) });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  if (await burger.getAttribute('aria-expanded') !== 'false') throw new Error(`${suffix}: Escape did not close drawer`);
  if (errors.length) throw new Error(`${suffix}: page errors: ${errors.join(' | ')}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: p.env.CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  await desktopQA(browser, '/', 1440, 900, 'home-1440', true);
  await desktopQA(browser, '/', 1280, 800, 'home-1280', false);
  await desktopQA(browser, '/zahradne-pristresky/', 1440, 900, 'nested-1440', false);
  await mobileQA(browser, '/', 'home-mobile');
  await mobileQA(browser, '/zahradne-pristresky/', 'nested-mobile');
  await browser.close();
})().catch(e => {
  console.error(e);
  p.exit(1);
});
