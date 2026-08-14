const db = require('./database');

async function tableExists(name) {
  const res = await db.query(
    `
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1 LIMIT 1
  `,
    [name]
  );
  return res.rows.length > 0;
}

async function runSafe(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/already exists|duplicate/i.test(msg)) return;
    throw err;
  }
}

async function createCpTables() {
  await runSafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await runSafe(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS user_cp_support (
      user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      points BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_a, user_b),
      CHECK (user_a < user_b)
    )
  `);
  await runSafe(
    `CREATE INDEX IF NOT EXISTS idx_user_cp_support_points ON user_cp_support (points DESC)`
  );

  await runSafe(`
    CREATE TABLE IF NOT EXISTS cp_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ring_id VARCHAR(48) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      UNIQUE (user_a, user_b),
      CHECK (user_a < user_b)
    )
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_cp_relationships_user_a
      ON cp_relationships (user_a) WHERE status = 'active'
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_cp_relationships_user_b
      ON cp_relationships (user_b) WHERE status = 'active'
  `);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS cp_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ring_id VARCHAR(48) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMPTZ
    )
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_cp_invitations_to_pending
      ON cp_invitations (to_user_id, status) WHERE status = 'pending'
  `);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS cp_user_rings (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ring_id VARCHAR(48) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, ring_id)
    )
  `);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS cp_invite_cooldowns (
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      until_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (from_user_id, to_user_id)
    )
  `);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS cp_action_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(24) NOT NULL,
      new_ring_id VARCHAR(48),
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMPTZ,
      CHECK (type IN ('break', 'ring_change'))
    )
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_cp_action_requests_to_pending
      ON cp_action_requests (to_user_id, status) WHERE status = 'pending'
  `);
}

/**
 * Idempotent CP schema — always safe to run on boot/deploy.
 */
async function ensureCpSchema() {
  try {
    const usersOk = await db.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
    `);
    if (!usersOk.rows.length) return false;

    if (!(await tableExists('user_cp_support'))) {
      await createCpTables();
    } else if (!(await tableExists('cp_action_requests'))) {
      await createCpTables();
    }
    return await tableExists('user_cp_support');
  } catch (err) {
    console.error('❌ ensureCpSchema failed:', err.message);
    return false;
  }
}

module.exports = { ensureCpSchema, tableExists };
