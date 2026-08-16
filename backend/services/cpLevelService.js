/** CP couple intimacy levels 1–60 (EXP thresholds from product rules). */
const CP_LEVEL_MAX_INTIMACY = 5150000000;

const CP_LEVEL_MIN = [
  0,
  50000,
  85200,
  114300,
  149300,
  191300,
  254300,
  348800,
  490500,
  703100,
  1021900,
  1404600,
  1863700,
  2414700,
  3075900,
  3869400,
  4900800,
  6241800,
  7984900,
  10251000,
  13197000,
  16732200,
  20974400,
  26065100,
  32173800,
  39504400,
  48301000,
  58857000,
  71524100,
  86724700,
  104965500,
  126854300,
  153120900,
  184640900,
  222464800,
  267853500,
  317781100,
  372701500,
  433113900,
  499567500,
  572666500,
  656730400,
  753403800,
  864578200,
  992428800,
  1139457000,
  1433513400,
  1700000000,
  1950000000,
  2200000000,
  2450000000,
  2700000000,
  2950000000,
  3200000000,
  3450000000,
  3700000000,
  3950000000,
  4250000000,
  4550000000,
  4850000000,
];

const CP_LEVEL_BANDS = [
  { id: '0-20', label: 'Lv 0-20', from: 1, to: 20 },
  { id: '21-40', label: 'Lv 21-40', from: 21, to: 40 },
  { id: '41-60', label: 'Lv 41-60', from: 41, to: 60 },
];

const CP_LEVEL_ROWS = [
  { level: 1, exp: '0-50K' },
  { level: 2, exp: '50K-85.2K' },
  { level: 3, exp: '85.2K-114.3K' },
  { level: 4, exp: '114.3K-149.3K' },
  { level: 5, exp: '149.3K-191.3K' },
  { level: 6, exp: '191.3K-254.3K' },
  { level: 7, exp: '254.3K-348.8K' },
  { level: 8, exp: '348.8K-490.5K' },
  { level: 9, exp: '490.5K-703.1K' },
  { level: 10, exp: '703.1K-1.0219M' },
  { level: 11, exp: '1.0219M-1.4046M' },
  { level: 12, exp: '1.4046M-1.8637M' },
  { level: 13, exp: '1.8637M-2.4147M' },
  { level: 14, exp: '2.4147M-3.0759M' },
  { level: 15, exp: '3.0759M-3.8694M' },
  { level: 16, exp: '3.8694M-4.9008M' },
  { level: 17, exp: '4.9008M-6.2418M' },
  { level: 18, exp: '6.2418M-7.9849M' },
  { level: 19, exp: '7.9849M-10.251M' },
  { level: 20, exp: '10.251M-13.197M' },
  { level: 21, exp: '13.197M-16.7322M' },
  { level: 22, exp: '16.7322M-20.9744M' },
  { level: 23, exp: '20.9744M-26.0651M' },
  { level: 24, exp: '26.0651M-32.1738M' },
  { level: 25, exp: '32.1738M-39.5044M' },
  { level: 26, exp: '39.5044M-48.301M' },
  { level: 27, exp: '48.301M-58.857M' },
  { level: 28, exp: '58.857M-71.5241M' },
  { level: 29, exp: '71.5241M-86.7247M' },
  { level: 30, exp: '86.7247M-104.9655M' },
  { level: 31, exp: '104.9655M-126.8543M' },
  { level: 32, exp: '126.8543M-153.1209M' },
  { level: 33, exp: '153.1209M-184.6409M' },
  { level: 34, exp: '184.6409M-222.4648M' },
  { level: 35, exp: '222.4648M-267.8535M' },
  { level: 36, exp: '267.8535M-317.7811M' },
  { level: 37, exp: '317.7811M-372.7015M' },
  { level: 38, exp: '372.7015M-433.1139M' },
  { level: 39, exp: '433.1139M-499.5675M' },
  { level: 40, exp: '499.5675M-572.6665M' },
  { level: 41, exp: '572.6665M-656.7304M' },
  { level: 42, exp: '656.7304M-753.4038M' },
  { level: 43, exp: '753.4038M-864.5782M' },
  { level: 44, exp: '864.5782M-992.4288M' },
  { level: 45, exp: '992.4288M-1.139457B' },
  { level: 46, exp: '1.139457B-1.4335134B' },
  { level: 47, exp: '1.4335134B-1.7B' },
  { level: 48, exp: '1.7B-1.95B' },
  { level: 49, exp: '1.95B-2.2B' },
  { level: 50, exp: '2.2B-2.45B' },
  { level: 51, exp: '2.45B-2.7B' },
  { level: 52, exp: '2.7B-2.95B' },
  { level: 53, exp: '2.95B-3.2B' },
  { level: 54, exp: '3.2B-3.45B' },
  { level: 55, exp: '3.45B-3.7B' },
  { level: 56, exp: '3.7B-3.95B' },
  { level: 57, exp: '3.95B-4.25B' },
  { level: 58, exp: '4.25B-4.55B' },
  { level: 59, exp: '4.55B-4.85B' },
  { level: 60, exp: '4.85B-5.15B' },
];

