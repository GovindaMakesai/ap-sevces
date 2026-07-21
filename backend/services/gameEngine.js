const crypto = require('crypto');

const CRAZY_FRUIT_RING = [0, 1, 2, 3, 7, 11, 10, 9, 8, 4];
const CRAZY_FRUIT_FRUIT_CELLS = [0, 1, 2, 3, 8, 9, 10, 11];
const CRAZY_FRUIT_CELLS = [
  { type: 'fruit', fruit: 0, mult: 5, emoji: '??', name: 'Orange' },
  { type: 'fruit', fruit: 1, mult: 5, emoji: '??', name: 'Lemon' },
  { type: 'fruit', fruit: 2, mult: 5, emoji: '??', name: 'Grape' },
  { type: 'fruit', fruit: 3, mult: 5, emoji: '??', name: 'Cherry' },
  { type: 'lucky', emoji: '??', name: 'Lucky' },
  { type: 'center' },
  { type: 'center' },
  { type: 'super', emoji: '??', name: 'Super Lucky' },
  { type: 'fruit', fruit: 4, mult: 45, emoji: '??', name: 'Strawberry' },
  { type: 'fruit', fruit: 5, mult: 25, emoji: '??', name: 'Mango' },
  { type: 'fruit', fruit: 6, mult: 15, emoji: '??', name: 'Watermelon' },
  { type: 'fruit', fruit: 7, mult: 10, emoji: '??', name: 'Apple' },
];
const CRAZY_FRUIT_WEIGHTS = { 0: 22, 1: 22, 2: 22, 3: 22, 8: 5, 9: 8, 10: 11, 11: 14 };

const FOOD_CATEGORIES = {
  Fruit: [
    { emoji: '??', name: 'Orange', mult: 5 },
    { emoji: '??', name: 'Apple', mult: 5 },
    { emoji: '??', name: 'Lemon', mult: 5 },
    { emoji: '??', name: 'Strawberry', mult: 5 },
    { emoji: '??', name: 'Mango', mult: 5 },
    { emoji: '??', name: 'Grape', mult: 10 },
    { emoji: '??', name: 'Watermelon', mult: 15 },
    { emoji: '??', name: 'Cherry', mult: 25 },
  ],
  Pizza: [
    { emoji: '??', name: 'Pizza', mult: 5 },
    { emoji: '??', name: 'Hotdog', mult: 5 },
    { emoji: '??', name: 'Burger', mult: 10 },
    { emoji: '??', name: 'Fries', mult: 5 },
    { emoji: '??', name: 'Taco', mult: 15 },
    { emoji: '??', name: 'Sandwich', mult: 5 },
    { emoji: '??', name: 'Chicken', mult: 25 },
    { emoji: '??', name: 'Donut', mult: 45 },
  ],
};

function rand(max) {
  return crypto.randomInt(0, max);
}

function pickWeighted(candidates, weights) {
  const total = candidates.reduce((sum, cellIdx) => sum + Number(weights[cellIdx] || 1), 0);
  let roll = rand(total);
  for (const cellIdx of candidates) {
    roll -= Number(weights[cellIdx] || 1);
    if (roll < 0) return cellIdx;
  }
  return candidates[0];
}

function normalizeCrazyFruitBets(pick) {
  const raw = Array.isArray(pick?.bets) ? pick.bets : [];
  const merged = new Map();
  for (const row of raw) {
    const cellIdx = Number(row?.cellIdx);
    const amount = Number(row?.amount);
    if (!Number.isInteger(cellIdx) || !CRAZY_FRUIT_FRUIT_CELLS.includes(cellIdx)) {
      throw new Error('Invalid fruit selection');
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Invalid fruit bet amount');
    }
    merged.set(cellIdx, (merged.get(cellIdx) || 0) + amount);
  }
  const bets = [...merged.entries()].map(([cellIdx, amount]) => ({ cellIdx, amount }));
  if (!bets.length) throw new Error('Select at least one fruit');
  const totalBet = bets.reduce((sum, row) => sum + row.amount, 0);
  return { bets, totalBet };
}

function resolveCrazyFruit(pick) {
  const { bets, totalBet } = normalizeCrazyFruitBets(pick);
  const landCellIdx = pickWeighted(CRAZY_FRUIT_FRUIT_CELLS, CRAZY_FRUIT_WEIGHTS);
  const landed = CRAZY_FRUIT_CELLS[landCellIdx];
  const winningBet = bets.find((row) => row.cellIdx === landCellIdx);
  const payout = winningBet ? winningBet.amount * landed.mult : 0;
  return {
    totalBet,
    win: payout > 0,
    payout,
    mult: payout > 0 ? landed.mult : 0,
    outcome: payout > 0 ? 'win' : 'loss',
    bets,
    winning_cell_idx: landCellIdx,
    winning_fruit: { name: landed.name, emoji: landed.emoji, mult: landed.mult },
    animation: {
      landCellIdx,
      landRingIdx: CRAZY_FRUIT_RING.indexOf(landCellIdx),
      totalSteps: 42 + rand(18),
    },
  };
}

