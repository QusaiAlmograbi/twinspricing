const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

// Isolate this suite's SQLite DB from other test files unless PostgreSQL is requested.
if (!process.env.DATABASE_URL && !process.env.DATABASE_PATH) {
  const authzDbPath = path.join(__dirname, "..", "data", "authz-test.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(authzDbPath + suffix, { force: true });
  }
  process.env.DATABASE_PATH = authzDbPath;
}

const db = require("../db");
const { createApp } = require("../server");
const { verifySectionAccess } = require("../middleware/auth");

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
        .run("Authz Test", email, hash, role);
      u = { id: info.lastInsertRowid };
    }
    return { id: u.id };
  }

  const owner = await createUser("authz-owner@test.com", "owner");
  const designerA = await createUser("authz-designer-a@test.com", "designer");
  const designerB = await createUser("authz-designer-b@test.com", "designer");

  async function createQuote(userId, name) {
    const info = await db
      .prepare("INSERT INTO quotes (user_id, project_name, data) VALUES (?, ?, '{}')")
      .run(userId, name);
    return info.lastInsertRowid;
  }

  const quoteA = await createQuote(designerA.id, "Quote A");
  const quoteB = await createQuote(designerB.id, "Quote B");

  async function createSection(quoteId, code, name) {
    const info = await db
      .prepare(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?, ?, ?, 0, 0)",
      )
      .run(quoteId, code, name);
    return info.lastInsertRowid;
  }

  const secA = await createSection(quoteA, "A", "Section A");
  const secB = await createSection(quoteB, "B", "Section B");

  async function createItem(sectionId, code, name, sellingPrice) {
    const info = await db
      .prepare(
        `INSERT INTO items (section_id, item_code, name, description, unit, qty, base_cost, overhead_pct, selling_price, notes, sort_order)
         VALUES (?, ?, ?, '', 'عدد', 1, 1000, 35, ?, '', 0)`,
      )
      .run(sectionId, code, name, sellingPrice);
    return info.lastInsertRowid;
  }

  const itemA = await createItem(secA, "A.1", "Item A", 1350);
  const itemB = await createItem(secB, "B.1", "Item B", 270);

  return {
    owner,
    designerA,
    designerB,
    quoteA,
    quoteB,
    secA,
    secB,
    itemA,
    itemB,
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

// ---------------------------------------------------------------------------
// Direct unit regression: verifySectionAccess must resolve to a plain boolean.
// (Before the fix, on PostgreSQL prepare().get() returned a Promise, and the
//  truthy Promise slipped past `!verifySectionAccess(...)` — i.e. auth bypass.)
// ---------------------------------------------------------------------------
test("verifySectionAccess: designer without access resolves to false", async () => {
  const data = await seedTestData();
  const allowed = await verifySectionAccess(data.secA, data.designerA.id, "designer");
  const denied = await verifySectionAccess(data.secB, data.designerA.id, "designer");
  assert.equal(allowed, true, "owner of the section's quote should be allowed");
  assert.equal(denied, false, "non-owner without project_access must be denied");
});

// ---------------------------------------------------------------------------
// HTTP-level authorization tests
// ---------------------------------------------------------------------------
test("user can access a quote they are allowed to (owner)", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("GET", `/quotes/${data.quoteA}`, null, tokA);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}`);
  assert.equal(res.body.quote.id, data.quoteA);
});

test("user cannot access a quote they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("GET", `/quotes/${data.quoteB}`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot update a quote they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("PUT", `/quotes/${data.quoteB}`, { project_name: "Hacked" }, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot delete a quote they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("DELETE", `/quotes/${data.quoteB}`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot access sections of a quote they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("GET", `/quotes/${data.quoteB}/sections`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot list items of a section they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("GET", `/sections/${data.secB}/items`, null, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot modify an item inside a section they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("PUT", `/sections/${data.secB}/items/${data.itemB}`, { name: "Hacked" }, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot create an item inside a section they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("POST", `/sections/${data.secB}/items`, { name: "Hacked", base_cost: 10 }, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("user cannot create a room inside a section they are not allowed to", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("POST", `/sections/${data.secB}/rooms`, { name: "Hacked Room" }, tokA);
  assert.equal(res.status, 403, `Expected 403 but got ${res.status}`);
});

test("owner role can still access any quote and section (admin bypass intact)", async () => {
  const data = await seedTestData();
  const tokOwner = makeToken(data.owner.id, "owner");
  const qRes = await api("GET", `/quotes/${data.quoteB}`, null, tokOwner);
  assert.equal(qRes.status, 200, `Expected 200 but got ${qRes.status}`);
  const secRes = await api("GET", `/quotes/${data.quoteB}/sections`, null, tokOwner);
  assert.equal(secRes.status, 200, `Expected 200 but got ${secRes.status}`);
  const itemsRes = await api("GET", `/sections/${data.secB}/items`, null, tokOwner);
  assert.equal(itemsRes.status, 200, `Expected 200 but got ${itemsRes.status}`);
});

test("granted project_access still grants quote and section access (UNION path intact)", async () => {
  const data = await seedTestData();
  const tokB = makeToken(data.designerB.id, "designer");
  const tokOwner = makeToken(data.owner.id, "owner");

  const grant = await api("POST", `/quotes/${data.quoteA}/access`, { user_id: data.designerB.id }, tokOwner);
  assert.equal(grant.status, 200, `Grant failed: ${grant.status}`);

  const qRes = await api("GET", `/quotes/${data.quoteA}`, null, tokB);
  assert.equal(qRes.status, 200, `Expected 200 but got ${qRes.status}`);

  const secRes = await api("GET", `/quotes/${data.quoteA}/sections`, null, tokB);
  assert.equal(secRes.status, 200, `Expected 200 but got ${secRes.status}`);

  const itemsRes = await api("GET", `/sections/${data.secA}/items`, null, tokB);
  assert.equal(itemsRes.status, 200, `Expected 200 but got ${itemsRes.status}`);
});

test("owner of a section can still modify its items (positive path intact)", async () => {
  const data = await seedTestData();
  const tokA = makeToken(data.designerA.id, "designer");
  const res = await api("PUT", `/sections/${data.secA}/items/${data.itemA}`, { name: "Updated Item A" }, tokA);
  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
});