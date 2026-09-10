from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / 'konfigurator' / 'soltec-premium.js'
MOTION = ROOT / 'konfigurator' / 'test' / 'soltec-motion-regression.js'
ALL = ROOT / 'konfigurator' / 'test' / 'soltec-all-models-regression.js'


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    return text.replace(old, new, 1)


s = JS.read_text(encoding='utf-8')

# Soltec grazing views: keep the face transition continuous around exactly edge-on.
s = once(s,
'''            const normal = o.normal || faceNormal(pts);\n            if (o.cull && facing(normal) <= 0) return;\n            const pp = pts.map((v) => cam(v[0], v[1], v[2]));''',
'''            const normal = o.normal || faceNormal(pts);\n            const faceView = facing(normal);\n            /* Soltec must not drop a face a fraction before its opposite face\n               becomes visible at a grazing angle. Koverta keeps its existing\n               strict rule; Soltec gets only a numerical epsilon, not disabled\n               culling, so polygon count and performance stay stable. */\n            if (o.cull && (model().kvGeom ? faceView <= 0 : faceView < -1e-7)) return;\n            const pp = pts.map((v) => cam(v[0], v[1], v[2]));''',
'grazing cull epsilon')

# Soltec aluminium should not receive synthetic SVG outline strokes on every face.
s = once(s,
'''              edge: o.edge !== false,\n              /* arris:false keeps the stroke but paints it in the face's own\n                 colour, so members merge into one surface without a gap */\n              edgeCol: o.edge === false ? null : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'''              /* Koverta keeps the established outline policy. Soltec\n                 extrusions are continuous surfaces: a default SVG stroke on\n                 every polygon created the diagonal/inner/outer lines visible\n                 on the perimeter frame. Soltec outlines only an explicitly\n                 requested seam. */\n              edge: model().kvGeom ? o.edge !== false : o.edge === true,\n              edgeCol: (model().kvGeom ? o.edge === false : o.edge !== true)\n                ? null\n                : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'Soltec clean edges')

# Only the true ground/shadow/house layers belong to background on Soltec.
s = once(s,
'''              bg: layer < -ROOF_LAYER,''',
'''              bg: model().kvGeom ? layer < -ROOF_LAYER : layer < -1.5 * ROOF_LAYER,''',
'Soltec structural background cutoff')

# Clean perimeter surfaces without changing physical face culling.
s = once(s,
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, { normal: n, cull: true });''',
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, {\n              normal: n, cull: true,\n              edge: model().kvGeom ? undefined : false,\n              seamless: !model().kvGeom\n            });''',
'perimeter cap seams')
s = once(s,
'''              quad(pts, vonku ? hex : spodok, { normal: n, cull: true, arris: false });''',
'''              quad(pts, vonku ? hex : spodok, {\n                normal: n, cull: true, arris: false,\n                edge: model().kvGeom ? undefined : false,\n                seamless: !model().kvGeom\n              });''',
'perimeter web seams')

# Fixed Soltec roofs had no end faces on secondary members. End-on views could
# therefore make a complete member vanish although its body still existed.
s = once(s,
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, ['-y', '+y']);''',
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, [], SHAFT, 0, false, true);''',
'fixed secondary profile end caps')

# Panel seams are intentional, so opt them in explicitly under Soltec's new
# no-outline-by-default policy.
s = once(s,
'''                   Object.assign({ cull: true, edgeHex: seamTop }, pane));''',
'''                   Object.assign({ cull: true, edge: true, edgeHex: seamTop }, pane));''',
'panel top seam')
s = once(s,
'''                   Object.assign({ cull: true, edgeHex: seamLow }, pane));''',
'''                   Object.assign({ cull: true, edge: true, edgeHex: seamLow }, pane));''',
'panel underside seam')

