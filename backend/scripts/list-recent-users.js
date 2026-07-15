#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function main() {
  const r = await db.query(
    `SELECT email, first_name, last_name, role, display_id, created_at
     FROM users
     WHERE role NOT IN ('admin', 'super_admin', 'founder', 'ceo')
       AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY created_at DESC
     LIMIT 15`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
