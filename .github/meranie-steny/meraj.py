# -*- coding: utf-8 -*-
"""Jednorazové meranie stien Koverta z pôvodných 3D exportov Expivi (len čítanie).
   Nájde v zipe lamely (diel ~20 × ~100 mm a dlhý) a spočíta ich na každej stene."""
import json, struct, sys, zipfile, urllib.request, collections

def mesh(b):
    nf, o0, oi = struct.unpack_from('<I', b, 4)[0], struct.unpack_from('<I', b, 16)[0], struct.unpack_from('<I', b, 28)[0]
    nv = nf // 3
    p = struct.unpack_from('<%df' % (nv * 3), b, o0)
    ni = (len(b) - oi) // 4
    idx = struct.unpack_from('<%dI' % ni, b, oi)
    return [(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) for i in range(nv)], idx

def komponenty(V, idx, kvant):
    mapa = {}; kan = [0] * len(V)
    for i, v in enumerate(V):
        kl = (round(v[0] * kvant), round(v[1] * kvant), round(v[2] * kvant))
        kan[i] = mapa.setdefault(kl, i)
    par = list(range(len(V)))
    def naj(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    def spoj(a, b):
        a, b = naj(a), naj(b)
        if a != b: par[a] = b
    for i in range(len(V)): spoj(i, kan[i])
    for t in range(0, len(idx) - 2, 3):
        spoj(idx[t], idx[t + 1]); spoj(idx[t + 1], idx[t + 2])
    grp = {}
    for i in range(len(V)): grp.setdefault(naj(i), []).append(i)
    return [[(min(V[i][a] for i in g), max(V[i][a] for i in g)) for a in range(3)] for g in grp.values()]

for cid, cesta in [('14069', 'teams/811/models/14069/b79e-1d7d-12a6-5dd3.zip'),
                   ('13412', 'teams/811/models/13412/abae-0b4b-fdbb-fae8.zip'),
                   ('13670', 'teams/811/models/13670/a7e7-4724-5125-6109.zip')]:
    url = 'https://data.expivi.net/' + cesta
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        'Referer': 'https://koverta.sk/apps/configurator?catalogue=' + cid, 'Origin': 'https://koverta.sk'})
    try:
        data = urllib.request.urlopen(req, timeout=120).read()
    except Exception as e:
        print('==', cid, 'NEDÁ SA STIAHNUŤ:', e); continue
    open(cid + '.zip', 'wb').write(data)
    z = zipfile.ZipFile(cid + '.zip')
    mena = [i.filename for i in z.infolist()]
    print('==', cid, len(data), 'B,', len(mena), 'súborov')
    for m in mena:
        if not m.endswith('.ebm'):
            obsah = z.read(m)
            print('   NIE-EBM', m, len(obsah), obsah[:300].decode('utf-8', 'replace').replace('\n', ' ') if len(obsah) < 400000 else '')
    siete = []
    for m in mena:
        if not m.endswith('.ebm'): continue
        try: siete.append((m.split('/')[-1], mesh(z.read(m))))
        except Exception as e: pass
    span = max(max(max(v[a] for v in V) - min(v[a] for v in V) for a in range(3)) for _, (V, _) in siete)
    k = 1000.0 if span < 60 else (10.0 if span < 1500 else 1.0)
    kv = 1e4 / k if k > 1 else 20.0
    lamely = []
    for meno, (V, idx) in siete:
        for b in komponenty(V, idx, kv):
            bb = [(b[a][0] * k, b[a][1] * k) for a in range(3)]
            rozm = [bb[a][1] - bb[a][0] for a in range(3)]
            s = sorted(rozm)
            if 14 <= s[0] <= 30 and 80 <= s[1] <= 120 and s[2] >= 400:
                lamely.append((meno, bb, rozm))
    print('   lamiel (diel 14–30 × 80–120 × ≥400 mm):', len(lamely))
    # skupina = sieť; v každej sieti roviny a výšky
    podla_siete = collections.defaultdict(list)
    for meno, bb, rozm in lamely: podla_siete[meno].append((bb, rozm))
    for meno, L in sorted(podla_siete.items(), key=lambda x: -len(x[1])):
        # os výšky = os, kde má lamela ~100 mm a ktorá sa medzi lamelami mení
        osi = []
        for a in range(3):
            stredy = sorted(set(round((bb[a][0] + bb[a][1]) / 2) for bb, _ in L))
            osi.append(stredy)
        # os výšky: najviac rôznych hodnôt a rozmer ~100
        a_v = max(range(3), key=lambda a: len(osi[a]))
        vysky = sorted(set((round(bb[a_v][0]), round(bb[a_v][1])) for bb, _ in L))
        dlzky = sorted(set(round(r) for _, r in L for r in [max(r)]))
        print('   SIEŤ %s: %d lamiel, os výšky %d, úrovní %d, od %s po %s, dĺžky %s, rozmery %s' % (
            meno, len(L), a_v, len(vysky), vysky[0][0], vysky[-1][1], dlzky[:6],
            sorted(set(tuple(round(x) for x in r) for _, r in L))[:4]))
        print('      úrovne:', vysky[:20])
