"""Dokresliť detaily na dodanej packed sieti auta.

Usage: python3 refine-car-detail.py IN.bin.gz OUT.bin.gz

Sieť Superbu prišla ako hotový export, bez generátora, takže sa nedá
prestaviť — dá sa k nej len prikresliť. Tento skript robí presne dve veci:

  1. vymení text na tabuľke za KOVERTA (pôvodné písmená sú samostatný tenký
     plát, ktorý sa dá bezpečne odobrať a nahradiť),
Karoséria sa nedeformuje — vrcholy sa neposúvajú, len sa vymení samostatný
plát s nápisom. Model sa tak nedá „pokaziť".

Tvarovanie nárazníkov sa tu neskúša. Hrany dokreslené zvonku podľa lúča po
povrchu vyšli ako čierne prerušované pásiky nalepené na plech, nie ako
vtlačená hrana — hlbšie tvary treba urobiť v zdroji, nie dodatočne.
"""
import gzip, math, struct, sys
import numpy as np

PLATE_TEXT = 'KOVERTA'
DARK = (22, 27, 31)

def load(path):
    d = np.frombuffer(gzip.open(path, 'rb').read(), dtype=np.uint8)
    if len(d) % 48: raise SystemExit('not a packed mesh')
    return d.reshape(len(d) // 48, 48).copy()

def tri_pos(tris):
    v = tris.reshape(-1, 3, 16)[:, :, 0:6].copy().view(np.int16)
    return v.reshape(-1, 3, 3).astype(np.float64)

def pack(tris, extra):
    out = bytearray(tris.tobytes())
    for p, n, c in extra:
        nl = math.sqrt(sum(v * v for v in n)) or 1
        out += struct.pack('<6h4B', *[int(round(v)) for v in p],
                           *[int(round(v / nl * 32767)) for v in n], *c, 0)
    return bytes(out)

# ---------------------------------------------------------------- písmo ----
# Ťahové písmo: každé písmeno je pár úsečiek v štvorci 0..1. Pixelová mriežka
# by pri 54 mm výške na tabuľke vyzerala zubato.
GLYPHS = {
    'K': [(.14,0,.14,1),(.14,.5,.86,1),(.14,.5,.86,0)],
    'O': [(.14,.08,.14,.92),(.86,.08,.86,.92),(.14,.92,.86,.92),(.14,.08,.86,.08)],
    'V': [(.10,1,.50,0),(.90,1,.50,0)],
    'E': [(.16,0,.16,1),(.16,1,.84,1),(.16,.5,.74,.5),(.16,0,.84,0)],
    'R': [(.16,0,.16,1),(.16,1,.84,1),(.84,1,.84,.55),(.16,.55,.84,.55),(.40,.55,.86,0)],
    'T': [(.06,1,.94,1),(.50,1,.50,0)],
    'A': [(.06,0,.50,1),(.94,0,.50,1),(.24,.34,.76,.34)],
}

def glyph_quads(text, y0, y1, z0, z1, stroke=0.13):
    """Úsečky písmen prepočítané na obdĺžniky v rovine (y,z)."""
    n = len(text)
    gap = (y1 - y0) * 0.16 / n
    w = ((y1 - y0) - gap * (n - 1)) / n
    h = z1 - z0
    t = stroke * min(w, h) * 0.9
    out = []
    for i, ch in enumerate(text):
        bx = y0 + i * (w + gap)
        for (ax, ay, bx2, by2) in GLYPHS.get(ch, []):
            p = np.array([bx + ax * w, z0 + ay * h])
            q = np.array([bx + bx2 * w, z0 + by2 * h])
            d = q - p
            L = np.hypot(*d) or 1
            nx, ny = -d[1] / L * t / 2, d[0] / L * t / 2
            e = d / L * t / 2                      # predĺženie, aby ťahy naväzovali
            out.append([(p[0] - e[0] + nx, p[1] - e[1] + ny), (q[0] + e[0] + nx, q[1] + e[1] + ny),
                        (q[0] + e[0] - nx, q[1] + e[1] - ny), (p[0] - e[0] - nx, p[1] - e[1] - ny)])
    return out

def quad_yz(x, corners, normal, colour, out):
    for a, b, c in [(0, 1, 2), (0, 2, 3)]:
        for k in (a, b, c):
            out.append(((x, corners[k][0], corners[k][1]), normal, colour))

def main(src, dst):
    tris = load(src)
    pos = tri_pos(tris)
    col = tris[:, 12:15]
    dark = (col[:, 0] == DARK[0]) & (col[:, 1] == DARK[1]) & (col[:, 2] == DARK[2])
    lo = pos.min(axis=1); hi = pos.max(axis=1)

    def inside(x0, x1, ymax, z0, z1):
        return (lo[:, 0] >= x0) & (hi[:, 0] <= x1) & (np.abs(lo[:, 1]) <= ymax) & \
               (np.abs(hi[:, 1]) <= ymax) & (lo[:, 2] >= z0) & (hi[:, 2] <= z1)

    drop = dark & (inside(-25, -15, 135, 440, 510) | inside(4918, 4928, 135, 665, 735))
    print('starý nápis na tabuľke:', int(drop.sum()), 'trojuholníkov preč')
    kept = tris[~drop]

    extra = []
    for (x, y0, y1, z0, z1, nx) in [(-21., -122., 122., 452., 498., -1.),
                                    (4924., -122., 122., 677., 723., 1.)]:
        for q in glyph_quads(PLATE_TEXT, y0, y1, z0, z1):
            quad_yz(x, q, (nx, 0, 0), DARK, extra)
    print('nový nápis:', PLATE_TEXT, len(extra) // 3, 'trojuholníkov')

    data = pack(kept, extra)
    open(dst, 'wb').write(gzip.compress(data, mtime=0))
    print(dst, len(data) // 48, 'triangles,', len(gzip.compress(data, mtime=0)), 'bytes gzip')

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
