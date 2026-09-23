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
 * Vlastný Koverta popup posiela dopyt na serverový Resend endpoint. API kľúč
 * zostáva iba vo Verceli; v Liquid ani v JavaScripte nie je žiadne tajomstvo.
 * Formful ani Shopify Forms sa nepoužívajú.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KOREN = path.resolve(__dirname, '..');
const CIEL = path.join(KOREN, 'shopify-tema');
const LEN_KONTROLA = process.argv.includes('--kontrola');

/* Predpona adries nových stránok. Prázdny reťazec = čisté adresy. */
const PREDPONA = process.env.KV_PREDPONA !== undefined ? process.env.KV_PREDPONA : 'nove-';

/* Odkiaľ sa berú fotografie.
 *
 * Do témy sa nezmestia: 218 MB v 1309 súboroch prekročí strop aj zdravý rozum.
 * Zostávajú dve cesty a obe sú tu prepínateľné jednou premennou:
 *
 *   KV_FOTKY=pages   (predvolené) fotografie servíruje GitHub Pages z tohto
 *                    repozitára. Nenahráva sa nič; keď do repozitára pribudne
 *                    fotografia, je na webe hneď. Cesty ostávajú pôvodné.
 *   KV_FOTKY=obchod  fotografie ležia v Nastavenia → Súbory a odkazuje sa na
 *                    ne cez `file_url`. Vtedy ich treba najprv nahrať podľa
 *                    `SUBORY-DO-OBCHODU.txt`.
 *
 * Predvolené je `pages`, lebo funguje okamžite. Na dlhší čas patria fotografie
 * do Súborov obchodu — GitHub si neželá, aby sa Pages používali ako úložisko
 * obrázkov pre cudzí web, a obchod má vlastnú CDN bližšie k zákazníkovi.
 * Prepnutie je jedna premenná a nový beh prevodníka. */
const FOTKY = process.env.KV_FOTKY || 'pages';
const PAGES_ZAKLAD = process.env.KV_PAGES_ZAKLAD ||
  'https://danielvendzur-code.github.io/koverta-web';

/* GitHub Pages sa stavia z vetvy master. Súbor, ktorý na master ešte nie je
 * (nová fotka, nové video), by tam vrátil 404. Taký súbor sa preto berie
 * z jsDelivr z posledného odoslaného commitu, ktorý ho obsahuje — adresa je
 * nemenná a ide cez CDN. Keď súbor na master pribudne, prevodník sa vráti
 * k Pages sám. */
