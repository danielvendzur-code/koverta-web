# Prompt pre Claude Design — Koverta

Skopíruj text medzi čiarami do Claude Design. Je tam osem zadaní:
**A — Naša ponuka**, **B — Konfigurátor**, **C — Ako to prebieha**,
**D — Rozmery, ktoré vieme dodať**, **E — Rozbaľovacie menu**,
**F — Vzorkovník odtieňov**, **G — Typorady** a **H — Pás čísel**.
Môžeš ich poslať naraz alebo každé zvlášť; spoločná časť „Značka a jazyk"
platí pre všetky.

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

| Kategória | Značka | Kľúčový údaj |
|---|---|---|
| Prístrešky pre autá | Koverta + Soltec | 1 – 3 autá, šírka do 8 m |
| Carport Soltec | Soltec | F170 / F240, dĺžka do 9,2 m |
| Záhradné prístrešky | Koverta | rozpon 3 – 8 m |
| Bioklimatické pergoly | Soltec | lamely 0 – 135°, modul do 45 m² |
| Pevné prestrešenia | Soltec | ISO panel 30 mm alebo sklo |
| Tienenie | Soltec | ZIP roleta, panely, brisoleje |
| Vonkajšie kuchyne | Soltec | nerez a hliník, modulová zostava |

Ôsma dlaždica nie je kategória, ale vstup do krátkeho výberu („Neviete, čo
z toho?"). Ceny sa v sekcii **neuvádzajú** — pri jednej značke cena a pri
ostatných „na dopyt" pôsobilo nedokončene.

**Prvé kolo sme už postavili a zadávateľ ho odmietol.** Rozloženie bolo:
veľká dlaždica 2 × 2, široká 2 × 1 s fotkou vľavo a textom vpravo, päť
dlaždíc 1 × 1 a jantárová dlaždica navyše. Problém: dlaždice v hornom rade
majú fotografie tesne pri sebe, takže tri rôzne konštrukcie splývajú do
jedného pásu a oko nevie, kde jedna končí. Toto je hlavná vec, ktorú má
nový návrh vyriešiť.

Zadanie:

1. Navrhni **tri rôzne varianty** rozloženia tejto sekcie ako samostatné
   artboardy (desktop 1440 × ~1100). Nech sa naozaj líšia — nie tri odtiene
   toho istého gridu. Napríklad: mriežka rovnocenných kariet / dve veľké
   dlaždice + päť menších / vodorovný rytmus so striedaním fotky a textu.
   Aspoň jeden variant nech **nemá dve fotografie priamo vedľa seba** —
   práve to zadávateľ na prvom kole vytkol.
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

## C — sekcia „Ako to prebieha"

Päť krokov od dopytu po hotový prístrešok. Sekcia má zákazníka upokojiť: má
vidieť, že to je zabehnutý postup, nie dobrodružstvo.

Nadpis: **Od prvého kontaktu po hotový prístrešok**. Pod ním jedna veta:
*Zameranie aj návrh sú zadarmo a nezáväzné. Presnú cenu potvrdíme až po
obhliadke miesta.*

Kroky aj s textom, ktorý k nim patrí:

| # | Krok | Text |
|---|---|---|
| 01 | Návrh alebo konfigurátor | Poviete nám, čo chcete zastrešiť — alebo si zostavu rovno vyskladáte v 3D konfigurátore a pošlete nám ju. |
| 02 | Bezplatné zameranie | Prídeme k vám, odmeriame priestor a overíme podklad. Potom dostanete presnú cenovú ponuku. |
| 03 | Výroba konštrukcie | Konštrukciu vyrobíme podľa odsúhlaseného návrhu, vo farbe z RAL palety a s výbavou, na ktorej sme sa dohodli. |
| 04 | Podklad a pätky | Pätky vykopeme a vybetónujeme ako doplnkovú službu. Máte platňu alebo dlažbu? Kotvíme priamo do nej. |
| 05 | Montáž a odovzdanie | Dovezieme, osadíme, ukotvíme. Bežný prístrešok stojí za jeden deň. |

Ku každému kroku máme fotografiu z reálnej montáže.

Zadanie:

1. **Tri varianty**, desktop 1440 × ~900 a mobil 390 × ~1400 ku každému.
2. Číslo kroku **nesmie byť vo vyplnenom koliesku ani v bodke**. Hľadáme
   pokojnejší spôsob, ako ho ukázať — veľké tiché číslo, značka na osi,
   poradie napísané slovom.
3. Musí byť na prvý pohľad jasné, **na ktorom kroku sa zákazník práve
   nachádza** a koľko ich ešte ostáva. Zvýraznenie aktívneho kroku rieš
   typografiou a polohou, nie farebnou výplňou pod textom.
4. **Do fotografií nepíš text.** Popis kroku patrí vedľa fotografie alebo pod
   ňu, nie do nej.
5. Navrhni aj **prechod medzi krokmi**: čo sa stane s fotografiou a s textom,
   keď sa krok zmení. Krátko to popíš pod artboardom (smer, dĺžka, čo sa
   hýbe a čo stojí). Nemá to preblikávať ani poskakovať.
6. Jeden variant nech je taký, ktorý funguje **bez interakcie** — všetkých päť
   krokov naraz pod sebou. Používame ho tam, kde nechceme zdržovať.

## D — sekcia „Rozmery, ktoré vieme dodať"

Katalógové veľkosti prístreškov. Zákazník si tu má nájsť svoj rozmer alebo
zistiť, že mu žiadny nesedí a treba mieru.

Rozsah, ktorý sekcia musí uniesť na jednej podstránke:

- **Pre jedno auto** — 27 rozmerov, od 4 497 €
- **Pre dve autá** — 27 rozmerov, od 6 497 €
- **Pre tri autá** — 1 rozmer, od 12 490 €

Na inej podstránke je to jedna skupina s 12 rozmermi od 4 297 €. Rozmery sú
dvojice šírka × dĺžka (napríklad 2,5 × 5,2 m; 2,8 × 5,6 m). Ku každému rozmeru
patrí cena od a odkaz „3D" na vyskladanie v konfigurátore e-shopu.

Pod tabuľkou je veta, ktorú treba zachovať: *Toto sú hotové veľkosti
z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer
je vec výroby, nie výberu z tabuľky.*

Zadanie:

1. **Dva varianty**, desktop 1440 a mobil 390. Výška podľa potreby, ale
   napíš k nej, koľko miesta zaberie v rozbalenom stave.
2. Päťdesiatpäť rozmerov nesmie byť **stena štítkov**. Navrhni, ako sa
   zákazník dostane k svojmu rozmeru rýchlo — zoskupenie podľa šírky,
   rozbalenie po skupinách, filter, dva-tri kroky výberu. Rozhodni sa
   a zdôvodni to.
3. Sekcia musí byť použiteľná aj vtedy, keď je v skupine **jediný rozmer** —
   nesmie vtedy vyzerať rozbité.
4. Cena od patrí ku každému rozmeru. Musí byť čitateľná, ale nesmie
   prekričať samotný rozmer — hlavná informácia je veľkosť.
5. Odkaz „3D" je druhoradá akcia. Navrhni, ako ju pripojiť k rozmeru tak, aby
   nezaberala rovnakú váhu ako samotný rozmer a dala sa trafiť aj prstom
   (minimálne 44 × 44 px).
6. Na mobile sa nesmie vodorovne rolovať. Ak sa rozmery nezmestia, musia sa
   zalomiť alebo skryť pod rozbalenie.

## E — rozbaľovacie menu v hlavičke

Hlavička má päť položiek: **Pre autá**, **Pre dom a záhradu**, **Realizácie**,
**3D konfigurátor**, **Kontakt**. Prvé tri rozbaľujú panel cez celú šírku.

Obsah panela „Pre autá":

| Stĺpec | Položka | Popis |
|---|---|---|
| Koverta | Prístrešky pre autá | Pre 1 až 3 autá, oceľ a hliník z vlastnej výroby. |
| Soltec | Carport Soltec | Prémiový hliníkový systém s čistou architektúrou. |

Panel „Pre dom a záhradu" má štyri až päť položiek (záhradné prístrešky,
prestrešenie terasy, bioklimatické pergoly, tienenie, vonkajšie kuchyne),
rozdelené rovnako na značku Koverta a Soltec.

