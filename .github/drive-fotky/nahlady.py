# -*- coding: utf-8 -*-
"""Stiahne fotky realizácií z Google Drive majiteľa (zdieľané odkazom, len čítanie)
   a spraví z každého priečinka očíslovaný náhľad na výber. Nič iné nerobí."""
import json, os, io, urllib.request, concurrent.futures
from PIL import Image, ImageOps, ImageDraw, ImageFont

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
zoznam = json.load(open('.github/drive-fotky/zoznam.json'))
os.makedirs('.github/drive-nahlady', exist_ok=True)
try:
    pismo = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except Exception:
    pismo = ImageFont.load_default()

def stiahni(fid):
    url = f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'
    for pokus in range(3):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=180).read()
            im = Image.open(io.BytesIO(data))
            im = ImageOps.exif_transpose(im).convert('RGB')
            return fid, im, len(data)
        except Exception as e:
            chyba = e
    return fid, None, str(chyba)

for slug, ids in zoznam.items():
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        vysl = list(ex.map(stiahni, ids))
    nahlady, info = [], []
    for i, (fid, im, velkost) in enumerate(vysl, 1):
        if im is None:
            info.append({'i': i, 'id': fid, 'chyba': velkost}); continue
        w, h = im.size
        t = im.copy(); t.thumbnail((420, 420))
        plocha = Image.new('RGB', (420, 420), (245, 245, 245))
        plocha.paste(t, ((420 - t.width) // 2, (420 - t.height) // 2))
        d = ImageDraw.Draw(plocha)
        d.rectangle([0, 0, 64, 46], fill=(255, 204, 0)); d.text((8, 4), str(i), fill=(0, 0, 0), font=pismo)
        nahlady.append(plocha)
        info.append({'i': i, 'id': fid, 'w': w, 'h': h, 'bajtov': velkost})
    stlpce = 5
    riadky = (len(nahlady) + stlpce - 1) // stlpce
    harok = Image.new('RGB', (stlpce * 424, max(1, riadky) * 424), (255, 255, 255))
    for k, n in enumerate(nahlady):
        harok.paste(n, ((k % stlpce) * 424, (k // stlpce) * 424))
    harok.save(f'.github/drive-nahlady/{slug}.jpg', quality=78)
    json.dump(info, open(f'.github/drive-nahlady/{slug}.json', 'w'), indent=1)
    print(slug, len(nahlady), 'fotiek,', sum(1 for x in info if 'chyba' in x), 'chýb')
