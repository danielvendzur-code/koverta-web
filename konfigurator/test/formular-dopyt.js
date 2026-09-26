/* Dopytový formulár je jediná cesta, ktorou sa zákazník ozve. Test drží tri
   veci: že po odoslaní nesľúbi nič, čo sa nestalo, že v e-maile je naozaj
   všetko vyplnené, a že hľadanie bez výsledku vedie na kontakt s predvyplnenou
   správou, nie do neexistujúceho e-shopu. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const B = (process.env.KV_WEB || 'http://127.0.0.1:8901').replace(/\/$/, '');
const chyby = [];
const ok = (p, m) => { if (!p) chyby.push(m); };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => chyby.push('pageerror: ' + e.message));

  // mailto: nesmie stránku odnavigovať, len ho zachytíme
  let mailtoNav = '';
  await p.route('**/*', (r) => /koverta-formular\.vercel\.app/.test(r.request().url()) ? r.abort() : r.continue());
  p.on('framenavigated', () => {});
  await p.addInitScript(() => {
    window.__mailto = '';
    const d = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    try {
      Object.defineProperty(window.location, 'href', {
        set(v) { if (String(v).startsWith('mailto:')) { window.__mailto = String(v); return; } d.set.call(window.location, v); },
        get() { return d.get.call(window.location); }
      });
    } catch (e) {
      window.__mailtoPatchFailed = String(e);
    }
  });

  await p.goto(B + '/kontakt/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(600);

  await p.fill('input[name="contact[name]"]', 'Jozef Testovací');
  await p.fill('input[name="contact[phone]"]', '0900 123 456');
  await p.fill('input[name="contact[email]"]', 'jozef@example.sk');
  await p.fill('input[name="contact[Miesto realizácie]"]', 'Nitra');
  await p.fill('textarea[name="contact[body]"]', 'Dve autá, asi 6 × 5 m.');
  await p.locator('input[name="contact[Súhlas]"]').check({ force: true }).catch(() => {});
  await p.click('form[data-k-dopyt] button[type="submit"]');
  await p.waitForTimeout(900);

  const stav = await p.evaluate(() => {
    const d = document.querySelector('[data-k-dakujem]');
    const ch = document.querySelector('[data-k-chyba]');
    const f = document.querySelector('form[data-k-dopyt]');
    return {
      mailto: window.__mailto || '',
      patch: window.__mailtoPatchFailed || '',
      dakujemVidno: d && !d.hidden,
      chybaVidno: ch && !ch.hidden,
      formularSkryty: f && f.hidden,
      nadpis: d && d.querySelector('.kh-dakujem__nadpis').textContent.trim(),
      uvod: d && d.querySelector('.kh-dakujem__text').textContent.trim().slice(0, 80),
      odkaz: d && d.querySelector('[data-k-mailto]') && d.querySelector('[data-k-mailto]').getAttribute('href'),
      odkazText: d && d.querySelector('[data-k-mailto]') && d.querySelector('[data-k-mailto]').textContent.trim()
    };
  });

  /* Poďakovanie je len jedno, na ďakovnej stránke: panel vo formulári sa
     pred odchodom neukazuje (predtým blikli dve poďakovania za sebou). */
  ok(!stav.dakujemVidno, 'pred ďakovnou stránkou sa ukázalo aj druhé poďakovanie');
  ok(!stav.chybaVidno, 'ukázal sa chybový panel');
  /* Formulár posiela dopyt na server (na localhoste sa len zapíše do
     window.__kvDopytSkusobny); e-mail ostáva ako záložná cesta v paneli. */
  ok(stav.nadpis === 'Dopyt je u nás', 'nadpis: ' + stav.nadpis);
  ok(/Ozveme sa/.test(stav.uvod), 'úvodný text: ' + stav.uvod);
  ok(stav.odkazText === 'Poslať ten istý dopyt aj e-mailom', 'text odkazu: ' + stav.odkazText);
  const odoslane = await p.evaluate(() => (window.__kvDopytSkusobny || [])[0] || null);
  ok(odoslane && odoslane.meno === 'Jozef Testovací' && odoslane.telefon === '0900 123 456'
    && odoslane.miesto === 'Nitra' && /Dve autá/.test(odoslane.sprava) && odoslane.typ, 'na server by neodišli všetky polia: ' + JSON.stringify(odoslane));
  const href = decodeURIComponent(stav.odkaz || '');
  for (const kus of ['obchod@koverta.sk', 'Jozef Testovací', '0900 123 456', 'jozef@example.sk', 'Nitra', 'Dve autá']) {
    ok(href.indexOf(kus) > -1, 'v mailto chýba: ' + kus);
  }
  await p.waitForTimeout(2200);
  ok(/dakujeme\/\?contact_posted=true/.test(p.url()), 'po odoslaní neprešlo na ďakovnú stránku: ' + p.url());

  // ── hľadanie, ktoré nič nenájde, vedie na kontakt a predvyplní správu
  await p.goto(B + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(700);
  await p.click('[data-k-search-open]').catch(() => {});
  await p.waitForTimeout(400);
  const otvorene = await p.evaluate(() => {
    const i = document.querySelector('[data-k-search] input[type="text"]');
    return Boolean(i && i.offsetParent);
  });
  if (otvorene) {
    await p.fill('[data-k-search] input[type="text"]', 'zzzqqq');
    await p.waitForTimeout(400);
    const shop = await p.evaluate(() => {
      const a = document.querySelector('[data-k-search-shop]');
      return a ? { hidden: a.hidden, href: a.getAttribute('href'), text: a.textContent.trim() } : null;
    });
    ok(shop && !shop.hidden, 'odkaz pri prázdnom výsledku sa neukázal');
    ok(shop && /kontakt/.test(shop.href) && !/koverta\.sk\/search/.test(shop.href), 'odkaz mieri zle: ' + (shop && shop.href));
    // a s výsledkami musí byť schovaný
    await p.fill('[data-k-search] input[type="text"]', 'pergola');
    await p.waitForTimeout(400);
    const shop2 = await p.evaluate(() => { const a = document.querySelector('[data-k-search-shop]'); return a ? a.hidden : null; });
    ok(shop2 === true, 'odkaz sa ukazuje aj keď výsledky sú');
  } else {
    chyby.push('hľadanie sa neotvorilo');
  }

  await p.goto(B + '/kontakt/?hladane=zip%20roleta', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(700);
  const telo = await p.inputValue('textarea[name="contact[body]"]');
  ok(/zip roleta/.test(telo), 'správa sa nepredvyplnila: ' + telo);

  await b.close();
  if (chyby.length) { console.log('FORMULAR_FAIL\n' + chyby.join('\n')); process.exit(1); }
  console.log('FORMULAR_PASS: e-mailová cesta, obsah dopytu, odkaz z hľadania, predvyplnenie');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
