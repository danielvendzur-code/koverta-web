#!/usr/bin/env python3
"""Pridanie nových fotiek do galérie realizácií s vodoznakom Koverta.

Fotky sa nahrajú do priečinka pridat-fotky/<kategória>/ (napr. cez GitHub
„Add file → Upload files“). Tento skript každú z nich:

  1. otočí podľa EXIF a zmenší (najviac 1200 px na dlhšej strane),
  2. vloží vodoznak Koverta — ten istý, aký mali fotky na starom webe
     (biele logo, 40 % šírky fotky, vpravo dole),
  3. uloží ju do assets/realizacie/ ako .jpg a menšiu .webp pre mobil,
  4. pridá ju na začiatok svojej kategórie v realizacie/index.html,
  5. zdrojovú fotku z pridat-fotky/ zmaže.

Popis pod fotkou sa vezme zo súboru popis.txt v tom istom priečinku
(jeden riadok pre všetky fotky v priečinku), inak z mena súboru
(„Rybník 6,2 x 5,2 m.jpg“ → „Rybník 6,2 x 5,2 m“).

Spúšťa ho workflow .github/workflows/pridat-fotky.yml po nahraní fotiek
do master; dá sa spustiť aj ručne:  python3 tools/pridaj-realizacie.py
"""
import os
import re
import sys
import unicodedata

from PIL import Image, ImageOps

try:  # fotky z iPhonu (.heic)
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VSTUP = os.path.join(KOREN, 'pridat-fotky')
CIEL = os.path.join(KOREN, 'assets', 'realizacie')
STRANKA = os.path.join(KOREN, 'realizacie', 'index.html')
VODOZNAK = os.path.join(KOREN, 'assets', 'vodoznak', 'koverta-vodoznak.png')

# priečinok -> (data-k-type, data-k-brand, predvolený popis, alt)
KATEGORIE = {
    'autopristresky-koverta': ('auta', 'koverta', 'Prístrešok pre auto Koverta', 'Prístrešok pre auto Koverta'),
    'carporty-soltec': ('auta', 'soltec', 'Hliníkový prístrešok Soltec', 'Hliníkový prístrešok pre auto Soltec'),
    'bioklimaticke-pergoly': ('pergoly', 'soltec', 'Bioklimatická pergola Soltec', 'Bioklimatická pergola Soltec'),
    'pevne-prestresenia': ('prestresenia', 'soltec', 'Pevné prestrešenie Soltec', 'Pevné prestrešenie Soltec'),
    'zahradne-pristresky-koverta': ('zahrada', 'koverta', 'Záhradný prístrešok Koverta', 'Záhradný prístrešok Koverta'),
    'tienenie': ('tienenie', 'soltec', 'Tienenie Soltec', 'Tienenie Soltec'),
    'kuchyne': ('kuchyne', 'soltec', 'Vonkajšia kuchyňa Soltec', 'Vonkajšia kuchyňa Soltec'),
}
NADPIS = {'auta': 'Prístrešky pre autá', 'pergoly': 'Bioklimatické pergoly', 'prestresenia': 'Pevné prestrešenia',
          'zahrada': 'Záhradné prístrešky', 'tienenie': 'Tienenie', 'kuchyne': 'Vonkajšie kuchyne'}
PORADIE = [('auta', 'koverta'), ('auta', 'soltec'), ('pergoly', 'soltec'), ('prestresenia', 'soltec'),
           ('zahrada', 'koverta'), ('tienenie', 'soltec'), ('kuchyne', 'soltec')]
PRIPONY = ('.jpg', '.jpeg', '.png', '.webp', '.heic')


def slug(text):
    t = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:40] or 'foto'


def s_vodoznakom(im):
    """Vodoznak ako na starom webe: 40 % šírky, 6,5 % od pravého okraja,
    10 % výšky od spodku."""
    znak = Image.open(VODOZNAK).convert('RGBA')
    w, h = im.size
    sirka = round(w * 0.40)
    znak = znak.resize((sirka, round(znak.height * sirka / znak.width)), Image.LANCZOS)
    x = w - round(w * 0.065) - znak.width
    y = h - round(h * 0.10) - znak.height
    vysledok = im.convert('RGBA')
    vysledok.alpha_composite(znak, (x, y))
    return vysledok.convert('RGB')


def html_fotky(typ, znacka, cesta, sirka, vyska, popis, alt):
    return (f'<figure class="kh-work__item k-rise k-reveal" data-k-type="{typ}" data-k-brand="{znacka}" data-k-delay="1">\n'
            f'        <span class="kh-work__media"><img src="../{cesta}.jpg" alt="{alt}" loading="lazy" decoding="async" '
            f'width="{sirka}" height="{vyska}" srcset="../{cesta}-w640.webp 640w, ../{cesta}.jpg {sirka}w" '
            f'sizes="(max-width: 900px) 86vw, 30vw"></span>\n'
            f'        <figcaption class="kh-work__cap"><strong>{NADPIS[typ]}</strong><span>{popis}</span></figcaption>\n'
            f'      </figure>')


