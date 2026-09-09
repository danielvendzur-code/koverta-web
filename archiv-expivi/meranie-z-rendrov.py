# -*- coding: utf-8 -*-
"""Odmeria polohy stĺpov priamo z oficiálnych rendrov Koverty.

Rendre sú z 3D modelu a zvislé hrany sú na nich zvislé, takže x-ová
súradnica bodu nezávisí od jeho výšky — stĺp má rovnaké x hore aj dole.
Perspektíva sa vyrovná dvojpomerom: z hrán lemovania sa nájdu úbežníky
oboch pôdorysných smerov, z nich štvrtý roh strechy, a potom sa poloha
stĺpa po hrane číta ako dvojpomer (roh, roh, úbežník, stĺp).
"""
from PIL import Image
import numpy as np


def nacitaj(p):
    a = np.array(Image.open(p).convert('RGB')).astype(int)
    s = a.sum(2)
    return {'tma': s < 400, 'silueta': s < 752}


def priamka(pts):
    """Regresia y = k·x + q cez body (x, y)."""
    P = np.asarray(pts, float)
    k, q = np.polyfit(P[:, 0], P[:, 1], 1)
    return k, q


def prienik(l1, l2):
    k1, q1 = l1; k2, q2 = l2
    if abs(k1 - k2) < 1e-9: return None
    x = (q2 - q1) / (k1 - k2)
    return np.array([x, k1 * x + q1])


def strecha(M):
    """Štyri rohy strechy a úbežníky oboch pôdorysných smerov."""
    sil = M['silueta']; tma = M['tma']
    n = sil.sum(1); ys = np.nonzero(n)[0]; top, bot = ys[0], ys[-1]
    plato = np.median(n[int(top + (bot - top) * 0.55):int(top + (bot - top) * 0.80)]) or 1
    dno = top
    for y in range(top, bot + 1):
        if n[y] > max(1.35 * plato, 30): dno = y
    pas = sil[top:dno + 1]
    yy, xx = np.nonzero(pas); P = np.stack([xx, yy + top], 1)
    roh = {}
    for nm, v in (('L', (-1, 0)), ('R', (1, 0)), ('T', (0, -1))):
        roh[nm] = P[(P @ np.array(v)).argmax()].astype(float)
    # hrany lemovania na oboch viditeľných stranách: horný a dolný okraj
    # súvislého tmavého behu v každom stĺpci
    def okraje(x0, x1):
        h, d = [], []
        for x in range(int(x0) + 12, int(x1) - 12):
            col = np.nonzero(tma[top:dno + 1, x])[0]
            if len(col) < 8: continue
            y0 = col[0]; y = y0
            while y + 1 <= col[-1] and tma[top + y + 1, x]: y += 1
            if y - y0 < 8: continue
            h.append((x, top + y0)); d.append((x, top + y))
        return h, d
    Vs = {}
    for nm, x0, x1 in (('u', roh['L'][0], roh['T'][0]), ('v', roh['T'][0], roh['R'][0])):
        h, d = okraje(x0, x1)
        if len(h) < 30: return None
        Vs[nm] = prienik(priamka(h), priamka(d))
    if Vs['u'] is None or Vs['v'] is None: return None
    # štvrtý roh: cez L ide hrana smeru 'v', cez R hrana smeru 'u'
    def cez(bod, V):
        k = (V[1] - bod[1]) / (V[0] - bod[0])
        return k, bod[1] - k * bod[0]
    B = prienik(cez(roh['L'], Vs['v']), cez(roh['R'], Vs['u']))
    roh['B'] = B
    return roh, Vs


def podiel(A, B, V, x):
    """Dvojpomer: kde medzi A a B (v smere s úbežníkom V) leží bod s danou x."""
    ax, bx, vx = float(A[0]), float(B[0]), float(V[0])
    if not np.isfinite(vx) or abs(vx - bx) < 1e-6 or abs(vx - ax) < 1e-6:
        return (x - ax) / (bx - ax)
    return ((x - ax) / (x - vx)) / ((bx - ax) / (bx - vx))


def stlpy(M):
    """Stredy stĺpov: tmavé úzke stĺpce v páse nad pätkami, aj s tým,
       ako hlboko siahajú (bližší rad siaha na obrázku nižšie)."""
    tma = M['tma']; sil = M['silueta']
    n = sil.sum(1); ys = np.nonzero(n)[0]; top, bot = ys[0], ys[-1]
    kand = {}
    for t in (0.42, 0.52, 0.62, 0.72):
        y = int(top + (bot - top) * t)
        r = tma[y]
        idx = np.nonzero(np.diff(np.concatenate(([0], r.view(np.int8), [0]))))[0]
        for i in range(0, len(idx), 2):
            x0, x1 = idx[i], idx[i + 1]
            if x1 - x0 < 8 or x1 - x0 > 90: continue
            kand.setdefault(round((x0 + x1) / 20.0), []).append(((x0 + x1 - 1) / 2.0, x1 - x0))
    out = []
    for v in kand.values():
        if len(v) < 3: continue
        x = sum(q[0] for q in v) / len(v)
        col = np.nonzero(tma[:, int(round(x))])[0]
        out.append({'x': x, 'w': sum(q[1] for q in v) / len(v), 'dno': int(col[-1])})
    out.sort(key=lambda q: q['x'])
    return out


def zmeraj(p, W, L):
    M = nacitaj(p)
    s = strecha(M)
    if not s: return None
    roh, V = s
    st = stlpy(M)
    if len(st) < 3: return None
    # dva rady: bližší siaha na obrázku nižšie
    dna = sorted(q['dno'] for q in st)
    hranica = (dna[0] + dna[-1]) / 2
    blizky = [q for q in st if q['dno'] > hranica]
    daleky = [q for q in st if q['dno'] <= hranica]
    # ktorá dvojica hrán je hĺbka? tá, ktorej pomer dĺžok sedí s L/W
    duL = abs(roh['T'][0] - roh['L'][0]); duR = abs(roh['R'][0] - roh['T'][0])
    # hrana L→T má smer 'u', hrana T→R smer 'v'
    varianty = [
        ('u', roh['L'], roh['T'], roh['B'], roh['R'], V['u']),
        ('v', roh['T'], roh['R'], roh['L'], roh['B'], V['v']),
    ]
    out = {'rohy': {k: [float(x) for x in v] for k, v in roh.items()},
            'V': {k: [float(x) for x in v] for k, v in V.items()},
            'stlpy': st, 'rady': {}}
    for meno, A1, B1, A2, B2, VV in varianty:
        # rad, ktorý leží na hrane A1B1, a rad na hrane A2B2
        r1 = [podiel(A1, B1, VV, q['x']) for q in daleky]
        r2 = [podiel(A2, B2, VV, q['x']) for q in blizky]
        out['rady'][meno] = {'daleky': [round(x, 4) for x in sorted(r1)],
                             'blizky': [round(x, 4) for x in sorted(r2)]}
    return out


if __name__ == '__main__':
    import sys, json, re
    for f in sys.argv[1:]:
        m = re.match(r'(\d+)x(\d+)', f)
        r = zmeraj('rendre/' + f, int(m.group(1)), int(m.group(2)))
        if not r: print(f, 'nezmerané'); continue
        print(f, 'rohy', {k: [round(x) for x in v] for k, v in r['rohy'].items()})
        print('   stĺpy x', [round(q['x']) for q in r['stlpy']], 'dná', [q['dno'] for q in r['stlpy']])
        for k, v in r['rady'].items(): print('   smer', k, v)
