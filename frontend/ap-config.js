/**
 * Browser API config — keep in sync with config/production-api.js
 */
(function (g) {
  const PRODUCTION_BACKEND_URL = 'http://62.72.56.74:5000';
  const PRODUCTION_API_URL = PRODUCTION_BACKEND_URL + '/api';
  g.AP_CONFIG = Object.freeze({
    PRODUCTION_BACKEND_URL,
    PRODUCTION_API_URL,
    PRODUCTION_FRONTEND_URL: 'https://ap-sevces.vercel.app',
    LEGACY_RENDER_BACKEND_URL: 'https://ap-sevces.onrender.com',
    LEGACY_RENDER_API_URL: 'https://ap-sevces.onrender.com/api',
  });
})(typeof window !== 'undefined' ? window : globalThis);
