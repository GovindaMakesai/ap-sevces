-- Virtual cosmetics marketplace: products, variants, user ownership

CREATE TABLE IF NOT EXISTS cosmetic_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  category VARCHAR(32) NOT NULL CHECK (
    category IN ('ENTRY_FRAME', 'CHAT_BUBBLE', 'PROFILE_TAG', 'ID_EFFECT', 'MIC_EFFECT', 'PROFILE_RING')
  ),
  thumbnail_url TEXT,
  animation_url TEXT,
  preview_url TEXT,
  asset_type VARCHAR(24) NOT NULL DEFAULT 'image',
  tag_label VARCHAR(48),
  css_class VARCHAR(96),
  metadata JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_products_category_status
  ON cosmetic_products (category, status, sort_order);

CREATE TABLE IF NOT EXISTS cosmetic_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cosmetic_id UUID NOT NULL REFERENCES cosmetic_products(id) ON DELETE CASCADE,
  duration_type VARCHAR(16) NOT NULL CHECK (
    duration_type IN ('1_DAY', '7_DAYS', '30_DAYS', '90_DAYS', 'PERMANENT')
  ),
  duration_days INT,
  price_coins BIGINT NOT NULL CHECK (price_coins > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cosmetic_id, duration_type),
  CHECK (
    (duration_type = 'PERMANENT' AND duration_days IS NULL)
    OR (duration_type <> 'PERMANENT' AND duration_days IS NOT NULL AND duration_days > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_variants_cosmetic
  ON cosmetic_product_variants (cosmetic_id) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS user_cosmetic_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES cosmetic_products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES cosmetic_product_variants(id),
  purchase_price BIGINT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  transaction_id UUID REFERENCES wallet_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_cosmetic_ownership_user
  ON user_cosmetic_ownership (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_cosmetic_ownership_user_equipped
  ON user_cosmetic_ownership (user_id, is_equipped) WHERE is_equipped = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_cosmetic_ownership_expires
  ON user_cosmetic_ownership (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_cosmetic_ownership_cosmetic
  ON user_cosmetic_ownership (cosmetic_id);
