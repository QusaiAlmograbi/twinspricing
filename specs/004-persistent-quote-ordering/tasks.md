# Tasks: Persistent Quote Ordering

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/reorder-api.md](contracts/reorder-api.md), and [quickstart.md](quickstart.md)

**Execution rule**: Only one implementation slice may be active. Slice 1 is independently approved and closed. Slice 2 is the next bounded implementation candidate and still requires explicit implementation authorization; it requires independent review before Slice 3. These tasks do not themselves authorize implementation, staging, commit, push, deployment, branch changes, or application-data mutation.

**Tests**: Required because the approved feature explicitly requires pure order/code proof, transactional engine checks, save/reopen parity, and narrow browser/print verification.

## Phase 1: Pre-implementation gate

**Purpose**: Reconfirm scope and record the resolved advisor decisions before runtime work.

- [x] T001 Reconfirm actual HEAD, branch, worktrees, untracked files, and cause-scoped baseline in `AGENTS.md` and `specs/004-persistent-quote-ordering/plan.md`; source remains consistent with the plan.
- [x] T002 Record advisor decisions: `AA`/`AB` continuation; derived read-only section labels with stored `sections.code` and catalog `item_code` preserved; no calculate-endpoint `display_code`.
- [x] T003 Historical Slice 1 authorization was limited to its foundation; it is now independently approved and closed. The independent-review gate remains between Slice 2 and Slice 3.

---

## Phase 2: Slice 1 — Ordering kernel and atomic persistence (foundational)

**Purpose**: Prove deterministic hierarchy/code behavior and all-or-nothing persistence before exposing reorder controls.

**Independent Test**: Pure fixtures and the three HTTP contracts produce correct positional codes, deterministic legacy reads, exact-baseline validation, safe already-applied retry, stale-target conflict, and rollback without any new reorder UI.

### Tests first

- [x] T004 Create failing pure tests for section labels, direct group `1`, room groups from `2`, group-local item sequences, two-section swaps, and multiple unsaved object identities in `test/quote-ordering.test.js`.
- [x] T005 Create failing SQLite HTTP tests for section, room, and nullable-room item compare-and-set contracts, authorization, exact baseline and membership, duplicate/foreign IDs, already-applied retry, same-membership stale conflict, and reopen order in `test/reorder.test.js`.
- [x] T006 Add failure/concurrency tests proving mid-update rollback plus overlapping reorder/reorder, reorder/create, and reorder/delete outcomes without production-only behavior or application-data access.

### Shared order/code kernel

- [x] T007 Implement the dependency-free UMD/CommonJS section-label, deterministic comparison, group enumeration, and object-keyed display-code helper in `public/quote-ordering.js`.
- [x] T008 Load and use `public/quote-ordering.js` in `public/app.html` for section tabs/headings/selectors/summary, editor/all-items item codes, and browser-print codes; make quote-section labels read-only/derived; preserve stored `code`/`item_code`; audit every autosave/manual/modal/overlay/bulk/cleanup writer so ordinary PUTs omit `sort_order` and standard creates retain returned server positions. Add no reorder UI.
- [x] T009 Use `public/quote-ordering.js` from `routes/pdf.js` for section headings and item display codes, render actual nested `room.items`, and key subtotal lookup by stable section identity. Add `test/pdf-ordering.test.js` with a focused fixture proving room/direct rows exactly once, correct order/codes/totals, and unchanged existing row renderer coordinates/sizing inputs; do not alter PDF geometry or formulas.

### Deterministic reads and API contracts

- [x] T010 Add `id ASC` tie-breakers to feature-relevant reads and add only the immediate SQLite transaction wrapper in `db.js`; do not change schema, indexes, or calculations.
- [x] T011 Implement expected-baseline/target `PUT /api/quotes/:quoteId/sections/reorder`, SQLite immediate transaction, PostgreSQL `sections` writer lock, already-applied path, and conflict path. In the same change, ordinary section PUT no longer mutates `sort_order`, and standard create responses expose assigned append order.
- [x] T012 Implement the equivalent room contract and PostgreSQL `rooms` writer lock; ordinary room PUT no longer mutates `sort_order`, and create/batch responses expose assigned append order.
- [x] T013 Implement room-parent and nullable-group validation plus the equivalent item contract and PostgreSQL `items` writer lock; ordinary item PUT no longer mutates `sort_order`, item membership fields remain separate behavior, and create/batch responses expose assigned append order.
- [x] T014 Verify template/room-copy/direct-copy relative order against `routes/templates.js` and `routes/sections.js`; change those files only if a focused failing test proves current array/position preservation is insufficient.

