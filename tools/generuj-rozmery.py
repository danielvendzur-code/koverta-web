# -*- coding: utf-8 -*-
"""Vygeneruje stránku pre každý katalógový rozmer.

Prečo to vôbec je: katalógová tabuľka viedla rovno do konfigurátora, teda na
jednu adresu s parametrami. Pre návštevníka to funguje, pre vyhľadávač nie —
„prístrešok pre auto 3×5,2 m cena“ nemá na čo priviesť. Každý rozmer preto
dostane vlastnú adresu s vlastným textom, cenou a štruktúrovanými dátami, a
z nej sa dá prejsť do konfigurátora aj do dopytu.

Zdrojom pravdy je cenník v konfigurátore (konfigurator/cfg-pages.js), nie
ručne prepísané čísla. Keď sa cena zmení tam, stačí spustiť tento skript.
"""
import io, json, os, re, sys

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZAKLAD = 'https://danielvendzur-code.github.io/koverta-web'

def katalog():
    src = io.open(os.path.join(KOREN, 'konfigurator/cfg-pages.js'), encoding='utf-8').read()
    pages = json.loads(re.search(r'^window\.KV_PAGES\s*=\s*(\{.*\});?\s*$', src, re.M).group(1))
    out = {}
    for kluc in ('koverta', 'zahrada'):
        data = json.loads(re.search(r'data-sp-bio-data>(.*?)</script>', pages[kluc], re.S).group(1))
        out[kluc] = list(data['models'].values())[0]
    return out

def medzery(n):
    return f'{n:,}'.replace(',', ' ')

def auta(sirka):
    """Koľko áut sa zmestí. Prahy sú tie, podľa ktorých je delená katalógová
       tabuľka na stránke — nie odhad."""
    return 1 if sirka <= 4500 else 2

def sklon(w, l):
    plocha = w * l / 1_000_000
    return round(plocha, 1)

SABLONY = {
 'koverta': dict(
    nadrad='Prístrešky pre autá', nadradUrl='pristresky-pre-auta',
    cfg='koverta', druh='Prístrešok Koverta',
    foto='koverta-pristresok-auto-golf-lamelova-stena',
    fotoAlt='Oceľový prístrešok Koverta s lamelovou bočnou stenou'),
 'zahrada': dict(
    nadrad='Záhradné prístrešky', nadradUrl='zahradne-pristresky',
    cfg='zahrada', druh='Záhradný prístrešok Koverta',
    foto='koverta-zahradny-pristresok-bratislava-hero',
    fotoAlt='Záhradný prístrešok Koverta nad terasou'),
}

def telo(kluc, w, l, cena, vsetky):
    t = SABLONY[kluc]
    plocha = sklon(w, l)
    wm, lm = w / 1000, l / 1000
    wtxt, ltxt = str(wm).replace('.', ',').rstrip(',0') or str(wm), str(lm).replace('.', ',')
    wtxt = f'{wm:g}'.replace('.', ',')
    ltxt = f'{lm:g}'.replace('.', ',')
    if kluc == 'koverta':
        n = auta(w)
        kapacita = 'jedno auto' if n == 1 else 'dve autá'
        uvod = (f'Prístrešok so šírkou {wtxt} m a hĺbkou {ltxt} m zakryje {plocha} m² '
                f'a pohodlne pod ním zaparkujete {kapacita}. Je to katalógový rozmer, takže naň '
                f'máme hotové podklady aj cenu — nemusíte čakať na individuálne nacenenie.')
        detail = (f'Hĺbka {ltxt} m stačí na bežné osobné auto aj s priestorom na otvorenie dverí '
                  f'a obchôdzku okolo. Pri šírke {wtxt} m ' +
                  ('ostáva miesto aj na bicykle alebo smetné nádoby pri stĺpe.' if n == 1 else
                   'stoja autá vedľa seba a medzi nimi ostáva miesto na otvorenie dverí.'))
    else:
        uvod = (f'Záhradný prístrešok so šírkou {wtxt} m a hĺbkou {ltxt} m zakryje '
                f'{plocha} m² terasy alebo posedenia. Stĺpy stoja na kraji, takže plocha pod '
                f'ním ostáva celá voľná.')
        detail = (f'Pri hĺbke {ltxt} m sa pod strechu zmestí stôl so stoličkami aj priechod '
                  f'okolo neho. Strecha odvádza vodu do zvodu pri stĺpe, takže popri terase '
                  f'nevzniká mláka.')
    # vnútorné prelinkovanie: susedné rozmery
    idx = vsetky.index((w, l))
    okolie = [x for x in (vsetky[idx-1] if idx > 0 else None,
                          vsetky[idx+1] if idx+1 < len(vsetky) else None) if x]
    odkazy = ''.join(
        f'<li><a href="../{a}x{b}/">{a/1000:g} × {b/1000:g} m</a></li>'.replace('.', ',')
        for a, b in okolie)
    return uvod, detail, odkazy, plocha

