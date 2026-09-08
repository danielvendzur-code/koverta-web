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
| lemovanie na bokoch | 240 dovnútra × 254 nadol — **kreslí sa 190**, viď nižšie |
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

Odkvap ani zvod. V žiadnom zo 70 exportov niet dielu, ktorý by nimi bol — v
Expivi je odkvap samostatná voliteľná skupina bez geometrie.

**Ako to vyzerá na realizáciách** (rendery Koverty v `archiv-expivi`, ktoré
prišli s katalógmi): pod odkvapovou hranou **nevisí žiadny žľab**. Spodná
hrana lemovania ide po celej dĺžke čistá. Obvodový rám je na tej strane
zatiahnutý 159 mm dnu a v tej kapse za lemovaním žľab sedí — zvonku ho
nevidno. Vidieť z neho iba **zvod**: spod lemovania vyjde pri rohovom stĺpe,
kolenom sa vráti k jeho licu a po ňom ide na zem, kde končí vyhnutou pätkou.

Tak je to aj nakreslené. Zavesený polkruhový žľab na hákoch, ktorý tu bol
istý čas, na žiadnej fotke Koverty nie je — bola to chyba a je preč.

## Polia modelu, ktoré túto cestu zapínajú

`roofKit: 'koverta'`, `postD`, `postW`, `plate`, `rimSoffitHex`,
`trapezSoffitHex`, `trapezTopHex`, `kvGeom`, `snap`, `wallSide`,
`wallBack`, `minHeight`. Na úrovni stránky `gutter`, `bolts`, `roundPosts`,
`basePlates`, `sideOpts`, `sideMat`, `sideLabel`, `sideLocative`.

## Počet a rozmiestnenie stĺpov a väzníc

**Nie je to voľba zákazníka.** Vyplýva to zo šírky prístreška a konfigurátor
si to určí sám. Cenník to hovorí sám za seba: štvorstĺpová matica v Expivi
končí na 6,2 m a od 6,6 m je publikovaná už len šesťstĺpová.

| šírka | stĺpy | väznice | prierez stĺpa |
| --- | --- | --- | --- |
| 2 500 – 6 200 | 4 (v rohoch) | 3 | 150 × 150 |
| 6 600 – 7 000 | 6 (rohy + stredný rad) | 5 | 110 × 190 |

V dátach stránky je to pole `kvGeom` — zoznam pásiem `{max, postsPerSide,
postD, postW, poDlzke}`. V engine ho číta `kvBand()` a z neho berú polohy
`postD()`, `postW()`, `postLayout()`, `postXs()` aj osi väzníc. Soltec pole
`kvGeom` nemá, takže ide ďalej po svojom.

Osi sú vztiahnuté k obvodovému rámu, teda 158 mm dnu od vonkajšej hrany
strechy; `rows` je predné líce stĺpa, `vaznice` sú osi dvojíc C.

| hĺbka | rady 4 stĺpov | väznice pri 4 stĺpoch |
| --- | --- | --- |
| 5 200 | 0, 4 910 | 1 286 / 2 529 / 3 772 |
| 5 600 | 0, 5 310 | 1 391 / 2 729 / 4 067 |
| 6 000 | 0, 5 710 | 1 491 / 2 929 / 4 367 |

| hĺbka | rady 6 stĺpov | väznice pri 6 stĺpoch |
| --- | --- | --- |
| 5 200 | 0, 2 418, 4 870 | 838 / 1 675 / 2 513 / 3 351 / 4 188 |
| 5 600 | 0, 2 618, 5 270 | 904 / 1 809 / 2 713 / 3 617 / 4 522 |
| 6 000 | 0, 2 818, 5 670 | 971 / 1 942 / 2 913 / 3 884 / 4 855 |

### Ako sú tie čísla odmerané

Skript `mer4.py` (v pracovnom adresári relácie) prejde všetkých 66 exportov
prístreškov, pre každý si podľa názvu katalógu určí, ktorá os je šírka,
ktorá hĺbka a ktorá výška — novšie katalógy majú inú orientáciu než staršie —
a zaradí diely podľa prierezu.

