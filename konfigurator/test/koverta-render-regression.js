'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'soltec-premium.js'), 'utf8');

assert.match(source, /slats\(gt, 1 - gt, zBase \+ gw, zTop - gw, back, KV_MAT\[kind\]\)/,
  'Koverta wall slats must start and end inside the perimeter rails');

const lower = source.match(/drawTrapSurface\(tx0, tx1, ty0, ty1, trapLowerZ, spodHex, false\)/g) || [];
const upper = source.match(/drawTrapSurface\(tx0, tx1, ty0, ty1, trapUpperZ, vrchHex, true\)/g) || [];
assert.equal(lower.length, 1, 'Koverta lower roof skin must be generated exactly once');
assert.equal(upper.length, 1, 'Koverta upper roof skin must be generated exactly once');

assert.match(source, /if \(!lowPowerGraphics\) \{\s*for \(let i = 10; i >= 0; i--\)/,
  'Decorative shadow rings must be skipped on low-power devices');
assert.match(source, /material === 'fascia' \? 0\.035 : HAZE_I/,
  'Fascia must use restrained depth haze');
assert.match(source, /true, 'fascia'\)/,
  'Koverta flashing faces must identify their fascia material');

console.log('KOVERTA_RENDER_REGRESSION_PASS whole slats, single roof skin, low-power shadow guard and fascia haze');
