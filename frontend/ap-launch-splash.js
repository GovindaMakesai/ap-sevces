/**
 * Full-screen launch promo — once per session, coconut-style skip countdown.
 */
(function () {
  const IMAGE = '/assets/promos/reality-show-antakshari.jpg?v=20260903';
  const STORAGE_KEY = 'ap_reality_splash_done_v3';
  const DURATION_MS = 5000;

  function isNativeApp() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  function shouldShow() {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return false;
    } catch (_e) {
      return false;
    }
    return isNativeApp();
  }

  function mount() {
    if (!shouldShow() || document.getElementById('apLaunchSplash')) return;

    document.documentElement.classList.add('ap-launch-splash-open', 'ap-launch-splash-pending');

    const root = document.createElement('div');
    root.id = 'apLaunchSplash';
    root.className = 'ap-launch-splash';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '1st Reality Show promotion');
    root.innerHTML =
      '<img class="ap-launch-splash__img" src="' +
      IMAGE +
      '" alt="1st Reality Show — Antakshari, powered by AP Service">' +
      '<button type="button" class="ap-launch-splash__skip"><span class="ap-launch-splash__skip-n">5</span>s skip</button>';

    let done = false;
    let left = 5;
    let tickTimer = null;
    let autoTimer = null;
    const skipBtn = () => root.querySelector('.ap-launch-splash__skip');
    const skipNum = () => root.querySelector('.ap-launch-splash__skip-n');

    function finish() {
      if (done) return;
      done = true;
      if (tickTimer) window.clearInterval(tickTimer);
      if (autoTimer) window.clearTimeout(autoTimer);
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (_e) {}
      root.classList.add('is-hiding');
      document.documentElement.classList.remove('ap-launch-splash-open', 'ap-launch-splash-pending');
      window.setTimeout(function () {
        root.remove();
      }, 320);
    }

    tickTimer = window.setInterval(function () {
      left = Math.max(0, left - 1);
      if (skipNum()) skipNum().textContent = String(left);
      if (left <= 0 && skipBtn()) skipBtn().textContent = 'skip';
    }, 1000);

    (document.body || document.documentElement).appendChild(root);
    skipBtn()?.addEventListener('click', finish);
    autoTimer = window.setTimeout(finish, DURATION_MS);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
})();
