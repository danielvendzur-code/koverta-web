'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'konfigurator', 'soltec-premium.js');
const BASE_URL = process.env.SOLTEC_BASE_URL || 'http://127.0.0.1:8901/konfigurator/';
const ARTIFACT_DIR = path.join(ROOT, 'qa-artifacts', 'soltec-all-models');
const ROUTES = ['carport', 'canopy', 'bio'];

function assertSharedRendererContract() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');

  // The profile-disappearance bug was caused by the fixed Soltec rim borrowing
  // Koverta's camera-dependent roof side layer. From below, that layer can fall
  // below -ROOF_LAYER and be classified as background. The Soltec branch must
  // therefore stay exactly on roofBase for every Soltec model; BSP handles the
  // real occlusion. This contract is shared by carport, canopy and bio models.
  assert.match(
    source,
    /const nearSide = \(n\) => \{[\s\S]{0,900}layer = model\(\)\.kvGeom[\s\S]{0,160}\? roofBase \+ \(facing\(n\) > 0 \? UNDER_SIDE : -UNDER_SIDE\)[\s\S]{0,120}: roofBase;/,
    'All Soltec models must keep perimeter profiles in the structural layer'
  );

  // Bioclimatic louvers must remain rigid and use the stable stage-only motion
  // path. These are geometry/motion invariants, not assumptions about one model.
  assert.match(source, /const fullHalf = bladeW \/ 2;/, 'Bioclimatic blades must keep their physical width while rotating');
  assert.match(source, /const lap = 0;/, 'Visible louvers must not intersect the perimeter rail');
  assert.match(source, /cull: model\(\)\.kvGeom,\n\s*edge: model\(\)\.kvGeom \? undefined : false/, 'Soltec perimeter faces must persist without synthetic rim strokes');
  assert.match(source, /const ang = louverAngle\(beam, bladeW, state\.louverT\);/, 'Closed louvers must be exactly horizontal at 0%');
  assert.doesNotMatch(source, /renderLouverT/, 'No fake closed-stop angle may remain');
  assert.match(source, /const layO = Object\.assign\(\{\}, lay, obrys, \{ fit: false \}\);/, 'Moving louvers must not change the stage fit');
  assert.match(source, /const cancelStageQueue = \(\) =>/, 'Louver motion must cancel stale queued stage frames');
  assert.match(source, /boxFaces\(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, \[\], SHAFT, 0, false, true, true\);/, 'Fixed Soltec secondary profiles must retain both end caps and persist at grazing angles');
  assert.match(source, /bg: model\(\)\.kvGeom \? layer < -ROOF_LAYER : layer < -1\.5 \* ROOF_LAYER/, 'Soltec under-roof structure must not be misclassified as background');
  assert.match(source, /const flushStage = \(\) => \{ if \(stagePending\) paintStage\(\); \};/, 'Final Soltec pointer state must flush synchronously');
}

