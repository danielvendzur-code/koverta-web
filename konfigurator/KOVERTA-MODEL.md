# Koverta configurator: sources, measured geometry and open questions

## Rendering update — 2026-09-11

The current renderer rasterises original faces with a perspective-correct
WebGL depth buffer and multisample antialiasing. BSP remains a compatibility
fallback when WebGL is unavailable. Historical BSP-specific descriptions below
are retained as audit history, not as a description of the primary renderer.
Camera culling uses the actual eye-to-face vector. Koverta geometry is cached
between camera-only updates; changes to configuration invalidate that cache.

The roof retains its measured corrugation height and pitch. Both surfaces run
under the L flashing and are separated by one sheet thickness. The soffit has
one light-grey material; differences in brightness come from face orientation.
The current visual flashing gauge is 1.5 mm, replacing the former 15 mm visual
envelope, and front/back top folds lap over the side folds by one gauge.
This gauge is a rendering proportion, not a newly verified manufacturing value.
The measured fascia reach, column sections and active axes remain unchanged.
The artificial base sleeve was removed at the owner's explicit request.

Drainage now contains the previously metadata-only concealed connecting run.
It slopes down to the exposed tube, and the gutter floor is raised within the
existing pocket to contain that run. These are illustrative installation
proportions; the precise gutter section, pipe diameter and routing for every
variant still require a manufacturer drawing. Do not claim all sizes are 1:1.

Soltec louvers use closed rigid extrusions with a recessed overlap tongue,
one material and a fixed pivot. Neither their section nor camera fit changes
with the opening angle. Motion has one requestAnimationFrame chain. Artificial
painted sheen bands and transverse ISO-soffit stripes have been removed.

Pixel tests export the actual raster through SP_TEST.exportSVG instead of
serialising an empty canvas element. Existing pixel tolerances are retained.


Audit date: 2026-09-09. Working branch: `fix/final-koverta-audit-20260909`.

Expivi dimensions and column positions are the technical baseline. Photographs
can confirm appearance and installed variants; they cannot establish millimetre
dimensions or replace a structural design. A passing image test does not certify
structural accuracy.

## Source priority and scope

1. A complete Expivi scene for the exact catalogue and selected variant.
2. The archived old configurator's catalogue, option and price data.
3. Real installed Koverta photographs for appearance and visible details.

The reference archive is commit
`04b2c0c472020c80e73bc86d36fa72e92acda43d`.
The two measurement files available on this branch are:

- `archiv-expivi/diely-zo-sceny.json`: components of returned scenes.
- `archiv-expivi/stlpy-a-vaznice-odmerane.json`: measurements of the exported
  mesh collection, restored unchanged from that commit.

A mesh collection contains inactive variants too. Its union of columns must
never be rendered as one assembly. Many returned scenes contain only a roof;
those scenes do not establish the active column variant. In particular,
`archiv-expivi/scena/13670.json` is a configurable mesh family with variant
assets; it is not a resolved active component list and cannot establish one
universal column layout.

## Exact axes implemented for complete scenes

`models.K.kvBySize` in `cfg-pages.js` supplies these two exact assemblies.
The runtime uses their measured axes directly, including irregular purlin
spacing. It does not regularise them or clamp their corner columns to another
axis. Other dimensions still use the inherited formulas and remain subject to
the limitations below.

Coordinates in the runtime: x = depth, y = width, z = height. Measurements are
mirrored along depth from Expivi. The zero of the source depth is the beginning
of the full-length side fascia: 20 mm for catalogue 14069 and 9 mm for 14192.
These offsets come from the actual fascia components, not the overall envelope
which also contains base assemblies. Values below are in millimetres.

| Catalogue | Nominal size | Frame axes x | Purlin axes x | Column axes x |
|---|---|---|---|---|
| 14069 | 7000 × 6000 | 52, 5804 | 988, 1992, 2928, 3864, 4868 | 72, 2928, 5784 |
| 14192 | 7000 × 5200 | 52, 5004 | 878, 1703, 2528, 3354, 4179 | 72, 2528, 4984 |

Both scenes have four 150 × 150 corner columns and two 110 × 190 middle
columns; the 190 mm side runs along depth. Their column length is 2398 mm.
Along width the columns are flush with the roof outline: corner centres are
75 and W−75, middle centres 55 and W−55. They are not shifted 15 mm inward.

