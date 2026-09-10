from pathlib import Path

p = Path('konfigurator/soltec-premium.js')
s = p.read_text(encoding='utf-8')

old = """            const bladeW = blade.w;                      // \"lamela 200\" or \"lamela 270\"\n            const ang = louverAngle(beam, bladeW, state.louverT);\n"""
new = """            const bladeW = blade.w;                      // \"lamela 200\" or \"lamela 270\"\n            /* Exactly zero degrees makes every neighbouring underside plane\n               mathematically coplanar. The simplified sealing overlap then\n               gives BSP several valid paint orders and tiny camera changes can\n               reshuffle them. Keep the visual closed stop, but render it a\n               fraction of a degree off the singular plane. Across a 200 mm\n               blade this is sub-millimetre and not visually measurable. */\n            const renderLouverT = Math.max(0.003, state.louverT);\n            const ang = louverAngle(beam, bladeW, renderLouverT);\n"""
if old not in s:
    raise SystemExit('blade angle anchor not found')
s = s.replace(old, new, 1)

old = """        const flushStage = () => { if (stagePending) paintStage(); };\n\n        let louverRun = 0, moverTimer = 0;\n"""
new = """        const flushStage = () => { if (stagePending) paintStage(); };\n        const cancelStageQueue = () => {\n          stagePending = 0;\n          if (stageRaf) { window.cancelAnimationFrame(stageRaf); stageRaf = 0; }\n          window.clearTimeout(stageTimer);\n          stageTimer = 0;\n        };\n\n        let louverRun = 0, moverTimer = 0;\n"""
if old not in s:
    raise SystemExit('stage queue anchor not found')
s = s.replace(old, new, 1)

old = """          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          if (ch === 'all') { MOVER.all.ciel = to; MOVER.all.zapamataj(); }\n"""
new = """          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          /* A slider/camera frame queued before this animation must never\n             repaint an older state in the middle of the new motion. */\n          cancelStageQueue();\n          if (ch === 'all') { MOVER.all.ciel = to; MOVER.all.zapamataj(); }\n"""
if old not in s:
    raise SystemExit('runMover start anchor not found')
s = s.replace(old, new, 1)

old = """            louverRun = 0;\n            window.clearTimeout(moverTimer);\n            moverTimer = 0;\n            M.set(to);\n            /* Beh končil prestavbou celého panela. Tá prejde aj cez ,\n               takže posledný snímok behu a to, čo ostane na obrazovke, nie je tá istá\n               geometria — lamely na konci každého zatvorenia poskočili. Od polohy\n               lamiel ani krídel nezávisí nič v paneli okrem čísel, ktoré dopíšeme sami. */\n            drawStage();\n            syncSideMove();\n            syncLouverReadout();\n"""
new = """            louverRun = 0;\n            window.clearTimeout(moverTimer);\n            moverTimer = 0;\n            /* k === 1 was already rendered above with M.set(to). Do not draw\n               the identical endpoint a second time: near the closed coplanar\n               state that redundant BSP pass was visible as a final settle. */\n"""
if old not in s:
    raise SystemExit('runMover endpoint anchor not found')
s = s.replace(old, new, 1)

old = """          if ((holdDir > 0 && v >= 1) || (holdDir < 0 && v <= 0)) { stopHold(); return; }\n          hold = requestAnimationFrame(holdStep);\n"""
new = """          if ((holdDir > 0 && v >= 1) || (holdDir < 0 && v <= 0)) {\n            /* This exact endpoint has already been painted in this frame.\n               Mark the hold complete without asking stopHold() to repaint it. */\n            hold = 0;\n            holdDir = 0;\n            return;\n          }\n          hold = requestAnimationFrame(holdStep);\n"""
if old not in s:
    raise SystemExit('hold endpoint anchor not found')
s = s.replace(old, new, 1)

old = """          if (model().kvGeom) renderAll();\n          else { drawStage(); syncLouver(); }\n        };\n        const startHold = (dir, ch) => {\n          if (hold) return;\n          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          holdCh = ch || 'louver';\n"""
new = """          if (model().kvGeom) renderAll();\n          else { cancelStageQueue(); syncLouver(); }\n        };\n        const startHold = (dir, ch) => {\n          if (hold) return;\n          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n          /* runMover has a timeout fallback as well as rAF. Cancelling only\n             rAF left that stale fallback alive and it could move the blades\n             backwards one frame after a new hold started. */\n          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }\n          cancelStageQueue();\n          holdCh = ch || 'louver';\n"""
if old not in s:
    raise SystemExit('hold start/stop anchor not found')
