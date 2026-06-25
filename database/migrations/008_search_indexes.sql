-- Search performance indexes
CREATE INDEX IF NOT EXISTS idx_users_search_name ON users (lower(first_name), lower(last_name));
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_live_rooms_active ON live_rooms (status, room_type, viewer_count DESC);
CREATE INDEX IF NOT EXISTS idx_coin_seller_profiles_active ON coin_seller_profiles (is_active, inventory_coins DESC);
