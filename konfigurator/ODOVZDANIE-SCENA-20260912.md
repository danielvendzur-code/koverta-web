# Odovzdanie scény, počasia a odtoku — 20260912

Nadväzuje na pracovný medzikrok po `1ab8011` (vybavenie priestoru) a dopĺňa
to, čo v ňom chýbalo: overený vizuál, dážď napojený na skutočnú strechu a
znázornenie odtoku vody. Vizuál je overený v živom prehliadači (Playwright,
softvérové WebGL), nie na fyzickom mobile.

## Čo je hotové

### Vybavenie priestoru
- Ponuka závisí od konštrukcie: auto len pri prístreškoch pre auto (`carport`,
  `koverta`), posedenie len pri záhradných pergolách (`bio`, `canopy`).
  Tlačidlo, ktoré k rodine nepatrí, sa nezobrazí a `plan()` ho odmietne aj keby
  ho niekto nastavil zvonku.
- Auto je prekreslené: karoséria je vyloftovaná z pozdĺžnych profilov a prierez
  je rozdelený na plátky, takže hrana vzniká presne na prahu, na línii dverí, na
  ramene a na hrane veka — inde je povrch hladký. Oba konce zatvára kupola
  riadená tým istým prierezom, takže nárazník je plocha, nie odrezaná doska;
  mriežka, svetlá, značka aj difúzor sú farbené riadky tej istej kupoly.
  Rázvor 2,91 m, kolesá 19", 63 674 trojuholníkov.
- Posedenie: kde je miesto, kreslí sa vlastná lounge zostava — trojmiestna
  pohovka, dve kreslá, stolík s podnosom a koberec (obálka 3,16 × 2,30 m).
  Kde sa nezmestí, ostáva pôvodná bistro zostava.
