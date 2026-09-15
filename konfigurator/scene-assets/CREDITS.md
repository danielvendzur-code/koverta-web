# 3D vybavenie

Vybavenie je iba náhľad priestoru; nemení cenu ani rozmery prístrešku. Auto sa
ponúka len pri prístreškoch pre auto, posedenie len pri záhradných pergolách.

## Autá v scéne

Obe autá sú licencované modely tretích strán, nie vlastné aproximácie. V scéne
stoja preto, aby bolo vidieť, koľko miesta pod prístreškom zaberie skutočné
auto. Interiér sa pri prevode zahadzuje — cez tmavé sklo ho nevidno a je to
takmer polovica trojuholníkov. Prevádza ich `../tools/import-car-gltf.py`.

### Low Poly BMW G80 M3 — „sedan"

- Autor: SharkyStudios — https://sketchfab.com/sharkycat109
- Zdroj: https://sketchfab.com/3d-models/low-poly-bmw-g80-m3-ea3e807ff69e40fe82c5577ee9f0a2f4
- Licencia: CC-BY-4.0 — http://creativecommons.org/licenses/by/4.0/ (komerčné
  použitie povolené, autor musí byť uvedený).
- Povinné uvedenie zdroja: This work is based on "Low Poly BMW G80 M3"
  (https://sketchfab.com/3d-models/low-poly-bmw-g80-m3-ea3e807ff69e40fe82c5577ee9f0a2f4)
  by SharkyStudios (https://sketchfab.com/sharkycat109) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)
- Úpravy: glTF prevedený do milimetrov a súradníc konfigurátora. Predloha nemá
  ani jednu textúru — celá jej podoba je v geometrii a vo farbách materiálov —,
  takže sa nič nevzorkovalo a do scény ide všetkých 6 618 trojuholníkov zdroja.
  Materiály nesú mená iba ako `Material.0NN`, tak sa priradenie zistilo
  z geometrie: 015 je jediná veľká vrstva cez celú karosériu (lak, berie farbu
  z prepínača), 029 sedí v pásme kolies po celom rázvore (disky), 020 je dlhý
  úzky pás vysoko (zasklenie), 003 je najširšia vrstva vôbec (zrkadlá) a 018
  s 019 sú drobné červené a biele kusy vzadu a vpredu (svetlá).
  Mierka je rovnomerná podľa katalógovej dĺžky 4 794 mm. Obálka
  4,79 × 2,03 × 1,46 m vrátane zrkadiel. 6 618 trojuholníkov, 76 491 bajtov gzip.
- Reprodukcia: `python3 konfigurator/tools/import-car-gltf.py ZDROJ/scene.gltf
  konfigurator/scene-assets/bmw-g80-m3.bin.gz --profile g80 --length 4794`

### Nouvelle Peugeot 208 — „malé auto"

- Autor: GrunyStudio — https://sketchfab.com/grunystudio
- Zdroj: https://sketchfab.com/3d-models/nouvelle-peugeot-208-lowpoly-3d4a1578573645de9a2915e93b7edcf7
- Licencia: CC-BY-4.0 — http://creativecommons.org/licenses/by/4.0/ (komerčné
  použitie povolené, autor musí byť uvedený).
- Povinné uvedenie zdroja: This work is based on "Nouvelle Peugeot 208 - lowpoly"
  (https://sketchfab.com/3d-models/nouvelle-peugeot-208-lowpoly-3d4a1578573645de9a2915e93b7edcf7)
  by GrunyStudio (https://sketchfab.com/grunystudio) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)
- Úpravy: súbor obsahuje dve kópie toho istého auta vedľa seba; do scény ide
  jedna. Celý exteriér má jeden jediný materiál, takže sa vrstvy rozlišujú menom
  siete (`plane.000` karoséria, `circle.000` kolesá, `sphere.001` zrkadlá,
  `cube.003`/`cube.004` svetlá). Karoséria si drží farbu vzorkovanú z textúry
  a nie z prepínača: okná sú v textúre namaľované a lak by prefarbil aj ich.
  Disky sú dostavané rovnako ako pri sedane — predloha má koleso ako jeden tmavý
  kotúč bez lúčov. Mierka je rovnomerná podľa katalógovej dĺžky 4 055 mm.
  Obálka 4,06 × 1,97 × 1,46 m vrátane zrkadiel. 1 772 trojuholníkov,
  17 416 bajtov gzip.
- Známe obmedzenie: predloha má na celé auto 1 220 trojuholníkov a všetok detail
  má v textúre. Náš renderer textúry nepozná a farbu nesie vo vrcholoch, takže
  pri takej hrubej sieti nie je kam ju uložiť a karoséria vychádza hranatá.
  Je to vlastnosť predlohy, nie prevodu; model sa má vymeniť za hustejší, ktorý
  farby nesie v materiáloch.
- Reprodukcia: `python3 konfigurator/tools/import-car-gltf.py ZDROJ/scene.gltf
  konfigurator/scene-assets/peugeot-208.bin.gz --profile p208 --length 4055`

### Modely, ktoré tu stáli predtým

Do 13. 9. 2026 tu stáli dva vlastné generické modely — sedan pod menom
„Superb IV" a mestský hatchback. Označovať vlastnú aproximáciu menom
konkrétnej značky bolo zavádzajúce a kvalitou na licencované modely nestačili,
takže sú preč. Ich generátor ostáva v `../tools/build-scene-assets.py` za
príznakom `--legacy-car`; do `scene-assets` sa sám nevracia. S nimi odišiel aj
skript `../tools/refine-car-detail.py`, ktorý vymieňal nápis na ich ŠPZ.

BMW M2 CS z ponúknutých modelov použiť nemožno: má licenciu
CC-BY-NC-SA-4.0, ktorá zakazuje komerčné použitie.

## Modern Industrial Outdoor Sofa Set — „lounge zostava"

- Autor: Ulug'bek — https://sketchfab.com/ulugbekdizayn
- Zdroj: https://sketchfab.com/3d-models/modern-industrial-outdoor-sofa-set-010bd90929894f32a7caa781c9f8f6a8
- Licencia: CC-BY-4.0 — http://creativecommons.org/licenses/by/4.0/ (komerčné
  použitie povolené, autor musí byť uvedený).
- Povinné uvedenie zdroja: This work is based on "Modern Industrial Outdoor Sofa Set"
  (https://sketchfab.com/3d-models/modern-industrial-outdoor-sofa-set-010bd90929894f32a7caa781c9f8f6a8)
  by Ulug'bek (https://sketchfab.com/ulugbekdizayn) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)
- Úpravy: glTF prevedený do milimetrov a súradníc konfigurátora; farby z textúr
  vzorkované do vrcholov, pôvodné normály zachované. Tri materiály: čalúnenie
  a drevo stolíka si nesú farbu v textúre, kovový rám ju má vo faktore. Všetko
  je matné — vonkajší nábytok je látka, prášková farba a drevo, nič z toho sa
  neleskne ako lak. Trojmiestna pohovka, dve kreslá a konferenčný stolík na
  čiernom ráme. Obálka 4,13 × 2,63 × 1,29 m. 32 728 trojuholníkov,
  397 491 bajtov gzip.
- Prečo práve táto: z dvoch ponúknutých zostáv má táto tri čisté materiály,
  ktoré sadnú na pätici shadera, a pôdorys, ktorý sa pod pergolu zmestí.
  Modern Outdoor Lounge je 6,4 × 7,0 m záhradná scéna z mnohých kusov
  a desiatok drobných materiálov — musela by sa rozobrať a jej podoba stojí
  na textúrach.
- Reprodukcia: `python3 konfigurator/tools/import-car-gltf.py ZDROJ/scene.gltf
  konfigurator/scene-assets/patio-sofaset.bin.gz --profile sofaset`

### Predchádzajúca lounge zostava

Do 15. 9. 2026 tu stál vlastný návrh: pohovka, dve kreslá, stolík s podnosom
a koberec, obálka 3,16 × 2,40 m. Ustúpil licencovanému modelu.

## Kompaktné posedenie

Pôvodný návrh pre tento konfigurátor: dvojkreslová pohovka, konferenčný
stolík s podnosom, koberec a kvetináč. Vznikol preto, že plná lounge zostava
potrebuje 2,4 m naprieč a záhradná pergola ju unesie až na hornom konci
rozsahu — pri prednastavených 2,5 m šírky ostával v prístrešku jediný bistro
stolík. Obálka 2,40 × 1,50 m, teda sa zmestí aj medzi stĺpy 2,5 m pergoly.
11 066 trojuholníkov, 86 672 bajtov gzip.

## Outdoor Table Chair Set 01

- Autor: James Ray Cock / Poly Haven.
- Zdroj: https://polyhaven.com/a/outdoor_table_chair_set_01
- Licencia: CC0 — https://polyhaven.com/license
- Úpravy: glTF prevedený do milimetrov a súradníc konfigurátora; farby z 1K
  diffuse textúr vzorkované do vrcholov; pôvodné normály zachované.
  Nepoužívajú sa pôvodné normal/roughness mapy. 9 828 trojuholníkov,
  130 874 bajtov gzip. Kreslí sa tam, kde sa lounge zostava nezmestí.
- Generátor: `../tools/build-scene-assets.py`. Ako argument potrebuje adresár s
  originálnym `seating.gltf`, jeho `.bin` a dvoma diffuse textúrami. Zoznam
  zdrojových súborov: https://api.polyhaven.com/files/outdoor_table_chair_set_01

Kandidáti zo Sketchfabu ani Ferrari z príkladov Three.js neboli importovaní do
projektu. Pri Generic Sedan Car bola overená CC BY 4.0, ale stiahnutie
vyžadovalo prihlásenie. Pri Ferrari nebola overená licencia pôvodného modelu.

## Refinement 12. 9. 2026

Lounge má 23 486 trojuholníkov a 185 010 bajtov gzip; rozmery 3,16 × 2,40 × 0,822 m. Sedadlá smerujú k drevenému stolíku, majú prešité lemy, tenšie nohy a doplnky (podnos, lampáš, kvetináč).

Pôvodné vstupy bistro zostavy sa dajú obnoviť skriptom `../tools/fetch-bistro-source.py`; manifest obsahuje presné URL aj SHA-256.
