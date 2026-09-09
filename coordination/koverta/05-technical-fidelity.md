# KOVER​TA-05 — Technical fidelity report

Branch: `agent/05-koverta-technical-fidelity`  
Base: `fix/final-koverta-audit-20260909` @ `ac9cc67cccfecfbff36ed9953e14b93ffb7e1a64`  
Technical fix SHA: `273eb81a8456cdfc4decc879d15fae5688183ed3`

## Source hierarchy used

1. Active Expivi scene/component data in `archiv-expivi/diely-zo-sceny.json`.
2. Archived Expivi measurements in `archiv-expivi/stlpy-a-vaznice-odmerane.json`.
3. Older Koverta configurator/runtime history as a secondary reference for fastener presentation.
4. Real photographs / official renders only for appearance or the visible existence of a component, never for millimetre dimensions.
5. Google Drive document `koverta-technicke-poziadavky-na-montaz-pristresku.pdf` only for anchoring requirements.

No dimension was inferred from a photograph.

## Active Expivi rules verified

### Exact complete assemblies — preserved unchanged

| Nominal size | Frame axes | Purlin axes | Post axes |
|---|---|---|---|
| 7000 × 6000 | [52, 5804] | [988, 1992, 2928, 3864, 4868] | [72, 2928, 5784] |
| 7000 × 5200 | [52, 5004] | [878, 1703, 2528, 3354, 4179] | [72, 2528, 4984] |

These values remain byte-for-byte unchanged in `kvBySize`.

### Columns

Both complete active scenes contain:

- 4 corner columns: 150 × 150 × 2398 mm.
- 2 middle columns: 110 × 190 × 2398 mm.
- The 190 mm side of the middle column runs along depth.

The renderer therefore must not convert every column to 150 × 150. Roof-only scenes were not used to infer column placement or section.

### Frame, purlins, roof and flashing

For active scene 14069 (7000 × 6000), Expivi contains:

- two side perimeter C profiles: 74 × 5820 × 220 mm;
- two end perimeter C profiles: 6964 × 74 × 220 mm;
- ten purlin C profiles: 6940 × 58 × 180 mm = five back-to-back pairs;
- seven roof sheets: 1057 × 5900 × 36 mm;
- two end fascia pieces: 7000 × 190 × 260 mm;
- two side fascia pieces: 240 × 6000 × 257 mm;
- 24 connector components with bounds 120 × 85 × 140 mm.

Scene 14192 (7000 × 5200) likewise has four 150 × 150 corner columns, two 110 × 190 middle columns, five purlin pairs and 24 connector components. Its exact frame/purlin/post axes are the second row of the table above.

The 24 connector components are consistent with 20 pieces at the ends of five purlin pairs plus 4 frame-corner connectors. No additional 120 × 85 × 140 component exists at the middle-column head that would justify duplicating a roof/frame corner bracket there.

## Defects found

### 1. Floating head bracket on non-corner / middle columns

Generator: `konfigurator/soltec-premium.js`, shared column drawing loop under `BIO.headPlates`.

The old logic used only `xi === 0 || xi === xs.length - 1` to decide whether a column should receive corner-style head plates. That is not the structural role of the column. In Koverta, `kvStlpRez()` already exposes the correct role as `rz.roh`.

For a 110 × 190 middle column centered on purlin axis `os`:

- purlin pair footprint in X is `os ± 58` mm = 116 mm total;
- column footprint in X is `os ± 95` mm;
- the previous X-directed head plates started outside the 190 mm column footprint and therefore also outside the 116 mm purlin footprint.

They had no physical member to attach to.

### 2. Connector fastener regression

The older Koverta runtime arrangement (`8e53d641cdde82311f0a5edb7755fafd298fecc9`) drew two vertically aligned screw heads on each angle arm. Commit `67acfcb35839a12b02d0c32101211c53e6d018c2` changed the visual implementation to a nested 2 × 2 layout on each arm, which made the code render four screw heads per arm / eight per angle.

