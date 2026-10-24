const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const reorderDbPath = path.join(__dirname, "..", "data", "reorder-test.db");
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(reorderDbPath + suffix, { force: true });
}
process.env.DATABASE_PATH = reorderDbPath;

const db = require("../db");
const { createApp } = require("../server");

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
        .run("Reorder Test", email, hash, role);
      u = { id: info.lastInsertRowid };
    }
    return { id: u.id };
  }

  const owner = await createUser("reorder-owner@test.com", "owner");
  const designer = await createUser("reorder-designer@test.com", "designer");

  async function createQuote(userId, name) {
    const info = await db
      .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, '{}')")
      .run(userId.id, name);
    return { id: info.lastInsertRowid };
  }

  const quote = await createQuote(designer, "Reorder Test Quote");

  async function createSection(quoteId, code, name, sort_order) {
    const info = await db
      .prepare(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, 0)",
      )
      .run(quoteId.id, code, name, sort_order);
    return { id: info.lastInsertRowid };
  }

  const sec1 = await createSection(quote, "A", "Section A", 0);
  const sec2 = await createSection(quote, "B", "Section B", 1);

  async function createRoom(sectionId, name, sort_order) {
    const info = await db
      .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, ?)")
      .run(sectionId, name, sort_order);
    return { id: info.lastInsertRowid };
  }

  const room1 = await createRoom(sec1.id, "Room 1", 0);
  const room2 = await createRoom(sec1.id, "Room 2", 1);

  async function createItem(sectionId, name, sort_order, room_id) {
    const info = await db
      .prepare(
        "INSERT INTO items (section_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, notes, sort_order, room_id) VALUES (?, '', ?, '', 'عدد', 1, 100, 35, 135, '', ?, ?)",
      )
      .run(sectionId, name, sort_order, room_id ?? null);
    return { id: info.lastInsertRowid };
  }

  const item1 = await createItem(sec1.id, "Direct Item 1", 0, null);
  const item2 = await createItem(sec1.id, "Direct Item 2", 1, null);
  const item3 = await createItem(sec1.id, "Room1 Item 1", 0, room1.id);
  const item4 = await createItem(sec1.id, "Room1 Item 2", 1, room1.id);
  const item5 = await createItem(sec1.id, "Room2 Item 1", 0, room2.id);

  return { owner, designer, quote, sec1, sec2, room1, room2, item1, item2, item3, item4, item5 };
}

async function getSections(quoteId, token) {
  const res = await api("GET", `/quotes/${quoteId}/sections`, null, token);
  assert.equal(res.status, 200, `GET sections failed: ${JSON.stringify(res.body)}`);
  return res.body.sections;
}

async function getRooms(sectionId, token) {
  const res = await api("GET", `/sections/${sectionId}/rooms`, null, token);
  assert.equal(res.status, 200, `GET rooms failed: ${JSON.stringify(res.body)}`);
  return res.body.rooms;
}

async function getItems(sectionId, token) {
  const res = await api("GET", `/sections/${sectionId}/items`, null, token);
  assert.equal(res.status, 200, `GET items failed: ${JSON.stringify(res.body)}`);
  return res.body.items;
}

async function getQuote(quoteId, token) {
  const res = await api("GET", `/quotes/${quoteId}`, null, token);
  assert.equal(res.status, 200, `GET quote failed: ${JSON.stringify(res.body)}`);
  return res.body.quote;
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
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(reorderDbPath + suffix, { force: true });
  }
});

test("section reorder: reverse two sections", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  // Get current state
  const sectionsBefore = await getSections(d.quote.id, tok);
  const expected = sectionsBefore.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sectionsBefore.slice().reverse().map(s => s.id);

  const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.already_applied, false);
  assert.deepEqual(res.body.positions.map(p => p.id), order);

  // Verify new order
  const sectionsAfter = await getSections(d.quote.id, tok);
  assert.deepEqual(sectionsAfter.map(s => s.id), order);
});

test("section reorder: already applied returns already_applied true", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sections = await getSections(d.quote.id, tok);
  const expected = sections.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sections.map(s => s.id);

  const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
  assert.equal(res.status, 200);
  assert.equal(res.body.already_applied, true);
});

