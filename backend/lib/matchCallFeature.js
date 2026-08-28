/** Voice/Video Match is RN-only until explicitly enabled in production. */
function isMatchCallEnabled() {
  return String(process.env.MATCH_CALL_ENABLED || 'false').toLowerCase() === 'true';
}

function isMissingRelationError(err) {
  const msg = String(err?.message || '');
  return err?.code === '42P01' || /relation .* does not exist/i.test(msg);
}

module.exports = { isMatchCallEnabled, isMissingRelationError };
