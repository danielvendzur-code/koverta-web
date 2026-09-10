from __future__ import annotations

import json
import re
from pathlib import Path

RUNTIME = Path('konfigurator/soltec-premium.js')
CFG = Path('konfigurator/cfg-pages.js')
EXPIVI = Path('archiv-expivi/stlpy-a-vaznice-odmerane.json')

runtime = RUNTIME.read_text(encoding='utf-8')
cfg = CFG.read_text(encoding='utf-8')
marker = 'Koverta final 100: clean long-rib shell'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    if text.count(start) != 1 or text.count(end) != 1:
        raise RuntimeError(f'{label}: markers are not unique')
    a = text.index(start)
    b = text.index(end, a)
    return text[:a] + replacement + text[b:]


# Parse only the embedded Koverta payload and derive confirmed 100x100 post
# source catalogs from the archived Expivi measurements. This avoids inferring
# any millimetres from photographs.
assignment = re.match(r'(?s)(/\*.*?\*/\s*)window\.KV_PAGES\s*=\s*(\{.*\});\s*$', cfg)
if not assignment:
    raise RuntimeError('cfg-pages.js assignment not found')
prefix = assignment.group(1)
pages = json.loads(assignment.group(2))
k_html = pages['koverta']
bio_match = re.search(r'data-sp-bio-data>(.*?)</script>', k_html, re.S)
if not bio_match:
    raise RuntimeError('Koverta data-sp-bio-data not found')
bio = json.loads(bio_match.group(1))
model = bio['models']['K']

expivi = json.loads(EXPIVI.read_text(encoding='utf-8'))
by_catalog = {int(v.get('id')): v for v in expivi.values() if isinstance(v, dict) and v.get('id') is not None}
confirmed_100 = []
for roof in (model.get('kvRoofBySize') or {}).values():
    cid = int(roof.get('sourceCatalog') or 0)
    scene = by_catalog.get(cid) or {}
    posts = scene.get('stlpy') or {}
    if '(100, 100, 2392)' in posts:
        confirmed_100.append(cid)
model['post100Catalogs'] = sorted(set(confirmed_100))

# Drainage is part of the Koverta assembly. Keep price/spec wording honest: its
# exact execution and price are confirmed in the offer rather than invented.
model['blurb'] = 'Oceľová konštrukcia s trapézovou strechou a odvodnením. Zobrazená základná zostava a cena sa menia podľa rozmeru.'
model['roofNote'] = 'Pultová strecha s trapézovým profilom; žľab a zvod sú súčasťou zostavy, vyhotovenie potvrdíme pri návrhu.'
for group in bio.get('picks', []):
    if group.get('id') == 'odkvap':
        group['note'] = 'Odkvap a zvod sú súčasťou zostavy. Vyhotovenie, vedenie zvodu a cenu odvodnenia potvrdíme v ponuke.'
        group['opts'] = [{'id': 'ano', 't': 'So žľabom a zvodom', 's': 'na individuálne nacenenie'}]
        break
else:
    raise RuntimeError('Koverta odkvap pick group missing')

new_bio = json.dumps(bio, ensure_ascii=False, separators=(',', ':'))
k_html = k_html[:bio_match.start(1)] + new_bio + k_html[bio_match.end(1):]
pages['koverta'] = k_html
new_cfg = prefix + 'window.KV_PAGES = ' + json.dumps(pages, ensure_ascii=False, separators=(',', ':')) + ';\n'

