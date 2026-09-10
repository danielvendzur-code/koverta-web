from pathlib import Path

TARGET = Path("konfigurator/soltec-premium.js")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def replace_exact_count(source: str, old: str, new: str, expected: int, label: str) -> str:
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} matches, found {count}")
    return source.replace(old, new)


source = TARGET.read_text(encoding="utf-8")
original = source

# Keep explicit painter bias for Soltec-only coplanar details. Koverta ignores it.
source = replace_once(
    source,
    """              paintLast: o.paintLast === true,\n              depthAvg,""",
    """              paintLast: o.paintLast === true,\n              /* Soltec uses explicit painter bias for deliberately adjacent or\n                 coplanar detail faces. Koverta keeps its existing ordering\n                 exactly unchanged. */\n              sortBias: model().kvGeom ? 0 : (Number.isFinite(Number(o.bias)) ? Number(o.bias) : 0),\n              depthAvg,""",
    "store Soltec sort bias",
)

source = replace_exact_count(
    source,
    "a.depthAvg - b.depthAvg || a.order - b.order",
    "a.depthAvg - b.depthAvg || (a.sortBias || 0) - (b.sortBias || 0) || a.order - b.order",
    2,
    "use Soltec sort bias in BSP leaves",
)

source = replace_once(
    source,
    "coplanar.sort((a, b) => a.order - b.order);",
    "coplanar.sort((a, b) => (a.sortBias || 0) - (b.sortBias || 0) || a.order - b.order);",
    "use Soltec sort bias for coplanar faces",
)

# World-space face planes are camera-independent. Cache them only for Soltec;
# Koverta's established BSP path remains byte-for-byte functionally unchanged.
source = replace_once(
    source,
    """          const planeFor = (face) => {\n            let n = faceNormal(face.w);""",
    """          const planeFor = (face) => {\n            /* A face plane is world-space geometry and does not depend on the\n               camera. During one Soltec BSP build the same candidate is tested\n               repeatedly, so cache its plane on the face. Koverta stays on the\n               established path. */\n            if (!model().kvGeom && face._spPlane) return face._spPlane;\n            let n = faceNormal(face.w);""",
    "cache Soltec BSP face planes",
)

source = replace_once(
    source,
    """            if (Math.hypot(n[0], n[1], n[2]) < 0.5) return null;\n            return { n, d: dot3(n, face.w[0]) };""",
    """            if (Math.hypot(n[0], n[1], n[2]) < 0.5) return null;\n            const plane = { n, d: dot3(n, face.w[0]) };\n            if (!model().kvGeom) face._spPlane = plane;\n            return plane;""",
    "persist Soltec BSP face plane cache",
)

# Add a stage-only hook for the Soltec regression. Koverta keeps full redraws.
source = replace_once(
    source,
    """          window.SP_TEST.redraw = () => { renderAll(); };\n          window.SP_TEST.snapshot = () => ({""",
    """          window.SP_TEST.redraw = () => { renderAll(); };\n          window.SP_TEST.redrawStage = () => { if (!model().kvGeom) drawStage(); else renderAll(); };\n          window.SP_TEST.snapshot = () => ({""",
    "add Soltec stage-only test hook",
)

# Camera orbit changes no configurator state. Soltec now redraws only its scene.
source = replace_once(
    source,
    """            lastX = e.clientX; lastY = e.clientY;\n            scheduleRender();""",
    """            lastX = e.clientX; lastY = e.clientY;\n            /* Camera drag changes only the view. Rebuilding all controls, price\n               rows and option groups on every pointer frame is unnecessary for\n               Soltec. Koverta deliberately keeps its existing full-render path. */\n            if (model().kvGeom) scheduleRender();\n            else scheduleStage();""",
    "use stage-only Soltec camera redraw",
)

# Releasing a louver/side hold should not rebuild Soltec's entire form.
source = replace_once(
    source,
    """          holdDir = 0;\n          renderAll();""",
    """          holdDir = 0;\n          /* Finishing a Soltec motion changes only moving geometry/readouts.\n             Do not rebuild the entire configurator UI at pointer release. */\n          if (model().kvGeom) renderAll();\n          else { drawStage(); syncLouver(); }""",
    "avoid full Soltec render after hold",
)

