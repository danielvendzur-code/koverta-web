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

async function revealControl(page, selector) {
  const control = page.locator(selector).first();
  await control.waitFor({ state: 'attached' });
  const step = await control.evaluate(el => {
    const panel = el.closest('[data-sp-stepno]');
    return panel ? panel.getAttribute('data-sp-stepno') : '';
  });
  if (step) {
    const go = page.locator('[data-sp-goto="' + step + '"]').first();
    if (await go.count()) {
      await go.click();
      await control.waitFor({ state: 'visible' });
    }
  }
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
    assert(catalogue.placements.length === 1
      && catalogue.placements[0].id === 'kv-free',
      'Hidden or unsupported placement variants are still exposed in Koverta product data');
    assert(JSON.stringify(catalogue.colors.map(item => item.ral)) === JSON.stringify([
      'RAL 7016','RAL 9005','RAL 9006','RAL 9010','RAL 7037','RAL 7011','RAL 8017','RAL 6003','RAL 5010','RAL 3000'
    ]), 'Koverta current RAL palette changed');
    assert(catalogue.surcharge && catalogue.surcharge.frame == null && catalogue.surcharge.louver == null,
      'Configurator invented a Koverta colour surcharge');
    assert(JSON.stringify(catalogue.sideOpts.filter(item => item.id !== 'open').map(item => item.id)) === JSON.stringify([
      'kvdrevo','kvwpc','kvhlinik'
    ]), 'Current supported Koverta side-wall material set changed');
    const gutterYes = catalogue.gutter.opts.find(item => item.id === 'ano');
    assert(gutterYes && gutterYes.cena == null, 'Gutter must not receive an invented numeric price');
    assert(catalogue.gutter.opts.length === 1 && catalogue.gutter.opts[0].id === 'ano',
      'Koverta must expose mandatory drainage without a no-gutter alternative');
    assert(catalogue.anchoring && JSON.stringify(catalogue.anchoring.opts.map(item => item.id)) === JSON.stringify(['beton', 'ine']),
      'Unsupported concrete-footing/paving anchoring variants are still exposed');
    assert(catalogue.anchoring.opts[0].tichy === true && catalogue.anchoring.opts[0].cena == null,
      'Base concrete anchoring must not create a fake 0 € surcharge');
    assert(catalogue.anchoring.opts[1].cena == null && /na nacenenie/.test(catalogue.anchoring.opts[1].s || ''),
      'Alternative substrate must remain quote-only without an invented price');
    assert(Array.isArray(catalogue.extras) && catalogue.extras.length === 1,
      'Koverta sourced accessory group is missing');
    const accessoryItems = catalogue.extras[0].items || [];
    assert(JSON.stringify(accessoryItems.map(item => item.id)) === JSON.stringify(['kv-izol', 'kv-led', 'kv-elektro']),
      'Unsupported Koverta accessory was exposed or a sourced accessory is missing');
    assert(accessoryItems.every(item => item.price == null),
      'Koverta accessory received an invented numeric price');

    const allTemplateText = await page.locator('#SoltecPremium').textContent();
    assert(!allTemplateText.includes('celá paleta RAL v cene'),
      'Unsupported claim that the full RAL palette is included is still present');
    assert(allTemplateText.includes('Cenový dopad zvoleného odtieňa: na nacenenie'),
      'Unknown Koverta color price impact is not disclosed');

    const visibleText = await page.locator('#SoltecPremium').innerText();
    assert(allTemplateText.includes('Iný počet stĺpov je na individuálne nacenenie'),
      'Configurator still implies the 3D base post count is the only commercial variant');
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
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === 'od 4 497 €',
      'Mandatory unpriced drainage must preserve the verified catalogue subtotal as a starting price');
    const initialSnapshot = await page.evaluate(() => window.SP_TEST.snapshot());
    assert(initialSnapshot.price.open === true && initialSnapshot.price.total === null &&
      initialSnapshot.price.catalogueSubtotal === 4497,
      'Runtime and displayed mandatory-drainage price state disagree');

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
            && snap.price.total === null
            && snap.price.catalogueSubtotal === price
            && snap.price.open === true
            && /^od\s/i.test(totalText)
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
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === 'od 8 397 €',
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
    assert((await page.locator('[data-sp-total]').textContent()).trim().replace(/\s+/g, ' ') === 'od 10 897 €',
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

    // Drainage is mandatory, quote-only and has no misleading off state.
    await revealControl(page, '[data-sp-add-opt="pick:odkvap"]');
    const gutterButtons = page.locator('[data-sp-add-opt="pick:odkvap"]');
    assert(await gutterButtons.count() === 1 &&
      await gutterButtons.filter({ hasText: 'So žľabom a zvodom' }).getAttribute('aria-pressed') === 'true',
      'Mandatory gutter/downpipe is not the sole selected drainage option');
    assert(await gutterButtons.filter({ hasText: 'Bez odkvapu' }).count() === 0,
      'Removed no-gutter option returned');
    assert((await page.locator('[data-sp-lines]').innerText()).includes('Odkvap a zvod'),
      'Mandatory gutter is missing from the quote lines');

    // Alternative anchoring is request-only; base concrete remains selected independently.
    const anchoringButtons = page.locator('[data-sp-add-opt="pick:kotvenie"]');
    await anchoringButtons.filter({ hasText: 'Iný podklad / príprava základov' }).click();
    await waitRender(page);
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Unpriced foundation option did not mark total as open');
    await anchoringButtons.filter({ hasText: 'Do pripraveného betónu' }).click();
    await waitRender(page);
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Mandatory quote-only drainage was lost after returning to base anchoring');

    // Sourced Koverta accessories remain quote-only and must survive a compatible size change.
    const accessoryToggle = page.locator('[data-sp-add-on="x-kv"]');
    await accessoryToggle.locator('xpath=ancestor::label[1]').click();
    assert(await accessoryToggle.isChecked(), 'Accessory group did not open through the visible switch');
    const insulationPlus = page.locator('[data-sp-x="kv-izol"][data-sp-xd="1"]');
    await insulationPlus.waitFor({ state: 'visible' });
    await insulationPlus.click();
    await waitRender(page);
    let accessorySnapshot = await page.evaluate(() => window.SP_TEST.snapshot());
    assert(accessorySnapshot.extras['kv-izol'] === 1, 'Insulation accessory did not enter runtime state');
    assert(accessorySnapshot.price.open === true, 'Unpriced insulation accessory did not open the price');
    assert(accessorySnapshot.price.total === null && accessorySnapshot.price.catalogueSubtotal === 4497,
      'Open Koverta snapshot still presents the catalogue subtotal as a final numeric total');
    assert(accessorySnapshot.price.lines.some(line => line.v === null && /Izolácia strechy/.test(line.k)),
      'Insulation accessory is missing its quote-only price line');
    assert((await page.locator('[data-sp-total]').textContent()).trim().startsWith('od '),
      'Selected unpriced accessory still presents an exact final total');

    await page.evaluate(() => {
      const w = document.querySelector('[data-sp-w]');
      w.value = '2800';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      w.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);
    accessorySnapshot = await page.evaluate(() => window.SP_TEST.snapshot());
    assert(accessorySnapshot.width === 2800 && accessorySnapshot.extras['kv-izol'] === 1,
      'Compatible accessory was lost after dimension change');

    await page.evaluate(() => {
      const w = document.querySelector('[data-sp-w]');
      w.value = '2500';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      w.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitRender(page);

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
    await revealControl(page, '[data-sp-side="rear"]');
    await page.locator('[data-sp-side="rear"]').click();
    await page.locator('[data-sp-side-opt="kvdrevo"]').click();
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
    await page.locator('[data-sp-side="rear"]').click();
    const woodPressed = await page.locator('[data-sp-side-opt="kvdrevo"]').getAttribute('aria-pressed');
    assert(woodPressed === 'true', 'Compatible side selection was lost after dimension change');

    // Deterministic payload must carry the selected placement, options and safe price wording.
    const payload = await page.evaluate(() => window.KVBuildKovertaQuote());
    assert(payload && payload.body, 'Koverta payload builder returned no payload');
    assert(payload.body.includes('Umiestnenie: Samostatne stojaci.'), 'Payload omits the actual default placement');
    assert(payload.body.includes('na nacenenie'), 'Payload omits quote-only state from selected unpriced configuration');
    assert(payload.body.includes('Lamely — drevo'), 'Payload omits selected side wall');
    assert(payload.body.includes('Izolácia strechy'), 'Payload omits selected sourced accessory');
    assert(payload.body.includes('Farba konštrukcie:') && payload.body.includes('(cenový dopad na nacenenie)'),
      'Payload incorrectly implies a verified zero color surcharge');
    assert(payload.body.includes('vrátane DPH a montáže'), 'Payload omits verified VAT/installation scope');
    assert(payload.body.includes('Dopravu a položky označené „na nacenenie“ potvrdíme v ponuke.'),
      'Payload omits unresolved transport/quote-only disclaimer');
    assert(payload.body.includes('Kotvenie stĺpov: Do pripraveného betónu'), 'Payload omits selected base anchoring');
    assert(payload.body.includes('Odkvap a zvod: So žľabom a zvodom'), 'Payload omits mandatory drainage state');
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
    assert(await page.locator('[data-sp-place]').count() === 0,
      'Single-model Koverta unexpectedly exposes a hidden placement control after reset');
    const resetPayload = await page.evaluate(() => window.KVBuildKovertaQuote());
    assert(resetPayload.body.includes('Umiestnenie: Samostatne stojaci.'),
      'Reset payload did not restore the implicit standalone placement');
    const resetSnapshot = await page.evaluate(() => window.SP_TEST.snapshot());
    assert(resetSnapshot.price.total === null && resetSnapshot.price.catalogueSubtotal === 4497 &&
      resetSnapshot.price.open === true,
      'Reset lost the catalogue subtotal or mandatory quote-only drainage state');
    assert(resetSnapshot.picks.odkvap === 'ano' && resetSnapshot.picks.kotvenie === 'beton',
      'Reset did not restore default gutter/anchoring');
    assert(Object.values(resetSnapshot.extras).every(value => !value),
      'Reset left a selected Koverta accessory in runtime state');

    // Opening custom-size UI must not trigger the legacy runtime mailto.
    const root = page.locator('#SoltecPremium');
    await revealControl(page, '[data-kv-custom]');
    await page.locator('[data-kv-custom]').click();
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
    console.log('PRICING_LOGIC_PASS all 54 catalogue points, 6200/6600 transition, RAL disclosure, side options, gutter/anchoring state, sourced accessories, no hidden placement variants, unknown-price handling, back/next, dimension persistence, reset, payload, custom validation');
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
