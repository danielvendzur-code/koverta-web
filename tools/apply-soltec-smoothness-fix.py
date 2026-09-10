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

source = replace_once(
    source,
    """              paintLast: o.paintLast === true,\n              depthAvg,""",
    """              paintLast: o.paintLast === true,\n              /* Soltec uses explicit painter bias for intentionally coplanar\n                 details (most importantly closed overlapping louvers). Koverta\n                 keeps its existing ordering exactly unchanged. */\n              sortBias: model().kvGeom ? 0 : (Number.isFinite(Number(o.bias)) ? Number(o.bias) : 0),\n              depthAvg,""",
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

source = replace_once(
    source,
    """            /* Šírka, ktorou sa lamela naozaj kreslí. Jediné, čo maliarske\n               triedenie nevie rozhodnúť, sú dve plochy, ktoré sa prekrývajú a\n               ležia takmer v jednej rovine — vtedy sa medzi snímkami prehadzuje\n               ich poradie a lamely preblikávajú. Preto sa lamela kreslí vždy\n               nanajvýš tak široko, aby jej priemet do roviny strechy práve\n               vyplnil rozteč: pri dosadnutí je z lamiel súvislá rovná plocha,\n               pri otvorení plná lamela s medzerami, a medzi tým sa nikdy\n               neprekryjú. Prechod je spojitý, takže sa všetky lamely hýbu\n               rovnakou rýchlosťou a nič sa cestou nemení skokom.\n\n               Prekrytie, ktoré tu ubudne, je ten lap, ktorým lamela zapadá pod\n               susednú — ten aj v skutočnosti nie je vidieť. */\n            const najviac = (pitch / 2) / Math.max(0.2, Math.cos(ang));\n            const half = Math.min(bladeW / 2, najviac);""",
    """            /* Lamela je tuhé teleso: jej šírka sa počas otáčania nesmie\n               meniť. Predchádzajúce zmenšovanie šírky podľa cos(uhla) síce\n               odstránilo koplanárne prekrytie pri zatvorení, ale opticky\n               deformovalo každú lamelu počas pohybu a vytváralo efekt vlnenia.\n               Reálny prekryv v zatvorenej polohe preto zostáva v geometrii a\n               jeho stabilné poradie rieši deterministický sortBias nižšie. */\n            const half = bladeW / 2;""",
    "keep Soltec louvers rigid",
)

source = replace_once(
    source,
    """            lastX = e.clientX; lastY = e.clientY;\n            scheduleRender();""",
    """            lastX = e.clientX; lastY = e.clientY;\n            /* Camera drag changes only the view. Rebuilding all controls, price\n               rows and option groups on every pointer frame is unnecessary for\n               Soltec. Koverta deliberately keeps its existing full-render path. */\n            if (model().kvGeom) scheduleRender();\n            else scheduleStage();""",
    "use stage-only Soltec camera redraw",
)

source = replace_once(
    source,
    """          holdDir = 0;\n          renderAll();""",
    """          holdDir = 0;\n          /* Finishing a Soltec motion changes only moving geometry/readouts.\n             Do not rebuild the entire configurator UI at pointer release. */\n          if (model().kvGeom) renderAll();\n          else { drawStage(); syncLouver(); }""",
    "avoid full Soltec render after hold",
)

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

if source == original:
    raise RuntimeError("No changes were produced")

TARGET.write_text(source, encoding="utf-8")
print("Applied guarded Soltec smoothness patch; Koverta runtime branches are unchanged.")
