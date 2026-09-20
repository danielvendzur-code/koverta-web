# Ako nahrať tému na Shopify

Obchod: `maleprojekty-sk.myshopify.com` (koverta.sk), plán Basic.
Aktívna téma: **Updated Dawn 02** (Dawn 15.3.0, Online Store 2.0).

Nové stránky idú **vedľa starých**, nie namiesto nich. Všetky majú predponu
`nove-`, takže existujúcich osemnásť stránok ostáva nedotknutých a dá sa
porovnávať. Až sa bude prepínať, téma sa vygeneruje znova bez predpony:

    KV_PREDPONA= node tools/shopify-tema.js

## Poradie krokov

### 1 · Súbory do obchodu

`SUBORY-DO-OBCHODU.txt` má 1118 riadkov: prvý stĺpec je meno, pod ktorým má
súbor v obchode ležať, druhý je cesta v repozitári. Sú to fotografie, videá
a šesť modelov vybavenia pre konfigurátor.

Idú do **Nastavenia → Súbory**, nie medzi assety témy. Assety témy sú ploché
a majú strop, ktorý 218 MB fotografií prekročí; Súbory obchodu na to sú.

Mená musia sedieť presne. `assets/foto/img_4419.webp` sa v obchode volá
`foto-img_4419.webp` — podpriečinok sa premietol do mena, aby sa dve rôzne
fotografie s rovnakým menom neprebili.

### 2 · Téma

Priečinky `layout`, `sections`, `templates`, `assets`, `config` a `locales`
sú hotová téma. Nahráva sa ako **nová téma**, nie cez existujúcu:

Online Store → Themes → Add theme → Upload zip file.

Téma sa nahrá ako **draft**. Nepublikuj ju hneď.

### 3 · Stránky

`STRANKY-NA-ZALOZENIE.txt` má 83 riadkov. Pre každú treba v
**Online Store → Pages** založiť stránku s presne tým handle, ktorý je
v prvom stĺpci. Bez zhody handle si stránka svoju šablónu nenájde a zobrazí
sa prázdna.

Pri zakladaní stránky sa v pravom stĺpci vyberá **Theme template** — musí to
byť šablóna s rovnakým menom (`nove-kontakt` → template `nove-kontakt`).

Obsah stránky nechaj prázdny. Celý obsah je v šablóne.

### 4 · Formulár

Dopyty vybavuje **Formful**, formulár `form_LaKRq0tyt4`. Naše tlačidlo
„Otvoriť formulár dopytu" volá `Formful.openDialog('form_LaKRq0tyt4')`.

Aby to fungovalo, musí byť na stránke umiestnený **blok aplikácie Formful**.
V editore témy (Customize) pridaj App block Formful na tú stránku, kde má
dialóg fungovať. Bez neho sa skript Formfulu na stránku nedostane a tlačidlo
neurobí nič.

Nastavené to už máte: prílohy do 10 MB, captcha, e-mail na
`obchod@koverta.sk` s predmetom „Nový dopyt".

**Na vedomie:** Formful maže odoslané dopyty aj s prílohami po 180 dňoch.
Fotografie od zákazníkov treba priebežne sťahovať, inak zmiznú.

### 5 · Náhľad a až potom publikovanie

Draft téma sa dá pozrieť cez **Preview**. Prejdi si:

- úvod, konfigurátor, realizácie (200 fotografií), kontakt
- otvorenie dialógu dopytu
- konfigurátor: musia sa načítať autá aj posedenie — ak sa nenačítajú,
  chýbajú modely v Súboroch obchodu alebo majú iné meno
- telefón: hlavička musí sadnúť do okna, pätička nesmie byť pod lištou

Publikuj až keď to sedí.

## Čo téma neobsahuje

Produkty, košík a pokladňu. Tie ostávajú v aktívnej téme Dawn. Táto téma je
katalóg s konfigurátorom a dopytom; ak sa majú predávať aj produkty, šablóny
Dawn sa do nej doplnia.
