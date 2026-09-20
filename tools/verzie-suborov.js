#!/usr/bin/env node
/* Otisk súboru v adrese, ktorou si ho stránka pýta.
 *
 * Štýl aj konfigurátor sa načítavajú s `?v=…`. Ten prívesok je jediné, čo
 * prehliadaču povie, že súbor je iný než ten, ktorý má v pamäti — samotná
 * cesta sa nemení. Kým sa prívesok písal ručne, dalo sa naň zabudnúť: opravené
 * `scene-life.js` z 18. septembra išlo von s prívesom `v=20260913-canvas-layer`
 * z 13. septembra, takže každý, kto stránku navštívil predtým, dostal zo
 * svojej pamäte starú verziu. Auto v nej prešlo tónovacou krivkou dvakrát
 * a vyzeralo priesvitne a bledomodro — presne tá chyba, ktorá bola opravená.
 *
 * Prívesok sa preto neudržiava ručne: je to prvých desať znakov SHA-1 obsahu
 * súboru. Zmení sa obsah, zmení sa prívesok, a zabudnúť sa nedá.
 *
 *   node tools/verzie-suborov.js          skontroluje a vypíše nesúlad
 *   node tools/verzie-suborov.js --oprav  prepíše prívesky na správne
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KOREN = path.resolve(__dirname, '..');
const OPRAV = process.argv.includes('--oprav');
const PRESKOC = new Set(['node_modules', '.git', 'coordination']);

function html(adresar, zoznam = []) {
  for (const polozka of fs.readdirSync(adresar, { withFileTypes: true })) {
    if (PRESKOC.has(polozka.name)) continue;
    const cesta = path.join(adresar, polozka.name);
    if (polozka.isDirectory()) html(cesta, zoznam);
    else if (polozka.name.endsWith('.html')) zoznam.push(cesta);
  }
  return zoznam;
}

const otiskyVyrovnanie = new Map();
function otisk(subor) {
  if (!otiskyVyrovnanie.has(subor)) {
    otiskyVyrovnanie.set(subor, crypto.createHash('sha1').update(fs.readFileSync(subor)).digest('hex').slice(0, 10));
  }
  return otiskyVyrovnanie.get(subor);
}

/* Berie sa len to, čo leží v repozitári. Cudzie adresy (Shopify a spol.) majú
   svoj vlastný prívesok a do neho nám nič nie je. */
const ODKAZ = /(\bsrc|\bhref)="([^"]+?)\?v=([^"]*)"/g;

const nesulad = [];
let opravenych = 0;

for (const stranka of html(KOREN)) {
  const povodne = fs.readFileSync(stranka, 'utf8');
  const nove = povodne.replace(ODKAZ, (cele, atribut, adresa, verzia) => {
    if (/^(?:[a-z]+:)?\/\//i.test(adresa)) return cele;
    const cielovy = adresa.startsWith('/')
      ? path.join(KOREN, adresa)
      : path.resolve(path.dirname(stranka), adresa);
    if (!fs.existsSync(cielovy)) {
      nesulad.push({ stranka, adresa, dovod: 'súbor neexistuje' });
      return cele;
    }
    const spravna = otisk(cielovy);
    if (spravna === verzia) return cele;
    nesulad.push({ stranka, adresa, dovod: 'v=' + verzia + ' namiesto v=' + spravna });
    return atribut + '="' + adresa + '?v=' + spravna + '"';
  });
  if (OPRAV && nove !== povodne) { fs.writeFileSync(stranka, nove); opravenych++; }
}

if (OPRAV) {
  console.log('Prepísaných stránok: ' + opravenych + ', odkazov: ' + nesulad.length);
  process.exit(0);
}

if (!nesulad.length) {
  console.log('Všetky prívesky ?v= sedia s obsahom súborov.');
  process.exit(0);
}

const podlaAdresy = new Map();
for (const z of nesulad) {
  const kluc = z.adresa + ' — ' + z.dovod;
  podlaAdresy.set(kluc, (podlaAdresy.get(kluc) || 0) + 1);
}
console.error('Prívesok ?v= nesedí s obsahom súboru. Prehliadač, ktorý stránku');
console.error('už raz videl, dostane zo svojej pamäte starú verziu.\n');
for (const [kluc, pocet] of [...podlaAdresy].sort()) console.error('  ' + kluc + '   (' + pocet + '× )');
console.error('\nSpravte to príkazom: node tools/verzie-suborov.js --oprav');
process.exit(1);
