# -*- coding: utf-8 -*-
"""Adresy statického webu → adresy, kde obsah naozaj žije.

Statický web vznikol, kým koverta.sk ukazovala na GitHub Pages. Canonical,
og:url, JSON-LD, sitemap aj llms.txt preto nesú adresy ako
https://koverta.sk/kontakt/ — no koverta.sk je dnes Shopify a tam taká adresa
vracia 404. Obsah žije v obchode na adresách z tools/adresy-obchodu.json
(kategórie na starých kolekciách, ostatné na starých stránkach) a fotografie
na GitHub Pages, lebo obchod /assets/ nemá.

  python3 tools/adresy.py           prepíše HTML, sitemap.xml a llms.txt
  python3 tools/adresy.py --check   zlyhá, ak niekde ostala adresa na 404

Prepis je idempotentný: už prepísané adresy sa nemenia.
"""
import io, json, os, re, sys

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMENA = 'https://koverta.sk'
PAGES = 'https://danielvendzur-code.github.io/koverta-web'
PRESKOC = {'node_modules', '.git', 'coordination', 'qa-artifacts', 'archiv-expivi',
           'shopify-tema', 'shopify-zdroj', 'tools', 'test', 'interny-odhad-patiek'}

def _json(meno):
    return json.load(io.open(os.path.join(KOREN, 'tools', meno), encoding='utf-8'))

ADRESY = _json('adresy-obchodu.json')

def url_obchodu(cesta):
    """Cesta statického webu ('' alebo 'kontakt') → cesta v obchode alebo None."""
    z = ADRESY['stranky'].get(cesta)
    if not z:
        return None
    if z.get('url'):
        return z['url']
    return ('/collections/' if z['typ'] == 'kolekcia' else '/pages/') + z['handle']

ROZMER = re.compile(r'^(pristresky-pre-auta|zahradne-pristresky)/rozmer/(\d+)x(\d+)$')

def produkt(cesta):
    """Rozmer → (plná adresa živého produktu alebo None, handle nového produktu).

    Nový produkt, ak je podľa tools/produkty-zive.json živý; inak starý
    produkt s tým istým rozmerom, ak žije ten. Inak None — vtedy sa na
    produkt nesmie odkazovať vôbec."""
    m = ROZMER.match(cesta)
    if not m:
        return None, None
    novy = ('zahradny-pristresok-koverta-' if m.group(1) == 'zahradne-pristresky' else 'pristresok-koverta-') + m.group(2) + 'x' + m.group(3)
    zive = _json('produkty-zive.json')
    if zive['nove'].get(novy):
        return DOMENA + '/products/' + novy, novy
    stary = {r['new_handle']: r['old_handle'] for r in _json('shopify-product-redirects.json')['redirects']}.get(novy)
    if stary and zive['stare'].get(stary):
        return DOMENA + '/products/' + stary, novy
    return None, novy

ADRESA = re.compile(r'https://koverta\.sk/([^"\'\s<>)]*)')

def prepis_text(text):
    def nahrad(m):
        zvysok = m.group(1)
        cesta, sep, chvost = re.match(r'^([^?#]*)([?#]?)(.*)$', zvysok).groups()
        if cesta.startswith('assets/'):
            return PAGES + '/' + zvysok
        kluc = re.sub(r'/index\.html$', '', cesta).strip('/')
        if ROZMER.match(kluc):
            return m.group(0)          # rozmery rieši tools/generuj-rozmery.py
        ciel = url_obchodu(kluc)
        if ciel is None:
            return m.group(0)
        return DOMENA + ciel + sep + chvost
    return ADRESA.sub(nahrad, text)

def subory():
    for koren, dirs, files in os.walk(KOREN):
        dirs[:] = [d for d in dirs if d not in PRESKOC]
        for f in files:
            if f.endswith('.html'):
                yield os.path.join(koren, f)
    for f in ('sitemap.xml', 'llms.txt'):
        yield os.path.join(KOREN, f)

def zle_adresy(text):
    """Adresy na koverta.sk, ktoré v obchode nie sú (okrem kotiev #id v JSON-LD)."""
    zle = []
    for m in ADRESA.finditer(text):
        cesta = re.match(r'^([^?#]*)', m.group(1)).group(1)
        if cesta == '':
            continue
        if cesta.startswith(('collections/', 'pages/', 'products/')):
            continue
        zle.append(m.group(0))
    return zle

def main():
    check = '--check' in sys.argv
    chyby = []
    for f in subory():
        if not os.path.exists(f):
            continue
        text = io.open(f, encoding='utf-8').read()
        novy = prepis_text(text)
        rel = os.path.relpath(f, KOREN)
        if check:
            if novy != text:
                chyby.append(rel + ': obsahuje adresu statického webu (spusti python3 tools/adresy.py)')
            if '/rozmer/' not in rel:
                for z in zle_adresy(text):
                    chyby.append(rel + ': ' + z)
        elif novy != text:
            io.open(f, 'w', encoding='utf-8').write(novy)
    if chyby:
        print('\n'.join(sorted(set(chyby))[:60]))
        sys.exit(1)
    print('adresy: ' + ('všetky adresy mieria do obchodu alebo na GitHub Pages' if check else 'prepísané'))

if __name__ == '__main__':
    main()
