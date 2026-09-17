/* Web sa sťahuje zo Shopify na statický hosting. Všetko, čo mierilo do
   e-shopu — produkty, košík, hľadanie, konfigurátorová appka, kontaktný
   endpoint — po prepnutí domény prestane existovať. Test drží, že sa také
   odkazy nevrátia, a že tabuľka rozmerov vedie do nového konfigurátora s
   rozmerom, ktorý vie skutočne nastaviť. */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const KOREN = path.resolve(__dirname, '../..');
const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const chyby = [];
const ok = (p, m) => { if (!p) chyby.push(m); };

const ZAKAZANE = [
  ['koverta.sk/products/', 'odkaz na produkt v e-shope'],
  ['koverta.sk/apps/', 'odkaz na aplikáciu v e-shope'],
  ['koverta.sk/cart', 'odkaz na košík'],
  ['koverta.sk/search', 'odkaz na hľadanie v e-shope'],
  ['koverta.sk/contact', 'odosielanie dopytu na e-shop'],
  ['myshopify.com', 'odkaz na shopify doménu']
];

function subory(adresar) {
  const von = [];
  for (const meno of fs.readdirSync(adresar)) {
    if (meno === '.git' || meno === 'node_modules' || meno === 'qa-artifacts') continue;
    const cele = path.join(adresar, meno);
    const st = fs.statSync(cele);
    if (st.isDirectory()) von.push(...subory(cele));
    else if (/\.(html|js|json)$/.test(meno) && !cele.includes('/test/')) von.push(cele);
  }
  return von;
}

(async () => {
  for (const f of subory(KOREN)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [ihla, popis] of ZAKAZANE) {
      if (text.includes(ihla)) chyby.push(path.relative(KOREN, f) + ': ' + popis + ' (' + ihla + ')');
    }
  }

  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();

  for (const [stranka, ocakavanaPage] of [['/pristresky-pre-auta/', 'koverta'], ['/zahradne-pristresky/', 'zahrada']]) {
    await p.goto(B + stranka, { waitUntil: 'load', timeout: 60000 });
    const odkaz = p.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await odkaz.count()) await odkaz.first().click();
    await p.waitForTimeout(300);

    const chipy = await p.evaluate(() => [...document.querySelectorAll('.kh-size__chip')]
      .map((a) => ({ href: a.getAttribute('href'), popis: a.getAttribute('aria-label') })));
    ok(chipy.length > 5, stranka + ': tabuľka rozmerov je prázdna');
    for (const ch of chipy) {
      ok(/^(\.\.\/konfigurator\/\?page=|#ponuka)/.test(ch.href || ''),
        stranka + ': rozmer vedie inam: ' + ch.href);
      ok(ch.popis && ch.popis.length > 5, stranka + ': rozmer bez popisu pre čítačku: ' + ch.href);
      if (ch.href.startsWith('..')) {
        ok(new RegExp('page=' + ocakavanaPage + '&w=\\d+&l=\\d+').test(ch.href),
          stranka + ': rozmer nemá správnu stránku alebo rozmer: ' + ch.href);
      }
    }

    /* Prvý rozmer musí konfigurátor naozaj nastaviť, nielen prijať v adrese. */
    const prvy = chipy.find((x) => x.href.startsWith('..'));
    const cakany = /w=(\d+)&l=(\d+)/.exec(prvy.href);
    await p.goto(B + stranka.replace(/[^/]+\/$/, '') + prvy.href.replace('../', ''), { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot, null, { timeout: 30000 });
    await p.waitForTimeout(1500);
    const snap = await p.evaluate(() => window.SP_TEST.snapshot());
    ok(snap.width === Number(cakany[1]) && snap.length === Number(cakany[2]),
      stranka + ': konfigurátor nenastavil rozmer z adresy, dostal ' + snap.width + ' × ' + snap.length
      + ', čakalo sa ' + cakany[1] + ' × ' + cakany[2]);
  }

  await b.close();
  if (chyby.length) { console.log('BEZ_SHOPIFY_FAIL\n' + chyby.slice(0, 30).join('\n')); process.exit(1); }
  console.log('BEZ_SHOPIFY_PASS: žiadne odkazy do e-shopu, tabuľky rozmerov vedú do konfigurátora aj s rozmerom');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