const JSDELIVR_ZAKLAD = 'https://cdn.jsdelivr.net/gh/danielvendzur-code/koverta-web@';
const naMasteri = (() => {
  try {
    return new Set(require('child_process').execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/master'],
      { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n'));
  } catch (_) { return null; }
})();
const zakladPreSubor = new Map();
function zakladPages(relCesta) {
  if (!naMasteri || naMasteri.has(relCesta)) return PAGES_ZAKLAD;
  if (zakladPreSubor.has(relCesta)) return zakladPreSubor.get(relCesta);
  const cp = require('child_process');
  let zaklad = PAGES_ZAKLAD;
  try {
    const sha = cp.execFileSync('git', ['log', '-1', '--format=%H', 'HEAD', '--', relCesta], { cwd: KOREN, encoding: 'utf8' }).trim();
    const vzdialene = sha && cp.execFileSync('git', ['branch', '-r', '--contains', sha], { cwd: KOREN, encoding: 'utf8' }).trim();
    if (sha && vzdialene) zaklad = JSDELIVR_ZAKLAD + sha;
    else console.warn('Pozor: ' + relCesta + ' nie je na master ani v odoslanom commite — najprv ho commitni a pushni, potom spusti prevodník znova.');
  } catch (_) {}
  zakladPreSubor.set(relCesta, zaklad);
  return zaklad;
}

/* Shopify nemusí pri synchronizácii prijať priveľký Liquid súbor. Sekcia sa
 * potom nahrá, no jej snippet chýba a obchod vypíše návštevníkovi „Liquid
 * error“. Galéria má stovky položiek, preto veľké telá rozdelíme na menšie
 * snippety a pôvodné meno ponecháme ako krátky zaraďovač. */
const MAX_SNIPPET_BAJTOV = 180 * 1024;

const PRESKOC = new Set(['node_modules', '.git', 'coordination', 'qa-artifacts',
  'archiv-expivi', 'shopify-tema', 'shopify-zdroj', 'tools', 'test', 'interny-odhad-patiek']);
const SHOPIFY_ZDROJ = path.join(KOREN, 'shopify-zdroj');

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

/* Stránky katalógových rozmerov. Je ich 66 a generuje ich
   `tools/generuj-rozmery.py` do `pristresky-pre-auta/rozmer/2500x5200/`
   a `zahradne-pristresky/rozmer/3000x3000/`. */
const ROZMER = /^(?:pristresky-pre-auta|zahradne-pristresky)\/rozmer\/\d+x\d+$/;

/* Kde v obchode žije obsah každej stránky: tools/adresy-obchodu.json.
   Kategórie idú na staré kolekcie, ktoré majú návštevnosť, ostatné na staré
   stránky. Handle `nove-…` ostáva menom útržku s obsahom. */
const ADRESY = JSON.parse(fs.readFileSync(path.join(KOREN, 'tools', 'adresy-obchodu.json'), 'utf8'));
function cielObchodu(cesta) {
  const z = ADRESY.stranky[cesta];
  if (!z) return null;
  if (z.url) return z;
  return Object.assign({}, z, { url: (z.typ === 'kolekcia' ? '/collections/' : '/pages/') + z.handle });
}

/* Produkty rozmerov. Kým nový produkt nie je v obchode zverejnený, jeho
   adresa vracia 404 — odkaz vtedy ide na starý produkt s tým istým
   rozmerom (tools/shopify-product-redirects.json), ktorý žije. Rozhoduje
   Liquid pri vykreslení podľa toho, čo je v kolekciách naozaj zverejnené
   (`kv_zive`, počíta ho smerovač stránky), takže po aktivácii produktov sa
   odkazy prepnú samy, bez zmeny kódu. */
const STARE_PRODUKTY = new Map(JSON.parse(fs.readFileSync(path.join(KOREN, 'tools', 'shopify-product-redirects.json'), 'utf8'))
  .redirects.map((r) => [r.new_handle, r.old_handle]));

function produktovyHandle(cesta) {
  const m = cesta.match(/^(pristresky-pre-auta|zahradne-pristresky)\/rozmer\/(\d+)x(\d+)$/);
  if (!m) return null;
  return (m[1] === 'zahradne-pristresky' ? 'zahradny-pristresok-koverta-' : 'pristresok-koverta-') + m[2] + 'x' + m[3];
}

function produktovaAdresa(cesta) {
  const h = produktovyHandle(cesta);
  if (!h) return null;
  const stary = STARE_PRODUKTY.get(h);
  if (!stary) { chyby.push('rozmer ' + cesta + ' nemá starý produkt v shopify-product-redirects.json'); return '/products/' + h; }
  return "{% if kv_zive contains '|" + h + "|' %}/products/" + h + "{% else %}/products/" + stary + "{% endif %}";
}

function adresa(subor) {
  const rel = path.relative(KOREN, subor).replace(/\\/g, '/');
  if (rel === 'index.html') {
    const h = PREDPONA + 'uvod';
    return { druh: 'index', handle: h, url: '/', odkaz: '/', cesta: '', ciel: { typ: 'domov', url: '/' } };
  }
  const cesta = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  const handle = PREDPONA + cesta.replace(/\//g, '-');
  /* Stránky rozmerov v obchode nie sú: ich obsah je produkt. */
  if (ROZMER.test(cesta)) {
    return { druh: 'stranka', handle, url: '/pages/' + handle, odkaz: produktovaAdresa(cesta), rozmer: true, cesta };
  }
  const ciel = cielObchodu(cesta);
  if (!ciel) {
    chyby.push('stránka ' + cesta + ' nemá adresu v tools/adresy-obchodu.json');
    return { druh: 'stranka', handle, url: '/pages/' + handle, odkaz: '/pages/' + handle, cesta };
  }
  return { druh: 'stranka', handle, url: ciel.url, odkaz: ciel.url, cesta, ciel };
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
  if (FOTKY === 'pages') return zakladPages('assets/' + vnutri) + '/assets/' + vnutri;
  return "{{ '" + meno + "' | file_url }}";
}

/* Súbor, ktorý leží v koreni webu a nie je ani stránka, ani `assets`:
   `site.webmanifest`. Na Shopify taká adresa neexistuje — obchod má koreň
   svoj — takže sa na ňu odkáže plnou adresou tam, kde ten súbor naozaj je. */
function naKoren(url) {
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  const bez = url.split('?')[0].split('#')[0].slice(1);
  if (!bez || bez.includes('/')) return null;
  if (!/\.(webmanifest|txt|xml|ico)$/i.test(bez)) return null;
  if (!fs.existsSync(path.join(KOREN, bez))) return null;
  return PAGES_ZAKLAD + '/' + bez;
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

const ATRIBUTY = /\b(src|href|srcset|imagesrcset|poster|content|data-k-video|data-k-video-webm|data-k-video-mobil|data-k-menu-src|data-k-lupa|action)="([^"]*)"/g;

function prepis(html, mapa, zaklad) {
  return html.replace(ATRIBUTY, (cele, meno, hodnota) => {
    if (/^(?:https?:|mailto:|tel:|data:|#|\{\{|\{%)/.test(hodnota)) return cele;
    const kusy = (meno === 'srcset' || meno === 'imagesrcset') ? hodnota.split(',') : [hodnota];
    let zmenene = false;
    const nove = kusy.map((kus) => {
      const t = kus.trim();
      const [cesta, ...zvysok] = t.split(/\s+/);
      const nova = naSubor(cesta) || naKonfigurator(cesta) || naStranku(cesta, mapa, zaklad) || naKoren(cesta);
      if (!nova) return kus;
      zmenene = true;
      return (kusy.length > 1 ? ' ' : '') + [nova, ...zvysok].join(' ');
    });
    return zmenene ? meno + '="' + nove.join(',').trim() + '"' : cele;
  });
}

/* ---------------------------------------------------------------- časti */

/* Hľadá značku mimo HTML komentárov. Komentár, ktorý spomenul „<main>",
   raz posunul začiatok obsahu doprostred seba a zvyšok komentára sa na
   stránke obchodu ukázal ako text. */
function mimoKomentara(html, co, od = 0) {
  let i = html.indexOf(co, od);
  while (i !== -1) {
    const otv = html.lastIndexOf('<!--', i), zat = html.lastIndexOf('-->', i);
    if (otv === -1 || zat > otv) return i;
    i = html.indexOf(co, html.indexOf('-->', i) + 3);
  }
  return -1;
}

function vyrez(html, zaciatok, koniec, kde) {
  const a = mimoKomentara(html, zaciatok);
  if (a === -1) { chyby.push(kde + ': nenašiel som ' + zaciatok); return ''; }
  const b = mimoKomentara(html, koniec, a);
  if (b === -1) { chyby.push(kde + ': nenašiel som ' + koniec); return ''; }
  return html.slice(a, b + koniec.length);
}

/* Rozpad na samostatné prvky, aby sa dalo povedať, čo majú stránky spoločné
   a čo si nesie každá sama. */
/* Lepivý pás „Zavolať / Nezáväzná cenová ponuka" na telefóne. Na webe stojí
 * za pätičkou; prevod z tohto úseku berie len skripty a štýly, takže do témy
 * sa nedostal a obchod na telefóne nemal po ruke telefón ani ponuku. Ide do
 * layoutu pre všetky stránky okrem produktu (ten má vlastný pás s cenou
 * a košíkom) a konfigurátora (tam sú na spodku ovládacie tlačidlá krokov).
 * Tlačidlo ponuky otvorí okno dopytu, ak je na stránke formulár; inak vedie
 * na kontakt. */
function dokObchodu() {
  const html = fs.readFileSync(path.join(KOREN, 'index.html'), 'utf8');
  const m = html.match(/<div class="kh-dock"[\s\S]*?<\/div>/);
  if (!m) { chyby.push('index.html: chýba pás kh-dock'); return ''; }
  const dok = m[0].replace(/(k-btn--primary" href=")[^"]*(")/, '$1/pages/kontakt#ponuka$2');
  return "{%- unless template.name == 'product' or page.handle == 'konfigurator' or page.handle == 'nove-konfigurator' -%}\n"
    + dok + '\n{%- endunless -%}';
}

function prvky(text) {
  const von = [];
  const vzor = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>|<(?:link|meta|base)\b[^>]*>/g;
  let m;
  while ((m = vzor.exec(text))) von.push(m[0]);
  return von;
}

/* Značky, ktoré si na Shopify robí stránka sama alebo ich dodá obchod. */
/* Absolútne adresy statického webu (https://koverta.sk/…) v JSON-LD a og:image
 * prepíše na adresy obchodu: stránky na /pages/…, rozmery na /products/…,
 * fotografie na GitHub Pages (obchod /assets/ nemá). */
function naAdresyObchodu(text, mapa) {
  return text.replace(/https:\/\/koverta\.sk\/([^"'\s<>]*)/g, (cela, zvysok) => {
    const m = zvysok.match(/^([^?#]*)([?#].*)?$/);
    const cesta = m[1], chvost = m[2] || '';
    if (/^assets\//.test(cesta)) return PAGES_ZAKLAD + '/' + cesta + chvost;
    if (cesta === '' ) return cela;
    const kluc = cesta.replace(/\/index\.html$/, '').replace(/\/$/, '');
    if (!mapa.has(kluc)) return cela;
    const ciel = mapa.get(kluc);
    return 'https://koverta.sk' + ciel + (chvost.startsWith('?') && ciel.includes('?') ? '&' + chvost.slice(1) : chvost);
  });
}

function shopifyRobiSam(prvok) {
  return /<title|<meta name="description"|<link rel="canonical"|<meta property="og:|<meta name="twitter:|application\/ld\+json|<link rel="preload"|<meta charset|<meta name="viewport"/i.test(prvok);
}

/* Adresy vnútri CSS.
 *
 * Štýl si písmo aj kresby pýta sám, cez `url(...)`, a tie adresy sú písané
 * voči priečinku, v ktorom súbor leží: `url(pismo/archivo-latin.woff2)`,
 * `url("koverta-mark-zvisla.svg")`, v konfigurátore `url(../assets/pismo/…)`.
 * V téme sú ale všetky súbory v jednej plochej zložke, takže podpriečinok
 * `pismo/` tam neexistuje a prehliadač dostane 404: Archivo sa nenačíta
 * a písmo spadne na náhradný Arial, otočená značka za Častými otázkami
 * zmizne. Značkovanie sa prepisuje, obsah CSS sa doteraz neprepisoval.
 *
 * Meno sa splošti rovnako ako pri značkovaní a odkaz ostane relatívny —
 * súbor leží vedľa štýlu v tej istej zložke témy, takže Liquid netreba
 * a `.css` sa nemusí premenúvať na `.css.liquid`. */
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function menoVTeme(naDisku) {
  const rel = path.relative(KOREN, naDisku).replace(/\\/g, '/');
  if (rel.startsWith('assets/')) return rel.slice('assets/'.length).replace(/\//g, '-');
  if (rel.startsWith('konfigurator/')) return 'kfg-' + rel.slice('konfigurator/'.length).replace(/\//g, '-');
  return rel.replace(/\//g, '-');
}

/* Zmenšenie CSS pre obchod. Zdroj ostáva s komentármi (tie vysvetľujú,
 * prečo je čo tak), do témy ide bez nich: koverta-2026.css má 562 kB a je
 * render-blocking na každej stránke. Nechávajú sa reťazce aj url(), mažú sa
 * len komentáre a nadbytočné medzery — nič, čo by zmenilo význam selektora. */
function zmensiCss(css) {
  let von = '', i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const k = css.indexOf('*/', i + 2); i = k === -1 ? css.length : k + 2; continue; }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < css.length && css[k] !== c) { if (css[k] === '\\') k++; k++; }
      von += css.slice(i, k + 1); i = k + 1; continue;
    }
    if (/\s/.test(c)) {
      while (i < css.length && /\s/.test(css[i])) i++;
      const pred = von.slice(-1), po = css[i] || '';
      if (!/[{};,>]/.test(pred) && !/[{};,>]/.test(po) && pred !== '' && po !== '') von += ' ';
      continue;
    }
    von += c; i++;
  }
  return von.replace(/;}/g, '}');
}

function prepisCss(text, zdroj) {
  return text.replace(CSS_URL, (cele, uvodzovka, adresa) => {
    if (/^(?:https?:|data:|\/\/|#|\{\{|\{%)/i.test(adresa) || !adresa.trim()) return cele;
    const bez = adresa.split('?')[0].split('#')[0];
    if (!bez) return cele;
    const naDisku = bez.startsWith('/')
      ? path.join(KOREN, bez)
      : path.resolve(path.dirname(zdroj), bez);
    if (!naDisku.startsWith(KOREN) || !fs.existsSync(naDisku)) {
      chyby.push('CSS ' + path.relative(KOREN, zdroj) + ' pýta ' + adresa + ', ten súbor nie je');
      return cele;
    }
    const meno = menoVTeme(naDisku);
    if (DO_TEMY.has(path.extname(naDisku).toLowerCase())) {
      doTemy.set(meno, naDisku);
      return 'url(' + meno + ')';
    }
    /* Fotografia v CSS. Do témy sa nezmestí a `file_url` je Liquid, ktorý
       obyčajné `.css` nevie — preto plná adresa, tá platí vždy. */
    doObchodu.set(meno, path.relative(KOREN, naDisku));
    if (FOTKY === 'pages') return 'url(' + PAGES_ZAKLAD + '/' + path.relative(KOREN, naDisku).replace(/\\/g, '/') + ')';
    chyby.push('CSS ' + path.relative(KOREN, zdroj) + ' pýta fotografiu ' + adresa +
      '; pri KV_FOTKY=obchod sa na ňu v CSS nedá odkázať');
    return cele;
  });
}

/* ---------------------------------------------------------------- beh */

function preved() {
  /* Modely vybavenia si konfigurátor načítava sám za behu, takže na ne
     v značkovaní nič neukazuje a prevodník by ich prehliadol. */
  const modely = path.join(KOREN, 'konfigurator', 'scene-assets');
  for (const m of fs.readdirSync(modely)) {
    if (m.endsWith('.bin.gz')) doObchodu.set(m, path.relative(KOREN, path.join(modely, m)));
  }

  /* Značka na kresbe v 3D. Renderer si ju berie sám, adresou odvodenou od
     vlastného skriptu (`new URL('koverta-decal.svg', …soltec-premium.js.src)`),
     takže na ňu v značkovaní ani v štýle nič neukazuje a prevod by ju
     prehliadol. V téme preto musí ležať pod presne týmto menom, bez predpony
     `kfg-` — inak ju tá adresa nenájde a v scéne ostane biely štvorec. */
  const decal = path.join(KOREN, 'konfigurator', 'koverta-decal.svg');
  if (fs.existsSync(decal)) doTemy.set('koverta-decal.svg', decal);
  else chyby.push('chýba konfigurator/koverta-decal.svg');

  const zoznam = najdiStranky(KOREN);
  const mapa = new Map();
  for (const s of zoznam) { const a = adresa(s); mapa.set(a.cesta, a.odkaz); }

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

    /* Vlastný Koverta formulár ostáva priamo v obsahu. JavaScript z neho
       vytvorí prístupný modal a odošle ho cez náš serverový Resend endpoint.
       Nie je závislý od Formfulu ani od Shopify Forms, takže žiadny app embed
       nepridáva cudzí launcher alebo štýly do stránky. */

    /* Medzi koncom hlavného obsahu a pätičkou stoja skripty, ktoré patria
       len tejto stránke — konfigurátor tam má sedem súborov. Bez tohto úseku
       by sa do témy nedostali a stránka by ostala prázdna. */
    /* Titulok stránky. V admine sa zadáva ako názov a Shopify z neho
       odvodzuje handle — ten však musí sedieť so šablónou, takže sa zadáva
       zvlášť. Preto je v zozname aj jedno, aj druhé. */
    const titulok = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1]
      .replace(/\s*[·|]\s*Koverta\s*$/, '').trim();
    /* Celý `<title>` aj popis idú do zoznamu tiež. Shopify si značky pre
       vyhľadávače skladá sám, ale z políčok „Search engine listing" pri
       stránke — a tie sú po založení prázdne. Bez týchto dvoch stĺpcov by
       sa titulok aj popis, ktoré web má, na obchode stratili. */
    const celyTitulok = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1].trim();
    const popis = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1].trim();
    const medzi = prepis(html.slice(html.indexOf('</main>') + 7, html.indexOf('<footer class="k kf"')), mapa, zaklad);
    const hlava = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const chvost = html.slice(html.indexOf('</footer>') + 9, html.indexOf('</body>'));
    const hlavaPrvky = prvky(hlava).filter((p) => !shopifyRobiSam(p)).map((p) => prepis(p, mapa, zaklad));
    const chvostPrvky = prvky(chvost).map((p) => prepis(p, mapa, zaklad));
    for (const p of new Set(hlavaPrvky)) hlavaPocty.set(p, (hlavaPocty.get(p) || 0) + 1);
    for (const p of new Set(chvostPrvky)) chvostPocty.set(p, (chvostPocty.get(p) || 0) + 1);

    if (hlavicka) hlavicky.add(hlavicka);
    if (paticka) paticky.add(paticka);
    /* Štruktúrované dáta a obrázok pre sociálne siete. Prvky hlavy, ktoré
       skladá Shopify, prevod zahadzuje, no JSON-LD a og:image Shopify za nás
       nenapíše — bez nich by obchod stratil firmu, otázky aj produkty vo
       výsledkoch Google. Adresy sa prepíšu na tie z obchodu. */
    const ld = [...html.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)]
      .map((m) => naAdresyObchodu(m[0], mapa));
    const og = naAdresyObchodu((html.match(/<meta property="og:image" content="([^"]*)"/) || [, ''])[1], mapa);
    return { a, kde, hlavny, medzi, dopyt, titulok, celyTitulok, popis, hlavaPrvky, chvostPrvky, ld, og };
  });

  /* Cesty napísané rovno v texte skriptu úvodu. Hľadajú sa ako reťazcové
     literály `'./assets/…'` a `'./stranka/'`; preložia sa tým istým
     spôsobom ako adresy v značkovaní. */
  const cestySkriptu = {};
  const skript = path.join(KOREN, 'assets', 'koverta-2026.js');
  if (fs.existsSync(skript)) {
    const text = fs.readFileSync(skript, 'utf8');
    for (const m of text.matchAll(/'(\.\/[^']+)'/g)) {
      const cesta = m[1];
      if (cestySkriptu[cesta] !== undefined) continue;
      const nova = naSubor(cesta) || naStranku(cesta, mapa, '');
      if (nova && nova !== cesta) cestySkriptu[cesta] = nova;
    }
  }

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

  return { zoznam, sablony, spolocnaHlava, spolocnyChvost, cestySkriptu,
           hlavicka: [...hlavicky][0] || '', paticka: [...paticky][0] || '' };
}

function kopirujShopifyZdroj() {
  if (!fs.existsSync(SHOPIFY_ZDROJ)) return;
  function chod(adresar, rel = '') {
    for (const p of fs.readdirSync(adresar, { withFileTypes: true })) {
      const zdroj = path.join(adresar, p.name);
      const cielRel = path.join(rel, p.name);
      const ciel = path.join(CIEL, cielRel);
      if (p.isDirectory()) {
        fs.mkdirSync(ciel, { recursive: true });
        chod(zdroj, cielRel);
      } else {
        fs.mkdirSync(path.dirname(ciel), { recursive: true });
        fs.copyFileSync(zdroj, ciel);
      }
    }
  }
  chod(SHOPIFY_ZDROJ);
}

/* ---------------------------------------------------------------- zápis */

function zapis(v) {
  /* Návod je ručne písaný a prevod ho nesmie prepísať. */
  const navod = path.join(CIEL, 'AKO-NAHRAT.md');
  const navodText = fs.existsSync(navod) ? fs.readFileSync(navod) : null;
  for (const p of ['layout', 'sections', 'templates', 'assets', 'config', 'locales', 'snippets']) {
    fs.mkdirSync(path.join(CIEL, p), { recursive: true });
  }

  /* Vygenerované priečinky sa pred zápisom vyprázdnia.
   *
   * Prevod dovtedy len zapisoval. Keď sa stránka premenovala alebo zmazala,
   * jej stará šablóna a útržok v téme ostali — kontrola ich prijala, lebo
   * odkazy v nich vedú, a `shopify.yml` posiela do vetvy celý priečinok.
   * Zrušená stránka by tak v obchode žila ďalej, na starej adrese a so
   * starým textom, a nikto by o nej nevedel.
   *
   * Ručne udržiavané súbory sa nemažú: návod a nastavenia témy, do ktorých
   * si Shopify píše zapnuté bloky aplikácií. */
  const NEMAZAT = new Set(['config/settings_data.json']);
  for (const p of ['templates', 'snippets', 'assets', 'sections', 'layout']) {
    const kde = path.join(CIEL, p);
    for (const meno of fs.readdirSync(kde)) {
      if (NEMAZAT.has(p + '/' + meno)) continue;
      fs.rmSync(path.join(kde, meno), { recursive: true, force: true });
    }
  }

  const layout = `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{% render 'kv-consentik' %}
<!-- Značky pre vyhľadávače.

     Prevod ich zo stránok zahadzuje, lebo na Shopify ich skladá obchod —
     lenže content_for_header medzi ne titulok ani popis nedáva, tie patria
     šablóne. Kým ich tu nebolo, nemala žiadna stránka témy titulok vôbec.

     Berú sa z políčok „Search engine listing" pri stránke, teda z toho, čo je
     v štvrtom a piatom stĺpci STRANKY-NA-ZALOZENIE.txt. Vlastné sem
     nepíšeme: stáli by v hlavičke dvakrát a Google by druhý ignoroval.
     Adresu canonical dáva Shopify a je to jeho adresa, nie naša. -->
{%- assign kv_titulok = page_title -%}
{%- assign kv_popis = page_description -%}
{%- comment -%} Úvod berie titulok a popis z webu, nie zo starých nastavení obchodu. {%- endcomment -%}
{%- if template.name == 'index' -%}
{%- assign kv_titulok = ${JSON.stringify((v.sablony.find((x) => x.a.druh === 'index') || {}).celyTitulok || '')} -%}
{%- assign kv_popis = ${JSON.stringify((v.sablony.find((x) => x.a.druh === 'index') || {}).popis || '')} -%}
{%- endif -%}
${seoVetvy(v)}
<title>{{ kv_titulok }}</title>
{%- if kv_popis != blank %}
<meta name="description" content="{{ kv_popis | escape }}">
{%- endif %}
<link rel="canonical" href="{{ canonical_url }}">
<meta property="og:site_name" content="{{ shop.name }}">
<meta property="og:locale" content="sk_SK">
<meta property="og:type" content="{% if request.page_type == 'product' %}product{% else %}website{% endif %}">
<meta property="og:title" content="{{ kv_titulok | escape }}">
<meta property="og:url" content="{{ canonical_url }}">
{%- if kv_popis != blank %}
<meta property="og:description" content="{{ kv_popis | escape }}">
{%- endif %}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ kv_titulok | escape }}">
{%- if kv_popis != blank %}
<meta name="twitter:description" content="{{ kv_popis | escape }}">
{%- endif %}
{%- if request.page_type == 'product' and product %}
{%- assign kv_variant = product.selected_or_first_available_variant %}
<meta property="og:price:amount" content="{{ kv_variant.price | divided_by: 100.0 }}">
<meta property="og:price:currency" content="{{ cart.currency.iso_code }}">
{%- endif %}
{%- render 'kv-og', page: page, product: product, collection: collection, template: template, request: request %}
{{ content_for_header }}
{{ 'koverta-shopify.css' | asset_url | stylesheet_tag }}
${v.spolocnaHlava.filter((p) => !/KV_SUHLAS_KLUC|Meranie: súhlas/.test(p)).join('\n')}
</head>
<body class="{% if template.name == 'index' %}k-home{% endif %}">
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5KVNNWW5" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>
<script>
  /* Skripty nesú v sebe cesty statického webu. Tu dostanú tie, ktoré platia
     v obchode: obrázky značiek a modely vybavenia sú na CDN, stránka
     o 3D modeloch je v /pages/. */
  window.KV_ADRESY = {
    znackaKoverta: {{ 'koverta-mark.svg' | asset_url | json }},
    znackaSoltec: ${FOTKY === 'pages'
      ? JSON.stringify(PAGES_ZAKLAD + '/assets/soltec-mark.png')
      : "{{ 'soltec-mark.png' | file_url | json }}"},
    modely: '/pages/${PREDPONA}pouzite-modely'
  };
  /* Cesty, ktoré koverta-2026.js nesie rovno v texte a skladá z nich
     fotografie a odkazy vo výbere riešenia. V značkovaní nie sú, takže ich
     prevod inak nevidí; bez tejto tabuľky by na Shopify ukazovali na
     /pages/assets/… a /carport-soltec/, teda nikam. */
  window.KV_CESTY = ${JSON.stringify(v.cestySkriptu, null, 2).replace(/\n/g, '\n  ')};
  window.KV_SCENE_ASSETS = ${FOTKY === 'pages'
    ? JSON.stringify(PAGES_ZAKLAD + '/konfigurator/scene-assets/')
    : "{{ 'bmw-g80-m3.bin.gz' | file_url | split: 'bmw-g80-m3.bin.gz' | first | json }}"};
</script>
{% section 'kv-hlavicka' %}
{{ content_for_layout }}
{% section 'kv-paticka' %}
${dokObchodu()}
${v.spolocnyChvost.join('\n')}
</body>
</html>
`;
  fs.writeFileSync(path.join(CIEL, 'layout', 'theme.liquid'), layout);

  const kosik = '<a class="kv-icon-btn kv-cart-link" href="{{ routes.cart_url }}" aria-label="Košík, {{ cart.item_count }} položiek"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2h9.9L20 7H6"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>{% if cart.item_count > 0 %}<span class="kv-cart-link__count">{{ cart.item_count }}</span>{% endif %}</a>';
  const shopifyHlavicka = v.hlavicka.replace(
    /(<button class="kv-icon-btn" type="button" data-k-search-open[\s\S]*?<\/button>)/,
    '$1' + kosik
  );
  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-hlavicka.liquid'),
    shopifyHlavicka + '\n{% schema %}\n{"name":"Koverta hlavička"}\n{% endschema %}\n');
  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-paticka.liquid'),
    /* Pätička je sekcia a sekcie v Shopify nevidia premenné stránky, takže
       kv_dopyt je tu takmer vždy prázdne. Záloha vedie na kontakt s kotvou
       #ponuka: kde je na stránke formulár, skript otvorí jeho okno na mieste;
       inde (košík, vyhľadávanie, 404) otvorí formulár na kontakte. Holé
       „#ponuka“ tam nerobilo nič. */
    '{%- assign kv_dopyt = kv_dopyt | default: "/pages/kontakt#ponuka" -%}\n' + v.paticka +
    '\n{% schema %}\n{"name":"Koverta pätička"}\n{% endschema %}\n');

  /* Telo každej stránky ide do `snippets/`, nie rovno do šablóny.
   *
   * Shopify ponúka v Online Store → Pages pod „Theme template" len šablóny
   * **publikovanej** témy. Kým je naša téma draft, jej `page.nove-…` sa
   * v tom zozname neobjavia a stránky ostanú na `Default page` — a `Default
   * page` je `templates/page.liquid`, ktorý téma vôbec nemala. Výsledkom je
   * prázdna stránka, nech sa zakladá akokoľvek pozorne.
   *
   * `templates/page.json` preto telo nájde sám, podľa handle stránky. Starý
   * `include` berie meno z premennej (`render` ho musí mať napísané) a na
   * rozdiel od `render` vidí do okolia, takže útržok dosiahne na blok
   * formulára, ktorý sekcia vykreslila. Osemdesiattri stránok tak nepotrebuje
   * ani jedno ručné priradenie šablóny — a keďže šablóna je jedna, blok
   * aplikácie sa umiestňuje raz a platí pre všetky. */
  for (const s of v.sablony) {
    if (s.a.rozmer) continue;
    const hlava = "{%- assign kv_dopyt = '" + s.dopyt.replace(/'/g, "\\'") + "' -%}\n";
    /* Štýly vlastné stránke (konfigurátor má svoje dve CSS) idú PRED jej
       obsah, skripty za neho. Kým boli štýly až na konci, prehliadač stihol
       obsah vykresliť bez nich: piktogramy výberu produktu v konfigurátore
       sa na okamih roztiahli na celú šírku ako čierne tvary. Štýl vložený
       pred obsah drží jeho vykreslenie, kým sa nenačíta. */
    const navyseHlava = s.hlavaNavyse.join('\n');
    const navyseChvost = s.chvostNavyse.join('\n');
    const telo = hlava + (navyseHlava ? navyseHlava + '\n' : '') + (s.ld.length ? s.ld.join('\n') + '\n' : '') + s.hlavny + (s.medzi.trim() ? '\n' + s.medzi.trim() + '\n' : '') +
      (navyseChvost ? '\n' + navyseChvost + '\n' : '\n');
    const ciel = path.join(CIEL, 'snippets', s.a.handle + '.liquid');
    if (Buffer.byteLength(telo) <= MAX_SNIPPET_BAJTOV) {
      fs.writeFileSync(ciel, telo);
      continue;
    }

    const casti = [];
    let cast = '';
    for (const riadok of telo.match(/.*(?:\n|$)/g).filter(Boolean)) {
      if (cast && Buffer.byteLength(cast + riadok) > MAX_SNIPPET_BAJTOV) {
        casti.push(cast);
        cast = '';
      }
      cast += riadok;
    }
    if (cast) casti.push(cast);

    fs.writeFileSync(ciel, casti.map((_, i) =>
      "{% include '" + s.a.handle + '-cast-' + (i + 1) + "' %}").join('\n') + '\n');
    casti.forEach((obsah, i) => fs.writeFileSync(
      path.join(CIEL, 'snippets', s.a.handle + '-cast-' + (i + 1) + '.liquid'), obsah));
  }

  /* Smerovač obsahu. Obsah sa berie podľa handle: stránka `kontakt` aj
   * `nove-kontakt` dostanú útržok `nove-kontakt`, kolekcia
   * `pristresky-pre-auta` útržok `nove-pristresky-pre-auta`. Šablónu
   * v obchode netreba meniť — keď šablóna s príponou (napr. `contact`)
   * v téme nie je, Shopify vezme predvolenú a tá obsah nájde sama.
   * Útržky s odkazmi na produkty rozmerov dostanú vopred `kv_zive`: zoznam
   * produktov, ktoré sú v obchode naozaj zverejnené. */
  const ZIVE = "{%- capture kv_zive -%}|{%- paginate collections['pristresky-pre-auta'].products by 250 -%}{%- for p in collections['pristresky-pre-auta'].products -%}{{ p.handle }}|{%- endfor -%}{%- endpaginate -%}{%- paginate collections['zahradne-pristresky'].products by 250 -%}{%- for p in collections['zahradne-pristresky'].products -%}{{ p.handle }}|{%- endfor -%}{%- endpaginate -%}{%- endcapture -%}";
  const obsahy = v.sablony.filter((x) => !x.a.rozmer && x.a.druh !== 'index');
  const potrebujeZive = (x) => /kv_zive/.test(x.hlavny + x.medzi + x.ld.join(''));
  const vetva = (handles, x) => "{%- when '" + handles.join("', '") + "' -%}\n" +
    (potrebujeZive(x) ? '  ' + ZIVE + '\n' : '') + "  {% include '" + x.a.handle + "' %}\n";
  const strankyVetvy = obsahy.map((x) => vetva([x.a.handle].concat(x.a.ciel && x.a.ciel.typ === 'stranka' ? [x.a.ciel.handle] : []), x));
  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-stranka.liquid'),
    '{%- case page.handle -%}\n' + strankyVetvy.join('') +
    '{%- else -%}\n' +
    '  <main class="k"><div class="k-wrap"><h1 class="k-h2">{{ page.title }}</h1>' +
    '{{ page.content }}</div></main>\n' +
    '{%- endcase -%}\n' +
    '\n{% schema %}\n' +
    JSON.stringify({ name: 'Koverta stránka', settings: [] }, null, 2) +
    '\n{% endschema %}\n');
  const kolekcieVetvy = obsahy.filter((x) => x.a.ciel && x.a.ciel.typ === 'kolekcia').map((x) => vetva([x.a.ciel.handle], x));
  fs.writeFileSync(path.join(CIEL, 'templates', 'collection.liquid'),
    '{%- case collection.handle -%}\n' + kolekcieVetvy.join('') +
    "{%- else -%}\n  {% render 'koverta-obchod', druh: 'kolekcia', collection: collection %}\n{%- endcase -%}\n");

  /* Šablóna stránky je JSON, aby niesla spoločnú sekciu obsahu. */
  fs.writeFileSync(path.join(CIEL, 'templates', 'page.json'),
    JSON.stringify({
      sections: { hlavna: { type: 'kv-stranka', blocks: {}, block_order: [], settings: {} } },
      order: ['hlavna']
    }, null, 2) + '\n');

  /* Úvod. Bez `templates/index.liquid` téma nemá domovskú stránku vôbec. */
  const uvod = v.sablony.find((s) => s.a.druh === 'index');
  fs.writeFileSync(path.join(CIEL, 'templates', 'index.liquid'),
    uvod ? "{% include '" + uvod.a.handle + "' %}\n" : '\n');



  /* CSS sa prepisuje, nie kopíruje — a prepis do zoznamu pridáva ďalšie
     súbory (písmo, kresby), takže sa chodí dokola, kým nepribúdajú. */
  const hotove = new Set();
  for (let kolo = 0; kolo < 8; kolo++) {
    const zvysok = [...doTemy].filter(([meno]) => !hotove.has(meno));
    if (!zvysok.length) break;
    for (const [meno, zdroj] of zvysok) {
      hotove.add(meno);
      if (path.extname(meno).toLowerCase() === '.css') {
        fs.writeFileSync(path.join(CIEL, 'assets', meno),
          zmensiCss(prepisCss(fs.readFileSync(zdroj, 'utf8'), zdroj)));
      } else {
        fs.copyFileSync(zdroj, path.join(CIEL, 'assets', meno));
      }
    }
  }

  /* Ručne udržiavané Shopify product/cart súbory sa kopírujú až po
     generovaní stránok a assetov, aby ich čistenie generátora nezmazalo. */
  kopirujShopifyZdroj();
  zapisIndexHladania(v);
  zapisOgObrazok(v);

  fs.writeFileSync(path.join(CIEL, 'config', 'settings_schema.json'),
    JSON.stringify([{ name: 'theme_info', theme_name: 'Koverta 2026',
      theme_version: '1.0.0', theme_author: 'Koverta', theme_documentation_url: 'https://koverta.sk',
      theme_support_url: 'https://koverta.sk/kontakt/' }], null, 2) + '\n');
  /* `settings_data.json` píše aj Shopify. Vlastný formulár nepotrebuje app
     embed; starý Formful blok zámerne odstránime, aby sa jeho launcher už
     nikdy nevrátil cez obsah alebo pätičku. */
  const nastavenia = path.join(CIEL, 'config', 'settings_data.json');
  if (!fs.existsSync(nastavenia)) fs.writeFileSync(nastavenia, '{"current":{}}\n');
  try {
    const povodne = fs.readFileSync(nastavenia, 'utf8');
    const zaciatokJson = povodne.indexOf('{');
    const hlavickaJson = zaciatokJson > 0 ? povodne.slice(0, zaciatokJson) : '';
    const data = JSON.parse(povodne.slice(zaciatokJson));
    const bloky = data.current && data.current.blocks;
    for (const [id, blok] of Object.entries(bloky || {})) {
      if (/shopify:\/\/apps\/formful\/blocks\/app-embed/i.test(blok.type || '')) delete bloky[id];
    }
    /* Aplikácie, ktoré v živej téme bežia a nová ich potrebuje rovnako:
       Consentik je lišta súhlasu s cookies — posiela súhlas do Consent Mode
       a GTM, vlastnú lištu web na Shopify nemá. r-terms je súhlas
       s obchodnými podmienkami v košíku. Bloky sú totožné so živou témou;
       ak ich niekto v editore vypne, necháme to tak. */
    data.current = data.current || {};
    const embed = data.current.blocks = data.current.blocks || {};
    const aplikacie = [
      ['6858403126979251294', 'shopify://apps/consentik-cookie/blocks/omega-cookies-notification/13cba824-a338-452e-9b8e-c83046a79f21'],
      ['5061257265103808445', 'shopify://apps/r-terms-conditions/blocks/embed-block/471882a9-9b1b-4918-8943-6c66b60c94ea']
    ];
    for (const [id, typ] of aplikacie) {
      if (!Object.values(embed).some((b) => b.type === typ)) embed[id] = { type: typ, disabled: false, settings: {} };
    }
    fs.writeFileSync(nastavenia, hlavickaJson + JSON.stringify(data, null, 2) + '\n');
  } catch (e) {
    chyby.push('config/settings_data.json sa nedá upraviť: ' + e.message);
  }
  fs.writeFileSync(path.join(CIEL, 'locales', 'sk.default.json'), '{}\n');

  fs.writeFileSync(path.join(CIEL, 'SUBORY-DO-OBCHODU.txt'),
    'Súbory do Nastavenia → Súbory. Prvý stĺpec je meno v obchode.\n\n' +
    [...doObchodu].map(([m, z]) => m + '\t' + z).sort().join('\n') + '\n');

  if (navodText) fs.writeFileSync(navod, navodText);
  fs.writeFileSync(path.join(CIEL, 'STRANKY-NA-ZALOZENIE.txt'),
    'Stránky, ktoré treba založiť v Online Store → Pages.\n\n' +
    'Stĺpce oddeľuje tabulátor:\n' +
    '  1 handle   musí sedieť presne, podľa neho si stránka nájde obsah\n' +
    '  2 názov    Title stránky\n' +
    '  3 adresa\n' +
    '  4 SEO title        do Search engine listing → Page title\n' +
    '  5 SEO description  do Search engine listing → Meta description\n\n' +
    'Stĺpce 4 a 5 sú dôležité: Shopify si značky pre vyhľadávače skladá sám,\n' +
    'ale z tých políčok — a tie sú po založení stránky prázdne. Bez nich by\n' +
    'Google videl iný titulok a žiadny popis, než aký web má.\n\n' +
    v.sablony.map((s) => [s.a.handle, s.titulok, s.a.url, s.celyTitulok, s.popis].join('\t'))
      .sort().join('\n') + '\n');
}

/* og:image podľa stránky. Stránky ho majú zo statického webu, produkt podľa
 * radu a počtu áut tú istú fotku, ktorou začína jeho galéria. */
/* Titulok a popis stránky pre obsah na starých adresách. Zo statického webu,
 * nie z políčok obchodu: kolekcia `pristresky-pre-auta` má v obchode starý
 * popis, no zobrazuje nový obsah. */
function seoVetvy(v) {
  const lit = (t) => "'" + String(t || '').replace(/'/g, '’') + "'";
  const priradenie = (x) => '{%- assign kv_titulok = ' + lit(x.celyTitulok) + ' -%}' + (x.popis ? '{%- assign kv_popis = ' + lit(x.popis) + ' -%}' : '');
  const obsahy = v.sablony.filter((x) => !x.a.rozmer && x.a.druh !== 'index' && x.celyTitulok);
  const stranky = obsahy.map((x) => "{%- when '" + [x.a.handle].concat(x.a.ciel && x.a.ciel.typ === 'stranka' ? [x.a.ciel.handle] : []).join("', '") + "' -%}" + priradenie(x)).join('\n');
  const kolekcie = obsahy.filter((x) => x.a.ciel && x.a.ciel.typ === 'kolekcia').map((x) => "{%- when '" + x.a.ciel.handle + "' -%}" + priradenie(x)).join('\n');
  return "{%- if request.page_type == 'page' -%}{%- case page.handle -%}\n" + stranky + "\n{%- endcase -%}\n" +
    "{%- elsif request.page_type == 'collection' -%}{%- case collection.handle -%}\n" + kolekcie + "\n{%- endcase -%}{%- endif -%}";
}

function zapisOgObrazok(v) {
  const podmienka = (x) => {
    if (x.a.druh === 'index') return "template.name == 'index'";
    const c = ["page.handle == '" + x.a.handle + "'"];
    if (x.a.ciel && x.a.ciel.typ === 'stranka') c.push("page.handle == '" + x.a.ciel.handle + "'");
    if (x.a.ciel && x.a.ciel.typ === 'kolekcia') c.push("collection.handle == '" + x.a.ciel.handle + "'");
    return c.join(' or ');
  };
  const vetvy = v.sablony.filter((x) => x.og && !x.a.rozmer).map((x) =>
    '{%- if ' + podmienka(x) + ' -%}' + "{%- assign kv_og = '" + x.og.replace(/'/g, '') + "' -%}{%- endif -%}");
  const f = PAGES_ZAKLAD + '/assets/';
  const text = "{%- assign kv_og = '" + f + "koverta-og.jpg' -%}\n" + vetvy.join('\n') + '\n'
    + "{%- if request.page_type == 'product' and product.metafields.koverta.family -%}\n"
    + "  {%- if product.metafields.koverta.family.value == 'zahrada' -%}{%- assign kv_og = '" + f + "koverta-zahradny-pristresok-antracit-lamelova-stena.jpg' -%}\n"
    + "  {%- elsif product.metafields.koverta.width_mm.value >= 5000 -%}{%- assign kv_og = '" + f + "koverta-pristresok-bocne-lamely-a-zvod.jpg' -%}\n"
    + "  {%- else -%}{%- assign kv_og = '" + f + "koverta-pristresok-pre-jedno-auto-lamelova-vypln.jpg' -%}{%- endif -%}\n"
    + "{%- endif -%}\n"
    + '<meta property="og:image" content="{{ kv_og }}">\n<meta name="twitter:image" content="{{ kv_og }}">\n';
  fs.writeFileSync(path.join(CIEL, 'snippets', 'kv-og.liquid'), text);
}

/* Vyhľadávanie v hlavičke číta `hladanie.json` vedľa `koverta-2026.css`.
 * Na statickom webe má adresy stránok relatívne; v obchode musia byť tie
 * z obchodu (/pages/nove-…), inak by každý výsledok viedol na CDN. Pribudnú
 * aj katalógové rozmery ako produkty, aby sa dalo hľadať napríklad „5 x 6“. */
/* Vyhľadávanie je statický súbor, Liquid v ňom nebeží. Nový produkt sa
 * ponúkne, len keď je podľa tools/produkty-zive.json živý; inak starý
 * produkt s tým istým rozmerom. Súbor obnovuje tools/produkty-zive.js. */
function hladanieProdukt(h) {
  const zive = JSON.parse(fs.readFileSync(path.join(KOREN, 'tools', 'produkty-zive.json'), 'utf8'));
  if (zive.nove[h]) return h;
  const stary = STARE_PRODUKTY.get(h);
  return stary && zive.stare[stary] ? stary : h;
}

function zapisIndexHladania(v) {
  const zdroj = path.join(KOREN, 'assets', 'hladanie.json');
  if (!fs.existsSync(zdroj)) { chyby.push('chýba assets/hladanie.json'); return; }
  const mapa = new Map();
  for (const s of v.zoznam) { const a = adresa(s); mapa.set(a.cesta, a.odkaz); }
  const index = JSON.parse(fs.readFileSync(zdroj, 'utf8'));
  const polozky = [];
  for (const it of index.polozky || []) {
    const [cesta, kotva] = String(it.u || '').split('#');
    const kluc = cesta.replace(/^\.\//, '').replace(/\/$/, '').replace(/^\.$/, '');
    let u = it.u;
    if (!/^(https?:|mailto:|tel:)/.test(it.u)) {
      if (kluc === '') u = '/';
      else if (mapa.has(kluc)) u = mapa.get(kluc);
      else { chyby.push('hladanie.json: neznáma stránka ' + it.u); continue; }
      if (kotva) u += '#' + kotva;
    }
    const o = it.o && it.o.startsWith('/') ? PAGES_ZAKLAD + it.o : it.o;
    polozky.push(Object.assign({}, it, { u, o }));
  }
  const vm = require('node:vm');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(KOREN, 'konfigurator', 'cfg-pages.js'), 'utf8'), sandbox);
  const bezDiakritiky = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = (mm) => String(mm / 1000).replace('.', ',');
  for (const [kluc, model, zaklad, druh] of [['koverta', 'K', 'Prístrešok Koverta', 'auto'], ['zahrada', 'Z', 'Záhradný prístrešok Koverta', 'zahrada']]) {
    const d = JSON.parse(sandbox.window.KV_PAGES[kluc].match(/data-sp-bio-data>([\s\S]*?)<\/script>/)[1]).models[model];
    d.lengths.forEach((l, li) => d.widths.forEach((w, wi) => {
      const cena = d.prices[li][wi].toLocaleString('sk-SK').replace(/\s/g, ' ') + ' €';
      const auta = druh === 'zahrada' ? 'terasa záhrada pergola' : (w >= 5000 ? '2 autá dve auta dvojmiestny' : '1 auto jedno auto');
      const t = zaklad + ' ' + m(w) + ' × ' + m(l) + ' m';
      polozky.push({
        t, p: cena + ' s DPH, dopravou a montážou', k: 'Rozmer',
        u: '/products/' + hladanieProdukt((druh === 'zahrada' ? 'zahradny-pristresok-koverta-' : 'pristresok-koverta-') + w + 'x' + l),
        h: bezDiakritiky(t + ' ' + m(w) + 'x' + m(l) + ' ' + m(w) + ' x ' + m(l) + ' ' + w + 'x' + l + ' ' + auta + ' pristresok carport cena')
      });
    }));
  }
  fs.writeFileSync(path.join(CIEL, 'assets', 'hladanie.json'), JSON.stringify({ v: index.v, polozky }));
}

if (require.main === module) {
  const v = preved();
  console.log('Stránok: ' + v.zoznam.length);
  console.log('Spoločná hlava: ' + v.spolocnaHlava.length + ' prvkov, spoločný chvost: ' + v.spolocnyChvost.length);
  console.log('Do témy: ' + doTemy.size + ' súborov, do Súborov obchodu: ' + doObchodu.size);
  console.log('Predpona adries: ' + (PREDPONA || '(žiadna)'));
  console.log('Fotografie: ' + (FOTKY === 'pages' ? 'GitHub Pages — netreba nahrávať nič' : 'Súbory obchodu — treba nahrať ' + doObchodu.size));

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
