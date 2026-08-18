const { db, getSetting, setSetting, now } = require('./db');
const { todayMonday, addWeeks } = require('./dates');

let running = false;

function insertHistory(taskId, action, byUserId, detail) {
  db.prepare('INSERT INTO task_history (task_id, action, by_user_id, detail) VALUES (?, ?, ?, ?)')
    .run(taskId, action, byUserId, detail);
}

function ensureRollover() {
  if (running) return { rolled: 0, skipped: 0 };
  running = true;
  try {
    const cur = getSetting('current_week_start');
    const nowM = todayMonday();
    if (!cur) {
      setSetting('current_week_start', nowM);
      return { rolled: 0, skipped: 0 };
    }
    if (cur === nowM) return { rolled: 0, skipped: 0 };

    const weeks = [];
    for (let w = addWeeks(cur, 1); w <= nowM; w = addWeeks(w, 1)) weeks.push(w);

    const insertWeek = db.prepare('INSERT OR IGNORE INTO task_weeks (task_id, week_start, is_carried) VALUES (?, ?, 1)');
    const openTasks = db.prepare("SELECT id FROM tasks WHERE status = 'open'").all();

    let rolled = 0;
    for (const week of weeks) {
      for (const t of openTasks) {
        const info = insertWeek.run(t.id, week);
        if (info.changes > 0) rolled += 1;
        insertHistory(t.id, 'carried', null, `Đẩy sang tuần ${week}`);
      }
    }
    setSetting('current_week_start', nowM);
    return { rolled, skipped: weeks.length };
  } finally {
    running = false;
  }
}

function weekRollover(req, res, next) {
  try {
    ensureRollover();
  } catch (e) {
    console.error('Rollover error:', e);
  }
  next();
}

module.exports = { ensureRollover, weekRollover, insertHistory };