function levelFromIntimacy(intimacy) {
  const n = Math.max(0, Math.floor(Number(intimacy) || 0));
  let level = 1;
  for (let i = CP_LEVEL_MIN.length - 1; i >= 0; i -= 1) {
    if (n >= CP_LEVEL_MIN[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(level, 60);
}

function getLevelProgress(intimacy) {
  const n = Math.max(0, Math.floor(Number(intimacy) || 0));
  const level = levelFromIntimacy(n);
  const levelMin = CP_LEVEL_MIN[level - 1] || 0;
  const nextMin = level >= 60 ? CP_LEVEL_MAX_INTIMACY : CP_LEVEL_MIN[level] || CP_LEVEL_MAX_INTIMACY;
  const span = Math.max(1, nextMin - levelMin);
  const progress = Math.min(span, n - levelMin);
  return {
    level,
    intimacy: n,
    levelMin,
    nextLevelMin: nextMin,
    progress,
    span,
    progressPct: Math.min(100, Math.round((progress / span) * 100)),
    maxLevel: 60,
  };
}

function rowsForBand(bandId) {
  const band = CP_LEVEL_BANDS.find((b) => b.id === bandId) || CP_LEVEL_BANDS[0];
  return CP_LEVEL_ROWS.filter((r) => r.level >= band.from && r.level <= band.to);
}

function getRulesPayload(cpConstants = {}) {
  return {
    howToBecomeCp: [
      'When the intimacy level reaches 50,000, you can send a CP invitation to the other party;',
      'CP can only have one user;',
      'The same user can send up to 3 invitations per day;',
    ],
    intimacyValue: [
      'You can increase your intimacy by chatting, calling and giving gifts;',
      '1 Diamond = 1 Intimacy Value (Lucky gifts are calculated based on actual income);',
    ],
    levelIntro:
      'Different levels of CP users can obtain different levels privileges.',
    levelBands: CP_LEVEL_BANDS,
    levelRows: CP_LEVEL_ROWS,
    removeCp: [
      'Free CP cancellation application requires the consent of both parties before CP can be canceled;',
      'If you pay to cancel the CP, you can cancel the CP immediately without the consent of the other party. A part of the Coins spent will be given to the other party as compensation for canceling the CP;',
      'After CP is lifted, the intimacy value will be cleared and re-calculated;',
    ],
    notice: [
      'The final interpretation is owned by AP Services.',
      'More CP privileges will be coming soon.',
    ],
    constants: cpConstants,
  };
}

module.exports = {
  CP_LEVEL_MIN,
  CP_LEVEL_MAX_INTIMACY,
  CP_LEVEL_BANDS,
  CP_LEVEL_ROWS,
  levelFromIntimacy,
  getLevelProgress,
  rowsForBand,
  getRulesPayload,
};
