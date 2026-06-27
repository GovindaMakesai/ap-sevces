/**
 * Browser config — keep in sync with config/domain.js + production-api.js
 */
(function (g) {
  // After HTTPS: set USE_HTTPS = true and PUBLIC_HTTPS_URL to your domain
  var USE_HTTPS = true;
  var PUBLIC_HTTPS_URL = 'https://api.apservices.in';
  var VPS_HTTP = 'http://62.72.56.74:5000';
  var VERCEL_UI = 'https://ap-sevces.vercel.app';

  var BACKEND = USE_HTTPS ? PUBLIC_HTTPS_URL : VPS_HTTP;
  var FRONTEND = USE_HTTPS ? PUBLIC_HTTPS_URL : VERCEL_UI;
  var OAUTH_BASE = USE_HTTPS ? PUBLIC_HTTPS_URL : VERCEL_UI;

  g.AP_CONFIG = Object.freeze({
    USE_HTTPS_DOMAIN: USE_HTTPS,
    BUILD_TAG: '20260630-follow-fix',
    PRODUCTION_BACKEND_URL: BACKEND,
    PRODUCTION_API_URL: BACKEND.replace(/\/$/, '') + '/api',
    PRODUCTION_FRONTEND_URL: FRONTEND,
    OAUTH_CALLBACK_BASE: OAUTH_BASE,
    OAUTH_CALLBACKS: {
      google: OAUTH_BASE + '/auth/google/callback',
      github: OAUTH_BASE + '/auth/github/callback',
      facebook: OAUTH_BASE + '/auth/facebook/callback',
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
