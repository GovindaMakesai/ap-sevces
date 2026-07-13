#!/usr/bin/env node
/** Grant wallet gift/recharge/withdraw to BDM role (and optionally a user email). */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const PERMS = ['wallet.gift', 'wallet.recharge', 'wallet.withdraw', 'wallet.read', 'live.join', 'live.host'];

async function main() {
  const roleRes = await db.query(`SELECT id FROM roles WHERE slug = 'bdm'`);
  if (!roleRes.rows[0]) {
    console.error('bdm role missing');
    process.exit(1);
  }
  const roleId = roleRes.rows[0].id;
  for (const slug of PERMS) {
    await db.query(
      `INSERT INTO permissions (slug, description) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, slug]
    );
    const p = await db.query(`SELECT id FROM permissions WHERE slug = $1`, [slug]);
    if (!p.rows[0]) continue;
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roleId, p.rows[0].id]
    );
  }

  const check = await db.query(
    `SELECT p.slug FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN roles r ON r.id = rp.role_id
     WHERE r.slug = 'bdm'
     ORDER BY p.slug`
  );
  console.log(JSON.stringify({ success: true, bdm_permissions: check.rows.map((r) => r.slug) }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
