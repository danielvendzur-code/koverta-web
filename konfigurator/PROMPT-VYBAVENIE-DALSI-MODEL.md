# Zadanie pre ďalší model: dotiahnuť 3D vybavenie scény

Toto je hotové zadanie na pokračovanie. Popisuje, čo v repozitári je, ako to
funguje a čo presne treba zlepšiť. Nič v ňom nie je hypotéza — všetko sa dá
overiť príkazmi na konci.

## Kontext

Repozitár `danielvendzur-code/koverta-web`, vetva
`fix/koverta-final-repair-20260910`, PR #24 (draft, nemergovať).
`konfigurator/` je 3D konfigurátor prístreškov a pergol. Kreslí vlastný
WebGL renderer s hĺbkovým bufferom (`konfigurator/soltec-premium.js`,
funkcia `paintDepth`); do toho istého kontextu a s tou istou projekciou kreslí
„vybavenie priestoru" modul `konfigurator/scene-life.js`.

Vybavenie je iba náhľad: nemení cenu ani rozmery. Auto sa ponúka len pri
prístreškoch pre auto (`carport`, `koverta`), posedenie len pri záhradných
pergolách (`bio`, `canopy`).

## Ako sú modely urobené

- Generátor: `konfigurator/tools/build-scene-assets.py` (Python + numpy + PIL).
  Spustenie bez argumentu prestaví auto a lounge zostavu; s argumentom
  (adresár s Poly Haven `seating.gltf`) prestaví aj bistro.
- Výstup: `konfigurator/scene-assets/*.bin.gz`. Formát vrcholu je 16 bajtov:
  `int16 x,y,z` v milimetroch, `int16 nx,ny,nz` (normála × 32767),
  `uint8 R,G,B`, `uint8 material`. Tri vrcholy = trojuholník, žiadne indexy.
- Materiály v shaderi (`scene-life.js`, program `main`):
  `0` matný, `1` lak (farbu berie z uniformu, vrcholová farba sa ignoruje),
  `2` sklo, `3` chróm/hliník, `4` svietiace sklo lampy.
- Pomôcky v generátore: `mesh(grid,color,mat,flip,tint)` — mriežka s normálami
  z vlastných dotyčníc, takže každý plát tieňuje sám za seba a šev medzi dvoma
  plátmi ostane ostrá hrana; `spline` (Catmull-Rom), `surface`, `ellipsoid`,
  `tube`, `rbox` (zaoblený kváder pre nábytok).
- Auto je vyloftované z pozdĺžnych profilov `hw / sill / crease / deck / dhw`
  a prierezu `section(x)`, ktorý je rozdelený na plátky; hrany vznikajú na ich
  rozhraniach. Oba konce zatvára `endcap()` — kupola riadená tým istým
  prierezom, ktorej riadky farbí `front_tint` / `rear_tint` (mriežka, svetlá,
  značka, difúzor).

## Čo treba zlepšiť (v tomto poradí)

1. **Auto.** Toto je hlavná úloha a vlastník ju zadáva samostatne. Model je
   vlastný generický sedan, nie model konkrétnej značky, a taký musí ostať.
   Doterajšie kolo opravilo proporcie a povrch — nižšia strecha, sklo až po
   okraj strechy (predtým nad oknami bežal 150 mm pás plechu a kabína
   vyzerala ako helma), dlhšia strecha a kratšie veko, ramenná hrana a nižšia
   línia na dverách namiesto jednej hladkej steny, hlbšie blatníky s lemom,
   zrkadlo ako skutočná skrinka na pätke namiesto puku na tyčke, čitateľné
   svetlá a spáry. Čo ostáva slabé:
   - prechod strecha → zadné sklo → veko je stále mäkký, chýba ostrá hrana veka,
   - C-stĺpik a zadný bok tvoria jeden veľký klin bez členenia,
   - predný previs je dlhý a nárazník ťažký,
   - kľučky sú elipsoidy, nie skutočné madlá s priehlbňou,
   - kolesá majú jednoduchý disk bez brzdy a ventilu.
   Prijateľný je aj úplne iný postup: nahradiť sieť modelom z CC0 zdroja.
   Poly Haven žiadny sedan nemá (má len `covered_car` pod plachtou); Quaternius
   a Kenney majú CC0 autá, ale sú štylizované a do inak realistickej scény sa
   nehodia. Ak sa použije cudzí model, patrí doň záznam v
   `konfigurator/scene-assets/CREDITS.md` a skript na stiahnutie zdroja
   s SHA-256, ako to má bistro (`konfigurator/tools/fetch-bistro-source.py`).

