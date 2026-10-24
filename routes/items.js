const express = require("express");
const db = require("../db");
const {
  isSqlite,
  withSqliteImmediateTransaction,
  withPostgresTransaction,
  createClientPrep,
} = require("../db");
const { requireAuth, verifySectionAccess } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { normalizePositiveId, validateOrderPayload } = require("../utils/order-validation");

const MAX_BATCH_ITEMS = 200;

const router = express.Router();
router.use(requireAuth);

router.get("/:sectionId/items", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  if (!(await db.prepare("SELECT 1 FROM sections WHERE id = ?").get(sectionId))) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }
  const items = await db
    .prepare("SELECT * FROM items WHERE section_id = ? ORDER BY sort_order ASC, id ASC")
    .all(sectionId);
  res.json({ items });
}));

router.post("/:sectionId/items", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }

  const {
    item_code,
    name,
    description,
    unit,
    qty,
    image,
    base_cost,
    overhead_pct,
    notes,
    sort_order,
    category_id,
    room_id,
  } = req.body;

  const baseCost = Number(base_cost) || 0;
  const overheadPct = Number(overhead_pct) || 35;
  const sellingPrice = baseCost * (1 + overheadPct / 100);

  const hasData =
    (name || "").trim() !== "" ||
    sellingPrice > 0 ||
    baseCost > 0;
  if (!hasData) {
    return res.status(400).json({ error: "البند يجب أن يحتوي على اسم أو سعر" });
  }

  let info;
  let assignedOrder;
  const roomClause = room_id == null ? "room_id IS NULL" : "room_id = ?";
  const roomParams = room_id == null ? [sectionId] : [sectionId, room_id];
  if (isSqlite()) {
    const result = withSqliteImmediateTransaction(() => {
      const maxOrder = db.prepare(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
         FROM items WHERE section_id = ? AND ${roomClause}`,
      ).get(...roomParams);
      const next = maxOrder.next_order;
      const inserted = db.prepare(
        `INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, category_id, room_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        sectionId, item_code || "", name || "", description || "", unit || "عدد",
        Number(qty) || 1, image || null, baseCost, overheadPct, sellingPrice,
        notes || "", next, category_id || null, room_id || null,
      );
      return { info: inserted, assignedOrder: next };
    });
    info = result.info;
    assignedOrder = result.assignedOrder;
  } else {
    const result = await withPostgresTransaction(async (client) => {
      await client.query("LOCK TABLE items IN SHARE ROW EXCLUSIVE MODE");
      const prep = createClientPrep(client);
      const maxOrder = await prep(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
         FROM items WHERE section_id = ? AND ${roomClause}`,
      ).get(...roomParams);
      const next = maxOrder.next_order;
      const inserted = await prep(
        `INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, category_id, room_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        sectionId, item_code || "", name || "", description || "", unit || "عدد",
        Number(qty) || 1, image || null, baseCost, overheadPct, sellingPrice,
        notes || "", next, category_id || null, room_id || null,
      );
      return { info: inserted, assignedOrder: next };
    });
    info = result.info;
    assignedOrder = result.assignedOrder;
  }
  res.json({ id: info.lastInsertRowid, selling_price: sellingPrice, sort_order: assignedOrder });
}));

