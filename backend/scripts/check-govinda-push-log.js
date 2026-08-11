require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

(async () => {
  const u = (
    await db.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [
      'developer.govinda00@gmail.com',
    ])
  ).rows[0];
  const logs = await db.query(
    `SELECT success, error_code, error_message, left(device_token, 24) AS pfx, created_at
     FROM push_delivery_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [u.id]
  );
  console.log(JSON.stringify(logs.rows, null, 2));
  const tokens = await db.query(
    `SELECT platform, left(device_token, 28) pfx, length(device_token) len, updated_at
     FROM user_push_tokens WHERE user_id=$1`,
    [u.id]
  );
  console.log('tokens now', JSON.stringify(tokens.rows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