test("section reorder: original request retry is already applied", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  // First reorder
  const sectionsBefore = await getSections(d.quote.id, tok);
  const expected = sectionsBefore.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sectionsBefore.slice().reverse().map(s => s.id);
  await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);

  // Retrying the original request must be idempotent.
  const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
  assert.equal(res.status, 200);
  assert.equal(res.body.already_applied, true);

  const changedOrder = order.slice().reverse();
  const conflict = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order: changedOrder }, tok);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "ORDER_CONFLICT");
});

test("section reorder: duplicate IDs rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sections = await getSections(d.quote.id, tok);
  const expected = sections.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = [sections[0].id, sections[0].id]; // duplicate

  const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
  assert.equal(res.status, 400);
});

test("section reorder: mismatched IDs rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sections = await getSections(d.quote.id, tok);
  const expected = sections.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = [999]; // non-existent ID

  const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
  assert.equal(res.status, 400);
});

test("room reorder: reverse two rooms", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const roomsBefore = await getRooms(d.sec1.id, tok);
  const expected = roomsBefore.map(r => ({ id: r.id, sort_order: r.sort_order }));
  const order = roomsBefore.slice().reverse().map(r => r.id);

  const res = await api("PUT", `/sections/${d.sec1.id}/rooms/reorder`, { expected, order }, tok);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.already_applied, false);

  const roomsAfter = await getRooms(d.sec1.id, tok);
  assert.deepEqual(roomsAfter.map(r => r.id), order);
  const retry = await api("PUT", `/sections/${d.sec1.id}/rooms/reorder`, { expected, order }, tok);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.already_applied, true);
});

test("room reorder: foreign section rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const rooms = await getRooms(d.sec1.id, tok);
  const expected = rooms.map(r => ({ id: r.id, sort_order: r.sort_order }));
  const order = rooms.map(r => r.id);

  const res = await api("PUT", `/sections/${d.sec2.id}/rooms/reorder`, { expected, order }, tok);
  assert.equal(res.status, 409); // membership differs
});

test("item reorder: direct items group", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const itemsBefore = await getItems(d.sec1.id, tok);
  const directItems = itemsBefore.filter(i => i.room_id === null);
  const expected = directItems.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = directItems.slice().reverse().map(i => i.id);

  const res = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: null, expected, order }, tok);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.already_applied, false);

  const itemsAfter = await getItems(d.sec1.id, tok);
  const directItemsAfter = itemsAfter.filter(i => i.room_id === null);
  assert.deepEqual(directItemsAfter.map(i => i.id), order);
  const retry = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: null, expected, order }, tok);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.already_applied, true);
});

test("item reorder: room items group", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const itemsBefore = await getItems(d.sec1.id, tok);
  const roomItems = itemsBefore.filter(i => i.room_id === d.room1.id);
  const expected = roomItems.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = roomItems.slice().reverse().map(i => i.id);

  const res = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: d.room1.id, expected, order }, tok);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);

  const itemsAfter = await getItems(d.sec1.id, tok);
  const roomItemsAfter = itemsAfter.filter(i => i.room_id === d.room1.id);
  assert.deepEqual(roomItemsAfter.map(i => i.id), order);
  const retry = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: d.room1.id, expected, order }, tok);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.already_applied, true);
});

test("item reorder: foreign room rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const items = await getItems(d.sec1.id, tok);
  const roomItems = items.filter(i => i.room_id === d.room1.id);
  const expected = roomItems.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = roomItems.map(i => i.id);

  const res = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: d.room2.id, expected, order }, tok);
  assert.equal(res.status, 409); // the addressed group membership differs
});

test("item reorder: cross-room move rejected", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const items = await getItems(d.sec1.id, tok);
  const room1Items = items.filter(i => i.room_id === d.room1.id);
  const room2Items = items.filter(i => i.room_id === d.room2.id);
  const expected = room1Items.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = [...room2Items.map(i => i.id), ...room1Items.map(i => i.id)];

  const res = await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: d.room1.id, expected, order }, tok);
  assert.equal(res.status, 400); // membership validation fails
});

test("section create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/quotes/${d.quote.id}/sections`, { code: "C", name: "Section C" }, tok);
  assert.equal(res.status, 200);
  assert.ok(res.body.sort_order != null);
  assert.equal(typeof res.body.sort_order, "number");
});

