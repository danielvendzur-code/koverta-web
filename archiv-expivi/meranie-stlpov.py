# -*- coding: utf-8 -*-
"""Z každého Expivi exportu odmeria stĺpy: prierez aj polohu.

Modely nemajú spoločnú konvenciu — niektoré majú hore Z, iné Y — a nie sú
v rovnakej jednotke. Zvislá os aj mierka sa preto hľadajú skúškou: za zvislú
sa berie tá, pri ktorej vyjde rozumná sada stĺpov (telesá od zeme po strechu).
"""
import json, os, struct, zipfile
from collections import defaultdict

def verts(b):
    nfloat = struct.unpack_from('<I', b, 4)[0]
    o0 = struct.unpack_from('<I', b, 16)[0]
    nv = nfloat // 3
    p = struct.unpack_from('<%df' % (nv*3), b, o0)
    return [(p[i*3], p[i*3+1], p[i*3+2]) for i in range(nv)]

def bb(V):
    return [(min(v[i] for v in V), max(v[i] for v in V)) for i in range(3)]

cat = {str(c['id']): c['attributes'] for c in json.load(open('catalogues.json'))}
out = {}
for f in sorted(os.listdir('zips')):
    cid = f[:-4]
    z = zipfile.ZipFile('zips/' + f)
    parts = []
    for info in z.infolist():
        if not info.filename.endswith('.ebm'):
            continue
        try: V = verts(z.read(info))
        except Exception: continue
        parts.append(bb(V))
    if not parts:
        continue
    span = max(max(b[i][1] - b[i][0] for i in range(3)) for b in parts)
    k = 1000.0 if span < 60 else (10.0 if span < 1500 else 1.0)

    # Rozmer z názvu katalógu je najspoľahlivejší kľúč k tomu, ktoré dve osi
    # sú pôdorys — bez neho si úzky prístrešok pomýli šírku s výškou.
    import re as _re
    m = _re.search(r'(\d+[.,]\d+|\d+)\s*[xX×]\s*(\d+[.,]\d+|\d+)', cat.get(cid, {}).get('name', ''))
    ocak = None
    if m:
        ocak = sorted([float(m.group(1).replace(',', '.')) * 1000,
                       float(m.group(2).replace(',', '.')) * 1000])

    best = None
    for up in (0, 1, 2):
        plan = [i for i in (0, 1, 2) if i != up]
        lo = min(b[up][0] for b in parts)
        hi = max(b[up][1] for b in parts)
        h = hi - lo
        if h * k < 1800 or h * k > 4200:
            continue
        posts = [b for b in parts
                 if (b[up][0] - lo) < h * 0.06 and (hi - b[up][1]) < h * 0.14
                 and (b[up][1] - b[up][0]) > h * 0.80
                 and max(b[plan[0]][1] - b[plan[0]][0], b[plan[1]][1] - b[plan[1]][0]) * k < 400]
        if len(posts) < 4:
            continue
        skore = len(posts)
        if ocak:
            dims = sorted([(max(b[plan[i]][1] for b in parts) - min(b[plan[i]][0] for b in parts)) * k
                           for i in (0, 1)])
            if abs(dims[0] - ocak[0]) > 400 or abs(dims[1] - ocak[1]) > 400:
                continue                      # tieto dve osi nie sú pôdorys
            skore += 1000
        if best is None or skore > best[5]:
            best = (up, posts, plan, lo, hi, skore)
    rec = {'name': cat.get(cid, {}).get('name', '?'), 'jednotka': k}
    if not best:
        out[cid] = rec
        continue
    up, posts, plan, lo, hi = best[:5]
    rec['os_hore'] = 'xyz'[up]
    rec['vyska'] = round((hi - lo) * k)
    rec['podorys'] = [round((max(b[plan[i]][1] for b in parts) - min(b[plan[i]][0] for b in parts)) * k)
                      for i in (0, 1)]
    p0 = min(b[plan[0]][0] for b in parts)
    p1 = min(b[plan[1]][0] for b in parts)
    sect = defaultdict(list)
    for b in posts:
        w = round((b[plan[0]][1] - b[plan[0]][0]) * k)
        d = round((b[plan[1]][1] - b[plan[1]][0]) * k)
        sect[(w, d)].append([round((b[plan[0]][0] - p0) * k), round((b[plan[1]][0] - p1) * k)])
    rec['varianty'] = {}
    for s, ps in sorted(sect.items(), key=lambda kv: -len(kv[1])):
        ps.sort()
        rec['varianty'][f'{s[0]}x{s[1]}'] = {'ks': len(ps), 'polohy': ps}
    out[cid] = rec
json.dump(out, open('posts.json', 'w'), ensure_ascii=False, indent=1)
s = sum(1 for r in out.values() if r.get('varianty'))
print('katalógov', len(out), '| so stĺpmi', s)
