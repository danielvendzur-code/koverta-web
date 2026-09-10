from pathlib import Path

p = Path('konfigurator/soltec-premium.js')
s = p.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)


# 1) Softer Koverta post corners. Keep the measured outer section unchanged;
# only refine the tiny corner radius approximation from one hard chamfer to
# two narrow facets. This avoids both the boxy diagonal cut and the old many-
# facet vertical banding.
replace_once(
    "const r = Math.max(3, Math.round(Math.min(pd, pw) * 0.035));\n                const zTopP = H + lift;",
    "const r = Math.max(4, Math.round(Math.min(pd, pw) * 0.05));\n                const zTopP = H + lift;",
    'post corner radius',
)
replace_once(
    "const SEG = 1;\n                const cs = [];",
    "const SEG = 2;\n                const cs = [];",
    'post corner segments',
)

# 2) Real Koverta underside is galvanized/silver in the realization photos.
# Keep the corrugated geometry and optional insulation exactly as-is; only use
# the same evidenced galvanized family as the surrounding C profiles instead
# of the anthracite-ish legacy fallback.
replace_once(
    "const spodHex = maIzolaciu ? '#c7c4bb' : (model().trapezSoffitHex || '#8f9295');",
    "const spodHex = maIzolaciu ? '#c7c4bb' : shade(zinok, -0.03);",
    'Koverta soffit material tone',
)

# 3) Seal only artificial BSP cuts inside the long corrugated roof facets.
# Never stroke their real perimeter: drainage mouths and fascia silhouette must
# stay geometrically untouched. This changes no geometry, BSP tolerance, depth
# order, dimensions, price data or camera behavior.
replace_once(
    "              seamless: o.seamless === true,\n              /* Soltec uses explicit painter bias",
    "              seamless: o.seamless === true,\n              /* Opt-in only for large Koverta sheet facets whose artificial\n                 BSP fragment edges must not expose sub-pixel background. */\n              sealSplits: o.sealSplits === true,\n              /* Soltec uses explicit painter bias",
    'quad sealSplits metadata',
)
replace_once(
    "              w,\n              p,\n              depthAvg: depths.reduce((sum, value) => sum + value, 0) / depths.length,",
    "              w,\n              p,\n              /* Preserve the untouched source polygon through recursive BSP\n                 splits so a final fragment can distinguish a real product\n                 perimeter from an artificial clipping edge. */\n              sourceW: face.sourceW || face.w.map((point) => point.slice()),\n              depthAvg: depths.reduce((sum, value) => sum + value, 0) / depths.length,",
    'faceFragment source polygon',
)
replace_once(
    "                  raw: true,\n                  seamless: true\n                });",
    "                  raw: true,\n                  seamless: true,\n                  sealSplits: true\n                });",
    'corrugated surface split sealing opt-in',
)

paint_anchor = "          bspPaintOrder(podklad).concat(bspPaintOrder(stavba)).forEach((f) => {"
helper = """          /* Raster seal for BSP-created edges inside opted-in Koverta roof
             facets. It explicitly rejects every edge that belongs to the root
             polygon, so no real roof perimeter, drainage opening or flashing
             silhouette can be painted over. */
          const pointOnSourceSegment = (point, a, b) => {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const len2 = ux * ux + uy * uy + uz * uz;
            if (len2 <= BSP_EPS * BSP_EPS) return false;
            const vx = point[0] - a[0], vy = point[1] - a[1], vz = point[2] - a[2];
            const t = (vx * ux + vy * uy + vz * uz) / len2;
            if (t < -1e-10 || t > 1 + 1e-10) return false;
            const qx = a[0] + ux * t, qy = a[1] + uy * t, qz = a[2] + uz * t;
            return Math.hypot(point[0] - qx, point[1] - qy, point[2] - qz) <= BSP_EPS;
          };
          const edgeBelongsToSource = (a, b, source) => {
            if (!Array.isArray(source) || source.length < 3) return true;
            for (let i = 0; i < source.length; i++) {
              const u = source[i], v = source[(i + 1) % source.length];
              if (pointOnSourceSegment(a, u, v) && pointOnSourceSegment(b, u, v)) return true;
            }
            return false;
          };
          const internalSplitEdges = (f) => {
            if (!f.sealSplits || f.edge || !Array.isArray(f.sourceW)) return [];
            const out = [];
            for (let i = 0; i < f.w.length; i++) {
              const j = (i + 1) % f.w.length;
              if (!edgeBelongsToSource(f.w[i], f.w[j], f.sourceW)) out.push([f.p[i], f.p[j]]);
            }
            return out;
          };

"""
replace_once(paint_anchor, helper + paint_anchor, 'final paint helper insertion')

replace_once(
    "            g.appendChild(svgEl('polygon', a));\n          });",
    "            g.appendChild(svgEl('polygon', a));\n            internalSplitEdges(f).forEach((edge) => {\n              const u = edge[0], v = edge[1];\n              g.appendChild(svgEl('line', {\n                x1: (u.x * scale + ox).toFixed(2), y1: (u.y * scale + oy).toFixed(2),\n                x2: (v.x * scale + ox).toFixed(2), y2: (v.y * scale + oy).toFixed(2),\n                stroke: f.fill, 'stroke-width': '0.7', 'stroke-linecap': 'butt'\n              }));\n            });\n          });",
    'final paint artificial-edge seal',
)

p.write_text(s, encoding='utf-8')
