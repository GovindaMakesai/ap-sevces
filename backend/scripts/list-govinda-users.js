const db = require('../config/database');

async function main() {
  const users = await db.query(
    `SELECT id, email, phone, first_name, last_name, is_active, role
     FROM users
     WHERE email ILIKE '%govinda%'
        OR email ILIKE '%developer.govinda%'
        OR first_name ILIKE '%govinda%'
        OR last_name ILIKE '%govinda%'
        OR email LIKE 'transferred_%@inactive.local'
     ORDER BY created_at`
  );
  console.log(JSON.stringify({ count: users.rows.length, users: users.rows }, null, 2));
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