Kľúč k čítaniu výsledkov: katalóg, ktorý má otázku „Typ prístrešku", obsahuje
meshe **oboch variánt naraz**. Namerané osi väzníc sú preto ich zjednotenie:
pri hĺbke 5 600 vyjde päť osí, z toho `{1 391, 2 729, 4 067}` patrí
štvorstĺpovej a `{1 089, 2 729, 4 369}` šesťstĺpovej — stredná je spoločná.
Pri hĺbke 5 200 obe sady splývajú, tam sú osi len tri.

Katalógy 6,6 × … a 7,0 × … otázku „Typ prístrešku" **nemajú** — tam je
geometria jediná, a tá má päť väzníc a šesť stĺpov. Presne to je ten
prístrešok pre tri autá z fotky: stĺpy inde a väzníc viac.

Dve chyby priamo v Expivi, ktoré netreba hľadať znova:
- katalóg 14198 (7,0 × 5,6) má v exporte geometriu 5,2 m;
- katalógy s hĺbkou 5 200 majú v exporte len štyri zo šiestich stĺpov
  šesťstĺpovej varianty — chýbajúci rad je zrkadlom toho, ktorý tam je.

Novšie katalógy (šírky 3,0 / 3,8 / 4,5 / 5,4 / 6,2 / 6,6 m) sú iná generácia
dielov — stĺp 100 × 100 namiesto 150 × 150. Konfigurátor kreslí staršiu
generáciu, lebo tá sedí s tým, čo o profiloch povedal zákazník; z novšej sa
preberajú len polohy radov a osi väzníc pre šírky od 6,6 m.

## Lemovanie má na všetkých stranách rovnakú šírku

Export Expivi má na čelách 190 mm a na bokoch 240 mm — overené na katalógoch
13670, 13688 aj 13412, všade rovnako. Podľa výrobcu je to v jeho modeli
nezrovnalosť: lemovanie je zo všetkých štyroch strán rovnaké, aby zhora
tvorilo pravidelný rám. Kreslí sa preto 190 na všetky štyri strany.
Odmeraná hodnota z exportu ostáva zapísaná v dátach ako `lemBokExport`,
aby sa nestratila.

## Test prekrytia

`konfigurator/test/prekrytie.js` overí, či plech strechy neprerazí cez
lemovanie. Túto triedu chýb od oka spoľahlivo nenájdeš: plech prerazí len
pri niektorých uhloch a len o pár pixelov, ale na modeli to je vidieť ako
„trapéz pretŕča cez lemovanie". Test zafarbí strechu a lemovanie kontrastne,
scénu vykreslí do plátna a v bodoch, kde má byť lemovanie, prečíta skutočnú
farbu pixela — 180 pohľadov × ~270 bodov, tri veľkosti.

```
npx http-server . -p 8901 -s &
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node konfigurator/test/prekrytie.js
```

Engine na to nesie `window.SP_TEST` (kamera, prekreslenie, prepočet bodu na
plátno). Nič nekreslí ani nemení.

Prečo plech prerážal a čo to spravilo:

* **Veľké plochy plechu sa nesmú obťahovať.** Obťah ide 0,35 px za obrys
  plochy a pri plochom pohľade, keď je rameno lemovania zúžené na pár
  pixelov, ho ten pretiahnutý okraj prekryje. Lícna aj spodná plocha plechu
  sa preto kreslia bez obťahu a vcelku, nie po tabuliach — škáry medzi
  tabuľami sú samostatné čiary.
* **Lícna plocha ide len po odkryté pole.** Pod ramenami lemovania nie je čo
  vidieť, takže tam vrchná plocha nie je a niet čomu prerážať.
* **Vnútorná hrana horného ramena lemovania má krátky zahyb nadol.** Bez neho
  tam bola len škára a pri plochom pohľade cez ňu bolo vidieť pod strechu —
  pozdĺž hrany svietil svetlý pruh.

## Čo ešte nie je hotové

- Steny sa kreslia z lamiel v engine, nie podľa odmeraných panelov.
- Záhradné prístrešky používajú rovnaké diely ako prístrešky pre autá;
  overiť, či to tak je aj v skutočnosti.

## Referenčný prístrešok (od 2026-09)

