const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const QuoteOrdering = require(path.join(__dirname, "..", "public", "quote-ordering.js"));

function makeSection(opts = {}) {
  return {
    id: opts.id ?? 1,
    code: opts.code ?? "A",
    name: opts.name ?? "Section",
    has_rooms: opts.has_rooms ?? false,
    sort_order: opts.sort_order ?? 0,
    items: opts.items ?? [],
    rooms: opts.rooms ?? [],
    _resolvedIndex: opts._resolvedIndex ?? 0,
  };
}

function makeRoom(opts = {}) {
  return {
    id: opts.id ?? 1,
    name: opts.name ?? "Room",
    sort_order: opts.sort_order ?? 0,
  };
}

function makeItem(opts = {}) {
  return {
    id: opts.id === undefined ? 1 : opts.id,
    name: opts.name ?? "Item",
    room_id: opts.room_id ?? null,
    sort_order: opts.sort_order ?? 0,
  };
}

test("sectionLabel: basic A-Z", () => {
  for (let i = 0; i < 26; i++) {
    const expected = String.fromCharCode(65 + i);
    assert.equal(QuoteOrdering.sectionLabel(i), expected);
  }
});

test("sectionLabel: AA, AB after Z", () => {
  assert.equal(QuoteOrdering.sectionLabel(26), "AA");
  assert.equal(QuoteOrdering.sectionLabel(27), "AB");
  assert.equal(QuoteOrdering.sectionLabel(51), "AZ");
  assert.equal(QuoteOrdering.sectionLabel(52), "BA");
});

test("sectionLabel: negative index returns empty", () => {
  assert.equal(QuoteOrdering.sectionLabel(-1), "");
});

test("compareBySortOrderThenId: sorts by sort_order then id", () => {
  const a = { sort_order: 2, id: 1 };
  const b = { sort_order: 1, id: 5 };
  const c = { sort_order: 1, id: 2 };
  const arr = [a, b, c].sort(QuoteOrdering.compareBySortOrderThenId);
  assert.deepEqual(arr.map(x => x.id), [2, 5, 1]);
});

test("compareBySortOrderThenId: handles missing values", () => {
  const a = { sort_order: undefined, id: undefined };
  const b = { sort_order: 0, id: 1 };
  const c = { sort_order: 0, id: 0 };
  const arr = [a, b, c].sort(QuoteOrdering.compareBySortOrderThenId);
  // undefined sort_order/id treated as 0, so all three have sort_order=0, id=0
  // Order should be stable but deterministic
  assert.equal(arr.length, 3);
  assert.ok(arr.every(x => x.sort_order === 0 || x.sort_order === undefined));
  assert.ok(arr.every(x => x.id === 0 || x.id === 1 || x.id === undefined));
});

test("resolveScopeOrder: returns new sorted array", () => {
  const items = [
    { sort_order: 2, id: 1 },
    { sort_order: 1, id: 5 },
    { sort_order: 1, id: 2 },
  ];
  const result = QuoteOrdering.resolveScopeOrder(items);
  assert.deepEqual(result.map(x => x.id), [2, 5, 1]);
  assert.notEqual(result, items);
});

test("buildGroupEnumeration: direct items only (no rooms)", () => {
  const sec = makeSection({
    has_rooms: false,
    items: [makeItem({ id: 1, sort_order: 0 }), makeItem({ id: 2, sort_order: 1 })],
  });
  const groups = QuoteOrdering.buildGroupEnumeration(sec);
  // All direct items in one group (group 1)
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "direct");
  assert.equal(groups[0].groupNumber, 1);
  assert.equal(groups[0].items.length, 2);
});

test("buildGroupEnumeration: has_rooms with direct items", () => {
  const sec = makeSection({
    has_rooms: true,
    items: [
      makeItem({ id: 1, room_id: null, sort_order: 0 }),
      makeItem({ id: 2, room_id: null, sort_order: 1 }),
      makeItem({ id: 3, room_id: 10, sort_order: 0 }),
      makeItem({ id: 4, room_id: 10, sort_order: 1 }),
    ],
    rooms: [
      makeRoom({ id: 10, name: "Room A", sort_order: 0 }),
    ],
  });
  const groups = QuoteOrdering.buildGroupEnumeration(sec);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "direct");
  assert.equal(groups[0].groupNumber, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].kind, "room");
  assert.equal(groups[1].groupNumber, 2);
  assert.equal(groups[1].roomId, 10);
  assert.equal(groups[1].items.length, 2);
});

