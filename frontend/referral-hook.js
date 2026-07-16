/**
 * After login/session restore, bind invitee → inviter once (code or display ID).
 */
(function () {
  async function tryApplyPendingReferral() {
    const code = localStorage.getItem('ap_pending_ref');
    if (!code) return;
    if (!window.API?.request) return;
    const user =
      window.Auth?.getUser?.() ||
      (() => {
        try {
          return JSON.parse(localStorage.getItem('user') || 'null');
        } catch (_e) {
          return null;
        }
      })();
    if (!user) return;
    if (sessionStorage.getItem('ap_ref_apply_attempted') === code) return;
    sessionStorage.setItem('ap_ref_apply_attempted', code);
    try {
      const res = await API.request('/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          device_fingerprint: localStorage.getItem('ap_device_fp') || undefined,
          platform: /android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' : 'web',
        }),
      });
      if (res?.success) {
        localStorage.removeItem('ap_pending_ref');
        document.dispatchEvent(new CustomEvent('referral:connected', { detail: res.data }));
      }
    } catch (_e) {
      /* non-blocking */
    }
  }

  function captureRefFromUrl() {
    try {
      const params = new URLSearchParams(location.search);
      const ref =
        params.get('ref') ||
        params.get('code') ||
        params.get('inviter') ||
        params.get('inviter_id');
      if (ref) localStorage.setItem('ap_pending_ref', String(ref).trim().toUpperCase());
    } catch (_e) { /* ignore */ }
  }

  captureRefFromUrl();
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(tryApplyPendingReferral, 800);
  });
  document.addEventListener('user:profile-updated', () => {
    setTimeout(tryApplyPendingReferral, 400);
  });

  window.APReferralHook = { tryApplyPendingReferral, captureRefFromUrl };
})();
