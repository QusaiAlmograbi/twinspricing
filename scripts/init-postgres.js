require("dotenv").config();
const db = require("../db");

async function main() {
  try {
    await db.initializeDatabase();
    console.log("PostgreSQL tables initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize PostgreSQL tables:", error);
    process.exitCode = 1;
  }
}

main();
