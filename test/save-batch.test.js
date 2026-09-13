const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

if (!process.env.DATABASE_URL && !process.env.DATABASE_PATH) {
  const saveBatchDbPath = path.join(
    __dirname,
    "..",
    "data",
    "save-batch-test.db",
  );
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(saveBatchDbPath + suffix, { force: true });
  }
  process.env.DATABASE_PATH = saveBatchDbPath;
}

const db = require("../db");
const { createApp } = require("../server");
const { MAX_BATCH_SECTIONS } = require("../routes/sections");
const { MAX_BATCH_ROOMS } = require("../routes/rooms");

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
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        let json;
        try {
          json = JSON.parse(raw);
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
        .run("Save Batch Test", email, hash, role);
      u = { id: info.lastInsertRowid };
    }
    return { id: u.id };
  }

  const owner = await createUser("save-batch-owner@test.com", "owner");
  const designerA = await createUser("save-batch-designer-a@test.com", "designer");
  const designerB = await createUser("save-batch-designer-b@test.com", "designer");

  async function createQuote(userId, name) {
    const info = await db
      .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, '{}')")
      .run(userId.id, name);
    return { id: info.lastInsertRowid };
  }

  const quoteA = await createQuote(designerA, "Save Batch Quote A");
  const quoteB = await createQuote(designerB, "Save Batch Quote B");

  async function createSection(quoteId, code, name, sortOrder = 0) {
    const info = await db
      .prepare(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, ?, 0)",
      )
      .run(quoteId.id, code, name, sortOrder);
    return { id: info.lastInsertRowid };
  }

  const secA = await createSection(quoteA, "SA", "Save Section A");
  const secB = await createSection(quoteB, "SB", "Save Section B");

  return {
    owner,
    designerA,
    designerB,
    quoteA,
    quoteB,
    secA,
    secB,
    createQuote,
    createSection,
  };
}

async function getSections(quoteId) {
  return db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(quoteId.id);
}

async function getRooms(sectionId) {
  return db
    .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
    .all(sectionId.id);
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

test("sections batch inserts all sections with indexes, ids, codes and names", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    {
      sections: [
        { code: "SQ1", name: "Section One" },
        { code: "SQ2", name: "Section Two" },
        { code: "SQ3", name: "Section Three" },
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
    assert.ok(r.code, `result index ${r.index} must echo its code`);
    assert.ok(r.name, `result index ${r.index} must echo its name`);
    assert.equal(r.error, undefined);
  }

  const rows = await getSections(d.quoteA);
  assert.equal(rows.length, 4, "1 seeded + 3 batch sections");
  assert.deepEqual(
    rows.map((s) => s.sort_order),
    [0, 1, 2, 3],
    "sort_order must be deterministic and sequential from the single MAX",
  );
  assert.equal(rows[3].code, "SQ3");
});

test("sections batch continues sort_order from existing MAX and honors explicit override", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    {
      sections: [
        { code: "AUTO", name: "Auto Order" },
        { code: "EXPL", name: "Explicit Order", sort_order: 42 },
      ],
    },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const rows = await getSections(d.quoteA);
  const auto = rows.find((s) => s.code === "AUTO");
  const expl = rows.find((s) => s.code === "EXPL");
  assert.equal(auto.sort_order, 1, "default sort_order must continue from the existing MAX");
  assert.equal(expl.sort_order, 42, "explicit sort_order override must be preserved");
});

