#!/usr/bin/env node
/**
 * Seed script: Populate price_categories + price_items from a data array.
 *
 * Usage:
 *   node scripts/seed-price-list.js
 *
 * Edit the CATEGORIES and ITEMS arrays below with your actual data,
 * then run the script. It uses the same db.js abstraction as the app.
 */

require("dotenv").config();
const db = require("../db");

// ─── EDIT THIS DATA ──────────────────────────────────────────────
// Add your categories here. Each category will be inserted with sort_order.
const CATEGORIES = [
  { name: "البلاط", sort_order: 0 },
  { name: "الإضاءة", sort_order: 1 },
  { name: "السباكة", sort_order: 2 },
  { name: "الكهرباء", sort_order: 3 },
  { name: "الجبس", sort_order: 4 },
  { name: "الدهانات", sort_order: 5 },
  { name: "الأرضيات", sort_order: 6 },
  { name: "النجارة", sort_order: 7 },
  { name: "المطابخ", sort_order: 8 },
  { name: "الحمامات", sort_order: 9 },
];

// Add your items here. Each item references a category by INDEX (0-based) from CATEGORIES above.
// item_code: your product code (e.g., "TILE-001")
// name: Arabic name
// description: optional description
// unit: "عدد", "م²", "متر طولي", "مقطوع"
// base_cost: internal cost
// overhead_pct: markup percentage (default 40)
const ITEMS = [
  // --- البلاط (index 0) ---
  { catIdx: 0, item_code: "TILE-001", name: "بلاط بورسلين 60x60", description: "بلاط بورسلين لامع مقاس 60x60 سم", unit: "م²", base_cost: 45, overhead_pct: 40 },
  { catIdx: 0, item_code: "TILE-002", name: "بلاط بورسلين 80x80", description: "بلاط بورسلين لامع مقاس 80x80 سم", unit: "م²", base_cost: 65, overhead_pct: 40 },
  { catIdx: 0, item_code: "TILE-003", name: "بلاط سيراميك 30x60", description: "بلاط سيراميك للمطابخ والحمامات", unit: "م²", base_cost: 25, overhead_pct: 40 },
  { catIdx: 0, item_code: "TILE-004", name: "بلاط موزاييك", description: "بلاط موزاييك للحمامات", unit: "م²", base_cost: 55, overhead_pct: 40 },

  // --- الإضاءة (index 1) ---
  { catIdx: 1, item_code: "LGT-001", name: "سبوت سيلينج", description: "سبوت سيلينج LED مخفي", unit: "مقطوع", base_cost: 35, overhead_pct: 40 },
  { catIdx: 1, item_code: "LGT-002", name: "شريط LED", description: "شريط إضاءة LED خفي للجبس", unit: "متر طولي", base_cost: 15, overhead_pct: 40 },
  { catIdx: 1, item_code: "LGT-003", name: "نجمة إضاءة", description: "نجمة إضاءة سقف مخفي", unit: "مقطوع", base_cost: 25, overhead_pct: 40 },
  { catIdx: 1, item_code: "LGT-004", name: "كشاف حائط", description: "كشاف إضاءة حائط ديكوري", unit: "مقطوع", base_cost: 45, overhead_pct: 40 },

  // --- السباكة (index 2) ---
  { catIdx: 2, item_code: "PLB-001", name: "حوض مغسلة", description: "حوض مغسلة سيراميك", unit: "مقطوع", base_cost: 80, overhead_pct: 40 },
  { catIdx: 2, item_code: "PLB-002", name: "حنفيه مغسلة", description: "حنفيه مغسلة كروم", unit: "مقطوع", base_cost: 65, overhead_pct: 40 },

  // --- الكهرباء (index 3) ---
  { catIdx: 3, item_code: "ELC-001", name: "لوحة كهرباء", description: "لوحة توزيع كهرباء 12 دائرة", unit: "مقطوع", base_cost: 120, overhead_pct: 40 },
  { catIdx: 3, item_code: "ELC-002", name: "مقابس كهربائية", description: "مقابس كهربائية ستاندر", unit: "عدد", base_cost: 12, overhead_pct: 40 },

  // --- الجبس (index 4) ---
  { catIdx: 4, item_code: "GYM-001", name: "جبس بورد سقف", description: "تركيب جبس بورد سقف مخفي", unit: "م²", base_cost: 35, overhead_pct: 40 },
  { catIdx: 4, item_code: "GYM-002", name: "كرانيش جبس", description: "كرانيش جبس بورد ديكوري", unit: "متر طولي", base_cost: 20, overhead_pct: 40 },

  // --- الدهانات (index 5) ---
  { catIdx: 5, item_code: "PNT-001", name: "دهان جوتن", description: "طبختين دهان جوتن قابل للغسيل", unit: "م²", base_cost: 12, overhead_pct: 40 },
  { catIdx: 5, item_code: "PNT-002", name: "دهان سقف", description: "دهان سقف جوتن أبيض", unit: "م²", base_cost: 8, overhead_pct: 40 },
];

// ─── END EDIT ────────────────────────────────────────────────────

async function seed() {
  await db.initializeDatabase();

  // Check existing categories
  const existing = await db.prepare("SELECT id, name FROM price_categories").all();
  const existingMap = {};
  for (const c of existing) existingMap[c.name] = c.id;

  let created = 0;
  let skipped = 0;

  // Insert categories
  const catIdMap = {}; // catIdx -> DB id
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    if (existingMap[cat.name]) {
      catIdMap[i] = existingMap[cat.name];
      skipped++;
    } else {
      const info = await db.prepare(
        "INSERT INTO price_categories (name, sort_order) VALUES (?, ?)"
      ).run(cat.name, cat.sort_order);
      catIdMap[i] = info.lastInsertRowid;
      created++;
    }
  }

  console.log(`الفئات: ${created} جديدة، ${skipped} موجودة مسبقاً`);

  // Insert items
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const item of ITEMS) {
    const catId = catIdMap[item.catIdx];
    if (!catId) {
      console.warn(`Category index ${item.catIdx} not found, skipping item ${item.name}`);
      continue;
    }

    // Check for duplicate by item_code within category
    const dup = await db.prepare(
      "SELECT id FROM price_items WHERE category_id = ? AND item_code = ?"
    ).get(catId, item.item_code);
    if (dup) {
      itemsSkipped++;
      continue;
    }

    const baseCost = Number(item.base_cost) || 0;
    const overheadPct = Number(item.overhead_pct) || 40;
    const sellingPrice = baseCost * (1 + overheadPct / 100);

    await db.prepare(
      `INSERT INTO price_items (category_id, item_code, name, description, unit, base_cost, overhead_pct, selling_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      catId,
      item.item_code || "",
      item.name,
      item.description || "",
      item.unit || "عدد",
      baseCost,
      overheadPct,
      sellingPrice,
    );
    itemsCreated++;
  }

  console.log(`البنود: ${itemsCreated} جديدة، ${itemsSkipped} موجودة مسبقاً`);
  console.log("تم بنجاح! ✅");
  process.exit(0);
}

seed().catch((err) => {
  console.error("خطأ:", err);
  process.exit(1);
});
