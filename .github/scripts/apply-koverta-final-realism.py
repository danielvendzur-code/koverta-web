from __future__ import annotations

from pathlib import Path

TARGET = Path("konfigurator/soltec-premium.js")
source = TARGET.read_text(encoding="utf-8")

MARKER = "Koverta final realism: true corrugated shell"
if MARKER in source:
    print("Koverta final-realism patch already applied; no source changes needed.")
    raise SystemExit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    source = source.replace(old, new, 1)


def replace_between(start: str, end: str, replacement: str, label: str) -> None:
    global source
    start_count = source.count(start)
    end_count = source.count(end)
    if start_count != 1 or end_count != 1:
        raise RuntimeError(
            f"{label}: expected one start/end marker, found start={start_count}, end={end_count}"
        )
    a = source.index(start)
    b = source.index(end, a)
    source = source[:a] + replacement + source[b:]


# 1) Remove the Koverta-only painter-order escape hatch. The structure must be
# ordered only by its world-space faces/BSP, never by a forced final pass.
replace_once(
    """              /* Koverta-only occlusion guard for the thin top fascia arm.\n                 This flag is opt-in; no Soltec caller sets it. */\n              paintLast: o.paintLast === true,\n""",
    "",
    "remove face paintLast flag",
)
replace_once(
    "const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop, paintLast) => {",
    "const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop) => {",
    "remove boxFaces paintLast argument",
)
replace_once(
    """              seamless: seamlessTop === true && key === '+z',\n              paintLast: paintLast === true\n""",
    """              seamless: seamlessTop === true && key === '+z'\n""",
    "remove boxFaces paintLast propagation",
)
replace_once(
    """              const put = (u0, u1, z, dz, seamlessTop, paintLast) => {\n                if (axis === 'x') boxFaces(Math.min(u0, u1), a, z, Math.abs(u1 - u0), b - a, dz, frame, [], SHAFT, 0, seamlessTop, paintLast);\n                else boxFaces(a, Math.min(u0, u1), z, b - a, Math.abs(u1 - u0), dz, frame, [], SHAFT, 0, seamlessTop, paintLast);\n              };\n""",
    """              const put = (u0, u1, z, dz, seamlessTop) => {\n                if (axis === 'x') boxFaces(Math.min(u0, u1), a, z, Math.abs(u1 - u0), b - a, dz, frame, [], SHAFT, 0, seamlessTop);\n                else boxFaces(a, Math.min(u0, u1), z, b - a, Math.abs(u1 - u0), dz, frame, [], SHAFT, 0, seamlessTop);\n              };\n""",
    "remove fascia paintLast plumbing",
)
replace_once(
    "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true, nadStrechou);  // horné rameno",
    "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true);  // horné rameno",
    "remove fascia angle-dependent final pass",
)
replace_once(
    """          const stavbaBezna = stavba.filter((f) => !f.paintLast);\n          const stavbaNeskor = stavba.filter((f) => f.paintLast);\n          bspPaintOrder(podklad).concat(bspPaintOrder(stavbaBezna), bspPaintOrder(stavbaNeskor)).forEach((f) => {\n""",
    """          bspPaintOrder(podklad).concat(bspPaintOrder(stavba)).forEach((f) => {\n""",
    "remove final painter-order split",
)

# 2) Koverta sub-roof geometry is generated at every camera elevation. Normal
# back-face culling remains standard rendering; parts are no longer conditionally
# omitted merely because the eye is above the roof plane.
replace_once(
    "if (BIO.headPlates && !nadStrechou) {",
    "if (BIO.headPlates) {",
    "always generate head plates",
)
replace_once(
    "const bokom = !(podStrechou && nadStrechou);",
    "const bokom = true;",
    "always generate Koverta C-profile side faces",
)
replace_once(
    """            if (!nadStrechou) {\n              cProfil('y', RAM_VSUN, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, 1);\n              cProfil('y', W - RAM_VSUN - RAM_PAR, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, -1);\n              cProfil('x', RAM_ZAD, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, 1);\n              cProfil('x', rx1 - RAM_PAR, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, -1);\n            }\n""",
    """            cProfil('y', RAM_VSUN, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, 1);\n            cProfil('y', W - RAM_VSUN - RAM_PAR, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, -1);\n            cProfil('x', RAM_ZAD, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, 1);\n            cProfil('x', rx1 - RAM_PAR, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, -1);\n""",
    "always generate perimeter C profiles",
)
replace_once(
    "const podStrechu = !nadStrechou;",
    "const podStrechu = true;",
    "always generate connectors and fasteners",
)
replace_once(
    """              if (!nadStrechou)\n                cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);\n""",
    """              cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);\n""",
    "always generate purlins",
)
replace_once(
    """                if (nadStrechou) return;\n                boxFaces(x, y, ledZ, dx, dy, ledT, ledProfile, [], SHAFT);\n""",
    """                boxFaces(x, y, ledZ, dx, dy, ledT, ledProfile, [], SHAFT);\n""",
    "always generate Koverta LED profile geometry",
)