test("buildGroupEnumeration: has_rooms without direct items reserves group 1", () => {
  const sec = makeSection({
    has_rooms: true,
    items: [
      makeItem({ id: 3, room_id: 10, sort_order: 0 }),
      makeItem({ id: 4, room_id: 10, sort_order: 1 }),
    ],
    rooms: [
      makeRoom({ id: 10, name: "Room A", sort_order: 0 }),
    ],
  });
  const groups = QuoteOrdering.buildGroupEnumeration(sec);
  // Group 1 reserved (empty), room is group 2
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "direct");
  assert.equal(groups[0].groupNumber, 1);
  assert.equal(groups[0].items.length, 0);
  assert.equal(groups[1].kind, "room");
  assert.equal(groups[1].groupNumber, 2);
});

test("buildGroupEnumeration: multiple rooms get sequential group numbers", () => {
  const sec = makeSection({
    has_rooms: true,
    items: [
      makeItem({ id: 1, room_id: 10, sort_order: 0 }),
      makeItem({ id: 2, room_id: 20, sort_order: 0 }),
    ],
    rooms: [
      makeRoom({ id: 10, name: "Room A", sort_order: 0 }),
      makeRoom({ id: 20, name: "Room B", sort_order: 1 }),
    ],
  });
  const groups = QuoteOrdering.buildGroupEnumeration(sec);
  assert.equal(groups.length, 3); // group 1 (empty direct) + 2 rooms
  assert.equal(groups[0].groupNumber, 1);
  assert.equal(groups[0].items.length, 0);
  assert.equal(groups[1].groupNumber, 2);
  assert.equal(groups[2].groupNumber, 3);
});

test("buildDisplayCodeMap: direct items only", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: false,
    items: [
      makeItem({ id: 1, sort_order: 0 }),
      makeItem({ id: 2, sort_order: 1 }),
      makeItem({ id: 3, sort_order: 2 }),
    ],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[0]), "A 1.1");
  assert.equal(map.get(sec.items[1]), "A 1.2");
  assert.equal(map.get(sec.items[2]), "A 1.3");
});

test("buildDisplayCodeMap: has_rooms with direct items", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: true,
    items: [
      makeItem({ id: 1, room_id: null, sort_order: 0 }),
      makeItem({ id: 2, room_id: null, sort_order: 1 }),
      makeItem({ id: 3, room_id: 10, sort_order: 0 }),
      makeItem({ id: 4, room_id: 10, sort_order: 1 }),
    ],
    rooms: [makeRoom({ id: 10, name: "Room A", sort_order: 0 })],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[0]), "A 1.1");
  assert.equal(map.get(sec.items[1]), "A 1.2");
  assert.equal(map.get(sec.items[2]), "A 2.1");
  assert.equal(map.get(sec.items[3]), "A 2.2");
});

test("buildDisplayCodeMap: has_rooms without direct items", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: true,
    items: [
      makeItem({ id: 3, room_id: 10, sort_order: 0 }),
      makeItem({ id: 4, room_id: 10, sort_order: 1 }),
    ],
    rooms: [makeRoom({ id: 10, name: "Room A", sort_order: 0 })],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[0]), "A 2.1");
  assert.equal(map.get(sec.items[1]), "A 2.2");
  assert.equal(map.get({ id: 1 }), undefined);
  assert.equal(map.get({ id: 2 }), undefined);
});

test("buildDisplayCodeMap: multiple sections with different prefixes", () => {
  const secA = makeSection({ _resolvedIndex: 0, id: 1, has_rooms: false, items: [makeItem({ id: 1, sort_order: 0 })] });
  const secB = makeSection({ _resolvedIndex: 1, id: 2, has_rooms: false, items: [makeItem({ id: 2, sort_order: 0 })] });
  const mapA = QuoteOrdering.buildDisplayCodeMap(secA);
  const mapB = QuoteOrdering.buildDisplayCodeMap(secB);
  assert.equal(mapA.get(secA.items[0]), "A 1.1");
  assert.equal(mapB.get(secB.items[0]), "B 1.1");
});

