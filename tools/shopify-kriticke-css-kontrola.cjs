/* Prevod nesmie zahodiť prvú obrazovku ani nechať statické adresy fontov. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), theme = path.join(root, 'shopify-tema');
const layout = fs.readFileSync(path.join(theme, 'layout/theme.liquid'), 'utf8');
const names = ['uvod', 'pristresky-pre-auta', 'zahradne-pristresky', 'bioklimaticke-pergoly', 'realizacie', 'kontakt'];
for (const name of names) {
  const filename = 'kv-kriticky-' + name + '.liquid';
  const snippet = fs.readFileSync(path.join(theme, 'snippets', filename), 'utf8');
  assert(snippet.startsWith('<style data-k-kriticky="' + name + '">'), filename);
  assert(!/url\([^)]*(?:\.\.\/|\.\/assets\/|url\(pismo\/)/.test(snippet), 'Statická cesta v ' + filename);
  for (const m of snippet.matchAll(/\{\{ '([^']+)' \| asset_url \}\}/g)) {
    assert(fs.existsSync(path.join(theme, 'assets', m[1])), 'Chýba asset ' + m[1]);
  }
  const render = "{%- render 'kv-kriticky-" + name + "' %}";
  assert.equal(layout.split(render).length - 1, 1, 'Kritický štýl musí mať práve jednu vetvu');
  const branch = layout.slice(layout.indexOf(render), layout.indexOf('{%-', layout.indexOf(render) + render.length));
  assert.match(branch, /media="print" onload="this\.media='all'/);
  assert.match(branch, /<noscript><link rel="stylesheet"/);
}
console.log('SHOPIFY_KRITICKE_CSS_OK: 6 stránok, fonty na CDN, async aj noscript');
