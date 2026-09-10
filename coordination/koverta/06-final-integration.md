# Koverta final integration

## Branch
`agent/06-koverta-final-integration`

## Verified implementation SHA
`eb25b3d21328892e87229f06750d0309011ce7fc`

The report commit itself is documentation-only and comes after this verified implementation SHA.

## Integrated work
- Agent 01 — Koverta visual/render work: roof/trapezoid/fascia rendering and fascia occlusion ordering.
- Agent 03 — pricing and product-option logic, including the verified 54-entry base catalogue price table and quote-only handling where no trustworthy accessory price exists.
- Agent 04 — physically integrated Koverta accessories and their renderer behavior.
- Agent 05 — technical fidelity of posts, frame, purlins, plates, angles, bolts and verified Expivi-based geometry rules.
- Agent 02 — deep occlusion/component QA scripts. No stale Agent 02 runtime geometry was imported.

## Integration conflict decisions
- `cfg-pages.js` was merged by Koverta product data rather than whole-file ours/theirs because Agent 03 and Agent 04 touched the same compact data block.
- Preserved `kv-izol`, physically rendered `kv-led`, and quote-only `kv-elektro` / PV-electrical preparation. Unsupported gate option stays removed.
- No invented accessory price was introduced.
- Restored Agent 01's Koverta-only `paintLast` fascia occlusion guard after the combined deep QA exposed that this verified visual fix had been lost during the 01/05 renderer merge. The flag is opt-in and is only passed by the Koverta top fascia arm; Soltec callers do not opt into it.
- Corrected the Agent 02 component-isolation harness so the optional gutter/downpipe is explicitly enabled in the test renderer before isolation. This makes the test exercise the component instead of silently testing the default `odkvap=nie` state.
- Temporary integration fixer workflow was removed after applying the repair.

## Production files changed by the combined integration
- `konfigurator/soltec-premium.js`
- `konfigurator/cfg-pages.js`
- `konfigurator/test/pricing-logic.js`
- `konfigurator/test/koverta-accessories.js`
- `konfigurator/test/technical-fidelity.js`
- `.github/workflows/koverta-qa.yml`
- Agent coordination / deep QA scripts under `coordination/koverta/`

## Final QA
GitHub Actions run: `34441428402`
Exact tested SHA: `eb25b3d21328892e87229f06750d0309011ce7fc`
Result: **SUCCESS**.

All 12 jobs passed:
1. `osnova-podla-expivi`
2. `layout-smoke`
3. `stlpy-vidno`
4. `prekrytie`
5. `strecha-nepresvita`
6. `plynulost`
7. `pricing-logic`
8. `koverta-accessories`
9. `technical-fidelity`
10. `02-occlusion-sweep`
11. `02-focused-render-qa`
12. `02-component-visibility`

Notable deep-QA confirmations:
- focused fascia sweep / roof-plane transition continuity / mobile-fullscreen: PASS
- deep occlusion sweep: PASS
- component visibility isolation, including forced-present gutter/downpipe: PASS
- no first-party console/page errors reported by focused render QA

## Scope safety
- `master` was not modified.
- No merge to `master` was performed.
- Soltec product data, pricing and dimensions were not intentionally changed. The shared renderer addition used for fascia ordering is opt-in from the Koverta fascia call only.
- Existing mandatory tests were not weakened.

## Source basis used by the contributing agents
- active Expivi technical/archive data for dimensions and geometry rules
- current Koverta configurator/runtime
- old Koverta/Expivi configurator where available as secondary reference
- Google Drive `MARKETING / Realizácie / Koverta - Auto Prístrešky` photographs for visual/existence checks only, never for deriving millimetre dimensions
- current Koverta commercial/pricing material for pricing and option availability

## Remaining caution
The integration is green on the complete current automated matrix. Any future renderer change in shared `soltec-premium.js` should rerun all 12 jobs because several Koverta and Soltec code paths live in the same source file even though the final fascia ordering behavior is Koverta opt-in.
