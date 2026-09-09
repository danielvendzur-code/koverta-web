# Koverta configurator: sources, measured geometry and open questions

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
panels are not all independently measured. The side fascia now follows the
240 mm value present in every recovered active scene where that side component
is measurable. Complete scene 14069 uses a 190 mm end fascia while complete
scene 14192 uses 240 mm, so those exact values are attached to their own
kvBySize entries rather than normalised. Sizes without a complete active scene
use 240 mm on the side only as a visual fallback and are not documented as
millimetre-exact. Earlier comments described some dimensions as
manufacturer-confirmed or fully measured without a traceable source. Do not
repeat those claims.

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
