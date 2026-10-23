import { loadConfig } from '../src/config';
import { openDb, getUserByLogin, getUserById } from '../src/db';
import { log } from '../src/logger';

const config = loadConfig();
const db = openDb(config.dataDir);

const arg = process.argv[2];

if (!arg || arg === '--list') {
  const rows = db
    .prepare(
      `SELECT username, email, is_guest, email_verified
       FROM users WHERE email_verified = 0 AND is_guest = 0 ORDER BY created_at DESC`,
    )
    .all() as Array<{ username: string; email: string; email_verified: number }>;
  if (rows.length === 0) {
    console.log('No unverified accounts.');
  } else {
    console.log('Unverified accounts:');
    for (const row of rows) console.log(`  ${row.username} <${row.email}>`);
  }
  db.close();
  process.exit(0);
}

const user = getUserByLogin(db, arg);
if (!user) {
  log.error(`No account found for "${arg}".`);
  db.close();
  process.exit(1);
}

db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
db.prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ?').run(Date.now(), user.id);
const updated = getUserById(db, user.id);
console.log(`Verified ${updated?.username} <${updated?.email}>.`);
db.close();
