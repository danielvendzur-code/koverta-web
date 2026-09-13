"""Preniesť auto z glTF do packed siete, ktorú kreslí konfigurátor.

Usage: python3 import-car-gltf.py SCENE.gltf OUT.bin.gz [--profile NAME]
                                  [--length MM] [--width MM] [--height MM]
                                  [--front auto|low|high]
                                  [--keep-interior] [--no-texture]

glTF je v metroch a Y hore; scéna chce milimetre, X od predku dozadu, Y naprieč
a Z hore, počiatok na zemi v strede rozchodu. Os dĺžky sa určuje z rozmerov
modelu, nie z dohody o exporte — auto je vždy dlhšie než širšie a vyššie.

Materiály glTF sa mapujú na päticu, ktorú pozná shader: 0 matný, 1 lak (farbu
berie z uniformu, takže sa dá prefarbiť), 2 sklo, 3 chróm a disky, 4 svietiace
sklo lámp. Vnútro auta sa bez príznaku zahadzuje — cez tmavé sklo ho nevidno a
je to takmer polovica trojuholníkov.

Každý zdroj pomenúva materiály po svojom, takže pravidlá sú v profiloch. Kde
model nesie farbu v textúre a nie vo faktore, vzorkujeme textúru po vrchole:
packed formát textúry nepozná, ale vrcholovú farbu áno, a pri hustote týchto
sietí je jeden texel na vrchol vizuálne to isté.
"""
import base64, gzip, io, json, pathlib, struct, sys
import numpy as np
from PIL import Image

# meno materiálu -> (náš materiál, farba alebo None = z glTF/textúry)
# None namiesto materiálu znamená vrstvu zahodiť. Prvá zhoda vyhráva.
PROFILES = {
    'superb': [
        ('body',            1, None),
        ('glass003',     None, None),      # prázdna vrstva zo Sketchfabu, len z-fighting
        ('glass002',     None, None),
        ('tailglass',       2, (26, 34, 40)),
        ('glass',           2, (26, 34, 40)),
        ('headlight',       2, (150, 160, 168)),
        ('wheel',           3, (176, 182, 188)),
        ('tire',            0, (24, 26, 28)),
        ('vehiclelights',   4, (238, 242, 246)),
        ('brak',            4, (196, 28, 34)),
        ('red',             4, (196, 28, 34)),
        ('signal',          4, (232, 156, 58)),
        ('sig_',            4, (232, 156, 58)),
        ('running',         4, (238, 242, 246)),
        ('fogli',           4, (238, 242, 246)),
        ('revik',           3, (176, 182, 188)),
        ('mirror',          3, (186, 194, 200)),
        ('nososk',          3, (176, 182, 188)),
    ],
    # Sonata pomenúva takmer všetko Material.0NN, takže rozhoduje presné meno.
    # Čísla svetiel sedia s menami sietí: 1LFI/1RSI sú smerovky, 1HB/1LB svetlá.
    'sonata': [
        ('car_paint',       1, None),
        ('material.002',    0, (22, 24, 26)),   # plášť pneumatiky
        ('material.005',    3, 'texture'),        # disk aj s lúčmi
        ('material.001',    4, (236, 150, 46)),   # smerovky
        ('material.006',    4, (242, 244, 248)),  # hlavné svetlomety
        ('material.003',    4, (238, 242, 248)),  # DRL a spiatočka
        ('material.012',    4, (214, 26, 32)),    # brzdové
        ('material.013',    4, (168, 20, 26)),    # obrysové vzadu
        ('material.004',    4, (196, 28, 34)),
        ('tailights',       2, 'texture'),
        ('headlights',      2, 'texture'),
        ('glass1',          2, (24, 30, 36)),
        ('chrome',          3, (188, 194, 200)),
        ('material.011',    3, (170, 176, 182)),  # lišty a zrkadlá
        ('material.010',    0, (74, 78, 82)),
        ('material.014',    0, (58, 60, 63)),
        ('material.007',    0, (226, 228, 230)),  # tabuľka ŠPZ
        ('black',           0, (20, 21, 23)),
        ('material.008',    0, (26, 27, 29)),
        ('material.009',    0, (24, 26, 28)),     # maska chladiča
        ('material.002',    0, (22, 24, 26)),
        ('material',        0, (28, 30, 32)),
    ],
    # Malé mestské auto nesie celý exteriér v jednej textúre, takže farbu
    # berieme z nej po vrchole; lak sa dovolí len tam, kde textúra drží
    # dominantný odtieň karosérie (viď --paint-from-texture).
    'city': [
        ('exterior',        1, 'texture'),
        ('interior',     None, None),
        ('wheel',           0, 'texture'),
        ('windows',         2, (26, 32, 38)),
    ],
}
INTERIOR = ('interior', 'gauges', 'display', 'screen', 'engine', 'ssb_')

