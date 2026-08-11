/**
 * Native app — restore session before auth UI paints (prevents login flash on reopen).
 * Also clears stuck auth-restoring hide states even if app.js never loads.
 */
(function () {
  'use strict';

  function isNative() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get('app') === '1' || q.get('source') === 'expo-app';
    } catch (_e) {
      return false;
    }
  }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {}
  }

  /** Usable session: profile + access or refresh token (native reinject can supply access). */
  function hasUsableSession() {
    try {
      const user = safeGet('user');
      const token = safeGet('token');
      const refresh = safeGet('ap_refresh_token');
      return Boolean(user && (token || refresh));
    } catch (_e) {
      return false;
    }
  }

  /** Any residual identity — used only to clean up incomplete state, not gate entry alone. */
  function hasPartialSession() {
    return Boolean(safeGet('user') || safeGet('token') || safeGet('ap_refresh_token'));
  }

  function clearSessionKeys() {
    safeRemove('user');
    safeRemove('token');
    safeRemove('ap_refresh_token');
    try {
      sessionStorage.removeItem('ap_session_ok_at');
      sessionStorage.removeItem('ap_last_session_refresh');
    } catch (_e) {}
  }

  function clearAuthRestoring() {
    try {
      document.documentElement.classList.remove('auth-restoring', 'auth-locked');
    } catch (_e) {}
    try {
      const explore = document.getElementById('exploreContent');
      if (explore) {
        explore.style.removeProperty('opacity');
        explore.style.removeProperty('pointer-events');
      }
    } catch (_e) {}
  }

  /**
   * Never leave the cream/blank auth-restoring hide without a hard upper bound.
   * Safe to call many times; does not depend on app.js.
   */
  function scheduleAuthRestoringClear() {
    if (window.__apAuthRestoreClearScheduled) {
      clearAuthRestoring();
      return;
    }
    window.__apAuthRestoreClearScheduled = true;
    [0, 600, 1200, 2500, 4000].forEach(function (ms) {
      setTimeout(clearAuthRestoring, ms);
    });
    try {
      window.addEventListener('pageshow', clearAuthRestoring);
      window.addEventListener('error', clearAuthRestoring);
      window.addEventListener('unhandledrejection', clearAuthRestoring);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') clearAuthRestoring();
      });
    } catch (_e) {}
  }

  window.ApSession = {
    isNative: isNative,
    hasUsableSession: hasUsableSession,
    hasPartialSession: hasPartialSession,
    clearSessionKeys: clearSessionKeys,
    clearAuthRestoring: clearAuthRestoring,
    scheduleAuthRestoringClear: scheduleAuthRestoringClear,
  };

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

  /* Always arm recovery, even on pages that do not redirect */
  scheduleAuthRestoringClear();

  function homeUrl() {
    const q = '?app=1&source=expo-app';
    let user = null;
    try {
      user = JSON.parse(safeGet('user') || 'null');
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

  /* Incomplete junk session → wipe and show welcome (never infinite restore) */
  if (hasPartialSession() && !hasUsableSession()) {
    clearSessionKeys();
    clearAuthRestoring();
  }

  if (onAuth && hasUsableSession()) {
    document.documentElement.classList.add('auth-restoring');
    scheduleAuthRestoringClear();
    try {
      window.location.replace(homeUrl());
    } catch (_e) {
      clearAuthRestoring();
    }
    return;
  }

  if (isAppEntry && !hasUsableSession()) {
    document.documentElement.classList.add('auth-restoring');
    scheduleAuthRestoringClear();
    try {
      window.location.replace('/app-auth.html?app=1&source=expo-app');
    } catch (_e) {
      clearAuthRestoring();
    }
    return;
  }

  /* First-time / logged-out auth screen must paint Welcome */
  if (onAuth && !hasUsableSession()) {
    clearAuthRestoring();
  }

  window.__AP_NATIVE_HOME__ = homeUrl;
})();
