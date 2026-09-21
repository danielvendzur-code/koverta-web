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

/* Formulár v aplikácii Formful. */
const FORMFUL = 'form_LaKRq0tyt4';

/* Shopify nemusí pri synchronizácii prijať priveľký Liquid súbor. Sekcia sa
 * potom nahrá, no jej snippet chýba a obchod vypíše návštevníkovi „Liquid
 * error“. Galéria má stovky položiek, preto veľké telá rozdelíme na menšie
 * snippety a pôvodné meno ponecháme ako krátky zaraďovač. */
const MAX_SNIPPET_BAJTOV = 180 * 1024;

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
  if (FOTKY === 'pages') return PAGES_ZAKLAD + '/assets/' + vnutri;
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

    /* Náš formulár nemá na pláne Starter kam posielať, takže na jeho mieste
       stojí miesto pre blok aplikácie — `{{ kv_formular }}`. Sekcia stránky
       doň vloží bloky, ktoré má na sebe umiestnené (Formful alebo Forms), a
       formulár tak stojí priamo v stránke, nie len vo vyskakovacom okne.
       Kým tam blok nie je, ostáva tlačidlo, ktoré otvorí dialóg Formfulu —
       aby stránka nebola bez cesty k dopytu ani prvý deň. */
    hlavny = hlavny.replace(/<form id="dopyt"[\s\S]*?<\/form>/,
      '{{ kv_formular }}' +
      '<p class="kh-form__vyzva"><button type="button" class="k-btn k-btn--primary" ' +
      'onclick="Formful.openDialog(\'' + FORMFUL + '\')">Otvoriť formulár dopytu</button></p>');

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
    return { a, kde, hlavny, medzi, dopyt, titulok, celyTitulok, popis, hlavaPrvky, chvostPrvky };
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
<!-- Značky pre vyhľadávače.

     Prevod ich zo stránok zahadzuje, lebo na Shopify ich skladá obchod —
     lenže content_for_header medzi ne titulok ani popis nedáva, tie patria
     šablóne. Kým ich tu nebolo, nemala žiadna stránka témy titulok vôbec.

     Berú sa z políčok „Search engine listing" pri stránke, teda z toho, čo je
     v štvrtom a piatom stĺpci STRANKY-NA-ZALOZENIE.txt. Vlastné sem
     nepíšeme: stáli by v hlavičke dvakrát a Google by druhý ignoroval.
     Adresu canonical dáva Shopify a je to jeho adresa, nie naša. -->
<title>{{ page_title }}</title>
{%- if page_description %}
<meta name="description" content="{{ page_description | escape }}">
{%- endif %}
<link rel="canonical" href="{{ canonical_url }}">
<meta property="og:site_name" content="{{ shop.name }}">
<meta property="og:locale" content="sk_SK">
<meta property="og:type" content="website">
<meta property="og:title" content="{{ page_title | escape }}">
<meta property="og:url" content="{{ canonical_url }}">
{%- if page_description %}
<meta property="og:description" content="{{ page_description | escape }}">
{%- endif %}
<meta name="twitter:card" content="summary_large_image">
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
    const hlava = "{%- assign kv_dopyt = '" + s.dopyt.replace(/'/g, "\\'") + "' -%}\n";
    const navyse = [...s.hlavaNavyse, ...s.chvostNavyse].join('\n');
    const telo = hlava + s.hlavny + (s.medzi.trim() ? '\n' + s.medzi.trim() + '\n' : '') +
      (navyse ? '\n' + navyse + '\n' : '\n');
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

  /* Sekcia stránky. Existuje kvôli jednej veci: bloky aplikácií sa dajú
   * umiestniť len do sekcie, nie do obyčajnej šablóny. Vďaka nej si majiteľ
   * v editore témy raz pridá blok Formfulu (alebo Forms) a formulár stojí
   * priamo v stránke — nie len vo vyskakovacom okne, a na všetkých stránkach
   * naraz, lebo ho nesie šablóna, nie jednotlivá stránka.
   *
   * Telo stránky sa berie podľa handle. Bloky sa vykreslia do `kv_formular`,
   * teda presne tam, kde na statickom webe stojí formulár dopytu; keď nie je
   * umiestnený žiadny, ostane tam prázdno a pod ním tlačidlo na dialóg. */
  const handleVsetky = v.sablony.map((x) => x.a.handle);
  fs.writeFileSync(path.join(CIEL, 'sections', 'kv-stranka.liquid'),
    '{%- capture kv_formular -%}\n' +
    '{%- for block in section.blocks -%}\n' +
    '  <div class="kh-form__blok" {{ block.shopify_attributes }}>{% render block %}</div>\n' +
    '{%- endfor -%}\n' +
    '{%- endcapture -%}\n' +
    '{%- assign kv_nase = "' + handleVsetky.join(',') + '" | split: "," -%}\n' +
    '{%- if kv_nase contains page.handle -%}\n' +
    '  {% include page.handle %}\n' +
    '{%- else -%}\n' +
    '  <main class="k"><div class="k-wrap"><h1 class="k-h2">{{ page.title }}</h1>' +
    '{{ page.content }}{{ kv_formular }}</div></main>\n' +
    '{%- endif -%}\n' +
    '\n{% schema %}\n' +
    JSON.stringify({ name: 'Koverta stránka', blocks: [{ type: '@app' }], settings: [] }, null, 2) +
    '\n{% endschema %}\n');

  /* Šablóna stránky je JSON, aby tú sekciu niesla a blok aplikácie sa dal
     v editore umiestniť. Liquid šablóna sekcie ani bloky nepozná. */
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
          prepisCss(fs.readFileSync(zdroj, 'utf8'), zdroj));
      } else {
        fs.copyFileSync(zdroj, path.join(CIEL, 'assets', meno));
      }
    }
  }

  fs.writeFileSync(path.join(CIEL, 'config', 'settings_schema.json'),
    JSON.stringify([{ name: 'theme_info', theme_name: 'Koverta 2026',
      theme_version: '1.0.0', theme_author: 'Koverta', theme_documentation_url: 'https://koverta.sk',
      theme_support_url: 'https://koverta.sk/kontakt/' }], null, 2) + '\n');
  /* `settings_data.json` píše aj Shopify. Editor témy si doň ukladá, ktoré
     bloky aplikácií sú zapnuté — medzi nimi embed Formfulu s naším formulárom
     `form_LaKRq0tyt4`. Prevod ho preto nesmie prepísať: prepisom by tlačidlo
     na dopyt prestalo otvárať dialóg. Zakladá sa len vtedy, keď ešte nie je. */
  const nastavenia = path.join(CIEL, 'config', 'settings_data.json');
  if (!fs.existsSync(nastavenia)) fs.writeFileSync(nastavenia, '{"current":{}}\n');
  /* App embed musí zostať zapnutý, lebo poskytuje Formful.openDialog(). Jeho
     anglický teaser však duplikuje naše CTA a na mobile prekrýva pätičku.
     Aplikáciu necháme načítať, ale odstránime text launchera. */
  try {
    const povodne = fs.readFileSync(nastavenia, 'utf8');
    const zaciatokJson = povodne.indexOf('{');
    const hlavickaJson = zaciatokJson > 0 ? povodne.slice(0, zaciatokJson) : '';
    const data = JSON.parse(povodne.slice(zaciatokJson));
    const bloky = data.current && data.current.blocks;
    for (const blok of Object.values(bloky || {})) {
      if (!/shopify:\/\/apps\/formful\/blocks\/app-embed/i.test(blok.type || '')) continue;
      blok.settings = blok.settings || {};
      blok.settings.title = '';
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
