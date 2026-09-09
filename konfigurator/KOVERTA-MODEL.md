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

## Odmerané diely (katalóg 14069, prístrešok 7 × 6 m)

Toto je **kompletný zoznam dielov** jednej scény, nie výber. Vyrobí ho
`../archiv-expivi/diely-zo-sceny.py`.

| diel | rozmer | počet |
| --- | --- | --- |
| rohový stĺp | 150 × 150 × 2 398 | 4 |
| stĺp stredného radu | 110 × 190 × 2 398 (190 pozdĺž hĺbky) | 2 |
| kotevná pätka | 250 × 250 × 615 | 6 |
| obvodový rám po bokoch | C 74 × 220, dlhý 5 820 | 2 |
| obvodový rám na čelách | C 74 × 220, dlhý 6 964 | 2 |
| väznica | C 58 × 180, dlhá 6 940 | 10 = 5 dvojíc |
| tabuľa trapézu | 1 057 × 5 900 × 36, krycia šírka 1 023 | 7 |
| lemovanie na čelách | 190 dovnútra × 260 nadol | 2 |
| lemovanie na bokoch | 240 dovnútra × 257 nadol — **kreslí sa 190**, viď nižšie | 2 |
| spojka (uholník) | 120 × 85 × 140 | 24 = 20 na väzniciach + 4 v rohoch |
| zadná stena (voľba) | 6 981 × 166 × 2 576 | 1 |

Výšky nad spodkom rámu (a to je zároveň svetlá výška 2 398 mm):

| od | do | čo |
| --- | --- | --- |
| 0 | 220 | obvodový rám |
| 40 | 220 | väznice |
| 223 | 259 | trapéz |
| 0 | 260 | lemovanie |

Z toho vyplýva, že **trapéz leží na hornej pásnici rámu a väzníc, nie v
nich**, a že horné rameno lemovania je nad ním. Kým bol podhľad plechu o
9 mm nižšie než pásnica, prerážali väznice a rám cez strechu a zhora z toho
boli svetlé čiary krížom cez vlnu.

### Prečo je dôležité merať len to, čo je v scéne

Zip exportu obsahuje aj siete variánt, ktoré scéna nekreslí. Katalóg 14069
má materiálové skupiny `4NOHY`, `6NOH`, `NOHY4`, `NOHY6`, `POZINK4`,
`POZINK6` — teda štvor- aj šesťnohú variantu naraz — a v zipe je 427 sietí,
z ktorých scéna kreslí 62. Kým sa meral celý zip, vyšla ich **zjednotená
množina**: šesťstĺpová varianta z nej mala všetky tri rady vtiahnuté dnu a
strecha na oboch koncoch prečnievala skoro meter. To v modeli nie je. Skript
preto berie len siete uvedené v `batches` v `../archiv-expivi/scena/<id>.json`
a každú rozdelí na súvislé komponenty podľa spoločných vrcholov — jedna sieť
totiž môže nesť viac dielov spojených len materiálom.

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

## Osnova: z čoho sa počíta celá konštrukcia

Nič sa nekreslí podľa tabuľky rozmerov. Celý prístrešok stojí na jednej
osnove a pravidlo je jedno: **stĺp nikdy nestojí sám o sebe — buď pod
väznicou, alebo v osi čelného rámu.**

1. **Osi čelných rámov.** Jedna je 52 mm od zadnej hrany strechy, druhá
   196 mm od odkvapovej — tam je 159 mm kapsa, v ktorej visí žľab. (Profil
   je 74 hrubý, takže líce je 15, resp. 159 mm dnu.)
2. **Osi väzníc** — a tie má každá varianta inde:
   * **štvorstĺpová** má tri väznice v strede a po **L/4 + 250** od neho
     (na 6,0 m je to 1 750 mm, na 5,6 m 1 650 — obe odmerané);
   * **šesťstĺpová** delí rozpätie medzi osami čelných rámov na rovnaké
     polia so stropom 960 mm, čo pri 5,2 – 6,0 m dá päť väzníc.
3. **Osi stĺpov.**
   * **štvorstĺpová** stojí pod **krajnými dvoma väznicami** z troch, takže
     strecha jej na oboch koncoch prečnieva vyše metra. Prierez 110 × 190
     (190 pozdĺž hĺbky) — všetky štyri.
   * **šesťstĺpová** má krajné rady **v osiach čelných rámov**, teda pri
     hranách strechy (prierez 150 × 150), a stredný rad **pod prostrednou
     väznicou** (110 × 190).

