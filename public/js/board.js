const BoardState = { week: '', weeks: [], employees: [], tasks: [], journals: [], history: [] };

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayMonday() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISO(d);
}
function addDays(iso, n) { return toISO(new Date(parseISO(iso).getTime() + n * 86400000)); }
function addWeeks(iso, n) { return toISO(new Date(parseISO(iso).getTime() + n * 7 * 86400000)); }
function isoWeek(iso) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + 3);
  const y0 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
}
function fmtDM(iso) { return iso.slice(5).replace('-', '/'); }
function weekLabel(iso) { return `Tuần ${isoWeek(iso)}`; }
function fullWeekLabel(iso) { return `${weekLabel(iso)} (${fmtDM(iso)} – ${fmtDM(addDays(iso, 6))})`; }

function ageClass(age) { return 'age-' + Math.min(age, 7); }
function statusLabel(st) { return st === 'open' ? 'Đang mở' : st === 'pending_approval' ? 'Chờ duyệt' : st === 'done' ? 'Hoàn thành' : 'Đã hủy'; }

const RESULT_PREFIX = '[Báo cáo kết quả] ';

function lastUpdateText(tjs) {
  if (!tjs.length) return 'Chưa có cập nhật';
  const latest = tjs[tjs.length - 1];
  let note = latest.note;
  if (note.startsWith(RESULT_PREFIX)) note = note.slice(RESULT_PREFIX.length);
  return '📝 ' + note + ' · ' + fmtDate(latest.updated_at || latest.created_at);
}

function cardElement(task, ctx) {
  const div = document.createElement('div');
  div.className = 'card ' + ageClass(task.age) + (task.reopened_at ? ' reopened' : '') + (task.status === 'cancelled' ? ' card-cancelled' : '');
  const t = document.createElement('div');
  t.className = 'card-title';
  t.textContent = task.title;
  div.appendChild(t);
  if (task.description) {
    const d = document.createElement('div');
    d.className = 'card-desc';
    d.textContent = task.description;
    div.appendChild(d);
  }
  const l = document.createElement('div');
  l.className = 'card-last';
  l.textContent = ctx.lastText;
  div.appendChild(l);
  if (task.assignee_ids.length > 1) {
    const names = task.assignee_ids.map(id => empName(id));
    const chip = document.createElement('div');
    chip.className = 'card-shared';
    chip.textContent = `👥 ${task.assignee_ids.length} người`;
    chip.title = `Giao cho: ${names.join(', ')}`;
    div.appendChild(chip);
  }
  div.addEventListener('click', e => { e.stopPropagation(); openTaskModal(task.id); });
  return div;
}

function attachRename(headerEl, emp) {
  if (!isDirector()) return;
  headerEl.style.cursor = 'pointer';
  headerEl.title = 'Click để đổi tên';
  headerEl.addEventListener('click', e => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = emp.name;
    input.className = 'emp-rename-input';
    headerEl.textContent = '';
    headerEl.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async save => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v && v !== emp.name) {
        try {
          await api('PATCH', `/api/employees/${emp.id}`, { name: v });
          toast('Đã đổi tên.', 'ok');
        } catch (err) { toast(err.message, 'error'); }
      }
      loadBoard();
    };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });
}

async function quickAddEmployee() {
  const name = prompt('Tên nhân viên mới:', '');
  if (name === null || !name.trim()) return;
  try {
    await api('POST', '/api/employees', { name: name.trim() });
    toast('Đã thêm nhân viên.', 'ok');
    await loadBoard();
  } catch (e) { toast(e.message, 'error'); }
}

function kanbanBuckets(tasks, week) {
  const buckets = { done: [], inprog: [], plan: [] };
  const prevWeek = addWeeks(week, -1);
  const journaled = new Set(
    BoardState.journals.filter(j => j.week_start === week).map(j => j.task_id)
  );
  for (const t of tasks) {
    if (t.status === 'pending_approval' || t.status === 'cancelled') buckets.done.push(t);
    else if (t.status === 'done') {
      const cw = t.completed_week_start;
      if (!cw || cw === week || cw === prevWeek) buckets.done.push(t);
    }
    else if (t.created_week_start === week && !journaled.has(t.id)) buckets.plan.push(t);
    else buckets.inprog.push(t);
  }
  const sortByAge = (a, b) => (b.age - a.age) || String(a.title).localeCompare(String(b.title), 'vi');
  buckets.done.sort(sortByAge);
  buckets.inprog.sort(sortByAge);
  buckets.plan.sort(sortByAge);
  return buckets;
}