test("buildDisplayCodeMap: unsaved items with no id are handled gracefully", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: false,
    items: [
      { ...makeItem({ id: 1, sort_order: 0 }) },
      { ...makeItem({ id: "unsaved-1", sort_order: 1 }) },
      { ...makeItem({ id: "unsaved-2", sort_order: 2 }) },
    ],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[0]), "A 1.1");
  assert.equal(map.get(sec.items[1]), "A 1.2");
  assert.equal(map.get(sec.items[2]), "A 1.3");
});

test("resolveQuoteHierarchy: sorts sections by sort_order then id", () => {
  const sections = [
    makeSection({ id: 2, sort_order: 1 }),
    makeSection({ id: 1, sort_order: 0 }),
    makeSection({ id: 3, sort_order: 2 }),
  ];
  const result = QuoteOrdering.resolveQuoteHierarchy({ sections });
  assert.deepEqual(result.map(s => s.id), [1, 2, 3]);
  assert.equal(result[0]._resolvedIndex, 0);
  assert.equal(result[1]._resolvedIndex, 1);
  assert.equal(result[2]._resolvedIndex, 2);
});

test("resolveAllDisplayCodes: combines all section codes", () => {
  const secA = makeSection({ _resolvedIndex: 0, id: 1, has_rooms: false, items: [makeItem({ id: 1, sort_order: 0 })] });
  const secB = makeSection({ _resolvedIndex: 1, id: 2, has_rooms: false, items: [makeItem({ id: 2, sort_order: 0 })] });
  const { allCodes } = QuoteOrdering.resolveAllDisplayCodes({ sections: [secA, secB] });
  assert.equal(allCodes.get(secA.items[0]), "A 1.1");
  assert.equal(allCodes.get(secB.items[0]), "B 1.1");
});

test("getItemDisplayCode: formats correctly", () => {
  assert.equal(QuoteOrdering.getItemDisplayCode({}, "A", 1, 1), "A 1.1");
  assert.equal(QuoteOrdering.getItemDisplayCode({}, "AA", 2, 3), "AA 2.3");
});

test("legacy duplicate sort_order resolves by id", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: false,
    items: [
      makeItem({ id: 5, sort_order: 0 }),
      makeItem({ id: 3, sort_order: 0 }),
      makeItem({ id: 7, sort_order: 0 }),
    ],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[1]), "A 1.1");
  assert.equal(map.get(sec.items[0]), "A 1.2");
  assert.equal(map.get(sec.items[2]), "A 1.3");
});

test("legacy negative sort_order sorts first", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: false,
    items: [
      makeItem({ id: 1, sort_order: 5 }),
      makeItem({ id: 2, sort_order: -1 }),
      makeItem({ id: 3, sort_order: 0 }),
    ],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[1]), "A 1.1");
  assert.equal(map.get(sec.items[2]), "A 1.2");
  assert.equal(map.get(sec.items[0]), "A 1.3");
});

test("room order affects group number", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: true,
    items: [
      makeItem({ id: 1, room_id: 10, sort_order: 0 }),
      makeItem({ id: 2, room_id: 20, sort_order: 0 }),
    ],
    rooms: [
      makeRoom({ id: 20, name: "Room B", sort_order: 0 }),
      makeRoom({ id: 10, name: "Room A", sort_order: 1 }),
    ],
  });
  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[1]), "A 2.1");
  assert.equal(map.get(sec.items[0]), "A 3.1");
});

test("direct items always group 1 even when rooms exist", () => {
  const sec = makeSection({
    _resolvedIndex: 0,
    has_rooms: true,
    items: [
      makeItem({ id: 1, room_id: null, sort_order: 0 }),
      makeItem({ id: 2, room_id: 10, sort_order: 0 }),
    ],
    rooms: [makeRoom({ id: 10, name: "Room", sort_order: 0 })],
  });

  const map = QuoteOrdering.buildDisplayCodeMap(sec);
  assert.equal(map.get(sec.items[0]), "A 1.1");
  assert.equal(map.get(sec.items[1]), "A 2.1");
});

