/* Model G má v cenníku 2026 dva typy strechy: MODEL 1 sklenená na nosnom
   profile K75 a MODEL 2 zelená na profile R100. Obidve nesú vetu „CENA SE
   DOLOČI POSAMEZNO ZA VSAK PROJEKT", takže voľba smie meniť model a text
   dopytu, ale nesmie hýbať cenou a musí povedať, že krytina v cene nie je.
   Modely F a SL krytinu nevolia — ich strecha je ISO panel. */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, watchErrors } = require('./browser-qa');

const BASE = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await prepareContext(context);
  const page = await context.newPage();
  const assertNoErrors = watchErrors(page);
  const zle = [];
  const chyba = (podmienka, text) => { if (!podmienka) zle.push(text); };

  const model = async (m) => {
    await page.evaluate((m) => {
      const el = [...document.querySelectorAll('[data-sp-model]')].find(e => e.dataset.spModel === m);
      if (el) el.click();
    }, m);
    await page.waitForTimeout(250);
  };
  const stav = () => page.evaluate(() => {
    const wrap = document.querySelector('[data-sp-roof-skin-wrap]');
    const total = document.querySelector('[data-sp-total]');
    return {
      viditeľné: !!wrap && !wrap.hidden,
      volieb: wrap ? wrap.querySelectorAll('[data-sp-roof-skin]').length : 0,
      hodnota: wrap ? (wrap.querySelector('[data-sp-roof-skin-val]') || {}).textContent : null,
      poznámka: wrap ? (wrap.querySelector('[data-sp-roof-skin-note]') || {}).textContent : null,
      cena: total ? total.textContent.trim() : null
    };
  });
  const krytina = async (i) => {
    await page.evaluate((i) => {
      const el = document.querySelector(`[data-sp-roof-skin="${i}"]`);
      if (el) el.click();
    }, i);
    await page.waitForTimeout(350);
  };

  await page.goto(`${BASE}?page=canopy`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  for (const m of ['G170', 'G240']) {
    await model(m);
    const sklo = await stav();
    chyba(sklo.viditeľné, `${m}: voľba krytiny sa nezobrazila`);
    chyba(sklo.volieb === 2, `${m}: volieb krytiny je ${sklo.volieb}, majú byť dve`);
    chyba(/sklo/i.test(sklo.hodnota || ''), `${m}: východisková krytina nie je sklo, ale „${sklo.hodnota}"`);
    chyba(/K75/.test(sklo.poznámka || ''), `${m}: poznámka pri skle neuvádza nosný profil K75`);

    await krytina(1);
    const zelená = await stav();
    chyba(/zelen/i.test(zelená.hodnota || ''), `${m}: po prepnutí nie je zvolená zelená strecha`);
    chyba(/R100/.test(zelená.poznámka || ''), `${m}: poznámka pri zelenej neuvádza profil R100`);
    /* Toto je jadro veci: cenník k obidvom typom píše, že sa oceňujú na
       projekt, takže prepnutie nesmie zmeniť sumu ani ju potichu doplniť. */
    chyba(zelená.cena === sklo.cena,
      `${m}: prepnutie krytiny zmenilo cenu zo „${sklo.cena}" na „${zelená.cena}"`);
    chyba(/individuálne pre každý projekt/i.test(zelená.poznámka || ''),
      `${m}: poznámka nehovorí, že sa krytina oceňuje na projekt`);

    /* Samostatná stránka konfigurátora nemá formulár, tak dopyt skladá do
       mailto a odkaz si necháva na koreni — odtiaľ sa dá prečítať bez toho,
       aby test otváral poštového klienta. */
    const dopyt = await page.evaluate(async () => {
      const btn = document.querySelector('[data-sp-cfg-quote]');
      if (!btn) return null;
      btn.click();
      await new Promise(r => setTimeout(r, 300));
      const ta = document.querySelector('textarea[name="contact[body]"]');
      if (ta) return ta.value;
      const root = document.querySelector('[data-sp-cfg]');
      const href = root && root.dataset.spQuoteHref;
      if (!href) return null;
      const body = /[?&]body=([^&]*)/.exec(href);
      return body ? decodeURIComponent(body[1]) : null;
    });
    chyba(dopyt && /Krytina strechy: zelená strecha/i.test(dopyt),
      `${m}: dopyt neuvádza zvolenú krytinu`);
    chyba(dopyt && /oceňuje sa individuálne pre každý projekt/i.test(dopyt),
      `${m}: dopyt nehovorí, že krytina nie je v cene`);
    await krytina(0);
  }

  for (const [stranka, modely] of [['canopy', ['F170', 'F240']], ['carport', ['F170', 'SL170']]]) {
    if (stranka !== 'canopy') {
      await page.goto(`${BASE}?page=${stranka}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);
    }
    for (const m of modely) {
      await model(m);
      const s = await stav();
      chyba(!s.viditeľné, `${stranka}/${m}: voľba krytiny sa zobrazuje, hoci model má ISO panel`);
    }
  }

  await browser.close();
  assertNoErrors();
  if (zle.length) {
    console.error(zle.join('\n'));
    throw new Error(`Krytina strechy: ${zle.length} nezrovnalostí`);
  }
  console.log('Roof covering PASS: G ponúka sklo aj zelenú strechu, cena sa nemení, dopyt to hovorí, F a SL voľbu nemajú.');
})().catch((error) => { console.error(error.message || error); process.exit(1); });