# The old animation changed the actual blade width as cos(angle) changed. That
# made rigid aluminium look elastic/wavy. Keep one fixed-width cross-section:
# the exposed upper face occupies at most one pitch and the remaining physical
# width is a fixed underlap underneath the neighbouring blade.
source = replace_once(
    source,
    """            /* Šírka, ktorou sa lamela naozaj kreslí. Jediné, čo maliarske\n               triedenie nevie rozhodnúť, sú dve plochy, ktoré sa prekrývajú a\n               ležia takmer v jednej rovine — vtedy sa medzi snímkami prehadzuje\n               ich poradie a lamely preblikávajú. Preto sa lamela kreslí vždy\n               nanajvýš tak široko, aby jej priemet do roviny strechy práve\n               vyplnil rozteč: pri dosadnutí je z lamiel súvislá rovná plocha,\n               pri otvorení plná lamela s medzerami, a medzi tým sa nikdy\n               neprekryjú. Prechod je spojitý, takže sa všetky lamely hýbu\n               rovnakou rýchlosťou a nič sa cestou nemení skokom.\n\n               Prekrytie, ktoré tu ubudne, je ten lap, ktorým lamela zapadá pod\n               susednú — ten aj v skutočnosti nie je vidieť. */\n            const najviac = (pitch / 2) / Math.max(0.2, Math.cos(ang));\n            const half = Math.min(bladeW / 2, najviac);\n            const otvorenie = Math.min(1, ang / Math.max(1e-6, LOUVER_MAX(beam, bladeW) * 0.2));\n            const dx = half * Math.cos(ang), dz = half * Math.sin(ang);""",
    """            /* Lamela je tuhé teleso: jej fyzická šírka sa počas pohybu\n               nesmie meniť. Zvyšok šírky nad roztečou je pevný tesniaci\n               podklad pod susednou lamelou, nie plocha, ktorá sa podľa uhla\n               rozťahuje a sťahuje. Tak zostane profil v každom snímku rovnaký\n               a pri zatvorení nevznikne veľký koplanárny prekryv. */\n            const fullHalf = bladeW / 2;\n            const overlap = Math.max(0, bladeW - Math.min(bladeW, pitch));\n            const topLeadS = -fullHalf + overlap;\n            const bladeUx = Math.cos(ang), bladeUz = Math.sin(ang);\n            const dx = fullHalf * bladeUx, dz = fullHalf * bladeUz;""",
    "replace elastic Soltec louver width",
)

source = replace_once(
    source,
    """            const t = blade.t;                     // blade thickness, along its own normal\n            const ox = t * dz / half, oz = -t * dx / half;""",
    """            const t = blade.t;                     // blade thickness, along its own normal\n            const ox = t * bladeUz, oz = -t * bladeUx;""",
    "keep rigid Soltec louver thickness normal",
)

source = replace_once(
    source,
    """              const x = i0 + pitch * (i + 0.5);\n              const aX = x - dx, aZ = mid - dz, bX = x + dx, bZ = mid + dz;""",
    """              const x = i0 + pitch * (i + 0.5);\n              const fullAX = x - dx, fullAZ = mid - dz;\n              const aX = x + topLeadS * bladeUx, aZ = mid + topLeadS * bladeUz;\n              const bX = x + dx, bZ = mid + dz;""",
    "build fixed Soltec louver underlap coordinates",
)

source = replace_once(
    source,
    """              const sX = (aX + bX) / 2 + ox, sZ = (aZ + bZ) / 2 + oz;\n              quad([[aX+ox,y1+lap,aZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[aX+ox,y0-lap,aZ+oz]], shade(louv, -0.04), layO);""",
    """              const sX = (fullAX + bX) / 2 + ox, sZ = (fullAZ + bZ) / 2 + oz;\n              quad([[fullAX+ox,y1+lap,fullAZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[fullAX+ox,y0-lap,fullAZ+oz]], shade(louv, -0.04), layO);""",
    "draw full rigid Soltec louver underside lead half",
)