# Closed really means 0 degrees. Stability comes from not drawing the physically
# hidden underside underlap as a second coplanar broad surface.
s = once(s,
'''            /* Exactly zero degrees makes every neighbouring underside plane\n               mathematically coplanar. The simplified sealing overlap then\n               gives BSP several valid paint orders and tiny camera changes can\n               reshuffle them. Keep the visual closed stop, but render it a\n               fraction of a degree off the singular plane. Across a 200 mm\n               blade this is sub-millimetre and not visually measurable. */\n            const renderLouverT = Math.max(0.003, state.louverT);\n            const ang = louverAngle(beam, bladeW, renderLouverT);''',
'''            /* Closed means closed. At 0 % the lamella is exactly horizontal;\n               the hidden sealing underlap is clipped from the visible underside\n               instead of faking a partially open roof. */\n            const ang = louverAngle(beam, bladeW, state.louverT);''',
'exact closed lamella angle')

s = once(s,
'''            const overlap = Math.max(0, bladeW - Math.min(bladeW, pitch));\n            const topLeadS = -fullHalf + overlap;\n            const bladeUx = Math.cos(ang), bladeUz = Math.sin(ang);''',
'''            const overlap = Math.max(0, bladeW - Math.min(bladeW, pitch));\n            const topLeadS = -fullHalf + overlap;\n            /* The underlap is completely hidden when closed and becomes visible\n               continuously as the roof starts opening. This removes the broad\n               coplanar underside overlap that caused the last 15 -> 0 % jitter. */\n            const revealK = Math.max(0, Math.min(1, state.louverT / 0.12));\n            const underReveal = revealK * revealK * (3 - 2 * revealK);\n            const underLeadS = topLeadS + (-fullHalf - topLeadS) * underReveal;\n            const bladeUx = Math.cos(ang), bladeUz = Math.sin(ang);''',
'smooth hidden underlap')

s = once(s,
'''              const fullAX = x - dx, fullAZ = mid - dz;\n              const aX = x + topLeadS * bladeUx, aZ = mid + topLeadS * bladeUz;\n              const bX = x + dx, bZ = mid + dz;''',
'''              const fullAX = x - dx, fullAZ = mid - dz;\n              const aX = x + topLeadS * bladeUx, aZ = mid + topLeadS * bladeUz;\n              const underAX = x + underLeadS * bladeUx, underAZ = mid + underLeadS * bladeUz;\n              const bX = x + dx, bZ = mid + dz;''',
'visible underside start')

s = once(s,
'''              const lay = { bias: i * 0.02 };''',
'''              const lay = { bias: i * 2 };''',
'deterministic lamella order')

s = once(s,
'''              /* Rub lamely nie je jeden tón. Horná hrana je zastrčená pod\n                 susednou lamelou, takže tá polovica je v jej tieni; spodná\n                 hrana je otvorená k oblohe a je svetlejšia. Rub sa preto\n                 kreslí ako dva pásy. Je to skutočný jav a zároveň jediné,\n                 čo dá radu lamiel kontrast aj na antracite — na bielej bolo\n                 všetko vidieť, na tmavej sa strecha zdola zlievala do dosky. */\n              const sX = (fullAX + bX) / 2 + ox, sZ = (fullAZ + bZ) / 2 + oz;\n              quad([[fullAX+ox,y1+lap,fullAZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[fullAX+ox,y0-lap,fullAZ+oz]], shade(louv, -0.04), underO);\n              quad([[sX,y1+lap,sZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz],[sX,y0-lap,sZ]], shade(louv, -0.40), underO);\n              quad([[bX,y0-lap,bZ],[bX,y1+lap,bZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz]], shade(louv, -0.48), layO);\n              /* Pevný tesniaci podklad uzatvára skutočnú šírku profilu.\n                 Pri zatvorení leží pod koncom susednej lamely, takže horné\n                 plochy sa iba stretnú na hrane a BSP nemusí deliť dve veľké\n                 koplanárne plochy. Celý tento profil sa potom iba otáča. */\n              if (overlap > 0.5)\n                quad([[fullAX+ox,y0-lap,fullAZ+oz],[aX,y0-lap,aZ],[aX,y1+lap,aZ],[fullAX+ox,y1+lap,fullAZ+oz]], shade(louv, -0.40), layO);''',
'''              /* One powder-coated underside, not two painted fake-shadow\n                 bands. From below the same lamella must not change colour merely\n                 because the camera moved. Geometry carries the depth cue. */\n              const underFlatO = Object.assign({}, underO, { raw: true, edge: false });\n              const edgeO = Object.assign({}, layO, { raw: true, edge: false });\n              quad([[underAX+ox,y1+lap,underAZ+oz],[bX+ox,y1+lap,bZ+oz],\n                    [bX+ox,y0-lap,bZ+oz],[underAX+ox,y0-lap,underAZ+oz]],\n                   shade(louv, -0.08), underFlatO);\n              quad([[bX,y0-lap,bZ],[bX,y1+lap,bZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz]],\n                   shade(louv, -0.26), edgeO);\n              /* Always emit the physical underlap side. At 0 % it degenerates\n                 to zero width, which keeps topology/count stable without any\n                 visible coplanar surface; it opens continuously afterwards. */\n              if (overlap > 0.5)\n                quad([[underAX+ox,y0-lap,underAZ+oz],[aX,y0-lap,aZ],\n                      [aX,y1+lap,aZ],[underAX+ox,y1+lap,underAZ+oz]],\n                     shade(louv, -0.18), edgeO);''',
'uniform lamella underside')

