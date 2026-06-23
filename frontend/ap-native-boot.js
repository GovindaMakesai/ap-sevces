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
  const html = document.documentElement;
  html.classList.add('ap-expo-app', 'social-app', 'social-bridge-mode', 'social-native');

  const path = (window.location.pathname || '').toLowerCase();
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
      'html.ap-expo-app .chat-input-wrapper:focus-within{border-color:#c9a227!important;box-shadow:0 0 0 3px rgba(201,162,39,.2)!important}',
      'html.ap-expo-app .send-btn,html.ap-expo-app .chat-input-action.send-btn{background:linear-gradient(135deg,#ff8c42,#f59e0b)!important;color:#fff!important}',
      'html.ap-expo-app .unread-badge{background:#f59e0b!important}',
      'html.ap-expo-app body.ap-chat-boot{opacity:0}',
      'html.ap-expo-app body.ap-chat-ready{opacity:1;transition:opacity .15s ease}',
    ].join('');
    (document.head || html).appendChild(style);
  }

  if (path.includes('chat')) {
    const markChatBoot = function () {
      if (document.body) document.body.classList.add('ap-chat-boot');
    };
    if (document.body) markChatBoot();
    else document.addEventListener('DOMContentLoaded', markChatBoot, { once: true });
  }

  if (!onAuth && !localStorage.getItem('user') && !localStorage.getItem('token')) {
    if (path.endsWith('/explore.html')) {
      document.documentElement.classList.add('auth-restoring');
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