source = replace_once(
    source,
    """              /* Tesniaca hrana, ktorou lamely dosadajú jedna na druhú. Pri\n                 dosadnutí by ležala v rovine hornej plochy a prekrývala ju,\n                 tak sa spolu s prekrytím stiahne na nulu a nekreslí sa. */\n              const lipX = dx * 0.16 * otvorenie, lipZ = dz * 0.16 * otvorenie;\n              if (otvorenie > 0.02)\n                quad([[aX,y0-lap,aZ],[aX+lipX,y0-lap,aZ+lipZ],[aX+lipX,y1+lap,aZ+lipZ],[aX,y1+lap,aZ]], shade(louv, -0.40), layO);""",
    """              /* Pevný tesniaci podklad uzatvára skutočnú šírku profilu.\n                 Pri zatvorení leží pod koncom susednej lamely, takže horné\n                 plochy sa iba stretnú na hrane a BSP nemusí deliť dve veľké\n                 koplanárne plochy. Celý tento profil sa potom iba otáča. */\n              if (overlap > 0.5)\n                quad([[fullAX+ox,y0-lap,fullAZ+oz],[aX,y0-lap,aZ],[aX,y1+lap,aZ],[fullAX+ox,y1+lap,fullAZ+oz]], shade(louv, -0.40), layO);""",
    "replace animated Soltec sealing lip with rigid underlap",
)

source = replace_once(
    source,
    """                const cx = (aX + bX) / 2 + ox, cz = (aZ + bZ) / 2 + oz;\n                const ux = dx / half, uz = dz / half;\n                const yc = (y0 + y1) / 2, hy = Math.min((y1 - y0) / 2 - 30, ledLen / 2);\n                const strip = (w, fill, bias) => quad([\n                  [cx - ux * w, yc - hy, cz - uz * w], [cx + ux * w, yc - hy, cz + uz * w],\n                  [cx + ux * w, yc + hy, cz + uz * w], [cx - ux * w, yc + hy, cz - uz * w]""",
    """                const cx = x + ox, cz = mid + oz;\n                const yc = (y0 + y1) / 2, hy = Math.min((y1 - y0) / 2 - 30, ledLen / 2);\n                const strip = (w, fill, bias) => quad([\n                  [cx - bladeUx * w, yc - hy, cz - bladeUz * w], [cx + bladeUx * w, yc - hy, cz + bladeUz * w],\n                  [cx + bladeUx * w, yc + hy, cz + bladeUz * w], [cx - bladeUx * w, yc + hy, cz - bladeUz * w]""",
    "anchor Soltec LED to rigid blade centerline",
)

# Soltec panel/canopy secondary members are physical geometry. Generate them at
# every camera elevation and let the roof/BSP occlude them instead of deleting
# them when the eye crosses the roof plane. The Koverta branch is above this
# block and is not modified.
source = replace_once(
    source,
    """            if (integratedFall || !fromAbove || glass) {\n              const lit = !fromAbove && state.ledSet && state.ledSet.on;\n              beamRuns.forEach((run) => {\n                const z = integratedFall ? integratedSecTop : secTop(run.center);\n                drawSec(run.a, run.b, z, model().secHex || frame);\n                if (lit) ledRect(run.a + rw * 0.32, run.a + rw * 0.68, inY0 + 40, inY1 - 40, z - rd, (state.ledSet || {}).type);\n              });\n            }""",
    """            {\n              /* Secondary members must not pop in/out at the camera/roof\n                 boundary. They always exist; the roof and BSP decide whether\n                 they are visible from the current view. */\n              const lit = state.ledSet && state.ledSet.on;\n              beamRuns.forEach((run) => {\n                const z = integratedFall ? integratedSecTop : secTop(run.center);\n                drawSec(run.a, run.b, z, model().secHex || frame);\n                if (lit) ledRect(run.a + rw * 0.32, run.a + rw * 0.68, inY0 + 40, inY1 - 40, z - rd, (state.ledSet || {}).type);\n              });\n            }""",
    "keep Soltec secondary members camera-independent",
)

# Louver LED geometry is already a downward-facing surface. Always construct it
# and let normal/BSP visibility decide; do not delete it at fromAbove.
source = replace_once(
    source,
    "const ledOn = !fromAbove && state.ledSet && state.ledSet.on;",
    "const ledOn = state.ledSet && state.ledSet.on;",
    "keep Soltec louver LED geometry camera-independent",
)

if source == original:
    raise RuntimeError("No changes were produced")

TARGET.write_text(source, encoding="utf-8")
print("Applied guarded Soltec smoothness patch; Koverta geometry and hard occlusion guards are unchanged.")
