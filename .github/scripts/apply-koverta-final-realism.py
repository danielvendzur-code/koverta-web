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


# Koverta must not use the shared paintLast facility. Keep the shared facility
# itself byte-compatible for Soltec; remove only the Koverta fascia call site.
replace_once(
    "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true, nadStrechou);  // horné rameno",
    "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true);  // horné rameno",
    "remove Koverta fascia paintLast use",
)

# Head plates are Koverta-only in the active config. Make the condition explicit
# so any non-Koverta consumer retains the old camera guard exactly.
replace_once(
    "if (BIO.headPlates && !nadStrechou) {",
    "if (BIO.headPlates && (model().roofKit === 'koverta' || !nadStrechou)) {",
    "make Koverta head plates view-independent",
)

# Base/head plate finish: only Koverta changes to the selected structure RAL.
replace_once(
    """                const pl = Number(model().plate) || Math.round(Math.max(pd, pw) * 1.6);\n                const pth = Math.max(8, Math.round(pl * 0.05));\n                const cx = px + pd / 2, cy = py + pw / 2;\n                boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, '#c9ccce', ['-z'], SHAFT);\n""",
    """                const pl = Number(model().plate) || Math.round(Math.max(pd, pw) * 1.6);\n                const pth = Math.max(8, Math.round(pl * 0.05));\n                const cx = px + pd / 2, cy = py + pw / 2;\n                const plateHex = model().roofKit === 'koverta' ? frame : '#c9ccce';\n                boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, plateHex, ['-z'], SHAFT);\n""",
    "Koverta base plate structure finish",
)
replace_once(
    """                  boxFaces(px - g, py - g, pth, pd + 2 * g, pw + 2 * g, objH,\n                           shade('#c9ccce', -0.06), ['+z', '-z'], SHAFT);\n""",
    """                  boxFaces(px - g, py - g, pth, pd + 2 * g, pw + 2 * g, objH,\n                           model().roofKit === 'koverta' ? plateHex : shade('#c9ccce', -0.06), ['+z', '-z'], SHAFT);\n""",
    "Koverta base sleeve structure finish",
)
replace_once(
    "const hlava = model().rimSoffitHex ? shade(model().rimSoffitHex, -0.06) : shade(frame, -0.30);",
    "const hlava = model().roofKit === 'koverta' ? frame : (model().rimSoffitHex ? shade(model().rimSoffitHex, -0.06) : shade(frame, -0.30));",
    "Koverta head plate structure finish",
)

# Inside drawKovertaRoof all of these parts are physically under the opaque roof.
# Generate them for every camera elevation and let world-space BSP/back-face
# culling resolve visibility instead of deleting geometry based on the camera.
replace_once(
    "const bokom = !(podStrechou && nadStrechou);",
    "const bokom = true;",
    "view-independent Koverta C-profile faces",
)
replace_once(
    """            if (!nadStrechou) {\n              cProfil('y', RAM_VSUN, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, 1);\n              cProfil('y', W - RAM_VSUN - RAM_PAR, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, -1);\n              cProfil('x', RAM_ZAD, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, 1);\n              cProfil('x', rx1 - RAM_PAR, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, -1);\n            }\n""",
    """            cProfil('y', RAM_VSUN, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, 1);\n            cProfil('y', W - RAM_VSUN - RAM_PAR, RAM_PAR, ramBot, RAM_H, RAM_ZAD + 2, rx1 - 2, C_WEB, 0, false, true, -1);\n            cProfil('x', RAM_ZAD, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, 1);\n            cProfil('x', rx1 - RAM_PAR, RAM_PAR, ramBot, RAM_H, ry0, ry1, C_WEB, 0, false, true, -1);\n""",
    "view-independent Koverta perimeter profiles",
)
replace_once(
    "const podStrechu = !nadStrechou;",
    "const podStrechu = true;",
    "view-independent Koverta connectors",
)
replace_once(
    """              if (!nadStrechou)\n                cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);\n""",
    """              cProfil('x', os - VAZ_W, VAZ_W * 2, ramTop - VAZ_H, VAZ_H, inY0, inY1, C_WEB, 5, true, true);\n""",
    "view-independent Koverta purlins",
)
replace_once(
    """                if (nadStrechou) return;\n                boxFaces(x, y, ledZ, dx, dy, ledT, ledProfile, [], SHAFT);\n""",
    """                boxFaces(x, y, ledZ, dx, dy, ledT, ledProfile, [], SHAFT);\n""",
    "view-independent Koverta LED geometry",
)

