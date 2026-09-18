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

Znenie ostáva také, aké bolo na starom webe. Zmenilo sa jediné miesto:

| Kde | Čo sa stalo | Prečo |
|---|---|---|
| Čl. VII ods. 2 a 3 | doprava **aj** montáž sú v cene; osobitne sa účtuje len to, čo ponuka výslovne neobsahuje (podklad, základy, elektroinštalácia, odstránenie prekážok) | rozhodnutie majiteľa; rovnako to hovorí web aj konfigurátor |

Nič iné sa v obchodných podmienkach nemenilo.

**Rozhodnutie majiteľa zo 17. 9. 2026: web bude e-shop.** Odseky, ktoré sme
predtým vypustili, lebo web v deň spustenia košík nemá, sú preto späť v
pôvodnom znení:

- Čl. IV ods. 2, **Objednávka cez web stránku** — vloženie do košíka a
  tlačidlo „Objednať s povinnosťou platby"
- Čl. VIII — **online platobnou kartou cez platobnú bránu**
- Čl. II a V — užívateľský účet, prihlasovacie údaje a registrácia ostávajú

Prístrešky Koverta pre autá aj záhradné prístrešky sú v štruktúrovaných
údajoch vedené ako produkty s cenou, dostupnosťou a odkazom do konfigurátora,
tak ako boli na starom webe.

**Čo z toho vyplýva pre deň spustenia:** kým košík a platobná brána reálne
nebežia, tieto tri odseky opisujú stav, ktorý na webe ešte nie je. Je to
zámer majiteľa, nie prehliadnutie — ale právnik má o tom vedieť, lebo
spotrebiteľ sa o podmienky opiera.

### `ochrana-sukromia/index.html`

Dokument ostáva bez zmeny. Meranie návštevnosti (Google Tag Manager a
Microsoft Clarity) na webe beží ďalej a dokument ho menuje, takže nebolo čo
dopĺňať. Lištu so súhlasom s cookies rieši platené rozšírenie na strane
obchodu, nie tento web.

## Ako to zapracovať

Právnik dodá nové znenie, my ho vložíme 1 : 1. Do textu nezasahujeme
štylisticky — mení sa len to, čo dodá. Miesta sú v HTML označené komentárom
`NA PRÁVNU KONTROLU`.
