const db = require('./config/database');

(async () => {
  await db.query(
    `UPDATE game_catalog
     SET max_bet = 5000000, updated_at = CURRENT_TIMESTAMP
     WHERE slug IN ('greedy', 'crazy-fruit')`
  );
  const r = await db.query(
    `SELECT slug, min_bet, max_bet FROM game_catalog WHERE slug IN ('greedy', 'crazy-fruit') ORDER BY slug`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
