# Koverta — Batch 6 / Task F: Vzorkovník odtieňov

Toto je implementačná verzia zadania F z `PROMPT-CLAUDE-DESIGN.md` pre existujúcu sekciu na stránke `bioklimaticke-pergoly/`.

## Bezpečnostné pravidlá

- Repo: `danielvendzur-code/koverta-web`
- Branch: `fix/koverta-final-repair-20260910`
- PR #22 musí zostať DRAFT. Nemeržuj a nemen master.
- Začni vždy z aktuálneho HEAD.
- Nemeň typorady, rozmery, ceny, konfigurátor ani iné sekcie.
- Zachovaj existujúce SEO, URL, CTA cieľ `#ponuka` a produktové fakty, pokiaľ ich toto zadanie výslovne neopravuje.

## Zdroj pravdy pre osem odtieňov

V cene musia zostať presne tieto odtiene a tieto hodnoty:

- Čokoládová hnedá — RAL 8017 — `#45322E`
- Antracitová sivá — RAL 7016 — `#383E42`
- Tmavá sivá DB — RAL DB703 — `#4A4B4C`
- Sivý hliník — RAL 9007 — `#8F8F8C`
- Biely hliník — RAL 9006 — `#A5A8A6`
- Sivobiela — RAL 9002 — `#D7D5CB`
- Perlová biela — RAL 1013 — `#E3D9C6`
- Dopravná biela — RAL 9016 — `#F1F0EA`

Všetkých osem je prezentovaných ako **matná mikroštruktúra**. Nezavádzaj lesklú verziu a nehovor, že pri týchto ôsmich si zákazník volí medzi hladkým matom a mikroštruktúrou.

## Vybraný layout

Aktuálny smer F1 je správny a nemá sa prekopávať: grafitový panel + osem veľkých vzoriek zoradených od tmavej po svetlú + dve fotografie konštrukcie pod paletou.

Dôvod:
- štyri svetlé farby na bielom pozadí splývajú,
- grafitový podklad dá každej svetlej vzorke jasnú hranu bez falošného tieňa,
- veľká plocha farby sa číta rýchlejšie než pôvodný malý štvorec,
- fotografie pod paletou ukazujú, že farba na celej konštrukcii pôsobí inak než izolovaná vzorka.

## Čo treba dokončiť

1. Zachovaj osem vzoriek, ich poradie, názvy, RAL kódy a hex hodnoty.
2. Zachovaj tmavý panel a jasnú vetu, že všetkých osem je v cene.
3. Mikroštruktúra má byť jemná. Žiadny gradient, lesk, odlesk ani tieň v samotnej vzorke.
4. Oprav texty, ktoré by naznačovali, že pri základnej osmičke si zákazník volí hladký mat verzus mikroštruktúru. Základná osmička = matná mikroštruktúra.
5. Pri fotografiách netvrď, že ide o „tú istú konštrukciu“, ak to zdroj jednoznačne nedokazuje.
6. Informácia o celej palete RAL na objednávku má zostať sekundárna pod základnou osmičkou.
7. Na mobile ponechaj jeden vertikálny zoznam: vzorka 44+ px, názov, RAL kód. Žiadny horizontálny scroll.
8. Nemeň ostatné sekcie stránky.

## Vizuálny jazyk

- Archivo.
- Grafit `#12171A`, kostná biela `#F6F5F2`, čistá biela, jantár `#FFCC00` iba akcent.
- Bez glass/blur, gradientov a veľkých tieňov.
- Fotografie majú rovnaký pokojný radius ako zvyšok webu.
- Vzorky sú materiálový prvok, nie tlačidlá: žiadny hover, ktorý by naznačoval klikateľnosť.

## QA pred commitom

1. Sekcia obsahuje presne 8 `.kh-odtien` položiek.
2. V DOM ostáva presne všetkých 8 názvov a RAL kódov vyššie.
3. Inline farby vzoriek presne zodpovedajú ôsmim hex hodnotám vyššie.
4. Text sekcie jasne uvádza, že osem základných odtieňov je v cene a zvyšok RAL je na objednávku.
5. V základnej osmičke sa nikde netvrdí, že si zákazník volí hladký mat alebo mikroštruktúru.
6. Desktop 1440 px: všetkých 8 vzoriek viditeľných bez horizontálneho scrollu, svetlé farby sa nestrácajú na podklade.
7. Mobil 390 px: vzorky sú v jednom stĺpci, bez horizontálneho overflow.
8. Obe fotografie pod paletou sa načítajú (`complete === true`, `naturalWidth > 0`).
9. Sekcia nemá rozbitý layout, pretekanie textu ani falošné lesklé/gradientové efekty.
10. Urob a ručne skontroluj screenshot desktop aj mobil.

Ak vizuálny screenshot ukáže splývajúce svetlé farby, rozbitú fotografiu, pretekanie alebo nepravdivý text, je to blocker a zmena sa nesmie považovať za hotovú.