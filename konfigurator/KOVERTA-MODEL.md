# Prístrešky Koverta v konfigurátore — čo je odkiaľ

Stránka `?page=koverta` beží na tom istom behu ako Soltec
(`soltec-premium.js`). Všetko, čo je pre Kovertu iné, je podmienené poľom
modelu, ktoré Soltec modely nemajú — Soltec sa preto nesmie zmeniť.

## Zdroj čísel

Ceny, rozmery a možnosti sú z Expivi. Archív je v `../archiv-expivi`.

Geometria je **odmeraná z Expivi modelu**, nie odhadnutá. Export katalógu sa
sťahuje takto (token je verejne v HTML stránky
`koverta.sk/apps/configurator?catalogue=<shopify_id>`, atribút `data-token`):

```
curl -H "Authorization: Bearer $TOK" \
  https://data.expivi.net/teams/811/models/<katalog>/<hash>.zip
```

`<hash>` je v `archiv-expivi/scena/<katalog>.json` v poli `configurable_export`.

Formát `.ebm` je jednoduchý binárny mesh. Hlavička je 8× uint32:

| offset | čo |
| --- | --- |
| 0 | verzia (2) |
| 4 | počet floatov pozícií (= 3 × počet vrcholov) |
| 8 | počet indexov |
| 12 | počet UV kanálov |
| 16 | offset pozícií (3 × float32) |
| 20 | offset normál (3 × float32) |
| 24 | offset UV (2 × float32) |
| 28 | offset indexov (uint32) |

Parser je `../archiv-expivi/ebm.py`, meranie stĺpov
`../archiv-expivi/meranie-stlpov.py`. Odmerané výsledky sú v
`stlpy-odmerane.json` (surové, po katalógoch) a `stlpy-tabulka.json`
(po veľkostiach).

## Odmerané diely (katalóg 13412, prístrešok 6 × 6 m)

Model je v centimetroch, tu prepočítané na milimetre.

| diel | rozmer |
| --- | --- |
| stĺp 4-stĺpovej varianty | 150 × 150 |
| stĺp 6-stĺpovej varianty | 110 × 190 (190 pozdĺž hĺbky) |
| kotevná pätka | 250 × 250 |
| lemovanie na čelách | 190 dovnútra × 257 nadol |
| lemovanie na bokoch | 240 dovnútra × 254 nadol |
| obvodový C rám | 74 × 220, líce 18 pod lemovaním |
| väznica | C 58 × 180, vždy dve chrbtami k sebe |
| trapéz | vlna 36, krycia šírka 1 072 |
| lamela steny | 20 × 100 |
| panel steny | 30 hrubý, 1 980 vysoký, od 268 nad zemou |

Stĺp, lemovanie aj pôdorysný rozmer majú **spoločné vonkajšie líce** — stĺp
nikdy netrčí z fasády. Výnimka je odkvapová strana, kde lemovanie stojí
142 mm ďalej von, aby sa zaň zmestil žľab; presne o toľko je v modeli
štvorstĺpová varianta na tom konci zatiahnutá dnu.

## Čo v Expivi modeli nie je

Odkvap ani zvod. Sú poskladané podľa fotografií realizácií a podľa toho, čo
k nim povedal zákazník: hranatý žľab visí na líci čelného C profilu vo farbe
prístrešku, zvod vychádza z neho, kolenom 45° ide dozadu a po čele rohového
stĺpa na zem.

## Polia modelu, ktoré túto cestu zapínajú

`roofKit: 'koverta'`, `postD`, `postW`, `plate`, `rimSoffitHex`,
`trapezSoffitHex`, `trapezTopHex`, `postsPerSide`, `snap`, `wallSide`,
`wallBack`, `minHeight`. Na úrovni stránky `gutter`, `bolts`, `roundPosts`,
`basePlates`, `sideOpts`, `sideMat`, `sideLabel`, `sideLocative`.

## Polohy stĺpov

Odmerané zo 67 exportov a uložené v modeli ako `postRows`. Kľúč je hĺbka
prístrešku a počet stĺpov na strane; hodnota je zoznam polôh pozdĺž hĺbky.

| hĺbka | 4 stĺpy | 6 stĺpov |
| --- | --- | --- |
| 5 200 | 150, 5 062 | v exportoch nie je |
| 5 600 | 156, 5 468 | 1 142, 2 792, 4 442 |
| 6 000 | 156, 5 868 | 1 242, 2 992, 4 742 |

Šesťstĺpová varianta má **všetky tri rady vtiahnuté dnu** a strecha na oboch
koncoch prečnieva. Z rovnomerného delenia by to nikdy nevyšlo, preto sa
polohy neprepočítavajú — berú sa tak, ako sú odmerané. Kde pre danú hĺbku
tabuľka nič nemá, ostáva pôvodný výpočet.

Prierez stĺpa je naprieč všetkými katalógmi rovnaký: 150 × 150 mm pri
štyroch stĺpoch, 110 × 190 mm pri šiestich, kde 190 je rozmer pozdĺž hĺbky.
Staršie katalógy (šírky 2,5 – 3,0 m a 3,8 m) majú inú generáciu dielov —
240 × 240 alebo 100 × 100 — tie zatiaľ konfigurátor nepoužíva.

## Čo ešte nie je hotové

- Steny sa kreslia z lamiel v engine, nie podľa odmeraných panelov.
- Záhradné prístrešky používajú rovnaké diely ako prístrešky pre autá;
  overiť, či to tak je aj v skutočnosti.
