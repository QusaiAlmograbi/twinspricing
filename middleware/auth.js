const jwt = require("jsonwebtoken");
const db = require("../db");

const userCache = new Map();
const USER_CACHE_TTL = 60000;

function invalidateUserCache(userId) {
  userCache.delete(userId);
}

function isOwner(role) {
  return role === "owner";
}

function isAdminOrOwner(role) {
  return role === "admin" || role === "owner";
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = req.cookies && req.cookies.token;
  const token = cookieToken || headerToken;
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    const cached = userCache.get(decoded.id);
    if (cached && cached.expiry > Date.now()) {
      user = cached.user;
    } else {
      user = await db
        .prepare("SELECT id, role, status FROM users WHERE id = ?")
        .get(decoded.id);
      if (user) {
        userCache.set(decoded.id, { user, expiry: Date.now() + USER_CACHE_TTL });
      }
    }

    if (!user) {
      return res
        .status(401)
        .json({ error: "الجلسة منتهية، سجّل الدخول مرة ثانية" });
    }
    if (user.role !== "owner") {
      if (user.status === "pending") {
        return res
          .status(403)
          .json({ error: "حسابك بانتظار الموافقة من المدير" });
      }
      if (user.status === "rejected") {
        return res
          .status(403)
          .json({ error: "تم رفض حسابك، تواصل مع المدير" });
      }
    }
    req.user = decoded;
    next();
  } catch (e) {
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "الجلسة منتهية، سجّل الدخول مرة ثانية" });
    }
    console.error("Auth middleware error:", e);
    return res
      .status(500)
      .json({ error: "خطأ في الخادم" });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminOrOwner(req.user.role)) {
    return res
      .status(403)
      .json({ error: "هذا الإجراء يحتاج صلاحية مدير أو مالك" });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!isOwner(req.user.role)) {
    return res.status(403).json({ error: "هذا الإجراء يحتاج صلاحية مالك" });
  }
  next();
}

function verifySectionAccess(sectionId, userId, role) {
  if (role === "owner" || role === "admin") return true;
  return db
    .prepare(
      `SELECT 1 FROM sections s
       JOIN quotes q ON q.id = s.quote_id
       WHERE s.id = ? AND q.user_id = ?
       UNION
       SELECT 1 FROM sections s
       JOIN project_access pa ON pa.quote_id = s.quote_id
       WHERE s.id = ? AND pa.user_id = ?`,
    )
    .get(sectionId, userId, sectionId, userId);
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireOwner,
  isAdminOrOwner,
  isOwner,
  verifySectionAccess,
  invalidateUserCache,
};
