const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC')
    .all();
  res.json({ users: rows });
});

router.patch('/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['admin', 'designer'].includes(role)) {
    return res.status(400).json({ error: 'صلاحية غير صحيحة' });
  }
  if (Number(req.params.id) === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'ما تقدر تسحب صلاحية المدير من حسابك الحالي' });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
