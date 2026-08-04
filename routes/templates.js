const express = require("express");
const db = require("../db");
const { requireAuth, isAdminOrOwner } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const templates = await db
    .prepare(
      `SELECT t.*, u.name as created_by_name
       FROM quote_templates t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.is_default DESC, t.id DESC`,
    )
    .all();
  res.json({ templates });
}));

router.post("/", asyncHandler(async (req, res) => {
  const { name, description, data } = req.body;
  if (!name || !data) {
    return res.status(400).json({ error: "الاسم والبيانات مطلوبين" });
  }

  const info = await db
    .prepare(
      "INSERT INTO quote_templates (name, description, data, created_by) VALUES (?,?,?,?)",
    )
    .run(name.trim(), description || "", JSON.stringify(data), req.user.id);

  res.json({ id: info.lastInsertRowid });
}));

router.post("/:id/clone", asyncHandler(async (req, res) => {
  const template = await db
    .prepare("SELECT * FROM quote_templates WHERE id = ?")
    .get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: "القالب غير موجود" });
  }

  let templateData;
  try {
    templateData =
      typeof template.data === "string"
        ? JSON.parse(template.data)
        : template.data;
  } catch {
    return res.status(500).json({ error: "بيانات الققالب تالفة" });
  }

  const quoteInfo = await db
    .prepare(
      `INSERT INTO quotes (user_id, project_name, data, total, reference_no, client_name, site_location, discount_val, discount_type, tax_pct, execution_days, validity_days, payment_terms, quote_title, price_exclusions)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      req.user.id,
      templateData.project_name || "مشروع جديد",
      JSON.stringify(templateData),
      0,
      templateData.reference_no || null,
      templateData.client_name || null,
      templateData.site_location || null,
      templateData.discount_val || 0,
      templateData.discount_type || "fixed",
      templateData.tax_pct || 16,
      templateData.execution_days || 45,
      templateData.validity_days || 30,
      JSON.stringify(templateData.payment_terms || []),
      templateData.quote_title || "",
      templateData.price_exclusions || "",
    );

  const newQuoteId = quoteInfo.lastInsertRowid;

  // Clone sections, rooms, and items if they exist
  if (templateData.sections && templateData.sections.length > 0) {
    for (const secData of templateData.sections) {
      const hasRooms = (secData.rooms || []).length > 0;
      const secInfo = await db
        .prepare(
          "INSERT INTO sections (quote_id, code, name, sort_order, has_rooms) VALUES (?,?,?,?,?)",
        )
        .run(newQuoteId, secData.code || "", secData.name || "", secData.sort_order || 0, hasRooms ? 1 : 0);

      const newSectionId = secInfo.lastInsertRowid;

      // Clone rooms and build oldId → newId map
      const roomIdMap = {};
      for (const roomData of secData.rooms || []) {
        const roomInfo = await db
          .prepare(
            "INSERT INTO rooms (section_id, name, sort_order) VALUES (?,?,?)",
          )
          .run(newSectionId, roomData.name || "", roomData.sort_order || 0);
        roomIdMap[roomData.id] = roomInfo.lastInsertRowid;
      }

      // Clone items, updating room_id references
      for (const itemData of secData.items || []) {
        let newRoomId = null;
        if (itemData.room_id && roomIdMap[itemData.room_id]) {
          newRoomId = roomIdMap[itemData.room_id];
        }
        await db
          .prepare(
            `INSERT INTO items (section_id, item_code, name, description, unit, qty, image, base_cost, overhead_pct, selling_price, notes, sort_order, room_id, category_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            newSectionId,
            itemData.item_code || "",
            itemData.name || "",
            itemData.description || "",
            itemData.unit || "عدد",
            itemData.qty || 1,
            itemData.image || null,
            itemData.base_cost || 0,
            itemData.overhead_pct || 35,
            itemData.selling_price || (itemData.base_cost || 0) * (1 + (itemData.overhead_pct || 35) / 100),
            itemData.notes || "",
            itemData.sort_order || 0,
            newRoomId,
            itemData.category_id || null,
          );
      }
    }
  }

  res.json({ id: newQuoteId });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const template = await db
    .prepare("SELECT * FROM quote_templates WHERE id = ?")
    .get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: "القالب غير موجود" });
  }
  if (!isAdminOrOwner(req.user.role) && template.created_by !== req.user.id) {
    return res.status(403).json({ error: "ما عندك صلاحية لحذف هذا القالب" });
  }
  await db.prepare("DELETE FROM quote_templates WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
