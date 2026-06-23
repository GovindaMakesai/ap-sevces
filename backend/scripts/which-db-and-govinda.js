const { Pool } = require('pg');

const EMAILS = ['developer.govinda00@gmail.com', 'developergovinda00@gmail.com'];

const dbs = {
  NEW_client: process.env.NEW_URL,
  OLD_dev: process.env.OLD_URL,
};

const ssl = { rejectUnauthorized: false };

async function checkDb(label, url) {
  const pool = new Pool({ connectionString: url, ssl });
  try {
    const ref = url.match(/postgres\.([^:@]+)/)?.[1] || 'direct';
    const govinda = await pool.query(
      `SELECT email, phone, is_active, coin_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE email ILIKE '%govinda%' OR email ILIKE '%developer.govinda%'
       ORDER BY email`
    );
    const dev = await pool.query(
      `SELECT u.email, u.is_active, w.coin_balance
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.email = ANY($1)`,
      [EMAILS]
    );
    return { label, project_ref: ref, govinda_accounts: govinda.rows, exact_dev: dev.rows };
  } finally {
    await pool.end();
  }
}

async function main() {
  const localEnv = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
  const localMatch = localEnv.match(/DATABASE_URL=(.+)/);
  const localUrl = localMatch?.[1]?.trim();
  const localRef = localUrl?.match(/postgres\.([^:@]+)/)?.[1] || '?';

  console.log('=== LOCAL backend/.env ===');
  console.log('Uses:', localRef.includes('statttyarromzgqulrqp') ? 'NEW client DB' : localRef.includes('gglaxjbqygwzqcsimtmh') ? 'OLD dev DB' : localRef);

  for (const [label, url] of Object.entries(dbs)) {
    if (!url) continue;
    console.log('\n===', label, '===');
    console.log(JSON.stringify(await checkDb(label, url), null, 2));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
