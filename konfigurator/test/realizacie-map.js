'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'realizacie/index.html'), 'utf8');
const llms = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');

function values(pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

function unique(valuesToCheck, label) {
  const seen = new Set();
  const duplicate = valuesToCheck.find((value) => seen.has(value) || !seen.add(value));
  assert.strictEqual(duplicate, undefined, `${label} contains duplicate id: ${duplicate}`);
  return seen;
}

const markerIds = values(/class="kh-mapa__bod"[^>]*data-k-mapa-bod="([^"]+)"/g);
const listIds = values(/class="kh-mapa__polozka"[^>]*data-k-mapa-bod="([^"]+)"/g);
const cardIds = values(/data-k-mapa-karta="([^"]+)"/g);

assert.strictEqual(markerIds.length, 110, 'map must contain exactly 110 realization locations');
assert.deepStrictEqual(unique(markerIds, 'markers'), unique(listIds, 'location list'));
assert.deepStrictEqual(unique(markerIds, 'markers'), unique(cardIds, 'detail cards'));
assert.match(html, /Viac ako 110 obcí/);

const expectedPositions = {
  janovce: ['12.12', '75.86'],       // PSČ 92522, okres Galanta
  klokocov: ['30.35', '8.97'],       // Kysuce, okres Čadca
  'vranov-nad-toplou': ['84.54', '38.75']
};

for (const [id, [x, y]] of Object.entries(expectedPositions)) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    html,
    new RegExp(`class="kh-mapa__bod"[^>]*data-k-mapa-bod="${escaped}"[^>]*style="--x: ${x}%; --y: ${y}%"`),
    `${id} has an unexpected map position`
  );
}

assert.match(
  html,
  /class="kh-mapa__karta kh-mapa__karta--bezfoto" data-k-mapa-karta="vranov-nad-toplou"/,
  'Vranov must use an honest text-only card until its own photo is supplied'
);
assert.match(llms, /\(110 obcí, 178 realizácií\)/);
assert.match(llms, /Vranov nad Topľou/);

console.log('realizacie-map: PASS (110 locations, complete marker/list/card mapping)');
