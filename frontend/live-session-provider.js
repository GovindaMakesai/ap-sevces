/**
 * Global live session — keeps Agora + socket alive across in-app browse (YouTube-style mini-player).
 * Room page stays loaded; explore/other pages open in a full-screen browse shell iframe.
 */
(function () {
  'use strict';

  const STATE = { IDLE: 'idle', ACTIVE: 'active', MINIMIZED: 'minimized' };
  const STORAGE_KEY = 'ap_live_active_session';

  let state = STATE.IDLE;
  let sessionMeta = null;
  let browseShell = null;
  let miniPlayer = null;
  let mediaHome = null;
  let dragState = null;

  function isRoomPage() {
    const p = document.body?.dataset?.livePage;
    return p === 'party-room' || p === 'live-room';
  }

  function isVideoSession() {
    if (sessionMeta?.isVideo != null) return Boolean(sessionMeta.isVideo);
    const page = document.body?.dataset?.livePage;
    if (page === 'party-room') return false;
    return !document.getElementById('liveRoomRoot')?.classList.contains('is-audio-mode');
  }

  function readStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem('ap_live_pip_session');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.expiresAt && Date.now() > data.expiresAt) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function persistSession(extra) {
    if (!sessionMeta) return;
    const payload = {
      ...sessionMeta,
      ts: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      ...(extra || {}),
    };
    sessionMeta = payload;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      sessionStorage.setItem('ap_live_pip_session', JSON.stringify(payload));
    } catch (_e) {}
  }

  function clearSession() {
    sessionMeta = null;
    state = STATE.IDLE;
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('ap_live_pip_session');
    } catch (_e) {}
  }

  function notifyNative(event, detail) {
    try {
      const msg = JSON.stringify({ type: 'live_session', event, ...(detail || {}) });
      window.ReactNativeWebView?.postMessage(msg);
    } catch (_e) {}
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function getViewerCount() {
    const el = document.getElementById('liveViewerCount');
    if (el) return el.textContent || '0';
    return String(sessionMeta?.viewers || '0');
  }

  function collectMeta() {
    const page = document.body?.dataset?.livePage || 'live-room';
    const host =
      document.getElementById('partyHostName')?.textContent ||
      document.getElementById('liveHostName')?.textContent ||
      sessionMeta?.host ||
      'Live';
    return {
      url: location.pathname + location.search,
      channel: (window.APLive?.getChannel && APLive.getChannel()) || sessionMeta?.channel || '',
      host: host.trim(),
      type: page,
      isVideo: isVideoSession(),
      viewers: getViewerCount(),
      micMuted: document.getElementById('liveBtnMic')?.classList.contains('is-muted'),
    };
  }

  function ensureBrowseShell(url) {
    const dest = url || '/explore.html?app=1';
    if (!browseShell) {
      browseShell = document.createElement('div');
      browseShell.id = 'apLiveBrowseShell';
      browseShell.className = 'ap-live-browse-shell';
      browseShell.innerHTML =
        '<iframe id="apLiveBrowseFrame" class="ap-live-browse-frame" title="AP Services" src="' +
        esc(dest) +
        '"></iframe>';
      document.body.appendChild(browseShell);
    } else {
      const frame = browseShell.querySelector('iframe');
      if (frame && frame.src !== new URL(dest, location.origin).href) {
        frame.src = dest;
      }
    }
    requestAnimationFrame(() => browseShell.classList.add('is-visible'));
  }

  function removeBrowseShell() {
    browseShell?.classList.remove('is-visible');
  }

  function destroyBrowseShell() {
    browseShell?.remove();
    browseShell = null;
  }

  function attachMediaToMini() {
    const mediaSlot = document.getElementById('apMiniPlayerMedia');
    if (!mediaSlot) return;

    const remoteHost = document.getElementById('liveRemoteHost');
    const localHost = document.getElementById('liveLocalHost');
    const partyRoom = document.querySelector('.party-room');

    if (isVideoSession() && remoteHost) {
      mediaHome = { parent: remoteHost.parentElement, next: remoteHost.nextSibling, id: 'liveRemoteHost' };
      mediaSlot.appendChild(remoteHost);
      remoteHost.classList.add('ap-mini-player-video-host');
      return;
    }
    if (isVideoSession() && localHost && isRoomPage()) {
      mediaHome = { parent: localHost.parentElement, next: localHost.nextSibling, id: 'liveLocalHost' };
      mediaSlot.appendChild(localHost);
      localHost.classList.add('ap-mini-player-video-host');
      return;
    }
    if (partyRoom) {
      const avatar = document.getElementById('partyHostAvatar');
      if (avatar?.src) {
        mediaSlot.innerHTML =
          '<img class="ap-mini-player-avatar" src="' + esc(avatar.src) + '" alt="">';
      }
    }
  }

  function restoreMediaFromMini() {
    if (!mediaHome) return;
    const el = document.getElementById(mediaHome.id);
    const parent = mediaHome.parent;
    if (!el || !parent) return;
    el.classList.remove('ap-mini-player-video-host');
    if (mediaHome.next) parent.insertBefore(el, mediaHome.next);
    else parent.appendChild(el);
    mediaHome = null;
    const slot = document.getElementById('apMiniPlayerMedia');
    if (slot) slot.innerHTML = '';
  }

  function ensureMiniPlayer() {
    if (miniPlayer) {
      updateMiniPlayer();
      return;
    }
    document.getElementById('apLivePipBar')?.remove();
    const video = isVideoSession();
    miniPlayer = document.createElement('div');
    miniPlayer.id = 'apLiveMiniPlayer';
    miniPlayer.className = 'ap-live-mini-player' + (video ? ' is-video' : ' is-audio');
    miniPlayer.innerHTML =
      '<div class="ap-mini-player-drag" id="apMiniPlayerDrag">' +
      (video ? '<div class="ap-mini-player-media" id="apMiniPlayerMedia"></div>' : '<div class="ap-mini-player-media ap-mini-player-media--audio" id="apMiniPlayerMedia"></div>') +
      '<div class="ap-mini-player-chrome">' +
      '<span class="ap-mini-player-live">LIVE</span>' +
      '<span class="ap-mini-player-viewers" id="apMiniPlayerViewers"></span>' +
      '<button type="button" class="ap-mini-player-close" id="apMiniPlayerClose" aria-label="Leave"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="ap-mini-player-footer">' +
      '<div class="ap-mini-player-meta">' +
      '<strong id="apMiniPlayerHost"></strong>' +
      '<small id="apMiniPlayerSub"></small>' +
      '</div>' +
      '<div class="ap-mini-player-indicators" id="apMiniPlayerIndicators"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(miniPlayer);

    document.getElementById('apMiniPlayerClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      exit();
    });
    miniPlayer.addEventListener('click', (e) => {
      if (e.target.closest('.ap-mini-player-close')) return;
      expand();
    });

    bindMiniPlayerDrag();
    attachMediaToMini();
    updateMiniPlayer();
  }

  function updateMiniPlayer() {
    if (!miniPlayer || !sessionMeta) return;
    const hostEl = document.getElementById('apMiniPlayerHost');
    const subEl = document.getElementById('apMiniPlayerSub');
    const viewersEl = document.getElementById('apMiniPlayerViewers');
    const indEl = document.getElementById('apMiniPlayerIndicators');
    if (hostEl) hostEl.textContent = sessionMeta.host || 'Live';
    if (subEl) {
      subEl.textContent =
        sessionMeta.type === 'party-room' ? 'Voice party' : sessionMeta.isVideo ? 'Live video' : 'Live audio';
    }
    if (viewersEl) viewersEl.textContent = getViewerCount();
    if (indEl) {
      const micMuted = document.getElementById('liveBtnMic')?.classList.contains('is-muted');
      const soundOff = document.getElementById('partyBtnSound')?.dataset?.muted === '1';
      indEl.innerHTML =
        '<span title="Microphone"><i class="fas fa-microphone' +
        (micMuted ? '-slash' : '') +
        '"></i></span>' +
        '<span title="Speaker"><i class="fas fa-volume' +
        (soundOff ? '-mute' : '-up') +
        '"></i></span>';
    }
  }

  function removeMiniPlayer() {
    restoreMediaFromMini();
    miniPlayer?.remove();
    miniPlayer = null;
  }

  function bindMiniPlayerDrag() {
    const handle = document.getElementById('apMiniPlayerDrag');
    if (!handle || handle.dataset.dragBound) return;
    handle.dataset.dragBound = '1';

    const onStart = (clientX, clientY) => {
      if (!miniPlayer) return;
      const rect = miniPlayer.getBoundingClientRect();
      dragState = { dx: clientX - rect.left, dy: clientY - rect.top, w: rect.width, h: rect.height };
      miniPlayer.classList.add('is-dragging');
    };
    const onMove = (clientX, clientY) => {
      if (!dragState || !miniPlayer) return;
      const pad = 8;
      const maxX = window.innerWidth - dragState.w - pad;
      const maxY = window.innerHeight - dragState.h - pad;
      const left = Math.min(maxX, Math.max(pad, clientX - dragState.dx));
      const top = Math.min(maxY, Math.max(pad, clientY - dragState.dy));
      miniPlayer.style.left = left + 'px';
      miniPlayer.style.top = top + 'px';
      miniPlayer.style.right = 'auto';
      miniPlayer.style.bottom = 'auto';
    };
    const onEnd = () => {
      dragState = null;
      miniPlayer?.classList.remove('is-dragging');
    };

    handle.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0];
        if (t) onStart(t.clientX, t.clientY);
      },
      { passive: true }
    );
    handle.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0];
        if (t) onMove(t.clientX, t.clientY);
      },
      { passive: true }
    );
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart(e.clientX, e.clientY);
      const onMm = (ev) => onMove(ev.clientX, ev.clientY);
      const onMu = () => {
        onEnd();
        window.removeEventListener('mousemove', onMm);
        window.removeEventListener('mouseup', onMu);
      };
      window.addEventListener('mousemove', onMm);
      window.addEventListener('mouseup', onMu);
    });
  }

  function applyMinimizedDom() {
    document.documentElement.classList.add('ap-live-session-minimized');
    document.body.classList.add('ap-live-session-minimized');
    document.getElementById('apLivePipBar')?.remove();
  }

  function clearMinimizedDom() {
    document.documentElement.classList.remove('ap-live-session-minimized');
    document.body.classList.remove('ap-live-session-minimized');
  }

  function openBrowsePage(href) {
    const url = href || '/explore.html?app=1';
    if (state === STATE.MINIMIZED) {
      ensureBrowseShell(url);
      return true;
    }
    if (isRoomPage()) {
      sessionMeta = collectMeta();
      state = STATE.MINIMIZED;
      persistSession();
      applyMinimizedDom();
      ensureBrowseShell(url);
      ensureMiniPlayer();
      notifyNative('minimized', { type: sessionMeta.type, channel: sessionMeta.channel, browse: url });
      return true;
    }
    return false;
  }

  function minimize(browseUrl) {
    if (!isRoomPage()) return false;
    if (state === STATE.MINIMIZED) return true;

    sessionMeta = collectMeta();
    state = STATE.MINIMIZED;
    persistSession();
    applyMinimizedDom();
    ensureBrowseShell(browseUrl || '/explore.html?app=1');
    ensureMiniPlayer();
    notifyNative('minimized', { type: sessionMeta.type, channel: sessionMeta.channel });
    return true;
  }

  function expand() {
    if (state === STATE.MINIMIZED && isRoomPage()) {
      state = STATE.ACTIVE;
      clearMinimizedDom();
      destroyBrowseShell();
      removeMiniPlayer();
      persistSession();
      notifyNative('expanded', {});
      window.APLive?.onMiniPlayerExpand?.();
      return true;
    }
    const stored = readStoredSession();
    if (stored?.url) {
      location.href = stored.url;
      return true;
    }
    return false;
  }

  function forceCleanup() {
    state = STATE.IDLE;
    clearMinimizedDom();
    destroyBrowseShell();
    removeMiniPlayer();
    clearSession();
  }

  async function exit() {
    if (window.__apLiveSessionExitInProgress) return;
    window.__apLiveSessionExitInProgress = true;
    forceCleanup();
    notifyNative('ended', {});
    try {
      const live = window.APLive || window.SocialLive;
      if (live?.exitRoom) await live.exitRoom();
    } finally {
      window.__apLiveSessionExitInProgress = false;
    }
  }

  function onRoomActive() {
    if (!isRoomPage()) return;
    state = STATE.ACTIVE;
    sessionMeta = collectMeta();
    persistSession();
    notifyNative('active', { type: sessionMeta.type, channel: sessionMeta.channel });
  }

  function shouldKeepPlayback() {
    return state === STATE.ACTIVE || state === STATE.MINIMIZED;
  }

  function isMinimized() {
    return state === STATE.MINIMIZED;
  }

  function isActive() {
    return state === STATE.ACTIVE || state === STATE.MINIMIZED;
  }

  function navigateBrowse(href) {
    if (state !== STATE.MINIMIZED) return false;
    ensureBrowseShell(href);
    return true;
  }

  function handleBack() {
    if (state === STATE.MINIMIZED) {
      const frame = document.getElementById('apLiveBrowseFrame');
      try {
        if (frame?.contentWindow?.history?.length > 1) {
          frame.contentWindow.history.back();
          return true;
        }
      } catch (_e) {}
      return true;
    }
    if (isRoomPage()) {
      return minimize();
    }
    return false;
  }

  async function tryEnterPiP() {
    if (!isVideoSession() || !shouldKeepPlayback()) return false;
    const video =
      document.querySelector('#apMiniPlayerMedia video') ||
      document.querySelector('#liveRemoteHost video') ||
      document.querySelector('#liveRemoteHost canvas');
    if (!video || !document.pictureInPictureEnabled) return false;
    try {
      if (document.pictureInPictureElement !== video) {
        await video.requestPictureInPicture();
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function tryExitPiP() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
    } catch (_e) {}
  }

  function onAppBackground() {
    if (!shouldKeepPlayback()) return;
    persistSession();
    if (isVideoSession()) tryEnterPiP();
    notifyNative('background', { pip: Boolean(document.pictureInPictureElement) });
  }

  function onAppForeground() {
    if (!shouldKeepPlayback()) return;
    tryExitPiP();
    updateMiniPlayer();
    window.APLive?.onMiniPlayerExpand?.();
    notifyNative('foreground', {});
  }

  function mountLegacyPipBar() {
    if (isRoomPage() || isActive() || isMinimized()) return;
    if (document.getElementById('apLiveMiniPlayer')) return;
    try {
      if (window.parent !== window && window.parent.LiveSession?.isMinimized?.()) return;
    } catch (_e) {}
    const data = readStoredSession();
    if (!data?.url || document.getElementById('apLivePipBar')) return;
    const label = data.host || (data.type === 'party-room' ? 'Party' : 'Live');
    const bar = document.createElement('div');
    bar.id = 'apLivePipBar';
    bar.className = 'ap-live-pip-bar';
    bar.innerHTML =
      '<button type="button" class="ap-live-pip-expand" id="apLivePipExpand">' +
      '<span class="ap-live-pip-pulse" aria-hidden="true"></span>' +
      '<span class="ap-live-pip-text"><strong>' +
      esc(label) +
      '</strong><small>Tap to return</small></span></button>' +
      '<button type="button" class="ap-live-pip-close" id="apLivePipClose" aria-label="Leave"><i class="fas fa-times"></i></button>';
    document.body.appendChild(bar);
    document.getElementById('apLivePipExpand')?.addEventListener('click', () => {
      location.href = data.url;
    });
    document.getElementById('apLivePipClose')?.addEventListener('click', () => {
      clearSession();
      bar.remove();
    });
  }

  setInterval(() => {
    if (state === STATE.MINIMIZED) updateMiniPlayer();
  }, 4000);

  if (isRoomPage()) {
    state = STATE.ACTIVE;
    sessionMeta = collectMeta();
    persistSession();
  }

  window.LiveSession = {
    minimize,
    openBrowsePage,
    expand,
    exit,
    forceCleanup,
    onRoomActive,
    shouldKeepPlayback,
    isMinimized,
    isActive,
    navigateBrowse,
    handleBack,
    onAppBackground,
    onAppForeground,
    mountLegacyPipBar,
    getState: () => state,
    getMeta: () => sessionMeta,
  };
})();
