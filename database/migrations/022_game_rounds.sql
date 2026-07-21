-- Server-authoritative game rounds (Phase 2)

CREATE TABLE IF NOT EXISTS game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_slug VARCHAR(64) NOT NULL,
  bet_amount BIGINT NOT NULL CHECK (bet_amount > 0),
  payout_amount BIGINT NOT NULL DEFAULT 0 CHECK (payout_amount >= 0),
  outcome VARCHAR(24) NOT NULL DEFAULT 'loss',
  pick JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  debit_tx_id UUID,
  credit_tx_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created
  ON game_rounds (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_rounds_slug_created
  ON game_rounds (game_slug, created_at DESC);
