# Research: Persistent Quote Ordering

All source findings were re-established at HEAD `e3ba0ad6d1203eb2dabbd61be2b4aaee13501489` and reconfirmed on 2026-10-22. They are **source-proven** and **not runtime-verified** unless explicitly stated otherwise. No application data or localhost service was inspected.

## Decision 1: Reuse existing order columns; do not migrate schema

**Decision**: Keep `sections.sort_order`, `rooms.sort_order`, and `items.sort_order` as the persisted order fields for SQLite and PostgreSQL. Do not add a column, constraint, index, or data migration.

**Rationale**: Both database definitions already provide non-null integer `sort_order` columns (`db.js:328-350`, `db.js:562-584`, `db.js:383-388`, `db.js:610-615`). Creation and update routes already read/write these fields, and quote/PDF readers already order by them.

**Alternatives considered**:

- New position fields: rejected as duplicate state with no demonstrated need.
- Persist derived display codes: rejected because position is the source of truth and display codes are not identity.
- Immediate legacy normalization migration: rejected because deterministic reads can preserve all data without mutating deployed records.

## Decision 2: Make legacy reads deterministic with `(sort_order, id)`

**Decision**: Every hierarchy reader involved in this feature orders siblings by `sort_order ASC, id ASC`. Existing gaps, duplicates, and negative values remain valid input. Only a successful explicit reorder normalizes that one sibling scope to contiguous positions.

**Rationale**: Current readers use only `ORDER BY sort_order ASC` in quote load, section/room/item list routes, calculations, and PDF (`routes/quotes.js`, `routes/sections.js`, `routes/rooms.js`, `routes/items.js`, `routes/pdf.js`). SQL does not guarantee tie order without a second key. Stable IDs already exist and allow deterministic resolution without loss or invention.

**Alternatives considered**:

- Array arrival order: rejected because tied database rows have no guaranteed order.
- Name or catalog code as tie-breaker: rejected because those are editable/non-identity values.
- Normalize every quote on read: rejected because a read should not mutate deployed data.

## Decision 3: Use derived display labels/codes from the ordered hierarchy

**Decision**: Introduce one pure ordering/display helper shared by the browser and server PDF. It derives section labels from section array position and item codes from section position, direct group `1`, room position plus `2`, and item position within its group.

**Rationale**: The current helper is duplicated in `public/app.html:5068-5099` and `routes/pdf.js:425-456`. It uses stored `sec.code`, gives a no-room section codes `A 1.1`, `A 2.1`, … instead of one direct group, and keys its object by `item.id`, so multiple unsaved items with no ID collide at key `undefined`. A shared pure helper gives testable parity and supports object identity for unsaved items.

**Alternatives considered**:

- Continue duplicate helpers: rejected because screen/PDF drift is a stated risk already documented in source comments.
- Rewrite stored `sections.code` and `items.item_code` on reorder: rejected because it conflates display with stable legacy/catalog snapshot data.
- Use DOM row indexes: rejected because filters and the all-items overlay render different subsets.

## Decision 4: Add atomic reorder endpoints per sibling scope

**Decision**: Add three authenticated, scope-specific reorder operations: quote sections, section rooms, and a section's direct/room item group. Each accepts the complete target ID order plus the caller's exact last-confirmed `(id, sort_order)` baseline. It validates membership and uniqueness, compares the baseline, and updates positions inside one transaction.

**Rationale**: Existing PUT routes update one row at a time (`routes/sections.js:342-354`, `routes/rooms.js:118-130`, `routes/items.js:180-250`). A reorder changes multiple sibling rows; using those requests can leave a partial order after timeout/failure. `db.js:1298-1317` already provides engine-specific transactions.

**Alternatives considered**:

- Sequential existing PUT calls: rejected because not atomic.
- One whole-quote replacement endpoint: rejected as unnecessarily broad and higher conflict risk.
- A schema uniqueness constraint: rejected because no schema change is needed and cross-group item positions may legitimately overlap.

## Decision 5: Create unsaved siblings first, then reorder the complete persisted scope

**Decision**: The UI keeps all live objects in local array order and distinguishes unsaved objects by object identity/client-only token, never by fabricated database ID. On save, ordinary create/batch-create appends unsaved siblings in local sequence and returns real IDs plus assigned positions. Only after all required creations in that scope succeed does the client submit one complete persisted target. A partial creation result sends no reorder, retains successful IDs/positions, and remains pending for reconciliation/retry.

**Rationale**: New empty item rows cannot be inserted until they contain data (`routes/items.js:43-51`), and the atomic reorder contract cannot safely name a row that does not exist. Append-then-reorder preserves every local object, avoids placeholder rows and reserved persistent gaps, and gives retries an exact server-confirmed baseline.

**Alternatives considered**:

- Create empty placeholder rows: rejected because it changes current validation and cleanup behavior.
- Client-generated stable IDs: rejected because no new identity system is justified.
- Reserve numeric gaps for missing IDs: rejected because a gap is not identity and cannot make a partial persisted scope atomic.
- Let partial membership overwrite the server blindly: rejected because concurrent insert/delete could be lost.

