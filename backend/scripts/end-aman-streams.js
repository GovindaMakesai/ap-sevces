const db = require('../config/database');
const liveRoomService = require('../services/liveRoomService');

async function main() {
  const users = await db.query(
    `SELECT id, email, first_name, last_name FROM users
     WHERE email ILIKE 'customer1.test@apservices.com'
        OR email ILIKE 'aman%'
        OR (first_name ILIKE 'Aman')`
  );
  console.log('Matched users:', users.rows);

  const amanIds = users.rows.map((u) => String(u.id));
  if (!amanIds.length) {
    console.log('No Aman users found');
    await db.pool.end();
    return;
  }

  const active = await db.query(
    `SELECT channel, room_type, host_user_id, host_display_name, status
     FROM live_rooms
     WHERE status = 'active' AND host_user_id = ANY($1::uuid[])
     ORDER BY updated_at DESC`,
    [amanIds]
  );

  console.log(`Active Aman rooms: ${active.rows.length}`);
  const ended = [];
  for (const row of active.rows) {
    await liveRoomService.endRoom(row.channel, 'admin_closed_aman_streams');
    ended.push({ channel: row.channel, type: row.room_type, host: row.host_display_name });
    console.log('Ended', row.channel, row.room_type, row.host_display_name);
  }

  const remaining = await db.query(
    `SELECT COUNT(*)::int AS n FROM live_rooms
     WHERE status = 'active' AND host_user_id = ANY($1::uuid[])`,
    [amanIds]
  );

  console.log(JSON.stringify({ endedCount: ended.length, ended, remainingAmanActive: remaining.rows[0].n }, null, 2));
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
