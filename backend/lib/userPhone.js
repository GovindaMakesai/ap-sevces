/**
 * OAuth signups store a unique internal phone placeholder (DB NOT NULL + UNIQUE).
 * Never expose those to users — only numbers they explicitly saved.
 */

function generateOAuthPhonePlaceholder(providerId, offset = 0) {
  const digits = String(providerId || '').replace(/\D/g, '');
  const base = digits.slice(-9).padStart(9, '0');
  const numeric = (BigInt(base) + BigInt(offset)).toString().slice(-9).padStart(9, '0');
  return `9${numeric}`;
}

function matchesOAuthPhonePlaceholder(phone, providerId) {
  const normalized = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!normalized || !providerId) return false;
  for (let i = 0; i < 50; i += 1) {
    if (generateOAuthPhonePlaceholder(providerId, i) === normalized) return true;
  }
  return false;
}

function isUserProvidedPhone(user) {
  if (!user) return false;
  const phone = String(user.phone || '').trim();
  if (!phone) return false;
  if (user.phone_provided === true) return true;
  if (user.phone_provided === false) return false;
  const provider = String(user.provider || '').trim();
  const providerId = String(user.provider_id || '').trim();
  if (!provider || !providerId) return true;
  return !matchesOAuthPhonePlaceholder(phone, providerId);
}

function displayPhone(user) {
  if (!isUserProvidedPhone(user)) return null;
  const phone = String(user.phone || '').trim();
  return phone || null;
}

module.exports = {
  generateOAuthPhonePlaceholder,
  matchesOAuthPhonePlaceholder,
  isUserProvidedPhone,
  displayPhone,
};