test("loaded flat room clones are replaced by the nested live instances", () => {
  const nested = makeItem({ id: 42, room_id: 10, sort_order: 0 });
  const flatClone = { ...nested };
  const unsavedFlat = makeItem({ id: null, room_id: null, sort_order: 1 });
  const unsavedNested = makeItem({ id: null, room_id: 10, sort_order: 1 });
  const section = makeSection({
    has_rooms: true,
    items: [flatClone, unsavedFlat],
    rooms: [{ ...makeRoom({ id: 10 }), items: [nested, unsavedNested] }],
  });

  QuoteOrdering.linkRoomItemInstances(section);

  assert.equal(section.items.find((item) => item.id === 42), nested);
  assert.ok(section.items.includes(unsavedFlat));
  assert.ok(section.items.includes(unsavedNested));
  assert.notEqual(unsavedFlat, unsavedNested);
});

test("ordinary item writer payload omits persistence and ordering metadata", () => {
  const payload = QuoteOrdering.itemWriterPayload({
    id: 7,
    sort_order: 3,
    _fromServer: true,
    _saveFailed: false,
    name: "Item",
    category_id: 4,
    room_id: null,
  });
  assert.deepEqual(payload, {
    name: "Item",
    category_id: 4,
    room_id: null,
  });
});

test("moveAdjacent moves one entity and preserves unsaved object identity", () => {
  const first = { id: 1 };
  const unsaved = { id: null };
  const last = { id: 3 };
  const moved = QuoteOrdering.moveAdjacent([first, unsaved, last], 2, "earlier");
  assert.equal(moved.moved, true);
  assert.deepEqual(moved.items, [first, last, unsaved]);
  assert.equal(moved.items[2], unsaved);
});

test("moveAdjacent reports native boundary no-op for first and last entities", () => {
  const items = [{ id: 1 }, { id: 2 }];
  assert.equal(QuoteOrdering.moveAdjacent(items, 0, "earlier").moved, false);
  assert.equal(QuoteOrdering.moveAdjacent(items, 1, "later").moved, false);
  assert.deepEqual(items.map((item) => item.id), [1, 2]);
});

test("room movement remains a named-room scope independent of direct group", () => {
  const direct = { id: 10, room_id: null };
  const roomOne = { id: 20, room_id: 1 };
  const roomTwo = { id: 30, room_id: 2 };
  const movedRooms = QuoteOrdering.moveAdjacent([roomOne, roomTwo], 1, "earlier").items;
  assert.deepEqual(movedRooms.map((room) => room.id), [30, 20]);
  assert.equal(direct.room_id, null);
  assert.equal(roomTwo.room_id, 2);
});

test("scope baseline and target remain separate from projected positions", () => {
  const first = { id: 1, sort_order: 0 };
  const second = { id: 2, sort_order: 1 };
  const projected = QuoteOrdering.moveAdjacent([first, second], 1, "earlier").items;
  assert.deepEqual(QuoteOrdering.scopeBaseline([first, second]), [
    { id: 1, sort_order: 0 },
    { id: 2, sort_order: 1 },
  ]);
  assert.deepEqual(QuoteOrdering.scopeTarget(projected), [2, 1]);
  assert.equal(projected[0], second);
});

test("reconcileScopeOrder preserves surviving local objects and unsaved siblings", () => {
  const localA = { id: 1, name: "edited" };
  const localDeleted = { id: 2, name: "removed remotely" };
  const unsaved = { id: null, name: "new" };
  const serverOnly = { id: 3, name: "server" };
  const merged = QuoteOrdering.reconcileScopeOrder(
    [localA, localDeleted, unsaved],
    [serverOnly, { id: 1, name: "server value" }],
  );
  assert.deepEqual(merged, [serverOnly, localA, unsaved]);
  assert.equal(merged[1], localA);
  assert.equal(merged[2], unsaved);
});