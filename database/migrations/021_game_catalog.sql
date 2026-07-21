-- Game catalog for live-room overlay games (Phase 1)

CREATE TABLE IF NOT EXISTS game_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  emoji VARCHAR(16) NOT NULL DEFAULT '🎮',
  html_path VARCHAR(256) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'casino',
  min_bet INTEGER NOT NULL DEFAULT 10 CHECK (min_bet > 0),
  max_bet INTEGER,
  house_edge_pct NUMERIC(5,2) DEFAULT 5.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_catalog_active
  ON game_catalog (is_active, sort_order);
