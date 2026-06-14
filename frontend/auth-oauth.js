/**
 * OAuth — API runs on VPS (62.72.56.74:5000).
 * Callback URLs are HTTPS on Vercel; bridge forwards ?code= to VPS.
 */
(function () {
  function backendUrl() {
    return (
      (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL) ||
      'http://62.72.56.74:5000'
    ).replace(/\/$/, '');
  }

  function vercelUrl() {
    return (
      (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_FRONTEND_URL) ||
      'https://ap-sevces.vercel.app'
    ).replace(/\/$/, '');
  }

  function getAuthOrigin() {
    if (window.AP_CONFIG && window.AP_CONFIG.USE_HTTPS_DOMAIN) {
      return window.AP_CONFIG.PRODUCTION_BACKEND_URL.replace(/\/$/, '');
    }

    const host = window.location.hostname || '';
    const port = window.location.port || '';

    // Web on Vercel — /auth rewrites to VPS
    if (/\.vercel\.app$/i.test(host)) {
      return window.location.origin.replace(/\/$/, '');
    }

    // Local dev — dev-server proxies /auth → VPS
    const isLan =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isLan && port === '5500') {
      return window.location.origin.replace(/\/$/, '');
    }

    // Native app / direct — hit VPS backend directly
    if (window.ReactNativeWebView || window.__AP_NATIVE_APP__) {
      return backendUrl();
    }

    return vercelUrl();
  }

  function redirectToOAuth(provider) {
    const role =
      new URLSearchParams(window.location.search).get('role') || 'customer';
    const appRedirect =
      new URLSearchParams(window.location.search).get('app_redirect') ||
      (typeof window.__AP_OAUTH_RETURN__ === 'string' && window.__AP_OAUTH_RETURN__) ||
      localStorage.getItem('app_redirect') ||
      '';

    if (appRedirect) {
      try {
        localStorage.setItem('app_redirect', appRedirect);
      } catch (_e) {}
    }

    // In the mobile app, always use native browser — never navigate WebView to OAuth
    if (window.ReactNativeWebView || window.__AP_NATIVE_APP__) {
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({ type: 'oauth', provider, role, appRedirect })
      );
      if (window.ReactNativeWebView) return;
    }

    const authBase = getAuthOrigin();
    window.location.href =
      `${authBase}/auth/${provider}?role=${encodeURIComponent(role)}` +
      (appRedirect ? `&app_redirect=${encodeURIComponent(appRedirect)}` : '');
  }

  function bindOAuthButtons(root) {
    const scope = root || document;
    [['googleLogin', 'google'], ['facebookLogin', 'facebook'], ['githubLogin', 'github']].forEach(
      ([id, provider]) => {
        const el = scope.getElementById(id);
        if (!el || el.dataset.oauthBound) return;
        el.dataset.oauthBound = '1';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          redirectToOAuth(provider);
        });
      }
    );
  }

  window.AuthOAuth = {
    redirectToOAuth,
    bindOAuthButtons,
    get AUTH_BASE_URL() {
      return getAuthOrigin();
    },
    getAuthOrigin,
    backendUrl,
    vercelUrl,
  };
})();