**Počet stĺpov nie je voľba zákazníka.** Vyplýva zo šírky a cenník to hovorí
sám: štvorstĺpová matica v Expivi končí na 6,2 m a od 6,6 m je publikovaná už
len šesťstĺpová.

| šírka | varianta | väznice pri 5,2 – 6,0 m | stĺpy |
| --- | --- | --- | --- |
| 2 500 – 6 200 | štvorstĺpová | 3, v strede ± (L/4 + 250) | 4 pod krajnými väznicami, 110 × 190 |
| 6 600 – 7 000 | šesťstĺpová | 5, rovnomerne, pole ≤ 960 mm | 4 v osiach rámu (150 × 150) + 2 pod prostrednou väznicou (110 × 190) |

### Prečo to nie je „stĺpy v rohoch"

Pri štvorstĺpovej variante **nie sú stĺpy v rohoch** — sú vyše metra dnu a
strecha nad nimi prečnieva. Vidieť to na oficiálnych rendroch Koverty aj v
exporte. Prierez 150 × 150 v zipe patrí **šesťstĺpovej** variante, nie
štvorstĺpovej; kým sa bral ako „rohový stĺp štvorstĺpovej", stáli stĺpy pri
hranách strechy a to je zle. Štvorstĺpová má všetky štyri stĺpy 110 × 190 a
tie v exporte sedia presne s krajnými väznicami svojej sady.

### Čo z toho vyjde a čo je v exporte

Osi sú vztiahnuté k hrane strechy, merané od odkvapového čela.

| veľkosť | osi väzníc podľa osnovy | odmerané v exporte |
| --- | --- | --- |
| 2,5 × 5,6 (4 stĺpy) | 1 222 / 2 872 / 4 522 | 1 222 / 2 872 / 4 522 |
| 2,5 × 6,0 (4 stĺpy) | 1 322 / 3 072 / 4 822 | 1 322 / 3 072 / 4 822 |
| 7,0 × 5,2 (6 stĺpov) | 1 021 / 1 847 / 2 672 / 3 497 / 4 323 | 1 021 / 1 846 / 2 672 / 3 497 / 4 322 |
| 7,0 × 6,0 (6 stĺpov) | 1 155 / 2 113 / 3 072 / 4 031 / 4 989 | 1 132 / 2 136 / 3 072 / 4 008 / 5 012 |

Pri štvorstĺpovej a pri 7,0 × 5,2 to sedí na milimeter, pri 7,0 × 6,0 do
23 mm — tam je autorský model o toľko nepravidelný. Os obvodového rámu
(52 / 196 mm) sedí na **21 katalógoch** všetkých šírok a hĺbok.

Preto tu nie je žiadna tabuľka polôh: rozmer na mieru vyjde tým istým
vzorcom ako katalógový a nie je čo dopočítavať naslepo.

### Dve chyby priamo v Expivi, ktoré netreba hľadať znova

- katalóg 14198 (7,0 × 5,6) má v exporte geometriu 5,2 m;
- scéna sa z API ťahá s prázdnym výberom atribútov, takže pri väčšine
  katalógov vráti len časť dielov (často len strechu). Kompletnú scénu majú
  14069 a 14192; ostatné vedia potvrdiť aspoň os obvodového rámu.

Zip exportu navyše nesie aj siete variánt, ktoré sa pri danej veľkosti
nepredávajú — pri 7,0 m sú v ňom rady 1 132 / 5 012, hoci štvorstĺpová
varianta pri tej šírke v cenníku nie je.

Novšie katalógy (šírky 3,0 / 3,8 / 4,5 / 5,4 / 6,2 / 6,6 m) sú iná generácia
dielov — stĺp 100 × 100 namiesto 150 × 150. Konfigurátor kreslí staršiu
generáciu, lebo tá sedí s tým, čo o profiloch povedal zákazník.

## Lemovanie má na všetkých stranách rovnakú šírku

Export Expivi má na čelách 190 mm a na bokoch 240 mm — overené na katalógoch
13670, 13688 aj 13412, všade rovnako. Podľa výrobcu je to v jeho modeli
nezrovnalosť: lemovanie je zo všetkých štyroch strán rovnaké, aby zhora
tvorilo pravidelný rám. Kreslí sa preto 190 na všetky štyri strany.
Odmeraná hodnota z exportu ostáva zapísaná v dátach ako `lemBokExport`,
aby sa nestratila.

