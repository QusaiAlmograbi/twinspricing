const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = "development";

const db = require("../db");
const { createApp } = require("../server");

let server;
let baseUrl;

function makeToken(userId, role = "owner") {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

async function api(method, path, body, token) {
  const url = baseUrl + path;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers },
      (res) => {
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
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function seedTestData() {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("testpass", 10);

  let user = db.prepare("SELECT id FROM users WHERE email = 'clone-test@test.com'").get();
  if (!user) {
    const info = db
      .prepare("INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)")
      .run("Test User", "clone-test@test.com", hash, "owner", "approved");
    user = { id: info.lastInsertRowid };
  }

  const quoteInfo = db
    .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, ?)")
    .run(user.id, "Test Quote", "{}");
  const quoteId = quoteInfo.lastInsertRowid;

  const sec1Info = db
    .prepare("INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, ?)")
    .run(quoteId, "A", "Floor 1", 0, 1);
  const sourceSectionId = sec1Info.lastInsertRowid;

  const sec2Info = db
    .prepare("INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, ?)")
    .run(quoteId, "B", "Floor 2", 1, 1);
  const targetSectionId = sec2Info.lastInsertRowid;

  const sec3Info = db
    .prepare("INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, ?)")
    .run(quoteId, "C", "Direct Section", 2, 0);
  const noRoomsSectionId = sec3Info.lastInsertRowid;

  const room1Info = db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, ?)")
    .run(sourceSectionId, "Bedroom", 0);
  const sourceRoomId = room1Info.lastInsertRowid;

  const room2Info = db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, ?)")
    .run(sourceSectionId, "Bathroom", 1);
  const otherRoomId = room2Info.lastInsertRowid;

  db.prepare(
    `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sourceSectionId, sourceRoomId, "A.1", "Wardrobe", "L-shaped", "unit", 1, 1000, 35, 1350, 0);

  db.prepare(
    `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sourceSectionId, sourceRoomId, "A.2", "TV Unit", "Wall-mounted", "unit", 2, 500, 35, 675, 1);

  db.prepare(
    `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sourceSectionId, otherRoomId, "B.1", "Bathroom Tile", "Ceramic", "m2", 10, 50, 35, 67.5, 0);

  const secondQuoteInfo = db
    .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, ?)")
    .run(user.id, "Other Quote", "{}");
  const otherQuoteId = secondQuoteInfo.lastInsertRowid;

  const otherSecInfo = db
    .prepare("INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, ?)")
    .run(otherQuoteId, "X", "Other Floor", 0, 1);
  const otherQuoteSectionId = otherSecInfo.lastInsertRowid;

  const otherRoomInfo = db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, ?)")
    .run(otherQuoteSectionId, "Other Room", 0);
  const otherQuoteRoomId = otherRoomInfo.lastInsertRowid;

  return {
    userId: user.id,
    quoteId: Number(quoteId),
    sourceSectionId: Number(sourceSectionId),
    targetSectionId: Number(targetSectionId),
    noRoomsSectionId: Number(noRoomsSectionId),
    sourceRoomId: Number(sourceRoomId),
    otherRoomId: Number(otherRoomId),
    otherQuoteId: Number(otherQuoteId),
    otherQuoteRoomId: Number(otherQuoteRoomId),
    otherQuoteSectionId: Number(otherQuoteSectionId),
  };
}

test.before(async () => {
  await db.initializeDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api`;
});

test.after(() => {
  if (server) server.close();
});

test("POST /quotes/:id/rooms/:id/clone - successful clone to another section", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.room, "Response should have room");
  assert.ok(res.body.items, "Response should have items");
  assert.equal(res.body.room.section_id, data.targetSectionId, "New room should be in target section");
  assert.equal(res.body.room.name, "Bedroom", "New room should have same name as source");
  assert.equal(res.body.itemCount, 2, "Should have cloned 2 items");
  assert.equal(res.body.items.length, 2, "Items array length should match itemCount");
});

