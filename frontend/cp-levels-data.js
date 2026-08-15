/** CP intimacy level EXP ranges (Lv 1–60). Screenshot anchors for L15–20, L41–60; L1–14 and L21–40 interpolated. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  } else {
    root.CpLevelsData = data;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CP_LEVEL_ROWS = [
    { level: 1, exp: '0.1238M-0.1557M' },
    { level: 2, exp: '0.1557M-0.1958M' },
    { level: 3, exp: '0.1958M-0.2464M' },
    { level: 4, exp: '0.2464M-0.3099M' },
    { level: 5, exp: '0.3099M-0.3899M' },
    { level: 6, exp: '0.3899M-0.4905M' },
    { level: 7, exp: '0.4905M-0.617M' },
    { level: 8, exp: '0.617M-0.7761M' },
    { level: 9, exp: '0.7761M-0.9764M' },
    { level: 10, exp: '0.9764M-1.2282M' },
    { level: 11, exp: '1.2282M-1.5451M' },
    { level: 12, exp: '1.5451M-1.9437M' },
    { level: 13, exp: '1.9437M-2.4451M' },
    { level: 14, exp: '2.4451M-3.0759M' },
    { level: 15, exp: '3.0759M-3.8694M' },
    { level: 16, exp: '3.8694M-4.9008M' },
    { level: 17, exp: '4.9008M-6.2418M' },
    { level: 18, exp: '6.2418M-7.9849M' },
    { level: 19, exp: '7.9849M-10.251M' },
    { level: 20, exp: '10.251M-13.197M' },
    { level: 21, exp: '13.197M-15.9348M' },
    { level: 22, exp: '15.9348M-19.2406M' },
    { level: 23, exp: '19.2406M-23.2321M' },
    { level: 24, exp: '23.2321M-28.0518M' },
    { level: 25, exp: '28.0518M-33.8713M' },
    { level: 26, exp: '33.8713M-40.8981M' },
    { level: 27, exp: '40.8981M-49.3827M' },
    { level: 28, exp: '49.3827M-59.6274M' },
    { level: 29, exp: '59.6274M-71.9975M' },
    { level: 30, exp: '71.9975M-86.9338M' },
    { level: 31, exp: '86.9338M-104.9687M' },
    { level: 32, exp: '104.9687M-126.7451M' },
    { level: 33, exp: '126.7451M-153.0391M' },
    { level: 34, exp: '153.0391M-184.788M' },
    { level: 35, exp: '184.788M-223.1234M' },
    { level: 36, exp: '223.1234M-269.4117M' },
    { level: 37, exp: '269.4117M-325.3028M' },
    { level: 38, exp: '325.3028M-392.7888M' },
    { level: 39, exp: '392.7888M-474.2752M' },
    { level: 40, exp: '474.2752M-572.6665M' },
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
