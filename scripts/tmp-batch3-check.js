const { chromium } = require('playwright');
const path = require('path');
const p = require('node:process');
const root = p.env.GITHUB_WORKSPACE;
const base = 'http://127.0.0.1:8903';

async function dismiss(page) {
  const c = page.getByRole('button', { name: /Iba nevyhnutné|Odmietnuť|Nevyhnutné/i }).first();
  if (await c.count()) {
    try { await c.click({ timeout: 1200 }); } catch (_) {}
  }
}

async function noOverflow(page, label) {
  const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (d > 2) throw new Error(label + ' horizontal overflow ' + d);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: p.env.CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  const pages = [
    { slug: '/outdoor-kuchyne/', key: 'kitchen', title: '#modelyTitle' },
    { slug: '/tienenie/', key: 'shading', title: '#rozTitle' },
  ];

  for (const item of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base + item.slug, { waitUntil: 'load', timeout: 60000 });
    await dismiss(page);
    await noOverflow(page, item.key + ' desktop');
    const sec = page.locator(`section:has(${item.title})`);
    if (await sec.count() !== 1) throw new Error(item.key + ' target section missing');
    await sec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    if (item.key === 'kitchen') {
      if (await sec.locator('.kh-kitchen-spec').count() !== 4) throw new Error('kitchen specs != 4');
      if (await page.locator('.kh-kitchen-facts > li').count() !== 8) throw new Error('kitchen facts != 8');
      const txt = await sec.innerText();
      for (const v of ['303 × 70 × 92 cm', '213 × 70 × 92 cm', '95 × 70 × 67 cm', '65 × 70 × 67 cm']) {
        if (!txt.includes(v)) throw new Error('missing kitchen dimension ' + v);
      }
    } else {
      if (await sec.locator('.kh-shade-guide__item').count() !== 5) throw new Error('shading guide != 5');
      const txt = await sec.innerText();
      for (const v of ['2 800 mm', '6 500 mm', '1 200 × 2 800 mm', '650 × 2 800 mm']) {
        if (!txt.includes(v)) throw new Error('missing shading value ' + v);
      }
    }
    await sec.screenshot({ path: path.join(root, 'qa-batch3', item.key + '-desktop.png') });
    if (errors.length) throw new Error(item.key + ' page errors: ' + errors.join(' | '));
    await ctx.close();

    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mctx.newPage();
    const merr = [];
    mp.on('pageerror', e => merr.push(String(e)));
    await mp.goto(base + item.slug, { waitUntil: 'load', timeout: 60000 });
    await dismiss(mp);
    await noOverflow(mp, item.key + ' mobile');
    const msec = mp.locator(`section:has(${item.title})`);
    await msec.scrollIntoViewIfNeeded();
    await mp.waitForTimeout(450);
    await msec.screenshot({ path: path.join(root, 'qa-batch3', item.key + '-mobile.png') });
    if (merr.length) throw new Error(item.key + ' mobile page errors: ' + merr.join(' | '));
    await mctx.close();
  }

  await browser.close();
})().catch(e => {
  console.error(e);
  p.exit(1);
});
