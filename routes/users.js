const express = require("express");
const db = require("../db");
const {
  requireAuth,
  requireAdmin,
  isAdminOrOwner,
} = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC",
    )
    .all();
  res.json({ users: rows });
});

router.patch("/:id/role", (req, res) => {
  const { role } = req.body;
  if (!["admin", "owner", "designer"].includes(role)) {
    return res.status(400).json({ error: "صلاحية غير صحيحة" });
  }

  const targetId = Number(req.params.id);
  if (targetId === req.user.id && role !== req.user.role) {
    return res
      .status(400)
      .json({ error: "ما تقدر تغير صلاحيتك الحالية بنفسك" });
  }

  if (role === "owner" && req.user.role !== "admin") {
    return res.status(403).json({ error: "فقط المدير يمكنه إنشاء مالك" });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetId);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "ما تقدر تحذف حسابك بنفسك" });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  db.prepare(
    "DELETE FROM project_access WHERE user_id = ? OR quote_id IN (SELECT id FROM quotes WHERE user_id = ?)",
  ).run(targetId, targetId);
  db.prepare("DELETE FROM quotes WHERE user_id = ?").run(targetId);
  db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
  res.json({ ok: true });
});

module.exports = router;
