/**
 * OAuth — production uses api.apservices.in for start + callback + post-login redirect.
 * Native app must never assign location.href to an empty/undefined origin (Android:
 * "Error loading page / Domain: undefined / ERR_NAME_NOT_RESOLVED").
 */
(function () {
  var FALLBACK_ORIGIN = 'https://api.apservices.in';

  function cleanOrigin(raw) {
    var s = String(raw || '').trim().replace(/\/$/, '');
    if (!s || s === 'undefined' || s === 'null') return '';
    if (!/^https?:\/\//i.test(s)) return '';
    try {
      var u = new URL(s);
      if (!u.hostname || u.hostname === 'undefined') return '';
      return s;
    } catch (_e) {
      return '';
    }
  }

  function apiOrigin() {
    return (
      cleanOrigin(window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL) ||
      FALLBACK_ORIGIN
    );
  }

  function backendUrl() {
    return apiOrigin();
  }

  function frontendUrl() {
    return (
      cleanOrigin(window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_FRONTEND_URL) ||
      apiOrigin()
    );
  }

  function isNativeApp() {
    if (window.ReactNativeWebView || window.__AP_NATIVE_APP__ || window.Capacitor) return true;
    try {
      var q = new URLSearchParams(window.location.search || '');
      return q.get('app') === '1' || q.get('source') === 'expo-app';
    } catch (_e) {
      return false;
    }
  }

  function getAuthOrigin() {
    var host = window.location.hostname || '';
    var port = window.location.port || '';
    var isLan =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isLan && port === '5500') {
      return cleanOrigin(window.location.origin) || apiOrigin();
    }
    return apiOrigin();
  }

  function redirectToOAuth(provider) {
    var role = 'customer';
    var appRedirect = '';
    try {
      var params = new URLSearchParams(window.location.search || '');
      role = params.get('role') || 'customer';
      appRedirect =
        params.get('app_redirect') ||
        (typeof window.__AP_OAUTH_RETURN__ === 'string' && window.__AP_OAUTH_RETURN__) ||
        localStorage.getItem('app_redirect') ||
        '';
    } catch (_e) {}

    if (appRedirect && String(appRedirect).includes('undefined')) appRedirect = '';
    if (appRedirect) {
      try {
        localStorage.setItem('app_redirect', appRedirect);
      } catch (_e2) {}
    }

    if (isNativeApp()) {
      try {
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: 'oauth', provider: provider, role: role, appRedirect: appRedirect })
        );
      } catch (_e3) {}
      /* Never fall through to location.href in the app WebView — custom-scheme
         returns show Domain: undefined on Android. Native handler opens the browser. */
      return;
    }

    var authBase = getAuthOrigin() || FALLBACK_ORIGIN;
    var url =
      authBase +
      '/auth/' +
      encodeURIComponent(provider) +
      '?role=' +
      encodeURIComponent(role) +
      (appRedirect ? '&app_redirect=' + encodeURIComponent(appRedirect) : '');
    window.location.href = url;
  }

  function bindOAuthButtons(root) {
    var scope = root || document;
    [['googleLogin', 'google'], ['facebookLogin', 'facebook'], ['githubLogin', 'github']].forEach(
      function (pair) {
        var id = pair[0];
        var provider = pair[1];
        var el = scope.getElementById(id);
        if (!el || el.dataset.oauthBound) return;
        el.dataset.oauthBound = '1';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          redirectToOAuth(provider);
        });
      }
    );
  }

  function showAuthPageErrors() {
    var params = new URLSearchParams(window.location.search);
    var message = '';
    if (params.get('error') === 'account_deactivated') {
      message = 'Your account has been deactivated. Please contact support if you believe this is a mistake.';
    }
    try {
      var stored = sessionStorage.getItem('ap_account_deactivated');
      if (stored) {
        sessionStorage.removeItem('ap_account_deactivated');
        message = stored;
      }
    } catch (_e) { /* ignore */ }

    if (!message) return;

    var alertBox = document.getElementById('alertContainer');
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
    redirectToOAuth: redirectToOAuth,
    bindOAuthButtons: bindOAuthButtons,
    showAuthPageErrors: showAuthPageErrors,
    get AUTH_BASE_URL() {
      return getAuthOrigin();
    },
    getAuthOrigin: getAuthOrigin,
    backendUrl: backendUrl,
    frontendUrl: frontendUrl,
    vercelUrl: frontendUrl,
  };
})();