The active Expivi component list verifies the connector body/count but does not expose screw subcomponents or bolt grade. The technical geometry was therefore returned to the older two-per-arm arrangement; bolt diameter, grade and exact hardware specification remain unverified.

## Fixes made

### Head plates

The head-plate decision now follows `rz.roh`, not array position:

- a real 150 × 150 corner column keeps both inward head plates because it meets two perimeter members;
- a 110 × 190 column under a purlin gets only the plate running along the purlin axis;
- that plate is 110 mm wide across X and centered on the 116 mm purlin footprint, so it has real geometric overlap;
- its two visible screw heads remain on the plate and therefore represent a physical fixing rather than a floating decoration.

This also fixes four-column Koverta variants where the first/last columns in the array are still structurally under purlins and are not true frame corners.

### Angle brackets

- Connector body placement/count is unchanged.
- Purlin axes are unchanged.
- Frame axes are unchanged.
- Each angle now renders two visible fasteners per arm, four total.
- The fasteners remain on the two angle faces they are intended to clamp.

### Base plates

No base-plate geometry was changed.

Active Expivi confirms a six-piece base assembly with approximately 250 × 250 mm footprint in the two complete scenes, but the simplified component bounds do not decompose plate thickness, sleeve geometry or individual anchors.

Google Drive installation documentation confirms the functional rule: steel columns are anchored to prepared concrete using mechanical or chemical anchors according to the design; paving itself is not the anchoring substrate. It does not establish a universal bolt count, diameter or grade.

## What photographs / renders may confirm only visually

Photographs and official renders were not used for axes or millimetre dimensions. They may only support visible appearance/existence, for example:

- steel square/rectangular columns;
- visible base/foot hardware in photographed variants;
- trapézoidal roof and perimeter flashing;
- an external downpipe beside a column in at least one photographed installation.

None of those observations is treated as proof of universal dimensions, hidden connections, bolt grade, or column axes.

## Technically unknown / intentionally not invented

- Exact independent dimensions and fabrication detail of the head plate are not resolved by the active Expivi component list.
- Exact anchor count, anchor diameter, bolt grade and tightening specification are not established by the active Expivi component list or Drive installation PDF.
- The active Expivi component list does not independently expose the individual screws inside the 120 × 85 × 140 connector component.
- Newer / roof-only catalogue families do not prove column placement or a universal column section.
- Therefore no universal 150 × 150 column rule was introduced.
- Gutter/downpipe dimensions and routing remain assembly-specific unless independently documented.

## Validation

Deterministic checks executed directly against GitHub branch contents at technical fix SHA `273eb81a8456cdfc4decc879d15fae5688183ed3`:

- JavaScript syntax compile: PASS.
- Exact 7000 × 6000 axes: PASS, unchanged.
- Exact 7000 × 5200 axes: PASS, unchanged.
- Active-scene part counts for both complete assemblies: PASS — 4 corner columns, 2 middle columns and 24 connector components.
- Koverta head-plate isolation: PASS — `headPlates` is enabled only in Koverta page data.
- `osnova-podla-expivi.js`: PASS — 10 axis/section comparisons, 21 catalogues with frame-axis coverage, 32 with corner-column coverage and 20 with four-column-row coverage.

The Playwright visual suite (`layout-smoke.js`, `stlpy-vidno.js`, `prekrytie.js`, `strecha-nepresvita.js`, `plynulost.js`) was **not claimed as run** in this branch session: the local runner could not resolve `github.com`, Playwright is not installed in the available container, and the repository workflow currently triggers pushes only for `fix/final-koverta-audit-20260909`. The workflow was not modified merely to manufacture a green result.

## Isolation / changed files

No merge was performed. `master` was not changed. Soltec model data, Soltec geometry and Soltec pricing were not changed.

Final intended diff from the base consists only of:

- `konfigurator/soltec-premium.js` — Koverta-only head-plate contact fix and Koverta angle fastener correction.
- `coordination/koverta/05-technical-fidelity.md` — this report.