def skrutka(html, hlbka):
    """Prepíše relatívne cesty o `hlbka` úrovní nižšie.

    Jedným prechodom cez hodnoty atribútov, nie reťazcom replace-ov: `src="../`
    je podreťazcom `data-k-menu-src="../`, takže postupné náhrady prepísali tú
    istú cestu dvakrát a vznikli z nej päťúrovňové `../../../../../`.
    Absolútne cesty (/assets/...) a odkazy mimo webu sa nechávajú tak.
    """
    novy = '../' * hlbka
    ATR = ('href', 'src', 'srcset', 'poster', 'data-k-menu-src',
           'data-k-video', 'data-k-video-webm')

    def uprav(m):
        meno, hodnota = m.group(1), m.group(2)
        kusy = []
        for kus in hodnota.split(','):
            hlava_, _, chvost = kus.strip().partition(' ')
            if hlava_.startswith('../'):
                hlava_ = novy + hlava_[3:]
            elif hlava_.startswith('./'):
                hlava_ = novy + hlava_[2:]
            kusy.append((hlava_ + (' ' + chvost if chvost else '')))
        return f'{meno}="' + ', '.join(kusy) + '"'

    return re.sub(r'\b(' + '|'.join(ATR) + r')="([^"]*)"', uprav, html)

