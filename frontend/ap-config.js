/**
 * Browser config — keep in sync with config/production-api.js
 */
(function (g) {
  const PRODUCTION_BACKEND_URL = 'http://62.72.56.74:5000';
  const PRODUCTION_FRONTEND_URL = 'https://ap-sevces.vercel.app';
  const OAUTH_CALLBACK_BASE = PRODUCTION_FRONTEND_URL;
  g.AP_CONFIG = Object.freeze({
    PRODUCTION_BACKEND_URL,
    PRODUCTION_API_URL: PRODUCTION_BACKEND_URL + '/api',
    PRODUCTION_FRONTEND_URL,
    OAUTH_CALLBACK_BASE,
    OAUTH_CALLBACKS: {
      google: OAUTH_CALLBACK_BASE + '/auth/google/callback',
      github: OAUTH_CALLBACK_BASE + '/auth/github/callback',
      facebook: OAUTH_CALLBACK_BASE + '/auth/facebook/callback',
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
