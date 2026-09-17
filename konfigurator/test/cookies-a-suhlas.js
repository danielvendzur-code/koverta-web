/* Cookie lištu si rieši platené rozšírenie na strane obchodu, nie tento web.
   Naša časť má jedinú povinnosť: kým nikto nedá súhlas, nesmie sa do
   prehliadača zapísať nič. Google Consent Mode v2 v hlavičke má preto všetky
   kategórie zamietnuté a Tag Manager síce nabehne, ale žiadna značka nemá čo
   ukladať. Test to drží: žiadne cookies, prázdny prehliadač, zamietnuté
   kategórie a žiadna vlastná lišta, ktorá by si s tou platenou odporovala. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const STRANKY = ['/', '/pristresky-pre-auta/', '/kontakt/', '/realizacie/', '/ochrana-sukromia/', '/konfigurator/?page=koverta'];
const POVOLENE = /^(www\.googletagmanager\.com|www\.google-analytics\.com|[a-z0-9.-]*clarity\.ms)$/;
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
      const dl = Array.isArray(window.dataLayer) ? window.dataLayer : [];
      const prve = dl.find((x) => x && x[0] === 'consent' && x[1] === 'default');
      return {
        kluce, cookies: document.cookie,
        lista: Boolean(document.querySelector('[data-k-suhlas]')),
        vychodisko: prve ? prve[2] : null
      };
    });
    ok(stav.kluce.length === 0, s + ': niečo sa uložilo do prehliadača: ' + stav.kluce.join(', '));
    ok(!stav.cookies, s + ': stránka nastavila cookies: ' + stav.cookies);
    ok(!stav.lista, s + ': vlastná lišta súhlasu je späť, hoci ju rieši rozšírenie obchodu');
    ok(stav.vychodisko, s + ': v hlavičke chýba východiskový stav Consent Mode');
    if (stav.vychodisko) {
      for (const kat of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage',
                         'functionality_storage', 'personalization_storage']) {
        ok(stav.vychodisko[kat] === 'denied', s + ': ' + kat + ' nie je zamietnuté, ale ' + stav.vychodisko[kat]);
      }
    }
  }
  await b.close();

  const zle = [...cudzie].filter((h) => !POVOLENE.test(h));
  ok(zle.length === 0, 'stránka volá cudzie servery navyše: ' + zle.join(', '));
  console.log('cudzie hosty:', [...cudzie].join(', ') || 'žiadne');
  if (chyby.length) { console.log('COOKIES_FAIL\n' + chyby.join('\n')); process.exit(1); }
  console.log('COOKIES_PASS: bez súhlasu žiadne cookies ani zápis, všetky kategórie zamietnuté, vlastná lišta žiadna');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
