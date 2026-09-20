#!/usr/bin/env node
/* Zo statického webu vyrobí tému pre Shopify.
 *
 * Prečo prevodník a nie ručný prepis: stránok je 83 a všetky zdieľajú tú istú
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
 *   téma (assets/)   štýl, skripty, fonty, SVG, súbory konfigurátora
 *   Súbory obchodu   fotografie, videá a modely vybavenia (.bin.gz)
 *
 * Odkazy na prvú skupinu sa prepíšu na `{{ 'meno' | asset_url }}`, na druhú
 * na `{{ 'meno' | file_url }}`. Zoznam pre druhú skupinu ide do
 * `shopify-tema/SUBORY-DO-OBCHODU.txt`.
 *
 * Adresy stránok
 * --------------
 * Shopify má stránky v jednej rovine, podpriečinky nepozná. `/kontakt/` sa
 * stane `/pages/nove-kontakt`. Predpona je tu preto, že na obchode už osemnásť
 * stránok s týmito adresami existuje a majiteľ chce nové vedľa starých, nie
 * namiesto nich. Až sa bude prepínať, stačí `PREDPONA` vyprázdniť a téma sa
 * vygeneruje na čisté adresy.
 *
 * Formulár
 * --------
 * Dopyt vybavuje aplikácia Formful (formulár `form_LaKRq0tyt4`). Na pláne
 * Starter nemá adresu, na ktorú by sa dal poslať vlastný formulár, ale má
 * volanie `Formful.openDialog(...)`. Naše tlačidlo teda ostáva naše a otvorí
 * jej dialóg — aj s prílohami, captchou a e-mailom na obchod@koverta.sk.
 * Blok aplikácie treba raz umiestniť v editore témy; bez neho sa skript
 * Formfulu na stránku nedostane a dialóg sa neotvorí.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const CIEL = path.join(KOREN, 'shopify-tema');
const LEN_KONTROLA = process.argv.includes('--kontrola');

/* Predpona adries nových stránok. Prázdny reťazec = čisté adresy. */
const PREDPONA = process.env.KV_PREDPONA !== undefined ? process.env.KV_PREDPONA : 'nove-';

/* Formulár v aplikácii Formful. */
const FORMFUL = 'form_LaKRq0tyt4';

const PRESKOC = new Set(['node_modules', '.git', 'coordination', 'qa-artifacts',
  'archiv-expivi', 'shopify-tema', 'tools', 'test', 'interny-odhad-patiek']);

const DO_TEMY = new Set(['.css', '.js', '.woff2', '.woff', '.svg']);

const chyby = [];
const doObchodu = new Map();
const doTemy = new Map();

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
  if (rel === 'index.html') return { druh: 'index', handle: PREDPONA + 'uvod', url: '/pages/' + PREDPONA + 'uvod', cesta: '' };
  const cesta = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  const handle = PREDPONA + cesta.replace(/\//g, '-');
  return { druh: 'stranka', handle, url: '/pages/' + handle, cesta };
}

/* ---------------------------------------------------------------- prepisy */

