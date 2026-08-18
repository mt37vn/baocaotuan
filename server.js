const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const session = require('express-session');
const { initWeekMarker, seedDirector } = require('./src/db');
const { weekRollover, ensureRollover } = require('./src/rollover');
const { router: authRouter, requireDirector } = require('./src/auth');
const { router: taskRouter } = require('./src/tasks');
const { router: reportRouter } = require('./src/report');
const { router: employeesRouter } = require('./src/employees');

const PORT = Number(process.env.PORT || 3000);
const IS_LOCAL = process.env.IS_LOCAL === '1' || process.env.NODE_ENV !== 'production';
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function sessionSecret() {
  const f = path.join(DATA_DIR, '.session_secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
}));

app.use('/api', weekRollover);
app.use('/api/auth', authRouter);
app.use('/api', taskRouter);
app.use('/api', reportRouter);
app.use('/api', employeesRouter);

app.get('/api/system', (req, res) => res.json({ local: IS_LOCAL }));

if (IS_LOCAL) {
  app.post('/api/sync', requireDirector, (req, res) => {
    const script = path.join(__dirname, 'scripts', 'sync-from-server.sh');
    execFile('/bin/bash', [script], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: (stderr || err.message).trim() || 'Đồng bộ thất bại.' });
      res.json({ ok: true, message: (stdout || 'Đồng bộ xong.').trim() });
    });
  });

  app.post('/api/push', requireDirector, (req, res) => {
    const script = path.join(__dirname, 'scripts', 'push-to-server.sh');
    execFile('/bin/bash', [script], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: (stderr || err.message).trim() || 'Push thất bại.' });
      res.json({ ok: true, message: (stdout || 'Push xong.').trim() });
    });
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ.' });
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'),
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initWeekMarker();
const seedMsg = seedDirector();
ensureRollover();

app.listen(PORT, () => {
  console.log(`Báo cáo tuần chạy tại http://localhost:${PORT}`);
  console.log(`Dữ liệu: ${path.join(DATA_DIR, 'app.db')}`);
  if (seedMsg) console.log(seedMsg);
});