### Slice 1 verification and stop gate

- [x] T015 Run `node --check` on `public/quote-ordering.js`, modified route files, and a temporary extraction of the `public/app.html` inline script; run `git diff --check` and record results in the implementation report.
- [x] T016 Run the focused SQLite ordering, concurrency, save-flow, writer-ownership, and PDF regression coverage against disposable databases; report exact pass/fail/skipped counts. Historical retained run: 94/94 passed; the current projected runner total is 99 and was not rerun as one combined command during closeout.
- [x] T017 Run the same contract/rollback/concurrency suite against a dedicated disposable PostgreSQL environment and prove the table lock behavior, or report PostgreSQL as not runtime-verified when no safe environment exists. Earlier disposable PostgreSQL verification passed; no repeat was performed during closeout.
- [x] T018 Perform a narrow isolated editor/browser-print/server-PDF parity check using disposable data. Exercise the focused PDF fixture only for row content/order/code, totals, and unchanged row-renderer geometry inputs; do not review broader print geometry. Independent Chrome and server-PDF evidence passed.
- [x] T019 Stop for independent Slice 1 review; do not begin section/room controls until blockers are resolved and Slice 2 is explicitly approved. Independent Codex review returned APPROVE with no remaining Slice 1 blockers.

### Slice 1 closeout

Slice 1 is independently approved and closed. The implementation and focused evidence cover deterministic ordering/display-code derivation, SQLite/PostgreSQL transactional compare-and-set behavior, append/copy concurrency, rollback, frontend writer ownership, shared item identity, stale completion ownership, browser-print parity, and server-PDF ordering/totals.

The implementer did not have Chrome/Chromium tooling; independent Codex completed the Chrome verification separately. Earlier PostgreSQL initialization warnings remain pre-existing and out of scope: the `app_settings` seed update requests `RETURNING id`, initialization queries `sqlite_master`, and concurrent cold-start initializers can collide with SQLSTATE `23505`.

Slice 2 is now planning-ready but not implemented. Slice 3 and the approved future printing/image/sizing requests remain inactive. No reorder controls or those future requests were implemented in this documentation task.

---

## Phase 3: Slice 2 — Section ordering (User Story 1)

**Goal**: Reorder sections accessibly and persist the complete section scope without stale async completions.

**Independent Test**: Reverse two populated sections and prove all derived prefixes, selection/focus, save/reopen, outputs, and unchanged content/totals.

### Tests first

- [x] T020 [US1] Extend `test/quote-ordering.test.js` with failing pure cases for adjacent section movement, first/last boundaries, projected local positions versus an immutable persisted baseline, surviving-ID conflict merge, server-only/deleted IDs, and distinct unsaved object identity. Do not change display-code expectations.
- [ ] T021 [US1] Add focused failing coordination cases in `test/auto-save.test.js`, `test/save-batch.test.js`, `test/draft-restore.test.js`, and `test/frontend-ownership.test.js`: captured scope version, newer move behind an in-flight payload, partial section creation, draft/server reconciliation, and quote/hierarchy replacement. Add only a narrow section save/reopen/already-applied smoke to `test/reorder.test.js`; do not repeat Slice 1's backend concurrency matrix.

### Implementation

- [x] T022 [US1] Add only the needed pure movement/projected-position/baseline-target/reconciliation helpers to `public/quote-ordering.js`. Keep fetch, promises, DOM, and dirty state in the editor.
- [x] T023 [US1] In `public/app.html`, create the sole `orderScopes` registry and editor-generation owner, plus a reorder-specific request path that preserves HTTP `status`/`code`. Keep the existing generic API behavior and autosave timing unchanged.
- [x] T024 [US1] Replace the section pill's earlier/later buttons with a primary drag handle, visible insertion indicator, ordinary-click selection isolation, keyboard handle mode with instructions/cancellation, active-object preservation, focus restoration, and the single polite live region.
- [x] T025 [US1] Serialize section reorder with immediate/batch create, delete, and direct-copy append through the quote-section queue. Record every successful append position, send no reorder after partial creation, coalesce rapid moves, freeze unknown-outcome payloads, and reconcile `409` without replacing surviving edited objects or issuing per-row writes.
- [x] T026 [US1] Integrate captured section-scope versions with manual save, selective autosave, shared lock, draft save/restore, and all hierarchy replacement paths. A save is not clean while captured order work is unresolved; a later edit remains dirty. Verify template load resets ownership; change template/backend files only if focused evidence proves a defect.