## Decision 6: Treat reorder saves as a dedicated state, not ordinary field edits

**Decision**: Track pending order scopes separately from ordinary dirty section/room/item fields. A reorder uses its atomic endpoint and does not rely on normal per-entity PUTs to persist positions. Manual save and autosave must preserve/retry pending order work without changing existing debounce timing.

**Rationale**: Selective autosave builds work from entity dirty sets (`public/app.html:4073-4355`) and sends `sort_order` in ordinary entity payloads (`public/app.html:4654-4785`). Manual save similarly PUTs every existing section/room/item (`public/app.html:9086-9375`). Reusing those paths after a failed reorder could partially persist the local positions the atomic request rejected.

**Alternatives considered**:

- Mark every sibling dirty: rejected because ordinary writes are non-atomic.
- Bypass save/draft state entirely: rejected because navigation and local recovery must know work remains.
- Change autosave timing: rejected by approved scope.

The ownership transfer is a Slice 1 boundary, not deferred UI work: all checked-in ordinary PUT writers stop sending `sort_order`, and the three ordinary server PUT statements stop updating it in the same slice. Standard checked-in create calls use server append assignment and consume the returned position. A conflict causes scoped read/reconciliation; a network timeout keeps the exact expected/target request pending. It must never fall through to per-row order writes or manufacture a fresh baseline to force an old target.

## Decision 7: Preserve local selection/focus by object identity

**Decision**: Reorder arrays in place, carry active section/room by the existing object references, and restore focus using a stable persisted ID or live object token after rerender. Announce moves through one `aria-live` status element. Disable impossible directions.

**Rationale**: The editor already protects active room selection with `activeRoomObj` (`public/app.html:3974-4001`) and async actions use quote/array/object ownership guards. Index-only focus or selection would point at the entity that moved into the old slot.

**Alternatives considered**:

- Keep focus by old index: rejected because the old index identifies a different sibling after a move.
- Make drag the only interaction: rejected by the approved accessible-input rule.

## Decision 8: Restrict item reorder to a complete visible group

**Decision**: Item controls operate in the main view only when the category tab is “all,” or in an equivalent complete-group presentation. Reorder is not offered against a category-filtered subset.

**Rationale**: `renderMainPanel()` filters by room and then category (`public/app.html:5470-5595`). Moving within a partial category view can cross hidden siblings without visible feedback. The approved behavior is group-relative, not category-relative.

**Alternatives considered**:

- Reorder only visible category members: rejected because it creates a second ordering scope not approved by product.
- Move across hidden siblings and hope rerender explains it: rejected as ambiguous.

## Decision 9: Preserve separate copy and destination behavior

**Decision**: Reorder endpoints reject foreign-scope IDs and never change `section_id` or `room_id`. Existing cross-section room clone (`POST /api/quotes/:quoteId/rooms/:roomId/clone`) remains copy behavior. Existing item POST/PUT `room_id` support remains separate and is not exposed as reorder.

**Rationale**: `routes/sections.js:137-247` clones rooms and descendants into a different section. `routes/items.js:22-249` accepts `room_id` during create/update. The current quote UI creates items into a selected destination but has no existing-item move control. Product explicitly withholds implicit cross-scope moves.

**Alternatives considered**:

- Add drag across room/section containers: rejected as unapproved scope expansion.
- Harden all existing `room_id` mutation behavior in this feature: deferred because it changes a separate API contract and authorization/data-validation surface.

## Decision 10: Use spreadsheet-style labels after `Z`

**Decision**: Plan and tests use `A`…`Z`, `AA`, `AB`, … with no artificial 26-section limit. This is advisor-approved.

**Rationale**: The approved rule requires letters and explicitly calls out beyond-`Z` policy. Spreadsheet continuation is deterministic, familiar, and retains the letter-based format.

**Alternatives considered**:

- Numeric labels after `Z`: rejected as a format discontinuity.
- Reject a 27th section: rejected because no quote-size limit is approved.
- Continue Unicode characters: rejected because it produces surprising/non-Latin symbols.

## Decision 11: Use expected-baseline compare-and-set plus short database writer exclusion

**Decision**: Exact membership is supplemented by the full expected `(id, sort_order)` state. The transaction first recognizes an already-stored target, otherwise applies only from the exact expected state. SQLite begins an immediate transaction; PostgreSQL takes a short `SHARE ROW EXCLUSIVE` table lock on the affected hierarchy table before validation. The checked-in editor serializes create/delete/reorder work within the same scope.

**Rationale**: Two stale requests can contain the same IDs in different orders, so membership alone cannot detect the loser. The existing schema has no reliable scope revision, and adding one is unnecessary. SQLite's immediate writer reservation and PostgreSQL's DML-conflicting table lock prevent membership/position writes from interleaving between read and update without modifying every create/delete route. The coarse PostgreSQL lock is deliberately limited to a short reorder transaction.

**Alternatives considered**:

- Exact membership only: rejected because it permits lost updates when the same IDs are reordered concurrently.
- Treat every retry as harmless: rejected because an old retry can overwrite a newer different order.
- Add revision columns/triggers: rejected because the existing data plus transactional exclusion is sufficient and no migration is justified.
- Coordinate only with in-process mutexes: rejected because PostgreSQL may be served by more than one process.

