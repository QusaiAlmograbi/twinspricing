"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const APP_HTML = fs.readFileSync(path.join(__dirname, "..", "public", "app.html"), "utf8");

// ---------------------------------------------------------------------------
// Extract the real picker slice (between the two section markers) verbatim
// from public/app.html so the tests execute the ACTUAL production functions.
// ---------------------------------------------------------------------------
const PICKER_START = "// ---- Catalog Picker ----";
const PICKER_END = "// ---- Data Binding ----";
const START_IDX = APP_HTML.indexOf(PICKER_START);
const END_IDX = APP_HTML.indexOf(PICKER_END);
assert.ok(
  START_IDX !== -1 && END_IDX !== -1 && START_IDX < END_IDX,
  "Picker slice markers not found in app.html",
);

const PICKER_SLICE = APP_HTML.slice(START_IDX, END_IDX);

// Also extract real escapeAttr / money from app.html so rendering is faithful.
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start !== -1, `function ${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { depth++; started = true; }
    else if (ch === "}") { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}

const MONEY_FN = extractFunction(APP_HTML, "money");
const ESCAPE_FN = extractFunction(APP_HTML, "escapeAttr");

// ---------------------------------------------------------------------------
// Minimal DOM stub – enough for the picker slice to parse/render/query.
// ---------------------------------------------------------------------------
const VOID = { input: true, br: true, img: true, hr: true, meta: true, link: true };
let allElements = [];

function isDescendant(a, b) {
  let p = a.parent;
  while (p) { if (p === b) return true; p = p.parent; }
  return false;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([A-Za-z0-9_:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(str))) {
    const k = m[1];
    let v = "";
    if (m[3] !== undefined) v = m[3];
    else if (m[4] !== undefined) v = m[4];
    attrs[k] = v;
  }
  return attrs;
}

function makeEl(tag, attrs, parent) {
  const classes = new Set();
  if (attrs["class"]) {
    attrs["class"].trim().split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  }
  const el = {
    tagName: tag.toLowerCase(),
    attrsV: attrs,
    parent: parent || null,
    children: [],
    style: {},
    value: "",
    textContent: "",
    checked: false,
    disabled: false,
    dataset: {},
    _listeners: {},
    _classes: classes,
    classList: {
      _set: classes,
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !classes.has(c) : !!force;
        on ? classes.add(c) : classes.delete(c);
        return on;
      },
    },
    addEventListener(t, fn) { el._listeners[t] = fn; },
    dispatchEvent(ev) {
      const fn = el._listeners[ev.type];
      if (fn) fn.call(el, ev);
    },
    querySelector(s) { return collectMatches(el, s, false)[0] || null; },
    querySelectorAll(s) { return collectMatches(el, s, false); },
    closest(s) {
      const target = parseSelectorTokens(s);
      let n = el;
      while (n) { if (matchTokens(n, target)) return n; n = n.parent; }
      return null;
    },
    appendChild(c) { el.children.push(c); c.parent = el; allElements.push(c); },
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") continue;
    if (k === "checked") el.checked = true;
    if (k.startsWith("data-")) {
      // Mirror real DOM: data-disc-id → dataset.discId (kebab → camelCase)
      const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      el.dataset[camel] = v;
    }
  }
  Object.defineProperty(el, "innerHTML", {
    get() { return el._innerHTML || ""; },
    set(h) {
      el._innerHTML = h;
      el.children = parseFrag(h, el);
    },
  });
  allElements.push(el);
  return el;
}

function parseFrag(html, parent) {
  const children = [];
  const stack = [{ el: parent, list: children }];
  const re = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === "/";
    if (isClose) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = parseAttrs(m[3] || "");
    const top = stack[stack.length - 1];
    const el = makeEl(tag, attrs, top.el);
    top.list.push(el);
    if (!selfClose && !VOID[tag]) stack.push({ el, list: el.children });
  }
  return children;
}

function parseSelectorTokens(sel) {
  const tag = (sel.match(/^([a-zA-Z0-9]+)/) || [null])[0];
  const classes = [...sel.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  const attrs = {};
  for (const m of sel.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
    attrs[m[1]] = m[2] === undefined ? "" : m[2];
  }
  return { tag, classes, attrs };
}

function matchTokens(el, s) {
  if (s.tag && el.tagName !== s.tag) return false;
  for (const cn of s.classes) if (!el._classes.has(cn)) return false;
  for (const [k, v] of Object.entries(s.attrs)) {
    const val = (el.attrsV || {})[k];
    if (val === undefined && v === "") continue;
    if (val !== v) return false;
  }
  return true;
}

function collectMatches(root, sel, includeSelf) {
  const s = parseSelectorTokens(sel);
  const out = [];
  const walk = (node, isRoot) => {
    if (!isRoot || includeSelf) { if (matchTokens(node, s)) out.push(node); }
    for (const c of node.children) walk(c, false);
  };
  walk(root, true);
  return out;
}

function makeDocument() {
  const cache = {};
  const doc = {
    getElementById(id) {
      if (!cache[id]) cache[id] = makeEl("div", { id });
      return cache[id];
    },
    querySelector(sel) {
      const s = parseSelectorTokens(sel);
      return allElements.find((e) => matchTokens(e, s)) || null;
    },
    querySelectorAll(sel) {
      const s = parseSelectorTokens(sel);
      return allElements.filter((e) => matchTokens(e, s));
    },
    createElement() { return makeEl("div", {}); },
  };
  return doc;
}

// ---------------------------------------------------------------------------
// Build the Function wrapper that evaluates the picker slice with injected
// stubs / ambient declarations, and returns { state, set, calls, doc, ... }.
// ---------------------------------------------------------------------------
const WRAPPER_BODY = [
  "'use strict';",
  MONEY_FN,
  ESCAPE_FN,
  "let allDisciplines = [];",
  "let allPickerCategories = [];",
  "let sections = [];",
  "let activeSectionIdx = null;",
  "let activeRoomIdx = null;",
  "let currentQuoteId = null;",
  "const calls = { dirty:0, itemDirty:[], renderAll:0, toasts:[] };",
  "let dirtyEntities = { quote:false, sections:new Set(), rooms:new Set(), items:new Set() };",
  "function markDirty(){ calls.dirty += 1; }",
  "function markItemDirty(item){ if(item){ calls.itemDirty.push(item); } }",
  "function renderAll(){ calls.renderAll += 1; }",
  "function showToast(msg){ calls.toasts.push(msg); }",
  "function remapDirtyId(){}",
  PICKER_SLICE,
  "return {",
  "  doc: document,",
  "  calls,",
  "  api,",
  "  requestQueue,",
  "  state(){ return {",
  "    pickerActiveCatId, pickerCurrentItemIdx, pickerSession, pickerMetaReady,",
  "    bulkPickerSession, bulkPickerView, bulkPickerSectionId,",
  "    bulkPickerDisciplineId, bulkPickerDisciplineName,",
  "    bulkSelectedIds: Array.from(bulkSelectedIds),",
  "    bulkSelectedItemIds: Array.from(bulkSelectedItems.keys()),",
  "    bulkSelectedItemsSize: bulkSelectedItems.size,",
  "    bulkTargetQuoteSectionId, bulkTargetRoomId,",
  "    sectionsItemCount: sections[activeSectionIdx] && sections[activeSectionIdx].items ? sections[activeSectionIdx].items.length : -1,",
  "    catsMeta: allPickerCategories.map((c) => ({ id: c.id, _disciplineId: c._disciplineId })),",
  "    discsMeta: allDisciplines.map((d) => ({ id: d.id, name: d.name })),",
  "  }; },",
  "  set: {",
  "    sections: (v) => { sections = v; },",
  "    activeSectionIdx: (v) => { activeSectionIdx = v; },",
  "    activeRoomIdx: (v) => { activeRoomIdx = v; },",
  "    currentQuoteId: (v) => { currentQuoteId = v; },",
  "    allDisciplines: (v) => { allDisciplines = v; },",
  "    allPickerCategories: (v) => { allPickerCategories = v; },",
  "    pickerMetaReady: (v) => { pickerMetaReady = v; },",
  "  },",
  "  openPicker, closePicker, loadPickerItems, loadPickerCategories, renderPickerCategories,",
  "  openBulkPicker, closeBulkPicker, openBulkSectionItems, goBackToSpecialties,",
  "  openBulkReview, goBackFromReview, toggleBulkDiscipline,",
  "  loadBulkSectionItems, loadBulkDisciplineSections, renderBulkSpecialties,",
  "  renderBulkView, removeBulkItem, clearBulkBasketFromUI, renderBulkReview,",
  "  updateBulkSelectionBar, addBulkSelectedItems, ensureBulkTarget,",
  "};",
].join("\n");

function makeHarness() {
  allElements = [];
  const doc = makeDocument();
  const requestQueue = [];

  function api(path, options) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ path, options, resolve, reject });
    });
  }

  let timers = [];
  let timerSeq = 0;
  function fakeSetTimeout(fn, _ms) {
    const id = ++timerSeq;
    timers.push({ id, fn });
    return id;
  }
  function fakeClearTimeout(id) {
    const i = timers.findIndex((t) => t.id === id);
    if (i !== -1) timers.splice(i, 1);
  }

  const runner = new Function("api", "document", "setTimeout", "clearTimeout", "requestQueue", WRAPPER_BODY);
  const H = runner(api, doc, fakeSetTimeout, fakeClearTimeout, requestQueue);

  function flushTimers() {
    const batch = timers.splice(0);
    for (const t of batch) t.fn();
  }

  return { H, doc, requestQueue, flushTimers, timers };
}

// Helpers accept either the harness ({H, doc, ...}) or the runner result ({doc, set, ...}).
function runnerOf(x) {
  return x && x.H ? x.H : x;
}

function findCheckbox(harness, resultsId, dataId) {
  const doc = harness.doc || runnerOf(harness).doc;
  return doc.getElementById(resultsId).querySelector('input[type="checkbox"][data-id="' + dataId + '"]');
}

function simulateCheck(harness, resultsId, dataId) {
  const cb = findCheckbox(harness, resultsId, dataId);
  assert.ok(cb, "checkbox data-id=" + dataId + " not found");
  cb.checked = true;
  cb.dispatchEvent(new Event("change"));
}

function openAndResolve(harness, secId, secName, items) {
  const r = runnerOf(harness);
  r.openBulkSectionItems(secId, secName || "", "disc");
  const req = (harness.requestQueue || r.requestQueue).shift();
  assert.ok(req, "expected pending request after openBulkSectionItems");
  req.resolve({ items });
  return flushAll(2);
}

function setupPickerCats(harness, disciplines, categories) {
  const r = runnerOf(harness);
  r.set.allDisciplines(disciplines);
  r.set.allPickerCategories(categories);
  r.set.pickerMetaReady(true);
}

async function flushAll(n) {
  for (let i = 0; i < (n || 5); i++) {
    await new Promise((r) => process.nextTick(r));
  }
}

// ==========================================================================
// TESTS
// ==========================================================================

// ---- Bulk Picker: ID Consistency ----

test("bulk: checkbox rendering uses numeric keys — string and numeric item ids", async () => {
  const { H, doc } = makeHarness();
  const ITEMS = [
    { id: "101", name: "Item A", item_code: "A1", unit: "number", selling_price: 10, category_id: 1 },
    { id: 42, name: "Item B", item_code: "A2", unit: "number", selling_price: 20, category_id: 1 },
  ];
  await openAndResolve(H, 1, "Cat A", ITEMS);

  // Select both: string id "101" → numeric basket key 101; numeric 42 stays 42
  simulateCheck(H, "bulkPickerResults", "101");
  simulateCheck(H, "bulkPickerResults", "42");
  let s = H.state();
  assert.deepEqual(s.bulkSelectedIds.sort((a, b) => a - b), [42, 101]);
  assert.deepEqual(s.bulkSelectedItemIds.sort((a, b) => a - b), [42, 101]);

  // Re-render (leave then return)
  await openAndResolve(H, 1, "Cat A", ITEMS);
  s = H.state();
  assert.deepEqual(s.bulkSelectedIds.sort((a, b) => a - b), [42, 101], "basket preserved across re-render");

  const labels = doc.getElementById("bulkPickerResults").querySelectorAll(".bulk-picker-item");
  assert.equal(labels.length, 2);
  for (const l of labels) {
    assert.ok(l._classes.has("bp-selected"), "row for data-id=" + l.dataset.id + " has bp-selected");
  }
  const cb101 = findCheckbox({ doc }, "bulkPickerResults", "101");
  const cb42 = findCheckbox({ doc }, "bulkPickerResults", "42");
  assert.ok(cb101.checked, "string-id 101 checkbox checked");
  assert.ok(cb42.checked, "numeric-id 42 checkbox checked");
});

test("bulk: deselect removes from basket", async () => {
  const { H } = makeHarness();
  const ITEMS = [
    { id: "5", name: "X", item_code: "X1", unit: "u", selling_price: 1, category_id: null },
    { id: "6", name: "Y", item_code: "Y1", unit: "u", selling_price: 1, category_id: null },
  ];
  await openAndResolve(H, 1, "C", ITEMS);
  simulateCheck(H, "bulkPickerResults", "5");
  simulateCheck(H, "bulkPickerResults", "6");
  assert.deepEqual(H.state().bulkSelectedIds.sort((a, b) => a - b), [5, 6]);

  const cb5 = findCheckbox({ doc: H.doc }, "bulkPickerResults", "5");
  cb5.checked = false;
  cb5.dispatchEvent(new Event("change"));
  assert.deepEqual(H.state().bulkSelectedIds, [6], "deselected item removed");
});

test("bulk: partial Add Selected success with string ids removes only succeeded items", async () => {
  const { H } = makeHarness();
  H.H || H; // noop guard
  const sec = { id: 9, name: "Sec", code: "S9", items: [], has_rooms: false, rooms: [] };
  H.set.sections([sec]);
  H.set.activeSectionIdx(0);
  H.set.activeRoomIdx(null);
  H.set.currentQuoteId(123);

  await openAndResolve(H, 9, "Cat", [
    { id: "11", name: "I1", item_code: "C1", unit: "u", base_cost: 1, overhead_pct: 35, selling_price: 1.35, category_id: null },
    { id: "12", name: "I2", item_code: "C2", unit: "u", base_cost: 2, overhead_pct: 35, selling_price: 2.7, category_id: null },
  ]);
  simulateCheck(H, "bulkPickerResults", "11");
  simulateCheck(H, "bulkPickerResults", "12");
  assert.equal(H.state().bulkSelectedItemsSize, 2);

  H.addBulkSelectedItems();
  const batchReq = H.requestQueue.shift();
  assert.ok(batchReq && batchReq.path.includes("/items/batch"), "expected batch request");
  batchReq.resolve({
    results: [
      { index: 0, id: 500, selling_price: 1.35 },
      { index: 1, error: "dup" },
    ],
  });
  await flushAll(3);

  const s = H.state();
  assert.deepEqual(s.bulkSelectedItemIds, [12], "failed item 12 retained in basket");
  assert.equal(s.bulkSelectedItemsSize, 1);
  assert.equal(s.sectionsItemCount, 1, "one item pushed into the section");
  assert.equal(s.bulkPickerView, "review", "review view shown after partial success");
  assert.equal(H.calls.renderAll > 0, true, "renderAll called");
  assert.equal(H.calls.toasts.length > 0, true, "a toast was shown");
});

test("bulk: full success clears basket", async () => {
  const { H } = makeHarness();
  const sec = { id: 7, name: "Sec", code: "S7", items: [], has_rooms: false, rooms: [] };
  H.set.sections([sec]);
  H.set.activeSectionIdx(0);
  H.set.currentQuoteId(77);

  await openAndResolve(H, 7, "C", [
    { id: "201", name: "X", item_code: "", unit: "u", selling_price: 5, category_id: null },
    { id: "202", name: "Y", item_code: "", unit: "u", selling_price: 5, category_id: null },
  ]);
  simulateCheck(H, "bulkPickerResults", "201");
  simulateCheck(H, "bulkPickerResults", "202");

  H.addBulkSelectedItems();
  H.requestQueue.shift().resolve({
    results: [{ index: 0, id: 600, selling_price: 5 }, { index: 1, id: 601, selling_price: 5 }],
  });
  await flushAll(4);

  const s = H.state();
  assert.deepEqual(s.bulkSelectedIds, [], "basket cleared on full success");
  assert.equal(s.bulkSelectedItemsSize, 0);
});

test("bulk: total batch failure preserves basket", async () => {
  const { H } = makeHarness();
  const sec = { id: 3, name: "Sec", code: "S3", items: [], has_rooms: false, rooms: [] };
  H.set.sections([sec]);
  H.set.activeSectionIdx(0);
  H.set.currentQuoteId(33);

  await openAndResolve(H, 3, "C", [
    { id: "301", name: "A", item_code: "", unit: "u", selling_price: 10, category_id: null },
  ]);
  simulateCheck(H, "bulkPickerResults", "301");

  H.addBulkSelectedItems();
  const req = H.requestQueue.shift();
  req.reject(new Error("boom"));
  await flushAll(3);

  const s = H.state();
  assert.deepEqual(s.bulkSelectedIds, [301], "basket preserved after total failure");
  assert.equal(s.bulkSelectedItemsSize, 1);
  assert.equal(s.bulkPickerView, "items", "view unchanged after failure");
});

// ---- Bulk Picker: Stale A/B Requests ----

test("bulk: out-of-order section requests — newer wins, stale dropped", async () => {
  const { H, doc } = makeHarness();

  H.openBulkSectionItems(1, "A", "disc");
  const reqA = H.requestQueue.shift();
  H.openBulkSectionItems(2, "B", "disc");
  const reqB = H.requestQueue.shift();

  // B resolves first → renders B items
  reqB.resolve({ items: [{ id: "200", name: "B item", item_code: "B1", unit: "u", selling_price: 5 }] });
  await flushAll(3);

  // A resolves later → stale session, must be dropped
  reqA.resolve({ items: [{ id: "100", name: "A item", item_code: "A1", unit: "u", selling_price: 5 }] });
  await flushAll(2);

  const html = doc.getElementById("bulkPickerResults").innerHTML;
  assert.ok(!html.includes("A item"), "stale A item must not appear");
  assert.ok(html.includes("B item"), "B item must be rendered");
});

test("bulk: stale empty response cannot overwrite current category", async () => {
  const { H, doc } = makeHarness();

  H.openBulkSectionItems(1, "A", "d");
  const reqA = H.requestQueue.shift();
  H.openBulkSectionItems(2, "B", "d");
  const reqB = H.requestQueue.shift();

  reqB.resolve({ items: [{ id: 200, name: "B", item_code: "B1", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  reqA.resolve({ items: [] }); // stale empty
  await flushAll(2);

  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("B"), "B item still rendered");
});

test("bulk: stale error response cannot overwrite current category", async () => {
  const { H, doc } = makeHarness();

  H.openBulkSectionItems(1, "A", "d");
  const reqA = H.requestQueue.shift();
  H.openBulkSectionItems(2, "B", "d");
  const reqB = H.requestQueue.shift();

  reqB.resolve({ items: [{ id: 201, name: "B1", item_code: "B1", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  reqA.reject(new Error("network")); // stale error
  await flushAll(2);

  const html = doc.getElementById("bulkPickerResults").innerHTML;
  assert.ok(html.includes("B1"), "B1 item still rendered");
  assert.ok(!html.includes("صار في خطأ"), "stale error not shown");
});

test("bulk: search change invalidates in-flight request and shows loading state", async () => {
  const { H, doc, requestQueue, flushTimers } = makeHarness();

  H.openBulkSectionItems(1, "A", "d");
  const req1 = H.requestQueue.shift();

  // Before resolving, user types in the search box → session bump + debounce
  const searchEl = doc.getElementById("bulkPickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();
  flushTimers();
  const req2 = H.requestQueue.shift();
  assert.ok(req2, "search-triggered request should exist");
  assert.ok(
    doc.getElementById("bulkPickerResults").innerHTML.includes("جاري التحميل"),
    "loading state shown as soon as the new request starts",
  );

  // Resolve the search request first → renders empty
  req2.resolve({ items: [] });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("ما في نتائج"), "search empty state");

  // Old request resolves with items → stale, must not render
  req1.resolve({ items: [{ id: 100, name: "old", item_code: "O", unit: "u", selling_price: 5 }] });
  await flushAll(2);
  assert.ok(!doc.getElementById("bulkPickerResults").innerHTML.includes("old"), "stale request dropped");
});

test("bulk: search hide/reveal keeps selection", async () => {
  const { H, doc, flushTimers } = makeHarness();
  const ITEMS = [
    { id: "50", name: "Alpha", item_code: "A50", unit: "u", selling_price: 5, category_id: null },
    { id: "51", name: "Beta", item_code: "B51", unit: "u", selling_price: 5, category_id: null },
  ];
  await openAndResolve(H, 1, "A", ITEMS);
  simulateCheck(H, "bulkPickerResults", "50");

  // Search for "zzz" → results become empty (selection persists in basket)
  const searchEl = doc.getElementById("bulkPickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();
  flushTimers();
  assert.equal(H.requestQueue.length, 1);
  H.requestQueue.shift().resolve({ items: [] });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("ما في نتائج"), "search hides items");
  assert.deepEqual(H.state().bulkSelectedIds, [50], "selection survives search hide");

  // Clear search → items return, selection persists
  searchEl.value = "";
  searchEl.oninput();
  flushTimers();
  H.requestQueue.shift().resolve({ items: ITEMS });
  await flushAll(3);
  const cb50 = findCheckbox({ doc }, "bulkPickerResults", "50");
  assert.ok(cb50 && cb50.checked, "item 50 still checked after search reveal");
});

test("bulk: leave category → return → checkbox remains selected", async () => {
  const { H, doc } = makeHarness();
  const ITEMS_A = [
    { id: "17", name: "X", item_code: "A1", unit: "u", selling_price: 5, category_id: null },
    { id: "18", name: "Y", item_code: "A2", unit: "u", selling_price: 5, category_id: null },
  ];

  // A → B → A with ALL requests left unresolved so they overlap and get
  // resolved out of order below.
  H.openBulkSectionItems(1, "A", "d");
  const reqA1 = H.requestQueue.shift();
  assert.ok(reqA1, "first A request");
  H.openBulkSectionItems(2, "B", "d");
  const reqB = H.requestQueue.shift();
  assert.ok(reqB, "B request");
  H.openBulkSectionItems(1, "A", "d");
  const reqA2 = H.requestQueue.shift();
  assert.ok(reqA2, "second A request");

  // Out-of-order resolution: B empty, then STALE first-A response, then current A2
  reqB.resolve({ items: [] });
  await flushAll(3);
  reqA1.resolve({
    items: [
      { id: "17", name: "STALE-A", item_code: "A1", unit: "u", selling_price: 5, category_id: null },
      { id: "18", name: "STALE-A2", item_code: "A2", unit: "u", selling_price: 5, category_id: null },
    ],
  });
  await flushAll(2);
  assert.ok(
    !doc.getElementById("bulkPickerResults").innerHTML.includes("STALE-A"),
    "stale first-A response must not render",
  );

  reqA2.resolve({ items: ITEMS_A });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("X"), "current A rendered");
  assert.deepEqual(H.state().bulkSelectedIds, [], "no selections leaked from stale rendering");

  simulateCheck(H, "bulkPickerResults", "17");
  simulateCheck(H, "bulkPickerResults", "18");
  assert.deepEqual(H.state().bulkSelectedIds.sort((a, b) => a - b), [17, 18]);

  // Leave to B (empty) and return to A — again overlapping, out of order
  H.openBulkSectionItems(2, "B", "d");
  const reqB2 = H.requestQueue.shift();
  assert.ok(reqB2, "second B request");
  H.openBulkSectionItems(1, "A", "d");
  const reqA3 = H.requestQueue.shift();
  assert.ok(reqA3, "third A request");
  reqB2.resolve({ items: [] });
  await flushAll(3);
  reqA3.resolve({ items: ITEMS_A });
  await flushAll(3);

  const cb17 = findCheckbox({ doc }, "bulkPickerResults", "17");
  const cb18 = findCheckbox({ doc }, "bulkPickerResults", "18");
  assert.ok(cb17.checked, "item 17 remains checked");
  assert.ok(cb18.checked, "item 18 remains checked");
  assert.ok(
    cb17.closest(".bulk-picker-item") &&
      cb17.closest(".bulk-picker-item")._classes.has("bp-selected"),
    "item 17 row has bp-selected",
  );
});

test("bulk: close/reopen with pending request drops stale render", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], [{ id: 10, name: "Cat10", _disciplineId: 1, item_count: 1 }]);

  H.openBulkPicker();
  H.openBulkSectionItems(10, "Cat10", "D1");
  const req = H.requestQueue.shift();
  assert.ok(req, "expected request");

  H.closeBulkPicker();
  assert.equal(H.state().bulkPickerView, "specialties");

  // Reopen WHILE the old request is still unresolved
  H.openBulkPicker();
  assert.equal(H.state().bulkPickerView, "specialties", "view reset to specialties on reopen");

  // Old request resolves only AFTER reopen — must be dropped, cannot render
  req.resolve({ items: [{ id: 100, name: "X", item_code: "X", unit: "u", selling_price: 5 }] });
  await flushAll(2);
  assert.ok(!doc.getElementById("bulkPickerResults").innerHTML.includes("X"), "stale result must not render after reopen");
});

// ---- Single Picker: Lifecycle ----

test("single: out-of-order category requests — newer wins", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(
    H,
    [{ id: 1, name: "D1" }],
    [
      { id: 10, name: "A", _disciplineId: 1, item_count: 1 },
      { id: 20, name: "B", _disciplineId: 1, item_count: 1 },
    ],
  );

  H.openPicker(0, 10);
  const req0 = H.requestQueue.shift();
  assert.ok(req0, "request for cat 10");

  const btn20 = doc
    .getElementById("pickerCats")
    .querySelectorAll(".picker-cat-btn")
    .find((b) => b.dataset.id === "20");
  assert.ok(btn20, "cat 20 button found");
  btn20.onclick();
  const req1 = H.requestQueue.shift();

  req1.resolve({ items: [{ id: "900", name: "cat20 item", unit: "u", selling_price: 3 }] });
  await flushAll(3);

  req0.resolve({ items: [{ id: "800", name: "cat10 item", unit: "u", selling_price: 3 }] });
  await flushAll(2);

  const html = doc.getElementById("pickerResults").innerHTML;
  assert.ok(html.includes("cat20 item"), "cat20 item rendered");
  assert.ok(!html.includes("cat10 item"), "stale cat10 item not rendered");
});

test("single: stale empty/error response cannot overwrite current category", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(
    H,
    [{ id: 1, name: "D1" }],
    [
      { id: 10, name: "A", _disciplineId: 1, item_count: 1 },
      { id: 20, name: "B", _disciplineId: 1, item_count: 1 },
    ],
  );

  // Empty stale
  H.openPicker(0, 10);
  const req0 = H.requestQueue.shift();
  const btn20 = () =>
    doc
      .getElementById("pickerCats")
      .querySelectorAll(".picker-cat-btn")
      .find((b) => b.dataset.id === "20");
  btn20().onclick();
  const req1 = H.requestQueue.shift();
  req1.resolve({ items: [{ id: 901, name: "B-item", unit: "u", selling_price: 3 }] });
  await flushAll(3);
  req0.resolve({ items: [] }); // stale empty
  await flushAll(2);
  assert.ok(doc.getElementById("pickerResults").innerHTML.includes("B-item"), "B-item still shown after stale empty");

  // Error stale
  H.openPicker(0, 10);
  const req2 = H.requestQueue.shift();
  btn20().onclick();
  const req3 = H.requestQueue.shift();
  req3.resolve({ items: [{ id: 902, name: "B2", unit: "u", selling_price: 3 }] });
  await flushAll(3);
  req2.reject(new Error("net")); // stale error
  await flushAll(2);
  const html = doc.getElementById("pickerResults").innerHTML;
  assert.ok(html.includes("B2"), "B2 shown, stale error dropped");
  assert.ok(!html.includes("صار في خطأ"), "stale error not shown");
});

test("single: close/reopen with pending request drops stale render", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], [{ id: 10, name: "A", _disciplineId: 1, item_count: 1 }]);

  H.openPicker(0, 10);
  const req = H.requestQueue.shift();
  H.closePicker(); // bumps session

  // Reopen WHILE the old request is still unresolved
  H.openPicker(0, 10);
  const req2 = H.requestQueue.shift();
  assert.ok(req2, "fresh request issued on reopen");

  // Old request resolves only AFTER reopen — must be dropped, cannot render
  req.resolve({ items: [{ id: 500, name: "stale", unit: "u", selling_price: 1 }] });
  await flushAll(2);
  assert.ok(
    !doc.getElementById("pickerResults").innerHTML.includes("stale"),
    "stale result not rendered after reopen",
  );

  req2.resolve({ items: [{ id: 501, name: "fresh", unit: "u", selling_price: 1 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("pickerResults").innerHTML.includes("fresh"), "fresh item rendered after reopen");
});

// ==========================================================================
// Codex async review findings
// ==========================================================================

// ---- 1. Delayed discipline continuation ----

test("bulk: stale discipline toggle continuation cannot restore a stale pane", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], []);

  H.openBulkPicker();
  const hdr = doc.getElementById("bulkDiscList").querySelector(".bp-discipline-header");
  assert.ok(hdr, "discipline header rendered");
  assert.equal(hdr.dataset.discId, "1", "stub exposes realistic dataset.discId");

  hdr.onclick();
  const reqSections = H.requestQueue.shift();
  assert.ok(reqSections && reqSections.path.includes("/disciplines/1/sections"), "sections request issued by toggle");

  // Navigate to review before the sections response arrives
  H.openBulkReview();
  assert.equal(H.state().bulkPickerView, "review");

  // Stale response arrives after navigation — toggle continuation must NOT
  // restore the specialties pane.
  reqSections.resolve({ sections: [{ id: 5, name: "SecA" }] });
  await flushAll(3);

  assert.equal(H.state().bulkPickerView, "review", "view stays review — stale toggle continuation dropped");
  assert.equal(doc.getElementById("bulkReviewView").style.display, "block");
  assert.equal(doc.getElementById("bulkSpecialtyView").style.display, "none");
  const secWrap = doc.querySelector('.bp-discipline-sections[data-disc-id="1"]');
  assert.ok(secWrap, "sections wrapper exists");
  assert.ok(!secWrap.innerHTML.includes("SecA"), "stale sections not rendered into wrapper");
});

test("bulk: stale discipline toggle continuation dropped after back navigation", async () => {
  const { H, doc } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], []);

  H.openBulkPicker();
  H.openBulkSectionItems(10, "Cat10", "D1");
  let req = H.requestQueue.shift();
  req.resolve({ items: [{ id: "1", name: "I1", item_code: "I1", unit: "u", selling_price: 5, category_id: null }] });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("I1"), "items view established");

  H.goBackToSpecialties();
  const hdr = doc.getElementById("bulkDiscList").querySelector(".bp-discipline-header");
  assert.ok(hdr, "discipline header rendered after back");

  hdr.onclick();
  const reqSections = H.requestQueue.shift();
  assert.ok(reqSections && reqSections.path.includes("/disciplines/1/sections"), "sections request issued");

  // User navigates to review and then back — view becomes items again
  H.openBulkReview();
  H.goBackFromReview();
  assert.equal(H.state().bulkPickerView, "items");

  reqSections.resolve({ sections: [{ id: 5, name: "SecA" }] });
  await flushAll(3);

  assert.equal(H.state().bulkPickerView, "items", "view stays items — stale toggle continuation dropped");
  assert.equal(doc.getElementById("bulkItemView").style.display, "flex");
  assert.equal(doc.getElementById("bulkSpecialtyView").style.display, "none");
  const secWrap = doc.querySelector('.bp-discipline-sections[data-disc-id="1"]');
  assert.ok(secWrap && !secWrap.innerHTML.includes("SecA"), "stale sections not rendered into wrapper");
});

// ---- 2. Interrupted category-cache initialization ----

test("bulk: interrupted metadata init resumes and completes on reopen", async () => {
  const { H, doc } = makeHarness(); // empty cache → init will run

  // Open 1: disciplines → categories → annotation
  H.openBulkPicker();
  const reqDiscs = H.requestQueue.shift();
  assert.ok(reqDiscs && reqDiscs.path === "/disciplines", "disciplines fetched first");
  reqDiscs.resolve({ disciplines: [{ id: 1, name: "D1" }, { id: 2, name: "D2" }] });
  await flushAll(3);

  const reqPrice = H.requestQueue.shift();
  assert.ok(reqPrice.path === "/price-list", "price list fetched next");
  reqPrice.resolve({ categories: [{ id: 10, name: "Cat10", item_count: 1 }] });
  await flushAll(3);

  const reqSecs = H.requestQueue.shift();
  assert.ok(reqSecs.path === "/disciplines/1/sections", "annotation started for D1");

  // Interrupt: close before the annotation response lands
  H.closeBulkPicker();
  reqSecs.resolve({ sections: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);

  // Cache is populated but NOT marked ready — a reopen must retry annotation
  assert.equal(H.state().pickerMetaReady, false, "partial init must not mark cache ready");

  // Open 2: annotation resumes; price-list must NOT be refetched (cache kept)
  H.openBulkPicker();
  const reqSecs2 = H.requestQueue.shift();
  assert.ok(reqSecs2.path === "/disciplines/1/sections", "annotation resumed, price-list not refetched");
  reqSecs2.resolve({ sections: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);

  const reqSecsDisc2 = H.requestQueue.shift();
  assert.ok(reqSecsDisc2.path === "/disciplines/2/sections", "annotation for second discipline");
  reqSecsDisc2.resolve({ sections: [] });
  await flushAll(3);

  assert.equal(H.state().pickerMetaReady, true, "metadata ready after completed init");
  const meta = H.state().catsMeta;
  assert.equal(meta.length, 1);
  assert.equal(meta[0]._disciplineId, 1, "category annotated to discipline 1");
  const discsHtml = doc.getElementById("bulkDiscList").innerHTML;
  assert.ok(discsHtml.includes("D1"), "D1 rendered after resume");
  assert.ok(discsHtml.includes("D2"), "D2 rendered after resume");
});

test("single: interrupted metadata init resumes and recovers on reopen", async () => {
  const { H, doc } = makeHarness();

  H.openPicker(0, null);
  const reqDiscs = H.requestQueue.shift();
  assert.ok(reqDiscs.path === "/disciplines", "disciplines fetched first");
  reqDiscs.resolve({ disciplines: [{ id: 1, name: "D1" }] });
  await flushAll(3);

  const reqPrice = H.requestQueue.shift();
  assert.ok(reqPrice.path === "/price-list", "price list fetched next");
  reqPrice.resolve({ categories: [{ id: 10, name: "Cat10", item_count: 1 }] });
  await flushAll(3);

  const reqSecs = H.requestQueue.shift();
  assert.ok(reqSecs.path === "/disciplines/1/sections", "annotation started");

  H.closePicker();
  reqSecs.resolve({ sections: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);
  assert.equal(H.state().pickerMetaReady, false, "partial init must not mark cache ready");

  H.openPicker(0, 10);
  const reqSecs2 = H.requestQueue.shift();
  assert.ok(reqSecs2.path === "/disciplines/1/sections", "annotation resumed, price-list not refetched");
  reqSecs2.resolve({ sections: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);

  assert.equal(H.state().pickerMetaReady, true, "metadata ready after completed init");
  assert.equal(H.state().catsMeta[0]._disciplineId, 1, "category annotated to discipline 1");

  const reqItems = H.requestQueue.shift();
  assert.ok(reqItems && reqItems.path.includes("/items"), "items request for preselected category");
  reqItems.resolve({ items: [{ id: 1, name: "Recovered", unit: "u", selling_price: 5 }] });
  await flushAll(3);

  const btn = doc.getElementById("pickerCats").querySelector('.picker-cat-btn[data-id="10"]');
  assert.ok(btn, "category button rendered after recovery");
  assert.ok(doc.getElementById("pickerResults").innerHTML.includes("Recovered"), "items rendered after recovery");
});

// ---- 3. Pending debounce callbacks ----

test("bulk: pending search timer is dropped after close — no request, no DOM write", async () => {
  const { H, doc, requestQueue, flushTimers } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], []);

  H.openBulkPicker(); // specialties view, cache ready → no metadata requests
  H.openBulkSectionItems(10, "Cat10", "D1");
  const req = requestQueue.shift();
  req.resolve({ items: [{ id: "7", name: "Visible", item_code: "V", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  const before = doc.getElementById("bulkPickerResults").innerHTML;
  assert.ok(before.includes("Visible"), "items rendered");

  // Type search → debounce timer scheduled
  const searchEl = doc.getElementById("bulkPickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();

  // Close before the debounce fires
  H.closeBulkPicker();
  flushTimers(); // fire whatever may remain — nothing may start

  assert.equal(requestQueue.length, 0, "no search request started after close");
  const after = doc.getElementById("bulkPickerResults").innerHTML;
  assert.ok(after.includes("Visible"), "results pane untouched by stale timer");
  assert.ok(!after.includes("جاري التحميل"), "no loading-state DOM write from stale timer");
});

test("bulk: pending search timer is dropped after navigation — no request, no DOM write", async () => {
  const { H, doc, requestQueue, flushTimers } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], []);

  H.openBulkPicker();
  H.openBulkSectionItems(10, "Cat10", "D1");
  const req = requestQueue.shift();
  req.resolve({ items: [{ id: "7", name: "Alpha", item_code: "A", unit: "u", selling_price: 5 }] });
  await flushAll(3);

  // Type search → debounce timer scheduled
  const searchEl = doc.getElementById("bulkPickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();

  // Navigate to another section before the debounce fires
  H.openBulkSectionItems(20, "Cat20", "D1");
  const navReq = requestQueue.shift();
  assert.ok(navReq, "navigation request issued");
  flushTimers(); // pending search timer must have been dropped

  assert.equal(requestQueue.length, 0, "no extra search request after navigation");
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("جاري التحميل"), "loading state from navigation request only");
  navReq.resolve({ items: [{ id: "8", name: "Bravo", item_code: "B", unit: "u", selling_price: 6 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("Bravo"), "navigation results rendered");
});

test("single: pending search timer is dropped after close — no request, no DOM write", async () => {
  const { H, doc, flushTimers } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], [{ id: 10, name: "A", _disciplineId: 1, item_count: 1 }]);

  H.openPicker(0, 10);
  const req = H.requestQueue.shift();
  assert.ok(req && req.path.includes("/items"), "items request issued");
  req.resolve({ items: [{ id: 55, name: "SingleItem", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("pickerResults").innerHTML.includes("SingleItem"), "items rendered");

  const searchEl = doc.getElementById("pickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();

  H.closePicker();
  flushTimers();

  assert.equal(H.requestQueue.length, 0, "no search request after close");
  const after = doc.getElementById("pickerResults").innerHTML;
  assert.ok(after.includes("SingleItem"), "results untouched by stale timer");
  assert.ok(!after.includes("جاري التحميل"), "no loading write from stale timer");
});

// ---- 4. Stale rejected metadata requests must never corrupt a recovered cache ----

test("bulk: stale rejected metadata request cannot corrupt a recovered cache", async () => {
  const { H, requestQueue } = makeHarness();
  H.set.allDisciplines([{ id: 1, name: "D1" }]);
  H.set.allPickerCategories([]);

  H.openBulkPicker();
  const priceReq = requestQueue.shift();
  assert.ok(priceReq && priceReq.path === "/price-list", "/price-list fetched");
  priceReq.resolve({ categories: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);

  const secReq = requestQueue.shift();
  assert.ok(secReq && secReq.path === "/disciplines/1/sections", "annotation request in flight");

  H.set.allPickerCategories([{ id: 10, name: "Cat10", _disciplineId: 1 }]);
  H.set.pickerMetaReady(true);
  H.closeBulkPicker();
  H.openBulkPicker();
  assert.equal(requestQueue.length, 0, "reopened picker issues no metadata requests");

  secReq.reject({ error: "boom" });
  await flushAll(3);

  const s = H.state();
  assert.equal(s.pickerMetaReady, true, "recovered cache stays ready");
  assert.deepEqual(s.catsMeta, [{ id: 10, _disciplineId: 1 }], "annotation not corrupted by stale rejection");
  assert.deepEqual(s.discsMeta, [{ id: 1, name: "D1" }], "disciplines unchanged");
});

test("single: stale rejected metadata request cannot corrupt a recovered cache", async () => {
  const { H, requestQueue } = makeHarness();
  H.set.allDisciplines([{ id: 1, name: "D1" }]);
  H.set.allPickerCategories([]);

  H.openPicker(0, 10);
  const priceReq = requestQueue.shift();
  assert.ok(priceReq && priceReq.path === "/price-list", "/price-list fetched");
  priceReq.resolve({ categories: [{ id: 10, name: "Cat10" }] });
  await flushAll(3);

  const secReq = requestQueue.shift();
  assert.ok(secReq && secReq.path === "/disciplines/1/sections", "annotation request in flight");

  H.set.allPickerCategories([{ id: 10, name: "Cat10", _disciplineId: 1 }]);
  H.set.pickerMetaReady(true);
  H.closePicker();
  H.openPicker(0, 10);
  const itemsReq = requestQueue.shift();
  assert.ok(itemsReq && itemsReq.path === "/price-list/10/items", "recovered session loads items");
  itemsReq.resolve({ items: [{ id: 55, name: "Recovered", unit: "u", selling_price: 5 }] });
  await flushAll(3);

  secReq.reject({ error: "boom" });
  await flushAll(3);

  const s = H.state();
  assert.equal(s.pickerMetaReady, true, "recovered cache stays ready");
  assert.deepEqual(s.catsMeta, [{ id: 10, _disciplineId: 1 }], "annotation not corrupted by stale rejection");
  assert.ok(H.doc.getElementById("pickerResults").innerHTML.includes("Recovered"), "recovered session renders intact");
});

test("single: typing in search during initialization does not strand the picker", async () => {
  const { H, doc, requestQueue } = makeHarness();
  H.set.allDisciplines([{ id: 1, name: "D1" }]);
  H.set.allPickerCategories([{ id: 10, name: "Cat10", item_count: 1 }]);

  H.openPicker(0, 10);
  const secReq = requestQueue.shift();
  assert.ok(secReq && secReq.path === "/disciplines/1/sections", "annotation in flight");

  const searchEl = doc.getElementById("pickerSearch");
  searchEl.value = "zzz";
  const sessBefore = H.state().pickerSession;
  searchEl.oninput();
  assert.equal(H.state().pickerSession, sessBefore, "keystroke must not invalidate in-flight init");
  assert.equal(requestQueue.length, 0, "no search request during init");

  secReq.resolve({ sections: [{ id: 10, discipline_id: 1 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("pickerCats").innerHTML.includes("Cat10"), "categories rendered");

  const itemsReq = requestQueue.shift();
  assert.ok(itemsReq && itemsReq.path === "/price-list/10/items?q=zzz", "items request issued for typed search");
  itemsReq.resolve({ items: [{ id: 55, name: "FetchMe", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("pickerResults").innerHTML.includes("FetchMe"), "picker fully functional — not stranded");
  assert.equal(H.state().pickerActiveCatId, 10, "category remains active");
});

test("bulk: stale search debounce with captured session cannot start a request after a bump", async () => {
  const { H, doc, requestQueue, timers } = makeHarness();
  setupPickerCats(H, [{ id: 1, name: "D1" }], []);

  H.openBulkPicker();
  H.openBulkSectionItems(10, "Cat10", "D1");
  const req = requestQueue.shift();
  assert.ok(req && req.path.includes("/items"), "items request issued");
  req.resolve({ items: [{ id: "7", name: "Visible", item_code: "V", unit: "u", selling_price: 5 }] });
  await flushAll(3);
  assert.ok(doc.getElementById("bulkPickerResults").innerHTML.includes("Visible"), "items rendered");

  const searchEl = doc.getElementById("bulkPickerSearch");
  searchEl.value = "zzz";
  searchEl.oninput();
  assert.equal(timers.length, 1, "search debounce scheduled");
  const heldFn = timers[0].fn;

  H.removeBulkItem(999);
  heldFn();
  await flushAll(3);

  assert.equal(requestQueue.length, 0, "captured-session stale callback started no request");
});