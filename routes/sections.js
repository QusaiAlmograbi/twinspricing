const express = require("express");
const db = require("../db");
const {
  isSqlite,
  withSqliteTransaction,
  withPostgresTransaction,
  createClientPrep,
} = require("../db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const MAX_BATCH_SECTIONS = 100;

const router = express.Router();
router.use(requireAuth);

async function verifyQuoteAccess(quoteId, userId, role) {
  if (role === "owner" || role === "admin") return true;
  const row = await db
    .prepare(
      `SELECT 1 FROM quotes WHERE id = ? AND user_id = ?
       UNION
       SELECT 1 FROM project_access WHERE quote_id = ? AND user_id = ?`,
    )
    .get(quoteId, userId, quoteId, userId);
  return !!row;
}

router.get("/:quoteId/sections", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const sections = await db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(quoteId);

  const ids = sections.map((sec) => sec.id);
  const items = ids.length
    ? await db
        .prepare(
          "SELECT * FROM items WHERE section_id IN (" + ids.map(() => "?").join(",") + ") ORDER BY sort_order ASC"
        )
        .all(...ids)
    : [];
  const bySection = new Map();
  for (const it of items) {
    if (!bySection.has(it.section_id)) bySection.set(it.section_id, []);
    bySection.get(it.section_id).push(it);
  }
  for (const sec of sections) {
    sec.items = bySection.get(sec.id) || [];
  }

  res.json({ sections });
}));

router.post("/:quoteId/sections", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
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

router.post("/:quoteId/sections/batch", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }

  const sections = req.body && req.body.sections;
  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: "الحمولة يجب أن تكون مصفوفة من الأقسام" });
  }
  if (sections.length === 0) {
    return res.status(400).json({ error: "لا يوجد أقسام للإضافة" });
  }
  if (sections.length > MAX_BATCH_SECTIONS) {
    return res
      .status(400)
      .json({ error: `الحد الأقصى ${MAX_BATCH_SECTIONS} قسم في الطلب الواحد` });
  }

  const baseOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sections WHERE quote_id = ?")
    .get(quoteId);
  const base = Number(baseOrder.next_order);

  const results = [];
  for (let idx = 0; idx < sections.length; idx++) {
    const raw = sections[idx];
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        results.push({ index: idx, error: "قسم غير صالح" });
        continue;
      }
      const { code, name, sort_order } = raw;
      if (!code || !name) {
        results.push({ index: idx, error: "الكود والاسم مطلوبين" });
        continue;
      }
      const info = await db
        .prepare(
          "INSERT INTO sections (quote_id, code, name, sort_order) VALUES (?,?,?,?)",
        )
        .run(quoteId, code.trim(), name.trim(), sort_order ?? base + idx);
      results.push({
        index: idx,
        id: info.lastInsertRowid,
        code: code.trim(),
        name: name.trim(),
      });
    } catch (err) {
      results.push({ index: idx, error: err.message });
    }
  }

  res.json({ results });
}));

