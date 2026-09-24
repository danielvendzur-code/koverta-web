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
    # rovina steny = os najtenšieho rozmeru + jej poloha; výška = os s ~100 mm
    roviny = collections.defaultdict(list)
    for meno, bb, rozm in lamely:
        a_t = min(range(3), key=lambda a: rozm[a])
        a_h = min((a for a in range(3) if a != a_t), key=lambda a: abs(rozm[a] - 100))
        a_l = [a for a in range(3) if a not in (a_t, a_h)][0]
        stred_t = (bb[a_t][0] + bb[a_t][1]) / 2
        roviny[(a_t, a_h, round(stred_t / 25) * 25)].append((bb, rozm, a_l, meno))
    for (a_t, a_h, pol), L in sorted(roviny.items(), key=lambda x: (-len(x[1]))):
        urovne = sorted(set((round(bb[a_h][0]), round(bb[a_h][1])) for bb, _, _, _ in L))
        a_l = L[0][2]
        dlzky = collections.Counter(round(r[a_l]) for _, r, _, _ in L)
        od_l = min(bb[a_l][0] for bb, _, _, _ in L); po_l = max(bb[a_l][1] for bb, _, _, _ in L)
        rozstupy = sorted(set(urovne[i + 1][0] - urovne[i][0] for i in range(len(urovne) - 1)))
        print('   STENA hrúbka v osi %d pri %s, výška v osi %d: %d lamiel, %d úrovní, výška %s..%s (%s mm), rozstupy %s, dĺžky lamiel %s, beh v osi %d %d..%d, sietí %d' % (
            a_t, pol, a_h, len(L), len(urovne), urovne[0][0], urovne[-1][1], urovne[-1][1] - urovne[0][0],
            rozstupy[:5], dict(dlzky.most_common(4)), a_l, round(od_l), round(po_l), len(set(m for _, _, _, m in L))))