if marker not in runtime:
    # Koverta always renders drainage. Non-Koverta behavior remains byte-for-byte
    # equivalent because only the koverta branch of this predicate changes.
    runtime = replace_once(
        runtime,
        "const maOdkvap = () => Boolean(BIO.gutter) && state.picks.odkvap !== 'nie';",
        "const maOdkvap = () => Boolean(BIO.gutter) && (model().roofKit === 'koverta' || state.picks.odkvap !== 'nie');",
        'mandatory Koverta drainage',
    )

    # Newer active Expivi exports explicitly contain 100x100x2392 posts. Use that
    # section only for those source catalogs. Exact legacy 7000x5200/6000 scenes
    # continue to use kvBySize and their measured 150x150 / 190x110 sections.
    old_post = """        /* Prierez stĺpa: 150 × 150 tam, kde stĺp stojí v osi čelného rámu,\n           110 × 190 tam, kde stojí pod väznicou (190 ide pozdĺž hĺbky).\n           Štvorstĺpová varianta má teda všetky štyri 110 × 190. */\n        const kvStlpRez = (i, n) => {\n          const R = model().kvRef || {}, b = kvBand();\n          const naVaznici = (b && b.stlpyNaVaznici) || i !== 0 && i !== n - 1;\n          return naVaznici\n            ? { d: Number(R.stredD) || 190, w: Number(R.stredW) || 110, roh: false }\n            : { d: Number(R.postD) || 150, w: Number(R.postW) || 150, roh: true };\n        };\n"""
    new_post = """        /* Prierez stĺpa. Presné legacy 7000 × 5200/6000 zostavy ostávajú\n           podľa kvBySize/Expivi. Novšie aktívne exporty smú použiť 100 × 100 ×\n           2392 iba vtedy, keď ich sourceCatalog je priamo potvrdený v archíve. */\n        const kvExportPost100 = () => {\n          if (kvMeasured()) return false;\n          const roof = (model().kvRoofBySize || {})[`${widthMM()}x${lengthMM()}`] || {};\n          const ids = model().post100Catalogs || [];\n          return ids.indexOf(Number(roof.sourceCatalog)) > -1;\n        };\n        const kvStlpRez = (i, n) => {\n          const R = model().kvRef || {}, b = kvBand();\n          const rohovy = i === 0 || i === n - 1;\n          if (kvExportPost100()) return { d: 100, w: 100, roh: rohovy };\n          const naVaznici = (b && b.stlpyNaVaznici) || !rohovy;\n          return naVaznici\n            ? { d: Number(R.stredD) || 190, w: Number(R.stredW) || 110, roh: false }\n            : { d: Number(R.postD) || 150, w: Number(R.postW) || 150, roh: true };\n        };\n"""
    runtime = replace_once(runtime, old_post, new_post, 'Expivi-confirmed slender Koverta posts')

    # Optional clean-surface flag. Existing callers (including every Soltec call)
    # omit it, so their generated SVG remains unchanged.
    runtime = replace_once(
        runtime,
        "const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop, paintLast) => {",
        "const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias, seamlessTop, paintLast, cleanSurface) => {",
        'boxFaces clean-surface option',
    )
    runtime = replace_once(
        runtime,
        "normal: n, cull: true, arris: fl.indexOf(key) < 0, bias: bias || 0,\n              seamless: seamlessTop === true && key === '+z',",
        "normal: n, cull: true, arris: fl.indexOf(key) < 0, bias: bias || 0,\n              edge: cleanSurface === true ? false : undefined,\n              seamless: seamlessTop === true && key === '+z',",
        'boxFaces clean-surface edge policy',
    )

    # Fascia: no outline strokes and no special painter order. The measured
    # envelope is unchanged; only the raster artifact is removed.
    runtime = replace_once(
        runtime,
        "if (axis === 'x') boxFaces(Math.min(u0, u1), a, z, Math.abs(u1 - u0), b - a, dz, frame, [], SHAFT, 0, seamlessTop, paintLast);\n                else boxFaces(a, Math.min(u0, u1), z, b - a, Math.abs(u1 - u0), dz, frame, [], SHAFT, 0, seamlessTop, paintLast);",
        "if (axis === 'x') boxFaces(Math.min(u0, u1), a, z, Math.abs(u1 - u0), b - a, dz, frame, [], SHAFT, 0, seamlessTop, false, true);\n                else boxFaces(a, Math.min(u0, u1), z, b - a, Math.abs(u1 - u0), dz, frame, [], SHAFT, 0, seamlessTop, false, true);",
        'clean Koverta fascia surfaces',
    )

    # Rounded/chamfered post facets must not carry artificial SVG strokes; those
    # strokes were the camera-dependent vertical "scratches" on dark columns.
    runtime = replace_once(
        runtime,
        "frame, { normal: [nx / ln, ny / ln, 0], cull: true, arris: false });",
        "frame, { normal: [nx / ln, ny / ln, 0], cull: true, arris: false, edge: false });",
        'clean rounded Koverta posts',
    )

    # Koverta C-profile side/end facets also get geometry-only boundaries; the
    # artificial stroke was creating short bright/dark seams after BSP splits.
    runtime = replace_once(
        runtime,
        "hex, { normal: n, cull: true, arris: false });\n              }\n              (bokom ? cCela(par, vys, t, single) : []).forEach((r) => {",
        "hex, { normal: n, cull: true, arris: false, edge: false });\n              }\n              (bokom ? cCela(par, vys, t, single) : []).forEach((r) => {",
        'clean Koverta C-profile longitudinal facets',
    )
    runtime = replace_once(
        runtime,
        "{ normal: axis === 'x' ? [0, e[1], 0] : [e[1], 0, 0], cull: true, arris: false });",
        "{ normal: axis === 'x' ? [0, e[1], 0] : [e[1], 0, 0], cull: true, arris: false, edge: false });",
        'clean Koverta C-profile end facets',
    )

    # Clean plate surfaces while retaining real 3D bolt heads.
    runtime = replace_once(
        runtime,
        "boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, plateHex, ['-z'], SHAFT);",
        "boxFaces(cx - pl / 2, cy - pl / 2, 0, pl, pl, pth, plateHex, ['-z'], SHAFT, 0, false, false, true);",
        'clean Koverta base plates',
    )
    runtime = replace_once(
        runtime,
        "model().roofKit === 'koverta' ? plateHex : shade('#c9ccce', -0.06), ['+z', '-z'], SHAFT);",
        "model().roofKit === 'koverta' ? plateHex : shade('#c9ccce', -0.06), ['+z', '-z'], SHAFT, 0, false, false, model().roofKit === 'koverta');",
        'clean Koverta base sleeves',
    )
    runtime = replace_once(
        runtime,
        "boxFaces(x0, y0, zH - th, dx, dy, th, hlava, ['+z'], SHAFT);",
        "boxFaces(x0, y0, zH - th, dx, dy, th, hlava, ['+z'], SHAFT, 0, false, false, model().roofKit === 'koverta');",
        'clean Koverta head plates',
    )

    # Entire visible trapezoid aperture is one topology: upper and lower facets
    # share the same continuous rib profile. Hidden perimeter faces are omitted
    # entirely so they cannot leak through fascia during painter/BSP splitting.
    trap_start = "            /* Koverta final realism: true corrugated shell.\n"
    trap_end = "            /* Žiadne plošné „kontaktné tiene“ ani 2 mm spojové pruhy na\n"
    trap = """            /* Koverta final 100: clean long-rib shell.\n               TRAP_H a TRAP_KRYT ostávajú z aktívnych dát. Všetky facet y jednej\n               vlny bežia bez segmentácie cez celý viditeľný otvor strechy.\n               Spodok má jednu pevnú materiálovú farbu bez normal-dependent\n               shadingu; tým sa na podhľade nemôže objaviť antracitový pás. */\n            const vlnRoztec = TRAP_KRYT / 5;\n            const RIB_CROWN_VIS = 15;\n            const RIB_SHOULDER_VIS = 44;\n            const TRAP_SKIN_VIS = Math.max(1.2, Math.min(2.4, TRAP_H * 0.05));\n\n            const trapProfile01 = (y) => {\n              const raw = ty1 - y;\n              const phase = ((raw % vlnRoztec) + vlnRoztec) % vlnRoztec;\n              const d = Math.min(phase, vlnRoztec - phase);\n              if (d <= RIB_CROWN_VIS) return 1;\n              if (d >= RIB_SHOULDER_VIS) return 0;\n              return 1 - (d - RIB_CROWN_VIS) / (RIB_SHOULDER_VIS - RIB_CROWN_VIS);\n            };\n            const trapUpperZ = (y) =>\n              trapBot + TRAP_SKIN_VIS + (TRAP_H - TRAP_SKIN_VIS) * trapProfile01(y);\n            const trapLowerZ = (y) => trapUpperZ(y) - TRAP_SKIN_VIS;\n\n            const trapBreaks = (y0, y1) => {\n              const cuts = [y0, y1];\n              const first = Math.floor((ty1 - y1) / vlnRoztec) - 1;\n              const last = Math.ceil((ty1 - y0) / vlnRoztec) + 1;\n              for (let k = first; k <= last; k++) {\n                const axis = ty1 - k * vlnRoztec;\n                [-RIB_SHOULDER_VIS, -RIB_CROWN_VIS, RIB_CROWN_VIS, RIB_SHOULDER_VIS].forEach((off) => {\n                  const y = axis + off;\n                  if (y > y0 + 1e-6 && y < y1 - 1e-6) cuts.push(y);\n                });\n              }\n              cuts.sort((a, b) => a - b);\n              return cuts.filter((v, i) => !i || Math.abs(v - cuts[i - 1]) > 1e-6);\n            };\n\n            const drawTrapSurface = (x0, x1, y0, y1, zAt, hex, upward) => {\n              if (x1 <= x0 || y1 <= y0) return;\n              const cuts = trapBreaks(y0, y1);\n              for (let i = 0; i < cuts.length - 1; i++) {\n                const a = cuts[i], b = cuts[i + 1];\n                const za = zAt(a), zb = zAt(b);\n                const pts = upward\n                  ? [[x0, a, za], [x1, a, za], [x1, b, zb], [x0, b, zb]]\n                  : [[x0, a, za], [x0, b, zb], [x1, b, zb], [x1, a, za]];\n                let tone = hex;\n                if (upward) {\n                  const mid = (a + b) / 2;\n                  const flat = Math.abs(zb - za) < 0.01;\n                  const high = trapProfile01(mid) > 0.5;\n                  tone = flat ? shade(hex, high ? 0.035 : -0.025)\n                              : shade(hex, zb > za ? -0.055 : 0.010);\n                }\n                quad(pts, tone, {\n                  normal: faceNormal(pts),\n                  cull: true,\n                  edge: false,\n                  raw: true,\n                  seamless: true\n                });\n              }\n            };\n\n            /* Všetko mimo tohto otvoru je trvalo pod nepriehľadným lemovaním.\n               Negenerovať tieto skryté plochy je fyzická oklúzia, nie camera\n               hack, a odstráni to zdroj svetlých/tmavých škrabancov na atike. */\n            drawTrapSurface(vx0, vx1, vy0, vy1, trapLowerZ, spodHex, false);\n            drawTrapSurface(vx0, vx1, vy0, vy1, trapUpperZ, vrchHex, true);\n\n"""
    runtime = replace_between(runtime, trap_start, trap_end, trap, 'clean continuous Koverta trapezoid')

    # Hidden gutter: keep the continuous trough inside the measured pocket, but
    # do not emit permanently hidden end caps/lips that can raster-leak through
    # the side fascia. Back-face culling uses the real facet normal.
    old_gutter = """                for (let i = 0; i < section.length - 1; i++) {\n                  const A = section[i], B = section[i + 1];\n                  quad([[A[0], zlY0, A[1]], [A[0], zlY1, A[1]],\n                        [B[0], zlY1, B[1]], [B[0], zlY0, B[1]]],\n                       zlHex, { cull: false, arris: false });\n                }\n                /* Uzavreté čelá žľabu. Zvod je napojený otvorom v dne, nie\n                   tým, že by sa rúra iba dotýkala konca žľabu. */\n                quad(section.map(p => [p[0], zlY0, p[1]]),\n                     shade(zlHex, -0.08), { normal: [0, -1, 0], cull: false, arris: false });\n                quad(section.slice().reverse().map(p => [p[0], zlY1, p[1]]),\n                     shade(zlHex, -0.08), { normal: [0, 1, 0], cull: false, arris: false });\n                const lip = Math.max(4, Math.min(10, zlSpan * 0.06));\n                boxFaces(zlX0 + zlWall, zlY0, zlTop - zlWall,\n                         lip, zlY1 - zlY0, zlWall, zlHex, [], SHAFT);\n                boxFaces(zlX1 - zlWall - lip, zlY0, zlTop - zlWall,\n                         lip, zlY1 - zlY0, zlWall, zlHex, [], SHAFT);\n"""
    new_gutter = """                for (let i = 0; i < section.length - 1; i++) {\n                  const A = section[i], B = section[i + 1];\n                  const pts = [[A[0], zlY0, A[1]], [A[0], zlY1, A[1]],\n                               [B[0], zlY1, B[1]], [B[0], zlY0, B[1]]];\n                  quad(pts, zlHex, { normal: faceNormal(pts), cull: true, arris: false, edge: false });\n                }\n                /* Čelá a horné perá ležia natrvalo za bočným/čelným\n                   lemovaním. V SVG ich zámerne nevysielame: nie sú z nijakého\n                   fyzicky dostupného pohľadu exponované a boli zdrojom leakov. */\n"""
    runtime = replace_once(runtime, old_gutter, new_gutter, 'hidden gutter leak cleanup')

    # Downpipe proportion and top transition. The outlet gets a short throat and
    # then a compact slanted elbow to the nearest post; no exact 90-degree bend.
    runtime = replace_once(
        runtime,
        "const rzVizu = Math.max(34, Math.min(42,\n                Math.min(rezZvod.w, rezZvod.d) * 0.28));",
        "const rzVizu = Math.max(28, Math.min(36,\n                Math.min(rezZvod.w, rezZvod.d) * 0.28));",
        'downpipe visual proportion',
    )
    old_route = """              const prechodX = Math.abs(xVytok - xRura);\n              const prechodZ = Math.max(52, rz * 1.55);\n              const zKoleno = zBot - prechodZ;\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(55, rz * 2.25);\n\n              /* Celý zvod je jedna dráha — od výtoku pod lemovaním, kolenom\n                 k licu stĺpa, po ňom dole a vyhnutou pätkou von. Kým to boli\n                 štyri samostatné valce, na každom ohybe ostávala medzi nimi\n                 diera. */\n"""
    new_route = """              const prechodX = Math.abs(xVytok - xRura);\n              const zPata = Math.max(140, Math.min(320, H * 0.12));\n              const RP = Math.max(50, rz * 2.05);\n\n              /* Horné koleno je krátke a šikmé, nie pravouhlé. Uhol je\n                 rendererová proporcia, nie výrobná kóta; drží sa v úzkom\n                 vizuálnom pásme a smeruje rovno k najbližšiemu stĺpu. */\n              const targetElbow = 56 * Math.PI / 180;\n              const maxElbow = 68 * Math.PI / 180;\n              const prechodZ = prechodX > 2\n                ? Math.min(Math.max(prechodX * Math.tan(targetElbow), rz * 0.45),\n                           prechodX * Math.tan(maxElbow))\n                : rz * 0.55;\n              const zKoleno = zBot - Math.max(rz * 0.9, prechodZ);\n\n              /* Celý zvod je jedna dráha — od výtoku pod lemovaním, krátkym\n                 šikmým kolenom k lícu stĺpa, po ňom dole a vyhnutou pätkou. */\n"""
    runtime = replace_once(runtime, old_route, new_route, 'slanted Koverta upper elbow')

    old_lom = """              const startZ = zlBot + Math.max(4, rz * 0.12);\n              const lom = [[xVytok, yZvod, startZ]];\n              lom.push([xVytok, yZvod, zKoleno]);\n              if (Math.abs(xVytok - xRura) > 2) lom.push([xRura, yZvod, zKoleno]);\n              lom.push([xRura, yZvod, zPata]);\n"""
    new_lom = """              const startZ = zlBot + Math.max(4, rz * 0.12);\n              const throatZ = startZ - Math.max(8, rz * 0.32);\n              const lom = [[xVytok, yZvod, startZ], [xVytok, yZvod, throatZ]];\n              if (Math.abs(xVytok - xRura) > 2) lom.push([xRura, yZvod, throatZ - prechodZ]);\n              lom.push([xRura, yZvod, zPata]);\n"""
    runtime = replace_once(runtime, old_lom, new_lom, 'compact slanted Koverta downpipe path')
    runtime = replace_once(
        runtime,
        "angleDeg: 90",
        "angleDeg: prechodX > 2 ? Math.atan2(prechodZ, prechodX) * 180 / Math.PI : 56",
        'non-right-angle downpipe metadata',
    )

    # Clean clamp bridge surfaces only for this Koverta-only drainage code.
    runtime = replace_once(
        runtime,
        "shade(frame, -0.38), [], SHAFT);",
        "shade(frame, -0.38), [], SHAFT, 0, false, false, true);",
        'clean downpipe clamp bridge',
    )

