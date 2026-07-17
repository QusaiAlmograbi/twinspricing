const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

function verifyQuoteAccess(quoteId, userId, role) {
  if (role === "owner" || role === "admin") return true;
  return db
    .prepare(
      `SELECT 1 FROM quotes WHERE id = ? AND user_id = ?
       UNION
       SELECT 1 FROM project_access WHERE quote_id = ? AND user_id = ?`,
    )
    .get(quoteId, userId, quoteId, userId);
}

router.get("/:quoteId/sections", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!verifyQuoteAccess(quoteId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const sections = await db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(quoteId);

  for (const sec of sections) {
    sec.items = await db
      .prepare("SELECT * FROM items WHERE section_id = ? ORDER BY sort_order ASC")
      .all(sec.id);
  }

  res.json({ sections });
}));

router.post("/:quoteId/sections", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!verifyQuoteAccess(quoteId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const { code, name, sort_order } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: "الكود والاسم مطلوبين" });
  }

  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sections WHERE quote_id = ?")
    .get(quoteId);

  const info = await db
    .prepare(
      "INSERT INTO sections (quote_id, code, name, sort_order) VALUES (?,?,?,?)",
    )
    .run(quoteId, code.trim(), name.trim(), sort_order ?? maxOrder.next_order);

  res.json({ id: info.lastInsertRowid, code: code.trim(), name: name.trim() });
}));

router.put("/:quoteId/sections/:id", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!verifyQuoteAccess(quoteId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const { code, name, sort_order } = req.body;
  await db
    .prepare(
      "UPDATE sections SET code = COALESCE(?, code), name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ? AND quote_id = ?",
    )
    .run(code, name, sort_order, req.params.id, quoteId);
  res.json({ ok: true });
}));

router.delete("/:quoteId/sections/:id", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!verifyQuoteAccess(quoteId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  await db.prepare("DELETE FROM items WHERE section_id = ?").run(req.params.id);
  await db
    .prepare("DELETE FROM sections WHERE id = ? AND quote_id = ?")
    .run(req.params.id, quoteId);
  res.json({ ok: true });
}));

module.exports = router;
