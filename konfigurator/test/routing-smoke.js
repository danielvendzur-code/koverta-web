const fs = require('fs');
const path = require('path');
const { prepareContext, watchErrors } = require('./browser-qa');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function verifyMeasuredScene(snapshot) {
  const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, '../../archiv-expivi/diely-zo-sceny.json'), 'utf8'));
  const scene = scenes[`${snapshot.width}x${snapshot.length}`];
  assert(scene && snapshot.geometry.source === scene.id, 'Runtime does not identify its measured Expivi scene');
  const parts = scene.diely;
  const origin = Math.min(...parts.filter(d => d.r[1] === scene.L && d.r[2] > 150).map(d => d.p[1]));
  const axis = d => scene.L - (d.p[1] + d.r[1] / 2 - origin);
  const frames = parts.filter(d => d.r[2] === 220 && d.r[1] === 74).map(axis).sort((a,b) => a-b);
  const pairs = parts.filter(d => d.r[2] === 180 && d.r[1] === 58).map(axis).sort((a,b) => a-b);
  const purlins = pairs.filter((v,i) => i % 2 === 0).map((v,i) => (v + pairs[i * 2 + 1]) / 2);
  const columns = parts.filter(d => d.r[2] === 2398);
  const posts = [...new Set(columns.map(axis))].sort((a,b) => a-b);
  for (const [name, measured] of [['frameAxes', frames], ['purlinAxes', purlins], ['postAxes', posts]]) {
    const actual = snapshot.geometry[name];
    assert(actual.length === measured.length && actual.every((v,i) => Math.abs(v - measured[i]) <= 1),
      `${scene.id} ${name}: runtime ${actual}; Expivi ${measured}`);
  }
  assert(snapshot.geometry.postInset === 0, 'Measured posts must be flush along the width axis');
  assert(columns.length === 6 && snapshot.geometry.postSections.length === 3, 'Measured six-post layout is missing');
  for (let i = 0; i < posts.length; i++) {
    const actual = snapshot.geometry.postSections[i];
    assert(actual.w === 150 && actual.d === 150, 'Owner-confirmed equal square columns must be used at every row');
  }
  assert(snapshot.height === 2398, 'Measured column height differs from Expivi');
  console.log('EXPIVI_RUNTIME ' + JSON.stringify({ catalog: scene.id, ...snapshot.geometry }));
}

