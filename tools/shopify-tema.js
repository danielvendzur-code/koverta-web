#!/usr/bin/env node
/* Zo statického webu vyrobí tému pre Shopify.
 *
 * Prečo prevodník a nie ručný prepis: stránok je 84 a všetky zdieľajú tú istú
 * hlavičku, pätičku, štýl a skripty. Keby sa prepísali ručne, vznikli by dve
 * kópie toho istého webu a každá oprava by sa musela robiť dvakrát. Takto
 * ostáva statický web zdrojom pravdy, téma sa z neho vygeneruje a rozdiel
 * medzi nimi nemôže vzniknúť.
 *
 *   node tools/shopify-tema.js             vyrobí priečinok shopify-tema/
 *   node tools/shopify-tema.js --kontrola  len overí, či sa dá previesť
 *
 * Čo kam ide
 * ----------
 * Priečinok `assets` v téme je plochý a má strop na veľkosti. Náš `assets/`
 * má 218 MB v 1309 súboroch, takže sa doň celý nezmestí a ani nepatrí:
 *
 *   téma (assets/)   štýl, skripty, fonty, SVG, 3D konfigurátor
 *   Súbory obchodu   fotografie, videá a modely vybavenia (.bin.gz)
 *
 * Odkazy na prvú skupinu sa prepíšu na `{{ 'meno' | asset_url }}`, na druhú
 * na `{{ 'meno' | file_url }}`. Zoznam pre druhú skupinu ide do
 * `shopify-tema/SUBORY-DO-OBCHODU.txt`; nahráva ich skript, nie človek.
 *
 * Adresy stránok
 * --------------
 * Shopify má stránky v jednej rovine, podpriečinky nepozná. `/kontakt/` sa
 * preto stane `/pages/kontakt` a `/pristresky-pre-auta/rozmer/4000x6000/`
 * sa stane `/pages/pristresky-pre-auta-rozmer-4000x6000`. Prevodník prepíše
 * každý vnútorný odkaz, takže na webe neostane cesta, ktorá nikam nevedie.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const CIEL = path.join(KOREN, 'shopify-tema');
const LEN_KONTROLA = process.argv.includes('--kontrola');

const PRESKOC = new Set(['node_modules', '.git', 'coordination', 'qa-artifacts',
  'archiv-expivi', 'shopify-tema', 'tools', 'test', 'interny-odhad-patiek']);

/* Prípony, ktoré Shopify prijme medzi assety témy. */
const DO_TEMY = new Set(['.css', '.js', '.woff2', '.woff', '.svg']);

const chyby = [];
const doObchodu = new Map();   // meno v obchode → cesta na disku
const doTemy = new Map();      // meno v téme → cesta na disku

/* ---------------------------------------------------------------- stránky */

function najdiStranky(adresar, zoznam = []) {
  for (const p of fs.readdirSync(adresar, { withFileTypes: true })) {
    if (PRESKOC.has(p.name)) continue;
    const cesta = path.join(adresar, p.name);
    if (p.isDirectory()) najdiStranky(cesta, zoznam);
    else if (p.name.endsWith('.html')) zoznam.push(cesta);
  }
  return zoznam;
}

