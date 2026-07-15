#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

(async () => {
  const sqlPath = path.join(__dirname, '../../database/migrations/019_live_chat_lock.sql');
  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  const r = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'live_rooms' AND column_name = 'is_chat_locked'`
  );
  console.log(JSON.stringify({ ok: true, columns: r.rows }));
  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
