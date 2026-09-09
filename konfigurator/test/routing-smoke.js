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
    const measured = columns.find(d => Math.abs(axis(d) - posts[i]) <= 1);
    const actual = snapshot.geometry.postSections[i];
    assert(actual.w === measured.r[0] && actual.d === measured.r[1], 'Column section/orientation differs from Expivi');
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
    for (const route of ['koverta', 'carport', 'canopy', 'bio']) {
      await page.goto(`http://127.0.0.1:8901/konfigurator/?page=${route}`, {waitUntil:'load',timeout:60000});
      const consent = page.getByRole('button', {name:'Iba nevyhnutné'});
      if (await consent.count()) await consent.first().click();
      await page.waitForFunction(() => Boolean(window.SP_TEST && window.SP_TEST.snapshot && document.querySelector('[data-sp-canvas] path')));
      const initial = await snapshot();
      assert(initial.page === route, `${route}: incorrect runtime/template`);
      assert(await page.locator(`[data-kv-tab="${route}"]`).getAttribute('aria-current') === 'page', `${route}: incorrect tab`);
      assert(initial.price.total > 0 && Number.isFinite(initial.price.total), `${route}: no numeric price`);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(await overflow() <= 4, `${route}/${device}: horizontal overflow`);
      await page.screenshot({path:`qa-artifacts/config-${route}-${device}.png`,fullPage:true});

      await gotoControl('[data-sp-l]');
      await page.locator('[data-sp-l]').evaluate(el => { el.value = el.max; el.dispatchEvent(new Event('input',{bubbles:true})); });
      await page.waitForTimeout(180);
      const resized = await snapshot();
      assert(resized.length !== initial.length, `${route}: length did not change`);
      assert(resized.price.total !== initial.price.total, `${route}: dimension change did not change price`);
      const current = await page.locator('[data-sp-stepno]:not([hidden])').getAttribute('data-sp-stepno');
      await page.locator('[data-sp-next]').click();
      assert(await page.locator('[data-sp-stepno]:not([hidden])').getAttribute('data-sp-stepno') !== current, `${route}: next failed`);
      await page.locator('[data-sp-back]').click();
      assert(await page.locator('[data-sp-stepno]:not([hidden])').getAttribute('data-sp-stepno') === current, `${route}: back failed`);

      await gotoControl('[data-sp-frame-color]');
      await page.locator('[data-sp-frame-color]:not([aria-pressed="true"])').first().click();
      assert((await snapshot()).frameColor !== resized.frameColor, `${route}: colour did not change`);
      await gotoControl('[data-sp-side]');
      await page.locator('[data-sp-side]').first().click();
      await page.locator('[data-sp-side-opt]:not([data-sp-side-opt="open"])').first().click();
      const withSide = await snapshot();
      assert(Object.values(withSide.sides).some(v => v !== 'open'), `${route}: side did not change`);
      assert(withSide.price.total !== resized.price.total, `${route}: side not priced`);

      if (route === 'koverta') {
        await gotoControl('[data-sp-add-opt="pick:odkvap"]');
        await page.locator('[data-sp-add-opt="pick:odkvap"]:not([aria-pressed="true"])').first().click();
        assert((await snapshot()).picks.odkvap !== initial.picks.odkvap, 'Koverta gutter selection did not change');
      } else {
        await gotoControl('[data-sp-xd="1"]');
        await page.locator('[data-sp-xd="1"]').first().click();
        assert(Object.values((await snapshot()).extras).some(v => v > 0), `${route}: extra did not change`);
      }
      await page.locator('[data-sp-cfg-open]').click();
      assert(await page.locator('[data-sp-section]').evaluate(el => el.classList.contains('is-full')), `${route}: fullscreen did not open`);
      assert(await overflow() <= 4, `${route}/${device}: fullscreen overflow`);
      await page.screenshot({path:`qa-artifacts/config-${route}-${device}-fullscreen.png`});
      await page.locator('[data-sp-cfg-close]').click();
      assert(!(await page.locator('[data-sp-section]').evaluate(el => el.classList.contains('is-full'))), `${route}: fullscreen did not close`);

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
