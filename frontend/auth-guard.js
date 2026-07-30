/**
 * Native app auth — Welcome first; app pages need a saved token.
 */
(function () {
  const AUTH_PAGES = ['/app-auth.html', '/login.html', '/register.html', '/login-success.html'];
  const IMMERSIVE_LIVE_PAGES = ['/live-room.html', '/party-room.html'];

  function isImmersiveLivePage() {
    return IMMERSIVE_LIVE_PAGES.some((p) => pathEnds(p));
  }

  function isAppChromeNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    if (el.id === 'partyBottomBar' || el.classList?.contains('party-bottom-bar')) return false;
    if (el.matches?.(
      '.social-bottom-nav, #social-bottom-nav-mount, .social-bridge-header, #ap-bridge-header, .navbar, footer.site-footer, header.site-header'
    )) {
      return true;
    }
    return Boolean(
      el.querySelector?.('.social-bottom-nav, #ap-bridge-header, .social-bridge-header, #social-bottom-nav-mount')
    );
  }

  function hideImmersiveLiveChrome() {
    document.documentElement.classList.add('ap-live-immersive');
    document.documentElement.classList.remove('social-bridge-mode');
    document.documentElement.style.setProperty('--social-bottom-nav-h', '0px');
    if (document.body) {
      document.body.classList.add('ap-live-immersive');
      document.body.style.setProperty('padding-top', '0', 'important');
      document.body.style.setProperty('padding-bottom', '0', 'important');
      document.body.style.setProperty('background', '#000', 'important');
    }
    document.getElementById('ap-bridge-header')?.remove();
    document.querySelectorAll(
      '.social-bottom-nav, #social-bottom-nav-mount, .social-bridge-header, .navbar, footer.site-footer, header.site-header'
    ).forEach((el) => {
      if (el.id === 'partyBottomBar' || el.classList.contains('party-bottom-bar')) return;
      el.remove();
    });
  }

  function watchImmersiveLiveChrome() {
    if (!isImmersiveLivePage()) return;
    hideImmersiveLiveChrome();
    [50, 200, 600, 1500, 3000].forEach((ms) => setTimeout(hideImmersiveLiveChrome, ms));
    if (window.__AP_IMMERSIVE_CHROME_OBS__) return;
    let debounceTimer = null;
    window.__AP_IMMERSIVE_CHROME_OBS__ = new MutationObserver((mutations) => {
      const chromeAdded = mutations.some(
        (m) => m.type === 'childList' && Array.from(m.addedNodes).some(isAppChromeNode)
      );
      if (!chromeAdded) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(hideImmersiveLiveChrome, 80);
    });
    window.__AP_IMMERSIVE_CHROME_OBS__.observe(document.body, { childList: true, subtree: false });
  }

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
    if (isImmersiveLivePage()) {
      watchImmersiveLiveChrome();
      return;
    }
    refreshAppNavigation();
  }

  function refreshAppNavigation() {
    if (isImmersiveLivePage()) {
      watchImmersiveLiveChrome();
      return;
    }
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

  let lastSessionOkAt = 0;
  const SESSION_OK_TTL_MS = 90 * 1000;

  async function validateSession() {
    const cachedUser = getUser();
    if (cachedUser && window.AppState) {
      AppState.user = cachedUser;
    }

    /* Tab switches reload the whole HTML page — don't re-hit /auth on every tap */
    if (cachedUser && Date.now() - lastSessionOkAt < SESSION_OK_TTL_MS) {
      return true;
    }
    try {
      const memo = Number(sessionStorage.getItem('ap_session_ok_at') || 0);
      if (cachedUser && Date.now() - memo < SESSION_OK_TTL_MS) {
        lastSessionOkAt = memo;
        return true;
      }
    } catch (_e) {}

    try {
      if (window.Auth && typeof Auth.refreshSession === 'function') {
        const ok = await Auth.refreshSession();
        if (ok) {
          lastSessionOkAt = Date.now();
          try {
            sessionStorage.setItem('ap_session_ok_at', String(lastSessionOkAt));
          } catch (_e) {}
          return true;
        }
        if (!localStorage.getItem('user')) return false;
        return Boolean(cachedUser || getUser());
      }
      const api = (window.normalizeApiUrl || ((u) => u || 'https://api.apservices.in/api'))(
        (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) ||
          (window.CONFIG && CONFIG.API_URL) ||
          (window.AP_CONFIG && AP_CONFIG.PRODUCTION_API_URL) ||
          'https://api.apservices.in/api'
      );
      const res = await fetch(api + '/auth/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        const msg = data.message || '';
        if (msg.toLowerCase().includes('deactivat') || msg.toLowerCase().includes('inactive')) {
          try {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            localStorage.removeItem('ap_refresh_token');
          } catch (_e) {}
          markGuestUi();
          const dest = '/app-auth.html?app=1&error=account_deactivated';
          window.location.replace(dest);
          return false;
        }
      }
      if (res.status === 401) {
        if (cachedUser || getUser()) return true;
        localStorage.removeItem('user');
        return false;
      }
      if (res.ok && data.success && data.data?.user) {
        localStorage.setItem('user', JSON.stringify(data.data.user));
        if (window.AppState) AppState.user = data.data.user;
        lastSessionOkAt = Date.now();
        try {
          sessionStorage.setItem('ap_session_ok_at', String(lastSessionOkAt));
        } catch (_e) {}
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
    if (window.SocialShell?.spaNavigate) {
      SocialShell.spaNavigate(url, { replace: true });
      window.__apNavLock = false;
      return;
    }
    if (typeof window.__apSpaNavigate === 'function' && window.__apSpaNavigate(url, { replace: true })) {
      window.__apNavLock = false;
      return;
    }
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

  function clearAuthRestoring() {
    document.documentElement.classList.remove('auth-restoring');
  }

  async function requireAuth() {
    if (!isNative()) return;

    if (pathEnds('/login-success.html')) return;

    if (isAuthPage()) {
      if (isLoggedIn()) {
        document.documentElement.classList.add('auth-restoring');
        const restoreTimer = setTimeout(clearAuthRestoring, 2500);
        validateSession().then((ok) => {
          clearTimeout(restoreTimer);
          clearAuthRestoring();
          if (ok) {
            completeLoginAndEnterApp(getUser());
            return;
          }
          try {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            localStorage.removeItem('ap_refresh_token');
          } catch (_e) {}
          markGuestUi();
          bindAuthNavLinks();
        });
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

    if (isImmersiveLivePage()) {
      watchImmersiveLiveChrome();
      validateSession().catch(() => {});
      return;
    }

    markAuthedUi();

    /* Don't hold UI behind a 2.5s auth timer — paint immediately; validate in background */
    clearAuthRestoring();
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

    [80, 400].forEach((ms) => {
      setTimeout(refreshAppNavigation, ms);
    });
  }

  window.AppAuth = {
    isNative,
    isAuthPage,
    isImmersiveLivePage,
    hideImmersiveLiveChrome,
    watchImmersiveLiveChrome,
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
