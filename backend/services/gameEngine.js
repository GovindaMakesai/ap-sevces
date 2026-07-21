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
  { emoji: '🍍', name: 'Pineapple', mult: 5 },
  { emoji: '🍒', name: 'Cherries', mult: 5 },
  { emoji: '🍌', name: 'Bananas', mult: 5 },
  { emoji: '🍉', name: 'Watermelon', mult: 5 },
  { emoji: '🍢', name: 'Skewers', mult: 10 },
  { emoji: '🌯', name: 'Burrito', mult: 15 },
  { emoji: '🍕', name: 'Pizza', mult: 25 },
  { emoji: '🍗', name: 'Roast Chicken', mult: 45 },
];
const GREEDY_WEIGHTS = { 0: 22, 1: 22, 2: 22, 3: 22, 4: 14, 5: 11, 6: 8, 7: 5 };

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

/* —— Royal Battle (Teen Patti King vs Queen) —— */
const TEEN_PATTI_AREAS = {
  blue: { mult: 1.95, label: 'BLUE' },
  red: { mult: 1.95, label: 'RED' },
  pair: { mult: 3.5, label: 'PAIR' },
  color: { mult: 10, label: 'COLOR' },
  sequence: { mult: 15, label: 'SEQUENCE' },
  pure_seq: { mult: 100, label: 'PURE SEQ' },
  set: { mult: 100, label: 'SET' },
};
const TEEN_PATTI_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const TEEN_PATTI_SUITS = ['S', 'H', 'D', 'C'];
const TEEN_PATTI_SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const TEEN_PATTI_VAL = { A: 14, K: 13, Q: 12, J: 11 };

function teenPattiVal(rank) {
  return TEEN_PATTI_VAL[rank] || Number(rank);
}

