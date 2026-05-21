/**
 * Shared OAuth handlers for app-auth, login, register (native + web).
 */
(function () {
  const AUTH_BASE_URL =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5000'
      : 'https://ap-sevces.onrender.com';

  function redirectToOAuth(provider) {
    const roleFromUrl = new URLSearchParams(window.location.search).get('role') || 'customer';
    const appRedirect =
      new URLSearchParams(window.location.search).get('app_redirect') ||
      localStorage.getItem('app_redirect') ||
      '';
    const inApp =
      Boolean(window.ReactNativeWebView) ||
      Boolean(window.__AP_NATIVE_APP__) ||
      new URLSearchParams(window.location.search).get('source') === 'expo-app';

    const authUrl =
      `${AUTH_BASE_URL}/auth/${provider}?role=${encodeURIComponent(roleFromUrl)}` +
      (appRedirect ? `&app_redirect=${encodeURIComponent(appRedirect)}` : '');

    if (inApp) {
      window.location.replace(authUrl);
      return;
    }
    window.location.href = authUrl;
  }

  function bindOAuthButtons(root) {
    const scope = root || document;
    const map = [
      ['googleLogin', 'google'],
      ['facebookLogin', 'facebook'],
      ['githubLogin', 'github'],
    ];
    map.forEach(([id, provider]) => {
      const el = scope.getElementById(id);
      if (!el || el.dataset.oauthBound) return;
      el.dataset.oauthBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        redirectToOAuth(provider);
      });
    });
  }

  window.AuthOAuth = { redirectToOAuth, bindOAuthButtons, AUTH_BASE_URL };
})();
