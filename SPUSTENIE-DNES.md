# Spustenie novej témy na koverta.sk

Téma **koverta-web/shopify** (Online Store → Themes) sa plní z vetvy `shopify`.
Všetko, čo sa dalo pripraviť bez zásahu do dnešného webu, je hotové.

## Adresy (rozhodnutie majiteľa 22. 9. 2026)

Nový obsah ide na **staré, indexované adresy** (`tools/adresy-obchodu.json`):

| obsah | adresa v obchode |
|---|---|
| Prístrešky pre autá | `/collections/pristresky-pre-auta` (1 642 návštev / 90 dní) |
| Bioklimatické pergoly | `/collections/bioklimaticke-pergoly` (891) |
| Carport Soltec | `/collections/pristresky-pre-auta-agava` (411) |
| Pevné prestrešenia | `/collections/pergoly-s-pevnou-strechou-multiport` |
| Záhradné prístrešky, tienenie, kuchyne | `/collections/zahradne-pristresky`, `/tienenie`, `/outdoor-kuchyne` |
| Kontakt, podmienky, súkromie, reklamácie | `/pages/kontakt`, `/pages/vseobecne-obchodne-podmienky`, `/pages/zasady-ochrany-osobnych-udajov`, `/pages/reklamacny-poriadok` |
| Realizácie | `/pages/galeria-pristresky-pre-auta` |
| Konfigurátor, produkty, 3D modely | `/pages/konfigurator`, `/pages/produkty`, `/pages/pouzite-modely` (založené 23. 9.) |

Téma obsah priradí podľa handle, šablóny v obchode sa nemenia. Kolekcie
sa nepresmerovávajú — obsah dostanú priamo, adresa v Google aj v Ads ostáva.

## Hotové vopred (živý web to nevidí)

- téma: produktová stránka rozmeru s čistým renderom celého prístrešku,
  dopyt v okne, šablóny 404 / kolekcia / vyhľadávanie / blog / článok,
  Consentik (lišta súhlasu + Consent Mode) ako v živej téme, GTM-5KVNNWW5
- 66 produktov rozmerov existuje ako **Koncept** s cenami, 14 farbami,
  metapoľami a renderom (obrázok s alt „… vizualizácia“)
- odkazy z cenových tabuliek na produkty sa **prepínajú samy**: kým nový
  produkt nie je zverejnený, vedú na starý produkt s tým istým rozmerom

## ZÁVÄZNÉ poradie pri spustení

Staré produktové adresy (`/products/pristresok-pre-1-auto-2-5-x-5-2m` …) sú
živé a sú cieľom kampaní Google Ads aj feedu Merchant Center. Poradie sa
nesmie meniť — inak reklamy skončia na 404 alebo vzniknú duplicitné produkty.

1. **Preview** témy: úvod, `/collections/pristresky-pre-auta` → rozmer,
   dopyt (skúšobný), konfigurátor, telefón, mobil.
2. **Produkty** (API): 66 nových → Aktívne a zverejniť v **tých istých
   predajných kanáloch ako staré**: Online Store, **Google & YouTube**
   (feed Merchant Center), Facebook & Instagram, Pinterest.
   `node tools/produkty-zive.js` → musí hlásiť 66/66 nových živých.
3. **Publish** témy koverta-web/shopify (v admine, API to nedovolí).
4. **Staré produkty** → Koncept, hneď potom 66 presmerovaní 301:
   `node tools/shopify-redirects.js --apply`. Nástroj **odmietne bežať**, ak
   niektorý z nových produktov nie je ACTIVE a zverejnený v Online Store.
5. **Staré a `nove-…` stránky**: skryť a presmerovať podľa
   `tools/adresy-obchodu.json` → `presmerovania` (Shopify presmeruje len
   adresu, ktorá neexistuje).
6. **Až potom Google Ads a Merchant Center**: cieľové URL kampaní prepnúť
   na nové `/products/pristresok-koverta-…` (dovtedy fungujú cez 301),
   feed nechať preskenovať. Nikdy nie skôr než kroky 2 a 4.
7. `node tools/produkty-zive.js && python3 tools/generuj-rozmery.py &&
   python3 tools/adresy.py` → commit (canonical rozmerov sa prepne na nové
   produkty; robí to aj plánovaný workflow).
8. Search Console: odoslať `https://koverta.sk/sitemap.xml` (generuje Shopify
   a obsahuje kolekcie, stránky aj aktívne produkty).

Kroky 2, 4 a 5 vie spraviť Claude cez Shopify API na pokyn „spúšťame“.

## Čo overí smoke test po spustení

`curl -I` na: `/`, `/collections/pristresky-pre-auta`, `/pages/kontakt`,
`/pages/galeria-pristresky-pre-auta`, `/pages/konfigurator`,
`/products/pristresok-koverta-5000x6000` (200), starý produkt (301 → nový),
`/pages/nove-kontakt` (301), og:image z hlavičky (200), `robots.txt`,
`sitemap.xml`.

## Vrátenie

Publish starej témy **Updated Dawn 02**, produkty vrátiť cez API
(nové → Koncept, staré → Aktívne), presmerovania zmazať.
