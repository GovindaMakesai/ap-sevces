/**
 * AP Services — in-app navigation stack, smart back, pull-to-refresh.
 */
(function () {
  const STACK_KEY = 'ap_nav_stack';
  const MAX_STACK = 48;
  const HOME = '/explore.html?app=1';
  const refreshHandlers = [];
  let ptrBound = false;
  let ptrState = { pulling: false, startY: 0, pulled: 0, refreshing: false };

  function isNative() {
    return Boolean(window.__AP_NATIVE_APP__ || window.ReactNativeWebView);
  }

  function isImmersiveLive() {
    const p = (location.pathname || '').toLowerCase();
    return p.endsWith('/live-room.html') || p.endsWith('/party-room.html');
  }

  function routeKey() {
    return (location.pathname || '') + (location.search || '');
  }

  function withApp(href) {
    if (!href || href.includes('app=1')) return href;
    return href + (href.includes('?') ? '&' : '?') + 'app=1';
  }

  function loadStack() {
    try {
      const raw = sessionStorage.getItem(STACK_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch (_e) {
      return [];
    }
  }

  function saveStack(stack) {
    try {
      sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
    } catch (_e) {}
  }

  function recordCurrentRoute() {
    const cur = routeKey();
    const stack = loadStack();
    if (stack[stack.length - 1] === cur) return;
    const idx = stack.lastIndexOf(cur);
    if (idx >= 0) {
      saveStack(stack.slice(0, idx + 1));
      return;
    }
    stack.push(cur);
    saveStack(stack);
  }

  function navigateTo(href, opts) {
    const next = withApp(href);
    if (!next) return;
    const stack = loadStack();
    const cur = routeKey();
    if (stack[stack.length - 1] !== cur) stack.push(cur);
    else if (!opts?.replace && stack.length === 0) stack.push(cur);
    if (opts?.replace) {
      stack[stack.length - 1] = next;
    } else {
      stack.push(next);
    }
    saveStack(stack);
    if (opts?.replace) location.replace(next);
    else location.href = next;
  }

  function closeLocalUi() {
    if (document.body.classList.contains('chat-active')) {
      if (typeof window.closeMobileChat === 'function') {
        window.closeMobileChat();
        return true;
      }
      document.body.classList.remove('chat-active');
      return true;
    }
    const openSheet = document.querySelector(
      '.party-tools-sheet.open, .gift-sheet.open, .party-requests-sheet.open, .social-broadcast-sheet-wrap.is-open, .ap-modal-overlay.is-open'
    );
    if (openSheet) {
      openSheet.classList.remove('open', 'is-open', 'is-visible');
      document.body.classList.remove('ap-live-overlay-open', 'ap-chat-open', 'party-requests-open');
      return true;
    }
    const emoji = document.getElementById('apEmojiPopover');
    if (emoji?.classList.contains('is-open')) {
      emoji.classList.remove('is-open');
      return true;
    }
    return false;
  }

  function goBack(opts) {
    if (closeLocalUi()) return true;

    const stack = loadStack();
    const cur = routeKey();

    if (stack.length > 1 && stack[stack.length - 1] === cur) {
      stack.pop();
      const prev = stack[stack.length - 1];
      saveStack(stack);
      if (prev && prev !== cur) {
        location.href = prev;
        return true;
      }
    }

    if (opts?.allowHistory && window.history.length > 1) {
      window.history.back();
      return true;
    }

    if (!cur.includes('explore.html')) {
      navigateTo(HOME, { replace: false });
      return true;
    }

    return false;
  }

  function handleHardwareBack() {
    if (closeLocalUi()) return true;
    if (isImmersiveLive()) {
      const live = window.APLive || window.SocialLive;
      if (live?.minimizeRoom) {
        live.minimizeRoom();
        return true;
      }
      try {
        const payload = {
          url: location.pathname + location.search,
          channel: new URLSearchParams(location.search).get('channel') || new URLSearchParams(location.search).get('room') || '',
          host: 'Live',
          type: document.body?.dataset?.livePage || 'live-room',
          ts: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
        sessionStorage.setItem('ap_live_pip_session', JSON.stringify(payload));
        if (payload.channel) localStorage.setItem('ap_live_active_session', JSON.stringify(payload));
      } catch (_e) {}
      navigateTo(HOME, { replace: false });
      return true;
    }
    return goBack({ allowHistory: true });
  }

  function registerRefresh(fn) {
    if (typeof fn === 'function') refreshHandlers.push(fn);
  }

  async function refreshPage() {
    document.documentElement.classList.add('ap-ptr-refreshing');
    try {
      for (const fn of refreshHandlers) {
        await fn();
      }
      if (!refreshHandlers.length) {
        window.location.reload();
        return;
      }
      window.dispatchEvent(new CustomEvent('ap-page-refreshed'));
    } finally {
      document.documentElement.classList.remove('ap-ptr-refreshing');
    }
  }

  function ensurePtrIndicator() {
    let el = document.getElementById('apPtrIndicator');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'apPtrIndicator';
    el.className = 'ap-ptr-indicator';
    el.innerHTML = '<div class="ap-ptr-spinner"></div><span>Pull to refresh</span>';
    document.body.appendChild(el);
    return el;
  }

  function initPullToRefresh(opts) {
    if (ptrBound || isImmersiveLive()) return;
    if (opts?.disabled?.()) return;
    ptrBound = true;
    const threshold = opts?.threshold || 68;
    const indicator = ensurePtrIndicator();
    const scrollEl = () => document.scrollingElement || document.documentElement;

    const reset = () => {
      ptrState.pulling = false;
      ptrState.pulled = 0;
      indicator.classList.remove('is-visible', 'ap-ptr-ready', 'ap-ptr-loading');
      indicator.style.transform = 'translate(-50%, -56px)';
    };

    document.addEventListener(
      'touchstart',
      (e) => {
        if (ptrState.refreshing || isImmersiveLive()) return;
        if (opts?.disabled?.()) return;
        if ((scrollEl().scrollTop || 0) > 6) return;
        ptrState.pulling = true;
        ptrState.startY = e.touches[0].clientY;
      },
      { passive: true }
    );

    document.addEventListener(
      'touchmove',
      (e) => {
        if (!ptrState.pulling || ptrState.refreshing) return;
        const dy = e.touches[0].clientY - ptrState.startY;
        if (dy < 0 || (scrollEl().scrollTop || 0) > 6) {
          reset();
          return;
        }
        ptrState.pulled = Math.min(dy * 0.5, threshold * 1.5);
        indicator.classList.add('is-visible');
        indicator.style.transform = `translate(-50%, ${ptrState.pulled - 48}px)`;
        indicator.classList.toggle('ap-ptr-ready', ptrState.pulled >= threshold);
      },
      { passive: true }
    );

    document.addEventListener(
      'touchend',
      async () => {
        if (!ptrState.pulling || ptrState.refreshing) return;
        const shouldRefresh = ptrState.pulled >= threshold;
        ptrState.pulling = false;
        if (!shouldRefresh) {
          reset();
          return;
        }
        ptrState.refreshing = true;
        indicator.classList.add('ap-ptr-loading');
        indicator.querySelector('span').textContent = 'Refreshing…';
        try {
          await refreshPage();
        } finally {
          ptrState.refreshing = false;
          indicator.querySelector('span').textContent = 'Pull to refresh';
          reset();
        }
      },
      { passive: true }
    );
  }

  function bindLinkTracking() {
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target.closest?.('a[href^="/"]');
        if (!a || a.target === '_blank' || e.defaultPrevented) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        const stack = loadStack();
        const cur = routeKey();
        if (!stack.length || stack[stack.length - 1] !== cur) {
          stack.push(cur);
          saveStack(stack);
        }
      },
      true
    );
  }

  function bindBackButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-ap-back], .social-rank-back[href], .streamer-top .back, [onclick*="history.back"]');
      if (!btn) return;
      if (btn.matches('[data-ap-back], .streamer-top .back')) {
        e.preventDefault();
        goBack({ allowHistory: true });
        return;
      }
      if (btn.matches('.social-rank-back') && btn.getAttribute('href')) {
        e.preventDefault();
        goBack({ allowHistory: true });
      }
    });
  }

  function init() {
    if (!document.getElementById('ap-nav-styles')) {
      const link = document.createElement('link');
      link.id = 'ap-nav-styles';
      link.rel = 'stylesheet';
      link.href = '/social-nav.css';
      document.head.appendChild(link);
    }
    recordCurrentRoute();
    bindLinkTracking();
    bindBackButtons();
    if (!isImmersiveLive()) {
      initPullToRefresh();
    }
    window.addEventListener('popstate', () => {
      const stack = loadStack();
      const cur = routeKey();
      if (stack.length > 1 && stack[stack.length - 1] !== cur) {
        while (stack.length > 1 && stack[stack.length - 1] !== cur) stack.pop();
        saveStack(stack);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.SocialNav = {
    goBack,
    navigateTo,
    handleHardwareBack,
    registerRefresh,
    refreshPage,
    initPullToRefresh,
    recordCurrentRoute,
    routeKey,
    isImmersiveLive,
  };
})();