### Slice checkpoint

- [ ] T027 [US1] Execute the two-populated-section acceptance example, including rapid input, timeout-after-commit, same/different membership conflict, partial unsaved creation, quote switch, RTL/LTR keyboard order, editor/all-items/browser-print parity, and accepted server-PDF helper parity. Coordinator, conflict, retry, membership, offline, keyboard, and output-parity portions were independently approved; quote-switch and other explicitly pending runtime portions remain open.

---

## Phase 4: Slice 2 — Room ordering (User Story 2)

**Goal**: Reorder named rooms only within their current section while reserving direct group `1`.

**Independent Test**: Reverse two rooms in a section with and without direct items; verify groups `2`/`3`, same section membership, save/reopen parity, and unchanged descendants.

### Tests first

- [ ] T028 [US2] Add failing pure/frontend cases for named-room movement, first/last named-room boundaries, `activeRoomObj` preservation, direct-group reservation, room-scope version ownership, and mixed persisted/unsaved room reconciliation.
- [ ] T029 [US2] Add focused manual-save/autosave/draft/reopen cases for partial room creation, already-applied retry, conflict, and quote switch. Add `test/clone-room.test.js` coverage only because the target room-scope queue hook changes; do not broaden clone behavior.

### Implementation

- [x] T030 [US2] Replace named-room earlier/later buttons with a primary drag handle and visible insertion indicator, plus keyboard handle mode with instructions/cancellation, event isolation, focus/live announcement, and RTL/LTR checks. Keep the direct tab fixed and non-reorderable.
- [x] T031 [US2] Reuse the single coordinator for each section's room scope. Serialize immediate/batch room create, room delete, and target room-copy append; preserve `activeRoomObj`, unsaved content, `section_id`, descendant membership, and direct group `1`; issue one complete reorder only when every intended room is persisted.
- [x] T032 [US2] Extend the existing draft metadata/reconciliation to room scopes and active room identity. On unavailable server keep the draft visible but block blind persisted reorder; on conflict preserve surviving edits/unsaved rooms and never auto-recreate an externally deleted persisted room.

### Slice 2 verification and stop gate

- [ ] T033 [US2] Execute room acceptance with/without direct items, boundaries, reopen, partial creation, rapid actions, conflict, timeout/retry, quote switching, pointer/touch, and trusted Enter/Space in RTL/LTR. Verify direct group `1`, rooms `2+`, codes, all-items, browser print, and unchanged totals. Reuse accepted backend/PDF evidence; run no external PostgreSQL or broad PDF/layout battery unless a dependency changed. Coordinator and tested CDP drag-flow portions were approved; physical-pointer drag, outside-drop, pointer-cancel, touch, and template/quote-switch portions remain pending, not failed.
- [ ] T034 Run `node --check` on modified/new JavaScript (including an extracted inline app script), focused affected tests, then `node --test test/*.test.js` once. Report actual pass/fail/skipped counts, browser/PostgreSQL limitations, `git diff --check`, and a cause-scoped diff proving no schema/index/dependency/auth/pricing/autosave-timing/item-control/print-geometry changes. Focused syntax/tests and `git diff --check` passed, but the full suite was not run.
- [x] T035 Stop for independent Slice 2 review; do not begin item controls until blockers are resolved and Slice 3 is explicitly approved. Codex approved Slice 2 with no blocking findings; Slice 3 remains pending.

### Slice 2 closeout

Codex independently approved Slice 2 with no blocking findings. The production coordinator, 409 recovery, frozen-request retries with newer intent, membership coordination, offline draft blocking, keyboard operation, and tested CDP drag flows passed as documented. The focused production regression file reports 8 passed, 0 failed, and 0 skipped; exact output is retained at `/tmp/feature004-slice2-interaction-repair-20261024/verification.txt`. Earlier coordinator/save evidence is retained at `/tmp/codex-feature004-slice2-repair-20261024-final/focused-verification.txt`.

Physical-pointer drag, outside-drop, pointer-cancel, touch, and template/quote-switch tests remain pending; they were not failures. No full test suite or physical touch test is claimed. The current closeout was recorded by OpenCode; uncertain historical executor attribution is intentionally not inferred. No Slice 3 task is approved or complete.

---

