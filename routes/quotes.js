const express = require("express");
const db = require("../db");
const { requireAuth, isAdminOrOwner } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  let rows;
  if (isAdminOrOwner(req.user.role)) {
    rows = db
      .prepare(
        `SELECT q.id, q.project_name, q.total, q.created_at, q.updated_at,
                u.id as user_id, u.name as designer_name
         FROM quotes q JOIN users u ON u.id = q.user_id
         ORDER BY q.updated_at DESC`,
      )
      .all();
  } else {
    rows = db
      .prepare(
        `SELECT q.id, q.project_name, q.total, q.created_at, q.updated_at
         FROM quotes q
         WHERE q.user_id = ?
           OR EXISTS (
             SELECT 1 FROM project_access pa WHERE pa.quote_id = q.id AND pa.user_id = ?
           )
         ORDER BY q.updated_at DESC`,
      )
      .all(req.user.id, req.user.id);
  }
  res.json({ quotes: rows });
});

router.get("/:id", (req, res) => {
  const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  const hasAccess = db
    .prepare("SELECT 1 FROM project_access WHERE quote_id = ? AND user_id = ?")
    .get(q.id, req.user.id);
  if (
    !isAdminOrOwner(req.user.role) &&
    q.user_id !== req.user.id &&
    !hasAccess
  ) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  res.json({ quote: { ...q, data: JSON.parse(q.data) } });
});

router.post("/", (req, res) => {
  const { project_name, data, total } = req.body;
  if (!data) return res.status(400).json({ error: "بيانات العرض ناقصة" });
  const info = db
    .prepare(
      `INSERT INTO quotes (user_id, project_name, data, total, created_at, updated_at)
       VALUES (?,?,?,?, datetime('now'), datetime('now'))`,
    )
    .run(
      req.user.id,
      project_name || "مشروع بدون اسم",
      JSON.stringify(data),
      total || 0,
    );
  res.json({ id: info.lastInsertRowid });
});

router.post("/:id/access", (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const quoteId = Number(req.params.id);
  const { user_id, permission = "view" } = req.body;
  const userId = Number(user_id);
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
  if (!quote) return res.status(404).json({ error: "المشروع غير موجود" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  if (user.role !== "designer") {
    return res.status(400).json({ error: "يمكن منح الوصول لمصمم فقط" });
  }

  db.prepare(
    `INSERT OR IGNORE INTO project_access (quote_id, user_id, granted_by, permission)
     VALUES (?,?,?,?)`,
  ).run(quoteId, userId, req.user.id, permission || "view");

  res.json({ ok: true });
});

router.put("/:id", (req, res) => {
  const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  if (!isAdminOrOwner(req.user.role) && q.user_id !== req.user.id) {
    return res.status(403).json({ error: "ما عندك صلاحية لتعديل هذا العرض" });
  }
  const { project_name, data, total } = req.body;
  db.prepare(
    `UPDATE quotes SET project_name = ?, data = ?, total = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    project_name || "مشروع بدون اسم",
    JSON.stringify(data),
    total || 0,
    req.params.id,
  );
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  if (!isAdminOrOwner(req.user.role) && q.user_id !== req.user.id) {
    return res.status(403).json({ error: "ما عندك صلاحية لحذف هذا العرض" });
  }
  db.prepare("DELETE FROM project_access WHERE quote_id = ?").run(
    req.params.id,
  );
  db.prepare("DELETE FROM quotes WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