function naSubor(url) {
  const bez = url.split('?')[0].split('#')[0];
  const m = bez.match(/(?:^|\/)assets\/(.+)$/);
  if (!m) return null;
  const vnutri = m[1];
  const naDisku = path.join(KOREN, 'assets', vnutri);
  if (!fs.existsSync(naDisku)) { chyby.push('chýba súbor: assets/' + vnutri); return null; }
  /* Podpriečinky v téme neexistujú, meno sa preto splošti: `foto/a.webp` sa
     stane `foto-a.webp`. Rovnako v Súboroch obchodu, aby sa dve rôzne
     fotografie s rovnakým menom neprebili. */
  const meno = vnutri.replace(/\//g, '-');
  if (DO_TEMY.has(path.extname(vnutri).toLowerCase())) {
    doTemy.set(meno, naDisku);
    return "{{ '" + meno + "' | asset_url }}";
  }
  doObchodu.set(meno, path.relative(KOREN, naDisku));
  return "{{ '" + meno + "' | file_url }}";
}

function naKonfigurator(url) {
  const bez = url.split('?')[0].split('#')[0];
  const m = bez.match(/(?:^|\/)konfigurator\/([^/]+\.(?:js|css|svg))$/) ||
            (/^\.\/[^/]+\.(?:js|css|svg)$/.test(bez) ? [, bez.slice(2)] : null);
  if (!m) return null;
  const naDisku = path.join(KOREN, 'konfigurator', m[1]);
  if (!fs.existsSync(naDisku)) return null;
  const meno = 'kfg-' + m[1];
  doTemy.set(meno, naDisku);
  return "{{ '" + meno + "' | asset_url }}";
}

/* Odkaz na inú stránku. Rieši sa voči priečinku stránky, na ktorej stojí —
   `../8000x3000/` zo stránky rozmeru 4×6 m nie je `8000x3000` od koreňa, ale
   susedný rozmer v tom istom priečinku. */
function naStranku(url, mapa, zaklad) {
  const oddel = url.search(/[?#]/);
  const cela = oddel === -1 ? url : url.slice(0, oddel);
  const chvost = oddel === -1 ? '' : url.slice(oddel);
  if (!cela) return null;
  const absolutna = cela.startsWith('/')
    ? cela.slice(1)
    : path.posix.normalize(path.posix.join(zaklad || '', cela));
  const kluc = absolutna.replace(/\/index\.html$/, '').replace(/\.html$/, '')
    .replace(/\/$/, '').replace(/^\.$/, '');
  if (!mapa.has(kluc)) return null;
  return mapa.get(kluc) + chvost;
}

const ATRIBUTY = /\b(src|href|srcset|imagesrcset|poster|content|data-k-video|data-k-video-webm|data-k-menu-src|data-k-lupa|action)="([^"]*)"/g;

function prepis(html, mapa, zaklad) {
  return html.replace(ATRIBUTY, (cele, meno, hodnota) => {
    if (/^(?:https?:|mailto:|tel:|data:|#|\{\{|\{%)/.test(hodnota)) return cele;
    const kusy = (meno === 'srcset' || meno === 'imagesrcset') ? hodnota.split(',') : [hodnota];
    let zmenene = false;
    const nove = kusy.map((kus) => {
      const t = kus.trim();
      const [cesta, ...zvysok] = t.split(/\s+/);
      const nova = naSubor(cesta) || naKonfigurator(cesta) || naStranku(cesta, mapa, zaklad);
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

/* Rozpad na samostatné prvky, aby sa dalo povedať, čo majú stránky spoločné
   a čo si nesie každá sama. */
function prvky(text) {
  const von = [];
  const vzor = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>|<(?:link|meta|base)\b[^>]*>/g;
  let m;
  while ((m = vzor.exec(text))) von.push(m[0]);
  return von;
}

/* Značky, ktoré si na Shopify robí stránka sama alebo ich dodá obchod. */
function shopifyRobiSam(prvok) {
  return /<title|<meta name="description"|<link rel="canonical"|<meta property="og:|<meta name="twitter:|application\/ld\+json|<link rel="preload"|<meta charset|<meta name="viewport"/i.test(prvok);
}

/* ---------------------------------------------------------------- beh */

function preved() {
  /* Modely vybavenia si konfigurátor načítava sám za behu, takže na ne
     v značkovaní nič neukazuje a prevodník by ich prehliadol. */
  const modely = path.join(KOREN, 'konfigurator', 'scene-assets');
  for (const m of fs.readdirSync(modely)) {
    if (m.endsWith('.bin.gz')) doObchodu.set(m, path.relative(KOREN, path.join(modely, m)));
  }

  const zoznam = najdiStranky(KOREN);
  const mapa = new Map();
  for (const s of zoznam) { const a = adresa(s); mapa.set(a.cesta, a.url); }

  const hlavicky = new Set();
  const paticky = new Set();
  const sablony = [];
  const hlavaPocty = new Map();   // prvok hlavy → na koľkých stránkach je
  const chvostPocty = new Map();

  const rozobrane = zoznam.map((subor) => {
    const kde = path.relative(KOREN, subor);
    const html = fs.readFileSync(subor, 'utf8');
    const a = adresa(subor);
    /* Základ pre relatívne odkazy je priečinok súboru, nie jeho adresa.
       `404.html` leží v koreni, hoci jeho adresa je `404`. */
    const zaklad = path.dirname(path.relative(KOREN, subor)).replace(/^\.$/, '').replace(/\\/g, '/');

    const hlavicka = prepis(vyrez(html, '<header class="kv-header"', '</header>', kde), mapa, zaklad);
    let paticka = prepis(vyrez(html, '<footer class="k kf"', '</footer>', kde), mapa, zaklad);
    const dopyt = (paticka.match(/<a class="k-btn k-btn--primary" href="([^"]*#ponuka)"/) || [, '#ponuka'])[1];
    paticka = paticka.replace(/(<a class="k-btn k-btn--primary" href=")[^"]*#ponuka(")/, '$1{{ kv_dopyt }}$2');
    let hlavny = prepis(vyrez(html, '<main', '</main>', kde), mapa, zaklad);

    /* Náš formulár nemá na pláne Starter kam posielať. Tlačidlo ostáva naše
       a otvorí dialóg Formfulu; ten nesie prílohy aj captchu. */
    hlavny = hlavny.replace(/<form id="dopyt"[\s\S]*?<\/form>/,
      '<p class="kh-form__vyzva"><button type="button" class="k-btn k-btn--primary" ' +
      'onclick="Formful.openDialog(\'' + FORMFUL + '\')">Otvoriť formulár dopytu</button></p>');

    /* Medzi koncom hlavného obsahu a pätičkou stoja skripty, ktoré patria
       len tejto stránke — konfigurátor tam má sedem súborov. Bez tohto úseku
       by sa do témy nedostali a stránka by ostala prázdna. */
    const medzi = prepis(html.slice(html.indexOf('</main>') + 7, html.indexOf('<footer class="k kf"')), mapa, zaklad);
    const hlava = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const chvost = html.slice(html.indexOf('</footer>') + 9, html.indexOf('</body>'));
    const hlavaPrvky = prvky(hlava).filter((p) => !shopifyRobiSam(p)).map((p) => prepis(p, mapa, zaklad));
    const chvostPrvky = prvky(chvost).map((p) => prepis(p, mapa, zaklad));
    for (const p of new Set(hlavaPrvky)) hlavaPocty.set(p, (hlavaPocty.get(p) || 0) + 1);
    for (const p of new Set(chvostPrvky)) chvostPocty.set(p, (chvostPocty.get(p) || 0) + 1);

    if (hlavicka) hlavicky.add(hlavicka);
    if (paticka) paticky.add(paticka);
    return { a, kde, hlavny, medzi, dopyt, hlavaPrvky, chvostPrvky };
  });

  if (hlavicky.size !== 1) chyby.push('hlavička má ' + hlavicky.size + ' verzií');
  if (paticky.size !== 1) chyby.push('pätička má ' + paticky.size + ' verzií');

  /* Spoločné je to, čo majú všetky stránky. Zvyšok si nesie šablóna. */
  const spolocnaHlava = [...hlavaPocty].filter(([, n]) => n === zoznam.length).map(([p]) => p);
  const spolocnyChvost = [...chvostPocty].filter(([, n]) => n === zoznam.length).map(([p]) => p);
  for (const s of rozobrane) {
    s.hlavaNavyse = s.hlavaPrvky.filter((p) => !spolocnaHlava.includes(p));
    s.chvostNavyse = s.chvostPrvky.filter((p) => !spolocnyChvost.includes(p));
    sablony.push(s);
  }

  return { zoznam, sablony, spolocnaHlava, spolocnyChvost,
           hlavicka: [...hlavicky][0] || '', paticka: [...paticky][0] || '' };
}

/* ---------------------------------------------------------------- zápis */

function zapis(v) {
  /* Návod je ručne písaný a prevod ho nesmie prepísať. */
  const navod = path.join(CIEL, 'AKO-NAHRAT.md');
  const navodText = fs.existsSync(navod) ? fs.readFileSync(navod) : null;
  for (const p of ['layout', 'sections', 'templates', 'assets', 'config', 'locales', 'snippets']) {
    fs.mkdirSync(path.join(CIEL, p), { recursive: true });
  }

  const layout = `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{{ content_for_header }}
${v.spolocnaHlava.join('\n')}
</head>
<body class="{% if template.name == 'index' %}k-home{% endif %}">
<script>
  /* Skripty nesú v sebe cesty statického webu. Tu dostanú tie, ktoré platia
     v obchode: obrázky značiek a modely vybavenia sú na CDN, stránka
     o 3D modeloch je v /pages/. */
  window.KV_ADRESY = {
    znackaKoverta: {{ 'koverta-mark.svg' | asset_url | json }},
    znackaSoltec: {{ 'soltec-mark.png' | file_url | json }},
    modely: '/pages/${PREDPONA}pouzite-modely'
  };
  window.KV_SCENE_ASSETS = {{ 'bmw-g80-m3.bin.gz' | file_url | split: 'bmw-g80-m3.bin.gz' | first | json }};
</script>
{% section 'kv-hlavicka' %}
{{ content_for_layout }}
{% section 'kv-paticka' %}
${v.spolocnyChvost.join('\n')}
</body>
</html>
`;
  fs.writeFileSync(path.join(CIEL, 'layout', 'theme.liquid'), layout);

  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-hlavicka.liquid'),
    v.hlavicka + '\n{% schema %}\n{"name":"Koverta hlavička"}\n{% endschema %}\n');
  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-paticka.liquid'),
    '{%- assign kv_dopyt = kv_dopyt | default: "#ponuka" -%}\n' + v.paticka +
    '\n{% schema %}\n{"name":"Koverta pätička"}\n{% endschema %}\n');

  for (const s of v.sablony) {
    const hlava = "{%- assign kv_dopyt = '" + s.dopyt.replace(/'/g, "\\'") + "' -%}\n";
    const navyse = [...s.hlavaNavyse, ...s.chvostNavyse].join('\n');
    fs.writeFileSync(path.join(CIEL, 'templates', 'page.' + s.a.handle + '.liquid'),
      hlava + s.hlavny + (s.medzi.trim() ? '\n' + s.medzi.trim() + '\n' : '') +
      (navyse ? '\n' + navyse + '\n' : '\n'));
  }

  for (const [meno, zdroj] of doTemy) fs.copyFileSync(zdroj, path.join(CIEL, 'assets', meno));

  fs.writeFileSync(path.join(CIEL, 'config', 'settings_schema.json'),
    JSON.stringify([{ name: 'theme_info', theme_name: 'Koverta 2026',
      theme_version: '1.0.0', theme_author: 'Koverta', theme_documentation_url: 'https://koverta.sk',
      theme_support_url: 'https://koverta.sk/kontakt/' }], null, 2) + '\n');
  fs.writeFileSync(path.join(CIEL, 'config', 'settings_data.json'), '{"current":{}}\n');
  fs.writeFileSync(path.join(CIEL, 'locales', 'sk.default.json'), '{}\n');

  fs.writeFileSync(path.join(CIEL, 'SUBORY-DO-OBCHODU.txt'),
    'Súbory do Nastavenia → Súbory. Prvý stĺpec je meno v obchode.\n\n' +
    [...doObchodu].map(([m, z]) => m + '\t' + z).sort().join('\n') + '\n');

  if (navodText) fs.writeFileSync(navod, navodText);
  fs.writeFileSync(path.join(CIEL, 'STRANKY-NA-ZALOZENIE.txt'),
    'Stránky, ktoré treba založiť v Online Store → Pages.\n' +
    'Handle musí sedieť presne, inak si šablónu nenájdu.\n\n' +
    v.sablony.map((s) => s.a.handle + '\t' + s.a.url).sort().join('\n') + '\n');
}

if (require.main === module) {
  const v = preved();
  console.log('Stránok: ' + v.zoznam.length);
  console.log('Spoločná hlava: ' + v.spolocnaHlava.length + ' prvkov, spoločný chvost: ' + v.spolocnyChvost.length);
  console.log('Do témy: ' + doTemy.size + ' súborov, do Súborov obchodu: ' + doObchodu.size);
  console.log('Predpona adries: ' + (PREDPONA || '(žiadna)'));

  if (chyby.length) {
    console.error('\nNálezy (' + chyby.length + '):');
    for (const ch of [...new Set(chyby)].slice(0, 12)) console.error('  ' + ch);
  }
  if (LEN_KONTROLA) process.exit(chyby.length ? 1 : 0);
  if (chyby.length) { console.error('\nPrevod sa nespustil.'); process.exit(1); }

  zapis(v);
  console.log('\nHotovo: shopify-tema/');
}

module.exports = { adresa, najdiStranky, preved };
