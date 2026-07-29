/**
 * Early spa_embed bridge — runs before page scripts navigate away.
 * Loaded from ap-native-boot when ?spa_embed=1.
 */
(function () {
  if (window.__AP_SPA_EMBED_BOOT__) return;
  try {
    if (new URLSearchParams(window.location.search || '').get('spa_embed') !== '1') return;
  } catch (_e) {
    return;
  }
  if (!window.parent || window.parent === window) return;
  window.__AP_SPA_EMBED_BOOT__ = true;
  document.documentElement.classList.add('spa-embed');

  function spaNavigate(href, opts) {
    if (!href) return false;
    try {
      window.parent.postMessage(
        {
          source: 'ap-spa-embed',
          type: opts && opts.replace ? 'replace' : 'navigate',
          href: href,
          replace: Boolean(opts && opts.replace),
        },
        window.location.origin
      );
      return true;
    } catch (_e) {
      return false;
    }
  }

  window.__apSpaNavigate = spaNavigate;

  document.addEventListener(
    'click',
    function (e) {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (/^https?:\/\//i.test(href) && href.indexOf(window.location.origin) !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      spaNavigate(href);
    },
    true
  );
})();