router.post("/:quoteId/rooms/:roomId/clone", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  const roomId = Number(req.params.roomId);
  const { targetSectionId } = req.body;

  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  if (!targetSectionId) {
    return res.status(400).json({ error: "القسم الهدف مطلوب" });
  }

  const sourceRoom = await db
    .prepare(
      "SELECT r.*, r.section_id as source_section_id FROM rooms r JOIN sections s ON r.section_id = s.id WHERE r.id = ? AND s.quote_id = ?"
    )
    .get(roomId, quoteId);
  if (!sourceRoom) {
    return res.status(404).json({ error: "الغرفة غير موجودة" });
  }

  if (Number(targetSectionId) === sourceRoom.source_section_id) {
    return res.status(400).json({ error: "لا يمكن نسخ الغرفة إلى نفس القسم" });
  }

  const targetSection = await db
    .prepare("SELECT * FROM sections WHERE id = ? AND quote_id = ?")
    .get(targetSectionId, quoteId);
  if (!targetSection) {
    return res.status(404).json({ error: "القسم الهدف غير موجود" });
  }
  let result;
  if (isSqlite()) {
    result = withSqliteTransaction(() => {
      if (!targetSection.has_rooms) {
        db.prepare("UPDATE sections SET has_rooms = 1 WHERE id = ?").run(targetSectionId);
      }

      const maxRoomOrder = db
        .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM rooms WHERE section_id = ?")
        .get(targetSectionId);
      const roomInfo = db
        .prepare("INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)")
        .run(targetSectionId, sourceRoom.name, maxRoomOrder.next);
      const newRoomId = roomInfo.lastInsertRowid;

      const items = db
        .prepare("SELECT * FROM items WHERE room_id = ?")
        .all(roomId);
      for (const item of items) {
        db.prepare(
          `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, image,
           base_cost, overhead_pct, selling_price, notes, sort_order, category_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          targetSectionId, newRoomId, item.item_code ?? "", item.name ?? "",
          item.description ?? "", item.unit ?? "عدد", item.qty ?? 1,
          item.image ?? null, Number(item.base_cost) || 0,
          Number(item.overhead_pct) || 35,
          item.selling_price != null ? Number(item.selling_price) : (Number(item.base_cost) || 0) * (1 + (Number(item.overhead_pct) || 35) / 100),
          item.notes ?? "", item.sort_order ?? 0, item.category_id ?? null
        );
      }
      return { newRoomId, itemCount: items.length, wasDirect: !targetSection.has_rooms };
    });
  } else {
    result = await withPostgresTransaction(async (client) => {
      const prep = createClientPrep(client);

      if (!targetSection.has_rooms) {
        await prep("UPDATE sections SET has_rooms = 1 WHERE id = ?").run(targetSectionId);
      }

      const maxRoomOrder = await prep(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM rooms WHERE section_id = ?"
      ).get(targetSectionId);
      const roomInfo = await prep(
        "INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)"
      ).run(targetSectionId, sourceRoom.name, maxRoomOrder.next);
      const newRoomId = roomInfo.lastInsertRowid;

      const items = await prep(
        "SELECT * FROM items WHERE room_id = ?"
      ).all(roomId);
      for (const item of items) {
        await prep(
          `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, image,
           base_cost, overhead_pct, selling_price, notes, sort_order, category_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          targetSectionId, newRoomId, item.item_code ?? "", item.name ?? "",
          item.description ?? "", item.unit ?? "عدد", item.qty ?? 1,
          item.image ?? null, Number(item.base_cost) || 0,
          Number(item.overhead_pct) || 35,
          item.selling_price != null ? Number(item.selling_price) : (Number(item.base_cost) || 0) * (1 + (Number(item.overhead_pct) || 35) / 100),
          item.notes ?? "", item.sort_order ?? 0, item.category_id ?? null
        );
      }
      return { newRoomId, itemCount: items.length, wasDirect: !targetSection.has_rooms };
    });
  }

  const newRoom = await db
    .prepare("SELECT * FROM rooms WHERE id = ?")
    .get(result.newRoomId);
  newRoom.items = await db
    .prepare("SELECT * FROM items WHERE room_id = ? ORDER BY sort_order ASC")
    .all(result.newRoomId);

  res.status(201).json({ room: newRoom, items: newRoom.items, itemCount: newRoom.items.length, wasDirect: !!result.wasDirect });
}));

