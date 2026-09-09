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
