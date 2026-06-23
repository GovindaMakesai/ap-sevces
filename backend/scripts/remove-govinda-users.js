const db = require('../config/database');

const KEEP_EMAIL = 'aparif786@gmail.com';

async function main() {
  const targets = await db.query(
    `SELECT id, email, phone, first_name, last_name, is_active
     FROM users
     WHERE email <> $1
       AND (
         email ILIKE '%govinda%'
         OR email ILIKE '%developer.govinda%'
         OR email ILIKE '%developerprofessional%'
         OR email ILIKE '%developercustomer%'
         OR email LIKE 'transferred_%@inactive.local'
         OR (first_name ILIKE '%govinda%' AND last_name ILIKE '%yadav%')
         OR email ILIKE '%GovindaMakesai%'
       )`,
    [KEEP_EMAIL]
  );

  if (!targets.rows.length) {
    console.log('No Govinda/developer accounts to remove.');
    await db.pool.end();
    return;
  }

  const client = await db.pool.connect();
  const removed = [];

  try {
    await client.query('BEGIN');

    for (const user of targets.rows) {
      const newEmail = `removed_${user.id}@inactive.local`;
      const newPhone = `9${String(user.id).replace(/-/g, '').slice(-9)}`;

      await client.query(
        `UPDATE users
         SET is_active = false,
             email = $2,
             phone = $3,
             provider = NULL,
             provider_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id, newEmail, newPhone]
      );

      removed.push({ was: user.email, now: newEmail, phone_was: user.phone });
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ removed_count: removed.length, removed }, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