# Koverta slat walls: frame the actual slat field only. This removes the
# invented rail on the floor while keeping all other side systems unchanged.
replace_once(
    """              // guides down both sides of the bay and the head over the top\n              memb(0, gt, 0, zHead, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n              memb(1 - gt, 1, 0, zHead, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n              memb(0, 1, zHead - headTop, zHead, 0, kind === 'zip' ? Math.round(gw * 1.15) : gw, railHex, endsX, SHAFT);\n\n              const zTop = zHead - headTop;\n              /* A door runs to the floor - it is the way out. Only the fixed\n                 walls stand off it, which is where that reveal belongs. */\n              const onFloor = kind === 'zip' || kind === 'g1' || kind === 'g2'\n                           || kind === 'h50l' || kind === 'h50a';\n              const zBase = onFloor ? 0 : Math.round(gw * 0.55);\n              if (kind !== 'zip') memb(gt, 1 - gt, 0, zBase, 0, gw, shade(sideHex, -0.14), endsX, SHAFT);\n""",
    """              const kvSlatWall = model().roofKit === 'koverta' && Boolean(KV_MAT[kind]);\n              let zTop;\n              let zBase;\n              if (kvSlatWall) {\n                /* Koverta lamely majú rám iba okolo skutočného poľa lamiel.\n                   Spodný profil preto začína pri poli lamiel, nie na zemi. */\n                zBase = Math.max(0, KV_SLAT.od);\n                zTop = Math.min(zHead, KV_SLAT.po);\n                const frameZ0 = zBase;\n                const frameZ1 = Math.max(frameZ0 + gw, zTop);\n                memb(0, gt, frameZ0, frameZ1, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n                memb(1 - gt, 1, frameZ0, frameZ1, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n                memb(0, 1, frameZ0, Math.min(frameZ1, frameZ0 + gw), 0, gw, railHex, endsX, SHAFT);\n                memb(0, 1, Math.max(frameZ0, frameZ1 - gw), frameZ1, 0, gw, railHex, endsX, SHAFT);\n              } else {\n                // guides down both sides of the bay and the head over the top\n                memb(0, gt, 0, zHead, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);\n                memb(1 - gt, 1, 0, zHead, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);\n                memb(0, 1, zHead - headTop, zHead, 0, kind === 'zip' ? Math.round(gw * 1.15) : gw, railHex, endsX, SHAFT);\n\n                zTop = zHead - headTop;\n                /* A door runs to the floor - it is the way out. Only the fixed\n                   walls stand off it, which is where that reveal belongs. */\n                const onFloor = kind === 'zip' || kind === 'g1' || kind === 'g2'\n                             || kind === 'h50l' || kind === 'h50a';\n                zBase = onFloor ? 0 : Math.round(gw * 0.55);\n                if (kind !== 'zip') memb(gt, 1 - gt, 0, zBase, 0, gw, shade(sideHex, -0.14), endsX, SHAFT);\n              }\n""",
    "Koverta slat frame without ground rail",
)

# True corrugated sheet shell. TRAP_H and TRAP_KRYT remain active reference data.
# The crown/shoulder values are pre-existing renderer proportions; they are not
# presented as manufacturing dimensions. The tiny skin separation is likewise
# renderer-only and keeps the total shell inside trapBot..trapTop.
trap_start = "            /* Skutočný 3D profil podhľadu.\n"
trap_end = "            /* Žiadne plošné „kontaktné tiene“ ani 2 mm spojové pruhy na\n"
trap_replacement = """            /* Koverta final realism: true corrugated shell.\n               TRAP_H a TRAP_KRYT ostávajú výhradne z aktívnej referencie.\n               Horná aj spodná strana sledujú rovnakú skutočnú geometriu:\n               koruna, šikmé ramená a údolie — nie rovnú plochu s pásmi.\n\n               TRAP_SKIN_VIS je iba rendererová separácia dvoch povrchov proti\n               z-fightingu, nie deklarovaná výrobná hrúbka. Celý profil zostáva\n               v pôvodnom rozsahu trapBot..trapTop. */\n            const vlnRoztec = TRAP_KRYT / 5;\n            const RIB_CROWN_VIS = 15;\n            const RIB_SHOULDER_VIS = 44;\n            const TRAP_SKIN_VIS = Math.max(1.2, Math.min(2.4, TRAP_H * 0.05));\n\n            const trapProfile01 = (y) => {\n              const raw = ty1 - y;\n              const phase = ((raw % vlnRoztec) + vlnRoztec) % vlnRoztec;\n              const d = Math.min(phase, vlnRoztec - phase);\n              if (d <= RIB_CROWN_VIS) return 1;\n              if (d >= RIB_SHOULDER_VIS) return 0;\n              return 1 - (d - RIB_CROWN_VIS) / (RIB_SHOULDER_VIS - RIB_CROWN_VIS);\n            };\n            const trapUpperZ = (y) =>\n              trapBot + TRAP_SKIN_VIS + (TRAP_H - TRAP_SKIN_VIS) * trapProfile01(y);\n            const trapLowerZ = (y) => trapUpperZ(y) - TRAP_SKIN_VIS;\n\n            const trapBreaks = (y0, y1) => {\n              const cuts = [y0, y1];\n              const first = Math.floor((ty1 - y1) / vlnRoztec) - 1;\n              const last = Math.ceil((ty1 - y0) / vlnRoztec) + 1;\n              for (let k = first; k <= last; k++) {\n                const axis = ty1 - k * vlnRoztec;\n                [-RIB_SHOULDER_VIS, -RIB_CROWN_VIS, RIB_CROWN_VIS, RIB_SHOULDER_VIS].forEach((off) => {\n                  const y = axis + off;\n                  if (y > y0 + 1e-6 && y < y1 - 1e-6) cuts.push(y);\n                });\n              }\n              cuts.sort((a, b) => a - b);\n              return cuts.filter((v, i) => !i || Math.abs(v - cuts[i - 1]) > 1e-6);\n            };\n\n            const drawTrapSurface = (x0, x1, y0, y1, zAt, hex, upward) => {\n              if (x1 <= x0 || y1 <= y0) return;\n              const cuts = trapBreaks(y0, y1);\n              for (let i = 0; i < cuts.length - 1; i++) {\n                const a = cuts[i], b = cuts[i + 1];\n                const za = zAt(a), zb = zAt(b);\n                const pts = upward\n                  ? [[x0, a, za], [x1, a, za], [x1, b, zb], [x0, b, zb]]\n                  : [[x0, a, za], [x0, b, zb], [x1, b, zb], [x1, a, za]];\n                quad(pts, hex, {\n                  normal: faceNormal(pts),\n                  cull: true,\n                  edge: false,\n                  seamless: true\n                });\n              }\n            };\n\n            /* Spodná škrupina ide po plnom Expivi pôdoryse plechu. Horná sa\n               generuje iba v fyzicky odkrytom poli; okraje sú trvalo ukryté\n               pod nepriehľadným lemovaním, nezávisle od uhla kamery. */\n            drawTrapSurface(tx0, tx1, ty0, ty1, trapLowerZ, spodHex, false);\n            drawTrapSurface(vx0, vx1, vy0, vy1, trapUpperZ, vrchHex, true);\n\n"""
replace_between(trap_start, trap_end, trap_replacement, "true Koverta trapezoid shell")

