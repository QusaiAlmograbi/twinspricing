const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, "data", "interior_pricing.db");
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function addColumnIfMissing(tableName, columnName, definition) {
  if (!tableColumns(tableName).some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'designer',
    permissions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_name TEXT NOT NULL,
    data TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS project_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    granted_by INTEGER NOT NULL,
    permission TEXT NOT NULL DEFAULT 'view',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (quote_id) REFERENCES quotes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (granted_by) REFERENCES users(id),
    UNIQUE(quote_id, user_id)
  );
`);

addColumnIfMissing("users", "role", "TEXT NOT NULL DEFAULT 'designer'");
addColumnIfMissing("users", "permissions", "TEXT NOT NULL DEFAULT '{}'");
db.prepare(
  "UPDATE users SET role = 'owner' WHERE LOWER(TRIM(COALESCE(role, ''))) = 'owner'",
).run();
db.prepare(
  "UPDATE users SET role = 'admin' WHERE LOWER(TRIM(COALESCE(role, ''))) = 'admin'",
).run();
db.prepare(
  "UPDATE users SET role = 'designer' WHERE role IS NULL OR TRIM(COALESCE(role, '')) = '' OR LOWER(TRIM(COALESCE(role, ''))) NOT IN ('owner', 'admin', 'designer')",
).run();
db.prepare(
  "UPDATE users SET permissions = COALESCE(NULLIF(TRIM(permissions), ''), '{}') WHERE permissions IS NULL OR TRIM(COALESCE(permissions, '')) = ''",
).run();

addColumnIfMissing(
  "project_access",
  "permission",
  "TEXT NOT NULL DEFAULT 'view'",
);
db.prepare(
  "UPDATE project_access SET permission = COALESCE(NULLIF(TRIM(permission), ''), 'view') WHERE permission IS NULL OR TRIM(COALESCE(permission, '')) = ''",
).run();

module.exports = db;