2. **Rozpočet.** Auto má 39 402 trojuholníkov a ~350 kB gzip. Načítava sa až po
   kliknutí na „Auto"; nový model by nemal ísť výrazne nad 400 kB.

3. **Lounge zostava** (`patio-lounge`, 23 486 trojuholníkov, 181 kB) už má
   prešité vankúše, lampáš, podnos aj kvetináč. Jej pôdorys je zámerne
   3 160 × 2 400 mm: bioklimatická pergola je najviac 3 500 mm široká a
   hlbšia zostava by sa medzi stĺpy nikdy nezmestila. Kto ju bude prestavovať,
   nesmie ju rozšíriť naprieč — inak sa prestane ponúkať a v pergole ostane
   len bistro stolík. Zlepšiť sa dá poťah (látka je hladká plocha bez záhybov)
   a koberec (dva pásy tónov namiesto štruktúry).

4. **Bistro** je Poly Haven CC0 sieť; zdroj nie je v repozitári, takže sa dá
   prestaviť len s pôvodným `seating.gltf`.

## Ako model odovzdať, aby sa dal iba zapojiť

Integrácia je zámerne mechanická — stačí dodržať toto:

- Sieť musí byť `konfigurator/scene-assets/touring-sedan.bin.gz` v tom istom
  16-bajtovom formáte. Auto stojí na `z = 0`, smeruje nosom na `-x`
  (`x = 0` je predný nárazník, `x = LEN` zadný), stred rozchodu je `y = 0`.
- Po prestavbe treba prepísať `models.car.bounds` v `konfigurator/scene-life.js`
  na skutočne namerané hodnoty siete. `konfigurator/test/scene-assets.js`
  porovnáva deklarované obálky s meraním a bez zhody padne.
- Ak sa zmení výška auta, mení sa aj to, či sa zmestí pod nízky prístrešok —
  test na to má vlastnú kontrolu, netreba ju obchádzať.
- Pri zmene siete treba zvýšiť verziu v `scene-life.js`
  (`?v=20260912-refinement-N`) aj v `konfigurator/index.html`, inak CDN
  a prehliadače vrátia starý model.
- Na rýchle pozeranie bez prehliadača slúži
  `konfigurator/tools/preview-scene-asset.py`: vykreslí bok, čelo, pôdorys a
  dva trojštvrťové pohľady priamo z `.bin.gz` za pár sekúnd, tým istým
  osvetlením ako runtime shader. Cez Playwright je jedna iterácia rádovo
  pomalšia, takže tvar sa oplatí ladiť týmto a až hotový výsledok pozrieť
  v konfigurátore.

## Hranice, ktoré sa nesmú posunúť

- Modely sú generické. Žiadna značka auta, žiadny výrobcov podklad.
- `z` každého vrcholu musí byť `>= 0` a normály jednotkové — inak padne
  `konfigurator/test/scene-assets.js`.
- Obálky v `scene-life.js` (`models[...].bounds`) musia po prestavbe sedieť na
  sieť; ten istý test to kontroluje. Rozostupy a kapacity sa z obálok počítajú,
  neprepisujú sa ručne.
- Položka scény smie byť otočená o štvrť otáčky (`rotation` je 0 alebo π/2).
  Otočenie rieši shader (uniform `spin`), kontaktný tieň aj dopad dažďa — model
  sa teda nemá „predotáčať" v generátore a nesmie predpokladať, ktorá jeho os
  bude v prístrešku pozdĺžna.
- Nezasahovať do cenníka, rozmerov ani do geometrie prístreškov.
- Nevypínať a nezmäkčovať existujúce kontroly.

## Overenie

```
python3 konfigurator/tools/build-scene-assets.py     # prestaví auto a lounge
python3 konfigurator/tools/preview-scene-asset.py \
    konfigurator/scene-assets/touring-sedan.bin.gz /tmp/nahlad   # rýchly pohľad
node konfigurator/test/scene-assets.js               # formát, obálky, rozostupy
node konfigurator/test/pocasie-odtok.js              # dážď a odtok
node konfigurator/test/technical-fidelity.js
python3 -m http.server 8901                          # a potom vizuálna kontrola
```
Vizuálne sa vybavenie zapína v paneli „Vybavenie priestoru" pod plátnom.
`window.SP_TEST.scene()` vráti stav scény, `window.SP_TEST.setView(az,el)`
otočí kameru pre porovnávacie zábery.

Lounge zostava sa objaví až pri šírke od 3 260 mm (pri stĺpe 120 mm); pod ňou
plán ponúkne bistro stolíky. Pri kontrole teda treba nastaviť `bio` na plnú
šírku 3 500 mm, inak sa lounge nezobrazí.
