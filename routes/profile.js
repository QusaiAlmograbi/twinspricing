const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { validatePassword } = require("../utils/validatePassword");
const { profileNameRules, passwordRules, handleValidation } = require("../utils/validate");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const user = await db
    .prepare(
      "SELECT id, name, email, role, status, avatar, created_at FROM users WHERE id = ?",
    )
    .get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  const quoteStats = await db
    .prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_value FROM quotes WHERE user_id = ?",
    )
    .get(req.user.id);

  res.json({
    user: {
      ...user,
      quotes_count: Number(quoteStats.count) || 0,
      total_value: Number(quoteStats.total_value) || 0,
    },
  });
}));

router.patch("/name", profileNameRules, handleValidation, asyncHandler(async (req, res) => {
  const { name } = req.body;

  const trimmed = name.trim();
  const currentUser = await db
    .prepare("SELECT id, name FROM users WHERE id = ?")
    .get(req.user.id);
  if (!currentUser) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  if (trimmed.toLowerCase() === currentUser.name.toLowerCase()) {
    return res.json({ ok: true, name: trimmed });
  }

  const existing = await db
    .prepare("SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?")
    .get(trimmed, req.user.id);
  if (existing) {
    return res
      .status(400)
      .json({ error: "هذا الاسم مستخدم من مستخدم آخر، اختر اسماً مختلفاً" });
  }

  await db.prepare("UPDATE users SET name = ? WHERE id = ?").run(trimmed, req.user.id);
  res.json({ ok: true, name: trimmed });
}));

router.post("/avatar", asyncHandler(async (req, res) => {
  const { avatar } = req.body;
  if (!avatar) {
    return res.status(400).json({ error: "الرجاء إرفاق صورة" });
  }

  if (!avatar.startsWith("data:image/")) {
    return res.status(400).json({ error: "الرجاء إرفاق صورة بصيغة صحيحة" });
  }

  const MAX_AVATAR_BYTES = 200 * 1024;
  const base64Data = avatar.split(",")[1] || "";
  const decodedSize = Math.ceil((base64Data.length * 3) / 4);
  if (decodedSize > MAX_AVATAR_BYTES) {
    return res.status(400).json({ error: "الصورة كبيرة جداً، الحد الأقصى 200KB" });
  }

  await db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, req.user.id);
  res.json({ ok: true, avatar });
}));

router.delete("/avatar", asyncHandler(async (req, res) => {
  await db.prepare("UPDATE users SET avatar = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
}));

router.post("/password", passwordRules, handleValidation, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const passwordError = validatePassword(new_password);
  if (passwordError) {
    return res
      .status(400)
      .json({ error: passwordError });
  }

  const user = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    return res
      .status(400)
      .json({ error: "كلمة المرور الحالية غير صحيحة" });
  }

  const hash = await bcrypt.hash(new_password, 10);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