## Test osnovy proti Expivi

`konfigurator/test/osnova-podla-expivi.js` prepočíta vzorec osnovy a porovná
ho s dielmi odmeranými z kompletných scén
(`archiv-expivi/diely-zo-sceny.json`). Nič nerenderuje — porovnávajú sa
čísla, takže odpovie na otázku „sú stĺpy, rám a väznice tam, kde majú byť"
bez hádania z obrázka. Kontroluje osi rámu, osi väzníc, osi stĺpov aj
prierezy stĺpov.

```
node konfigurator/test/osnova-podla-expivi.js
```

Tolerancia je 50 mm. Test si vzorec drží zvlášť a číta ho z tých istých
čísel v `kvRef` ako engine — keby sa engine a dáta rozišli, rozíde sa aj
test.

Overuje sa na troch úrovniach, takže „sedí to len pri jednej veľkosti" nemá
kde vzniknúť:

| čo | koľko katalógov | odkiaľ |
| --- | --- | --- |
| osi rámu, väzníc, stĺpov aj prierezy stĺpov | 2 (7,0 × 5,2 a 7,0 × 6,0) | kompletná scéna |
| os obvodového rámu | 21 | scéna, aj keď nesie len strechu |
| osi rohových stĺpov 150 × 150 (šesťstĺpová) | 32 | zip exportu — taký prierez má len šesťstĺpová varianta a sú presne štyri |
| rady štvorstĺpovej 110 × 190 | 20 | zip exportu — trojica {krajný, stredný, krajný} sa porovná celá |

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
  sa preto kreslia bez obťahu a vcelku, nie po tabuliach. Presah tabúľ leží
  v drážke vlny a zhora ho vidieť nie je — tabuľa sa prekrýva celým jedným
  hrebeňom; zdola ho prezradí len vlások na spoji.
* **Vrch plechu ide naopak cez celú plochu, aj pod ramená lemovania.** Kým
  sa kreslil len po odkryté pole, ostala pod ramenom diera do tela plechu a
  pri plochom pohľade bolo cez ňu vidieť pod strechu — svetlý pruh pozdĺž
  hrany. Prerážať nemôže, lebo rameno lemovania je celé nad vrchom plechu
  (256 – 260 mm proti 259 mm nad spodkom rámu).
* **Rám má za ramenom lemovania 3 mm vzduchu a bočný rám končí 2 mm pred
  čelným.** Kým jeho líce a čelo dosadali presne na roviny lemovania, ležali
  obe roviny na sebe, BSP ich rozdelil na spoločnej rovine a profil cez
  lemovanie presvital ako vlások.
* **Vnútorná hrana horného ramena lemovania má krátky zahyb nadol.** Bez neho
  tam bola len škára a pri plochom pohľade cez ňu bolo vidieť pod strechu —
  pozdĺž hrany svietil svetlý pruh.

## Stĺp je jakl s ostrou hranou, nie rúra

Oficiálne rendre Koverty (obrázky produktov v e-shope, `products.json` →
`images`) ukazujú stĺp ako dve rovné líca s ostrou hranou medzi nimi. Kým sa
rohy zaobľovali polomerom 16 % šírky, mal stĺp cez celé líce mäkký prechod a
čítal sa ako rúra. Zrazenie je preto 3,5 % šírky, teda asi 5 mm na stĺpe
150 × 150.

Pod stĺpom je na rendroch **doska so štyrmi skrutkami do betónu** a medzi
ňou a stĺpom **krátka pozinkovaná objímka** vysoká asi tretinu šírky stĺpa.
Objímka je v exporte 615 mm vysoká, ale na fotkách realizácií z nej toľko
vidieť nie je.

### Pozor na rendre z e-shopu

Sú to marketingové obrázky, nie merateľná geometria: zo 179 stiahnutých
súborov je len **123 rôznych** — Koverta ten istý render používa pre viac
rozmerov (napr. 6,0 × 5,6, 6,0 × 6,0 a 6,2 × 5,6 majú tri identické obrázky
a 6,6 × 6,0 zdieľa render so 7,0 × 6,0). Rozostupy stĺpov sa z nich preto
merať nedajú; na to je model v Expivi. Dobré sú na to, ako má výrobok
vyzerať — tvar stĺpa, pätka, zvod.

