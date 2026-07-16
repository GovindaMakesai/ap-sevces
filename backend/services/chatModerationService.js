/**
 * Live / party chat abuse filter + strike escalation.
 * Strike 1 → warn (message blocked)
 * Strike 2 → mute chat in room
 * Strike 3+ → kick/ban 2 hours
 */

const STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
const BAN_HOURS = 2;

/** In-memory strikes: `${channel}:${userId}` → { count, at } */
const strikeMap = new Map();

/**
 * Normalized abusive tokens (English + common Romanized Hindi/Hinglish).
 * Matched after leetspeak normalize + word-ish splitting.
 */
const BLOCKED_TERMS = [
  'fuck',
  'fucker',
  'fucking',
  'fck',
  'fuk',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'aashole',
  'dickhead',
  'motherfucker',
  'mfucker',
  'cunt',
  'whore',
  'slut',
  'retard',
  'nigger',
  'nigga',
  'faggot',
  'pedo',
  'paedophile',
  /* Explicit sexual terms — blocked for everyone including hosts */
  'sex',
  'sexy',
  'sexual',
  'sexually',
  'sexx',
  'sexxy',
  'sext',
  'sexting',
  'porn',
  'porno',
  'pornography',
  'xxx',
  'nsfw',
  'nude',
  'nudes',
  'naked',
  'boobs',
  'tits',
  'pussy',
  'penis',
  'vagina',
  'cock',
  'dick',
  'blowjob',
  'handjob',
  'orgasm',
  'onlyfans',
  'chutiya',
  'chutia',
  'chutya',
  'madarchod',
  'maderchod',
  'behenchod',
  'behanchod',
  'bhenchod',
  'bhosdike',
  'bhosdi',
  'randi',
  'randii',
  'haraami',
  'harami',
  'kutta',
  'kutte',
  'saala',
  'salaa',
  'gaandu',
  'gandu',
  'lavde',
  'lawde',
  'laude',
  'lund',
  'choot',
  'chut',
  'bsdk',
  'mcbc',
  'mkc',
  'bc',
  'mc',
];

/* Short tokens that need strict word-boundary only (too common otherwise) */
const STRICT_SHORT = new Set(['bc', 'mc']);

/** Always blocked even when spaced/obfuscated (s e x, s.e.x, sexx) */
const COLLAPSED_MUST_BLOCK = [
  'sex',
  'sexy',
  'sexual',
  'sext',
  'porn',
  'porno',
  'xxx',
  'nude',
  'nudes',
  'nsfw',
  'onlyfans',
  'blowjob',
  'handjob',
];

function normalizeText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function strikeKey(channel, userId) {
  return `${String(channel || '')}:${String(userId || '')}`;
}

function pruneStrikes() {
  const now = Date.now();
  for (const [k, v] of strikeMap.entries()) {
    if (!v?.at || now - v.at > STRIKE_WINDOW_MS) strikeMap.delete(k);
  }
}

function findBlockedTerm(text) {
  const norm = normalizeText(text);
  if (!norm) return null;
  const spaced = ` ${norm} `;
  const collapsed = norm.replace(/\s+/g, '');

  for (const term of COLLAPSED_MUST_BLOCK) {
    if (collapsed.includes(term)) return term;
  }

  for (const term of BLOCKED_TERMS) {
    if (STRICT_SHORT.has(term)) {
      const re = new RegExp(`(?:^|\\s)${term}(?:$|\\s)`, 'i');
      if (re.test(norm)) return term;
      continue;
    }
    if (spaced.includes(` ${term} `) || norm.includes(term)) {
      /* Prefer whole-token hit for shortish words */
      if (term.length <= 3) {
        const re = new RegExp(`(?:^|\\s)${term}(?:$|\\s)`, 'i');
        if (!re.test(norm)) continue;
      }
      return term;
    }
  }
  return null;
}

function scanMessage(text) {
  const hit = findBlockedTerm(text);
  if (!hit) return { blocked: false };
  return {
    blocked: true,
    term: hit,
    reason: 'abusive_language',
  };
}

function getStrikes(channel, userId) {
  pruneStrikes();
  const row = strikeMap.get(strikeKey(channel, userId));
  if (!row) return 0;
  if (Date.now() - row.at > STRIKE_WINDOW_MS) {
    strikeMap.delete(strikeKey(channel, userId));
    return 0;
  }
  return Number(row.count) || 0;
}

/**
 * Record a strike and return the recommended enforcement action.
 */
function recordStrike(channel, userId) {
  pruneStrikes();
  const key = strikeKey(channel, userId);
  const prev = getStrikes(channel, userId);
  const count = prev + 1;
  strikeMap.set(key, { count, at: Date.now() });

  if (count >= 3) {
    return {
      strikes: count,
      action: 'ban',
      banHours: BAN_HOURS,
      message: `Abusive language is not allowed. You are blocked from this live for ${BAN_HOURS} hours.`,
      userMessage: `This message was blocked. Strike ${count}/3 — you have been removed for abusive chat.`,
    };
  }
  if (count === 2) {
    return {
      strikes: count,
      action: 'mute',
      message: 'Abusive language is not allowed. You are muted from chat in this room.',
      userMessage: `This message was blocked. Strike ${count}/3 — chat muted. One more strike and you will be kicked.`,
    };
  }
  return {
    strikes: count,
    action: 'warn',
    message: 'Abusive language is not allowed in this live.',
    userMessage:
      'This message was blocked for abusive language. Strike 1/3 — next strike mutes your chat; third kick/bans you.',
  };
}

function resetStrikes(channel, userId) {
  strikeMap.delete(strikeKey(channel, userId));
}

module.exports = {
  scanMessage,
  recordStrike,
  getStrikes,
  resetStrikes,
  BAN_HOURS,
};
