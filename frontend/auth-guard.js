/**
 * Native app auth — Welcome first; app pages need a saved token.
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
    return Boolean(localStorage.getItem('user') || localStorage.getItem('token'));
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
    const q = '?app=1&source=expo-app';
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
    refreshAppNavigation();
  }

  function refreshAppNavigation() {
    if (!isLoggedIn()) return;
    const navId = window.AppShell?.navIdForPath?.() || 'explore';
    if (window.SocialShell?.ensureBottomNav) {
      window.SocialShell.ensureBottomNav(navId);
    } else if (window.SocialShell?.renderBottomNav) {
      const mount = document.getElementById('social-bottom-nav-mount');
      if (mount) {
        mount.innerHTML = window.SocialShell.renderBottomNav(navId);
        mount.style.display = '';
      }
    }
    if (window.AppShell?.init) {
      window.AppShell.init().catch(() => {});
    }
  }

  async function validateSession() {
    const cachedUser = getUser();
    if (cachedUser && window.AppState) {
      AppState.user = cachedUser;
    }

    try {
      if (window.Auth && typeof Auth.refreshSession === 'function') {
        const ok = await Auth.refreshSession();
        if (ok) return true;
        if (!localStorage.getItem('user')) return false;
        return Boolean(cachedUser || getUser());
      }
      const api =
        (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) ||
        (window.CONFIG && CONFIG.API_URL) ||
        (window.AP_CONFIG && AP_CONFIG.PRODUCTION_API_URL) ||
        'http://62.72.56.74:5000/api';
      const res = await fetch(api + '/auth/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (cachedUser || getUser()) return true;
        localStorage.removeItem('user');
        return false;
      }
      if (res.ok && data.success && data.data?.user) {
        localStorage.setItem('user', JSON.stringify(data.data.user));
        if (window.AppState) AppState.user = data.data.user;
        return true;
      }
      return Boolean(cachedUser || getUser());
    } catch (_e) {
      return Boolean(localStorage.getItem('user') && (cachedUser || getUser()));
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

  function completeLoginAndEnterApp(user) {
    if (user) {
      try {
        localStorage.setItem('user', JSON.stringify(user));
        if (window.AppState) {
          AppState.user = user;
        }
      } catch (_e) {}
    }
    markAuthedUi();
    window.location.replace(homeUrl(user || getUser()));
  }

  async function requireAuth() {
    if (!isNative()) return;

    if (pathEnds('/login-success.html')) return;

    if (isAuthPage()) {
      if (isLoggedIn()) {
        completeLoginAndEnterApp(getUser());
        return;
      }
      markGuestUi();
      bindAuthNavLinks();
      return;
    }

    if (!isLoggedIn()) {
      markGuestUi();
      window.location.replace('/app-auth.html?app=1');
      return;
    }

    markAuthedUi();

    validateSession().then((ok) => {
      if (!ok && !isLoggedIn()) {
        markGuestUi();
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.replace('/app-auth.html?app=1');
        return;
      }
      refreshAppNavigation();
    });

    [150, 500, 1200].forEach((ms) => {
      setTimeout(refreshAppNavigation, ms);
    });
  }

  window.AppAuth = {
    isNative,
    isAuthPage,
    isLoggedIn,
    getUser,
    homeUrl,
    validateSession,
    completeLoginAndEnterApp,
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
    requireAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runOnce);
  } else {
    runOnce();
  }
})();
