/**
 * Seed rows for game_catalog — only live games.
 */
function buildGameSeedRows() {
  return [
    {
      slug: 'crazy-fruit',
      name: 'Crazy Fruit',
      emoji: '\u{1F352}',
      html_path: '/games/crazy-fruit.html',
      category: 'slots',
      min_bet: 100,
      max_bet: 5000000,
      sort_order: 1,
      metadata: { gradient: 'linear-gradient(135deg,#f59e0b,#b45309)', subtitle: 'Multi-bet fruit machine' },
    },
    {
      slug: 'greedy',
      name: 'Krazy Khazana',
      emoji: '\u{1F48E}',
      html_path: '/games/greedy.html',
      category: 'casino',
      min_bet: 100,
      max_bet: 5000000,
      sort_order: 2,
      metadata: { gradient: 'linear-gradient(135deg,#7c3aed,#4c1d95)', subtitle: 'Greedy gem wheel' },
    },
    {
      slug: 'teen-patti',
      name: 'Teen Patti',
      emoji: '\u{1F451}',
      html_path: '/games/teen-patti.html',
      category: 'cards',
      min_bet: 10,
      max_bet: 5000000,
      sort_order: 3,
      metadata: {
        gradient: 'linear-gradient(135deg,#1e3a8a,#4c1d95)',
        subtitle: 'King vs Queen · Royal Battle',
      },
    },
  ];
}

/** Slugs that must stay available */
const ACTIVE_GAME_SLUGS = ['crazy-fruit', 'greedy', 'teen-patti'];

module.exports = { buildGameSeedRows, ACTIVE_GAME_SLUGS };
