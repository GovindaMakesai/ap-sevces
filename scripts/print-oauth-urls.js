#!/usr/bin/env node
/** Print OAuth callback URLs to register in Google / GitHub / Facebook. */
const cfg = require('../config/production-api');

console.log('\nAP Services — OAuth callback URLs\n');
console.log('Backend API:     ', cfg.BACKEND_URL);
console.log('Frontend / OAuth:', cfg.FRONTEND_URL);
console.log('\nRegister these EXACT URLs in each provider console:\n');
Object.entries(cfg.OAUTH_CALLBACKS).forEach(([name, url]) => {
  console.log(`  ${name.padEnd(8)} ${url}`);
});
console.log('\nVPS backend/.env must include:');
console.log('  FRONTEND_URL=' + cfg.FRONTEND_URL);
console.log('  OAUTH_CALLBACK_BASE=' + cfg.OAUTH_CALLBACK_BASE);
console.log('  GOOGLE_CALLBACK_URL=' + cfg.OAUTH_CALLBACKS.google);
console.log('  GITHUB_CALLBACK_URL=' + cfg.OAUTH_CALLBACKS.github);
console.log('  FACEBOOK_CALLBACK_URL=' + cfg.OAUTH_CALLBACKS.facebook);
console.log('');
