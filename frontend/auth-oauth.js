/**
 * OAuth — Expo opens system browser via postMessage; LAN dev uses same-origin /auth proxy.
 */
(function () {
  function getAuthOrigin() {
    const host = window.location.hostname || '';
    const isLan =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isLan || window.location.port === '5500') {
      return window.location.origin.replace(/\/$/, '');
    }
    return 'https://ap-sevces.onrender.com';
  }

  const AUTH_BASE_URL = getAuthOrigin();

  function redirectToOAuth(provider) {
    const role =
      new URLSearchParams(window.location.search).get('role') || 'customer';
    const appRedirect =
      new URLSearchParams(window.location.search).get('app_redirect') ||
      localStorage.getItem('app_redirect') ||
      '';

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'oauth', provider, role, appRedirect })
      );
      return;
    }

    const authUrl =
      `${AUTH_BASE_URL}/auth/${provider}?role=${encodeURIComponent(role)}` +
      (appRedirect ? `&app_redirect=${encodeURIComponent(appRedirect)}` : '');

    window.location.href = authUrl;
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

  window.AuthOAuth = { redirectToOAuth, bindOAuthButtons, AUTH_BASE_URL, getAuthOrigin };
})();