# 3) Main structural plates follow the selected Koverta finish. Fastener heads
# remain independently shaded/metallic where the existing renderer already does so.
replace_once(
    """                const pl = Number(model().plate) || Math.round(Math.max(pd, pw) * 1.6);\n                const pth = Math.max(8, Math.round(pl * 0.05));\n                const cx = px + pd / 2, cy = py + pw / 2;\n                boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, '#c9ccce', ['-z'], SHAFT);\n""",
    """                const pl = Number(model().plate) || Math.round(Math.max(pd, pw) * 1.6);\n                const pth = Math.max(8, Math.round(pl * 0.05));\n                const cx = px + pd / 2, cy = py + pw / 2;\n                const plateHex = frame;\n                boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, plateHex, ['-z'], SHAFT);\n""",
    "base plate uses structure finish",
)
replace_once(
    """                  boxFaces(px - g, py - g, pth, pd + 2 * g, pw + 2 * g, objH,\n                           shade('#c9ccce', -0.06), ['+z', '-z'], SHAFT);\n""",
    """                  boxFaces(px - g, py - g, pth, pd + 2 * g, pw + 2 * g, objH,\n                           plateHex, ['+z', '-z'], SHAFT);\n""",
    "base sleeve uses structure finish",
)
replace_once(
    "const hlava = model().rimSoffitHex ? shade(model().rimSoffitHex, -0.06) : shade(frame, -0.30);",
    "const hlava = frame;",
    "head plate uses structure finish",
)

# 4) Koverta slat walls get a frame only around the actual slat field. Nothing is
# drawn as a random ground rail. The slats stay segmented at real post cuts and
# their frame terminates against those same bay/post faces.
replace_once(
    """              // guides down both sides of the bay and the head over the top\n              memb(0, gt, 0, zHead, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n              memb(1 - gt, 1, 0, zHead, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n              memb(0, 1, zHead - headTop, zHead, 0, kind === 'zip' ? Math.round(gw * 1.15) : gw, railHex, endsX, SHAFT);\n\n              const zTop = zHead - headTop;\n              /* A door runs to the floor - it is the way out. Only the fixed\n                 walls stand off it, which is where that reveal belongs. */\n              const onFloor = kind === 'zip' || kind === 'g1' || kind === 'g2'\n                           || kind === 'h50l' || kind === 'h50a';\n              const zBase = onFloor ? 0 : Math.round(gw * 0.55);\n              if (kind !== 'zip') memb(gt, 1 - gt, 0, zBase, 0, gw, shade(sideHex, -0.14), endsX, SHAFT);\n""",
    """              const kvSlatWall = Boolean(KV_MAT[kind]);\n              let zTop;\n              let zBase;\n              if (kvSlatWall) {\n                /* Real Koverta slat realizations frame only the slat field. The\n                   lower member is therefore hundreds of millimetres above the\n                   floor with the first slat, never a rail lying on the ground. */\n                zBase = Math.max(0, KV_SLAT.od);\n                zTop = Math.min(zHead, KV_SLAT.po);\n                const frameZ0 = zBase;\n                const frameZ1 = Math.max(frameZ0 + gw, zTop);\n                memb(0, gt, frameZ0, frameZ1, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n                memb(1 - gt, 1, frameZ0, frameZ1, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n                memb(0, 1, frameZ0, Math.min(frameZ1, frameZ0 + gw), 0, gw, railHex, endsX, SHAFT);\n                memb(0, 1, Math.max(frameZ0, frameZ1 - gw), frameZ1, 0, gw, railHex, endsX, SHAFT);\n              } else {\n                // guides down both sides of the bay and the head over the top\n                memb(0, gt, 0, zHead, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n                memb(1 - gt, 1, 0, zHead, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n                memb(0, 1, zHead - headTop, zHead, 0, kind === 'zip' ? Math.round(gw * 1.15) : gw, railHex, endsX, SHAFT);\n\n                zTop = zHead - headTop;\n                /* A door runs to the floor - it is the way out. Only the fixed\n                   walls stand off it, which is where that reveal belongs. */\n                const onFloor = kind === 'zip' || kind === 'g1' || kind === 'g2'\n                             || kind === 'h50l' || kind === 'h50a';\n                zBase = onFloor ? 0 : Math.round(gw * 0.55);\n                if (kind !== 'zip') memb(gt, 1 - gt, 0, zBase, 0, gw, shade(sideHex, -0.14), endsX, SHAFT);\n              }\n""",
    "remove Koverta slat ground rail",
)

