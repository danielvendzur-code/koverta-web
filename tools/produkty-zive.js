#!/usr/bin/env node
'use strict';
/* Jediný zdroj pravdy o tom, ktoré produktové adresy na koverta.sk naozaj
 * odpovedajú 200.
 *
 * Statický web (rozmerové stránky, sitemap, llms.txt) smie ukazovať na
 * produkt len vtedy, keď produkt naozaj existuje. Kým je produkt v Shopify
 * draft, jeho adresa vracia 404 — a canonical na 404 je horší než žiadny.
 *
 *   node tools/produkty-zive.js           overí naživo (HEAD na koverta.sk)
 *                                         a zapíše tools/produkty-zive.json
 *   node tools/produkty-zive.js --check   len skontroluje tvar súboru
 *
 * Overuje sa každý nový handle (pristresok-koverta-WxL) aj starý handle
 * z tools/shopify-product-redirects.json — starý je náhradný cieľ, kým
 * nový nie je živý. Po aktivácii produktov stačí nástroj spustiť znova
 * (robí to aj plánovaný workflow) a canonical sa prepne sám, bez zmeny kódu.
 *
 * Presmerovanie (3xx) sa neráta ako živá adresa: canonical musí ukazovať
 * priamo na cieľ, nie na presmerovanie. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CIEL = path.join(ROOT, 'tools', 'produkty-zive.json');
const MAPA = path.join(ROOT, 'tools', 'shopify-product-redirects.json');
const DOMENA = process.env.KV_DOMENA || 'https://koverta.sk';

function zoznam() {
  const data = JSON.parse(fs.readFileSync(MAPA, 'utf8'));
  return data.redirects.map((r) => ({ nove: r.new_handle, stare: r.old_handle }));
}

function skontroluj(data) {
  const chyby = [];
  if (!data || typeof data !== 'object') chyby.push('súbor nie je objekt');
  if (!data.overene || Number.isNaN(Date.parse(data.overene))) chyby.push('chýba čas overenia');
  for (const kluc of ['nove', 'stare']) {
    if (!data[kluc] || typeof data[kluc] !== 'object') { chyby.push('chýba ' + kluc); continue; }
    for (const [h, v] of Object.entries(data[kluc])) {
      if (!/^[a-z0-9-]+$/.test(h)) chyby.push('neplatný handle ' + h);
      if (typeof v !== 'boolean') chyby.push(h + ': hodnota musí byť true/false');
    }
  }
  const pary = zoznam();
  for (const p of pary) {
    if (!(p.nove in (data.nove || {}))) chyby.push('chýba nový handle ' + p.nove);
    if (!(p.stare in (data.stare || {}))) chyby.push('chýba starý handle ' + p.stare);
  }
  return chyby;
}

async function zije(handle) {
  for (let pokus = 0; pokus < 3; pokus++) {
    try {
      const r = await fetch(DOMENA + '/products/' + handle, { method: 'HEAD', redirect: 'manual' });
      return r.status === 200;
    } catch (e) {
      if (pokus === 2) throw new Error(handle + ': ' + e.message);
      await new Promise((ok) => setTimeout(ok, 1000 * (pokus + 1)));
    }
  }
  return false;
}

async function main() {
  if (process.argv.includes('--check')) {
    const chyby = skontroluj(JSON.parse(fs.readFileSync(CIEL, 'utf8')));
    if (chyby.length) { console.error(chyby.join('\n')); process.exit(1); }
    const d = JSON.parse(fs.readFileSync(CIEL, 'utf8'));
    console.log('produkty-zive.json OK: živých nových ' + Object.values(d.nove).filter(Boolean).length
      + '/' + Object.keys(d.nove).length + ', starých ' + Object.values(d.stare).filter(Boolean).length
      + '/' + Object.keys(d.stare).length + ' (overené ' + d.overene + ')');
    return;
  }
  const vysledok = { overene: new Date().toISOString(), zdroj: DOMENA + ' HEAD', nove: {}, stare: {} };
  for (const p of zoznam()) {
    vysledok.nove[p.nove] = await zije(p.nove);
    vysledok.stare[p.stare] = await zije(p.stare);
  }
  /* Ak nežije nič, ani staré produkty, ktoré v obchode roky sú, nejde
     o stav obchodu, ale o zablokovaný beh (ochrana proti robotom, výpadok).
     Taký výsledok sa nezapíše. */
  if (!Object.values(vysledok.nove).some(Boolean) && !Object.values(vysledok.stare).some(Boolean)) {
    throw new Error('žiadna produktová adresa neodpovedala 200 — beh je zablokovaný, súbor ostáva bez zmeny');
  }
  /* Čas overenia sa mení pri každom behu; súbor sa prepíše len vtedy, keď sa
     zmenilo, čo žije — inak by plánovaný beh commitoval každých šesť hodín. */
  const stary = fs.existsSync(CIEL) ? JSON.parse(fs.readFileSync(CIEL, 'utf8')) : null;
  if (stary && JSON.stringify([stary.nove, stary.stare]) === JSON.stringify([vysledok.nove, vysledok.stare])) {
    console.log('Bez zmeny.');
    return;
  }
  fs.writeFileSync(CIEL, JSON.stringify(vysledok, null, 2) + '\n');
  console.log('Zapísané: živých nových ' + Object.values(vysledok.nove).filter(Boolean).length
    + '/66, starých ' + Object.values(vysledok.stare).filter(Boolean).length + '/66');
}

module.exports = { skontroluj };
if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
