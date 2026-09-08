# -*- coding: utf-8 -*-
"""Osovo-nezávislé meranie: pre každý katalóg zisti os šírky, dĺžky a výšky
   podľa názvu katalógu, potom zaraď diely podľa prierezu."""
import json, os, re, struct, zipfile
from collections import Counter

def verts(b):
    nf = struct.unpack_from('<I', b, 4)[0]; o0 = struct.unpack_from('<I', b, 16)[0]
    nv = nf // 3
    p = struct.unpack_from('<%df' % (nv*3), b, o0)
    return [(p[i*3], p[i*3+1], p[i*3+2]) for i in range(nv)]

cat = {}
d = json.load(open('/home/user/koverta-web/archiv-expivi/zoznam-katalogov.json', encoding='utf-8'))
for c in (d if isinstance(d, list) else d.get('data', [])):
    a = c.get('attributes', c); cat[str(a['id'])] = a.get('name', '')

res = {}
for f in sorted(os.listdir('zips')):
    cid = f[:-4]; name = cat.get(cid, '')
    if 'Bike' in name or 'Skuska' in name or 'test' in name or 'hradn' in name or 'nad dvere' in name:
        continue
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)', name)
    if not m: continue
    W = round(float(m.group(1).replace(',', '.'))*1000)
    L = round(float(m.group(2).replace(',', '.'))*1000)
    z = zipfile.ZipFile('zips/'+f); B = []
    for i in z.infolist():
        if not i.filename.endswith('.ebm'): continue
        try: V = verts(z.read(i))
        except Exception: continue
        B.append([(min(v[a] for v in V), max(v[a] for v in V)) for a in range(3)])
    if not B: continue
    span = max(max(b[a][1]-b[a][0] for a in range(3)) for b in B)
    k = 1000.0 if span < 60 else (10.0 if span < 1500 else 1.0)
    B = [[(b[a][0]*k, b[a][1]*k) for a in range(3)] for b in B]
    tot = [(min(b[a][0] for b in B), max(b[a][1] for b in B)) for a in range(3)]
    ext = [tot[a][1]-tot[a][0] for a in range(3)]
    # priraď osi: najbližšia k W je šírka, k L dĺžka, zvyšok výška
    order = sorted(range(3), key=lambda a: abs(ext[a]-W))
    ax_w = order[0]
    order = sorted([a for a in range(3) if a != ax_w], key=lambda a: abs(ext[a]-L))
    ax_l = order[0]
    ax_z = [a for a in range(3) if a not in (ax_w, ax_l)][0]
    fit = (abs(ext[ax_w]-W), abs(ext[ax_l]-L))
    sec = lambda b: (round(b[ax_w][1]-b[ax_w][0]), round(b[ax_l][1]-b[ax_l][0]), round(b[ax_z][1]-b[ax_z][0]))
    lo = lambda b, a: b[a][0]
    # orientácia dĺžky: odkvapová hrana je tam, kde je strecha nižšie — použijeme
    # najvyšší bod strešného plechu na oboch koncoch. Zatiaľ len surové súradnice.
    st, vz = [], []
    for b in B:
        s = sec(b)
        if s[2] > 1800 and max(s[0], s[1]) < 260:      # stĺp
            st.append((s, round((b[ax_w][0]+b[ax_w][1])/2 - tot[ax_w][0]),
                          round((b[ax_l][0]+b[ax_l][1])/2 - tot[ax_l][0])))
        if s[2] in range(170, 190) and s[1] < 70 and s[0] > 1000:  # väznica cez šírku
            vz.append(round((b[ax_l][0]+b[ax_l][1])/2 - tot[ax_l][0]))
    grp = []
    for a in sorted(vz):
        if grp and a - grp[-1][-1] <= 70: grp[-1].append(a)
        else: grp.append([a])
    osi = [round(sum(g)/len(g)) for g in grp]
    secs = Counter(s for s, _, _ in st)
    res['%dx%d' % (W, L)] = {'id': int(cid), 'W': W, 'L': L, 'ext': [round(e) for e in ext],
                             'fit': [round(x) for x in fit],
                             'stlpy': {str(s): sorted({(y, x) for ss, x, y in st if ss == s}) for s in secs},
                             'vaz_n': len(vz), 'vaz_osi': osi}
json.dump(res, open('kv-mer4.json', 'w'), ensure_ascii=False, indent=1)
for kk in sorted(res, key=lambda s: (int(s.split('x')[1]), int(s.split('x')[0]))):
    v = res[kk]
    if max(v['fit']) > 120: print('%9s ??? ext%s' % (kk, v['ext'])); continue
    ss = ' '.join('%s:%s' % (s, [p[0] for p in ps]) for s, ps in v['stlpy'].items())
    print('%9s vaz %2d %s | %s' % (kk, len(v['vaz_osi']), v['vaz_osi'], ss))
