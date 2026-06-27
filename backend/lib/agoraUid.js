const crypto = require('crypto');

function uidFromUserId(userId) {
  if (!userId) return 0;
  const hex = crypto.createHash('md5').update(String(userId)).digest('hex').slice(0, 8);
  const n = parseInt(hex, 16) % 2147483646;
  return n + 1;
}

module.exports = { uidFromUserId };