function teenPattiDeck() {
  const d = [];
  for (const suit of TEEN_PATTI_SUITS) {
    for (const rank of TEEN_PATTI_RANKS) {
      d.push({ rank, suit, v: teenPattiVal(rank), sym: TEEN_PATTI_SUIT_SYM[suit] });
    }
  }
  for (let i = d.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

function teenPattiIsSeq(vals) {
  const s = vals.slice().sort((a, b) => a - b);
  if (s[0] === 2 && s[1] === 3 && s[2] === 14) return true;
  return s[0] + 1 === s[1] && s[1] + 1 === s[2];
}

/** Higher score wins. category used for side bets. */
function evaluateTeenPattiHand(cards) {
  const sorted = cards.slice().sort((a, b) => b.v - a.v);
  const vals = sorted.map((c) => c.v);
  const suits = sorted.map((c) => c.suit);
  const sameSuit = suits[0] === suits[1] && suits[1] === suits[2];
  const trail = vals[0] === vals[1] && vals[1] === vals[2];
  const pair = vals[0] === vals[1] || vals[1] === vals[2] || vals[0] === vals[2];
  const seq = teenPattiIsSeq(vals);
  const pure = sameSuit && seq;

  let pairVal = 0;
  let kicker = 0;
  if (pair && !trail) {
    if (vals[0] === vals[1]) {
      pairVal = vals[0];
      kicker = vals[2];
    } else if (vals[1] === vals[2]) {
      pairVal = vals[1];
      kicker = vals[0];
    } else {
      pairVal = vals[0];
      kicker = vals[1];
    }
  }

  let seqHigh = vals[0];
  if (seq) {
    const s = vals.slice().sort((a, b) => a - b);
    seqHigh = s[0] === 2 && s[1] === 3 && s[2] === 14 ? 3 : s[2];
  }

  if (trail) {
    return { score: 600 + vals[0], category: 'set', name: 'Set', label: 'Set', tie: vals };
  }
  if (pure) {
    return {
      score: 500 + seqHigh,
      category: 'pure_seq',
      name: 'Pure Sequence',
      label: 'Pure Seq',
      tie: [seqHigh].concat(vals),
    };
  }
  if (seq) {
    return {
      score: 400 + seqHigh,
      category: 'sequence',
      name: 'Sequence',
      label: 'Sequence',
      tie: [seqHigh].concat(vals),
    };
  }
  if (sameSuit) {
    return { score: 300 + vals[0], category: 'color', name: 'Color', label: 'Color', tie: vals };
  }
  if (pair) {
    return {
      score: 200 + pairVal,
      category: 'pair',
      name: 'Pair',
      label: 'Pair',
      tie: [pairVal, kicker],
    };
  }
  return {
    score: 100 + vals[0],
    category: 'high',
    name: 'High card',
    label: 'High card',
    tie: vals,
  };
}

function compareTeenPatti(a, b) {
  if (a.score !== b.score) return a.score - b.score;
  for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i += 1) {
    const av = a.tie[i] || 0;
    const bv = b.tie[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function normalizeTeenPattiBets(pick) {
  const raw = Array.isArray(pick?.bets) ? pick.bets : [];
  const merged = new Map();
  for (const row of raw) {
    const area = String(row?.area || '').toLowerCase();
    const amount = Number(row?.amount);
    if (!TEEN_PATTI_AREAS[area]) throw new Error('Invalid bet area');
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Invalid bet amount');
    }
    merged.set(area, (merged.get(area) || 0) + amount);
  }
  const bets = [...merged.entries()].map(([area, amount]) => ({ area, amount }));
  if (!bets.length) throw new Error('Place at least one bet');
  const totalBet = bets.reduce((sum, row) => sum + row.amount, 0);
  return { bets, totalBet };
}

function payoutTeenPatti(amount, mult) {
  return Math.floor(Number(amount) * Number(mult) + 1e-9);
}

function resolveTeenPatti(pick) {
  const { bets, totalBet } = normalizeTeenPattiBets(pick);
  const deck = teenPattiDeck();
  const blueCards = [deck.pop(), deck.pop(), deck.pop()];
  const redCards = [deck.pop(), deck.pop(), deck.pop()];
  const blueEval = evaluateTeenPattiHand(blueCards);
  const redEval = evaluateTeenPattiHand(redCards);
  const cmp = compareTeenPatti(blueEval, redEval);
  let winnerSide = 'tie';
  if (cmp > 0) winnerSide = 'blue';
  else if (cmp < 0) winnerSide = 'red';

  const winningEval = winnerSide === 'blue' ? blueEval : winnerSide === 'red' ? redEval : null;
  const winningCategory = winningEval ? winningEval.category : null;

  let payout = 0;
  const settled = [];
  for (const row of bets) {
    let hit = false;
    let mult = 0;
    if (row.area === 'blue' || row.area === 'red') {
      hit = winnerSide === row.area;
      mult = hit ? TEEN_PATTI_AREAS[row.area].mult : 0;
    } else if (winningCategory && row.area === winningCategory) {
      hit = true;
      mult = TEEN_PATTI_AREAS[row.area].mult;
    }
    const winAmt = hit ? payoutTeenPatti(row.amount, mult) : 0;
    payout += winAmt;
    settled.push({ area: row.area, amount: row.amount, hit, mult, payout: winAmt });
  }

  return {
    totalBet,
    win: payout > 0,
    payout,
    mult: payout > 0 ? Number((payout / totalBet).toFixed(2)) : 0,
    outcome: payout > 0 ? 'win' : 'loss',
    bets,
    settled,
    winner_side: winnerSide,
    winning_category: winningCategory,
    blue_hand: {
      cards: blueCards,
      eval: { name: blueEval.name, label: blueEval.label, category: blueEval.category },
    },
    red_hand: {
      cards: redCards,
      eval: { name: redEval.name, label: redEval.label, category: redEval.category },
    },
    winning_fruit: {
      name: winnerSide === 'tie' ? 'Tie' : winnerSide === 'blue' ? 'Blue (King)' : 'Red (Queen)',
      emoji: winnerSide === 'blue' ? '👑' : winnerSide === 'red' ? '👸' : '🤝',
      mult: payout > 0 ? Number((payout / totalBet).toFixed(2)) : 0,
    },
    animation: {
      winnerSide,
      winningCategory,
      blueCards,
      redCards,
      blueLabel: blueEval.label,
      redLabel: redEval.label,
    },
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
    case 'teen-patti':
      return resolveTeenPatti(pick || {});
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
  TEEN_PATTI_AREAS,
};