- Nálepka Koverta je na čelnom líci stĺpa pri vjazde (v dátach Koverty je tá
  strana „Predná", interne `right`, stena na x = L), nie na bočnom líci.
- Panel „Vybavenie priestoru" je v stĺpci s vizualizáciou, hneď pod lištou
  pohľadov. Ako priamy potomok mriežky bol druhou bunkou prvého riadku a
  odsúval kroky konfigurátora do druhého riadku pod plátno — spodné voľby
  potom prekrývala lišta súhlasu a `pricing-logic` na tom padal.
- Auto (Touring sedan, 42 616 trojuholníkov) a bistro zostava sa kreslia do
  toho istého WebGL kontextu s rovnakou projekciou aj hĺbkovým testom.
  Cez zasklené posuvné panely je auto vidieť sklom, nie pred ním.
- Kontaktné tiene: mäkká elipsa na úrovni dlažby, posunutá podľa hlavného
  svetla shadera. Bez nich vybavenie viselo nad podlahou.
- Obálky sietí sú merané z binárnych dát; `test/scene-assets.js` číta siete a
  padá, keď sa deklarované rozmery rozídu so skutočnými.

### Počasie
- Ovládanie počasia už nie je odložené (`data-scene-weather-pending` je preč).
- Snímok dažďa prekresľuje uložené GPU buffery. Hĺbkový renderer si od tejto
  zmeny drží batch v troch vlastných bufferoch a `depthPainter.replay()` ich
  vykreslí bez jediného prepočtu geometrie: postaviť Kovertu odznova stojí
  ~45 ms na snímok, prekreslenie ~0,3 ms.
- Dážď pozná skutočnú strechu: pultovú rovinu aj s jej stúpaním, plný rám
  okolo pásma lamiel, krytie lamely podľa jej uhla (`bladeWidth * cos(uhol)`)
  a obálku vybavenia z jeho najvyšších plôch. Otvorenými lamelami prší pod
  strechu, zatvorené aj panelová strecha zadržia všetko.
- Kvapka nekončí zmiznutím: pri dopade sa stiahne do striešky a dohasne.
- Dážď padá zvisle. Zatvorená stena či ZIP roleta ho preto neodkláňa — bráni
  len pohľadu, nie pádu. Šikmý dážď hnaný vetrom v scéne nie je.
- Tempo: najviac 30 snímkov za sekundu. Keď meraný odstup medzi snímkami
  presiahne 48 ms, dážď si vypýta pohybové rozlíšenie (to isté, aké beží pri
  otáčaní), a keď nestačí ani to, animácia zastane a panel to napíše.
  Po vypnutí dažďa sa scéna dokreslí ostro.
- Bez hĺbkového rendereru (SVG záloha, stratený kontext) sa animácia vypne a
  panel to povie namiesto toho, aby ticho nič nerobil. To isté platí pre
  vybavenie.

### Odtok vody (voľba „Ukázať odtok vody")
- Vychádza z `lastKvAccessoryGeometry`: hladina leží v priereze žľabu
  (x od `gutter.x0` po `x1`, výška medzi `zBottom` a `zTop`) a tečie k výpustu
  pod zvodom. Po panelovej streche tečie voda k odkvapu, po zatvorených
  lamelách ich žliabkom do rámu; otvorená lamela vodu neudrží a nekreslí sa
  po nej nič.
- Skryté trasy sa nekreslia. Vnútro zvodu ani rozvod v stĺpe nemá cez plný
  profil presvitať; vidno až vodu, ktorá z ústia vytečie na dlažbu (mokrá
  škvrna s kruhmi). Trasu pomenúva popisná schéma pod ovládaním a mení sa
  podľa toho, či je žľab objednaný a či sú lamely otvorené.
- Bez žľabu (panelová strecha bez doplnku) voda prepadá cez odkvapovú hranu
  ako kvapkací záves obrátený k pozorovateľovi.

### SVG záloha
- Overené v prehliadači bez WebGL (`--disable-3d-apis`): plátno prepne na
  `svg-fallback`, panel napíše „Tento prehliadač kreslí zjednodušený nákres —
  vybavenie sa v ňom nezobrazí." a pri daždi doplní „Dážď sa kreslí len v 3D
  náhľade tohto prehliadača." Animácia sa nespustí (hodiny ostanú na nule),
  takže nič nestavia scénu na procesore dokola.

### Mobil
- Panel aj počasie sa na telefóne vojdú, tlačidlá majú 44 px, stránka
  nepretečie do šírky.
- V režime celej obrazovky mal riadok scény pevných 46 vh a `overflow:hidden`,
  takže lišta pohľadov aj panel vybavenia sa orezali a nedalo sa k nim dostať.
  Výšku teraz určuje kresba, riadok rastie podľa obsahu, otvorený panel si
  vezme najviac 22 vh a kresba mu požičia kúsok výšky.

## Overenie

Lokálny statický server `python3 -m http.server 8901`, Playwright 1.55,
Chromium bez GPU (softvérové WebGL — absolútne časy sú preto pesimistické).

| test | výsledok |
| --- | --- |
| scene-assets, technical-fidelity, osnova-podla-expivi, koverta-accessories | PASS |
| stlpy-vidno, prekrytie, strecha-nepresvita, plynulost, routing-smoke | PASS |
| browser-qa, pricing-logic, soltec-motion-regression, depth-renderer-qa | PASS |
| **pocasie-odtok** (nový) | PASS |
| soltec-motion | PASS. Vo workflowe „Koverta exact final QA" bežal proti `/bioklimaticke-pergoly/`, kde od 2e4455f konfigurátor nie je, takže čakal na `[data-sp-cfg]` do vypršania. Ukazuje na `konfigurator/?page=bio` ako druhý workflow. |
| layout-smoke | FAIL aj na čistom strome — `.kh-hero__rating` má na mobile 117,66 px proti prahu 120 px, lebo v tejto piesočnici je zablokovaná CDN s písmami a text sa vysádza náhradným rezom. Nie je to regresia tejto vetvy. |

`konfigurator/test/pocasie-odtok.js` meria dážď pohľadom spod podhľadu —
porovnáva ten istý záber s dažďom a bez neho. Otvorené lamely: 114 bodov
rozdielu, zatvorené 0, panelová strecha 0. Ďalej kontroluje, že hladina leží
v priereze žľabu, kaluž na ústí zvodu (± 3 mm) a že medzi dlažbou a žľabom
nie je voda ani v stĺpe, ani v priereze zvodu. Je v matici oboch QA workflowov.

## Čo ostáva

1. Merania sú zo softvérového WebGL. Na skutočnom telefóne treba potvrdiť, že
   dážď beží plynulo a že sa nespúšťa pohybové rozlíšenie zbytočne.
2. Tri autá sa do katalógu nezmestia: potrebujú 8 000 mm šírky, najširší
   rozmer v katalógu je 7 000 mm. Voľba „3" je preto v paneli nedostupná.
   Nie je to chyba, ale ani to nie je odskúšané v praxi.
3. Gril nie je pripravený. Ďalšie kolo na kvalite modelov je rozpísané v
   `PROMPT-VYBAVENIE-DALSI-MODEL.md`: karosérii chýba lem blatníka, hlbšia
   spára dverí a zlom nad zadným sklom, a auto má 591 kB gzip.
4. SVG záloha vybavenie ani dážď nekreslí; zobrazí sa vysvetlenie.
5. Voda v žľabe je vo svojej kapse za lemovaním, takže z väčšiny pohľadov ju
   zakrýva profil — tak to má byť, ale znamená to, že reťaz „strecha → žľab →
   zvod" je zvonku vidieť len na streche a na dlažbe. Riadený rez alebo
   priehľadný režim profilov by ju ukázal celú; nie je urobený.
6. Nasadenie: vetva nie je na verejnom Pages. Ten stále obsluhuje `master`.