function renderBoard() {
  const board = document.getElementById('board');
  const week = BoardState.week;
  const emps = [...BoardState.employees];
  if (me && !isDirector()) {
    const i = emps.findIndex(e => e.id === Number(actorId()));
    if (i > 0) {
      const mine = emps.splice(i, 1)[0];
      emps.unshift(mine);
    }
  }
  board.className = 'board';
  board.innerHTML = '';

  const byEmp = new Map();
  for (const t of BoardState.tasks) {
    for (const aid of t.assignee_ids) {
      if (!byEmp.has(aid)) byEmp.set(aid, []);
      byEmp.get(aid).push(t);
    }
  }

  const journalsByTask = new Map();
  for (const j of BoardState.journals) {
    if (!journalsByTask.has(j.task_id)) journalsByTask.set(j.task_id, []);
    journalsByTask.get(j.task_id).push(j);
  }

  for (const emp of emps) {
    const block = document.createElement('div');
    block.className = 'emp-kanban';
    const eh = document.createElement('div');
    eh.className = 'emp-head';
    eh.textContent = emp.name;
    attachRename(eh, emp);
    block.appendChild(eh);

    const cols = document.createElement('div');
    cols.className = 'kanban-cols';
    const tasks = byEmp.get(emp.id) || [];
    const buckets = kanbanBuckets(tasks, week);
    const canAddHere = isDirector() || emp.id === Number(actorId());

    const defs = [
      ['done', 'Đã hoàn thành', buckets.done],
      ['inprog', 'Đang thực hiện', buckets.inprog],
      ['plan', 'Kế hoạch', buckets.plan],
    ];
    for (const [key, label, list] of defs) {
      const colEl = document.createElement('div');
      colEl.className = 'kanban-col';
      const head = document.createElement('div');
      head.className = 'kanban-col-head';
      head.textContent = `${label} (${list.length})`;
      colEl.appendChild(head);
      if (key === 'plan' && !tasks.length) {
        const empty = document.createElement('div');
        empty.className = 'cell-empty';
        empty.textContent = 'Chưa có việc trong tuần này.';
        colEl.appendChild(empty);
      }
      for (const t of list) {
        colEl.appendChild(cardElement(t, { lastText: lastUpdateText(journalsByTask.get(t.id) || []) }));
      }
      if (key === 'plan' && canAddHere) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm emp-add';
        addBtn.textContent = '+ Thêm việc';
        addBtn.addEventListener('click', e => { e.stopPropagation(); openTaskCreateModal(emp.id); });
        colEl.appendChild(addBtn);
      }
      cols.appendChild(colEl);
    }
    block.appendChild(cols);
    board.appendChild(block);
  }

  if (isDirector()) {
    const col = document.createElement('div');
    col.className = 'emp-add-col';
    const btn = document.createElement('button');
    btn.className = 'btn emp-add-new';
    btn.textContent = '＋ Thêm nhân viên';
    btn.addEventListener('click', quickAddEmployee);
    col.appendChild(btn);
    board.appendChild(col);
  }
}

function renderLegend() {
  const items = [
    ['1 tuần', '#e8f5e9'], ['2', '#fff9c4'], ['3', '#ffe082'], ['4', '#ffb74d'],
    ['5', '#ff8a65'], ['6', '#e57373'], ['7+', '#c62828'],
  ];
  const box = document.getElementById('legend');
  box.innerHTML = '<b>Tuổi thẻ (số tuần tồn tại):</b> ';
  for (const [t, c] of items) {
    box.insertAdjacentHTML('beforeend', `<span class="item"><span class="swatch" style="background:${c}"></span>${t}</span>`);
  }
  box.insertAdjacentHTML('beforeend', '<span class="item">· Việc càng lâu màu càng đậm</span>');
}

async function loadBoard() {
  if (!BoardState.week) BoardState.week = todayMonday();
  const w = BoardState.week;
  const data = await api('GET', `/api/board?from=${w}&to=${w}`);
  BoardState.weeks = data.weeks;
  BoardState.employees = data.employees;
  BoardState.director = data.director;
  BoardState.tasks = data.tasks;
  BoardState.journals = data.journals;
  BoardState.history = data.history;
  renderBoard();
  document.getElementById('rangeLabel').textContent = fullWeekLabel(w);
  document.getElementById('btnExportWeek').href = `/api/export/week.csv?from=${w}&to=${w}`;
}
