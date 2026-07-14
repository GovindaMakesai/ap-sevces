-- Dual seller coin pools:
--   inventory_coins      = sell stock (transfer / give to users)
--   gift_inventory_coins = gift stock (send gifts in live/chat)

ALTER TABLE coin_seller_profiles
  ADD COLUMN IF NOT EXISTS gift_inventory_coins BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coin_seller_profiles_gift_inventory_nonneg'
  ) THEN
    ALTER TABLE coin_seller_profiles
      ADD CONSTRAINT coin_seller_profiles_gift_inventory_nonneg
      CHECK (gift_inventory_coins >= 0);
  END IF;
END $$;

COMMENT ON COLUMN coin_seller_profiles.inventory_coins IS 'Sell stock — transfer/give coins to users';
COMMENT ON COLUMN coin_seller_profiles.gift_inventory_coins IS 'Gift stock — spend on gifts to users';