def strankuj():
    kat = katalog()
    zdroj = io.open(os.path.join(KOREN, 'pristresky-pre-auta/index.html'), encoding='utf-8').read()
    a = zdroj.find('<main'); b = zdroj.find('</main>') + len('</main>')
    hlava, pata = zdroj[:a], zdroj[b:]
    # hlava obsahuje SEO pre rodičovskú stránku — tie bloky nahradíme
    hlava = re.sub(r'<!-- KOVERTA-SEO -->.*?<!-- /KOVERTA-SEO -->', '<!--SEO-->', hlava, flags=re.S)
    hlava = re.sub(r'<title>.*?</title>', '<!--TITLE-->', hlava, flags=re.S)
    hlava = re.sub(r'<meta name="description"[^>]*>', '<!--DESC-->', hlava)
    pocet = 0
    for kluc, mo in kat.items():
        t = SABLONY[kluc]
        vsetky = [(w, l) for l in mo['lengths'] for w in mo['widths']]
        vsetky.sort()
        for li, l in enumerate(mo['lengths']):
            for wi, w in enumerate(mo['widths']):
                cena = mo['prices'][li][wi]
                uvod, detail, odkazy, plocha = telo(kluc, w, l, cena, vsetky)
                slug = f'{w}x{l}'
                rel = f'{t["nadradUrl"]}/rozmer/{slug}/'
                wtxt, ltxt = f'{w/1000:g}'.replace('.', ','), f'{l/1000:g}'.replace('.', ',')
                nazov = f'{t["druh"]} {wtxt} × {ltxt} m'
                popis = (f'{nazov} — cena {medzery(cena)} € s DPH, dopravou aj montážou. '
                         f'Zakrytá plocha {plocha} m². Katalógový rozmer, hotové podklady aj cena.')
                seo = f'''<title>{nazov} · cena {medzery(cena)} € | Koverta</title>
<meta name="description" content="{popis}">
<link rel="canonical" href="{ZAKLAD}/{rel}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="product">
<meta property="og:title" content="{nazov}">
<meta property="og:description" content="{popis}">
<meta property="og:url" content="{ZAKLAD}/{rel}">
<script type="application/ld+json">{json.dumps({
  "@context":"https://schema.org","@type":"Product","name":nazov,
  "description":popis,"brand":{"@type":"Brand","name":"Koverta"},
  "category":t['nadrad'],
  "width":{"@type":"QuantitativeValue","value":w,"unitCode":"MMT"},
  "depth":{"@type":"QuantitativeValue","value":l,"unitCode":"MMT"},
  "offers":{"@type":"Offer","price":cena,"priceCurrency":"EUR",
            "availability":"https://schema.org/InStock",
            "url":f"{ZAKLAD}/{rel}",
            "priceSpecification":{"@type":"PriceSpecification","price":cena,
              "priceCurrency":"EUR","valueAddedTaxIncluded":True}}
}, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps({
  "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
   {"@type":"ListItem","position":1,"name":"Domov","item":ZAKLAD+"/"},
   {"@type":"ListItem","position":2,"name":t['nadrad'],"item":f"{ZAKLAD}/{t['nadradUrl']}/"},
   {"@type":"ListItem","position":3,"name":nazov}]
}, ensure_ascii=False)}</script>'''
                h = hlava.replace('<!--TITLE-->', '').replace('<!--DESC-->', '').replace('<!--SEO-->', seo)
                h = skrutka(h, 3)
                p = skrutka(pata, 3)
                cfg = f'../../../konfigurator/?page={t["cfg"]}&w={w}&l={l}'
                main = f'''<main class="k" id="obsah" data-k-root>
<section class="k-band">
  <div class="k-wrap">
    <nav class="k-eyebrow" aria-label="Omrvinky">
      <a href="../../../">Domov</a> · <a href="../../">{t['nadrad']}</a> · {nazov}
    </nav>
    <h1 class="k-display" style="margin:.4em 0 .3em">{nazov}</h1>
    <p class="k-lead" style="max-width:60ch">{uvod}</p>

    <ul class="kh-fakty__rad" style="margin:2.4rem 0">
      <li class="kh-fakty__polozka"><span class="kh-fakty__cislo">{medzery(cena)} €</span>
        <span class="kh-fakty__co">Cena s DPH</span>
        <span class="kh-fakty__pod">Doprava aj montáž v cene.</span></li>
      <li class="kh-fakty__polozka"><span class="kh-fakty__cislo">{str(plocha).replace('.', ',')} m²</span>
        <span class="kh-fakty__co">Zakrytá plocha</span>
        <span class="kh-fakty__pod">{wtxt} m šírka × {ltxt} m hĺbka.</span></li>
      <li class="kh-fakty__polozka"><span class="kh-fakty__cislo">0 €</span>
        <span class="kh-fakty__co">Zameranie a ponuka</span>
        <span class="kh-fakty__pod">Nezáväzne, aj keď si vyberiete inak.</span></li>
      <li class="kh-fakty__polozka"><span class="kh-fakty__cislo">1 deň</span>
        <span class="kh-fakty__co">Montáž</span>
        <span class="kh-fakty__pod">Štandardný prístrešok stojí za deň.</span></li>
    </ul>

    <figure style="margin:0 0 2rem">
      <img src="../../../assets/{t['foto']}.jpg" width="1600" height="1200"
        alt="{t['fotoAlt']}" loading="lazy" decoding="async"
        srcset="../../../assets/{t['foto']}-w640.webp 640w, ../../../assets/{t['foto']}-w1000.webp 1000w, ../../../assets/{t['foto']}-w1600.webp 1600w"
        sizes="(max-width: 900px) 100vw, 900px" style="width:100%;height:auto;border-radius:4px">
    </figure>

    <p class="k-copy" style="max-width:62ch">{detail}</p>

    <div class="kh-hero__actions" style="margin:2rem 0">
      <a class="k-btn k-btn--primary" href="{cfg}">Pozrieť v 3D konfigurátore</a>
      <a class="k-btn k-btn--line" href="../../#ponuka">Nezáväzná cenová ponuka</a>
    </div>

    <h2 class="k-h3">Blízke rozmery</h2>
    <ul class="kh-kfg__zoznam">{odkazy}<li><a href="../../">Celý katalóg rozmerov</a></li></ul>
  </div>
</section>
</main>'''
                cesta = os.path.join(KOREN, rel)
                os.makedirs(cesta, exist_ok=True)
                io.open(os.path.join(cesta, 'index.html'), 'w', encoding='utf-8').write(h + main + p)
                pocet += 1
    return pocet

if __name__ == '__main__':
    print('vygenerovaných stránok:', strankuj())
