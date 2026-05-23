const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensurePhase2Schema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const usersOk = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
  `);
  if (!usersOk.rows.length) {
    console.warn('⚠️  users table missing — run database/schema.sql first');
    return;
  }

  const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', '002_phase2_core.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await seedPhase2Data(client);
    await client.query('COMMIT');
    console.log('✅ Phase 2 schema ready (agency, PK, leaderboards, VIP, payments)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ensurePhase2Schema failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function seedPhase2Data(client) {
  const vipLevels = [
    [1, 'Bronze VIP', 500, '["badge"]'],
    [2, 'Silver VIP', 2000, '["badge","vip_rooms"]'],
    [3, 'Gold VIP', 10000, '["badge","vip_rooms","vip_contests"]'],
    [4, 'Platinum VIP', 50000, '["badge","vip_rooms","vip_contests","priority_support"]'],
  ];
  for (const [level, name, minInr, perks] of vipLevels) {
    await client.query(
      `INSERT INTO vip_levels (level, name, min_recharge_inr, perks)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (level) DO UPDATE SET name = EXCLUDED.name, min_recharge_inr = EXCLUDED.min_recharge_inr`,
      [level, name, minInr, perks]
    );
  }

  const rewardRules = [
    ['hourly_active', 'Hourly active creator', 'hourly', 10, '{"min_live_minutes": 55}', 3600],
    ['quarter_hour', '15-min activity', 'quarter_hour', 5, '{"min_actions": 3}', 900],
    ['onboarding_day7', '7-day onboarding', 'onboarding', 100, '{"days_since_join": 7}', 0],
    ['milestone_1k_gifts', '1K gift coins received', 'milestone', 50, '{"gift_coins_total": 1000}', 0],
  ];
  for (const [slug, name, ruleType, coins, criteria, cooldown] of rewardRules) {
    await client.query(
      `INSERT INTO reward_rules (slug, name, rule_type, reward_coins, criteria, cooldown_seconds)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (slug) DO UPDATE SET reward_coins = EXCLUDED.reward_coins`,
      [slug, name, ruleType, coins, criteria, cooldown]
    );
  }

  await client.query(
    `INSERT INTO platform_settings (key, value) VALUES
      ('commission', '{"levels": [12, 16, 20], "upgrade_threshold_inr": 50000, "downgrade_threshold_inr": 20000}'::jsonb),
      ('charity', '{"default_donation_pct": 1.0}'::jsonb),
      ('pk', '{"default_duration_seconds": 300, "winner_reward_pct": 5}'::jsonb)
     ON CONFLICT (key) DO NOTHING`
  );

  const perms = [
    ['agency.manage', 'Manage own agency'],
    ['agency.read', 'View agency analytics'],
    ['admin.agencies', 'Admin agency management'],
    ['admin.contests', 'Admin contest management'],
    ['admin.vip', 'Admin VIP management'],
    ['admin.charity', 'Admin charity management'],
    ['admin.fraud', 'Review fraud flags'],
    ['admin.verification', 'Review creator verifications'],
    ['pk.host', 'Start PK battles'],
    ['contest.join', 'Join contests'],
  ];
  for (const [slug, desc] of perms) {
    await client.query(
      `INSERT INTO permissions (slug, description) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description`,
      [slug, desc]
    );
  }

  const adminRoles = ['admin', 'super_admin', 'founder', 'ceo'];
  const adminPerms = [
    'admin.agencies', 'admin.contests', 'admin.vip', 'admin.charity',
    'admin.fraud', 'admin.verification',
  ];
  for (const roleSlug of adminRoles) {
    const roleRes = await client.query('SELECT id FROM roles WHERE slug = $1', [roleSlug]);
    if (!roleRes.rows.length) continue;
    for (const permSlug of adminPerms) {
      const permRes = await client.query('SELECT id FROM permissions WHERE slug = $1', [permSlug]);
      if (!permRes.rows.length) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleRes.rows[0].id, permRes.rows[0].id]
      );
    }
  }

  for (const roleSlug of ['agency', 'creator', 'worker']) {
    const roleRes = await client.query('SELECT id FROM roles WHERE slug = $1', [roleSlug]);
    if (!roleRes.rows.length) continue;
    const perms = roleSlug === 'agency'
      ? ['agency.read', 'agency.manage', 'pk.host', 'contest.join']
      : ['agency.read', 'pk.host', 'contest.join'];
    for (const permSlug of perms) {
      const permRes = await client.query('SELECT id FROM permissions WHERE slug = $1', [permSlug]);
      if (!permRes.rows.length) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleRes.rows[0].id, permRes.rows[0].id]
      );
    }
  }

  await client.query(
    `INSERT INTO charity_campaigns (slug, title, description, goal_amount_inr, status)
     VALUES ('default-fund', 'AP Services Community Fund', 'Platform charity pool from gift donations', 1000000, 'active')
     ON CONFLICT (slug) DO NOTHING`
  );
}

module.exports = { ensurePhase2Schema };
