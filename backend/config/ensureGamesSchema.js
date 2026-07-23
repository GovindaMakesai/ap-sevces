const fs = require('fs');
const path = require('path');
const db = require('./database');
const { buildGameSeedRows, ACTIVE_GAME_SLUGS } = require('./gameCatalogSeed');

async function seedGameCatalog() {
  const rows = buildGameSeedRows();
  for (const g of rows) {
    await db.query(
      `INSERT INTO game_catalog (slug, name, emoji, html_path, category, min_bet, max_bet, sort_order, metadata, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         emoji = EXCLUDED.emoji,
         html_path = EXCLUDED.html_path,
         category = EXCLUDED.category,
         min_bet = EXCLUDED.min_bet,
         max_bet = EXCLUDED.max_bet,
         sort_order = EXCLUDED.sort_order,
         metadata = EXCLUDED.metadata,
         is_active = TRUE,
         updated_at = CURRENT_TIMESTAMP`,
      [
        g.slug,
        g.name,
        g.emoji,
        g.html_path,
        g.category,
        g.min_bet,
        g.max_bet,
        g.sort_order != null ? g.sort_order : 0,
        JSON.stringify(g.metadata || {}),
      ]
    );
  }
  /* Only Crazy Fruit / Krazy Khazana / Teen Patti stay playable */
  await db.query(
    `UPDATE game_catalog
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE slug <> ALL($1::text[])`,
    [ACTIVE_GAME_SLUGS]
  ).catch(() => {});
  return rows.length;
}

async function ensureGamesSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/021_game_catalog.sql');
  if (!fs.existsSync(sqlPath)) {
    console.warn('⚠️  migration missing: 021_game_catalog.sql');
    return;
  }
  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  const roundsPath = path.join(__dirname, '../../database/migrations/022_game_rounds.sql');
  if (fs.existsSync(roundsPath)) {
    await db.query(fs.readFileSync(roundsPath, 'utf8'));
  }
  await seedGameCatalog();
  console.log('✅ Game catalog schema ready');
}

module.exports = { ensureGamesSchema, seedGameCatalog };
