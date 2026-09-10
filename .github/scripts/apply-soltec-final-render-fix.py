from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / 'konfigurator' / 'soltec-premium.js'
MOTION = ROOT / 'konfigurator' / 'test' / 'soltec-motion-regression.js'
ALL = ROOT / 'konfigurator' / 'test' / 'soltec-all-models-regression.js'


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


s = JS.read_text(encoding='utf-8')

# 1) Soltec: do not drop nearly edge-on faces at grazing camera angles.
s = once(s,
'''            const normal = o.normal || faceNormal(pts);\n            if (o.cull && facing(normal) <= 0) return;\n            const pp = pts.map((v) => cam(v[0], v[1], v[2]));''',
'''            const normal = o.normal || faceNormal(pts);\n            const faceView = facing(normal);\n            /* Koverta keeps its established strict culling. Soltec gets a tiny\n               grazing-angle tolerance so a face cannot disappear one frame\n               before its opposite face becomes visible while orbiting. */\n            if (o.cull && (model().kvGeom ? faceView <= 0 : faceView < -1e-7)) return;\n            const pp = pts.map((v) => cam(v[0], v[1], v[2]));''',
'cull tolerance')

# 2) Soltec: no synthetic outline strokes on structural faces by default.
s = once(s,
'''              edge: o.edge !== false,\n              /* arris:false keeps the stroke but paints it in the face's own\n                 colour, so members merge into one surface without a gap */\n              edgeCol: o.edge === false ? null : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'''              /* Koverta keeps its established face outlines. Soltec aluminium\n                 is a clean continuous extrusion: synthetic SVG strokes were the\n                 diagonal/inside/outside "čiarky" visible across the frame.\n                 Soltec therefore draws an outline only when a caller explicitly\n                 requests edge:true (for example an intentional panel seam). */\n              edge: model().kvGeom ? o.edge !== false : o.edge === true,\n              /* arris:false keeps a requested stroke in the face colour. */\n              edgeCol: (model().kvGeom ? o.edge === false : o.edge !== true)\n                ? null\n                : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),''',
'Soltec outline policy')

# 3) Only real ground/house/shadow layers are background for Soltec. Under-roof
# details must never fall into the background bucket merely because roofBase is negative.
s = once(s,
'''              bg: layer < -ROOF_LAYER,''',
'''              bg: model().kvGeom ? layer < -ROOF_LAYER : layer < -1.5 * ROOF_LAYER,''',
'Soltec background cutoff')

# 4) Closed Soltec solids: keep every physical face and let BSP decide visibility.
s = once(s,
'''            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, {\n              normal: n, cull: true, arris: fl.indexOf(key) < 0, bias: bias || 0,\n              edge: cleanSurface === true ? false : undefined,\n              seamless: seamlessTop === true && key === '+z'\n            }); };''',
'''            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, {\n              normal: n, cull: model().kvGeom, arris: fl.indexOf(key) < 0, bias: bias || 0,\n              edge: cleanSurface === true ? false : undefined,\n              seamless: seamlessTop === true && key === '+z'\n            }); };''',
'Soltec solid face persistence')

# 5) Perimeter ring: same rule, and explicitly no Soltec outline strokes.
s = once(s,
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, { normal: n, cull: true });''',
'''            const cap = (pts, n) => quad(pts, n[2] > 0 ? hex : spodok, {\n              normal: n, cull: model().kvGeom, edge: model().kvGeom ? undefined : false\n            });''',
'perimeter caps')
s = once(s,
'''              quad(pts, vonku ? hex : spodok, { normal: n, cull: true, arris: false });''',
'''              quad(pts, vonku ? hex : spodok, {\n                normal: n, cull: model().kvGeom, arris: false,\n                edge: model().kvGeom ? undefined : false\n              });''',
'perimeter webs')

