const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parsePermissions(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "الرجاء تعبئة كل الحقول" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "كلمة المرور لازم تكون 6 أحرف على الأقل" });
  }
  const cleanEmail = email.toLowerCase().trim();
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: "هذا الإيميل مسجل مسبقاً" });
  }

  const ownerCount = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'owner'")
    .get().c;
  const role = ownerCount === 0 ? "owner" : "designer";
  const password_hash = bcrypt.hashSync(password, 10);

  const info = db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?,?,?,?,?)",
    )
    .run(name.trim(), cleanEmail, password_hash, role, "{}");

  const user = {
    id: info.lastInsertRowid,
    name: name.trim(),
    email: cleanEmail,
    role,
    permissions: {},
  };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(cleanEmail);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "الإيميل أو كلمة المرور غير صحيحة" });
  }
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: parsePermissions(user.permissions),
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: payload });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