The first corner column axis is 72 mm from the roof edge; its 150 mm section
therefore extends 3 mm past that edge in the rounded source measurements.
The renderer preserves this measured position. It must not silently move it
to 75 mm merely to make the outline flush.

## Measured component bounds: catalogue 14069 only

These are component bounds from the scene, not a specification for all sizes.

| Component | Measured bounds (mm) | Count |
|---|---|---|
| Corner column | 150 × 150 × 2398 | 4 |
| Middle column | 110 × 190 × 2398 | 2 |
| Side perimeter C | 74 × 5820 × 220 | 2 |
| End perimeter C | 6964 × 74 × 220 | 2 |
| Purlin C | 6940 × 58 × 180 | 10, in 5 pairs |
| Roof sheet | 1057 × 5900 × 36 | 7 |
| End fascia | 7000 × 190 × 260 | 2 |
| Side fascia | 240 × 6000 × 257 | 2 |
| Connector bounds | 120 × 85 × 140 | 24 |

The perimeter consists of single C profiles; each purlin is a pair of C
profiles. Sheet cover spacing is about 1023 mm. Component bounds alone do not
prove bolt grade, anchor selection or plate thickness.

The renderer still contains visual simplifications: upper fascia thickness is
6 mm; roof surfaces are simplified; head plates, fastener details and wall
panels are not all independently measured. Fascia faces follow the same
world-plane BSP ordering as the rest of the structure, with the normal 0.7 px
edge. There is no fascia-last ordering or enlarged 1.5 px outline. Collinear
vertices created by clipping must not make an otherwise valid polygon lose
its plane and fall back to centroid sorting. The side fascia follows the
240 mm value present in every recovered active scene where that side component
is measurable. Complete scene 14069 uses a 190 mm end fascia while complete
scene 14192 uses 240 mm, so those exact values are attached to their own
kvBySize entries rather than normalised. Sizes without a complete active scene
use 240 mm on both side and end fascia as a visual fallback, matching the
repeated dimension in the newer recovered roof family; those sizes are not
documented as millimetre-exact. Earlier comments described some dimensions as
manufacturer-confirmed or fully measured without a traceable source. Do not
repeat those claims.

## Roof-only scenes: coordinate conventions

`kvRoofBySize` stores roof cross-sections separately from `kvBySize`, so a
roof-only export never becomes evidence for column axes or a complete assembly.
Each entry identifies its source catalogue, axis order and actual source depth.

The newer exports use **width, height, depth**, unlike 14069/14192, which use
**width, depth, height**. A 5000 × 260 × 240 end component therefore has a
260 mm height and a 240 mm inward reach; treating 260 as its reach swaps axes.
The runtime uses the actual end/side reach, fascia height and C-frame height:

| Nominal sizes | Source catalogues | End/side reach | Fascia/frame height |
|---|---|---|---|
| 3000 × 5200/5600/6000 | 21727/21728/21729 | 240/240 | 240/200 |
| 3800 × 5200/5600/6000 | 20955/20915/20956 | 240/240 | 240/200 |
| 4500 × 5200/5600/6000 | 20963/20964/20997 | 240/240 | 240/200 |
| 5000 × 5600/6000 | 21183/21185 | 240/240 | 260/220 |
| 5400 × 5200/5600/6000 | 21462/21465/21466 | 240/240 | 260/220 |
| 6200 × 5200/5600/6000 | 21423/21444/21459 | 240/240 | 260/220 |
| 6600 × 5200/5600/6000 | 21730/21731/21732 | 240/240 | 260/220 |
| 7000 × 5600 label only | 14198 | 240/240 | 260/220 |

14198 contains a **5200 mm** roof, and 21466 a **5600 mm** roof. Only the
cross-section measurements are reused for those catalogue labels; their
nominal depths and inherited axes are not claimed as measured. No source mesh
is stretched. Missing catalogue combinations retain the explicitly documented
240 mm visual fascia fallback. This does not confirm their structural family.

## Unresolved catalogue and variant discrepancies

- Catalogue 14198 is labelled 7 × 5.6 m but its archived geometry has the
  5.2 m depth. Do not stretch that scene and call the result measured.
- The union measurement for catalogue 21466, labelled 5.4 × 6 m, has a depth
  envelope around 5.672 m. Its catalogue/variant mapping needs confirmation.