# 6) Fixed Soltec roof secondary profiles previously omitted both end faces.
# End-on/grazing views could therefore make a whole beam disappear.
s = once(s,
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, ['-y', '+y']);''',
'''                boxFaces(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, [], SHAFT, 0, false, true);''',
'fixed-roof beam end caps')

# Panel joins are intentional; opt them back in explicitly under the new Soltec
# no-stroke-by-default policy.
s = once(s,
'''                   Object.assign({ cull: true, edgeHex: seamTop }, pane));''',
'''                   Object.assign({ cull: true, edge: true, edgeHex: seamTop }, pane));''',
'panel top seam')
s = once(s,
'''                   Object.assign({ cull: true, edgeHex: seamLow }, pane));''',
'''                   Object.assign({ cull: true, edge: true, edgeHex: seamLow }, pane));''',
'panel underside seam')

# 7) More exact BSP for Soltec fixed structure. The louver simplification below
# removes the worst coplanar overlap, so the renderer can spend a little more
# depth on correct occlusion without returning to the old fragment explosion.
s = once(s,
'''          const BSP_MAX = model().kvGeom ? 320 : 28;\n          const BSP_LEAF = model().kvGeom ? 0 : 18;''',
'''          const BSP_MAX = model().kvGeom ? 320 : 48;\n          const BSP_LEAF = model().kvGeom ? 0 : 10;''',
'Soltec BSP accuracy')

# 8) A genuinely closed roof is exactly horizontal. The previous 0.003 fake
# opening was visible from below and from the top as a roof that never quite shut.
s = once(s,
'''            /* Exactly zero degrees makes every neighbouring underside plane\n               mathematically coplanar. The simplified sealing overlap then\n               gives BSP several valid paint orders and tiny camera changes can\n               reshuffle them. Keep the visual closed stop, but render it a\n               fraction of a degree off the singular plane. Across a 200 mm\n               blade this is sub-millimetre and not visually measurable. */\n            const renderLouverT = Math.max(0.003, state.louverT);\n            const ang = louverAngle(beam, bladeW, renderLouverT);''',
'''            /* Closed means closed: at 0 % the blade is mathematically and\n               visually horizontal. Coplanar stability is handled by clipping\n               the hidden sealing underlap below, not by faking an opening. */\n            const ang = louverAngle(beam, bladeW, state.louverT);''',
'exact closed louver angle')

# Hidden underlap is not visible when shut. Reveal it smoothly as the blade opens;
# this removes the coplanar underside overlap that caused the last 15->0 % jitter.
s = once(s,
'''            const overlap = Math.max(0, bladeW - Math.min(bladeW, pitch));\n            const topLeadS = -fullHalf + overlap;\n            const bladeUx = Math.cos(ang), bladeUz = Math.sin(ang);''',
'''            const overlap = Math.max(0, bladeW - Math.min(bladeW, pitch));\n            const topLeadS = -fullHalf + overlap;\n            const revealK = Math.max(0, Math.min(1, state.louverT / 0.12));\n            const underReveal = revealK * revealK * (3 - 2 * revealK);\n            const underLeadS = topLeadS + (-fullHalf - topLeadS) * underReveal;\n            const bladeUx = Math.cos(ang), bladeUz = Math.sin(ang);''',
'underlap reveal')

s = once(s,
'''              const fullAX = x - dx, fullAZ = mid - dz;\n              const aX = x + topLeadS * bladeUx, aZ = mid + topLeadS * bladeUz;\n              const bX = x + dx, bZ = mid + dz;''',
'''              const fullAX = x - dx, fullAZ = mid - dz;\n              const aX = x + topLeadS * bladeUx, aZ = mid + topLeadS * bladeUz;\n              const underAX = x + underLeadS * bladeUx, underAZ = mid + underLeadS * bladeUz;\n              const bX = x + dx, bZ = mid + dz;''',
'underlap visible start')

s = once(s,
'''              const lay = { bias: i * 0.02 };''',
'''              const lay = { bias: i * 2 };''',
'deterministic louver paint bias')

# Uniform underside: no fake two-tone/shadow bands. Keep only a darker physical
# trailing edge so the section still reads as a solid extrusion.
s = once(s,
'''              /* Rub lamely nie je jeden tón. Horná hrana je zastrčená pod\n                 susednou lamelou, takže tá polovica je v jej tieni; spodná\n                 hrana je otvorená k oblohe a je svetlejšia. Rub sa preto\n                 kreslí ako dva pásy. Je to skutočný jav a zároveň jediné,\n                 čo dá radu lamiel kontrast aj na antracite — na bielej bolo\n                 všetko vidieť, na tmavej sa strecha zdola zlievala do dosky. */\n              const sX = (fullAX + bX) / 2 + ox, sZ = (fullAZ + bZ) / 2 + oz;\n              quad([[fullAX+ox,y1+lap,fullAZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[fullAX+ox,y0-lap,fullAZ+oz]], shade(louv, -0.04), underO);\n              quad([[sX,y1+lap,sZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz],[sX,y0-lap,sZ]], shade(louv, -0.40), underO);\n              quad([[bX,y0-lap,bZ],[bX,y1+lap,bZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz]], shade(louv, -0.48), layO);\n              /* Pevný tesniaci podklad uzatvára skutočnú šírku profilu.\n                 Pri zatvorení leží pod koncom susednej lamely, takže horné\n                 plochy sa iba stretnú na hrane a BSP nemusí deliť dve veľké\n                 koplanárne plochy. Celý tento profil sa potom iba otáča. */\n              if (overlap > 0.5)\n                quad([[fullAX+ox,y0-lap,fullAZ+oz],[aX,y0-lap,aZ],[aX,y1+lap,aZ],[fullAX+ox,y1+lap,fullAZ+oz]], shade(louv, -0.40), layO);''',
'''              /* The visible underside is one powder-coated surface. The old\n                 two-band fake shadow made neighbouring blades look randomly\n                 recoloured even in a view with no cast shadow. Keep one stable\n                 material tone; geometry, not a painted stripe, describes depth.\n\n                 At 0 % the sealing underlap is physically hidden by the next\n                 blade, so only one pitch is visible and neighbouring undersides\n                 meet without coplanar overlap. During the first 12 % of opening\n                 that hidden part is revealed smoothly. */\n              const underFlatO = Object.assign({}, underO, { raw: true, edge: false });\n              const edgeO = Object.assign({}, layO, { raw: true, edge: false });\n              quad([[underAX+ox,y1+lap,underAZ+oz],[bX+ox,y1+lap,bZ+oz],\n                    [bX+ox,y0-lap,bZ+oz],[underAX+ox,y0-lap,underAZ+oz]],\n                   shade(louv, -0.08), underFlatO);\n              quad([[bX,y0-lap,bZ],[bX,y1+lap,bZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz]],\n                   shade(louv, -0.26), edgeO);\n              if (overlap > 0.5 && underReveal > 0.001)\n                quad([[underAX+ox,y0-lap,underAZ+oz],[aX,y0-lap,aZ],\n                      [aX,y1+lap,aZ],[underAX+ox,y1+lap,underAZ+oz]],\n                     shade(louv, -0.18), edgeO);''',
'uniform louver underside')

# 9) Exactly one visible-tab scheduler. Dual rAF+timeout clocks could still beat
# each other under load and create the remaining micro-jumps and final settle.
s = once(s,
'''        let stagePending = 0, stageTimer = 0, stageRaf = 0;\n        const paintStage = () => {\n          if (!stagePending) return;\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          window.clearTimeout(stageTimer);\n          stageTimer = 0;\n          drawStage();\n          syncSideMove();\n          syncLouverReadout();\n        };\n        const scheduleStage = () => {\n          if (stagePending) return;\n          stagePending = 1;\n          stageRaf = window.requestAnimationFrame(paintStage);\n          stageTimer = window.setTimeout(paintStage, 60);\n        };\n        const flushStage = () => { if (stagePending) paintStage(); };\n        const cancelStageQueue = () => {\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          window.clearTimeout(stageTimer);\n          stageTimer = 0;\n        };\n\n        let louverRun = 0, moverTimer = 0;''',
'''        let stagePending = 0, stageRaf = 0;\n        const paintStage = () => {\n          if (!stagePending) return;\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          drawStage();\n          syncSideMove();\n          syncLouverReadout();\n        };\n        const scheduleStage = () => {\n          if (stagePending) return;\n          stagePending = 1;\n          stageRaf = window.requestAnimationFrame(paintStage);\n        };\n        const flushStage = () => { if (stagePending) paintStage(); };\n        const cancelStageQueue = () => {\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n        };\n\n        let louverRun = 0;''',
'single stage scheduler')

s = once(s,
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          /* A slider/camera frame queued before this animation must never''',
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          /* A slider/camera frame queued before this animation must never''',
'remove mover timer reset')

s = once(s,
'''            if (k < 1) {\n              louverRun = requestAnimationFrame(step);\n              window.clearTimeout(moverTimer);\n              moverTimer = window.setTimeout(() => {\n                /* rAF is the primary clock. The timeout is only a fallback for\n                   throttled/hidden tabs; if it wins, cancel the queued rAF so\n                   one physical instant can never be rendered twice. */\n                if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n                moverTimer = 0;\n                step(clockNow());\n              }, 90);\n              return;\n            }\n            louverRun = 0;\n            window.clearTimeout(moverTimer);\n            moverTimer = 0;''',
'''            if (k < 1) {\n              louverRun = requestAnimationFrame(step);\n              return;\n            }\n            louverRun = 0;''',
'single mover scheduler')

s = once(s,
'''          louverRun = requestAnimationFrame(step);\n          moverTimer = window.setTimeout(() => {\n            if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n            moverTimer = 0;\n            step(clockNow());\n          }, 90);''',
'''          louverRun = requestAnimationFrame(step);''',
'remove initial mover timer')

s = once(s,
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          /* runMover has a timeout fallback as well as rAF. Cancelling only\n             rAF left that stale fallback alive and it could move the blades\n             backwards one frame after a new hold started. */\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          cancelStageQueue();''',
'''          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          cancelStageQueue();''',
'remove hold fallback timer')