# 5) Replace the flat/fake top treatment with two real corrugated shell surfaces.
# The overall profile height remains TRAP_H from the active reference. A tiny
# renderer-only skin separation prevents coplanar z-fighting; it is not exposed as
# a product/material thickness. Upper faces that are permanently enclosed by the
# opaque fascia are never emitted, independent of camera angle.
trap_start = "            /* Skutočný 3D profil podhľadu.\n"
trap_end = "            /* Žiadne plošné „kontaktné tiene“ ani 2 mm spojové pruhy na\n"
trap_replacement = """            /* Koverta final realism: true corrugated shell.\n               Výška profilu ostáva výhradne TRAP_H z aktívnej referencie a\n               rozdelenie vlny používa tie isté rendererové vizuálne proporcie\n               ako doteraz. Horná aj spodná strana však teraz sledujú rovnakú\n               skutočnú geometriu: koruna, šikmé ramená a údolie. Neexistuje\n               žiadna rovná horná doska s namaľovanými pásmi.\n\n               TRAP_SKIN_VIS je iba malá separácia dvoch renderovaných povrchov,\n               aby sa navzájom nebili v rasteri; nie je to deklarovaná výrobná\n               hrúbka plechu. Celkové min/max Z ostáva trapBot..trapTop. */\n            const vlnRoztec = TRAP_KRYT / 5;\n            const RIB_CROWN_VIS = 15;\n            const RIB_SHOULDER_VIS = 44;\n            const TRAP_SKIN_VIS = Math.max(1.2, Math.min(2.4, TRAP_H * 0.05));\n\n            const trapProfile01 = (y) => {\n              const raw = ty1 - y;\n              const phase = ((raw % vlnRoztec) + vlnRoztec) % vlnRoztec;\n              const d = Math.min(phase, vlnRoztec - phase);\n              if (d <= RIB_CROWN_VIS) return 1;\n              if (d >= RIB_SHOULDER_VIS) return 0;\n              return 1 - (d - RIB_CROWN_VIS) / (RIB_SHOULDER_VIS - RIB_CROWN_VIS);\n            };\n            const trapUpperZ = (y) =>\n              trapBot + TRAP_SKIN_VIS + (TRAP_H - TRAP_SKIN_VIS) * trapProfile01(y);\n            const trapLowerZ = (y) => trapUpperZ(y) - TRAP_SKIN_VIS;\n\n            const trapBreaks = (y0, y1) => {\n              const cuts = [y0, y1];\n              const first = Math.floor((ty1 - y1) / vlnRoztec) - 1;\n              const last = Math.ceil((ty1 - y0) / vlnRoztec) + 1;\n              for (let k = first; k <= last; k++) {\n                const axis = ty1 - k * vlnRoztec;\n                [-RIB_SHOULDER_VIS, -RIB_CROWN_VIS, RIB_CROWN_VIS, RIB_SHOULDER_VIS].forEach((off) => {\n                  const y = axis + off;\n                  if (y > y0 + 1e-6 && y < y1 - 1e-6) cuts.push(y);\n                });\n              }\n              cuts.sort((a, b) => a - b);\n              return cuts.filter((v, i) => !i || Math.abs(v - cuts[i - 1]) > 1e-6);\n            };\n\n            const drawTrapSurface = (x0, x1, y0, y1, zAt, hex, upward) => {\n              if (x1 <= x0 || y1 <= y0) return;\n              const cuts = trapBreaks(y0, y1);\n              for (let i = 0; i < cuts.length - 1; i++) {\n                const a = cuts[i], b = cuts[i + 1];\n                const za = zAt(a), zb = zAt(b);\n                const pts = upward\n                  ? [[x0, a, za], [x1, a, za], [x1, b, zb], [x0, b, zb]]\n                  : [[x0, a, za], [x0, b, zb], [x1, b, zb], [x1, a, za]];\n                quad(pts, hex, {\n                  normal: faceNormal(pts),\n                  cull: true,\n                  edge: false,\n                  seamless: true\n                });\n              }\n            };\n\n            /* Spodná škrupina ide po plnom Expivi pôdoryse plechu. Hornú\n               škrupinu netreba generovať tam, kde je navždy fyzicky uzavretá\n               pod nepriehľadným lemovaním; táto topologická redukcia nezávisí\n               od kamery. V odkrytom poli je horný profil plne 3D. */\n            drawTrapSurface(tx0, tx1, ty0, ty1, trapLowerZ, spodHex, false);\n            drawTrapSurface(vx0, vx1, vy0, vy1, trapUpperZ, vrchHex, true);\n\n"""
replace_between(trap_start, trap_end, trap_replacement, "replace fake trapezoid top with real shell")

