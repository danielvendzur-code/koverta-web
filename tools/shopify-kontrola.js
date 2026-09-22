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
 *   formulár     téma musí niesť vlastný Koverta formulár a nesmie načítavať
 *                starý Formful embed ani jeho launcher
 *   rozmery      odkaz na stránku katalógového rozmeru nesmie viesť do
 *                obchodu — tie stránky žijú na statickom webe
 *   stránky      každý nový interný odkaz musí mať cieľový útržok v téme
 *   JSON         každá konfigurácia a šablóna musí byť platný JSON
 *   formuláre    každý dopyt musí mať POST, povinné polia a odoslanie
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const TEMA = path.join(KOREN, 'shopify-tema');
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

/* Vlastný formulár nesmie dostať popri sebe druhý app formulár. */
const sekcia = path.join(TEMA, 'sections', 'kv-stranka.liquid');
if (!fs.existsSync(sekcia)) {
  nalezy.push('shopify-tema/sections/kv-stranka.liquid chýba');
} else if (/"type"\s*:\s*"@app"/.test(fs.readFileSync(sekcia, 'utf8'))) {
  nalez(sekcia, 'stále povoľuje app blok cudzieho formulára');
}

/* 5 · vlastný formulár, bez Formfulu ------------------------------------- */

const nastavenia = path.join(TEMA, 'config', 'settings_data.json');
if (fs.existsSync(nastavenia)) {
  const text = fs.readFileSync(nastavenia, 'utf8');
  if (/formful/i.test(text)) nalez(nastavenia, 'starý Formful embed je stále zapnutý');
  try {
    const data = JSON.parse(text.slice(text.indexOf('{')));
    void data;
  } catch (e) {
    nalez(nastavenia, 'nie je platný JSON: ' + e.message);
  }
}

const formularove = vsetky.filter((p) => /snippets\/nove-.*\.liquid$/.test(p));
if (!formularove.some((p) => /<form id="dopyt"[\s\S]*data-k-dopyt/.test(fs.readFileSync(p, 'utf8')))) {
  nalezy.push('shopify-tema/snippets: chýba vlastný Koverta dopytový formulár');
}
for (const subor of formularove) {
  const text = fs.readFileSync(subor, 'utf8');
  if (/Formful\.openDialog|form_LaKRq0tyt4/.test(text)) nalez(subor, 'stále odkazuje na Formful');
}

/* 6 · odkazy na stránky katalógových rozmerov -----------------------------
   Cenová tabuľka „Vyberte si rozmer" odkazuje na 66 stránok, ktoré generuje
   `tools/generuj-rozmery.py` a ktoré žijú na statickom webe. V obchode nie sú
   a zakladať ich tam netreba. Kým odkaz viedol na `/pages/…-rozmer-…`,
   dostal zákazník 404 priamo v cenníku, teda na tom najhoršom mieste.

   Stráži sa oboje: že taký odkaz v téme nie je a že plná adresa, ktorá ho
   nahradila, ukazuje na priečinok, ktorý v repozitári naozaj existuje. */

const DO_OBCHODU_ROZMER = /href="\/pages\/[^"]*-rozmer-[^"]*"/g;
const NA_STATICKY_ROZMER =
  /href="https?:\/\/[^"]*\/((?:pristresky-pre-auta|zahradne-pristresky)\/rozmer\/\d+x\d+)\/"/g;

for (const subor of vsetky) {
  if (!/\.(liquid|json)$/.test(subor)) continue;
  const text = fs.readFileSync(subor, 'utf8');
  const doObchodu = [...new Set(text.match(DO_OBCHODU_ROZMER) || [])];
  if (doObchodu.length) {
    nalez(subor, doObchodu.length + ' odkaz(ov) na rozmer vedie do obchodu (' +
      doObchodu[0].slice(6, -1) + ') — taká stránka tam nie je a zákazník dostane 404');
  }
  let m;
  while ((m = NA_STATICKY_ROZMER.exec(text))) {
    if (!fs.existsSync(path.join(KOREN, m[1], 'index.html'))) {
      nalez(subor, 'odkaz na rozmer ' + m[1] + ' — taký priečinok v repozitári nie je');
    }
  }
}

/* 7 · interné odkazy, JSON a každý formulár ------------------------------- */
const NOVE_HANDLES = new Set([...vSnippets].filter((meno) => meno.startsWith('nove-')));
const INTERNY_ODKAZ = new RegExp('(?:href|action)="/pages/(nove-[^"#?/]+)(?:[#?][^"]*)?"', 'g');
for (const subor of vsetky) {
  if (!/\.(liquid|json)$/.test(subor)) continue;
  const text = fs.readFileSync(subor, 'utf8');
  let m;
  while ((m = INTERNY_ODKAZ.exec(text))) {
    if (!NOVE_HANDLES.has(m[1])) nalez(subor, 'odkaz na /pages/' + m[1] + ' — cieľový útržok v téme nie je');
  }
}

for (const subor of vsetky.filter((p) => p.endsWith('.json'))) {
  const text = fs.readFileSync(subor, 'utf8');
  const cisty = text.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
  try { JSON.parse(cisty); }
  catch (e) { nalez(subor, 'nie je platný JSON: ' + e.message); }
}

const DOPYT_FORM = new RegExp('<form\\b[^>]*data-k-dopyt[^>]*>[\\s\\S]*?</form>', 'g');
const POVINNE_POLIA = ['contact[name]', 'contact[phone]', 'contact[email]', 'contact[Čo rieši]', 'contact[Súhlas]'];
let pocetDopytov = 0;
for (const subor of formularove) {
  const text = fs.readFileSync(subor, 'utf8');
  const formy = text.match(DOPYT_FORM) || [];
  pocetDopytov += formy.length;
  formy.forEach((form) => {
    if (!/<form\b[^>]*\bmethod="post"/i.test(form)) nalez(subor, 'dopyt nemá method="post"');
    for (const meno of POVINNE_POLIA) {
      if (!form.includes('name="' + meno + '"')) nalez(subor, 'dopytu chýba pole ' + meno);
    }
    if (!/type="submit"/i.test(form)) nalez(subor, 'dopytu chýba odosielacie tlačidlo');
  });
}
if (!pocetDopytov) nalezy.push('shopify-tema/snippets: nenašiel sa žiadny celý dopytový formulár');

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