const median = (values) => {
  const v = values.slice().sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function boot(page, route) {
  await page.goto(`${BASE_URL}?page=${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const cfg = page.locator('#SoltecPremium [data-sp-cfg]');
  await cfg.scrollIntoViewIfNeeded();
  await cfg.dispatchEvent('pointerdown', { pointerId: 73, pointerType: 'mouse', clientX: 20, clientY: 20 });
  await page.waitForFunction(
    () => window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.redrawStage
      && document.querySelector('#SoltecPremium [data-sp-canvas] polygon'),
    null,
    { timeout: 20_000 }
  );
  const kind = await page.evaluate(() => window.SP_TEST.snapshot().page);
  assert.equal(kind, route, `Expected ${route} configurator, got ${kind}`);
}

async function modelKeys(page) {
  return page.evaluate(() => {
    const keys = [...document.querySelectorAll('#SoltecPremium [data-sp-model]')]
      .map((b) => b.dataset.spModel)
      .filter(Boolean);
    return [...new Set(keys)];
  });
}

async function activateModel(page, key) {
  const found = await page.evaluate((modelKey) => {
    const button = [...document.querySelectorAll('#SoltecPremium [data-sp-model]')]
      .find((b) => b.dataset.spModel === modelKey);
    if (!button) return false;
    button.click();
    return true;
  }, key);
  assert.equal(found, true, `Model button not found: ${key}`);
  await twoFrames(page);
  const pressed = await page.evaluate((modelKey) => {
    const button = [...document.querySelectorAll('#SoltecPremium [data-sp-model]')]
      .find((b) => b.dataset.spModel === modelKey);
    return button && button.getAttribute('aria-pressed');
  }, key);
  assert.equal(pressed, 'true', `Model did not become active: ${key}`);
}

async function orbitProfileCheck(page, route, modelKey) {
  const elevations = [-0.24, -0.18, -0.08, 0.08, 0.34];
  const result = {};

  for (const elevation of elevations) {
    const samples = [];
    for (let i = 0; i < 36; i += 1) {
      const az = -Math.PI + (Math.PI * 2 * i) / 36;
      const sample = await page.evaluate(([azimuth, el]) => {
        window.SP_TEST.setView(azimuth, el);
        window.SP_TEST.redrawStage();
        const svg = document.querySelector('#SoltecPremium [data-sp-canvas]');
        const polygons = svg.querySelectorAll('polygon');
        const box = svg.getBoundingClientRect();
        return {
          count: polygons.length,
          width: box.width,
          height: box.height,
          htmlLength: svg.innerHTML.length
        };
      }, [az, elevation]);
      assert.ok(sample.count > 8, `${route}/${modelKey}: scene collapsed at az=${az.toFixed(3)}, el=${elevation}`);
      assert.ok(sample.width > 100 && sample.height > 100, `${route}/${modelKey}: stage lost layout size`);
      assert.ok(sample.htmlLength > 500, `${route}/${modelKey}: SVG became anomalously empty`);
      samples.push(sample.count);
    }
    const med = median(samples);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // Culling naturally changes the number of visible faces. A disappearing
    // perimeter member, however, creates the much larger low-angle collapse
    // this guard was written for. Keep the threshold strict but model-agnostic.
    assert.ok(min >= med * 0.74,
      `${route}/${modelKey}: profile/rim disappears during orbit at el=${elevation}: min=${min}, median=${med}`);
    result[String(elevation)] = { min, med, max };
  }

  await page.evaluate(() => {
    window.SP_TEST.setView(-0.62, -0.18);
    window.SP_TEST.redrawStage();
  });
  await page.locator('#SoltecPremium .sp-stage').screenshot({
    path: path.join(ARTIFACT_DIR, `${route}-${modelKey.replace(/[^a-z0-9_-]+/gi, '_')}-low.png`)
  });
  return result;
}

async function bioclimaticCheck(page, modelKey) {
  const hasLouver = await page.evaluate(() => Boolean(document.querySelector('#SoltecPremium [data-sp-louver-range]')));
  assert.equal(hasLouver, true, `bio/${modelKey}: louver control is missing`);

  const values = [100, 85, 65, 45, 25, 15, 10, 6, 3, 1, 0];
  const samples = [];
  for (const value of values) {
    const sample = await page.evaluate((nextValue) => {
      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');
      range.value = String(nextValue);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const anchor = window.SP_TEST.project(0, 0, 0);
        resolve({
          value: nextValue,
          count: document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length,
          x: anchor.x,
          y: anchor.y
        });
      })));
    }, value);
    assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.y), `bio/${modelKey}: invalid projected frame anchor`);
    samples.push(sample);
  }

  const counts = samples.map((s) => s.count);
  const min = Math.min(...counts), max = Math.max(...counts);
  assert.ok(min > 0, `bio/${modelKey}: scene disappeared during louver travel`);
  assert.ok(max / min < 1.48, `bio/${modelKey}: unstable louver topology ${min}..${max}`);

  const xs = samples.map((s) => s.x), ys = samples.map((s) => s.y);
  const driftX = Math.max(...xs) - Math.min(...xs);
  const driftY = Math.max(...ys) - Math.min(...ys);
  assert.ok(driftX < 0.12 && driftY < 0.12,
    `bio/${modelKey}: fixed frame moves while louvers rotate: dx=${driftX.toFixed(3)}, dy=${driftY.toFixed(3)}`);

  const close = samples.filter((s) => s.value <= 15);
  for (let i = 1; i < close.length; i += 1) {
    const a = close[i - 1].count, b = close[i].count;
    const jump = Math.abs(b - a) / Math.max(1, Math.max(a, b));
    assert.ok(jump < 0.14, `bio/${modelKey}: close-end topology jump ${close[i - 1].value}% -> ${close[i].value}%: ${a} -> ${b}`);
  }

  // Exercise the real animation controls for every bioclimatic model, not only
  // the default one. The finished SVG must remain byte-identical after the
  // endpoint; a stale rAF/timeout used to cause the visible final "drop".
  const openButton = page.locator('#SoltecPremium [data-sp-louver="1"]');
  const closeButton = page.locator('#SoltecPremium [data-sp-louver="0"]');
  await openButton.click();
  await page.waitForTimeout(2350);
  await closeButton.click();
  await page.waitForTimeout(2350);
  const endpointA = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);
  await page.waitForTimeout(180);
  const endpointB = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);
  assert.equal(endpointB, endpointA, `bio/${modelKey}: SVG changed after louver closing finished`);

  await page.evaluate(() => {
    window.SP_TEST.setView(-0.62, -0.18);
    window.SP_TEST.redrawStage();
  });
  await page.locator('#SoltecPremium .sp-stage').screenshot({
    path: path.join(ARTIFACT_DIR, `bio-${modelKey.replace(/[^a-z0-9_-]+/gi, '_')}-closed.png`)
  });

  return { min, max, driftX, driftY };
}

(async () => {
  assertSharedRendererContract();
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {};

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.stack || error.message));
      await boot(page, route);

      let keys = await modelKeys(page);
      // Soltec routes are multi-model today. Keep a fallback for a future
      // single-model page so the regression still exercises its active scene.
      if (!keys.length) keys = ['__active__'];
      report[route] = { models: {} };

      for (const key of keys) {
        if (key !== '__active__') await activateModel(page, key);
        const label = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').getAttribute('aria-label') || '');
        const orbit = await orbitProfileCheck(page, route, key);
        const louver = route === 'bio' ? await bioclimaticCheck(page, key) : null;
        report[route].models[key] = { label, orbit, louver };
      }

      assert.deepEqual(errors, [], `${route}: browser errors:\n${errors.join('\n')}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, routes: Object.fromEntries(Object.entries(report).map(([route, data]) => [route, Object.keys(data.models)])) }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
