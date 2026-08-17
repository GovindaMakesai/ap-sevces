/**
 * GiftAnimationOverlay — AnimStream embed directly over Agora live video.
 * Mounts inside .live-overlay (above video, below chat/controls).
 */
(function () {
  const LOG = '[Gift]';
  const DBG = '[GiftAnimation DEBUG]';
  const ASDBG = '[AnimStream DEBUG]';
  const cfg = window.AP_GIFT_ANIMATION || {};
  const MAP = cfg.GIFT_ANIMATION_MAP || {};
  const CATALOG = cfg.CATALOG_BY_SLUG || {};
  const DEFAULT_DURATION = Number(cfg.DEFAULT_DURATION_MS || 15000);
  const MAX_QUEUE = Number(cfg.MAX_QUEUE_SIZE || 8);
  const ANIM1_URL =
    cfg.ANIM1_TEST_URL ||
    'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1';

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

  function isDebugMode() {
    try {
      if (localStorage.getItem('ap_gift_anim_debug') === '1') return true;
      if (/[?&]giftAnimDebug=1/i.test(String(location.search || ''))) return true;
    } catch (_e) { /* */ }
    return Boolean(cfg.DEBUG_MODE);
  }

  function debugLog(msg, detail) {
    try {
      if (detail !== undefined) console.log(DBG, msg, detail);
      else console.log(DBG, msg);
    } catch (_e) {}
  }

  function animLog(msg, detail) {
    try {
      if (detail !== undefined) console.log(ASDBG, msg, detail);
      else console.log(ASDBG, msg);
    } catch (_e) {}
  }

  function log(msg, detail) {
    try {
      if (detail !== undefined) console.log(LOG, msg, detail);
      else console.log(LOG, msg);
    } catch (_e) {}
  }

  function getLiveOverlayMount() {
    const shell =
      document.getElementById('liveRoomRoot') ||
      document.querySelector('.party-room');
    if (!shell) return document.body;
    return (
      shell.querySelector('.live-overlay') ||
      shell.querySelector('.party-room-body') ||
      shell
    );
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
      'Gift';
    const unitCost = Number(
      catalog.cost || mapped?.coinValue || gift?.unitCost || 0
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
    if (isDebugMode()) return true;
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

  function ensureAnimRoot() {
    const mount = getLiveOverlayMount();
    if (rootEl) {
      if (rootEl.parentElement !== mount) {
        mount.insertBefore(rootEl, mount.firstChild || null);
      }
      return rootEl;
    }
    rootEl = document.createElement('div');
    rootEl.id = 'apGiftAnimOverlay';
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.classList.add('ap-gift-anim-in-room');
    if (isDebugMode()) rootEl.classList.add('is-debug');
    mount.insertBefore(rootEl, mount.firstChild || null);
    debugLog('overlay mounted in live shell', mount.className || mount.id || 'body');
    return rootEl;
  }

  function ensureNotifyRoot() {
    const mount = getLiveOverlayMount();
    if (notifyRoot) {
      if (notifyRoot.parentElement !== mount) {
        mount.appendChild(notifyRoot);
      }
      return notifyRoot;
    }
    notifyRoot = document.createElement('div');
    notifyRoot.id = 'apGiftNotifyRoot';
    notifyRoot.setAttribute('aria-hidden', 'true');
    mount.appendChild(notifyRoot);
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
    if (playing) {
      debugLog('overlay unmounted', reason || '');
      animLog('overlay unmounted', reason || '');
    }
    playing = false;
  }

  function showNotify(meta, gift) {
    ensureNotifyRoot();
    hideNotify();
    notifyCard = document.createElement('div');
    notifyCard.className = 'ap-gift-notify-card';
    const sender = String(gift?.from || gift?.senderName || 'User');
    const coins =
      meta.charged > 0
        ? `${meta.charged.toLocaleString()} coins`
        : meta.unitCost > 0
          ? `${meta.unitCost.toLocaleString()} coins`
          : '';
    const qtyLabel = meta.qty > 1 ? ` \u00d7${meta.qty}` : '';
    notifyCard.innerHTML = `
      <div class="ap-gift-notify-thumb" aria-hidden="true">${meta.emoji}</div>
      <div class="ap-gift-notify-body">
        <div class="ap-gift-notify-sender">${escapeHtml(sender)} sent</div>
        <div class="ap-gift-notify-name">${escapeHtml(meta.name)}</div>
        <div class="ap-gift-notify-meta">${escapeHtml(coins)}${escapeHtml(qtyLabel)}</div>
      </div>`;
    notifyRoot.appendChild(notifyCard);
    notifyRoot.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => notifyCard.classList.add('is-visible'));
    notifyTimer = setTimeout(() => hideNotify(), Math.min(meta.durationMs, 6000));
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function playAnimation(meta, opts) {
    const url = String(opts?.forceUrl || meta.animationUrl || '').trim();
    if (!url) {
      finishCurrent('no-url');
      return;
    }

    ensureAnimRoot();
    rootEl.textContent = '';
    playing = true;

    debugLog('triggering overlay');
    debugLog('animation URL=', url);
    animLog('load started', url);

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
    frameEl.setAttribute('allowtransparency', 'true');

    frameEl.addEventListener('load', () => {
      animLog('loaded');
    });
    frameEl.addEventListener('error', () => {
      animLog('load error');
      if (!isDebugMode()) finishCurrent('iframe-error');
    });

    stageEl.appendChild(frameEl);
    rootEl.appendChild(stageEl);
    rootEl.classList.add('is-visible');
    rootEl.setAttribute('aria-hidden', 'false');

    try {
      frameEl.src = url;
    } catch (e) {
      animLog('load error', e?.message || String(e));
      if (!isDebugMode()) finishCurrent('iframe-src-error');
      return;
    }

    if (!isDebugMode() && !opts?.keepVisible) {
      hideTimer = setTimeout(() => finishCurrent('duration'), meta.durationMs);
    }
  }

  function finishCurrent(reason) {
    debugLog('animation finished', reason || '');
    hideAnimation(reason);
    if (!isDebugMode()) pumpQueue();
  }

  function enqueue(gift, meta) {
    if (playing) {
      if (queue.length >= MAX_QUEUE) queue.shift();
      queue.push({ gift, meta });
      log('queued', queue.length);
      return;
    }
    queue.push({ gift, meta });
    pumpQueue();
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

    debugLog('gift event received');
    debugLog('giftId=', meta.slug || '(none)');
    debugLog('giftName=', meta.name);
    debugLog('coinValue=', meta.charged || meta.unitCost);
    debugLog('transactionId=', tx || '(none)');

    if (!hasAnimationForGift(gift)) {
      debugLog('no AnimStream mapping for slug', giftSlug(gift) || '(empty)');
      return;
    }
    if (!claimTransaction(gift)) return;

    enqueue(gift, meta);
  }

  function testAnimation1() {
    const meta = {
      slug: 'imperial_bloom_10000',
      name: 'Imperial Bloom',
      emoji: '\u{1F33A}',
      qty: 1,
      unitCost: 10000,
      charged: 10000,
      animationUrl: ANIM1_URL,
      durationMs: DEFAULT_DURATION,
    };
    const gift = {
      from: 'DEBUG',
      giftSlug: 'imperial_bloom_10000',
      giftName: 'Imperial Bloom',
      amount: 10000,
      emoji: '\u{1F33A}',
    };
    queue.length = 0;
    if (playing) hideAnimation('test-restart');
    enqueue(gift, meta);
  }

  function ensureTestButton() {
    if (!isDebugMode()) return;
    if (document.getElementById('apGiftAnimTestBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'apGiftAnimTestBtn';
    btn.type = 'button';
    btn.textContent = 'TEST ANIMSTREAM';
    btn.className = 'ap-gift-anim-test-btn';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      testAnimation1();
    });
    document.body.appendChild(btn);
  }

  function cleanup() {
    queue.length = 0;
    hideAnimation('cleanup');
    processedGiftEvents.clear();
    document.getElementById('apGiftAnimTestBtn')?.remove();
  }

  if (isDebugMode()) ensureTestButton();

  window.GiftAnimationOverlay = {
    hasAnimationForGift,
    onGiftReceived,
    cleanup,
    resolveMeta,
    transactionId,
    giftSlug,
    testAnimation1,
    isDebugMode,
  };
})();