- Newer mesh collections contain 100 × 100 × 2392 columns, including widths
  3.0, 3.8, 4.5, 5.4, 6.2 and 6.6 m. The inherited renderer uses the older
  150/110 × 190 family. An active scene or manufacturer's drawing is required
  before choosing a family for each option; the 7 × 6 m reference is not proof
  that the older family applies everywhere.
- The old price data includes both four- and six-column options for narrower
  sizes. The new UI automatically chooses four columns up to 6.2 m and six
  from 6.6 m. The existence of a price boundary does not prove that six-column
  narrower variants are forbidden. This product choice still needs resolving.
- Formula checks over a union of inactive and active meshes do not establish
  every column axis or the correct current product variant.

## Drainage: supported claims and limits

The archived configurator treats drainage as an option. Catalogue 13670
exposes a material group named `ODKVAP`, but the recovered catalogue data does
not provide an independently verified gutter price, section or universal
downpipe route. The Koverta selection therefore marks it
for quotation and does not present it as a free included item. The two Koverta
product pages use the same conditional wording.

The real photograph
`assets/koverta-zahradny-pristresok-bratislava-detail.jpg` shows an external
white downpipe next to a column. It disproves a universal statement that the
downpipe is inside a column. Other photographs obscure parts of the drainage;
absence from view is not proof that the gutter does not exist.

The current drawing represents a gutter behind the fascia and an external
pipe routed to a column. That is an illustrative variant. The 159 mm measured
frame setback does not by itself certify a gutter section or its mounting.
The renderer's 70 mm pipe diameter, bends and gutter section are inherited
visual parameters, not verified installation dimensions. Marketing catalogue
renders are not photographs and their pixel ratios are not technical drawings.

The gutter and downpipe route, dimensions and price must follow the specific
assembly and confirmed quotation. Do not claim that all Koverta gutters are
invisible, included, below the fascia or integrated into the columns.

## Anchoring

The technical installation document on Google Drive is
[koverta-technicke-poziadavky-na-montaz-pristresku.pdf](https://drive.google.com/file/d/1AgDyrU6pJbQsfwRR-OYSZrOEqKqfHa36/view).

The steel structure is anchored into prepared concrete using mechanical or
chemical anchors according to the design. Paving itself is not the anchoring
substrate. Where foundations are below paving, the document describes paving
after anchoring. Do not describe anchor plates as cast into fresh concrete.
Visible base hardware in a simplified model does not define the foundation.

## Price checks against the old catalogue

The inherited default base-price matrix was compared with the archived old
catalogue and shop product data. Front/rear aluminium side prices for
5400 × 6000 and 5600 × 6000 were corrected from 1956 to 1950 EUR through an
exact-size override; other sizes retain their existing tables. Drainage is
not assigned a fabricated price.

## Runtime isolation and tests

All four routes use the shared runtime. Koverta-specific measured data is
only read when present on the selected model. The default route is Koverta.

- `osnova-podla-expivi.js`: historical formula/data comparison. Its 50 mm
  tolerance is diagnostic, not a structural tolerance or proof of an exact
  runtime match. Missing required measurement files are an error.
- `routing-smoke.js`, called by `layout-smoke.js`: exercises the four routes
  on desktop/mobile and reads the actual runtime geometry. It independently
  derives axes from the two complete source scenes, comparing at 1 mm
  precision (the measurement JSON is rounded), with section/orientation checks.
- `prekrytie.js`: contrasting roof colours and projected fascia samples at
  the native SVG viewBox raster; records failing SVGs for diagnosis. Its world
  measurement points and native raster must not be rescaled to hide edge
  failures.
- `strecha-nepresvita.js`: detects contrasting soffit/galvanised colours in
  top views.
- `stlpy-vidno.js`: column visibility checks.
- `plynulost.js`: silhouette continuity through rotation.

`browser-qa.js` isolates only external analytics requests. First-party
`pageerror` and all remaining console errors still fail the tests. Earlier
PASS results from a test which changed DOM data and then reloaded it do not
prove that contrasting test colours were applied. Current colour changes are
made to the fetched template before runtime initialisation.

Run the six named tests against a static server on port 8901. GitHub Actions
runs each independently, with fail-fast disabled, and uploads visual artefacts.
Consult the run for the exact commit; this document does not promise a PASS.