# 6) Drainage: replace the long sloping transition with a short orthogonal elbow
# near the roof, then a vertical drop beside the active corner post. Finish at the
# ground with a rounded elbow whose final segment is horizontal and remains inside
# the roof footprint.
replace_once(
    """              const prechodX = Math.abs(xVytok - xRura);\n              const prechodZ = Math.max(rz * 2.2, prechodX * 1.15 + rz * 1.8);\n              const zKoleno = zBot - prechodZ;\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(55, rz * 2.25);\n""",
    """              const prechodX = Math.abs(xVytok - xRura);\n              const prechodZ = Math.max(52, rz * 1.55);\n              const zKoleno = zBot - prechodZ;\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(55, rz * 2.25);\n""",
    "shorten upper downpipe transition",
)
replace_once(
    """              const lom = [[xVytok, yZvod, zlBot + Math.max(4, rz * 0.12)]];\n              if (Math.abs(xVytok - xRura) > 2) {\n                lom.push([xVytok, yZvod, zBot - rz * 0.75]);\n                lom.push([xRura, yZvod, zKoleno]);\n              }\n              lom.push([xRura, yZvod, zPata]);\n              lom.push([xRura + RP * 0.92, yZvod, zPata - RP * 0.62]);\n              const draha = zaobli(lom, RP, 7);\n""",
    """              const startZ = zlBot + Math.max(4, rz * 0.12);\n              const lom = [[xVytok, yZvod, startZ]];\n              /* Krátke hrdlo, potom pravouhlé koleno k stĺpu. Žiadna dlhá\n                 diagonála cez otvorený priestor. */\n              lom.push([xVytok, yZvod, zKoleno]);\n              if (Math.abs(xVytok - xRura) > 2) lom.push([xRura, yZvod, zKoleno]);\n              lom.push([xRura, yZvod, zPata]);\n\n              const footClear = Math.max(0, L - xRura - rz - 5);\n              const footRun = Math.min(RP * 0.82, footClear);\n              const footZ = Math.max(rz + 6, zPata - Math.min(RP * 0.62, zPata - rz - 6));\n              if (footRun > 2) {\n                const bendRun = Math.min(footRun * 0.45, RP * 0.34);\n                lom.push([xRura + bendRun, yZvod, footZ]);\n                lom.push([xRura + footRun, yZvod, footZ]);\n              } else {\n                lom.push([xRura, yZvod, footZ]);\n              }\n              const draha = zaobli(lom, RP, 7);\n""",
    "orthogonal upper elbow and horizontal ground outlet",
)
replace_once(
    """                  angleDeg: prechodX > 2\n                    ? Math.atan2(prechodZ, prechodX) * 180 / Math.PI\n                    : 90\n""",
    """                  /* The transition is now an orthogonal elbow, not one\n                     straight diagonal segment. */\n                  angleDeg: 90\n""",
    "downpipe transition metadata reflects orthogonal elbow",
)

# Guard the non-negotiable technical/product invariants before writing.
for required in [
    "postAxes: [72,2928,5784]",
    "postAxes: [72,2528,4984]",
    "catalog:14069",
    "catalog:14192",
    "catalog:14198",
    "const rohovy = Boolean(rz.roh);",
    "const kovertaContact = Boolean(kvBand());",
]:
    if required not in source.replace(" ", "") if "postAxes:" in required else required not in source:
        raise RuntimeError(f"Required invariant missing after patch: {required}")

if "paintLast" in source:
    raise RuntimeError("paintLast still exists after patch")

TARGET.write_text(source, encoding="utf-8")
print("Applied Koverta final-realism patch to", TARGET)
