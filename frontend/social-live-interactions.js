/**
 * AP Live — 3D press / tilt interactions (live-room only)
 */
(function () {
  if (document.body.dataset.livePage !== 'live-room') return;

  const SELECTOR = [
    '.party-host-action',
    '.party-follow-btn',
    '.party-close',
    '.party-chat-tabs button',
    '.ap-chat-send-btn',
    '.ap-chat-emoji-btn',
    '.ap-btn-grid',
    '.party-btn-gift',
    '.party-btn-follow',
    '.gift-grid button',
    '.gift-send-btn',
    '.party-tools-grid button',
    '.party-tools-grid a',
    '.ap-tool-close-fab',
    '.gift-sheet-close',
  ].join(',');

  const pressed = new WeakSet();

  function bind3dPress(el) {
    if (!el || el.dataset.ap3dBound === '1') return;
    el.dataset.ap3dBound = '1';
    el.classList.add('ap-3d-press');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';

    const onDown = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      pressed.add(el);
      el.classList.remove('is-released');
      el.classList.add('is-pressed');
      const rect = el.getBoundingClientRect();
      const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left;
      const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top;
      const tiltX = ((y / rect.height) - 0.5) * -8;
      const tiltY = ((x / rect.width) - 0.5) * 8;
      el.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(0.94) translateZ(-2px)`;
      spawnRipple(el, x, y);
      try {
        if (navigator.vibrate) navigator.vibrate(4);
      } catch (_e) {}
    };

    const onUp = () => {
      if (!pressed.has(el)) return;
      pressed.delete(el);
      el.classList.remove('is-pressed');
      el.classList.add('is-released');
      el.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1) translateZ(0)';
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointerleave', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
  }

  function spawnRipple(el, x, y) {
    const ripple = document.createElement('span');
    ripple.className = 'ap-3d-ripple';
    const size = Math.max(el.offsetWidth, el.offsetHeight) * 0.9;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x - size / 2}px`;
    ripple.style.top = `${y - size / 2}px`;
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  function bindGiftTilt() {
    const giftBtn = document.getElementById('liveBtnGift');
    if (!giftBtn || giftBtn.dataset.apTiltBound === '1') return;
    giftBtn.dataset.apTiltBound = '1';

    giftBtn.addEventListener('pointermove', (e) => {
      if (!e.pressure && e.buttons !== 1) {
        const rect = giftBtn.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        giftBtn.style.transform = `perspective(500px) rotateY(${x * 14}deg) rotateX(${y * -14}deg) translateZ(6px)`;
        giftBtn.style.transition = 'transform 0.12s ease-out';
      }
    }, { passive: true });

    giftBtn.addEventListener('pointerleave', () => {
      giftBtn.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.45, 0.64, 1)';
      giftBtn.style.transform = 'perspective(500px) rotateY(0deg) rotateX(0deg) translateZ(0)';
    }, { passive: true });
  }

  function scan() {
    document.querySelectorAll(SELECTOR).forEach(bind3dPress);
    bindGiftTilt();
  }

  function init() {
    document.body.classList.add('ap-3d-scene');
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AP_LIVE_INTERACTIONS = { rescan: scan };
})();
