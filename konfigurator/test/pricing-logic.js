const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitRender(page) {
  await page.waitForTimeout(180);
  const total = page.locator('#SoltecPremium [data-sp-total]').first();
  await total.waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const el = document.querySelector('#SoltecPremium [data-sp-total]');
    return !!el && !!(el.textContent || '').trim() && (el.textContent || '').trim() !== '—';
  });
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const prepareContext = require('./browser-qa').prepareContext;
    await prepareContext(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push('console: ' + message.text());
    });

    const url = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.locator('#SoltecPremium[data-sp-page="koverta"]').waitFor();
    await waitRender(page);

    const catalogue = await page.evaluate(() => {
      const node = document.querySelector('[data-sp-bio-data]');
      if (!node) throw new Error('Missing Koverta product data');
      const bio = JSON.parse(node.textContent);
      const model = bio.models.K;
      return {
        widths: model.widths,
        lengths: model.lengths,
        prices: model.prices,
        maxW: model.maxW,
        maxL: model.maxL,
        wallSide: model.wallSide,
        wallBack: model.wallBack,
        wallSideBySize: model.wallSideBySize,
        priceNote: bio.priceNote,
        placements: bio.placements,
        gutter: bio.picks.find(group => group.id === 'odkvap'),
        anchoring: bio.picks.find(group => group.id === 'kotvenie'),
        extras: bio.extras,
        colors: bio.colors,
        sideOpts: bio.sideOpts,
        surcharge: bio.surcharge
      };
    });

    const expectedWidths = [2500, 2800, 3000, 3200, 3500, 3800, 4000, 4200, 4500, 5000, 5200, 5400, 5600, 5800, 6000, 6200, 6600, 7000];
    const expectedLengths = [5200, 5600, 6000];
    const expectedPrices = [
      [4497, 4597, 4697, 4797, 5097, 5297, 5597, 5797, 5997, 6497, 6697, 7097, 7297, 7497, 7697, 7997, 10297, 10797],
      [4597, 4697, 4797, 4897, 5297, 5497, 5797, 5997, 6197, 6697, 6897, 7297, 7497, 7697, 7897, 8197, 10597, 11097],
      [4697, 4797, 4897, 4997, 5497, 5697, 5997, 6197, 6397, 6897, 7097, 7497, 7697, 7897, 8097, 8397, 10897, 11397]
    ];
    assert(JSON.stringify(catalogue.widths) === JSON.stringify(expectedWidths), 'Koverta width catalogue changed');
    assert(JSON.stringify(catalogue.lengths) === JSON.stringify(expectedLengths), 'Koverta length catalogue changed');
    assert(JSON.stringify(catalogue.prices) === JSON.stringify(expectedPrices), 'Koverta base-price matrix no longer matches the verified catalogue snapshot');
    assert(catalogue.maxW === 7000 && catalogue.maxL === 6000, 'Configurator catalogue scope is not 7000 × 6000 mm');
    assert(catalogue.wallSide === null && catalogue.wallBack === null && catalogue.wallSideBySize === null,
      'Unverified side-wall prices must not remain numeric');
    assert(/vrátane DPH a montáže/.test(catalogue.priceNote) && /dopravu.*potvrdíme/i.test(catalogue.priceNote),
      'Koverta price note does not preserve verified installation scope and unresolved transport scope');
    assert(catalogue.placements.filter(item => item.id !== 'kv-free').every(item => /na nacenenie/.test(item.label)),
      'Non-standard placements are not marked for quotation');
    assert(catalogue.placements.length === 2
      && catalogue.placements[0].id === 'kv-free'
      && catalogue.placements[1].id === 'kv-custom-place'
      && /na nacenenie/.test(catalogue.placements[1].label),
      'Unsupported structural placement variants are still exposed as concrete offers');
    assert(JSON.stringify(catalogue.colors.map(item => item.ral)) === JSON.stringify([
      'RAL 7016','RAL 9005','RAL 9006','RAL 9010','RAL 7037','RAL 7011','RAL 8017','RAL 6003','RAL 5010','RAL 3000'
    ]), 'Koverta current RAL palette changed');
    assert(catalogue.surcharge && catalogue.surcharge.frame == null && catalogue.surcharge.louver == null,
      'Configurator invented a Koverta colour surcharge');
    assert(JSON.stringify(catalogue.sideOpts.filter(item => item.id !== 'open').map(item => item.id)) === JSON.stringify([
      'kvdrevo','kvwpc','kvhlinik'
    ]), 'Current supported Koverta side-wall material set changed');
    const gutterNo = catalogue.gutter.opts.find(item => item.id === 'nie');
    const gutterYes = catalogue.gutter.opts.find(item => item.id === 'ano');
    assert(gutterYes && gutterYes.cena == null, 'Gutter must not receive an invented numeric price');
    assert(gutterNo && gutterNo.tichy === true && gutterNo.cena == null, 'No-gutter selection must not create a fake 0 € line');
    assert(catalogue.gutter.opts[0].id === 'nie', 'Optional gutter must not be preselected without a verified inclusion rule');
    assert(catalogue.anchoring && JSON.stringify(catalogue.anchoring.opts.map(item => item.id)) === JSON.stringify(['beton', 'ine']),
      'Unsupported concrete-footing/paving anchoring variants are still exposed');
    assert(catalogue.anchoring.opts[0].tichy === true && catalogue.anchoring.opts[0].cena == null,
      'Base concrete anchoring must not create a fake 0 € surcharge');
    assert(catalogue.anchoring.opts[1].cena == null && /na nacenenie/.test(catalogue.anchoring.opts[1].s || ''),
      'Alternative substrate must remain quote-only without an invented price');
    assert(Array.isArray(catalogue.extras) && catalogue.extras.length === 0,
      'Unverified Koverta-specific extras must not remain customer-selectable');

    const allTemplateText = await page.locator('#SoltecPremium').textContent();
    assert(!allTemplateText.includes('celá paleta RAL v cene'),
      'Unsupported claim that the full RAL palette is included is still present');
    assert(allTemplateText.includes('Cenový dopad zvoleného odtieňa: na nacenenie'),
      'Unknown Koverta color price impact is not disclosed');

    const visibleText = await page.locator('#SoltecPremium').innerText();
    for (const forbidden of ['Táto dĺžka potrebuje', 'Profil obvodový', 'Najväčší rozmer', 'Svetlá výška']) {
      assert(!visibleText.includes(forbidden), 'Technical info block is still visible: ' + forbidden);
    }
    assert(!visibleText.includes('s DPH, dopravou aj montážou'), 'Unsafe mini-price transport claim is still visible');
    assert(visibleText.includes('s DPH a montážou'), 'Verified installation inclusion is missing from the compact price note');
    assert(!visibleText.includes('vrátane DPH, dopravy aj montáže'), 'Unsafe summary transport claim is still visible');

    const initialWidth = await page.locator('[data-sp-w-out]').textContent();
    const initialLength = await page.locator('[data-sp-l-out]').textContent();
    assert(/2\s*500/.test(initialWidth), 'Unexpected initial Koverta width: ' + initialWidth);
    assert(/5\s*200/.test(initialLength), 'Unexpected initial Koverta depth: ' + initialLength);
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === '4 497 €',
      'Default Koverta state must be the verified base price with optional gutter off');
    const initialSnapshot = await page.evaluate(() => window.SP_TEST.snapshot());
    assert(initialSnapshot.price.open === false && initialSnapshot.price.total === 4497,
      'Runtime and displayed default price state disagree');

    // Exercise all 54 published catalogue points through the real controls.
    for (let li = 0; li < expectedLengths.length; li++) {
      for (let wi = 0; wi < expectedWidths.length; wi++) {
        const width = expectedWidths[wi];
        const length = expectedLengths[li];
        const price = expectedPrices[li][wi];
        await page.evaluate(({ width, length }) => {
          const w = document.querySelector('[data-sp-w]');
          const l = document.querySelector('[data-sp-l]');
          w.value = String(width);
          l.value = String(length);
          w.dispatchEvent(new Event('input', { bubbles: true }));
          l.dispatchEvent(new Event('input', { bubbles: true }));
          w.dispatchEvent(new Event('change', { bubbles: true }));
          l.dispatchEvent(new Event('change', { bubbles: true }));
        }, { width, length });
        await page.waitForFunction(({ width, length, price }) => {
          if (!window.SP_TEST || typeof window.SP_TEST.snapshot !== 'function') return false;
          const snap = window.SP_TEST.snapshot();
          const total = document.querySelector('#SoltecPremium [data-sp-total]');
          const totalText = total ? String(total.textContent || '').trim() : '';
          return snap.width === width
            && snap.length === length
            && snap.price.total === price
            && snap.price.open === false
            && !/^od\s/i.test(totalText)
            && totalText.replace(/[^0-9]/g, '') === String(price);
        }, { width, length, price }, { timeout: 4000 });
      }
    }

    // Verify the published 6200 -> 6600 price transition separately from the renderer's post-count default.
    await page.evaluate(() => {
      const w = document.querySelector('[data-sp-w]');
      const l = document.querySelector('[data-sp-l]');
      w.value = '6200';
      l.value = '6000';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      l.dispatchEvent(new Event('input', { bubbles: true }));
      w.dispatchEvent(new Event('change', { bubbles: true }));
      l.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);
    assert(/6\s*200/.test(await page.locator('[data-sp-w-out]').textContent()), '6200 mm width is not selectable');
    assert(/6\s*000/.test(await page.locator('[data-sp-l-out]').textContent()), '6000 mm depth is not selectable');
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === '8 397 €',
      '6200 × 6000 base price changed from the verified public catalogue');
    assert(/4\s+stĺpy/.test((await page.locator('[data-sp-dims]').textContent()).replace(/\s+/g, ' ')),
      'Current base renderer no longer uses the documented four-post visualization at 6200 mm');

    await page.evaluate(() => {
      const w = document.querySelector('[data-sp-w]');
      w.value = '6600';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      w.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);
    assert(/6\s*600/.test(await page.locator('[data-sp-w-out]').textContent()), '6600 mm width is not selectable');
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === '10 897 €',
      '6600 × 6000 base price changed from the verified public catalogue');
    assert(/6\s+stĺpov/.test((await page.locator('[data-sp-dims]').textContent()).replace(/\s+/g, ' ')),
      'Current base renderer no longer uses the documented six-post visualization at 6600 mm');

    // Return to the default catalogue point before testing independent options.
    await page.evaluate(() => {
      const w = document.querySelector('[data-sp-w]');
      const l = document.querySelector('[data-sp-l]');
      w.value = '2500';
      l.value = '5200';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      l.dispatchEvent(new Event('input', { bubbles: true }));
      w.dispatchEvent(new Event('change', { bubbles: true }));
      l.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);

    // Optional gutter is off by default. Selecting it makes the price explicitly open/quote-only.
    const gutterButtons = page.locator('[data-sp-add-opt="pick:odkvap"]');
    assert((await gutterButtons.filter({ hasText: 'Bez odkvapu' }).getAttribute('aria-pressed')) === 'true',
      'No-gutter option is not the default state');
    await gutterButtons.filter({ hasText: 'So žľabom a zvodom' }).click({ force: true });
    await waitRender(page);
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Selecting unpriced gutter did not mark total as open');
    assert((await page.locator('[data-sp-lines]').innerText()).includes('Odkvap a zvod'),
      'Selected gutter is missing from the quote lines');
    await gutterButtons.filter({ hasText: 'Bez odkvapu' }).click({ force: true });
    await waitRender(page);
    assert(!(await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Turning optional gutter off left stale quote-only price state');

    // Alternative anchoring is request-only; returning to base concrete anchoring clears that state.
    const anchoringButtons = page.locator('[data-sp-add-opt="pick:kotvenie"]');
    await anchoringButtons.filter({ hasText: 'Iný podklad / príprava základov' }).click({ force: true });
    await waitRender(page);
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Unpriced foundation option did not mark total as open');
    await anchoringButtons.filter({ hasText: 'Do pripraveného betónu' }).click({ force: true });
    await waitRender(page);
    assert(!(await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Returning to verified base anchoring left stale quote-only state');

    // Back/next must remain reversible.
    const stepCap = page.locator('[data-sp-stepcap]');
    const stepBefore = (await stepCap.textContent()).trim();
    await page.locator('[data-sp-next]:visible').first().click();
    await page.waitForTimeout(80);
    const stepAfter = (await stepCap.textContent()).trim();
    assert(stepAfter !== stepBefore, 'Next did not advance the configurator');
    const visibleBack = page.locator('[data-sp-back]:visible').first();
    assert(!(await visibleBack.isDisabled()), 'Back stayed disabled after advancing');
    await visibleBack.click();
    await page.waitForTimeout(80);
    assert((await stepCap.textContent()).trim() === stepBefore, 'Back did not return to the previous step');

    // A side wall without a current commercial price must be quote-only.
    await page.locator('[data-sp-side="rear"]').click({ force: true });
    await page.locator('[data-sp-side-opt="kvdrevo"]').click({ force: true });
    await waitRender(page);
    let linesText = await page.locator('[data-sp-lines]').innerText();
    assert(linesText.includes('Lamely — drevo') && linesText.includes('na nacenenie'),
      'Unverified wooden side wall was not converted to quote-only pricing');
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Unknown-price side wall did not mark total as open/starting price');

    // A dimension change keeps a compatible selected side and recomputes the base band.
    await page.evaluate(() => {
      const slider = document.querySelector('[data-sp-w]');
      slider.value = '6600';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);
    const changedWidth = await page.locator('[data-sp-w-out]').textContent();
    assert(/6\s*600/.test(changedWidth), 'Width did not cross into the 6600 mm catalogue band after change: ' + changedWidth);
    await page.locator('[data-sp-side="rear"]').click({ force: true });
    const woodPressed = await page.locator('[data-sp-side-opt="kvdrevo"]').getAttribute('aria-pressed');
    assert(woodPressed === 'true', 'Compatible side selection was lost after dimension change');

    // Non-standard placement is preserved as a quotation-only rule.
    await page.locator('[data-sp-place="kv-custom-place"]').click({ force: true });
    await waitRender(page);
    const placementLine = page.locator('[data-kv-placement-line]');
    await placementLine.waitFor({ state: 'attached' });
    assert((await placementLine.innerText()).includes('na nacenenie'), 'Quote-only placement line is missing');
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Quote-only placement still presents an exact final total');

    // Deterministic payload must carry the selected placement, options and safe price wording.
    const payload = await page.evaluate(() => window.KVBuildKovertaQuote());
    assert(payload && payload.body, 'Koverta payload builder returned no payload');
    assert(payload.body.includes('Umiestnenie:'), 'Payload omits placement');
    assert(payload.body.includes('na nacenenie'), 'Payload omits quote-only state');
    assert(payload.body.includes('Lamely — drevo'), 'Payload omits selected side wall');
    assert(payload.body.includes('Farba konštrukcie:') && payload.body.includes('(cenový dopad na nacenenie)'),
      'Payload incorrectly implies a verified zero color surcharge');
    assert(payload.body.includes('vrátane DPH a montáže'), 'Payload omits verified VAT/installation scope');
    assert(payload.body.includes('Dopravu a položky označené „na nacenenie“ potvrdíme v ponuke.'),
      'Payload omits unresolved transport/quote-only disclaimer');
    assert(payload.body.includes('Kotvenie stĺpov: Do pripraveného betónu'), 'Payload omits selected base anchoring');
    assert(payload.body.includes('Odkvap a zvod: Bez odkvapu'), 'Payload omits selected gutter state');
    assert(!payload.body.includes('voda steká z hrany') && !payload.body.includes('kotvenie podľa podkladu'),
      'Payload leaks helper copy into selected-option values');
    assert((payload.body.match(/Umiestnenie:/g) || []).length === 1 && !payload.body.includes('Umiestnenie —'),
      'Payload duplicates placement in the summary lines');
    assert(!payload.body.includes('s dopravou a montážou'), 'Payload contains obsolete included-transport claim');

    // Reset is an explicit fresh Koverta route, so it cannot leave stale options behind.
    const reset = page.locator('[data-kv-reset]');
    await reset.waitFor();
    const resetHref = await reset.getAttribute('href');
    assert(resetHref && resetHref.includes('?page=koverta'), 'Reset does not target a fresh Koverta route');
    await reset.click();
    await page.waitForLoadState('load');
    await page.locator('#SoltecPremium[data-sp-page="koverta"]').waitFor();
    await waitRender(page);
    assert(/2\s*500/.test(await page.locator('[data-sp-w-out]').textContent()), 'Reset did not restore initial width');
    assert((await page.locator('[data-sp-place="kv-free"]').getAttribute('aria-pressed')) === 'true',
      'Reset did not restore standalone placement');

    // Opening custom-size UI must not trigger the legacy runtime mailto.
    const root = page.locator('#SoltecPremium');
    await page.locator('[data-kv-custom]').click({ force: true });
    const customPanel = page.locator('.kv-custom');
    await customPanel.waitFor({ state: 'visible' });
    assert(!(await root.getAttribute('data-sp-quote-href')), 'Opening custom-size UI prematurely generated a quote');

    // Empty custom-size payload is rejected client-side.
    await customPanel.locator('[data-kv-cw]').fill('');
    await customPanel.locator('[data-kv-cl]').fill('');
    await customPanel.locator('[data-kv-ch]').fill('');
    await customPanel.locator('[data-kv-csend]').click();
    assert(await customPanel.locator('[data-kv-cerr]').isVisible(), 'Empty custom-size request bypassed validation');
    assert(!(await root.getAttribute('data-kv-custom-quote-payload')), 'Invalid custom size generated a payload');

    const customPayload = await page.evaluate(() => window.KVBuildKovertaQuote({
      w: 7800,
      l: 5700,
      h: 2500,
      note: 'QA atypický rozmer'
    }));
    assert(customPayload.body.includes('7\u00a0800 mm') || customPayload.body.includes('7 800 mm'),
      'Custom payload lost requested width');
    assert(customPayload.body.includes('5\u00a0700 mm') || customPayload.body.includes('5 700 mm'),
      'Custom payload lost requested depth');
    assert(customPayload.body.includes('QA atypický rozmer'), 'Custom payload lost note');
    assert(customPayload.body.includes('Najbližšia katalógová zostava použitá iba ako cenová referencia'),
      'Custom payload does not distinguish requested and catalogue dimensions');
    assert(customPayload.body.includes('Konfigurátor nepotvrdzuje jeho realizovateľnosť ani cenu'),
      'Outside-catalogue request incorrectly implies technical feasibility or a valid catalogue price');

    assert(errors.length === 0, 'Browser errors: ' + errors.join(' | '));
    console.log('PRICING_LOGIC_PASS all 54 catalogue points, 6200/6600 transition, RAL disclosure, side options, gutter/anchoring state, unsupported extras/placements, unknown-price handling, back/next, dimension persistence, reset, payload, custom validation');
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