test("POST /quotes/:id/rooms/:id/clone - items linked to new room_id", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 201);
  const newRoomId = res.body.room.id;
  assert.notEqual(newRoomId, data.sourceRoomId, "New room should have different id from source");

  for (const item of res.body.items) {
    assert.equal(item.room_id, newRoomId, `Item ${item.id} should be linked to new room`);
    assert.equal(item.section_id, data.targetSectionId, `Item ${item.id} should be linked to target section`);
  }
});

test("POST /quotes/:id/rooms/:id/clone - original room and items unchanged", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  const sourceItemsBefore = db.prepare("SELECT * FROM items WHERE room_id = ?").all(data.sourceRoomId);
  const sourceRoomBefore = db.prepare("SELECT * FROM rooms WHERE id = ?").get(data.sourceRoomId);
  const originalItemCount = sourceItemsBefore.length;

  await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  const sourceRoomAfter = db.prepare("SELECT * FROM rooms WHERE id = ?").get(data.sourceRoomId);
  const sourceItemsAfter = db.prepare("SELECT * FROM items WHERE room_id = ?").all(data.sourceRoomId);

  assert.equal(sourceRoomAfter.name, sourceRoomBefore.name, "Source room name unchanged");
  assert.equal(sourceItemsAfter.length, originalItemCount, "Source room item count unchanged");

  for (let i = 0; i < sourceItemsAfter.length; i++) {
    assert.equal(sourceItemsAfter[i].id, sourceItemsBefore[i].id, `Source item ${i} id unchanged`);
    assert.equal(sourceItemsAfter[i].name, sourceItemsBefore[i].name, `Source item ${i} name unchanged`);
  }
});

test("POST /quotes/:id/rooms/:id/clone - same source/target section returns 400", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.sourceSectionId,
  }, token);

  assert.equal(res.status, 400, `Expected 400 but got ${res.status}`);
  assert.ok(res.body.error.includes("نفس القسم"), "Error should mention same section");
});

test("POST /quotes/:id/rooms/:id/clone - target section not found returns 404", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: 999999,
  }, token);

  assert.equal(res.status, 404, `Expected 404 but got ${res.status}`);
  assert.ok(res.body.error, "Should have error message");
});

test("POST /quotes/:id/rooms/:id/clone - source room not found returns 404", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/999999/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 404, `Expected 404 but got ${res.status}`);
  assert.ok(res.body.error.includes("الغرفة"), "Error should mention room");
});

test("POST /quotes/:id/rooms/:id/clone - different quote returns 403", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.otherQuoteRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.ok(res.status === 403 || res.status === 404, `Expected 403 or 404 but got ${res.status}`);
});

test("POST /quotes/:id/rooms/:id/clone - clone into section with has_rooms=0 succeeds and enables rooms", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  const secBefore = db.prepare("SELECT has_rooms FROM sections WHERE id = ?").get(data.noRoomsSectionId);
  assert.equal(secBefore.has_rooms, 0, "Section should start with has_rooms=0");

  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.noRoomsSectionId,
  }, token);

  assert.equal(res.status, 201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.room.section_id, data.noRoomsSectionId);
  assert.equal(res.body.room.name, "Bedroom");
  assert.equal(res.body.itemCount, 2);
  assert.equal(res.body.wasDirect, true, "wasDirect should be true when section had has_rooms=0");

  const secAfter = db.prepare("SELECT has_rooms FROM sections WHERE id = ?").get(data.noRoomsSectionId);
  assert.equal(secAfter.has_rooms, 1, "Section should have has_rooms=1 after clone");
});

