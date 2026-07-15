-- Room-wide chat lock (mute all chat except host/admins)
ALTER TABLE live_rooms
  ADD COLUMN IF NOT EXISTS is_chat_locked BOOLEAN NOT NULL DEFAULT FALSE;
