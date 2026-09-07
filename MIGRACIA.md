# Spustenie na koverta.sk — čo treba prepnúť

Web teraz beží ako **náhľad** na `https://danielvendzur-code.github.io/koverta-web/`
a je zámerne mimo vyhľadávačov, aby nesúperil s ostrým `koverta.sk`.

Kroky nižšie treba spraviť **naraz, v jednom nasadení**. Čiastočná migrácia
(napr. odstránená značka noindex, ale staré adresy v canonical) je horšia než
žiadna.

## 1 · Pustiť stránku do vyhľadávačov

Z hlavičky **každej** stránky zmazať:

```html
<meta name="robots" content="noindex, nofollow">
```

aj komentár `<!-- NÁHĽAD · … -->` nad ním. Kontrola:

```bash
grep -rn 'name="robots"' --include=index.html .   # nesmie nič vrátiť
```

## 2 · Prepísať adresy

Všade, kde je `https://danielvendzur-code.github.io/koverta-web/`, má byť
`https://koverta.sk/`. Týka sa to:

| Kde | Čoho |
|---|---|
| každá stránka | `<link rel="canonical">` |
| každá stránka | `og:url`, `og:image`, `twitter:image` |
| každá stránka | JSON-LD: `Organization.url`, `WebSite.url`, `SearchAction.target`, `BreadcrumbList.item`, `Offer.url` |
| `sitemap.xml` | všetkých 15 adries |
| `llms.txt` | adresy stránok |
| `robots.txt` | riadok `Sitemap:` |

```bash
grep -rn 'danielvendzur-code.github.io' . | wc -l   # po migrácii 0
```

## 3 · Presmerovať staré adresy Shopify

Súčasný `koverta.sk` beží na Shopify a má iné cesty. Pre každú starú adresu
nastaviť trvalé presmerovanie (301) na novú:

| Stará (Shopify) | Nová |
|---|---|
| `/pages/pristresky-pre-auta` | `/pristresky-pre-auta/` |
| `/pages/o-zahradnych-pristreskoch` | `/zahradne-pristresky/` |
| `/collections/bioklimaticke-pergoly` | `/bioklimaticke-pergoly/` |
| `/pages/tienenie` | `/tienenie/` |
| `/pages/vonkajsie-kuchyne` | `/outdoor-kuchyne/` |
| `/pages/pergoly-s-pevnou-strechou-multiport` | `/pevne-prestresenia/` |
| `/pages/kontakt` | `/kontakt/` |
| `/pages/galeria-*` | `/realizacie/` |
| `/pages/vseobecne-obchodne-podmienky` | `/obchodne-podmienky/` |
| `/pages/zasady-ochrany-osobnych-udajov` | `/ochrana-sukromia/` |
| `/pages/reklamacny-poriadok` | `/reklamacie/` |

Bez presmerovaní sa stratí to, čo staré adresy vo vyhľadávačoch nazbierali.

## 4 · Formulár dopytu

Formulár posiela na `https://koverta.sk/contact` (Shopify). Po presune webu na
tú istú doménu prestane byť požiadavka cross-origin — potom sa **dá** čítať
stav odpovede a poďakovanie môže byť potvrdené, nie len ohlásené. Vtedy treba
prejsť `initDopyt` v `assets/koverta-2026.js`.

**Otvorené aj tak:** overiť, či Shopify kontaktný formulár naozaj doručí
prílohy (`contact[Prílohy][]`). Ak nie, prílohy potrebujú vlastný endpoint.

## 5 · Overiť po spustení

- [ ] Search Console: pridať doménu, overiť vlastníctvo, poslať `sitemap.xml`
- [ ] Bing Webmaster Tools to isté
- [ ] `curl -I https://koverta.sk/pristresky-pre-auta/` vráti 200
- [ ] náhodných 10 starých adries vráti 301 na správne nové
- [ ] test formulára koncom na koncom, vrátane príloh
- [ ] test vyhľadávania `?q=pergola`
