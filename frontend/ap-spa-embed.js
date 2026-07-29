/**
 * SPA embed navigation bridge — load early on MPA pages used inside /spa/legacy iframes.
 * Prefer SocialShell.spaNavigate when available; otherwise postMessage parent.
 */
(function () {
  function isSpaEmbed() {
    try {
      if (new URLSearchParams(window.location.search || '').get('spa_embed') === '1') return true;
    } catch (_e) {}
    try {
      if (window.parent && window.parent !== window) {
        var pp = String(window.parent.location.pathname || '');
        if (pp.indexOf('/spa') === 0) return true;
      }
    } catch (_e2) {
      /* cross-origin — still try postMessage if spa_embed */
    }
    return false;
  }

  function withApp(href) {
    if (!href || /^https?:\/\//i.test(href) || href.charAt(0) === '#') return href;
    try {
      var u = new URL(href, window.location.origin);
      if (!u.searchParams.has('app')) u.searchParams.set('app', '1');
      return u.pathname + u.search + u.hash;
    } catch (_e) {
      return href;
    }
  }

  function spaNavigate(href, opts) {
    if (!href) return false;
    if (window.SocialShell && typeof window.SocialShell.spaNavigate === 'function') {
      return window.SocialShell.spaNavigate(href, opts);
    }
    var next = withApp(href);
    var replace = Boolean(opts && opts.replace);
    if (isSpaEmbed() && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            source: 'ap-spa-embed',
            type: replace ? 'replace' : 'navigate',
            href: next,
            replace: replace,
          },
          window.location.origin
        );
        return true;
      } catch (_e) {
        /* fall through */
      }
    }
    if (replace) window.location.replace(next);
    else window.location.href = next;
    return true;
  }

  function spaBack() {
    if (isSpaEmbed() && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { source: 'ap-spa-embed', type: 'back' },
          window.location.origin
        );
        return true;
      } catch (_e) {}
    }
    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    return spaNavigate('/explore.html?app=1', { replace: true });
  }

  window.__apSpaNavigate = spaNavigate;
  window.apSpaNavigate = spaNavigate;
  window.apSpaBack = spaBack;

  if (!isSpaEmbed()) return;
  if (window.__AP_SPA_EMBED_BOOT__) return;
  window.__AP_SPA_EMBED_BOOT__ = true;
  document.documentElement.classList.add('spa-embed');

  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0)
        return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (/^https?:\/\//i.test(href) && href.indexOf(window.location.origin) !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      spaNavigate(href);
    },
    true
  );

  window.addEventListener('message', function (ev) {
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.source !== 'ap-spa-shell') return;
    if (d.type === 'hardware_back') {
      if (window.LiveSession && typeof window.LiveSession.onAndroidBack === 'function') {
        window.LiveSession.onAndroidBack();
        return;
      }
      if (window.SocialLive && typeof window.SocialLive.handleBack === 'function') {
        window.SocialLive.handleBack();
        return;
      }
      spaBack();
    }
  });
})();
