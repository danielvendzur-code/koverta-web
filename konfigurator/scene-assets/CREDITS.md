# 3D vybavenie

Vybavenie je iba náhľad priestoru; nemení cenu ani rozmery prístrešku. Auto sa
ponúka len pri prístreškoch pre auto, posedenie len pri záhradných pergolách.

## Autá v scéne

Obe autá sú licencované modely tretích strán, nie vlastné aproximácie. V scéne
stoja preto, aby bolo vidieť, koľko miesta pod prístreškom zaberie skutočné
auto. Interiér sa pri prevode zahadzuje — cez tmavé sklo ho nevidno a je to
takmer polovica trojuholníkov. Prevádza ich `../tools/import-car-gltf.py`.

### 2017 Hyundai Sonata — „sedan"

- Autor: m3ika — https://sketchfab.com/m3ika3D
- Zdroj: https://sketchfab.com/3d-models/2017-hyundai-sonata-1fbb3fb20c274f1a96c03aecedfcd047
- Licencia: Sketchfab Standard — https://sketchfab.com/licenses (komerčné
  použitie povolené).
- Úpravy: glTF prevedený do milimetrov a súradníc konfigurátora; materiály
  namapované na päticu shadera (matný, lak, sklo, chróm, svietiace sklo);
  farba diskov, svetlometov a koncoviek vzorkovaná z pôvodných textúr do
  vrcholov. Lak berie farbu z prepínača, takže sa dá prefarbiť.
  Mierka je rovnomerná, nastavená tak, aby dĺžka sedela s katalógovým
  rozmerom 4 855 mm. Obálka 4,86 × 2,09 × 1,52 m vrátane zrkadiel a antény.
  55 806 trojuholníkov, 684 403 bajtov gzip.
- Reprodukcia: `python3 konfigurator/tools/import-car-gltf.py ZDROJ/scene.gltf
  konfigurator/scene-assets/hyundai-sonata.bin.gz --profile sonata --length 4855`

### Small city car — „malé auto"

- Autor: terran4627 — https://sketchfab.com/terran4627
- Zdroj: https://sketchfab.com/3d-models/small-city-car-923feecc25b44f24b1060319bfcf6205
- Licencia: CC-BY-4.0 — http://creativecommons.org/licenses/by/4.0/ (komerčné
  použitie povolené, autor musí byť uvedený).
- Povinné uvedenie zdroja: This work is based on "Small city car"
  (https://sketchfab.com/3d-models/small-city-car-923feecc25b44f24b1060319bfcf6205)
  by terran4627 (https://sketchfab.com/terran4627) licensed under CC-BY-4.0
  (http://creativecommons.org/licenses/by/4.0/)
- Úpravy: ako vyššie; navyše je celý exteriér v jednej textúre, takže sa
  lakovaná časť karosérie oddeľuje podľa neutrálneho odtieňa a zvyšok si
  necháva farbu z textúry. **Mierka nie je rovnomerná**: predloha je na svoju
  dĺžku neprirodzene široká, a keďže konfigurátor odpovedá na otázku „zmestí
  sa mi sem auto", rozmery sú stiahnuté na bežné mestské auto
  3 540 × 1 910 × 1 500 mm vrátane zrkadiel (šírka o 12 % oproti predlohe).
  7 155 trojuholníkov, 87 108 bajtov gzip.
- Reprodukcia: `python3 konfigurator/tools/import-car-gltf.py ZDROJ/scene.gltf
  konfigurator/scene-assets/city-car.bin.gz --profile city --length 3540
  --width 1910 --height 1500 --front high`

### Modely, ktoré tu stáli predtým

Do 13. 9. 2026 tu stáli dva vlastné generické modely — sedan pod menom
„Superb IV" a mestský hatchback. Označovať vlastnú aproximáciu menom
konkrétnej značky bolo zavádzajúce a kvalitou na licencované modely nestačili,
takže sú preč. Ich generátor ostáva v `../tools/build-scene-assets.py` za
príznakom `--legacy-car`; do `scene-assets` sa sám nevracia. S nimi odišiel aj
skript `../tools/refine-car-detail.py`, ktorý vymieňal nápis na ich ŠPZ.

BMW M2 CS z ponúknutých modelov použiť nemožno: má licenciu
CC-BY-NC-SA-4.0, ktorá zakazuje komerčné použitie.

## Lounge zostava

Pôvodný návrh pre tento konfigurátor: trojmiestna pohovka, dve kreslá, nízky
stolík s podnosom a vonkajší koberec, poskladané ako jedna zostava, aby široká
pergola nestála okolo jedného bistro stolíka. Rozmery zodpovedajú bežnému
záhradnému nábytku: pohovka 2,28 m, hĺbka 0,70 m, sedák 0,40 m nad zemou.
Obálka 3,16 × 2,40 m — naprieč je zostava zámerne plytká, aby sa zmestila aj
pod bioklimatickú pergolu, ktorá je najviac 3,5 m široká.
23 486 trojuholníkov, 185 010 bajtov gzip.

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
