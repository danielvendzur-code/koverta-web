# KOVER​TA-04 — Accessories audit

## Scope

- Repository: `danielvendzur-code/koverta-web`
- Working branch: `agent/04-koverta-accessories`
- Branch base: `fix/final-koverta-audit-20260909`
- Exact base SHA used when the agent branch was created: `ac9cc67cccfecfbff36ed9953e14b93ffb7e1a64`
- Master was not modified.
- Nothing was merged.
- Scope was limited to KOVER​TA accessories, their KOVER​TA-only attachment logic and agent QA.
- Base roof/frame axes, structural bracket counts and structural screw truth were not independently changed by this agent.
- SOLTEC product data was not changed. In `cfg-pages.js`, embedded pages `carport`, `canopy` and `bio` are byte-for-byte identical to the base branch.

## Evidence policy

Photographs were used only to verify:

- existence of a component,
- appearance,
- visible attachment relationship,
- visible routing/placement.

Photographs were **not** used to derive manufacturing millimetres.

Where no active technical dimension was available, geometry is explicitly treated as a renderer-only visual proportion and is not presented as a certified KOVER​TA dimension.

## Sources reviewed

### Google Drive — realizations

Primary realization root:

- `MARKETING → realizácie → Koverta Auto Pristresky`
- Drive folder id: `1SxXlJMzd3Ni6xh-hP13_hdUkmOVKiPO4`

Specific realization evidence used:

1. **Slovenský Grob Graus 4,5 × 6 m**
   - folder id: `1i32mVb4Jlgp8I-XU3aOCapbmRgzM8C5h`
   - `IMG_0070.JPG`
   - file id: `1_JvSQWq4wcIBjHB4MCWEZg2g1q3yNtUX`
   - used for visible drainage/downpipe relationship and appearance only.

2. **Kolíňany Kmeť 5,8 × 6 × 4 stena RAL 7016**
   - folder id: `1zfMcJIKrKLzbqbTDEmR8xr4lVUTL8yaj`
   - `IMG_8739.jpeg`
   - file id: `1AnCCYQvrq9TxyEr_numYw5Cn0lmUonM4`
   - used for underside/roof construction and wall realization appearance.

### Google Drive — lighting references

Drive folder:

- `Osvetlenie`
- folder id: `10S8rJ_Vs_1FpJarnGyu3vafSbJ2VFZP0`

Files:

- `IMG_3676 copy.jpeg`
  - id: `1w1t5Sw5Yi1rkJkVd3GbbCN3vWCI5HzOD`
  - shows a KOVER​TA realization with line lighting following the visible frame perimeter.

- `IMG_3675 copy.jpeg`
  - id: `1w1FWxsiBe2Oi2exe3F5idZLQ3UFX7vx4`
  - second view of the same illuminated realization.

- `IMG_1569.jpeg`
  - id: `10ZmiliwPjt_HqwsbxkGSgZf2iWTynT3Y`
  - close-up showing a linear light/profile physically seated at a steel member and electrical installation detail.

These photos support the existence and visible attachment of line lighting. They do **not** establish a universal mandatory LED layout, profile size or wiring route for every KOVER​TA order.

### Current KOVER​TA web

Reviewed current public KOVER​TA pages, including:

- `https://koverta.sk/collections/pristresky-pre-auta`
- `https://koverta.sk/collections/pristresky-pre-auta/pre-2-auta`
- `https://koverta.sk/products/pristresok-pre-2-auta-5-2-x-5-6m`
- `https://koverta.sk/products/pristresok-pre-2-auta-5-6-x-5-6m`

Current official content supports:

- trapezoidal mono-pitch roof with gutter / optional gutter depending product wording,
- roof insulation as an available option,
- electrical connection hidden in a post,
- preparation for solar-panel installation,
- side walls using wood, WPC or aluminium,
- 6/7-post variants and full-width side-wall possibilities.

### Legacy configurator / Expivi reference

Reviewed the legacy Expivi/configurator material as a secondary reference, including the historic configurator route and the archived Expivi data retained in the repository.

Relevant archived active-scene references already carried by the KOVER​TA model include:

- scene/catalog `14069` — `7000 × 6000`
- scene/catalog `14192` — `7000 × 5200`
- repository archive source: `archiv-expivi/diely-zo-sceny.json`

Legacy data was not allowed to override newer active evidence blindly.

---

# Verified accessories

## 1. Odkvap + zvod

### Verification

**Status: verified as a real KOVER​TA component/option.**

Evidence:

- current KOVER​TA web,
- KOVER​TA realization photos,
- legacy/configurator context.

### Previous defect

The visual gutter was effectively assembled as a rectangular U-channel from box primitives. It read as a cheap square trough.

The downpipe also contained invalid dimension provenance: a roughly 70 mm diameter had previously been justified by pixel-scaling a render/photo. That is not acceptable technical evidence.

### Changes

