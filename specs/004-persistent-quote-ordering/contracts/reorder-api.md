# Reorder API Contract

All operations reuse existing authentication and access checks. They change order only; they do not change identity, parentage, content, calculations, or authorization.

## Common compare-and-set payload

```json
{
  "expected": [
    { "id": 17, "sort_order": 0 },
    { "id": 21, "sort_order": 4 }
  ],
  "order": [21, 17]
}
```

`expected` is the caller's exact last confirmed persisted baseline for the addressed scope. `order` is the complete target sequence; target positions are its zero-based indexes. Requirements:

- both arrays are required;
- every ID is a positive integer and appears exactly once in each array;
- the two arrays contain the same IDs, and those IDs exactly equal current persisted scope membership when the write is eligible;
- each expected `sort_order` is an integer; duplicates, gaps, and negative legacy values are valid baselines;
- `order` contains only persisted IDs—unsaved objects never receive or submit fabricated database IDs;
- no content or parent field is accepted.

Exact membership is not a concurrency token. The server compares every current `(id, sort_order)` pair with `expected`, so a stale request containing the same IDs but an older order cannot overwrite a newer commit.

## 1. Quote section order

`PUT /api/quotes/:quoteId/sections/reorder`

Scope membership: every section whose `quote_id = :quoteId`.

Authorization: same quote access check as existing section mutations.

## 2. Room order

`PUT /api/sections/:sectionId/rooms/reorder`

Scope membership: every room whose `section_id = :sectionId`.

Authorization: same section access check as existing room mutations.

## 3. Item order within a group

`PUT /api/sections/:sectionId/items/reorder`

Payload adds explicit group identity:

```json
{
  "room_id": null,
  "expected": [
    { "id": 31, "sort_order": 8 },
    { "id": 35, "sort_order": 12 }
  ],
  "order": [35, 31]
}
```

- `room_id: null` addresses direct items.
- A positive `room_id` addresses that room's items.
- A non-null room must belong to `:sectionId`.
- Every expected/current sibling must have the same `section_id` and exact nullable `room_id`.
- The operation never changes `room_id` or `section_id`.

Authorization: same section access check as existing item mutations.

## Compare, apply, and retry algorithm

After authorization, the server excludes concurrent writers for the affected table, reads current scope membership and stored positions, and follows this order inside one transaction:

1. If current membership equals `order` and every current row already has the target zero-based position, return `200` with `already_applied: true` and perform no updates. This is the safe retry path after an unknown outcome.
2. Otherwise, current membership and every current `(id, sort_order)` pair must exactly equal `expected`. If not, return `409` and perform no updates.
3. Update every target ID to its index in `order`, then commit and return `200` with `already_applied: false`.

Success shape:

```json
{
  "ok": true,
  "already_applied": false,
  "positions": [
    { "id": 21, "position": 0 },
    { "id": 17, "position": 1 }
  ]
}
```

A retry is not generally harmless: if another request has since committed a different target, neither step 1 nor step 2 matches and the retry returns `409`. It never rewrites that newer order.

## Database concurrency strategy

No revision column, migration, or index is added.

- **SQLite**: use a new immediate form of the existing transaction helper (`better-sqlite3` transaction `.immediate()`) so the connection obtains the database write reservation before reading the baseline. Another create, delete, update, or reorder cannot interleave between validation and commit.
- **PostgreSQL**: inside the existing client transaction, acquire `LOCK TABLE sections|rooms|items IN SHARE ROW EXCLUSIVE MODE` for the one affected table before reading the baseline. This intentionally coarse, short-lived lock conflicts with concurrent `INSERT`, `UPDATE`, `DELETE`, and another reorder on that table while still allowing reads. It avoids changing every membership writer or adding schema state.

If a create/delete wins the lock first, the reorder sees changed membership and returns `409`. If the reorder wins first, it commits a complete order and the later create appends or the later delete removes its row; displayed positions are then derived from the remaining resolved order. PostgreSQL lock waiting and SQLite's immediate writer reservation may surface existing timeout/busy errors; those are unknown/failed outcomes and are not converted into blind retries with a new baseline.

