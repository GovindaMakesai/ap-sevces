-- Timed room bans (NULL expires_at = permanent for that room)
ALTER TABLE live_room_bans
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_room_bans_room_user
  ON live_room_bans (live_room_id, user_id);
