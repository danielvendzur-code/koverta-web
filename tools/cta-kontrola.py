# -*- coding: utf-8 -*-
"""Strážca textov tlačidiel a dĺžky meta popisov.

Tá istá akcia mala na webe päť textov („Nezáväzná ponuka", „Prejsť na
nezáväznú ponuku"…). Dopyt má jeden text, konfigurátor jeden; ostatné
tlačidlá sú na zozname len preto, že ich kontext iný text naozaj vyžaduje.
Nový text tlačidla sa pridáva sem, vedome, nie mimochodom.

  python3 tools/cta-kontrola.py
"""
import io, os, re, subprocess, sys

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DOPYT = 'Nezáväzná cenová ponuka'
KONFIGURATOR = 'Otvoriť konfigurátor'
POVOLENE = {
    'Technické požiadavky na podklad (PDF)',
    DOPYT, KONFIGURATOR,
    'Konfigurovať',                    # produkt: konfigurátor s týmto rozmerom
    'Kúpiť v e-shope',                 # rozmer: živý produkt v obchode
    'Otvoriť e-mail s dopytom',        # poďakovanie: záložná e-mailová cesta
    '+421 948 482 266',
    'Požiadať o rozmer na mieru',      # katalóg: rozmer mimo tabuľky
    'Poslať rozmery a fotografiu', 'Poslať rozmer terasy',
    'Zobraziť riešenie', 'Pozrieť mapu realizácií', 'Celá galéria realizácií',
    'Navrhnúť zostavu', 'Ďalšie realizácie', 'Všetky realizácie na mape',
    'Prístrešky Koverta', 'Pridať do košíka', 'Do košíka', 'Odoslať', 'Odoslať dopyt', 'Získať cenovú ponuku', 'Hľadať',        # vyhľadávanie
    'Všetko o',                       # kolekcia: text pokračuje podľa radu
    'Pozrieť galériu',                # kuchyne: druhé tlačidlo v úvode, skok na galériu
}
MAX_POPIS = 160

def subory():
    out = subprocess.check_output(['git', 'ls-files', '*.html', 'shopify-zdroj/*.liquid'], cwd=KOREN).decode().split()
    return [f for f in out if 'test/' not in f and 'interny-odhad' not in f]

def main():
    chyby = []
    for f in subory():
        t = io.open(os.path.join(KOREN, f), encoding='utf-8').read()
        for m in re.finditer(r'<(?:a|button) class="k-btn[^"]*"[^>]*>\s*([^<{]{2,60})', t):
            text = m.group(1).strip()
            if text and text not in POVOLENE:
                chyby.append(f'{f}: nepovolený text tlačidla „{text}“')
        for m in re.finditer(r'<meta name="description" content="([^"]*)"', t):
            if len(m.group(1)) > MAX_POPIS:
                chyby.append(f'{f}: meta description má {len(m.group(1))} znakov (max {MAX_POPIS})')
    # Meranie: agentúra má v GTM nastavené presne tieto názvy udalostí
    # a parameter. Premenovanie by potichu vypol meranie dopytov v Google Ads.
    js = io.open(os.path.join(KOREN, 'assets', 'koverta-2026.js'), encoding='utf-8').read()
    for povinne in ["kvMeraj('dopyt_odoslany', { dopyt_typ:", "kvMeraj('telefon_klik')"]:
        if povinne not in js:
            chyby.append('assets/koverta-2026.js: chýba meranie ' + povinne + ' (názvy používa agentúra v GTM, nemeniť)')
    if chyby:
        print('\n'.join(sorted(set(chyby))))
        sys.exit(1)
    print('CTA texty aj dĺžky popisov sú v poriadku')

if __name__ == '__main__':
    main()
