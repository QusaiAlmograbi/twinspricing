const express = require("express");
const db = require("../db");
const { requireAuth, isAdminOrOwner } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  let rows;
  if (isAdminOrOwner(req.user.role)) {
    rows = await db
      .prepare(
        `SELECT q.id, q.project_name, q.total, q.reference_no, q.client_name,
                q.created_at, q.updated_at,
                u.id as user_id, u.name as designer_name
         FROM quotes q JOIN users u ON u.id = q.user_id
         ORDER BY q.updated_at DESC`,
      )
      .all();
  } else {
    rows = await db
      .prepare(
        `SELECT q.id, q.project_name, q.total, q.reference_no, q.client_name,
                q.created_at, q.updated_at
         FROM quotes q
         WHERE q.user_id = ?
           OR EXISTS (
             SELECT 1 FROM project_access pa WHERE pa.quote_id = q.id AND pa.user_id = ?
           )
         ORDER BY q.updated_at DESC`,
      )
      .all(req.user.id, req.user.id);
  }
  res.json({ quotes: rows });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const q = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  const hasAccess = await db
    .prepare("SELECT 1 FROM project_access WHERE quote_id = ? AND user_id = ?")
    .get(q.id, req.user.id);
  if (
    !isAdminOrOwner(req.user.role) &&
    q.user_id !== req.user.id &&
    !hasAccess
  ) {
    return res.status(403).json({ error: "ما عندك صلاحية لهذا العرض" });
  }

  // Fetch sections with items
  const sections = await db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(q.id);

  for (const sec of sections) {
    sec.rooms = await db
      .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
      .all(sec.id);

    sec.items = await db
      .prepare("SELECT * FROM items WHERE section_id = ? AND room_id IS NULL ORDER BY sort_order ASC")
      .all(sec.id);

    for (const room of sec.rooms) {
      room.items = await db
        .prepare("SELECT * FROM items WHERE room_id = ? ORDER BY sort_order ASC")
        .all(room.id);
    }
  }

  let parsedData;
  try {
    parsedData = JSON.parse(q.data);
  } catch {
    parsedData = q.data;
  }

  let paymentTerms;
  try {
    paymentTerms = JSON.parse(q.payment_terms || "[]");
  } catch {
    paymentTerms = [];
  }

  res.json({
    quote: {
      ...q,
      data: parsedData,
      sections,
      payment_terms: paymentTerms,
    },
  });
}));

