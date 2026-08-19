const { db } = require('../src/db');
const bcrypt = require('bcryptjs');

db.exec(`
  DELETE FROM task_history;
  DELETE FROM task_journals;
  DELETE FROM task_weeks;
  DELETE FROM task_assignees;
  DELETE FROM tasks;
  DELETE FROM users WHERE role = 'employee';
`);

const GD = 1;
const EMP_NAMES = ['Lê Minh Quân', 'Phạm Thu Hà', 'Hoàng Đức Anh', 'Vũ Lan Phương', 'Đặng Quốc Bảo', 'Trần Kim Ngân'];
const DEMO_PASS = 'demo123';
const slugify = s => {
  const map = { 'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a','â':'a','ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a',
    'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e','ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e',
    'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i','ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o','ơ':'o','ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o',
    'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d',
    'Đ':'d','Ư':'u','Ơ':'o' };
  return s.toLowerCase().split('').map(c => map[c] || c).join('').replace(/[^a-z0-9]+/g, '').slice(0, 20);
};
const empIds = [];
for (let i = 0; i < EMP_NAMES.length; i++) {
  const info = db.prepare("INSERT INTO users (name, role, sort_order, username, password_hash) VALUES (?, 'employee', ?, ?, ?)")
    .run(EMP_NAMES[i], i + 1, slugify(EMP_NAMES[i]), bcrypt.hashSync(DEMO_PASS, 10));
  empIds.push(info.lastInsertRowid);
}
const [E1, E2, E3, E4, E5, E6] = empIds;

const W30 = '2026-07-20', W31 = '2026-07-27', W32 = '2026-08-03', W33 = '2026-08-10', W34 = '2026-08-17';

function isoTime(week, time) { return `${week} ${time}`; }

const TASKS = [
  // E1 Lê Minh Quân
  { t: 'Báo cáo tổng kết Q2', a: E1, by: 'gd', cw: W30, st: 'open', wk: [W30, W31, W32, W33, W34], j: [] },
  { t: 'Cập nhật tài liệu quy trình', a: E1, by: 'gd', cw: W32, st: 'open', wk: [W32, W33, W34], j: [
    { w: W32, n: 'Đã rà soát quy trình hiện tại.' },
    { w: W33, n: 'Đang biên soạn tài liệu mới.' },
  ] },
  { t: 'Họp chuẩn bị tuần mới', a: E1, by: E1, cw: W34, st: 'open', wk: [W34], j: [] },
  { t: 'Kế hoạch marketing tháng 8', a: E1, by: 'gd', cw: W33, st: 'done', wk: [W33], j: [], res: { n: 'Đã chốt kế hoạch marketing tháng 8 với đội ngũ.', w: W33 } },

  // E2 Phạm Thu Hà
  { t: 'Rà soát hợp đồng tồn đọng', a: E2, by: 'gd', cw: W31, st: 'open', wk: [W31, W32, W33, W34], j: [
    { w: W31, n: 'Bắt đầu rà soát 12 hợp đồng.' },
    { w: W32, n: 'Đã rà soát 7/12 hợp đồng.' },
    { w: W33, n: 'Hoàn tất rà soát, đang tổng hợp.' },
  ] },
  { t: 'Báo cáo chi phí quý', a: E2, by: E2, cw: W33, st: 'open', wk: [W33, W34], j: [] },
  { t: 'Sắp xếp công việc tuần', a: E2, by: E2, cw: W34, st: 'open', wk: [W34], j: [
    { w: W34, n: 'Đã lên danh sách công việc tuần.' },
  ] },
  { t: 'Thu hồi công nợ A', a: E2, by: 'gd', cw: W30, st: 'done', wk: [W30, W31, W32], j: [
    { w: W30, n: 'Gửi thông báo thu hồi.' },
    { w: W31, n: 'Khách hứa thanh toán 50%.' },
  ], res: { n: 'Thu hồi 80% công nợ, phần còn lại gia hạn sang tháng 9.', w: W32 } },

  // E3 Hoàng Đức Anh
  { t: 'Kiểm tra chất lượng sản phẩm', a: E3, by: 'gd', cw: W32, st: 'open', wk: [W32, W33, W34], j: [
    { w: W32, n: 'Bắt đầu kiểm tra lô hàng đầu tiên.' },
  ] },
  { t: 'Báo cáo nghiệm thu giai đoạn 1', a: E3, by: 'gd', cw: W34, st: 'pending_approval', wk: [W34], j: [], res: { n: 'Hoàn thành nghiệm thu giai đoạn 1, biên bản đã ký đủ.', w: W34 } },
  { t: 'Triển khai phần mềm', a: E3, by: 'gd', cw: W31, st: 'done', wk: [W31], j: [], res: { n: 'Đã triển khai và bàn giao phần mềm cho bộ phận vận hành.', w: W31 } },

  // E4 Vũ Lan Phương
  { t: 'Thống kê dữ liệu bán hàng', a: E4, by: 'gd', cw: W30, st: 'open', wk: [W30, W31, W32, W33, W34], j: [
    { w: W30, n: 'Thu thập dữ liệu từ các chi nhánh.' },
    { w: W31, n: 'Đang chuẩn hoá dữ liệu.' },
    { w: W32, n: 'Hoàn thiện bảng thống kê sơ bộ.' },
  ] },
  { t: 'Chuẩn bị slide báo cáo', a: E4, by: E4, cw: W34, st: 'open', wk: [W34], j: [] },
  { t: 'Đào tạo nhân viên mới', a: E4, by: 'gd', cw: W32, st: 'open', wk: [W32, W33, W34], j: [
    { w: W32, n: 'Lên chương trình đào tạo.' },
  ], res: { n: 'Hoàn tất đào tạo 3 nhân viên mới.', w: W33 }, reopenW: W33 },
  { t: 'Tuyển dụng vị trí kỹ thuật', a: E4, by: 'gd', cw: W34, st: 'done', wk: [W34], j: [], res: { n: 'Đã ký hợp đồng với ứng viên kỹ thuật.', w: W34 } },

  // E5 Đặng Quốc Bảo
  { t: 'Đối soát số liệu kho', a: E5, by: 'gd', cw: W31, st: 'open', wk: [W31, W32, W33, W34], j: [
    { w: W31, n: 'Kiểm kê kho ban đầu.' },
    { w: W32, n: 'Đối soát 3/5 kho.' },
  ] },
  { t: 'Gửi báo giá khách hàng X', a: E5, by: E5, cw: W34, st: 'open', wk: [W34], j: [] },
  { t: 'Chốt doanh thu tháng 7', a: E5, by: 'gd', cw: W34, st: 'done', wk: [W34], j: [], res: { n: 'Đã chốt doanh thu tháng 7 và báo cáo ban giám đốc.', w: W34 } },
  { t: 'Lập kế hoạch bán hàng Q3', a: E5, by: 'gd', cw: W34, st: 'pending_approval', wk: [W34], j: [], res: { n: 'Đã hoàn thiện kế hoạch bán hàng quý 3.', w: W34 } },

  // E6 Trần Kim Ngân
  { t: 'Khảo sát khách hàng', a: E6, by: 'gd', cw: W32, st: 'open', wk: [W32, W33, W34], j: [
    { w: W32, n: 'Soạn bảng câu hỏi khảo sát.' },
    { w: W33, n: 'Đã gửi khảo sát 50 khách hàng.' },
  ] },
  { t: 'Cập nhật website', a: E6, by: E6, cw: W34, st: 'open', wk: [W34], j: [
    { w: W34, n: 'Đã đăng bài viết mới.' },
  ] },
  { t: 'Báo cáo tồn kho cuối tháng', a: E6, by: 'gd', cw: W31, st: 'done', wk: [W31, W32, W33], j: [
    { w: W31, n: 'Thu thập số liệu kho.' },
    { w: W32, n: 'Đang tổng hợp báo cáo.' },
  ], res: { n: 'Đã gửi báo cáo tồn kho cuối tháng 7.', w: W33 } },
  { t: 'Chuẩn bị Hội nghị khách hàng', a: E6, by: 'gd', cw: W34, st: 'pending_approval', wk: [W34], j: [], res: { n: 'Đã chuẩn bị xong hội trường và tài liệu hội nghị.', w: W34 } },
];

