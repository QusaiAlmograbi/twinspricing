require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const db = require("../db");

async function main() {
  const sqlitePath =
    process.env.SQLITE_DB_PATH ||
    path.join(process.cwd(), "data", "interior_pricing.db");
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite database not found at ${sqlitePath}`);
    process.exitCode = 1;
    return;
  }

  const sqliteDb = new Database(sqlitePath);
  const tables = ["users", "quotes", "project_access"];

  try {
    await db.initializeDatabase();

    for (const table of tables) {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) continue;

      const columns = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
      const columnNames = columns.map((column) => column.name);
      const insertColumns = columnNames.join(", ");
      const placeholders = columnNames
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const stmt = db.prepare(
        `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders})`,
      );

      for (const row of rows) {
        const values = columnNames.map((column) => row[column]);
        await stmt.run(...values);
      }
    }

    console.log("Migration from SQLite to PostgreSQL completed.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    sqliteDb.close();
  }
}

main();
