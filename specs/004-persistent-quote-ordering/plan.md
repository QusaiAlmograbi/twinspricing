# Implementation Plan: Persistent Quote Ordering

**Branch**: `feature/003-quote-summary-layout` (planning only; do not implement on this branch without separate approval) | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Approved product direction in `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.11 and the Feature 004 specification.

## Summary

Reuse the existing `sort_order` columns and add transactional sibling-scope reorder contracts; no migration is needed. Derive section letters and item display codes through one browser/Node pure helper, make legacy reads deterministic, and add compact up/down controls for every scope plus the required item grab affordance/optional constrained drag. Integrate pending order work with the current manual save, selective autosave, local draft, template/copy, browser print, and server PDF paths without changing save timing or unrelated behavior.

Because atomic persistence, hierarchy code derivation, and three UI levels are too risky as one legacy-file patch, deliver three ordered slices and keep only one active at a time. Slice 1 is the proposed first implementation boundary; Slice 2 begins only after Slice 1 review, and Slice 3 only after Slice 2 review.

## Technical Context

**Language/Version**: Node.js 20; browser JavaScript in one vanilla inline application script

**Primary Dependencies**: Express 4.x, `better-sqlite3`, `pg`, PDFKit; no new dependency

**Storage**: Existing SQLite local/test and PostgreSQL production tables

**Testing**: `node:test`; disposable SQLite database; dedicated disposable PostgreSQL database/schema only when explicitly configured; narrow real-browser editor/print checks

**Target Platform**: Existing web application and server-generated PDF route

**Project Type**: Legacy server-rendered/static web application with JSON API

**Performance Goals**: One reorder request per completed move; linear validation/update in sibling count; no whole-quote rewrite for a one-scope move

**Constraints**: No schema/index/dependency/auth/pricing/autosave-timing changes; preserve untracked Feature 001 and other worktrees; never touch localhost:3000 or development/production data

**Scale/Scope**: One editor file, five relevant route/read files, one shared pure helper, and focused tests; sections/rooms/items currently cap batch creation at 100/100/200 but reorder contract validates the actual scope rather than inventing a new product cap

## Constitution Check

### Pre-design gate

- **Stable Maintenance First**: Pass. Three reviewed slices prevent a broad all-at-once patch; no modernization or unrelated redesign.
- **Repository Is Source of Truth**: Pass. Findings were re-established at actual HEAD `e3ba0ad…`; the branch was not assumed.
- **Analysis and Implementation Are Separate**: Pass. This task produces documents only; implementation remains separately approved OpenCode work.
- **Smallest Safe Patch**: Pass. Existing columns/transaction utilities are reused; a small additive reorder API is justified by the proven partial-write risk.
- **Mutation Safety**: Pass by design. Reorder is expected-baseline guarded and transactional; an already-stored target is recognized without a second write, while a stale different target conflicts.
- **Regression Proof**: Pass by plan. Focused pure, API, rollback, persistence, browser, and output parity tests cover the actual failure modes.
- **Preserve Stable Behavior**: Pass. Parent IDs, content, calculations, permissions, autosave timing, copy/delete semantics, and unrelated UI are explicit diff gates.

### Post-design gate

Pass. The design adds no schema, dependency, role, global state framework, or whole-quote replacement. The only new external surface is the minimal transactional API required for all-or-nothing sibling ordering.

## Actual Git State at Planning Start

- **HEAD**: `e3ba0ad6d1203eb2dabbd61be2b4aaee13501489`
- **Current branch**: `feature/003-quote-summary-layout`
- **Tracked worktree state**: `PRICING_TOOL_ENHANCEMENT_SPEC.md` is modified by this documentation-only Feature 004 planning work; no runtime source is modified.
- **Preserved untracked paths**: pre-existing `specs/001-prevent-duplicate-mutations/` and Feature 004's `specs/004-persistent-quote-ordering/` planning directory.
- **Other worktrees**: `integration/duplicate-mutations-t010-t013` at `123292a…`; `hotfix/print-item-name` at `c516b0c…`
- **Reported deployment**: User reports `e3ba0ad…` deployed; repository inspection proves only local HEAD equality, not production deployment.

## Current-Source Findings

All entries are **source-proven at HEAD `e3ba0ad…`** and **not runtime-verified** in this documentation phase.

| Area | Evidence | Consequence |
|---|---|---|
| Schema | Existing order columns exist in both engine definitions (`db.js:328-350`, `db.js:383-388`, `db.js:562-584`, `db.js:610-615`). | No migration/index/new field. |
| DB transaction support | Engine-specific transaction helpers exist (`db.js:1298-1317`). | Reorder endpoints can be atomic on both engines. |
| Quote reader | Sections, rooms, and items use `ORDER BY sort_order ASC` only (`routes/quotes.js:63-91`). | Add `id ASC` tie-breakers. |
| Other readers | Section/room/item routes and PDF use the same single-key order; calculation reads do too. | Make every feature-relevant read deterministic; do not rewrite formulas. |
| Writers | Single/batch POSTs derive an append base (while accepting explicit positions); ordinary PUTs update `sort_order`; delete/clone routes change membership (`routes/sections.js`, `routes/rooms.js`, `routes/items.js`). Frontend autosave/manual save both send order, and several immediate item paths spread the entire item. | Slice 1 must transfer existing-row order ownership across all server and frontend writers in one boundary; new multi-row reorder API is necessary. |
| Current code logic | Duplicated frontend/PDF helpers use stored `sec.code`; no-room items become `A 1.1`, `A 2.1`; frontend maps by `item.id` (`public/app.html:5068-5099`, `routes/pdf.js:425-456`). | Shared object-safe positional helper is required. |
| Section labels | Stored `sec.code` appears in nav, heading, selectors, summary, copy destinations, and browser/PDF headings. | Replace presentation references with derived label, preserve stored value for compatibility. |
| Item identity | `item_code` comes from catalog/fallback input and is written by item routes. | Never rewrite it during reorder. |
| New item positions | Several frontend add paths create item objects without `sort_order`; the server appends by section-wide `MAX(sort_order)+1` (`public/app.html:6040-6120`, `public/app.html:6417-6558`, `public/app.html:7009-7061`, `public/app.html:8533-8641`; `routes/items.js:53-79`). | Preserve local objects by identity/order, consume server-assigned append positions, then reorder only after every object in the scope has a real ID. |
| Main item order | `section.items` is flat; room and category filters select from it (`public/app.html:5470-5595`). | Reorder only the complete direct/room subset and splice it back without changing membership. |
| All-items order | Regroups direct items then each room in room-array order (`public/app.html:6611-6675`). | Shared helper produces the same codes; no cross-group drag. |
| Manual save | Existing entities are PUT independently in section/room/item waves and partial failures are reported (`public/app.html:9013-9418`). | Ordinary field PUTs cannot be the reorder transaction. |
| Autosave | Selective dirty snapshots, retries, timeouts, shared lock, and stamp gating are already present (`public/app.html:4073-4840`). | Add separate order-scope dirtiness/versioning; preserve debounce and lock. |
| Draft restore | Draft serializes hierarchy arrays and positions; restore marks all entities dirty (`public/app.html:4369-4445`, `public/app.html:10920-11040`). | Preserve local array order and rebuild/flush pending order safely. |
| Templates | Template JSON includes sections/rooms/items and stored positions; clone recreates hierarchy (`public/app.html:7731-7792`, `routes/templates.js:21-141`). | Preserve relative order and derive display codes after clone. |
| Copy behavior | Cross-section room action clones; direct copy creates a new section (`routes/sections.js:137-340`). | Explicitly unchanged; no move behavior. |
| Item destination behavior | Item POST/PUT accepts `room_id`; checked-in UI chooses room only for creation/fill paths. | Existing separate behavior; reorder endpoint rejects membership changes. |
| Browser print | Iterates current sections/direct/rooms and frontend display map (`public/app.html:9858-10010`). | Wire shared helper; no print geometry edit. |
| Server PDF | Reads a nested hierarchy (`room.items`) but its display/render loops filter direct-only `sec.items`, so room rows/codes can be absent (`routes/pdf.js:86-136`, `routes/pdf.js:425-489`). | Consume nested room items through the shared helper; no layout edit. |
| Calculation endpoint | Returns stored `code`; checked-in frontend has no caller (`routes/quotes.js:318-398`). | Preserve the endpoint and response semantics; do not add `display_code`. |

### Writer ownership audit

All entries are source-proven and must be re-grepped at Slice 1 start because `public/app.html` is a shared legacy file.

| Writer family | Current source | Slice boundary |
|---|---|---|
| Ordinary server updates | Section PUT writes `code`, `name`, `sort_order`, `has_rooms` (`routes/sections.js:342-354`); room PUT writes `name`, `sort_order` (`routes/rooms.js:118-130`); item PUT writes content, `sort_order`, `category_id`, and `room_id` (`routes/items.js:180-250`). | Slice 1 removes only existing-row `sort_order` mutation from all three statements. Content and the separate item-destination behavior remain functional. |
| Server creates | Single/batch section, room, and item POSTs use explicit `sort_order` when supplied and otherwise an append base (`routes/sections.js:58-134`, `routes/rooms.js:42-115`, `routes/items.js:22-177`). | Slice 1 makes every checked-in caller omit insertion positions, retains the server's existing default append behavior, and adds assigned `sort_order` to create results. It does not broaden copy/template semantics. |
| Selective autosave | Section/room payloads name `sort_order`; item payload spreads the full object (`public/app.html:4654-4785`). | Slice 1 strips order from ordinary existing PUTs and standard creates while retaining returned create positions. No pending-order flush exists until its UI slice. |
| Manual save | New/existing sections, rooms, and items send explicit order or spread item objects (`public/app.html:9086-9338`). | Same Slice 1 handoff; manual save is regression-tested after the change. |
| Immediate editor paths | Section create sends `sort_order` (`public/app.html:7391-7397`); room create already relies on server append (`public/app.html:10472-10495`); catalog/manual/overlay/bulk item create/update paths call the item routes, often with spread objects (`public/app.html:6040-6120`, `6417-6558`, `7009-7061`, `8533-8641`, `8875-8995`). | Slice 1 audits each payload, omits order from ordinary create/PUT requests, and records returned assigned positions. Delete remains membership mutation, not an order rewrite. |
| Copy/template writers | Room clone appends a room and copies descendant item positions; direct copy appends a section and copies direct item positions (`routes/sections.js:137-340`). Template clone recreates a new hierarchy from serialized positions (`routes/templates.js:36-141`). | Preserve as separate copy behavior. Change only if a focused relative-order test fails; these paths do not become reorder endpoints. |
| Local recovery | Draft saves the ordered object arrays and current fields (`public/app.html:4369-4445`, restore at `10920-11040`). | Slice 1 preserves existing draft operation. Slice 2/3 add pending expected/target reconstruction with their respective UI scope. |

## Proposed Interaction

### Sections

- Keep existing section tabs and colors.
- Add a compact reorder cluster to each tab with `نقل القسم للأعلى` and `نقل القسم للأسفل` buttons (direction means earlier/later in logical order, not physical left/right).
- Up/down buttons work with mouse, touch, Enter, and Space. Disable the impossible boundary direction.
- Clicking a reorder control stops tab selection; normal tab activation remains unchanged.

### Rooms

- Keep the direct tab fixed and non-reorderable as group `1`.
- Add the same compact earlier/later controls to each named room tab, alongside existing copy/edit/delete actions without changing those actions.
- Reorder is constrained to `sec.rooms`; it never changes `section_id`.

### Items

- Add a compact dedicated reorder cell beside the existing code/delete controls. It contains a visible grab handle and earlier/later buttons with row/item names in their accessible labels.
- Buttons move within the full direct/room group, not within `section.items` globally and not within a category subset.
- When a category filter other than “all” is active, hide/disable item reorder controls with a short prompt to show all items first.
- Dragging is optional direct manipulation, constrained to the currently visible complete group. Up/down remains the guaranteed touch/keyboard route.

### Focus and feedback

- After rerender, restore focus to the same entity's corresponding control using persisted ID or live object identity.
- Announce “moved to position X of Y” in one visually hidden polite live region.
- During a scope save, disable only that scope's reorder controls. Other fields/scopes remain usable under the existing shared save rules.
- On a definite conflict, read/reconcile the authoritative scope rather than restoring a snapshot that may contain an externally deleted entity. Retain unsaved entity content, display a clear toast, and do not mark the failed scope clean. On timeout/unknown result, retry the identical expected/target payload; never rebase it silently over a newer order.
- Replace the editable section-code inputs in the section and direct-copy forms with read-only derived next/current labels. Retain stored legacy values and generate a compatibility value for a new section without presenting it as positional truth.

## Persistence and Display Contract

1. Resolve persisted siblings by `sort_order`, then `id`.
2. Local arrays are the editor's immediate order in exactly four scope kinds: quote sections, one section's named rooms, one section's direct items, and one room's items. Items never reorder across nullable `room_id` boundaries.
3. A request sends the complete persisted target ID sequence plus the caller's exact last-confirmed `(id, sort_order)` baseline. Exact membership alone is never treated as freshness.
4. Inside one writer-excluding transaction, the server returns already-applied success when current state equals target; otherwise it applies only when current state exactly equals expected, and returns `409` for every other state.
5. SQLite uses an immediate transaction. PostgreSQL uses a short `SHARE ROW EXCLUSIVE` lock on the affected hierarchy table before read/update. This serializes create/delete/update/reorder DML with the comparison without adding a revision column.
6. The checked-in editor queues create, delete, and reorder work within the same scope. On `409` it fetches/reconciles; on unknown outcome it retries the identical expected/target request. It never creates a fresh expected state merely to force an old target.
7. Unsaved objects remain distinct by live object/client-only token and array position. Save appends them in local sequence to obtain real IDs/assigned positions; only after every required creation succeeds does it reorder the complete persisted scope. A partial creation result sends no reorder and stays dirty.
8. Slice 1 transfers existing-row order ownership coherently: all frontend ordinary PUT writers omit `sort_order`, and ordinary server PUT SQL no longer updates it. Checked-in standard creates omit insertion positions, use the existing server append default, and retain returned assigned order. Content saves remain functional.
9. Display helper derives labels/codes from resolved arrays and object identity; it never reads `sections.code` or `item_code` as positional identity.
10. Stored `sections.code` remains untouched compatibility data, including on reorder; section-code UI is derived/read-only. Section labels continue `A`…`Z`, `AA`, `AB`, ….
11. The shared helper is switched in the editor, all-items view, browser print, and server PDF in the same Slice 1 boundary. The PDF renderer consumes nested `room.items` and uses stable section identity for subtotal lookup.
12. `GET /api/quotes/:id/calculate` remains unchanged and receives no `display_code`.

See [data-model.md](data-model.md) and [contracts/reorder-api.md](contracts/reorder-api.md) for exact invariants and request behavior.

## Ordered Implementation Slices

### Slice 1 — Ordering kernel, deterministic reads, and atomic persistence (ACTIVE AFTER APPROVAL)

**Goal**: Establish and prove the single source of truth before adding user-facing reorder controls.

Exact planned runtime boundary:

- `public/quote-ordering.js` (new pure UMD/CommonJS helper): section labels, stable sibling comparison, group enumeration, object-safe display-code map.
- `public/app.html`: switch section/code presentation coherently for editor navigation/headings/selectors/summary, all-items, and browser print; make section labels read-only/derived while preserving stored compatibility values; audit every autosave/manual/modal/overlay/bulk/cleanup writer and omit `sort_order` from ordinary PUTs; rely on and record returned append positions for standard creates. No reorder controls or pending reorder state yet.
- `routes/pdf.js`: use the same helper and derived section labels/codes, render actual nested `room.items` exactly once, and stop using stored section code as subtotal identity without changing row geometry or formulas.
- `routes/quotes.js`, `routes/sections.js`, `routes/rooms.js`, `routes/items.js`: deterministic read tie-breakers.
- `db.js`: add only an immediate SQLite transaction wrapper needed to reserve the writer before baseline validation; do not change schema initialization.
- `routes/sections.js`, `routes/rooms.js`, `routes/items.js`: add expected-baseline compare-and-set endpoints, PostgreSQL table-writer exclusion, append-position response fields, and remove `sort_order` mutation from ordinary existing-row PUT SQL in the same ownership-transfer boundary. Content fields and existing response shapes remain functional.
- `test/quote-ordering.test.js`, `test/reorder.test.js`: pure contract, authorization, malformed input, same-membership stale baseline, already-applied retry, newer-order conflict, concurrent create/delete serialization, rollback, reopen, writer ownership, and engine-parity coverage.
- One focused PDF fixture/test: two direct rows plus room rows in at least two rooms; assert every room row appears exactly once, direct rows remain exactly once and in order, codes match the shared helper, totals are unchanged, and every row still uses the existing renderer/column coordinates and sizing inputs.

Explicit exclusions: no section/room/item reorder control, no drag behavior, no autosave debounce change, no screen/print geometry work, no calculate-endpoint field or response change, no migration/index, and no broad template/copy rewrite without a failing focused test.

Acceptance gate:

- Direct items are always group `1`; first room is group `2`, including empty-direct case.
- Unsaved objects receive distinct codes in pure/browser helper tests.
- Section array reorder changes prefixes without touching stored IDs/catalog codes.
- Legacy tied/gapped/negative fixtures read deterministically.
- Two requests from the same exact baseline cannot overwrite one another: the first target commits, an identical-target retry is already-applied success, and a different stale target returns `409` even though membership is unchanged.
- Create/delete versus reorder is serialized on disposable SQLite and PostgreSQL; whichever commits second observes the first rather than interleaving validation/update.
- Each endpoint rejects duplicates/foreign/missing IDs and rolls back injected failure.
- Existing editor manual save, selective autosave, immediate section/room/item edits, create, delete, and reopen flows still work with `sort_order` owned only by create/reorder paths; no ordinary PUT can partially rewrite order.
- Editor, browser-print renderer, and server-PDF helper consume one code algorithm; print geometry is unchanged.
- The focused PDF fixture proves room rows exactly once, direct rows unchanged, numeric totals unchanged, and use of the unchanged row geometry contract.
- Stored `sections.code`, catalog `item_code`, and the calculate response remain byte/value-semantic compatibility data; no positional backfill occurs.
- No UI reorder action is introduced in this slice.

Stop for independent review before Slice 2.

### Slice 2 — Section and room reorder controls/persistence

**Goal**: Deliver complete section and room ordering using the proven kernel.

Planned runtime files:

- `public/app.html`: compact section/room up/down controls, scope/version ownership guards, focus/live-region feedback, active selection preservation, dedicated pending order state, same-scope mutation queue, append-then-reorder orchestration for unsaved sections/rooms, and manual/autosave/draft coordination. It builds on the Slice 1 writer handoff rather than removing ordinary ownership later.
- `test/auto-save.test.js` and/or a new focused extracted frontend-core test file only if the state logic is factored into a pure helper.
- `test/reorder.test.js`: integration assertions for save/reopen and repeated/stale requests.

Acceptance gate:

- Reorder two sections containing direct items and rooms; all prefixes update.
- Reorder rooms; direct group `1` remains reserved and rooms become `2`, `3` in new order.
- Save/autosave/reopen, draft recovery, template clone, room/direct copy, browser print, and server PDF agree.
- Mouse, touch activation, keyboard, focus retention, and async ownership guards pass.
- Failed/stale requests reconcile authoritative membership/order, retain unsaved content, and remain visibly retryable without resurrecting deleted rows.

Stop for independent review before Slice 3.

### Slice 3 — Item reorder controls/persistence and full acceptance

**Goal**: Add item ordering within direct/room scopes and close cross-output acceptance.

Planned runtime files:

- `public/app.html`: item reorder cell/controls, complete-group array splice, category-filter rule, optional constrained drag, pending item-scope integration, and append-then-reorder orchestration for multiple unsaved items.
- Focused pure/frontend tests for group splicing, unsaved items, filters, and superseded completion.
- `test/reorder.test.js`: item scope persistence, membership rejection, save/reopen, and engine parity.

Acceptance gate:

- Reorder items independently in direct group and multiple rooms.
- No cross-group/cross-section move is possible through reorder.
- Unsaved items keep distinct codes/order through draft and later creation.
- Insert/delete close displayed sequences while preserving data/totals.
- All requested editor/reopen/print/PDF examples pass, followed by the scoped canonical suite.

Stop after review. Do not absorb width/sizing/typography/print-geometry work.

## Verification Plan

### Focused pure tests

Use `node:test` against `public/quote-ordering.js` (and any deliberately extracted pure reorder-state helper):

- `A`…`Z`, `AA`, `AB` labels;
- two-section prefix swap;
- direct `1.x` with/without rooms and with no direct items;
- room groups starting at `2` after room reorder;
- item group reorder;
- persisted and multiple unsaved object identities;
- legacy `(sort_order, id)` order with duplicates, gaps, and negative values;
- immutable content/ID/catalog code assertions;
- scope-version stale completion and group splice behavior if factored.

### Disposable persistence checks

- **SQLite**: use a unique `mktemp -d` database path, create isolated users/quotes/hierarchy, exercise HTTP contracts, inject mid-update failure, reopen, assert exact order/codes/data/totals, then remove only that exact temp directory.
- **PostgreSQL**: run the same contract suite only against a dedicated disposable `DATABASE_URL` supplied for Feature 004. Create/drop a uniquely named test database or schema through a controlled harness. Never point at production/Neon or a shared development database. If unavailable, report PostgreSQL runtime as not verified; do not infer parity from SQLite.
- Both engines: assert applied `200`, already-applied `200` after an unknown outcome, `409` for the same membership with a stale position baseline, `409` for changed membership, `400` duplicate/foreign scope, transaction rollback, and deterministic legacy read. Run overlapping reorder/reorder, reorder/create, and reorder/delete cases and record which transaction won.
- SQLite proof must exercise the immediate transaction path. PostgreSQL proof must show the table lock blocks hierarchy-table DML until commit; do not infer either guarantee from source alone.

### Narrow browser and output checks

Use an isolated server/database and a disposable quote; never localhost:3000 or existing data.

- Section, room, and item controls with mouse click, touch-style pointer activation, Enter, and Space.
- Boundary disabled states, tab/room selection isolation, focus restoration, `aria-live` announcement, and pending-state disabling.
- Category filter protection and all-items view parity.
- Move while save is pending, same-scope create/delete queueing, rapid repeated activation, server failure, stale same-membership baseline, changed membership, quote switch, and retry.
- Timeout-after-commit reconciliation: retry the identical expected/target payload; accept already-applied success, fetch on conflict, and never issue per-row fallback writes or overwrite a newer target.
- Save/reopen plus local-draft restore for mixed persisted/unsaved entities.
- Browser print preview/table order/code comparison; no print geometry review.
- Server PDF focused fixture/text-order comparison: room rows exactly once, direct rows exactly once, totals unchanged, and unchanged existing row-renderer geometry inputs; no broader pagination/design review.
- Template save/load and existing room/direct copy order only; do not rerun unrelated dialog-summary batteries.

### Regression and mechanical checks per modified slice

- `node --check` for modified/new JavaScript; extract the inline script from `public/app.html` if needed.
- `node --test test/quote-ordering.test.js test/reorder.test.js` plus only directly affected autosave/draft/template tests.
- At final Slice 3 gate: `node --test test/*.test.js`, reporting exact pass/fail/skipped counts.
- `git diff --check`, route-order/source-consumer grep, and cause-scoped diff review.
- Explicit assertions that totals and all non-order fields remain byte/value equivalent before/after reorder.

## Project Structure

### Documentation (this feature)

```text
specs/004-persistent-quote-ordering/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── contracts/
│   └── reorder-api.md
└── checklists/
    └── requirements.md
```

### Planned source code

```text
public/
├── app.html
└── quote-ordering.js          # new shared browser/Node pure helper

routes/
├── quotes.js                  # deterministic reads; no formula refactor
├── sections.js                # section reorder endpoint + deterministic reads
├── rooms.js                   # room reorder endpoint + deterministic reads
├── items.js                   # item-group reorder endpoint + deterministic reads
├── templates.js               # order preservation only if tests expose a gap
└── pdf.js                     # shared derived codes, deterministic reads

test/
├── quote-ordering.test.js     # new pure behavior tests
├── reorder.test.js            # new API/persistence tests
├── pdf-ordering.test.js        # focused PDF row/code/geometry-input fixture
├── auto-save.test.js          # writer handoff, then pending-scope regressions
├── save-batch.test.js          # Slice 1 writer-ownership/save regression
├── batch-items.test.js         # Slice 1 create-position response regression
└── draft-restore.test.js       # only focused additions required by reordered drafts
```

**Structure Decision**: Keep the legacy frontend and current route organization. A small UMD/CommonJS pure helper is the only new runtime module because sharing one display-code algorithm between browser and PDF materially reduces parity risk. No framework/component/store migration.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| One-row saves partially persist an order | Dedicated transactional scope endpoints; never fall back to ordinary PUTs after reorder failure. |
| Duplicate legacy positions reorder unpredictably | Add `id ASC` tie-breaker everywhere relevant; normalize only on explicit reorder. |
| Unsaved rows collide or cannot be named atomically | Keep object/token identity locally, append to obtain real IDs, and send no scope reorder until every required creation succeeds. |
| An old async completion overwrites a newer move/quote | Scope identity + local version + current quote/array ownership guards. |
| Active tab/focus jumps to a different entity | Preserve by object/ID, not array index; restore focus after render. |
| Category filtering creates hidden reorder effects | Permit item reorder only with the complete group visible. |
| Stored codes are mistaken for identity | Keep them unchanged; derive all checked-in display consumers through one helper. |
| Screen and PDF drift | One shared pure helper with parity tests. |
| PostgreSQL behavior is assumed | Dedicated disposable PostgreSQL run or explicit “not runtime-verified.” |
| Feature expands into item moving/UI redesign | Endpoint membership validation and explicit non-goals; compact existing-style controls only. |
| Manual/autosave clears failed order work | Separate pending order scopes with stamp/version-aware clearing and failure tests. Slice 1 first removes order ownership from every ordinary PUT writer/server statement in one boundary. |
| Timeout occurs after the transaction committed | Treat as unknown and retry the identical expected/target request. Already-target state succeeds without writing; a newer different state conflicts and is never overwritten. |
| Server PDF loses room items | Consume `room.items` from its actual nested hierarchy and cover it with output-parity tests. |
| Create/delete interleaves after baseline validation | SQLite immediate transaction and PostgreSQL short table writer lock exclude DML during compare/update; same-editor scope queue avoids needless conflicts. |

## Concrete Unresolved Decisions

No substantive product-policy decision remains for Feature 004 planning:

1. After-`Z` lettering is approved as `AA`, `AB`, ….
2. Quote-section labels are derived/read-only; stored legacy `sections.code` values remain untouched compatibility data, and catalog `item_code` remains unchanged.
3. The unused calculate endpoint remains unchanged and receives no `display_code`.

Operational evidence remains unavailable until implementation: a dedicated disposable PostgreSQL environment may or may not be supplied, and browser/PDF behavior is not runtime-verified in this documentation task. If PostgreSQL is unavailable, that limitation must be reported and cannot be converted into a design claim. Direct dragging remains optional; accessible earlier/later controls are mandatory, so no drag-policy decision blocks Slice 1.

## Complexity Tracking

No constitution violation. The additive reorder endpoints are necessary because the approved all-or-nothing failure behavior cannot be met by current per-row PUTs. The shared helper is necessary because two proven duplicate implementations already disagree with the approved rules and cannot safely represent multiple unsaved items.
