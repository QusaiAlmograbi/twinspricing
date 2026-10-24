# Validation Quickstart: Persistent Quote Ordering

This remains the reproducible validation guide. Slice 2 was independently approved by Codex with no blocking findings; this document does not claim that pending physical-pointer, outside-drop, pointer-cancel, touch, or template/quote-switch gates were executed.

## Safety prerequisites

- Confirm the approved Feature 004 slice and actual branch/HEAD before any runtime edit.
- Do not use localhost:3000, `data/interior_pricing.db`, production/Neon, or any shared development database.
- Use a unique temporary SQLite path. Use PostgreSQL only when a dedicated disposable Feature 004 URL/database/schema is explicitly supplied.
- Preserve `specs/001-prevent-duplicate-mutations/`, unrelated changes, and other worktrees.

## Mechanical checks

```bash
node --check public/quote-ordering.js
node --check routes/sections.js
node --check routes/rooms.js
node --check routes/items.js
node --check routes/quotes.js
node --check routes/pdf.js
git diff --check
```

For `public/app.html`, extract only its inline application script to a temporary file and run `node --check` there; do not rewrite the HTML merely for syntax checking.

## Focused tests

```bash
node --test test/quote-ordering.test.js test/reorder.test.js test/auto-save.test.js test/save-batch.test.js test/batch-items.test.js test/pdf-ordering.test.js
```

This Slice 1 set is narrow but includes the existing save suites directly affected by the writer-ownership handoff. Add draft/template/clone suites only when the active slice changes those paths or a focused regression proves a gap. At the final Slice 3 gate:

```bash
node --test test/*.test.js
```

Record exact pass/fail/skipped counts from the current run.

## Disposable SQLite scenario

1. Create a unique temporary directory and set `DATABASE_PATH` to a file inside it before loading the application modules.
2. Seed one approved user and one quote with:
   - Section Alpha first and Section Beta second.
   - Each section containing direct items and two rooms.
   - At least two items in each direct/room group.
   - One legacy scope with duplicate/gapped/negative positions.
3. Exercise the three expected-baseline/target reorder contracts from [contracts/reorder-api.md](contracts/reorder-api.md).
4. Reopen through `GET /api/quotes/:id` and verify the examples below.
5. Inject a failure after at least one row update inside each reorder transaction and prove complete rollback.
6. Run overlapping same-baseline reorders and create/delete-versus-reorder cases; prove the SQLite immediate transaction prevents interleaving and that the losing stale request does not overwrite the winner.
6. Remove only the exact temporary directory after the server/database handles are closed.

## Disposable PostgreSQL scenario

Run the same contract suite with a dedicated disposable `DATABASE_URL`, including proof that the short `SHARE ROW EXCLUSIVE` hierarchy-table lock blocks concurrent DML until commit. Do not run against production or a shared database. The harness must own cleanup of its unique database/schema and seeded rows. If no safe URL is available, report PostgreSQL as **not runtime-verified** rather than skipping silently or claiming parity.

## Required acceptance examples

### 1. Reorder two populated sections

Before:

- Alpha: `A`; direct `A 1.1`; first room `A 2.1`.
- Beta: `B`; direct `B 1.1`; first room `B 2.1`.

Move Beta above Alpha. Expected:

- Beta becomes `A`; its descendants use `A` prefixes.
- Alpha becomes `B`; its descendants use `B` prefixes.
- IDs, names, prices, images, category links, ownership, and totals are unchanged.

### 2. Reorder rooms with direct group reserved

In section `A`, direct items remain `A 1.1`, `A 1.2`. Reverse two rooms:

- Former second room becomes group `2`.
- Former first room becomes group `3`.
- With no direct items, first room is still group `2`, never group `1`.

### 3. Reorder items within each group

- Move direct item 3 to first: it becomes `A 1.1`; other direct items follow.
- Move room item 2 to first: it becomes `A 2.1`; direct and other-room sequences do not change.
- Attempt foreign room/section IDs through the API: request is rejected and no row changes.

### 4. Save/reopen and output parity

After all moves:

- manual save, autosave, and saved-quote reopen resolve identical arrays/codes;
- all-items view matches the main editor;
- browser print table matches the editor;
- server PDF order and text codes match;
- template save/load and existing copy flows retain relative order where they copy the hierarchy.

### 5. Failure and repeat safety

- Retry the same payload after its target committed: receive already-applied success with no second write.
- Start two requests from the same `(id, sort_order)` baseline but with different targets: only one applies; the other receives `409` even though the ID set is unchanged.
- Omit a current sibling or include a deleted/foreign ID: receive conflict/rejection and no row changes.
- Fail mid-transaction: old complete order remains.
- Race creation/deletion with reorder: whichever wins is observed by the second transaction; no validation/update interleaving or partial order occurs.
- Simulate timeout after commit: keep the scope pending and retry the identical expected/target payload; accept already-applied success or fetch after `409`, and prove ordinary entity PUTs never rewrite positions.
- Move again while an earlier request is pending: earlier completion cannot overwrite the newer local move.
- Place multiple unsaved items between persisted siblings, then save: creates append in local sequence, return real IDs/positions, and one complete reorder persists the intended group order.
- Fail one unsaved creation: send no incomplete reorder, retain successful returned IDs/append positions and all local objects, then reconcile/retry without fabricated IDs.

## Narrow browser checks

- Drag section and named-room handles to visible insertion points with mouse or touch.
- Use Enter/Space to enter or cancel keyboard handle mode, ArrowUp/ArrowDown to move, and Escape to cancel; verify focus and announcements after rerender.
- Verify clicking a reorder control does not select, edit, copy, or delete the entity.
- Verify active section/room remains the same object after moving.
- Verify focus follows the moved control and the live region announces the new position.
- Verify category-filtered item views do not allow ambiguous subset reorder.
- Verify rapid repeated activation and quote switching do not apply stale completions.
- Inspect browser print only for order/code parity; leave geometry outside this feature.
- With the focused server-PDF fixture, assert two direct rows and every nested room row appear exactly once in expected order, totals are unchanged, and all rows use the existing row renderer's coordinate/sizing inputs. Do not run a broader print-geometry review.

## Closeout evidence

Report separately:

- runtime-proven SQLite results and counts;
- runtime-proven PostgreSQL results and counts, or explicit unavailability;
- runtime-proven browser/print/PDF checks and limitations;
- source-proven unchanged fields/formulas/auth/save timing;
- exact files changed, diff scope, commit status, and push status.

Slice 2 closeout evidence:

- Focused production coordinator/save regression: **8 passed, 0 failed, 0 skipped**, `/tmp/feature004-slice2-interaction-repair-20261024/verification.txt`.
- Earlier focused save/retry and coordinator evidence: `/tmp/codex-feature004-slice2-repair-20261024-final/focused-verification.txt`.
- Tested CDP drag-flow evidence: `/tmp/codex-feature004-slice2-review-20261024/browser-reorder-runtime.txt` and `/tmp/codex-feature004-slice2-review-20261024/browser-room-delayed-response.txt`.
- Physical-pointer drag, outside-drop, pointer-cancel, touch, and template/quote-switch gates remain pending; these are not recorded as failures. No full suite or physical touch test is claimed.
