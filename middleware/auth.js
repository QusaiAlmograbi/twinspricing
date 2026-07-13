const jwt = require("jsonwebtoken");
const db = require("../db");

function isOwner(role) {
  return role === "owner";
}

function isAdminOrOwner(role) {
  return role === "admin" || role === "owner";
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db
      .prepare("SELECT id, status FROM users WHERE id = ?")
      .get(decoded.id);
    if (!user) {
      return res
        .status(401)
        .json({ error: "الجلسة منتهية، سجّل الدخول مرة ثانية" });
    }
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
    req.user = decoded;
    next();
  } catch (e) {
    return res
      .status(401)
      .json({ error: "الجلسة منتهية، سجّل الدخول مرة ثانية" });
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

module.exports = {
  requireAuth,
  requireAdmin,
  requireOwner,
  isAdminOrOwner,
  isOwner,
};
