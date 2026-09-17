/* Vyskladanú zostavu chce človek poslať ďalej alebo si ju odložiť. Adresa je
   na to jediné miesto, ktoré si poradí bez ukladania do prehliadača: rozmer
   sa do nej zapisuje a dá sa z nej aj načítať. Druhá polovica testu drží, že
   web neukladá do prehliadača nič a nenastavuje cookies. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const chyby = [];
const ok = (p, m) => { if (!p) chyby.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));

  await p.goto(B + '/konfigurator/?page=koverta', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  const pred = p.url();

  // posunieme šírku a čakáme, že sa objaví v adrese
  await p.evaluate(() => {
    const w = document.querySelector('[data-sp-w]');
    w.value = String(w.max);
    w.dispatchEvent(new Event('input', { bubbles: true }));
    w.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(900);
  const po = p.url();
  ok(po !== pred, 'adresa sa po zmene rozmeru nezmenila: ' + po);
  ok(/[?&]w=\d+/.test(po) && /[?&]l=\d+/.test(po), 'v adrese chýba rozmer: ' + po);
  ok(/page=koverta/.test(po), 'v adrese sa stratila stránka: ' + po);

  const sn = await p.evaluate(() => window.SP_TEST.snapshot());
  const m = /w=(\d+)&l=(\d+)/.exec(po) || /l=(\d+)&w=(\d+)/.exec(po);
  ok(m && (Number(m[1]) === sn.width || Number(m[2]) === sn.width), 'adresa nesedí so skutočným rozmerom: ' + po + ' vs ' + sn.width + '×' + sn.length);

  // adresa sa musí dať znova otvoriť a dať ten istý rozmer
  await p.goto(po, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot, null, { timeout: 30000 });
  await p.waitForTimeout(1600);
  const sn2 = await p.evaluate(() => window.SP_TEST.snapshot());
  ok(sn2.width === sn.width && sn2.length === sn.length,
    'po znovuotvorení adresy je iný rozmer: ' + sn2.width + '×' + sn2.length + ' namiesto ' + sn.width + '×' + sn.length);

  /* Web nemeria a neukladá nič. Jediná výnimka je zapamätané zavretie výzvy na
     celú obrazovku, a to sa zapíše až vtedy, keď ju človek naozaj zavrie. */
  const stav = await p.evaluate(() => {
    const kluce = [];
    for (let i = 0; i < localStorage.length; i++) kluce.push(localStorage.key(i));
    return { kluce, cookies: document.cookie };
  });
  ok(stav.kluce.length === 0, 'niečo sa uložilo do prehliadača: ' + stav.kluce.join(', '));
  ok(!stav.cookies, 'stránka nastavila cookies: ' + stav.cookies);

  await b.close();
  if (chyby.length) { console.log('ADRESA_FAIL\n' + chyby.join('\n')); process.exit(1); }
  console.log('ADRESA_PASS: rozmer ide do adresy aj z nej, prehliadač ostáva prázdny');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
