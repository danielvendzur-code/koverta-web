from pathlib import Path

source_path = Path('konfigurator/soltec-premium.js')
test_path = Path('konfigurator/test/soltec-motion-regression.js')
source = source_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

replacements = [
    (
        "const layO = Object.assign({}, lay, obrys, { fit: false });",
        "const layO = Object.assign({}, lay, obrys, { fit: false, cull: true });",
    ),
    (
        "], fill, { normal: [0, 0, -1], cull: true, edge: false, raw: true, bias: bias, fit: false });",
        "], fill, { normal: [bladeUz, 0, -bladeUx], cull: true, edge: false, raw: true, bias: bias, fit: false });",
    ),
    (
        "assert.match(source, /const layO = Object\\.assign\\(\\{\\}, lay, obrys, \\{ fit: false \\}\\);/, 'Moving Soltec louvers must not change stage fitting');",
        "assert.match(source, /const layO = Object\\.assign\\(\\{\\}, lay, obrys, \\{ fit: false, cull: true \\}\\);/, 'Moving Soltec louvers must keep stable fitting and back-face visibility');\n  assert.match(source, /normal: \\[bladeUz, 0, -bladeUx\\]/, 'Louver-mounted LEDs must follow the rotating underside normal');",
    ),
]

for old, new in replacements:
    count = source.count(old) if old.startswith('const layO') or old.startswith('], fill') else test.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, got {count}: {old[:90]!r}')
    if old.startswith('const layO') or old.startswith('], fill'):
        source = source.replace(old, new, 1)
    else:
        test = test.replace(old, new, 1)

source_path.write_text(source, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
print('Applied Soltec louver back-face culling and rotating underside normal.')
