(function () {
  function isNative() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  if (!isNative()) return;

  const q = new URLSearchParams(window.location.search);
  const appRedirect = q.get('app_redirect') || (typeof window.__AP_OAUTH_RETURN__ === 'string' && window.__AP_OAUTH_RETURN__);
  if (appRedirect) {
    try {
      localStorage.setItem('app_redirect', appRedirect);
    } catch (_e) {}
  }

  document.documentElement.classList.add('auth-native', 'ap-expo-app', 'social-app');
  document.body.style.background = '#faf6ee';

  const path = (window.location.pathname || '').toLowerCase();
  const onAuth =
    path.endsWith('/app-auth.html') ||
    path.endsWith('/login.html') ||
    path.endsWith('/register.html') ||
    path.endsWith('/login-success.html');

  if (onAuth) {
    document.documentElement.classList.add('auth-guest');
  }

  function patchLinks() {
    if (onAuth) return;
    document.querySelectorAll('a[href^="/"]:not([data-auth-nav])').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.includes('app=1')) return;
      const sep = href.includes('?') ? '&' : '?';
      a.setAttribute('href', href + sep + 'app=1');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchLinks);
  } else {
    patchLinks();
  }
})();
