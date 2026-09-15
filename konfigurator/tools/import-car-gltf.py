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
        ('material.002',    0, (34, 36, 39)),   # plášť pneumatiky
        # Disk je hliník, nie potlač. Vzorkovanie textúry po vrchole z neho
        # spravilo tmavú kašu: lúče sú v predlohe kreslené textúrou a sieť má
        # na disk len pár desiatok trojuholníkov, takže každý vrchol trafil
        # medzeru medzi lúčmi. Plný svetlý odtieň na materiáli 3 dá disku
        # kovový odlesk a tvar mu spraví jeho vlastná geometria.
        ('material.005',    3, ('spokes', (196, 202, 209), (36, 34, 33))),  # disk s lúčmi
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
    # G80 M3 nesie materiály len ako Material.0NN, takže ktorý je ktorý sa
    # zistilo z geometrie: 015 je jediná veľká zelená vrstva cez celú karosériu,
    # 029 sedí v pásme kolies po celom rázvore, 020 je dlhý úzky pás vysoko
    # (zasklenie), 003 je najširšia vrstva vôbec (zrkadlá) a 018/019 sú drobné
    # červené a biele kusy vpredu a vzadu.
    'g80': [
        ('material.015',    1, None),                 # lak
        ('material.029',    3, (198, 204, 210)),      # disky
        ('material.020',    2, (26, 32, 38)),         # zasklenie
        ('material.019',    4, (240, 244, 248)),      # svetlomety
        ('material.018',    4, (214, 30, 36)),        # koncové svetlá
        ('material.003',    3, (176, 182, 188)),      # zrkadlá
        ('material.017',    0, (34, 34, 36)),         # spodné lemy a nárazníky
        ('material.016',    0, (22, 23, 25)),         # pneumatiky a tmavé diely
        ('material.002',    0, (20, 21, 23)),
    ],
    # 208 má celý exteriér na jednom materiáli, takže sa vrstvy rozlišujú menom
    # siete. Karoséria si drží farbu z textúry — okná sú v nej namaľované,
    # takže lak z prepínača by prefarbil aj ich.
    'p208': [
        ('plane.000',       0, 'texture'),            # karoséria vrátane okien
        # Koleso je v predlohe jeden tmavý kotúč a textúra na ňom nemá lúče,
        # takže z neho po vzorkovaní ostala čierna placka. Disk sa preto
        # dostavia rovnako ako pri sedane.
        ('circle.000',      3, ('spokes', (198, 204, 210), (28, 29, 31))),
        ('sphere.001',      3, (176, 182, 188)),      # zrkadlá
        ('cube.004',        4, (240, 244, 248)),      # predné svetlá
        ('cube.003',        4, (214, 30, 36)),        # zadný svetelný pás
    ],
    # 911 pomenúva vrstvy poctivo, takže profil je len prepis mien. Interiér
    # a motor si zahodí sám cez INTERIOR. Pozor na poradie: 'car_vstd' je
    # predponou 'car_vstda', tak ide mriežka pred štandardné diely.
    'p911': [
        ('car_vpnt_',       1, None),                 # lak
        ('car_vgla_',       2, (26, 34, 42)),         # zasklenie
        ('car_vwhl_',       3, (206, 210, 214)),      # disky
        ('car_vlgt_',       4, (240, 244, 248)),      # svetlá
        ('calip_color',     0, (196, 154, 16)),       # brzdové strmene
        ('bl_rim',          3, (150, 154, 158)),
        ('wheel1a',         0, (24, 25, 27)),         # plášte
        ('car_vstda',       0, (18, 19, 21)),         # mriežka
        ('car_vstd_',       0, (56, 58, 62)),         # lemy a lišty
        ('standardsurface', 0, (16, 17, 19)),
    ],
    # Mini nesie karosériu na jednom materiáli s textúrou, ale má na ňu
    # štrnásťtisíc vrcholov, takže sa do nich textúra zmestí a nemá zmysel ju
    # prebiť lakom z prepínača. Zasklenie je zvlášť. Podložka pod autom nie je
    # súčasťou auta.
    'mini': [
        ('mcar_hull',       0, 'texture'),
        ('mcar_glass',      2, (26, 34, 42)),
        ('ground',       None, None),
    ],
    # Záhradná zostava, nie auto. Tri materiály: látka a drevo si nesú farbu
    # v textúre, kovový rám ju má vo faktore. Nič z toho sa neleskne ako lak,
    # tak je všetko matné - vonkajší nábytok je látka, prášková farba a drevo.
    'sofaset': [
        ('mato',            0, 'texture'),          # čalúnenie
        ('taxta',           0, 'texture'),          # drevo stolíka
        ('metal',           0, (46, 47, 49)),       # rám
    ],
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

