/**
 * Ops: inspect push tokens + optionally send a test FCM.
 *   node backend/scripts/test-push.js
 *   node backend/scripts/test-push.js --send --email=you@example.com
 *   node backend/scripts/test-push.js --send --display-id=1234567
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const db = require('../config/database');
const push = require('../services/pushNotificationService');

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function resolveUser() {
  const displayId = arg('display-id');
  const email = arg('email');
  const userId = arg('user-id');
  if (userId) {
    const r = await db.query(
      `SELECT id, display_id, email, first_name, last_name, is_active FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows[0] || null;
  }
  if (displayId) {
    const r = await db.query(
      `SELECT id, display_id, email, first_name, last_name, is_active FROM users WHERE display_id::text = $1`,
      [String(displayId)]
    );
    return r.rows[0] || null;
  }
  if (email) {
    const r = await db.query(
      `SELECT id, display_id, email, first_name, last_name, is_active FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
    return r.rows[0] || null;
  }
  return null;
}

async function main() {
  console.log('FCM configured:', push.isFcmConfigured());
  const count = await db.query('SELECT count(*)::int AS n FROM user_push_tokens');
  console.log('user_push_tokens count:', count.rows[0].n);
  const recent = await db.query(
    `SELECT u.display_id, u.email, u.first_name, t.platform,
            left(t.device_token, 20) AS token_prefix, t.updated_at
     FROM user_push_tokens t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.updated_at DESC LIMIT 15`
  );
  console.log('recent tokens:', JSON.stringify(recent.rows, null, 2));

  if (!hasFlag('send')) {
    console.log('\nDry run only. To send: --send --display-id=… or --send --email=…');
    return;
  }
  const user = await resolveUser();
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  console.log('target:', user);
  const result = await push.sendToUser(user.id, {
    title: 'AP Live test',
    body: 'Push notifications are working ✅',
    type: 'test',
    data: { type: 'test', deep_link: 'aplive://explore' },
  });
  console.log('send result:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