router.post("/:quoteId/sections/:id/clone-direct", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  const sectionId = Number(req.params.id);
  const { code, name } = req.body;

  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  if (!code || !name) {
    return res.status(400).json({ error: "الكود والاسم مطلوبين" });
  }

  const sourceSection = await db
    .prepare("SELECT * FROM sections WHERE id = ? AND quote_id = ?")
    .get(sectionId, quoteId);
  if (!sourceSection) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  let result;
  if (isSqlite()) {
    result = withSqliteTransaction(() => {
      const maxSecOrder = db
        .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM sections WHERE quote_id = ?")
        .get(quoteId);
      const secInfo = db
        .prepare("INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?,?,?,?,?)")
        .run(quoteId, code.trim(), name.trim(), maxSecOrder.next, 0);
      const newSectionId = secInfo.lastInsertRowid;

      const items = db
        .prepare("SELECT * FROM items WHERE section_id = ? AND room_id IS NULL")
        .all(sectionId);
      for (const item of items) {
        db.prepare(
          `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, image,
           base_cost, overhead_pct, selling_price, notes, sort_order, category_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          newSectionId, null, item.item_code ?? "", item.name ?? "",
          item.description ?? "", item.unit ?? "عدد", item.qty ?? 1,
          item.image ?? null, Number(item.base_cost) || 0,
          Number(item.overhead_pct) || 35,
          item.selling_price != null ? Number(item.selling_price) : (Number(item.base_cost) || 0) * (1 + (Number(item.overhead_pct) || 35) / 100),
          item.notes ?? "", item.sort_order ?? 0, item.category_id ?? null
        );
      }
      return { newSectionId };
    });
  } else {
    result = await withPostgresTransaction(async (client) => {
      const prep = createClientPrep(client);

      const maxSecOrder = await prep(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM sections WHERE quote_id = ?"
      ).get(quoteId);
      const secInfo = await prep(
        "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?,?,?,?,?)"
      ).run(quoteId, code.trim(), name.trim(), maxSecOrder.next, 0);
      const newSectionId = secInfo.lastInsertRowid;

      const items = await prep(
        "SELECT * FROM items WHERE section_id = ? AND room_id IS NULL"
      ).all(sectionId);
      for (const item of items) {
        await prep(
          `INSERT INTO items (section_id, room_id, item_code, name, description, unit, qty, image,
           base_cost, overhead_pct, selling_price, notes, sort_order, category_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          newSectionId, null, item.item_code ?? "", item.name ?? "",
          item.description ?? "", item.unit ?? "عدد", item.qty ?? 1,
          item.image ?? null, Number(item.base_cost) || 0,
          Number(item.overhead_pct) || 35,
          item.selling_price != null ? Number(item.selling_price) : (Number(item.base_cost) || 0) * (1 + (Number(item.overhead_pct) || 35) / 100),
          item.notes ?? "", item.sort_order ?? 0, item.category_id ?? null
        );
      }
      return { newSectionId };
    });
  }

  const newSection = await db
    .prepare("SELECT * FROM sections WHERE id = ?")
    .get(result.newSectionId);
  newSection.items = await db
    .prepare("SELECT * FROM items WHERE section_id = ? AND room_id IS NULL ORDER BY sort_order ASC")
    .all(result.newSectionId);
  newSection.rooms = [];

  res.status(201).json({ section: newSection });
}));

router.put("/:quoteId/sections/:id", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const { code, name, sort_order, has_rooms } = req.body;
  await db
    .prepare(
      "UPDATE sections SET code = COALESCE(?, code), name = COALESCE(?, name), sort_order = COALESCE(?, sort_order), has_rooms = COALESCE(?, has_rooms) WHERE id = ? AND quote_id = ?",
    )
    .run(code, name, sort_order, has_rooms !== undefined ? (has_rooms ? 1 : 0) : null, req.params.id, quoteId);
  res.json({ ok: true });
}));

router.delete("/:quoteId/sections/:id", asyncHandler(async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  if (!(await verifyQuoteAccess(quoteId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }
  const sectionId = req.params.id;
  if (isSqlite()) {
    withSqliteTransaction(() => {
      db.prepare("DELETE FROM items WHERE section_id = ?").run(sectionId);
      db.prepare("DELETE FROM rooms WHERE section_id = ?").run(sectionId);
      db.prepare("DELETE FROM sections WHERE id = ? AND quote_id = ?").run(sectionId, quoteId);
    });
  } else {
    await withPostgresTransaction(async (client) => {
      const prep = createClientPrep(client);
      await prep("DELETE FROM items WHERE section_id = ?").run(sectionId);
      await prep("DELETE FROM rooms WHERE section_id = ?").run(sectionId);
      await prep("DELETE FROM sections WHERE id = ? AND quote_id = ?").run(sectionId, quoteId);
    });
  }
  res.json({ ok: true });
}));

module.exports = router;
module.exports.MAX_BATCH_SECTIONS = MAX_BATCH_SECTIONS;
