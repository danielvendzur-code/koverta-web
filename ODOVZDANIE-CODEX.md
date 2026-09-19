# Odovzdanie: dokončenie webu Koverta

Vetva `vendzur/gallant-euler-bkvsqa`, postavená na `master` (`61b838c`).
Posledný commit `f2cfa39`. **Nemerguj do `master`** — majiteľ to výslovne
zakázal, chce náhľadový odkaz.

## Ako pracovať

- Lokálny server: `python3 -m http.server 8901` z koreňa repozitára.
- Testy: `node konfigurator/test/<meno>.js`. Bežia proti `127.0.0.1:8901`.
  Kľúčové: `pricing-logic`, `routing-smoke`, `koverta-accessories`,
  `krytina-strechy`, `scene-assets`, `pocasie-odtok`, `technical-fidelity`.
- `layout-smoke` padá na `ERR_CERT_AUTHORITY_INVALID` (Google Fonts cez proxy).
  Je to prostredie, nie regresia.

## Pravidlá, ktoré majiteľ stanovil a platia ďalej

1. **Nevypínaj kontroly, aby boli zelené.** Ak kontrola bráni správnej zmene,
   prepíš ju na požiadavku, ktorú stráži, a napíš do commitu prečo.
2. **Netvrď, že model je presne 1:1**, ak na to nemáš podklad.
3. **Nevymýšľaj ceny ani produktové voľby** bez opory v cenníku.
4. **Texty a fotky musí majiteľ odsúhlasiť** pred nasadením. Ukáž mu návrh
   (čísluj položky, odpovedá po číslach), nenasadzuj naslepo.
5. Fotky Soltec nesmú byť na stránkach Koverta a naopak.

## Čo je hotové

Schválené texty (rady F a SL podľa skutočnosti, nosnosť na sneh, svah,
elektrina v stĺpe, doplnky, RAL v konfigurátore, štvrtý údaj „1 až 3 autá“),
tri nové fotky majiteľa, kresby podkladu s hranatým stĺpom a pozinkovanou
pätkou, statická galéria, tmavšie sekundárne tlačidlá, písmo min. 12 px,
preč video pri lamelách a značky „Spôsob 1/2“, a 66 stránok katalógových
rozmerov (`tools/generuj-rozmery.py`).

## Čo ostáva — v poradí podľa dôležitosti

### A. Konfigurátor
1. **Fullscreen**: model je v ráme pritesný a dolná tretina plochy ostáva
   prázdna. Overené meraním: viewBox aj element majú rovnaký pomer strán,
   takže deformovaný nie je — ide o orámovanie v `drawStage()`
   (`konfigurator/soltec-premium.js`, hľadaj `const VW = 1000`). Envelope
   nezahŕňa tieň, preto to opticky sadá hore.
2. **Sklá áut**: majiteľ napísal „autá sú priesvitné“. Karoséria priesvitná
   NIE JE (alpha 1, blending vypnutý, overené). Priehľadné sú sklá kabíny
   (materiál 2). **Opýtaj sa ho, čo presne myslel**, než to zmeníš.
3. Iné piktogramy pre výber modelu — teraz pôsobia strojovo.
4. Graf výberu rozmeru sa musí zmestiť bez scrollovania.
5. „Chcem rozmer na mieru“ nech predvyplní rozmer do formulára.
6. Tmavý presvit v rohu prístrešku Koverta pri pohľade zvnútra.
7. Hmla na bokoch lemovania; na slabých zariadeniach tieň úplne vypnúť.

### B. Podstránka tienenia
8. „Pevné steny“ majú fotku ZIP rolety — vymeniť.
9. „Detail lamiel v otvorenej polohe“ je v skutočnosti pevné prestrešenie.
10. Hore chýbajú fotky k vymenovaným typom (prevziať z iných podstránok,
    ale **nie Koverta**).
11. Vzor konfigurátora zjednotiť so zvyškom webu (nie 3D modely).

### C. Vzhľad naprieč webom
12. „Čo je v cene“ — preč tenké čiarky, iný vizuál.
13. Zjednotiť veľkosti nadpisov nad „vlastná výroba / oceľ aj hliník“.
14. Za časté otázky dať logo Koverta otočené o 90°, hýbe sa so scrollom.
15. Viac CTA na podstránkach, hlavné žlté.

### D. Realizácie a vodoznak
16. Starý Shopify export je v `/root/.claude/uploads/...ESHOP.zip` (rozbalený
    v scratchpade). **Vodoznak v téme nie je** — audit v balíku
    (`02_VODOZNAK/ZISTENIE_VODOZNAK.txt`) potvrdzuje, že logo bolo vypálené
    priamo do fotiek v Shopify, nie generované témou. Takže: buď stiahnuť
    pôvodné fotky (zoznam 560 referencií v
    `04_REFERENCIE/gallery_shopify_image_references.csv`, sú to `shopify://`
    URI, treba k nim prístup do obchodu), alebo **spraviť vlastný vodoznak**
    — to je lepšie, lebo bude automatický. Navrhni majiteľovi oboje.
17. Galéria realizácií: prevziať správanie zo starej témy
    (`01_REALIZACIE_GALERIA/sections/image-gallery.liquid` — mriežka,
    fullscreen modal, šípky, swipe, mobilný slider), ale **dizajn nechať
    z novej verzie**. Sedem kategórií podľa `page.galeria-*.json`.

### E. Otvorené otázky na majiteľa
- Karta „Prístrešky pre autá“ na domovskej nesie obe značky (Koverta aj
  Soltec), lebo vedie na oboje. Odčleniť Soltec na vlastnú kartu, alebo
  nechať a zmeniť len fotku?
- **Ktoré záhradné fotky sú naozaj Koverta?** Majiteľ potvrdil, že
  `koverta-zahradny-pristresok-mokrance-sedenie` a `...-palarikovo-nad-terasou`
  sú Soltec, hoci majú v názve „koverta“. Sú už vymenené, ale rovnako zle
  pomenovaných môže byť viac — zvyšných osem neoverených treba potvrdiť.
  `...-zelena-strecha` som použil neoverenú; majiteľ ju nechal tak.
- Je prestup na elektriku v stĺpe celý v cene, alebo len príprava?
- Katalógové rozmery: majú byť napojené na Shopify produkty (kolekcie
  `pristresky-pre-auta`, `zahradne-pristresky` atď.), alebo stačia
  vygenerované stránky s odkazom do konfigurátora?

## Poznámka k vygenerovaným stránkam

`tools/generuj-rozmery.py` číta cenník z `konfigurator/cfg-pages.js`. Po zmene
ceny spusti `python3 tools/generuj-rozmery.py` — prepíše všetkých 66 stránok.
Nepíš do nich ručne.