test("POST /quotes/:id/rooms/:id/clone - clone into section with existing rooms succeeds", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  db.prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, ?)").run(data.targetSectionId, "Existing Room", 0);

  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 201);
  assert.equal(res.body.wasDirect, false, "wasDirect should be false when section already had rooms");

  const targetRooms = db.prepare("SELECT * FROM rooms WHERE section_id = ?").all(data.targetSectionId);
  assert.equal(targetRooms.length, 2, "Target section should have 2 rooms (1 existing + 1 cloned)");
});

test("POST /quotes/:id/rooms/:id/clone - cloned room and items visible in DB after clone", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 201);
  const newRoomId = res.body.room.id;

  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(newRoomId);
  assert.ok(room, "Cloned room should exist in DB");
  assert.equal(room.section_id, data.targetSectionId);
  assert.equal(room.name, "Bedroom");

  const items = db.prepare("SELECT * FROM items WHERE room_id = ?").all(newRoomId);
  assert.equal(items.length, 2, "Cloned room should have 2 items in DB");
  for (const item of items) {
    assert.equal(item.room_id, newRoomId, "All items linked to new room");
    assert.equal(item.section_id, data.targetSectionId, "All items linked to target section");
  }
});

test("POST /quotes/:id/rooms/:id/clone - missing targetSectionId returns 400", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {}, token);

  assert.equal(res.status, 400, `Expected 400 but got ${res.status}`);
  assert.ok(res.body.error.includes("القسم الهدف"), "Error should mention target section");
});

test("POST /quotes/:id/rooms/:id/clone - no auth returns 401", async () => {
  const data = await seedTestData();
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  });

  assert.equal(res.status, 401, `Expected 401 but got ${res.status}`);
});

test("POST /quotes/:id/rooms/:id/clone - clone with multiple items preserves all item data", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);
  const res = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  assert.equal(res.status, 201);
  assert.equal(res.body.items.length, 2);

  const item1 = res.body.items.find((it) => it.item_code === "A.1");
  const item2 = res.body.items.find((it) => it.item_code === "A.2");

  assert.ok(item1, "Item A.1 should exist in clone");
  assert.equal(item1.name, "Wardrobe");
  assert.equal(item1.unit, "unit");
  assert.equal(item1.qty, 1);
  assert.equal(item1.base_cost, 1000);
  assert.equal(item1.overhead_pct, 35);
  assert.equal(item1.selling_price, 1350);

  assert.ok(item2, "Item A.2 should exist in clone");
  assert.equal(item2.name, "TV Unit");
  assert.equal(item2.qty, 2);
  assert.equal(item2.base_cost, 500);
});

test("POST /quotes/:id/rooms/:id/clone - cloned room appears in target section rooms list", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);

  const targetRooms = db.prepare("SELECT * FROM rooms WHERE section_id = ?").all(data.targetSectionId);
  assert.equal(targetRooms.length, 1, "Target section should have 1 room after clone");
  assert.equal(targetRooms[0].name, "Bedroom", "Cloned room should have correct name");

  const targetItems = db.prepare("SELECT * FROM items WHERE section_id = ? AND room_id = ?").all(data.targetSectionId, targetRooms[0].id);
  assert.equal(targetItems.length, 2, "Cloned room should have 2 items");
});

test("POST /quotes/:id/rooms/:id/clone - multiple clones create independent rooms", async () => {
  const data = await seedTestData();
  const token = makeToken(data.userId);

  const res1 = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);
  assert.equal(res1.status, 201);
  const room1Id = res1.body.room.id;

  const res2 = await api("POST", `/quotes/${data.quoteId}/rooms/${data.sourceRoomId}/clone`, {
    targetSectionId: data.targetSectionId,
  }, token);
  assert.equal(res2.status, 201);
  const room2Id = res2.body.room.id;

  assert.notEqual(room1Id, room2Id, "Two clones should produce different room ids");

  const targetRooms = db.prepare("SELECT * FROM rooms WHERE section_id = ?").all(data.targetSectionId);
  assert.equal(targetRooms.length, 2, "Target section should have 2 rooms after two clones");
});
