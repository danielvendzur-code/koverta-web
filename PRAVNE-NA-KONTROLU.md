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

## Zmenené 17. 9. 2026, na schválenie pred spustením

Web prestáva byť e-shop na Shopify a stáva sa statickou stránkou s
konfigurátorom. Podmienky ale opisovali košík, tlačidlo „Objednať s
povinnosťou platby", platobnú bránu a užívateľské účty. Nič z toho na webe
nie je a po prepnutí domény ani nebude, takže by podmienky opisovali
neexistujúci postup. Tieto miesta sú prepísané a **potrebujú schválenie**:

| Kde | Bolo | Je |
|---|---|---|
| Čl. II | definície „Užívateľský účet" a „Prihlasovacie údaje" | definície „Konfigurátor" a „Dopyt" |
| Čl. IV ods. 1 | zoznam produktov sa dá objednať cez web stránku | ceny sú orientačné a nie sú návrhom na uzatvorenie zmluvy; web neumožňuje objednať ani zaplatiť |
| Čl. IV ods. 2 | objednávka cez košík a „Objednať s povinnosťou platby" | dopyt cez formulár, e-mail alebo telefón; ponuka; potvrdenie ponuky je záväzná objednávka |
| Čl. V | užívateľský účet a registrácia | konfigurátor a orientačná cena; web neponúka registráciu |
| Čl. VII ods. 1 | ceny na stránke sú s DPH | cenu určuje ponuka, ceny na stránke sú orientačné |
| Čl. VII ods. 2 | v cene je montáž | v cene je doprava **aj** montáž, neúčtujú sa osobitne ani podľa vzdialenosti |
| Čl. VII ods. 3 | doprava sa účtuje osobitne podľa nákladov z Nitry | osobitne sa účtuje len to, čo ponuka výslovne neobsahuje (podklad, základy, elektroinštalácia, odstránenie prekážok) |
| Čl. VII ods. 4 | zhotoviteľ je viazaný cenou po celý čas jej zverejnenia na webe | viazaný cenou v ponuke počas jej platnosti; ak ju ponuka neuvádza, platí 7 dní, ako sľubuje web |
| Čl. VIII | platba prevodom alebo kartou cez platobnú bránu | platba prevodom; web nemá platobnú bránu a zhotoviteľ nežiada údaje o karte |
| Čl. IX ods. 10 | vlastníctvo prechádza zaplatením ceny vrátane dopravy | vlastníctvo prechádza zaplatením ceny |

**Rozhodnutie majiteľa, z ktorého to vychádza:** doprava a montáž sú vždy
v cene. Rovnako to teraz hovorí aj web a konfigurátor.

### `ochrana-sukromia/index.html`

- Medzi sprostredkovateľmi bol **Shopify**. Nahradili ho tí, ktorí na webe
  naozaj bežia: GitHub (hosting), Google (Tag Manager, Analytics, Fonts),
  Microsoft (Clarity).
- Tretie krajiny: veta o „prevádzke internetového obchodu" je nahradená
  prevádzkou web stránky a meraním návštevnosti, s odkazom na právny základ
  prenosu.
- Pribudol článok **Meranie návštevnosti a cookies**: čo sa ukladá, štyri
  kategórie súhlasu, ako súhlas zmeniť a odvolať, a veta o Google Fonts,
  ktoré sa načítavajú aj bez súhlasu.

Dôvod: web spúšťa Google Tag Manager a Consent Mode v2, ale dokument o tom
nemal ani slovo, a lišta súhlasu na webe dovtedy vôbec nebola, takže sa
súhlas nedal dať ani odvolať.

## Ako to zapracovať

Právnik dodá nové znenie, my ho vložíme 1 : 1. Do textu nezasahujeme
štylisticky — mení sa len to, čo dodá. Miesta sú v HTML označené komentárom
`NA PRÁVNU KONTROLU`.
