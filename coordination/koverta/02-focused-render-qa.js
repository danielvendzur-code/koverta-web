'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext, setModelColors } = require('../../konfigurator/test/browser-qa');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const DIMENSIONS = [[4000, 6000], [7000, 5200], [7000, 6000]];
const FINE_AZ_STEPS = 72; // 5°
const FINE_ELEVATIONS = [-0.10, 0.12, 0.28, 0.50, 0.82];
const TRANSITION_AZIMUTHS = [-1.05, -0.35, 0.65, 1.35, 2.15];
const TRANSITION_OFFSETS = [-0.040, -0.020, -0.008, -0.002, 0.002, 0.008, 0.020, 0.040];
const NAMED_VIEWS = {
  front: [0.82, 0.22],
  side: [0.05, 0.10],
  corner: [-0.70, 0.34],
  top: [0.82, 1.12],
  under: [0.82, -0.16]
};

async function setDimensions(page, width, length) {
  const snapshot = await page.evaluate(async ({ width, length }) => {
    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing control ' + selector);
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('[data-sp-w]', width);
    set('[data-sp-l]', length);
    await new Promise(resolve => setTimeout(resolve, 100));
    return window.SP_TEST.snapshot();
  }, { width, length });
  if (snapshot.width !== width || snapshot.length !== length) {
    throw new Error('Dimension mismatch: ' + JSON.stringify(snapshot));
  }
  return snapshot;
}

async function setFrameColor(page, ral) {
  const updated = await page.evaluate(targetRal => {
    const button = Array.from(document.querySelectorAll('[data-sp-frame-color]'))
      .find(item => ((item.getAttribute('title') || '').includes(targetRal)));
    if (!button) return false;
    button.click();
    return true;
  }, ral);
  if (!updated) throw new Error('Missing frame colour ' + ral);
  await page.waitForTimeout(80);
  const snapshot = await page.evaluate(() => window.SP_TEST.snapshot());
  if (snapshot.frameColor !== ral) {
    throw new Error('Frame colour mismatch: expected ' + ral + ', got ' + snapshot.frameColor);
  }
}

async function renderProbe(page, az, el, sampleFascia) {
  return page.evaluate(async ({ az, el, sampleFascia }) => {
    const svg = document.querySelector('[data-sp-canvas]');
    if (!svg) throw new Error('Missing SVG canvas');
    window.SP_TEST.setView(az, el);
    window.SP_TEST.redraw();
    await new Promise(resolve => setTimeout(resolve, 18));

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

    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const canvas = document.createElement('canvas');
    canvas.width = vb[2];
    canvas.height = vb[3];
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, vb[2], vb[3]);
    const pixels = context.getImageData(0, 0, vb[2], vb[3]).data;
    let silhouetteArea = 0;
    let greenPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 40) silhouetteArea += 1;
      if (pixels[i + 1] > 150 && pixels[i] < 130 && pixels[i + 2] < 130) greenPixels += 1;
    }

    let fasciaBleed = 0;
    let fasciaSamples = 0;
    let firstBleed = null;
    if (sampleFascia) {
      const snapshot = window.SP_TEST.snapshot();
      const width = snapshot.width;
      const length = snapshot.length;
      const zTop = snapshot.height + snapshot.geometry.roof.lemH;
      const body = [];
      for (let t = 0.025; t <= 0.985; t += 0.075) {
        for (const d of [25, 70, 120, 165]) {
          body.push([d, t * width]);
          body.push([length - d, t * width]);
        }
        for (const d of [30, 70, 120, 165]) {
          body.push([t * length, d]);
          body.push([t * length, width - d]);
        }
      }

      for (const [x, y] of body) {
        const point = window.SP_TEST.project(x, y, zTop);
        const px = Math.round(point.x);
        const py = Math.round(point.y);
        if (px < 1 || py < 1 || px >= vb[2] - 1 || py >= vb[3] - 1) continue;
        fasciaSamples += 1;
        const offset = (py * vb[2] + px) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        if (g > 150 && r < 130 && b < 130) {
          fasciaBleed += 1;
          if (!firstBleed) {
            firstBleed = { world: [x, y, zTop], pixel: [px, py], rgb: [r, g, b, pixels[offset + 3]] };
          }
        }
      }
    }

    return {
      polygonCount: polygons.length,
      invalidPolygons,
      silhouetteArea,
      greenPixels,
      fasciaBleed,
      fasciaSamples,
      firstBleed
    };
  }, { az, el, sampleFascia });
}

