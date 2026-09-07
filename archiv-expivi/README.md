# Archív Expivi — prístrešky Koverta

Úplná kópia toho, čo je dnes v Expivi nastavené pre prístrešky a záhradné
prístrešky Koverta. Stiahnuté 7. 9. 2026 **len na čítanie** — v Expivi sa nič
nemenilo, nemazalo ani nevypínalo.

> Toto je dočasné parkovisko. Archív patrí do vlastného repozitára; kým
> nevznikne, leží tu, aby sa nestratil.

## Odkiaľ to je

Konfigurátor na `koverta.sk/apps/configurator?catalogue=<id>` je Expivi.
Stránka si sama nesie verejný čitací token a ním sa dá z Expivi API prečítať
celá definícia katalógu. Presne to sa tu stiahlo — žiadne prihlásenie do
Expivi, žiadny zásah do účtu.

Token v archíve nie je. Je verejne v HTML tej stránky, takže sa dá kedykoľvek
vytiahnuť znova.

## Čo je kde

| Priečinok | Čo obsahuje |
| --- | --- |
| `katalogy/<id>.json` | Bootstrap katalógu: všetky otázky, možnosti, ceny, materiály, pravidlá. Toto je jadro. |
| `scena/<id>.json` | Zoznam 3D uzlov a ciest k modelom (`.ebm`, `.drc`) pre daný katalóg. Samotné binárne modely tu nie sú. |
| `meta/<id>.json` | Nastavenia scény a zapnuté moduly katalógu. |
| `zoznam-katalogov.json` | Index všetkých 72 katalógov na účte, aj neaktívnych. |
| `eshop-produkty.json` | `products.json` z koverta.sk — mapovanie na produkty a ceny v e-shope. |
| `cennik-destilovany.json` | To podstatné vytiahnuté do jednej tabuľky: rozmer → základ, steny, strecha. Z tohto číta konfigurátor. |

## Čo z toho vyplýva o produkte

Každý prístrešok pre auto má v Expivi rovnakých šesť otázok:

- **Typ prístrešku** — 4-stĺpová alebo 6-stĺpová varianta. Toto je základná cena.
- **Ľavá stena**, **Pravá stena** — drevo / hliník / WPC / bez steny. Cena rastie s dĺžkou prístrešku, lebo stena beží pozdĺž nej.
- **Zadná stena** — drevo / hliník / WPC / bez steny. Cena rastie so šírkou, lebo zadná stena ide cez šírku.
- **Zadný stĺp** — áno / nie, bez príplatku.
- **Výber farby prístrešku** — RAL paleta, bez príplatku.

Záhradné prístrešky majú namiesto typu prístrešku **Výber typu strechy**
(trapéz s izoláciou alebo sendvičový panel) a tá nesie základnú cenu.

## Diery v dátach

Toto sú miesta, kde Expivi cenu nemá, a tak sa berie z e-shopu:

- Prístrešky 7,0 × 5,2 / 5,6 / 6,0 m nemajú v Expivi otázku *Typ prístrešku*. Základ je z e-shopu.
- Záhradné prístrešky 8,0 × 3,0 a 8,0 × 4,0 m majú v Expivi prázdny katalóg. Základ je z e-shopu, cena zadnej steny cez 8 m v cenníku nie je.
- Prístrešok pre 3 autá 9 × 6 m v Expivi katalóg nemá vôbec.

A dve zjavné preklepy v Expivi, ktoré sa do konfigurátora nepreberajú:

- Prístrešok 6,6 × 6,0 m: pravá stena WPC má cenu 0 €, ľavá 1 404 €.
- Záhradný prístrešok 7,0 × 4,0 m: pravá stena WPC 758 €, ľavá 768 €.
