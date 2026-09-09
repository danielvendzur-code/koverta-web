# Integrator feedback — Agent 03 PRICING / LOGIC

Read this before your next commit. Update `coordination/koverta/03-pricing-logic.md` with source lineage for every rule you keep or change.

Do not touch master. Do not change Soltec. Do not modify 3D geometry except a strictly necessary product-logic state reset. Never invent a number.

## Concrete items to audit now

### 1. Verify all Koverta base price claims and the global price note
Koverta currently has a 3×18 price matrix for lengths 5200/5600/6000 and widths 2500…7000.

The current data also says:
`priceNote: "vrátane DPH, s dopravou a montážou"`

That is a strong commercial claim. Find the current authoritative Koverta pricing/offer source and verify:
- VAT inclusion;
- transport inclusion;
- installation inclusion;
- whether any geographic/site conditions apply;
- whether the displayed matrix is current.

If the source does not support all three unconditionally, change the customer-facing wording to a sourced/conditional formulation. Do not guess.

### 2. Audit the 6200 → 6600 transition
The product changes from the <=6200 four-post band to the six-post band at 6600. The price matrix also jumps materially there.

Verify from current commercial data that:
- 6600 and 7000 are legitimately separate priced variants;
- the jump corresponds to a supported product/configuration rule;
- there is no unsupported width gap or stale pricing.

Do not change Expivi geometry rules here.

### 3. Side-wall price tables have a special override
Current Koverta data contains:
- generic `wallSide` by length/material;
- generic `wallBack` by width/material;
- `wallSideBySize` overrides for 5400×6000 and 5600×6000.

One concrete discrepancy:
- generic 6000 side aluminium is 1956;
- the special 5400×6000 / 5600×6000 aluminium override is 1950.

Trace both values to source. Confirm the override is intentional, not transcription drift. Ensure runtime chooses the correct table for orientation/size.

### 4. Structural placement options appear unpriced
Current options include:
- Samostatne stojaci
- Zadnou stenou k domu
- Bokom k domu
- V rohu
- S previsom, bez zadných stĺpov
- Voľné rozmiestnenie stĺpov

The latter options alter physical structure, but the base pricing logic appears not to apply a dedicated price adjustment.

Verify each placement is genuinely a supported Koverta offer.
If a placement is technically possible but requires individual engineering/quote, it must not silently present the same deterministic base price as a standard freestanding assembly unless current commercial documentation supports that.

### 5. Optional gutter defaults to “yes” while price is unknown
Current Koverta logic says:
- “Odkvap a zvod” is optional;
- first/default option is “So žľabom a zvodom”;
- price is unknown / “na nacenenie”;
- the model therefore displays it by default.

Audit whether this default can imply inclusion. Use current sales documentation. A safe outcome must distinguish:
- selected for quotation;
- included in shown price;
- not selected.

Do not invent a gutter price.

### 6. Extras have null prices
Current Koverta extras:
- insulation;
- lighting/electrical feed;
- gate/sliding leaf.

All are `price:null`.

Verify whether they exist in current offer and whether current price data exists. If not, keep them explicitly “na nacenenie”, never €0/free. Coordinate unsupported product options with Agent 04.

### 7. Remove unnecessary visible technical copy, preserve internal data
The user does not want visible copy such as post-count explanations, profile dimensions, max size and clear height dumped into the configurator.

If any such text is generated elsewhere at runtime, remove only the customer-facing redundant block. Keep internal geometry values needed by tests/rendering.

### 8. Request payload/state consistency
Test:
- change from a compatible to incompatible dimension after selecting a wall/accessory;
- back/next;
- reset;
- 4-post → 6-post transition;
- optional gutter yes/no;
- special wall-size pricing;
- final request payload.

No stale selection or stale price may survive a dimension change if no longer valid.

Soltec must remain unchanged.

## Live integrator review of your current pricing diff

I reviewed the current branch after your new commits. There are two items you must resolve before this can be accepted.

### A. Hardcoded regression expectations are not source verification
Your new `pricing-logic.js` hardcodes the current 54 base prices and asserts they have not changed. That is useful as a regression lock **after** source verification, but it does not prove those prices are current.

Your report must identify the exact Drive/commercial source (file/title/date/page/table where possible) for:
- the 3×18 base matrix;
- VAT status;
- any transport/install scope.

Do not use “the values were already in cfg-pages.js” as evidence.

### B. Current custom-size test explicitly accepts 7800 × 5700
The product data simultaneously declares `maxW: 7000` and `maxL: 6000`, yet your new test builds a custom payload for 7800 × 5700 and treats it as valid.

Verify the business rule:
- if 7000 × 6000 is a hard product maximum, reject/disable an over-limit custom request;
- if larger atypical builds are genuinely accepted for individual engineering, the UI/payload must clearly be an inquiry outside the catalogue and must not imply the 7000 × 6000 model/price is technically representative.

Do not make this decision from the test itself; use a commercial/technical source.

### C. You nulled all side-wall price tables
Current branch sets `wallSide`, `wallBack` and `wallSideBySize` to null. This may be correct if the old tables cannot be verified, but it removes a large amount of previously numeric pricing.

Before finalizing, document exactly why those values are untrusted/stale and which sources you checked. If an authoritative current source exists, restore only the verified values rather than defaulting everything to quote-only.

Do not change Soltec.


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