Zadanie:

1. **Tri varianty** panela, desktop 1440. Ku každému aj stav zavretej
   hlavičky a mobilnú zásuvku 390.
2. Panel **nesmie obsahovať tlačidlo výzvy**. Zadávateľ ho odmietol —
   z menu sa nemá predávať, menu má viesť. Sivý pás naspodku panela je preč.
3. Značku pri stĺpci nesie logo, nie napísané meno (obe logá dodáme).
4. Každá položka má miniatúru. Navrhni pomer strán a veľkosť tak, aby
   panel s piatimi položkami nebol vyšší než pol obrazovky na notebooku.
5. Rieš aj stav, keď je v stĺpci **jediná položka** — panel nesmie vyzerať
   prázdny.
6. Hlavička je nad fotografiou aj nad bielou plochou. Napíš, čo sa mení.

## F — vzorkovník odtieňov

Osem odtieňov je v cene, zvyšok palety RAL na objednávku. Súčasné riešenie
(farebný štvorec + názov + kód pod ním) zadávateľ odmietol.

Odtiene, ktoré musia byť vidieť:

| Názov | Kód | Farba |
|---|---|---|
| Antracitová sivá | RAL 7016 | `#383E42` |
| Biely hliník | RAL 9006 | `#A5A8A6` |
| Sivý hliník | RAL 9007 | `#8F8F8C` |
| Dopravná biela | RAL 9016 | `#F1F0EA` |
| Sivobiela | RAL 9002 | `#D7D5CB` |
| Perlová biela | RAL 1013 | `#E3D9C6` |
| Čokoládová hnedá | RAL 8017 | `#45322E` |
| Tmavá sivá DB | RAL DB703 | `#4A4B4C` |

