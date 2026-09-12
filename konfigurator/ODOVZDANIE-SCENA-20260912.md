# Odovzdanie scény po 1ab8011

Používateľ požiadal o skoršie odovzdanie Claude Code. Toto je pracovný medzikrok, nie schválený finálny vizuál.

## Napojené

- `scene-life.js`: samostatné ovládanie vybavenia pod plátnom, 1–3 autá podľa dostupnej šírky, jedna/dve bistro zostavy. Voľný priestor rešpektuje box a okrajovú rezervu. Žiadne zmeny ceny alebo auto-fit kamery.
- Nový shader kreslí vybavenie priamo do rovnakého WebGL kontextu s identickou projekciou, near/far a hĺbkovým testom ako prístrešok. Poradie: nepriehľadná stavba → vybavenie → priesvitné výplne. Obnovuje pôvodné atribúty a buffer pred výplňami. Siete sa nahrávajú do GPU raz; počas orbitu sa menia uniformy.
- Generický Touring sedan: pôvodná tvarovaná sieť, disky, pneumatiky, sklá, zrkadlá, svetlá. 40 288 trojuholníkov. Nie je to stiahnutý model konkrétnej značky.
- Bistro Poly Haven CC0: pôvodná 3D zostava so zachovanými normálami a farbami vzorkovanými z diffuse textúr. 9 828 trojuholníkov. Zdroje a úpravy v `scene-assets/CREDITS.md`.
- Komprimované siete spolu približne 470 kB; načítanie až pri použití. Vyžaduje DecompressionStream. Pri chybe načítania sa zobrazuje stavová správa.
- Predvolene sa ponúkne auto na Koverta/carport, posedenie na ostatných rodinách; ak sa nezmestí, nevykreslí sa a zobrazí dôvod.

## Nedokončené / preveriť ako prvé

1. Vizuál v živom prehliadači ešte NEBOL overený. Cloud Browser odmietol lokálny port 8912 (`ERR_BLOCKED_BY_CLIENT`); nepoužil sa iný browser na obídenie. Spusti projektový preview/QA vo svojom prostredí. Over shader, karosériu, normály, otáčanie, zasklené steny, mobil a viac áut. Ak to vyzerá nepresvedčivo, vylepši alebo vymeň auto za licencovaný detailný model.
2. Over výkon 40k trojuholníkov × 3 autá na mobile, kontakt pneumatiky/podlahy, kontaktné tiene, správne umiestnenie aj pri všetkých kotveniach a posuvných stenách. Test rezervy voči obálke nie je úplný collision detector stĺpov/dverí.
3. SVG fallback zatiaľ nezobrazuje nové vybavenie. Treba doplniť jasnú správu/fallback. Životný cyklus GPU pri context loss treba overiť.
4. V module sú pracovné funkcie pre dážď a jednoduchá schéma odtoku, ale ovládanie počasia je zámerne `hidden data-scene-weather-pending`. `setFrame` nie je napojený: dážď NIE JE hotová funkcia. Najprv implementuj opakované vykreslenie uložených GPU bufferov bez CPU prestavby celej konštrukcie na každom snímku.
5. Dážď musí rešpektovať skutočný profil/spád strechy a medzery pohybujúcich sa lamiel, priechody, vybavenie a steny. Súčasný pracovný shader má iba zjednodušenú horizontálnu výšku a odhad otvorenia; nestačí ho len zapnúť.
6. Odtok napoj na aktuálne `lastKvAccessoryGeometry.gutter/downpipe`, ktoré sú sprístupnené v kontexte modulu. Pri Soltec over konkrétne odvodnenie podľa variantu. Voda nemá byť viditeľná cez nepriehľadné profily. Skryté trasy vysvetli oddelenou označenou schémou alebo riadeným rezom. Aktuálna statická schéma sama o sebe nepredstavuje simuláciu.
7. Doplnkové vybavenie typu gril alebo väčšie lounge posedenie ešte nie je pripravené. Počasie a odtok robiť až po kvalitnom vybavení, podľa priority používateľa.
8. Zmeny nie sú nasadené na starý Sites preview. Verejné master/Pages ani PR sa nemajú automaticky mergovať.

## Overenie

`node --check konfigurator/scene-life.js`
`node --check konfigurator/soltec-premium.js`
`node konfigurator/test/scene-assets.js`
`node konfigurator/test/technical-fidelity.js`
`git diff --check`

Kontrola syntaxe, binárnych dát a priestorových obálok nenahrádza vizuálnu kontrolu ani meranie výkonu.
