/**
 * OAuth — production uses api.apservices.in for start + callback + post-login redirect.
 * Vercel is static UI only; do not route OAuth through vercel.app (502 / wrong redirect).
 */
(function () {
  function apiOrigin() {
    return (
      (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL) ||
      'https://api.apservices.in'
    ).replace(/\/$/, '');
  }

  function backendUrl() {
    return apiOrigin();
  }

  function frontendUrl() {
    return (
      (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_FRONTEND_URL) ||
      apiOrigin()
    ).replace(/\/$/, '');
  }

  function getAuthOrigin() {
    if (window.AP_CONFIG && window.AP_CONFIG.USE_HTTPS_DOMAIN) {
      return apiOrigin();
    }

    const host = window.location.hostname || '';
    const port = window.location.port || '';

    const isLan =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isLan && port === '5500') {
      return window.location.origin.replace(/\/$/, '');
    }

    if (window.ReactNativeWebView || window.__AP_NATIVE_APP__) {
      return apiOrigin();
    }

    return apiOrigin();
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

  function showAuthPageErrors() {
    const params = new URLSearchParams(window.location.search);
    let message = '';
    if (params.get('error') === 'account_deactivated') {
      message = 'Your account has been deactivated. Please contact support if you believe this is a mistake.';
    }
    try {
      const stored = sessionStorage.getItem('ap_account_deactivated');
      if (stored) {
        sessionStorage.removeItem('ap_account_deactivated');
        message = stored;
      }
    } catch (_e) { /* ignore */ }

    if (!message) return;

    const alertBox = document.getElementById('alertContainer');
    if (alertBox) {
      alertBox.innerHTML =
        '<div class="alert-error" role="alert" style="margin-bottom:16px;padding:12px 14px;border-radius:10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;">' +
        message +
        '</div>';
    } else if (window.Toast && typeof Toast.show === 'function') {
      Toast.show(message, 'error');
    }
  }

  window.AuthOAuth = {
    redirectToOAuth,
    bindOAuthButtons,
    showAuthPageErrors,
    get AUTH_BASE_URL() {
      return getAuthOrigin();
    },
    getAuthOrigin,
    backendUrl,
    frontendUrl,
    vercelUrl: frontendUrl,
  };
})();
