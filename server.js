require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const db = require("./db");
const authRoutes = require("./routes/auth");
const quotesRoutes = require("./routes/quotes");
const sectionsRoutes = require("./routes/sections");
const itemsRoutes = require("./routes/items");
const templatesRoutes = require("./routes/templates");
const pdfRoutes = require("./routes/pdf");
const usersRoutes = require("./routes/users");
const profileRoutes = require("./routes/profile");
const priceListRoutes = require("./routes/price-list");

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("JWT_SECRET مطلوب في وضع الإنتاج. يرجى تعيينه قبل التشغيل.");
    process.exit(1);
  }

  console.warn(
    "تحذير: ما في JWT_SECRET بملف .env — سيتم استخدام قيمة افتراضية للتجربة فقط.",
  );
  process.env.JWT_SECRET = "dev-only-insecure-secret";
}

function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/quotes", pdfRoutes);
  app.use("/api/quotes", quotesRoutes);
  app.use("/api/quotes", sectionsRoutes);
  app.use("/api/sections", itemsRoutes);
  app.use("/api/templates", templatesRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/price-list", priceListRoutes);

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
  app.get("/app", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "app.html")),
  );
  app.get("/admin", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "admin.html")),
  );
  app.get("/profile", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "profile.html")),
  );
  app.get("/price-list", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "price-list.html")),
  );
  app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html")),
  );

  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

async function startServer(
  port = process.env.PORT || 3000,
  host = process.env.HOST || "0.0.0.0",
) {
  try {
    await db.initializeDatabase();
  } catch (error) {
    console.error("فشل تهيئة قاعدة PostgreSQL:", error);
    throw error;
  }

  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log(`السيرفر شغال على http://${host}:${server.address().port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `المنفذ ${port} مستخدم بالفعل. يرجى تغيير PORT أو إيقاف العملية القديمة.`,
      );
    } else {
      console.error("فشل تشغيل الخادم:", error);
    }
    process.exit(1);
  });

  return server;
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error("فشل بدء الخادم:", error);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
