# Implementation Plan: Persistent Quote Ordering

**Branch**: `feature/004-persistent-quote-ordering` | **Refined**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Approved product direction in `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.11 and the Feature 004 specification.

## Summary

Reuse the existing `sort_order` columns and add transactional sibling-scope reorder contracts; no migration is needed. Derive section letters and item display codes through one browser/Node pure helper, make legacy reads deterministic, and add drag handles with insertion indicators for sections and named rooms plus an accessible keyboard-handle alternative. Integrate pending order work with the current manual save, selective autosave, local draft, template/copy, browser print, and server PDF paths without changing save timing or unrelated behavior.

Because atomic persistence, hierarchy code derivation, and three UI levels are too risky as one legacy-file patch, deliver three ordered slices and keep only one active at a time. Slice 1 is approved, committed, pushed, and closed. This refinement makes Slice 2 implementation-ready without reopening Slice 1; Slice 3 remains inactive until Slice 2 review.

## Technical Context

**Language/Version**: Node.js 20; browser JavaScript in one vanilla inline application script

**Primary Dependencies**: Express 4.x, `better-sqlite3`, `pg`, PDFKit; no new dependency

**Storage**: Existing SQLite local/test and PostgreSQL production tables

**Testing**: `node:test`; disposable SQLite database; dedicated disposable PostgreSQL database/schema only when explicitly configured; narrow real-browser editor/print checks

**Target Platform**: Existing web application and server-generated PDF route

**Project Type**: Legacy server-rendered/static web application with JSON API

**Performance Goals**: Coalesce rapid local moves to the newest target while serializing requests per exact scope; linear validation/update in sibling count; no whole-quote rewrite for a one-scope move

**Constraints**: No schema/index/dependency/auth/pricing/autosave-timing changes; preserve untracked Feature 001 and other worktrees; never touch localhost:3000 or development/production data

**Scale/Scope**: One editor file, five relevant route/read files, one shared pure helper, and focused tests; sections/rooms/items currently cap batch creation at 100/100/200 but reorder contract validates the actual scope rather than inventing a new product cap

## Constitution Check

### Pre-design gate

- **Stable Maintenance First**: Pass. Three reviewed slices prevent a broad all-at-once patch; no modernization or unrelated redesign.
- **Repository Is Source of Truth**: Pass. Slice 2 findings were re-established at actual HEAD `32ebb95…`; the branch was not assumed.
- **Analysis and Implementation Are Separate**: Pass. This task produces documents only; implementation remains separately approved OpenCode work.
- **Smallest Safe Patch**: Pass. Existing columns/transaction utilities are reused; a small additive reorder API is justified by the proven partial-write risk.
- **Mutation Safety**: Pass by design. Reorder is expected-baseline guarded and transactional; an already-stored target is recognized without a second write, while a stale different target conflicts.
- **Regression Proof**: Pass by plan. Focused pure, API, rollback, persistence, browser, and output parity tests cover the actual failure modes.
- **Preserve Stable Behavior**: Pass. Parent IDs, content, calculations, permissions, autosave timing, copy/delete semantics, and unrelated UI are explicit diff gates.

### Post-design gate

Pass. The design adds no schema, dependency, role, global state framework, or whole-quote replacement. The only new external surface is the minimal transactional API required for all-or-nothing sibling ordering.

## Actual Git State at Slice 2 Planning Start

- **HEAD**: `32ebb95270b45a8f9a01f991683f99eff4ae4884`
- **Current branch**: `feature/004-persistent-quote-ordering`
- **Remote refs at inspection**: `origin/main`, `origin/feature/004-persistent-quote-ordering`, and `origin/HEAD` all point to the same commit.
- **Preserved tracked change**: `server.js` is modified by excluded pre-existing work.
- **Preserved untracked paths**: `debug_test.js` and `specs/001-prevent-duplicate-mutations/` are excluded pre-existing work.
- **This task**: documentation-only changes under `specs/004-persistent-quote-ordering/`; no runtime source, data, staging, commit, push, deployment, or Git-history change is authorized.
- **Deployment evidence**: the reported deployed commit equals local HEAD and production static content reportedly matched the Slice 1 helper. Exact Render deployment SHA is unavailable, so production deployment identity is **not runtime-proven** here.

## Current-Source Findings

The original reconnaissance entries remain the accepted basis for Slice 1. Slice 1 is source-proven at HEAD `32ebb95…`; browser, database, and production behavior were not rerun in this documentation phase.

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

### Slice 2 reinspection at `32ebb95…`

These points are **source-proven** and define the frontend boundary; none was runtime-verified in this planning task.

| Current source | Slice 2 consequence |
|---|---|
| `renderAll()` calls `resolveSectionOrder()`, which sorts both `sections` and every `section.rooms` from mutable `sort_order` on every render (`public/app.html:3946-3964`, `7358-7364`). | A move must update the complete local scope's projected positions before rendering. The exact persisted compare-and-set baseline must live separately in the scope coordinator; it must never be reconstructed from locally projected `sort_order`. |
| `api()` throws only a message and discards HTTP status and JSON `code` (`public/app.html:3903-3919`). | Add a reorder-only request wrapper (or backward-compatible metadata on the thrown error) that distinguishes definite `409 ORDER_CONFLICT`, definite HTTP rejection, and timeout/network unknown outcome. Do not change unrelated callers. |
| Section navigation is a horizontal `.sections-nav` of clickable `.section-tab` containers (`public/app.html:219-257`, `5081-5102`). Room navigation is a horizontal `.rooms-nav`; named tabs already contain copy/edit/delete buttons and the direct tab is separate (`public/app.html:274-335`, `5551-5577`, `5766-5842`). | Put controls inside the existing pills; isolate their events from tab click/double-click and existing room actions. No navigation redesign. |
| Active section is index-based, while the active room also has `activeRoomObj`; `selectActiveSection()` already repairs the room index by object identity when the section object survives (`public/app.html:3986-4036`, `4079-4081`). | Capture active section and room objects before every splice and recompute indexes afterward. Never preserve selection by the moved entity's old index. |
| Selective autosave uses a stamp, dirty snapshot, shared save lock, retry timing, and section→room→item creation stages (`public/app.html:4094-4400`, `4500-4870`). Manual save batch-creates sections, then rooms, and already retains successful IDs/assigned append positions from partial results (`public/app.html:9138-9565`). | Order state is additive and separate from `dirtyEntities`. Preserve debounce/retry timing. Both save paths must call the same scope flush after required creates and must report the cycle unclean while any applicable order scope remains unresolved. |
| The draft currently stores hierarchy arrays and active section index only; restore can already fetch the draft's quote for stale-draft comparison (`public/app.html:4402-4453`, `11061-11175`). | Extend the same draft with section/room order baselines and active entity identity. Reuse the already-fetched quote for reconciliation; never overwrite a newer draft or blindly submit a draft baseline that was not checked against server state. |
| Immediate section/room creation, direct-copy, room-copy, section deletion, and room deletion mutate the same memberships outside the manual/autosave waves (`public/app.html:7422-7533`, `7612-7701`, `7754-7806`, `10613-10648`, `10787-10905`). | Route each membership mutation through the exact scope queue or make it await that queue and refresh its baseline. Copy remains append-only; no copy API redesign. |
| `applyQuoteToEditor()`, `loadQuote()`, template load, draft restore, and `resetQuote()` can replace the hierarchy root (`public/app.html:9578-9663`, `7937-7944`, `9918-9961`, `11115-11175`). | Increment an editor-generation token and dispose the old scope registry on every hierarchy replacement. Late work may finish on the server but may not mutate the new editor, selection, focus, dirty flags, or announcements. |

## Proposed Interaction

### Sections

- Keep existing section tabs and colors.
- Add one comfortably sized drag handle inside each existing section pill, with a visible insertion indicator while dragging. The handle supports native mouse/touch dragging and keyboard handle mode; ordinary pill clicks continue to select without initiating a drag.
- Keyboard handle mode uses Enter/Space to start or cancel, ArrowUp/ArrowDown to move within the section scope, and Escape to cancel. Preserve focus by object identity and announce each projected position through the existing polite status region.

### Rooms

- Keep the direct tab fixed and non-reorderable as group `1`.
- Inside each named room pill, place the same drag handle after the room name/count and before copy/edit/delete. The direct pill has no handle and is not counted in named-room positions.
- Apply the same insertion indicator, keyboard cancellation, focus restoration, announcement, and click/double-click isolation as sections.
- Reorder is constrained to `sec.rooms`; it never changes `section_id`.

### Items

- Add a compact dedicated reorder cell beside the existing code/delete controls. It contains a visible grab handle and earlier/later buttons with row/item names in their accessible labels.
- Buttons move within the full direct/room group, not within `section.items` globally and not within a category subset.
- When a category filter other than “all” is active, hide/disable item reorder controls with a short prompt to show all items first.
- Dragging is optional direct manipulation, constrained to the currently visible complete group. Up/down remains the guaranteed touch/keyboard route.

### Focus and feedback

- Preserve the active section and active named room by live object identity, then recompute `activeSectionIdx` / `activeRoomIdx` after a move. Moving an inactive entity must not change selection.
- Before rerender, record the moved object and handle mode. After rerender, focus that entity's handle and restore its keyboard state. Resolve persisted objects by ID and unsaved objects through a runtime `WeakMap` token; never use an array index as focus identity.
- Announce “moved to position X of Y” in one visually hidden polite live region.
- The live region is appended once near the editor root with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`. Announce the entity name plus one-based position among sections or named rooms only. Do not announce the direct group as room position 1.
- Order-only requests do not disable the scope: rapid activations update the local target and coalesce behind the in-flight payload. Disable that scope's reorder controls only while membership is being created/deleted/copied or while conflict reconciliation is replacing membership; unrelated scopes and fields stay usable.
- On a definite conflict, read and merge the authoritative scope rather than replacing the whole editor. Preserve unsaved siblings and local field edits on surviving IDs, drop externally deleted IDs from reorder membership without POSTing them again, insert server-only IDs, retain the local intended relative order where it is still valid, and leave the scope visibly dirty/retryable. Any locally edited externally deleted object is quarantined from automatic create/reorder and retained in the draft until the user reloads or explicitly recreates it; it is never silently resurrected.
- On timeout/network unknown result, freeze and retry the identical `{ expected, order }` payload. Newer moves may change the displayed desired target but wait behind that frozen payload. Only its `200` or a reconciliation after `409` may advance the persisted baseline.
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

