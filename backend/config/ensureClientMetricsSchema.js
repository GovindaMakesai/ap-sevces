const db = require('./database');

let ready = false;

async function ensureClientMetricsSchema() {
  if (ready) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS client_metrics (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID,
      event_name VARCHAR(64) NOT NULL,
      value DOUBLE PRECISION,
      meta JSONB DEFAULT '{}'::jsonb,
      path TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_metrics_name_created
      ON client_metrics (event_name, created_at DESC)
  `);
  ready = true;
}

module.exports = { ensureClientMetricsSchema };
