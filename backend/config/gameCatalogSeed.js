/**
 * Seed rows for game_catalog.
 */
function buildGameSeedRows() {
  return [
    {
      slug: 'crazy-fruit',
      name: 'Crazy Fruit',
      emoji: '??',
      html_path: '/games/crazy-fruit.html',
      category: 'slots',
      min_bet: 100,
      max_bet: 500000,
      sort_order: 1,
      metadata: { gradient: 'linear-gradient(135deg,#f59e0b,#b45309)', subtitle: 'Multi-bet fruit machine' },
    },
    {
      slug: 'food-roulette',
      name: 'Food Roulette',
      emoji: '??',
      html_path: '/games/food-roulette.html',
      category: 'wheel',
      min_bet: 10,
      max_bet: 10000,
      sort_order: 2,
      metadata: { gradient: 'linear-gradient(135deg,#ec4899,#9d174d)', subtitle: 'Wheel spin & bet' },
    },
    {
      slug: 'roulette',
      name: 'Roulette',
      emoji: '??',
      html_path: '/games/roulette.html',
      category: 'casino',
      min_bet: 10,
      max_bet: 50000,
      sort_order: 3,
      metadata: { gradient: 'linear-gradient(135deg,#ef4444,#991b1b)', subtitle: 'Red / Black / Green' },
    },
    {
      slug: 'greedy',
      name: 'Greedy',
      emoji: '??',
      html_path: '/games/greedy.html',
      category: 'casino',
      min_bet: 100,
      max_bet: 500000,
      sort_order: 4,
      metadata: { gradient: 'linear-gradient(135deg,#f97316,#9a3412)', subtitle: 'Pick the prize gem' },
    },
    {
      slug: 'card-war',
      name: 'Card War',
      emoji: '??',
      html_path: '/games/card-war.html',
      category: 'cards',
      min_bet: 10,
      max_bet: 5000,
      sort_order: 5,
      metadata: { gradient: 'linear-gradient(135deg,#22c55e,#14532d)', subtitle: 'Higher card wins' },
    },
    {
      slug: 'teen-patti',
      name: 'Teen Patti',
      emoji: '??',
      html_path: '/games/teen-patti.html',
      category: 'cards',
      min_bet: 10,
      max_bet: 50000,
      sort_order: 6,
      metadata: { gradient: 'linear-gradient(135deg,#8b5cf6,#4c1d95)', subtitle: 'Trail · Sequence · Color · Pair' },
    },
  ];
}

module.exports = { buildGameSeedRows };
