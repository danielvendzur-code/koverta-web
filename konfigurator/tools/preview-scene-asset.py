"""Orthographic preview of a packed scene mesh, without a browser.

Usage: python3 preview-scene-asset.py ../scene-assets/superb-iv.bin.gz OUTDIR

Writes side / front / top and two three-quarter views as PNG. Shading follows
the same key and fill directions as the runtime shader in scene-life.js, so a
surface that reads badly here reads badly in the configurator too. Tuning a
lofted body through the browser costs a minute per look; this costs a second.
"""
import gzip, math, sys
import numpy as np
from PIL import Image

PAINT = (150, 157, 161)   # material 1 takes its colour from a uniform at runtime
# ...a vrchol k nej nesie činiteľ jasu, ktorým sa násobí. 128 znamená bez zmeny.
GLASS = (30, 40, 48)

def load(path):
    d = np.frombuffer(gzip.open(path, 'rb').read(), dtype=np.uint8)
    if len(d) % 48: raise SystemExit('not a packed mesh: length is not a multiple of 48')
    d = d.reshape(len(d) // 16, 16)
    pos = d[:, 0:6].copy().view(np.int16).astype(np.float64).reshape(-1, 3)
    nor = d[:, 6:12].copy().view(np.int16).astype(np.float64).reshape(-1, 3) / 32767.
    col = d[:, 12:15].astype(np.float64)
    mat = d[:, 15].astype(np.int32)
    return (pos.reshape(-1, 3, 3), nor.reshape(-1, 3, 3),
            col.reshape(-1, 3, 3), mat.reshape(-1, 3)[:, 0])

def render(src, out, az, el, W=1400, H=900, pad=1.06):
    P, N, C, M = load(src)
    ca, sa, ce, se = math.cos(az), math.sin(az), math.cos(el), math.sin(el)
    fwd = np.array([-sa * ce, ca * ce, se])
    right = np.cross(fwd, [0, 0, 1.]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    V = P.reshape(-1, 3)
    x, y, z = V @ right, V @ up, V @ fwd
    cx, cy = (x.min() + x.max()) / 2, (y.min() + y.max()) / 2
    sc = min(W / ((x.max() - x.min()) * pad), H / ((y.max() - y.min()) * pad))
    px = ((x - cx) * sc + W / 2).reshape(-1, 3)
    py = (H / 2 - (y - cy) * sc).reshape(-1, 3)
    pz = z.reshape(-1, 3)
    key = np.array([-.25, .62, .74]); key /= np.linalg.norm(key)
    fill = np.array([.86, -.1, .50]); fill /= np.linalg.norm(fill)
    img = np.full((H, W, 3), 248.)
    depth = np.full((H, W), -1e18)
    for t in np.argsort(pz.mean(axis=1)):
        xs, ys = px[t], py[t]
        x0, x1 = int(max(0, math.floor(xs.min()))), int(min(W - 1, math.ceil(xs.max())))
        y0, y1 = int(max(0, math.floor(ys.min()))), int(min(H - 1, math.ceil(ys.max())))
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        det = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(det) < 1e-9: continue
        a = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / det
        b = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / det
        c = 1 - a - b
        m = (a >= 0) & (b >= 0) & (c >= 0)
        if not m.any(): continue
        zz = a * pz[t][0] + b * pz[t][1] + c * pz[t][2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        m &= zz > sub
        if not m.any(): continue
        n = N[t].mean(axis=0)
        norm = np.linalg.norm(n)
        n = n / norm if norm > .3 else np.array([0, 0, 1.])
        if n @ fwd > 0: n = -n
        light = (.36 + .56 * max(0, n @ key) + .22 * max(0, n @ fill)
                 + .34 * max(0, -n[2]) + .13 * max(0, n[2]))
        kind = int(M[t])
        if kind == 1:
            # Rovnako ako shader: lak sa násobí činiteľom uloženým vo vrchole.
            base = np.clip(np.array(PAINT) * (C[t].mean(axis=0)[0] / 127.5), 0, 255)
        else:
            base = np.array(GLASS if kind == 2 else C[t].mean(axis=0))
        if kind == 2: light = light * .55 + .10
        sub[m] = zz[m]
        img[y0:y1 + 1, x0:x1 + 1][m] = np.clip(base * light, 0, 255)
    Image.fromarray(img.astype(np.uint8)).save(out)

if __name__ == '__main__':
    if len(sys.argv) < 3: raise SystemExit(__doc__)
    src, out = sys.argv[1], sys.argv[2].rstrip('/')
    for name, (az, el) in {'side': (0., 0.), 'front': (math.pi / 2, 0.),
                           'top': (0., math.pi / 2 - .001),
                           'front34': (.9, .22), 'rear34': (2.35, .22)}.items():
        render(src, f'{out}/{name}.png', az, el)
        print('wrote', f'{out}/{name}.png')
