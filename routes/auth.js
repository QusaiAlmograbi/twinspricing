const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { validatePassword } = require("../utils/validatePassword");
const { registerRules, loginRules, handleValidation } = require("../utils/validate");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "تم تجاوز الحد المسموح من المحاولات، حاول مرة أخرى بعد 15 دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
});

function parsePermissions(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

function setTokenCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearTokenCookie(res) {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

router.post("/register", authLimiter, registerRules, handleValidation, asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  const cleanEmail = email.toLowerCase().trim();
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: "الرجاء المحاولة مرة ثانية" });
  }

  const ownerRow = await db
    .prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1")
    .get();
  const hasOwner = !!ownerRow;
  const role = hasOwner ? "designer" : "owner";
  const status = hasOwner ? "pending" : "approved";
  const password_hash = await bcrypt.hash(password, 10);

  const info = await db
    .prepare(
      "INSERT INTO users (name, email, password_hash, role, permissions, status) VALUES (?,?,?,?,?,?)",
    )
    .run(name.trim(), cleanEmail, password_hash, role, "{}", status);

  if (!hasOwner) {
    const user = {
      id: info.lastInsertRowid,
      name: name.trim(),
      email: cleanEmail,
      role,
      permissions: {},
    };
    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    setTokenCookie(res, token);
    return res.json({ user });
  }

  res.json({
    pending: true,
    message: "حسابك بانتظار الموافقة من المدير",
  });
}));

router.post("/login", authLimiter, loginRules, handleValidation, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || "").toLowerCase().trim();
  const user = await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(cleanEmail);
  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    return res.status(401).json({ error: "الإيميل أو كلمة المرور غير صحيحة" });
  }
  if (user.role !== "owner") {
    if (user.status === "pending") {
      return res
        .status(403)
        .json({ error: "حسابك بانتظار الموافقة من المدير" });
    }
    if (user.status === "rejected") {
      return res
        .status(403)
        .json({ error: "تم رفض حسابك، تواصل مع المدير" });
    }
  }
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: parsePermissions(user.permissions),
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
  setTokenCookie(res, token);
  res.json({ user: payload });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", (req, res) => {
  clearTokenCookie(res);
  res.json({ ok: true });
});

module.exports = router;
