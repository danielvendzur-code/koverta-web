# Integrator feedback — Agent 02 OCCLUSION QA

Read this before your next commit. Update `coordination/koverta/02-occlusion-qa.md` after the sweep and workflow results are known.

Do not touch master. Do not change Soltec. Do not weaken or modify the six mandatory tests.

I reviewed your current branch. You already added:
- `.github/workflows/koverta-occlusion-agent.yml`
- `coordination/koverta/02-occlusion-sweep.js`

The all-dimensions sweep is useful, but it still has an important blind spot.

## New QA work

### 1. Detect local fascia-vs-trapezoid bleed, not only silhouette jumps
The user's current failure is local: trapezoid can show through fascia while:
- silhouette area stays essentially unchanged;
- polygon count stays unchanged;
- the whole render is still non-empty.

Your current silhouette/polygon metrics can therefore PASS while the visible defect remains.

Add a separate agent-only QA check for Koverta fascia occlusion. Do not alter `konfigurator/test/prekrytie.js`, its sample points, tolerance, raster scale or expectations.

Use existing `SP_TEST.project` to sample/inspect projected fascia regions or otherwise compare pixels in a deterministic semantic region. The new check must be additive and must not “teach” the production test to ignore a failure.

### 2. Finer angular sweep around grazing failures
Your current 24 rotation steps are 15° apart. That can miss a narrow BSP/antialiasing failure.

Add a focused fine sweep (about 2–5° spacing) for:
- 7000×5200;
- 7000×6000;
- at least one 4-post configuration.

Prioritize:
- oblique top/front/corner ranges;
- elevations around grazing roof views;
- transitions near the exact `nadStrechou` visibility boundary where under-roof parts are intentionally suppressed.

Do not change that visibility rule merely because a metric changes. First reproduce a visible defect.

### 3. Transition continuity
Explicitly test just below and just above the camera/roof-plane threshold. Look for:
- fascia popping;
- C profiles popping;
- screws/plates flashing for one frame;
- gutter/downpipe disappearing too early;
- roof underside turning into invalid/fake seams.

### 4. Mobile/fullscreen QA
Your current custom sweep uses one desktop context. Add targeted mobile and fullscreen checks for:
- 7000×5200;
- 7000×6000;
- dark and light RAL;
- named front/side/corner/top/under views.

This can be a smaller matrix than the 54×full rotation sweep.

### 5. Evidence
On failure, save more than only the first screenshot:
- first few unique failure classes;
- size + azimuth + elevation in filename or JSON;
- preferably a small contact sheet or separate screenshots for fascia bleed vs disappearance vs invalid polygon.

Do not flood artifacts with every sampled frame.

### 6. Runtime changes
You are a QA/render agent. If the added QA reproduces a root cause precisely, a minimal Koverta-only runtime fix is allowed. Do not make aesthetic changes. Do not alter Soltec.

Run:
- osnova-podla-expivi
- prekrytie
- strecha-nepresvita
- stlpy-vidno
- plynulost
- layout-smoke

All six must remain green.

## Live integrator status

Your current branch still contains the broad all-dimensions sweep but no final `02-occlusion-qa.md` report yet. Do not stop at the current 15-degree whole-scene sweep.

Agent 01 has now started replacing the fake flat trapezoid underside with a corrugated shell. Your next QA run must explicitly test that new kind of geometry once it is available for comparison/integration:
- local fascia bleed;
- coplanar/double-painted roof faces at grazing angles;
- BSP polygon-count/performance regression;
- top/under transition continuity.

Do not relax thresholds just because a real corrugated surface increases polygon count. If a generic polygon-count heuristic becomes noisy, keep the mandatory tests untouched and make the additive agent-only metric more semantic/local rather than more permissive.


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
