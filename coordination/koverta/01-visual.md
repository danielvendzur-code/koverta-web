# KOVER​TA-01-VISUAL report

## Branch a overený SHA

- Branch: `agent/01-koverta-visual`
- Base: `fix/final-koverta-audit-20260909`
- Base SHA pri založení vetvy: `ac9cc67cccfecfbff36ed9953e14b93ffb7e1a64`
- Čistý overený implementation SHA: `0c449158f09dd51c9857336cbd110f69cc819037`
- Overený renderer blob `konfigurator/soltec-premium.js`: `56f9e29146b3d0ece7e4cacdf6c54a3606348464`
- CI snapshot SHA s totožným renderer blobom: `2ead5b6365f6075c2376860da4cea8f3962032a8`
- Nič nebolo mergnuté do masteru.

## Zmenené súbory

Runtime:
- `konfigurator/soltec-premium.js`

Dokumentácia:
- `coordination/koverta/01-visual.md`

Žiadny testovací súbor, cenník, `cfg-pages.js`, Expivi podklad ani Soltec konfigurácia neboli zmenené.

## Čo bolo opravené

### Trapézový plech – podhľad

Pôvodný Koverta podhľad bol veľká rovná SVG plocha a profil bol imitovaný polopriehľadnými pásmi, kontaktnými tieňmi a 2 mm kreslenými spojmi. Pri rotácii to vytváralo syntetické čiary a podhľad nepôsobil ako profilovaný plech.

Aktuálny renderer:
- zachováva technickú výšku `TRAP_H` a kryciu rozteč `TRAP_KRYT` z existujúcich Expivi dát;
- vytvára podhľad ako súvislú 3D facetovanú vlnu;
- odstránil umelé kontaktné shadow pásy;
- odstránil umelé 2 mm spojové pásy tabúľ;
- nepoužíva fotografiu na odvodenie žiadneho mm rozmeru;
- používa `RIB_CROWN_VIS` a `RIB_SHOULDER_VIS` iba ako vizuálne proporcie renderera odvodené z už existujúcich renderovacích hodnôt, nie ako technickú špecifikáciu výrobku.

### Lemovanie a horná strana strechy

Počas práce boli explicitne zachytené a odstránené regresie, pri ktorých strecha presvitala cez horné rameno lemovania pri grazing uhloch.

Finálna verzia:
- nepoužíva `paintLast`, depth bias ani inú painter-order výnimku;
- nemení rozmery lemovania ani nepridáva zväčšenú skrytú kryciu geometriu;
- zachováva existujúce fyzické orezanie viditeľnej hornej plochy za vnútornou hranou lemovania;
- delí hornú rovinu na malé neprekrývajúce koplanárne plochy, aby BSP pracoval s lokálnou hĺbkou;
- horné vizuálne rebrovanie kreslí ako súvislé pozdĺžne pásy bez X-segmentácie, takže na mobile nevzniká bodkovaný/moiré raster;
- rohy a vnútorná hrana lemovania zostávajú čisté pri top, corner aj nízkych oblique pohľadoch.

### Materiálový vzhľad

Globálny lighting renderer ani Soltec cesta neboli menené.

Overené na Koverte:
- RAL 7016 a RAL 9005 si zachovávajú čitateľné hrany a nie sú čiernou siluetou;
- RAL 9010 a RAL 9006 si zachovávajú objem a hrany bez prepálenia do jednej bielej plochy;
- pozinkované C-profily, väznice, platne a hardware zostávajú vizuálne oddelené od RAL lakovaných stĺpov a lemovania;
- 3D profil podhľadu vytvára vlastný svetlo/tieň z normál plôch namiesto namaľovaných falošných pásov.

## Čo nebolo menené

- master
- Soltec runtime a Soltec produktová logika
- ceny
- obchodná logika
- payload dopytu
- Expivi rozmery a aktívne osi
- počet a prierezy stĺpov
- rozmery rámu a väzníc
- oficiálna RAL paleta
- testy a ich tolerancie
- technická logika uholníkov, platní a skrutiek
- odkvap a zvod

Počas práce bola experimentálna zmena počtu skrutiek okamžite vrátená, pretože technická vernosť spojov patrí Agentovi 05. Experimentálny `paintLast` workaround bol takisto odstránený a nie je vo finálnom runtime.

## Fotografie použité iba ako vizuálna referencia

Google Drive → MARKETING → realizácie → Koverta Auto Pristresky.

