const express = require('express');
const { db, now } = require('./db');
const { requireDirector, requireActor } = require('./auth');
const { todayMonday, mondayOfISO, addWeeks, parseISO, toISO } = require('./dates');
const { insertHistory } = require('./rollover');

const router = express.Router();

function getTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id));
}

function assigneeIds(taskId) {
  const rows = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ?').all(Number(taskId));
  return rows.length ? rows.map(r => r.user_id) : null;
}

function isAssignee(task, userId) {
  if (!userId) return false;
  if (task.assignee_id === Number(userId)) return true;
  const r = db.prepare('SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?').get(task.id, Number(userId));
  return !!r;
}

function taskPayload(t) {
  const aids = assigneeIds(t.id);
  return {
    id: t.id, title: t.title, description: t.description,
    assignee_id: t.assignee_id, assignee_ids: aids || [t.assignee_id],
    created_by: t.created_by,
    created_week_start: t.created_week_start, status: t.status,
    result_text: t.result_text, result_at: t.result_at,
    completed_week_start: t.completed_week_start, completed_at: t.completed_at,
    approved_at: t.approved_at, reopened_at: t.reopened_at,
    cancelled_at: t.cancelled_at, cancel_reason: t.cancel_reason,
    created_at: t.created_at, updated_at: t.updated_at,
  };
}

function getEmployee(id) {
  return db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(Number(id));
}

function upsertJournal(taskId, weekStart, authorId, note) {
  const existing = db.prepare('SELECT id FROM task_journals WHERE task_id = ? AND author_id = ? AND week_start = ?').get(taskId, authorId, weekStart);
  if (existing) {
    db.prepare('UPDATE task_journals SET note = ?, author_id = ? WHERE id = ?').run(note, authorId, existing.id);
    return { journal: db.prepare('SELECT * FROM task_journals WHERE id = ?').get(existing.id), updated: true };
  }
  const info = db.prepare('INSERT INTO task_journals (task_id, week_start, author_id, note) VALUES (?, ?, ?, ?)')
    .run(taskId, weekStart, authorId, note);
  return { journal: db.prepare('SELECT * FROM task_journals WHERE id = ?').get(info.lastInsertRowid), updated: false };
}

