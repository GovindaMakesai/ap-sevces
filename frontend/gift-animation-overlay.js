/**
 * GiftAnimationOverlay — AnimStream embed full-screen over live video (below chat UI).
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
    cfg.ANIM_URLS?.anim1 ||
    'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1';
  const TEST_ANIMATIONS = Array.isArray(cfg.TEST_ANIMATIONS) ? cfg.TEST_ANIMATIONS : [];
  let testAnimIndex = 0;

  const processedGiftEvents = new Map();
  const PROCESSED_TTL_MS = 120000;

  let rootEl = null;
  let notifyRoot = null;
  let notifyCard = null;
  let notifyTimer = null;
  let frameEl = null;
  let stageEl = null;
  let debugPanelEl = null;
  let playing = false;
  let hideTimer = null;
  let resizeBound = false;
  const queue = [];
  const debugState = {
    url: '',
    webViewLoaded: false,
    audioDetected: false,
    visualDetected: false,
    viewportW: 0,
    viewportH: 0,
    animW: 0,
    animH: 0,
  };

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

  function getLiveShell() {
    return (
      document.getElementById('liveRoomRoot') ||
      document.querySelector('.party-room') ||
      null
    );
  }

  function getAnimInsertBefore(shell) {
    if (!shell) return null;
    return (
      shell.querySelector('.live-overlay') ||
      shell.querySelector('.party-room-body') ||
      shell.querySelector('.party-header') ||
      null
    );
  }

  function getNotifyMount() {
    const shell = getLiveShell();
    if (!shell) return document.body;
    return (
      shell.querySelector('.live-overlay') ||
      shell.querySelector('.party-room-body') ||
      shell
    );
  }

  function insertAnimOverlay(el) {
    const shell = getLiveShell();
    if (shell) {
      const before = getAnimInsertBefore(shell);
      if (el.parentElement !== shell) {
        if (before) shell.insertBefore(el, before);
        else shell.appendChild(el);
      }
      el.classList.add('ap-gift-anim-in-shell');
      return;
    }
    el.classList.remove('ap-gift-anim-in-shell');
    if (el.parentElement !== document.body) document.body.appendChild(el);
  }

  function getOverlayViewport() {
    const shell = getLiveShell();
    if (shell) {
      const rect = shell.getBoundingClientRect();
      return {
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      };
    }
    return {
      width: Math.max(0, Math.round(window.innerWidth)),
      height: Math.max(
        0,
        Math.round(
          window.innerHeight -
            (Number.parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--ap-bottom-bar-h')
            ) || 58)
        )
      ),
    };
  }

  function syncOverlayViewport() {
    if (!rootEl) return;
    const vp = getOverlayViewport();
    debugState.viewportW = vp.width;
    debugState.viewportH = vp.height;
    if (stageEl) {
      const stageRect = stageEl.getBoundingClientRect();
      debugState.animW = Math.round(stageRect.width);
      debugState.animH = Math.round(stageRect.height);
    }
    rootEl.style.setProperty('--ap-gift-overlay-w', `${vp.width}px`);
    rootEl.style.setProperty('--ap-gift-overlay-h', `${vp.height}px`);
    updateDebugPanel();
  }

  function bindResizeSync() {
    if (resizeBound) return;
    resizeBound = true;
    const onResize = () => syncOverlayViewport();
    window.addEventListener('resize', onResize);
    try {
      const vv = window.visualViewport;
      if (vv) {
        vv.addEventListener('resize', onResize);
        vv.addEventListener('scroll', onResize);
      }
    } catch (_e) { /* */ }
  }

  function ensureDebugPanel() {
    if (!isDebugMode()) return null;
    if (debugPanelEl) return debugPanelEl;
    debugPanelEl = document.createElement('div');
    debugPanelEl.id = 'apGiftAnimDebugPanel';
    document.body.appendChild(debugPanelEl);
    return debugPanelEl;
  }

  function updateDebugPanel() {
    if (!isDebugMode()) return;
    const panel = ensureDebugPanel();
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = [
      `Live viewport: ${debugState.viewportW} × ${debugState.viewportH}`,
      `Animation viewport: ${debugState.animW} × ${debugState.animH}`,
      `Animation URL: ${debugState.url || '—'}`,
      `WebView loaded: ${debugState.webViewLoaded ? 'YES' : 'NO'}`,
      `Visual element detected: ${debugState.visualDetected ? 'YES' : 'NO'}`,
      `Audio detected: ${debugState.audioDetected ? 'YES' : 'NO'}`,
    ].join('<br>');
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

  function slugFromNameCost(name, cost) {
    const base = String(name || 'gift')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const n = Number(cost || 0);
    return n > 0 ? `${base}_${n}` : base;
  }

  function giftSlug(gift) {
    const direct = String(
      gift?.giftSlug || gift?.giftType || gift?.gift_type || gift?.gift_type_slug || ''
    ).trim();
    if (direct) return direct;
    const name = gift?.giftName || gift?.name;
    const cost = gift?.amount || gift?.coins || gift?.coin_amount;
    if (name && cost) return slugFromNameCost(name, cost);
    return '';
  }

  function lookupAnimation(slug, gift) {
    if (slug && MAP[slug]?.animationUrl) return MAP[slug];
    const derived = slugFromNameCost(
      gift?.giftName || gift?.name,
      gift?.amount || gift?.coins || gift?.coin_amount
    );
    if (derived && MAP[derived]?.animationUrl) return MAP[derived];
    const amt = Number(gift?.amount || gift?.coins || gift?.coin_amount || 0);
    const name = String(gift?.giftName || gift?.name || '').toLowerCase();
    if (amt === 10000 && /imperial|bloom/.test(name)) {
      return MAP.imperial_bloom_10000 || MAP['imperial_bloom_10000'];
    }
    return null;
  }

  function transactionId(gift) {
    return normalizeTxId(gift?.gift_tx_id || gift?.id);
  }

  function resolveMeta(gift) {
    const slug = giftSlug(gift);
    const catalog = CATALOG[slug] || {};
    const mapped = lookupAnimation(slug, gift) || MAP[slug];
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
    const thumbnailUrl =
      catalog.thumbnailUrl || mapped?.thumbnailUrl || cfg.getThumbnailUrl?.(slug) || '';
    return {
      slug,
      name,
      emoji,
      qty,
      unitCost: unitCost || (qty > 1 && charged ? Math.round(charged / qty) : charged),
      charged,
      animationUrl: mapped?.animationEmbedUrl || mapped?.animationUrl || '',
      thumbnailUrl,
      durationMs: Number(mapped?.durationMs || DEFAULT_DURATION),
      label: mapped?.label || '',
    };
  }

  function hasAnimationForGift(gift) {
    const slug = giftSlug(gift);
    return Boolean(lookupAnimation(slug, gift)?.animationUrl);
  }

  function eventSoftKey(gift) {
    const from = String(gift?.fromUserId || gift?.senderId || '');
    const to = String(gift?.toUserId || gift?.receiver_id || gift?.recipientId || '');
    const amt = Number(gift?.amount || gift?.coins || gift?.coin_amount || 0);
    const qty = Number(gift?.qty || 1);
    const slug = giftSlug(gift);
    if (from && to && amt > 0) return `uid:${from}|${to}|${amt}|${qty}|${slug}`;
    return '';
  }

  function claimTransaction(gift) {
    if (isDebugMode()) return true;
    pruneProcessed();
    const tx = transactionId(gift);
    const soft = eventSoftKey(gift);
    if (tx && processedGiftEvents.has(tx)) {
      log('duplicate ignored', { transactionId: tx });
      return false;
    }
    if (soft && processedGiftEvents.has(soft)) {
      log('duplicate ignored', { softKey: soft });
      return false;
    }
    const now = Date.now();
    if (tx) processedGiftEvents.set(tx, now);
    if (soft) processedGiftEvents.set(soft, now);
    return true;
  }

  function ensureAnimRoot() {
    if (rootEl) {
      insertAnimOverlay(rootEl);
      syncOverlayViewport();
      return rootEl;
    }
    rootEl = document.createElement('div');
    rootEl.id = 'apGiftAnimOverlay';
    rootEl.setAttribute('aria-hidden', 'true');
    if (isDebugMode()) rootEl.classList.add('is-debug');
    insertAnimOverlay(rootEl);
    bindResizeSync();
    syncOverlayViewport();
    debugLog('overlay mounted in live shell', rootEl.parentElement?.id || rootEl.parentElement?.className || 'body');
    return rootEl;
  }

  function ensureNotifyRoot() {
    const mount = getNotifyMount();
    if (notifyRoot) {
      if (notifyRoot.parentElement !== mount) mount.appendChild(notifyRoot);
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
      stageEl = null;
    }
    debugState.url = '';
    debugState.webViewLoaded = false;
    debugState.audioDetected = false;
    debugState.visualDetected = false;
    updateDebugPanel();
    if (playing) {
      debugLog('overlay unmounted', reason || '');
      animLog('overlay unmounted', reason || '');
    }
    playing = false;
  }

  function thumbNotifyHtml(meta) {
    if (meta.thumbnailUrl) {
      return `<img src="${escapeAttr(meta.thumbnailUrl)}" alt="" loading="lazy">`;
    }
    return meta.emoji;
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
      <div class="ap-gift-notify-thumb" aria-hidden="true">${thumbNotifyHtml(meta)}</div>
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

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
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
    debugState.url = url;
    debugState.webViewLoaded = false;
    debugState.audioDetected = false;
    debugState.visualDetected = false;

    debugLog('triggering overlay');
    debugLog('animation URL=', url);
    animLog('load started', url);

    stageEl = document.createElement('div');
    stageEl.className = 'ap-gift-anim-stage';

    const frameWrap = document.createElement('div');
    frameWrap.className = 'ap-gift-anim-frame-wrap';

    frameEl = document.createElement('iframe');
    frameEl.className = 'ap-gift-anim-frame';
    frameEl.setAttribute('title', 'Gift animation');
    frameEl.setAttribute('loading', 'eager');
    frameEl.setAttribute(
      'allow',
      'autoplay; fullscreen; encrypted-media; picture-in-picture; web-share'
    );
    frameEl.setAttribute('referrerpolicy', 'no-referrer');
    frameEl.setAttribute('scrolling', 'no');
    frameEl.setAttribute('frameborder', '0');
    frameEl.setAttribute('allowfullscreen', 'true');
    frameEl.setAttribute('allowtransparency', 'true');
    frameEl.style.background = 'transparent';

    frameEl.addEventListener('load', () => {
      debugState.webViewLoaded = true;
      debugState.visualDetected = true;
      animLog('loaded');
      syncOverlayViewport();
      updateDebugPanel();
    });
    frameEl.addEventListener('error', () => {
      animLog('load error');
      if (!isDebugMode()) finishCurrent('iframe-error');
    });

    frameWrap.appendChild(frameEl);
    stageEl.appendChild(frameWrap);
    rootEl.appendChild(stageEl);
    rootEl.classList.add('is-visible');
    rootEl.setAttribute('aria-hidden', 'false');
    rootEl.style.pointerEvents = 'none';

    syncOverlayViewport();

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

  function previewSlug(slug) {
    const key = String(slug || '').trim();
    if (!key || !MAP[key]) return false;
    const meta = {
      slug: key,
      name: MAP[key].giftName || key,
      emoji: MAP[key].emoji || '\u{1F381}',
      qty: 1,
      unitCost: MAP[key].coinValue || 0,
      charged: MAP[key].coinValue || 0,
      animationUrl: MAP[key].animationEmbedUrl || MAP[key].animationUrl,
      thumbnailUrl: MAP[key].thumbnailUrl || '',
      durationMs: Number(MAP[key].durationMs || DEFAULT_DURATION),
    };
    const gift = { from: 'Preview', giftSlug: key, giftName: meta.name, amount: meta.charged, emoji: meta.emoji };
    queue.length = 0;
    if (playing) hideAnimation('preview-restart');
    enqueue(gift, meta);
    return true;
  }

  function testAnimation1() {
    const preset =
      TEST_ANIMATIONS[testAnimIndex] ||
      TEST_ANIMATIONS[0] ||
      CATALOG.imperial_bloom_10000 ||
      {};
    testAnimIndex = TEST_ANIMATIONS.length
      ? (testAnimIndex + 1) % TEST_ANIMATIONS.length
      : 0;
    const slug = preset.slug || 'imperial_bloom_10000';
    previewSlug(slug);
  }

  function ensureTestButton() {
    if (!isDebugMode()) return;
    if (document.getElementById('apGiftAnimTestBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'apGiftAnimTestBtn';
    btn.type = 'button';
    btn.textContent = TEST_ANIMATIONS.length > 1 ? 'TEST ANIM' : 'TEST ANIMSTREAM';
    btn.className = 'ap-gift-anim-test-btn';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      testAnimation1();
    });
    document.body.appendChild(btn);
    ensureDebugPanel();
    updateDebugPanel();
  }

  function cleanup() {
    queue.length = 0;
    hideAnimation('cleanup');
    processedGiftEvents.clear();
    document.getElementById('apGiftAnimTestBtn')?.remove();
    if (debugPanelEl) {
      debugPanelEl.remove();
      debugPanelEl = null;
    }
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
    previewSlug,
    isDebugMode,
    syncOverlayViewport,
  };
})();
