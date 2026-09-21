#!/usr/bin/env node
/* Vygenerovaná téma sa kontroluje sama.
 *
 * Šesť súborov písma a otočená značka Koverta sa do témy nikdy nedostali:
 * štýl si ich pýta cez `url(...)` vnútri CSS, a tie adresy sa pri prevode
 * neprepisovali. Na obchode z toho bolo Archivo spadnuté na Arial a za
 * Častými otázkami prázdny čierny panel. Nikto si toho nevšimol, lebo prevod
 * skončil bez jediného nálezu — odkaz, ktorý nikam nevedie, mu bol jedno.
 *
 * Táto kontrola prejde hotovú tému a overí, že každý odkaz v nej niekam
 * vedie. Ide po tom, čo Shopify vyrobí až za behu, takže sa to inak zistí
 * najskôr v náhľade obchodu — a najneskôr na zákazníkovi.
 *
 *   node tools/shopify-kontrola.js
 *
 * Čo sa overuje
 * -------------
 *   asset_url    `{{ 'meno' | asset_url }}` musí mať súbor v `assets/`
 *   url() v CSS  relatívna adresa musí ležať vedľa v tej istej zložke
 *   include      `{% include 'x' %}` musí mať útržok v `snippets/`
 *   šablóny      téma musí mať úvod aj `page.json`, inak nemá domovskú
 *                stránku a stránky na `Default page` sú prázdne
 *   sekcia       `kv-stranka` musí púšťať bloky aplikácií (@app), inak sa
 *                formulár nedá vložiť priamo do stránky
 *   nastavenia   `settings_data.json` nesmie prísť o embed Formfulu, bez
 *                neho tlačidlo dopytu neotvorí nič
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const TEMA = path.join(KOREN, 'shopify-tema');
const FORMULAR = 'form_LaKRq0tyt4';
const MAX_SNIPPET_BAJTOV = 180 * 1024;

const nalezy = [];
function nalez(kde, co) { nalezy.push(path.relative(KOREN, kde) + ': ' + co); }

if (!fs.existsSync(TEMA)) {
  console.error('Téma nie je vygenerovaná. Spravte to: node tools/shopify-tema.js');
  process.exit(1);
}

function subory(adresar, zoznam = []) {
  if (!fs.existsSync(adresar)) return zoznam;
  for (const p of fs.readdirSync(adresar, { withFileTypes: true })) {
    const cesta = path.join(adresar, p.name);
    if (p.isDirectory()) subory(cesta, zoznam);
    else zoznam.push(cesta);
  }
  return zoznam;
}

const vsetky = subory(TEMA);
const vAssets = new Set(fs.existsSync(path.join(TEMA, 'assets'))
  ? fs.readdirSync(path.join(TEMA, 'assets')) : []);
const vSnippets = new Set((fs.existsSync(path.join(TEMA, 'snippets'))
  ? fs.readdirSync(path.join(TEMA, 'snippets')) : []).map((m) => m.replace(/\.liquid$/, '')));

/* Veľký snippet vie GitHub niesť, ale Shopify ho pri synchronizácii vynechá.
   Odkazujúca sekcia potom na živej stránke zobrazí Liquid error. */
for (const subor of vsetky.filter((p) => /snippets\/.*\.liquid$/.test(p))) {
  const bajty = fs.statSync(subor).size;
  if (bajty > MAX_SNIPPET_BAJTOV) {
    nalez(subor, 'má ' + bajty + ' B — treba ho rozdeliť pod ' + MAX_SNIPPET_BAJTOV + ' B');
  }
}

/* 1 · asset_url a file_url ------------------------------------------------ */

const ASSET = /\{\{\s*'([^']+)'\s*\|\s*asset_url/g;
for (const subor of vsetky) {
  if (!/\.(liquid|json)$/.test(subor)) continue;
  const text = fs.readFileSync(subor, 'utf8');
  let m;
  while ((m = ASSET.exec(text))) {
    if (!vAssets.has(m[1])) nalez(subor, "asset_url '" + m[1] + "' — ten súbor v assets/ nie je");
  }
}

