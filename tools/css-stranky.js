#!/usr/bin/env node
/* Menšie štýly hlavných stránok, vždy zo spoločného zdroja.
 * Vynecháva sa iba selektor vyžadujúci triedu, ktorá nie je v HTML ani
 * v skripte. Dynamické triedy, pseudofunkcie, fonty a animácie zostávajú.
 * Poradie pravidiel, deklarácie a mediálne podmienky sa nemenia.
 * Závislosť pre zostavenie: npm install --no-save postcss@8.5.28
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const { zmensiCss } = require('./zmensi-css.js');
const KOREN = path.resolve(__dirname, '..');
const STRANKY = {
  uvod: 'index.html',
  'pristresky-pre-auta': 'pristresky-pre-auta/index.html',
  'zahradne-pristresky': 'zahradne-pristresky/index.html',
  'bioklimaticke-pergoly': 'bioklimaticke-pergoly/index.html',
  realizacie: 'realizacie/index.html',
  kontakt: 'kontakt/index.html'
};
function vyrobStylyStranok(kontrola = false) {
  const zdroj = fs.readFileSync(path.join(KOREN, 'assets/koverta-2026.zdroj.css'), 'utf8');
  // Všetky naše skripty: aj budúca trieda vložená konfigurátorom zostane.
  const skripty = ['assets', 'shopify-zdroj', 'konfigurator'].flatMap((adresar) => {
    const prejdi = (kde) => fs.readdirSync(kde, { withFileTypes: true }).flatMap((p) => {
      const subor = path.join(kde, p.name);
      return p.isDirectory() ? prejdi(subor) : p.name.endsWith('.js') ? [fs.readFileSync(subor, 'utf8')] : [];
    });
    return prejdi(path.join(KOREN, adresar));
  }).join('\n');
  const triedySkriptov = new Set(skripty.match(/(?:kh-|kv-|kf(?:-|__)|k-)[\w-]+/g) || []);
  for (const [meno, subor] of Object.entries(STRANKY)) {
    const html = fs.readFileSync(path.join(KOREN, subor), 'utf8');
    const dostupnost = new Map();
    const jeDostupna = (trieda) => {
      if (!dostupnost.has(trieda)) dostupnost.set(trieda, html.includes(trieda) || triedySkriptov.has(trieda)
        || (trieda.includes('--') && triedySkriptov.has(trieda.split('--')[0] + '--')));
      return dostupnost.get(trieda);
    };
    const strom = postcss.parse(zdroj);
    strom.walkRules((pravidlo) => {
      if (pravidlo.parent.type === 'atrule' && /keyframes$/.test(pravidlo.parent.name)) return;
      const selektory = pravidlo.selectors.filter((selektor) => {
        // :not/:is/:where/:has nie sú súčin podmienok; bezpečne ich ponecháme.
        if (/[\\(]/.test(selektor)) return true;
        return [...selektor.matchAll(/\.((?:kh-|kv-|kf(?:-|__)|k-)[\w-]+)/g)].every((m) => {
          const trieda = m[1];
          return jeDostupna(trieda);
        });
      });
      if (selektory.length) pravidlo.selectors = selektory;
      else pravidlo.remove();
    });
    // Prázdne @media nemajú čo prenášať; ostatné at-pravidlá ostávajú.
    strom.walkAtRules((p) => { if (p.nodes && !p.nodes.length) p.remove(); });
    const vysledok = '/* Generované zo spoločného koverta-2026.zdroj.css — neupravuj ručne. */\n' + zmensiCss(strom.toString()) + '\n';
    const ciel = path.join(KOREN, 'assets', 'koverta-2026-' + meno + '.css');
    if (kontrola) {
      if (!fs.existsSync(ciel) || fs.readFileSync(ciel, 'utf8') !== vysledok) throw new Error(path.basename(ciel) + ' nezodpovedá zdroju');
    } else fs.writeFileSync(ciel, vysledok);
    console.log(path.basename(ciel) + ': ' + Buffer.byteLength(vysledok) + ' B');
  }
}
module.exports = { vyrobStylyStranok, STRANKY };
if (require.main === module) vyrobStylyStranok(process.argv.includes('--kontrola'));
