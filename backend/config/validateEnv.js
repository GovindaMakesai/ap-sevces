const required = ['DATABASE_URL', 'JWT_SECRET'];
const recommended = ['REDIS_URL', 'RAZORPAY_KEY_ID', 'STRIPE_SECRET_KEY'];

function validateEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
  for (const k of recommended) {
    if (!process.env[k]) {
      console.warn(`⚠️  Recommended env not set: ${k}`);
    }
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn('⚠️  JWT_SECRET should be at least 16 characters for production');
  }
}

module.exports = { validateEnv };