test("sections batch with mixed valid and invalid entries keeps partial results", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    {
      sections: [
        { code: "OK0", name: "Good 0" },
        { code: "", name: "Missing Code" },
        { name: "Missing Code Field" },
        "not-an-object",
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
  assert.equal(res.body.results[1].error, "الكود والاسم مطلوبين");
  assert.equal(res.body.results[2].error, "الكود والاسم مطلوبين");
  assert.equal(res.body.results[3].error, "قسم غير صالح");

  const rows = await getSections(d.quoteA);
  assert.equal(rows.length, 2, "only the valid section may be inserted");
  assert.equal(rows[1].code, "OK0");
});

test("sections batch rejects non-array, empty, and over-cap payloads with 400 and inserts nothing", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const noBody = await api("POST", `/quotes/${d.quoteA.id}/sections/batch`, {}, tok);
  assert.equal(noBody.status, 400, "missing sections key must be rejected");

  const empty = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    { sections: [] },
    tok,
  );
  assert.equal(empty.status, 400, "empty array must be rejected");

  const notArray = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    { sections: "not-an-array" },
    tok,
  );
  assert.equal(notArray.status, 400, "sections field must be an array");

  const over = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    { sections: Array.from({ length: MAX_BATCH_SECTIONS + 1 }, (_, i) => ({ code: `X${i}`, name: `X ${i}` })) },
    tok,
  );
  assert.equal(over.status, 400, `over-cap must be rejected (${MAX_BATCH_SECTIONS + 1})`);

  const rows = await getSections(d.quoteA);
  assert.equal(rows.length, 1, "no sections may be inserted for rejected payloads");
});

