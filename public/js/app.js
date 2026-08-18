async function init() {
  renderLegend();
  await refreshMe();
  document.getElementById('reportMonth').value = currentMonthStr();
  try {
    const sys = await api('GET', '/api/system');
    window.IS_LOCAL = !!sys.local;
  } catch (e) { window.IS_LOCAL = false; }
  applyAuthUI();

  document.getElementById('btnLogin').addEventListener('click', showLoginModal);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnChangePass').addEventListener('click', showChangePassModal);
  document.getElementById('btnSync').addEventListener('click', syncFromServer);
  document.getElementById('btnPush').addEventListener('click', pushToServer);

  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.getElementById('btnPrev').addEventListener('click', () => shiftWindow(-1));
  document.getElementById('btnNext').addEventListener('click', () => shiftWindow(1));
  document.getElementById('btnToday').addEventListener('click', resetWindow);
  document.getElementById('btnWPrev').addEventListener('click', () => shiftWindow(-1));
  document.getElementById('btnWNext').addEventListener('click', () => shiftWindow(1));
  document.getElementById('btnWToday').addEventListener('click', resetWindow);
  document.getElementById('btnAddTask').addEventListener('click', openTaskCreateModal);
  document.getElementById('btnReportLoad').addEventListener('click', loadReport);
  document.getElementById('btnAddEmp').addEventListener('click', addEmployee);

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && !isLoginRequired()) closeOverlay();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !isLoginRequired()) closeOverlay(); });

  BoardState.week = todayMonday();
  if (!me) {
    showLoginModal();
  } else {
    switchView('board');
  }
}

function applyAuthUI() {
  const uname = document.getElementById('userName');
  if (me) {
    const roleTag = me.role === 'director' ? (me.name === 'Giám đốc' ? '' : ' (Giám đốc)') : ' (Nhân viên)';
    uname.textContent = '👤 ' + me.name + roleTag;
    uname.classList.remove('hidden');
    document.getElementById('btnLogin').classList.add('hidden');
    document.getElementById('btnLogout').classList.remove('hidden');
    document.getElementById('btnChangePass').classList.remove('hidden');
    document.getElementById('navEmployees').classList.toggle('hidden', !isDirector());
    document.getElementById('btnExportWeek').classList.toggle('hidden', !isDirector());
    document.getElementById('btnExportMonthly').classList.toggle('hidden', !isDirector());
    document.getElementById('btnSync').classList.toggle('hidden', !(window.IS_LOCAL && isDirector()));
    document.getElementById('btnPush').classList.toggle('hidden', !(window.IS_LOCAL && isDirector()));
  } else {
    uname.classList.add('hidden');
    document.getElementById('btnLogin').classList.remove('hidden');
    document.getElementById('btnLogout').classList.add('hidden');
    document.getElementById('btnChangePass').classList.add('hidden');
    document.getElementById('navEmployees').classList.add('hidden');
    document.getElementById('btnExportWeek').classList.add('hidden');
    document.getElementById('btnExportMonthly').classList.add('hidden');
    document.getElementById('btnSync').classList.add('hidden');
    document.getElementById('btnPush').classList.add('hidden');
  }
  updateBanner();
}

async function pushToServer() {
  if (!confirm('Đẩy toàn bộ dữ liệu local lên server?')) return;
  const btn = document.getElementById('btnPush');
  btn.disabled = true;
  btn.textContent = '⬆️ Đang push...';
  try {
    const r = await api('POST', '/api/push');
    toast(r.message || 'Đã push.', 'ok');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬆️ Push lên server';
  }
}

async function syncFromServer() {
  const btn = document.getElementById('btnSync');
  btn.disabled = true;
  btn.textContent = '🔄 Đang đồng bộ...';
  try {
    const r = await api('POST', '/api/sync');
    toast(r.message || 'Đã đồng bộ.', 'ok');
    await loadBoard();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Đồng bộ';
  }
}

function updateBanner() {
  const banner = document.getElementById('boardWrap').previousElementSibling;
  if (banner && banner.classList.contains('banner')) banner.remove();
  if (!me) {
    document.getElementById('boardWrap').insertAdjacentHTML('beforebegin',
      '<div class="banner">🔒 Đăng nhập để tạo việc, ghi nhật ký và báo cáo.</div>');
  }
}

function isLoginRequired() { return !me; }

function showLoginModal() {
  openOverlay(`
    <h3>Đăng nhập</h3>
    <div class="field"><label>Tài khoản</label><input type="text" id="lUser" autocomplete="username"></div>
    <div class="field"><label>Mật khẩu</label><input type="password" id="lPass" autocomplete="current-password"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="doLogin()">Đăng nhập</button>
    </div>`);
  document.getElementById('lUser').focus();
}

async function doLogin() {
  try {
    await api('POST', '/api/auth/login', {
      username: document.getElementById('lUser').value.trim(),
      password: document.getElementById('lPass').value,
    });
    await refreshMe();
    applyAuthUI();
    closeOverlay();
    toast('Đã đăng nhập.', 'ok');
    await loadBoard();
  } catch (e) { toast(e.message, 'error'); }
}

async function logout() {
  await api('POST', '/api/auth/logout');
  me = null;
  applyAuthUI();
  showLoginModal();
}