Všetky sú v mikroštruktúre — matný, jemne zrnitý povrch, nie lesk.

Zadanie:

1. **Tri varianty**, desktop 1440 a mobil 390.
2. Štyri z ôsmich odtieňov sú takmer biele a vedľa seba splývajú. Vyrieš to —
   podkladom, poradím, veľkosťou plochy alebo niečím iným.
3. Musí byť jasné, ktoré odtiene **sú v cene** a že zvyšok palety RAL
   sa objednáva zvlášť.
4. Aspoň jeden variant nech ukáže odtieň **na konštrukcii**, nie len ako
   plochu — fotografiu dodáme.
5. Nepoužívaj lesk, tieň ani gradient na vzorke: mikroštruktúra je matná
   a vzorka má byť pravdivá.

## G — typorady

Carporty a prestrešenia Soltec majú dva typorady. Rad **F** je vodorovný
kváder s ISO panelom, rad **SL** je subtílnejší a počíta s uzamykateľným
boxom. Ku každému radu patria dva modely (170 a 240 podľa výšky profilu)
a tabuľka parametrov: rám a stĺp v mm, max. šírka, max. dĺžka pri štyroch
a pri šiestich stĺpoch, kotvenie, zaťaženie v kg/m².

Zadanie:

1. **Dva varianty**, desktop 1440 a mobil 390.
2. Zákazník si má za pár sekúnd vybrať rad a až potom porovnávať čísla.
   Tabuľka so šiestimi stĺpcami je dnes prvé, čo uvidí — otoč to.
3. Hodnoty ako „6,0 m na 4 stĺpoch / 9,15 m na 6 stĺpoch" sú dvojriadkové.
   Navrhni zápis, pri ktorom je jasné, čo ku ktorému modelu patrí.
4. Na mobile sa **nesmie rolovať do strán**.
5. Rozdiel medzi radmi F a SL musí byť čitateľný aj bez tabuľky — jednou
   vetou a jedným obrázkom.

## H — pás čísel

Pod úvodnou obrazovkou je pás s tromi až šiestimi údajmi: veľká hodnota
(napríklad „EN 13561", „trieda 3", „do 45 m²"), pod ňou dve slová, čo to je,
a pod tým jedna vysvetľujúca veta. Používa sa na piatich podstránkach.

Zadanie:

1. **Dva varianty**, desktop 1440 a mobil 390.
2. Musí fungovať pri **troch aj pri šiestich** položkách bez toho, aby sa
   rozsypal alebo aby vznikol prázdny riadok.
3. Hodnota je druhá úroveň, nie prvá — nadpis sekcie nad ňou musí ostať
   silnejší.
4. Žiadne ikony v kolieskach a žiadne čísla vo vyplnených bodkách.

## Ako to odovzdať

Jeden canvas, artboardy vedľa seba, popísané: `A1 desktop`, `A1 mobil`,
`A2 desktop`, … Pod každým variantom dve vety, prečo je takto a pre koho je
lepší. Bez lorem ipsum — použi skutočné slovenské texty vyššie.

---------------------------------------------------------------------------

## Čo s výsledkom

Keď si vyberieš variant, pošli mi číslo artboardu (napr. „A2, B1, C3, D1,
E2, F1, G2 a H1") a ja to prepíšem do webu v existujúcom dizajnovom systéme —
bez nových CSS vrstiev. Stačí číslo; nemusíš nič popisovať.
