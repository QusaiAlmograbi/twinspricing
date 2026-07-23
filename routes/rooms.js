const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

function verifySectionAccess(sectionId, userId, role) {
  if (role === "owner" || role === "admin") return true;
  return db
    .prepare(
      `SELECT 1 FROM sections s
       JOIN quotes q ON q.id = s.quote_id
       WHERE s.id = ? AND q.user_id = ?
       UNION
       SELECT 1 FROM sections s
       JOIN project_access pa ON pa.quote_id = s.quote_id
       WHERE s.id = ? AND pa.user_id = ?`,
    )
    .get(sectionId, userId, sectionId, userId);
}

router.get("/:sectionId/rooms", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const rooms = await db
    .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
    .all(sectionId);
  for (const room of rooms) {
    room.items = await db
      .prepare("SELECT * FROM items WHERE room_id = ? ORDER BY sort_order ASC")
      .all(room.id);
  }
  res.json({ rooms });
}));

router.post("/:sectionId/rooms", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const { name, sort_order } = req.body;
  if (!name) {
    return res.status(400).json({ error: "اسم الغرفة مطلوب" });
  }

  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?")
    .get(sectionId);

  const info = await db
    .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)")
    .run(sectionId, name.trim(), sort_order ?? maxOrder.next_order);

  res.json({ id: info.lastInsertRowid, name: name.trim(), sort_order: sort_order ?? maxOrder.next_order });
}));

router.put("/:sectionId/rooms/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const { name, sort_order } = req.body;
  await db
    .prepare(
      "UPDATE rooms SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ? AND section_id = ?",
    )
    .run(name, sort_order, req.params.id, sectionId);
  res.json({ ok: true });
}));

router.delete("/:sectionId/rooms/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  await db.prepare("DELETE FROM items WHERE room_id = ?").run(req.params.id);
  await db
    .prepare("DELETE FROM rooms WHERE id = ? AND section_id = ?")
    .run(req.params.id, sectionId);
  res.json({ ok: true });
}));

module.exports = router;
