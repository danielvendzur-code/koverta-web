'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = require(PLAYWRIGHT);
const { prepareContext } = require('../../konfigurator/test/browser-qa');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = process.env.KV_URL || 'http://127.0.0.1:8901/konfigurator/?page=koverta';
const SHARD_INDEX = Number(process.env.KV_SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.KV_SHARD_TOTAL || 1);
const ROTATION_STEPS = 36; // 10° component-isolation sweep
const ALL_DIMENSIONS = [[4000, 6000], [6200, 6000], [7000, 5200], [7000, 6000]];
if (!Number.isInteger(SHARD_INDEX) || !Number.isInteger(SHARD_TOTAL) ||
    SHARD_TOTAL < 1 || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_TOTAL) {
  throw new Error('Invalid shard ' + SHARD_INDEX + '/' + SHARD_TOTAL);
}
const DIMENSIONS = ALL_DIMENSIONS.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);
const COMPONENTS = [
  { id: 'purlins', flag: '__QA_HIDE_PURLINS', elevations: [-0.16, 0.04] },
  { id: 'angles', flag: '__QA_HIDE_UHOLNIK', elevations: [-0.16, 0.04] },
  /* Skrutky sa pri zábere celej stavby zámerne nekreslia. `skrutkuj` má
     pravidlo čitateľnosti: `if (r * 2 < mmNaPixel * 10) return;` — hlava
     menšia než desať pixelov nie je šesťhran, ale bodka o inom jase, a tých
     bodiek sú na ráme a podhľade stovky. Na stojane vychádza mmNaPixel okolo
     8,6, hlava má polomer 8, takže 16 < 86 a skrutka nevznikne pri žiadnom
     katalógovom rozmere. Čaká sa teda nulový pokles plôch; keby pribudli,
     niekto to pravidlo odstránil. */
  { id: 'roof-screws', flag: '__QA_HIDE_ROOF_SCREWS', elevations: [-0.16, 0.04], ocakavanyPokles: 0 },
  { id: 'base-plates', flag: '__QA_HIDE_BASE_PLATES', elevations: [0.10, 0.42] },
  { id: 'head-plates', flag: '__QA_HIDE_HEAD_PLATES', elevations: [-0.16, 0.04] },
  { id: 'gutter-downpipe', flag: '__QA_HIDE_GUTTER', elevations: [-0.16, 0.10, 0.42] }
];

function patchRenderer(source) {
  const replacements = [
    [
      'if (BIO.basePlates) {',
      'if (BIO.basePlates && !window.__QA_HIDE_BASE_PLATES) {'
    ],
    [
      "if (BIO.headPlates) {",
      "if (BIO.headPlates && !window.__QA_HIDE_HEAD_PLATES) {"
    ],
    [
      'const uholnik = (px, sx, py, sy, zc) => {\n              if (!podStrechu) return;',
      'const uholnik = (px, sx, py, sy, zc) => {\n              if (window.__QA_HIDE_UHOLNIK) return;\n              if (!podStrechu) return;'
    ],
    [
      'const skrutka = (cx0, cy0, cz0, os, R, sgn) => {\n              if (!podStrechu) return;',
      'const skrutka = (cx0, cy0, cz0, os, R, sgn) => {\n              if (window.__QA_HIDE_ROOF_SCREWS) return;\n              if (!podStrechu) return;'
    ],
    [
      "cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);",
      "if (!window.__QA_HIDE_PURLINS)\n                cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);"
    ],
    [
      'if (maOdkvap()) {',
      'if (maOdkvap() && !window.__QA_HIDE_GUTTER) {'
    ]
  ];

  let patched = source;
  for (const [from, to] of replacements) {
    const count = patched.split(from).length - 1;
    if (count !== 1) {
      throw new Error('Expected exactly one renderer patch target, got ' + count + ': ' + from.slice(0, 80));
    }
    patched = patched.replace(from, to);
  }
  return patched;
}

async function setDimensions(page, width, length) {
  const snapshot = await page.evaluate(async ({ width, length }) => {
    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing dimension control ' + selector);
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('[data-sp-w]', width);
    set('[data-sp-l]', length);
    await new Promise(resolve => setTimeout(resolve, 100));
    return window.SP_TEST.snapshot();
  }, { width, length });
  if (snapshot.width !== width || snapshot.length !== length) {
    throw new Error('Dimension update mismatch: ' + JSON.stringify(snapshot));
  }
}