test("section batch create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/quotes/${d.quote.id}/sections/batch`, {
    sections: [
      { code: "D", name: "Section D" },
      { code: "E", name: "Section E" },
    ]
  }, tok);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 2);
  assert.ok(res.body.results[0].sort_order != null);
  assert.ok(res.body.results[1].sort_order != null);
});

test("room create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/sections/${d.sec1.id}/rooms`, { name: "Room 3" }, tok);
  assert.equal(res.status, 200);
  assert.ok(res.body.sort_order != null);
});

test("room batch create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/sections/${d.sec1.id}/rooms/batch`, {
    rooms: [
      { name: "Room 3" },
      { name: "Room 4" },
    ]
  }, tok);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 2);
  assert.ok(res.body.results[0].sort_order != null);
  assert.ok(res.body.results[1].sort_order != null);
});

test("item create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/sections/${d.sec1.id}/items`, { name: "New Item", base_cost: 100 }, tok);
  assert.equal(res.status, 200);
  assert.ok(res.body.sort_order != null);
});

test("item batch create returns assigned sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const res = await api("POST", `/sections/${d.sec1.id}/items/batch`, {
    items: [
      { name: "Batch Item 1", base_cost: 100 },
      { name: "Batch Item 2", base_cost: 200 },
    ]
  }, tok);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 2);
  assert.ok(res.body.results[0].sort_order != null);
  assert.ok(res.body.results[1].sort_order != null);
});

test("section PUT does not update sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sectionsBefore = await getSections(d.quote.id, tok);
  const oldOrder = sectionsBefore[0].sort_order;

  const res = await api("PUT", `/quotes/${d.quote.id}/sections/${d.sec1.id}`, { name: "New Name" }, tok);
  assert.equal(res.status, 200);

  const sectionsAfter = await getSections(d.quote.id, tok);
  assert.equal(sectionsAfter[0].sort_order, oldOrder);
});

test("room PUT does not update sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const roomsBefore = await getRooms(d.sec1.id, tok);
  const oldOrder = roomsBefore[0].sort_order;

  const res = await api("PUT", `/sections/${d.sec1.id}/rooms/${d.room1.id}`, { name: "New Room Name" }, tok);
  assert.equal(res.status, 200);

  const roomsAfter = await getRooms(d.sec1.id, tok);
  assert.equal(roomsAfter[0].sort_order, oldOrder);
});

test("item PUT does not update sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const itemsBefore = await getItems(d.sec1.id, tok);
  const oldOrder = itemsBefore[0].sort_order;

  const res = await api("PUT", `/sections/${d.sec1.id}/items/${d.item1.id}`, { name: "New Item Name" }, tok);
  assert.equal(res.status, 200);

  const itemsAfter = await getItems(d.sec1.id, tok);
  const updatedItem = itemsAfter.find(i => i.id === d.item1.id);
  assert.equal(updatedItem.sort_order, oldOrder);
});

test("concurrent section create and reorder serialized", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  // Create a new section while reordering
  const sectionsBefore = await getSections(d.quote.id, tok);
  const expected = sectionsBefore.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sectionsBefore.slice().reverse().map(s => s.id);

  const createRes = api("POST", `/quotes/${d.quote.id}/sections`, { code: "C", name: "Section C" }, tok);
  const reorderRes = api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);

  const [createResult, reorderResult] = await Promise.all([createRes, reorderRes]);

  const statuses = [createResult.status, reorderResult.status].sort();
  assert.ok(
    JSON.stringify(statuses) === JSON.stringify([200, 200]) ||
    JSON.stringify(statuses) === JSON.stringify([200, 409]),
  );
  const after = await getSections(d.quote.id, tok);
  assert.equal(new Set(after.map((section) => section.id)).size, after.length);
  assert.equal(new Set(after.map((section) => section.sort_order)).size, after.length);
});

test("concurrent room create and reorder serialized", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const roomsBefore = await getRooms(d.sec1.id, tok);
  const expected = roomsBefore.map(r => ({ id: r.id, sort_order: r.sort_order }));
  const order = roomsBefore.slice().reverse().map(r => r.id);

  const createRes = api("POST", `/sections/${d.sec1.id}/rooms`, { name: "Room 3" }, tok);
  const reorderRes = api("PUT", `/sections/${d.sec1.id}/rooms/reorder`, { expected, order }, tok);

  const [createResult, reorderResult] = await Promise.all([createRes, reorderRes]);

  const statuses = [createResult.status, reorderResult.status].sort();
  assert.ok(
    JSON.stringify(statuses) === JSON.stringify([200, 200]) ||
    JSON.stringify(statuses) === JSON.stringify([200, 409]),
  );
  const after = await getRooms(d.sec1.id, tok);
  assert.equal(new Set(after.map((room) => room.id)).size, after.length);
  assert.equal(new Set(after.map((room) => room.sort_order)).size, after.length);
});