/* 2 · url() v CSS --------------------------------------------------------- */

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
for (const meno of vAssets) {
  if (!meno.endsWith('.css')) continue;
  const subor = path.join(TEMA, 'assets', meno);
  const text = fs.readFileSync(subor, 'utf8');
  let m;
  while ((m = CSS_URL.exec(text))) {
    const adresa = m[2].trim();
    if (!adresa || /^(?:https?:|data:|\/\/|#|\{\{|\{%)/i.test(adresa)) continue;
    const bez = adresa.split('?')[0].split('#')[0];
    if (!bez) continue;
    /* V téme je jedna plochá zložka: odkaz smie ukazovať len vedľa seba. */
    if (bez.includes('/')) {
      nalez(subor, 'url(' + adresa + ') — v téme podpriečinky nie sú, adresa nikam nevedie');
    } else if (!vAssets.has(bez)) {
      nalez(subor, 'url(' + adresa + ') — ten súbor v assets/ nie je');
    }
  }
}

/* 3 · include ------------------------------------------------------------- */

const INCLUDE = /\{%\s*include\s+'([^']+)'\s*%\}/g;
for (const subor of vsetky) {
  if (!subor.endsWith('.liquid')) continue;
  const text = fs.readFileSync(subor, 'utf8');
  let m;
  while ((m = INCLUDE.exec(text))) {
    if (!vSnippets.has(m[1])) nalez(subor, "include '" + m[1] + "' — ten útržok v snippets/ nie je");
  }
}

/* 4 · šablóny, bez ktorých téma nefunguje --------------------------------- */

for (const [mena, preco] of [
  [['index.liquid', 'index.json'], 'téma nemá domovskú stránku'],
  [['page.json', 'page.liquid'], 'stránky na „Default page" sú prázdne'],
]) {
  if (!mena.some((m) => fs.existsSync(path.join(TEMA, 'templates', m)))) {
    nalezy.push('shopify-tema/templates/' + mena[0] + ' chýba — ' + preco);
  }
}

/* Sekcia stránky je jediné miesto, kam sa dá umiestniť blok aplikácie —
   teda jediná cesta, ako dostať formulár priamo do stránky, nie len do
   vyskakovacieho okna. Bez `@app` v jej schéme editor bloky neponúkne. */
const sekcia = path.join(TEMA, 'sections', 'kv-stranka.liquid');
if (!fs.existsSync(sekcia)) {
  nalezy.push('shopify-tema/sections/kv-stranka.liquid chýba — do stránky sa nedá vložiť formulár');
} else if (!/"type"\s*:\s*"@app"/.test(fs.readFileSync(sekcia, 'utf8'))) {
  nalez(sekcia, 'schéma nepúšťa bloky aplikácií (@app), formulár sa do stránky nedá vložiť');
}

/* 5 · embed Formfulu ------------------------------------------------------ */

const nastavenia = path.join(TEMA, 'config', 'settings_data.json');
if (fs.existsSync(nastavenia)) {
  const text = fs.readFileSync(nastavenia, 'utf8');
  /* Prázdne nastavenia sú v poriadku — obchod si ich ešte nezapísal. Keď už
     v nich ale formulár raz bol, nesmie sa stratiť. */
  if (/formful/i.test(text) && !text.includes(FORMULAR)) {
    nalez(nastavenia, 'embed Formfulu stratil formulár ' + FORMULAR);
  }
  try {
    const data = JSON.parse(text.slice(text.indexOf('{')));
    for (const blok of Object.values((data.current && data.current.blocks) || {})) {
      if (!/shopify:\/\/apps\/formful\/blocks\/app-embed/i.test(blok.type || '')) continue;
      if ((blok.settings && blok.settings.title || '').trim()) {
        nalez(nastavenia, 'Formful launcher zobrazuje text cez obsah stránky');
      }
      if (Number(blok.settings && blok.settings.icon_size) !== 0 ||
          Number(blok.settings && blok.settings.button_padding) !== 0) {
        nalez(nastavenia, 'Formful launcher ostáva viditeľný ako prázdny štvorec');
      }
    }
  } catch (e) {
    nalez(nastavenia, 'nie je platný JSON: ' + e.message);
  }
}

/* ------------------------------------------------------------------------- */

if (!nalezy.length) {
  console.log('Téma je celá: ' + vAssets.size + ' súborov v assets, ' +
    vSnippets.size + ' útržkov, každý odkaz niekam vedie.');
  process.exit(0);
}

console.error('V téme sú odkazy, ktoré nikam nevedú. Na obchode z toho býva');
console.error('spadnuté písmo alebo prázdne miesto — a prevod na to nepovie nič.\n');
for (const n of nalezy.slice(0, 20)) console.error('  ' + n);
if (nalezy.length > 20) console.error('  … a ďalších ' + (nalezy.length - 20));
console.error('\nSpravte to príkazom: node tools/shopify-tema.js');
process.exit(1);
