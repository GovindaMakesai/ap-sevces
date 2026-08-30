const db = require('./database');

async function ensureLuckyBoxSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lucky_boxes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_request_id VARCHAR(80),
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      live_room_id UUID,
      channel VARCHAR(64) NOT NULL,
      host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      mode VARCHAR(16) NOT NULL CHECK (mode IN ('even', 'lucky')),
      claim_method VARCHAR(16) NOT NULL CHECK (claim_method IN ('grab', 'random')),
      participate VARCHAR(16) NOT NULL DEFAULT 'all',
      unit_coins INTEGER NOT NULL CHECK (unit_coins > 0),
      winner_count INTEGER NOT NULL CHECK (winner_count > 0 AND winner_count <= 200),
      total_cost BIGINT NOT NULL CHECK (total_cost > 0),
      remaining_count INTEGER NOT NULL,
      remaining_coins BIGINT NOT NULL,
      prizes JSONB NOT NULL DEFAULT '[]'::jsonb,
      duration_sec INTEGER NOT NULL,
      opens_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'countdown',
      sender_name VARCHAR(64),
      sender_pic TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_lucky_box_sender_req
      ON lucky_boxes (sender_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND client_request_id <> ''
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lucky_boxes_channel_status
      ON lucky_boxes (channel, status, opens_at)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lucky_box_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      box_id UUID NOT NULL REFERENCES lucky_boxes(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prize BIGINT NOT NULL CHECK (prize >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (box_id, user_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lucky_box_claims_user
      ON lucky_box_claims (user_id, created_at DESC)
  `);
}

module.exports = { ensureLuckyBoxSchema };
