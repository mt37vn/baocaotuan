let reportData = null;

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadReport() {
  const month = document.getElementById('reportMonth').value;
  reportData = await api('GET', '/api/report/monthly?month=' + month);
  const { rows } = reportData;

  let rowsHtml = rows.map(r => `
    <tr class="${r.active ? '' : ''}" style="${r.active ? '' : 'opacity:.55'}">
      <td class="l">${escapeHtml(r.name)}</td>
      <td>${r.assigned}</td>
      <td>${r.completed}</td>
      <td>${r.ratio}%</td>
      <td>${r.backlogStart}</td>
      <td>${r.total}</td>
      <td>${r.backlogEnd}</td>
      <td title="${r.reported}/${r.due} tuần">${r.reportRate == null ? '—' : r.reportRate + '%'}</td>
      <td>${r.avgAge}</td>
    </tr>`).join('');

  const total = rows.reduce((a, r) => ({
    assigned: a.assigned + r.assigned, completed: a.completed + r.completed,
    backlogStart: a.backlogStart + r.backlogStart, total: a.total + r.total,
    backlogEnd: a.backlogEnd + r.backlogEnd,
    due: a.due + (r.due || 0), reported: a.reported + (r.reported || 0),
  }), { assigned: 0, completed: 0, backlogStart: 0, total: 0, backlogEnd: 0, due: 0, reported: 0 });
  const totRatio = total.total ? Math.round((total.completed / total.total) * 1000) / 10 : 0;
  const totRate = total.due ? Math.round((total.reported / total.due) * 1000) / 10 : null;
  rowsHtml += `<tr class="total"><td class="l">Tổng cộng</td><td>${total.assigned}</td><td>${total.completed}</td><td>${totRatio}%</td><td>${total.backlogStart}</td><td>${total.total}</td><td>${total.backlogEnd}</td><td title="${total.reported}/${total.due} tuần">${totRate == null ? '—' : totRate + '%'}</td><td>—</td></tr>`;

  const max = Math.max(1, ...rows.map(r => r.completed));
  const chart = rows.map(r => `
    <div class="bar-col" title="${escapeHtml(r.name)}: ${r.completed} hoàn thành">
      <span class="bar-val">${r.completed}</span>
      <span class="bar" style="height:${Math.max(2, Math.round((r.completed / max) * 130))}px"></span>
      <span class="bar-name">${escapeHtml(r.name)}</span>
    </div>`).join('');

  document.getElementById('reportContent').innerHTML = `
    <h3 class="rpt-title">Hiệu suất tháng — ${escapeHtml(reportData.monthLabel)}</h3>
    <table class="rpt">
      <thead><tr>
        <th class="l">Nhân viên</th><th>Việc giao</th><th>Hoàn thành</th><th>Tỷ lệ</th>
        <th>Tồn đọng đầu tháng</th><th>Tổng phải xử lý</th><th>Tồn đọng cuối tháng</th><th>Báo cáo đúng hạn</th><th>Tuổi TB thẻ đã xong</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <h4 style="margin:18px 0 6px;color:var(--muted)">Biểu đồ: số việc hoàn thành theo nhân viên</h4>
    <div class="chart">${chart || '<div style="color:var(--muted)">Chưa có dữ liệu.</div>'}</div>
    <p style="color:var(--muted);font-size:12px">Tỷ lệ hoàn thành = Hoàn thành / (Tồn đọng đầu tháng + Việc giao trong tháng). Báo cáo đúng hạn = số (thẻ, tuần) đã kết thúc trong tháng có nhật ký / tổng số phải báo. Tuổi = số tuần thẻ đã tồn tại.</p>`;

  document.getElementById('btnExportMonthly').href = `/api/export/monthly.csv?month=${month}`;
}

function renderWeeklyReport() {
  const week = BoardState.week;
  const container = document.getElementById('weeklyContent');
  const prevWeek = addWeeks(week, -1);

  const journalsByTask = new Map();
  for (const j of BoardState.journals) {
    if (!journalsByTask.has(j.task_id)) journalsByTask.set(j.task_id, []);
    journalsByTask.get(j.task_id).push(j);
  }
  const RESULT_PREFIX = '[Báo cáo kết quả] ';

  const empOrder = new Map(BoardState.employees.map((e, i) => [e.id, i]));
  const buckets = kanbanBuckets(BoardState.tasks, week);
  const sortInReport = (a, b) =>
    ((empOrder.get(a.assignee_id) ?? 0) - (empOrder.get(b.assignee_id) ?? 0)) || (b.age - a.age);

  const section = (title, list, contentHeader, contentHtml) => {
    list.sort(sortInReport);
    const rows = list.map(t => {
      const tjs = journalsByTask.get(t.id) || [];
      const latest = tjs.length ? tjs.reduce((a, b) => (a.week_start >= b.week_start ? a : b)) : null;
      let note = latest ? latest.note : '';
      if (note.startsWith(RESULT_PREFIX)) note = note.slice(RESULT_PREFIX.length);
      const activePrev = t.weeks.includes(prevWeek);
      const updatedPrev = tjs.some(j => j.week_start === prevWeek);
      const notUpdated = t.status === 'open' && activePrev && !updatedPrev;
      const titleCls = t.status === 'cancelled' ? ' cancelled-title' : '';
      return `
        <tr>
          <td class="title${titleCls}" onclick="openTaskModal(${t.id})">${escapeHtml(t.title)}</td>
          <td class="who">${escapeHtml(empName(t.assignee_id))}</td>
          <td><span class="age-badge">${t.age} tuần</span></td>
          <td>${contentHtml(t, { note, notUpdated })}</td>
        </tr>`;
    }).join('');
    return `
      <h3 class="rpt-title">${title} (${list.length})</h3>
      ${rows
        ? `<table class="wreport">
            <thead><tr><th class="l">Công việc</th><th>Người thực hiện</th><th>Tuổi</th><th class="l">${contentHeader}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<div style="color:var(--muted)">Không có việc.</div>'}`;
  };

  const contentDone = (t, ctx) => [
    t.result_text ? escapeHtml(t.result_text) : '<span style="color:var(--muted)">—</span>',
    t.status === 'pending_approval' ? '<span class="warn-chip cell-warn">⏳ Chờ duyệt</span>' : '',
  ].join('');
  const contentInprog = (t, ctx) => [
    ctx.note ? escapeHtml(ctx.note) : '<span style="color:var(--muted)">—</span>',
    ctx.notUpdated ? '<div class="warn-chip cell-warn">⚠ Chưa cập nhật tuần trước</div>' : '',
  ].join('');
  const contentPlan = (t, ctx) => t.description ? escapeHtml(t.description) : '<span style="color:var(--muted)">—</span>';

  document.getElementById('weeklyRange').textContent = fullWeekLabel(week);
  container.innerHTML = `
    <h3 class="rpt-title">Báo cáo tuần — ${fullWeekLabel(week)}</h3>
    ${section('Hoàn thành', buckets.done, 'Kết quả', contentDone)}
    ${section('Đang thực hiện', buckets.inprog, 'Tiến độ', contentInprog)}
    ${section('Kế hoạch', buckets.plan, 'Mô tả', contentPlan)}`;
}

async function loadWeekly() {
  await loadBoard();
  renderWeeklyReport();
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + view).classList.remove('hidden');
  document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');
  if (view === 'board') loadBoard();
  if (view === 'weekly') loadWeekly();
  if (view === 'report') loadReport();
  if (view === 'employees') renderEmployees();
}
