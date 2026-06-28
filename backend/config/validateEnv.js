const required = ['DATABASE_URL', 'JWT_SECRET'];
const recommended = ['REDIS_URL', 'RAZORPAY_KEY_ID', 'STRIPE_SECRET_KEY'];
const oauthKeys = [
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_CALLBACK_URL',
];

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
  for (const k of oauthKeys) {
    if (!process.env[k]) {
      console.warn(`⚠️  OAuth env not set: ${k} (social login may fail)`);
    }
  }
  const renderLeak = oauthKeys
    .filter((k) => String(process.env[k] || '').includes('onrender.com'));
  if (renderLeak.length) {
    console.warn(`⚠️  OAuth still points at Render (${renderLeak.join(', ')}) — update to ap-sevces.vercel.app`);
  }
  if (!process.env.AGORA_APP_ID || !process.env.AGORA_APP_CERTIFICATE) {
    console.warn('⚠️  AGORA_APP_ID / AGORA_APP_CERTIFICATE not set — live voice will not work in production');
  } else {
    const appId = String(process.env.AGORA_APP_ID).trim();
    if (appId.length !== 32) {
      console.warn(`⚠️  AGORA_APP_ID looks invalid (length ${appId.length}, expected 32) — party/live voice may fail`);
    }
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn('⚠️  JWT_SECRET should be at least 16 characters for production');
  }
}

module.exports = { validateEnv };
