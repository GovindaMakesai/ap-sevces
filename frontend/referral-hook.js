/**
 * Soft hook: after login/session restore, apply pending invite code once.
 * Does not modify Auth core — call from pages that already load Auth.
 */
(function () {
  async function tryApplyPendingReferral() {
    const code = localStorage.getItem('ap_pending_ref');
    if (!code) return;
    if (!window.API || !window.Auth?.getUser?.()) return;
    if (sessionStorage.getItem('ap_ref_apply_attempted') === code) return;
    sessionStorage.setItem('ap_ref_apply_attempted', code);
    try {
      const res = await API.request('/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          device_fingerprint: localStorage.getItem('ap_device_fp') || undefined,
          platform: 'web',
        }),
      });
      if (res?.success) localStorage.removeItem('ap_pending_ref');
    } catch (_e) {
      /* non-blocking */
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(tryApplyPendingReferral, 1200);
  });
  document.addEventListener('user:profile-updated', () => {
    setTimeout(tryApplyPendingReferral, 400);
  });
})();
