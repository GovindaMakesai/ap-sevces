/**
 * Virtual cosmetics — API, cache, reusable render helpers.
 */
(function (global) {
  const CATEGORY_LABELS = {
    ENTRY_FRAME: 'Entry Frames',
    CHAT_BUBBLE: 'Chat Bubbles',
    PROFILE_TAG: 'Profile Tags',
    ID_EFFECT: 'ID Effects',
    MIC_EFFECT: 'Mic Effects',
    PROFILE_RING: 'Rings',
  };

  const CATEGORY_KEYS = {
    ENTRY_FRAME: 'entryFrame',
    CHAT_BUBBLE: 'chatBubble',
    PROFILE_TAG: 'profileTag',
    ID_EFFECT: 'idEffect',
    MIC_EFFECT: 'micEffect',
    PROFILE_RING: 'profileRing',
  };

  const userCache = new Map();
  let selfEquipped = null;

  function apiUrl(path) {
    return typeof joinApiUrl === 'function' ? joinApiUrl(path) : `/api${path}`;
  }

  async function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
      const t = localStorage.getItem('token');
      if (t) h.Authorization = `Bearer ${t}`;
    } catch (_e) {}
    return h;
  }

  async function fetchJson(path, opts = {}) {
    const res = await fetch(apiUrl(path), {
      ...opts,
      headers: { ...(await authHeaders()), ...(opts.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Request failed (${res.status})`);
    }
    return json.data;
  }

  async function listProducts(category) {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchJson(`/cosmetics${q}`);
  }

  async function getProduct(id) {
    return fetchJson(`/cosmetics/${encodeURIComponent(id)}`);
  }

  async function fetchInventory(category) {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchJson(`/cosmetics/inventory${q}`);
  }

  async function fetchEquipped() {
    const data = await fetchJson('/cosmetics/equipped');
    selfEquipped = data?.cosmetics || {};
    return selfEquipped;
  }

  async function fetchEquippedForUser(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return {};
    if (userCache.has(uid)) return userCache.get(uid);
    const data = await fetchJson(`/cosmetics/equipped/${encodeURIComponent(uid)}`);
    const cosmetics = data?.cosmetics || {};
    userCache.set(uid, cosmetics);
    setTimeout(() => userCache.delete(uid), 120000);
    return cosmetics;
  }

  async function purchase(cosmeticId, variantId) {
    const data = await fetchJson('/cosmetics/purchase', {
      method: 'POST',
      body: JSON.stringify({ cosmetic_id: cosmeticId, variant_id: variantId }),
    });
    if (window.SocialWallet?.invalidateBalance) SocialWallet.invalidateBalance();
    await fetchEquipped();
    return data;
  }

  async function equip(ownershipId) {
    const data = await fetchJson('/cosmetics/equip', {
      method: 'POST',
      body: JSON.stringify({ ownership_id: ownershipId }),
    });
    selfEquipped = data?.cosmetics || selfEquipped;
    const selfId = String(window.currentUser?.()?.id || '').trim();
    if (selfId) userCache.set(selfId, selfEquipped);
    return data;
  }

  async function unequip(ownershipId) {
    const data = await fetchJson('/cosmetics/unequip', {
      method: 'POST',
      body: JSON.stringify({ ownership_id: ownershipId }),
    });
    selfEquipped = data?.cosmetics || selfEquipped;
    return data;
  }

  function getCachedForUser(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return {};
    const selfId = String(window.currentUser?.()?.id || '').trim();
    if (uid === selfId && selfEquipped) return selfEquipped;
    return userCache.get(uid) || {};
  }

  function setCachedForUser(userId, cosmetics) {
    const uid = String(userId || '').trim();
    if (!uid) return;
    userCache.set(uid, cosmetics || {});
    if (String(window.currentUser?.()?.id || '') === uid) selfEquipped = cosmetics;
  }

  function itemForCategory(cosmetics, category) {
    const key = CATEGORY_KEYS[category] || category;
    return cosmetics?.[key] || null;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ringClass(item) {
    if (!item) return '';
    return item.cssClass ? String(item.cssClass) : 'ap-cosmetic-ring-default';
  }

  function bubbleClass(item) {
    if (!item) return '';
    return item.cssClass ? String(item.cssClass) : '';
  }

  function mountProfileRing(avatarWrap, item) {
    if (!avatarWrap || !item) return;
    avatarWrap.classList.add('ap-cosmetic-avatar-wrap');
    let ring = avatarWrap.querySelector('.ap-cosmetic-profile-ring');
    if (!ring) {
      ring = document.createElement('span');
      ring.className = 'ap-cosmetic-profile-ring';
      avatarWrap.appendChild(ring);
    }
    ring.className = `ap-cosmetic-profile-ring ${ringClass(item)}`;
    if (item.thumbnailUrl) {
      ring.style.backgroundImage = `url(${item.thumbnailUrl})`;
    }
  }

  function profileTagHtml(item) {
    if (!item) return '';
    const label = escapeHtml(item.tagLabel || item.name || 'TAG');
    const cls = item.cssClass ? escapeHtml(item.cssClass) : 'ap-cosmetic-tag-default';
    return `<span class="ap-cosmetic-profile-tag ${cls}">${label}</span>`;
  }

  function usernameHtml(name, item, { className = '' } = {}) {
    const cls = [className, item?.cssClass || '', item ? 'has-cosmetic-id-effect' : '']
      .filter(Boolean)
      .join(' ');
    return `<span class="ap-cosmetic-username ${cls}">${escapeHtml(name)}</span>`;
  }

  function chatBubbleClasses(item) {
    const cls = bubbleClass(item);
    return cls ? `ap-cosmetic-chat-bubble ${cls}` : '';
  }

  function micEffectClass(item) {
    if (!item?.cssClass) return '';
    return `ap-cosmetic-mic-effect ${item.cssClass}`;
  }

  function entryFrameClass(item) {
    if (!item?.cssClass) return '';
    return `ap-cosmetic-entry-frame ${item.cssClass}`;
  }

  function formatDurationLabel(durationType) {
    const map = {
      '1_DAY': '1 Day',
      '7_DAYS': '7 Days',
      '30_DAYS': '30 Days',
      '90_DAYS': '90 Days',
      PERMANENT: 'Permanent',
    };
    return map[durationType] || durationType;
  }

  function prefetchUsers(userIds) {
    const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    ids.forEach((id) => {
      if (!userCache.has(id)) fetchEquippedForUser(id).catch(() => {});
    });
  }

  const ENTRY_FRAME_MS = 4200;
  const ENTRY_QUEUE_MAX = 4;
  let entryRoot = null;
  let entryPlaying = false;
  const entryQueue = [];
  const recentEntryKeys = new Map();
  const ENTRY_DEDUPE_MS = 8000;

  function getLiveShell() {
    return (
      document.getElementById('liveRoomRoot') ||
      document.querySelector('.party-room') ||
      null
    );
  }

  function getEntryInsertBefore(shell) {
    return (
      shell?.querySelector('.live-overlay') ||
      shell?.querySelector('.party-room-body') ||
      shell?.querySelector('.party-header') ||
      null
    );
  }

  function ensureEntryRoot() {
    if (entryRoot) {
      const shell = getLiveShell();
      if (shell) {
        const before = getEntryInsertBefore(shell);
        if (entryRoot.parentElement !== shell) {
          if (before) shell.insertBefore(entryRoot, before);
          else shell.appendChild(entryRoot);
        }
      } else if (entryRoot.parentElement !== document.body) {
        document.body.appendChild(entryRoot);
      }
      return entryRoot;
    }
    entryRoot = document.createElement('div');
    entryRoot.id = 'apEntryFrameOverlay';
    entryRoot.setAttribute('aria-hidden', 'true');
    entryRoot.className = 'ap-entry-frame-overlay';
    const shell = getLiveShell();
    if (shell) {
      const before = getEntryInsertBefore(shell);
      if (before) shell.insertBefore(entryRoot, before);
      else shell.appendChild(entryRoot);
    } else {
      document.body.appendChild(entryRoot);
    }
    return entryRoot;
  }

  function hideEntryFrame() {
    if (!entryRoot) return;
    entryRoot.classList.remove('is-visible');
    entryRoot.setAttribute('aria-hidden', 'true');
    entryRoot.textContent = '';
    entryPlaying = false;
  }

  function shouldSkipEntry(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const now = Date.now();
    const last = recentEntryKeys.get(uid) || 0;
    if (now - last < ENTRY_DEDUPE_MS) return true;
    recentEntryKeys.set(uid, now);
    for (const [k, t] of recentEntryKeys) {
      if (now - t > ENTRY_DEDUPE_MS * 2) recentEntryKeys.delete(k);
    }
    return false;
  }

  function playEntryFrame(item, opts = {}) {
    if (!item) return false;
    const name = String(opts.name || 'Someone').slice(0, 40);
    const avatarUrl = String(opts.avatarUrl || '').trim();
    const userId = String(opts.userId || '').trim();
    if (userId && shouldSkipEntry(userId)) return false;

    ensureEntryRoot();
    entryPlaying = true;
    entryRoot.textContent = '';
    entryRoot.classList.add('is-visible');
    entryRoot.setAttribute('aria-hidden', 'false');

    const stage = document.createElement('div');
    stage.className = 'ap-entry-frame-stage';

    const animUrl = String(item.animationUrl || '').trim();
    if (animUrl) {
      const wrap = document.createElement('div');
      wrap.className = 'ap-entry-frame-anim-wrap';
      const iframe = document.createElement('iframe');
      iframe.className = 'ap-entry-frame-anim';
      iframe.setAttribute('title', 'Entry animation');
      iframe.setAttribute('loading', 'eager');
      iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowtransparency', 'true');
      iframe.src = animUrl;
      wrap.appendChild(iframe);
      stage.appendChild(wrap);
    }

    const card = document.createElement('div');
    card.className = `ap-entry-frame-card ${entryFrameClass(item)}`.trim();
    if (avatarUrl) {
      const img = document.createElement('img');
      img.className = 'ap-entry-frame-avatar';
      img.alt = '';
      img.src = avatarUrl;
      img.loading = 'lazy';
      card.appendChild(img);
    }
    const label = document.createElement('div');
    label.className = 'ap-entry-frame-label';
    label.innerHTML = `<strong>${escapeHtml(name)}</strong><span>joined the room</span>`;
    card.appendChild(label);
    stage.appendChild(card);
    entryRoot.appendChild(stage);

    setTimeout(() => {
      hideEntryFrame();
      pumpEntryQueue();
    }, ENTRY_FRAME_MS);
    return true;
  }

  function enqueueEntry(item, opts) {
    if (!item) return;
    if (entryPlaying) {
      if (entryQueue.length >= ENTRY_QUEUE_MAX) entryQueue.shift();
      entryQueue.push({ item, opts });
      return;
    }
    entryQueue.push({ item, opts });
    pumpEntryQueue();
  }

  function pumpEntryQueue() {
    if (entryPlaying) return;
    const next = entryQueue.shift();
    if (!next) return;
    const played = playEntryFrame(next.item, next.opts || {});
    if (!played) pumpEntryQueue();
  }

  function showEntryFrame(item, opts = {}) {
    if (!item) return false;
    enqueueEntry(item, opts);
    return true;
  }

  async function showEntryFrameForUser(userId, opts = {}) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    let cosmetics = getCachedForUser(uid);
    if (!cosmetics?.entryFrame) {
      try {
        cosmetics = await fetchEquippedForUser(uid);
      } catch (_e) {
        return false;
      }
    }
    const item = cosmetics?.entryFrame;
    if (!item) return false;
    return showEntryFrame(item, { ...opts, userId: uid });
  }

  function showSelfEntryFrameOnJoin(opts = {}) {
    const selfId = String(window.currentUser?.()?.id || '').trim();
    const equipped = selfEquipped || getCachedForUser(selfId);
    const item = equipped?.entryFrame;
    if (!item) return false;
    return showEntryFrame(item, {
      name: opts.name || window.currentUser?.()?.name || 'You',
      userId: selfId,
      avatarUrl: opts.avatarUrl || '',
    });
  }

  const Cosmetics = {
    CATEGORY_LABELS,
    CATEGORY_KEYS,
    listProducts,
    getProduct,
    fetchInventory,
    fetchEquipped,
    fetchEquippedForUser,
    purchase,
    equip,
    unequip,
    getCachedForUser,
    setCachedForUser,
    itemForCategory,
    mountProfileRing,
    profileTagHtml,
    usernameHtml,
    chatBubbleClasses,
    micEffectClass,
    entryFrameClass,
    formatDurationLabel,
    prefetchUsers,
    getSelfEquipped: () => selfEquipped || {},
    showEntryFrame,
    showEntryFrameForUser,
    showSelfEntryFrameOnJoin,
    dmChatBubbleClass: (item) => {
      const cls = chatBubbleClasses(item);
      return cls ? ` ${cls}` : '';
    },
  };

  global.Cosmetics = Cosmetics;
  global.AP_COSMETICS = Cosmetics;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      if (localStorage.getItem('token')) fetchEquipped().catch(() => {});
    });
  }
})(typeof window !== 'undefined' ? window : global);
