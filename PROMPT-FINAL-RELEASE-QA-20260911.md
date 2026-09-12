# Koverta — Final release QA / 2026-09-11

Použi iba na branchi `fix/koverta-final-repair-20260910`. PR #22 musí zostať DRAFT. Nemeržuj a nemen `master`.

## Zásada

Nič neopravuj naslepo a nemen rozsah produktu. Ak QA odhalí problém, oprav iba konkrétny blocker a znovu spusti príslušné kontroly. Testy sa nesmú vypnúť, zjemniť ani obísť.

## Povinné regresné kontroly konfigurátora

Spusť bez zmeny prísnosti:

- `pricing-logic`
- `osnova-podla-expivi`
- `technical-fidelity`
- `koverta-accessories`
- `layout-smoke`
- `stlpy-vidno`
- `prekrytie`
- `strecha-nepresvita`
- `plynulost`
- `routing-smoke`
- `browser-qa`
- deep render QA: `02-occlusion-sweep`, `02-component-visibility`, `02-focused-render-qa`
- Soltec motion regression

Každá viditeľná bodka, čiarka, seam, scratch, bleed-through, z-fighting, presvitajúca geometria, skok geometrie alebo zlyhaný test je blocker.

## Webové stránky

Na desktop 1440 px a mobile 390 px over minimálne:

- homepage
- prístrešky pre autá
- záhradné prístrešky
- carport Soltec
- bioklimatické pergoly
- pevné prestrešenia
- tienenie
- vonkajšie kuchyne
- realizácie
- konfigurátor Koverta / carport / canopy / bio

Blokuje:

- horizontálny overflow,
- rozbitý obrázok,
- chýbajúca alebo zmenená navigácia,
- zlý sticky header,
- nečitateľný text,
- zmenená cena alebo produktový rozmer bez zdroja,
- duplicita fotografie tam, kde mala byť použitá iná perspektíva,
- regresia pôvodnej 5-krokovej sekcie „Ako to prebieha“,
- odlišná veľkosť kariet, ktorá pôsobí náhodne,
- CTA bez požadovaného orámovania,
- poškodená menu hover animácia.

## Technická správnosť Soltec

Zdrojovo overené pravidlá, ktoré sa nesmú znovu prepísať odhadom:

- carport rad F: ISO panel má 2 % spád integrovaný do vodorovného rámu,
- carport rad SL: ISO panel má viditeľný 1,5 % spád,
- SL 170 je model pre jedno auto,
- SL 240 je model pre dve autá,
- bioklimatické a pevné prestrešenia používajú iba rozmery, farby a doplnky podložené aktuálnymi Soltec materiálmi.

## Finálne podmienky

Pred označením práce za dokončenú:

1. aktuálny HEAD musí byť presne branch `fix/koverta-final-repair-20260910`,
2. PR #22 musí zostať otvorený a DRAFT,
3. žiadny dočasný `tmp-*` workflow nesmie zostať v `.github/workflows`,
4. diff proti `master` nesmie obsahovať neúmyselne zmazané produktové súbory,
5. aktuálna PR QA matica musí prejsť,
6. ručne skontroluj dostupné screenshot/artifact výstupy,
7. až potom odovzdaj preview link; nič nemerguj.
