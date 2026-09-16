# Spustenie na koverta.sk

**Hotové (2026-09-16).** Web je prepnutý na ostrú doménu: meta robots je preč
zo všetkých verejných stránok, canonical, og:url, og:image, twitter:image,
JSON-LD, `sitemap.xml`, `robots.txt` aj `llms.txt` ukazujú na
`https://koverta.sk/`, sociálne obrázky sú absolútne a `lastmod` je aktuálny.

```bash
grep -rn 'danielvendzur-code.github.io' .   # vráti 0
grep -rn 'name="robots"' --include=index.html .   # iba interny-odhad-patiek
```

Zostáva spraviť **mimo repozitára**: presmerovania starých Shopify adries
(tabuľka nižšie) a overenie po spustení.

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
