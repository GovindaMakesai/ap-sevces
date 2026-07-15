-- Live chat moderation: mute chat without kicking; soft-delete messages via payload.deleted
ALTER TABLE live_room_members
  ADD COLUMN IF NOT EXISTS is_chat_muted BOOLEAN NOT NULL DEFAULT FALSE;