s = s.replace(old, new, 1)

if "if (!model().kvGeom) flushStage();" not in s:
    raise SystemExit('camera release flush missing from current branch')

p.write_text(s, encoding='utf-8')

t = Path('konfigurator/test/soltec-motion-regression.js')
ts = t.read_text(encoding='utf-8')

old = """  assert.match(source, /const fullHalf = bladeW \\/ 2;/, 'Soltec louvers must keep a rigid full-width profile while rotating');\n"""
new = """  assert.match(source, /const fullHalf = bladeW \\/ 2;/, 'Soltec louvers must keep a rigid full-width profile while rotating');\n  assert.match(source, /const renderLouverT = Math\\.max\\(0\\.003, state\\.louverT\\);/, 'Closed Soltec louvers must avoid the exact coplanar BSP singularity');\n  assert.match(source, /const cancelStageQueue = \\(\\) =>/, 'Soltec moving interactions must be able to cancel stale queued stage frames');\n  assert.match(source, /if \\(moverTimer\\) \\{ window\\.clearTimeout\\(moverTimer\\); moverTimer = 0; \\}/, 'Changing louver interaction mode must clear the stale mover fallback timer');\n"""
if old not in ts:
    raise SystemExit('test source-contract anchor not found')
ts = ts.replace(old, new, 1)

# A release-settle assertion is already present on the current branch from the
# previous verified pass. Keep it and require it to remain instead of adding a
# duplicate test block.
if "releaseSettle < 0.05" not in ts:
    raise SystemExit('existing camera release-settle assertion missing')

old = """  const minLouver = Math.min(...louverCounts.map((item) => item.count));\n  const maxLouver = Math.max(...louverCounts.map((item) => item.count));\n  assert.ok(minLouver > 0, 'Soltec scene disappeared during louver travel');\n  assert.ok(maxLouver / minLouver < 1.45, `Soltec polygon count is unstable during louver travel: ${minLouver}..${maxLouver}`);\n\n  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'soltec-motion-final.png'), fullPage: false });\n"""
new = """  const minLouver = Math.min(...louverCounts.map((item) => item.count));\n  const maxLouver = Math.max(...louverCounts.map((item) => item.count));\n  assert.ok(minLouver > 0, 'Soltec scene disappeared during louver travel');\n  assert.ok(maxLouver / minLouver < 1.45, `Soltec polygon count is unstable during louver travel: ${minLouver}..${maxLouver}`);\n\n  // Closing is the numerically hardest region because neighbouring blades\n  // approach parallel/coplanar planes. Inspect it at 1-3% increments rather\n  // than letting the ordinary 5% sweep skip over the problematic endpoint.\n  const closeCounts = [];\n  for (const value of [15, 12, 10, 8, 6, 4, 3, 2, 1, 0]) {\n    const count = await page.evaluate((nextValue) => {\n      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');\n      range.value = String(nextValue);\n      range.dispatchEvent(new Event('input', { bubbles: true }));\n      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() =>\n        resolve(document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length))));\n    }, value);\n    closeCounts.push({ value, count });\n  }\n  for (let i = 1; i < closeCounts.length; i += 1) {\n    const a = closeCounts[i - 1].count, b = closeCounts[i].count;\n    const jump = Math.abs(b - a) / Math.max(1, Math.max(a, b));\n    assert.ok(jump < 0.12, `Soltec close-end topology jumps at ${closeCounts[i].value}%: ${a} -> ${b}`);\n  }\n\n  // Run the real close button, then make sure no stale timer or queued stage\n  // frame changes the finished SVG after the endpoint has been reached.\n  const openButton = page.locator('#SoltecPremium [data-sp-louver="1"]');\n  const closeButton = page.locator('#SoltecPremium [data-sp-louver="0"]');\n  await openButton.click();\n  await page.waitForTimeout(2350);\n  await closeButton.click();\n  await page.waitForTimeout(2350);\n  const endpointA = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);\n  await page.waitForTimeout(180);\n  const endpointB = await page.evaluate(() => document.querySelector('#SoltecPremium [data-sp-canvas]').innerHTML);\n  assert.equal(endpointB, endpointA, 'Soltec SVG changed after the closing animation had already finished');\n\n  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'soltec-motion-final.png'), fullPage: false });\n"""
if old not in ts:
    raise SystemExit('low-close test anchor not found')
ts = ts.replace(old, new, 1)

t.write_text(ts, encoding='utf-8')
