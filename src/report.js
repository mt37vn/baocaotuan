const express = require('express');
const { db } = require('./db');
const { requireDirector } = require('./auth');
const { todayMonday, addWeeks, monthRange, mondayOfISO, weekLabel, monthLabel } = require('./dates');

const router = express.Router();

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function employeeMonthlyStats(employeeId, T0, T1, dueBefore) {
  const mStart = T0.slice(0, 10);
  const mEnd = T1.slice(0, 10);
  const assigned = db.prepare('SELECT COUNT(*) AS c FROM tasks t WHERE t.assignee_id = ? AND t.created_at >= ? AND t.created_at < ?').get(employeeId, T0, T1).c;
  const completed = db.prepare('SELECT COUNT(*) AS c FROM tasks t WHERE t.assignee_id = ? AND t.approved_at >= ? AND t.approved_at < ?').get(employeeId, T0, T1).c;
  const backlogStart = db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE t.assignee_id = ? AND t.created_at <= ? AND (t.approved_at IS NULL OR t.approved_at >= ?) AND t.status != 'cancelled'`).get(employeeId, T0, T0).c;
  const backlogEnd = db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE t.assignee_id = ? AND t.created_at <= ? AND (t.approved_at IS NULL OR t.approved_at > ?) AND t.status != 'cancelled'`).get(employeeId, T1, T1).c;
  const avgRow = db.prepare(`
    SELECT AVG(c) AS a FROM (
      SELECT COUNT(w.id) AS c FROM tasks t JOIN task_weeks w ON w.task_id = t.id
      WHERE t.assignee_id = ? AND t.approved_at >= ? AND t.approved_at < ?
      GROUP BY t.id)`).get(employeeId, T0, T1);
  const due = db.prepare(`
    SELECT COUNT(*) AS c FROM tasks t JOIN task_weeks w ON w.task_id = t.id
    WHERE t.assignee_id = ? AND w.week_start >= ? AND w.week_start <= ? AND w.week_start < ?`)
    .get(employeeId, mStart, mEnd, dueBefore).c;
  const reported = db.prepare(`
    SELECT COUNT(*) AS c FROM tasks t JOIN task_weeks w ON w.task_id = t.id
    WHERE t.assignee_id = ? AND w.week_start >= ? AND w.week_start <= ? AND w.week_start < ?
      AND EXISTS (SELECT 1 FROM task_journals j WHERE j.task_id = t.id AND j.week_start = w.week_start)`)
    .get(employeeId, mStart, mEnd, dueBefore).c;
  const total = backlogStart + assigned;
  return {
    assigned, completed, backlogStart, backlogEnd,
    total,
    ratio: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    avgAge: avgRow.a ? Math.round(avgRow.a * 10) / 10 : 0,
    due, reported,
    reportRate: due > 0 ? Math.round((reported / due) * 1000) / 10 : null,
  };
}

function monthlyReport(month) {
  const { start, end } = monthRange(month);
  const T0 = `${start} 00:00:00`;
  const T1 = `${end} 23:59:59`;
  const dueBefore = todayMonday();
  const employees = db.prepare("SELECT id, name, active FROM users WHERE role = 'employee' ORDER BY sort_order, name").all();
  const rows = employees.map(e => ({
    employee_id: e.id, name: e.name, active: !!e.active,
    ...employeeMonthlyStats(e.id, T0, T1, dueBefore),
  }));
  return { month, monthLabel: monthLabel(month), rows };
}

router.get('/report/monthly', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : currentMonth();
  res.json(monthlyReport(month));
});

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvBlob(headers, rows, sep = ';') {
  const lines = [headers.map(csvEscape).join(sep)];
  for (const r of rows) lines.push(r.map(csvEscape).join(sep));
  return '\uFEFF' + lines.join('\r\n');
}

router.get('/export/monthly.csv', requireDirector, (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : currentMonth();
  const { rows } = monthlyReport(month);
  const data = csvBlob(
    ['Nhân viên', 'Việc giao trong tháng', 'Hoàn thành', 'Tỷ lệ hoàn thành', 'Tồn đọng đầu tháng', 'Tổng phải xử lý', 'Tồn đọng cuối tháng', 'Báo cáo đúng hạn', 'Tuổi TB thẻ đã xong'],
    rows.map(r => [r.name, r.assigned, r.completed, `${r.ratio}%`, r.backlogStart, r.total, r.backlogEnd,
      r.reportRate == null ? '—' : `${r.reportRate}%`, r.avgAge]),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="baocao-thang-${month}.csv"`);
  res.send(data);
});

const STATUS_LABEL = { open: 'Đang mở', pending_approval: 'Chờ duyệt', done: 'Hoàn thành' };

router.get('/export/week.csv', requireDirector, (req, res) => {
  const from = req.query.from ? mondayOfISO(String(req.query.from)) : addWeeks(todayMonday(), -4);
  const to = req.query.to ? mondayOfISO(String(req.query.to)) : todayMonday();
  const users = new Map(db.prepare('SELECT id, name FROM users').all().map(u => [u.id, u.name]));
  const tasks = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM task_weeks w WHERE w.task_id = t.id) AS age,
      (SELECT group_concat(week_start, '|') FROM (SELECT week_start FROM task_weeks WHERE task_id = t.id ORDER BY week_start)) AS weeks
    FROM tasks t
    WHERE EXISTS (SELECT 1 FROM task_weeks x WHERE x.task_id = t.id AND x.week_start BETWEEN ? AND ?)
    ORDER BY t.created_at`).all(from, to);

  const rows = tasks.map(t => [
    users.get(t.assignee_id) || '', t.title, t.description,
    users.get(t.created_by) || '', weekLabel(t.created_week_start),
    STATUS_LABEL[t.status] || t.status, t.result_text || '',
    t.age, (t.weeks || '').split('|').map(weekLabel).join('; '),
  ]);
  const data = csvBlob(
    ['Nhân viên', 'Công việc', 'Mô tả', 'Người tạo', 'Tuần tạo', 'Trạng thái', 'Kết quả', 'Số tuần tồn tại', 'Các tuần xuất hiện'],
    rows,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bang-tuan-${from}-${to}.csv"`);
  res.send(data);
});

module.exports = { router, monthlyReport };
