const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

if (!process.env.DATABASE_URL && !process.env.DATABASE_PATH) {
  const deleteDbPath = path.join(__dirname, "..", "data", "delete-test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(deleteDbPath + suffix, { force: true });
  }
  process.env.DATABASE_PATH = deleteDbPath;
}

const db = require("../db");
const {
  isSqlite,
  withSqliteTransaction,
  withPostgresTransaction,
  createClientPrep,
} = require("../db");
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
        .run("Delete Test", email, hash, role);
      u = { id: info.lastInsertRowid };
    }
    return { id: u.id };
  }

  const owner = await createUser("delete-owner@test.com", "owner");
  const designerA = await createUser("delete-designer-a@test.com", "designer");
  const designerB = await createUser("delete-designer-b@test.com", "designer");

  async function createQuote(userId, name) {
    const info = await db
      .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, '{}')")
      .run(userId, name);
    return { id: info.lastInsertRowid };
  }

  const quoteA = await createQuote(designerA.id, "Quote A");
  const quoteB = await createQuote(designerB.id, "Quote B");

  async function createSection(quoteId, code, name) {
    const info = await db
      .prepare(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, 0, 0)",
      )
      .run(quoteId.id, code, name);
    return { id: info.lastInsertRowid };
  }

  const secA = await createSection(quoteA, "A", "Section A");
  const secB = await createSection(quoteB, "B", "Section B");

  async function createRoom(sectionId, name) {
    const info = await db
      .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, 0)")
      .run(sectionId.id, name);
    return { id: info.lastInsertRowid };
  }

  const roomA = await createRoom(secA, "Room in A");
  const roomB = await createRoom(secB, "Room in B");

  async function createItem(sectionId, roomIdNullable, code, name, sellingPrice) {
    const info = await db
      .prepare(
        `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, notes, sort_order)
         VALUES (?, ?, ?, ?, '', 'عدد', 1, 1000, 35, ?, '', 0)`,
      )
      .run(sectionId.id, roomIdNullable ? roomIdNullable.id : null, code, name, sellingPrice);
    return { id: info.lastInsertRowid };
  }

  const itemA = await createItem(secA, null, "A.1", "Item A", 1350);
  const itemAInRoom = await createItem(secA, roomA, "A.2", "Item A in room", 900);
  const itemB = await createItem(secB, roomB, "B.1", "Item B", 270);

  return {
    owner,
    designerA,
    designerB,
    quoteA,
    quoteB,
    secA,
    secB,
    roomA,
    roomB,
    itemA,
    itemAInRoom,
    itemB,
  };
}