test("concurrent item create and reorder serialized", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const itemsBefore = await getItems(d.sec1.id, tok);
  const directItems = itemsBefore.filter(i => i.room_id === null);
  const expected = directItems.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = directItems.slice().reverse().map(i => i.id);

  const createRes = api("POST", `/sections/${d.sec1.id}/items`, { name: "New Direct Item", base_cost: 100 }, tok);
  const reorderRes = api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: null, expected, order }, tok);

  const [createResult, reorderResult] = await Promise.all([createRes, reorderRes]);

  const statuses = [createResult.status, reorderResult.status].sort();
  assert.ok(
    JSON.stringify(statuses) === JSON.stringify([200, 200]) ||
    JSON.stringify(statuses) === JSON.stringify([200, 409]),
  );
  const after = (await getItems(d.sec1.id, tok)).filter((item) => item.room_id === null);
  assert.equal(new Set(after.map((item) => item.id)).size, after.length);
  assert.equal(new Set(after.map((item) => item.sort_order)).size, after.length);
});

test("reorder rollback on injected failure", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sectionsBefore = await getSections(d.quote.id, tok);
  const expected = sectionsBefore.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sectionsBefore.slice().reverse().map(s => s.id);

  const originalPrepare = db.prepare;
  let updateCount = 0;
  db.prepare = (sql) => {
    const statement = originalPrepare.call(db, sql);
    if (!/^UPDATE sections SET sort_order/.test(sql)) return statement;
    return {
      run(...args) {
        updateCount += 1;
        if (updateCount === 2) throw new Error("injected reorder failure");
        return statement.run(...args);
      },
    };
  };
  try {
    const res = await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);
    assert.equal(res.status, 500);
  } finally {
    db.prepare = originalPrepare;
  }
  const sectionsAfter = await getSections(d.quote.id, tok);
  assert.deepEqual(
    sectionsAfter.map((section) => ({ id: section.id, sort_order: section.sort_order })),
    sectionsBefore.map((section) => ({ id: section.id, sort_order: section.sort_order })),
  );
});

test("reopen quote preserves section order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const sectionsBefore = await getSections(d.quote.id, tok);
  const expected = sectionsBefore.map(s => ({ id: s.id, sort_order: s.sort_order }));
  const order = sectionsBefore.slice().reverse().map(s => s.id);

  await api("PUT", `/quotes/${d.quote.id}/sections/reorder`, { expected, order }, tok);

  // Re-fetch quote (simulating reopen)
  const quote = await getQuote(d.quote.id, tok);
  assert.deepEqual(quote.sections.map(s => s.id), order);
});

test("reopen quote preserves room order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const roomsBefore = await getRooms(d.sec1.id, tok);
  const expected = roomsBefore.map(r => ({ id: r.id, sort_order: r.sort_order }));
  const order = roomsBefore.slice().reverse().map(r => r.id);

  await api("PUT", `/sections/${d.sec1.id}/rooms/reorder`, { expected, order }, tok);

  const quote = await getQuote(d.quote.id, tok);
  const sec = quote.sections.find(s => s.id === d.sec1.id);
  assert.deepEqual(sec.rooms.map(r => r.id), order);
});

test("reopen quote preserves item order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designer.id, "designer");

  const itemsBefore = await getItems(d.sec1.id, tok);
  const directItems = itemsBefore.filter(i => i.room_id === null);
  const expected = directItems.map(i => ({ id: i.id, sort_order: i.sort_order }));
  const order = directItems.slice().reverse().map(i => i.id);

  await api("PUT", `/sections/${d.sec1.id}/items/reorder`, { room_id: null, expected, order }, tok);

  const quote = await getQuote(d.quote.id, tok);
  const sec = quote.sections.find(s => s.id === d.sec1.id);
  const directItemsAfter = sec.items.filter(i => i.room_id === null);
  assert.deepEqual(directItemsAfter.map(i => i.id), order);
});