function weeksOfTasks(taskIds, rangeStart, rangeEnd) {
  if (!taskIds.length) return {};
  const marks = new Map(taskIds.map(id => [id, []]));
  const ph = taskIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT task_id, week_start FROM task_weeks WHERE task_id IN (${ph})`).all(...taskIds);
  for (const r of rows) marks.get(r.task_id).push(r.week_start);
  for (const m of marks.values()) m.sort();
  return marks;
}

// ---- Bảng tuần ----
router.get('/board', requireActor, (req, res) => {
  const from = req.query.from ? mondayOfISO(String(req.query.from)) : addWeeks(todayMonday(), -4);
  const to = req.query.to ? mondayOfISO(String(req.query.to)) : todayMonday();
  const weeks = [];
  for (let w = from; w <= to; w = addWeeks(w, 1)) weeks.push(w);

  const employees = db.prepare("SELECT id, name, role, active, sort_order FROM users WHERE active = 1 AND role = 'employee' ORDER BY sort_order, name").all();
  const director = db.prepare("SELECT id, name FROM users WHERE role = 'director' LIMIT 1").get() || null;

  const prevWeek = addWeeks(to, -1);

  const tasks = db.prepare(`
    SELECT * FROM tasks t
    WHERE EXISTS (SELECT 1 FROM task_weeks tw WHERE tw.task_id = t.id AND tw.week_start BETWEEN ? AND ?)
       OR (t.status = 'done' AND t.completed_week_start = ?)
    ORDER BY t.created_at`).all(from, to, prevWeek).map(taskPayload);

  const weeksMap = weeksOfTasks(tasks.map(t => t.id), from, to);
  const payload = tasks.map(t => ({ ...t, age: weeksMap.get(t.id).length, weeks: weeksMap.get(t.id) }));

  const journals = [];
  if (tasks.length) {
    const ids = tasks.map(t => t.id).map(() => '?').join(',');
    journals.push(...db.prepare(`SELECT * FROM task_journals WHERE task_id IN (${ids}) ORDER BY created_at`).all(...tasks.map(t => t.id)));
  }
  const history = [];
  if (tasks.length) {
    const ids = tasks.map(t => t.id).map(() => '?').join(',');
    history.push(...db.prepare(`SELECT * FROM task_history WHERE task_id IN (${ids}) ORDER BY created_at DESC LIMIT 500`).all(...tasks.map(t => t.id)));
  }

  res.json({ weeks, employees, director, tasks: payload, journals, history });
});

// ---- Tạo thẻ ----
router.post('/tasks', requireActor, (req, res) => {
  const { title, description, assignee_id, assignee_ids, week_start } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Thiếu tên công việc.' });

  let assignees = [];
  if (req.actor.role === 'director') {
    const raw = Array.isArray(assignee_ids) && assignee_ids.length
      ? assignee_ids
      : (assignee_id ? [assignee_id] : []);
    const ids = [...new Set(raw.map(Number).filter(Boolean))];
    assignees = ids.map(getEmployee).filter(Boolean);
    if (assignees.length !== ids.length) {
      return res.status(400).json({ error: 'Có nhân viên không hợp lệ trong danh sách.' });
    }
    if (!assignees.length) return res.status(400).json({ error: 'Chọn ít nhất 1 nhân viên phụ trách.' });
  } else {
    const self = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.actor.id);
    if (assignee_id && Number(assignee_id) !== req.actor.id) {
      return res.status(403).json({ error: 'Nhân viên chỉ được tạo việc cho chính mình.' });
    }
    assignees = [self];
  }

  let wk = week_start ? String(week_start) : todayMonday();
  try {
    const d = parseISO(wk);
    if (isNaN(d.getTime())) throw new Error('bad date');
    wk = toISO(d);
    wk = mondayOfISO(wk);
  } catch (e) {
    return res.status(400).json({ error: 'Tuần không hợp lệ.' });
  }

  const info = db.prepare(`
    INSERT INTO tasks (title, description, assignee_id, created_by, created_week_start)
    VALUES (?, ?, ?, ?, ?)`)
    .run(String(title).trim(), String(description || '').trim(), assignees[0].id, req.actor.id, wk);
  const taskId = info.lastInsertRowid;

  const insAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  for (const a of assignees) insAssignee.run(taskId, a.id);
  db.prepare('INSERT INTO task_weeks (task_id, week_start, is_carried) VALUES (?, ?, 0)').run(taskId, wk);
  insertHistory(taskId, 'created', req.actor.id, `Tạo việc cho ${assignees.map(a => a.name).join(', ')}`);

  res.status(201).json({ task: taskPayload(getTask(taskId)) });
});

// ---- Sửa thẻ ----
router.patch('/tasks/:id', requireActor, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (req.actor.role !== 'director' && !isAssignee(task, req.actor.id)) {
    return res.status(403).json({ error: 'Chỉ được sửa việc của chính mình.' });
  }
  if (req.actor.role !== 'director' && task.status !== 'open') {
    return res.status(403).json({ error: 'Chỉ sửa được việc đang mở.' });
  }

  const { title, description, assignee_id, assignee_ids } = req.body || {};
  const sets = [];
  const vals = [];
  let changes = [];

  if (title !== undefined) {
    const v = String(title).trim();
    if (!v) return res.status(400).json({ error: 'Tên công việc không được để trống.' });
    sets.push('title = ?'); vals.push(v);
    if (v !== task.title) changes.push('Đổi tên');
  }
  if (description !== undefined) {
    sets.push('description = ?'); vals.push(String(description || '').trim());
  }

  const newAssigneeIds = Array.isArray(assignee_ids) ? assignee_ids : (assignee_id !== undefined ? [assignee_id] : null);
  if (newAssigneeIds !== null) {
    if (req.actor.role !== 'director') return res.status(403).json({ error: 'Chỉ Giám đốc được đổi người phụ trách.' });
    const ids = [...new Set(newAssigneeIds.map(Number).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'Chọn ít nhất 1 người phụ trách.' });
    const emps = ids.map(getEmployee).filter(Boolean);
    if (emps.length !== ids.length) return res.status(400).json({ error: 'Nhân viên không hợp lệ.' });

    db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(task.id);
    const insA = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
    for (const id of ids) insA.run(task.id, id);

    if (ids[0] !== task.assignee_id) {
      sets.push('assignee_id = ?'); vals.push(ids[0]);
    }
    changes.push(`Giao cho ${emps.map(e => e.name).join(', ')}`);
  }

  if (!sets.length) return res.json({ task: taskPayload(task) });

  sets.push("updated_at = datetime('now','localtime')");
  vals.push(task.id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if (changes.length) insertHistory(task.id, 'edited', req.actor.id, changes.join('; '));

  res.json({ task: taskPayload(getTask(task.id)) });
});

// ---- Xóa thẻ (GD) ----
router.delete('/tasks/:id', requireDirector, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  insertHistory(task.id, 'deleted', req.director.id, task.title);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.json({ ok: true });
});

// ---- Mark done (bắt buộc nhập kết quả) ----
router.post('/tasks/:id/done', requireActor, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (req.actor.role !== 'director' && !isAssignee(task, req.actor.id)) {
    return res.status(403).json({ error: 'Chỉ người phụ trách được báo cáo hoàn thành.' });
  }
  if (task.status !== 'open') {
    return res.status(400).json({ error: 'Việc này không ở trạng thái mở.' });
  }
  const result = String((req.body || {}).result || '').trim();
  if (!result) return res.status(400).json({ error: 'Phải báo cáo kết quả trước khi hoàn thành.' });

  const wk = todayMonday();
  db.prepare(`
    UPDATE tasks SET status = 'pending_approval', result_text = ?, result_at = ?,
      completed_week_start = ?, completed_at = ?, updated_at = datetime('now','localtime')
    WHERE id = ?`).run(result, now(), wk, now(), task.id);
  upsertJournal(task.id, wk, req.actor.id, `[Báo cáo kết quả] ${result}`);
  insertHistory(task.id, 'marked_done', req.actor.id, 'Chờ Giám đốc duyệt');
  res.json({ task: taskPayload(getTask(task.id)) });
});

// ---- Duyệt (GD) ----
router.post('/tasks/:id/approve', requireDirector, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (task.status !== 'pending_approval') {
    return res.status(400).json({ error: 'Việc chưa chờ duyệt.' });
  }
  db.prepare(`UPDATE tasks SET status = 'done', approved_at = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(now(), task.id);
  insertHistory(task.id, 'approved', req.director.id, 'Đã duyệt hoàn thành');
  res.json({ task: taskPayload(getTask(task.id)) });
});

