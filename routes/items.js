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

router.get("/:sectionId/items", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  const items = await db
    .prepare("SELECT * FROM items WHERE section_id = ? ORDER BY sort_order ASC")
    .all(sectionId);
  res.json({ items });
}));

router.post("/:sectionId/items", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
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
  } = req.body;

  const baseCost = Number(base_cost) || 0;
  const overheadPct = Number(overhead_pct) || 35;
  const sellingPrice = baseCost * (1 + overheadPct / 100);

  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM items WHERE section_id = ?")
    .get(sectionId);

  const info = await db
    .prepare(
      `INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, category_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      sectionId,
      item_code || "",
      name || "",
      description || "",
      unit || "عدد",
      Number(qty) || 1,
      image || null,
      baseCost,
      overheadPct,
      sellingPrice,
      notes || "",
      sort_order ?? maxOrder.next_order,
      category_id || null,
    );

  res.json({ id: info.lastInsertRowid, selling_price: sellingPrice });
}));

router.put("/:sectionId/items/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
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
        sort_order = COALESCE(?, sort_order),
        category_id = ?
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
      sort_order,
      category_id !== undefined ? (category_id || null) : existing.category_id,
      req.params.id,
      sectionId,
    );

  res.json({ ok: true, selling_price: sellingPrice });
}));

router.delete("/:sectionId/items/:id", asyncHandler(async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!verifySectionAccess(sectionId, req.user.id, req.user.role)) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا القسم" });
  }
  await db
    .prepare("DELETE FROM items WHERE id = ? AND section_id = ?")
    .run(req.params.id, sectionId);
  res.json({ ok: true });
}));

module.exports = router;