`../archiv-expivi/meranie-z-rendrov.py` z nich vie prečítať šírku stĺpa
oproti výške lemovania (vyjde 150 mm, ako v exporte) a polohy stĺpov na
obrázku.

## Test „cez strechu nič nepresvitá"

`konfigurator/test/strecha-nepresvita.js` prefarbí pozinkované diely a
podhľad na sýte farby, ktoré sa na streche nemajú kde vziať, a v pohľadoch
zhora spočíta, koľko takých pixelov na streche je. Musí ich byť nula.

```
npx http-server . -p 8901 -s &
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright \
  node konfigurator/test/strecha-nepresvita.js
```

Túto triedu chýb od oka nenájdeš: je to jeden pixel na spoji, ktorý sa cez
celú strechu poskladá do tenkej svetlej čiary, a pri väčšine uhlov tam nie
je. Test ju našiel na štyroch miestach — na väzniciach, na obvodovom ráme,
na platniach hlavy stĺpa aj na spojkách.

**Prečo vzniká a čo ju vypína.** Maliarske triedenie (BSP) rozdelí veľkú
plochu strechy rovinou zvislého líca profilu na dva kusy a samotné líce
kreslí medzi ne. Kus, ktorý je už nakreslený, mu potom neprekryje ten
pixel, o ktorý líce v premietaní presahuje. Spoľahlivo tomu zabráni jedine
to, že sa taký diel nekreslí vôbec — a to sa dá, lebo keď je oko nad
rovinou strechy, na nič pod ňou sa nedá pozrieť: každý lúč k takému bodu
ide zhora nadol a strecha alebo lemovanie mu stoja v ceste. Hranica
`nadStrechou` je presne tá rovina, takže sa nič nestratí ani o stupeň
nižšie — overené: tesne pod ňou a tesne nad ňou sa po erózii 5 × 5 nezmení
ani jeden pixel.

## Čiary na streche a fľaky na plechu

Tri rôzne chyby vyzerali rovnako — „strecha má čiary" — a každá mala iný
dôvod:

* **Vlna trapézu ako žalúzia.** Svetlý pruh bol široký polovicu rozteče a na
  antracitovom plechu z toho boli lamely. Skutočný plech T35 má rozteč
  204,6 mm (krycia šírka 1 023 / 5) a zhora je na ňom vidieť len tenký lesk
  na hrebeni a mäkký tieň v drážke.
* **Škáry dlažby cez strechu.** Podklad — dlažba, jej škáry a vrhnutý tieň —
  leží celý v rovine z = 0. V hustej scéne (5 400 plôch) naráža BSP na strop
  hĺbky a tam sa vracia k triedeniu podľa priemernej hĺbky; škára dlažby je
  pritom obrovská plocha vycentrovaná pod modelom, takže jej priemer vyjde
  bližšie než strecha. Podklad sa preto triedi zvlášť a kreslí prvý.
* **Biele vlásky na spojoch.** Veľkú plochu plechu rozdelí BSP na kusy podľa
  rovín rámu a väzníc; s vyhladzovaním presvital na každom takom spoji
  podklad. Veľké plochy sa preto kreslia s `crispEdges`. Úzke pruhy vlny
  **nie** — tie sa pri plochom pohľade zúžia pod pixel a bez vyhladzovania z
  nich ostanú zubaté kocky, teda tmavé fľaky na plechu.

## Čo ešte nie je hotové

- Steny sa kreslia z lamiel v engine, nie podľa odmeraných panelov.
- Záhradné prístrešky používajú rovnaké diely ako prístrešky pre autá;
  overiť, či to tak je aj v skutočnosti.

## Referenčný prístrešok (od 2026-09)

Konfigurátor kreslí jeden skutočný výrobok, nie dopočítaný rozmer:
**katalóg Expivi 14069 „Prístrešok 7.0 x 6.0"**, ktorého scéna je kompletná
— všetkých 62 sietí, ktoré kreslí, je odmeraných a rozdelených na diely.
Druhá kompletná scéna je 14192 (7,0 × 5,2) a slúži na kontrolu vzorca.
Čísla sú v `models.K.kvRef` v dátovom bloku stránky; to, čo sa mení šírkou,
je vedľa v `kvGeom`.

Model má v exporte hore Z, X = šírka, Y = hĺbka. V engine je **x = hĺbka**,
**y = šírka**, odkvapová hrana na `x = L`.

