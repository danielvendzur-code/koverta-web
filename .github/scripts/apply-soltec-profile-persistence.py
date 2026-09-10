from pathlib import Path

renderer = Path('konfigurator/soltec-premium.js')
s = renderer.read_text(encoding='utf-8')

old = """          const nearSide = (n) => { layer = roofBase + (facing(n) > 0 ? UNDER_SIDE : -UNDER_SIDE); };\n"""
new = """          const nearSide = (n) => {\n            /* Koverta still uses its established side-layer ordering. Soltec\n               must not do that: below the roof, `roofBase - UNDER_SIDE` falls\n               below `-ROOF_LAYER`, which is the renderer's background cutoff.\n               A perfectly valid perimeter member was therefore classified\n               like paving/shadow and painted before the pergola, so it could\n               disappear completely behind the louvers at certain camera\n               angles. Soltec already has BSP world-space occlusion; keep all\n               four fixed rim members in the structure set and let geometry\n               decide what is actually hidden. */\n            layer = model().kvGeom\n              ? roofBase + (facing(n) > 0 ? UNDER_SIDE : -UNDER_SIDE)\n              : roofBase;\n          };\n"""
if old not in s:
    raise SystemExit('nearSide anchor not found')
s = s.replace(old, new, 1)
renderer.write_text(s, encoding='utf-8')

test = Path('konfigurator/test/soltec-motion-regression.js')
t = test.read_text(encoding='utf-8')
anchor = """  assert.match(source, /window\\.SP_TEST\\.redrawStage = \\(\\) => \\{ if \\(!model\\(\\)\\.kvGeom\\) drawStage\\(\\); else renderAll\\(\\); \\};/, 'Soltec test hook must exercise the stage-only renderer');\n"""
insert = anchor + """  assert.match(source, /layer = model\\(\\)\\.kvGeom[\\s\\S]{0,120}\\? roofBase \\+ \\(facing\\(n\\) > 0 \\? UNDER_SIDE : -UNDER_SIDE\\)[\\s\\S]{0,80}: roofBase;/, 'Soltec perimeter profiles must remain structural faces at every camera angle');\n"""
if anchor not in t:
    raise SystemExit('source contract anchor not found')
t = t.replace(anchor, insert, 1)

cam_anchor = """  for (let i = 1; i < cameraCounts.length; i += 1) {\n    const a = cameraCounts[i - 1].count;\n    const b = cameraCounts[i].count;\n    const relativeJump = Math.abs(b - a) / Math.max(1, Math.max(a, b));\n    assert.ok(relativeJump < 0.22, `Abrupt Soltec face-count jump at elevation ${cameraCounts[i].el.toFixed(2)}: ${a} -> ${b}`);\n  }\n\n"""
cam_insert = cam_anchor + """  // The disappearing-rim regression was azimuth-dependent while looking\n  // slightly upward from below. Sweep a full orbit at that elevation and make\n  // sure the fixed scene never collapses into an anomalously small face set.\n  const rimOrbitCounts = [];\n  for (let i = 0; i <= 72; i += 1) {\n    const az = -Math.PI + (Math.PI * 2 * i) / 72;\n    const count = await page.evaluate(([azimuth, elevation]) => {\n      window.SP_TEST.setView(azimuth, elevation);\n      window.SP_TEST.redrawStage();\n      return document.querySelectorAll('#SoltecPremium [data-sp-canvas] polygon').length;\n    }, [az, -0.18]);\n    rimOrbitCounts.push({ az, count });\n  }\n  const orbitSorted = rimOrbitCounts.map((item) => item.count).sort((a, b) => a - b);\n  const orbitMedian = orbitSorted[Math.floor(orbitSorted.length / 2)];\n  const orbitMin = Math.min(...orbitSorted);\n  assert.ok(orbitMin >= orbitMedian * 0.78, `Soltec fixed rim/profile disappears during low orbit: min=${orbitMin}, median=${orbitMedian}`);\n\n"""
if cam_anchor not in t:
    raise SystemExit('camera sweep anchor not found')
t = t.replace(cam_anchor, cam_insert, 1)

metrics_old = """  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, releaseSettle, p95, maxFrame }, null, 2));\n"""
metrics_new = """  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, rimOrbitCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, releaseSettle, p95, maxFrame }, null, 2));\n"""
if metrics_old not in t:
    raise SystemExit('metrics anchor not found')
t = t.replace(metrics_old, metrics_new, 1)

test.write_text(t, encoding='utf-8')
