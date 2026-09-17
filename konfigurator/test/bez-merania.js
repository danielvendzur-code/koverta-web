/* Web nič nemeria a nič neukladá. Tag Manager, Analytics aj Clarity prišli s
   témou zo Shopify a odišli s ňou; s nimi odišla aj lišta súhlasu, ktorú by
   inak nemal kto potrebovať. Test drží, že sa nevrátia: žiadne cookies, prázdny
   prehliadač, žiadne meracie skripty a jediný cudzí server je písmo. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const STRANKY = ['/', '/pristresky-pre-auta/', '/kontakt/', '/realizacie/', '/ochrana-sukromia/', '/konfigurator/?page=koverta'];
const chyby = [];
const ok = (p, m) => { if (!p) chyby.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await c.newPage();
  const cudzie = new Set();
  p.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(B) || u.startsWith('data:') || u.startsWith('blob:')) return;
    cudzie.add(new URL(u).host);
  });
  p.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));
  for (const s of STRANKY) {
    await p.goto(B + s, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(1400);
    const stav = await p.evaluate(() => {
      const kluce = [];
      try { for (let i = 0; i < localStorage.length; i++) kluce.push(localStorage.key(i)); } catch (e) {}
      return { kluce, cookies: document.cookie, lista: Boolean(document.querySelector('[data-k-suhlas]')),
               dl: typeof window.dataLayer, gtag: typeof window.kvGtag, clarity: typeof window.clarity };
    });
    ok(stav.kluce.length === 0, s + ': localStorage nie je prázdny: ' + stav.kluce.join(','));
    ok(!stav.cookies, s + ': cookies: ' + stav.cookies);
    ok(!stav.lista, s + ': lišta súhlasu je stále na stránke');
    ok(stav.dl === 'undefined', s + ': dataLayer existuje');
    ok(stav.gtag === 'undefined', s + ': kvGtag existuje');
    ok(stav.clarity === 'undefined', s + ': clarity existuje');
  }
  await b.close();
  const zle = [...cudzie].filter((h) => !/^fonts\.(googleapis|gstatic)\.com$/.test(h));
  ok(zle.length === 0, 'stránka volá cudzie servery: ' + zle.join(', '));
  console.log('cudzie hosty, ktoré stránka volá:', [...cudzie].join(', ') || 'žiadne');
  if (chyby.length) { console.log('BEZ_MERANIA_FAIL\n' + chyby.join('\n')); process.exit(1); }
  console.log('BEZ_MERANIA_PASS: žiadne cookies, prázdny prehliadač, žiadne meracie skripty');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