| diel | odmerané | pole v `kvRef` |
|---|---|---|
| pôdorys (obrys lemovania) | 7 000 × 6 000 mm | — |
| lemovanie | výška 260; čelá 190 hlboké cez celú šírku; boky v exporte 240 cez celú hĺbku (kreslí sa 190); **čelné kusy ležia na bočných**, presah je presne roh | `lemCelo`, `lemBok`, `lemH` |
| obvodový rám | **jeden** C 74 × 220 na stranu; z 0…220 nad spodkom rámu; vonkajšie líce 18 mm za lícom lemovania, 15 mm od zadného čela, **159 od odkvapového** | `ramW`, `ramH`, `ramBok`, `ramZad`, `ramOdkvap` |
| väznice | dvojice C 58 × 180 chrbtami k sebe, z 40…220; počet a osi dá osnova | `vazW`, `vazH`, `vazVsun` |
| trapéz | hrúbka 36, z 223…259; tabuľa 1 057, krycia šírka 1 023 (presah 34); kladie sa od druhého boku, posledná sa oreže; 85 mm od zadného a 15 od odkvapového čela | `trapH`, `trapTabula`, `trapKryt`, `trapZad`, `trapOdkvap` |
| rohový stĺp | **150 × 150** štvorec, výška 2 398, líce zarovnané s bokom pôdorysu | `postD`, `postW` |
| stĺp stredného radu | **110 × 190**, 190 pozdĺž hĺbky, stojí pod prostrednou väznicou | `stredW`, `stredD` |
| kotevná doska | 250 × 250, lícuje s bokom pôdorysu | `plate` |
| platňa hlavy stĺpa | 110 × 58 × 8 pod spodnou pásnicou rámu, dve skrutky zdola; rohový stĺp má dve platne na dvoch susedných stranách, obe dovnútra poľa | — |
| spojka | uholník s obrysom **120 × 85 × 140**, plech 8 mm ohnutý o 90°; dve skrutky do každého ramena. Na konci väznice dva (po jednom na každej strane dvojice C), **v rohu jeden**. Sedí v strede výšky profilu, na ktorý je skrutkovaný | `spojW`, `spojD`, `spojH`, `uholT` |
| skrutka | M12, kľúč 19 — šesťhranná hlava, ktorá z dielu vytŕča; farba C profilov (pozink), nie prístrešku | — |
| lamely steny | 20 × 100, rozteč 140, líce 15 mm pod obrysom | — |

Že spojok je presne 24 a v rohu je len jedna, hovorí kompletná scéna:
20 na koncoch piatich väzníc (dva na koniec, po jednom na každej strane
dvojice C) a 4 v rohoch. Kým sa kreslili dve na roh, bol pozdĺž bočného
rámu rad spojok, ktorý v modeli nie je.

**Žľab ani zvod v exportoch nie sú** — podrobne vyššie v „Čo v Expivi
modeli nie je". Kreslia sa podľa oficiálneho rendru, kde ich vidieť:

* **Priemer rúry je odmeraný.** Šikmý úsek zvodu má na rendri kolmo 11,3 px
  a stĺp vedľa neho 26 px na 150 mm, čo dáva 65 mm. Kreslí sa 70 — tenšia
  rúra sa pri stĺpe stráca.
* **Zvod vychádza zo žľabu pri jeho vonkajšej stene**, teda o kus von od
  stĺpa, a jedným kolenom sa vráti k jeho odkvapovému licu. Koleno klesne
  asi o sedem desatín toho, o čo sa rúra vráti dnu.
* **Kolená sú kolená, nie zlomy.** Lomená čiara dráhy sa zaobľuje: v každom
  rohu ju nahradí oblúk (kvadratická Bézierova krivka s riadiacim bodom v
  rohu). Kým tam boli ostré zlomy, vyzeral zvod ako zohnutý drôt.
* Rúra stojí 8 mm od líca stĺpa — na stavbe ju tam drží príchytka — a jej
  kruhové tieňovanie je výraznejšie než na plochom líci, inak sa so stĺpom
  zlieva.

Kotevná objímka 250 × 250 × 615 v exporte je, ale na žiadnej fotke
realizácie nie je — kreslí sa len doska.

Horné rameno lemovania sa kreslí 4 mm hrubé, nie 15 ako zvislé — je to
plech, ktorý leží na hrebeňoch trapézu. Jeho spodné líce musí byť pod
vrchom plechu, inak medzi nimi ostane škára a pri plochom pohľade cez ňu
presvitá podhľad.