### Slice 2 frontend state owner

Use one `orderScopes` registry in `public/app.html`; no second copy of pending state may live in autosave, modal handlers, DOM data, or entity dirty sets.

- **Keys**: one quote-section scope keyed by the owning editor generation plus quote identity; one named-room scope keyed by the same generation plus section object/stable section ID. Unsaved parent scopes remain local-only until the parent receives a real ID.
- **One record per scope**: `kind`, parent/root identity, editor generation, monotonic `version`, exact last-confirmed persisted `baseline: [{id, sort_order}]`, current desired object sequence, frozen in-flight payload/version, status (`clean`, `needs-create`, `sending`, `unknown`, `conflict`), serialized promise tail, and focus request.
- **Canonical split**: the live arrays and locally projected contiguous `sort_order` values own what the editor renders now. Only the registry baseline owns what the server was last confirmed to store. No save path may rebuild `expected` from locally projected entities.
- **Rapid moves**: every activation splices the live array, projects positions `0..n-1`, bumps the scope version, preserves active identity, renders/announces/focuses immediately, and schedules one drain. If a request is running, later moves replace only the queued desired target; they never mutate the frozen payload.
- **Completion rule**: a completion must match editor generation, hierarchy root, quote, parent scope, and frozen request identity. A successful older version may advance that scope's baseline to its returned positions, but it may not replace the newer desired array, focus, selection, dirty state, or announcement; the drain then sends the newest complete target.
- **Membership serialization**: section create/delete/direct-copy share the quote-section queue. Room create/delete/targeted room-copy share the target section's room queue. Manual/autosave batch creation enters those same queues and records every successful returned ID/append position before any reorder decision.
- **Partial creation**: if one sibling creation fails, retain successful IDs and assigned positions in the baseline, retain failed objects and their content in the desired array, mark `needs-create`, and send no reorder for that scope. On retry, reconcile current persisted membership, create only still-unsaved siblings in desired order, and issue one complete-scope reorder only after all have real IDs.
- **Manual/autosave boundary**: preserve the current global save lock, debounce, content dirty snapshot, and retry timing. A save cycle flushes applicable order scopes after its membership-creation stage and is not clean while a scope is `needs-create`, `unknown`, or `conflict`. A manual save waits for its captured scope versions; an edit/new move during the wait stays dirty under the existing stamp gate.
- **Definite versus unknown failure**: `409/ORDER_CONFLICT` fetches and reconciles; other received `4xx/5xx` responses retain dirty order and report failure without claiming persistence; abort, disconnect, or missing response is unknown and retries only the frozen identical payload. There is never a row-by-row fallback.
- **Hierarchy replacement**: `applyQuoteToEditor`, successful `loadQuote`, template load, draft adoption, `resetQuote`, and new-quote reset increment the editor generation and dispose the old registry/timers. Stale completions are ignored locally.

