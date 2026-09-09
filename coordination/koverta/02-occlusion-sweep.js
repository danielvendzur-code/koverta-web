'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext } = require('../../konfigurator/test/browser-qa');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const SILHOUETTE_JUMP_LIMIT = 0.22;
const POLYGON_JUMP_LIMIT = 0.45;
const ROTATION_STEPS = 24;
const ELEVATIONS = [-0.16, 0.10, 0.42, 0.80, 1.12];
const CRITICAL_VIEWS = [
  { name: 'front', az: 0.82, el: 0.22 },
  { name: 'side', az: 0.05, el: 0.10 },
  { name: 'corner', az: -0.70, el: 0.34 },
  { name: 'top', az: 0.82, el: 1.12 },
  { name: 'under', az: 0.82, el: -0.16 }
];

function loadSupportedDimensions() {
  const source = fs.readFileSync(path.join(ROOT, 'konfigurator', 'cfg-pages.js'), 'utf8');
  const assignment = /^window\.KV_PAGES\s*=\s*(\{.*\});?\s*$/m.exec(source);
  if (!assignment) throw new Error('Missing JSON template assignment in cfg-pages.js');

  const pages = JSON.parse(assignment[1]);
  const match = /data-sp-bio-data>([\s\S]*?)<\/script>/.exec(pages.koverta);
  if (!match) throw new Error('Missing Koverta runtime data');
  const bio = JSON.parse(match[1].replace(/<\\\//g, '</'));
  const model = bio.models && bio.models.K;
  if (!model || !Array.isArray(model.widths) || !Array.isArray(model.lengths)) {
    throw new Error('Koverta supported dimensions are unavailable');
  }
  return {
    widths: model.widths.map(Number),
    lengths: model.lengths.map(Number)
  };
}

async function setDimensions(page, width, length) {
  const actual = await page.evaluate(async ({ width, length }) => {
    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing dimension control: ' + selector);
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('[data-sp-w]', width);
    set('[data-sp-l]', length);
    await new Promise(resolve => setTimeout(resolve, 100));
    return window.SP_TEST.snapshot();
  }, { width, length });

  if (actual.width !== width || actual.length !== length) {
    throw new Error(
      'Runtime dimensions differ from requested dimensions: requested ' +
      width + 'x' + length + ', got ' + actual.width + 'x' + actual.length
    );
  }
  return actual;
}

async function setFrameColor(page, ral) {
  const buttons = page.locator('[data-sp-frame-color]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const title = (await button.getAttribute('title')) || '';
    if (title.includes(ral)) {
      await button.click();
      await page.waitForTimeout(80);
      const snapshot = await page.evaluate(() => window.SP_TEST.snapshot());
      if (snapshot.frameColor !== ral) {
        throw new Error('Frame colour did not update to ' + ral + ': ' + snapshot.frameColor);
      }
      return;
    }
  }
  throw new Error('Frame colour control not found for ' + ral);
}

async function renderMetrics(page, az, el) {
  return page.evaluate(async ({ az, el }) => {
    const svg = document.querySelector('[data-sp-canvas]');
    if (!svg) throw new Error('Missing Koverta SVG canvas');

    window.SP_TEST.setView(az, el);
    window.SP_TEST.redraw();
    await new Promise(resolve => setTimeout(resolve, 10));

    const polygons = Array.from(svg.querySelectorAll('polygon'));
    let invalidPolygons = 0;
    for (const polygon of polygons) {
      const points = (polygon.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean);
      if (points.length < 3 || points.some(point => {
        const pair = point.split(',').map(Number);
        return pair.length !== 2 || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1]);
      })) invalidPolygons += 1;
    }

    const xml = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    });

    const viewBox = svg.getAttribute('viewBox').split(' ').map(Number);
    const width = Math.max(1, Math.round(viewBox[2] * 0.5));
    const height = Math.max(1, Math.round(viewBox[3] * 0.5));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let silhouetteArea = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 40) silhouetteArea += 1;
    }

    return {
      silhouetteArea,
      polygonCount: polygons.length,
      invalidPolygons,
      svg: xml
    };
  }, { az, el });
}

