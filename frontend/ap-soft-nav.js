/**
 * Soft tab navigation — swap page HTML without full WebView reload.
 * Used by social-shell navigateInApp for Explore / Video / Square / etc.
 */
(function () {
  if (window.ApSoftNav) return;

  const NAV_CACHE = 'ap-soft-nav-v3';
  const SOFT_NAV_PATHS = new Set([
    '/explore.html',
    '/video.html',
    '/square.html',
    '/topics.html',
    '/rankings.html',
    '/chat.html',
    '/profile-tab.html',
    '/store.html',
    '/vip.html',
  ]);

  let token = 0;
  let busy = false;

  function canSoftNavigate(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return false;
      const path = u.pathname.toLowerCase();
      if (/live-room|party-room|app-auth|login|register/.test(path)) return false;
      return SOFT_NAV_PATHS.has(path);
    } catch (_e) {
      return false;
    }
  }

  async function openCache() {
    if (!('caches' in window)) return null;
    try {
      return await caches.open(NAV_CACHE);
    } catch (_e) {
      return null;
    }
  }

  async function putCache(url, res) {
    const cache = await openCache();
    if (!cache || !res || !res.ok) return;
    try {
      await cache.put(url, res.clone());
    } catch (_e) {}
  }

  async function fetchHtml(href) {
    const abs = new URL(href, location.origin).href;
    const cache = await openCache();
    if (cache) {
      try {
        const hit = await cache.match(abs);
        if (hit) {
          fetch(abs, { credentials: 'same-origin', cache: 'no-cache' })
            .then((r) => putCache(abs, r))
            .catch(() => {});
          return hit;
        }
      } catch (_e) {}
    }
    const res = await fetch(abs, {
      credentials: 'same-origin',
      cache: 'default',
      headers: { Accept: 'text/html', 'X-AP-Soft-Nav': '1' },
    });
    if (res.ok) await putCache(abs, res);
    return res;
  }

  function syncCss(doc) {
    const have = new Set(
      [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => {
        try {
          return new URL(l.href, location.origin).href;
        } catch (_e) {
          return l.getAttribute('href');
        }
      })
    );
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      let abs;
      try {
        abs = new URL(href, location.origin).href;
      } catch (_e) {
        return;
      }
      if (have.has(abs)) return;
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      document.head.appendChild(el);
    });
  }

  function alreadyHaveScript(src) {
    let abs;
    try {
      abs = new URL(src, location.origin).href;
    } catch (_e) {
      return false;
    }
    return [...document.querySelectorAll('script[src]')].some((s) => {
      try {
        return new URL(s.src, location.origin).href === abs;
      } catch (_e2) {
        return false;
      }
    });
  }

  function runScript(node) {
    return new Promise((resolve) => {
      const src = node.getAttribute('src');
      if (src) {
        if (alreadyHaveScript(src)) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        if (node.hasAttribute('defer')) s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.body.appendChild(s);
        return;
      }
      const code = node.textContent || '';
      if (!code.trim()) {
        resolve();
        return;
      }
      const protoAdd = Document.prototype.addEventListener;
      const pending = [];
      Document.prototype.addEventListener = function (type, fn, opts) {
        if (type === 'DOMContentLoaded' || type === 'readystatechange') {
          if (typeof fn === 'function') pending.push(fn);
          return;
        }
        return protoAdd.call(this, type, fn, opts);
      };
      try {
        const s = document.createElement('script');
        s.textContent = code;
        document.body.appendChild(s);
      } catch (err) {
        console.warn('[soft-nav] inline', err);
      }
      Document.prototype.addEventListener = protoAdd;
      pending.forEach((fn) => {
        try {
          fn.call(document);
        } catch (err) {
          console.warn('[soft-nav] page boot', err);
        }
      });
      resolve();
    });
  }

  async function applyDoc(doc) {
    syncCss(doc);
    document.title = doc.title || document.title;
    document.documentElement.className = doc.documentElement.getAttribute('class') || '';
    document.documentElement.classList.add('ap-expo-app', 'social-app', 'social-native');

    const overlay = document.getElementById('ap-nav-switch-overlay');
    if (overlay) overlay.remove();

    document.body.className = doc.body.getAttribute('class') || '';
    document.body.innerHTML = doc.body.innerHTML;

    if (overlay) {
      document.body.appendChild(overlay);
      overlay.classList.add('is-on');
    }

    const scripts = [...doc.body.querySelectorAll('script')];
    for (const sc of scripts) {
      await runScript(sc);
    }

    try {
      const navId =
        (window.AppShell && window.AppShell.navIdForPath && window.AppShell.navIdForPath()) || null;
      if (navId && window.SocialShell && window.SocialShell.ensureBottomNav) {
        window.SocialShell.ensureBottomNav(navId);
      }
    } catch (_e) {}
  }

  async function go(href, { markActive } = {}) {
    if (!canSoftNavigate(href)) {
      location.assign(href);
      return false;
    }
    const my = ++token;
    busy = true;
    if (typeof markActive === 'function') markActive();
    document.documentElement.classList.add('ap-nav-switching');
    const bar = document.getElementById('ap-nav-switch-overlay');
    if (bar) bar.classList.add('is-on');

    try {
      const u = new URL(href, location.origin);
      const res = await fetchHtml(u.pathname + u.search);
      if (my !== token) return true;
      if (!res || !res.ok) throw new Error('http ' + (res && res.status));
      const html = await res.text();
      if (my !== token) return true;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.body) throw new Error('empty');
      await applyDoc(doc);
      if (my !== token) return true;
      history.pushState({ apSoftNav: true }, '', u.pathname + u.search + u.hash);
      window.scrollTo(0, 0);
    } catch (err) {
      console.warn('[soft-nav] hard fallback', err);
      location.assign(href);
      return false;
    } finally {
      if (my === token) {
        busy = false;
        document.documentElement.classList.remove('ap-nav-switching');
        document.getElementById('ap-nav-switch-overlay')?.classList.remove('is-on');
      }
    }
    return true;
  }

  async function warm(href) {
    try {
      const abs = new URL(href, location.origin).href;
      const res = await fetch(abs, { credentials: 'same-origin', cache: 'force-cache' });
      await putCache(abs, res);
    } catch (_e) {}
  }

  window.addEventListener('popstate', (e) => {
    if (!e.state || !e.state.apSoftNav) return;
    go(location.pathname + location.search + location.hash);
  });

  window.ApSoftNav = {
    go,
    warm,
    canSoftNavigate,
    isBusy: () => busy,
  };
})();