// ---- Trả lại (GD) ----
router.post('/tasks/:id/reopen', requireDirector, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (!['pending_approval', 'done'].includes(task.status)) {
    return res.status(400).json({ error: 'Việc này không thể trả lại.' });
  }
  db.prepare(`
    UPDATE tasks SET status = 'open', approved_at = NULL, completed_at = NULL,
      reopened_at = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(now(), task.id);
  const wk = todayMonday();
  db.prepare('INSERT OR IGNORE INTO task_weeks (task_id, week_start, is_carried) VALUES (?, ?, 0)').run(task.id, wk);
  insertHistory(task.id, 'reopened', req.director.id, 'Trả lại để làm tiếp');
  res.json({ task: taskPayload(getTask(task.id)) });
});

// ---- Huỷ việc (GD) ----
router.post('/tasks/:id/cancel', requireDirector, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (!['open', 'pending_approval'].includes(task.status)) {
    return res.status(400).json({ error: 'Việc này không thể huỷ.' });
  }
  const reason = String((req.body || {}).reason || '').trim() || null;
  db.prepare(`
    UPDATE tasks SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?,
      updated_at = datetime('now','localtime') WHERE id = ?`).run(now(), reason, task.id);
  insertHistory(task.id, 'cancelled', req.director.id, reason ? `Lý do: ${reason}` : 'Không có lý do');
  res.json({ task: taskPayload(getTask(task.id)) });
});

// ---- Nhật ký tiến độ ----
router.post('/tasks/:id/journal', requireActor, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy việc.' });
  if (req.actor.role !== 'director' && !isAssignee(task, req.actor.id)) {
    return res.status(403).json({ error: 'Chỉ người phụ trách được ghi nhật ký.' });
  }
  const note = String((req.body || {}).note || '').trim();
  if (!note) return res.status(400).json({ error: 'Nội dung nhật ký trống.' });
  const wk = todayMonday();
  if ((req.body || {}).week_start) {
    try {
      if (mondayOfISO(String(req.body.week_start)) !== wk) {
        return res.status(403).json({ error: 'Chỉ được ghi nhật ký cho tuần hiện tại.' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Tuần không hợp lệ.' });
    }
  }
  const r = upsertJournal(task.id, wk, req.actor.id, note);
  res.status(r.updated ? 200 : 201).json({ journal: r.journal, updated: r.updated });
});

module.exports = { router, taskPayload, getTask };
