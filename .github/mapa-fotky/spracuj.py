# -*- coding: utf-8 -*-
"""Fotka realizácie pre mapu: assets/mapa/<obec>.jpg (1280 × 960), -mini.jpg (420 × 315)
a -w1000.webp. Bez EXIF (ani poloha). 'rozmaz' = [[x0,y0,x1,y1], ...] v podieloch výrezu."""
import json, io, urllib.request
from PIL import Image, ImageOps, ImageFilter
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
for v in json.load(open('.github/mapa-fotky/fotky.json')):
    url = f"https://drive.usercontent.google.com/download?id={v['id']}&export=download&confirm=t"
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=180).read()
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
    w, h = im.size
    if w / h > 4 / 3:
        nw = round(h * 4 / 3); x = round((w - nw) * v.get('x', 0.5)); im = im.crop((x, 0, x + nw, h))
    else:
        nh = round(w * 3 / 4); y = round((h - nh) * v.get('y', 0.5)); im = im.crop((0, y, w, y + nh))
    for r in v.get('rozmaz', []):
        W, H = im.size
        box = (round(r[0] * W), round(r[1] * H), round(r[2] * W), round(r[3] * H))
        im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(radius=max(8, (box[2] - box[0]) // 6))), box)
    m = v['meno']
    velka = im.resize((1280, 960), Image.LANCZOS)
    velka.save(f'assets/mapa/{m}.jpg', quality=84, optimize=True, progressive=True)
    im.resize((1000, 750), Image.LANCZOS).save(f'assets/mapa/{m}-w1000.webp', quality=80, method=6)
    im.resize((420, 315), Image.LANCZOS).save(f'assets/mapa/{m}-mini.jpg', quality=82, optimize=True)
    print(m, 'hotovo')
