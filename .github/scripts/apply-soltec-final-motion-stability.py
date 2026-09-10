from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'konfigurator' / 'soltec-premium.js'
TEST = ROOT / 'konfigurator' / 'test' / 'soltec-motion-regression.js'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


s = SRC.read_text(encoding='utf-8')

# Keep the rigid original blade geometry, but cull only the broad top/bottom
# surfaces. The narrow front/rear thickness faces remain double-sided so the
# louver keeps the same apparent thickness from grazing/underside views.
s = replace_once(
    s,
    "              const layO = Object.assign({}, lay, obrys, { fit: false, cull: true });",
    "              const layO = Object.assign({}, lay, obrys, { fit: false });\n"
    "              const topO = Object.assign({}, layO, { cull: true, normal: [-bladeUz, 0, bladeUx] });\n"
    "              const underO = Object.assign({}, layO, { cull: true, normal: [bladeUz, 0, -bladeUx] });",
    'separate louver surface culling'
)

s = replace_once(
    s,
    "              quad([[aX,y0-lap,aZ],[jX,y0-lap,jZ],[jX,y1+lap,jZ],[aX,y1+lap,aZ]], shade(louv, -0.16), layO);\n"
    "              quad([[jX,y0-lap,jZ],[bX,y0-lap,bZ],[bX,y1+lap,bZ],[jX,y1+lap,jZ]], shade(louv, 0.16), layO);",
    "              quad([[aX,y0-lap,aZ],[jX,y0-lap,jZ],[jX,y1+lap,jZ],[aX,y1+lap,aZ]], shade(louv, -0.16), topO);\n"
    "              quad([[jX,y0-lap,jZ],[bX,y0-lap,bZ],[bX,y1+lap,bZ],[jX,y1+lap,jZ]], shade(louv, 0.16), topO);",
    'top louver faces'
)

s = replace_once(
    s,
    "              quad([[fullAX+ox,y1+lap,fullAZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[fullAX+ox,y0-lap,fullAZ+oz]], shade(louv, -0.04), layO);\n"
    "              quad([[sX,y1+lap,sZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz],[sX,y0-lap,sZ]], shade(louv, -0.40), layO);",
    "              quad([[fullAX+ox,y1+lap,fullAZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[fullAX+ox,y0-lap,fullAZ+oz]], shade(louv, -0.04), underO);\n"
    "              quad([[sX,y1+lap,sZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz],[sX,y0-lap,sZ]], shade(louv, -0.40), underO);",
    'underside louver faces'
)

# One render scheduler owns one rAF + one timeout. Whichever fires first cancels
# the other. pointer release can synchronously flush the final camera/slider
# state, so the model cannot visibly "settle" one frame after the user stops.
s = replace_once(
    s,
    "        let stagePending = 0, stageTimer = 0;\n"
    "        const scheduleStage = () => {\n"
    "          if (stagePending) return;\n"
    "          stagePending = 1;\n"
    "          const run = () => {\n"
    "            if (!stagePending) return;\n"
    "            stagePending = 0;\n"
    "            window.clearTimeout(stageTimer);\n"
    "            drawStage();\n"
    "            syncSideMove();\n"
    "            syncLouverReadout();\n"
    "          };\n"
    "          window.requestAnimationFrame(run);\n"
    "          stageTimer = window.setTimeout(run, 60);\n"
    "        };",
    "        let stagePending = 0, stageTimer = 0, stageRaf = 0;\n"
    "        const paintStage = () => {\n"
    "          if (!stagePending) return;\n"
    "          stagePending = 0;\n"
    "          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n"
    "          window.clearTimeout(stageTimer);\n"
    "          stageTimer = 0;\n"
    "          drawStage();\n"
    "          syncSideMove();\n"
    "          syncLouverReadout();\n"
    "        };\n"
    "        const scheduleStage = () => {\n"
    "          if (stagePending) return;\n"
    "          stagePending = 1;\n"
    "          stageRaf = window.requestAnimationFrame(paintStage);\n"
    "          stageTimer = window.setTimeout(paintStage, 60);\n"
    "        };\n"
    "        const flushStage = () => { if (stagePending) paintStage(); };",
    'single-owner stage scheduler'
)

