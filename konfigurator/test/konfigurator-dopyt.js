/* Konfigurátor mal na konci jediné tlačidlo a to otváralo poštového klienta.
   Teraz pod ním stojí dopytový formulár a zostava sa doň zapíše sama. Test
   drží tri veci: formulár je vnútri koreňa konfigurátora (inak ho runtime
   nenájde), prvá otázka je predvyplnená podľa toho, čo si človek skladal, a
   klik na ponuku zapíše zostavu do správy namiesto odchodu do pošty. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const chyby = [];
const ok = (p, m) => { if (!p) chyby.push(m); };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));

  for (const [stranka, coCakame] of [['koverta', 'Prístrešok pre auto'], ['bio', 'Pergola'], ['zahrada', 'Záhradný prístrešok'], ['carport', 'Prístrešok pre auto'], ['canopy', 'Pergola']]) {
    await p.goto(`${B}/konfigurator/?page=${stranka}`, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.SP_TEST && window.SP_TEST.snapshot, null, { timeout: 30000 });
    await p.waitForTimeout(1200);

    const stav = await p.evaluate(() => {
      const kor = document.getElementById('SoltecPremium');
      const sek = document.querySelector('#sp-dopyt');
      const stranka = document.getElementById('kv-root');
      const obal = sek && sek.closest('[data-k-cta-obal]');
      return {
        vnutri: Boolean(stranka && obal && obal.parentElement === stranka && !kor.contains(sek)),
        poradie: Boolean(stranka && stranka.lastElementChild === obal
          && kor && kor.compareDocumentPosition(obal) & Node.DOCUMENT_POSITION_FOLLOWING),
        co: (document.querySelector('[data-k-select-input]') || {}).value,
        stitok: (document.querySelector('[data-k-select-label]') || {}).textContent,
        formular: Boolean(document.querySelector('#sp-dopyt form[data-k-dopyt]')),
        pripraveny: (document.querySelector('#sp-dopyt form[data-k-dopyt]') || {}).dataset?.kReady
      };
    });
    ok(stav.vnutri, stranka + ': dopyt nie je v stránke vedľa konfigurátora');
    ok(stav.poradie, stranka + ': dopyt nestojí ako posledný pod konfigurátorom');
    ok(stav.formular, stranka + ': formulár chýba');
    ok(stav.pripraveny === 'true', stranka + ': formulár nie je naviazaný na skript (kReady=' + stav.pripraveny + ')');
    ok(stav.co === coCakame, stranka + ': predvoľba je "' + stav.co + '", čakalo sa "' + coCakame + '"');

    // tlačidlo ponuky musí zapísať zostavu do správy a odrolovať, nie otvoriť poštu
    // tlačidlo ponuky stojí v poslednom kroku, tak tam najprv prejdeme
    const kroky = p.locator('.sp-rail [data-sp-goto]');
    const kolko = await kroky.count();
    if (kolko) { await kroky.nth(kolko - 1).click().catch(() => {}); await p.waitForTimeout(500); }
    const tl = p.locator('[data-sp-cfg-quote], [data-sp-quote]').first();
    if (await tl.count()) {
      await tl.scrollIntoViewIfNeeded().catch(() => {});
      await tl.click({ timeout: 10000 }).catch((e) => chyby.push(stranka + ': tlačidlo ponuky sa nedalo kliknúť: ' + e.message));
      await p.waitForTimeout(900);
      const telo = await p.inputValue('#sp-dopyt textarea[name="contact[body]"]').catch(() => '');
      ok(/konfigurátora|rozmer|Mám záujem/i.test(telo), stranka + ': zostava sa nezapísala do správy: ' + telo.slice(0, 120));
      ok(p.url().indexOf('mailto:') < 0, stranka + ': stránka odišla do pošty');
    } else {
      chyby.push(stranka + ': tlačidlo ponuky sa nenašlo');
    }
  }
  await b.close();
  if (chyby.length) { console.log('CFG_DOPYT_FAIL\n' + chyby.join('\n')); process.exit(1); }
  console.log('CFG_DOPYT_PASS: formulár pod konfigurátorom, predvoľba podľa stránky, zostava sa zapíše do správy');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