# Drainage: hidden gutter stays in the established fascia pocket. The downpipe
# now leaves it through a short vertical throat, takes an orthogonal elbow to the
# nearest active corner post, continues vertically, and finishes near ground with
# a horizontal outlet kept inside the roof footprint.
replace_once(
    """              const prechodX = Math.abs(xVytok - xRura);\n              const prechodZ = Math.max(rz * 2.2, prechodX * 1.15 + rz * 1.8);\n              const zKoleno = zBot - prechodZ;\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(55, rz * 2.25);\n""",
    """              const prechodX = Math.abs(xVytok - xRura);\n              const prechodZ = Math.max(52, rz * 1.55);\n              const zKoleno = zBot - prechodZ;\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(55, rz * 2.25);\n""",
    "short Koverta downpipe upper drop",
)
replace_once(
    """              const lom = [[xVytok, yZvod, zlBot + Math.max(4, rz * 0.12)]];\n              if (Math.abs(xVytok - xRura) > 2) {\n                lom.push([xVytok, yZvod, zBot - rz * 0.75]);\n                lom.push([xRura, yZvod, zKoleno]);\n              }\n              lom.push([xRura, yZvod, zPata]);\n              lom.push([xRura + RP * 0.92, yZvod, zPata - RP * 0.62]);\n              const draha = zaobli(lom, RP, 7);\n""",
    """              const startZ = zlBot + Math.max(4, rz * 0.12);\n              const lom = [[xVytok, yZvod, startZ]];\n              lom.push([xVytok, yZvod, zKoleno]);\n              if (Math.abs(xVytok - xRura) > 2) lom.push([xRura, yZvod, zKoleno]);\n              lom.push([xRura, yZvod, zPata]);\n\n              const footClear = Math.max(0, L - xRura - rz - 5);\n              const footRun = Math.min(RP * 0.82, footClear);\n              const footZ = Math.max(rz + 6, zPata - Math.min(RP * 0.62, zPata - rz - 6));\n              if (footRun > 2) {\n                const bendRun = Math.min(footRun * 0.45, RP * 0.34);\n                lom.push([xRura + bendRun, yZvod, footZ]);\n                lom.push([xRura + footRun, yZvod, footZ]);\n              } else {\n                lom.push([xRura, yZvod, footZ]);\n              }\n              const draha = zaobli(lom, RP, 7);\n""",
    "orthogonal Koverta downpipe path",
)
replace_once(
    """                  angleDeg: prechodX > 2\n                    ? Math.atan2(prechodZ, prechodX) * 180 / Math.PI\n                    : 90\n""",
    """                  angleDeg: 90\n""",
    "Koverta downpipe orthogonal transition metadata",
)

# Non-negotiable runtime invariants must still be present. cfg-pages/Expivi data
# is protected independently by git diff and the existing fidelity tests.
for required in [
    "const rohovy = Boolean(rz.roh);",
    "const kovertaContact = Boolean(kvBand());",
    "const kvSlatWall = model().roofKit === 'koverta' && Boolean(KV_MAT[kind]);",
    "Koverta final realism: true corrugated shell",
]:
    if required not in source:
        raise RuntimeError(f"Required runtime invariant missing after patch: {required}")

if "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true, nadStrechou)" in source:
    raise RuntimeError("Koverta fascia still uses camera-dependent paintLast")

TARGET.write_text(source, encoding="utf-8")
print("Applied guarded Koverta-only final realism patch to", TARGET)