async function checkDeterministicRedraw(page) {
  return page.evaluate(async () => {
    const svg = document.querySelector('[data-sp-canvas]');
    window.SP_TEST.setView(0.82, 0.22);
    window.SP_TEST.redraw();
    await new Promise(resolve => setTimeout(resolve, 15));
    const first = new XMLSerializer().serializeToString(svg);
    window.SP_TEST.redraw();
    await new Promise(resolve => setTimeout(resolve, 15));
    const second = new XMLSerializer().serializeToString(svg);
    return first === second;
  });
}

(async () => {
  fs.mkdirSync(path.join(ROOT, 'qa-artifacts'), { recursive: true });

  const dimensions = loadSupportedDimensions();
  const configurations = dimensions.widths.flatMap(width =>
    dimensions.lengths.map(length => [width, length])
  );
  if (configurations.length !== 54) {
    throw new Error('Expected 54 supported Koverta dimension combinations, got ' + configurations.length);
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 750 },
    deviceScaleFactor: 1
  });
  await prepareContext(context);

  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push('console.error: ' + message.text());
  });

  const findings = [];
  let renderedViews = 0;

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    const consent = page.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await consent.count()) await consent.first().click();
    await page.waitForTimeout(2200);

    const hooksReady = await page.evaluate(() =>
      Boolean(window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.redraw && window.SP_TEST.snapshot)
    );
    if (!hooksReady) throw new Error('SP_TEST render hooks are unavailable');

    for (const [width, length] of configurations) {
      await setDimensions(page, width, length);

      if (!await checkDeterministicRedraw(page)) {
        findings.push({
          type: 'nondeterministic-redraw',
          width,
          length,
          az: 0.82,
          el: 0.22,
          symptom: 'Two redraws of the same camera state produced different SVG output',
          probableCause: 'Nondeterministic render ordering or state mutation'
        });
      }

      for (const elevation of ELEVATIONS) {
        let previous = null;
        let previousAz = null;
        for (let step = 0; step <= ROTATION_STEPS; step += 1) {
          const azimuth = -Math.PI + (step * Math.PI * 2) / ROTATION_STEPS;
          const metrics = await renderMetrics(page, azimuth, elevation);
          renderedViews += 1;

          if (metrics.invalidPolygons > 0) {
            findings.push({
              type: 'invalid-svg-polygon',
              width,
              length,
              az: azimuth,
              el: elevation,
              symptom: metrics.invalidPolygons + ' SVG polygon(s) contain invalid or incomplete points',
              probableCause: 'Degenerate BSP clipping output'
            });
          }

          if (metrics.silhouetteArea <= 0 || metrics.polygonCount <= 0) {
            findings.push({
              type: 'render-disappeared',
              width,
              length,
              az: azimuth,
              el: elevation,
              symptom: 'The Koverta render became empty',
              probableCause: 'Visibility/clipping/render-order failure'
            });
          }

          if (previous) {
            const silhouetteJump = Math.abs(metrics.silhouetteArea - previous.silhouetteArea) /
              Math.max(1, metrics.silhouetteArea, previous.silhouetteArea);
            if (silhouetteJump > SILHOUETTE_JUMP_LIMIT) {
              findings.push({
                type: 'silhouette-jump',
                width,
                length,
                azFrom: previousAz,
                az: azimuth,
                el: elevation,
                symptom: 'Silhouette area jumped by ' + Math.round(silhouetteJump * 100) + '% between adjacent rotation samples',
                probableCause: 'A visible component appeared/disappeared or BSP ordering changed discontinuously'
              });
            }

            const polygonJump = Math.abs(metrics.polygonCount - previous.polygonCount) /
              Math.max(1, metrics.polygonCount, previous.polygonCount);
            if (polygonJump > POLYGON_JUMP_LIMIT) {
              findings.push({
                type: 'polygon-count-jump',
                width,
                length,
                azFrom: previousAz,
                az: azimuth,
                el: elevation,
                symptom: 'Visible SVG polygon count jumped by ' + Math.round(polygonJump * 100) + '% between adjacent rotation samples',
                probableCause: 'Unexpected mass culling or clipping'
              });
            }
          }

          previous = metrics;
          previousAz = azimuth;
          if (findings.length >= 200) throw new Error('Occlusion sweep stopped after 200 findings');
        }
      }
    }

    const contrastCases = [
      [2500, 5200],
      [4000, 6000],
      [7000, 5200],
      [7000, 6000]
    ];
    for (const ral of ['RAL 9010', 'RAL 9005']) {
      await setFrameColor(page, ral);
      for (const [width, length] of contrastCases) {
        await setDimensions(page, width, length);
        for (const view of CRITICAL_VIEWS) {
          const metrics = await renderMetrics(page, view.az, view.el);
          renderedViews += 1;
          if (metrics.silhouetteArea <= 0 || metrics.polygonCount <= 0 || metrics.invalidPolygons > 0) {
            findings.push({
              type: 'contrast-render-failure',
              ral,
              width,
              length,
              view: view.name,
              az: view.az,
              el: view.el,
              symptom: 'Invalid or empty render in contrast-colour verification',
              probableCause: 'Colour-dependent render/visibility failure'
            });
          }
        }
      }
    }

    if (browserErrors.length) {
      findings.push({
        type: 'first-party-browser-error',
        symptom: browserErrors.join(' | '),
        probableCause: 'First-party runtime console.error/pageerror'
      });
    }

    if (findings.length) {
      const first = findings[0];
      if (Number.isFinite(first.width) && Number.isFinite(first.length)) {
        await setDimensions(page, first.width, first.length);
        if (first.ral) await setFrameColor(page, first.ral);
        const az = Number.isFinite(first.az) ? first.az : 0.82;
        const el = Number.isFinite(first.el) ? first.el : 0.22;
        await page.evaluate(({ az, el }) => {
          window.SP_TEST.setView(az, el);
          window.SP_TEST.redraw();
        }, { az, el });
        await page.waitForTimeout(60);
        await page.locator('[data-sp-canvas]').screenshot({
          path: path.join(ROOT, 'qa-artifacts', 'occlusion-sweep-first.png')
        });
      }
    }

    const result = {
      supportedWidths: dimensions.widths,
      supportedLengths: dimensions.lengths,
      configurations: configurations.length,
      rotationSteps: ROTATION_STEPS,
      elevations: ELEVATIONS,
      rotationViews: configurations.length * ELEVATIONS.length * (ROTATION_STEPS + 1),
      contrastViews: 2 * 4 * CRITICAL_VIEWS.length,
      renderedViews,
      firstPartyConsoleOrPageErrors: browserErrors,
      findings
    };
    fs.writeFileSync(
      path.join(ROOT, 'qa-artifacts', 'occlusion-sweep.json'),
      JSON.stringify(result, null, 2)
    );

    if (findings.length) {
      console.log('OCCLUSION_SWEEP_FAIL ' + findings.length + ' finding(s)');
      findings.slice(0, 30).forEach(finding => console.log(JSON.stringify(finding)));
    } else {
      console.log(
        'OCCLUSION_SWEEP_PASS ' + configurations.length +
        ' supported dimensions, ' + renderedViews +
        ' rendered views, RAL 9010/9005 contrast checks'
      );
    }
    console.log('FIRST_PARTY_CONSOLE_PAGEERROR ' + browserErrors.length);
  } finally {
    await browser.close();
  }

  process.exit(findings.length ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(2);
});