const insertTask = db.prepare(`
  INSERT INTO tasks (title, description, assignee_id, created_by, created_week_start, status,
    result_text, result_at, completed_week_start, completed_at, approved_at, reopened_at, created_at, updated_at)
  VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
const insertWeek = db.prepare('INSERT INTO task_weeks (task_id, week_start, is_carried) VALUES (?, ?, ?)');
const insertJournal = db.prepare('INSERT INTO task_journals (task_id, week_start, author_id, note, created_at) VALUES (?, ?, ?, ?, ?)');
const insertHistory = db.prepare('INSERT INTO task_history (task_id, action, by_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?)');

let count = 0;
for (const o of TASKS) {
  const createdBy = o.by === 'gd' ? GD : o.by;
  let result_text = null, result_at = null, completed_week = null, completed_at = null, approved_at = null, reopened_at = null;
  if (o.res) {
    result_text = o.res.n;
    result_at = isoTime(o.res.w, '17:00:00');
    completed_week = o.res.w;
    completed_at = isoTime(o.res.w, '17:00:00');
  }
  if (o.st === 'done') approved_at = isoTime(o.res.w, '17:30:00');
  if (o.reopenW) reopened_at = isoTime(o.reopenW, '09:30:00');

  const created_at = isoTime(o.cw, '09:00:00');
  const info = insertTask.run(o.t, o.a, createdBy, o.cw, o.st,
    result_text, result_at, completed_week, completed_at, approved_at, reopened_at, created_at, created_at);
  const id = info.lastInsertRowid;
  insertAssignee.run(id, o.a);

  for (const w of o.wk) insertWeek.run(id, w, w === o.cw ? 0 : 1);

  for (const j of o.j || []) insertJournal.run(id, j.w, o.a, j.n, isoTime(j.w, '15:30:00'));
  if (o.res) insertJournal.run(id, o.res.w, o.a, `[Báo cáo kết quả] ${o.res.n}`, isoTime(o.res.w, '17:00:00'));

  insertHistory.run(id, 'created', createdBy, 'Tạo việc', created_at);
  for (const w of o.wk) {
    if (w !== o.cw) insertHistory.run(id, 'carried', null, `Đẩy sang tuần ${w}`, isoTime(w, '00:00:05'));
  }
  if (o.res) insertHistory.run(id, 'marked_done', o.a, 'Chờ Giám đốc duyệt', isoTime(o.res.w, '17:00:00'));
  if (o.st === 'done') insertHistory.run(id, 'approved', GD, 'Đã duyệt hoàn thành', isoTime(o.res.w, '17:30:00'));
  if (o.reopenW) insertHistory.run(id, 'reopened', GD, 'Trả lại để làm tiếp', isoTime(o.reopenW, '09:30:00'));

  count += 1;
}

console.log(`Seed xong: ${EMP_NAMES.length} nhân viên, ${count} thẻ.`);
console.log('Tài khoản demo (mật khẩu: ' + DEMO_PASS + '):');
EMP_NAMES.forEach((n, i) => console.log(`  ${n} → ${slugify(n)}`));
