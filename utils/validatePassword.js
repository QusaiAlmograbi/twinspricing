function validatePassword(password) {
  if (typeof password !== "string") return "كلمة المرور غير صالحة";
  if (password.length < 8) return "كلمة المرور لازم تكون 8 أحرف على الأقل";
  if (!/[A-Z]/.test(password)) return "كلمة المرور لازم فيها حرف كبير واحد على الأقل";
  if (!/[0-9]/.test(password)) return "كلمة المرور لازم فيها رقم واحد على الأقل";
  if (!/[^A-Za-z0-9]/.test(password)) return "كلمة المرور لازم فيها رمز خاص واحد على الأقل";
  return null;
}

module.exports = { validatePassword };
