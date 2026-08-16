/** CP intimacy level EXP ranges (Lv 1–60) — product rules. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  } else {
    root.CpLevelsData = data;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  const CP_LEVEL_BANDS = [
    { id: '0-20', label: 'Lv 0-20', from: 1, to: 20 },
    { id: '21-40', label: 'Lv 21-40', from: 21, to: 40 },
    { id: '41-60', label: 'Lv 41-60', from: 41, to: 60 },
  ];

  function rowsForBand(bandId) {
    const band = CP_LEVEL_BANDS.find((b) => b.id === bandId) || CP_LEVEL_BANDS[0];
    return CP_LEVEL_ROWS.filter((r) => r.level >= band.from && r.level <= band.to);
  }

  return { CP_LEVEL_ROWS, CP_LEVEL_BANDS, rowsForBand };
});
