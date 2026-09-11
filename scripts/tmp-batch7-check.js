const { chromium } = require('playwright');
const path = require('path');
const p = require('node:process');
const base = 'http://127.0.0.1:8909';
const root = p.env.GITHUB_WORKSPACE;

async function dismiss(page) {
  const b = page.getByRole('button', { name: /Iba nevyhnutné|Odmietnuť|Nevyhnutné/i }).first();
  if (await b.count()) { try { await b.click({ timeout: 600 }); } catch (_) {} }
}

async function check(browser, cfg, item) {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);
  await dismiss(page);
  const sec = page.locator(item.sec);
  if (await sec.count() !== 1) throw new Error(item.name + ': section missing');
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const text = (await sec.textContent()).replace(/\s+/g, ' ');
  for (const code of item.codes) if (!text.includes(code)) throw new Error(item.name + ': missing ' + code);
  if (item.name === 'carport') {
    for (const t of ['ISO panel 30 mm', 'skrytý alebo priznaný', 'vedené v stĺpoch', 'box · boky · LED · zásuvka']) {
      if (!text.includes(t)) throw new Error('carport missing ' + t);
    }
    if (!text.includes('box nie je tretí model')) throw new Error('carport box distinction missing');
  } else {
    if (!text.includes('lacnejšia strešná výplň než sklo')) throw new Error('canopy price distinction missing');
    if (!text.includes('Sklo alebo zelená strecha')) throw new Error('canopy G distinction missing');
  }
  const imgs = sec.locator('.k-model-card__media img');
  for (let i = 0; i < await imgs.count(); i++) {
    await imgs.nth(i).scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(100);
    const st = await imgs.nth(i).evaluate(el => ({ complete: el.complete, w: el.naturalWidth, h: el.naturalHeight }));
    if (!st.complete || st.w < 100 || st.h < 100) throw new Error(item.name + ': broken model image ' + JSON.stringify(st));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(item.name + ' ' + cfg.name + ': horizontal overflow ' + overflow);
  if (cfg.name === 'desktop') {
    const cards = sec.locator('.k-model-card');
    for (let i = 0; i + 1 < await cards.count(); i += 2) {
      const a = await cards.nth(i).boundingBox();
      const b = await cards.nth(i + 1).boundingBox();
      if (a && b && Math.abs(a.height - b.height) > 3) throw new Error(item.name + ': unequal paired cards ' + a.height + '/' + b.height);
    }
  }
  if (errors.length) throw new Error(item.name + ': page errors ' + errors.join(' | '));
  await sec.screenshot({ path: path.join(root, 'qa-batch7', item.name + '-' + cfg.name + '.png') });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: p.env.CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  const pages = [
    { url: '/carport-soltec/#modely-carport', sec: '#modely-carport', codes: ['SL 170', 'SL 240'], name: 'carport' },
    { url: '/pevne-prestresenia/#typy-prestresenia', sec: '#typy-prestresenia', codes: ['F170', 'F240', 'G170', 'G240'], name: 'canopy' },
  ];
  for (const cfg of [{ w: 1440, h: 1000, name: 'desktop' }, { w: 390, h: 844, name: 'mobile' }]) {
    for (const item of pages) await check(browser, cfg, item);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