### Draft and reconciliation boundary

- Extend the existing draft payload; do not create a second storage key. Persist the current hierarchy array order, active section/room identity, and only the serializable order metadata needed for section/room baselines and unresolved status. Runtime promises, DOM focus nodes, abort controllers, and object tokens are never serialized.
- On restore with a persisted quote, compare against the already-fetched `serverQuote`. If the draft is accepted, reuse live draft objects for matching IDs so local fields survive, take membership/confirmed positions from the server, retain unsaved objects in draft order, and rebuild dirty scope records. If the fetch is unavailable, show the draft locally but keep persisted order scopes blocked from submission until a later reconciliation succeeds.
- If server order already equals the draft target, mark that scope confirmed. If membership/baseline equals the saved draft baseline, the normal compare-and-set flush may proceed. Otherwise mark conflict and require the reconciled dirty target to be retried; do not silently invent a baseline and auto-submit the old target.
- A server-only sibling is inserted using authoritative persisted order. A surviving local sibling keeps its local fields. An unsaved sibling stays adjacent to the same surviving local neighbors where possible. An externally deleted persisted sibling is excluded from target membership and is never recreated automatically.
- A successful order flush updates entity positions and the persisted baseline, but clears only the matching scope version. Draft/`hasUnsavedWork` cleanup still obeys the existing autosave/manual-save stamp rules and must also require zero unresolved order scopes.

