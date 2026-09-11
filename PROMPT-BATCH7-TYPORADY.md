# Koverta — Batch 7 / Task G: Typorady Soltec

Toto je implementačný prompt pre ďalší krok. Cieľ nie je meniť technické dáta, ale spraviť výber typoradu a modelu zrozumiteľný skôr, než zákazník príde k číslam.

## Bezpečnostné pravidlá

- Repo: `danielvendzur-code/koverta-web`
- Branch: `fix/koverta-final-repair-20260910`
- PR #22 ostáva DRAFT. Nemeržuj, nemen master.
- Vždy pracuj z aktuálneho HEAD.
- Nemeň konfigurátor, ceny ani technické parametre bez overeného zdroja.
- Nevymazávaj SEO, FAQ, schema ani existujúce technické údaje.
- Použi iba už overené Soltec/Koverta fotografie; pri Soltec preferuj profesionálne fotografie výrobcu.

## Stránky v scope

### `carport-soltec/`

Aktuálne porovnáva:
- SL 170 — jedno auto,
- SL 240 — dve autá,
- box je samostatný doplnok.

Zákazník má najprv pochopiť rozdiel použitia a až potom rozmery. Zachovaj všetky aktuálne overené údaje a odkazy.

### `pevne-prestresenia/`

Aktuálne rozlišuje:
- rad F — ISO panel,
- rad G — sklo alebo zelená strecha,
- modely F170, F240, G170, G240.

Z existujúceho obsahu je tiež podložené, že ISO panel je lacnejší než sklo. Toto možno komunikovať iba ako rozdiel strešnej výplne, nie ako vymyslený kompletný cenník modelov.

## Cieľ UX

Používateľ má do pár sekúnd vedieť:

1. ktorý rad/model je pre jeho situáciu,
2. aký je hlavný vizuálny a funkčný rozdiel,
3. aké má limity šírky a dĺžky,
4. čo je doplnok a čo súčasť systému,
5. až potom porovnávať detailné čísla.

Veľká technická tabuľka nesmie byť prvý kontakt s výberom.

## Vybraný layout

Použi **rozhodovacie karty + kompaktné technické fakty**.

- Desktop: dva hlavné rady vedľa seba; pod nimi modely príslušného radu.
- Každý rad má jednu kvalitnú fotografiu, krátku vetu „pre koho je“, jednu vetu o streche/spáde a jedno jasné cenové/produktové rozlíšenie iba tam, kde je podložené.
- Modelové čísla sú sekundárne voči rozhodnutiu zákazníka.
- Rozmery „4 stĺpy“ a „6 stĺpov“ musia zostať fyzicky pri danom modeli, aby sa nedali pomýliť so susedným modelom.
- Na mobile jeden stĺpec; žiadna horizontálna tabuľka ani scroll.

## Obsah, ktorý nesmie zmiznúť

### Carport SL

- SL 170 = pre jedno auto.
- SL 240 = pre dve autá.
- Box = samostatný doplnok.
- Zachovaj všetky existujúce rozmery a limity, ktoré už stránka uvádza.
- Zachovaj konfigurátor CTA.
- Pri spáde nepíš nič nové naslepo: použi iba formuláciu podloženú existujúcim obsahom/FAQ.
- Doplnky zobraz ako druhoradú informáciu, nie ako tretí „model“.

### Pevné prestrešenia

- F = ISO panel.
- G = sklo alebo zelená strecha.
- F170, F240, G170, G240 ostávajú.
- Zachovaj aktuálne max. šírky a dĺžky pre 4 a 6 stĺpov.
- Pri rade F môže byť jasne uvedené, že ISO panel je lacnejšia strešná výplň než sklo, pretože to už potvrdzuje aktuálny obsah stránky.
- Spád a odvodnenie formuluj len podľa existujúceho overeného obsahu stránky.

## Fotografie

- Soltec: preferuj profesionálne fotografie výrobcu pred našimi momentkami.
- Nepoužívaj rovnaký záber na dve susediace karty, ak máme iný kvalitný overený uhol.
- Fotografia nesmie meniť počas animácie ani pri hoveri.
- `object-fit: cover`, konzistentný pomer strán a crop.
- Každý obrázok musí prejsť `complete === true` a `naturalWidth > 0`.

## Vizuálny jazyk

- Archivo.
- `#12171A`, biela, `#F6F5F2`, `#FFCC00` iba akcent.
- Bez gradientov, glass efektov, modrej a veľkých tieňov.
- Radius 12–18 px.
- Čísla sú prehľadné, nie dominantnejšie než samotné rozhodnutie medzi radmi.
- CTA vždy s orámovaním alebo jasnou plnou tlačidlovou plochou; žiadne osamotené textové CTA bez rámu.

## QA pred commitom

1. Carport stránka stále obsahuje SL170 a SL240 a ich existujúce technické údaje.
2. Pevné prestrešenia stále obsahujú F170, F240, G170, G240 a ich existujúce technické údaje.
3. Žiadna cena, rozmer ani technická hodnota sa nezmení bez explicitne overeného zdroja.
4. Box zostáva označený ako doplnok, nie model.
5. F vs G je pochopiteľné aj bez čítania čísel.
6. SL170 vs SL240 je pochopiteľné aj bez čítania čísel.
7. Desktop 1440: žiadne pretekanie, všetky karty vizuálne rovnako vysoké v rámci páru.
8. Mobile 390: žiadny horizontálny scroll; modelové fakty sa čítajú v jednom stĺpci.
9. Všetky fotografie sa načítajú a nemenia sa počas hover/scroll animácie.
10. CTA sú konzistentné so zvyškom webu a nie sú bez orámovania.
11. Urob screenshot príslušnej sekcie na oboch stránkach v 1440 px a 390 px a ručne ich skontroluj.
12. Ak screenshot pôsobí ako technická tabuľka pred rozhodnutím, batch nie je hotový.

Nemeň nič mimo týchto dvoch modelových sekcií a prípadných presne scoped CSS pravidiel potrebných pre ich layout.