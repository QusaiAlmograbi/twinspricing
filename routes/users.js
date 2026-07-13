const express = require("express");
const db = require("../db");
const { requireAuth, requireOwner, isAdminOrOwner } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const rows = await db
    .prepare(
      "SELECT id, name, email, role, permissions, status, approved_by, approved_at, created_at FROM users ORDER BY created_at ASC",
    )
    .all();
  res.json({ users: rows });
});

router.get("/pending", async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const rows = await db
    .prepare(
      "SELECT id, name, email, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at ASC",
    )
    .all();
  res.json({ users: rows });
});

router.post("/:id/approve", async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const targetId = Number(req.params.id);
  const user = await db
    .prepare("SELECT id, role, status FROM users WHERE id = ?")
    .get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  if (user.status !== "pending") {
    return res.status(400).json({ error: "هذا المستخدم ليس بانتظار الموافقة" });
  }

  if (user.role === "admin" && req.user.role !== "owner") {
    return res
      .status(403)
      .json({ error: "فقط المالك يقدر يوافق على حساب مدير" });
  }

  await db
    .prepare(
      "UPDATE users SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?",
    )
    .run(req.user.id, targetId);
  res.json({ ok: true });
});

router.post("/:id/reject", async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const targetId = Number(req.params.id);
  const user = await db
    .prepare("SELECT id, role, status FROM users WHERE id = ?")
    .get(targetId);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  if (user.status !== "pending") {
    return res.status(400).json({ error: "هذا المستخدم ليس بانتظار الموافقة" });
  }

  if (user.role === "admin" && req.user.role !== "owner") {
    return res
      .status(403)
      .json({ error: "فقط المالك يقدر يرفض حساب مدير" });
  }

  await db
    .prepare("UPDATE users SET status = 'rejected' WHERE id = ?")
    .run(targetId);
  res.json({ ok: true });
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