module.exports = async function routingSmoke(browser) {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  for (const [device, viewport] of [['desktop', {width:1440,height:1000}], ['mobile', {width:390,height:844}]]) {
    const context = await browser.newContext({ viewport });
    await prepareContext(context);
    const page = await context.newPage();
    const checkErrors = watchErrors(page);
    const snapshot = () => page.evaluate(() => window.SP_TEST.snapshot());
    const gotoControl = async selector => {
      const step = await page.locator(selector).first().evaluate(el => Number(el.closest('[data-sp-stepno]').dataset.spStepno));
      await page.locator(`[data-sp-goto="${step}"]`).click();
    };
    for (const route of ['koverta', 'zahrada', 'carport', 'canopy', 'bio']) {
      /* Záhradný prístrešok je ten istý oceľový výrobok ako prístrešok pre
         auto — tá istá skladba, tie isté lamelové výplne, tá istá cenová
         logika. Kontroly písané pre Kovertu preto platia aj naň. */
      const kv = route === 'koverta' || route === 'zahrada';
      await page.goto(`http://127.0.0.1:8901/konfigurator/?page=${route}`, {waitUntil:'load',timeout:60000});
      const consent = page.getByRole('button', {name:'Iba nevyhnutné'});
      if (await consent.count()) await consent.first().click();
      await page.waitForFunction(() => Boolean(window.SP_TEST && window.SP_TEST.snapshot && document.querySelector('[data-sp-canvas]')?.dataset.faceCount));
      const initial = await snapshot();
      assert(initial.page === route, `${route}: incorrect runtime/template`);
      assert(await page.locator(`[data-kv-tab="${route}"]`).getAttribute('aria-current') === 'page', `${route}: incorrect tab`);
      if (kv) {
        assert(initial.price.open === true && initial.price.total === null &&
          initial.price.catalogueSubtotal > 0 && Number.isFinite(initial.price.catalogueSubtotal),
          `${route}: mandatory quote-only drainage lost the numeric catalogue subtotal`);
      } else {
        assert(initial.price.total > 0 && Number.isFinite(initial.price.total), `${route}: no numeric price`);
      }
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(await overflow() <= 4, `${route}/${device}: horizontal overflow`);
      await page.screenshot({path:`qa-artifacts/config-${route}-${device}.png`,fullPage:true});

      await gotoControl('[data-sp-l]');
      await page.locator('[data-sp-l]').evaluate(el => { el.value = el.max; el.dispatchEvent(new Event('input',{bubbles:true})); });
      await page.waitForTimeout(180);
      const resized = await snapshot();
      assert(resized.length !== initial.length, `${route}: length did not change`);
      const initialComparable = kv ? initial.price.catalogueSubtotal : initial.price.total;
      const resizedComparable = kv ? resized.price.catalogueSubtotal : resized.price.total;
      assert(resizedComparable !== initialComparable, `${route}: dimension change did not change price`);
      /* Jeden krok môže mať viac panelov — rozmer a pod ním model — ale všetky
         musia patriť tomu istému kroku. Keby sa niektorý odpojil, zákazník by
         videl v jednom kroku kus iného. */
        const visibleStep = async () => {
          const nos = await page.locator('[data-sp-stepno]:not([hidden])').evaluateAll(
            els => els.map(el => el.dataset.spStepno));
          assert(nos.length > 0, `${route}: no visible step panel`);
          assert(new Set(nos).size === 1,
            `${route}: visible panels belong to different steps: ${nos.join(', ')}`);
          return nos[0];
        };
      const current = await visibleStep();
      await page.locator('[data-sp-next]').click();
      assert(await visibleStep() !== current, `${route}: next failed`);
      await page.locator('[data-sp-back]').click();
      assert(await visibleStep() === current, `${route}: back failed`);

      await gotoControl('[data-sp-frame-color]');
      await page.locator('[data-sp-frame-color]:not([aria-pressed="true"])').first().click();
      assert((await snapshot()).frameColor !== resized.frameColor, `${route}: colour did not change`);
      await gotoControl('[data-sp-side]');
      await page.locator('[data-sp-side]').first().click();
      await page.locator(kv ? '[data-sp-side-opt]:not([data-sp-side-opt="open"])' : '[data-sp-side-opt="fi30"]').first().click();
      const withSide = await snapshot();
      assert(Object.values(withSide.sides).some(v => v !== 'open'), `${route}: side did not change`);
      if (kv) {
        assert(withSide.price.open === true && withSide.price.total === null &&
          withSide.price.lines.some(line => line.v === null && /Lamely/.test(line.k)),
          `${route}: quote-only side is missing from price lines`);
      } else {
        assert(withSide.price.total !== resized.price.total, `${route}: side not priced`);
      }

      if (kv) {
        /* Odkvap so zvodom je súčasťou zostavy, nie voľbou — prepínač aj
           kotvenie sú z ponuky preč. Musí teda platiť oboje: voľby sa
           nevrátili a odvodnenie je aj tak v modeli aj v súhrne ako položka
           bez ceny, takže súčet ostáva otvorený. */
        assert(await page.locator('[data-sp-add-opt^="pick:"]').count() === 0,
          'Koverta again offers the removed anchoring/gutter choices');
        const drained = await snapshot();
        assert(drained.geometry.accessories.gutter && drained.geometry.accessories.downpipe,
          'Koverta lost the drainage that belongs to the assembly');
        assert(drained.price.open === true && drained.price.lines.some(line => line.v === null && /Odkvap/.test(line.k)),
          'Koverta drainage is missing from the quote lines as an unpriced item');
      } else {
        const extraGroup = route === 'bio' ? 'x-ovl' : 'x-konstr';
        const groupSelector = `[data-sp-add-on="${extraGroup}"]`;
        await gotoControl(groupSelector);
        const beforeExtra = (await snapshot()).price.total;
        const groupToggle = page.locator(groupSelector);
        await groupToggle.locator('xpath=ancestor::label[1]').click();
        assert(await groupToggle.isChecked(), `${route}: extra group did not open`);
        await page.locator('[data-sp-xd="1"]').first().waitFor({state:'visible'});
        await page.locator('[data-sp-xd="1"]').first().click();
        const withExtra = await snapshot();
        assert(Object.values(withExtra.extras).some(v => v > 0), `${route}: extra did not change`);
        assert(withExtra.price.total > beforeExtra, `${route}: selected extra did not increase price`);
      }
      await page.locator('[data-sp-cfg-open]').click();
      assert(await page.locator('[data-sp-section]').evaluate(el => el.classList.contains('is-full')), `${route}: fullscreen did not open`);
      assert(await overflow() <= 4, `${route}/${device}: fullscreen overflow`);
      await page.screenshot({path:`qa-artifacts/config-${route}-${device}-fullscreen.png`});
      await page.locator('[data-sp-cfg-close]').click();
      assert(!(await page.locator('[data-sp-section]').evaluate(el => el.classList.contains('is-full'))), `${route}: fullscreen did not close`);

      /* Odmerané scény z Expivi existujú len pre prístrešok pre auto — sú to
         konkrétne katalógové zostavy 7000 × 5200 a 7000 × 6000. Záhradný
         prístrešok také rozmery nemá a kreslí sa z parametrov, takže sa proti
         nim porovnávať nedá. */
      if (route === 'koverta') {
        await gotoControl('[data-sp-w]');
        for (const length of [5200,6000]) {
          await page.evaluate(length => {
            for (const [selector,value] of [['[data-sp-w]',7000],['[data-sp-l]',length]]) {
              const el=document.querySelector(selector); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true}));
            }
          }, length);
          await page.waitForTimeout(180);
          verifyMeasuredScene(await snapshot());
          for (const view of ['front','side','corner','under']) {
            await page.locator(`[data-sp-view="${view}"]`).click();
            await page.waitForTimeout(300);
            await page.locator('.sp-stage').screenshot({path:`qa-artifacts/koverta-7000x${length}-${device}-${view}.png`});
          }
        }
      }
      /* Odvodnenie sa kreslí z dvoch odmeraných sietí a vyberá sa tá, ktorej
         poloha rúry voči výpuste žľabu sedí. Keď sa vezme vzdialenejšia, jej
         šikmý úsek sa stlačí a rúra je zdeformovaná. Autoprístrešky to majú
         v koverta-accessories, tá však beží len na jednej rodine — záhradné
         prístrešky ostávali nekryté a práve tam bola chyba, tak sa to kontroluje
         na každej trase, ktorá odkvap vôbec kreslí. */
      {
        /* Odkvap majú len rodiny so strechou Koverta; ostatné trasy nemajú
           ani geometry, takže sa sem nedostanú. */
        const geom = (await snapshot()).geometry;
        const dp = geom && geom.accessories && geom.accessories.downpipe;
        if (dp && dp.enabled) {
          const NATIVE = [0, -943];
          assert(NATIVE.indexOf(dp.sourceOffset) > -1,
            `${route}/${device}: unknown drainage mesh offset ${dp.sourceOffset}`);
          const chosen = Math.abs(dp.outletOffset - dp.sourceOffset);
          const other = Math.min(...NATIVE.filter(v => v !== dp.sourceOffset)
            .map(v => Math.abs(dp.outletOffset - v)));
          assert(chosen <= other,
            `${route}/${device}: drainage mesh stretches ${chosen} mm where the other would stretch ${other} — the pipe is deformed`);
          assert(dp.terminal && dp.terminal.dxMin === -40 && dp.terminal.dxMax === 104 &&
            dp.terminal.dyMin === -40 && dp.terminal.dyMax === 40,
            `${route}/${device}: downpipe foot is not the car shelters' 80 mm tube and elbow`);
        }
      }
      checkErrors();
      console.log(`ROUTING_PASS ${route}/${device}: runtime, tab, dimensions, price, colour, side, extras, next/back, fullscreen`);
    }
    await page.goto('http://127.0.0.1:8901/konfigurator/',{waitUntil:'load'});
    await page.waitForFunction(() => Boolean(window.SP_TEST && window.SP_TEST.snapshot));
    assert((await snapshot()).page === 'koverta', 'Default route is not Koverta');
    checkErrors();
    await context.close();
  }
};

/* Spustenie priamo z príkazového riadku. Doteraz sa tento súbor dal len
   vyžiadať z layout-smoke; `node routing-smoke.js` sa ticho skončil nulou,
   takže vyzeral, že prešiel, hoci neurobil nič. To je horšie ako pád. */
if (require.main === module) {
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  (async () => {
    const browser = await chromium.launch();
    try { await module.exports(browser); } finally { await browser.close(); }
  })().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
