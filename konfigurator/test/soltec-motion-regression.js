'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'konfigurator', 'soltec-premium.js');
const URL = process.env.SOLTEC_URL || 'http://127.0.0.1:8901/konfigurator/?page=bio';
const ARTIFACT_DIR = path.join(ROOT, 'qa-artifacts', 'soltec-motion');

function assertSourceContract() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');

  assert.match(source, /const fullHalf = bladeW \/ 2;/, 'Soltec louvers must keep a rigid full-width profile while rotating');
  assert.match(source, /const renderLouverT = Math\.max\(0\.003, state\.louverT\);/, 'Closed Soltec louvers must avoid the exact coplanar BSP singularity');
  assert.match(source, /const cancelStageQueue = \(\) =>/, 'Soltec moving interactions must be able to cancel stale queued stage frames');
  assert.match(source, /if \(moverTimer\) \{ window\.clearTimeout\(moverTimer\); moverTimer = 0; \}/, 'Changing louver interaction mode must clear the stale mover fallback timer');
  assert.match(source, /const layO = Object\.assign\(\{\}, lay, obrys, \{ fit: false \}\);/, 'Moving Soltec louvers must not change stage fitting');
  assert.match(source, /const topO = Object\.assign\(\{\}, layO, \{ cull: true, normal: \[-bladeUz, 0, bladeUx\] \}\);/, 'Only the broad louver top face is culled');
  assert.match(source, /const underO = Object\.assign\(\{\}, layO, \{ cull: true, normal: \[bladeUz, 0, -bladeUx\] \}\);/, 'Only the broad louver underside is culled');
  assert.match(source, /shade\(louv, -0\.48\), layO\);/, 'The louver edge thickness must remain double-sided and visible');
  assert.match(source, /let stagePending = 0, stageTimer = 0, stageRaf = 0;/, 'Stage scheduling must own and cancel its pending animation frame');
  assert.match(source, /const flushStage = \(\) => \{ if \(stagePending\) paintStage\(\); \};/, 'Final pointer state must flush synchronously');
  assert.doesNotMatch(source, /moverTimer = window\.setTimeout\(step, 90\);/, 'Mover fallback must not race a queued animation frame');
  assert.match(source, /normal: \[bladeUz, 0, -bladeUx\]/, 'Louver-mounted LEDs must follow the rotating underside normal');
  assert.match(source, /raw: true, bias: bias, fit: false/, 'Louver-mounted LED geometry must not change stage fitting');
  assert.match(source, /if \(\(H \/ 2 \+ se \* DIST\) > 0\)/, 'Ground visibility must use actual camera height');
  assert.doesNotMatch(source, /if \(se > 0\.01\)/, 'Ground must not pop at an arbitrary camera elevation threshold');
  assert.match(source, /const overlap = Math\.max\(0, bladeW - Math\.min\(bladeW, pitch\)\);/, 'Soltec louvers must model the fixed sealing underlap without changing blade width');
  assert.doesNotMatch(source, /const najviac = \(pitch \/ 2\)/, 'Angle-dependent louver width deformation must be removed');
  assert.match(source, /sortBias: model\(\)\.kvGeom \? 0 :/, 'Painter bias must be Soltec-only');
  assert.match(source, /const BSP_MAX = model\(\)\.kvGeom \? 320 : 28;/, 'Soltec BSP must keep its bounded interactive-depth path');
  assert.match(source, /const BSP_LEAF = model\(\)\.kvGeom \? 0 : 18;/, 'Soltec BSP must stop subdividing already-small local face sets');
  assert.match(source, /if \(model\(\)\.kvGeom\) scheduleRender\(\);\s*else scheduleStage\(\);/, 'Soltec camera drag must use the stage-only render path');
  assert.match(source, /window\.SP_TEST\.redrawStage = \(\) => \{ if \(!model\(\)\.kvGeom\) drawStage\(\); else renderAll\(\); \};/, 'Soltec test hook must exercise the stage-only renderer');

  // Koverta must keep generating physical roof components at every camera
  // elevation. BSP resolves visibility; camera thresholds must not delete the
  // geometry and cause a pop when the view crosses the roof plane.
  assert.match(source, /const nadStrechou = \(H \/ 2 \+ se \* DIST\) >= H \+ beam;/, 'Koverta camera occlusion guard was unexpectedly changed');
  assert.match(source, /const podStrechu = true;/, 'Koverta under-roof components must remain camera-independent');
  assert.match(source, /cProfil\('x', os - VAZ_W, VAZ_W \* 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true\);/, 'Koverta purlins must be generated at every camera elevation');
  assert.doesNotMatch(source, /if \(!nadStrechou\)[\s\S]{0,160}cProfil\('x', os - VAZ_W/, 'Koverta purlins must not be hidden by a camera-elevation threshold');
  assert.doesNotMatch(source, /paintLast/, 'Painter-order overrides must not return');
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

(async () => {
  assertSourceContract();
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const cfg = page.locator('#SoltecPremium [data-sp-cfg]');
  await cfg.scrollIntoViewIfNeeded();
  await cfg.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'mouse', clientX: 20, clientY: 20 });
  await page.waitForFunction(() => window.SP_TEST && window.SP_TEST.redrawStage && document.querySelector('#SoltecPremium [data-sp-canvas] polygon'), null, { timeout: 20_000 });

  const pageKind = await page.evaluate(() => window.SP_TEST.snapshot().page);
  assert.equal(pageKind, 'bio', 'Motion regression must run on the Soltec bioclimatic pergola, not Koverta');

  // The frame/posts are static while the blades rotate. Projecting the same
  // world point must therefore stay pixel-identical through the full louver
  // travel; any drift means moving blade bounds are zooming/recentering the
  // whole stage, which is the visible "waving/settling" regression.
  const framingSamples = [];
  for (const value of [0, 10, 25, 40, 55, 70, 85, 100]) {
    const anchor = await page.evaluate((nextValue) => {
      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');
      if (!range) throw new Error('Louver range not found for framing regression');
      range.value = String(nextValue);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(window.SP_TEST.project(0, 0, 0));
      })));
    }, value);
    framingSamples.push({ value, x: anchor.x, y: anchor.y });
  }
  const frameXs = framingSamples.map((item) => item.x);
  const frameYs = framingSamples.map((item) => item.y);
  const frameDriftX = Math.max(...frameXs) - Math.min(...frameXs);
  const frameDriftY = Math.max(...frameYs) - Math.min(...frameYs);
  assert.ok(frameDriftX < 0.12 && frameDriftY < 0.12,
    `Soltec stage framing moves with the louvers: dx=${frameDriftX.toFixed(3)} dy=${frameDriftY.toFixed(3)}`);

  // Sweep directly through the low-elevation region. The test uses only the
  // stage renderer so it measures geometry/render behavior rather than rebuilding UI.
  const cameraCounts = [];
  for (let i = 0; i <= 24; i += 1) {
    const el = -0.04 + i * 0.01;
    const count = await page.evaluate(([az, elevation]) => {
      window.SP_TEST.setView(az, elevation);
      window.SP_TEST.redrawStage();
      return document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length;
    }, [-0.62, el]);
    cameraCounts.push({ el, count });
  }
  for (let i = 1; i < cameraCounts.length; i += 1) {
    const a = cameraCounts[i - 1].count;
    const b = cameraCounts[i].count;
    const relativeJump = Math.abs(b - a) / Math.max(1, Math.max(a, b));
    assert.ok(relativeJump < 0.22, `Abrupt Soltec face-count jump at elevation ${cameraCounts[i].el.toFixed(2)}: ${a} -> ${b}`);
  }

  // A camera drag must not rebuild option/add-on DOM.
  await page.evaluate(() => {
    const host = document.querySelector('#SoltecPremium [data-sp-addons]');
    window.__soltecAddonMutations = 0;
    if (!host) return;
    window.__soltecAddonObserver = new MutationObserver((records) => {
      window.__soltecAddonMutations += records.filter((record) => record.type === 'childList').length;
    });
    window.__soltecAddonObserver.observe(host, { childList: true, subtree: true });
  });

  const stage = page.locator('#SoltecPremium .sp-stage');
  const box = await stage.boundingBox();
  assert.ok(box, 'Soltec stage must be visible');

  await page.evaluate(() => {
    window.__soltecFrameTimes = [];
    window.__soltecFrameActive = true;
    let previous = performance.now();
    const tick = (now) => {
      if (!window.__soltecFrameActive) return;
      window.__soltecFrameTimes.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.mouse.move(box.x + box.width * 0.36, box.y + box.height * 0.55);
  await page.mouse.down();
  for (let i = 0; i < 54; i += 1) {
    const x = box.x + box.width * (0.30 + 0.40 * (i / 53));
    const y = box.y + box.height * (0.48 + 0.13 * Math.sin(i / 5));
    await page.mouse.move(x, y);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const releaseAnchor = await page.evaluate(() => window.SP_TEST.project(0, 0, 0));
  await page.waitForTimeout(120);
  const settledAnchor = await page.evaluate(() => window.SP_TEST.project(0, 0, 0));
  const releaseSettle = Math.hypot(settledAnchor.x - releaseAnchor.x, settledAnchor.y - releaseAnchor.y);
  assert.ok(releaseSettle < 0.05, `Soltec stage moved after pointer release: ${releaseSettle.toFixed(3)} px`);

  const motionMetrics = await page.evaluate(() => {
    window.__soltecFrameActive = false;
    if (window.__soltecAddonObserver) window.__soltecAddonObserver.disconnect();
    return {
      frameTimes: window.__soltecFrameTimes || [],
      addonMutations: window.__soltecAddonMutations || 0
    };
  });

  assert.equal(motionMetrics.addonMutations, 0, 'Camera drag rebuilt Soltec controls instead of redrawing only the stage');
  const measuredFrames = motionMetrics.frameTimes.filter((value) => value > 0 && value < 1000);
  assert.ok(measuredFrames.length >= 10, 'Not enough animation frames were measured');
  const p95 = percentile(measuredFrames, 0.95);
  const maxFrame = Math.max(...measuredFrames);
  // CI is intentionally given headroom; this catches pathological stalls, not runner noise.
  assert.ok(p95 < 80, `Soltec camera p95 frame interval is too high: ${p95.toFixed(1)} ms`);
  assert.ok(maxFrame < 180, `Soltec camera had a severe frame stall: ${maxFrame.toFixed(1)} ms`);

  // Exercise the actual louver slider through the full travel. A rigid blade
  // may expose a fixed sealing face, but the scene must never collapse/explode.
  const louverCounts = [];
  for (let value = 0; value <= 100; value += 5) {
    const count = await page.evaluate((nextValue) => {
      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');
      if (!range) throw new Error('Louver range not found');
      range.value = String(nextValue);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length);
      })));
    }, value);
    louverCounts.push({ value, count });
  }
  const minLouver = Math.min(...louverCounts.map((item) => item.count));
  const maxLouver = Math.max(...louverCounts.map((item) => item.count));
  assert.ok(minLouver > 0, 'Soltec scene disappeared during louver travel');
  assert.ok(maxLouver / minLouver < 1.45, `Soltec polygon count is unstable during louver travel: ${minLouver}..${maxLouver}`);

  // Closing is the numerically hardest region because neighbouring blades
  // approach parallel/coplanar planes. Inspect it at 1-3% increments rather
  // than letting the ordinary 5% sweep skip over the problematic endpoint.
  const closeCounts = [];
  for (const value of [15, 12, 10, 8, 6, 4, 3, 2, 1, 0]) {
    const count = await page.evaluate((nextValue) => {
      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');
      range.value = String(nextValue);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() =>
        resolve(document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length))));
    }, value);
    closeCounts.push({ value, count });
  }
  for (let i = 1; i < closeCounts.length; i += 1) {
    const a = closeCounts[i - 1].count, b = closeCounts[i].count;
    const jump = Math.abs(b - a) / Math.max(1, Math.max(a, b));
    assert.ok(jump < 0.12, `Soltec close-end topology jumps at ${closeCounts[i].value}%: ${a} -> ${b}`);
  }

  // Run the real close button, then make sure no stale timer or queued stage
  // frame changes the finished SVG after the endpoint has been reached.
  const openButton = page.locator('#SoltecPremium [data-sp-louver="1"]');
  const closeButton = page.locator('#SoltecPremium [data-sp-louver="0"]');
  await openButton.click();
  await page.waitForTimeout(2350);
  await closeButton.click();
  await page.waitForTimeout(2350);
  const endpointA = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);
  await page.waitForTimeout(180);
  const endpointB = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);
  assert.equal(endpointB, endpointA, 'Soltec SVG changed after the closing animation had already finished');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'soltec-motion-final.png'), fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, releaseSettle, p95, maxFrame }, null, 2));

  assert.deepEqual(pageErrors, [], `Browser errors:\n${pageErrors.join('\n')}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, p95, maxFrame, cameraCounts, louverCounts }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
