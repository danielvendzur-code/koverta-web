# Prompt pre Claude Design — Koverta

Skopíruj text medzi čiarami do Claude Design. Sú tam dve zadania: **A — Naša ponuka**
a **B — Konfigurátor**. Môžeš ich poslať naraz alebo každé zvlášť.

---------------------------------------------------------------------------

Navrhni dve sekcie pre úvodnú stránku slovenského výrobcu prístreškov a pergol
**Koverta** (koverta.sk). Nejde o celý web — len o tieto dve sekcie. Zvyšok webu
už existuje a nový návrh doň musí zapadnúť, nie ho prekričať.

## Značka a jazyk

Koverta vyrába oceľové prístrešky pre autá a terasy na Slovensku a zároveň dodáva
prémiový hliníkový systém **Soltec** (bioklimatické pergoly s otočnými lamelami,
carporty, tienenie, vonkajšie kuchyne). Zákazník je majiteľ rodinného domu, 35–60
rokov, rieši auto pred krupobitím alebo terasu použiteľnú aj keď prší.

Vizuálny jazyk, ktorý sa nesmie zmeniť:

- **Písmo:** Archivo (nadpisy aj text), veľké nadpisy s tesným prestrelom
  (letter-spacing okolo −0,03 em), riadkovanie nadpisu 1,02–1,15.
- **Farby:** grafitová čierna `#12171A` (text a tmavé plochy), kostná biela
  `#F6F5F2` (pozadie sekcií), čistá biela `#FFFFFF` (karty), jantárová
  `#FFCC00` (jediný akcent — tlačidlá, podčiarknutie, zvýraznené číslo),
  tmavší jantár `#8A6D00` na drobné popisky, vlasová linka `rgba(18,23,26,0.10)`.
- **Tvary:** rádius kariet 14–18 px, tlačidlá plne zaoblené (pill), fotografie
  s rovnakým rádiusom ako karta.
- **Tiene:** takmer žiadne. Karta má vlasový okraj, nie tieň. Tieň je povolený len
  ako veľmi mäkký ambientný pri tmavej karte.
- **Tón:** technický, vecný, po slovensky, bez marketingových prísľubov. Krátke
  vety. Čísla, nie superlatívy.

Čo je zakázané: gradienty naprieč plochou, sklo/blur efekty, neónové farby,
druhá akcentová farba, ikonky v kolieskach, generický SaaS vzhľad, stock fotky,
čísla vo vyplnených bodkách, fajky (✓) ako grafický prvok, tieňové vrstvy pod
tlačidlami.

## A — sekcia „Naša ponuka"

Toto je hlavný rozcestník úvodnej stránky. Zákazník tu má za 5 sekúnd pochopiť,
čo si môže objednať, a kliknúť na svoju kategóriu.

Obsah, ktorý sekcia musí uniesť (7 kategórií):

| Kategória | Značka | Kľúčový údaj | Cena od |
|---|---|---|---|
| Prístrešky pre autá | Koverta + Soltec | 1 – 3 autá, šírka do 8 m | od 4 497 € |
| Carport Soltec | Soltec | F170 / F240, dĺžka do 9,2 m | — |
| Záhradné prístrešky | Koverta | rozpon 3 – 8 m | od 4 297 € |
| Bioklimatické pergoly | Soltec | lamely 0 – 135°, modul do 45 m² | — |
| Pevné prestrešenia | Soltec | ISO panel 30 mm alebo sklo | — |
| Tienenie | Soltec | ZIP roleta, panely, brisoleje | — |
| Vonkajšie kuchyne | Soltec | nerez a hliník, modulová zostava | — |

Zadanie:

1. Navrhni **tri rôzne varianty** rozloženia tejto sekcie ako samostatné
   artboardy (desktop 1440 × ~1100). Nech sa naozaj líšia — nie tri odtiene
   toho istého gridu. Napríklad: mriežka rovnocenných kariet / dve veľké
   dlaždice + päť menších / vodorovný rytmus so striedaním fotky a textu.
2. Ku každému variantu artboard **mobil 390 × ~1400**.
3. V každom variante musí byť jasne vidieť: fotografia produktu, názov
   kategórie, značka (Koverta / Soltec — nie obe pri každej), jeden technický
   údaj, cena od tam, kde existuje, a jedna výzva na akciu.
4. Značky rozlíš tak, aby zákazník na prvý pohľad videl, čo je vlastná výroba
   a čo prémiový hliníkový systém — ale bez druhej farby.
5. Karty nesmú mať rovnakú vizuálnu váhu za každú cenu; najpredávanejšie
   kategórie (autá, záhradné prístrešky, pergoly) môžu dostať väčšiu plochu.
6. Nadpis sekcie: krátky, vecný, v tóne „Aké riešenie potrebujete". Očko nad
   nadpisom je jedno slovo veľkými písmenami s jantárovým podčiarknutím.

## B — sekcia „Konfigurátor"

Krátky pás na úvodnej stránke, ktorý pošle zákazníka do 3D konfigurátora.
Konfigurátor existuje a vie štyri veci: prístrešok Koverta, carport Soltec,
prestrešenie terasy, bioklimatická pergola.

Sekcia musí obsahovať:

- nadpis a jednu vetu o tom, že si zostavu poskladá a pošle nám ju s dopytom,
- tri kroky (vybrať typ → nastaviť rozmer, farbu a výbavu → poslať dopyt),
- štyri odkazy na štyri konfigurovateľné typy s fotografiou,
- hlavnú výzvu „Otvoriť konfigurátor" a poznámku, že je zadarmo a bez registrácie.

Zadanie:

1. **Dva varianty**, desktop 1440 × ~900 + mobil 390 × ~1200 ku každému.
2. Kroky 01–03 nesmú byť čísla vo vyplnených kolieskach ani odrážky. Hľadám
   pre ne lepšie riešenie — časová os, veľké tiché číslo vedľa textu, alebo
   niečo, čo tam ešte nie je.
3. Ak sekcia ukazuje cenu, musí byť pri nej jasne napísané, čo v nej je
   a čo nie. Do návrhu nedopĺňaj vymyslené sumy — použi zástupný text
   „orientačná cena".
4. Pás nesmie byť vyšší než jedna obrazovka na notebooku 1440 × 900 vrátane
   hlavnej výzvy — výzva musí byť vidieť bez rolovania.

## Ako to odovzdať

Jeden canvas, artboardy vedľa seba, popísané: `A1 desktop`, `A1 mobil`,
`A2 desktop`, … Pod každým variantom dve vety, prečo je takto a pre koho je
lepší. Bez lorem ipsum — použi skutočné slovenské texty vyššie.

---------------------------------------------------------------------------

## Čo s výsledkom

Keď si vyberieš variant, pošli mi číslo artboardu (napr. „A2 a B1") a ja to
prepíšem do webu v existujúcom dizajnovom systéme — bez nových CSS vrstiev.