See [data-model.md](data-model.md) and [contracts/reorder-api.md](contracts/reorder-api.md) for exact invariants and request behavior.

## Ordered Implementation Slices

### Slice 1 — Ordering kernel, deterministic reads, and atomic persistence (CLOSED)

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

Explicit exclusions: no item reorder control, no autosave debounce change, no screen/print geometry work, no calculate-endpoint field or response change, no migration/index, and no broad template/copy rewrite without a failing focused test.

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

Implementation boundary, in dependency order:

1. **Pure movement/reconciliation seams** — extend `public/quote-ordering.js` only with side-effect-free helpers for adjacent movement, projected positions, baseline/target construction, and authoritative-membership merge. Keep async queues, fetch, DOM, and dirty flags out of this shared display helper. Add focused cases to `test/quote-ordering.test.js`.
2. **Single coordinator and request classification** — in `public/app.html`, add the `orderScopes` registry/editor generation and one reorder-specific request wrapper that preserves `status` and `code`. Do not change endpoint contracts or the generic API behavior for unrelated calls.
3. **Section controls** — make drag-and-drop the primary interaction for section pills, with a clear comfortably sized handle and visible insertion indicator. Preserve ordinary click selection and prevent accidental dragging. Provide a keyboard alternative through the handle with instructions, cancellation, focus restoration, and live announcements. All input methods call the same coordinator; prove two-section/`Z`→`AA` prefix propagation before adding room controls.
4. **Section persistence coordination** — put immediate create, batch create, delete, and direct-copy membership changes through the quote-section queue. Integrate section flush with manual save and selective autosave without changing their timing or ordinary content payloads.
5. **Room controls** — add the same drag/keyboard-handle mechanism to named room pills only. Remove the visible earlier/later pair. Keep direct fixed, preserve `activeRoomObj`, and prove group numbering starts at `2` both with and without direct items.
6. **Room persistence coordination** — put immediate/batch room creation, room delete, and target room-copy append through that section's room queue. Do not change cross-section copy semantics or allow a room move across sections.
7. **Draft and hierarchy replacement** — extend the existing draft payload/restore and add generation reset to quote load/reset/template replacement. Reconcile order without replacing surviving edited objects.
8. **Focused verification and stop** — execute the Slice 2 cases below, run the repository's canonical test command once, inspect the cause-scoped diff, and stop before item controls.

