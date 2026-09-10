from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / 'konfigurator' / 'soltec-premium.js'
TEST = ROOT / 'konfigurator' / 'test' / 'soltec-all-models-regression.js'


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    return text.replace(old, new, 1)


s = JS.read_text(encoding='utf-8')

# Restore the pre-v2 default face edge policy. The global Soltec no-edge rule
# flattened every extrusion and made the roof/profile geometry read as crude
# polygons. We keep no-edge explicitly only on the Soltec perimeter surfaces.
s = once(s,
'''              /* Koverta keeps the established outline policy. Soltec
                 extrusions are continuous surfaces: a default SVG stroke on
                 every polygon created the diagonal/inner/outer lines visible
                 on the perimeter frame. Soltec outlines only an explicitly
                 requested seam. */
              edge: model().kvGeom ? o.edge !== false : o.edge === true,
              edgeCol: (model().kvGeom ? o.edge === false : o.edge !== true)
                ? null
                : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'''              edge: o.edge !== false,
              /* arris:false keeps the stroke but paints it in the face's own
                 colour, so members merge into one surface without a gap */
              edgeCol: o.edge === false ? null : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'restore normal edge policy')

# Perimeter ring only: no synthetic strokes, no crisp-edge faceting, and no
# camera culling on Soltec. It is a closed fixed extrusion; BSP resolves what is
# actually hidden. This prevents a rim web/cap disappearing at grazing angles
# without doubling every louver face.
s = once(s,
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, {
              normal: n, cull: true,
              edge: model().kvGeom ? undefined : false,
              seamless: !model().kvGeom
            });''',
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, {
              normal: n,
              cull: model().kvGeom,
              edge: model().kvGeom ? undefined : false
            });''',
'Soltec perimeter caps')
s = once(s,
'''              quad(pts, vonku ? hex : spodok, {
                normal: n, cull: true, arris: false,
                edge: model().kvGeom ? undefined : false,
                seamless: !model().kvGeom
              });''',
'''              quad(pts, vonku ? hex : spodok, {
                normal: n,
                cull: model().kvGeom,
                arris: false,
                edge: model().kvGeom ? undefined : false
              });''',
'Soltec perimeter webs')

# Add an opt-in two-sided mode to boxFaces. Default semantics remain identical.
s = once(s,
'''          const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop, cleanSurface) => {
            const X = x + dx, Y = y + dy, Z = z + dz;
            const s = skip || [], fl = flat || [];
            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, {
              normal: n, cull: true, arris: fl.indexOf(key) < 0, bias: bias || 0,''',
'''          const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop, cleanSurface, twoSided) => {
            const X = x + dx, Y = y + dy, Z = z + dz;
            const s = skip || [], fl = flat || [];
            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, {
              normal: n, cull: twoSided === true ? false : true, arris: fl.indexOf(key) < 0, bias: bias || 0,''',
'boxFaces two-sided option')

# Fixed Soltec panel-roof secondary members: all six faces, clean contact
# surface, and two-sided only for these structural members. This is the narrow
# fix for profiles disappearing end-on; Koverta and every other box keep their
# original culling path.
s = once(s,
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, [], SHAFT, 0, false, true);''',
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, [], SHAFT, 0, false, true, true);''',
'fixed Soltec profile persistence')

# Louvers must end at the inside face of the perimeter rail. The historical
# 30 mm geometric penetration required BSP to decide between two intersecting
# solids and is the source of the dark triangular teeth painted over the rim.
s = once(s,
'''            const lap = 30;   // blades tuck under the rails rather than butting them''',
'''            /* The blade terminates at the inside rail face. Do not make the
               visible polygon penetrate the perimeter extrusion: intersecting
               solids are exactly what produced the saw-tooth rim and profiles
               apparently disappearing during orbit. The real concealed seat is
               not a visible surface in this renderer. */
            const lap = 0;''',
'no visible louver/frame penetration')

# The current underside is intentionally uniform (no fake shadow colour). Keep
# that, but restore geometric anti-aliasing instead of raw flat paint; the base
# shade stays single and stable while edges stop looking like cut paper.
s = once(s,
'''              const underFlatO = Object.assign({}, underO, { raw: true, edge: false });
              const edgeO = Object.assign({}, layO, { raw: true, edge: false });''',
'''              const underFlatO = Object.assign({}, underO, { edge: false });
              const edgeO = Object.assign({}, layO, { edge: false });''',
'lamella material rendering')

# Preserve the full physical underside for almost the whole motion. The hidden
# overlap is clipped only in the last 4 % approaching the exactly-horizontal
# stop, which is where coplanar jitter exists. This avoids the visually narrow
# blade during normal opening while retaining the improved close endpoint.
s = once(s,
'''            const revealK = Math.max(0, Math.min(1, state.louverT / 0.12));''',
'''            const revealK = Math.max(0, Math.min(1, state.louverT / 0.04));''',
'limit close-end underlap clipping')

JS.write_text(s, encoding='utf-8')

# Strengthen the source contract so a future cleanup cannot reintroduce frame
# penetration or global Soltec flattening.
t = TEST.read_text(encoding='utf-8')
anchor = "  assert.match(source, /const fullHalf = bladeW \\/ 2;/, 'Bioclimatic blades must keep their physical width while rotating');"
if anchor not in t:
    raise SystemExit('test anchor missing')
insert = anchor + "\n  assert.match(source, /const lap = 0;/, 'Visible louvers must not intersect the perimeter rail');\n  assert.match(source, /cull: model\\(\\)\\.kvGeom,\\n\\s*edge: model\\(\\)\\.kvGeom \\? undefined : false/, 'Soltec perimeter faces must persist without synthetic rim strokes');"
t = t.replace(anchor, insert, 1)
TEST.write_text(t, encoding='utf-8')

print('Applied Soltec visual restore v3')
