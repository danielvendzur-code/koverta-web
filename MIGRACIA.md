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

## 4 · CNAME a prepnutie domény

Repozitár nemá súbor `CNAME`, takže GitHub Pages zatiaľ obsluhuje len
`danielvendzur-code.github.io/koverta-web/`. Bez neho sa `koverta.sk`
na Pages nikdy nechytí.

Poradie, ktoré nič nerozbije:

1. V DNS nastaviť `koverta.sk` na GitHub Pages (štyri A záznamy na
   185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   a `www` ako CNAME na `danielvendzur-code.github.io`).
2. Do koreňa repozitára pridať súbor `CNAME` s jediným riadkom
   `koverta.sk` a zlúčiť do vetvy, z ktorej Pages publikuje.
3. V nastaveniach repozitára na GitHube zapnúť „Enforce HTTPS", keď
   dobehne vystavenie certifikátu.

Pozor na poradie: hneď ako `CNAME` pribudne, github.io adresa presmeruje
na `koverta.sk`. Kým tam ešte beží Shopify, náhľad prestane fungovať.
Preto sa `CNAME` pridáva až v deň prepnutia DNS, nie skôr.

## 5 · Formulár dopytu

Formulár už neposiela nič na `https://koverta.sk/contact`. Tá adresa patrí
Shopify a v deň prepnutia domény prestane existovať; odosielalo sa navyše
v režime `no-cors`, v ktorom sa stav odpovede prečítať nedá, takže by
zákazník videl poďakovanie aj vtedy, keď dopyt nikam nedošiel.

Statický hosting formulár spracovať nevie, tak po kliknutí otvorí poštu s
hotovým dopytom. Odchádza z adresy zákazníka, takže sa stratiť nemôže.
Panel po odoslaní to aj hovorí.

**Keď pribudne server, ktorý POST prijme** (vlastný endpoint alebo služba
na formuláre), stačí ho vpísať do konštanty `SERVER` vo funkcii
`initDopyt` v `assets/koverta-2026.js`. Podmienka je jediná: musí byť na
`koverta.sk` alebo posielať hlavičky CORS, inak sa nedá prečítať, či
odoslanie prešlo. Kód už vtedy stav odpovede kontroluje a pri zlyhaní
ponúkne ten istý e-mail jedným klikom.

**Prílohy.** Pole na fotky ostáva, ale e-mailom sa súbory samy nepripoja.
Panel po odoslaní preto povie, kam ich poslať, a ukáže sa len vtedy, keď
zákazník naozaj nejaký súbor vybral.

## 6 · Meranie a cookies

Web nemeria nič. Google Tag Manager, Analytics aj Microsoft Clarity prišli
s témou zo Shopify; s doménou odchádzajú aj ony. Odstránený je aj Consent
Mode a lišta súhlasu, ktorú by nemal čo obsluhovať.

Stránka preto nenastavuje žiadne cookies a do prehliadača neukladá nič.
Jediný cudzí server, ktorý volá, je Google Fonts kvôli písmu. Drží to
kontrola `bez-merania`.

Keby sa meranie malo niekedy vrátiť, vráti sa s ním aj povinnosť pýtať si
súhlas a doplniť o tom článok do ochrany súkromia.

## 7 · Katalógové PDF

Päť katalógov Soltec visí na `cdn.shopify.com` pod ID starého obchodu.
Kým obchod existuje, súbory fungujú. Po jeho zrušení prestanú.

Pod mriežkou katalógov je preto riadok s e-mailom pre prípad, že sa
niektorý neotvorí. Trvalé riešenie je jedno z dvoch: nechať Shopify plán
bežať, kým sa súbory nepresunú, alebo ich vystaviť inde (v Drive sú
originály, majú 37 až 44 MB, do repozitára sa nehodia).

## 8 · Overiť po spustení

- [ ] Search Console: pridať doménu, overiť vlastníctvo, poslať `sitemap.xml`
- [ ] Bing Webmaster Tools to isté
- [ ] `curl -I https://koverta.sk/pristresky-pre-auta/` vráti 200
- [ ] náhodných 10 starých adries vráti 301 na správne nové
- [ ] test formulára: klik otvorí poštu s vyplneným dopytom
- [ ] test vyhľadávania `?q=pergola`
