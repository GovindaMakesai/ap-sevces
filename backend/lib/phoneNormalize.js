const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Normalize user phone input to E.164. Backend is the authority.
 * @param {string} phone
 * @param {string} defaultCountry ISO 3166-1 alpha-2
 */
function normalizePhoneInput(phone, defaultCountry = 'IN') {
  const raw = String(phone || '').trim();
  if (!raw) {
    return { ok: false, error: 'Phone number is required' };
  }
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: 'Enter a valid mobile number with country code' };
  }
  const e164 = parsed.format('E.164');
  const national = parsed.nationalNumber;
  const digits = e164.replace(/\D/g, '');
  const lookupVariants = [...new Set([e164, national, digits, `+${digits}`])];
  return {
    ok: true,
    e164,
    national,
    lookupVariants,
    masked: maskPhone(e164),
  };
}

function maskPhone(e164) {
  const s = String(e164 || '');
  if (s.length < 6) return s;
  const tail = s.slice(-4);
  const head = s.slice(0, Math.max(3, s.length - 8));
  return `${head}${'•'.repeat(Math.max(0, s.length - head.length - 4))}${tail}`;
}

module.exports = { normalizePhoneInput, maskPhone };