Exact likely files:

- `public/app.html` — required runtime change: styles, controls, live region, scope registry/queue, request classification, save/create/delete/copy hooks, draft serialization/restore, hierarchy-generation guards.
- `public/quote-ordering.js` — likely small pure additions only; do not change accepted display-code semantics.
- `test/quote-ordering.test.js` — pure movement, baseline separation, coalescing inputs, and merge cases.
- `test/auto-save.test.js`, `test/save-batch.test.js`, `test/draft-restore.test.js`, and `test/frontend-ownership.test.js` — only the focused coordination/ownership cases each existing seam directly supports.
- `test/clone-room.test.js` — only target-room append/baseline non-regression if the room-copy hook changes.
- `test/reorder.test.js` — a narrow existing-endpoint integration smoke for section/room save/reopen and already-applied retry; accepted backend concurrency/rollback coverage is not repeated.
- `routes/sections.js`, `routes/rooms.js`, `routes/quotes.js`, `routes/pdf.js`, `db.js`, schema, and dependencies are **not expected to change**. Stop and report evidence before changing one of them.

Acceptance gate:

- Drag the first/middle/last section to valid insertion points with mouse/touch; the same section remains active, focus returns inside its moved pill, and the polite announcement reports the new one-based position. Keyboard handle mode provides the same movement, with instructions and cancellation.
- Reverse populated sections across `Z`/`AA` where practical; editor headings, selectors, summary, all-items, browser print, and the already-shared PDF helper derive the same prefixes. IDs, parentage, stored `sections.code`, catalog `item_code`, content, prices, and totals are unchanged.
- Reverse named rooms with direct items and with an empty direct group. Direct remains fixed group `1`; named rooms become groups `2`, `3`, and never change `section_id` or descendant membership.
- Manual save, selective autosave, immediate creation, batch creation, delete, direct-copy append, room-copy append, and reopen all coordinate through the applicable scope; ordinary PUTs never regain order ownership.
- Move unsaved sections/rooms between persisted siblings, then save: successful creates append and one complete reorder establishes the intended order. Inject one partial batch creation failure: successful IDs/positions remain, failed objects/content remain, and no incomplete reorder is sent.
- Rapidly activate moves while a reorder is in flight: UI order/focus tracks the newest target, the first frozen payload resolves first, and an older completion cannot overwrite the newer target. A timeout-after-commit retries byte-equivalent expected/order and accepts already-applied success.
- On same-membership and changed-membership conflicts, scoped reconciliation preserves surviving local edits and unsaved siblings, never resurrects a deleted persisted ID, and leaves the intended order visibly retryable. A received failure or unresolved unknown outcome never clears the draft/order dirty state.
- Switch quotes, load a template, reset, or replace the same quote hierarchy while create/reorder/reconcile is pending: late completion changes no current arrays, selection, focus, toast, live announcement, or clean/dirty state.
- Restore a draft containing mixed persisted/unsaved sections and rooms: active identities and local order return; server-equal targets confirm, valid saved baselines may flush, conflicts reconcile, and an unavailable server blocks blind persisted reorder while preserving the draft.
- In both RTL and a test-only LTR document direction, drag handles are primary, pointer/touch activation does not select/edit/copy/delete, keyboard handle mode uses the same coordinator with cancellation and focus restoration, and insertion indicators/boundaries remain correct.

Stop for independent review before Slice 3.

#### Copilot handoff / stop conditions

