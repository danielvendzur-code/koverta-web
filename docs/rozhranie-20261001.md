# Plynulosť rozhrania — 1. október 2026

Oprava nadväzuje na výkonnostnú vetvu `fix/vykon-pred-po-20261001` (56d22ab).

- Spodný mobilný kontakt nemá trvalý transform ani paint containment. Výška
  zostáva rezervovaná aj pri menu a klávesnici; pruženie na konci stránky je
  vypnuté. Detekcia klávesnice vyžaduje aktívny vstup a nevypína dock pri zoome.
- Vstupy formulára sa zarovnávajú podľa spodku spoločného riadku. Zalomené
  „nepovinné“ neposúva samostatne pole miesta realizácie.
- FAQ animuje celú kartu vrátane paddingu. Pri prerušení nadviaže na aktuálnu
  výšku, nemení šírku otázky a nevynucuje scrollovanie v každom snímku.
- Výpadok prednačítania chatbotu nemá neobslúženú Promise; klik môže skúsiť
  načítanie znova. Príjemca dopytov sa nemení.
- Štandardná kompresia Terser bez unsafe transformácií zachováva názvy funkcií,
  globálne API a vlastnosti objektov. JS: 112 312 → 93 129 B (−17,1 %);
  gzip približne 34,7 → 29,3 kB. GTM, Ads a súhlas zostávajú.

## Overenie

`CHROME_PATH=… node tools/rozhranie-kontrola.cjs` prešlo na všetkých šiestich
hlavných stránkach pri šírkach 360, 390, 430 a 1366 px (24 kombinácií).
Meria ustálenú polohu docku pri spodku stránky, dostatok priestoru pod ním,
vodorovný presah, zarovnanie e-mailu a obce, posledný snímok zatvárania FAQ
a tri rýchle kliknutia počas prechodu. Formuláre neodosiela.

Pôvodný rozdiel vstupov na 360/390 px bol 15,59 px; po oprave 0 px.
V overených kombináciách nevznikli chyby JavaScriptu.
Ide o Chromium s mobilným viewportom, nie skúšku na fyzickom iPhone/Safari.

Prešli kontroly CTA, SEO, rozmerov obrázkov, spoločnej hlavičky/pätičky,
Shopify témy, synchronizácie zdrojov a verzií assetov.

Lokálny Lighthouse neposkytol platné skóre (headless shell nezaznamenal
snímky; plný Chrome blokuje prostredie pri vytvorení socketu). Výsledok
sa nepoužíva ako úspešné meranie. Workflow `Výkon webu pred a po` meria
tri behy pred/po na GitHub runneri a samostatne živý obchod.
Nová vetva používa ako základ 56d22ab, takže porovnáva práve tieto opravy.

Zmeny sú pripravené na kontrolu; živý Shopify obchod zatiaľ používa master.
