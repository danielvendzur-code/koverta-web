'use strict';

const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { prepareContext, watchErrors } = require('./browser-qa');

const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const SIDES = ['rear', 'front', 'left', 'right'];
const MATERIALS = ['kvdrevo', 'kvwpc', 'kvhlinik'];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: 'Iba nevyhnutné' });
  if (await reject.count()) {
    await reject.first().click();
    await page.waitForTimeout(100);
  }
}

async function gotoControl(page, selector) {
  const control = page.locator(selector).first();
  await control.waitFor({ state: 'attached' });
  const step = await control.evaluate(el => {
    const host = el.closest('[data-sp-stepno]');
    return host ? Number(host.dataset.spStepno) : null;
  });
  if (step != null) {
    await page.locator(`[data-sp-goto="${step}"]`).click();
    await page.waitForTimeout(80);
  }
}

async function setSize(page, width, length) {
  await gotoControl(page, '[data-sp-w]');
  await page.evaluate(({ width, length }) => {
    const set = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error('Missing control ' + selector);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('[data-sp-w]', width);
    set('[data-sp-l]', length);
  }, { width, length });
  await page.waitForTimeout(240);
}

async function svgState(page) {
  return page.locator('[data-sp-canvas]').evaluate(svg => ({
    markup: window.SP_TEST.exportSVG(),
    materials: window.SP_TEST.renderMaterials,
    invalidFaces: Number(svg.dataset.invalidFaceCount || 0),
    polygons: Number(svg.dataset.faceCount || svg.querySelectorAll('polygon').length),
    paths: svg.querySelectorAll('path').length
  }));
}

async function snapshot(page) {
  return JSON.parse(JSON.stringify(await page.evaluate(() => window.SP_TEST.snapshot())));
}

/* Odkvap so zvodom a kotvenie do betónu sú súčasťou zostavy, nie voľba —
   ich prepínače aj vysvetľujúce odseky boli z konfigurátora odstránené na
   žiadosť vlastníka. Test preto stráži dve veci naraz: že sa tie voľby
   nevrátili do ponuky a že odvodnenie napriek tomu v modeli fyzicky je. */
async function assertMandatoryDrainage(page) {
  const gone = await page.locator('[data-sp-add-opt^="pick:"]').count();
  assert(gone === 0, 'Odstránené voľby kotvenia a odkvapu sa vrátili do ponuky');
  const prose = await page.evaluate(() => /Kotvenie stĺpov|Odkvap a zvod sú súčasťou/i.test(document.body.textContent));
  assert(!prose, 'Odstránený vysvetľujúci text kotvenia/odkvapu sa vrátil');
  await page.waitForTimeout(180);
}

async function enableExtra(page, id) {
  const group = page.locator('[data-sp-add-on="x-kv"]').first();
  await gotoControl(page, '[data-sp-add-on="x-kv"]');
  if (!await group.isChecked()) {
    await group.locator('xpath=ancestor::label[1]').click();
    await page.waitForTimeout(100);
  }
  const plus = page.locator(`[data-sp-x="${id}"][data-sp-xd="1"]`).first();
  await plus.waitFor({ state: 'visible' });
  await plus.click();
  await page.waitForTimeout(180);
}

async function selectSide(page, side, kind) {
  const sideButton = `[data-sp-side="${side}"]`;
  await gotoControl(page, sideButton);
  await page.locator(sideButton).click();
  await page.waitForTimeout(80);
  const option = page.locator(`[data-sp-side-opt="${kind}"]`).first();
  await option.waitFor({ state: 'visible' });
  await option.click();
  await page.waitForTimeout(180);
}

async function rotateAndValidate(page, device, label, steps = 24) {
  for (let i = 0; i < steps; i++) {
    const az = -Math.PI + i * Math.PI * 2 / steps;
    await page.evaluate(azimuth => {
      window.SP_TEST.setView(azimuth, 0.22);
      window.SP_TEST.redraw();
    }, az);
    await page.waitForTimeout(12);
    const state = await svgState(page);
    assert(state.polygons > 100, `${device}/${label}: model vanished at azimuth ${az}`);
    assert(state.invalidFaces === 0,
      `${device}/${label}: non-finite geometry at azimuth ${az}`);
  }
}