async function saveCanvas(page, filename) {
  await page.locator('[data-sp-canvas]').screenshot({
    path: path.join(ROOT, 'qa-artifacts', filename)
  });
}

async function runMobileFullscreen(browser, findings, browserErrors) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  await prepareContext(context);
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push('mobile pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push('mobile console.error: ' + message.text());
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  const consent = page.getByRole('button', { name: 'Iba nevyhnutné' });
  if (await consent.count()) await consent.first().click();
  await page.waitForTimeout(2200);

  for (const ral of ['RAL 9010', 'RAL 9005']) {
    await setFrameColor(page, ral);
    for (const [width, length] of [[7000, 5200], [7000, 6000]]) {
      await setDimensions(page, width, length);

      for (const [viewName, values] of Object.entries(NAMED_VIEWS)) {
        const probe = await renderProbe(page, values[0], values[1], false);
        if (probe.invalidPolygons || probe.silhouetteArea <= 0 || probe.polygonCount <= 0) {
          findings.push({
            type: 'mobile-render-invalid',
            ral,
            width,
            length,
            view: viewName,
            probe
          });
        }
      }

      const open = page.locator('[data-sp-cfg-open]');
      if (!await open.count()) {
        findings.push({ type: 'mobile-fullscreen-control-missing', ral, width, length });
        continue;
      }
      await open.first().click();
      await page.waitForTimeout(100);
      const fullscreenMetrics = await page.evaluate(() => {
        const root = document.querySelector('.sp-cfg');
        const canvas = document.querySelector('[data-sp-canvas]');
        const stage = canvas && canvas.getBoundingClientRect();
        return {
          isFull: Boolean(root && root.classList.contains('is-full')),
          viewport: [window.innerWidth, window.innerHeight],
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          canvas: stage ? {
            width: stage.width,
            height: stage.height,
            left: stage.left,
            right: stage.right,
            top: stage.top,
            bottom: stage.bottom
          } : null
        };
      });
      if (!fullscreenMetrics.isFull ||
          !fullscreenMetrics.canvas ||
          fullscreenMetrics.canvas.width < 250 ||
          fullscreenMetrics.canvas.height < 250 ||
          fullscreenMetrics.overflowX > 2) {
        findings.push({
          type: 'mobile-fullscreen-layout',
          ral,
          width,
          length,
          metrics: fullscreenMetrics
        });
      }

      const screenshotRal = ral.replace('RAL ', '');
      await renderProbe(page, NAMED_VIEWS.under[0], NAMED_VIEWS.under[1], false);
      if (width === 7000 && length === 6000) {
        await saveCanvas(page, 'mobile-full-7000x6000-' + screenshotRal + '-under.png');
      }

      const close = page.locator('[data-sp-cfg-close]');
      if (await close.count()) {
        await close.first().click();
        await page.waitForTimeout(80);
      }
    }
  }

  await context.close();
}