s = replace_once(
    s,
    "          const stop = (e) => { if (!dragging) return; dragging = false; try { stageEl.releasePointerCapture(e.pointerId); } catch (err) {} };",
    "          const stop = (e) => {\n"
    "            if (!dragging) return;\n"
    "            dragging = false;\n"
    "            if (!model().kvGeom) flushStage();\n"
    "            try { stageEl.releasePointerCapture(e.pointerId); } catch (err) {}\n"
    "          };",
    'flush camera on release'
)

s = replace_once(
    s,
    "        window.addEventListener('pointerup', stopHold);\n"
    "        window.addEventListener('pointercancel', stopHold);",
    "        const finishPointerMotion = () => {\n"
    "          stopHold();\n"
    "          if (!model().kvGeom) flushStage();\n"
    "        };\n"
    "        window.addEventListener('pointerup', finishPointerMotion);\n"
    "        window.addEventListener('pointercancel', finishPointerMotion);",
    'flush slider/hold on release'
)

s = replace_once(
    s,
    "          louverRun = requestAnimationFrame(step);\n"
    "          moverTimer = window.setTimeout(step, 90);",
    "          louverRun = requestAnimationFrame(step);\n"
    "          moverTimer = window.setTimeout(() => {\n"
    "            if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n"
    "            moverTimer = 0;\n"
    "            step(clockNow());\n"
    "          }, 90);",
    'initial mover fallback race'
)

SRC.write_text(s, encoding='utf-8')


t = TEST.read_text(encoding='utf-8')

t = replace_once(
    t,
    "  assert.match(source, /const layO = Object\\.assign\\(\\{\\}, lay, obrys, \\{ fit: false, cull: true \\}\\);/, 'Moving Soltec louvers must keep stable fitting and back-face visibility');",
    "  assert.match(source, /const layO = Object\\.assign\\(\\{\\}, lay, obrys, \\{ fit: false \\}\\);/, 'Moving Soltec louvers must not change stage fitting');\n"
    "  assert.match(source, /const topO = Object\\.assign\\(\\{\\}, layO, \\{ cull: true, normal: \\[-bladeUz, 0, bladeUx\\] \\}\\);/, 'Only the broad louver top face is culled');\n"
    "  assert.match(source, /const underO = Object\\.assign\\(\\{\\}, layO, \\{ cull: true, normal: \\[bladeUz, 0, -bladeUx\\] \\}\\);/, 'Only the broad louver underside is culled');\n"
    "  assert.match(source, /shade\\(louv, -0\\.48\\), layO\\);/, 'The louver edge thickness must remain double-sided and visible');\n"
    "  assert.match(source, /let stagePending = 0, stageTimer = 0, stageRaf = 0;/, 'Stage scheduling must own and cancel its pending animation frame');\n"
    "  assert.match(source, /const flushStage = \\(\\) => \\{ if \\(stagePending\\) paintStage\\(\\); \\};/, 'Final pointer state must flush synchronously');\n"
    "  assert.doesNotMatch(source, /moverTimer = window\\.setTimeout\\(step, 90\\);/, 'Mover fallback must not race a queued animation frame');",
    'source contract for thickness and release stability'
)

# Measure the exact release frame. Without a synchronous flush the projection
# closure still represents the previous rendered camera pose immediately after
# pointerup, then changes a frame later: that is the visible "sadnutie".
t = replace_once(
    t,
    "  await page.mouse.up();\n"
    "  await page.waitForTimeout(120);\n\n"
    "  const motionMetrics = await page.evaluate(() => {",
    "  await page.mouse.up();\n"
    "  const releaseAnchor = await page.evaluate(() => window.SP_TEST.project(0, 0, 0));\n"
    "  await page.waitForTimeout(120);\n"
    "  const settledAnchor = await page.evaluate(() => window.SP_TEST.project(0, 0, 0));\n"
    "  const releaseSettle = Math.hypot(settledAnchor.x - releaseAnchor.x, settledAnchor.y - releaseAnchor.y);\n"
    "  assert.ok(releaseSettle < 0.05, `Soltec stage moved after pointer release: ${releaseSettle.toFixed(3)} px`);\n\n"
    "  const motionMetrics = await page.evaluate(() => {",
    'camera release settle regression'
)

t = replace_once(
    t,
    "  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, p95, maxFrame }, null, 2));",
    "  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, releaseSettle, p95, maxFrame }, null, 2));",
    'record release settle metric'
)

TEST.write_text(t, encoding='utf-8')
