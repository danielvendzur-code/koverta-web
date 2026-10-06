#!/usr/bin/env node
/* Vytvorí PDF s technickými požiadavkami na podklad z poziadavky.sablona
   (HTML; prípona iná, aby ju kontrola SEO nepovažovala za stránku webu)
   (nákresy berie z assets/koverta-podklad-*.webp).
     node tools/podklad-pdf/vytvor.cjs
   Výstup: assets/koverta-technicke-poziadavky-na-podklad.pdf */
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

(async () => {
  const koren = path.join(__dirname, '..', '..');
  const b = await chromium.launch();
  const p = await b.newPage();
  // Dočasná kópia vedľa šablóny, aby platili relatívne cesty k obrázkom.
  const docasny = path.join(__dirname, '_tlac.html');
  fs.copyFileSync(path.join(__dirname, 'poziadavky.sablona'), docasny);
  try { await p.goto('file://' + docasny, { waitUntil: 'load' }); } finally { fs.unlinkSync(docasny); }
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.join(koren, 'assets', 'koverta-technicke-poziadavky-na-podklad.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('Hotovo: assets/koverta-technicke-poziadavky-na-podklad.pdf');
})();