JS.write_text(s, encoding='utf-8')

# Update source contracts to describe the corrected renderer rather than the old workarounds.
m = MOTION.read_text(encoding='utf-8')
m = once(m,
"  assert.match(source, /const renderLouverT = Math\\.max\\(0\\.003, state\\.louverT\\);/, 'Closed Soltec louvers must avoid the exact coplanar BSP singularity');",
"  assert.match(source, /const ang = louverAngle\\(beam, bladeW, state\\.louverT\\);/, 'Closed Soltec louvers must render at the exact requested angle');\n  assert.doesNotMatch(source, /renderLouverT/, 'Soltec must not fake a partially open closed stop');\n  assert.match(source, /const underReveal = revealK \* revealK \* \\(3 - 2 \* revealK\\);/, 'Hidden sealing underlap must reveal smoothly instead of overlapping at the closed stop');",
'motion exact closed contract')
m = once(m,
"  assert.match(source, /let stagePending = 0, stageTimer = 0, stageRaf = 0;/, 'Stage scheduling must own and cancel its pending animation frame');",
"  assert.match(source, /let stagePending = 0, stageRaf = 0;/, 'Stage scheduling must have one animation-frame owner');\n  assert.doesNotMatch(source, /stageTimer|moverTimer/, 'Visible Soltec motion must not race rAF against timeout clocks');",
'motion scheduler contract')
m = once(m,
"  assert.match(source, /const BSP_MAX = model\\(\\)\\.kvGeom \\? 320 : 28;/, 'Soltec BSP must keep its bounded interactive-depth path');\n  assert.match(source, /const BSP_LEAF = model\\(\\)\\.kvGeom \\? 0 : 18;/, 'Soltec BSP must stop subdividing already-small local face sets');",
"  assert.match(source, /const BSP_MAX = model\\(\\)\\.kvGeom \\? 320 : 48;/, 'Soltec BSP must keep the corrected structural-depth path');\n  assert.match(source, /const BSP_LEAF = model\\(\\)\\.kvGeom \\? 0 : 10;/, 'Soltec BSP must resolve small structural overlaps before falling back to centroid order');",
'motion BSP contract')
m = m.replace("  assert.match(source, /if \\(moverTimer\\) \\{ window\\.clearTimeout\\(moverTimer\\); moverTimer = 0; \\}/, 'Changing louver interaction mode must clear the stale mover fallback timer');\n", "")
m = once(m,
"  assert.match(source, /shade\\(louv, -0\\.48\\), layO\\);/, 'The louver edge thickness must remain double-sided and visible');",
"  assert.match(source, /shade\\(louv, -0\\.08\\), underFlatO\\);/, 'The louver underside must use one stable material tone');\n  assert.match(source, /shade\\(louv, -0\\.26\\), edgeO\\);/, 'The louver edge thickness must remain visible without fake underside striping');",
'motion underside contract')
MOTION.write_text(m, encoding='utf-8')

