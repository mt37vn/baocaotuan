const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { requireDirector } = require('./auth');

const router = express.Router();

router.get('/employees', requireDirector, (req, res) => {
  const rows = db.prepare("SELECT id, name, role, active, sort_order, username, created_at, (username IS NOT NULL) AS has_account FROM users WHERE role = 'employee' ORDER BY sort_order, name").all();
  res.json(rows);
});

router.post('/employees', requireDirector, (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Thiếu tên nhân viên.' });
  const dup = db.prepare("SELECT id FROM users WHERE role = 'employee' AND lower(name) = lower(?)").get(name);
  if (dup) return res.status(400).json({ error: 'Đã có nhân viên trùng tên.' });
  const { m } = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM users WHERE role = 'employee'").get();
  const info = db.prepare("INSERT INTO users (name, role, sort_order) VALUES (?, 'employee', ?)").run(name, m + 1);
  res.status(201).json({ id: info.lastInsertRowid, name });
});

router.patch('/employees/:id', requireDirector, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Không tìm thấy nhân viên.' });
  const { name, active, username, password } = req.body || {};
  const sets = [];
  const vals = [];
  if (name !== undefined) {
    const v = String(name).trim();
    if (!v) return res.status(400).json({ error: 'Tên không được để trống.' });
    const dup = db.prepare("SELECT id FROM users WHERE role = 'employee' AND lower(name) = lower(?) AND id != ?").get(v, u.id);
    if (dup) return res.status(400).json({ error: 'Đã có nhân viên trùng tên.' });
    sets.push('name = ?'); vals.push(v);
  }
  if (username !== undefined) {
    const v = String(username).trim();
    if (!v) return res.status(400).json({ error: 'Username không được để trống.' });
    const dup = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?').get(v, u.id);
    if (dup) return res.status(400).json({ error: 'Username đã được dùng.' });
    sets.push('username = ?'); vals.push(v);
  }
  if (password !== undefined) {
    const v = String(password);
    if (v.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(v, 10));
  }
  if (active !== undefined) {
    const hasOpen = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE assignee_id = ? AND status != 'done'").get(u.id).c;
    if (!active && hasOpen > 0) {
      return res.status(400).json({ error: `Không thể khóa nhân viên khi còn ${hasOpen} việc chưa hoàn thành.` });
    }
    sets.push('active = ?'); vals.push(active ? 1 : 0);
  }
  if (!sets.length) return res.json({ ok: true });
  vals.push(u.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/employees/:id', requireDirector, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Không tìm thấy nhân viên.' });
  const c = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE assignee_id = ?').get(u.id).c;
  if (c > 0) return res.status(400).json({ error: 'Nhân viên còn việc trong bảng, không thể xóa.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

module.exports = { router };