Within the checked-in editor, reorder, create, and delete operations for the same scope are additionally serialized through one scope queue. Different scopes may continue through existing save coordination. This client rule reduces avoidable conflicts; the database contract remains authoritative for other sessions.

## Response and rejection behavior

| Status | Meaning | Required effect |
|---|---|---|
| `200` | Applied, or target already stored | Entire scope has target positions; `already_applied` distinguishes the paths. |
| `400` | Malformed arrays/IDs/positions, duplicates, mismatched arrays, invalid room value | No row changes. |
| `403` | Existing access check fails | No row changes. |
| `404` | Addressed quote/section/room does not exist in scope | No row changes. |
| `409` | Membership or exact stored baseline differs and target is not already stored | No row changes; client must fetch/reconcile before offering retry. |
| `500` | Transaction/database failure | Transaction rolls back; no partial sibling order. |

Errors retain the existing JSON error convention; a conflict may add the stable machine code without changing the human-readable field:

```json
{ "error": "ترتيب القائمة تغيّر، يرجى إعادة التحميل", "code": "ORDER_CONFLICT" }
```

## Creation and unsaved-entity contract

- Local order includes all live objects in the exact scope: quote sections, one section's named rooms, direct items, or one room's items.
- Live unsaved objects are distinguished by object identity/client-only token and array position. Draft serialization preserves them as separate array entries. Such tokens are never submitted as persistent IDs.
- The checked-in editor's standard section/room/item create and batch-create calls omit `sort_order`, so the existing server default appends them in submitted local sequence; responses add each new real `id` plus its server-assigned `sort_order`. The editor does not ask ordinary create routes to insert into the middle. Existing external explicit-position request semantics are not expanded or used by this feature.
- If every required creation in a scope succeeds, the editor builds a fresh `expected` baseline using the returned append positions and sends one complete reorder whose `order` follows the local objects.
- If any creation fails, the editor sends no incomplete reorder for that scope. Successfully created rows remain appended, all returned IDs/positions are retained, the local intended order remains dirty, and retry begins by reconciling the persisted scope. This preserves multiple unsaved items without gaps reserved for nonexistent IDs.

Copy/template routes retain their separate copy semantics and preserved relative order; they are not reorder operations.

## Writer ownership and compatibility

- Slice 1 transfers mutation of existing rows' `sort_order` to the scope reorder endpoints. In the same slice, every checked-in autosave, manual-save, modal, overlay, bulk, and cleanup PUT writer stops sending `sort_order`, and ordinary section/room/item PUT SQL stops updating it. Content updates and response shapes remain functional.
- Checked-in creation paths omit insertion positions, rely on the server's existing default append assignment, and consume the additive returned `sort_order`. Existing copy/template paths may continue to preserve copied relative positions because they create a new hierarchy and are not ordinary reorder writers.
- Stored legacy `sections.code` and catalog `item_code` values remain stored and returned. Existing values are never backfilled or rewritten for position. A new section receives its read-only derived current/next label once as the required compatibility `code`; later reorder does not change it. Display consumers always derive labels/codes instead.
- `GET /api/quotes/:id/calculate` is unchanged: its current stored `code` field keeps the same meaning, and Feature 004 adds no `display_code`.

## Client completion ownership

- A client associates each request with quote/scope identity and a local monotonically increasing scope version.
- A completion may confirm UI only if the same quote, live hierarchy, scope identity, and version still own it.
- A newer local move is never overwritten by an older completion.
- A definite `409` triggers a fresh scoped read/reconciliation; it must not restore an entity that another operation deleted.
- A transport timeout is an unknown outcome. Keep the scope pending and retry the identical `{ expected, order }` request. Confirm only on `200`; on `409`, fetch/reconcile. Never manufacture a new expected baseline merely to force the old target through.
