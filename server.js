require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const db = require("./db");
const authRoutes = require("./routes/auth");
const quotesRoutes = require("./routes/quotes");
const usersRoutes = require("./routes/users");

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
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/quotes", quotesRoutes);
  app.use("/api/users", usersRoutes);

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
  app.get("/app", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "app.html")),
  );
  app.get("/admin", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "admin.html")),
  );
  app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html")),
  );

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

if (require.main === module) {
  startServer().catch((error) => {
    console.error("فشل بدء الخادم:", error);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
