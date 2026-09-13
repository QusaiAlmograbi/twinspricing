const express = require("express");
const db = require("../db");
const {
  isSqlite,
  withSqliteTransaction,
  withPostgresTransaction,
  createClientPrep,
} = require("../db");
const { requireAuth, verifySectionAccess } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const MAX_BATCH_ROOMS = 100;

const router = express.Router();
router.use(requireAuth);

router.get("/:sectionId/rooms", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const rooms = await db
    .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
    .all(sectionId);
  const roomIds = rooms.map((room) => room.id);
  const batchItems = roomIds.length
    ? await db
        .prepare("SELECT * FROM items WHERE room_id IN (" + roomIds.map(() => "?").join(",") + ") ORDER BY sort_order ASC")
        .all(...roomIds)
    : [];
  const itemsByRoom = new Map();
  for (const item of batchItems) {
    if (!itemsByRoom.has(item.room_id)) itemsByRoom.set(item.room_id, []);
    itemsByRoom.get(item.room_id).push(item);
  }
  for (const room of rooms) {
    room.items = itemsByRoom.get(room.id) || [];
  }
  res.json({ rooms });
}));

router.post("/:sectionId/rooms", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
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

router.post("/:sectionId/rooms/batch", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }

  const rooms = req.body && req.body.rooms;
  if (!Array.isArray(rooms)) {
    return res.status(400).json({ error: "الحمولة يجب أن تكون مصفوفة من الغرف" });
  }
  if (rooms.length === 0) {
    return res.status(400).json({ error: "لا يوجد غرف للإضافة" });
  }
  if (rooms.length > MAX_BATCH_ROOMS) {
    return res
      .status(400)
      .json({ error: `الحد الأقصى ${MAX_BATCH_ROOMS} غرفة في الطلب الواحد` });
  }

  const baseOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?")
    .get(sectionId);
  const base = Number(baseOrder.next_order);

  const results = [];
  for (let idx = 0; idx < rooms.length; idx++) {
    const raw = rooms[idx];
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        results.push({ index: idx, error: "غرفة غير صالحة" });
        continue;
      }
      const { name, sort_order } = raw;
      if (!name) {
        results.push({ index: idx, error: "اسم الغرفة مطلوب" });
        continue;
      }
      const assignedOrder = sort_order ?? base + idx;
      const info = await db
        .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)")
        .run(sectionId, name.trim(), assignedOrder);
      results.push({
        index: idx,
        id: info.lastInsertRowid,
        name: name.trim(),
        sort_order: assignedOrder,
      });
    } catch (err) {
      results.push({ index: idx, error: err.message });
    }
  }

  res.json({ results });
}));

router.put("/:sectionId/rooms/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
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
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const roomId = req.params.id;
  if (isSqlite()) {
    withSqliteTransaction(() => {
      db.prepare("DELETE FROM items WHERE room_id = ?").run(roomId);
      db.prepare("DELETE FROM rooms WHERE id = ? AND section_id = ?").run(roomId, sectionId);
    });
  } else {
    await withPostgresTransaction(async (client) => {
      const prep = createClientPrep(client);
      await prep("DELETE FROM items WHERE room_id = ?").run(roomId);
      await prep("DELETE FROM rooms WHERE id = ? AND section_id = ?").run(roomId, sectionId);
    });
  }
  res.json({ ok: true });
}));

module.exports = router;
module.exports.MAX_BATCH_ROOMS = MAX_BATCH_ROOMS;