async function countAll(where = {}) {
  const out = {};
  out.quotes = Number((await db.prepare("SELECT COUNT(*) AS c FROM quotes").get()).c);
  out.sections = Number((await db.prepare("SELECT COUNT(*) AS c FROM sections").get()).c);
  out.rooms = Number((await db.prepare("SELECT COUNT(*) AS c FROM rooms").get()).c);
  out.items = Number((await db.prepare("SELECT COUNT(*) AS c FROM items").get()).c);
  out.project_access = Number((await db.prepare("SELECT COUNT(*) AS c FROM project_access").get()).c);
  return out;
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

// --- DELETE /api/quotes/:id ---
test("delete own quote succeeds and cascades to children", async () => {
  const data = await seedTestData();
  await db
    .prepare("INSERT INTO project_access (quote_id, user_id, granted_by, permission) VALUES (?,?,?,'view') ON CONFLICT (quote_id, user_id) DO NOTHING")
    .run(data.quoteA.id, data.designerB.id, data.owner.id);
  const before = await countAll();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/quotes/${data.quoteA.id}`, null, tokA);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);

  const after = await countAll();
  assert.equal(after.quotes, before.quotes - 1, "quote should be deleted");
  assert.equal(after.sections, before.sections - 1, "its section should be gone");
  assert.equal(after.rooms, before.rooms - 1, "its room should be gone");
  assert.equal(after.items, before.items - 2, "its items should be gone");
  assert.equal(after.project_access, before.project_access - 1, "its project_access rows should be gone");

  const gone = await db.prepare("SELECT id FROM quotes WHERE id = ?").get(data.quoteA.id);
  assert.equal(gone, undefined, "quote row should not exist");
});

test("delete foreign quote is denied with 403", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/quotes/${data.quoteB.id}`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const still = await db.prepare("SELECT id FROM quotes WHERE id = ?").get(data.quoteB.id);
  assert.ok(still, "foreign quote must remain untouched");
});

// --- DELETE /api/quotes/:quoteId/sections/:id ---
test("delete own section succeeds and removes its rooms/items", async () => {
  const data = await seedTestData();
  const before = await countAll();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/quotes/${data.quoteA.id}/sections/${data.secA.id}`, null, tokA);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);

  const after = await countAll();
  assert.equal(after.sections, before.sections - 1, "section should be deleted");
  assert.equal(after.rooms, before.rooms - 1, "its room should be deleted");
  assert.equal(after.items, before.items - 2, "its items should be deleted");

  const gone = await db.prepare("SELECT id FROM sections WHERE id = ?").get(data.secA.id);
  assert.equal(gone, undefined, "section row should not exist");
});

test("delete unauthorized/foreign section is denied with 403", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/quotes/${data.quoteB.id}/sections/${data.secB.id}`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const still = await db.prepare("SELECT id FROM sections WHERE id = ?").get(data.secB.id);
  assert.ok(still, "foreign section must remain untouched");
});

// --- DELETE /api/sections/:sectionId/rooms/:id ---
test("delete own room succeeds and removes its items", async () => {
  const data = await seedTestData();
  const before = await countAll();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/sections/${data.secA.id}/rooms/${data.roomA.id}`, null, tokA);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);

  const after = await countAll();
  assert.equal(after.rooms, before.rooms - 1, "room should be deleted");
  assert.equal(after.items, before.items - 1, "room's item should be deleted");

  const gone = await db.prepare("SELECT id FROM rooms WHERE id = ?").get(data.roomA.id);
  assert.equal(gone, undefined, "room row should not exist");
});

test("delete unauthorized/foreign room is denied with 403", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/sections/${data.secB.id}/rooms/${data.roomB.id}`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const still = await db.prepare("SELECT id FROM rooms WHERE id = ?").get(data.roomB.id);
  assert.ok(still, "foreign room must remain untouched");
});

// --- Transaction rollback / no partial deletion ---
test("failed transactional operation rolls back: no partial deletion", async () => {
  const data = await seedTestData();
  const quoteId = data.quoteA.id;
  const sectionId = data.secA.id;
  const itemId = data.itemA.id;

  let threw = false;
  try {
    if (isSqlite()) {
      withSqliteTransaction(() => {
        db.prepare("DELETE FROM items WHERE section_id = ?").run(sectionId);
        db.prepare("DELETE FROM sections WHERE id = ? AND quote_id = ?").run(sectionId, quoteId);
        throw new Error("simulated failure after partial deletes");
      });
    } else {
      await withPostgresTransaction(async (client) => {
        const prep = createClientPrep(client);
        await prep("DELETE FROM items WHERE section_id = ?").run(sectionId);
        await prep("DELETE FROM sections WHERE id = ? AND quote_id = ?").run(sectionId, quoteId);
        throw new Error("simulated failure after partial deletes");
      });
    }
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, true, "transaction should have thrown");

  const itemStill = await db.prepare("SELECT id FROM items WHERE id = ?").get(itemId);
  const sectionStill = await db.prepare("SELECT id FROM sections WHERE id = ?").get(sectionId);
  const quoteStill = await db.prepare("SELECT id FROM quotes WHERE id = ?").get(quoteId);
  assert.ok(itemStill, "item must remain after rollback");
  assert.ok(sectionStill, "section must remain after rollback");
  assert.ok(quoteStill, "quote must remain after rollback");
});