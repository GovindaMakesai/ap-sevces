/**
 * Fixes mojibake in frontend/social-live.js (UTF-8 read as Windows-1252).
 * Run: node scripts/fix-live-encoding.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'frontend', 'social-live.js');
let s = fs.readFileSync(file, 'utf8');

const replacements = [
  ['ΓÇö', '\u2014'],
  ['ΓÇª', '\u2026'],
  ['┬╖', '\u00B7'],
  ['Γ£ô', '\u2713'],
  ['Γ£ù', '\u2717'],
  ['Γé╣', '\u20B9'],
  ['πÇÉ', '\u3010'],
  ['πÇæ', '\u3011'],
  ['≡ƒöÑ', '\u{1F525}'],
  ['≡ƒÄü', '\u{1F381}'],
  ['≡ƒ¬Ö', '\u{1FA99}'],
  ['≡ƒî╣', '\u{1F339}'],
  ['≡ƒîƒ', '\u{1F31F}'],
  ['≡ƒ¬æ', '\u{1F451}'],
  ['≡ƒÑç', '\u{1F947}'],
  ['≡ƒÑê', '\u{1F948}'],
  ['≡ƒÑë', '\u{1F949}'],
  ['≡ƒç«≡ƒç│', '\u{1F1EE}\u{1F1F3}'],
  ['≡ƒÄë', '\u{1F389}'],
  ['≡ƒÜó', '\u{1F6A2}'],
  ['≡ƒÆÄ', '\u{1F48E}'],
  ['≡ƒÆ£', '\u{1F49C}'],
  ['≡ƒæá', '\u{1F460}'],
  ['≡ƒö½', '\u{1F52B}'],
  ['≡ƒöö', '\u{1F514}'],
  ['≡ƒì¡', '\u{1F36D}'],
  ['≡ƒÄÇ', '\u{1F380}'],
  ['Γ£¿', '\u2728'],
  ['≡ƒÉ╗', '\u{1F43B}'],
  ['≡ƒÄ╡', '\u{1F3B5}'],
  ['≡ƒìÆ', '\u{1F352}'],
  ['≡ƒ¢Ñ∩╕Å≡ƒÆò', '\u{1F6E5}\uFE0F\u2764\uFE0F'],
  ['Party room (voice grid) + Live room (video) \u2014 Agora', 'Party room (voice grid) + Live room (video) - Agora'],
];

for (const [from, to] of replacements) {
  s = s.split(from).join(to);
}

// Remaining corrupted emoji-like sequences (fallback strip)
const remaining = s.match(/≡[ƒÿ-ÿ]{1,4}/g);
if (remaining?.length) {
  console.warn('Unmapped sequences:', [...new Set(remaining)]);
}

fs.writeFileSync(file, s, 'utf8');
console.log('Fixed', file);
