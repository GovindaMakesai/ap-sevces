/**
 * Production API — keep in sync with config/production-api.js (repo root).
 */
module.exports = {
  BACKEND_URL: 'http://62.72.56.74:5000',
  FRONTEND_URL: 'https://ap-sevces.vercel.app',
  LEGACY_RENDER_BACKEND: 'https://ap-sevces.onrender.com',
  get API_URL() {
    return `${this.BACKEND_URL.replace(/\/$/, '')}/api`;
  },
  get LEGACY_RENDER_API() {
    return `${this.LEGACY_RENDER_BACKEND.replace(/\/$/, '')}/api`;
  },
};
