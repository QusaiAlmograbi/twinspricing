const express = require("express");
const db = require("../db");
const { seedDefaultPriceList } = require("../db");
const { requireAuth, isAdminOrOwner } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

// GET /api/price-list — List all categories with item counts
router.get("/", asyncHandler(async (req, res) => {
  const categories = await db
    .prepare(
      `SELECT pc.id, pc.name, pc.sort_order,
              COUNT(pi.id) as item_count
       FROM price_categories pc
       LEFT JOIN price_items pi ON pi.category_id = pc.id
       GROUP BY pc.id
       ORDER BY pc.sort_order ASC, pc.name ASC`
    )
    .all();
  res.json({ categories });
}));

// GET /api/price-list/diagnostic — Check DB status (admin/owner only)
router.get("/diagnostic", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const catCount = await db.prepare("SELECT COUNT(*) as count FROM price_categories").get();
  const itemCount = await db.prepare("SELECT COUNT(*) as count FROM price_items").get();

  res.json({
    database: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite",
    price_categories_count: catCount?.count ?? 0,
    price_items_count: itemCount?.count ?? 0,
  });
}));

// POST /api/price-list/seed — Manually trigger default seed (admin/owner only)
// Supports ?force=true to re-seed even if data exists
router.post("/seed", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const force = req.query.force === "true" || req.query.force === true;

  const existing = await db.prepare("SELECT id FROM price_categories LIMIT 1").get();
  if (existing && !force) {
    const catCount = await db.prepare("SELECT COUNT(*) as count FROM price_categories").get();
    const itemCount = await db.prepare("SELECT COUNT(*) as count FROM price_items").get();
    return res.json({
      message: "البيانات موجودة مسبقاً، لا حاجة لإعادة التعبئة.",
      categories: catCount?.count ?? 0,
      items: itemCount?.count ?? 0,
    });
  }

  if (force && existing) {
    console.log("[seed] Force re-seeding: clearing existing price list data...");
    await db.prepare("DELETE FROM price_items").run();
    await db.prepare("DELETE FROM price_categories").run();
  }

  await seedDefaultPriceList();

  const catCount = await db.prepare("SELECT COUNT(*) as count FROM price_categories").get();
  const itemCount = await db.prepare("SELECT COUNT(*) as count FROM price_items").get();
  const cats = catCount?.count ?? 0;
  const items = itemCount?.count ?? 0;

  if (cats >= 9 && items > 0) {
    res.json({ message: `تم تعبئة البيانات بنجاح: ${cats} أقسام و${items} بند.`, categories: cats, items });
  } else {
    res.status(500).json({ error: `تعبئة غير مكتملة: ${cats} أقسام و${items} بند. تحقق من سيرفر logs.`, categories: cats, items });
  }
}));

// GET /api/price-list/:categoryId/items — List items in a category (with optional ?q= search)
router.get("/:categoryId/items", asyncHandler(async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await db
    .prepare("SELECT * FROM price_categories WHERE id = ?")
    .get(categoryId);
  if (!category) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  const q = (req.query.q || "").trim();
  let items;
  if (q) {
    items = await db
      .prepare(
        `SELECT * FROM price_items
         WHERE category_id = ? AND (name LIKE ? OR item_code LIKE ?)
         ORDER BY item_code ASC, name ASC`
      )
      .all(categoryId, `%${q}%`, `%${q}%`);
  } else {
    items = await db
      .prepare(
        "SELECT * FROM price_items WHERE category_id = ? ORDER BY item_code ASC, name ASC"
      )
      .all(categoryId);
  }
  res.json({ category, items });
}));

// POST /api/price-list — Create category (admin/owner only)
router.post("/", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const { name, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "اسم القسم مطلوب" });
  }

  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM price_categories")
    .get();

  const info = await db
    .prepare("INSERT INTO price_categories (name, sort_order) VALUES (?, ?)")
    .run(name.trim(), sort_order ?? maxOrder.next_order);

  res.json({ id: info.lastInsertRowid, name: name.trim(), sort_order: sort_order ?? maxOrder.next_order });
}));

