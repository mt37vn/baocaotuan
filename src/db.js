const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { todayMonday } = require('./dates');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('director','employee')),
  username TEXT UNIQUE,
  password_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER NOT NULL REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending_approval','done','cancelled')),
  result_text TEXT,
  result_at TEXT,
  completed_week_start TEXT,
  completed_at TEXT,
  approved_at TEXT,
  reopened_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_approved_at ON tasks(approved_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

CREATE TABLE IF NOT EXISTS task_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  is_carried INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(task_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_task_weeks_week ON task_weeks(week_start);

CREATE TABLE IF NOT EXISTS task_journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS task_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  by_user_id INTEGER REFERENCES users(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);
`);

db.exec(`
DELETE FROM task_journals WHERE id NOT IN (
  SELECT MAX(id) FROM task_journals GROUP BY task_id, week_start);
DROP INDEX IF EXISTS idx_journals_task;
CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_task_week ON task_journals(task_id, week_start);
`);

const tasksSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();
if (tasksSql && !tasksSql.sql.includes("'cancelled'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE tasks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assignee_id INTEGER NOT NULL REFERENCES users(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_week_start TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending_approval','done','cancelled')),
      result_text TEXT,
      result_at TEXT,
      completed_week_start TEXT,
      completed_at TEXT,
      approved_at TEXT,
      reopened_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    INSERT INTO tasks_new (id, title, description, assignee_id, created_by, created_week_start, status,
      result_text, result_at, completed_week_start, completed_at, approved_at, reopened_at,
      cancelled_at, cancel_reason, updated_at, created_at)
      SELECT id, title, description, assignee_id, created_by, created_week_start, status,
      result_text, result_at, completed_week_start, completed_at, approved_at, reopened_at,
      NULL, NULL, updated_at, created_at FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_new RENAME TO tasks;
    CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX idx_tasks_created_by ON tasks(created_by);
    CREATE INDEX idx_tasks_status ON tasks(status);
    CREATE INDEX idx_tasks_approved_at ON tasks(approved_at);
    CREATE INDEX idx_tasks_created_at ON tasks(created_at);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function initWeekMarker() {
  const cur = getSetting('current_week_start');
  if (!cur) setSetting('current_week_start', todayMonday());
}

function seedDirector() {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'director' LIMIT 1").get();
  if (existing) return null;

  const username = process.env.ADMIN_USERNAME || 'admin';
  let password = process.env.ADMIN_PASSWORD || null;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(4).toString('hex');
    generated = true;
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (name, role, username, password_hash, sort_order) VALUES (?, 'director', ?, ?, 0)")
    .run('Giám đốc', username, hash);

  if (generated) {
    const pwdFile = path.join(DATA_DIR, '.admin_password');
    fs.writeFileSync(pwdFile, `Tài khoản: ${username}\nMật khẩu: ${password}\n\nHãy xóa file này sau khi đăng nhập lần đầu!\n`, { mode: 0o600 });
    return `Tạo tài khoản Giám đốc: username="${username}", mật khẩu="${password}" (đã lưu tại ${pwdFile}). Hãy đổi mật khẩu sau khi đăng nhập.`;
  }
  return `Tạo tài khoản Giám đốc: username="${username}" (dùng ADMIN_PASSWORD đã đặt).`;
}

function now() {
  return db.prepare("SELECT datetime('now','localtime') AS n").get().n;
}

module.exports = { db, getSetting, setSetting, initWeekMarker, seedDirector, now, DB_PATH };
