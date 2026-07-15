#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

(async () => {
  const r = await db.query(
    `DELETE FROM notifications WHERE type = ANY($1::text[]) RETURNING id`,
    [['chat_message', 'message', 'direct_message', 'dm']]
  );
  console.log(JSON.stringify({ deleted: r.rowCount }));
  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