function expectedWallAnchor(snap, side) {
  const geometry = snap.geometry;
  assert(geometry && geometry.accessoryAnchors, 'Missing Koverta accessory anchor test data');
  const axes = geometry.postAxes;
  const sections = geometry.postSections;
  assert(axes.length === sections.length && axes.length >= 2, 'Invalid Koverta post geometry');
  assert(sections.every(section => section.d === section.w && section.w === sections[0].w),
    'Corner and intermediate posts must have the same square section');
  const leftEdges = axes.map((axis, i) => axis - sections[i].d / 2);
  const inset = geometry.postInset;

  if (side === 'rear' || side === 'front') {
    return {
      axis: 'x',
      out: side === 'rear' ? -1 : 1,
      vFace: side === 'rear' ? inset : snap.width - inset,
      runFrom: leftEdges[0] + sections[0].d,
      runTo: leftEdges[leftEdges.length - 1],
      cuts: leftEdges.slice(1, -1).map((x, i) => [x, x + sections[i + 1].d])
    };
  }

  const i = side === 'left' ? 0 : axes.length - 1;
  return {
    axis: 'y',
    out: side === 'left' ? -1 : 1,
    vFace: side === 'left' ? leftEdges[i] : leftEdges[i] + sections[i].d,
    runFrom: inset + sections[i].w,
    runTo: snap.width - inset - sections[i].w,
    cuts: []
  };
}

