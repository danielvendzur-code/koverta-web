// Varianty repliky. Každý mení len to, čo by menila téma z tejto vetvy.
'use strict';
const fs = require('fs');
const path = require('path');
const [zdroj, ciel, pouziteCss] = process.argv.slice(2);
fs.mkdirSync(ciel, { recursive: true });

// Adresy obchodu sa robia relatívnymi, aby šli cez repliku (rovnaký pôvod
// ako dokument — tak ako v obchode).
const v0 = fs.readFileSync(zdroj, 'utf8').replace(/(["'(])(?:https?:)?\/\/koverta\.sk\//g, '$1/');

// Písmo -v2 a štýl z vetvy (ten si písmo pýta s novým menom).
const pismo = (t) => {
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/pismo-archivo-latin\.woff2/g, '/lokalne/pismo-archivo-latin-v2.woff2');
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/pismo-archivo-latin-ext\.woff2/g, '/lokalne/pismo-archivo-latin-ext-v2.woff2');
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/koverta-2026\.css\?v=\d+/, '/lokalne/koverta-2026.css');
  if (!/lokalne\/koverta-2026\.css/.test(t)) throw new Error('pismo: štýl');
  return t;
};

// Sekcie pod prvou obrazovkou sa nevykresľujú ani neprepočítavajú, kým
// k nim návštevník nezoskroluje. Bez sekcie s dialógom značiek (kh-pick)
// a s formulárom (kh-cta), úvod ostáva.
const cv = (t) => {
  const css = '<style>main.k>section.k-band:not(.kh-pick):not(.kh-cta){content-visibility:auto;contain-intrinsic-size:auto 900px}footer.kf{content-visibility:auto;contain-intrinsic-size:auto 700px}</style>';
  if (!t.includes('</head>')) throw new Error('cv: head');
  return t.replace('</head>', css + '</head>');
};

// Strop: úvod dostane len štýly, ktoré na ňom pri načítaní niečo zasiahnu.
const purge = (t) => {
  if (!pouziteCss || !fs.existsSync(pouziteCss)) throw new Error('purge: chýba zoznam');
  return t.replace(/\/lokalne\/koverta-2026\.css|\/cdn\/shop\/t\/\d+\/assets\/koverta-2026\.css\?v=\d+/, '/lokalne/koverta-2026-uvod.css');
};

// Len meranie: GTM sa pripojí až po udalosti load. Nenasadzuje sa.
const gtmLoad = (t) => {
  const old = 'f.parentNode.insertBefore(j, f);';
  if (!t.includes(old)) throw new Error('gtm: snippet');
  return t.replace(old, "w.addEventListener('load', function () { f.parentNode.insertBefore(j, f); });");
};

const varianty = {
  v0,
  pismo: pismo(v0),
  'pismo-cv': cv(pismo(v0)),
  'x-gtm-load': gtmLoad(pismo(v0))
};
if (pouziteCss) {
  varianty['pismo-purge'] = purge(pismo(v0));
  varianty['pismo-cv-purge'] = purge(cv(pismo(v0)));
}
for (const [meno, t] of Object.entries(varianty)) {
  fs.writeFileSync(path.join(ciel, meno + '.html'), t);
  console.log(meno, t.length, 'lokalne:', (t.match(/\/lokalne\/[^"\s,]+/g) || []).length);
}