function showChangePassModal() {
  openOverlay(`
    <h3>Đổi mật khẩu</h3>
    <div class="field"><label>Mật khẩu hiện tại</label><input type="password" id="cpCur" autocomplete="current-password"></div>
    <div class="field"><label>Mật khẩu mới (tối thiểu 6 ký tự)</label><input type="password" id="cpNew" autocomplete="new-password"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeOverlay()">Hủy</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" onclick="doChangePass()">Đổi mật khẩu</button>
    </div>`);
}

async function doChangePass() {
  try {
    await api('POST', '/api/auth/change-password', {
      current: document.getElementById('cpCur').value,
      next: document.getElementById('cpNew').value,
    });
    closeOverlay();
    toast('Đã đổi mật khẩu.', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function shiftWindow(n) {
  BoardState.week = addWeeks(BoardState.week, n);
  await loadBoard();
  if (!document.getElementById('view-weekly').classList.contains('hidden')) renderWeeklyReport();
}

async function resetWindow() {
  BoardState.week = todayMonday();
  await loadBoard();
  if (!document.getElementById('view-weekly').classList.contains('hidden')) renderWeeklyReport();
}

// ---- Quản lý nhân viên ----
async function renderEmployees() {
  const emps = await api('GET', '/api/employees');
  const counts = new Map();
  const data = await api('GET', '/api/board?from=' + addWeeks(todayMonday(), -4) + '&to=' + todayMonday());
  for (const t of data.tasks) counts.set(t.assignee_id, (counts.get(t.assignee_id) || 0) + 1);
  document.getElementById('empList').innerHTML = emps.map(e => `
    <div class="emp-row">
      <span class="emp-name">${escapeHtml(e.name)}${e.active ? '' : ' <span style="color:var(--muted)">(đã khóa)</span>'}</span>
      <span class="emp-count">${e.has_account ? 'Tài khoản: ' + escapeHtml(e.username) : 'Chưa có tài khoản'} · ${counts.get(e.id) || 0} việc trong bảng</span>
      <button class="btn btn-sm" onclick="showRenameModal(${e.id}, '${escapeHtml(e.name)}', '${escapeHtml(e.username || '')}')">Đổi tên</button>
      <button class="btn btn-sm" onclick="showAccountModal(${e.id}, ${e.has_account ? 1 : 0})">${e.has_account ? 'Đặt lại mật khẩu' : 'Tạo tài khoản'}</button>
      <button class="btn btn-sm" onclick="toggleEmployee(${e.id}, ${e.active ? 0 : 1})">${e.active ? 'Khóa' : 'Mở khóa'}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id})">Xóa</button>
    </div>`).join('') || '<div style="color:var(--muted)">Chưa có nhân viên.</div>';
}

async function addEmployee() {
  const name = document.getElementById('newEmpName').value.trim();
  if (!name) return toast('Nhập tên nhân viên.', 'error');
  try {
    await api('POST', '/api/employees', { name });
    document.getElementById('newEmpName').value = '';
    toast('Đã thêm nhân viên.', 'ok');
    await renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

function showRenameModal(id, name, username) {
  openOverlay(`
    <h3>Đổi tên nhân viên</h3>
    <div class="field"><label>Tên hiển thị</label><input type="text" id="rnName" value="${escapeHtml(name)}"></div>
    <div class="field"><label>Tên đăng nhập</label>
      <input type="text" id="rnUser" value="${escapeHtml(username || '')}" ${username ? '' : 'placeholder="Chưa có tài khoản — nhập để tạo"'} autocomplete="username">
      <div class="modal-sub">Để trống nếu chỉ đổi tên hiển thị.</div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeOverlay()">Hủy</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" onclick="saveRename(${id})">Lưu</button>
    </div>`);
  document.getElementById('rnName').focus();
}

async function saveRename(id) {
  const name = document.getElementById('rnName').value.trim();
  const username = document.getElementById('rnUser').value.trim();
  if (!name) return toast('Tên không được để trống.', 'error');
  const body = { name };
  if (username) body.username = username;
  try {
    await api('PATCH', `/api/employees/${id}`, body);
    closeOverlay();
    toast('Đã cập nhật.', 'ok');
    await renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

function showAccountModal(id, hasAccount) {
  openOverlay(`
    <h3>${hasAccount ? 'Đặt lại mật khẩu' : 'Tạo tài khoản'}</h3>
    <div class="field"><label>Username</label><input type="text" id="acUser" ${hasAccount ? 'placeholder="Bỏ trống để giữ nguyên"' : ''} autocomplete="username"></div>
    <div class="field"><label>Mật khẩu mới (tối thiểu 6 ký tự)</label><input type="password" id="acPass" autocomplete="new-password"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeOverlay()">Hủy</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" onclick="saveAccount(${id})">Lưu</button>
    </div>`);
}

async function saveAccount(id) {
  const username = document.getElementById('acUser').value.trim();
  const password = document.getElementById('acPass').value;
  const body = {};
  if (username) body.username = username;
  if (password) body.password = password;
  if (!body.username && !body.password) return toast('Nhập username hoặc mật khẩu.', 'error');
  try {
    await api('PATCH', `/api/employees/${id}`, body);
    closeOverlay();
    toast('Đã cập nhật tài khoản.', 'ok');
    await renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleEmployee(id, active) {
  try {
    await api('PATCH', `/api/employees/${id}`, { active: !!active });
    await renderEmployees();
    toast('Đã cập nhật.', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteEmployee(id) {
  if (!confirm('Xóa nhân viên này?')) return;
  try {
    await api('DELETE', `/api/employees/${id}`);
    await renderEmployees();
    toast('Đã xóa.', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', init);
