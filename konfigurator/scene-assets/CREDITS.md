# 3D vybavenie

Vybavenie je iba náhľad priestoru; nemení cenu ani rozmery prístrešku. Auto sa
ponúka len pri prístreškoch pre auto, posedenie len pri záhradných pergolách.

## Auto v scéne — Superb IV

Vlastná vizuálna aproximácia, ktorú si dal vyhotoviť majiteľ webu. **Nie je to
výrobný CAD ani rozmerový podklad Škody Auto** a nemá slúžiť na overovanie
skutočných rozmerov vozidla; v scéne stojí preto, aby bolo vidieť, koľko
miesta pod prístreškom zaberie bežné rodinné auto. Zasklenie, zrkadlá, svetlá,
mriežka, pneumatiky aj disky sú skutočná geometria, nie nálepky. Obálka
vrátane zrkadiel 4,94 × 2,13 × 1,48 m. 71 715 trojuholníkov, 826 954 bajtov
gzip; načítava sa až po zapnutí „Auto".

Dodaná sieť mala na tabuľke nápis `SUPERB`. Ten je vymenený za `KOVERTA`
skriptom `../tools/refine-car-detail.py`; pôvodné písmená boli samostatný
tenký plát, takže sa dali odobrať bez zásahu do karosérie. Reprodukovať sa dá
príkazom `python3 konfigurator/tools/refine-car-detail.py ZDROJ.bin.gz
konfigurator/scene-assets/superb-iv.bin.gz`.

### Predchádzajúci generický sedan

Do 13. 9. 2026 tu stál vlastný generický model bez značky (34 902
trojuholníkov). Jeho generátor ostáva v `../tools/build-scene-assets.py`
a dá sa prestaviť príznakom `--legacy-car`; do `scene-assets` sa už sám
nevracia.

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
