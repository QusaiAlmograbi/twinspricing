const express = require("express");
const db = require("../db");
const {
  isSqlite,
  withSqliteTransaction,
  withSqliteImmediateTransaction,
  withPostgresTransaction,
  createClientPrep,
} = require("../db");
const { requireAuth, verifySectionAccess } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateOrderPayload } = require("../utils/order-validation");

const MAX_BATCH_ROOMS = 100;

const router = express.Router();
router.use(requireAuth);

router.get("/:sectionId/rooms", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const rooms = await db
    .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC, id ASC")
    .all(sectionId);
  const roomIds = rooms.map((room) => room.id);
  const batchItems = roomIds.length
    ? await db
        .prepare("SELECT * FROM items WHERE room_id IN (" + roomIds.map(() => "?").join(",") + ") ORDER BY sort_order ASC, id ASC")
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

  let info;
  let assignedOrder;
  if (isSqlite()) {
    const result = withSqliteImmediateTransaction(() => {
      const maxOrder = db.prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?",
      ).get(sectionId);
      const next = sort_order ?? maxOrder.next_order;
      const inserted = db.prepare(
        "INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)",
      ).run(sectionId, name.trim(), next);
      return { info: inserted, assignedOrder: next };
    });
    info = result.info;
    assignedOrder = result.assignedOrder;
  } else {
    const result = await withPostgresTransaction(async (client) => {
      await client.query("LOCK TABLE rooms IN SHARE ROW EXCLUSIVE MODE");
      const prep = createClientPrep(client);
      const maxOrder = await prep(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?",
      ).get(sectionId);
      const next = sort_order ?? maxOrder.next_order;
      const inserted = await prep(
        "INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)",
      ).run(sectionId, name.trim(), next);
      return { info: inserted, assignedOrder: next };
    });
    info = result.info;
    assignedOrder = result.assignedOrder;
  }
  res.json({ id: info.lastInsertRowid, name: name.trim(), sort_order: assignedOrder });
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

  const results = [];
  let batchBaseOrder = null;
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
      let info;
      let assignedOrder;
      if (isSqlite()) {
        const inserted = withSqliteImmediateTransaction(() => {
          const max = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?").get(sectionId);
          if (batchBaseOrder === null) batchBaseOrder = max.next_order;
          const next = sort_order ?? Math.max(batchBaseOrder + idx, max.next_order);
          return { info: db.prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)").run(sectionId, name.trim(), next), assignedOrder: next };
        });
        info = inserted.info;
        assignedOrder = inserted.assignedOrder;
      } else {
        const inserted = await withPostgresTransaction(async (client) => {
          await client.query("LOCK TABLE rooms IN SHARE ROW EXCLUSIVE MODE");
          const prep = createClientPrep(client);
          const max = await prep("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM rooms WHERE section_id = ?").get(sectionId);
          if (batchBaseOrder === null) batchBaseOrder = max.next_order;
          const next = sort_order ?? Math.max(batchBaseOrder + idx, max.next_order);
          return { info: await prep("INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)").run(sectionId, name.trim(), next), assignedOrder: next };
        });
        info = inserted.info;
        assignedOrder = inserted.assignedOrder;
      }
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

// Room reorder endpoint - compare-and-set (must come before generic :id route)
router.put("/:sectionId/rooms/reorder", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا قسم" });
  }
  if (!(await db.prepare("SELECT 1 FROM sections WHERE id = ?").get(sectionId))) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }
  const { expected, order } = req.body && typeof req.body === "object" ? req.body : {};
  const validated = validateOrderPayload(expected, order);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { expectedIds, orderIds } = validated;

  // Perform read+validation+write in a single transaction
  if (isSqlite()) {
    const result = withSqliteImmediateTransaction(() => {
      const current = db
        .prepare("SELECT id, sort_order FROM rooms WHERE section_id = ? ORDER BY sort_order ASC, id ASC")
        .all(sectionId);
      const normalizeId = (v) => String(v);
      const currentIds = current.map((r) => normalizeId(r.id));
      const currentIdsSorted = [...currentIds].sort();
      const expectedIdsSorted = [...expectedIds].sort();
      if (current.length === orderIds.length &&
          current.every((row, index) => currentIds[index] === orderIds[index] && row.sort_order === index)) {
        return { ok: true, already_applied: true, positions: current.map((row, idx) => ({ id: row.id, position: idx })) };
      }

      // Check membership
      if (JSON.stringify(currentIdsSorted) !== JSON.stringify(expectedIdsSorted)) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const expectedMap = new Map(expected.map((e) => [normalizeId(e.id), e.sort_order]));
      let baselineMatches = true;
      for (const row of current) {
        if (expectedMap.get(normalizeId(row.id)) !== row.sort_order) {
          baselineMatches = false;
          break;
        }
      }

      if (!baselineMatches) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const stmt = db.prepare("UPDATE rooms SET sort_order = ? WHERE id = ? AND section_id = ?");
      const currentById = new Map(current.map((row) => [String(row.id), row.id]));
      for (let i = 0; i < orderIds.length; i++) {
        const info = stmt.run(i, currentById.get(orderIds[i]), sectionId);
        if (info.rowCount !== 1) throw new Error("room reorder update affected an unexpected row");
      }

      const positions = orderIds.map((id, idx) => ({ id, position: idx }));
      return { ok: true, already_applied: false, positions };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, code: result.code });
    }
    return res.json(result);
  } else {
    const result = await withPostgresTransaction(async (client) => {
      await client.query("LOCK TABLE rooms IN SHARE ROW EXCLUSIVE MODE");
      const prep = createClientPrep(client);

      const current = await prep("SELECT id, sort_order FROM rooms WHERE section_id = $1 ORDER BY sort_order ASC, id ASC").all(sectionId);
      const normalizeId = (v) => String(v);
      const currentIds = current.map((r) => normalizeId(r.id));
      const currentIdsSorted = [...currentIds].sort();
      const expectedIdsSorted = [...expectedIds].sort();
      if (current.length === orderIds.length &&
          current.every((row, index) => currentIds[index] === orderIds[index] && Number(row.sort_order) === index)) {
        return { ok: true, already_applied: true, positions: current.map((row, idx) => ({ id: row.id, position: idx })) };
      }

      if (JSON.stringify(currentIdsSorted) !== JSON.stringify(expectedIdsSorted)) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const expectedMap = new Map(expected.map((e) => [normalizeId(e.id), e.sort_order]));
      let baselineMatches = true;
      for (const row of current) {
        if (expectedMap.get(normalizeId(row.id)) !== row.sort_order) {
          baselineMatches = false;
          break;
        }
      }

      if (!baselineMatches) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      for (let i = 0; i < orderIds.length; i++) {
        const info = await prep("UPDATE rooms SET sort_order = $1 WHERE id = $2 AND section_id = $3").run(i, orderIds[i], sectionId);
        if (info.rowCount !== 1) throw new Error("room reorder update affected an unexpected row");
      }

      const positions = orderIds.map((id, idx) => ({ id, position: idx }));
      return { ok: true, already_applied: false, positions };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, code: result.code });
    }
    return res.json(result);
  }
}));

router.put("/:sectionId/rooms/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const { name, sort_order } = req.body;
  await db
    .prepare(
      "UPDATE rooms SET name = COALESCE(?, name) WHERE id = ? AND section_id = ?",
    )
    .run(name, req.params.id, sectionId);
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
