/**
 * AP Live Creator UX Polish — shared empty/error/feedback helpers.
 * No new product features; consistency + premium feel only.
 */
(function () {
  const MOTION = {
    fast: 160,
    base: 240,
    slow: 360,
    ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Future native bridge hook — no-op on web */
  function haptic(kind) {
    try {
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'haptic', kind: kind || 'light' })
        );
      } else if (navigator.vibrate) {
        const map = { light: 8, medium: 16, success: [10, 30, 10], error: [20, 40, 20] };
        navigator.vibrate(map[kind] || map.light);
      }
    } catch (_e) { /* ignore */ }
  }

  function emptyStateHtml(opts) {
    const o = opts || {};
    const title = o.title || 'Nothing here yet';
    const body = o.body || 'Check back soon.';
    const cta = o.ctaLabel
      ? `<button type="button" class="btn-open ap-empty-cta" data-empty-cta="${esc(o.ctaAction || '')}">${esc(o.ctaLabel)}</button>`
      : o.ctaHref
        ? `<a class="btn-open" href="${esc(o.ctaHref)}">${esc(o.ctaLabel || 'Continue')}</a>`
        : '';
    return `<div class="social-empty-state social-empty-state--feed ap-empty" role="status">
      <div class="illus" aria-hidden="true">${o.icon || '✦'}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      ${cta}
    </div>`;
  }

  function errorStateHtml(opts) {
    const o = opts || {};
    return `<div class="social-empty-state social-empty-state--feed ap-error-state" role="alert">
      <div class="illus" aria-hidden="true">${o.icon || '!'}</div>
      <h3>${esc(o.title || 'Something went wrong')}</h3>
      <p>${esc(o.body || 'Please try again.')}</p>
      <button type="button" class="btn-open ap-retry-btn" data-retry="1">${esc(o.retryLabel || 'Try again')}</button>
    </div>`;
  }

  function bindRetry(root, onRetry) {
    const btn = (root || document).querySelector('[data-retry]');
    if (!btn || typeof onRetry !== 'function') return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      haptic('light');
      onRetry();
    });
  }

  function bindEmptyCta(root, handlers) {
    const map = handlers || {};
    (root || document).querySelectorAll('[data-empty-cta]').forEach((btn) => {
      const key = btn.getAttribute('data-empty-cta');
      if (!key || typeof map[key] !== 'function') return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        haptic('light');
        map[key]();
      });
    });
  }

  function fadeReplace(el, html) {
    if (!el) return;
    el.classList.add('ap-fade-out');
    window.setTimeout(() => {
      el.innerHTML = html;
      el.classList.remove('ap-fade-out');
      el.classList.add('ap-fade-in');
      window.setTimeout(() => el.classList.remove('ap-fade-in'), MOTION.base);
    }, MOTION.fast);
  }

  function successFeedback(msg) {
    haptic('success');
    if (window.SocialUI?.toast) SocialUI.toast(msg, 'success');
    else if (window.SocialInteractions?.toast) SocialInteractions.toast(msg, 'success');
  }

  function errorFeedback(msg) {
    haptic('error');
    if (window.SocialUI?.toast) SocialUI.toast(msg, 'error');
    else if (window.SocialInteractions?.toast) SocialInteractions.toast(msg, 'error');
  }

  window.SocialCreatorPolish = {
    MOTION,
    haptic,
    emptyStateHtml,
    errorStateHtml,
    bindRetry,
    bindEmptyCta,
    fadeReplace,
    successFeedback,
    errorFeedback,
  };
})();
