const express = require("express");
const db = require("../db");
const { requireAuth, requireOwner } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  if (!["owner", "admin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const rows = await db
    .prepare(
      "SELECT id, name, email, role, permissions, created_at FROM users ORDER BY created_at ASC",
    )
    .all();
  res.json({ users: rows });
});

router.patch("/:id/role", requireOwner, async (req, res) => {
  const { role, permissions } = req.body;
  if (!["admin", "owner", "designer"].includes(role)) {
    return res.status(400).json({ error: "صلاحية غير صحيحة" });
  }

  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res
      .status(400)
      .json({ error: "ما تقدر تغير صلاحيتك الحالية بنفسك" });
  }

  const user = await db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  const updates = ["role = ?"];
  const values = [role];

  if (permissions !== undefined) {
    const normalizedPermissions =
      typeof permissions === "string"
        ? permissions
        : JSON.stringify(permissions);
    updates.push("permissions = ?");
    values.push(normalizedPermissions);
  }

  values.push(targetId);
  await db
    .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);
  res.json({ ok: true });
});

router.delete("/:id", requireOwner, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "ما تقدر تحذف حسابك بنفسك" });
  }

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  await db
    .prepare(
      "DELETE FROM project_access WHERE user_id = ? OR quote_id IN (SELECT id FROM quotes WHERE user_id = ?)",
    )
    .run(targetId, targetId);
  await db.prepare("DELETE FROM quotes WHERE user_id = ?").run(targetId);
  await db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
  res.json({ ok: true });
});

module.exports = router;
