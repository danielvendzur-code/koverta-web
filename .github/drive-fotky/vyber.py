# -*- coding: utf-8 -*-
"""Vybrané fotky z Drive → assets/foto/<meno>.jpg (1000 px, 4:3) + -w640.webp a -w1000.webp.
   Výrez: 'orez' = [x0, y0, x1, y1] ako podiel šírky/výšky (nepovinné), inak stred 4:3."""
import json, io, os, urllib.request
from PIL import Image, ImageOps, ImageFilter

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
vyber = json.load(open('.github/drive-fotky/vyber.json'))
os.makedirs('assets/foto', exist_ok=True)

def stiahni(fid):
    url = f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=180).read()
    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')

for v in vyber:
    im = stiahni(v['id'])
    w, h = im.size
    if v.get('orez'):
        x0, y0, x1, y1 = v['orez']
        im = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
        w, h = im.size
    # na 4:3 na šírku
    ciel = 4 / 3
    if w / h > ciel:
        nw = round(h * ciel); x = round((w - nw) * v.get('x', 0.5)); im = im.crop((x, 0, x + nw, h))
    else:
        nh = round(w / ciel); y = round((h - nh) * v.get('y', 0.5)); im = im.crop((0, y, w, y + nh))
    # rozmazanie ŠPZ / tvárí: 'rozmaz' = [[x0,y0,x1,y1], ...] v podieloch výsledného výrezu
    for r in v.get('rozmaz', []):
        W, H = im.size
        box = (round(r[0] * W), round(r[1] * H), round(r[2] * W), round(r[3] * H))
        im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(radius=max(6, (box[2] - box[0]) // 8))), box)
    velka = im.resize((1000, 750), Image.LANCZOS)
    meno = v['meno']
    velka.save(f'assets/foto/{meno}.jpg', quality=84, optimize=True, progressive=True)
    velka.save(f'assets/foto/{meno}-w1000.webp', quality=80, method=6)
    im.resize((640, 480), Image.LANCZOS).save(f'assets/foto/{meno}-w640.webp', quality=80, method=6)
    print(meno, 'hotovo', im.size)
