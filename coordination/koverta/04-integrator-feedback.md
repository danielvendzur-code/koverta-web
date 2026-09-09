# Integrator feedback — Agent 04 ACCESSORIES

Read this before your next commit. Update `coordination/koverta/04-accessories.md` with evidence for every accessory you retain.

Do not touch master. Do not change Soltec. Do not invent products or dimensions from photos.

## Real reference source
Use:
Google Drive → MARKETING → realizácie → **Koverta Auto Pristresky**
`https://drive.google.com/drive/folders/1SxXlJMzd3Ni6xh-hP13_hdUkmOVKiPO4`

Use photos for appearance, existence and physical attachment only. Never derive millimetres from a photo.

## New concrete bugs/findings

### 1. Three configured extras currently have no dedicated renderer
`cfg-pages.js` defines:
- `kv-izol` — insulation;
- `kv-led` — lighting/electrical feed;
- `kv-brana` — gate/sliding leaf.

I searched the Koverta renderer: these IDs have no dedicated rendering logic. They currently enter generic `state.extras` / price summary only.

This means the UI can imply a physical option that the model does not actually integrate.

For each:
1. verify it is a real current Koverta option using Drive/web/commercial sources;
2. determine where it physically attaches;
3. if evidence is sufficient, implement a Koverta-only physical representation that follows size/side changes;
4. if evidence is insufficient, do not fake it — hide/remove from visual selection or clearly keep it as quote-only/non-visual according to existing product UX.

Nothing may levitate or intersect posts/roof.

### 2. Koverta side-wall anchoring still uses a generic 120 mm post variable
The stage has a generic:
`post = ... ? 150 : 120`

For Koverta model `K`, that generic path evaluates to 120, while actual Koverta post sections come from `kvStlpRez(...)` and can be 110×190 or 150×150.

The side-infill code currently uses generic `post` for:
- run starts/ends;
- guide/head dimensions;
- post cut regions (`px + post`);
- other wall bay calculations.

This can create gaps, penetration or “floating” wall/accessory edges, especially on 6-post assemblies.

Fix Koverta-only accessory/wall anchoring to actual post faces/sections from the same geometry source used by the post body. Do not change Soltec's generic logic. Coordinate section correctness with Agent 05.

### 3. Gutter shape is currently a rectangular U-channel assembled from boxFaces
The user's complaint that it looks square/cheap is consistent with the implementation: bottom slab + two straight rectangular walls.

Use real Koverta realizations to make the visible gutter assembly visually cleaner:
- believable sheet-metal cross-section;
- clean ends;
- physically seated behind/under fascia;
- no exposed floating caps;
- no penetration through fascia/post;
- no arbitrary hooks if photos do not support them.

Do not infer gutter width/depth in mm from photos. If no technical dimensions exist, keep geometry clearly documented as a visual renderer approximation.

### 4. Downpipe contains an invalid dimension provenance
Current code explicitly says its ~70 mm pipe diameter was estimated by pixel-scaling an official render/photo.

That violates the project rule: photos may never establish millimetres.

Do not propagate that as a technical fact.
- Find an active technical source if one exists.
- If none exists, treat the diameter as a renderer-only visual approximation and document the technical dimension as unknown.
- Do not state “Ø70” as verified Koverta data.

You may improve visual smoothness of the downpipe/elbows and clamps, but all parts must physically meet.

### 5. Accessory transformation matrix
For every supported visual accessory test:
- 4-post;
- 6-post;
- 7000×5200;
- 7000×6000;
- at least one smaller 4-post size;
- all four side selections where relevant;
- resize after selection;
- rotate 360°;
- desktop/mobile.

A selected object must update its anchor when dimensions or side change. No stale old-position object may remain.

### 6. Coordinate scope
Agent 01 owns general roof/material aesthetics.
Agent 05 owns structural bracket/plate/screw truth.
Do not independently change structural axes or screw counts.

Soltec must remain untouched.

## Live integrator review of your current accessory diff

I reviewed your current runtime changes.

Positive direction:
- `kv-brana` has been removed from the current Koverta extras data rather than fake-rendered without evidence;
- the gutter is no longer three rectangular box slabs;
- downpipe diameter is now explicitly treated as a visual proportion, not a photo-derived technical dimension;
- insulation is bonded to the roof underside instead of being a floating slab.

Do not stop yet. Resolve these points:

### A. LED layout currently appears to invent four continuous perimeter runs
Your `kv-led` renderer currently calls `ledRun(...)` four times and effectively draws lighting around all four frame sides.

The generic option label does not by itself prove that a standard Koverta installation includes four continuous perimeter strips.

Find exact visual/commercial evidence for quantity and locations. If only “LED lighting” is supported generally:
- do not depict a universal four-side layout as factual;
- either make the visual clearly representative/non-prescriptive or model only a configuration that is explicitly evidenced.

Cite the exact Drive realization(s) in your report.

### B. The new accessory test does not actually prove “no levitation”
`koverta-accessories.js` currently proves state changes, SVG changes, finite coordinates and that the model does not vanish. It does **not** verify that LED/gutter/downpipe physically touch their host surfaces.

Add agent-only geometry/contact assertions where feasible, or at minimum deterministic projected/coordinate checks for:
- gutter inside its intended fascia pocket;
- downpipe start intersecting/meeting the gutter outlet region;
- downpipe/clamps staying at the active corner post after resize;
- LED profile lying directly against its host frame face;
- no accessory bounding box outside the intended assembly after 4→6 post resize.

Do not weaken mandatory tests.

### C. Generic 120 mm post leakage is still visible in current file
The Koverta stage still defines generic `post = 120` for model K. Make sure every Koverta accessory/side-wall contact path you touched is switched to actual `kvStlpRez`/post-face geometry. Do not rewrite Soltec's generic paths.

Coordinate this with Agent 05 rather than changing structural sections yourself.
