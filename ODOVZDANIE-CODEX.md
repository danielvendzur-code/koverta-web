# Odovzdanie: dokončenie webu Koverta

Vetva `vendzur/gallant-euler-bkvsqa`, postavená na `master` (`61b838c`).
Pred týmto odovzdaním bola vetva **6 commitov ahead / 0 behind** oproti masteru.
Posledný aplikačný commit je `f2cfa39` (66 katalógových rozmerových stránok).
Tento odovzdávací commit má meniť iba tento súbor.

**Nemerguj do `master`.** Majiteľ chce najprv náhľad a kontrolu.
**Nemeň fotky ani marketingové texty bez výslovného súhlasu majiteľa.**

---

## KRITICKÉ: prerušený lokálny Codex beh z 19. 9. 2026 približne 13:43

Predchádzajúci Codex dostal pokyn dokončiť rozrobené opravy, spustiť finálne
testy, aktualizovať toto odovzdanie a až potom prácu odovzdať. Beh sa prerušil
skôr, než sa jeho posledné zmeny dostali na GitHub.

### Čo je isté podľa aktuálneho GitHub stavu

Tieto posledné lokálne zmeny **nie sú na branche pushnuté**:

- `tools/seo-audit.js` na branche neexistuje,
- `konfigurator/test/koverta-render-regression.js` na branche neexistuje,
- `konfigurator/test/realizacie-gallery.js` na branche neexistuje,
- `konfigurator/soltec-premium.js`, `assets/koverta-2026.js` a
  `assets/koverta-2026.css` nie sú medzi zmenami vetvy voči aktuálnemu
  `master` z tohto posledného prerušeného behu,
- `tools/generuj-rozmery.py` na branche stále obsahuje dve chyby, ktoré
  predchádzajúci Codex už v logu identifikoval a lokálne začal opravovať.

Ak pokračuješ na **tom istom lokálnom stroji/worktree**, úplne prvá vec:

```bash
git status --short
git diff --check
git diff
```

Ak tam sú necommitnuté zmeny z prerušeného behu, **NEROB reset, checkout ani
pull cez ne**. Najprv ich zachráň do samostatného rescue commitu alebo patchu
a až potom pokračuj. GitHub ich nemá.

Ak lokálny worktree už neexistuje alebo je čistý, reprodukuj zmeny podľa
nasledujúcej sekcie.

---

## Čo predchádzajúci Codex práve robil a čo treba dokončiť

### 1. Renderer / výkon / kvalita obrazu

Codex už našiel konkrétnu chybu v rendereri:

- trapézová strecha Koverta sa generovala **dvakrát úplne identicky**,
- druhá kópia zbytočne násobila plochy, depth konflikty a čas renderu,
- lokálne ju odstránil, ale táto oprava nie je na GitHube.

Treba nájsť príslušné miesto v `konfigurator/soltec-premium.js`, odstrániť
iba duplicitnú generáciu a ručne overiť, že:
- horný trapéz ostal,
- spodná strana/lemovanie/zvod ostali,
- nič nezmizlo v grazing/under pohľadoch,
- nevznikol nový z-fighting.

Codex zároveň rozpracoval režim kvality:
- finálny statický obraz má zostať ostrý,
- **iba počas pohybu** sa môže adaptívne dočasne znížiť interné rozlíšenie,
- po pustení kamery sa má obraz vrátiť na ostrú finálnu kvalitu,
- slabé zariadenie sa nesmie snažiť držať maximálnu kvalitu za cenu
  viacsekundového blokovania UI.

Nerob tvrdenie „vždy maximálna kvalita bez spomalenia“. Meraj frame times a
zachovaj ostrý settle/final render.

### 2. Soltec lamely

Pred prerušením bolo vizuálne potvrdené:
- viditeľné lamely sú celé medzi horným a spodným rámom,
- nie sú tam dve polovičné lamely na krajoch.

Pri ďalších zásahoch túto opravu nerozbi. Otestuj otvorený, medzipolohový aj
zatvorený stav a pomalý pohyb kamery.

### 3. Technické SEO — konkrétne reprodukovateľné chyby

Codex spustil audit približne **82 verejných HTML stránok** a našiel reálne
technické chyby. Toto nie je marketingový copywriting, takže opravy sú
mechanické.

#### 3a. Canonical rozmerových stránok

Aktuálny GitHub súbor `tools/generuj-rozmery.py` stále má:

```python
ZAKLAD = 'https://danielvendzur-code.github.io/koverta-web'
```

Pre produkčné canonical/OG/schema URL má byť základ:

