/* Skutočné rozloženie, nie porovnávanie implementácie so sebou.
 * npm install --no-save playwright@1.58.2
 * npx playwright install chromium
 * node tools/rozhranie-kontrola.cjs
 * Voliteľný CHROME_PATH pre existujúci prehliadač. Formuláre sa neodosielajú.
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'qa-artifacts', 'rozhranie');
const stranky = ['', 'pristresky-pre-auta', 'zahradne-pristresky', 'bioklimaticke-pergoly', 'realizacie', 'kontakt'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', '8088'], { cwd: root, stdio: 'ignore' });
  let browser;
  const vysledky = [];
  try {
    await new Promise((r) => setTimeout(r, 500));
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
    for (const width of [360, 390, 430, 1366]) for (const slug of stranky) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 760, hasTouch: width < 760 });
      const page = await context.newPage();
      const chyby = [];
      page.on('pageerror', (e) => chyby.push(e.message));
      await page.goto('http://127.0.0.1:8088/' + (slug ? slug + '/' : ''), { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('form[data-k-dopyt]')?.dataset.kJednoduchy === 'true');
      await page.evaluate(() => document.fonts.ready);
      const polia = await page.evaluate(() => {
        const f = document.querySelector('.k form[data-k-dopyt]');
        const a = f.querySelector('[name="contact[email]"]').getBoundingClientRect();
        const b = f.querySelector('[name="contact[Miesto realizácie]"]').getBoundingClientRect();
        return Math.abs(a.top - b.top);
      });
      assert(polia < 1, `${slug} ${width}: nezarovnané vstupy (${polia}px)`);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      if (width < 760) await page.waitForFunction(() => {
        const d = document.querySelector('.kh-dock');
        return d.dataset.kReady === 'true' && getComputedStyle(d).transform === 'none' && !d.classList.contains('je-hero-skryty');
      });
      const spodok = await page.evaluate(async () => {
        const d = document.querySelector('.kh-dock'), body = document.body;
        const hodnoty = [];
        for (let i = 0; i < 30; i++) {
          window.scrollBy({ top: i % 2 ? 20 : -5, behavior: 'instant' });
          await new Promise(requestAnimationFrame);
          hodnoty.push(d.getBoundingClientRect().bottom);
        }
        const r = d.getBoundingClientRect();
        return { posun: Math.max(...hodnoty) - Math.min(...hodnoty), bottom: r.bottom, height: r.height,
          padding: parseFloat(getComputedStyle(body).paddingBottom), overflow: document.documentElement.scrollWidth > innerWidth, viewport: innerHeight };
      });
      assert(!spodok.overflow, `${slug} ${width}: vodorovný presah`);
      if (width < 760) {
        assert(spodok.posun < 1, `${slug} ${width}: lišta poskočila ${spodok.posun}px`);
        assert(Math.abs(spodok.bottom - spodok.viewport) < 1, 'Lišta nie je pri spodnom okraji');
        assert(spodok.padding >= spodok.height, 'Pätička nemá dosť miesta pod lištou');
      }
      const faq = page.locator('[data-k-faq] details');
      if (await faq.count() > 1) {
        await faq.first().scrollIntoViewIfNeeded();
        await page.evaluate(() => document.querySelector('[data-k-faq] summary').click());
        await page.waitForFunction(() => ![...document.querySelectorAll('[data-k-faq] details')].some((d) => d.__kBeh));
        const prechod = await page.evaluate(async () => {
          const ds = [...document.querySelectorAll('[data-k-faq] details')];
          ds[1].querySelector('summary').click();
          const vysky = [];
          do { await new Promise(requestAnimationFrame); vysky.push(ds[0].getBoundingClientRect().height); }
          while (ds.some((d) => d.__kBeh));
          return Math.abs(vysky.at(-1) - vysky.at(-2));
        });
        assert(prechod < 2, `${slug} ${width}: skok na konci zatvorenia FAQ ${prechod}px`);
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => document.querySelector('[data-k-faq] summary').click());
          await page.waitForTimeout(70);
        }
        await page.waitForFunction(() => ![...document.querySelectorAll('[data-k-faq] details')].some((d) => d.__kBeh));
        assert.equal(await page.locator('[data-k-faq] details[open]').count(), 1, 'Rýchle kliknutia musia skončiť jednou otvorenou otázkou');
      }
      assert.deepEqual(chyby, [], 'JavaScript chyby');
      if (slug === 'zahradne-pristresky' && width === 390) {
        await page.locator('.kh-cta__card').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, 'formular-mobil.png') });
      }
      vysledky.push({ stranka: slug || 'uvod', width, polia, spodok });
      console.log(`OK ${slug || 'uvod'} ${width}px`);
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'vysledky.json'), JSON.stringify(vysledky, null, 2));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
