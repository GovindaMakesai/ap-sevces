/**
 * 5s skippable launch promo — once per browser/app session.
 */
(function () {
  const STORAGE_KEY = 'ap_reality_splash_done_v1';
  const DURATION_MS = 5000;
  const IMAGE = '/assets/promos/reality-show-antakshari.jpg';

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

    const root = document.createElement('div');
    root.id = 'apLaunchSplash';
    root.className = 'ap-launch-splash';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '1st Reality Show promotion');
    root.innerHTML =
      '<div class="ap-launch-splash__img-wrap">' +
      '<img class="ap-launch-splash__img" src="' +
      IMAGE +
      '" alt="1st Reality Show — Antakshari, powered by AP Service">' +
      '</div>' +
      '<div class="ap-launch-splash__progress" aria-hidden="true"><i></i></div>' +
      '<div class="ap-launch-splash__bar">' +
      '<span class="ap-launch-splash__hint">1st Reality Show · Sep 1–7</span>' +
      '<button type="button" class="ap-launch-splash__skip">Skip</button>' +
      '</div>';

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (_e) {}
      root.classList.add('is-hiding');
      document.documentElement.classList.remove('ap-launch-splash-open');
      window.setTimeout(function () {
        root.remove();
      }, 380);
    }

    document.documentElement.classList.add('ap-launch-splash-open');
    (document.body || document.documentElement).appendChild(root);
    root.querySelector('.ap-launch-splash__skip')?.addEventListener('click', finish);
    root.addEventListener('click', function (e) {
      if (e.target === root) finish();
    });
    window.setTimeout(finish, DURATION_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
