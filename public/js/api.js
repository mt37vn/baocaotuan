let me = null; // { id, name, role, username } của user đã đăng nhập (session) hoặc null

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  let resp;
  try {
    resp = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('Không kết nối được máy chủ.');
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* noop */ }
  if (!resp.ok) {
    const err = new Error((data && data.error) || `Lỗi ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function refreshMe() {
  me = (await api('GET', '/api/auth/me')).user;
  return me;
}

function isDirector() { return !!(me && me.role === 'director'); }
function actorId() { return me ? me.id : null; }

function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast hidden'; }, 3500);
}

function fmtDate(dt) {
  if (!dt) return '';
  const d = new Date(dt.replace(' ', 'T'));
  if (isNaN(d)) return dt;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