function adresa(subor) {
  const rel = path.relative(KOREN, subor).replace(/\\/g, '/');
  if (rel === 'index.html') return { druh: 'index', handle: 'index', url: '/', cesta: '' };
  const cesta = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return { druh: 'stranka', handle: cesta.replace(/\//g, '-'), url: '/pages/' + cesta.replace(/\//g, '-'), cesta };
}

/* ---------------------------------------------------------------- prepisy */

function naSubor(url) {
  const bez = url.split('?')[0].split('#')[0];
  const m = bez.match(/(?:^|\/)assets\/(.+)$/);
  if (!m) return null;
  const vnutri = m[1];
  const naDisku = path.join(KOREN, 'assets', vnutri);
  if (!fs.existsSync(naDisku)) { chyby.push('chýba súbor: assets/' + vnutri); return null; }
  /* Podpriečinky v téme neexistujú, meno sa preto splošti: `foto/a.webp`
     sa stane `foto-a.webp`. Rovnako v Súboroch obchodu, aby sa dve rôzne
     fotografie s rovnakým menom neprebili. */
  const meno = vnutri.replace(/\//g, '-');
  if (DO_TEMY.has(path.extname(vnutri).toLowerCase())) {
    doTemy.set(meno, naDisku);
    return "{{ '" + meno + "' | asset_url }}";
  }
  doObchodu.set(meno, path.relative(KOREN, naDisku));
  return "{{ '" + meno + "' | file_url }}";
}

/* Skripty a štýly konfigurátora. Ležia mimo `assets/`, ale do témy patria. */
function naKonfigurator(url) {
  const bez = url.split('?')[0].split('#')[0];
  const m = bez.match(/(?:^|\/)konfigurator\/([^/]+\.(?:js|css|svg))$/);
  if (!m) return null;
  const naDisku = path.join(KOREN, 'konfigurator', m[1]);
  if (!fs.existsSync(naDisku)) { chyby.push('chýba súbor: konfigurator/' + m[1]); return null; }
  const meno = 'kfg-' + m[1];
  doTemy.set(meno, naDisku);
  return "{{ '" + meno + "' | asset_url }}";
}

function naStranku(url, mapa) {
  const oddel = url.search(/[?#]/);
  const cela = oddel === -1 ? url : url.slice(0, oddel);
  const chvost = oddel === -1 ? '' : url.slice(oddel);
  const kluc = cela.replace(/^(?:\.\.\/)+/, '').replace(/^\.\//, '').replace(/^\//, '')
    .replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');
  if (kluc === '') return '/' + chvost;
  if (!mapa.has(kluc)) return null;
  return mapa.get(kluc) + chvost;
}

/* Jeden prechod cez hodnoty atribútov. Reťazec náhrad by prepísal už
   prepísanú cestu druhýkrát, preto sa každá hodnota spracuje raz. */
const ATRIBUTY = /\b(src|href|srcset|imagesrcset|poster|content|data-k-video|data-k-video-webm|data-k-menu-src|data-k-lupa)="([^"]*)"/g;

function prepis(html, mapa) {
  return html.replace(ATRIBUTY, (cele, meno, hodnota) => {
    if (/^(?:https?:|mailto:|tel:|data:|#|\{\{)/.test(hodnota)) return cele;
    const kusy = (meno === 'srcset' || meno === 'imagesrcset') ? hodnota.split(',') : [hodnota];
    let zmenene = false;
    const nove = kusy.map((kus) => {
      const t = kus.trim();
      const [cesta, ...zvysok] = t.split(/\s+/);
      const nova = naSubor(cesta) || naKonfigurator(cesta) ||
        (/\.(?:html|\/)$|^\.\.?\//.test(cesta) ? naStranku(cesta, mapa) : null);
      if (!nova) return kus;
      zmenene = true;
      return (kusy.length > 1 ? ' ' : '') + [nova, ...zvysok].join(' ');
    });
    return zmenene ? meno + '="' + nove.join(',').trim() + '"' : cele;
  });
}

/* ---------------------------------------------------------------- časti */

function vyrez(html, zaciatok, koniec, kde) {
  const a = html.indexOf(zaciatok);
  if (a === -1) { chyby.push(kde + ': nenašiel som ' + zaciatok); return ''; }
  const b = html.indexOf(koniec, a);
  if (b === -1) { chyby.push(kde + ': nenašiel som ' + koniec); return ''; }
  return html.slice(a, b + koniec.length);
}

/* ---------------------------------------------------------------- beh */

function preved() {
  const zoznam = najdiStranky(KOREN);
  const mapa = new Map();
  for (const s of zoznam) { const a = adresa(s); if (a.cesta) mapa.set(a.cesta, a.url); }

  const hlavicky = new Set();
  const paticky = new Set();
  const sablony = [];

  for (const subor of zoznam) {
    const kde = path.relative(KOREN, subor);
    const html = fs.readFileSync(subor, 'utf8');
    const a = adresa(subor);

    const hlavicka = prepis(vyrez(html, '<header class="kv-header"', '</header>', kde), mapa);
    const paticka = prepis(vyrez(html, '<footer class="k kf"', '</footer>', kde), mapa);
    const hlavny = prepis(vyrez(html, '<main', '</main>', kde), mapa);
    if (hlavicka) hlavicky.add(hlavicka);
    if (paticka) paticky.add(paticka);

    /* Titulok a popis si na Shopify nesie stránka sama, preto sa z hlavy
       neberú. Ostatné značky v hlave sú na všetkých stránkach rovnaké. */
    sablony.push({ a, hlavny, kde });
  }

  if (hlavicky.size !== 1) chyby.push('hlavička nie je na všetkých stránkach rovnaká (' + hlavicky.size + ' verzií)');
  if (paticky.size !== 1) chyby.push('pätička nie je na všetkých stránkach rovnaká (' + paticky.size + ' verzií)');

  return { zoznam, sablony, hlavicka: [...hlavicky][0] || '', paticka: [...paticky][0] || '' };
}

if (require.main === module) {
  const { zoznam, sablony, hlavicka, paticka } = preved();
  console.log('Stránok: ' + zoznam.length);
  console.log('Do témy: ' + doTemy.size + ' súborov');
  console.log('Do Súborov obchodu: ' + doObchodu.size + ' súborov');
  console.log('Hlavička a pätička: ' + (hlavicka && paticka ? 'jedna spoločná verzia' : 'PROBLÉM'));

  if (chyby.length) {
    console.error('\nNálezy (' + chyby.length + '):');
    for (const ch of [...new Set(chyby)].slice(0, 12)) console.error('  ' + ch);
  }
  if (LEN_KONTROLA) process.exit(chyby.length ? 1 : 0);
  if (chyby.length) { console.error('\nPrevod sa nespustil, kým nálezy trvajú.'); process.exit(1); }

  for (const p of ['layout', 'sections', 'templates', 'assets', 'config', 'locales']) {
    fs.mkdirSync(path.join(CIEL, p), { recursive: true });
  }
  fs.writeFileSync(path.join(CIEL, 'sections', 'hlavicka.liquid'), hlavicka + '\n{% schema %}\n{"name":"Hlavička"}\n{% endschema %}\n');
  fs.writeFileSync(path.join(CIEL, 'sections', 'paticka.liquid'), paticka + '\n{% schema %}\n{"name":"Pätička"}\n{% endschema %}\n');
  for (const s of sablony) {
    const meno = s.a.druh === 'index' ? 'index.liquid' : 'page.' + s.a.handle + '.liquid';
    fs.writeFileSync(path.join(CIEL, 'templates', meno), s.hlavny + '\n');
  }
  for (const [meno, zdroj] of doTemy) fs.copyFileSync(zdroj, path.join(CIEL, 'assets', meno));
  fs.writeFileSync(path.join(CIEL, 'SUBORY-DO-OBCHODU.txt'),
    'Súbory do Nastavenia → Súbory. Prvý stĺpec je meno v obchode.\n\n' +
    [...doObchodu].map(([m, z]) => m + '\t' + z).sort().join('\n') + '\n');

  console.log('\nHotovo: shopify-tema/ (' + sablony.length + ' šablón)');
}

module.exports = { adresa, najdiStranky, preved };
