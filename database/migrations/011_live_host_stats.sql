-- Live host broadcast duration tracking
ALTER TABLE live_rooms
  ADD COLUMN IF NOT EXISTS broadcast_seconds INT NOT NULL DEFAULT 0;

ALTER TABLE live_rooms
  ADD COLUMN IF NOT EXISTS peak_viewer_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS live_host_stat_daily (
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  live_seconds BIGINT NOT NULL DEFAULT 0,
  party_seconds BIGINT NOT NULL DEFAULT 0,
  gift_coins BIGINT NOT NULL DEFAULT 0,
  peak_viewers INT NOT NULL DEFAULT 0,
  session_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (host_user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_live_host_stat_daily_user_date
  ON live_host_stat_daily (host_user_id, stat_date DESC);
