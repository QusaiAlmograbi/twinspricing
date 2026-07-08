const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

function loadDbModule() {
  delete require.cache[require.resolve("../db")];
  return require("../db");
}

test("uses PostgreSQL configuration when DATABASE_URL is provided", () => {
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL =
    "postgres://user:pass@localhost:5432/interior_pricing";
  delete process.env.DATABASE_PATH;

  const dbModule = loadDbModule();
  const config = dbModule.getDatabaseConfig();

  assert.equal(config.client, "postgres");
  assert.equal(config.databaseUrl, process.env.DATABASE_URL);
});

test("uses a persistent database path in production when DATABASE_PATH is not set", () => {
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_PATH;
  delete process.env.DATABASE_URL;

  const dbModule = loadDbModule();

  assert.equal(dbModule.resolveDatabasePath(), "/var/data/interior_pricing.db");
});

test("uses the local data folder in development by default", () => {
  process.env.NODE_ENV = "development";
  delete process.env.DATABASE_PATH;

  const dbModule = loadDbModule();

  assert.equal(
    dbModule.resolveDatabasePath(),
    path.join(path.resolve(__dirname, ".."), "data", "interior_pricing.db"),
  );
});
