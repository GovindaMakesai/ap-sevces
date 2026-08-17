/**
 * GiftAnimationOverlay — reusable AnimStream / embed overlay for confirmed live gifts.
 * Presentation only; reacts to backend-confirmed live:gift events (via social-live.js).
 */
(function () {
  const LOG = '[GiftAnimation]';
  const cfg = window.AP_GIFT_ANIMATION || {};

  const processedGiftEventIds = new Map();
  const PROCESSED_TTL_MS = 120000;

  let rootEl = null;
  let frameEl = null;
  let playing = false;
  let hideTimer = null;
  let failTimer = null;

  function log(msg, detail) {
    try {
      if (detail !== undefined) console.log(LOG, msg, detail);
      else console.log(LOG, msg);
    } catch (_e) {}
  }

  function pruneProcessed(now = Date.now()) {
    for (const [id, t] of processedGiftEventIds) {
      if (now - t > PROCESSED_TTL_MS) processedGiftEventIds.delete(id);
    }
  }

  function normalizeTxId(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.replace(/^(gift-|evt-)/i, '');
  }

  function giftEventId(gift) {
    const tx = normalizeTxId(gift?.gift_tx_id || gift?.id);
    if (tx) return tx;
    const from = String(gift?.fromUserId || '');
    const to = String(gift?.toUserId || '');
    const amt = Number(gift?.amount || gift?.coins || 0);
    const at = Number(gift?.at || 0);
    if (from && to && amt > 0) return `soft:${from}|${to}|${amt}|${at}`;
    return '';
  }

  function giftSlug(gift) {
    return String(
      gift?.giftSlug || gift?.giftType || gift?.gift_type || gift?.gift_type_slug || ''
    ).trim();
  }

  function coinValue(gift) {
    return Number(gift?.amount || gift?.coins || gift?.coin_amount || 0);
  }

  function matches10000Gift(gift) {
    const slug = giftSlug(gift);
    const targetSlug = String(cfg.GIFT_ANIMATION_10000_SLUG || '').trim();
    if (targetSlug && slug === targetSlug) return true;
    if (cfg.USE_COIN_VALUE_10000_FALLBACK) {
      const targetCoins = Number(cfg.GIFT_ANIMATION_10000_COIN_VALUE || 10000);
      return coinValue(gift) === targetCoins;
    }
    return false;
  }

  function getMountEl() {
    return (
      document.getElementById('liveRoomRoot') ||
      document.querySelector('.party-room') ||
      document.body
    );
  }

  function ensureRoot() {
    const mount = getMountEl();
    if (rootEl) {
      if (rootEl.parentElement !== mount) {
        mount.appendChild(rootEl);
      }
      return rootEl;
    }
    rootEl = document.createElement('div');
    rootEl.id = 'apGiftAnimOverlay';
    rootEl.setAttribute('aria-hidden', 'true');
    if (mount.id === 'liveRoomRoot' || mount.classList?.contains('party-room')) {
      rootEl.classList.add('ap-gift-anim-in-room');
    }
    /* Above Agora video layers, below live-overlay chat + controls (z-index 12) */
    const overlay = mount.querySelector('.live-overlay');
    if (overlay) {
      mount.insertBefore(rootEl, overlay);
    } else {
      mount.appendChild(rootEl);
    }
    return rootEl;
  }

  function clearTimers() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (failTimer) {
      clearTimeout(failTimer);
      failTimer = null;
    }
  }

  function hide(reason) {
    clearTimers();
    if (rootEl) {
      rootEl.classList.remove('is-visible');
      rootEl.setAttribute('aria-hidden', 'true');
      if (frameEl) {
        try {
          frameEl.src = 'about:blank';
        } catch (_e) {}
        frameEl.remove();
        frameEl = null;
      }
    }
    if (playing) log('animation unmounted', reason || '');
    playing = false;
  }

  function show(animationUrl, meta) {
    const url = String(animationUrl || '').trim();
    if (!url) return;

    if (playing) {
      log('animation already playing — ignoring duplicate trigger');
      return;
    }

    ensureRoot();
    hide('restart');
    playing = true;
    log('animation mounted');

    const stageEl = document.createElement('div');
    stageEl.className = 'ap-gift-anim-stage';

    frameEl = document.createElement('iframe');
    frameEl.className = 'ap-gift-anim-frame';
    frameEl.setAttribute('title', 'Gift animation');
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute('allow', 'autoplay; fullscreen');
    frameEl.setAttribute('referrerpolicy', 'no-referrer');
    frameEl.setAttribute('scrolling', 'no');

    frameEl.addEventListener('error', () => {
      log('WebView/embed failed to load');
      hide('iframe-error');
      if (meta?.onFinished) meta.onFinished();
    });

    stageEl.appendChild(frameEl);
    rootEl.appendChild(stageEl);
    rootEl.classList.add('is-visible');
    rootEl.setAttribute('aria-hidden', 'false');

    try {
      frameEl.src = url;
    } catch (_e) {
      log('WebView/embed failed to load');
      hide('iframe-src-error');
      if (meta?.onFinished) meta.onFinished();
      return;
    }

    const duration = Number(cfg.GIFT_ANIMATION_10000_DURATION_MS || 15000);
    hideTimer = setTimeout(() => {
      log('animation finished');
      hide('duration');
      if (meta?.onFinished) meta.onFinished();
    }, duration);

    failTimer = setTimeout(() => {
      if (!frameEl) return;
      try {
        if (!frameEl.contentWindow) log('WebView/embed failed to load');
      } catch (_e) {
        log('WebView/embed failed to load');
      }
    }, 8000);
  }

  function claimGiftAnimationEvent(gift) {
    pruneProcessed();
    const id = giftEventId(gift);
    if (!id) return true;
    if (processedGiftEventIds.has(id)) return false;
    processedGiftEventIds.set(id, Date.now());
    return true;
  }

  function onGiftReceived(gift) {
    if (!gift) return;
    log('gift received');
    log('gift ID/value', {
      id: normalizeTxId(gift.gift_tx_id || gift.id) || null,
      slug: giftSlug(gift) || null,
      coins: coinValue(gift),
    });

    if (!matches10000Gift(gift)) return;
    if (!claimGiftAnimationEvent(gift)) {
      log('duplicate gift event ignored');
      return;
    }

    log('triggering 10000 coin animation');
    show(cfg.ANIMSTREAM_10000_GIFT_URL, {
      onFinished: () => log('animation finished'),
    });
  }

  function cleanup() {
    hide('cleanup');
    processedGiftEventIds.clear();
  }

  window.GiftAnimationOverlay = {
    show,
    hide,
    cleanup,
    onGiftReceived,
    matches10000Gift,
    giftEventId,
  };
})();
