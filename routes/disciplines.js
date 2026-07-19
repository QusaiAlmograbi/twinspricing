const express = require("express");
const db = require("../db");
const { requireAuth, isAdminOrOwner } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

// GET /api/disciplines — list disciplines with section count
router.get("/", asyncHandler(async (req, res) => {
  const disciplines = await db.prepare(
    `SELECT d.id, d.name, d.sort_order,
            COUNT(ds.id) as section_count
     FROM disciplines d
     LEFT JOIN discipline_sections ds ON ds.discipline_id = d.id
     GROUP BY d.id
     ORDER BY d.sort_order ASC, d.name ASC`
  ).all();
  res.json({ disciplines });
}));

// POST /api/disciplines — create new discipline (admin/owner only)
router.post("/", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const { name, sort_order } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "اسم التخصص مطلوب" });
  }

  const maxOrder = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM disciplines"
  ).get();

  const info = await db.prepare(
    "INSERT INTO disciplines (name, sort_order) VALUES (?, ?)"
  ).run(name.trim(), sort_order ?? maxOrder.next_order);

  res.json({ id: info.lastInsertRowid, name: name.trim(), sort_order: sort_order ?? maxOrder.next_order });
}));

// PUT /api/disciplines/:id — edit discipline name (admin/owner only)
router.put("/:id", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const id = Number(req.params.id);
  const existing = await db.prepare("SELECT * FROM disciplines WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "التخصص غير موجود" });
  }

  const { name, sort_order } = req.body;
  await db.prepare(
    "UPDATE disciplines SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?"
  ).run(name ? name.trim() : null, sort_order, id);

  res.json({ ok: true });
}));

// DELETE /api/disciplines/:id — delete discipline (admin/owner only)
router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const id = Number(req.params.id);
  const existing = await db.prepare("SELECT * FROM disciplines WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "التخصص غير موجود" });
  }

  if (existing.name === "Unclassified") {
    return res.status(400).json({ error: "لا يمكن حذف تخصص \"Unclassified\" — هذا القسم النظامي يحتوي على جميع الأقسام غير المصنفة." });
  }

  const sectionCount = await db.prepare(
    "SELECT COUNT(*) as count FROM discipline_sections WHERE discipline_id = ?"
  ).get(id);
  if (sectionCount.count > 0) {
    return res.status(400).json({
      error: `Cannot delete this discipline because it contains ${sectionCount.count} section(s). Remove the sections first.`
    });
  }

  await db.prepare("DELETE FROM disciplines WHERE id = ?").run(id);
  res.json({ ok: true });
}));

// GET /api/disciplines/:id/sections — discipline's sections ordered by sort_order
router.get("/:id/sections", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const discipline = await db.prepare("SELECT id, name FROM disciplines WHERE id = ?").get(id);
  if (!discipline) {
    return res.status(404).json({ error: "التخصص غير موجود" });
  }

  const sections = await db.prepare(
    `SELECT pc.id, pc.name, ds.sort_order,
            COUNT(pi.id) as item_count
     FROM discipline_sections ds
     JOIN price_categories pc ON pc.id = ds.section_id
     LEFT JOIN price_items pi ON pi.category_id = pc.id
     WHERE ds.discipline_id = ?
     GROUP BY pc.id, ds.sort_order
     ORDER BY ds.sort_order ASC, pc.name ASC`
  ).all(id);

  res.json({ discipline, sections });
}));

// POST /api/disciplines/:id/sections — add section to discipline (admin/owner only)
router.post("/:id/sections", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const id = Number(req.params.id);
  const discipline = await db.prepare("SELECT * FROM disciplines WHERE id = ?").get(id);
  if (!discipline) {
    return res.status(404).json({ error: "التخصص غير موجود" });
  }

  const { section_id } = req.body;
  if (!section_id) {
    return res.status(400).json({ error: "section_id مطلوب" });
  }

  const section = await db.prepare("SELECT * FROM price_categories WHERE id = ?").get(Number(section_id));
  if (!section) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }

  const existingLink = await db.prepare(
    "SELECT id FROM discipline_sections WHERE discipline_id = ? AND section_id = ?"
  ).get(id, Number(section_id));
  if (existingLink) {
    return res.status(400).json({ error: "هذا القسم مرتبط بالفعل بهذا التخصص" });
  }

  const maxOrder = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM discipline_sections WHERE discipline_id = ?"
  ).get(id);

  const info = await db.prepare(
    "INSERT INTO discipline_sections (discipline_id, section_id, sort_order) VALUES (?, ?, ?)"
  ).run(id, Number(section_id), maxOrder.next_order);

  res.json({ id: info.lastInsertRowid, discipline_id: id, section_id: Number(section_id), sort_order: maxOrder.next_order });
}));

// DELETE /api/disciplines/:id/sections/:sectionId — remove section from discipline (admin/owner only)
router.delete("/:id/sections/:sectionId", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const id = Number(req.params.id);
  const sectionId = Number(req.params.sectionId);

  const existing = await db.prepare(
    "SELECT id FROM discipline_sections WHERE discipline_id = ? AND section_id = ?"
  ).get(id, sectionId);
  if (!existing) {
    return res.status(404).json({ error: "الرابط غير موجود" });
  }

  await db.prepare("DELETE FROM discipline_sections WHERE discipline_id = ? AND section_id = ?").run(id, sectionId);
  res.json({ ok: true });
}));

// PUT /api/disciplines/:id/sections/reorder — full batch reorder (admin/owner only)
router.put("/:id/sections/reorder", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const id = Number(req.params.id);
  const discipline = await db.prepare("SELECT id FROM disciplines WHERE id = ?").get(id);
  if (!discipline) {
    return res.status(404).json({ error: "التخصص غير موجود" });
  }

  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "order must be an array of section IDs" });
  }

  for (let i = 0; i < order.length; i++) {
    await db.prepare(
      "UPDATE discipline_sections SET sort_order = ? WHERE discipline_id = ? AND section_id = ?"
    ).run(i, id, Number(order[i]));
  }

  res.json({ ok: true });
}));

module.exports = router;