test("sections batch exactly at the size limit is accepted", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/quotes/${d.quoteA.id}/sections/batch`,
    {
      sections: Array.from({ length: MAX_BATCH_SECTIONS }, (_, i) => ({
        code: `L${i}`,
        name: `Limit ${i}`,
      })),
    },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.results.length, MAX_BATCH_SECTIONS);
  assert.ok(res.body.results.every((r) => r.id != null));

  const rows = await getSections(d.quoteA);
  assert.equal(rows.length, MAX_BATCH_SECTIONS + 1);
});

test("sections batch on a foreign quote is rejected with 403 and inserts nothing", async () => {
  const d = await seedTestData();
  const tokA = makeToken(d.designerA.id, "designer");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM sections WHERE quote_id = ?").get(d.quoteB.id)).c,
  );

  const res = await api(
    "POST",
    `/quotes/${d.quoteB.id}/sections/batch`,
    { sections: [{ code: "NO", name: "Nope" }] },
    tokA,
  );

  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const after = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM sections WHERE quote_id = ?").get(d.quoteB.id)).c,
  );
  assert.equal(after, before, "no sections may be inserted into an unauthorized quote");
});

test("owner role bypasses quote ownership check on sections batch", async () => {
  const d = await seedTestData();
  const tokOwner = makeToken(d.owner.id, "owner");

  const res = await api(
    "POST",
    `/quotes/${d.quoteB.id}/sections/batch`,
    { sections: [{ code: "OWN", name: "Owner Section" }] },
    tokOwner,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.results[0].id != null);
});

test("rooms batch inserts all rooms with indexes, ids, names and sequential sort_order", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    {
      rooms: [
        { name: "Room One" },
        { name: "Room Two" },
        { name: "Room Three" },
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
    assert.ok(r.name, `result index ${r.index} must echo its name`);
    assert.equal(r.error, undefined);
  }

  const rows = await getRooms(d.secA);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.sort_order),
    [0, 1, 2],
    "sort_order must be deterministic and sequential",
  );
  assert.ok(rows.every((r) => r.section_id === d.secA.id));
});

test("rooms batch continues sort_order from existing MAX and honors explicit override", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  await db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?, ?, 0)")
    .run(d.secA.id, "Pre Existing");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    {
      rooms: [
        { name: "Auto Order" },
        { name: "Explicit Order", sort_order: 42 },
      ],
    },
    tok,
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const rows = await getRooms(d.secA);
  assert.deepEqual(
    rows.sort((a, b) => a.sort_order - b.sort_order).map((r) => r.name),
    ["Pre Existing", "Auto Order", "Explicit Order"],
  );
  const auto = rows.find((r) => r.name === "Auto Order");
  const expl = rows.find((r) => r.name === "Explicit Order");
  assert.equal(auto.sort_order, 1, "default sort_order must continue from the single MAX");
  assert.equal(expl.sort_order, 42, "explicit sort_order override must be preserved");
});

test("rooms batch with mixed valid and invalid entries keeps partial results", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const res = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    {
      rooms: [
        { name: "Good 0" },
        { name: "" },
        "not-an-object",
        { name: "Good 3" },
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
  assert.equal(res.body.results[1].error, "اسم الغرفة مطلوب");
  assert.equal(res.body.results[2].error, "غرفة غير صالحة");
  assert.equal(res.body.results[3].id != null, true);

  const rows = await getRooms(d.secA);
  assert.equal(rows.length, 2, "only the valid rooms may be inserted");
  assert.deepEqual(rows.map((r) => r.name), ["Good 0", "Good 3"]);
});

test("rooms batch rejects non-array, empty, and over-cap payloads with 400 and inserts nothing", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");

  const noBody = await api("POST", `/sections/${d.secA.id}/rooms/batch`, {}, tok);
  assert.equal(noBody.status, 400, "missing rooms key must be rejected");

  const empty = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    { rooms: [] },
    tok,
  );
  assert.equal(empty.status, 400, "empty array must be rejected");

  const notArray = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    { rooms: "not-an-array" },
    tok,
  );
  assert.equal(notArray.status, 400, "rooms field must be an array");

  const over = await api(
    "POST",
    `/sections/${d.secA.id}/rooms/batch`,
    { rooms: Array.from({ length: MAX_BATCH_ROOMS + 1 }, (_, i) => ({ name: `R ${i}` })) },
    tok,
  );
  assert.equal(over.status, 400, `over-cap must be rejected (${MAX_BATCH_ROOMS + 1})`);

  const rows = await getRooms(d.secA);
  assert.equal(rows.length, 0, "no rooms may be inserted for rejected payloads");
});

test("rooms batch on a foreign section is rejected with 403 and inserts nothing", async () => {
  const d = await seedTestData();
  const tokA = makeToken(d.designerA.id, "designer");

  const before = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM rooms WHERE section_id = ?").get(d.secB.id)).c,
  );

  const res = await api(
    "POST",
    `/sections/${d.secB.id}/rooms/batch`,
    { rooms: [{ name: "Nope" }] },
    tokA,
  );

  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
  const after = Number(
    (await db.prepare("SELECT COUNT(*) AS c FROM rooms WHERE section_id = ?").get(d.secB.id)).c,
  );
  assert.equal(after, before, "no rooms may be inserted into an unauthorized section");
});

test("integration: quote -> sections-batch -> rooms-batch -> items-batch with room_id -> GET /quotes/:id", async () => {
  const d = await seedTestData();
  const tok = makeToken(d.designerA.id, "designer");
  const qInt = await d.createQuote(d.designerA, "Integration Quote");

  const findItemByCode = (items, code) => {
    const it = items.find((x) => x.item_code === code);
    assert.ok(it, `expected item ${code} in the loaded tree`);
    return it;
  };

  const secRes = await api(
    "POST",
    `/quotes/${qInt.id}/sections/batch`,
    {
      sections: [
        { code: "INT1", name: "Integrated One", sort_order: 5 },
        { code: "INT2", name: "Integrated Two", sort_order: 9 },
      ],
    },
    tok,
  );
  assert.equal(secRes.status, 200, JSON.stringify(secRes.body));
  assert.equal(secRes.body.results.length, 2);
  const sId1 = Number(secRes.body.results[0].id);
  const sId2 = Number(secRes.body.results[1].id);
  assert.notEqual(sId1, sId2, "batch sections must have distinct ids");

  const r1Res = await api(
    "POST",
    `/sections/${sId1}/rooms/batch`,
    { rooms: [{ name: "Living", sort_order: 1 }, { name: "Kitchen", sort_order: 3 }] },
    tok,
  );
  assert.equal(r1Res.status, 200, JSON.stringify(r1Res.body));
  const livingId = Number(r1Res.body.results[0].id);
  const kitchenId = Number(r1Res.body.results[1].id);

  const r2Res = await api(
    "POST",
    `/sections/${sId2}/rooms/batch`,
    { rooms: [{ name: "Hall", sort_order: 2 }] },
    tok,
  );
  assert.equal(r2Res.status, 200, JSON.stringify(r2Res.body));
  const hallId = Number(r2Res.body.results[0].id);

  const i1Res = await api(
    "POST",
    `/sections/${sId1}/items/batch`,
    {
      items: [
        { item_code: "I1", name: "Living Sofa", base_cost: 100, room_id: livingId },
        { item_code: "I2", name: "Living Lamp", base_cost: 50, room_id: livingId },
        { item_code: "I3", name: "Kitchen Fridge", base_cost: 200, room_id: kitchenId },
        { item_code: "I4", name: "Direct Item", base_cost: 10 },
      ],
    },
    tok,
  );
  assert.equal(i1Res.status, 200, JSON.stringify(i1Res.body));
  assert.ok(i1Res.body.results.every((r) => r.id != null), "all section-1 items must insert");

  const i2Res = await api(
    "POST",
    `/sections/${sId2}/items/batch`,
    {
      items: [
        { item_code: "I5", name: "Hall Mirror", base_cost: 30, room_id: hallId },
        { item_code: "I6", name: "Hall Direct", base_cost: 60 },
      ],
    },
    tok,
  );
  assert.equal(i2Res.status, 200, JSON.stringify(i2Res.body));
  assert.ok(i2Res.body.results.every((r) => r.id != null), "all section-2 items must insert");

  const getRes = await api("GET", `/quotes/${qInt.id}`, null, tok);
  assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
  const quote = getRes.body.quote;
  assert.ok(quote, "load must return a quote");

  assert.equal(quote.sections.length, 2, "the quote must contain exactly the 2 batch sections");
  assert.deepEqual(
    quote.sections.map((s) => s.code),
    ["INT1", "INT2"],
    "sections must be ordered by sort_order ascending",
  );
  assert.deepEqual(
    quote.sections.map((s) => Number(s.sort_order)),
    [5, 9],
    "explicit sort_order must be preserved",
  );

  const s1 = quote.sections[0];
  const s2 = quote.sections[1];
  assert.equal(Number(s1.id), sId1);
  assert.equal(Number(s2.id), sId2);

  assert.deepEqual(
    (s1.rooms || []).map((r) => r.name),
    ["Living", "Kitchen"],
    "section-1 rooms must be ordered by sort_order ascending",
  );
  assert.deepEqual(
    (s1.rooms || []).map((r) => r.sort_order),
    [1, 3],
    "room explicit sort_order must be preserved",
  );
  const living = s1.rooms[0];
  const kitchen = s1.rooms[1];
  assert.equal(Number(living.id), livingId, "loaded room id must match the batch result id");
  assert.equal(Number(kitchen.id), kitchenId);

  assert.deepEqual(
    living.items.map((i) => i.item_code),
    ["I1", "I2"],
    "room items must be grouped under their room and ordered by sort_order",
  );
  assert.equal(Number(living.items[0].id), Number(i1Res.body.results[0].id), "loaded item id must match the batch result id");
  assert.equal(Number(findItemByCode(living.items, "I1").room_id), livingId);
  assert.deepEqual(kitchen.items.map((i) => i.item_code), ["I3"]);
  assert.equal(Number(findItemByCode(kitchen.items, "I3").room_id), kitchenId);

  assert.deepEqual(
    s1.items.map((i) => i.item_code),
    ["I4"],
    "section-level items (room_id null) must live on the section, not on a room",
  );
  assert.equal(findItemByCode(s1.items, "I4").room_id, null, "direct item must have no room_id");

  assert.deepEqual(
    (s2.rooms || []).map((r) => r.name),
    ["Hall"],
  );
  const hall = s2.rooms[0];
  assert.equal(Number(hall.id), hallId);
  assert.equal(hall.sort_order, 2, "hall explicit sort_order must be preserved");
  assert.deepEqual(hall.items.map((i) => i.item_code), ["I5"]);
  assert.equal(Number(findItemByCode(hall.items, "I5").room_id), hallId);
  assert.deepEqual(s2.items.map((i) => i.item_code), ["I6"]);
  assert.equal(findItemByCode(s2.items, "I6").room_id, null, "direct hall item must have no room_id");

  const totalTreeItems =
    ((s1.rooms || []).reduce((acc, r) => acc + (r.items || []).length, 0) + (s1.items || []).length) +
    ((s2.rooms || []).reduce((acc, r) => acc + (r.items || []).length, 0) + (s2.items || []).length);
  assert.equal(totalTreeItems, 6, "all 6 batch items must be present across the loaded tree");
});