COMP = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_accessor(g, buf, index):
    a = g['accessors'][index]
    bv = g['bufferViews'][a['bufferView']]
    n, fmt = NUM[a['type']], COMP[a['componentType']]
    size = struct.calcsize('<' + fmt) * n
    stride = bv.get('byteStride') or size
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = np.dtype('<' + fmt)
    if stride == size:
        flat = np.frombuffer(buf, dtype=dt, count=a['count'] * n, offset=start)
        return flat.reshape(a['count'], n).astype(np.float64 if fmt == 'f' else np.int64)
    raw = np.frombuffer(buf, dtype=np.uint8, count=a['count'] * stride, offset=start)
    raw = raw.reshape(a['count'], stride)[:, :size].copy()
    return raw.view(dt).reshape(a['count'], n).astype(np.float64 if fmt == 'f' else np.int64)

def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if 'scale' in node: m = m @ np.diag([*node['scale'], 1.])
    if 'rotation' in node:
        x, y, z, w = node['rotation']
        r = np.array([
            [1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w),   0],
            [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w),   0],
            [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y), 0],
            [0, 0, 0, 1]])
        m = r @ m
    if 'translation' in node:
        t = np.eye(4); t[:3, 3] = node['translation']; m = t @ m
    return m

class Atlas:
    """Základné textúry modelu, načítané raz a vzorkované po vrchole."""

    def __init__(self, g, root):
        self.g, self.root, self.cache = g, root, {}

    def image_for(self, mat_index):
        pbr = self.g['materials'][mat_index].get('pbrMetallicRoughness', {})
        tex = pbr.get('baseColorTexture')
        if tex is None: return None
        src = self.g['textures'][tex['index']].get('source')
        if src is None: return None
        if src not in self.cache:
            uri = self.g['images'][src]['uri']
            if uri.startswith('data:'):
                blob = base64.b64decode(uri.split(',', 1)[1])
                img = Image.open(io.BytesIO(blob))
            else:
                img = Image.open(self.root / uri)
            self.cache[src] = np.asarray(img.convert('RGB'), dtype=np.uint8)
        return self.cache[src]

    def sample(self, mat_index, uv):
        """Najbližší texel; pri hustote týchto sietí je to od bilineárneho
        vzorkovania nerozoznateľné a nerozmazáva ostré hrany v textúre."""
        img = self.image_for(mat_index)
        if img is None or uv is None: return None
        h, w = img.shape[:2]
        u = np.mod(uv[:, 0], 1.0) * (w - 1)
        v = np.mod(uv[:, 1], 1.0) * (h - 1)
        return img[np.rint(v).astype(int), np.rint(u).astype(int)]

def material_of(g, rules, index):
    if index is None: return 0, None, False
    name = (g['materials'][index].get('name') or '').lower()
    interior = any(k in name for k in INTERIOR)
    for key, mat, col in rules:
        if key in name:
            return mat, col, interior
    pbr = g['materials'][index].get('pbrMetallicRoughness', {})
    if 'baseColorTexture' in pbr:
        return 0, 'texture', interior
    base = pbr.get('baseColorFactor', [0.6, 0.6, 0.6, 1])
    srgb = tuple(int(round(255 * (v ** (1 / 2.2)))) for v in base[:3])
    return (3 if (pbr.get('metallicFactor') or 0) > .5 else 0), srgb, interior

