const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const QuoteOrdering = require("../public/quote-ordering.js");

function createCoordinator(fetchImpl, documentOverrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.html"), "utf8");
  const start = source.indexOf("      let sections = [];");
  const end = source.indexOf("      function resolveSectionOrder()", start);
  const restoreStart = source.indexOf("      function reconcileRestoredOrderScopes");
  const restoreEnd = source.indexOf("      function draftFallbackHandler", restoreStart);
  assert.ok(start >= 0 && end > start && restoreStart >= 0 && restoreEnd > restoreStart);
  const context = {
    QuoteOrdering,
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    CSS: { escape: String },
    document: {
      dir: "ltr",
      documentElement: { dir: "ltr" },
      getElementById: (id) => id === "orderStatus" ? { textContent: "" } : null,
      querySelectorAll: () => [],
      ...documentOverrides,
    },
    markSectionDirty() {},
    markRoomDirty() {},
    markDirty() {},
    renderAll() {},
    console,
  };
  const body =
    `let currentQuoteId = 41;\nlet activeSectionIdx = 0;\nlet activeRoomIdx = null;\nlet activeRoomObj = null;\n${source.slice(start, end)}\n` +
    `${source.slice(restoreStart, restoreEnd)}\n` +
    `globalThis.__order = {
      getOrderScope, flushOrderScope, reconcileOrderConflict, moveOrderEntity,
      reconcileRestoredOrderScopes, recordOrderAppend, enqueueOrderMutation,
      setupOrderHandle, orderDropPlacement,
      markEntitySaved,
      getSections: () => sections,
      setSections: (value) => { sections = value; },
    };`;
  vm.runInNewContext(body, context);
  return context.__order;
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test("production coordinator recovers a 409 through its shared conflict fetch", async () => {
  const calls = [];
  const coordinator = createCoordinator(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/reorder")) {
      return jsonResponse(409, { error: "conflict", code: "ORDER_CONFLICT" });
    }
    return jsonResponse(200, {
      sections: [
        { id: 1, name: "A", sort_order: 1 },
        { id: 3, name: "Server-only", sort_order: 2 },
        { id: 2, name: "B", sort_order: 0 },
      ],
    });
  });
  const localA = { id: 1, name: "A*", sort_order: 1 };
  const localB = { id: 2, name: "B*", sort_order: 0 };
  coordinator.setSections([localB, localA]);
  const scope = coordinator.getOrderScope("sections", null);
  scope.confirmed = new Map([["1", 0], ["2", 1]]);
  scope.desired = [localB, localA];
  scope.pending = true;
  await coordinator.flushOrderScope(scope);
  assert.equal(calls.length, 2);
  assert.deepEqual(coordinator.getSections().map((item) => item.id), [2, 3, 1]);
  assert.equal(coordinator.getSections()[0], localB);
  assert.equal(coordinator.getSections()[2], localA);
  assert.equal(scope.conflict, true);
});

test("production coordinator retries a frozen request before newer intent", async () => {
  const payloads = [];
  let rejectFirst;
  let calls = 0;
  const coordinator = createCoordinator(async (url, options) => {
    if (!url.endsWith("/reorder")) return jsonResponse(200, { sections: [] });
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    calls++;
    if (calls === 1) {
      return new Promise((resolve, reject) => { rejectFirst = reject; });
    }
    return jsonResponse(200, {
      positions: payload.order.map((id, position) => ({ id, position })),
    });
  });
  const first = { id: 1, sort_order: 0 };
  const second = { id: 2, sort_order: 1 };
  coordinator.setSections([second, first]);
  const scope = coordinator.getOrderScope("sections", null);
  scope.confirmed = new Map([["1", 0], ["2", 1]]);
  scope.desired = [second, first];
  scope.pending = true;
  scope.version = 1;
  const firstFlush = coordinator.flushOrderScope(scope);
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.setSections([first, second]);
  scope.desired = [first, second];
  scope.version = 2;
  rejectFirst(Object.assign(new Error("timeout"), { name: "AbortError" }));
  await firstFlush;
  await coordinator.flushOrderScope(scope);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(payloads.map((payload) => payload.order), [[2, 1], [2, 1], [1, 2]]);
  assert.equal(scope.pending, false);
  assert.deepEqual(coordinator.getSections().map((item) => item.id), [1, 2]);
});

test("production coordinator keeps future scopes blocked after offline draft restore", () => {
  const coordinator = createCoordinator(async () => { throw new Error("offline"); });
  coordinator.reconcileRestoredOrderScopes(null);
  const section = { id: 9, rooms: [] };
  coordinator.setSections([section]);
  const scope = coordinator.getOrderScope("rooms", section);
  assert.equal(scope.blocked, true);
  assert.equal(scope.status, "offline");
});

