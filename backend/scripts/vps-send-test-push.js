require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const push = require('../services/pushNotificationService');
const db = require('../config/database');

(async () => {
  console.log('FCM_STATUS', JSON.stringify(push.getFcmStatus(), null, 2));
  const u = (
    await db.query(`SELECT id, display_id FROM users WHERE lower(email)=lower($1)`, [
      'developer.govinda00@gmail.com',
    ])
  ).rows[0];
  console.log('user', u);
  const result = await push.sendToUser(u.id, {
    title: 'AP Live test',
    body: 'Push notifications are working ✅',
    type: 'test',
    data: { type: 'test', deep_link: 'aplive://explore' },
  });
  console.log('SEND', result);
  const logs = await db.query(
    `SELECT success, error_code, left(coalesce(error_message,''), 160) err, created_at
     FROM push_delivery_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3`,
    [u.id]
  );
  console.log('LOGS', JSON.stringify(logs.rows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
