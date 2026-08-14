/**
 * Runs synchronously in <head> — prevents blue legacy UI flash in Expo / native WebView.
 */
(function () {
  function isNative() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  if (!isNative()) return;

  window.__AP_NATIVE_APP__ = true;
  if (!window.__AP_API_URL__) {
    window.__AP_API_URL__ = (window.AP_CONFIG && AP_CONFIG.PRODUCTION_API_URL) || 'https://api.apservices.in/api';
  }
  const html = document.documentElement;
  const path = (window.location.pathname || '').toLowerCase();
  const SOCIAL_SHELL_PAGES = [
    '/explore.html', '/party.html', '/video.html', '/square.html', '/topics.html',
    '/store.html', '/vip.html', '/rankings.html', '/cp-rankings.html', '/cp-home.html', '/cp-tips.html',
    '/profile-tab.html', '/privileges.html',
    '/points.html', '/withdraw.html', '/chat.html', '/streamer-center.html',
    '/discover-creators.html', '/coins-recharge.html', '/coin-seller-center.html', '/coin-seller-recharge.html',
    '/live-verify.html', '/creator-profile.html',
  ];
  const isSocialShellPage = SOCIAL_SHELL_PAGES.some(function (p) { return path.endsWith(p); });

  html.classList.add('ap-expo-app', 'social-app', 'social-native');
  if (!isSocialShellPage) html.classList.add('social-bridge-mode');
  html.style.setProperty('--social-safe-top', '0px');
  const onAuth =
    path.endsWith('/app-auth.html') ||
    path.endsWith('/login.html') ||
    path.endsWith('/register.html') ||
    path.endsWith('/login-success.html');

  if (onAuth) html.classList.add('auth-guest', 'auth-native');

  const critical = document.getElementById('ap-native-critical');
  if (!critical) {
    const style = document.createElement('style');
    style.id = 'ap-native-critical';
    style.textContent = [
      'html.ap-expo-app,html.ap-expo-app body{background:#faf6ee!important;color:#6b4f10!important}',
      'html.ap-expo-app .chat-page{background:#faf6ee!important;padding:0!important}',
      'html.ap-expo-app .chat-layout{border-color:rgba(201,162,39,.2)!important;box-shadow:0 4px 16px rgba(107,79,16,.08)!important}',
      'html.ap-expo-app .chat-tab.active{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}',
      'html.ap-expo-app .chat-item.active{background:rgba(201,162,39,.12)!important;border-left-color:#c9a227!important}',
      'html.ap-expo-app .message-wrapper.sent .message-content{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}',
      'html.ap-expo-app .message-wrapper.received .message-content{background:#fff!important;color:#1f2937!important}',
      'html.ap-expo-app .chat-input-wrapper:focus-within{border-color:#c9a227!important;box-shadow:0 0 0 3px rgba(201,162,39,.2)!important}',
      'html.ap-expo-app .send-btn,html.ap-expo-app .chat-input-action.send-btn{background:linear-gradient(135deg,#ff8c42,#f59e0b)!important;color:#fff!important}',
      'html.ap-expo-app .unread-badge{background:#f59e0b!important}',
    ].join('');
    (document.head || html).appendChild(style);
  }

  if (path.includes('chat')) {
    /* Chat page must never be hidden at boot — caused blank/stuck Messages tab in WebView */
  }

  function hasUsableSession() {
    if (window.ApSession && typeof window.ApSession.hasUsableSession === 'function') {
      return window.ApSession.hasUsableSession();
    }
    try {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      const refresh = localStorage.getItem('ap_refresh_token');
      return Boolean(user && (token || refresh));
    } catch (_e) {
      return false;
    }
  }

  if (!onAuth && !hasUsableSession()) {
    if (path.endsWith('/explore.html')) {
      document.documentElement.classList.add('auth-restoring');
      try {
        window.ApSession?.scheduleAuthRestoringClear?.();
      } catch (_e) {}
      setTimeout(function () {
        try {
          document.documentElement.classList.remove('auth-restoring');
        } catch (_e2) {}
      }, 1200);
      location.replace('/app-auth.html?app=1&source=expo-app');
      return;
    }
    if (!path.includes('chat')) return;
    const dest = '/app-auth.html?app=1&redirect=' + encodeURIComponent(location.pathname + location.search);
    location.replace(dest);
    return;
  }

  ['/social-theme.css', '/social-nav.js'].forEach(function (href) {
    if (href.endsWith('.js')) {
      if (document.querySelector('script[src="' + href + '"]')) return;
      const script = document.createElement('script');
      script.src = href;
      script.defer = true;
      (document.head || html).appendChild(script);
      return;
    }
    if (document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || html).appendChild(link);
  });
})();
