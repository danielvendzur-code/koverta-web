# -*- coding: utf-8 -*-
"""Diely modelu = súvislé komponenty sietí, ktoré sú naozaj v scéne.
   Jedna .ebm sieť môže obsahovať viac dielov spojených len materiálom,
   preto ich rozdelíme podľa spoločných vrcholov (union-find)."""
import json, os, re, struct, sys, zipfile
ARCH = '/home/user/koverta-web/archiv-expivi'

def mesh(b):
    nf, o0, oi = struct.unpack_from('<I', b, 4)[0], struct.unpack_from('<I', b, 16)[0], struct.unpack_from('<I', b, 28)[0]
    nv = nf // 3
    p = struct.unpack_from('<%df' % (nv*3), b, o0)
    ni = (len(b) - oi) // 4
    idx = struct.unpack_from('<%dI' % ni, b, oi)
    return [(p[i*3], p[i*3+1], p[i*3+2]) for i in range(nv)], idx

def komponenty(V, idx, kvant):
    # zlúč vrcholy na rovnakom mieste
    mapa = {}; kan = [0]*len(V)
    for i, v in enumerate(V):
        kl = (round(v[0]*kvant), round(v[1]*kvant), round(v[2]*kvant))
        kan[i] = mapa.setdefault(kl, i)
    par = list(range(len(V)))
    def naj(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    def spoj(a, b):
        a, b = naj(a), naj(b)
        if a != b: par[a] = b
    for i, v in enumerate(V): spoj(i, kan[i])
    for t in range(0, len(idx) - 2, 3):
        spoj(idx[t], idx[t+1]); spoj(idx[t+1], idx[t+2])
    grp = {}
    for i in range(len(V)):
        grp.setdefault(naj(i), []).append(i)
    out = []
    for g in grp.values():
        out.append([(min(V[i][a] for i in g), max(V[i][a] for i in g)) for a in range(3)])
    return out

def v_scene(cid):
    f = os.path.join(ARCH, 'scena', cid + '.json')
    if not os.path.exists(f): return None
    d = json.load(open(f, encoding='utf-8'))
    out = set()
    for b in d.get('batches', []):
        for n in b.get('nodes', []): out.add(n['asset_source'].split('/')[-1])
    return out or None

def diely(cid):
    v = v_scene(cid)
    z = zipfile.ZipFile('zips/%s.zip' % cid)
    siete = []
    for i in z.infolist():
        base = i.filename.split('/')[-1]
        if not base.endswith('.ebm'): continue
        if v is not None and base not in v: continue
        try: siete.append(mesh(z.read(i)))
        except Exception: pass
    if not siete: return None, None
    span = max(max(max(v[a] for v in V) - min(v[a] for v in V) for a in range(3)) for V, _ in siete)
    k = 1000.0 if span < 60 else (10.0 if span < 1500 else 1.0)
    kv = 1e4 / k if k > 1 else 20.0
    B = []
    for V, idx in siete:
        for b in komponenty(V, idx, kv):
            B.append([(b[a][0]*k, b[a][1]*k) for a in range(3)])
    return B, len(siete)

if __name__ == '__main__':
    for cid in sys.argv[1:]:
        B, n = diely(cid)
        print('== %s: %d sietí, %d dielov' % (cid, n, len(B)))
        tot = [(min(b[a][0] for b in B), max(b[a][1] for b in B)) for a in range(3)]
        print('   ext', [round(tot[a][1]-tot[a][0]) for a in range(3)])
        from collections import Counter
        c = Counter(tuple(round(b[a][1]-b[a][0]) for a in range(3)) for b in B)
        for s, k2 in c.most_common(18): print('   %-24s x%d' % (s, k2))
