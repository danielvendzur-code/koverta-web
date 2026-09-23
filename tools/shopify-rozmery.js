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

/* Fotky realizácií s presne rovnakým rozmerom (tools/rozmery-fotky.json).
   Snippet vypíše snímky galérie (druh: 'snimka') alebo náhľady ('nahlad'). */
const FOTKY_CIEL = path.join(ROOT, 'shopify-zdroj', 'snippets', 'koverta-fotky-rozmeru.liquid');
function fotkySnippet() {
  const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'rozmery-fotky.json'), 'utf8'));
  const zaklad = 'https://danielvendzur-code.github.io/koverta-web/assets/mapa/';
  let out = '{%- comment -%} Vygenerované: node tools/shopify-rozmery.js z tools/rozmery-fotky.json. {%- endcomment -%}\n{%- case handle -%}\n';
  for (const [h, fotky] of Object.entries(mapa)) {
    if (!/^(pristresok|zahradny)/.test(h)) continue;
    const m = h.match(/(\d+)x(\d+)$/);
    const rozmer = metre(+m[1]).replace(' m', '') + ' × ' + metre(+m[2]);
    out += "{%- when '" + h + "' -%}\n";
    fotky.forEach(([subor, obec], i) => {
      if (!fs.existsSync(path.join(ROOT, 'assets', 'mapa', subor + '.jpg'))) throw new Error('chýba assets/mapa/' + subor + '.jpg');
      const alt = 'Realizácia Koverta ' + rozmer + ', ' + obec;
      out += "{%- if druh == 'nahlad' -%}<button type=\"button\" class=\"kp-gal__nahlad\" role=\"tab\" aria-selected=\"false\" data-kp-thumb data-index=\"{{ start | plus: " + i + " }}\" aria-label=\"" + alt + "\"><img src=\"" + zaklad + subor + "-mini.jpg\" width=\"320\" height=\"240\" alt=\"\" loading=\"lazy\" decoding=\"async\"></button>"
        + "{%- else -%}<figure class=\"kp-gal__slide\" data-kp-slide><img src=\"" + zaklad + subor + ".jpg\" width=\"1280\" height=\"960\" alt=\"" + alt + "\" loading=\"lazy\" decoding=\"async\"><figcaption class=\"kp-gal__popis\">Realizácia " + rozmer + " · " + obec + "</figcaption></figure>{%- endif -%}\n";
    });
  }
  return out + '{%- endcase -%}\n';
}
/* Realizácie dole na produkte: štyri skutočné montáže s rozmerom čo
   najbližším k produktu (z mapy realizácií), pri záhradnom prístrešku
   štyri záhradné realizácie. Každá vedie na stránku realizácií. */
const REAL_CIEL = path.join(ROOT, 'shopify-zdroj', 'snippets', 'koverta-realizacie.liquid');
function realizacieSnippet() {
  const zaklad = 'https://danielvendzur-code.github.io/koverta-web/assets/';
  const html = fs.readFileSync(path.join(ROOT, 'realizacie', 'index.html'), 'utf8');
  const karty = [...html.matchAll(/data-k-mapa-karta="([^"]+)"[^>]*>\s*<button[^>]*data-k-lupa="\.\.\/assets\/mapa\/([^"]+)\.jpg" data-k-lupa-popis="([^"]*)"/g)]
    .map((m) => {
      const [obec, popis] = m[3].split(' · ');
      const r = popis.match(/Prístrešok (\d+(?:,\d+)?) × (\d+(?:,\d+)?) m/);
      return r ? { subor: m[2], obec, popis, w: parseFloat(r[1].replace(',', '.')) * 1000, l: parseFloat(r[2].replace(',', '.')) * 1000 } : null;
    })
    .filter((k) => k && fs.existsSync(path.join(ROOT, 'assets', 'mapa', k.subor + '-mini.jpg')) && fs.existsSync(path.join(ROOT, 'assets', 'mapa', k.subor + '.jpg')));
  const figura = (maly, velky, alt, nadpis, pod, sirky) =>
    '<figure><img src="' + velky + '" srcset="' + maly + ' ' + sirky[0] + 'w, ' + velky + ' ' + sirky[1] + 'w" sizes="(max-width: 759px) 92vw, 23vw" width="1280" height="960" alt="' + alt + '" loading="lazy" decoding="async">'
    + '<figcaption><strong>' + nadpis + '</strong><span>' + pod + '</span></figcaption></figure>';
  let out = '{%- comment -%} Vygenerované: node tools/shopify-rozmery.js z realizacie/index.html. {%- endcomment -%}\n{%- case handle -%}\n';
  const k = data('koverta').models.K;
  for (const w of k.widths) for (const l of k.lengths) {
    const najblizsie = karty.slice().sort((a, b) => (Math.abs(a.w - w) + Math.abs(a.l - l)) - (Math.abs(b.w - w) + Math.abs(b.l - l))).slice(0, 4);
    out += "{%- when '" + handle('auto', w, l) + "' -%}" + najblizsie.map((x) =>
      figura(zaklad + 'mapa/' + x.subor + '-mini.jpg', zaklad + 'mapa/' + x.subor + '.jpg', 'Realizácia Koverta – ' + x.obec + ', ' + x.popis, x.obec, x.popis, [420, 1280])).join('') + '\n';
  }
  const zahrada = [['maly-lapas-terasa', 'Malý Lapáš', 'Záhradný prístrešok nad terasou'], ['skalica-terasa', 'Skalica', 'Záhradný prístrešok nad terasou'],
    ['trebisov-lamely', 'Trebišov', 'Záhradný prístrešok s lamelami'], ['varin-dvor', 'Varín', 'Záhradný prístrešok na dvore']];
  out += '{%- else -%}' + zahrada.map(([f, obec, popis]) => figura(zaklad + 'koverta-zahradny-pristresok-' + f + '-w640.webp',
    zaklad + 'koverta-zahradny-pristresok-' + f + '-w1000.webp', 'Realizácia Koverta – ' + obec + ', ' + popis, obec, popis, [640, 1000])).join('') + '\n{%- endcase -%}\n';
  return out;
}
const realObsah = realizacieSnippet();
const fotkyObsah = fotkySnippet();
const obsah = snippet();
if (process.argv.includes('--check')) {
  const teraz = fs.existsSync(CIEL) ? fs.readFileSync(CIEL, 'utf8') : '';
  const terazF = fs.existsSync(FOTKY_CIEL) ? fs.readFileSync(FOTKY_CIEL, 'utf8') : '';
  const terazR = fs.existsSync(REAL_CIEL) ? fs.readFileSync(REAL_CIEL, 'utf8') : '';
  if (terazR !== realObsah) { console.error('koverta-realizacie.liquid nie je aktuálny: node tools/shopify-rozmery.js'); process.exit(1); }
  if (terazF !== fotkyObsah) { console.error('koverta-fotky-rozmeru.liquid nie je aktuálny: node tools/shopify-rozmery.js'); process.exit(1); }
  if (teraz !== obsah) { console.error('koverta-rozmery.liquid nie je aktuálny: node tools/shopify-rozmery.js'); process.exit(1); }
  console.log('koverta-rozmery.liquid je aktuálny');
} else {
  fs.mkdirSync(path.dirname(CIEL), { recursive: true });
  fs.writeFileSync(CIEL, obsah);
  fs.writeFileSync(FOTKY_CIEL, fotkyObsah);
  fs.writeFileSync(REAL_CIEL, realObsah);
  console.log('Zapísané ' + path.relative(ROOT, CIEL));
}
