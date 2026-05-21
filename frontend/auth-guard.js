/**
 * Native app auth gate — login/signup first, then app by role.
 */
(function () {
  const AUTH_PAGES = ['/app-auth.html', '/login.html', '/register.html', '/login-success.html'];

  function isNative() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  function pathEnds(p) {
    return (window.location.pathname || '').toLowerCase().endsWith(p);
  }

  function isAuthPage() {
    return AUTH_PAGES.some((p) => pathEnds(p));
  }

  function isLoggedIn() {
    return Boolean(localStorage.getItem('token'));
  }

  function getUser() {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function homeUrl(user) {
    const q = '?app=1';
    if (!user) return '/explore.html' + q;
    if (user.role === 'admin') return '/admin-dashboard.html' + q;
    if (user.role === 'worker') return '/worker-dashboard.html' + q;
    return '/explore.html' + q;
  }

  function markGuestUi() {
    document.documentElement.classList.add('auth-guest', 'auth-locked');
    document.documentElement.classList.remove('auth-ok');
    document.querySelectorAll('.social-bottom-nav, #social-bottom-nav-mount').forEach((el) => {
      el.innerHTML = '';
      el.style.display = 'none';
    });
  }

  function markAuthedUi() {
    document.documentElement.classList.remove('auth-guest', 'auth-locked');
    document.documentElement.classList.add('auth-ok');
  }

  async function validateSession() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      if (window.Auth && typeof Auth.refreshSession === 'function') {
        return await Auth.refreshSession();
      }
      const api = (window.CONFIG && CONFIG.API_URL) || 'https://ap-sevces.onrender.com/api';
      const res = await fetch(api + '/auth/me', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data?.user) return false;
      localStorage.setItem('user', JSON.stringify(data.data.user));
      if (window.AppState) {
        AppState.token = token;
        AppState.user = data.data.user;
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  function go(url) {
    if (!url || window.__apNavLock) return;
    window.__apNavLock = true;
    window.location.replace(url);
  }

  window.addEventListener('pageshow', () => {
    window.__apNavLock = false;
  });

  function bindAuthNavLinks() {
    document.querySelectorAll('[data-auth-nav]').forEach((el) => {
      if (el.dataset.authNavBound) return;
      el.dataset.authNavBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const href = el.getAttribute('href');
        if (href) go(href);
      });
    });
  }

  async function redirectIfAlreadyLoggedIn() {
    if (!isNative() || !isLoggedIn()) return;
    const ok = await validateSession();
    if (!ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      markGuestUi();
      return;
    }
    markAuthedUi();
    window.location.replace(homeUrl(getUser()));
  }

  async function requireAuth() {
    if (!isNative()) return;

    if (isAuthPage()) {
      markGuestUi();
      bindAuthNavLinks();
      if (isLoggedIn() && !window.__apNavLock) {
        setTimeout(() => redirectIfAlreadyLoggedIn(), 50);
      }
      return;
    }

    if (!isLoggedIn()) {
      markGuestUi();
      window.location.replace('/app-auth.html?app=1');
      return;
    }

    const ok = await validateSession();
    if (!ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      markGuestUi();
      window.location.replace('/app-auth.html?app=1');
      return;
    }
    markAuthedUi();
  }

  window.AppAuth = {
    isNative,
    isAuthPage,
    isLoggedIn,
    getUser,
    homeUrl,
    validateSession,
    redirectIfAlreadyLoggedIn,
    requireAuth,
    markGuestUi,
    markAuthedUi,
    go,
    bindAuthNavLinks,
  };

  function runOnce() {
    if (window.__AUTH_GUARD_RAN__) return;
    window.__AUTH_GUARD_RAN__ = true;
    if (!isNative()) return;
    markGuestUi();
    requireAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runOnce);
  } else {
    runOnce();
  }
})();