- Implement only tasks T020–T035 in [tasks.md](tasks.md), in order. Do not add item controls, schema/index/dependency changes, initialization fixes, manager printing, image work, screen-fit/equal-height work, or unrelated UI refactoring.
- Treat `public/app.html` and `public/quote-ordering.js` as the expected runtime diff. Before editing any backend/PDF/template file, produce a focused failing test showing why the accepted Slice 1 dependency is insufficient; otherwise stop and report the evidence.
- Preserve `server.js`, `debug_test.js`, `specs/001-prevent-duplicate-mutations/`, other worktrees, and all databases. Do not use localhost:3000 or application data.
- Do not stage, commit, push, deploy, or change branches without separate explicit approval. Finish with the report identity and exact evidence required by `AGENTS.md`.
- Assigned implementation ownership for this Slice 2 repair is OpenCode; independent review remains a separate gate.
- Closeout record: Codex approved Slice 2 with no blocking findings. Coordinator, conflict recovery, frozen retries, membership coordination, offline draft blocking, keyboard operation, and the tested CDP drag flows passed as documented. Focused evidence is at `/tmp/feature004-slice2-interaction-repair-20261024/verification.txt`; earlier save/retry evidence is at `/tmp/codex-feature004-slice2-repair-20261024-final/focused-verification.txt`. Physical-pointer drag, outside-drop, pointer-cancel, touch, and template/quote-switch tests remain pending rather than failed. The current closeout executor is OpenCode; earlier historical attribution is not inferred.
- No product question blocks implementation. The concrete control order, direction semantics, pending-state owner, save serialization, partial-create behavior, conflict/unknown-outcome policy, draft reconciliation, active selection, and stale-completion rules are fixed above.

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

The preceding engine matrix is accepted Slice 1 evidence. Slice 2 does not change the routes, transaction helpers, or schema, so do **not** rerun that broad SQLite/PostgreSQL concurrency/rollback battery. Run only the narrow section/room endpoint cases needed to prove the new frontend orchestration; if a backend dependency unexpectedly changes, stop and re-scope verification before repeating engine-specific proof.

### Narrow browser and output checks

For implementation verification, use an isolated server/database and a disposable quote; never localhost:3000 or existing data. This documentation task itself starts no server and accesses no application data.

- Slice 2: section and named-room controls only, with mouse click, touch-style pointer activation, Enter, and Space in RTL and test-only LTR direction. Item controls remain Slice 3.
- Boundary disabled states, tab/room selection isolation, focus restoration, `aria-live` announcement, rapid moves during order-only requests, and scope-only disabling during membership mutation/reconciliation.
- All-items view code/order parity; category-filter/item-control behavior remains Slice 3.
- Move while save is pending, same-scope create/delete queueing, rapid repeated activation, server failure, stale same-membership baseline, changed membership, quote switch, and retry.
- Timeout-after-commit reconciliation: retry the identical expected/target payload; accept already-applied success, fetch on conflict, and never issue per-row fallback writes or overwrite a newer target.
- Save/reopen plus local-draft restore for mixed persisted/unsaved entities.
- Browser print preview/table order/code comparison; no print geometry review.
- Reuse the accepted server-PDF fixture/helper evidence. For Slice 2, compare only the generated hierarchy/code inputs or one focused output fixture if the consumer changed unexpectedly; no broad PDF, pagination, or geometry review.
- Template save/load and existing room/direct copy order only; do not rerun unrelated dialog-summary batteries.

### Regression and mechanical checks per modified slice

- `node --check` for modified/new JavaScript; extract the inline script from `public/app.html` if needed.
- First run `node --test test/quote-ordering.test.js test/reorder.test.js test/auto-save.test.js test/save-batch.test.js test/draft-restore.test.js test/frontend-ownership.test.js` plus `test/clone-room.test.js` only if room-copy coordination changed.
- At the Slice 2 stop gate, run the repository canonical `node --test test/*.test.js` once and report exact pass/fail/skipped counts. This is the normal regression gate, not a request to recreate Slice 1's external PostgreSQL/PDF/layout battery.
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

Operational evidence remains unavailable until implementation: a dedicated disposable PostgreSQL environment may or may not be supplied, and browser/PDF behavior is not runtime-verified in this documentation task. If PostgreSQL is unavailable, that limitation must be reported and cannot be converted into a design claim. For Slice 2, drag-and-drop is the primary section/room interaction; the handle's keyboard mode is the accessible alternative, and visible earlier/later button pairs are not part of the contract.

## Complexity Tracking

Slice 2 correction: drag-and-drop is primary for sections and named rooms; the handle's keyboard mode is the accessible alternative. Visible earlier/later button pairs are not part of the Slice 2 interaction contract.

This Slice 2 correction supersedes any earlier planning sentence that describes dragging as optional or earlier/later controls as mandatory.

No constitution violation. The additive reorder endpoints are necessary because the approved all-or-nothing failure behavior cannot be met by current per-row PUTs. The shared helper is necessary because two proven duplicate implementations already disagree with the approved rules and cannot safely represent multiple unsaved items.
