const db = require('./database');

async function runSafe(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/already exists|duplicate/i.test(msg)) return;
    throw err;
  }
}

async function ensureMatchCallSchema() {
  await runSafe(`
    CREATE TABLE IF NOT EXISTS match_calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mode VARCHAR(8) NOT NULL,
      channel VARCHAR(64) NOT NULL UNIQUE,
      user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL DEFAULT 'matched',
      connected_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      end_reason VARCHAR(48),
      minutes_billed INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (mode IN ('voice', 'video')),
      CHECK (status IN ('matched', 'connecting', 'connected', 'ended', 'cancelled', 'failed')),
      CHECK (user_a <> user_b)
    )
  `);
  await runSafe(`CREATE INDEX IF NOT EXISTS idx_match_calls_user_a ON match_calls (user_a, status)`);
  await runSafe(`CREATE INDEX IF NOT EXISTS idx_match_calls_user_b ON match_calls (user_b, status)`);
  await runSafe(`CREATE INDEX IF NOT EXISTS idx_match_calls_status ON match_calls (status) WHERE status IN ('matched', 'connecting', 'connected')`);

  await runSafe(`
    CREATE TABLE IF NOT EXISTS match_call_charges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL REFERENCES match_calls(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      minute_index INT NOT NULL,
      amount BIGINT NOT NULL,
      wallet_tx_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (match_id, user_id, minute_index)
    )
  `);
  await runSafe(`CREATE INDEX IF NOT EXISTS idx_match_call_charges_user ON match_call_charges (user_id, created_at DESC)`);
}

module.exports = { ensureMatchCallSchema };