## Decision 12: Resolve section-code and calculate-endpoint policy without changing stored semantics

**Decision**: Every quote-section label in the editor and print paths is derived and read-only. Existing `sections.code` values remain stored/returned and are neither backfilled nor rewritten on reorder. Catalog `item_code` remains untouched. `GET /api/quotes/:id/calculate` keeps its existing stored `code` response and receives no `display_code` because the checked-in source has no consumer requiring it.

**Rationale**: Display position and stored compatibility/catalog data serve different purposes. The calculate endpoint has no checked-in caller, so expanding it would be an unproven API change.

## Current flow and consumer inventory

| Area | Source-proven behavior | Feature consequence |
|---|---|---|
| Quote reopen | `GET /api/quotes/:id` orders sections, rooms, direct items, and room items by `sort_order`; frontend flattens room items into `section.items` (`routes/quotes.js:45-114`, `public/app.html:9445-9493`). | Add ID tie-breakers and retain the flattened in-memory model. |
| Section/room/item writers | Single and batch POST paths calculate `MAX(sort_order)+1` (or a batch base); ordinary PUTs update `sort_order`; delete/clone paths also change membership (`routes/sections.js`, `routes/rooms.js`, `routes/items.js`). | Slice 1 must hand existing-row order ownership to the atomic endpoints across server SQL and every autosave/manual/modal/overlay/bulk writer. Creates return server-assigned append positions; delete/create/reorder are serialized per scope in the editor. |
| Manual save | Saves quote, then sections, rooms, then items in waves; individual existing writes can partly fail (`public/app.html:9013-9418`). | Flush pending atomic reorder scopes distinctly and retain them on failure. |
| Autosave | Five-second controller, selective dirty plan, retry/timeouts, shared lock (`public/app.html:4450-4840`). | Preserve timing/lock; add order-scope dirty/retry semantics without blanket clears. |
| Draft | Serializes `state`, `sections`, quote ID, and active section index; restore marks hierarchy dirty (`public/app.html:4369-4445`, `public/app.html:10920-11040`). | Array order and assigned positions already fit the draft; add pending order-scope reconstruction or deterministic normalization after restore. |
| Template save/clone | Template JSON includes section/item/room arrays and stored positions; clone recreates IDs and room references (`public/app.html:7731-7792`, `routes/templates.js:21-141`). | Preserve array order and explicit positions; add deterministic read/clone ordering and do not derive identity from stored codes. |
| Room/direct copy | Room clone retains item positions; direct clone creates a new appended section and retains direct item positions (`routes/sections.js:137-340`). | Copy remains append + copied relative order; displayed prefixes/groups derive after insertion. |
| Editor | Section tabs and room tabs follow array order; item rows follow filtered `section.items`; display helper uses stored `sec.code` (`public/app.html:5045-5099`, `public/app.html:5470-5655`). | Add compact controls and shared positional labels; preserve active selection by object. |
| All-items view | Regroups flat items as direct then rooms in room-array order (`public/app.html:6611-6715`). | Use the same shared display helper; controls must not authorize cross-group moves. |
| Browser print | Iterates section arrays, direct items, then room arrays and uses the frontend display map (`public/app.html:9858-10010`). | Use shared positional labels/codes and ordered arrays. |
| Server PDF | Reads database hierarchy by `sort_order`, has a duplicate display helper, and iterates direct then rooms (`routes/pdf.js:86-136`, `routes/pdf.js:425-489`). | Add deterministic tie-breaks and shared helper use. |
| Totals/summary | Section totals iterate current arrays and show stored `sec.code` (`public/app.html:7080-7185`). | Change labels only; formulas and numeric inputs remain untouched. |
| Calculation API | Returns stored `code` in section subtotals and is not referenced by the checked-in frontend (`routes/quotes.js:318-398`). | Preserve the endpoint and stored `code` semantics exactly; do not add `display_code`. |

## Runtime status

- Git/working-tree inspection is runtime-proven for this planning session.
- Source behavior above is source-proven.
- Browser input/focus/drag behavior is not runtime-verified.
- SQLite reorder persistence is not runtime-verified because no runtime code was changed in this documentation task.
- PostgreSQL/Neon behavior is not runtime-verified; no PostgreSQL instance was accessed.

## Additional source-proven output gaps within scope

- `routes/pdf.js` attaches room items to `room.items`, but its display-code helper and render loop later filter `sec.items`, which contains only direct items in this route. Room items therefore have no derived display-map entry and the server-PDF room loop can render no room rows. Feature 004 must consume `room.items` in the shared normalized hierarchy; this is directly required for editor/PDF order-code agreement.
- Browser and server print subtotal lookups use stored section code equality. Duplicate/custom legacy codes can select the wrong first match. Feature 004 should carry subtotal with the section object/stable ID instead of using the display/stored code as identity; calculation formulas remain unchanged.
- The section edit and direct-copy forms expose editable `secModalCode`/`copyDirectSecCode`. The approved treatment is a read-only derived label while the stored legacy column remains compatibility data; no reorder backfill/update is allowed.
