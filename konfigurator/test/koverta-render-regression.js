'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'soltec-premium.js'), 'utf8');

assert.match(source, /slats\(gt, 1 - gt, zBase \+ gw, zTop - gw, back, KV_MAT\[kind\]\)/,
  'Koverta wall slats must start and end inside the perimeter rails');

const lower = source.match(/drawTrapSurface\(tx0, tx1, ty0, ty1, trapLowerZ, spodHex, false\)/g) || [];
const upper = source.match(/drawTrapSurface\(lx0, lx1, ly0, ly1, trapUpperZ, vrchHex, true\)/g) || [];
const hidden = source.match(/drawTrapSurface\([^)]*trapHiddenZ, vrchHex, true\)/g) || [];
assert.equal(lower.length, 1, 'Koverta lower roof skin must be generated exactly once');
assert.equal(upper.length, 1, 'Koverta upper roof skin must have only a narrow lap under the flashing');
assert.equal(hidden.length, 2, 'Koverta sheet must continue under both end flashings with a lowered crown');
assert.doesNotMatch(source, /drawTrapSurface\(tx0, tx1, ty0, ty1, trapUpperZ, vrchHex, true\)/,
  'Full hidden upper skin causes corrugation dots on top of the flashing');

assert.match(source, /const ringStep = lowPowerGraphics \? 3 : 1;\s*for \(let i = 10; i >= 0; i -= ringStep\)/,
  'Low-power devices must keep a cheaper ground shadow instead of none');
assert.match(source, /if \(!interacting\) detailTimer = window\.setTimeout\(\(\) => \{\s*motionDetail = false;\s*drawStage\(\);/,
  'Camera settle must switch back to a full-detail still render');
assert.match(source, /if \(!motionDetail\) ratio = dpr \* Math\.max\(1, Math\.floor\(ratio \/ dpr \+ 1e-6\)\);/,
  'Still-frame ratio must remain an integer multiple of physical pixels');
assert.match(source, /material === 'fascia' \? 0\.035 : HAZE_I/,
  'Fascia must use restrained depth haze');
assert.match(source, /true, 'fascia'\)/,
  'Koverta flashing faces must identify their fascia material');

console.log('KOVERTA_RENDER_REGRESSION_PASS whole slats, cropped upper roof skin, sharp settle path, low-power shadow guard and fascia haze');