def main():
    if not os.path.isdir(VSTUP):
        print('Priečinok pridat-fotky/ neexistuje, nie je čo pridať.')
        return 0
    nove = []  # (typ, znacka, html, zdroj)
    for priecinok, (typ, znacka, predvoleny, alt_zaklad) in KATEGORIE.items():
        cesta = os.path.join(VSTUP, priecinok)
        if not os.path.isdir(cesta):
            continue
        popis_subor = os.path.join(cesta, 'popis.txt')
        spolocny = open(popis_subor, encoding='utf-8').read().strip() if os.path.exists(popis_subor) else ''
        for meno in sorted(os.listdir(cesta)):
            if meno.startswith('.') or not meno.lower().endswith(PRIPONY):
                continue
            zdroj = os.path.join(cesta, meno)
            im = ImageOps.exif_transpose(Image.open(zdroj)).convert('RGB')
            im.thumbnail((1200, 1200), Image.LANCZOS)
            im = s_vodoznakom(im)
            zaklad = os.path.splitext(meno)[0]
            popis = spolocny or re.sub(r'[_]+', ' ', zaklad).strip() or predvoleny
            if re.fullmatch(r'(img|dsc|pxl|photo|image|whatsapp|viber)?[\s_\-\d]*', zaklad.lower()):
                popis = spolocny or predvoleny
            nazov = f'realizacie/{typ}-{znacka}-{slug(zaklad)}'
            i = 1
            while os.path.exists(os.path.join(KOREN, 'assets', nazov + '.jpg')):
                i += 1
                nazov = f'realizacie/{typ}-{znacka}-{slug(zaklad)}-{i}'
            os.makedirs(CIEL, exist_ok=True)
            im.save(os.path.join(KOREN, 'assets', nazov + '.jpg'), quality=78, optimize=True, progressive=True)
            w, h = im.size
            im.resize((640, round(h * 640 / w)), Image.LANCZOS).save(
                os.path.join(KOREN, 'assets', nazov + '-w640.webp'), 'WEBP', quality=72)
            alt = f'{alt_zaklad} — {popis}' if popis != predvoleny else alt_zaklad
            nove.append((typ, znacka, html_fotky(typ, znacka, 'assets/' + nazov, w, h, popis, alt), zdroj))
            print('pridaná:', meno, '->', nazov + '.jpg', '|', popis)
    if not nove:
        print('Žiadne nové fotky.')
        return 0

    t = open(STRANKA, encoding='utf-8').read()
    zac = t.index('<div class="kh-work__grid" id="realGrid">')
    kon = t.index('</section>', zac)
    grid = t[zac:kon]
    figury = re.findall(r'<figure class="kh-work__item[^"]*"[^>]*>[\s\S]*?</figure>', grid)
    kluc = lambda f: (re.search(r'data-k-type="([^"]*)"', f).group(1), re.search(r'data-k-brand="([^"]*)"', f).group(1))
    # nové fotky idú na začiatok svojej kategórie, poradie kategórií ostáva
    vsetky = [(PORADIE.index((n[0], n[1])), 0, n[2]) for n in nove] + \
             [(PORADIE.index(kluc(f)) if kluc(f) in PORADIE else len(PORADIE), 1, f) for f in figury]
    vsetky.sort(key=lambda x: (x[0], x[1]))
    html = [re.sub(r'data-k-delay="\d+"', f'data-k-delay="{n % 6 + 1}"', f) for n, (_, _, f) in enumerate(vsetky)]
    koniec = grid[grid.rindex('</figure>') + len('</figure>'):]
    t = t[:zac] + '<div class="kh-work__grid" id="realGrid">\n      ' + '\n'.join(html) + koniec + t[kon:]
    t = re.sub(r'\d+ fotografií z montáží', f'{len(vsetky)} fotografií z montáží', t)
    open(STRANKA, 'w', encoding='utf-8').write(t)

    for *_, zdroj in nove:
        os.remove(zdroj)
    # Popis platil pre túto dávku; pri ďalšej by sa inak použil znova.
    for priecinok in {os.path.dirname(z) for *_, z in nove}:
        popis_subor = os.path.join(priecinok, 'popis.txt')
        if os.path.exists(popis_subor):
            os.remove(popis_subor)
    print(f'Hotovo: {len(nove)} nových fotiek, spolu {len(vsetky)}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
