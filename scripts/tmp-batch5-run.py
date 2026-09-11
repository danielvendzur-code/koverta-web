from pathlib import Path
import runpy

src_path = Path('scripts/tmp-batch5-apply.py')
src = src_path.read_text(encoding='utf-8').splitlines()
out = []
fixed = 0
for line in src:
    stripped = line.lstrip()
    indent = line[: len(line) - len(stripped)]
    if stripped.startswith('new = re.sub('):
        out.append(indent + 'new = re.sub(r"(koverta-2026\\.(?:css|js))(?:\\?v=[^\\\"<>\\s]*)?", rf"\\1?v={VERSION}", text)')
        fixed += 1
    elif stripped.startswith('for m in re.finditer('):
        out.append(indent + 'for m in re.finditer(r"koverta-2026\\.(?:css|js)(?:\\?v=[^\\\"<>\\s]*)?", text):')
        fixed += 1
    else:
        out.append(line)

if fixed != 2:
    raise SystemExit(f'expected two regex lines to repair, got {fixed}')

tmp = Path('/tmp/batch5-apply-fixed.py')
tmp.write_text('\n'.join(out) + '\n', encoding='utf-8')
compile(tmp.read_text(encoding='utf-8'), str(tmp), 'exec')
runpy.run_path(str(tmp), run_name='__main__')
