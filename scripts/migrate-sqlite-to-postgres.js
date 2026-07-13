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

      if (table === "users" && !columnNames.includes("status")) {
        columnNames.push("status");
        for (const row of rows) {
          row.status = "approved";
        }
      }

      const insertColumns = columnNames.join(", ");
      const placeholders = columnNames
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const stmt = db.prepare(
        `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders})`,
      );

      for (const row of rows) {
        const values = columnNames.map((column) => row[column] ?? null);
        await stmt.run(...values);
      }
    }

    await db.exec(
      "UPDATE users SET status = 'approved' WHERE status IS NULL OR TRIM(COALESCE(status, '')) = ''",
    );

    console.log("Migration from SQLite to PostgreSQL completed.");
    console.log("All existing users have been set to 'approved' status.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    sqliteDb.close();
  }
}

main();
