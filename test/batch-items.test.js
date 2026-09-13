const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

if (!process.env.DATABASE_URL && !process.env.DATABASE_PATH) {
  const batchDbPath = path.join(__dirname, "..", "data", "batch-items-test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(batchDbPath + suffix, { force: true });
  }
  process.env.DATABASE_PATH = batchDbPath;
}

const db = require("../db");
const { createApp } = require("../server");
const { MAX_BATCH_ITEMS } = require("../routes/items");

let server;
let baseUrl;

function makeToken(userId, role) {
  return jwt.sign({ id: userId, role, permissions: {} }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function api(method, p, body, token) {
  const url = baseUrl + p;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = {};
        }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function seedTestData() {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("testpass", 10);

  async function createUser(email, role) {
    let u = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!u) {
      const info = await db
        .prepare(
          "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'approved')",
        )
        .run("Batch Test", email, hash, role);
      u = { id: info.lastInsertRowid };
    }
    return { id: u.id };
  }

  const owner = await createUser("batch-owner@test.com", "owner");
  const designerA = await createUser("batch-designer-a@test.com", "designer");
  const designerB = await createUser("batch-designer-b@test.com", "designer");

  async function createQuote(userId, name) {
    const info = await db
      .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, '{}')")
      .run(userId.id, name);
    return { id: info.lastInsertRowid };
  }

  const quoteA = await createQuote(designerA, "Batch Quote A");
  const quoteB = await createQuote(designerB, "Batch Quote B");

  async function createSection(quoteId, code, name) {
    const info = await db
      .prepare(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, 0, 0)",
      )
      .run(quoteId.id, code, name);
    return { id: info.lastInsertRowid };
  }

  const secA = await createSection(quoteA, "BA", "Batch Section A");
  const secB = await createSection(quoteB, "BB", "Batch Section B");

  return { owner, designerA, designerB, quoteA, quoteB, secA, secB };
}

async function getSectionItems(sectionId, token) {
  const res = await api("GET", `/sections/${sectionId}/items`, null, token);
  assert.equal(res.status, 200, `GET items failed: ${JSON.stringify(res.body)}`);
  return res.body.items;
}