// POST /api/price-list/:categoryId/items — Add item to category (admin/owner only)
router.post("/:categoryId/items", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const categoryId = Number(req.params.categoryId);
  const category = await db
    .prepare("SELECT * FROM price_categories WHERE id = ?")
    .get(categoryId);
  if (!category) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  const {
    item_code,
    name,
    description,
    unit,
    base_cost,
    overhead_pct,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "اسم البند مطلوب" });
  }

  const baseCost = Number(base_cost) || 0;
  const overheadPct = Number(overhead_pct) || 35;
  const sellingPrice = baseCost * (1 + overheadPct / 100);

  const info = await db
    .prepare(
      `INSERT INTO price_items (category_id, item_code, name, description, unit, base_cost, overhead_pct, selling_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      categoryId,
      (item_code || "").trim(),
      name.trim(),
      (description || "").trim(),
      unit || "عدد",
      baseCost,
      overheadPct,
      sellingPrice,
    );

  res.json({ id: info.lastInsertRowid, selling_price: sellingPrice });
}));

// PUT /api/price-list/items/:itemId — Update item (admin/owner only)
router.put("/items/:itemId", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const itemId = Number(req.params.itemId);
  const existing = await db
    .prepare("SELECT * FROM price_items WHERE id = ?")
    .get(itemId);
  if (!existing) {
    return res.status(404).json({ error: "البند غير موجود" });
  }

  const {
    item_code,
    name,
    description,
    unit,
    base_cost,
    overhead_pct,
  } = req.body;

  const baseCost = base_cost !== undefined ? Number(base_cost) : existing.base_cost;
  const overheadPct = overhead_pct !== undefined ? Number(overhead_pct) : existing.overhead_pct;
  const sellingPrice = baseCost * (1 + overheadPct / 100);

  await db
    .prepare(
      `UPDATE price_items SET
        item_code = COALESCE(?, item_code),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        unit = COALESCE(?, unit),
        base_cost = ?,
        overhead_pct = ?,
        selling_price = ?
       WHERE id = ?`
    )
    .run(
      item_code !== undefined ? item_code.trim() : null,
      name ? name.trim() : null,
      description !== undefined ? description.trim() : null,
      unit || null,
      baseCost,
      overheadPct,
      sellingPrice,
      itemId,
    );

  res.json({ ok: true, selling_price: sellingPrice });
}));

// DELETE /api/price-list/items/:itemId — Delete item (admin/owner only)
router.delete("/items/:itemId", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const itemId = Number(req.params.itemId);
  const existing = await db
    .prepare("SELECT * FROM price_items WHERE id = ?")
    .get(itemId);
  if (!existing) {
    return res.status(404).json({ error: "البند غير موجود" });
  }

  await db.prepare("DELETE FROM price_items WHERE id = ?").run(itemId);
  res.json({ ok: true });
}));

// PUT /api/price-list/:categoryId — Update category (admin/owner only)
router.put("/:categoryId", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const categoryId = Number(req.params.categoryId);
  const existing = await db
    .prepare("SELECT * FROM price_categories WHERE id = ?")
    .get(categoryId);
  if (!existing) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  const { name, sort_order } = req.body;
  await db
    .prepare(
      "UPDATE price_categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?"
    )
    .run(name ? name.trim() : null, sort_order, categoryId);

  res.json({ ok: true });
}));

// DELETE /api/price-list/:categoryId — Delete category (admin/owner only)
router.delete("/:categoryId", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const categoryId = Number(req.params.categoryId);
  const existing = await db
    .prepare("SELECT * FROM price_categories WHERE id = ?")
    .get(categoryId);
  if (!existing) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  // Items cascade-delete via FK
  await db.prepare("DELETE FROM price_categories WHERE id = ?").run(categoryId);
  res.json({ ok: true });
}));

module.exports = router;