# One visible-tab clock. The timeout fallbacks were a second scheduler and could
# win under load one frame after rAF, causing the last micro-jump/final settle.
s = once(s,
'''        let stagePending = 0, stageTimer = 0, stageRaf = 0;\n        const paintStage = () => {\n          if (!stagePending) return;\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          window.clearTimeout(stageTimer);\n          stageTimer = 0;\n          drawStage();\n          syncSideMove();\n          syncLouverReadout();\n        };\n        const scheduleStage = () => {\n          if (stagePending) return;\n          stagePending = 1;\n          stageRaf = window.requestAnimationFrame(paintStage);\n          stageTimer = window.setTimeout(paintStage, 60);\n        };\n        const flushStage = () => { if (stagePending) paintStage(); };\n        const cancelStageQueue = () => {\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          window.clearTimeout(stageTimer);\n          stageTimer = 0;\n        };\n\n        let louverRun = 0, moverTimer = 0;''',
'''        let stagePending = 0, stageRaf = 0;\n        const paintStage = () => {\n          if (!stagePending) return;\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          drawStage();\n          syncSideMove();\n          syncLouverReadout();\n        };\n        const scheduleStage = () => {\n          if (stagePending) return;\n          stagePending = 1;\n          stageRaf = window.requestAnimationFrame(paintStage);\n        };\n        const flushStage = () => { if (stagePending) paintStage(); };\n        const cancelStageQueue = () => {\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n        };\n\n        let louverRun = 0;''',
'single stage clock')