def main(src, dst, profile='superb', keep_interior=False, use_texture=True,
         length=None, front='auto', width=None, height=None):
    src = pathlib.Path(src)
    g = json.loads(src.read_text())
    buf = (src.parent / g['buffers'][0]['uri']).read_bytes()
    rules = PROFILES[profile]
    atlas = Atlas(g, src.parent)

    parts = []                                   # (pos, nrm, col, mat) po vrcholoch
    dropped = {'layer': 0, 'interior': 0}

    def walk(idx, parent):
        node = g['nodes'][idx]
        world = parent @ node_matrix(node)
        if 'mesh' in node:
            for prim in g['meshes'][node['mesh']]['primitives']:
                mat, col, interior = material_of(g, rules, prim.get('material'))
                if mat is None: dropped['layer'] += 1; continue
                if interior and not keep_interior: dropped['interior'] += 1; continue
                attrs = prim['attributes']
                pos = read_accessor(g, buf, attrs['POSITION'])
                nrm = read_accessor(g, buf, attrs['NORMAL']) if 'NORMAL' in attrs else None
                idxs = (read_accessor(g, buf, prim['indices'])[:, 0].astype(int)
                        if 'indices' in prim else np.arange(len(pos)))
                idxs = idxs[:len(idxs) // 3 * 3]
                p3 = ((world[:3, :3] @ pos.T).T + world[:3, 3])[idxs]
                if nrm is None:
                    f = p3.reshape(-1, 3, 3)
                    n3 = np.repeat(np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0]), 3, axis=0)
                else:
                    n3 = ((np.linalg.inv(world[:3, :3]).T @ nrm.T).T)[idxs]

                rgb = None
                if col == 'texture' and use_texture and 'TEXCOORD_0' in attrs:
                    rgb = atlas.sample(prim['material'], read_accessor(g, buf, attrs['TEXCOORD_0'])[idxs])
                if rgb is None:
                    if col is None or col == 'texture':
                        pbr = g['materials'][prim['material']].get('pbrMetallicRoughness', {})
                        base = pbr.get('baseColorFactor', [0.6, 0.6, 0.6, 1])
                        col = tuple(int(round(255 * (v ** (1 / 2.2)))) for v in base[:3])
                    rgb = np.tile(np.array(col, dtype=np.uint8), (len(idxs), 1))
                parts.append((p3, n3, rgb.astype(np.uint8),
                              np.full(len(idxs), mat, dtype=np.uint8),
                              col == 'texture'))
        for child in node.get('children', []): walk(child, world)

    for root in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(root, np.eye(4))
    if not parts: raise SystemExit('žiadna geometria')
    print('trojuholníkov:', sum(len(a[0]) for a in parts) // 3,
          '| zahodené vrstvy:', dropped['layer'], '| interiér:', dropped['interior'])

    P = np.concatenate([a[0] for a in parts])
    N = np.concatenate([a[1] for a in parts])
    C = np.concatenate([a[2] for a in parts])
    M = np.concatenate([a[3] for a in parts])
    textured_paint = np.concatenate([np.full(len(a[0]), a[4] and a[3][0] == 1) for a in parts])

    # Kde lak nesie textúra a nie faktor, treba oddeliť karosériu od zvyšku:
    # prefarbovať sa smie len dominantný neutrálny odtieň, inak by uniform
    # zafarbil aj masku, tesnenia a nárazník.
    if textured_paint.any():
        sel = np.where(textured_paint)[0]
        q = (C[sel] // 16 * 16).astype(np.int32)
        key = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
        vals, counts = np.unique(key, return_counts=True)
        dom = vals[np.argmax(counts)]
        dominant = np.array([dom >> 16, (dom >> 8) & 255, dom & 255])
        # Lak je neutrálny: textúra do neho zapiekla len tieň, nie odtieň.
        # Rozhoduje teda nízka sýtosť a jas v okolí dominantného, nie
        # vzdialenosť od jednej farby — inak by zatienené panely vypadli
        # z laku a karoséria by ostala fľakatá.
        c = C[sel].astype(np.int32)
        lum = c @ np.array([2, 5, 1]) / 8
        domlum = float(dominant @ np.array([2, 5, 1]) / 8)
        near = ((c.max(axis=1) - c.min(axis=1)) <= 26) & (lum >= domlum * .45) & (lum <= domlum * 1.7)
        tri = np.repeat(near.reshape(-1, 3).all(axis=1), 3)   # trojuholník celý, či vôbec
        M[sel[~tri]] = 0
        print('lak z textúry: dominantný odtieň', dominant.tolist(),
              '| lakovaných vrcholov', int(tri.sum()), 'z', len(sel))

    lo, hi = P.min(axis=0), P.max(axis=0)
    span = hi - lo
    length_axis = int(np.argmax(span))                    # auto je vždy najdlhšie
    up_axis = int(np.argmin(span))                        # a najnižšie
    side_axis = 3 - length_axis - up_axis
    print('rozmery v zdroji (m):', np.round(span, 3), '| dĺžka=os', length_axis,
          'šírka=os', side_axis, 'výška=os', up_axis)

    # Zdroje sa v jednotkách nezhodujú: jeden exportuje metre, iný centimetre,
    # iný jednotky enginu. Keď poznáme skutočné rozmery auta, škálujeme na ne.
    # Konfigurátor odpovedá na otázku „zmestí sa mi sem auto", takže rozmer
    # musí sedieť s katalógom, aj keď to znamená stlačiť predlohu naprieč:
    # 12 % v šírke na modeli nikto nevidí, 20 cm v rezerve pri stĺpe áno.
    uniform = length / (span[length_axis] * 1000.0) if length else 1.0
    sx = uniform
    sy = width / (span[side_axis] * 1000.0) if width else uniform
    sz = height / (span[up_axis] * 1000.0) if height else uniform
    q = np.stack([(P[:, length_axis] - lo[length_axis]) * sx * 1000.0,
                  (P[:, side_axis] - (lo[side_axis] + hi[side_axis]) / 2) * sy * 1000.0,
                  (P[:, up_axis] - lo[up_axis]) * sz * 1000.0], axis=1)
    # Pri nerovnomernej mierke sa normála neškáluje mierkou, ale jej
    # prevrátenou hodnotou — inak by stlačená karoséria svietila nakrivo.
    n = np.stack([N[:, length_axis] / sx, N[:, side_axis] / sy, N[:, up_axis] / sz], axis=1)
    nl = np.linalg.norm(n, axis=1, keepdims=True)
    n = np.divide(n, nl, out=np.tile([0., 0., 1.], (len(n), 1)), where=nl > 1e-9)

    # Predok musí smerovať na +X. Zdroje sa v tom nezhodujú, tak sa pýtame
    # geometrie: kabína sedí za stredom dĺžky, kapota pred ním, takže tá
    # polovica auta, ktorá je nižšia, je predok. Pri hatchbacku sú obe polovice
    # rovnako vysoké a odhad zlyhá, preto sa dá prebiť cez --front.
    mid = q[:, 0] < q[:, 0].max() / 2
    flip = q[mid, 2].mean() > q[~mid, 2].mean() if front == 'auto' else front == 'high'
    if flip:
        q[:, 0] = q[:, 0].max() - q[:, 0]
        q[:, 1] = -q[:, 1]
        n[:, 0] = -n[:, 0]
        n[:, 1] = -n[:, 1]
        print('model otočený: predok bol vzadu')

    xyz = np.rint(np.stack([q[:, 0], q[:, 1], np.maximum(0, q[:, 2])], axis=1)).astype('<i2')
    nrm = np.rint(np.clip(n, -1, 1) * 32767).astype('<i2')
    out = np.empty((len(q), 16), dtype=np.uint8)
    out[:, 0:6] = xyz.view(np.uint8).reshape(-1, 6)
    out[:, 6:12] = nrm.view(np.uint8).reshape(-1, 6)
    out[:, 12:15] = C
    out[:, 15] = M
    data = gzip.compress(out.tobytes(), mtime=0)
    pathlib.Path(dst).write_bytes(data)
    print(dst, len(q) // 3, 'triangles,', len(data), 'bytes gzip')
    print('bounds', [int(v) for v in xyz.min(axis=0)] + [int(v) for v in xyz.max(axis=0)])
    print('materiály:', {int(k): int(v) for k, v in zip(*np.unique(M, return_counts=True))})

if __name__ == '__main__':
    argv, args, prof, length, front = sys.argv[1:], [], 'superb', None, 'auto'
    width = height = None
    while argv:
        a = argv.pop(0)
        if a == '--profile': prof = argv.pop(0)
        elif a == '--length': length = float(argv.pop(0))
        elif a == '--front': front = argv.pop(0)
        elif a == '--width': width = float(argv.pop(0))
        elif a == '--height': height = float(argv.pop(0))
        elif not a.startswith('--'): args.append(a)
    if len(args) < 2: raise SystemExit(__doc__)
    main(args[0], args[1], prof, '--keep-interior' in sys.argv,
         '--no-texture' not in sys.argv, length, front, width, height)
