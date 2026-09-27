// Varianty repliky. Každý mení len to, čo by menila téma z tejto vetvy.
'use strict';
const fs = require('fs');
const path = require('path');
const [zdroj, ciel] = process.argv.slice(2);
fs.mkdirSync(ciel, { recursive: true });

// Adresy obchodu sa robia relatívnymi, aby šli cez repliku (rovnaký pôvod
// ako dokument — tak ako v obchode).
const v0 = fs.readFileSync(zdroj, 'utf8').replace(/(["'(])(?:https?:)?\/\/koverta\.sk\//g, '$1/');

const zmen = (t, co, na, meno) => {
  const n = t.split(co).length - 1;
  if (!n) throw new Error(meno + ': nenašiel som ' + co);
  return t.split(co).join(na);
};

// Písmo -v2 a štýl z vetvy (ten si písmo pýta s novým menom).
const pismo = (t) => {
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/pismo-archivo-latin\.woff2/g, '/lokalne/pismo-archivo-latin-v2.woff2');
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/pismo-archivo-latin-ext\.woff2/g, '/lokalne/pismo-archivo-latin-ext-v2.woff2');
  t = t.replace(/\/cdn\/shop\/t\/\d+\/assets\/koverta-2026\.css\?v=\d+/, '/lokalne/koverta-2026.css');
  if (!/lokalne\/koverta-2026\.css/.test(t)) throw new Error('pismo: štýl');
  return t;
};

// Úvodná fotografia z pôvodu obchodu namiesto jsDelivr (bez nového spojenia).
const fotka = (t) => {
  const pred = t.length;
  t = t.replace(/https:\/\/cdn\.jsdelivr\.net\/gh\/danielvendzur-code\/koverta-web@[0-9a-f]{40}\/assets\/(koverta-hero-sibenik-poster[^"?\s,]*)\?v=2/g, '/lokalne/$1');
  if (t.length === pred) throw new Error('fotka: nič');
  return t;
};

const varianty = { v0, pismo: pismo(v0), fotka: fotka(v0), 'pismo-fotka': fotka(pismo(v0)) };
for (const [meno, t] of Object.entries(varianty)) {
  fs.writeFileSync(path.join(ciel, meno + '.html'), t);
  console.log(meno, t.length, 'lokalne:', (t.match(/\/lokalne\/[^"\s,]+/g) || []).length);
}
