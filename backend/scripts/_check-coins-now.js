const { Pool } = require('pg');
const url =
  'postgresql://postgres.statttyarromzgqulrqp:Db%402026%21Supa_X9mK%237Q@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

(async () => {
  const emails = [
    'aparif786@gmail.com',
    'developergovinda00@gmail.com',
    'najmulhussain181@gmail.com',
    'developer.govinda00@gmail.com',
  ];
  for (const email of emails) {
    const r = await p.query(
      `SELECT u.id, u.email, u.phone, u.is_active, w.coin_balance, w.star_balance
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.email = $1`,
      [email]
    );
    console.log(email, r.rows[0] || 'NOT FOUND');
  }
  const dup = await p.query(
    `SELECT u.id, u.email, u.phone, w.coin_balance
     FROM users u LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.email ILIKE '%aparif%' OR u.phone = '9507523269'
     ORDER BY u.email`
  );
  console.log('\nAll aparif/phone matches:', dup.rows);
  await p.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