```text
https://koverta.sk
```

Pozor: preview `noindex, nofollow` zatiaľ ponechaj podľa `MIGRACIA.md`;
canonical a noindex sú dve rôzne veci.

#### 3b. Rozbité odkazy `,,/`

Aktuálny generátor stále robí:

```python
f'<li><a href="../{a}x{b}/">...</a></li>'.replace('.', ',')
```

Tým sa desatinná bodka síce zmení na čiarku v texte, ale zároveň sa
`../` zmení na `,,/`.

Na aktuálne vygenerovaných stránkach je preto možné nájsť napr.:

```html
<a href=",,/5200x5200/">
```

Oprav generátor tak, aby sa desatinné formátovanie robilo **iba na labeli**,
nikdy na celom HTML reťazci. Potom znovu vygeneruj všetkých 66 stránok.

#### 3c. Prázdny title jednej galérie

Lokálny SEO audit hlásil aj galériu realizácií s prázdnym `<title>`.
Root `realizacie/index.html` na GitHube prázdny title **nemá**, preto
nehádaj cestu. Obnov/spusť audit a nech ti vypíše presný súbor, potom oprav
iba ten.

#### 3d. SEO audit tool

Predchádzajúci Codex vytváral `tools/seo-audit.js`, ale na branche nie je.
Obnov ho tak, aby minimálne prešiel všetky verejné HTML stránky a kontroloval:

- neprázdny `<title>`,
- neprázdny meta description,
- canonical,
- OG URL,
- JSON-LD parsovateľnosť,
- lokálne interné odkazy,
- chýbajúce obrázky / alt texty,
- sitemap pokrytie,
- GitHub Pages URL tam, kde má byť `koverta.sk`,
- výskyt rozbitých `href=",,/`.

Audit nesmie meniť súbory; má iba reportovať a skončiť non-zero pri tvrdej
technickej chybe.

### 4. Galéria realizácií

Codex lokálne doplnil/rozpracoval správanie galérie bez výmeny fotografií:

- fullscreen/lightbox,
- šípka vľavo/vpravo,
- klávesy,
- swipe,
- mobilný slider.

Tieto zmeny na GitHube nie sú. Obnov ich v existujúcom dizajne novej stránky.
**Nevymieňaj fotografie.**

Doplň regression test `konfigurator/test/realizacie-gallery.js` alebo
ekvivalent, ktorý overí aspoň:
- otvorenie lightboxu,
- next/prev,
- Escape,
- keyboard arrows,
- swipe/pointer fallback,
- že na mobile galéria nespôsobí horizontálny overflow stránky.

### 5. Renderer regression test

Predchádzajúci Codex pripravoval
`konfigurator/test/koverta-render-regression.js`, ale na branche nie je.
Obnov test tak, aby strážil minimálne:
- že sa strecha Koverta nekreslí duplicitne,
- že finálny settle render sa vráti na plnú/ostrejšiu kvalitu,
- že interakčný adaptive quality režim neostane zapnutý po skončení pohybu,
- že základné vrstvy prístrešku ostávajú prítomné.

Neoslabuj existujúce testy len preto, aby prešli.

---

## Presný odporúčaný sled práce pre ďalší Codex

1. `git status --short`, `git diff`, zachrániť prípadný lokálny diff.
2. Overiť, že branch je `vendzur/gallant-euler-bkvsqa`.
3. Nemeniť `master`.
4. Opraviť `tools/generuj-rozmery.py`:
   - `ZAKLAD = 'https://koverta.sk'`,
   - odstrániť `.replace('.', ',')` nad celým HTML odkazu.
5. Spustiť `python3 tools/generuj-rozmery.py` a overiť 54 + 12 stránok.
6. Obnoviť `tools/seo-audit.js`; spustiť audit všetkých verejných stránok.
7. Nájsť presný prázdny `<title>` z reportu a mechanicky ho opraviť.
8. Obnoviť renderer zmeny:
   - odstránenie duplicitnej strechy,
   - adaptive interaction resolution,
   - ostrý final/settle render,
   - zachovať opravené Soltec lamely.
9. Obnoviť galériu: fullscreen, arrows, keyboard, swipe, mobile slider.
10. Obnoviť regression testy pre renderer a galériu.
11. Spustiť existujúce testy a nové audity.
12. Ručne skontrolovať vizuálne screenshoty.
13. `git diff --check`.
14. Commitnúť iba dokončený scope a aktualizovať toto odovzdanie.
15. **Nemergovať do masteru.**

---