Povinné referencie:
- Limbach Sevelova 7 x 6 x 6: `IMG_7798.jpeg`, `IMG_7795.jpeg`
- Skalica Funny Sport 6,6 x 5,2 x 6: `IMG_1623.jpeg`, `IMG_1619.jpeg`
- Váhovce Takáč 4,2 x 6 x 4, RAL 9006: `IMG_8982.jpeg`, `IMG_8974.jpeg`, `IMG_8967.jpeg`

Ďalšie vizuálne referencie:
- Potvorice: `IMG_9456`, `IMG_9452`, `IMG_9455`
- Rybník: `IMG_8758`, `IMG_8753`, `IMG_8748`
- Bánov: `IMG_9563`, `IMG_9560`, `IMG_9561`

Z fotografií sa porovnával iba vzhľad a existencia prvkov: charakter lakovaných povrchov, pozinkovaný podhľad/rám, čitateľnosť profilovania strechy, proporčný dojem 4- a 6-stĺpovej zostavy, vizuálne napojenie lemovania a vzhľad pätiek. Z fotografií nebol odvodený žiadny technický rozmer.

## Browser pohľady

Finálny browser visual sweep: GitHub Actions run `34394351081`, SUCCESS.

Zachytených a vizuálne skontrolovaných 58 stavov:
- desktop 1440 × 1000: 29
- mobile 390 × 844: 29

### 6 stĺpov – 7000 × 6000 – RAL 7016

Desktop aj mobile:
- 0°
- 30°
- 60°
- 90°
- 120°
- 150°
- 180°
- 210°
- 240°
- 270°
- 300°
- 330°
- top
- under

Pri všetkých uhloch boli kontrolované:
- presvitanie strechy cez lemovanie;
- zuby alebo diery v rohoch lemovania;
- falošné/diagonálne čiary podhľadu;
- náhle zmeny materiálového tónu;
- miznutie stĺpov, rámu alebo väzníc;
- súvislosť horného rebrovania.

### 6 stĺpov – 7000 × 5200 – RAL 9005

Desktop aj mobile:
- front
- side
- corner
- top
- under

### 4 stĺpy – 4000 × 6000 – RAL 9006

Desktop aj mobile:
- front
- side
- corner
- top
- under

### 4 stĺpy – 4000 × 6000 – RAL 9010

Desktop aj mobile:
- front
- side
- corner
- top
- under

Samostatný test `plynulost.js` navyše prechádza 3 veľkosti × 5 elevácií × 72 uhlov v plnom 360° orbite.

## Výsledky existujúcich testov

Finálny nezmenený test matrix: GitHub Actions run `34394356212`, SUCCESS.

- `osnova-podla-expivi.js`: PASS
- `prekrytie.js`: PASS
- `strecha-nepresvita.js`: PASS
- `stlpy-vidno.js`: PASS
- `plynulost.js`: PASS
- `layout-smoke.js`: PASS

Testy neboli upravené, vypnuté ani oslabené.

## Čo zostáva podozrivé / mimo scope

1. Odkvap a zvod sú mimo scope Agent 01 a patria Agentovi 04. Na under pohľade je ich geometria veľmi viditeľná pri stĺpe; nebola tu prerábaná ani technicky posudzovaná.
2. Uholníky, hlavové platne, pätky a presný pattern skrutiek patria Agentovi 05. Agent 01 ich nemenil. Vizuálne sú čitateľné, ale technickú správnosť ich počtu/orientácie musí potvrdiť Agent 05.
3. Presný technický priečny rez trapézu nad rámec overených `TRAP_H` a `TRAP_KRYT` nie je v tomto scope dokázaný. Vizuálne proporcie hrebeňa a ramena preto zostávajú explicitne renderovacími proporciami, nie deklarovanými výrobnými mm údajmi.
4. Horná strana strechy používa stabilné vizuálne tieňovanie rebrovania na fyzicky správne umiestnenej hornej rovine. Podhľad je skutočne facetovaný 3D profil. Toto rozdelenie je zámerné: fyzické horné facety pri grazing pohľade spôsobovali overený raster-occlusion konflikt s tenkým horným lemovaním, zatiaľ čo finálna verzia prechádza nezmeneným overlap testom a nevytvára mobilný moiré raster.

## Záver

Koverta visual scope je pripravený na integráciu. Finálny runtime je čistý, renderer má identický blob s úspešne testovaným CI snapshotom, všetkých šesť existujúcich testov prešlo a finálny desktop/mobile visual sweep bol skontrolovaný proti reálnym Koverta realizáciám.
