# Právne texty — podklad pre právnika

Stav k 7. 9. 2026. Znenie sme **neprepisovali**. Nižšie je presný zoznam
miest, ktoré si žiadajú kontrolu, aj s citáciou, aby sa dali nájsť za minútu.

## Overený fakt

Zákon **č. 108/2024 Z. z. o ochrane spotrebiteľa** nadobudol účinnosť
**1. 7. 2024** a nahradil tri predpisy, na ktoré sa naše podmienky odvolávajú:

- zákon č. 250/2007 Z. z. o ochrane spotrebiteľa
- zákon č. 102/2014 Z. z. o predaji na diaľku
- zákon č. 299/2019 Z. z.

Zdroje: [Slov-Lex](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2024/108/) ·
[epravo.sk](https://www.epravo.sk/top/clanky/novy-zakon-o-ochrane-spotrebitela-6208.html)

**Prečo sme čísla nezmenili sami:** dve miesta necitujú zákon všeobecne, ale
konkrétne ustanovenie (`§ 3 ods. 1 zákona 102/2014`, `§ 2 písm. a) zák.
250/2007`). Číslovanie paragrafov sa do nového zákona neprenáša jedna k
jednej. Prepísať len číslo zákona a nechať pôvodný paragraf by z textu
spravilo niečo, čo vyzerá aktuálne, ale odkazuje inam — to je horšie než
zjavne starý odkaz.

## Miesta na kontrolu

### `obchodne-podmienky/index.html`

| # | Citácia v texte | Typ |
|---|---|---|
| 1 | „…poskytnutie informácií v súlade s **§ 3 ods. 1 zákona č. 102/2014 Z. z.** o ochrane spotrebiteľa pri predaji tovaru…" | konkrétne ustanovenie |
| 2 | „…zákonom č. 40/1964 Z. z. Občiansky zákonník…, **zákonom č. 250/2007 Z. z.** o ochrane spotrebiteľa…, **zákonom č. 102/2014 Z. z.**…" | výpočet predpisov |
| 3 | „Kupujúcim spotrebiteľom je v zmysle **§ 2 písm. a) zák. č. 250/2007 Z. z.**…" | konkrétne ustanovenie + definícia |
| 4 | „…riadia príslušnými ustanoveniami zák. č. 40/1964 Zb…., **zákona č. 250/2007 Z. z.**, **zákona č. 102/2014 Z. z.**…" | výpočet predpisov |
| 5 | „Odstúpenie od zmluvy objednávateľa… sa riadi príslušnými ustanoveniami **zákona č. 102/2014 Z. z.**" | odstúpenie od zmluvy |

Okrem citácií treba prejsť aj **obsah**: lehoty na odstúpenie od zmluvy,
náležitosti poučenia a zodpovednosť za vady sa novým zákonom menili.

### `reklamacie/index.html`

Odkazy na 250/2007 a 102/2014 sa v texte nenachádzajú, ale lehoty na
vybavenie reklamácie a poučenie o právach vychádzajú z tej istej starej
úpravy — treba ich prejsť spolu s obchodnými podmienkami.

## Už opravené (overiteľný fakt, nie výklad)

- **Európska platforma ODR/RSO** bola k **20. 7. 2025 ukončená**. Odkaz na
  `ec.europa.eu/consumers/odr` už nikam nevedie; nahradil ho odkaz na
  Slovenskú obchodnú inšpekciu a na zoznam subjektov alternatívneho riešenia
  sporov.
- **Číslovanie článkov v reklamačnom poriadku**: posledný článok bol označený
  ako „Článok IV", hoci je šiesty. V obsahu aj v texte je teraz „Článok VI".

## Ako to zapracovať

Právnik dodá nové znenie, my ho vložíme 1 : 1. Do textu nezasahujeme
štylisticky — mení sa len to, čo dodá. Miesta sú v HTML označené komentárom
`NA PRÁVNU KONTROLU`.
