/**
 * Native app — restore session before auth UI paints (prevents login flash on reopen).
 */
(function () {
  'use strict';

  function isNative() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  if (!isNative()) return;

  (function injectRestoreStyle() {
    if (document.getElementById('ap-auth-restore-style')) return;
    const style = document.createElement('style');
    style.id = 'ap-auth-restore-style';
    style.textContent =
      'html.auth-restoring{background:#fdf9f0!important}' +
      'html.auth-restoring body{background:#fdf9f0!important}' +
      'html.auth-restoring .auth-gate-scroll,html.auth-restoring .auth-page,' +
      'html.auth-restoring .auth-gate-card,html.auth-restoring .register-page,' +
      'html.auth-restoring .social-top,html.auth-restoring #exploreContent{' +
      'opacity:0!important;pointer-events:none!important}';
    (document.head || document.documentElement).appendChild(style);
  })();

  function hasSession() {
    try {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      const refresh = localStorage.getItem('ap_refresh_token');
      return Boolean(user && (token || refresh));
    } catch (_e) {
      return false;
    }
  }

  function homeUrl() {
    const q = '?app=1&source=expo-app';
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem('user') || 'null');
    } catch (_e) {
      user = null;
    }
    if (user && user.role === 'admin') return '/admin-dashboard.html' + q;
    if (user && user.role === 'worker') return '/worker-dashboard.html' + q;
    return '/explore.html' + q;
  }

  const path = (window.location.pathname || '').toLowerCase();

  if (path.endsWith('/login-success.html')) return;

  const onAuth =
    path.endsWith('/app-auth.html') ||
    path.endsWith('/login.html') ||
    path.endsWith('/register.html');

  const isAppEntry = path.endsWith('/explore.html');

  if (onAuth && hasSession()) {
    document.documentElement.classList.add('auth-restoring');
    window.location.replace(homeUrl());
    return;
  }

  if (isAppEntry && !hasSession()) {
    document.documentElement.classList.add('auth-restoring');
    window.location.replace('/app-auth.html?app=1&source=expo-app');
    return;
  }

  window.__AP_NATIVE_HOME__ = homeUrl;
})();
