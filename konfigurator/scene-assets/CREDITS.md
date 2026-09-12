# 3D vybavenie

Vybavenie je iba náhľad priestoru; nemení cenu ani rozmery prístrešku. Auto sa
ponúka len pri prístreškoch pre auto, posedenie len pri záhradných pergolách.

## Touring sedan

Pôvodný generický model vytvorený pre tento konfigurátor. Nejde o model ani
rozmerový podklad žiadnej automobilky. Karoséria je vyloftovaná z pozdĺžnych
profilov: hladká tam, kde je auto hladké, s ostrou hranou na prahu, na línii
dverí, na ramene a na hrane veka. Zasklenie, zrkadlá, svetlá, mriežka,
pneumatiky, disky aj kotúčové brzdy sú skutočná geometria, nie nálepky.
Rozmery vrátane detailov: približne 4,90 × 2,08 × 1,53 m, rázvor 2,91 m,
kolesá 19". 63 674 trojuholníkov, 591 069 bajtov gzip.

## Lounge zostava

Pôvodný návrh pre tento konfigurátor: trojmiestna pohovka, dve kreslá, nízky
stolík s podnosom a vonkajší koberec, poskladané ako jedna zostava, aby široká
pergola nestála okolo jedného bistro stolíka. Rozmery zodpovedajú bežnému
záhradnému nábytku: pohovka 2,28 m, hĺbka 0,85 m, sedák 0,40 m nad zemou.
Obálka 3,16 × 2,30 m. 14 610 trojuholníkov, 111 788 bajtov gzip.

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