router.post("/:sectionId/items/batch", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }

  const items = req.body && req.body.items;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "الحمولة يجب أن تكون مصفوفة من البنود" });
  }
  if (items.length === 0) {
    return res.status(400).json({ error: "لا يوجد بنود للإضافة" });
  }
  if (items.length > MAX_BATCH_ITEMS) {
    return res
      .status(400)
      .json({ error: `الحد الأقصى ${MAX_BATCH_ITEMS} بند في الطلب الواحد` });
  }

  const results = [];
  let batchBaseOrder = null;
  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx];
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        results.push({ index: idx, error: "بند غير صالح" });
        continue;
      }

      const {
        item_code,
        name,
        description,
        unit,
        qty,
        image,
        base_cost,
        overhead_pct,
        notes,
        sort_order,
        category_id,
        room_id,
      } = raw;

      const baseCost = Number(base_cost) || 0;
      const overheadPct = Number(overhead_pct) || 35;
      const sellingPrice = baseCost * (1 + overheadPct / 100);

      const hasData =
        (name || "").trim() !== "" ||
        sellingPrice > 0 ||
        baseCost > 0;
      if (!hasData) {
        results.push({ index: idx, error: "البند يجب أن يحتوي على اسم أو سعر" });
        continue;
      }

      let info;
      let assignedOrder;
      const roomClause = room_id == null ? "room_id IS NULL" : "room_id = ?";
      const roomParams = room_id == null ? [sectionId] : [sectionId, room_id];
      if (isSqlite()) {
        const inserted = withSqliteImmediateTransaction(() => {
          const max = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM items WHERE section_id = ? AND ${roomClause}`).get(...roomParams);
          if (batchBaseOrder === null) batchBaseOrder = max.next_order;
          const next = sort_order ?? Math.max(batchBaseOrder + idx, max.next_order);
          return {
            info: db.prepare(`INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, category_id, room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
              sectionId, item_code || "", name || "", description || "", unit || "عدد", Number(qty) || 1,
              image || null, baseCost, overheadPct, sellingPrice, notes || "", next, category_id || null, room_id || null,
            ),
            assignedOrder: next,
          };
        });
        info = inserted.info;
        assignedOrder = inserted.assignedOrder;
      } else {
        const inserted = await withPostgresTransaction(async (client) => {
          await client.query("LOCK TABLE items IN SHARE ROW EXCLUSIVE MODE");
          const prep = createClientPrep(client);
          const max = await prep(`SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM items WHERE section_id = ? AND ${roomClause}`).get(...roomParams);
          if (batchBaseOrder === null) batchBaseOrder = max.next_order;
          const next = sort_order ?? Math.max(batchBaseOrder + idx, max.next_order);
          return {
            info: await prep(`INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, category_id, room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
              sectionId, item_code || "", name || "", description || "", unit || "عدد", Number(qty) || 1,
              image || null, baseCost, overheadPct, sellingPrice, notes || "", next, category_id || null, room_id || null,
            ),
            assignedOrder: next,
          };
        });
        info = inserted.info;
        assignedOrder = inserted.assignedOrder;
      }
      results.push({
        index: idx,
        id: info.lastInsertRowid,
        selling_price: sellingPrice,
        sort_order: assignedOrder,
      });
    } catch (err) {
      results.push({ index: idx, error: err.message });
    }
  }

  res.json({ results });
}));

// Item group reorder endpoint - compare-and-set (must come before generic :id route)
router.put("/:sectionId/items/reorder", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا قسم" });
  }
  if (!(await db.prepare("SELECT 1 FROM sections WHERE id = ?").get(sectionId))) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }
  const { room_id, expected, order } = req.body && typeof req.body === "object" ? req.body : {};
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, "room_id")) {
    return res.status(400).json({ error: "room_id مطلوب" });
  }
  let normalizedRoomId = null;
  if (room_id !== null && room_id !== undefined) {
    normalizedRoomId = normalizePositiveId(room_id);
    if (!normalizedRoomId) {
      return res.status(400).json({ error: "معرف الغرفة غير صالح" });
    }
  }
  const validated = validateOrderPayload(expected, order);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { expectedIds, orderIds } = validated;
  const roomFilter = normalizedRoomId === null ? "AND room_id IS NULL" : "AND room_id = ?";
  const params = normalizedRoomId === null ? [sectionId] : [sectionId, normalizedRoomId];

  // Perform read+validation+write in a single transaction
  if (isSqlite()) {
    const result = withSqliteImmediateTransaction(() => {
      if (normalizedRoomId !== null &&
          !db.prepare("SELECT 1 FROM rooms WHERE id = ? AND section_id = ?").get(normalizedRoomId, sectionId)) {
        return { error: "الغرفة غير موجودة في هذا القسم", status: 404 };
      }
      const current = db
        .prepare(`SELECT id, sort_order FROM items WHERE section_id = ? ${roomFilter} ORDER BY sort_order ASC, id ASC`)
        .all(...params);
      const currentIds = current.map((r) => String(r.id));
      const currentIdsSorted = [...currentIds].sort();
      const expectedIdsSorted = [...expectedIds].sort();
      if (current.length === orderIds.length &&
          current.every((row, index) => currentIds[index] === orderIds[index] && row.sort_order === index)) {
        return { ok: true, already_applied: true, positions: current.map((row, idx) => ({ id: row.id, position: idx })) };
      }

      // Check membership (use numeric sort for SQLite)
      if (JSON.stringify(currentIdsSorted) !== JSON.stringify(expectedIdsSorted)) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const expectedMap = new Map(expected.map((e) => [String(e.id), e.sort_order]));
      let baselineMatches = true;
      for (const row of current) {
        if (expectedMap.get(String(row.id)) !== row.sort_order) {
          baselineMatches = false;
          break;
        }
      }

      if (!baselineMatches) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const stmt = db.prepare(`UPDATE items SET sort_order = ? WHERE id = ? AND section_id = ? ${roomFilter}`);
      const currentById = new Map(current.map((row) => [String(row.id), row.id]));
      for (let i = 0; i < orderIds.length; i++) {
        const info = stmt.run(i, currentById.get(orderIds[i]), ...params);
        if (info.rowCount !== 1) throw new Error("item reorder update affected an unexpected row");
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
      await client.query("LOCK TABLE items IN SHARE ROW EXCLUSIVE MODE");
      if (normalizedRoomId !== null &&
          !(await client.query("SELECT 1 FROM rooms WHERE id = $1 AND section_id = $2", [normalizedRoomId, sectionId])).rowCount) {
        return { error: "الغرفة غير موجودة في هذا القسم", status: 404 };
      }

      const roomFilterPg = normalizedRoomId === null ? "AND room_id IS NULL" : "AND room_id = $2";
      const selectQuery = "SELECT id, sort_order FROM items WHERE section_id = $1 " + roomFilterPg + " ORDER BY sort_order ASC, id ASC";
      const selectParams = normalizedRoomId === null ? [sectionId] : [sectionId, normalizedRoomId];
      const current = await client.query(selectQuery, selectParams);
      const normalizeId = (v) => String(v);
      const currentRows = current.rows;
      const currentIds = currentRows.map((r) => normalizeId(r.id));
      const currentIdsSorted = [...currentIds].sort();
      const expectedIdsSorted = [...expectedIds].sort();
      if (currentRows.length === orderIds.length &&
          currentRows.every((row, index) => currentIds[index] === orderIds[index] && Number(row.sort_order) === index)) {
        return { ok: true, already_applied: true, positions: currentRows.map((row, idx) => ({ id: row.id, position: idx })) };
      }

      if (JSON.stringify(currentIdsSorted) !== JSON.stringify(expectedIdsSorted)) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const expectedMap = new Map(expected.map((e) => [normalizeId(e.id), e.sort_order]));
      let baselineMatches = true;
      for (const row of current.rows) {
        if (expectedMap.get(normalizeId(row.id)) !== row.sort_order) {
          baselineMatches = false;
          break;
        }
      }

      if (!baselineMatches) {
        return { error: "ترتيب القائمة تغيّر، يرجى إعادة التحميل", code: "ORDER_CONFLICT", status: 409 };
      }

      const updateQuery = "UPDATE items SET sort_order = $1 WHERE id = $2 AND section_id = $3";
      const updateFilter = normalizedRoomId === null ? "" : " AND room_id = $4";
      const updateQueryFull = updateQuery + updateFilter;
      for (let i = 0; i < orderIds.length; i++) {
        const updateParams = normalizedRoomId === null ? [i, orderIds[i], sectionId] : [i, orderIds[i], sectionId, normalizedRoomId];
        const info = await client.query(updateQueryFull, updateParams);
        if (info.rowCount !== 1) throw new Error("item reorder update affected an unexpected row");
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

router.put("/:sectionId/items/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }

  const existing = await db
    .prepare("SELECT * FROM items WHERE id = ? AND section_id = ?")
    .get(req.params.id, sectionId);
  if (!existing) {
    return res.status(404).json({ error: "البند غير موجود" });
  }

  const {
    item_code,
    name,
    description,
    unit,
    qty,
    image,
    base_cost,
    overhead_pct,
    notes,
    sort_order,
    category_id,
    room_id,
  } = req.body;

  const baseCost =
    base_cost !== undefined ? Number(base_cost) : existing.base_cost;
  const overheadPct =
    overhead_pct !== undefined ? Number(overhead_pct) : existing.overhead_pct;
  const sellingPrice = baseCost * (1 + overheadPct / 100);

  await db
    .prepare(
      `UPDATE items SET
        item_code = COALESCE(?, item_code),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        unit = COALESCE(?, unit),
        qty = COALESCE(?, qty),
        image = ?,
        base_cost = ?,
        overhead_pct = ?,
        selling_price = ?,
        notes = COALESCE(?, notes),
        category_id = ?,
        room_id = ?
       WHERE id = ? AND section_id = ?`,
    )
    .run(
      item_code,
      name,
      description,
      unit,
      qty,
      image !== undefined ? image : existing.image,
      baseCost,
      overheadPct,
      sellingPrice,
      notes,
      category_id !== undefined ? (category_id || null) : existing.category_id,
      room_id !== undefined ? (room_id || null) : existing.room_id,
      req.params.id,
      sectionId,
    );

  res.json({ ok: true, selling_price: sellingPrice });
}));

router.delete("/:sectionId/items/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!(await verifySectionAccess(sectionId, req.user.id, req.user.role))) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  await db
    .prepare("DELETE FROM items WHERE id = ? AND section_id = ?")
    .run(req.params.id, sectionId);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.MAX_BATCH_ITEMS = MAX_BATCH_ITEMS;