const BIDI_AND_INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function stripLoneSurrogates(value) {
  const s = String(value == null ? '' : value);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i += 1;
      }
    } else if (c < 0xdc00 || c > 0xdfff) {
      out += s[i];
    }
  }
  return out;
}

export function stripBidiAndControls(value) {
  return stripLoneSurrogates(value).replace(BIDI_AND_INVISIBLE, '');
}

export function sanitizePublicText(value, max = 80) {
  const cleaned = stripBidiAndControls(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const limit = Number(max) > 0 ? Number(max) : 80;
  if (cleaned.length <= limit) return cleaned;
  let end = limit;
  const c = cleaned.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return cleaned.slice(0, Math.max(0, end));
}