a = ALL.read_text(encoding='utf-8')
a = once(a,
"  assert.match(source, /const renderLouverT = Math\\.max\\(0\\.003, state\\.louverT\\);/, 'Closed louvers must avoid the coplanar BSP singularity');",
"  assert.match(source, /const ang = louverAngle\\(beam, bladeW, state\\.louverT\\);/, 'Closed louvers must be exactly horizontal at 0%');\n  assert.doesNotMatch(source, /renderLouverT/, 'No fake closed-stop angle may remain');",
'all-model exact closed contract')
a = once(a,
"  assert.match(source, /const cancelStageQueue = \\(\\) =>/, 'Louver motion must cancel stale queued stage frames');",
"  assert.match(source, /const cancelStageQueue = \\(\\) =>/, 'Louver motion must cancel stale queued stage frames');\n  assert.match(source, /edge: model\\(\\)\\.kvGeom \\? o\\.edge !== false : o\\.edge === true/, 'Soltec structural faces must not receive synthetic outline strokes');\n  assert.match(source, /cull: model\\(\\)\\.kvGeom, arris:/, 'Soltec closed solids must keep their physical faces through grazing views');\n  assert.match(source, /boxFaces\\(x0, inY0, zTop - rd, w, inY1 - inY0, rd, hex, \\[\\], SHAFT, 0, false, true\\);/, 'Fixed Soltec secondary profiles must retain both end caps');",
'all-model structural contract')
ALL.write_text(a, encoding='utf-8')

print('Applied final Soltec renderer correction')