- Replaced the three-box gutter appearance with a continuous sheet-metal cross-section.
- Cross-section now has a faceted/rounded bottom transition rather than a square slab trough.
- Added clean end closures.
- Added edge/lip treatment.
- Gutter sits inside the intended fascia/frame pocket.
- Gutter outlet is inside the gutter section.
- Downpipe throat starts inside the gutter/outlet region.
- Downpipe path is continuous and rounded through elbows.
- Downpipe is anchored from the **current actual corner-post section**, not from the generic 120 mm placeholder.
- Clamp geometry bridges the active post face and the pipe.
- Pipe diameter is no longer claimed as a verified KOVER​TA millimetre dimension.

### Anchor logic

For the active KOVER​TA render:

- current `postXs()` selects the actual post row,
- `kvStlpRez()` supplies the current post depth/width,
- the pipe centre is recomputed from that active post section,
- the gutter and outlet are recomputed from the current `L/W`, fascia pocket and frame geometry,
- the path and clamps are rebuilt on every redraw.

Therefore resize does not leave the downpipe at an old world-space coordinate.

### Technical limitation

Exact production gutter width/depth and downpipe diameter were not found in an active technical source. Their renderer proportions are therefore **visual approximations only**.

---

## 2. Roof insulation

### Verification

**Status: verified as a current KOVER​TA option.**

The current KOVER​TA carport collection explicitly offers insulation for the trapezoidal roof to reduce overheating, condensation and rain noise.

### Changes

- `kv-izol` is physically represented at the underside of the trapezoidal roof.
- It is not represented as a separate thick floating slab.
- No technical thickness was invented.
- The renderer changes the bonded underside surface/material at the same roof-bottom plane.

### Contact invariant

QA exposes and asserts:

- `insulation.renderZ === insulation.hostBottomZ`

This prevents a future implementation from moving the insulation away from the roof underside.

---

## 3. Linear LED lighting + electrical connection in post

### Verification

**Status: verified, with an important scope distinction.**

Verified:

- KOVER​TA realization photos show linear lighting installed on the steel structure.
- Current KOVER​TA web confirms that an electrical connection may be hidden in a post.

Not claimed:

- one universal LED profile dimension,
- one mandatory number of LED pieces,
- one universal wiring route,
- one mandatory perimeter layout for every order.

### Bugs found during QA

1. The first LED renderer had a guard:

   `dx <= ledW || dy <= ledW`

   One dimension of a valid linear strip intentionally equals `ledW`, so the condition rejected every horizontal and vertical LED run. The UI could say LED was selected while the model drew none.

2. LED anchor geometry was initially computed only when the camera was below the roof. That made the physical anchor dependent on the camera rather than the product.

3. A first perimeter treatment could visually bridge through post footprints. That would be a fantasy physical installation.

### Final implementation

- LED geometry is computed from the current KOVER​TA frame every redraw, independent of camera direction.
- Rendering remains hidden from above by the opaque roof; only the geometry calculation is camera-independent.
- LED segments sit directly against the underside of the host frame.
- Side/end runs are computed from current frame coordinates.
- Actual post footprints are derived from:
  - `postXs()`
  - `kvStlpRez()`
- Post footprints are subtracted from the LED host intervals.
- The result is split into physical line segments that terminate at post connections instead of running through steel.
- No invented hidden corner connector is required.
- Electrical wiring is not exposed as a universal external cable because the current KOVER​TA offer explicitly permits the connection to be hidden in a post.

### Contact invariants

Browser QA asserts:

- every LED segment touches the host frame underside,
- every segment remains inside the current assembly footprint,
- every required frame side has LED geometry for the representative visual installation,
- positive-area intersection between an LED segment and any current KOVER​TA post footprint is zero,
- resize recomputes segment positions from the current 4/6-post layout.

---

## 4. Side walls — wood / WPC / aluminium

### Verification

**Status: verified current KOVER​TA options.**

Current KOVER​TA product content explicitly offers side-wall lamellas in:

- wood,
- WPC,
- aluminium.

Realization folders also contain KOVER​TA wall installations.

### Previous defect

KOVER​TA wall/infill anchoring was still leaking the generic stage value:

`post = 120`

That did not match the current KOVER​TA post geometry, where the active sections come from `kvStlpRez()` and may differ between end and middle rows.

This could create:

- gaps,
- penetration through posts,
- floating wall edges,
- incorrect 6-post bay cuts.

### Final anchor logic

A KOVER​TA-only `kvWallAnchor(side)` now derives wall geometry from the same source as the post bodies.

For front/rear runs:

- start = real face of the first current post,
- end = real face of the last current post,
- every interior current post creates a cut using its actual section depth.

For left/right runs:

- wall plane follows the actual active end-row post face,
- start/end along the width use the actual current post section and inset.

The generic SOLTEC/fallback path remains unchanged.

### Result

- 4-post and 6-post KOVER​TA layouts use their real current wall anchors.
- Middle posts correctly divide 6-post wall runs.
- A selected wall remains attached after changing size.
- Wood, WPC and aluminium all use the same physical anchor truth.

---

