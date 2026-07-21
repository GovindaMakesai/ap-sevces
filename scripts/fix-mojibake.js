/**
 * Fix UTF-8 mojibake in key frontend files.
 * Run: node scripts/fix-mojibake.js
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'frontend/social-live.js',
  'frontend/app.js',
  'frontend/auth-guard.js',
  'backend/server.js',
  'ap-services-app/App.js',
];

const PAIRS = [
  // · middle dot  (Â·)
  ['\u00C2\u00B7', '\u00B7'],
  // ✓ check mark (âœ“)
  ['\u00E2\u0153\u201C', '\u2713'],
  // ✨ sparkles (âœ¨)
  ['\u00E2\u0153\u00A8', '\u2728'],
  // 【 opening (ã€) — third byte is C1 control U+0090
  ['\u00E3\u20AC\u0090', '\u3010'],
  // 】 closing (ã€‘) — third char is U+2018 left single quote in this file
  ['\u00E3\u20AC\u2018', '\u3011'],
  // — em dash (â€”)
  ['\u00E2\u20AC\u201D', '\u2014'],
  // – en dash (â€“)
  ['\u00E2\u20AC\u201C', '\u2013'],
  // … ellipsis (â€¦)
  ['\u00E2\u20AC\u00A6', '\u2026'],
  // • bullet (â€¢)
  ['\u00E2\u20AC\u00A2', '\u2022'],
  // ’ right single quote (â€™)
  ['\u00E2\u20AC\u2122', '\u2019'],
  // × multiplication (Ã—)
  ['\u00C3\u2014', '\u00D7'],
  // — / … Greek-Gamma mojibake (ΓÇö / ΓÇª)
  ['\u0393\u00C7\u00F6', '\u2014'],
  ['\u0393\u00C7\u00AA', '\u2026'],
  // 🎁 (ðŸŽ)
  ['\u00F0\u0178\u017D\u0081', '\u{1F381}'],
  // 🎀 (ðŸŽ€)
  ['\u00F0\u0178\u017D\u20AC', '\u{1F380}'],
  // 🌹 (ðŸŒ¹)
  ['\u00F0\u0178\u0152\u00B9', '\u{1F339}'],
];

function processFile(rel) {
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) {
    console.warn('skip missing', rel);
    return;
  }
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  let total = 0;
  for (const [from, to] of PAIRS) {
    if (!from || !s.includes(from)) continue;
    const n = s.split(from).length - 1;
    total += n;
    s = s.split(from).join(to);
  }
  if (s === before) {
    console.log('unchanged', rel);
    return;
  }
  fs.writeFileSync(file, s, 'utf8');
  console.log('fixed', rel, 'replacements', total);
}

for (const f of FILES) processFile(f);

const live = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'social-live.js'), 'utf8');
const checks = [
  ['Send ·', /Send \u00B7 \$\{/.test(live)],
  ['【 name 】', live.includes('\u3010${escapeHtml(g.name)}\u3011')],
  ['Following ✓', live.includes('Following \u2713')],
  ['no Â·', !live.includes('\u00C2\u00B7')],
  ['no âœ“', !live.includes('\u00E2\u0153\u201C')],
  ['no ã€', !live.includes('\u00E3\u20AC')],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(ok ? 'OK' : 'FAIL', label);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
