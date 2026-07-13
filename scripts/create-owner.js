require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../db");

async function createOwner() {
  await db.initializeDatabase();

  const name = "Qusai Almograbi";
  const email = "mograbiqusai6@gmail.com";
  const password = "Qmograbi05";

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
