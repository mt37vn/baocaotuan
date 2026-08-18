let modalTaskId = null;

function openOverlay(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeOverlay() {
  if (isLoginRequired()) return;
  document.getElementById('modalOverlay').classList.add('hidden');
  modalTaskId = null;
}

function statusChip(st) {
  const lbl = st === 'open' ? 'Đang mở' : st === 'pending_approval' ? 'Chờ duyệt' : st === 'done' ? 'Hoàn thành' : 'Đã hủy';
  return `<span class="status-chip status-${st}">${lbl}</span>`;
}

function empName(id) {
  const n = Number(id);
  const e = BoardState.employees.find(x => x.id === n)
    || (BoardState.director && BoardState.director.id === n ? BoardState.director : null);
  return e ? e.name : ('#' + n);
}

function mondayOfDatetime(dt) {
  const d = parseISO(dt.slice(0, 10));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

function assigneeOptions(selectedId) {
  const opts = BoardState.employees
    .filter(e => e.active)
    .map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`)
    .join('');
  return `<option value="">— Chọn nhân viên —</option>${opts}`;
}

function openTaskCreateModal(preAssignee) {
  if (!me) {
    toast('Vui lòng đăng nhập để tạo việc.', 'error');
    showLoginModal();
    return;
  }
  modalTaskId = null;
  const today = todayMonday();
  const selected = BoardState.week || today;
  let weekOpts = '';
  const seen = new Set();
  for (const w of [selected, today]) {
    if (seen.has(w)) continue;
    seen.add(w);
    weekOpts += `<option value="${w}" ${w === selected ? 'selected' : ''}>${weekLabel(w)} (${fmtDM(w)} – ${fmtDM(addDays(w, 6))})</option>`;
  }
  const fixedAssignee = !isDirector() ? actorId() : '';
  const preSel = isDirector() && preAssignee ? Number(preAssignee) : '';
  const assigneeHtml = isDirector()
    ? `<div class="field"><label>Nhân viên phụ trách</label><select id="mAssignee">${assigneeOptions(preSel)}</select></div>`
    : `<div class="field"><label>Nhân viên phụ trách</label><input type="text" value="${escapeHtml(empName(fixedAssignee))}" disabled></div>`;
  openOverlay(`
    <h3>Tạo việc mới</h3>
    <div class="modal-sub">Việc sẽ xuất hiện ở tuần đã chọn.</div>
    <div class="field"><label>Tuần</label><select id="mWeek">${weekOpts}</select></div>
    ${assigneeHtml}
    <div class="field"><label>Công việc *</label><input type="text" id="mTitle" placeholder="Tên công việc"></div>
    <div class="field"><label>Mô tả / yêu cầu</label><textarea id="mDesc" rows="3" placeholder="Mô tả chi tiết (nếu cần)"></textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeOverlay()">Hủy</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" onclick="submitCreateTask()">Tạo việc</button>
    </div>`);
}

async function submitCreateTask() {
  const title = document.getElementById('mTitle').value.trim();
  if (!title) return toast('Cần nhập tên công việc.', 'error');
  let assigneeId = isDirector() ? Number(document.getElementById('mAssignee').value) : actorId();
  if (!assigneeId) return toast('Chọn nhân viên phụ trách.', 'error');
  try {
    await api('POST', '/api/tasks', {
      title,
      description: document.getElementById('mDesc').value,
      assignee_id: assigneeId,
      week_start: document.getElementById('mWeek').value,
    });
    toast('Đã tạo việc.', 'ok');
    closeOverlay();
    await loadBoard();
  } catch (e) { toast(e.message, 'error'); }
}

async function openTaskModal(id) {
  modalTaskId = id;
  renderTaskModal();
}

async function renderTaskModal() {
  const task = BoardState.tasks.find(t => t.id === modalTaskId);
  if (!task) return closeOverlay();
  const journals = BoardState.journals.filter(j => j.task_id === task.id);
  const history = BoardState.history.filter(h => h.task_id === task.id);
  const curWeekJournal = journals.find(j => j.week_start === todayMonday());
  const isMine = task.assignee_id === Number(actorId());
  const canEdit = isDirector() || isMine;
  const canEditFields = canEdit && (isDirector() || task.status === 'open');
  const canDone = task.status === 'open' && (isMine || isDirector());
  const canJournal = task.status !== 'done' && task.status !== 'cancelled' && (isMine || isDirector());
  const createdByName = empName(task.created_by);

  const ACT = { created: 'Tạo', carried: 'Đẩy sang tuần mới', marked_done: 'Báo cáo hoàn thành', approved: 'Duyệt', reopened: 'Trả lại làm tiếp', edited: 'Sửa', deleted: 'Xóa', cancelled: 'Huỷ' };
  const blocks = new Map();
  const ensure = wk => { if (!blocks.has(wk)) blocks.set(wk, { note: null, events: [] }); };
  for (const w of task.weeks) ensure(w);
  for (const j of journals) { ensure(j.week_start); blocks.get(j.week_start).note = j; }
  for (const h of history) { const wk = mondayOfDatetime(h.created_at); ensure(wk); blocks.get(wk).events.push(h); }
  const weekKeys = Array.from(blocks.keys()).sort();
  const showAddNote = canJournal && !curWeekJournal;
  const curWeek = todayMonday();
  const journalBlocks = weekKeys.map(wk => {
    const b = blocks.get(wk);
    if (!b.note && !task.weeks.includes(wk)) return '';
    let inner;
    if (b.note) {
      inner = `<div class="journal-item" id="ji-${b.note.id}"><div>${escapeHtml(b.note.note)}</div>
          <div class="jmeta">${escapeHtml(empName(b.note.author_id))} · ${escapeHtml(fmtDate(b.note.created_at))}
          ${canJournal && b.note.week_start === curWeek ? `<button class="btn btn-sm tl-edit" onclick="editJournal(${b.note.id})">✎ Sửa</button>` : ''}</div></div>`;
    } else if (wk === curWeek) {
      inner = showAddNote
        ? `<div class="form-row" style="margin-bottom:2px"><input type="text" id="mJournal" placeholder="Ghi chú tiến độ tuần này..."><button class="btn" onclick="submitJournal()">Ghi</button></div>`
        : '';
    } else {
      inner = '<div class="journal-item no-report">🔴 Không có báo cáo tuần này</div>';
    }
    if (!inner) return '';
    return `<div class="week-block">
        <div class="week-block-head">${fullWeekLabel(wk)}</div>${inner}</div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px">Chưa có nhật ký.</div>';

  const historyBlocks = weekKeys.map(wk => {
    const b = blocks.get(wk);
    if (!b.events.length) return '';
    const ev = b.events.slice().sort((a, c) => (a.created_at < c.created_at ? -1 : a.created_at > c.created_at ? 1 : 0)).map(h => {
      const act = ACT[h.action] || h.action;
      return `<div class="hist-item">⚙ ${escapeHtml(fmtDate(h.created_at))} — <b>${escapeHtml(act)}</b> ${h.detail ? '· ' + escapeHtml(h.detail) : ''}${h.by_user_id ? ' · bởi ' + escapeHtml(empName(h.by_user_id)) : ''}</div>`;
    }).join('');
    return `<div class="week-block">
        <div class="week-block-head">${fullWeekLabel(wk)}</div>${ev}</div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px">Chưa có sự kiện.</div>';

  let resultHtml = '';
  if (task.status === 'pending_approval' || task.status === 'done') {
    resultHtml = `<div class="field"><label>Báo cáo kết quả</label>
      <div class="detail-block">${escapeHtml(task.result_text || '')}</div>
      <div class="hint">Báo cáo lúc ${escapeHtml(fmtDate(task.result_at))} · ${task.status === 'done' ? `Giám đốc duyệt lúc ${escapeHtml(fmtDate(task.approved_at))}` : 'Đang chờ Giám đốc duyệt'}</div></div>`;
  }
  if (task.status === 'cancelled') {
    resultHtml += `<div class="field"><label>Việc đã huỷ</label>
      <div class="detail-block" style="background:#fdecea;color:#c0392b">${escapeHtml(task.cancel_reason || 'Không có lý do')}</div>
      <div class="hint">Huỷ lúc ${escapeHtml(fmtDate(task.cancelled_at))}</div></div>`;
  }

  const assigneeHtml = isDirector()
    ? `<div class="field"><label>Nhân viên phụ trách</label>
       <div id="mAssigneeTxt" class="detail-block editable-text" onclick="editAssignee()" title="Bấm để đổi người phụ trách">${escapeHtml(empName(task.assignee_id))}</div></div>`
    : `<div class="field"><label>Nhân viên phụ trách</label><div class="detail-block">${escapeHtml(empName(task.assignee_id))}</div></div>`;

  openOverlay(`
    <h3><span id="mTitleSpan" class="editable-title" ${canEditFields ? 'onclick="editTitle()" title="Bấm để sửa tên"' : ''}>${escapeHtml(task.title)}</span> ${statusChip(task.status)}</h3>
    <div class="modal-sub">#${task.id} · Tạo bởi ${escapeHtml(createdByName)} · ${escapeHtml(weekLabel(task.created_week_start))} · Tồn tại ${task.age} tuần</div>
    ${resultHtml}
    <div class="field"><label>Mô tả</label>
      <div id="mDescTxt" class="detail-block editable-text" ${canEditFields ? 'onclick="editDesc()" title="Bấm để sửa mô tả"' : ''}>${task.description ? escapeHtml(task.description) : '<span style="color:var(--muted)">Chưa có mô tả. Bấm để thêm.</span>'}</div>
    </div>
    ${assigneeHtml}
    <div class="journal-list"><h4>Nhật ký tiến độ</h4>
      ${journalBlocks}
    </div>
    <div class="hist-list">
      <h4 class="collapse-head" onclick="toggleHist()">▸ Lịch sử (${history.length})</h4>
      <div id="histBody" class="collapse-body hidden">${historyBlocks}</div>
    </div>
    <div class="modal-actions" id="mActions"></div>`);

  const actions = document.getElementById('mActions');
  if (canDone) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn btn-ok" onclick="showDoneForm()">✓ Hoàn thành...</button>');
  }
  if (task.status === 'pending_approval' && isDirector()) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn btn-ok" onclick="approveTask()">Duyệt</button>');
  }
  if ((task.status === 'pending_approval' || task.status === 'done') && isDirector()) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn btn-warn" onclick="reopenTask()">Trả lại làm tiếp</button>');
  }
  if ((task.status === 'open' || task.status === 'pending_approval') && isDirector()) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn btn-warn" onclick="cancelTask()">Huỷ việc</button>');
  }
  if (isDirector()) {
    actions.insertAdjacentHTML('beforeend', '<span class="spacer"></span><button class="btn btn-danger" onclick="deleteTask()">Xóa việc</button>');
  }
  actions.insertAdjacentHTML('beforeend', '<button class="btn" onclick="closeOverlay()">Đóng</button>');
}

function toggleHist() {
  const body = document.getElementById('histBody');
  if (!body) return;
  const head = body.previousElementSibling;
  const closed = body.classList.contains('hidden');
  body.classList.toggle('hidden');
  head.textContent = (closed ? '▾' : '▸') + head.textContent.slice(1);
}

function showDoneForm() {
  const actions = document.getElementById('mActions');
  actions.innerHTML = `
    <div class="field" style="flex-basis:100%"><label>Báo cáo kết quả * (bắt buộc trước khi hoàn thành)</label>
    <textarea id="mResult" rows="3" placeholder="Nêu kết quả đã đạt được..."></textarea></div>
    <button class="btn btn-ok" onclick="submitDone()">Gửi báo cáo hoàn thành</button>
    <button class="btn" onclick="renderTaskModal()">Hủy</button>`;
}

async function submitDone() {
  const result = document.getElementById('mResult').value.trim();
  if (!result) return toast('Phải nhập kết quả trước khi hoàn thành.', 'error');
  try {
    await api('POST', `/api/tasks/${modalTaskId}/done`, { result });
    toast('Đã gửi báo cáo, chờ Giám đốc duyệt.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

function editAssignee() {
  if (!isDirector()) return;
  const task = BoardState.tasks.find(t => t.id === modalTaskId);
  if (!task) return;
  const box = document.getElementById('mAssigneeTxt');
  const oldId = task.assignee_id;
  box.innerHTML = `<select id="mAssigneeEdit" class="journal-edit">${assigneeOptions(oldId)}</select>`;
  const sel = document.getElementById('mAssigneeEdit');
  sel.focus();
  sel.addEventListener('change', async () => {
    const v = Number(sel.value);
    if (v && v !== oldId) {
      try {
        await api('PATCH', `/api/tasks/${modalTaskId}`, { assignee_id: v });
        toast('Đã đổi người phụ trách.', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    }
    await loadBoard();
    renderTaskModal();
  });
  sel.addEventListener('keydown', ev => { if (ev.key === 'Escape') renderTaskModal(); });
}

function editTitle() {
  const task = BoardState.tasks.find(t => t.id === modalTaskId);
  if (!task) return;
  const canEditFields = (isDirector() || task.assignee_id === Number(actorId())) && (isDirector() || task.status === 'open');
  if (!canEditFields) return;
  const span = document.getElementById('mTitleSpan');
  const old = task.title;
  span.innerHTML = `<input type="text" id="mTitleEdit" class="journal-edit" style="font-weight:700" value="${escapeHtml(old)}">`;
  const input = document.getElementById('mTitleEdit');
  input.focus();
  input.select();
  let done = false;
  const finish = async save => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (save && v && v !== old) {
      try {
        await api('PATCH', `/api/tasks/${modalTaskId}`, { title: v });
        toast('Đã lưu tên.', 'ok');
      } catch (e) { toast(e.message, 'error'); }
    }
    await loadBoard();
    renderTaskModal();
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') finish(true);
    if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function editDesc() {
  const task = BoardState.tasks.find(t => t.id === modalTaskId);
  if (!task) return;
  const canEditFields = (isDirector() || task.assignee_id === Number(actorId())) && (isDirector() || task.status === 'open');
  if (!canEditFields) return;
  const box = document.getElementById('mDescTxt');
  const old = task.description || '';
  box.innerHTML = `<textarea id="mDescEdit" rows="3" class="journal-edit">${escapeHtml(old)}</textarea>
    <div class="jmeta" style="margin-top:4px">
      <button class="btn btn-sm btn-ok" onclick="saveDesc(${modalTaskId})">Lưu</button>
      <button class="btn btn-sm" onclick="renderTaskModal()">Hủy</button>
    </div>`;
  document.getElementById('mDescEdit').focus();
}

async function saveDesc(taskId) {
  const v = document.getElementById('mDescEdit').value.trim();
  try {
    await api('PATCH', `/api/tasks/${taskId}`, { description: v });
    toast('Đã lưu mô tả.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function submitJournal() {
  const note = document.getElementById('mJournal').value.trim();
  if (!note) return toast('Nhập nội dung nhật ký.', 'error');
  try {
    const r = await api('POST', `/api/tasks/${modalTaskId}/journal`, { note });
    toast(r.updated ? 'Đã cập nhật nhật ký.' : 'Đã ghi nhật ký.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

function editJournal(id) {
  const j = BoardState.journals.find(x => x.id === id);
  const box = document.getElementById('ji-' + id);
  if (!j || !box) return;
  box.innerHTML = `
    <textarea id="je-${id}" rows="2" class="journal-edit">${escapeHtml(j.note)}</textarea>
    <div class="jmeta" style="margin-top:4px">
      <button class="btn btn-sm btn-ok" onclick="saveJournal(${id}, '${j.week_start}')">Lưu</button>
      <button class="btn btn-sm" onclick="renderTaskModal()">Hủy</button>
    </div>`;
}

async function saveJournal(id, weekStart) {
  const note = document.getElementById('je-' + id).value.trim();
  if (!note) return toast('Nội dung nhật ký trống.', 'error');
  try {
    await api('POST', `/api/tasks/${modalTaskId}/journal`, { note, week_start: weekStart });
    toast('Đã cập nhật nhật ký.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function approveTask() {
  try {
    await api('POST', `/api/tasks/${modalTaskId}/approve`);
    toast('Đã duyệt hoàn thành.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function reopenTask() {
  if (!confirm('Trả lại việc này để làm tiếp? Nó sẽ quay lại tuần hiện tại.')) return;
  try {
    await api('POST', `/api/tasks/${modalTaskId}/reopen`);
    toast('Đã trả lại.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function cancelTask() {
  const reason = prompt('Lý do huỷ (không bắt buộc):', '');
  if (reason === null) return;
  try {
    await api('POST', `/api/tasks/${modalTaskId}/cancel`, { reason });
    toast('Đã huỷ việc.', 'ok');
    await loadBoard();
    renderTaskModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTask() {
  if (!confirm('Xóa việc này? Toàn bộ nhật ký và lịch sử sẽ bị xóa.')) return;
  try {
    await api('DELETE', `/api/tasks/${modalTaskId}`);
    toast('Đã xóa việc.', 'ok');
    closeOverlay();
    await loadBoard();
  } catch (e) { toast(e.message, 'error'); }
}
