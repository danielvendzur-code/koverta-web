# Koverta — Batch 5 / Task E: Rozbaľovacie menu v hlavičke

Tento prompt je implementačná verzia zadania E z `PROMPT-CLAUDE-DESIGN.md`.

## Repo a bezpečnostné pravidlá

- Repo: `danielvendzur-code/koverta-web`
- Pracuj iba na branchi `fix/koverta-final-repair-20260910`.
- PR #22 musí zostať DRAFT. Nemeržuj a nemen master.
- Vždy začni z aktuálneho HEAD branche.
- Hlavička je globálny prvok: zmena musí fungovať na homepage aj na vnorených podstránkach s `../assets/...` cestami.
- Zachovaj existujúce navigačné URL a dostupnosť klávesnicou.

## Povinná informačná architektúra

Hlavná navigácia má päť položiek:

1. Pre autá
2. Pre dom a záhradu
3. Realizácie
4. 3D konfigurátor
5. Kontakt

Prvé tri položky otvárajú panel.

### Pre autá

- Koverta — Prístrešky pre autá — `Pre 1 až 3 autá, oceľ a hliník z vlastnej výroby.`
- Soltec — Carport Soltec — `Prémiový hliníkový systém s čistou architektúrou.`

### Pre dom a záhradu

Koverta:
- Záhradné prístrešky

Soltec:
- Pevné prestrešenia
- Bioklimatické pergoly
- Tienenie
- Vonkajšie kuchyne

### Realizácie

- Všetky realizácie
- Mapa realizácií

## Vybraný variant na implementáciu

Použi **široký pokojný panel pod navigačnou lištou s jasným zoskupením podľa značky**, nie samostatné malé dropdowny pod jednotlivými slovami.

- Panel sa na desktope rozprestrie cez dostupnú šírku hlavičky, ale vnútorný obsah ostáva opticky kompaktný.
- Koverta a Soltec sú skupiny. Názov skupiny nenapíš textom; nesie ho príslušné logo.
- V paneli `Pre autá` majú obe značky po jednej položke a musia pôsobiť vyvážene, nie ako dve malé karty v prázdnom paneli.
- V paneli `Pre dom a záhradu` má Koverta jednu položku a Soltec štyri. Jediná Koverta položka musí mať zámernú kompozíciu; nesmie ostať v prázdnom stĺpci bez vizuálnej opory.
- Soltec štyri položky zobraz ako kompaktnú 2 × 2 mriežku; Koverta karta môže byť väčšia, aby sa vyvážila plocha.
- `Realizácie` používa rovnaký panelový jazyk a dve obrazové navigačné položky.

## Karty v menu

Každá položka obsahuje:

- miniatúru,
- názov,
- maximálne jednu krátku orientačnú vetu tam, kde pomáha rozhodnúť,
- žiadne ceny,
- žiadne CTA tlačidlo.

Menu má viesť, nie predávať. Odstráň akýkoľvek sivý spodný predajný pás alebo samostatnú výzvu na akciu.

Miniatúry majú jednotný pomer strán a `object-fit: cover`. Panel s piatimi položkami nesmie byť na notebooku vyšší než približne polovica viewportu.

## Fotografie

Používaj existujúce overené Koverta/Soltec fotografie z `assets/` alebo už overené vlastné Koverta CDN zdroje. Nezavádzaj stock fotografie ani náhodné obrázky.

Pre `Realizácie` použi reálne realizácie:
- Všetky realizácie: Koverta Trnava / iný overený Koverta záber.
- Mapa realizácií: iný overený záber, aby sa rovnaká fotka neopakovala vedľa seba.

## Desktop interakcia

- Otvorenie/zatvorenie bez bliknutia a bez posunu layoutu.
- Panel musí byť nad hero fotografiou aj nad bielou plochou čitateľný rovnako; samotný panel je nepriehľadný biely/bone povrch.
- Aktívny trigger nech používa jemnú jantárovú linku alebo zmenu textu, nie vyplnenú žltú pilulku.
- Klik mimo, `Escape` a otvorenie iného menu musia aktuálny panel zavrieť.
- `aria-expanded` musí presne zodpovedať otvorenému stavu.

## Mobil 390 px

- Zachovaj drawer, nie desktop panel zmenšený na telefón.
- Skupiny ostanú `details/summary` a musia byť pohodlne trafiteľné.
- Fotografia nesmie zabrať väčšinu riadku; cieľom je rýchle skenovanie.
- Koverta/Soltec logo môže zostať pri položke, ak je tak mobil čitateľnejší než samostatná hlavička skupiny.
- Žiadny horizontálny overflow.
- Drawer musí mať scroll, ak je obsah vyšší než viewport.

## Vizuálny jazyk

- Archivo.
- `#12171A`, biela, `#F6F5F2`, `#FFCC00` iba akcent.
- Bez gradientov, glass/blur, neónu, modrej a veľkých tieňov.
- Radius 12–18 px, jemné hairline deliace čiary.
- Logo značky nesmie byť väčšie než názov produktu potrebuje; značka je orientácia, nie banner.

## QA — pred commitom povinne

1. Všetkých päť hlavných navigačných položiek ostáva dostupných.
2. Pre autá má presne 2 produktové položky.
3. Pre dom a záhradu má presne 5 produktových položiek.
4. Realizácie má presne 2 položky a obe majú miniatúru.
5. Žiadny mega panel neobsahuje CTA/predajný spodný pás.
6. Všetky obrázky v otvorenom menu majú `complete === true` a `naturalWidth > 0`.
7. `aria-expanded` sa pri otvorení a zatvorení mení správne.
8. `Escape` zatvorí panel.
9. Klik mimo zatvorí panel.
10. Otvorenie druhého triggera zatvorí prvý.
11. Desktop 1440 a notebook 1280 nemajú overflow; najvyšší panel ostane pod 50 % výšky viewportu.
12. Mobil 390 nemá horizontálny overflow a drawer sa dá celý prescrollovať.
13. Skontroluj screenshoty: zavretá hlavička, každý z troch otvorených panelov desktop, a mobilný drawer.
14. Zmenu over minimálne na homepage a jednej vnorenej podstránke, aby boli relatívne asset cesty správne.

Ak QA ukáže rozbitý obrázok, odrezaný panel, prázdny brand stĺpec, nefunkčný `Escape` alebo zmenu URL, je to blocker. Neoslabuj test.