test("production coordinator registers a returned membership position before a move", async () => {
  const payloads = [];
  const coordinator = createCoordinator(async (url, options) => {
    if (!url.endsWith("/reorder")) return jsonResponse(200, {});
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    return jsonResponse(200, {
      positions: payload.order.map((id, position) => ({ id, position })),
    });
  });
  const existing = { id: 1, sort_order: 0 };
  const created = { id: 2, sort_order: 1 };
  coordinator.setSections([existing, created]);
  const scope = coordinator.getOrderScope("sections", null);
  coordinator.recordOrderAppend("sections", null, created);
  coordinator.moveOrderEntity("sections", null, created, "earlier");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(payloads[0].expected, [
    { id: 2, sort_order: 1 },
    { id: 1, sort_order: 0 },
  ]);
  assert.deepEqual(payloads[0].order, [2, 1]);
  assert.equal(scope.pending, false);
});

test("production coordinator serializes overlapping membership mutations per scope", async () => {
  const coordinator = createCoordinator(async () => jsonResponse(200, {}));
  const scope = coordinator.getOrderScope("sections", null);
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = coordinator.enqueueOrderMutation(scope, async () => {
    events.push("first-start");
    await gate;
    events.push("first-end");
  });
  const second = coordinator.enqueueOrderMutation(scope, async () => {
    events.push("second");
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first-start"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second"]);
});

test("production coordinator uses inline RTL/LTR placement and cancels touch previews", () => {
  const coordinator = createCoordinator(async () => jsonResponse(200, {}));
  const element = {
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    closest: () => null,
  };
  assert.equal(coordinator.orderDropPlacement({ clientX: 10 }, element), "before");
  assert.equal(coordinator.orderDropPlacement(
    { clientX: 90 },
    {
      getBoundingClientRect: () => ({ left: 0, width: 100 }),
      closest: () => ({ getAttribute: () => "rtl" }),
    },
  ), "before");
  const listeners = new Map();
  const classes = new Set();
  const handle = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    setPointerCapture() {},
    releasePointerCapture() {},
    focus() {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
    },
  };
  const parent = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
    },
    parentElement: { querySelectorAll: () => [] },
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    dataset: {},
  };
  coordinator.setupOrderHandle(handle, "sections", null, { id: 1 }, 0, 1, parent);
  listeners.get("pointerdown")({ pointerType: "touch", pointerId: 1 });
  assert.equal(classes.has("dragging"), true);
  listeners.get("pointercancel")();
  assert.equal(classes.has("dragging"), false);
});

test("production native drag handler keeps one insertion indicator and clears it", () => {
  const nodes = [];
  const coordinator = createCoordinator(async () => jsonResponse(200, {}), {
    querySelectorAll: () => nodes,
  });
  const makeParent = (left) => {
    const listeners = new Map();
    const parent = {
      classes: new Set(),
      listeners,
      parentElement: {},
        dataset: {},
      addEventListener: (name, callback) => listeners.set(name, callback),
      getBoundingClientRect: () => ({ left, width: 100 }),
      classList: {
        add: (name) => parent.classes.add(name),
        remove: (...names) => names.forEach((name) => parent.classes.delete(name)),
        toggle: (name, value) => value ? parent.classes.add(name) : parent.classes.delete(name),
      },
    };
    nodes.push(parent);
    return parent;
  };
  const makeHandle = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, callback) => listeners.set(name, callback),
      classList: { add() {}, remove() {} },
    };
  };
  const first = makeParent(0);
  const second = makeParent(100);
  const firstHandle = makeHandle();
  coordinator.setupOrderHandle(firstHandle, "sections", null, { id: 1 }, 0, 2, first);
  coordinator.setupOrderHandle(makeHandle(), "sections", null, { id: 2 }, 1, 2, second);
  const dragEvent = (clientX) => ({
    clientX,
    preventDefault() {},
  });
  first.listeners.get("dragover")(dragEvent(25));
  assert.equal(nodes.filter((node) => node.classes.has("order-insertion-before") ||
    node.classes.has("order-insertion-after")).length, 1);
  assert.equal(first.classes.has("order-insertion-before"), true);
  second.listeners.get("dragover")(dragEvent(175));
  assert.equal(nodes.filter((node) => node.classes.has("order-insertion-before") ||
    node.classes.has("order-insertion-after")).length, 1);
  assert.equal(second.classes.has("order-insertion-after"), true);
  second.listeners.get("drop")({
    preventDefault() {},
    dataTransfer: { getData: () => "missing" },
  });
  firstHandle.listeners.get("dragend")();
  assert.equal(nodes.filter((node) => node.classes.has("order-insertion-before") ||
    node.classes.has("order-insertion-after")).length, 0);
  first.listeners.get("dragover")(dragEvent(25));
  firstHandle.listeners.get("pointercancel")();
  assert.equal(nodes.filter((node) => node.classes.has("order-insertion-before") ||
    node.classes.has("order-insertion-after")).length, 0);
});

test("production save success clears only the acknowledged failure marker", () => {
  const coordinator = createCoordinator(async () => jsonResponse(200, {}));
  const succeeded = { id: 7, name: "edited", _saveFailed: true };
  const failed = { id: 8, name: "still edited", _saveFailed: true };
  coordinator.markEntitySaved(succeeded);
  assert.equal(succeeded._fromServer, true);
  assert.equal("_saveFailed" in succeeded, false);
  assert.equal(failed._saveFailed, true);
  assert.equal(failed.name, "still edited");
});
