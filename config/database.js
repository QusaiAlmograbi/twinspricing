const path = require("path");
const fs = require("fs");

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function resolveDatabasePath() {
  if (process.env.DATABASE_PATH) {
    return path.isAbsolute(process.env.DATABASE_PATH)
      ? process.env.DATABASE_PATH
      : path.resolve(process.cwd(), process.env.DATABASE_PATH);
  }

  if (isProduction()) {
    return "/var/data/interior_pricing.db";
  }

  return path.join(process.cwd(), "data", "interior_pricing.db");
}

function ensureDatabaseDirectory(targetPath) {
  const fallbackPath = path.join(process.cwd(), "data", "interior_pricing.db");
  const dbDir = path.dirname(targetPath);

  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    return targetPath;
  } catch (error) {
    if (
      (error.code === "EACCES" || error.code === "EPERM") &&
      targetPath !== fallbackPath
    ) {
      console.warn(
        `لا يمكن كتابة قاعدة البيانات إلى ${dbDir}. سيتم استخدام ${fallbackPath} بدلاً منها.`,
      );
      return fallbackPath;
    }
    throw error;
  }
}

function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL || null;
  const sqlitePath = databaseUrl ? null : ensureDatabaseDirectory(resolveDatabasePath());

  return {
    client: databaseUrl ? "postgres" : "sqlite",
    sqlitePath,
    databaseUrl,
    isProduction: isProduction(),
  };
}

module.exports = {
  getDatabaseConfig,
  resolveDatabasePath,
  ensureDatabaseDirectory,
  isProduction,
};
