require("dotenv").config();
const db = require("../db");

async function main() {
  try {
    await db.initializeDatabase();

    const users = await db
      .prepare(
        "SELECT id, name, email, role, status FROM users WHERE status IS NULL OR status = 'pending'",
      )
      .all();

    if (!users || users.length === 0) {
      console.log("No users with NULL or pending status. Nothing to fix.");
      return;
    }

    console.log(`Found ${users.length} user(s) to approve:\n`);
    for (const u of users) {
      console.log(
        `  ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role} | Old status: ${u.status || "NULL"}`,
      );
    }

    console.log("\nApproving legacy users...\n");

    for (const u of users) {
      await db
        .prepare(
          "UPDATE users SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .run(u.id);

      console.log(
        `  ${u.name} (${u.email}): ${u.status || "NULL"} -> approved`,
      );
    }

    console.log("\nDone. All legacy users are now approved.");
  } catch (error) {
    console.error("Failed to fix existing users:", error);
    process.exitCode = 1;
  }
}

main();
