/**
 * Compatibility shim — some pages still reference config.js.
 * Always load ap-config.js before app.js; this file prevents 404 on missing script.
 */
(function () {
  if (window.AP_CONFIG) return;
  var USE_HTTPS = true;
  var PUBLIC_HTTPS_URL = 'https://api.apservices.in';
  var VPS_HTTP = 'http://62.72.56.74:5000';
  var VERCEL_UI = 'https://ap-sevces.vercel.app';
  var BACKEND = USE_HTTPS ? PUBLIC_HTTPS_URL : VPS_HTTP;
  var FRONTEND = USE_HTTPS ? PUBLIC_HTTPS_URL : VERCEL_UI;
  window.AP_CONFIG = Object.freeze({
    USE_HTTPS_DOMAIN: USE_HTTPS,
    PRODUCTION_BACKEND_URL: BACKEND,
    PRODUCTION_API_URL: BACKEND.replace(/\/$/, '') + '/api',
    PRODUCTION_FRONTEND_URL: FRONTEND,
    OAUTH_CALLBACK_BASE: FRONTEND,
    OAUTH_CALLBACKS: {
      google: FRONTEND + '/auth/google/callback',
      github: FRONTEND + '/auth/github/callback',
      facebook: FRONTEND + '/auth/facebook/callback',
    },
  });
})();