Konfigurátor kreslí jeden skutočný výrobok, nie dopočítaný rozmer:
**katalóg Expivi 13670 „Pristresok 4.0 x 6.0", štvorstĺpová varianta.**
Všetky čísla nižšie sú odmerané z `.ebm` meshov toho exportu
(`archiv-expivi/exporty-modelov.json` → `zips/13670.zip`), nie odhadnuté.
Uložené sú v `models.K.kvRef` v dátovom bloku stránky; to, čo sa mení
rozmerom, je vedľa v `kvGeom`.

Model má v exporte hore Z, X = šírka, Y = hĺbka. V engine je **x = hĺbka**,
**y = šírka**, odkvapová hrana na `x = L`. Prepočet: `x = 6000 − (Y + 3512)`,
`y = X + 2000`.

| diel | odmerané |
|---|---|
| pôdorys (obrys lemovania) | 4 000 × 6 000 mm |
| lemovanie | výška 260; čelá 190 hlboké cez celú šírku; boky v exporte 240 cez celú hĺbku; **čelné kusy ležia na bočných**, presah je presne roh |
| obvodový rám | **dvojica** C 74 × 220 chrbtami k sebe, spolu 150 mm — rovnako hrubý ako stĺp; z 2 398…2 618; vonkajšie líce bokov za zvislým ramenom lemovania, 15 mm od zadného čela, **159 od odkvapového** |
| väznice | 3 dvojice C 58 × 180 chrbtami k sebe, z 2 438…2 618, osi 1 490 / 2 928 / 4 366 od zadného čela, beh y 30…3 970 |
| trapéz | hrúbka 36, z 2 621…2 656, krycia šírka 1 072 (presah 254), x 15…5 915, y 46…3 982 |
| stĺp | **150 × 150 štvorec**, výška 2 398, rady x = 0 a 5 709 |
| kotevná doska | 250 × 250, lícuje s bokom pôdorysu |
| platňa hlavy stĺpa | 110 × 58 × 8 pod spodnou pásnicou rámu, dve skrutky zdola; rohový stĺp má dve platne na dvoch susedných stranách, obe dovnútra poľa |
| spojka | uholník: plech 10 mm ohnutý o 90° v strede, rameno 170, výška 70; dve skrutky do každého ramena. Na konci väznice dva (po jednom na každej strane dvojice C), v rohu dva vedľa seba po dĺžke. Sedí v strede výšky profilu, na ktorý je skrutkovaný |
| skrutka | M12, kľúč 19 — šesťhranná hlava, ktorá z dielu vytŕča; farba C profilov (pozink), nie prístrešku |
| lamely steny | 20 × 100, rozteč 140, z 298…2 218, líce 15 mm pod obrysom |

Šesťstĺpová varianta má v tom istom exporte stĺpy 110 × 190 v osiach
1 322 / 3 072 / 4 822. V konfigurátore sa nedá vybrať — nasadí sa sama od
šírky 6,6 m, a to v rozmiestnení z novších katalógov (rohy + stred), lebo
tam je jediná publikovaná. Viď „Počet a rozmiestnenie stĺpov a väzníc".

**Žľab ani zvod v exportoch nie sú** — podrobne vyššie v „Čo v Expivi modeli
nie je".

Kotevná objímka 250 × 250 × 615 v exporte je, ale na žiadnej fotke
realizácie nie je — kreslí sa len doska.

Dva rozdiely medzi odmeraným exportom a tým, čo kreslíme, a prečo:

* **Obvodový rám je dvojica C profilov, nie jeden.** V exporte je na bok
  jeden C 74 mm, ale stĺp má 150 a zdola by spoza rámu vyčnieval o 58 mm.
  Podľa výrobcu je rám rovnako hrubý ako stĺp, takže sú to dva C profily
  chrbtami k sebe (2 × 74 ≈ 150) — rovnako ako priečne väznice. Škáru medzi
  nimi majú zdola vidieť len väznice; obvodový rám má čistý spodok.
* **Spojka je uholník, nie kváder.** Export má 24 kusov dielu s obrysom
  120 × 85 × 140; ten obrys je obálka ohnutého plechu, nie plný blok.

Horné rameno lemovania sa kreslí 4 mm hrubé, nie 15 ako zvislé — je to
plech, ktorý leží na trapéze. Pri 15 mm doň trapéz zapadal a strecha
vyzerala zhora ako vaňa.
