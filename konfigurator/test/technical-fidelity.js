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

console.log('technical fidelity contact PASS: exact axes preserved; post -> side frame contact; purlin +40 mm; four-post non-corners not misclassified');
