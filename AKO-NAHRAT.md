# Ako nahrať tému na Shopify

Obchod: `maleprojekty-sk.myshopify.com` (koverta.sk), plán Basic.
Aktívna téma: **Updated Dawn 02** (Dawn 15.3.0, Online Store 2.0).

Nové stránky idú **vedľa starých**, nie namiesto nich. Všetky majú predponu
`nove-`, takže existujúcich osemnásť stránok ostáva nedotknutých a dá sa
porovnávať. Až sa bude prepínať, téma sa vygeneruje znova bez predpony:

    KV_PREDPONA= node tools/shopify-tema.js

## Poradie krokov

### 1 · Fotografie — netreba robiť nič

Predvolene ich servíruje GitHub Pages z tohto repozitára. V téme sú na ne
plné adresy, takže nahrávať netreba ani jeden súbor a nová fotografia je na
webe hneď, ako pribudne do repozitára.

Na dlhší čas patria do Súborov obchodu: GitHub si neželá, aby sa Pages
používali ako úložisko obrázkov pre cudzí web, a obchod má vlastnú CDN.
Prepnutie je jeden príkaz a nová téma:

    KV_FOTKY=obchod node tools/shopify-tema.js

Vtedy platí `SUBORY-DO-OBCHODU.txt` — 1118 riadkov, prvý stĺpec je meno, pod
ktorým má súbor v obchode ležať. Idú do **Nastavenia → Súbory**.

### 2 · Téma — priamo z GitHubu

Vetva **`shopify`** nesie tému v koreni. Shopify ju vie vziať odtiaľ:

Online Store → Themes → Add theme → **Connect from GitHub** → repozitár
`danielvendzur-code/koverta-web`, vetva `shopify`.

Téma sa pripojí ako **draft**. Nepublikuj ju hneď.

Vetvu udržiava beh `shopify.yml` pri každom posune do `master`, takže každá
ďalšia oprava sa do témy dostane sama. Nič sa nezipuje a nenahráva.

Kto by chcel radšej ZIP: stiahni vetvu `shopify` ako ZIP a daj
Add theme → Upload zip file. Vtedy sa ale každá ďalšia oprava musí nahrať
znova ručne.

### 3 · Stránky

`STRANKY-NA-ZALOZENIE.txt` má 83 riadkov. Pre každú treba v
**Online Store → Pages** založiť stránku s presne tým handle, ktorý je
v prvom stĺpci. Na handle záleží — podľa neho si stránka nájde svoj obsah.

**Theme template netreba nastavovať.** Nechaj `Default page`. Shopify aj tak
v tom zozname ponúka len šablóny publikovanej témy, takže kým je naša téma
draft, `nove-…` tam ani nie sú. `templates/page.liquid` si obsah nájde sám
podľa handle stránky. Šablóny `page.<handle>` v téme ostávajú pre prípad, že
by sa niektorej stránke priradili ručne — vykreslia to isté.

Obsah stránky nechaj prázdny. Celý obsah je v téme.

**Vyplň ale Search engine listing.** Pod editorom stránky je odkaz „Edit
website SEO"; `Page title` a `Meta description` sú v zozname štvrtý a piaty
stĺpec. Shopify si značky pre vyhľadávače skladá z tých políčok a po založení
stránky sú prázdne — bez nich by Google videl iný titulok a žiadny popis, než
aký web má. Vlastný `<title>` a `<meta name="description">` do témy nedávame,
lebo by v hlavičke stáli dvakrát a druhý by Google ignoroval.

### 4 · Formulár

Dopyty vybavuje vlastný Koverta popup a serverový projekt `koverta-formular`.
Formful ani Shopify Forms sa nepoužívajú. Dopyt aj prílohy idú cez Resend na
`obchod@koverta.sk`; zákazník dostane krátke automatické potvrdenie.

Vo Verceli musia byť nastavené `RESEND_API_KEY`, `RESEND_FROM`, `DOPYT_TO`
a `POSLAT_POTVRDENIE`. Resend API kľúč nikdy nevkladaj do Liquid, JavaScriptu
ani Shopify nastavení.

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