def alloy_wheels(q, mask, bright, dark, spokes=5):
    """Postaviť na kolesá skutočný hliníkový disk.

    Lúče má predloha len v textúre a na samotný disk pripadá sotva sto
    trojuholníkov na koleso — na to sa vzor nedá ani vzorkovať z textúry, ani
    namaľovať po trojuholníkoch: v oboch prípadoch z disku ostane tmavá kaša
    alebo prázdny kotúč. Pôvodný kotúč preto stmavne (je to priehlbeň za
    lúčmi, kde v skutočnosti vidno brzdu) a pred neho sa postaví vygenerovaná
    hviezdica: ráfik po obvode, náboj v strede a medzi nimi lúče.

    Vracia (pozície, normály, farby) nových trojuholníkov, alebo None.
    """
    tri = q.reshape(-1, 3, 3).mean(axis=1)
    sel = mask.reshape(-1, 3).all(axis=1)
    if not sel.any(): return None
    idx = np.where(sel)[0]
    xs, ys = tri[idx, 0], tri[idx, 1]
    split = (xs.min() + xs.max()) / 2
    pos, nrm, col = [], [], []

    def fan(cx, cz, y, s, r0, r1, a0, a1, steps, colour):
        """Prstenec alebo výsek medzikružia v rovine kolesa, lícom von."""
        for i in range(steps):
            t0 = a0 + (a1 - a0) * i / steps
            t1 = a0 + (a1 - a0) * (i + 1) / steps
            p = [(cx + r0 * np.cos(t0), y, cz + r0 * np.sin(t0)),
                 (cx + r1 * np.cos(t0), y, cz + r1 * np.sin(t0)),
                 (cx + r1 * np.cos(t1), y, cz + r1 * np.sin(t1)),
                 (cx + r0 * np.cos(t1), y, cz + r0 * np.sin(t1))]
            order = [0, 1, 2, 0, 2, 3] if s > 0 else [0, 2, 1, 0, 3, 2]
            for k in order:
                pos.append(p[k]); nrm.append((0.0, float(s), 0.0)); col.append(colour)

    for front in (False, True):
        axle = (xs > split) == front
        if not axle.any(): continue
        for right in (False, True):
            group = idx[axle][(ys[axle] > 0) == right]
            if not len(group): continue
            cx = (tri[group, 0].min() + tri[group, 0].max()) / 2
            cz = (tri[group, 2].min() + tri[group, 2].max()) / 2
            radius = np.hypot(tri[group, 0] - cx, tri[group, 2] - cz).max()
            if radius < 40: continue
            s = 1.0 if right else -1.0
            # líce disku je to, ktoré je ďalej od stredu auta; hviezdica sadne
            # 3 mm pred neho, teda ešte hlboko vo vnútri pneumatiky
            face = q[np.repeat(sel, 3)][:, 1]
            y = (tri[group, 1].max() + 3) if right else (tri[group, 1].min() - 3)
            fan(cx, cz, y, s, radius * 0.86, radius, 0, 2 * np.pi, 36, bright)   # ráfik
            fan(cx, cz, y, s, 0, radius * 0.21, 0, 2 * np.pi, 18, bright)        # náboj
            for k in range(spokes):                                              # lúče
                mid = 2 * np.pi * k / spokes
                fan(cx, cz, y, s, radius * 0.20, radius * 0.87,
                    mid - 0.20, mid + 0.20, 3, bright)
    if not pos: return None
    return (np.array(pos, dtype=np.float64), np.array(nrm, dtype=np.float64),
            np.array(col, dtype=np.uint8))

def material_of(g, rules, index, mesh=''):
    """Materiál pre danú vrstvu. Pravidlo sa hľadá najprv podľa mena materiálu
    a keď tam nič nesedí, podľa mena siete: nejeden model zo Sketchfabu nesie
    celý exteriér na jedinom materiáli a jediné, čím sa kolesá líšia od karosérie,
    je meno siete."""
    if index is None: return 0, None, False
    name = (g['materials'][index].get('name') or '').lower()
    mesh = (mesh or '').lower()
    interior = any(k in name for k in INTERIOR) or any(k in mesh for k in INTERIOR)
    for key, mat, col in rules:
        if key in name:
            return mat, col, interior
    for key, mat, col in rules:
        if key in mesh:
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

    parts = []                                   # (pos, nrm, col, mat, tex, rim) po vrcholoch
    dropped = {'layer': 0, 'interior': 0}
    rim_spec = [None]
    rim_tone = next((c for k, m, c in rules if isinstance(c, tuple) and c and c[0] == 'spokes'), None)

    def walk(idx, parent):
        node = g['nodes'][idx]
        world = parent @ node_matrix(node)
        if 'mesh' in node:
            mesh_name = g['meshes'][node['mesh']].get('name') or node.get('name') or ''
            for prim in g['meshes'][node['mesh']]['primitives']:
                mat, col, interior = material_of(g, rules, prim.get('material'), mesh_name)
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
                rim = isinstance(col, tuple) and col and col[0] == 'spokes'
                if col == 'texture' and use_texture and 'TEXCOORD_0' in attrs:
                    rgb = atlas.sample(prim['material'], read_accessor(g, buf, attrs['TEXCOORD_0'])[idxs])
                if rgb is None:
                    if rim:
                        rimSpec = col
                        col = rimSpec[1]
                    elif col is None or col == 'texture':
                        pbr = g['materials'][prim['material']].get('pbrMetallicRoughness', {})
                        base = pbr.get('baseColorFactor', [0.6, 0.6, 0.6, 1])
                        col = tuple(int(round(255 * (v ** (1 / 2.2)))) for v in base[:3])
                    rgb = np.tile(np.array(col, dtype=np.uint8), (len(idxs), 1))
                parts.append((p3, n3, rgb.astype(np.uint8),
                              np.full(len(idxs), mat, dtype=np.uint8),
                              col == 'texture', rim))
                if rim: rim_spec[0] = (prim.get('material'),)
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
    rim_mask = np.concatenate([np.full(len(a[0]), bool(a[5])) for a in parts])

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

    if rim_tone is not None and rim_mask.any():
        built = alloy_wheels(q, rim_mask, rim_tone[1], rim_tone[2])
        # pôvodný kotúč ostáva ako tmavá priehlbeň za lúčmi
        C[rim_mask] = np.array(rim_tone[2], dtype=np.uint8)
        if built is not None:
            wp, wn, wc = built
            q = np.concatenate([q, wp])
            n = np.concatenate([n, wn])
            C = np.concatenate([C, wc])
            M = np.concatenate([M, np.full(len(wp), 3, dtype=np.uint8)])
            print('disky: dostavaných', len(wp) // 3, 'trojuholníkov hviezdice')

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
