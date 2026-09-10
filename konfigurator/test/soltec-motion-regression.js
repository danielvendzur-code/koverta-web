'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(ROOT, 'konfigurator', 'soltec-premium.js');
const URL = process.env.SOLTEC_URL || 'http://127.0.0.1:8901/bioklimaticke-pergoly/';
const ARTIFACT_DIR = path.join(ROOT, 'qa-artifacts', 'soltec-motion');

function assertSourceContract() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');

  assert.match(source, /const fullHalf = bladeW \/ 2;/, 'Soltec louvers must keep a rigid full-width profile while rotating');
  assert.match(source, /const overlap = Math\.max\(0, bladeW - Math\.min\(bladeW, pitch\)\);/, 'Soltec louvers must model the fixed sealing underlap without changing blade width');
  assert.doesNotMatch(source, /const najviac = \(pitch \/ 2\)/, 'Angle-dependent louver width deformation must be removed');
  assert.match(source, /sortBias: model\(\)\.kvGeom \? 0 :/, 'Painter bias must be Soltec-only');
  assert.match(source, /if \(model\(\)\.kvGeom\) scheduleRender\(\);\s*else scheduleStage\(\);/, 'Soltec camera drag must use the stage-only render path');
  assert.match(source, /window\.SP_TEST\.redrawStage = \(\) => \{ if \(!model\(\)\.kvGeom\) drawStage\(\); else renderAll\(\); \};/, 'Soltec test hook must exercise the stage-only renderer');

  // Koverta must keep generating physical roof components at every camera
  // elevation. BSP resolves visibility; camera thresholds must not delete the
  // geometry and cause a pop when the view crosses the roof plane.
  assert.match(source, /const nadStrechou = \(H \/ 2 \+ se \* DIST\) >= H \+ beam;/, 'Koverta camera occlusion guard was unexpectedly changed');
  assert.match(source, /const podStrechu = true;/, 'Koverta under-roof components must remain camera-independent');
  assert.match(source, /vaznice\.forEach\(\(os\) => \{[\s\S]*?cProfil\('x', os - VAZ_W,[\s\S]*?\);/, 'Koverta purlins must be generated at every camera elevation');
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
  await page.waitForTimeout(120);

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

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'soltec-motion-final.png'), fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, p95, maxFrame }, null, 2));

  assert.deepEqual(pageErrors, [], `Browser errors:\n${pageErrors.join('\n')}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, p95, maxFrame, cameraCounts, louverCounts }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
