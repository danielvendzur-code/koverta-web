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

1. **Auto stále vyzerá „naliate", nie ostré.** Vlastník to pomenoval presne:
   chce niečo reálne, nie balón bez tvaru. Konkrétne slabiny:
   - prechod strecha → zadné sklo → veko je jedna plynulá guľa; chýba mu
     zlom nad zadným oknom a ostrá hrana veka,
   - blatníky nemajú lem — otvor kolesa je len hrana plechu,
   - dvere nemajú spáru s hĺbkou, len tenkú tmavú rúrku po povrchu,
   - predné aj zadné svetlo je pás na karosérii; chýba mu ostenie a odsadenie,
   - zrkadlo je malý puk na tenkej nôžke.
   Odporúčaný postup: pridať ďalšie plátky do `section(x)` v oblasti ramena a
   veka, spáru robiť ako úzky vtlačený kanál (dva plátky s posunom dovnútra),
   lem blatníka ako samostatný pás okolo oblúka.
2. **Veľkosť súboru.** Auto má 63 674 trojuholníkov a 591 kB gzip. Načítava sa
   až po kliknutí na „Auto", ale menej staníc v strede karosérie a hrubšia
   pneumatika by to stiahli pod 400 kB bez viditeľnej straty.
3. **Lounge zostava** (`patio-lounge`) je použiteľná, ale nábytok je zo
   zaoblených kvádrov. Chce to prešitie vankúšov, tenšie nohy a jeden
   detail navyše (podnos, lampáš, kvetináč).
4. **Bistro** je Poly Haven CC0 sieť; zdroj nie je v repozitári, takže sa dá
   prestaviť len s pôvodným `seating.gltf`.

## Hranice, ktoré sa nesmú posunúť

- Modely sú generické. Žiadna značka auta, žiadny výrobcov podklad.
- `z` každého vrcholu musí byť `>= 0` a normály jednotkové — inak padne
  `konfigurator/test/scene-assets.js`.
- Obálky v `scene-life.js` (`models[...].bounds`) musia po prestavbe sedieť na
  sieť; ten istý test to kontroluje. Rozostupy a kapacity sa z obálok počítajú,
  neprepisujú sa ručne.
- Nezasahovať do cenníka, rozmerov ani do geometrie prístreškov.
- Nevypínať a nezmäkčovať existujúce kontroly.

## Overenie

```
python3 konfigurator/tools/build-scene-assets.py     # prestaví auto a lounge
node konfigurator/test/scene-assets.js               # formát, obálky, rozostupy
node konfigurator/test/pocasie-odtok.js              # dážď a odtok
node konfigurator/test/technical-fidelity.js
python3 -m http.server 8901                          # a potom vizuálna kontrola
```
Vizuálne sa vybavenie zapína v paneli „Vybavenie priestoru" pod plátnom.
`window.SP_TEST.scene()` vráti stav scény, `window.SP_TEST.setView(az,el)`
otočí kameru pre porovnávacie zábery.
