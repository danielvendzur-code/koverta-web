from pathlib import Path

source_path = Path('konfigurator/soltec-premium.js')
test_path = Path('konfigurator/test/soltec-motion-regression.js')
source = source_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

replacements = [
    (
        """              const obrys = { arris: false };\n              const layO = Object.assign({}, lay, obrys);""",
        """              const obrys = { arris: false };\n              /* Soltec motion stability: rotating louvers must not participate\n                 in stage fitting. The fixed frame/posts define the camera\n                 envelope, so opening/closing cannot zoom, wave or settle the\n                 whole pergola. */\n              const layO = Object.assign({}, lay, obrys, { fit: false });""",
    ),
    (
        """                ], fill, { normal: [0, 0, -1], cull: true, edge: false, raw: true, bias: bias });""",
        """                ], fill, { normal: [0, 0, -1], cull: true, edge: false, raw: true, bias: bias, fit: false });""",
    ),
    (
        """              moverTimer = window.setTimeout(step, 90);""",
        """              moverTimer = window.setTimeout(() => {\n                /* rAF is the primary clock. The timeout is only a fallback for\n                   throttled/hidden tabs; if it wins, cancel the queued rAF so\n                   one physical instant can never be rendered twice. */\n                if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }\n                moverTimer = 0;\n                step(clockNow());\n              }, 90);""",
    ),
    (
        """          if (se > 0.01) {\n            const reach = Math.max(L, W) * 2.4;""",
        """          /* Ground visibility follows the camera's real world-space\n             height, not an arbitrary elevation threshold through the model.\n             The old se > 0.01 switch added ~80 paving polygons in one frame\n             and caused a visible pop while orbiting near the horizon. */\n          if ((H / 2 + se * DIST) > 0) {\n            const reach = Math.max(L, W) * 2.4;""",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one source match, got {count}: {old[:80]!r}')
    source = source.replace(old, new, 1)

contract_anchor = """  assert.match(source, /const fullHalf = bladeW \\/ 2;/, 'Soltec louvers must keep a rigid full-width profile while rotating');\n"""
contract_add = contract_anchor + """  assert.match(source, /const layO = Object\\.assign\\(\\{\\}, lay, obrys, \\{ fit: false \\}\\);/, 'Moving Soltec louvers must not change stage fitting');\n  assert.match(source, /raw: true, bias: bias, fit: false/, 'Louver-mounted LED geometry must not change stage fitting');\n  assert.match(source, /if \\(\\(H \\/ 2 \\+ se \\* DIST\\) > 0\\)/, 'Ground visibility must use actual camera height');\n  assert.doesNotMatch(source, /if \\(se > 0\\.01\\)/, 'Ground must not pop at an arbitrary camera elevation threshold');\n"""
if test.count(contract_anchor) != 1:
    raise SystemExit('Could not locate Soltec source-contract anchor')
test = test.replace(contract_anchor, contract_add, 1)

runtime_anchor = """  assert.equal(pageKind, 'bio', 'Motion regression must run on the Soltec bioclimatic pergola, not Koverta');\n\n"""
runtime_add = runtime_anchor + r"""  // The frame/posts are static while the blades rotate. Projecting the same
  // world point must therefore stay pixel-identical through the full louver
  // travel; any drift means moving blade bounds are zooming/recentering the
  // whole stage, which is the visible "waving/settling" regression.
  const framingSamples = [];
  for (const value of [0, 10, 25, 40, 55, 70, 85, 100]) {
    const anchor = await page.evaluate((nextValue) => {
      const range = document.querySelector('#SoltecPremium [data-sp-louver-range]');
      if (!range) throw new Error('Louver range not found for framing regression');
      range.value = String(nextValue);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(window.SP_TEST.project(0, 0, 0));
      })));
    }, value);
    framingSamples.push({ value, x: anchor.x, y: anchor.y });
  }
  const frameXs = framingSamples.map((item) => item.x);
  const frameYs = framingSamples.map((item) => item.y);
  const frameDriftX = Math.max(...frameXs) - Math.min(...frameXs);
  const frameDriftY = Math.max(...frameYs) - Math.min(...frameYs);
  assert.ok(frameDriftX < 0.12 && frameDriftY < 0.12,
    `Soltec stage framing moves with the louvers: dx=${frameDriftX.toFixed(3)} dy=${frameDriftY.toFixed(3)}`);

"""
if test.count(runtime_anchor) != 1:
    raise SystemExit('Could not locate Soltec runtime-test anchor')
test = test.replace(runtime_anchor, runtime_add, 1)

metrics_old = """  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, p95, maxFrame }, null, 2));"""
metrics_new = """  fs.writeFileSync(path.join(ARTIFACT_DIR, 'metrics.json'), JSON.stringify({ cameraCounts, louverCounts, framingSamples, frameDriftX, frameDriftY, p95, maxFrame }, null, 2));"""
if test.count(metrics_old) != 1:
    raise SystemExit('Could not locate Soltec metrics write')
test = test.replace(metrics_old, metrics_new, 1)

# Correct the stale legacy route used by this test. The actual Soltec runtime
# is mounted by the unified configurator on ?page=bio.
test = test.replace("http://127.0.0.1:8901/bioklimaticke-pergoly/", "http://127.0.0.1:8901/konfigurator/?page=bio")

source_path.write_text(source, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
print('Applied Soltec louver, camera-ground stability and regression patches.')
