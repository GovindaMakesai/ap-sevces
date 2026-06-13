const fs = require('fs');
const path = require('path');
const db = require('./database');

/**
 * Applies foundation migration SQL idempotently on startup.
 * Safe for existing deployments ΓÇö uses IF NOT EXISTS throughout.
 */
async function ensureFoundationSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') {
    console.log('ΓÅ¡∩╕Å  SKIP_DB_SCHEMA_ENSURE ΓÇö skipping foundation schema');
    return;
  }

  const usersOk = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
  `);
  if (!usersOk.rows.length) {
    console.warn('ΓÜá∩╕Å  users table missing ΓÇö run database/schema.sql first');
    return;
  }

  const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', '001_foundation.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await seedRolesAndPermissions(client);
    await client.query('COMMIT');
    console.log('Γ£à Foundation schema ready (wallets, live rooms, RBAC)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Γ¥î ensureFoundationSchema failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function seedRolesAndPermissions(client) {
  const roles = [
    ['customer', 'Customer', 'Marketplace customer'],
    ['worker', 'Worker', 'Service professional'],
    ['admin', 'Admin', 'Legacy admin ΓÇö maps to super_admin permissions'],
    ['founder', 'Founder', 'Platform founder'],
    ['ceo', 'CEO', 'Chief executive'],
    ['super_admin', 'Super Admin', 'Full platform control'],
    ['bdm', 'BDM', 'Business development manager'],
    ['agency', 'Agency', 'Agency operator'],
    ['creator', 'Creator', 'Live/video creator'],
    ['vip_user', 'VIP User', 'VIP tier user'],
    ['coin_seller', 'Coin Seller', 'Authorized coin seller'],
  ];

  for (const [slug, name, desc] of roles) {
    await client.query(
      `INSERT INTO roles (slug, name, description) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
      [slug, name, desc]
    );
  }

  const perms = [
    ['wallet.read', 'View own wallet balance and history'],
    ['wallet.recharge', 'Submit coin recharge requests'],
    ['wallet.withdraw', 'Request withdrawals'],
    ['wallet.gift', 'Send gifts'],
    ['live.host', 'Host live/party rooms'],
    ['live.join', 'Join live/party rooms'],
    ['admin.wallet', 'Admin wallet operations'],
    ['admin.withdrawals', 'Approve/reject withdrawals'],
    ['admin.recharges', 'Approve/reject recharges'],
    ['admin.users', 'Manage users'],
  ];

  for (const [slug, desc] of perms) {
    await client.query(
      `INSERT INTO permissions (slug, description) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description`,
      [slug, desc]
    );
  }

  const rolePermMap = {
    customer: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host'],
    worker: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host'],
    creator: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host'],
    admin: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host', 'admin.wallet', 'admin.withdrawals', 'admin.recharges', 'admin.users'],
    super_admin: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host', 'admin.wallet', 'admin.withdrawals', 'admin.recharges', 'admin.users'],
    founder: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host', 'admin.wallet', 'admin.withdrawals', 'admin.recharges', 'admin.users'],
    ceo: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'wallet.gift', 'live.join', 'live.host', 'admin.wallet', 'admin.withdrawals', 'admin.recharges', 'admin.users'],
    bdm: ['wallet.read', 'live.join'],
    agency: ['wallet.read', 'wallet.recharge', 'wallet.withdraw', 'live.join', 'live.host'],
    vip_user: ['wallet.read', 'wallet.recharge', 'wallet.gift', 'live.join', 'live.host'],
    coin_seller: ['wallet.read', 'wallet.recharge', 'admin.wallet'],
  };

  for (const [roleSlug, permSlugs] of Object.entries(rolePermMap)) {
    const roleRes = await client.query('SELECT id FROM roles WHERE slug = $1', [roleSlug]);
    if (!roleRes.rows.length) continue;
    const roleId = roleRes.rows[0].id;
    for (const permSlug of permSlugs) {
      const permRes = await client.query('SELECT id FROM permissions WHERE slug = $1', [permSlug]);
      if (!permRes.rows.length) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permRes.rows[0].id]
      );
    }
  }
}

module.exports = { ensureFoundationSchema };
