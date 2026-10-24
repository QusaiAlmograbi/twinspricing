const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const QuoteOrdering = require(path.join(
  __dirname,
  "..",
  "public",
  "quote-ordering.js",
));

const app = fs.readFileSync(
  path.join(__dirname, "..", "public", "app.html"),
  "utf8",
);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextMatch = source
    .slice(start + 1)
    .match(/\n      (?:async )?function /);
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function handlerSource(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextMatch = source
    .slice(start + 1)
    .match(/\n      (?:async )?function /);
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function makeCaller(name, roomMode, responseGate, productionSource = app) {
  const room = roomMode === "named" ? { id: 9, items: [] } : null;
  const section = {
    id: 4,
    code: "A",
    has_rooms: !!room,
    items: [],
    rooms: room ? [room] : [],
  };
  const context = {
    result: null,
    responseCount: 0,
    dirtyCount: 0,
    renderCount: 0,
    responseGate,
    QuoteOrdering,
    catItem: {
      id: 31,
      item_code: "CAT-31",
      name: "Catalog item",
      description: "",
      unit: "عدد",
      base_cost: 10,
      overhead_pct: 35,
      selling_price: 13.5,
    },
    document: {
      getElementById() {
        return { disabled: false };
      },
    },
    console,
  };
  const source = `
    let currentQuoteId = 7;
    let sections = [section];
    let activeSectionIdx = 0;
    let activeRoomIdx = ${room ? 0 : "null"};
    ${productionSource.match(/const itemCreatePending = new Set\(\);/)[0]}
    ${functionBody(productionSource, "itemWriterPayload")}
    ${functionBody(productionSource, "ownsEditorTarget")}
    ${functionBody(productionSource, "addLiveItem")}
    function markItemDirty() { context.dirtyCount++; }
    function markDirty() { context.dirtyCount++; }
    function renderAll() { context.renderCount++; }
    function showToast() {}
    async function api() {
      context.responseCount++;
      return context.responseGate;
    }
    ${handlerSource(productionSource, name)}
    globalThis.run = ${name};
    globalThis.section = section;
  `;
  context.context = context;
  context.section = section;
  vm.runInNewContext(source, context);
  return { context, section, room };
}

test("main editor deletion removes the shared item instance", () => {
  const body = app.slice(
    app.indexOf('tr.querySelector(".del-btn").onclick'),
    app.indexOf("// Image", app.indexOf('tr.querySelector(".del-btn").onclick')),
  );
  assert.match(body, /removeLiveItem\(sec, item\)/);
  assert.doesNotMatch(body, /allItems\.splice/);
});

test("catalog and manual callers attach to their captured room", () => {
  const catalog = functionBody(app, "addItemFromCatalog");
  const manual = functionBody(app, "addItemManual");
  assert.match(catalog, /addLiveItem\(sec, activeRoom, newItem\)/);
  assert.doesNotMatch(catalog, /addLiveItem\(sec, manualRoom, newItem\)/);
  assert.match(manual, /addLiveItem\(sec, manualRoom, newItem\)/);
  assert.doesNotMatch(manual, /addLiveItem\(sec, room, newItem\)/);
  assert.match(manual, /currentManualBtn && currentManualBtn === manualBtn/);
});

test("bulk completion validates quote, hierarchy, and room ownership", () => {
  const body = functionBody(app, "addBulkSelectedItems");
  assert.match(body, /const myQuoteId = currentQuoteId/);
  assert.match(body, /const mySections = sections/);
  assert.match(body, /const targetRoom/);
  assert.match(body, /if \(!ownsBulkTarget\(\)\) return;/);
  assert.match(body, /addLiveItem\(sec, targetRoom, newItem\)/);
});

test("identity-aware removal cannot collapse distinct unsaved objects", () => {
  const roomItem = { id: null };
  const otherItem = { id: null };
  const room = { items: [roomItem, otherItem] };
  const section = { items: [roomItem, otherItem], rooms: [room] };
  section.items = section.items.filter((candidate) => candidate !== roomItem);
  room.items = room.items.filter((candidate) => candidate !== roomItem);
  assert.deepEqual(section.items, [otherItem]);
  assert.deepEqual(room.items, [otherItem]);
});

test("catalog completion after named-room deletion is ignored", async () => {
  let release;
  const response = new Promise((resolve) => {
    release = () => resolve({ id: 101, selling_price: 13.5, sort_order: 4 });
  });
  const caller = makeCaller("addItemFromCatalog", "named", response);
  const pending = caller.context.run(caller.context.catItem);
  caller.section.rooms.length = 0;
  caller.room.items.length = 0;
  release();
  await pending;
  assert.deepEqual(caller.section.items, []);
  assert.deepEqual(caller.room.items, []);
  assert.equal(caller.context.dirtyCount, 0);
  assert.equal(caller.context.renderCount, 0);
  assert.equal(caller.context.responseCount, 1);
});

test("manual completion after named-room deletion is ignored", async () => {
  let release;
  const response = new Promise((resolve) => {
    release = () => resolve({ id: 102, selling_price: 0, sort_order: 5 });
  });
  const caller = makeCaller("addItemManual", "named", response);
  const pending = caller.context.run("Manual item");
  caller.section.rooms.length = 0;
  caller.room.items.length = 0;
  release();
  await pending;
  assert.deepEqual(caller.section.items, []);
  assert.deepEqual(caller.room.items, []);
  assert.equal(caller.context.dirtyCount, 0);
  assert.equal(caller.context.renderCount, 0);
  assert.equal(caller.context.responseCount, 1);
});

test("catalog direct and named-room creation still attaches the server result", async () => {
  for (const roomMode of ["direct", "named"]) {
    const caller = makeCaller(
      "addItemFromCatalog",
      roomMode,
      { id: 103, selling_price: 13.5, sort_order: 6 },
    );
    await caller.context.run(caller.context.catItem);
    assert.equal(caller.section.items.length, 1);
    assert.equal(caller.section.items[0].id, 103);
    assert.equal(caller.section.items[0].sort_order, 6);
    if (caller.room) {
      assert.equal(caller.room.items[0], caller.section.items[0]);
    }
    assert.equal(caller.context.dirtyCount, 2);
    assert.equal(caller.context.renderCount, 1);
  }
});

test("manual direct and named-room creation still attaches the server result", async () => {
  for (const roomMode of ["direct", "named"]) {
    const caller = makeCaller(
      "addItemManual",
      roomMode,
      { id: 104, selling_price: 0, sort_order: 7 },
    );
    await caller.context.run("Manual item");
    assert.equal(caller.section.items.length, 1);
    assert.equal(caller.section.items[0].id, 104);
    assert.equal(caller.section.items[0].sort_order, 7);
    if (caller.room) {
      assert.equal(caller.room.items[0], caller.section.items[0]);
    }
    assert.equal(caller.context.dirtyCount, 2);
    assert.equal(caller.context.renderCount, 1);
  }
});

async function assertDelayedCompletionIsBlocked(source = app) {
  let release;
  const response = new Promise((resolve) => {
    release = () => resolve({ id: 105, selling_price: 13.5, sort_order: 8 });
  });
  const caller = makeCaller("addItemFromCatalog", "named", response, source);
  const pending = caller.context.run(caller.context.catItem);
  caller.section.rooms.length = 0;
  caller.room.items.length = 0;
  release();
  await pending;
  assert.deepEqual(caller.section.items, [], "stale completion resurrected an item");
  assert.deepEqual(caller.room.items, [], "stale completion mutated detached room");
  assert.equal(caller.context.dirtyCount, 0, "stale completion dirtied the editor");
  assert.equal(caller.context.renderCount, 0, "stale completion rerendered the editor");
}

test("in-memory mutation check proves the room guard is exercised", async () => {
  await assertDelayedCompletionIsBlocked(app);
  const mutated = app.replace(
    "destinationRoom === null ||\n            (sectionRef.rooms || []).includes(destinationRoom)",
    "true",
  );
  assert.notEqual(mutated, app, "mutation must change only the in-memory source");
  await assert.rejects(
    () => assertDelayedCompletionIsBlocked(mutated),
    /stale completion (resurrected|mutated|dirtied|rerendered)/,
  );
  assert.equal(
    fs.readFileSync(path.join(__dirname, "..", "public", "app.html"), "utf8"),
    app,
    "mutation check must not modify production source on disk",
  );
});
