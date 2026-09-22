#!/usr/bin/env node
'use strict';
/* Výber rozmeru na produktovej stránke.
 *
 * Je to ten istý komponent `kh-size` ako na podstránke Prístrešky pre autá,
 * len čipy vedú priamo na produkty a aktuálny rozmer je označený. Rozmery a
 * ceny sa berú z `konfigurator/cfg-pages.js`, rovnako ako pri synchronizácii
 * produktov, takže sa nemôžu rozísť s cenníkom ani s konfigurátorom.
 *
 * Výstup: shopify-zdroj/snippets/koverta-rozmery.liquid
 *   node tools/shopify-rozmery.js          zapíše snippet
 *   node tools/shopify-rozmery.js --check  zlyhá, ak snippet nie je aktuálny */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CIEL = path.join(ROOT, 'shopify-zdroj', 'snippets', 'koverta-rozmery.liquid');

function data(kluc) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'konfigurator', 'cfg-pages.js'), 'utf8'), sandbox);
  const m = sandbox.window.KV_PAGES[kluc].match(/<script type="application\/json" data-sp-bio-data>([\s\S]*?)<\/script>/);
  return JSON.parse(m[1]);
}
const metre = (mm) => String(mm / 1000).replace('.', ',') + ' m';
const cena = (e) => e.toLocaleString('sk-SK').replace(/\s/g, ' ') + ' €';
const handle = (fam, w, l) => (fam === 'zahrada' ? 'zahradny-pristresok-koverta-' : 'pristresok-koverta-') + w + 'x' + l;

function skupina(fam, model, nazov, sirky) {
  const riadky = sirky.map((w) => {
    const wi = model.widths.indexOf(w);
    const kusy = model.lengths.map((l, li) => {
      const h = handle(fam, w, l);
      return '<a class="kh-size__chip" href="/products/' + h + '"{% if product.handle == \'' + h + '\' %} aria-current="page"{% endif %}'
        + ' aria-label="Rozmer ' + metre(w) + ' × ' + metre(l) + ', ' + cena(model.prices[li][wi]) + '">'
        + '<span>' + metre(l) + '</span><small>' + cena(model.prices[li][wi]) + '</small></a>';
    }).join('');
    return '<div class="kh-size__rad"><p class="kh-size__sirka"><strong>' + metre(w) + '</strong><span>šírka</span></p>'
      + '<div class="kh-size__dlzky">' + kusy + '</div></div>';
  }).join('\n      ');
  const od = Math.min(...sirky.map((w) => Math.min(...model.lengths.map((_, li) => model.prices[li][model.widths.indexOf(w)]))));
  /* Skupina je <details>: na telefóne sa tá, v ktorej aktuálny rozmer nie
     je, zbalí (koverta-product.js), na počítači sú otvorené obe. */
  return '  <details class="kp-size__skupina" open>\n'
    + '    <summary class="kh-size__label">' + nazov + ' <span>' + sirky.length * model.lengths.length + ' rozmerov</span> <span class="kh-size__od">od ' + cena(od) + '</span></summary>\n'
    + '    <div class="kh-size__grid kh-size__grid--matica">\n      ' + riadky + '\n    </div>\n  </details>\n';
}

function snippet() {
  const k = data('koverta').models.K;
  const z = data('zahrada').models.Z;
  const auto1 = k.widths.filter((w) => w < 5000);
  const auto2 = k.widths.filter((w) => w >= 5000);
  return '{%- comment -%} Vygenerované: node tools/shopify-rozmery.js. Neupravovať ručne. {%- endcomment -%}\n'
    + '{%- if family == \'zahrada\' -%}\n<div class="kh-size kp-size kp-size--jedna">\n'
    + skupina('zahrada', z, 'Záhradný prístrešok', z.widths)
    + '</div>\n{%- else -%}\n<div class="kh-size kp-size">\n'
    + skupina('auto', k, 'Pre jedno auto', auto1)
    + skupina('auto', k, 'Pre dve autá', auto2)
    + '</div>\n{%- endif -%}\n';
}

const obsah = snippet();
if (process.argv.includes('--check')) {
  const teraz = fs.existsSync(CIEL) ? fs.readFileSync(CIEL, 'utf8') : '';
  if (teraz !== obsah) { console.error('koverta-rozmery.liquid nie je aktuálny: node tools/shopify-rozmery.js'); process.exit(1); }
  console.log('koverta-rozmery.liquid je aktuálny');
} else {
  fs.mkdirSync(path.dirname(CIEL), { recursive: true });
  fs.writeFileSync(CIEL, obsah);
  console.log('Zapísané ' + path.relative(ROOT, CIEL));
}