# Guardrails: product requirements and protected exact source facts.
required_runtime = [
    marker,
    "const rohovy = Boolean(rz.roh);",
    "const kovertaContact = Boolean(kvBand());",
    "const kvSlatWall = model().roofKit === 'koverta' && Boolean(KV_MAT[kind]);",
    "raw: true,",
    "angleDeg: prechodX > 2 ? Math.atan2(prechodZ, prechodX) * 180 / Math.PI : 56",
]
for token in required_runtime:
    if token not in runtime:
        raise RuntimeError('required runtime invariant missing: ' + token)
if "put(outer, outer + sirka * dir, zTop - LEM_ARM, LEM_ARM, true, nadStrechou)" in runtime:
    raise RuntimeError('Koverta paintLast call returned')
if "angleDeg: 90" in runtime:
    raise RuntimeError('right-angle Koverta downpipe metadata remains')
if 'Bez odkvapu' in new_bio or 'odvodnenie je voliteľné' in new_bio.lower():
    raise RuntimeError('optional drainage copy remains in Koverta data')

RUNTIME.write_text(runtime, encoding='utf-8')
CFG.write_text(new_cfg, encoding='utf-8')
print('Applied Koverta final-100 patch')
print('Expivi-confirmed 100x100 source catalogs:', confirmed_100)