## Phase 5: Slice 3 — Item ordering (User Story 3)

**Goal**: Reorder items only within one complete direct/room group, including unsaved items, and preserve output parity.

**Independent Test**: Reorder direct items and items in two different rooms, save/reopen, and prove each group's sequence changes independently with no membership/content/total change.

### Tests first

- [ ] T036 [US3] Add failing pure tests for extracting/splicing one item group into flat `section.items`, unsaved object positions, insertion/deletion, and category-filter rejection in the focused order helper tests.
- [ ] T037 [US3] Add failing item endpoint and editor persistence tests for direct/room scopes, foreign room/section rejection, multiple unsaved object identity, append-then-reorder, partial creation failure/reconciliation, save/reopen, and print/PDF parity.

### Implementation

- [ ] T038 [US3] Add a compact item reorder cell with grab/up/down controls and accessible names to main item rows in `public/app.html`, without altering the ordering-code sizing contract or unrelated table geometry.
- [ ] T039 [US3] Implement complete-group item splicing and category-filter protection in `public/app.html`; never change `section_id`, `room_id`, `category_id`, or `item_code`.
- [ ] T040 [US3] Reuse pending expected/target state, same-scope mutation queue, append-then-reorder creation, conflict reconciliation, identical unknown-outcome retry, focus/live announcement, manual save, autosave, and draft handling for nullable-room item scopes.
- [ ] T041 [US3] Add optional constrained item-row drag behavior in `public/app.html` only after button movement passes; keep up/down controls fully functional and prevent cross-group drops.

---

## Phase 6: Slice 3 accessibility and full acceptance (User Story 4)

**Goal**: Close failure/repeat/input-method acceptance without expanding into unrelated review suites.

**Independent Test**: Complete each move with keyboard and touch-style activation, retain focus/announcement, then inject stale/failure/repeat cases and observe no partial persisted order.

- [ ] T042 [US4] Run keyboard-only and pointer/touch-style checks for section, room, and item controls, disabled boundaries, focus restoration, live announcements, and event isolation in an isolated browser fixture.
- [ ] T043 [US4] Run rapid repeat, pending newer move, stale membership, network failure, quote switch, draft restore, and retry scenarios; prove failed order state is not silently cleared.
- [ ] T044 [US4] Compare editor, all-items view, saved/reopened quote, browser print, and server PDF against all concrete examples in `specs/004-persistent-quote-ordering/quickstart.md`.
- [ ] T045 [US4] Prove names, prices, images, calculations, ownership, stable IDs, parent IDs, catalog codes, and totals remain unchanged with targeted before/after assertions.

---

## Phase 7: Final scoped regression and handoff

**Purpose**: Verify the complete Feature 004 boundary and stop.

- [ ] T046 Run `node --test test/*.test.js` and report exact current pass/fail/skipped counts; do not substitute historical counts.
- [ ] T047 Run all modified JavaScript syntax checks, `git diff --check`, consumer inventory grep, duplicate-control-ID checks, and a cause-scoped diff review.
- [ ] T048 Report SQLite and PostgreSQL runtime evidence separately, explicitly marking unavailable browser/PDF/PostgreSQL checks as not runtime-verified.
- [ ] T049 Confirm the diff contains no schema/index/dependency/auth/pricing/autosave-timing/screen-fit/sizing/typography/print-geometry changes and no unrelated summary/dialog batteries.
- [ ] T050 Stop for advisor assessment with exact files changed, implementation behavior, tests/counts, runtime limitations, diff scope, commit status, and push status; do not commit or push without explicit approval.

## Dependencies and execution order

```text
Advisor decisions + Slice 1 approval
  → Slice 1 kernel/API/tests
  → independent review
  → Slice 2 section controls
  → Slice 2 room controls
  → independent review
  → Slice 3 item controls
  → accessibility/failure/output acceptance
  → canonical scoped regression
  → advisor assessment
```

- US1 and US2 share one pending-order UI mechanism, so they are sequential within Slice 2.
- US3 depends on the reviewed Slice 2 state mechanism and adds nullable-room group handling.
- US4 is final behavioral acceptance after all three entity controls exist.
- No task is marked `[P]` because the active slice intentionally avoids concurrent edits to shared `public/app.html`/route/test surfaces.

## Prepared next implementation boundary

Slice 2 only (T020–T035), in task order. Slice 1 (T004–T019) is accepted and must not be reopened without contradictory current-source evidence. Stop after T035; do not implement T036 or later item-order work.
