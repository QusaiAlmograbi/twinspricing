const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
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
});

router.patch("/name", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "الرجاء إدخال الاسم" });
  }

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
});

router.post("/avatar", async (req, res) => {
  const { avatar } = req.body;
  if (!avatar) {
    return res.status(400).json({ error: "الرجاء إرفاق صورة" });
  }

  if (!avatar.startsWith("data:image/")) {
    return res.status(400).json({ error: "الرجاء إرفاق صورة بصيغة صحيحة" });
  }

  await db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, req.user.id);
  res.json({ ok: true, avatar });
});

router.delete("/avatar", async (req, res) => {
  await db.prepare("UPDATE users SET avatar = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

router.post("/password", async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res
      .status(400)
      .json({ error: "الرجاء تعبئة كلمة المرور الحالية والجديدة" });
  }
  if (new_password.length < 6) {
    return res
      .status(400)
      .json({ error: "كلمة المرور الجديدة لازم تكون 6 أحرف على الأقل" });
  }

  const user = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res
      .status(400)
      .json({ error: "كلمة المرور الحالية غير صحيحة" });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
