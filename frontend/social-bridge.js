/**
 * Wraps legacy marketplace pages in the native social app shell (header + bottom nav).
 */
(function () {
  const SOCIAL_PAGES = [
    '/explore.html', '/party.html', '/video.html', '/square.html', '/topics.html',
    '/store.html', '/vip.html', '/rankings.html', '/profile-tab.html', '/privileges.html',
    '/points.html', '/withdraw.html', '/withdraw-details.html', '/withdraw-notices.html',
  ];

  const AUTH_PAGES = ['/app-auth.html', '/login.html', '/register.html', '/login-success.html'];

  const TITLES = {
    'services.html': 'Services',
    'service-details.html': 'Service',
    'worker-profile.html': 'Pro Profile',
    'booking.html': 'Book Now',
    'booking-details.html': 'Booking',
    'payment.html': 'Payment',
    'chat.html': 'Messages',
    'login.html': 'Sign In',
    'register.html': 'Register',
    'login-success.html': 'Welcome',
    'customer-dashboard.html': 'My Bookings',
    'worker-dashboard.html': 'Pro Dashboard',
    'admin-dashboard.html': 'Admin',
    'become-a-pro.html': 'Become a Pro',
    'help.html': 'Help',
    'index.html': 'AP Services',
  };

  function isAppMode() {
    if (window.__AP_NATIVE_APP__) return true;
    if (window.ReactNativeWebView || window.Capacitor) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
  }

  function isSocialOnlyPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return SOCIAL_PAGES.some((p) => path.endsWith(p));
  }

  function navIdForPath() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('chat')) return 'chat';
    if (path.includes('video')) return 'video';
    if (path.includes('party')) return 'party';
    if (path.includes('rankings')) return 'rankings';
    if (
      path.includes('profile-tab') ||
      path.includes('dashboard') ||
      path.includes('payment') ||
      path.includes('become-a-pro') ||
      path.includes('login') ||
      path.includes('register')
    ) {
      return 'profile';
    }
    return 'explore';
  }

  function pageTitle() {
    const file = (window.location.pathname || '').split('/').pop() || '';
    return TITLES[file] || document.title.replace(/ - AP Services/i, '').trim() || 'AP Services';
  }

  function ensureStyles() {
    ['/social-theme.css', '/social-legacy-gold.css'].forEach((href) => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      }
    });
  }

  function ensureShellScript() {
    return new Promise((resolve) => {
      if (window.SocialShell) {
        resolve();
        return;
      }
      if (document.querySelector('script[src*="social-shell.js"]')) {
        const t = setInterval(() => {
          if (window.SocialShell) {
            clearInterval(t);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(t);
          resolve();
        }, 3000);
        return;
      }
      const s = document.createElement('script');
      s.src = '/social-shell.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.body.appendChild(s);
    });
  }

  function hideLegacyChrome() {
    document.querySelectorAll('.navbar, .footer, footer.site-footer').forEach((el) => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.page-header').forEach((el) => {
      el.classList.add('social-legacy-hero');
    });
  }

  function mountBridgeChrome() {
    if (document.getElementById('ap-bridge-header')) return;

    const header = document.createElement('header');
    header.id = 'ap-bridge-header';
    header.className = 'social-bridge-header';
    header.innerHTML = `
      <a href="/explore.html" class="social-bridge-back" aria-label="Back"><i class="fas fa-arrow-left"></i></a>
      <h1 class="social-bridge-title">${pageTitle()}</h1>
      <a href="/profile-tab.html" class="social-bridge-action" aria-label="Account"><i class="fas fa-user-circle"></i></a>
    `;
    document.body.prepend(header);

    let mount = document.getElementById('social-bottom-nav-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'social-bottom-nav-mount';
      document.body.appendChild(mount);
    }
  }

  function patchLinks() {
    document.querySelectorAll('a[href^="/"]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.includes('app=1')) return;
      if (href.startsWith('#') || href.startsWith('javascript')) return;
      const sep = href.includes('?') ? '&' : '?';
      a.setAttribute('href', href + sep + 'app=1');
    });
  }

  function isAuthPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return AUTH_PAGES.some((p) => path.endsWith(p));
  }

  async function init() {
    if (!isAppMode() || isSocialOnlyPage() || isAuthPage()) return;
    if (!localStorage.getItem('token')) return;

    document.documentElement.classList.add('ap-expo-app', 'social-app', 'social-bridge-mode');
    ensureStyles();
    hideLegacyChrome();
    mountBridgeChrome();
    patchLinks();

    await ensureShellScript();
    if (window.SocialShell) {
      window.SocialShell.markNativeApp?.();
      const mount = document.getElementById('social-bottom-nav-mount');
      if (mount) {
        mount.innerHTML = window.SocialShell.renderBottomNav(navIdForPath());
      }
    }
  }

  window.AppShell = { init, isAppMode, navIdForPath };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
