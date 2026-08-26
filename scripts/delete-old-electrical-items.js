#!/usr/bin/env node
/**
 * Migration: Delete old electrical items with codes 01-23
 * Usage: node scripts/delete-old-electrical-items.js
 */
const db = require("../db");

async function migrate() {
  console.log("[migration] Deleting old electrical items with codes 01-23...");

  const oldCodes = ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23"];

  let deleted = 0;
  for (const code of oldCodes) {
    const result = await db.prepare("DELETE FROM price_items WHERE item_code = ?").run(code);
    if (result.rowCount > 0) {
      deleted += result.rowCount;
      console.log(`[migration] Deleted item with code "${code}"`);
    }
  }

  console.log(`[migration] Done: ${deleted} old items deleted.`);
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error("[migration] Error:", err);
  process.exit(1);
});
