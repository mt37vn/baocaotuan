const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, name: u.name, role: u.role, username: u.username || null };
}

function requireDirector(req, res, next) {
  const u = req.session.user;
  if (!u || u.role !== 'director') {
    return res.status(401).json({ error: 'Cần đăng nhập với quyền Giám đốc.' });
  }
  req.director = u;
  next();
}

function actorFromRequest(req) {
  return req.session.user || null;
}

function requireActor(req, res, next) {
  const actor = actorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  }
  req.actor = actor;
  next();
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu username hoặc mật khẩu.' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!u || !bcrypt.compareSync(String(password), u.password_hash) || !u.active) {
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu.' });
  }
  req.session.user = publicUser(u);
  res.json({ user: publicUser(u) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

router.post('/change-password', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới.' });
  if (String(next).length < 6) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(String(current), u.password_hash)) {
    return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(next), 10), u.id);
  res.json({ ok: true });
});

module.exports = { router, requireDirector, requireActor, actorFromRequest };