router.post("/", asyncHandler(async (req, res) => {
  const {
    project_name,
    data,
    total,
    reference_no,
    client_name,
    site_location,
    discount_val,
    discount_type,
    tax_pct,
    execution_days,
    validity_days,
    payment_terms,
  } = req.body;

  const info = await db
    .prepare(
      `INSERT INTO quotes (user_id, project_name, data, total, reference_no, client_name, site_location,
        discount_val, discount_type, tax_pct, execution_days, validity_days, payment_terms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      req.user.id,
      project_name || "مشروع بدون اسم",
      JSON.stringify(data || {}),
      total || 0,
      reference_no || null,
      client_name || null,
      site_location || null,
      discount_val || 0,
      discount_type || "fixed",
      tax_pct || 16,
      execution_days || 45,
      validity_days || 30,
      JSON.stringify(payment_terms || []),
    );
  res.json({ id: info.lastInsertRowid });
}));

router.post("/:id/access", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const quoteId = Number(req.params.id);
  const { user_id, project_id, quote_id, permission = "view" } = req.body;
  const userId = Number(user_id ?? project_id ?? quote_id);
  const quote = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(quoteId);
  if (!quote) return res.status(404).json({ error: "المشروع غير موجود" });
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  if (user.role !== "designer") {
    return res.status(400).json({ error: "يمكن منح الوصول لمصمم فقط" });
  }

  await db
    .prepare(
      `INSERT INTO project_access (quote_id, user_id, granted_by, permission)
     VALUES (?,?,?,?) ON CONFLICT (quote_id, user_id) DO NOTHING`,
    )
    .run(quoteId, userId, req.user.id, permission || "view");

  res.json({ ok: true });
}));

router.delete("/:id/access/:userId?", asyncHandler(async (req, res) => {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }

  const quoteId = Number(req.params.id);
  const userId = Number(
    req.params.userId ?? req.body.user_id ?? req.body.project_id,
  );
  if (!userId) {
    return res.status(400).json({ error: "يجب اختيار المستخدم" });
  }

  const quote = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(quoteId);
  if (!quote) return res.status(404).json({ error: "المشروع غير موجود" });

  await db
    .prepare("DELETE FROM project_access WHERE quote_id = ? AND user_id = ?")
    .run(quoteId, userId);
  res.json({ ok: true });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const q = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  if (!isAdminOrOwner(req.user.role) && q.user_id !== req.user.id) {
    return res.status(403).json({ error: "ما عندك صلاحية لتعديل هذا العرض" });
  }

  const {
    project_name,
    data,
    total,
    reference_no,
    client_name,
    site_location,
    discount_val,
    discount_type,
    tax_pct,
    execution_days,
    validity_days,
    payment_terms,
  } = req.body;

  await db
    .prepare(
      `UPDATE quotes SET
        project_name = ?, data = ?, total = ?,
        reference_no = ?, client_name = ?, site_location = ?,
        discount_val = ?, discount_type = ?, tax_pct = ?,
        execution_days = ?, validity_days = ?, payment_terms = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      project_name || "مشروع بدون اسم",
      JSON.stringify(data || {}),
      total || 0,
      reference_no !== undefined ? reference_no : q.reference_no,
      client_name !== undefined ? client_name : q.client_name,
      site_location !== undefined ? site_location : q.site_location,
      discount_val !== undefined ? discount_val : q.discount_val,
      discount_type !== undefined ? discount_type : q.discount_type,
      tax_pct !== undefined ? tax_pct : q.tax_pct,
      execution_days !== undefined ? execution_days : q.execution_days,
      validity_days !== undefined ? validity_days : q.validity_days,
      payment_terms !== undefined
        ? JSON.stringify(payment_terms)
        : q.payment_terms,
      req.params.id,
    );
  res.json({ ok: true });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const q = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });
  if (!isAdminOrOwner(req.user.role) && q.user_id !== req.user.id) {
    return res.status(403).json({ error: "ما عندك صلاحية لحذف هذا العرض" });
  }
  // Cascade: delete items in sections of this quote
  await db
    .prepare(
      "DELETE FROM items WHERE section_id IN (SELECT id FROM sections WHERE quote_id = ?)",
    )
    .run(req.params.id);
  await db
    .prepare(
      "DELETE FROM rooms WHERE section_id IN (SELECT id FROM sections WHERE quote_id = ?)",
    )
    .run(req.params.id);
  await db
    .prepare("DELETE FROM sections WHERE quote_id = ?")
    .run(req.params.id);
  await db
    .prepare("DELETE FROM project_access WHERE quote_id = ?")
    .run(req.params.id);
  await db.prepare("DELETE FROM quotes WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// Calculation endpoint
router.get("/:id/calculate", asyncHandler(async (req, res) => {
  const q = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });

  const sections = await db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(q.id);

  const sectionSubtotals = [];
  let totalSelling = 0;
  let totalEstimatedCost = 0;

  for (const sec of sections) {
    const items = await db
      .prepare("SELECT * FROM items WHERE section_id = ? ORDER BY sort_order ASC")
      .all(sec.id);

    const rooms = await db
      .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
      .all(sec.id);

    for (const room of rooms) {
      const roomItems = await db
        .prepare("SELECT * FROM items WHERE room_id = ? ORDER BY sort_order ASC")
        .all(room.id);
      items.push(...roomItems);
    }

    let sectionTotal = 0;
    let sectionCost = 0;

    for (const item of items) {
      const lineTotal = (item.qty || 0) * (item.selling_price || 0);
      const lineCost = (item.qty || 0) * (item.base_cost || 0);
      sectionTotal += lineTotal;
      sectionCost += lineCost;
    }

    sectionSubtotals.push({
      section_id: sec.id,
      code: sec.code,
      name: sec.name,
      subtotal: sectionTotal,
      estimated_cost: sectionCost,
    });

    totalSelling += sectionTotal;
    totalEstimatedCost += sectionCost;
  }

  const discountType = q.discount_type || "fixed";
  const discountVal = Number(q.discount_val) || 0;
  const taxPct = Number(q.tax_pct) || 16;

  let discount = 0;
  if (discountType === "pct") {
    discount = (totalSelling * discountVal) / 100;
  } else {
    discount = discountVal;
  }

  const afterDiscount = Math.max(totalSelling - discount, 0);
  const vat = (afterDiscount * taxPct) / 100;
  const grandTotal = afterDiscount + vat;
  const profitMargin =
    totalEstimatedCost > 0
      ? ((grandTotal / totalEstimatedCost - 1) * 100).toFixed(1)
      : 0;

  res.json({
    section_subtotals: sectionSubtotals,
    subtotal: totalSelling,
    discount,
    after_discount: afterDiscount,
    vat,
    grand_total: grandTotal,
    estimated_cost: totalEstimatedCost,
    profit_margin: Number(profitMargin),
  });
}));

module.exports = router;
