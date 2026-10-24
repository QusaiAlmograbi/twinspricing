# Feature Specification: Persistent Quote Ordering

**Feature Directory**: `004-persistent-quote-ordering`

**Working Branch**: `feature/003-quote-summary-layout` (planning only; no branch creation or switch authorized)

**Created**: 2026-10-21

**Finalized**: 2026-10-22

**Status**: Slice 1 independently approved and closed; Slices 2–3 remain pending separate approval

**Input**: Approved persistent section/room/item ordering and position-based display-code rules in `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.11.

## Scope Boundary

Allow users to reorder quote sections, rooms within a section, and items within their existing direct/room group. Persist the resulting order and derive every quote display letter/code from that order. Keep all entity identity, catalog codes, content, calculations, ownership, and unrelated editor behavior unchanged.

This feature does not move a room to another section or an item to another room/section. It does not change table width, field sizing, row-height/typography policy, print geometry, pricing, authorization, delete/copy behavior, or autosave timing.

## User Scenarios & Testing

### User Story 1 - Reorder sections with position-based letters (Priority: P1)

A quote editor can drag a section to a visible insertion point and immediately see section letters and all descendant quote display codes reflect the new position.

**Why this priority**: Section position controls the prefix for every descendant display code, so it establishes the feature's core ordering model.

**Independent Test**: Create two sections containing direct items and rooms, reverse their order, and verify that section labels and all item-code prefixes swap while IDs, content, and totals do not.

**Acceptance Scenarios**:

1. **Given** section Alpha is first (`A`) and section Beta is second (`B`), **When** Alpha moves below Beta, **Then** Beta displays `A`, Alpha displays `B`, and every descendant item uses its section's new prefix.
2. **Given** the reordered quote is saved and reopened, **When** the editor, all-items view, browser print, and server PDF are inspected, **Then** they present the same section order, letters, and descendant codes.
3. **Given** a section-order save fails or is repeated, **When** the quote is reopened, **Then** the server contains either the previously confirmed complete order or the new complete order, never a partial mixture.

---

### User Story 2 - Reorder rooms while preserving direct group 1 (Priority: P1)

A quote editor can move rooms within one section. Direct items remain group `1`, while rooms start at group `2` and their descendant codes follow room order.

**Why this priority**: Room order defines the middle component of every room item's display code and must not destabilize direct-item numbering.

**Independent Test**: In a section with direct items and two rooms, reverse the rooms and verify that direct codes remain `A 1.x`, the moved-first room becomes group `2`, and the moved-second room becomes group `3`.

**Acceptance Scenarios**:

1. **Given** a section has no direct items and two rooms, **When** rooms are rendered, **Then** group `1` remains reserved and the rooms use groups `2` and `3`.
2. **Given** room One is group `2` and room Two is group `3`, **When** room Two moves first, **Then** room Two and its items use group `2`, while room One and its items use group `3`.
3. **Given** a room is reordered, **When** the action completes, **Then** it remains in the same section and none of its names, items, prices, images, or IDs changes.

---

### User Story 3 - Reorder items within their current group (Priority: P1)

A quote editor can reorder direct items or the items in one room, and each item's final display-code sequence follows that group-local order.

**Why this priority**: Persistent item order is the original enhancement requirement and is incomplete unless it works independently inside every valid group.

**Independent Test**: Move the third direct item to first and separately move the second room item to first; verify only the affected group's `.1`, `.2`, `.3` sequence changes.

**Acceptance Scenarios**:

1. **Given** three direct items display `A 1.1` through `A 1.3`, **When** the last moves to the top, **Then** it displays `A 1.1` and the other two follow in their new order.
2. **Given** items exist in direct group `1` and room group `2`, **When** an item is reordered inside group `2`, **Then** direct-item order/codes and group membership remain unchanged.
3. **Given** a category filter hides some siblings, **When** the user wants to reorder, **Then** the interface directs the user to the complete group view instead of producing an ambiguous hidden-sibling move.

---

### User Story 4 - Use accessible, recoverable reorder controls (Priority: P2)

A user can reorder primarily by dragging with mouse or touch, or by entering keyboard handle mode, and can recover clearly from save conflicts or failures.

**Why this priority**: Reordering must be usable across supported input methods and must not silently corrupt persisted state.

**Independent Test**: Drag the same move to an insertion point and repeat through keyboard handle mode, confirm focus remains on the moved entity, then simulate a rejected save and verify the confirmed order remains intact with a visible retry/reload path.

**Acceptance Scenarios**:

1. **Given** an entity is not at a scope boundary, **When** its handle is dragged to an insertion point or activated in keyboard handle mode, **Then** it moves within its allowed scope.
2. **Given** an entity is first or last, **When** controls render, **Then** the impossible direction is disabled and has an understandable accessible name.
3. **Given** a successful move rerenders its navigation or row, **When** the move completes, **Then** keyboard focus follows the same entity and a non-visual status message announces its new position.
4. **Given** a stale sibling list or failed request, **When** the save is rejected, **Then** no partial order is confirmed and the user is told that the latest order must be retried or reloaded.
5. **Given** two requests start from the same sibling set and expected order, **When** one commits first, **Then** the other cannot overwrite it unless its target is already the stored order.

### Edge Cases

- A scope contains zero or one entity; no move is offered beyond disabled boundary controls.
- A section has rooms but no direct items; group `1` is still reserved.
- Direct and room items have duplicate, negative, or gapped legacy positions; all entities remain visible in deterministic order.
- Several unsaved entities have no stable server ID; each remains distinct by local object/token and array position, receives a real ID only on creation, and retains its intended local order and display code.
- An entity is inserted or deleted between order read and order save; stale membership is rejected rather than overwriting the newer set.
- Two reorders contain the same IDs but different order; the stale expected baseline is rejected rather than overwriting the first committed order.
- A retry follows an unknown outcome; it succeeds without another write only when the stored order already equals its target, and conflicts if a newer different order committed.
- A user changes selection while a reorder request is pending; completion applies only to the quote/scope that initiated it.
- A local recovery draft contains a reordered hierarchy that is newer than the server; the existing draft-resolution policy remains authoritative and the pending order is not silently discarded.
- A quote exceeds 26 sections; letters continue as `AA`, `AB`, and so on.

## Requirements

### Functional Requirements

- **FR-001**: Users MUST be able to move sections up and down within a quote.
- **FR-002**: Users MUST be able to move rooms up and down only within their current section.
- **FR-003**: Users MUST be able to move items up and down only within their current direct-item or room group.
- **FR-004**: Section and named-room scopes MUST provide a clear drag handle, visible insertion indicator, and keyboard handle mode usable with mouse, touch, and keyboard; direct-item groups remain fixed in Slice 2.
- **FR-005**: Section display letters MUST be derived from current section position, beginning with `A`.
- **FR-006**: Direct items MUST always use group `1`, and group `1` MUST remain reserved even when empty.
- **FR-007**: Rooms MUST begin at group `2` and use contiguous group numbers in current room order.
- **FR-008**: Item sequence numbers MUST be contiguous within their current direct/room group and follow current item order.
- **FR-009**: Reordering MUST persist across autosave/manual save, refresh, and saved-quote reopen.
- **FR-010**: Editor section navigation, active section/room views, all-items view, browser print, and server PDF MUST agree on resolved order and display codes.
- **FR-011**: Template save/load and current copy flows MUST preserve the source ordering where they carry the affected hierarchy; their existing copy-vs-move semantics MUST remain unchanged.
- **FR-012**: Quote display codes MUST NOT replace stable section, room, or item IDs and MUST NOT overwrite catalog `item_code` values.
- **FR-013**: Reordering MUST preserve names, descriptions, units, quantities, prices, costs, margins, notes, images, category links, calculations, totals, ownership, and permissions.
- **FR-014**: Each persisted reorder MUST be all-or-nothing for one complete sibling scope, validate scope membership, reject duplicates/foreign/missing IDs, and compare the exact previously observed `(id, sort_order)` baseline before writing.
- **FR-015**: A stale or failed reorder MUST NOT leave a partially updated persisted scope or silently clear pending order work.
- **FR-016**: Unsaved entities MUST remain individually distinguishable and reorderable locally without fabricated persistent IDs; save MUST append them to obtain real IDs and then atomically persist the complete intended scope only after all required creations succeed.
- **FR-017**: Legacy duplicate/gapped/negative stored positions MUST resolve by stored position and then stable ID without dropping data; a successful reorder MAY normalize only the affected sibling scope.
- **FR-018**: New entities MUST append to their applicable scope by default; deletions MUST cause displayed numbers to close gaps without requiring unrelated data mutation.
- **FR-019**: Reorder completion MUST preserve active entity selection where possible, restore focus to the moved entity, and announce the result accessibly.
- **FR-020**: Reorder controls MUST not initiate section/room selection, editing, deletion, copy actions, or cross-scope moves.
- **FR-021**: Category-filtered item views MUST not expose a reorder action whose effect on hidden siblings is ambiguous.
- **FR-022**: Existing explicit cross-section room copy and existing item destination/update behavior MUST remain separate from reorder and MUST NOT be converted into move behavior.
- **FR-023**: The feature MUST NOT change autosave timing, general typography, screen-fit width, unified field sizing, row-height policy, print geometry, pricing formulas, authorization, or unrelated API behavior.
- **FR-024**: Stored legacy `sections.code` values MUST remain intact compatibility data while all quote-section display labels become derived and read-only; catalog `item_code` semantics MUST remain unchanged.
- **FR-025**: `GET /api/quotes/:id/calculate` MUST retain its current response semantics and MUST NOT gain `display_code` in this feature.
- **FR-026**: Same-editor mutations in one order scope MUST be serialized; database-side validation/update MUST exclude interleaving writes, and an unknown-outcome retry MUST NOT overwrite a newer different committed order.

### Key Entities

- **Quote section**: A stable section entity whose quote-relative order determines its displayed letter.
- **Room**: A stable entity belonging to one section; its section-relative order determines its display group beginning at `2`.
- **Quote item**: A stable item belonging to one section and either direct group `1` or one room; its sibling order determines the final display-code sequence.
- **Order scope**: The complete current sibling set for one quote's sections, one section's rooms, or one direct/room item group.
- **Quote display code**: A derived label composed of section-position letter, display group number, and group-local item sequence; it is presentation, not identity.
- **Catalog item code**: Stable catalog/snapshot data carried by a quote item and never recalculated by reorder.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In each required acceptance example, 100% of editor, reopened quote, browser-print, and server-PDF order/code observations agree.
- **SC-002**: Moving any section, room, or item one position requires one control activation and never changes an entity outside the authorized sibling scope.
- **SC-003**: After any successful reorder, 100% of affected displayed sequences are contiguous and contain no duplicate display codes.
- **SC-004**: Injected failures at every persisted reorder step leave 0 partially reordered sibling scopes; an identical unknown-outcome retry performs no second write when its target is already stored, while a stale retry after a newer different order returns a conflict.
- **SC-005**: Legacy fixtures with duplicate, gapped, and negative positions retain 100% of their entities and produce the same deterministic order on repeated reads.
- **SC-006**: Reorder operations change 0 unrelated content/calculation/ownership fields and leave quote totals numerically unchanged.
- **SC-007**: The complete reorder flow is operable using pointer, touch activation, and keyboard alone, with focus retained after every successful move.

## Assumptions

- Existing authenticated quote-edit permissions remain authoritative; no new role or permission is introduced.
- The existing hierarchy and stored order values are sufficient; no new schema field or index is assumed.
- Spreadsheet-style section lettering (`A`…`Z`, `AA`, `AB`, …) is approved after `Z`.
- Current quote-section code presentations become read-only derived labels. Stored legacy `sections.code` values remain present and unchanged; new rows receive compatibility values at creation, but those values are not displayed as positional truth.
- The unused calculate endpoint keeps its existing stored `code` response and receives no `display_code` field.
- Dragging is the primary section and named-room interaction. The handle's keyboard mode is the accessible alternative; visible earlier/later button pairs are not required or part of Slice 2.
- Reorder is disabled in a category-filtered item subset until the complete group is visible.
- Display-code formatting uses one space between the section letter and numeric group (`A 1.1`) as shown in the latest approved rules.

## Dependencies

- Existing section, room, and item persistence and access checks.
- Existing manual save, selective autosave, local recovery draft, template clone, browser print, and server PDF flows.
- Independent advisor assessment and separate approval of Slice 1 before runtime work.
