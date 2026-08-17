/**
 * GiftAnimationOverlay — AnimStream queue, dedupe, gift notification card.
 * Triggered only from confirmed live:gift events (social-live.js).
 */
(function () {
  const LOG = '[Gift]';
  const cfg = window.AP_GIFT_ANIMATION || {};
  const MAP = cfg.GIFT_ANIMATION_MAP || {};
  const CATALOG = cfg.CATALOG_BY_SLUG || {};
  const DEFAULT_DURATION = Number(cfg.DEFAULT_DURATION_MS || 15000);
  const MAX_QUEUE = Number(cfg.MAX_QUEUE_SIZE || 8);

  const processedGiftEvents = new Map();
  const PROCESSED_TTL_MS = 120000;

  let rootEl = null;
  let notifyRoot = null;
  let notifyCard = null;
  let notifyTimer = null;
  let frameEl = null;
  let playing = false;
  let hideTimer = null;
  const queue = [];

  function log(msg, detail) {
    try {
      if (detail !== undefined) console.log(LOG, msg, detail);
      else console.log(LOG, msg);
    } catch (_e) {}
  }

  function pruneProcessed(now = Date.now()) {
    for (const [id, t] of processedGiftEvents) {
      if (now - t > PROCESSED_TTL_MS) processedGiftEvents.delete(id);
    }
  }

  function normalizeTxId(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.replace(/^(gift-|evt-)/i, '');
  }

  function giftSlug(gift) {
    return String(
      gift?.giftSlug || gift?.giftType || gift?.gift_type || gift?.gift_type_slug || ''
    ).trim();
  }

  function transactionId(gift) {
    return normalizeTxId(gift?.gift_tx_id || gift?.id);
  }

  function resolveMeta(gift) {
    const slug = giftSlug(gift);
    const catalog = CATALOG[slug] || {};
    const mapped = MAP[slug];
    const name =
      gift?.giftName ||
      gift?.name ||
      catalog.name ||
      mapped?.giftName ||
      slug.replace(/_/g, ' ').replace(/\d+$/, '').trim() ||
      'Gift';
    const unitCost = Number(
      catalog.cost || mapped?.coinValue || gift?.unitCost || gift?.unit_amount || 0
    );
    const charged = Number(gift?.amount || gift?.coins || gift?.coin_amount || 0);
    const qty = Math.max(1, Number(gift?.qty || 1));
    const emoji = gift?.emoji || catalog.emoji || mapped?.emoji || '\u{1F381}';
    return {
      slug,
      name,
      emoji,
      qty,
      unitCost: unitCost || (qty > 1 && charged ? Math.round(charged / qty) : charged),
      charged,
      animationUrl: mapped?.animationUrl || '',
      durationMs: Number(mapped?.durationMs || DEFAULT_DURATION),
      label: mapped?.label || '',
    };
  }

  function hasAnimationForGift(gift) {
    const slug = giftSlug(gift);
    return slug && MAP[slug]?.animationUrl;
  }

  function claimTransaction(gift) {
    pruneProcessed();
    const tx = transactionId(gift);
    if (!tx) return true;
    if (processedGiftEvents.has(tx)) {
      log('duplicate ignored', { transactionId: tx });
      return false;
    }
    processedGiftEvents.set(tx, Date.now());
    return true;
  }

  function getMountEl() {
    return (
      document.getElementById('liveRoomRoot') ||
      document.querySelector('.party-room') ||
      document.body
    );
  }

  function ensureAnimRoot() {
    const mount = getMountEl();
    if (rootEl && rootEl.parentElement !== mount) {
      mount.appendChild(rootEl);
    }
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'apGiftAnimOverlay';
    rootEl.setAttribute('aria-hidden', 'true');
    if (mount.id === 'liveRoomRoot' || mount.classList?.contains('party-room')) {
      rootEl.classList.add('ap-gift-anim-in-room');
    }
    const overlay = mount.querySelector('.live-overlay');
    if (overlay) mount.insertBefore(rootEl, overlay);
    else mount.appendChild(rootEl);
    return rootEl;
  }

  function ensureNotifyRoot() {
    if (notifyRoot) return notifyRoot;
    notifyRoot = document.createElement('div');
    notifyRoot.id = 'apGiftNotifyRoot';
    notifyRoot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(notifyRoot);
    return notifyRoot;
  }

  function clearAnimTimers() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
  }

  function hideNotify() {
    if (notifyCard) {
      notifyCard.classList.remove('is-visible');
      notifyCard.classList.add('is-out');
      const el = notifyCard;
      setTimeout(() => {
        el.remove();
        if (notifyCard === el) notifyCard = null;
      }, 320);
    }
    if (notifyRoot) notifyRoot.setAttribute('aria-hidden', 'true');
  }

  function hideAnimation(reason) {
    clearAnimTimers();
    hideNotify();
    if (rootEl) {
      rootEl.classList.remove('is-visible');
      rootEl.setAttribute('aria-hidden', 'true');
      rootEl.textContent = '';
      frameEl = null;
    }
    if (playing) log('animation cleaned', reason || '');
    playing = false;
  }

  function showNotify(meta, gift) {
    ensureNotifyRoot();
    hideNotify();
    notifyCard = document.createElement('div');
    notifyCard.className = 'ap-gift-notify-card';
    const sender = String(gift?.from || gift?.senderName || 'User');
    const coinsLabel =
      meta.charged > 0
        ? `${meta.charged.toLocaleString()} coins`
        : meta.unitCost > 0
          ? `${meta.unitCost.toLocaleString()} coins`
          : '';
    notifyCard.innerHTML = `
      <div class="ap-gift-notify-sender">${escapeHtml(sender)}</div>
      <div class="ap-gift-notify-icon">${meta.emoji}</div>
      <div class="ap-gift-notify-name">${escapeHtml(meta.name)}</div>
      <div class="ap-gift-notify-coins">${escapeHtml(coinsLabel)}</div>
      ${meta.qty > 1 ? `<div class="ap-gift-notify-qty">\u00d7${meta.qty}</div>` : ''}`;
    notifyRoot.appendChild(notifyCard);
    notifyRoot.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => notifyCard.classList.add('is-visible'));
    notifyTimer = setTimeout(() => hideNotify(), Math.min(meta.durationMs, 5000));
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function playAnimation(meta) {
    const url = String(meta.animationUrl || '').trim();
    if (!url) {
      finishCurrent();
      return;
    }

    ensureAnimRoot();
    rootEl.textContent = '';
    playing = true;
    log('animation started', { label: meta.label, slug: meta.slug });

    const stageEl = document.createElement('div');
    stageEl.className = 'ap-gift-anim-stage';

    frameEl = document.createElement('iframe');
    frameEl.className = 'ap-gift-anim-frame';
    frameEl.setAttribute('title', 'Gift animation');
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
    frameEl.setAttribute('referrerpolicy', 'no-referrer');
    frameEl.setAttribute('scrolling', 'no');
    frameEl.setAttribute('frameborder', '0');

    frameEl.addEventListener('error', () => {
      log('animation embed failed');
      finishCurrent('iframe-error');
    });

    stageEl.appendChild(frameEl);
    rootEl.appendChild(stageEl);
    rootEl.classList.add('is-visible');
    rootEl.setAttribute('aria-hidden', 'false');

    try {
      frameEl.src = url;
    } catch (_e) {
      log('animation embed failed');
      finishCurrent('iframe-src-error');
      return;
    }

    hideTimer = setTimeout(() => finishCurrent('duration'), meta.durationMs);
  }

  function finishCurrent(reason) {
    log('animation finished', reason || '');
    hideAnimation(reason);
    pumpQueue();
  }

  function enqueue(gift, meta) {
    if (queue.length >= MAX_QUEUE) {
      log('queue full — dropping oldest');
      queue.shift();
    }
    queue.push({ gift, meta });
    log('queued', { slug: meta.slug, queueLen: queue.length });
  }

  function pumpQueue() {
    if (playing) return;
    const next = queue.shift();
    if (!next) return;
    showNotify(next.meta, next.gift);
    playAnimation(next.meta);
  }

  function onGiftReceived(gift) {
    if (!gift) return;
    const tx = transactionId(gift);
    const meta = resolveMeta(gift);
    log('received');
    log('transactionId:', tx || '(none)');
    log('giftId:', meta.slug || '(none)');
    log('giftName:', meta.name);
    log('coinValue:', meta.charged || meta.unitCost);

    if (!hasAnimationForGift(gift)) return;
    if (!claimTransaction(gift)) return;

    log('animation mapped:', meta.label || meta.slug);
    enqueue(gift, meta);
    pumpQueue();
  }

  function cleanup() {
    queue.length = 0;
    hideAnimation('cleanup');
    processedGiftEvents.clear();
  }

  window.GiftAnimationOverlay = {
    hasAnimationForGift,
    onGiftReceived,
    cleanup,
    resolveMeta,
    transactionId,
    giftSlug,
  };
})();