s = once(s,
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          /* A slider/camera frame queued before this animation must never''',
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          /* A slider/camera frame queued before this animation must never''',
'remove mover timer preamble')

s = once(s,
'''            if (k < 1) {\n              louverRun = requestAnimationFrame(step);\n              window.clearTimeout(moverTimer);\n              moverTimer = window.setTimeout(() => {\n                /* rAF is the primary clock. The timeout is only a fallback for\n                   throttled/hidden tabs; if it wins, cancel the queued rAF so\n                   one physical instant can never be rendered twice. */\n                if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n                moverTimer = 0;\n                step(clockNow());\n              }, 90);\n              return;\n            }\n            louverRun = 0;\n            window.clearTimeout(moverTimer);\n            moverTimer = 0;''',
'''            if (k < 1) {\n              louverRun = requestAnimationFrame(step);\n              return;\n            }\n            louverRun = 0;''',
'remove mover timer loop')

s = once(s,
'''          louverRun = requestAnimationFrame(step);\n          moverTimer = window.setTimeout(() => {\n            if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n            moverTimer = 0;\n            step(clockNow());\n          }, 90);''',
'''          louverRun = requestAnimationFrame(step);''',
'remove mover initial timer')

s = once(s,
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          /* runMover has a timeout fallback as well as rAF. Cancelling only\n             rAF left that stale fallback alive and it could move the blades\n             backwards one frame after a new hold started. */\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          cancelStageQueue();''',
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          cancelStageQueue();''',
'remove hold timer')

JS.write_text(s, encoding='utf-8')

m = MOTION.read_text(encoding='utf-8')
m = once(m,
"  assert.match(source, /const renderLouverT = Math\\.max\\(0\\.003, state\\.louverT\\);/, 'Closed Soltec louvers must avoid the exact coplanar BSP singularity');",
"  assert.match(source, /const ang = louverAngle\\(beam, bladeW, state\\.louverT\\);/, 'Closed Soltec louvers must render at the exact requested angle');\n  assert.doesNotMatch(source, /renderLouverT/, 'Soltec must not fake a partially open closed stop');\n  assert.match(source, /const underReveal = revealK \\* revealK \\* \\(3 - 2 \\* revealK\\);/, 'Hidden sealing underlap must reveal smoothly instead of overlapping at the closed stop');",
'motion closed contract')
m = m.replace("  assert.match(source, /if \\(moverTimer\\) \\{ window\\.clearTimeout\\(moverTimer\\); moverTimer = 0; \\}/, 'Changing louver interaction mode must clear the stale mover fallback timer');\n", "")
m = once(m,
"  assert.match(source, /let stagePending = 0, stageTimer = 0, stageRaf = 0;/, 'Stage scheduling must own and cancel its pending animation frame');",
"  assert.match(source, /let stagePending = 0, stageRaf = 0;/, 'Stage scheduling must have one animation-frame owner');\n  assert.doesNotMatch(source, /stageTimer|moverTimer/, 'Soltec motion must not race animation frames against timeout clocks');",
'motion clock contract')
m = once(m,
"  assert.match(source, /shade\\(louv, -0\\.48\\), layO\\);/, 'The louver edge thickness must remain double-sided and visible');",
"  assert.match(source, /shade\\(louv, -0\\.08\\), underFlatO\\);/, 'Louver underside must be one stable material tone');\n  assert.match(source, /shade\\(louv, -0\\.26\\), edgeO\\);/, 'Louver edge thickness must remain visible');",
'motion underside contract')
MOTION.write_text(m, encoding='utf-8')

a = ALL.read_text(encoding='utf-8')
a = once(a,
"  assert.match(source, /const renderLouverT = Math\\.max\\(0\\.003, state\\.louverT\\);/, 'Closed louvers must avoid the coplanar BSP singularity');",
"  assert.match(source, /const ang = louverAngle\\(beam, bladeW, state\\.louverT\\);/, 'Closed louvers must be exactly horizontal at 0%');\n  assert.doesNotMatch(source, /renderLouverT/, 'No fake closed-stop angle may remain');",
'all-model closed contract')
a = once(a,
"  assert.match(source, /const cancelStageQueue = \\(\\) =>/, 'Louver motion must cancel stale queued stage frames');",
"  assert.match(source, /const cancelStageQueue = \\(\\) =>/, 'Louver motion must cancel stale queued stage frames');\n  assert.match(source, /edge: model\\(\\)\\.kvGeom \\? o\\.edge !== false : o\\.edge === true/, 'Soltec structural faces must not receive synthetic outline strokes');\n  assert.match(source, /boxFaces\\(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, \\[\\], SHAFT, 0, false, true\\);/, 'Fixed Soltec secondary profiles must retain both end caps');\n  assert.match(source, /bg: model\\(\\)\\.kvGeom \\? layer < -ROOF_LAYER : layer < -1\\.5 \\* ROOF_LAYER/, 'Soltec under-roof structure must not be misclassified as background');",
'all-model structure contract')
ALL.write_text(a, encoding='utf-8')

print('Applied narrow final Soltec renderer correction')