async function componentDiff(page, flag, az, el) {
  return page.evaluate(async ({ flag, az, el }) => {
    const svg = document.querySelector('[data-sp-canvas]');
    if (!svg) throw new Error('Missing SVG canvas');

    const raster = async hidden => {
      window[flag] = hidden;
      window.SP_TEST.setView(az, el);
      window.SP_TEST.redraw();
      await new Promise(resolve => setTimeout(resolve, 12));

      const xml = window.SP_TEST.exportSVG();
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      });

      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      // Sample at the canvas's own resolution. Halving it made this probe
      // blind to the smallest real hardware: a 16 mm screw head on a 7 m
      // assembly covers ~1.3 px at full raster and ~0.65 px at half, so it
      // dissolved into antialiasing and reported as "not emitted" even though
      // the geometry was present and unoccluded. Full resolution only removes
      // that measurement artefact — a component that is genuinely missing
      // still produces a zero diff and still fails.
      const width = Math.max(1, Math.round(vb[2]));
      const height = Math.max(1, Math.round(vb[3]));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };

    const visible = await raster(false);
    const hidden = await raster(true);
    window[flag] = false;
    window.SP_TEST.redraw();

    let diffPixels = 0;
    let diffEnergy = 0;
    for (let i = 0; i < visible.length; i += 4) {
      const delta =
        Math.abs(visible[i] - hidden[i]) +
        Math.abs(visible[i + 1] - hidden[i + 1]) +
        Math.abs(visible[i + 2] - hidden[i + 2]) +
        Math.abs(visible[i + 3] - hidden[i + 3]);
      if (delta > 24) diffPixels += 1;
      diffEnergy += delta;
    }
    return { diffPixels, diffEnergy };
  }, { flag, az, el });
}

/* Koľko plôch model vydá s dielom a bez neho.

   Toto je jediná otázka, na ktorú sa dá odpovedať bez ohľadu na kameru:
   buď sa diel emituje, alebo nie. Rastrový rozdiel odpovedá na inú otázku —
   či je diel z daného uhla vidieť — a tú si nemožno vykladať ako tú prvú.
   `faceCount` zapisuje vykresľovač po každom prekreslení. */
async function componentFaceDrop(page, flag) {
  return page.evaluate(async ({ flag }) => {
    const canvas = document.querySelector('[data-sp-canvas]');
    const count = async hidden => {
      window[flag] = hidden;
      window.SP_TEST.redraw();
      await new Promise(resolve => setTimeout(resolve, 60));
      return Number(canvas.dataset.faceCount);
    };
    const visible = await count(false);
    const hidden = await count(true);
    window[flag] = false;
    window.SP_TEST.redraw();
    return { facesVisible: visible, facesHidden: hidden, faceDrop: visible - hidden };
  }, { flag });
}

async function saveBaselineScreenshot(page, width, length, component, elevation, az, suffix) {
  await setDimensions(page, width, length);
  await page.evaluate(({ flag, az, el }) => {
    window[flag] = false;
    window.SP_TEST.setView(az, el);
    window.SP_TEST.redraw();
  }, { flag: component.flag, az, el: elevation });
  await page.waitForTimeout(40);
  const elText = String(elevation).replace('-', 'm').replace('.', 'p');
  const azText = String(Math.round((az * 180 / Math.PI) * 10) / 10).replace('-', 'm').replace('.', 'p');
  await page.locator('[data-sp-canvas]').screenshot({
    path: path.join(
      ROOT,
      'qa-artifacts',
      'component-' + component.id + '-' + width + 'x' + length +
        '-el' + elText + '-az' + azText + '-' + suffix + '.png'
    )
  });
}

