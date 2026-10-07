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
  await p.pdf({ path: path.join(koren, 'assets', 'koverta-technicke-poziadavky-na-podklad.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true,
    // Päta ide do spodného okraja strany. Pevne umiestnená päta v HTML sa
    // od druhej strany vykreslila hore cez nadpis.
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;margin:0 16mm;padding-top:1.5mm;border-top:0.2mm solid #d9d7d2;display:flex;justify-content:space-between;gap:4mm;font:7pt Helvetica,Arial,sans-serif;color:#6b7075">'
      + '<span>Venaco s.r.o. · IČO 45648107 · IČ DPH SK2023076407 · J. C. Hronského 3427/6, 949 07 Nitra</span>'
      + '<span>+421 948 482 266 · obchod@koverta.sk · koverta.sk</span></div>' });
  await b.close();
  console.log('Hotovo: assets/koverta-technicke-poziadavky-na-podklad.pdf');
})();