(async () => {
  fs.mkdirSync(path.join(ROOT, 'qa-artifacts'), { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1
  });
  await prepareContext(context);
  await setModelColors(context, {
    trapezTopHex: '#00ff00',
    trapezSoffitHex: '#ff00ff'
  });

  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push('desktop pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push('desktop console.error: ' + message.text());
  });

  const findings = [];
  const fineSweep = [];
  const transitions = [];

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    const consent = page.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await consent.count()) await consent.first().click();
    await page.waitForTimeout(2200);

    const ready = await page.evaluate(() =>
      Boolean(window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.redraw &&
        window.SP_TEST.project && window.SP_TEST.snapshot)
    );
    if (!ready) throw new Error('SP_TEST hooks unavailable');

    const positive = await renderProbe(page, 0.82, 1.12, false);
    if (positive.greenPixels < 100) {
      throw new Error('Focused fascia QA positive control failed: contrasting roof is missing');
    }

    for (const [width, length] of DIMENSIONS) {
      const snapshot = await setDimensions(page, width, length);

      for (const elevation of FINE_ELEVATIONS) {
        for (let step = 0; step < FINE_AZ_STEPS; step += 1) {
          const az = -Math.PI + step * Math.PI * 2 / FINE_AZ_STEPS;
          const probe = await renderProbe(page, az, elevation, true);
          fineSweep.push({
            width,
            length,
            az,
            elevation,
            fasciaBleed: probe.fasciaBleed,
            fasciaSamples: probe.fasciaSamples,
            invalidPolygons: probe.invalidPolygons
          });
          if (probe.invalidPolygons || probe.fasciaBleed) {
            findings.push({
              type: probe.invalidPolygons ? 'fine-invalid-polygon' : 'fine-fascia-bleed',
              width,
              length,
              az,
              elevation,
              probe
            });
          }
        }
      }

      const beam = await page.evaluate(() => {
        const script = document.querySelector('[data-sp-bio-data]');
        if (!script) throw new Error('Missing runtime model data');
        const data = JSON.parse(script.textContent || '{}');
        const snap = window.SP_TEST.snapshot();
        const active = data.models && data.models[snap.model];
        const value = Number(active && active.beam);
        if (!Number.isFinite(value)) throw new Error('Missing active model beam');
        return value;
      });
      const distance = Math.max(length, width, snapshot.height) * 2.9;
      const ratio = Math.max(-1, Math.min(1, (snapshot.height / 2 + beam) / distance));
      const threshold = Math.asin(ratio);

      for (const az of TRANSITION_AZIMUTHS) {
        let previous = null;
        const samples = [];
        for (const offset of TRANSITION_OFFSETS) {
          const elevation = threshold + offset;
          const probe = await renderProbe(page, az, elevation, true);
          samples.push({ offset, elevation, ...probe });

          if (probe.invalidPolygons || probe.fasciaBleed) {
            findings.push({
              type: probe.invalidPolygons ? 'transition-invalid-polygon' : 'transition-fascia-bleed',
              width,
              length,
              az,
              threshold,
              offset,
              probe
            });
          }

          if (previous) {
            const jump = Math.abs(probe.silhouetteArea - previous.silhouetteArea) /
              Math.max(1, probe.silhouetteArea, previous.silhouetteArea);
            if (jump > 0.22) {
              findings.push({
                type: 'transition-silhouette-jump',
                width,
                length,
                az,
                threshold,
                fromOffset: previous.offset,
                toOffset: offset,
                jump
              });
            }
          }
          previous = { offset, ...probe };
        }
        transitions.push({ width, length, az, threshold, samples });
      }
    }

    const transitionEvidence = transitions.filter(item =>
      item.width === 7000 && item.length === 6000
    ).slice(0, 2);
    for (let i = 0; i < transitionEvidence.length; i += 1) {
      const item = transitionEvidence[i];
      for (const [name, offset] of [['below', -0.002], ['above', 0.002]]) {
        await setDimensions(page, item.width, item.length);
        await renderProbe(page, item.az, item.threshold + offset, true);
        await saveCanvas(
          page,
          'transition-7000x6000-' + i + '-' + name + '.png'
        );
      }
    }

    await runMobileFullscreen(browser, findings, browserErrors);

    if (browserErrors.length) {
      findings.push({
        type: 'first-party-browser-error',
        errors: browserErrors
      });
    }

    const result = {
      dimensions: DIMENSIONS,
      fineAzimuthSteps: FINE_AZ_STEPS,
      fineElevations: FINE_ELEVATIONS,
      transitionOffsets: TRANSITION_OFFSETS,
      fineSweep,
      transitions,
      firstPartyConsoleOrPageErrors: browserErrors,
      findings
    };
    fs.writeFileSync(
      path.join(ROOT, 'qa-artifacts', 'focused-render-qa.json'),
      JSON.stringify(result, null, 2)
    );

    if (findings.length) {
      console.log('FOCUSED_RENDER_QA_FAIL ' + findings.length + ' finding(s)');
      findings.slice(0, 30).forEach(finding => console.log(JSON.stringify(finding)));
    } else {
      console.log(
        'FOCUSED_RENDER_QA_PASS fine fascia sweep, roof-plane transition continuity, mobile/fullscreen'
      );
    }
    console.log('FIRST_PARTY_CONSOLE_PAGEERROR ' + browserErrors.length);
  } finally {
    await context.close();
    await browser.close();
  }

  process.exit(findings.length ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(2);
});
