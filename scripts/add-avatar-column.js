require("dotenv").config();
const db = require("../db");

async function main() {
  try {
    await db.initializeDatabase();

    let exists = false;
    if (process.env.DATABASE_URL) {
      const result = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
        ["users", "avatar"],
      );
      exists = result.rows.length > 0;
    } else {
      const result = await db.query(
        "SELECT name FROM pragma_table_info('users') WHERE name = 'avatar'",
      );
      exists = result.rows.length > 0;
    }

    if (exists) {
      console.log("العمود avatar موجود مسبقاً في جدول users. ما في شي نسويه.");
      process.exit(0);
    }

    await db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
    console.log("تمت إضافة عمود avatar إلى جدول users بنجاح.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to add avatar column:", error);
    process.exitCode = 1;
  }
}

main();
