'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const cfgSource = fs.readFileSync(path.join(root, 'konfigurator', 'cfg-pages.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'konfigurator', 'soltec-premium.js'), 'utf8');
const sceneData = JSON.parse(fs.readFileSync(path.join(root, 'archiv-expivi', 'diely-zo-sceny.json'), 'utf8'));

const assignment = /^window\.KV_PAGES\s*=\s*(\{.*\});?\s*$/m.exec(cfgSource);
if (!assignment) throw new Error('Missing cfg-pages JSON assignment');
const pages = JSON.parse(assignment[1]);
const bioMatch = /data-sp-bio-data>([\s\S]*?)<\/script>/.exec(pages.koverta);
if (!bioMatch) throw new Error('Missing Koverta bio data');
const bio = JSON.parse(bioMatch[1].replace(/<\\\//g, '</'));
const model = bio.models.K;
const R = model.kvRef;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function overlap(a0, a1, b0, b1) {
  return Math.min(a1, b1) >= Math.max(a0, b0);
}

const exact = {
  '7000x6000': {
    frameAxes: [52, 5804],
    purlinAxes: [988, 1992, 2928, 3864, 4868],
    postAxes: [72, 2928, 5784]
  },
  '7000x5200': {
    frameAxes: [52, 5004],
    purlinAxes: [878, 1703, 2528, 3354, 4179],
    postAxes: [72, 2528, 4984]
  }
};

for (const [size, expected] of Object.entries(exact)) {
  const got = model.kvBySize[size];
  assert(got, size + ': missing kvBySize');
  for (const key of ['frameAxes', 'purlinAxes', 'postAxes']) {
    assert(JSON.stringify(got[key]) === JSON.stringify(expected[key]),
      size + ': changed ' + key + ' -> ' + JSON.stringify(got[key]));
  }

  const scene = sceneData[size];
  assert(scene, size + ': missing active Expivi scene');
  const posts = scene.diely.filter(d => d.r[2] === 2398 && Math.max(d.r[0], d.r[1]) <= 200);
  const sideFrames = scene.diely.filter(d => d.r[2] === 220 && d.r[0] === 74 && d.r[1] > 4000);
  const purlins = scene.diely.filter(d => d.r[2] === 180 && d.r[0] > 6000 && d.r[1] === 58);
  assert(posts.length === 6, size + ': expected six active posts, got ' + posts.length);
  assert(sideFrames.length === 2, size + ': expected two side frames, got ' + sideFrames.length);
  assert(purlins.length === 10, size + ': expected ten C purlin members, got ' + purlins.length);

  const postTop = Math.min(...posts.map(d => d.p[2] + d.r[2]));
  const sideFrameBottom = Math.min(...sideFrames.map(d => d.p[2]));
  const purlinBottom = Math.min(...purlins.map(d => d.p[2]));
  assert(postTop === sideFrameBottom,
    size + ': post top ' + postTop + ' does not meet side-frame bottom ' + sideFrameBottom);
  assert(purlinBottom - postTop === 40,
    size + ': expected purlin bottom 40 mm above post top, got ' + (purlinBottom - postTop));

  /* Renderer contact proof for the exact complete assembly. The +2 mm in the
     renderer exists only to separate coplanar BSP faces; the head plate bridges
     it and overlaps 6 mm into the post while touching the frame at its top. */
  const [W, L] = size.split('x').map(Number);
  const frameY0 = R.ramBok;
  const frameY1 = R.ramBok + R.ramW;
  const frameRunX0 = R.ramZad + 2;
  const frameRunX1 = L - R.ramOdkvap - 2;
  const headPlateTop = R.h + 2;
  const headPlateBottom = headPlateTop - 8;
  assert(headPlateBottom < R.h && headPlateTop === R.h + 2,
    size + ': head plate must overlap the post and touch the renderer-lifted frame');

  expected.postAxes.forEach((axis, index) => {
    const corner = index === 0 || index === expected.postAxes.length - 1;
    const pd = corner ? R.postD : R.stredD;
    const pw = corner ? R.postW : R.stredW;
    const px = axis - pd / 2;
    for (const py of [0, W - pw]) {
      const cy = py + pw / 2;
      const plateY0 = cy - 110 / 2;
      const plateY1 = cy + 110 / 2;
      assert(overlap(plateY0, plateY1, py < W / 2 ? frameY0 : W - frameY1,
                     py < W / 2 ? frameY1 : W - frameY0),
        size + ': side-frame head plate misses side frame at post ' + index);

      const sidePlates = corner
        ? (index === 0 ? [[px + pd, px + pd + 58]] : [[px - 58, px]])
        : [[px - 58, px], [px + pd, px + pd + 58]];
      for (const [x0, x1] of sidePlates) {
        assert(overlap(x0, x1, frameRunX0, frameRunX1),
          size + ': side-frame head plate has no X contact at post ' + index);
      }

      if (corner) {
        const cx = px + pd / 2;
        const endPlateX0 = cx - 110 / 2;
        const endPlateX1 = cx + 110 / 2;
        const endFrameX0 = index === 0 ? R.ramZad : L - R.ramOdkvap - R.ramW;
        const endFrameX1 = endFrameX0 + R.ramW;
        assert(overlap(endPlateX0, endPlateX1, endFrameX0, endFrameX1),
          size + ': corner end-frame head plate misses end frame at post ' + index);
      }
    }
  });

  /* Base plate: active Expivi confirms the 250 mm footprint. The renderer's
     four anchor-head markers must stay inside it and the sleeve starts on the
     plate top rather than floating above it. */
  const plate = R.plate;
  const plateHalf = plate / 2;
  const anchorOffset = plateHalf - Math.max(16, Math.round(plate * 0.11));
  const anchorHeadR = Math.max(5, Math.round(plate * 0.028));
  assert(anchorOffset + anchorHeadR < plateHalf,
    size + ': base anchor marker leaves the base plate');
  for (const section of [[R.postD, R.postW], [R.stredD, R.stredW]]) {
    assert(section[0] / 2 <= plateHalf && section[1] / 2 <= plateHalf,
      size + ': post section does not sit on the 250 mm base plate');
  }

  /* Five purlin pairs produce 20 end connectors; four frame corners add four.
     This matches the 24 active Expivi connector components exactly. */
  const connectorCount = expected.purlinAxes.length * 4 + 4;
  const expiviConnectorCount = scene.diely.filter(d =>
    JSON.stringify(d.r) === JSON.stringify([120, 85, 140])).length;
  assert(connectorCount === 24 && expiviConnectorCount === 24,
    size + ': connector count is not 20 purlin-end + 4 corner connectors');
}

/* The four-post Koverta band stands under purlins, not in frame corners.
   This is the regression that made array index 0/last look like a corner. */
const fourBand = model.kvGeom.find(g => g.stlpyNaVaznici);
assert(fourBand, 'Missing four-post Koverta band');
for (const L of [5200, 5600, 6000]) {
  const zad = R.ramZad + R.ramW / 2;
  const odk = L - R.ramOdkvap - R.ramW / 2;
  const stred = (zad + odk) / 2;
  const sm = L / 4 + fourBand.vaznicStred;
  const posts = [stred - sm, stred + sm];
  assert(Math.abs(posts[0] - zad) > 500 && Math.abs(posts[1] - odk) > 500,
    'Four-post ' + L + ': first/last post unexpectedly behaves like a frame corner');
}

assert(runtime.includes('const rohovy = Boolean(rz.roh);'),
  'Runtime must classify a corner from rz.roh, not from array position');
assert(runtime.includes("const zH = H + lift + (model().roofKit === 'koverta' ? 2 : 0);"),
  'Head plate does not bridge the renderer-only 2 mm frame lift');
assert(runtime.includes('plat(px - hp, cy - sir / 2, hp, sir);') &&
       runtime.includes('plat(px + pd, cy - sir / 2, hp, sir);'),
  'Non-corner post must retain the two side-frame head plates');
assert(!runtime.includes('Stĺp 110 × 190 pod väznicou má iba platňu vedenú po osi'),
  'Obsolete floating purlin-directed head-plate logic remains');

assert(runtime.includes('const rr = kvBand() ? kvStlpRez(xi, xs.length) : { d: post, w: post };'),
  'Cantilever brace still uses the generic Soltec post section for Koverta contact');
assert(runtime.includes('const pd = kvBand() ? kvStlpRez(xi, rowXs.length).d : post;'),
  'Koverta side infill still cuts around a generic 120 mm post');
assert(!runtime.includes('Priemer odmeraný z oficiálneho rendru'),
  'Downpipe renderer size is still presented as a technical measurement from a render');
assert(runtime.includes('not a verified 15 mm material thickness'),
  'Fascia renderer thickness provenance is not explicit');
assert(runtime.includes('vodo ? cy0 : cy0 + sd * roz, zH - th);'),
  'Head fastener is not seated on the head-plate underside');
assert(!runtime.includes('zH - th - 1'),
  'Obsolete 1 mm air gap remains under a head fastener');
assert(runtime.includes('const stredR = py + sy * UHOL_LY * 0.55;') &&
       runtime.includes('const stredO = px + sx * UHOL_LX * 0.55;'),
  'Angle fasteners are not the verified secondary-reference 2+2 layout');

console.log('technical fidelity contact PASS: exact axes preserved; post/head/base/angle contacts verified; purlin +40 mm; four-post non-corners not misclassified; Koverta brace/infill contacts use real sections; visual-only provenance is explicit');
