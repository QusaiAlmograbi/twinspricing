const jwt = require("jsonwebtoken");

function isOwner(role) {
  return role === "owner";
}

function isAdminOrOwner(role) {
  return role === "admin" || role === "owner";
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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
