# Integrator feedback — Agent 05 TECHNICAL FIDELITY

Read this before your next commit. Update `coordination/koverta/05-technical-fidelity.md` with the evidence used for every structural change.

Do not touch master. Do not change Soltec. Expivi remains the technical basis. Photos are visual/existence evidence only and must never establish millimetres.

## Concrete code inconsistencies to resolve

### 1. Uholnik screw count appears wrong in implementation
Current Koverta code states the intended connection has:
- 2 screws per arm;
- 4 screws total per angle bracket.

But the actual `uholnik(...)` loops are nested such that each arm receives:
- two positions along the arm × two vertical positions = 4 screw heads per arm;
- therefore 8 visible screws per angle bracket.

That conflicts with the stated structural rule and with the user's requirement.

Verify against active Expivi / old configurator technical evidence and correct the implementation to the verified count/layout.

Important:
- current active ref has `uholT: 8`;
- comments saying “about 10 mm” are not permission to change it;
- do not change thickness without an active source.

### 2. Middle-post head plate orientation likely explains the user's floating inward attachment
Current head-plate logic:
- edge/corner post: two adjacent plates;
- non-edge/middle post: two plates extending in ±X.

But the middle Koverta post is under a purlin whose physical run/connection orientation must be checked. The user specifically sees an inward attachment on non-corner posts that connects to nothing.

Trace the generated geometry and verify against:
1. complete active Expivi scenes;
2. old configurator;
3. real photos only for visible existence/orientation.

Then:
- remove any plate/bracket that does not physically meet a member;
- orient valid plate(s) onto the actual member;
- keep screws on the correct fastening face.

Do not hide the object merely because it looks wrong; fix the physical connection.

### 3. Audit every Koverta use of the generic `post` variable
The renderer defines a generic 120/150 `post` size for Soltec-era geometry. Koverta's real post sections instead come from `kvStlpRez(...)`:
- 4-post family: verified section rule must remain as active data says;
- 6-post family: corners and middle differ.

The core Koverta post body already uses actual `pd/pw`, but other geometry still uses generic `post` (wall runs, cuts, braces/accessory anchors etc.).

Create a list of every Koverta-reachable use of generic `post`. Classify:
- harmless visual scalar;
- wrong structural/contact geometry;
- Soltec-only.

Fix only the Koverta-reachable wrong-contact cases, preferably via Koverta-specific actual section helpers. Coordinate side/accessory anchor changes with Agent 04.

### 4. Invalid downpipe dimension provenance
Current source comment explicitly derives the downpipe diameter from pixel measurements of an official render and then chooses ~70 mm for visibility.

This is forbidden evidence for technical dimensions.

Find an active technical source if one exists.
If none exists:
- remove any claim that the dimension is verified;
- document it as an unverified renderer-only visual approximation;
- do not use the photo measurement as technical truth.

Agent 04 may still improve the visual shape, but you own the provenance/correctness audit.

### 5. Fascia thickness/source inconsistency
The historical documentation around `drawKovertaRoof` mentions sheet thickness around 1.5 mm, while runtime `LEM_T` is 15 in model coordinates.

Do not change this just from the comment or photos. Determine whether:
- `LEM_T` is actually modeling a folded/visible envelope rather than literal sheet gauge;
- active Expivi supports a different value;
- the comment is stale.

Report the conclusion even if no code change is safe.

### 6. Plates/screws
Audit both 4-post and 6-post:
- base plate contacts ground and post;
- four anchor screw markers are actually on the plate;
- sleeve does not float;
- head plate touches both post and supported steel member;
- head screws do not float or disappear at ordinary under/corner views;
- angle brackets contact both members they are meant to join.

Do not add decorative hardware just to make it look detailed.

### 7. Preserve exact active complete-scene axes
Do not change:
7000×6000:
- frame [52, 5804]
- purlins [988, 1992, 2928, 3864, 4868]
- posts [72, 2928, 5784]

7000×5200:
- frame [52, 5004]
- purlins [878, 1703, 2528, 3354, 4179]
- posts [72, 2528, 4984]

Never generalize all Koverta posts to 150×150.
Roof-only exports do not prove post axes.

Use Drive realisations for appearance checks:
`https://drive.google.com/drive/folders/1SxXlJMzd3Ni6xh-hP13_hdUkmOVKiPO4`

Soltec must remain untouched.

## Live integrator review of your current report

I reviewed `05-technical-fidelity.md` and the current technical fix. The head-plate role fix and 4-fastener angle correction are useful and well-scoped.

However your report predates the integrator feedback above and is **not final yet**. Complete these remaining audit items before stopping:

1. Produce the requested list/classification of Koverta-reachable uses of the generic Soltec-era `post` variable. The current report does not cover this, yet Agent 04's wall/accessory logic still reaches generic 120 mm values.

2. Resolve/document the downpipe dimension provenance. The base source contains a photo-pixel derivation for roughly Ø70. That must not remain presented as technical evidence. If no active source exists, say explicitly that the renderer diameter is unverified visual geometry.

3. Resolve/document the `LEM_T = 15` versus historical “~1.5 mm sheet” inconsistency. Do not change it without evidence, but explain whether 15 is a renderer envelope/fold representation or a stale literal gauge assumption.

4. The current report says only `osnova-podla-expivi` was actually run. Add branch CI coverage (without weakening tests) or coordinate with Agent 02/06 so the exact technical SHA is exercised by all six mandatory Playwright tests before integration.

Do not modify the successful head-plate/screw fixes merely to satisfy unrelated visual requests.


## PRIORITA TERAZ — POKRAČUJ V PRÁCI

Pokračuj **hneď teraz** na svojom branche a dokonči otvorené body z tohto feedbacku. Nečakaj na ďalšiu správu ani na integráciu.

Pravidlá:
- neukončuj prácu len preto, že prvý fix vyzerá dobre;
- prejdi celý svoj scope ešte raz a hľadaj ďalšie konkrétne chyby;
- oprav iba veci podložené dôkazom;
- po každej úprave znovu prever regresie;
- master nemeníš;
- Soltec nemeníš;
- testy nemeníš ani neoslabuješ;
- ak narazíš na problém patriaci inému agentovi, zapíš ho do reportu namiesto zásahu mimo svoj scope;
- skonči až keď sú všetky body z feedbacku vyriešené, branch je čistý, vlastné kontroly hotové a výsledok je pripravený na integráciu.

Ak počas práce nájdeš ďalšiu chybu v rámci svojho scope, **oprav ju tiež** — neobmedzuj sa iba na už vypísané body.