(async () => {
  fs.mkdirSync(path.join(ROOT, 'qa-artifacts'), { recursive: true });

  const rendererPath = path.join(ROOT, 'konfigurator', 'soltec-premium.js');
  const patchedRenderer = patchRenderer(fs.readFileSync(rendererPath, 'utf8'));

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 750 },
    deviceScaleFactor: 1
  });
  await prepareContext(context);
  await context.route(/\/soltec-premium\.js(?:\?|$)/, route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: patchedRenderer
  }));

  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push('console.error: ' + message.text());
  });

  const sweeps = [];
  const findings = [];
  const diagnostics = [];

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    const consent = page.getByRole('button', { name: 'Iba nevyhnutné' });
    if (await consent.count()) await consent.first().click();
    await page.waitForTimeout(2200);

    const ready = await page.evaluate(() =>
      Boolean(window.SP_TEST && window.SP_TEST.setView && window.SP_TEST.redraw && window.SP_TEST.snapshot)
    );
    if (!ready) throw new Error('SP_TEST hooks unavailable');

    for (const [width, length] of DIMENSIONS) {
      await setDimensions(page, width, length);

      for (const component of COMPONENTS) {
        const emission = await componentFaceDrop(page, component.flag);
        for (const elevation of component.elevations) {
          const samples = [];
          for (let step = 0; step < ROTATION_STEPS; step += 1) {
            const az = -Math.PI + (step * Math.PI * 2) / ROTATION_STEPS;
            const metrics = await componentDiff(page, component.flag, az, elevation);
            samples.push({ az, ...metrics });
          }

          const maxDiffPixels = Math.max(...samples.map(sample => sample.diffPixels));
          const maxDiffEnergy = Math.max(...samples.map(sample => sample.diffEnergy));
          const visibleAngles = samples.filter(sample => sample.diffPixels > 2).length;
          const isolatedDrops = [];

          for (let i = 0; i < samples.length; i += 1) {
            const previous = samples[(i + samples.length - 1) % samples.length];
            const current = samples[i];
            const next = samples[(i + 1) % samples.length];
            const flank = Math.min(previous.diffPixels, next.diffPixels);
            if (flank > Math.max(8, maxDiffPixels * 0.25) &&
                current.diffPixels < Math.max(2, flank * 0.10)) {
              isolatedDrops.push({
                index: i,
                az: current.az,
                previous: previous.diffPixels,
                current: current.diffPixels,
                next: next.diffPixels
              });
            }
          }

          const sweep = {
            component: component.id,
            width,
            length,
            elevation,
            maxDiffPixels,
            maxDiffEnergy,
            visibleAngles,
            isolatedDrops,
            samples,
            ...emission
          };
          sweeps.push(sweep);

          /* Pôvodne tu bola jediná podmienka na rastrový rozdiel a hlásila
             „component-not-visible" s poznámkou, že diel buď nie je emitovaný,
             alebo je orezaný, alebo je celkom skrytý. To sú tri rôzne veci a
             len prvá je chyba. Merané na Koverte 7000 × 5200: päť zo šiestich
             dielov znižuje počet plôch (odkvap o 1 234 z 2 404, uholníky o 288,
             väznice o 175, hlavové platne o 60, pätné o 36), a pritom majú cez
             všetkých 36 azimutov rastrový rozdiel presne nula. Sú v zostave,
             len ich zvnútra ani zvonku nevidno — a vykresľovač ich preto
             správne zahadzuje.

             Chyba je, keď sa počet plôch nezmení: vtedy diel z modelu nevypadol
             preto, že ho nevidno, ale preto, že sa vôbec nevydal. */
          if (component.ocakavanyPokles === 0) {
            if (emission.faceDrop !== 0) {
              findings.push({
                type: 'component-unexpectedly-emitted',
                component: component.id,
                width,
                length,
                elevation,
                faceDrop: emission.faceDrop,
                symptom: 'Component is drawn at stage framing although the legibility rule should suppress it',
                probableCause: 'The size threshold in skrutkuj() was removed or weakened'
              });
            }
          } else if (emission.faceDrop <= 0) {
            findings.push({
              type: 'component-not-emitted',
              component: component.id,
              width,
              length,
              elevation,
              facesVisible: emission.facesVisible,
              facesHidden: emission.facesHidden,
              symptom: 'Isolating the component left the emitted face count unchanged',
              probableCause: 'Component is not emitted at all for this model and size'
            });
          } else if (maxDiffPixels <= 2 || visibleAngles < 3) {
            diagnostics.push({
              type: 'component-enclosed',
              component: component.id,
              width,
              length,
              elevation,
              faceDrop: emission.faceDrop,
              maxDiffPixels,
              visibleAngles,
              symptom: 'Component is emitted but produces no raster footprint in this view band'
            });
          }

          isolatedDrops.forEach(drop => diagnostics.push({
            type: 'isolated-component-drop',
            component: component.id,
            width,
            length,
            elevation,
            ...drop
          }));
        }
      }
    }

    for (const diagnostic of diagnostics.slice(0, 6)) {
      const component = COMPONENTS.find(item => item.id === diagnostic.component);
      const step = Math.PI * 2 / ROTATION_STEPS;
      await saveBaselineScreenshot(
        page, diagnostic.width, diagnostic.length, component,
        diagnostic.elevation, diagnostic.az - step, 'before'
      );
      await saveBaselineScreenshot(
        page, diagnostic.width, diagnostic.length, component,
        diagnostic.elevation, diagnostic.az, 'at'
      );
      await saveBaselineScreenshot(
        page, diagnostic.width, diagnostic.length, component,
        diagnostic.elevation, diagnostic.az + step, 'after'
      );
    }

    if (browserErrors.length) {
      findings.push({
        type: 'first-party-browser-error',
        symptom: browserErrors.join(' | '),
        probableCause: 'First-party console.error/pageerror'
      });
    }

    const result = {
      shard: { index: SHARD_INDEX, total: SHARD_TOTAL },
      dimensions: DIMENSIONS,
      rotationSteps: ROTATION_STEPS,
      components: COMPONENTS.map(({ id, elevations }) => ({ id, elevations })),
      firstPartyConsoleOrPageErrors: browserErrors,
      sweeps,
      diagnostics,
      findings
    };
    fs.writeFileSync(
      path.join(ROOT, 'qa-artifacts', 'component-visibility.json'),
      JSON.stringify(result, null, 2)
    );

    if (findings.length) {
      console.log('COMPONENT_VISIBILITY_FAIL ' + findings.length + ' finding(s)');
      findings.forEach(finding => console.log(JSON.stringify(finding)));
    } else {
      console.log(
        'COMPONENT_VISIBILITY_PASS ' +
        sweeps.length + ' component/view sweeps across ' + DIMENSIONS.length + ' Koverta dimensions'
      );
    }
    console.log('COMPONENT_VISIBILITY_DIAGNOSTICS ' + diagnostics.length);
    console.log('FIRST_PARTY_CONSOLE_PAGEERROR ' + browserErrors.length);
  } finally {
    await browser.close();
  }

  process.exit(findings.length ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(2);
});
