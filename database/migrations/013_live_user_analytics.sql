-- Per-user live/party watch time and activity aggregates
ALTER TABLE live_room_members
  ADD COLUMN IF NOT EXISTS active_seconds INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS live_user_stat_daily (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  live_watch_seconds BIGINT NOT NULL DEFAULT 0,
  party_watch_seconds BIGINT NOT NULL DEFAULT 0,
  live_host_seconds BIGINT NOT NULL DEFAULT 0,
  party_host_seconds BIGINT NOT NULL DEFAULT 0,
  gifts_sent_coins BIGINT NOT NULL DEFAULT 0,
  gifts_received_coins BIGINT NOT NULL DEFAULT 0,
  rooms_joined INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_live_user_stat_daily_user_date
  ON live_user_stat_daily (user_id, stat_date DESC);
