# Koverta — Batch 4 / Task D: Rozmery, ktoré vieme dodať

Tento prompt je implementačná verzia zadania D z `PROMPT-CLAUDE-DESIGN.md`. Použi ho pri ďalšej dizajnovej alebo kódovej iterácii tejto sekcie.

## Repo a bezpečnostné pravidlá

- Repo: `danielvendzur-code/koverta-web`
- Pracuj iba na branchi `fix/koverta-final-repair-20260910`.
- PR #22 musí zostať DRAFT. Nemeržuj a nemen master.
- Vždy začni z aktuálneho HEAD branche; nepracuj zo starého SHA.
- Nemeň ceny, katalógové rozmery, produktové URL ani 3D URL bez dôveryhodného zdroja.
- Nezjednodušuj sekciu tým, že z nej odstrániš katalógové možnosti. Všetky existujúce rozmery musia zostať dostupné.

## Cieľ

Sekcia nemá byť stena piluliek. Zákazník má rýchlo urobiť tri rozhodnutia:

1. zvoliť skupinu (1 / 2 / 3 autá, ak stránka skupiny má),
2. nájsť svoju šírku a v jej riadku dostupnú dĺžku,
3. buď otvoriť produkt, použiť druhoradú akciu `3D`, alebo zistiť, že potrebuje rozmer na mieru.

Hlavná informácia na každej možnosti je rozmer. Cena `od` je sekundárna. `3D` je terciárna akcia a nesmie mať rovnakú vizuálnu váhu ako rozmer.

## Povinný obsah

### Prístrešky pre autá

- 1 auto: 27 rozmerov, od 4 497 €
- 2 autá: 27 rozmerov, od 6 497 €
- 3 autá: 1 rozmer, od 12 490 €
- Zachovaj všetkých 55 produktových možností a všetky existujúce odkazy.
- Nad skupinami vytvor rýchly výber `1 auto / 2 autá / 3 autá`, ktorý iba skočí na príslušnú skupinu; nesmie filtrovaním skrývať obsah bez možnosti návratu.
- V každej veľkej skupine nech ostanú najčastejšie šírky viditeľné a zvyšné šírky pod natívnym `<details>` rozbalením.
- Skupina s jediným rozmerom musí pôsobiť zámerne, nie ako rozbitá mriežka.

### Záhradné prístrešky

- 12 rozmerov od 4 297 €.
- Zachovaj všetky ceny a odkazy.
- Zoskupenie podľa šírky ostáva, pretože pri 12 rozmeroch je rýchlejšie než filter.
- Rozšírené rozmery 7 a 8 m môžu zostať pod `<details>`, bez horizontálneho scrollu.

## Vybraný layout na implementáciu

Použi **zoskupenie podľa šírky + rýchly výber skupiny**, nie samostatný filter s formulárovými ovládačmi. Dôvod: rozmery sú malá diskrétna množina a zákazník potrebuje porovnávať ceny vedľa seba. Filter by skryl kontext a pridal zbytočný stav.

- Desktop: fotografia skupiny vľavo, katalóg vpravo.
- Názov skupiny a počet rozmerov sú nad maticou.
- Každý riadok = jedna šírka.
- Každá dostupná dĺžka = kompaktná karta, nie plne zaoblená pilulka.
- V karte je veľká dĺžka, pod ňou menšia cena `od`.
- `3D` je úzky samostatný segment napravo, vizuálne tichý, ale klikateľná plocha minimálne 44 × 44 px.
- Na mobile: šírka je nad riadkom; možnosti sa zalomia do dostupnej šírky. Žiadny horizontálny scroll.

## Rozmer na mieru

Pod katalógom zachovaj túto myšlienku bez zmeny významu:

> Toto sú hotové veľkosti z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer je vec výroby, nie výberu z tabuľky.

Sprav z nej pokojný záverečný blok s jednou akciou na nezáväznú ponuku. Nesmie vyzerať ako banner ani reklama.

## Fotografie

- Použi iba reálne lokálne Koverta fotografie z `assets/`, nie externý Googleusercontent obrázok.
- Pre 1 auto preferuj `koverta-pristresok-auto-trnava-sikmy.jpg`, ak pri QA sedí crop.
- Pre záhradný katalóg použi lokálnu bratislavskú realizáciu; ak je rovnaká fotografia už tesne nad alebo pod sekciou, použi druhý uhol (`hero` vs `detail`).
- Fotografia nesmie deformovať pomer strán ani znižovať čitateľnosť katalógu.

## Vizuálny jazyk

- Archivo.
- `#12171A`, `#F6F5F2`, biela, `#FFCC00` iba ako akcent.
- Bez gradientov, glass/blur, modrej, neonových prvkov, veľkých tieňov alebo ikoniek v kolieskach.
- Radius 12–18 px; plné pill tvary nech zostanú iba tam, kde ide skutočne o tlačidlo/ovládač, nie o každú rozmerovú kartu.
- Cena nesmie byť väčšia alebo kontrastnejšia než rozmer.

## QA podmienky

Pred commitom automaticky a vizuálne over:

1. počet produktových rozmerov pred a po zmene je rovnaký,
2. množina produktových URL a 3D URL je pred a po zmene rovnaká,
3. ceny v existujúcich katalógových kartách sa nezmenili,
4. desktop 1440 px nemá prekrytie ani nečitateľné riadky,
5. mobil 390 px nemá horizontálny overflow,
6. `3D` akcie majú minimálne 44 × 44 px,
7. `<details>` sa dá otvoriť a zobrazí všetky skryté šírky,
8. rýchly výber 1/2/3 autá vedie na správnu skupinu,
9. sekcia s jediným rozmerom je vizuálne kompaktná,
10. screenshoty desktop + mobil pre obe podstránky sa ručne skontrolujú.

Ak niektorý bod zlyhá, necommituj produktovú zmenu. Neoslabuj QA len preto, aby prešlo.