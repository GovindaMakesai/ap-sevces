/** Wealth + Livestream level tables (competitor parity UI). */

export const LIVESTREAM_THRESHOLDS = [
  0, 0, 10000, 70000, 250000, 630000, 1410000, 3010000, 5710000, 10310000, 18110000,
  31010000, 52010000, 85010000, 137010000, 214010000, 323010000, 492010000, 741010000,
  1100010000, 1689010000, 2528010000, 3637010000, 5137010000, 7337010000, 10137100000,
  14137100000, 19137100000, 30000000000, 45000000000, 60000000000, 80000000000,
  100000000000, 130000000000, 160000000000, 200000000000,
];

const WEALTH_ANCHORS = [
  [1, 0], [2, 2000], [3, 7000], [4, 20000], [5, 65000], [6, 120000], [7, 200000], [8, 350000],
  [9, 650000], [10, 1008000], [15, 3200000], [20, 10000000], [25, 28000000], [30, 68000000],
  [33, 68000000], [40, 250000000], [50, 1000000000], [60, 2800000000], [70, 6200000000],
  [80, 12000000000], [100, 20800000000], [150, 42000000000], [200, 68000000000],
  [300, 98000000000], [400, 128000000000], [467, 20718000000], [510, 170086560000],
];

function interpolateAnchors(anchors, level, maxLevel = 510) {
  const lv = Math.max(1, Math.min(maxLevel, Math.floor(level)));
  if (lv <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [l0, v0] = anchors[i - 1];
    const [l1, v1] = anchors[i];
    if (lv <= l1) {
      if (l1 === l0) return v1;
      const t = (lv - l0) / (l1 - l0);
      return Math.floor(v0 + (v1 - v0) * t);
    }
  }
  const [l0, v0] = anchors[anchors.length - 2];
  const [l1, v1] = anchors[anchors.length - 1];
  const t = (lv - l0) / Math.max(1, l1 - l0);
  return Math.floor(v0 + (v1 - v0) * t);
}

function buildThresholdTable(anchors, maxLevel) {
  const out = [0];
  for (let lv = 1; lv <= maxLevel; lv += 1) out.push(interpolateAnchors(anchors, lv, maxLevel));
  return out;
}

export const WEALTH_THRESHOLDS = buildThresholdTable(WEALTH_ANCHORS, 510);
export const LIVESTREAM_MAX = LIVESTREAM_THRESHOLDS.length - 1;

export function fmtNum(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return v.toLocaleString('en-IN');
  return String(v);
}

export function levelFromPoints(points, thresholds) {
  const table = Array.isArray(thresholds) && thresholds.length ? thresholds : [0, 0];
  const pts = Math.max(0, Number(points || 0));
  let level = 1;
  for (let i = 2; i < table.length; i += 1) {
    if (pts >= table[i]) level = i;
    else break;
  }
  const cur = table[level] || 0;
  const next = table[level + 1] ?? table[table.length - 1];
  const span = Math.max(1, next - cur);
  const progress = pts - cur;
  const remaining = Math.max(0, next - pts);
  return { level, points: pts, cur, next, span, progress, remaining, pct: Math.min(100, (progress / span) * 100) };
}

export function wealthBadgeColors(level) {
  const lv = Number(level || 1);
  if (lv < 5) return ['#86EFAC', '#4ADE80'];
  if (lv < 12) return ['#FDE68A', '#F59E0B'];
  if (lv < 20) return ['#FDBA74', '#F97316'];
  if (lv < 28) return ['#FCA5A5', '#EF4444'];
  if (lv < 36) return ['#F9A8D4', '#EC4899'];
  if (lv < 44) return ['#C4B5FD', '#7C3AED'];
  if (lv < 52) return ['#93C5FD', '#2563EB'];
  if (lv < 60) return ['#67E8F9', '#06B6D4'];
  if (lv < 68) return ['#D8B4FE', '#A855F7'];
  if (lv < 76) return ['#D6B28E', '#92400E'];
  if (lv < 84) return ['#F87171', '#B91C1C'];
  if (lv < 92) return ['#F472B6', '#DB2777'];
  return ['#E879F9', '#A21CAF'];
}

export function livestreamBadgeColors(level) {
  const lv = Number(level || 1);
  if (lv < 6) return ['#86EFAC', '#22C55E'];
  if (lv < 10) return ['#6EE7B7', '#10B981'];
  if (lv < 15) return ['#93C5FD', '#3B82F6'];
  if (lv < 20) return ['#60A5FA', '#2563EB'];
  if (lv < 25) return ['#FDBA74', '#EA580C'];
  if (lv < 30) return ['#F9A8D4', '#DB2777'];
  if (lv < 35) return ['#FCA5A5', '#DC2626'];
  return ['#FDE68A', '#CA8A04'];
}

export const LOCKED_MILESTONES = [40, 50, 60, 70, 80, 100, 150, 200];

export function myBenefits(level, kind = 'wealth') {
  const lv = Number(level || 1);
  const milestones = [30, 40, 50].filter((m) => m <= lv);
  const base = milestones.length ? milestones : [Math.max(30, Math.floor(lv / 10) * 10) || 30];
  return base.slice(-3).map((m) => ({
    level: m,
    title: kind === 'wealth' ? `Wealth Lv.${m}` : `Livestream Lv.${m}`,
    subtitle: 'Check For Details >',
    icon: kind === 'wealth' ? '💎' : '🎤',
  }));
}

export function lockedBenefitRows(milestone, kind = 'wealth') {
  const label = kind === 'wealth' ? 'Wealth' : 'Livestream';
  return [
    { title: `${label} Lv.${milestone}`, sub: `${label} reaches Lv.${milestone}`, icon: '💎' },
    { title: 'Special Entry Effect', sub: 'Visible in all live rooms', icon: '✨' },
    { title: 'Level-Up Effect', sub: 'Visible only in the ongoing live room', icon: '🏅' },
  ];
}

export function tableRows(kind = 'wealth') {
  const thresholds = kind === 'wealth' ? WEALTH_THRESHOLDS : LIVESTREAM_THRESHOLDS;
  const max = kind === 'wealth' ? 510 : LIVESTREAM_MAX;
  const rows = [];
  for (let lv = 1; lv <= max; lv += 1) {
    rows.push({ level: lv, cost: thresholds[lv] ?? thresholds[thresholds.length - 1] });
  }
  return rows;
}
