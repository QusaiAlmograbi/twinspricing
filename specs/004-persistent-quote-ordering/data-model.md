# Data Model: Persistent Quote Ordering

No schema change is planned. This document defines how existing fields are interpreted and validated by Feature 004.

## Existing entities and fields

### Quote section (`sections`)

| Field | Feature meaning |
|---|---|
| `id` | Stable identity; never changes during reorder. |
| `quote_id` | Immutable reorder scope parent. |
| `code` | Preserved legacy/stored value. It is not the authoritative displayed position letter. |
| `name` | Preserved content. |
| `sort_order` | Persisted position within the quote. |
| `has_rooms` | Existing editor mode flag; reorder does not change it. |

### Room (`rooms`)

| Field | Feature meaning |
|---|---|
| `id` | Stable identity; never changes during reorder. |
| `section_id` | Immutable reorder scope parent. Reorder cannot move a room across sections. |
| `name` | Preserved content. |
| `sort_order` | Persisted position within its section. |

### Quote item (`items`)

| Field | Feature meaning |
|---|---|
| `id` | Stable identity; never changes during reorder. |
| `section_id` | Existing parent identity; reorder cannot change it. |
| `room_id` | Existing group membership. `NULL` means direct group `1`; a room ID means that room's group. Reorder cannot change it. |
| `item_code` | Preserved catalog/snapshot value; never rewritten as a quote display code. |
| `sort_order` | Persisted position within the item's current direct/room sibling scope. |
| All other item fields | Preserved unchanged by reorder. |

## Derived value model

### Section position label

- Input: zero-based resolved section index.
- Output: uppercase spreadsheet-style label: `0 → A`, `25 → Z`, `26 → AA`, `27 → AB`.
- Source of truth: current resolved section order, not `sections.code`.

### Display group

- Direct items: always `1`.
- Room at resolved zero-based room index `r`: `r + 2`.
- Group `1` remains reserved when direct-item count is zero.

### Item sequence

- One-based index within the resolved direct-item or room item scope.
- Deletion closes visible gaps automatically because the value is derived.

### Quote display code

`<section label> <group>.<item sequence>`

Examples: `A 1.1`, `A 2.1`, `B 3.4`, `AA 1.2`.

## Scope resolution and invariants

| Scope | Membership predicate | Deterministic persisted order | Successful reorder normalization |
|---|---|---|---|
| Sections | same `quote_id` | `sort_order ASC, id ASC` | Complete persisted target normalized to `0..n-1`. |
| Rooms | same `section_id` | `sort_order ASC, id ASC` | Complete persisted target normalized to `0..n-1` within the section. |
| Direct items | same `section_id`, `room_id IS NULL` | `sort_order ASC, id ASC` | Complete persisted target normalized to `0..n-1` within direct group `1`. |
| Room items | same `section_id`, same `room_id` | `sort_order ASC, id ASC` | Complete persisted target normalized to `0..n-1` within that room only. |

Invariants:

1. Reorder never changes parent IDs or stable entity IDs.
2. Each target persisted ID appears exactly once, and expected/target ID sets are equal.
3. The expected baseline contains each persisted sibling's exact last-confirmed `(id, sort_order)` pair; duplicate/gapped/negative legacy positions are valid expected values.
4. The target array is complete and its indexes become unique contiguous non-negative positions.
5. The server applies only when current state exactly equals the expected baseline, or returns success without writing when current state already equals the target.
6. One transaction updates every submitted sibling or none, with concurrent writers excluded between validation and commit.
7. An unknown-outcome retry cannot overwrite a newer different committed order.
8. Legacy duplicate/gapped/negative values remain readable and deterministic before explicit reorder.

## Client-only pending order state

Feature 004 adds runtime bookkeeping, not persisted schema:

- Scope identity: quote sections; section rooms; or section plus nullable room for items.
- Ordered live objects: includes persisted and unsaved entities.
- Last confirmed persisted `(id, sort_order)` baseline: compare-and-set input; it is refreshed after creation, deletion, successful reorder, or conflict reconciliation.
- Pending flag/version: remains set until the matching atomic request succeeds; newer local moves supersede older completions.
- Focus target: persisted ID where available, otherwise live object identity/client-only token. The token never becomes a database ID.

The existing local draft already serializes hierarchy arrays and `sort_order`; draft restore reconstructs pending scopes by comparing local array/position state with the server or marks the restored hierarchy for an order flush under the existing stale-draft decision.

### Exact local scopes and creation positions

- **Sections**: order is the complete `sections` array for one quote. A new section initially appends to that array.
- **Rooms**: order is the complete `sec.rooms` array for one section. The direct-items tab is not a room member and never moves. A new named room initially appends to `sec.rooms`.
- **Direct items**: order is the subsequence of `sec.items` whose `room_id` is null/empty. A new direct item initially appends to that subsequence.
- **Room items**: order is the subsequence of `sec.items` whose `room_id` equals the exact persisted room ID or that unsaved room's client-only temporary reference. A new room item initially appends to that subsequence.
- Reordering one item group changes only the relative order of that subsequence; it does not change any member's `room_id`, the relative order of another group, or the containing section/room order.
- Multiple unsaved items remain separate array objects even though none has an `id`. Unsaved-room temporary references are client-only linkage values, not database IDs, and never appear in reorder payloads.

Slice 1 performs the writer-ownership handoff atomically: every checked-in ordinary PUT stops sending `sort_order`, and ordinary section/room/item PUT SQL stops changing it while keeping content-update response shapes. Checked-in standard create/batch-create calls omit insertion positions so the existing server default appends in submitted local sequence, and responses return the assigned `sort_order`. Existing copy/template routes keep their separate relative-order copy behavior.

## State transitions

```text
confirmed order
  → local move
  → pending order (render derived codes immediately)
  → atomic save accepted
  → confirmed order

pending order
  → newer local move
  → older completion ignored by scope/version ownership
  → latest order remains pending until accepted

pending order
  → definite validation/conflict rejection
  → read/reconcile authoritative membership and baseline
  → retain unsaved entity data and show retry/reload feedback

pending order
  → timeout/unknown result
  → keep pending
  → retry identical expected/target payload
  → confirm on applied/already-applied success, or read/reconcile on conflict
```

For an entirely unsaved parent scope, local order remains the array order until parent/children receive server IDs through existing creation flows. For any mixed scope, save creates unsaved siblings in local sequence at server-assigned append positions. Only after all required creations succeed does it reorder the complete now-persisted scope. A partial creation result keeps successful IDs/assigned positions, sends no incomplete reorder, and remains dirty for reconciliation/retry.

Same-editor reorder/create/delete work is serialized per exact scope. PostgreSQL reorder transactions take a short `SHARE ROW EXCLUSIVE` lock on the affected hierarchy table; SQLite reorder transactions begin immediate. This prevents membership or position writes from interleaving with validation/update without adding revision columns.

## Legacy and deletion behavior

- Read never drops rows because positions collide.
- A successful reorder of one scope does not normalize any other scope.
- Deleting an entity need not rewrite surviving positions; displayed numbering derives from resolved order.
- Adding an entity appends by default through the existing `MAX(sort_order)+1` behavior. The item route's section-wide maximum still appends after every member of the chosen group, so no group-local schema/query change is required.
- Stored legacy `sections.code` and item `item_code` values remain intact. The section/direct-copy forms show a read-only derived current/next label. Because the existing section create API requires a non-empty `code`, a new section receives that derived label once as compatibility data at creation; later reorder never rewrites it, and no display consumer treats it as authoritative.