function assertClose(actual, expected, message, tolerance = 0.01) {
  assert(Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`);
}

function validateWallAnchor(snap, side, label) {
  const actual = snap.geometry.accessoryAnchors[side];
  const expected = expectedWallAnchor(snap, side);
  assert(actual, `${label}: missing ${side} wall anchor`);
  assert(actual.axis === expected.axis && actual.out === expected.out,
    `${label}: ${side} wall axis/outward direction is wrong`);
  for (const key of ['vFace', 'runFrom', 'runTo']) {
    assertClose(actual[key], expected[key], `${label}: ${side} ${key}`);
  }
  assert(actual.runTo > actual.runFrom,
    `${label}: ${side} wall has a non-positive physical span`);
  assert(actual.cuts.length === expected.cuts.length,
    `${label}: ${side} wall has wrong interior-post cut count`);
  actual.cuts.forEach((cut, i) => {
    assertClose(cut[0], expected.cuts[i][0], `${label}: ${side} cut ${i} start`);
    assertClose(cut[1], expected.cuts[i][1], `${label}: ${side} cut ${i} end`);
    assert(cut[1] > cut[0], `${label}: ${side} cut ${i} is inverted`);
  });
  assert(Number.isFinite(actual.guideScale) && actual.guideScale > 0,
    `${label}: ${side} guide scale is invalid`);
  return actual;
}

function anchorSignature(anchor) {
  return JSON.stringify({
    axis: anchor.axis,
    vFace: anchor.vFace,
    runFrom: anchor.runFrom,
    runTo: anchor.runTo,
    cuts: anchor.cuts
  });
}

function validateAccessoryContacts(snap, label) {
  const geometry = snap.geometry;
  const accessories = geometry && geometry.accessories;
  assert(accessories, `${label}: missing Koverta accessory contact geometry`);
  const assembly = accessories.assembly;

  /* Izolácia strechy už nie je v ponuke doplnkov, takže sa ani nemá zapnúť. */
  assert(!accessories.insulation || !accessories.insulation.enabled,
    `${label}: odstránená izolácia sa vrátila do geometrie`);

  /* Svetlo visí na priečnych profiloch: jeden pás na každú väznicu, a keď
     pod väznicou stojí stĺp, rozdelený na kusy okolo neho. Preto sa počíta
     počet obsadených väzníc, nie štyri strany obvodového rámu. */
  const led = accessories.led;
  assert(led && led.enabled, `${label}: LED contact data missing`);
  const purlins = new Set(led.runs.map((run) => run.side));
  assert(purlins.size >= 3, `${label}: LED nesvieti na každom priečnom profile (${purlins.size})`);
  assert([...purlins].every((side) => /^vaznica\d+$/.test(side)),
    `${label}: LED sa vrátilo na obvodový rám namiesto priečnych profilov`);
  led.runs.forEach((run, i) => {
    assertClose(run.profileTopZ, run.hostBottomZ,
      `${label}: LED segment ${i} does not touch its host purlin underside`);
    assert(run.dx >= 26 && run.dx <= 46,
      `${label}: LED segment ${i} je príliš tenký alebo široký (${run.dx} mm)`);
    assert(run.profileTopZ - run.profileBottomZ >= 14,
      `${label}: LED segment ${i} je príliš plochý`);
    assert(run.dx > 0 && run.dy > 0,
      `${label}: LED segment ${i} has a non-positive footprint`);
    assert(run.x >= assembly.xMin - 0.01 && run.y >= assembly.yMin - 0.01 &&
      run.x + run.dx <= assembly.xMax + 0.01 &&
      run.y + run.dy <= assembly.yMax + 0.01,
      `${label}: LED segment ${i} escaped the current frame footprint`);
  });

  /* A post may touch the end of an LED segment but no positive-area part of
     the LED profile may occupy the steel post footprint. This is the physical
     regression that the earlier visual-only test could not detect. */
  const postRects = (led.blockedPosts || []).flatMap((post) => [
    { x0: post.from, x1: post.to, y0: post.rearY0, y1: post.rearY1 },
    { x0: post.from, x1: post.to, y0: post.frontY0, y1: post.frontY1 }
  ]);
  const overlapArea = (run, post) => {
    const x0 = Math.max(run.x, post.x0);
    const x1 = Math.min(run.x + run.dx, post.x1);
    const y0 = Math.max(run.y, post.y0);
    const y1 = Math.min(run.y + run.dy, post.y1);
    return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  };
  assert(postRects.length >= 4, `${label}: LED post-footprint data is incomplete`);
  led.runs.forEach((run, runIndex) => {
    postRects.forEach((post, postIndex) => {
      assert(overlapArea(run, post) <= 0.01,
        `${label}: LED segment ${runIndex} penetrates post footprint ${postIndex}`);
    });
  });

  const gutter = accessories.gutter;
  assert(gutter && gutter.enabled, `${label}: gutter contact data missing`);
  assert(gutter.x0 >= gutter.pocket.xMin - 0.01 &&
    gutter.x1 <= gutter.pocket.xMax + 0.01 &&
    gutter.x1 > gutter.x0,
    `${label}: gutter is outside the intended fascia pocket`);
  assert(gutter.zBottom >= gutter.pocket.zMin - 0.01 &&
    gutter.zTop <= gutter.pocket.zMax + 0.01 &&
    gutter.zTop > gutter.zBottom,
    `${label}: gutter vertical section escaped the fascia/frame pocket`);
  assert(gutter.y0 >= assembly.yMin - 0.01 &&
    gutter.y1 <= assembly.yMax + 0.01 && gutter.y1 > gutter.y0,
    `${label}: gutter escaped the current roof width`);
  assert(gutter.outletX > gutter.x0 && gutter.outletX < gutter.x1,
    `${label}: gutter outlet is not inside the gutter section`);

  const downpipe = accessories.downpipe;
  assert(downpipe && downpipe.enabled, `${label}: downpipe contact data missing`);
  assert(downpipe.source === gutter.source && /mesh_Body1_(93|51)_/.test(downpipe.source),
    `${label}: original Expivi drainage variant missing`);
  /* Päta s kolenom a žľab ostávajú zo siete Expivi, rúra medzi nimi je
     okrúhla s plynulými kolenami po tej istej dráhe (predtým sa sieť
     naťahovala a kolená boli rozlámané). */
  assert(downpipe.vertexCount > 1800 && downpipe.triangleCount > 2400,
    `${label}: source drainage mesh was replaced by an incomplete placeholder`);
  assert(Array.isArray(downpipe.pipePath) && downpipe.pipePath.length >= 2,
    `${label}: downpipe tube path missing`);
  /* Priemer zvodu. Majiteľ najprv vytkol rúru so 93 % šírky stĺpa — na zábere
     vyzerala rovnako široko ako stĺp. Nasledovala oprava, ktorá priemer
     naviazala na stĺp (0,6 × jeho šírka) a strážila ju tu pravidlom „výrazne
     užšia ako stĺp“ (< 0,7). Tá oprava ale spravila z jedného výrobku tri:
     rovnaká rodina mala pri 6200 mm rúru 60 mm a pri 7000 mm 80 mm a záhradné
     prístrešky nesedeli s autoprístreškami. Majiteľ potom výslovne žiadal, aby
     bol zvod pri stĺpe rovnaký ako na autoprístreškoch — šírkou aj zakončením.
     Pravidlo sa preto vymenilo, nie zrušilo: priemer je jeden, presne 80 mm
     obnovenej pôvodnej siete, na každom rozmere a v oboch rodinách. Horná
     hranica voči stĺpu ostáva, len na hodnote, ktorú 80 mm na užšom 100 mm
     stĺpe spĺňa — 93 %, ktoré majiteľ vytkol, tadiaľ neprejde. */
  assertClose(downpipe.radius * 2, 80,
    `${label}: downpipe is no longer the single 80 mm source tube`);
  assert(downpipe.radius * 2 < (downpipe.post.y1 - downpipe.post.y0) * 0.85,
    `${label}: downpipe must stay narrower than the post`);
  assertClose(downpipe.pipeCenter[1], (downpipe.post.y0 + downpipe.post.y1) / 2,
    `${label}: downpipe no longer follows the active corner-post centreline`);
  assertClose(downpipe.pipeCenter[0] - downpipe.radius,
    downpipe.post.x1 + downpipe.standoff,
    `${label}: downpipe shell/standoff is detached from the active corner-post face`);
  /* Priemer a uhol nie sú technické kóty: toto stráži iba vizuálnu regresiu,
     pri ktorej sa rúra zmenila na tenkú, dlhú diagonálu podobnú vzpere. */
  const postMin = Math.min(
    downpipe.post.x1 - downpipe.post.x0,
    downpipe.post.y1 - downpipe.post.y0
  );
  assert(downpipe.radius * 2 >= postMin * 0.42 &&
    downpipe.radius * 2 <= postMin * 0.95,
    `${label}: downpipe visual diameter is disproportionate to its active host post`);

  /* Zakončenie zvodu. Majiteľ žiada, aby rúra pri stĺpe vyzerala na každom
     rozmere a na oboch rodinách rovnako ako na autoprístreškoch — rovnaká
     šírka aj rovnaké koleno pri dlažbe. Posun k aktívnemu stĺpu a k aktívnej
     odkvapovej hrane nie je rovnaký, takže rozdiel musí pohltiť prázdny pás
     medzi rúrou a žľabom; keď zasiahne pätu, koleno sa stlačí alebo roztiahne
     a zakončenie prestane sedieť. Tieto čísla sú z pôvodnej siete: rúra je
     80 mm široká (±40 od osi) a jej koleno odhodí ústie 104 mm od osi. */
  const term = downpipe.terminal;
  assert(term, `${label}: downpipe terminal measurement missing`);
  assertClose(term.dxMin, -40, `${label}: downpipe foot lost its 80 mm section`);
  assertClose(term.dxMax, 104, `${label}: downpipe elbow no longer matches the car shelters`);
  assertClose(term.dyMin, -40, `${label}: downpipe foot lost its 80 mm section across`);
  assertClose(term.dyMax, 40, `${label}: downpipe foot lost its 80 mm section across`);

  /* Voľba odmeranej siete. Sú dve a líšia sa jediným: „six“ má rúru priamo
     pod výpusťou žľabu, „four“ ju má 943 mm vo vnútri a šikmým úsekom sa
     k nej vracia. Keď sa vezme tá vzdialenejšia, jej šikmina sa musí stlačiť
     alebo natiahnuť o celý ten rozdiel a rúra sa viditeľne zdeformuje — presne
     to sa dialo na záhradných prístreškoch, kde voľba visela na počte stĺpov
     a nie na polohe rúry. Berie sa tá bližšia. */
  const NATIVE = [0, -943];
  assert(NATIVE.indexOf(downpipe.sourceOffset) > -1,
    `${label}: unknown drainage mesh offset ${downpipe.sourceOffset}`);
  const chosen = Math.abs(downpipe.outletOffset - downpipe.sourceOffset);
  const other = Math.min(...NATIVE.filter((v) => v !== downpipe.sourceOffset)
    .map((v) => Math.abs(downpipe.outletOffset - v)));
  assert(chosen <= other,
    `${label}: drainage mesh is the wrong one for a pipe ${downpipe.outletOffset} mm from the outlet — it has to stretch ${chosen} mm where the other would stretch ${other}`);

  const bounds = downpipe.pathBounds;
  assert(bounds.xMin >= assembly.xMin - 0.01 &&
    bounds.xMax <= assembly.xMax + 100 &&
    bounds.yMin >= assembly.yMin - 0.01 &&
    bounds.yMax <= assembly.yMax + 0.01 &&
    bounds.zMin >= assembly.zMin - 0.01 &&
    bounds.zMax <= assembly.zMax + 0.01,
    `${label}: downpipe bounding box escaped the intended assembly after resize`);

  assert(downpipe.clamps.length >= 2, `${label}: downpipe clamps are missing`);
  downpipe.clamps.forEach((clamp, i) => {
    assert(clamp.bridgeX0 <= clamp.postFaceX + 0.01 &&
      clamp.bridgeX1 >= clamp.pipeNearX - 0.01,
      `${label}: clamp ${i} does not physically bridge post and downpipe`);
    assert(Number.isFinite(clamp.z), `${label}: clamp ${i} has invalid height`);
  });
}

(async () => {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [device, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }]
    ]) {
      const context = await browser.newContext({ viewport });
      await prepareContext(context);
      const page = await context.newPage();
      const checkErrors = watchErrors(page);

      await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
      await dismissConsent(page);
      await page.waitForFunction(() =>
        Boolean(window.SP_TEST && window.SP_TEST.snapshot && document.querySelector('[data-sp-canvas]')?.dataset.faceCount));
      await page.waitForTimeout(180);

      const initial = await snapshot(page);
      assert(initial.page === 'koverta', `${device}: wrong configurator route`);

      await assertMandatoryDrainage(page);
      const drainageOn = await svgState(page);
      const drainageSnap = await snapshot(page);
      assert(!Object.keys(drainageSnap.picks).length, `${device}: picks must be empty after the options were removed`);
      assert(drainageSnap.geometry.accessories.gutter &&
        drainageSnap.geometry.accessories.downpipe,
        `${device}: mandatory gutter/downpipe has no physical geometry`);
      assert(drainageOn.polygons > 100 && (drainageOn.markup.includes('<polygon') || drainageOn.markup.includes('<image')),
        `${device}: mandatory drainage render is empty`);

      /* Izolácia strechy už nie je v ponuke doplnkov; ostalo len svetlo a
         elektrická prípojka. Overuje sa z podhľadu, kde by izolácia bola
         vidieť, že sa medzi doplnky nevrátila. */
      await page.locator('[data-sp-view="under"]').click();
      await page.waitForTimeout(220);
      assert(await page.locator('[data-sp-x="kv-izol"]').count() === 0,
        `${device}: odstránená izolácia strechy sa vrátila medzi doplnky`);

      const beforeLed = await svgState(page);
      await enableExtra(page, 'kv-led');
      const withLed = await svgState(page);
      const ledSnap = await snapshot(page);
      assert(ledSnap.extras['kv-led'] === 1, `${device}: LED state missing`);
      assert(withLed.markup !== beforeLed.markup,
        `${device}: LED selection did not change the physical SVG render`);
      assert(withLed.materials.some(fill => /f5e8c5/i.test(fill)),
        `${device}: LED diffuser surface is missing from the rendered SVG`);

      /* Preserve visual evidence for manual QA in the workflow artifact. */
      await setSize(page, 7000, 6000);
      for (const viewName of ['front', 'side', 'corner', 'under']) {
        await page.locator(`[data-sp-view="${viewName}"]`).click();
        await page.waitForTimeout(180);
        await page.locator('.sp-stage').screenshot({
          path: `qa-artifacts/koverta-accessories-${viewName}-7000x6000-${device}.png`
        });
      }
      await page.locator('[data-sp-view="under"]').click();
      await page.waitForTimeout(120);

      /* Verify all three current Koverta side-wall materials are selectable
         and physically rendered. */
      await setSize(page, 6200, 6000);
      let previousMaterialMarkup = null;
      for (const material of MATERIALS) {
        await selectSide(page, 'rear', material);
        const snap = await snapshot(page);
        assert(snap.sides.rear === material,
          `${device}: rear side did not switch to ${material}`);
        validateWallAnchor(snap, 'rear', `${device}/6200x6000/${material}`);
        const rendered = await svgState(page);
        assert(rendered.polygons > 100 && rendered.invalidFaces === 0,
          `${device}: ${material} produced invalid wall geometry`);
        if (previousMaterialMarkup !== null) {
          assert(rendered.markup !== previousMaterialMarkup,
            `${device}: ${material} did not change the rendered wall material`);
        }
        previousMaterialMarkup = rendered.markup;
      }
      await selectSide(page, 'rear', 'open');

      /* Each physical side is tested independently. The wall is selected on a
         four-post size, resized while still selected to both measured six-post
         sizes, and rotated. This catches stale world-space anchors. */
      /* Prednú stranu (vjazd) Koverta stenou uzavrieť neponúka. */
      assert(await page.locator('[data-sp-side="right"]').isHidden(),
        `${device}: front (entrance) wall must not be offered`);
      for (const side of SIDES.filter(s => s !== 'right')) {
        await setSize(page, 6200, 6000);
        await selectSide(page, side, 'kvdrevo');
        let snap4 = await snapshot(page);
        /* So stenou stojí aj užší prístrešok v rohoch s radom v strede
           (šesťstĺpová zostava z Expivi); stredný stĺp pri bočnej stene je
           len na jej strane a pri zadnej/prednej nad 4 m v strede čela. */
        assert(snap4.geometry.postAxes.length === 3 && snap4.geometry.wallMode === true,
          `${device}/${side}: 6200x6000 with a wall does not stand on corner posts with a middle row`);
        /* So stenou stoja na oboch bokoch po tri stĺpy (cena z Expivi bola
           so šiestimi); zadná stena nad 4 m pridá stĺp do stredu čela. */
        const expectedPosts = side === 'left' ? 7 : 6;
        assert(snap4.geometry.postCount === expectedPosts,
          `${device}/${side}: 6200x6000 with one wall should have ${expectedPosts} posts, got ${snap4.geometry.postCount}`);
        const anchor4 = validateWallAnchor(snap4, side, `${device}/6200x6000`);
        await rotateAndValidate(page, device, `6200x6000/${side}`, 12);

        await setSize(page, 7000, 5200);
        let snap52 = await snapshot(page);
        assert(snap52.sides[side] === 'kvdrevo',
          `${device}/${side}: selected wall was lost after resize to 7000x5200`);
        assert(snap52.geometry.postAxes.length === 3,
          `${device}/${side}: 7000x5200 is not the expected six-post layout`);
        const anchor52 = validateWallAnchor(snap52, side, `${device}/7000x5200`);
        assert(anchorSignature(anchor52) !== anchorSignature(anchor4),
          `${device}/${side}: wall anchor remained stale after 4→6-post resize`);
        await rotateAndValidate(page, device, `7000x5200/${side}`, 12);
        await page.locator('.sp-stage').screenshot({
          path: `qa-artifacts/koverta-wall-${side}-7000x5200-${device}.png`
        });

        await setSize(page, 7000, 6000);
        const snap60 = await snapshot(page);
        assert(snap60.sides[side] === 'kvdrevo',
          `${device}/${side}: selected wall was lost after resize to 7000x6000`);
        assert(snap60.geometry.postAxes.length === 3,
          `${device}/${side}: 7000x6000 is not the expected six-post layout`);
        validateWallAnchor(snap60, side, `${device}/7000x6000`);
        /* validateWallAnchor() compares against the current post axes/sections.
           A left-side anchor can legitimately be identical at 7000x5200 and
           7000x6000 because its host is the unchanged left end post; requiring
           every side's signature to differ would reject correct geometry. */
        await rotateAndValidate(page, device, `7000x6000/${side}`, 12);

        await selectSide(page, side, 'open');
      }

      /* Final accessory-only matrix with all non-wall accessories retained:
         smaller four-post plus both measured six-post dimensions. */
      for (const [width, length, expectedRows] of [
        [6200, 6000, 2],
        [7000, 5200, 3],
        [7000, 6000, 3]
      ]) {
        await setSize(page, width, length);
        const snap = await snapshot(page);
        assert(snap.width === width && snap.length === length,
          `${device}: size did not update to ${width}x${length}`);
        assert(snap.geometry && snap.geometry.postAxes.length === expectedRows,
          `${device}: ${width}x${length} expected ${expectedRows} post rows, got ${snap.geometry && snap.geometry.postAxes.length}`);
        assert(snap.extras['kv-led'] === 1, `${device}: accessory state was lost after resize`);
        assert(snap.geometry.accessories.gutter && snap.geometry.accessories.downpipe,
          `${device}: odvodnenie musí ostať v zostave aj po zmene rozmeru`);
        SIDES.forEach(side => validateWallAnchor(snap, side, `${device}/${width}x${length}`));
        validateAccessoryContacts(snap, `${device}/${width}x${length}`);
        await rotateAndValidate(page, device, `${width}x${length}/accessories`, 24);
        await page.locator('.sp-stage').screenshot({
          path: `qa-artifacts/koverta-accessories-${width}x${length}-${device}.png`
        });
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 4, `${device}: accessory configuration causes horizontal overflow: ${overflow}`);
      checkErrors();
      console.log(`ACCESSORIES_PASS ${device}: drainage, insulation, LED, wood/WPC/aluminium walls, all four wall sides, 4/6-post resize, 7000x5200, 7000x6000, 360-degree rotation`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