test.before(async () => {
  await db.initializeDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}/api`;
});

test.after(() => {
  if (server) server.close();
});

test("batch with multiple valid items inserts all items with indexes, ids and selling prices", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { item_code: "BT.1", name: "Batch Item 1", base_cost: 1000 },
        { name: "Batch Item 2 (no cost)" },
        { base_cost: 200 },
      ],
    },
    tok,
  );

  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.results.length, 3);
  assert.deepEqual(
    res.body.results.map((r) => r.index),
    [0, 1, 2],
    "results must preserve input indexes",
  );

  for (const r of res.body.results) {
    assert.ok(r.id != null, `result index ${r.index} must have an id`);
    assert.equal(typeof r.selling_price, "number");
    assert.equal(r.error, undefined);
  }
  assert.deepEqual(
    res.body.results.map((r) => r.selling_price),
    [1350, 0, 270],
    "selling_price must be computed exactly like the single-item endpoint (base_cost * (1 + overhead_pct/100))",
  );

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => i.sort_order),
    [0, 1, 2],
    "sort_order must be deterministic and sequential",
  );
  assert.deepEqual(
    items.map((i) => Number(i.id)),
    res.body.results.map((r) => Number(r.id)),
    "returned ids must match the inserted rows",
  );
});

test("sort_order continues from the existing MAX and honors an explicit sort_order override", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  await db
    .prepare(
      "INSERT INTO items (section_id, item_code, name, base_cost, overhead_pct, selling_price, sort_order) VALUES (?,?,?,0,35,0,0)",
    )
    .run(d.secA.id, "PRE", "Pre Existing");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    { items: [{ name: "Auto Order" }, { name: "Explicit Order", sort_order: 42 }] },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const items = await getSectionItems(d.secA.id, tok);
  assert.deepEqual(
    items.sort((a, b) => a.sort_order - b.sort_order).map((i) => i.name),
    ["Pre Existing", "Auto Order", "Explicit Order"],
  );
  const autoOrder = items.find((i) => i.name === "Auto Order");
  const explicitOrder = items.find((i) => i.name === "Explicit Order");
  assert.equal(autoOrder.sort_order, 1, "default sort_order must continue from the single MAX");
  assert.equal(explicitOrder.sort_order, 42, "explicit sort_order override must be preserved");
});

test("mixed valid and invalid items: valid items inserted, invalid items reported as errors", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { name: "Good 0", base_cost: 100 },
        {},
        { name: "Good 2", base_cost: 50 },
        { name: "" },
      ],
    },
    tok,
  );

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(
    res.body.results.map((r) => r.index),
    [0, 1, 2, 3],
    "indexes must match the input positions even with failures",
  );
  assert.equal(res.body.results[0].id != null, true);
  assert.equal(res.body.results[1].id, undefined);
  assert.ok(res.body.results[1].error, "invalid item should return an error");
  assert.equal(res.body.results[2].id != null, true);
  assert.equal(res.body.results[2].selling_price, 67.5);
  assert.equal(res.body.results[3].id, undefined);
  assert.ok(res.body.results[3].error, "blank item should return an error");

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 2, "only valid items may be inserted");
});

test("a failed item does not prevent later valid items from succeeding", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { name: "First", base_cost: 100 },
        { name: "Broken", category_id: 987654321 },
        { name: "Last", base_cost: 200 },
      ],
    },
    tok,
  );

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.results[0].id != null, true, "item before the failure must succeed");
  assert.equal(res.body.results[1].id, undefined);
  assert.ok(res.body.results[1].error, "FK violation must be reported per-item");
  assert.equal(res.body.results[2].id != null, true, "item after the failure must succeed");

  const items = await getSectionItems(d.secA.id, tok);
  assert.deepEqual(
    items.map((i) => i.name).sort(),
    ["First", "Last"],
    "failed item must not prevent valid items from being inserted",
  );
});

test("foreign/unauthorized section is rejected with 403 and no items inserted", async () => {
  const d = await seedTestData();
  const tokA = makeToken(d.designerA.id, "designer");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secB.id)).c,
  );

  const res = await api(
    "POST",
    `/sections/${d.secB.id}/items/batch`,
    { items: [{ name: "Nope", base_cost: 100 }] },
    tokA,
  );

  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const after = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secB.id)).c,
  );
  assert.equal(after, before, "no items may be inserted into an unauthorized section");
});

test("empty batch array is rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api("POST", `/sections/${d.secA.id}/items/batch`, { items: [] }, tok);
  assert.equal(res.status, 400, `Expected 400 but got ${res.status}`);
  assert.ok(res.body.error, "rejection must carry an error message");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secA.id)).c,
  );
  assert.equal(before, 0);
});

test("non-array payload is rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const noItems = await api("POST", `/sections/${d.secA.id}/items/batch`, {}, tok);
  assert.equal(noItems.status, 400, "missing items key must be rejected");

  const notArray = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    { items: "not-an-array" },
    tok,
  );
  assert.equal(notArray.status, 400, "items field must be an array");

  const obj = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    { items: { name: "single object" } },
    tok,
  );
  assert.equal(obj.status, 400, "items as an object must be rejected");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secA.id)).c,
  );
  assert.equal(before, 0, "no items may be inserted for rejected payloads");
});

test("batch above the size limit is rejected and inserts nothing", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    { items: Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => ({ name: "x" })) },
    tok,
  );
  assert.equal(res.status, 400, `Expected 400 but got ${res.status}`);
  assert.ok(res.body.error, "rejection must carry an error message");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secA.id)).c,
  );
  assert.equal(before, 0);
});

test("a batch exactly at the size limit is accepted", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    { items: Array.from({ length: MAX_BATCH_ITEMS }, (_, i) => ({ name: `Item ${i}` })) },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.results.length, MAX_BATCH_ITEMS);

  const count = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM items WHERE section_id = ?").get(d.secA.id)).c,
  );
  assert.equal(count, MAX_BATCH_ITEMS);
});

test("duplicate catalog items remain allowed (no deduplication)", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { item_code: "DUP", name: "Same Item", base_cost: 500 },
        { item_code: "DUP", name: "Same Item", base_cost: 500 },
      ],
    },
    tok,
  );

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.results[0].id != null, true);
  assert.equal(res.body.results[1].id != null, true);
  assert.notEqual(
    Number(res.body.results[0].id),
    Number(res.body.results[1].id),
    "duplicates must create distinct rows",
  );

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.item_code === "DUP") && items.every((i) => i.name === "Same Item"));
});

test("batch items with room_id are linked to the exact room (mixed null and non-null)", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const roomInfo = await db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, 0)")
    .run(d.secA.id, "Test Room");
  const roomId = roomInfo.lastInsertRowid;

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { item_code: "R1", name: "In Room One", base_cost: 100, room_id: roomId },
        { item_code: "R2", name: "Direct Item", base_cost: 200 },
        { item_code: "R3", name: "In Room Two", base_cost: 300, room_id: roomId },
      ],
    },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.results.every((r) => r.id != null), "all items must insert");

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 3);
  const inRoomOne = items.find((i) => i.item_code === "R1");
  const direct = items.find((i) => i.item_code === "R2");
  const inRoomTwo = items.find((i) => i.item_code === "R3");
  assert.equal(Number(inRoomOne.room_id), Number(roomId), "explicit room_id must be stored");
  assert.equal(direct.room_id, null, "omitted room_id must default to null");
  assert.equal(Number(inRoomTwo.room_id), Number(roomId), "second room-linked item must keep its room_id");

  const dbRooms = await db
    .prepare("SELECT id FROM rooms WHERE section_id = ?")
    .all(d.secA.id);
  assert.equal(dbRooms.length, 1);
});

test("batch items auto sort_order follows input index positions even when sibling entries fail", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items/batch`,
    {
      items: [
        { name: "First", base_cost: 100 },
        {},
        { name: "Third", base_cost: 300 },
      ],
    },
    tok,
  );

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.results[0].id != null, true);
  assert.equal(res.body.results[1].id, undefined);
  assert.ok(res.body.results[1].error, "invalid entry must be reported as an error");
  assert.equal(res.body.results[2].id != null, true);

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 2, "only the valid items may be inserted");
  const byCode = Object.fromEntries(items.map((i) => [i.name, i.sort_order]));
  assert.equal(byCode["First"], 0, "sort_order must equal base + input index (0)");
  assert.equal(byCode["Third"], 2, "sort_order must equal base + input index (2), leaving a gap for the failed entry");
});

test("existing single-item endpoint is unchanged and still works", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/items`,
    { item_code: "SINGLE", name: "Single Item", base_cost: 1000 },
    tok,
  );
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.id != null, "single-item endpoint must return an id");
  assert.equal(res.body.selling_price, 1350);

  const items = await getSectionItems(d.secA.id, tok);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Single Item");
  assert.equal(items[0].sort_order, 0);
});