# Removed / deliberately not modelled

## Gate / sliding leaf — `kv-brana`

**Status: insufficient KOVER​TA evidence.**

The base configurator exposed:

`Brána alebo posuvné krídlo do bočnej steny`

but the required current KOVER​TA evidence for a specific product, physical attachment and supported geometry was not found with enough confidence.

Action:

- removed `kv-brana` from the current KOVER​TA accessory selection,
- no fantasy gate renderer was created.

## Photovoltaic / solar preparation

**Status: real current commercial capability, visual geometry not sufficiently verified.**

The current KOVER​TA web states that preparation for installation of solar panels is available.

However, this audit did not establish a sufficiently specific KOVER​TA mounting geometry for a 3D accessory without inventing structural details.

Action:

- not added as a 3D accessory,
- remains an explicitly unmodelled verified capability.

---

# Browser / automated QA

Dedicated test:

- `konfigurator/test/koverta-accessories.js`

GitHub Actions workflow:

- `Koverta configurator QA`

Final implementation run:

- run id: `34393400763`
- URL: `https://github.com/danielvendzur-code/koverta-web/actions/runs/34393400763`
- result: **SUCCESS**

Final implementation SHA tested:

- `c4d3cb475128e1d05c8bfdcf8a4c2b688ee93cfb`

## Final job results

All seven jobs passed:

- `osnova-podla-expivi` — PASS
- `prekrytie` — PASS
- `strecha-nepresvita` — PASS
- `stlpy-vidno` — PASS
- `plynulost` — PASS
- `layout-smoke` — PASS
- `koverta-accessories` — PASS

No mandatory existing test was disabled or weakened to obtain this result.

## Accessory matrix covered by the dedicated browser test

Devices:

- desktop viewport `1440 × 1000`
- mobile viewport `390 × 844`

KOVER​TA dimensions/layouts:

- `6200 × 6000` — 4-post layout
- `7000 × 5200` — 6-post layout
- `7000 × 6000` — 6-post layout

Wall sides:

- rear
- front
- left
- right

Wall materials:

- wood
- WPC
- aluminium

Actions/checks:

- select accessory,
- disable/re-enable drainage,
- resize after selection,
- preserve selected state after resize,
- verify current post count,
- verify current wall anchor coordinates,
- verify interior-post cuts,
- rotate through 360° sample matrix,
- check for NaN/Infinity,
- check model does not disappear,
- check no horizontal mobile overflow,
- check gutter is in intended pocket,
- check gutter outlet lies inside gutter,
- check downpipe throat meets outlet region,
- check downpipe follows active corner post,
- check clamp bridges post and pipe,
- check downpipe bounds remain in intended assembly,
- check insulation is bonded to roof underside,
- check LED touches frame,
- check LED does not penetrate current post footprints.

## Visual browser artifact review

Final run artifact:

- `koverta-visual-qa-koverta-accessories`
- artifact id: `10120895739`

Reviewed final screenshots include:

- front / corner / underside at `7000 × 6000`,
- `6200 × 6000`,
- `7000 × 5200`,
- `7000 × 6000`,
- all four wall sides at `7000 × 5200`,
- desktop and mobile variants.

Manual review result:

- no floating wall edges observed,
- 6-post wall runs visually terminate/divide at the expected posts,
- no model disappearance or obvious stale-position accessory after resize,
- underside LED is visibly seated at the frame,
- mobile stage remains contained and usable,
- no visible roof penetration introduced by this accessory work.

---

# SOLTEC isolation check

The task prohibited SOLTEC changes.

Static embedded-page comparison between base and final implementation:

- `carport` — byte-for-byte identical
- `canopy` — byte-for-byte identical
- `bio` — byte-for-byte identical
- `koverta` — intentionally changed

The shared renderer additions are KOVER​TA state/model paths; generic SOLTEC side-wall fallback calculations were retained.

---

# Files changed for this scope

Runtime/configuration:

- `konfigurator/cfg-pages.js`
- `konfigurator/soltec-premium.js`

QA:

- `konfigurator/test/koverta-accessories.js`
- `.github/workflows/koverta-qa.yml`

Coordination:

- `coordination/koverta/04-accessories.md` — this report

Integrator feedback on the branch was read and incorporated; no merge was performed.

---

# Remaining unverified items

1. Exact production gutter cross-section dimensions — unknown in active technical evidence.
2. Exact production downpipe diameter — unknown; no photo-derived millimetres retained.
3. Exact LED profile dimensions — unknown; renderer uses visual proportions only.
4. Universal LED piece count/layout for every KOVER​TA order — not claimed.
5. Photovoltaic mounting geometry — current commercial capability is verified, but 3D mounting geometry remains unverified and is not modelled.
6. Gate/sliding-leaf KOVER​TA accessory — insufficient evidence; removed instead of invented.

# SHA

**Tested implementation SHA:** `c4d3cb475128e1d05c8bfdcf8a4c2b688ee93cfb`

**Green GitHub Actions run:** `34393400763`
