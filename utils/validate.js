const { body, param, validationResult } = require("express-validator");

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg });
  }
  next();
}

const registerRules = [
  body("name").trim().notEmpty().withMessage("الرجاء إدخال الاسم").isLength({ max: 100 }).withMessage("الاسم طويل جداً"),
  body("email").trim().notEmpty().withMessage("الرجاء إدخال الإيميل").isEmail().withMessage("صيغة الإيميل غير صحيحة").normalizeEmail(),
  body("password").notEmpty().withMessage("الرجاء إدخال كلمة المرور"),
];

const loginRules = [
  body("email").trim().notEmpty().withMessage("الرجاء إدخال الإيميل").isEmail().withMessage("صيغة الإيميل غير صحيحة").normalizeEmail(),
  body("password").notEmpty().withMessage("الرجاء إدخال كلمة المرور"),
];

const profileNameRules = [
  body("name").trim().notEmpty().withMessage("الرجاء إدخال الاسم").isLength({ max: 100 }).withMessage("الاسم طويل جداً"),
];

const passwordRules = [
  body("current_password").notEmpty().withMessage("الرجاء إدخال كلمة المرور الحالية"),
  body("new_password").notEmpty().withMessage("الرجاء إدخال كلمة المرور الجديدة"),
];

const quoteRules = [
  body("project_name").optional().trim().isLength({ max: 200 }).withMessage("اسم المشروع طويل جداً"),
  body("total").optional().isFloat({ min: 0 }).withMessage("المبلغ يجب أن يكون موجباً"),
  body("client_name").optional().trim().isLength({ max: 100 }).withMessage("اسم العميل طويل جداً"),
  body("reference_no").optional().trim().isLength({ max: 50 }).withMessage("رقم المرجع طويل جداً"),
  body("discount_val").optional().isFloat({ min: 0 }).withMessage("قيمة الخصم يجب أن تكون موجبة"),
  body("tax_pct").optional().isFloat({ min: 0, max: 100 }).withMessage("نسبة الضريبة غير صحيحة"),
  body("execution_days").optional().isInt({ min: 0 }).withMessage("عدد أيام التنفيذ غير صحيح"),
  body("validity_days").optional().isInt({ min: 0 }).withMessage("عدد أيام الصلاحية غير صحيح"),
];

const userIdRules = [
  param("id").isInt({ min: 1 }).withMessage("معرف المستخدم غير صحيح"),
];

const userRoleRules = [
  body("role").isIn(["owner", "admin", "designer"]).withMessage("الدور غير صحيح"),
];

module.exports = {
  handleValidation,
  registerRules,
  loginRules,
  profileNameRules,
  passwordRules,
  quoteRules,
  userIdRules,
  userRoleRules,
};
