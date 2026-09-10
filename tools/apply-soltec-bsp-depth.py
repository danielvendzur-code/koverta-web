from pathlib import Path

TARGET = Path("konfigurator/soltec-premium.js")
OLD = "const BSP_MAX = 320;"
NEW = "const BSP_MAX = model().kvGeom ? 320 : 96;"

source = TARGET.read_text(encoding="utf-8")
count = source.count(OLD)
if count != 1:
    raise RuntimeError(f"Expected exactly one shared BSP limit, found {count}")

TARGET.write_text(source.replace(OLD, NEW, 1), encoding="utf-8")
print("Restored the historical Soltec BSP depth 96; Koverta remains at 320.")