function resolveFoodRoulette(pick, betAmount) {
  const category = String(pick?.category || 'Fruit');
  const sliceIdx = Number(pick?.sliceIdx);
  const list = FOOD_CATEGORIES[category];
  if (!list) throw new Error('Invalid food category');
  if (!Number.isInteger(sliceIdx) || sliceIdx < 0 || sliceIdx >= list.length) {
    throw new Error('Invalid slice pick');
  }
  const win = rand(10000) < 3500;
  const landIdx = win ? sliceIdx : (() => {
    const others = list.map((_, i) => i).filter((i) => i !== sliceIdx);
    return others[rand(others.length)];
  })();
  const landed = list[landIdx];
  return {
    totalBet: betAmount,
    win: landIdx === sliceIdx,
    payout: landIdx === sliceIdx ? betAmount * landed.mult : 0,
    mult: landIdx === sliceIdx ? landed.mult : 0,
    outcome: landIdx === sliceIdx ? 'win' : 'loss',
    animation: { category, landSliceIdx: landIdx, food: landed.name, emoji: landed.emoji },
  };
}

const GREEDY_ITEMS = [
  { emoji: '💎', name: 'Diamond', mult: 45 },
  { emoji: '👑', name: 'Crown', mult: 25 },
  { emoji: '🔮', name: 'Orb', mult: 15 },
  { emoji: '🪙', name: 'Coin', mult: 10 },
  { emoji: '🎁', name: 'Gift', mult: 5 },
  { emoji: '⭐', name: 'Star', mult: 5 },
  { emoji: '🔥', name: 'Fire', mult: 5 },
  { emoji: '🍀', name: 'Lucky', mult: 5 },
];
const GREEDY_WEIGHTS = { 0: 5, 1: 8, 2: 11, 3: 14, 4: 22, 5: 22, 6: 22, 7: 22 };

function normalizeGreedyBets(pick) {
  const raw = Array.isArray(pick?.bets) ? pick.bets : [];
  const merged = new Map();
  for (const row of raw) {
    const cellIdx = Number(row?.cellIdx);
    const amount = Number(row?.amount);
    if (!Number.isInteger(cellIdx) || cellIdx < 0 || cellIdx >= GREEDY_ITEMS.length) {
      throw new Error('Invalid gem selection');
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Invalid gem bet amount');
    }
    merged.set(cellIdx, (merged.get(cellIdx) || 0) + amount);
  }
  const bets = [...merged.entries()].map(([cellIdx, amount]) => ({ cellIdx, amount }));
  if (!bets.length) throw new Error('Select at least one gem');
  const totalBet = bets.reduce((sum, row) => sum + row.amount, 0);
  return { bets, totalBet };
}

function resolveGreedy(pick, betAmount) {
  if (Array.isArray(pick?.bets) && pick.bets.length) {
    const { bets, totalBet } = normalizeGreedyBets(pick);
    const landIdx = pickWeighted(
      GREEDY_ITEMS.map((_, i) => i),
      GREEDY_WEIGHTS
    );
    const landed = GREEDY_ITEMS[landIdx];
    const winningBet = bets.find((row) => row.cellIdx === landIdx);
    const payout = winningBet ? winningBet.amount * landed.mult : 0;
    return {
      totalBet,
      win: payout > 0,
      payout,
      mult: payout > 0 ? landed.mult : 0,
      outcome: payout > 0 ? 'win' : 'loss',
      bets,
      winning_cell_idx: landIdx,
      winning_fruit: { name: landed.name, emoji: landed.emoji, mult: landed.mult },
      prizeIdx: landIdx,
      prizeGem: landed.emoji,
      animation: {
        landCellIdx: landIdx,
        landRingIdx: landIdx,
        totalSteps: 42 + rand(18),
      },
    };
  }
  const gemIdx = Number(pick?.gemIdx);
  if (!Number.isInteger(gemIdx) || gemIdx < 0 || gemIdx >= GREEDY_ITEMS.length) {
    throw new Error('Invalid gem pick');
  }
  const prizeIdx = rand(GREEDY_ITEMS.length);
  const isWin = gemIdx === prizeIdx;
  const mult = isWin ? 3 : 0;
  const landed = GREEDY_ITEMS[prizeIdx];
  return {
    totalBet: betAmount,
    win: isWin,
    payout: isWin ? betAmount * mult : 0,
    mult,
    outcome: isWin ? 'win' : 'loss',
    prizeIdx,
    prizeGem: landed.emoji,
    pickedGem: GREEDY_ITEMS[gemIdx].emoji,
    winning_fruit: { name: landed.name, emoji: landed.emoji, mult: landed.mult },
    animation: { landCellIdx: prizeIdx, landRingIdx: prizeIdx, totalSteps: 36 + rand(12) },
  };
}

function resolveRound(slug, pick, betAmount) {
  switch (String(slug)) {
    case 'crazy-fruit':
      return resolveCrazyFruit(pick || {});
    case 'food-roulette':
      return resolveFoodRoulette(pick || {}, betAmount);
    case 'greedy':
      return resolveGreedy(pick || {}, betAmount);
    default:
      throw new Error('This game is not enabled for server play yet');
  }
}

module.exports = {
  resolveRound,
  CRAZY_FRUIT_CELLS,
  CRAZY_FRUIT_RING,
  CRAZY_FRUIT_FRUIT_CELLS,
  FOOD_CATEGORIES,
  GREEDY_ITEMS,
};
