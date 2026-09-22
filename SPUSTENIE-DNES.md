# Spustenie novej témy na koverta.sk

Téma **koverta-web/shopify** (Online Store → Themes) sa plní z vetvy `shopify`.
Všetko, čo sa dalo pripraviť bez zásahu do dnešného webu, je hotové.

## Hotové vopred (živý web to nevidí)

- téma: produktová stránka rozmeru, dopyt v okne, šablóny 404 / kolekcia /
  vyhľadávanie / blog / článok, vyhľadávanie v hlavičke s 66 rozmermi,
  JSON-LD a og:image na každej stránke, titulok a popis úvodu
- SEO titulok a popis 13 zverejnených stránok `nove-…`
- 66 produktov rozmerov existuje ako **Koncept** s cenami, 14 farbami a metapoľami

## Poradie pri spustení

1. **Preview** témy: úvod, Prístrešky pre autá → rozmer 5 × 6 m, dopyt
   (odoslať skúšobný), konfigurátor, telefón.
2. **Produkty** (API): 66 nových → Aktívne + Online Store.
3. **Publish** témy koverta-web/shopify (v admine, API to nedovolí).
4. **Staré produkty** (API): 66 `pristresok-pre-…` / `zahradny-pristresok-…`
   → Koncept, potom 66 presmerovaní z `tools/shopify-product-redirects.json`.
5. **Staré stránky** (API): stiahnuť zo zverejnenia a presmerovať podľa
   `tools/spustenie-presmerovania.json` → `stranky`.
6. **Kolekcie** (API): stiahnuť z Online Store a presmerovať podľa
   `kolekcie`. Členstvo produktov v kolekciách ostáva.
7. Navigácia v admine sa nepoužíva — hlavička a pätička sú v téme.
8. Search Console: odoslať `https://koverta.sk/sitemap.xml` (generuje Shopify).

Kroky 2, 4, 5 a 6 vie spraviť Claude cez Shopify API na pokyn „spúšťame“.
Krok 2 musí byť tesne pred 3, kroky 4–6 hneď po ňom: kým beží stará téma
Dawn, aktívne nové produkty by sa v nej ukázali vedľa starých.

## Vrátenie

Publish starej témy **Updated Dawn 02**, produkty vrátiť cez API
(nové → Koncept, staré → Aktívne), presmerovania zmazať.