## Testy a poznámky k prostrediu

Lokálny server:

```bash
python3 -m http.server 8901
```

Testy bežia proti `127.0.0.1:8901`.

Kľúčové existujúce testy:
- `pricing-logic`
- `routing-smoke`
- `koverta-accessories`
- `krytina-strechy`
- `scene-assets`
- `pocasie-odtok`
- `technical-fidelity`

Počas prerušeného behu `pricing-logic.js` raz nechal visieť orphaned Node
proces. Codex ho identifikoval cez process list a ukončil. Ak test znovu
visí, najprv zisti, či ide o orphan test process; nezabíjaj naslepo lokálny
HTTP server.

`layout-smoke` už skôr padal na `ERR_CERT_AUTHORITY_INVALID` pri Google
Fonts cez proxy. Ak sa to zopakuje, odlíš environment failure od regresie.

---

## Čo je hotové a bezpečne uložené na GitHube

Schválené texty (rady F a SL podľa skutočnosti, nosnosť na sneh, svah,
elektrina v stĺpe, doplnky, RAL v konfigurátore, štvrtý údaj „1 až 3 autá“),
tri nové fotky majiteľa, kresby podkladu s hranatým stĺpom a pozinkovanou
pätkou, statická galéria, tmavšie sekundárne tlačidlá, písmo min. 12 px,
preč video pri lamelách a značky „Spôsob 1/2“, a 66 katalógových
rozmerových stránok (`tools/generuj-rozmery.py`).

Pozor: samotných 66 stránok je uložených, ale ich canonical a susedné odkazy
treba regenerovať po vyššie uvedenej oprave generátora.

---

## Ďalší pôvodný backlog — po dokončení vyššie uvedeného prerušeného scope

### A. Konfigurátor
1. **Fullscreen**: model je v ráme pritesný a dolná tretina plochy ostáva
   prázdna. ViewBox aj element majú rovnaký pomer strán; ide o orámovanie v
   `drawStage()` (`konfigurator/soltec-premium.js`, hľadaj `const VW = 1000`).
2. **Sklá áut**: karoséria priesvitná nie je; priehľadné sú sklá kabíny.
   Pred zmenou si vyžiadaj spresnenie majiteľa.
3. Iné piktogramy pre výber modelu.
4. Graf výberu rozmeru bez scrollovania.
5. „Chcem rozmer na mieru“ nech predvyplní rozmer do formulára.
6. Tmavý presvit v rohu prístrešku Koverta pri pohľade zvnútra.
7. Hmla na bokoch lemovania; na slabých zariadeniach tieň úplne vypnúť.

### B. Podstránka tienenia
8. „Pevné steny“ majú fotku ZIP rolety — vymeniť až po schválení.
9. „Detail lamiel v otvorenej polohe“ je v skutočnosti pevné prestrešenie.
10. Hore chýbajú fotky k vymenovaným typom; nie Koverta.
11. Vzor konfigurátora zjednotiť so zvyškom webu.

### C. Vzhľad naprieč webom
12. „Čo je v cene“ — preč tenké čiarky, iný vizuál.
13. Zjednotiť veľkosti nadpisov nad „vlastná výroba / oceľ aj hliník“.
14. Za časté otázky dať logo Koverta otočené o 90°, hýbe sa so scrollom.
15. Viac CTA na podstránkach, hlavné žlté.

### D. Realizácie a vodoznak
16. Starý Shopify export bol v predchádzajúcom lokálnom prostredí v
    `/root/.claude/uploads/...ESHOP.zip`. Audit zistil, že vodoznak nie je
    generovaný témou; logo bolo vypálené priamo do obrázkov.
17. Galéria má prevziať správanie starej témy, ale dizajn novej verzie.

### E. Otvorené otázky na majiteľa
- Karta „Prístrešky pre autá“ na domovskej nesie obe značky. Odčleniť Soltec,
  alebo nechať a zmeniť len fotku?
- Ktoré záhradné fotky sú naozaj Koverta? Niektoré boli zle pomenované.
- Je prestup na elektriku v stĺpe celý v cene, alebo iba príprava?
- Majú katalógové rozmery byť neskôr priamo napojené na Shopify produkty,
  alebo stačia SEO stránky s odkazom do konfigurátora?

---

## Poznámka k rozmerovým stránkam

`tools/generuj-rozmery.py` číta cenník z `konfigurator/cfg-pages.js`.
Po zmene ceny alebo oprave generátora ho spusti znova — prepíše všetkých
66 stránok. Do vygenerovaných stránok nepíš ručne.
