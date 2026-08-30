const db = require('./database');

const LUCKY_RETURN_GIFTS = [
  { slug: 'lucky_clover_15', emoji: '🍀', name: 'Lucky Clover', coin_cost: 15, sort_order: 1 },
  { slug: 'lucky_high_five_45', emoji: '🙌', name: 'High Five', coin_cost: 45, sort_order: 2 },
  { slug: 'lucky_magic_lamp_75', emoji: '🪔', name: 'Magic Lamp', coin_cost: 75, sort_order: 3 },
  { slug: 'lucky_hourglass_150', emoji: '⏳', name: 'Hourglass', coin_cost: 150, sort_order: 4 },
  { slug: 'lucky_air_drop_200', emoji: '📦', name: 'Air Drop', coin_cost: 200, sort_order: 5 },
  { slug: 'lucky_love_lock_250', emoji: '🔐', name: 'Love Lock', coin_cost: 250, sort_order: 6 },
  { slug: 'lucky_treasure_box_345', emoji: '🧰', name: 'Treasure Box', coin_cost: 345, sort_order: 7 },
  { slug: 'lucky_teddy_bear_500', emoji: '🧸', name: 'Teddy Bear', coin_cost: 500, sort_order: 8 },
];

async function ensureLuckyGiftSchema() {
  await db.query(`
    ALTER TABLE gift_catalog
      ADD COLUMN IF NOT EXISTS is_lucky BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lucky_gift_plays (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gift_tx_id UUID UNIQUE REFERENCES gift_transactions(id) ON DELETE SET NULL,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      live_room_id UUID,
      gift_slug VARCHAR(64) NOT NULL,
      gift_name VARCHAR(64),
      emoji VARCHAR(16),
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_cost INTEGER NOT NULL CHECK (unit_cost > 0),
      cost BIGINT NOT NULL CHECK (cost > 0),
      prize BIGINT NOT NULL DEFAULT 0 CHECK (prize >= 0),
      max_mult INTEGER NOT NULL DEFAULT 1000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lucky_plays_sender_created
      ON lucky_gift_plays (sender_id, created_at DESC)
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_lucky_plays_gift_tx
      ON lucky_gift_plays (gift_tx_id)
  `);
  await db.query(`
    ALTER TABLE gift_transactions
      ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(80)
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_gift_tx_sender_client_req
      ON gift_transactions (sender_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND client_request_id <> ''
  `);
  await db.query(`
    UPDATE gift_catalog
    SET is_lucky = TRUE
    WHERE LOWER(category) = 'lucky' OR slug ILIKE 'lucky_%'
  `);

  for (const g of LUCKY_RETURN_GIFTS) {
    await db.query(
      `INSERT INTO gift_catalog (slug, emoji, name, coin_cost, category, tier, sort_order, is_lucky, is_active)
       VALUES ($1, $2, $3, $4, 'lucky', 'small', $5, TRUE, TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         emoji = EXCLUDED.emoji,
         name = EXCLUDED.name,
         coin_cost = EXCLUDED.coin_cost,
         category = 'lucky',
         is_lucky = TRUE,
         is_active = TRUE,
         sort_order = EXCLUDED.sort_order`,
      [g.slug, g.emoji, g.name, g.coin_cost, g.sort_order]
    );
  }
}

module.exports = { ensureLuckyGiftSchema, LUCKY_RETURN_GIFTS };
