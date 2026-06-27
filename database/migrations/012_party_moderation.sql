-- Party moderation: admins, seat assignment, room lock, activity rewards
ALTER TABLE live_rooms
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE live_rooms
  ADD COLUMN IF NOT EXISTS lock_password VARCHAR(64);

ALTER TABLE live_room_members
  ADD COLUMN IF NOT EXISTS seat_index INT;

ALTER TABLE live_room_members DROP CONSTRAINT IF EXISTS live_room_members_role_check;
ALTER TABLE live_room_members ADD CONSTRAINT live_room_members_role_check
  CHECK (role IN ('host', 'admin', 'speaker', 'viewer'));

CREATE TABLE IF NOT EXISTS party_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_room_id UUID REFERENCES live_rooms(id) ON DELETE SET NULL,
  activity_type VARCHAR(40) NOT NULL,
  coins_awarded INT NOT NULL DEFAULT 0,
  xp_awarded INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_party_activity_user_day
  ON party_activity_log (user_id, created_at DESC);
