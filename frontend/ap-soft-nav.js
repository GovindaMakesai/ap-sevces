/**
 * Soft tab navigation — DISABLED.
 * Previous soft-nav stacked page timers/listeners and slowed the whole WebView.
 * Kept as a no-op stub so any cached HTML referencing ApSoftNav does not throw.
 */
(function () {
  window.ApSoftNav = {
    go(href) {
      try {
        location.assign(href);
      } catch (_e) {
        location.href = href;
      }
      return Promise.resolve(false);
    },
    warm() {
      return Promise.resolve();
    },
    canSoftNavigate() {
      return false;
    },
    isBusy() {
      return false;
    },
  };
})();
