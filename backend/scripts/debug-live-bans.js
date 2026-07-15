#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

(async () => {
  const cols = await db.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'live_room_bans' ORDER BY ordinal_position`
  );
  console.log('COLS', JSON.stringify(cols.rows));
  const bans = await db.query(
    `SELECT id, live_room_id, user_id::text, reason, expires_at, created_at
     FROM live_room_bans ORDER BY created_at DESC LIMIT 15`
  );
  console.log('BANS', JSON.stringify(bans.rows, null, 2));
  const rooms = await db.query(
    `SELECT id, channel, room_type, status FROM live_rooms
     WHERE status = 'active' ORDER BY updated_at DESC LIMIT 8`
  );
  console.log('ACTIVE', JSON.stringify(rooms.rows, null, 2));
  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
