require("dotenv").config();
const bcrypt = require("bcryptjs");
const readline = require("readline");
const db = require("../db");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function createOwner() {
  await db.initializeDatabase();

  const name = process.env.OWNER_NAME || await ask("Owner name: ");
  const email = process.env.OWNER_EMAIL || await ask("Owner email: ");
  const password = process.env.OWNER_PASSWORD || await ask("Owner password: ");

  if (!name || !email || !password) {
    console.error("Name, email, and password are required.");
    process.exit(1);
  }

  const existing = await db
    .prepare("SELECT id, role FROM users WHERE email = ?")
    .get(email);

  if (existing) {
    if (existing.role === "owner") {
      console.log("الحساب موجود بالفعل كمالك:", email);
      process.exit(0);
    }
    const password_hash = bcrypt.hashSync(password, 10);
    await db
      .prepare("UPDATE users SET role = 'owner', status = 'approved', password_hash = ? WHERE email = ?")
      .run(password_hash, email);
    console.log("تم تحديث الحساب الحالي إلى مالك:", email);
    process.exit(0);
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const info = await db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, permissions, status) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, email, password_hash, "owner", "{}", "approved");

  console.log("تم إنشاء حساب المالك بنجاح!");
  console.log("  ID:", info.lastInsertRowid);
  console.log("  Email:", email);
  console.log("  Role: owner");
  process.exit(0);
}

createOwner().catch((err) => {
  console.error("خطأ:", err.message);
  process.exit(1);
});
