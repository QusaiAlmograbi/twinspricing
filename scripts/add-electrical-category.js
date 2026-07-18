#!/usr/bin/env node
/**
 * Migration: Add "الأعمال الكهربائية" category with 23 items
 * Usage: node scripts/add-electrical-category.js
 */
const db = require("../db");

async function migrate() {
  console.log("[migration] Adding electrical works category...");

  // Check if category already exists
  const existing = await db.prepare("SELECT id FROM price_categories WHERE name = ?").get("الأعمال الكهربائية");
  if (existing) {
    console.log("[migration] Category 'الأعمال الكهربائية' already exists, skipping.");
    return;
  }

  // Insert category
  const maxOrder = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM price_categories").get();
  const info = await db.prepare("INSERT INTO price_categories (name, sort_order) VALUES (?, ?)").run("الأعمال الكهربائية", maxOrder.next_order);
  const categoryId = info.lastInsertRowid;
  console.log(`[migration] Inserted category with id=${categoryId}`);

  // Items data
  const items = [
    { code: "01", name: "نقطة ابريز كاملة", unit: "وحدة", selling_price: 36.00 },
    { code: "02", name: "نقل نقطة ابريز", unit: "وحدة", selling_price: 18.00 },
    { code: "03", name: "نقطة اباجور كاملة", unit: "وحدة", selling_price: 48.00 },
    { code: "04", name: "نقل نقطة اباجور كاملة", unit: "وحدة", selling_price: 48.00 },
    { code: "05", name: "نقطة سبوت لايت", unit: "وحدة", selling_price: 24.00 },
    { code: "06", name: "مفتاح انارة", unit: "وحدة", selling_price: 10.80 },
    { code: "07", name: "نقطة ماجنتيك لايت", unit: "وحدة", selling_price: 26.40 },
    { code: "08", name: "نقطة انارة مخفية", unit: "وحدة", selling_price: 30.00 },
    { code: "09", name: "نقطة مكيف 1 طن", unit: "وحدة", selling_price: 96.00 },
    { code: "10", name: "نقطة مكيف 1.5 طن", unit: "وحدة", selling_price: 180.00 },
    { code: "11", name: "نقل حساس غاز مع سلك ومواسير", unit: "وحدة", selling_price: 42.00 },
    { code: "12", name: "نقل ثيرموستات مع سلك ومواسير", unit: "وحدة", selling_price: 48.00 },
    { code: "13", name: "نقطة ثيرموستات تكييف", unit: "وحدة", selling_price: 72.00 },
    { code: "14", name: "نقطة انارة جدارية", unit: "وحدة", selling_price: 24.00 },
    { code: "15", name: "نقطة انارة ثريا", unit: "وحدة", selling_price: 30.00 },
    { code: "16", name: "تركيب ليد بروفايل لايت", unit: "م.ط", selling_price: 6.00 },
    { code: "17", name: "نقطة للشاشات", unit: "وحدة", selling_price: 78.00 },
    { code: "18", name: "نقطة مع كيبل للشاشات", unit: "وحدة", selling_price: 30.00 },
    { code: "19", name: "تجميع لوحات وتوزيع أحمال", unit: "وحدة", selling_price: 144.00 },
    { code: "20", name: "تغيير أسلاك أباريز وتوصيل مواسير أرضية", unit: "وحدة", selling_price: 30.00 },
    { code: "21", name: "توريد وتركيب سكة إنارة تراك ماجنتيك", unit: "م.ط", selling_price: 12.00 },
    { code: "22", name: "توريد وتركيب محول إنارة تراك ماجنتيك", unit: "عدد", selling_price: 19.20 },
    { code: "23", name: "تأسيس وتمديد 8 نقاط كاميرات وتوصيلهم لـ 3 شاشات", unit: "عدد", selling_price: 600.00 },
  ];

  const overheadPct = 35;
  let inserted = 0;

  for (const item of items) {
    const sp = item.selling_price;
    const baseCost = sp / (1 + overheadPct / 100);
    try {
      await db.prepare(
        `INSERT INTO price_items (category_id, item_code, name, description, unit, base_cost, overhead_pct, selling_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(categoryId, item.code, item.name, "", item.unit, Math.round(baseCost * 1000) / 1000, overheadPct, sp);
      inserted++;
    } catch (err) {
      console.error(`[migration] FAILED to insert item "${item.code} ${item.name}":`, err.message || err);
    }
  }

  console.log(`[migration] Done: ${inserted}/${items.length} items inserted.`);
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error("[migration] Error:", err);
  process.exit(1);
});
