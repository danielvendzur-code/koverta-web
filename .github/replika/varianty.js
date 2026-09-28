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

// Horná hranica: štýl aplikácie EZ Terms (zaškrtávanie podmienok, treba ho
// len v košíku) sa stiahne bez blokovania vykreslenia.
const EZ = /<link href="(https:\/\/cdn\.shopify\.com\/extensions\/[^"]*ez-terms[^"]*\/style\.min\.css)" rel="stylesheet" type="text\/css" media="all">/;
const ezAsync = (t) => {
  const m = t.match(EZ);
  if (!m) throw new Error('ez: štýl nenájdený');
  return t.replace(m[0], () => `<link href="${m[1]}" rel="stylesheet" type="text/css" media="print" onload="this.media='all'">`);
};
// Nasaditeľná verzia z témy: skript skoro v hlavičke sleduje, kedy parser
// vloží štýl aplikácie, a hneď ho prepne na neblokujúci.
const ezSledovac = (t) => {
  const s = `<script>(function(){var o=new MutationObserver(function(z){z.forEach(function(m){m.addedNodes.forEach(function(n){if(n.tagName==='LINK'&&/ez-terms[^"]*style\\.min\\.css/.test(n.href||'')){n.media='print';n.onload=function(){n.media='all'};o.disconnect();}})})});o.observe(document.documentElement,{childList:true,subtree:true});addEventListener('DOMContentLoaded',function(){o.disconnect()});})();</script>`;
  if (!/<meta name="viewport"[^>]*>/.test(t)) throw new Error('ez2: viewport');
  return t.replace(/(<meta name="viewport"[^>]*>)/, (m) => m + s);
};

// Náš malý štýl pre obchod (1,6 kB) priamo v stránke namiesto ďalšej žiadosti.
const shopCss = (t) => {
  const m = t.match(/<link href="(\/cdn\/shop\/t\/\d+\/assets\/koverta-shopify\.css\?v=\d+)" rel="stylesheet" type="text\/css" media="all" \/>/);
  if (!m) throw new Error('shopcss: nenájdený');
  return t.replace(m[0], () => '<style>' + SHOPCSS + '</style>');
};
const SHOPCSS = fs.existsSync(path.join(__dirname, '..', '..', 'shopify-tema', 'assets', 'koverta-shopify.css')) ? fs.readFileSync(path.join(__dirname, '..', '..', 'shopify-tema', 'assets', 'koverta-shopify.css'), 'utf8') : '';

// Úvodná fotka z toho istého servera ako stránka (bez spojenia na jsDelivr).
const fotka = (t) => {
  const r = /https:\/\/cdn\.jsdelivr\.net\/gh\/danielvendzur-code\/koverta-web@[0-9a-f]+\/assets\/(koverta-hero-sibenik-poster[^"?\s]*)\?v=2/g;
  const n = (t.match(r) || []).length;
  if (n < 2) throw new Error('fotka: ' + n);
  return t.replace(r, '/lokalne/$1');
};

// GTM neskôr: pri prvej interakcii, inak N ms po načítaní stránky.
const gtmPo = (ms) => (t) => {
  const old = "w.addEventListener('load', function () { f.parentNode.insertBefore(j, f); });";
  if (!t.includes(old)) throw new Error('gtm: snippet');
  return t.replace(old, () => "var hotovo = false, ev = ['pointerdown', 'keydown', 'touchstart', 'scroll'], spusti = function () { if (hotovo) return; hotovo = true; ev.forEach(function (e) { w.removeEventListener(e, spusti, true); }); f.parentNode.insertBefore(j, f); }; ev.forEach(function (e) { w.addEventListener(e, spusti, { capture: true, passive: true }); }); w.addEventListener('load', function () { setTimeout(spusti, " + ms + "); });");
};

const varianty = { v0, 'gtm-2s': gtmPo(2000)(v0), 'gtm-4s': gtmPo(4000)(v0) };

for (const [meno, t] of Object.entries(varianty)) {
  fs.writeFileSync(path.join(ciel, meno + '.html'), t);
  console.log(meno, t.length);
}
