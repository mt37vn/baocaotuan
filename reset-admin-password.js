const bcrypt = require('bcryptjs');
const { db } = require('./src/db');

const admin = db.prepare("SELECT * FROM users WHERE role = 'director' LIMIT 1").get();
console.log('Admin user:', admin);

const newPassword = process.env.NEW_ADMIN_PASSWORD || process.argv[2];
if (!newPassword) {
  console.error('Usage: NEW_ADMIN_PASSWORD=<new-password> node reset-admin-password.js');
  process.exit(1);
}
const hash = bcrypt.hashSync(newPassword, 10);

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
console.log('Password reset for admin:', admin.username);