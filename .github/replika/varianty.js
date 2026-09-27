// Varianty repliky. Každý mení len to, čo by menila téma.
'use strict';
const fs = require('fs');
const path = require('path');
const [zdroj, ciel, kritCss] = process.argv.slice(2);
fs.mkdirSync(ciel, { recursive: true });

// Adresy obchodu sa robia relatívnymi, aby šli cez repliku (rovnaký pôvod
// ako dokument — tak ako v obchode).
const v0 = fs.readFileSync(zdroj, 'utf8').replace(/(["'(])(?:https?:)?\/\/koverta\.sk\//g, '$1/');

// Kritický štýl vložený do stránky, celý štýl sa dotiahne bez blokovania.
const STYL = /<link rel="stylesheet" href="(\/cdn\/shop\/t\/\d+\/assets\/koverta-2026\.css\?v=\d+)"\s*\/?>/;
const krit = (t) => {
  const m = t.match(STYL);
  if (!m) throw new Error('krit: štýl nenájdený');
  const css = fs.readFileSync(kritCss, 'utf8').replace(/http:\/\/127\.0\.0\.1:\d+\//g, '/');
  return t.replace(m[0], () => `<style id="kv-krit">${css}</style><link rel="stylesheet" href="${m[1]}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${m[1]}"></noscript>`);
};

// Sekcie pod prvou obrazovkou sa nevykresľujú, kým k nim návštevník
// nezoskroluje (okrem sekcie s dialógom značiek a formulárom).
const cv = (t) => {
  const css = '<style>main.k>section.k-band:not(.kh-pick):not(.kh-cta){content-visibility:auto;contain-intrinsic-size:auto 900px}footer.kf{content-visibility:auto;contain-intrinsic-size:auto 700px}</style>';
  if (!t.includes('</head>')) throw new Error('cv: head');
  return t.replace('</head>', css + '</head>');
};

const varianty = { v0, cv: cv(v0) };
if (kritCss) { varianty.krit = krit(v0); varianty['krit-cv'] = cv(krit(v0)); }
for (const [meno, t] of Object.entries(varianty)) {
  fs.writeFileSync(path.join(ciel, meno + '.html'), t);
  console.log(meno, t.length);
}
