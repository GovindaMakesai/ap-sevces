/**
 * Party room (voice grid) + Live room (video) - Agora + Socket.io
 */
(function () {
  window.__AP_LIVE_BUILD = '20260625-party-seats';
  const _liveEmoji = typeof window !== 'undefined' && window.AP_LIVE_EMOJI ? window.AP_LIVE_EMOJI : {};
  const COIN_EMOJI = _liveEmoji.COIN || '\u{1FA99}';

  if (!_liveEmoji.GIFT_CATALOG) {
    console.warn('[live] Load live-emoji-data.js before social-live.js for gift icons');
  }
  const GIFT_CATALOG = _liveEmoji.GIFT_CATALOG || {
    gift: [], lucky: [], new: [], island: [], fan: [], privilege: [], fun: [],
  };

  const PARTY_MAX_SEATS = 15;
  const PARTY_HOST_SLOT = 1;
  const PARTY_MAX_GUESTS = PARTY_MAX_SEATS - 1;

  function giftSlugFor(item) {
    if (item?.slug) return item.slug;
    const base = String(item?.name || 'gift')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return `${base}_${item?.cost || 0}`;
  }
  Object.keys(GIFT_CATALOG).forEach((cat) => {
    GIFT_CATALOG[cat] = (GIFT_CATALOG[cat] || []).map((g) => ({ ...g, slug: giftSlugFor(g) }));
  });

  const QUICK_CHIP_DEFS = _liveEmoji.QUICK_CHIP_DEFS || [
    { id: 'hi', label: '\u{1F339} Hi there!', send: '\u{1F339} Hi there!' },
    { id: 'follow', label: 'Plz Follow+', action: 'follow' },
    { id: 'lol', label: 'LOL~', send: 'LOL~' },
    { id: 'like', label: 'I like it\u2764\uFE0F', send: 'I like it\u2764\uFE0F' },
    { id: 'dance', label: 'Dance~', send: 'Dance~' },
    { id: 'talent', label: '100% Talented\u{1F44D}', send: '100% Talented\u{1F44D}' },
    { id: 'hot', label: 'Hot girl\u{1F525}', send: 'Hot girl\u{1F525}' },
    { id: 'bravo', label: 'Bravo', send: 'Bravo' },
  ];
  const EMOJI_PICKS = _liveEmoji.EMOJI_PICKS || [
    '\u{1F600}', '\u{1F602}', '\u2764\uFE0F', '\u{1F525}', '\u{1F44D}', '\u{1F389}', '\u{1F4AF}',
    '\u{1F339}', '\u{1F490}', '\u{1F381}', '\u{1F44F}', '\u{1F60D}', '\u{1F64F}', '\u{1F4AA}', '\u2728',
  ];
  let quickChipsExpanded = false;
  let chatRegionFilter = 'room';
  let sessionGiftCoins = 0;
  let userXpProgress = 0;
  const GIFT_OPTIONS = GIFT_CATALOG.gift;

  let giftCategory = 'gift';
  let giftQty = 1;
  let selectedGiftIdx = 0;
  let activeFeedHostId = '';

  let liveSocket = null;
  let roomState = null;
  let chatTab = 'all';
  let followed = false;
  let soundOn = true;
  let micMuted = false;
  let chestSec = 294;
  let teamProgress = 1;
  let joinRequests = [];
  let chatMessages = [];
  let hasSpeakerSeat = false;
  let pkScoreLeft = 0;
  let pkScoreRight = 0;
  let pkTimerSec = 188;
  let micLinkPending = false;
  let feedItems = [];
  let activeFeedIndex = 0;
  let activeChannelOverride = '';
  let feedSwitching = false;
  let feedObserver = null;
  let lastViewerCount = 0;
  let lastCoinBalance = null;
  let pkBattleActive = false;
  let pkEndRequested = false;

  function pkSecsRemaining(snapshot) {
    const endsAt = snapshot?.battle?.ends_at;
    if (endsAt) return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
    return Number(snapshot?.battle?.duration_seconds) || pkTimerSec || 300;
  }

  function applyPkTeamsFromSnapshot(snapshot) {
    const teams = snapshot?.teams || snapshot?.teamScores || [];
    pkScoreLeft = Number(teams[0]?.team_score ?? teams[0]?.score ?? 0);
    pkScoreRight = Number(teams[1]?.team_score ?? teams[1]?.score ?? 0);
  }

  function setPkStatus(text) {
    const el = document.getElementById('apPkStatus');
    if (el) el.textContent = text || '';
  }

  function showPkOverlay(show) {
    const overlay = document.getElementById('apPkOverlay');
    if (!overlay) return;
    if (show) {
      overlay.removeAttribute('aria-hidden');
      document.body.classList.add('is-pk-mode');
    } else {
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-pk-mode');
      setPkStatus('');
    }
  }

  function beginPkBattle(snapshot) {
    pkBattleActive = true;
    pkEndRequested = false;
    applyPkTeamsFromSnapshot(snapshot);
    pkTimerSec = pkSecsRemaining(snapshot);
    showPkOverlay(true);
    setPkStatus('Get ready…');
    window.SocialFX?.pkCountdown?.(5, () => {
      setPkStatus('PK LIVE — send gifts to score!');
      updatePkBar();
      toast('PK battle started — send gifts to add score', 'success');
    });
  }

  function endPkBattle(snapshot) {
    pkBattleActive = false;
    applyPkTeamsFromSnapshot(snapshot);
    const teams = snapshot?.teams || [];
    const left = Number(teams[0]?.team_score ?? pkScoreLeft);
    const right = Number(teams[1]?.team_score ?? pkScoreRight);
    const won = left >= right;
    setPkStatus('Battle ended');
    window.SocialFX?.pkWinner?.(won ? 'winner' : 'loser', snapshot?.winnerName || roomState?.hostName);
    window.SocialFX?.pkScoreUpdate?.(left, right);
    setTimeout(() => showPkOverlay(false), 4500);
  }
  let heartbeatTimer = null;
  let roomJoinCompleted = false;
  let lastJoinMeta = null;
  let socketLeaveIntentional = false;
  let partyRulesTimer = null;
  let partyRoomInitStarted = false;
  let hostEndedRecoverTimer = null;
  let agoraStartInProgress = false;
  let reconnectRejoinTimer = null;
  let partyVoiceSkipped = false;
  let cameraFacing = 'user';
  let videoFilterId = 'none';
  let guestPublishInProgress = false;
  let guestPublishAttempted = false;
  let hostEndingIntentionally = false;
  let minimizingRoom = false;
  let agoraModeSwitchInProgress = false;
  let renderRoomStateTimer = null;
  let sessionEstablished = false;
  let disconnectUiTimer = null;
  let mediaResumeBound = false;
  let cachedWsToken = null;
  let cachedWsTokenAt = 0;
  let activeProfileUser = { name: '', userId: '' };
  let profileSheetActionsBound = false;

  const VIDEO_FILTERS = {
    none: { label: 'Original', css: '' },
    smooth: { label: 'Smooth', css: 'blur(0.4px) brightness(1.06) contrast(0.94) saturate(1.08)' },
    warm: { label: 'Warm', css: 'sepia(0.18) saturate(1.15) brightness(1.04)' },
    cool: { label: 'Cool', css: 'hue-rotate(12deg) saturate(1.1) brightness(1.03)' },
    vivid: { label: 'Vivid', css: 'saturate(1.5) contrast(1.06) brightness(1.02)' },
    glow: { label: 'Glow', css: 'brightness(1.14) contrast(0.9) saturate(1.25)' },
  };

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (liveSocket?.connected && channelId()) {
        liveSocket.emit('live:heartbeat', { channel: channelId() });
      }
    }, 25000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function persistJoinMeta(meta) {
    if (!meta?.channel) return;
    try {
      sessionStorage.setItem('ap_live_join_meta', JSON.stringify(meta));
      persistDurableLiveSession({ joinMeta: meta });
    } catch (_e) {}
  }

  const LIVE_SESSION_KEY = 'ap_live_active_session';
  const LIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  function persistDurableLiveSession(extra) {
    const ch = channelId();
    if (!ch) return;
    const payload = {
      url: location.pathname + location.search,
      channel: ch,
      host: roomState?.hostName || displayName(currentUser()) || 'Live',
      type: document.body.dataset.livePage || 'live-room',
      ts: Date.now(),
      expiresAt: Date.now() + LIVE_SESSION_TTL_MS,
      ...(extra || {}),
    };
    try {
      localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(payload));
      sessionStorage.setItem('ap_live_pip_session', JSON.stringify(payload));
    } catch (_e) {}
  }

  function readDurableLiveSession() {
    try {
      const raw = localStorage.getItem(LIVE_SESSION_KEY) || sessionStorage.getItem('ap_live_pip_session');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.url || !data?.channel) return null;
      if (data.expiresAt && Date.now() > data.expiresAt) {
        localStorage.removeItem(LIVE_SESSION_KEY);
        return null;
      }
      return data;
    } catch (_e) {}
    return null;
  }

  function clearDurableLiveSession() {
    try {
      localStorage.removeItem(LIVE_SESSION_KEY);
      sessionStorage.removeItem('ap_live_pip_session');
      sessionStorage.removeItem('ap_live_join_meta');
    } catch (_e) {}
  }

  function restoreChannelFromDurableSession() {
    if (qs('channel') || qs('room')) return;
    const data = readDurableLiveSession();
    if (!data?.channel) return;
    const page = document.body.dataset.livePage || '';
    if (data.type && page && data.type !== page) return;
    const params = new URLSearchParams(location.search);
    params.set('channel', data.channel);
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }

  function restoreJoinMeta() {
    try {
      const urlCh = qs('channel') || qs('room');
      const raw = sessionStorage.getItem('ap_live_join_meta');
      if (raw && urlCh) {
        const meta = JSON.parse(raw);
        if (meta?.channel && meta.channel === urlCh) {
          if (qs('host') !== '1' && meta.isHost) meta.isHost = false;
          return meta;
        }
      }
      const durable = readDurableLiveSession();
      if (durable?.channel && urlCh && durable.channel === urlCh) {
        return durable.joinMeta || { channel: durable.channel, isHost: false };
      }
    } catch (_e) {}
    return null;
  }

  function viewerShareUrl() {
    const params = new URLSearchParams(location.search);
    params.delete('host');
    if (!params.get('channel') && !params.get('room')) {
      params.set('channel', channelId());
    }
    return `${location.origin}${location.pathname}?${params.toString()}`;
  }

  async function resumeMediaAfterForeground() {
    if (document.visibilityState !== 'visible') return;
    if (lastJoinMeta?.isHost && publishSucceeded) {
      localTracks.forEach((t) => {
        try {
          const kind = t.getTrackType?.() || '';
          if (kind === 'audio') t.setEnabled?.(!micMuted);
          else if (kind === 'video') t.setEnabled?.(true);
        } catch (_e) {}
      });
      syncLiveUiState();
      hideApLoader();
      return;
    }
    if (lastJoinMeta?.isHost) {
      await resumeHostBroadcastIfNeeded();
      return;
    }
    if (!agoraClient || !liveDebugState.agoraJoined) {
      try {
        const page = document.body.dataset.livePage;
        await startAgora(page === 'party-room' ? 'party' : 'live');
      } catch (_e) {}
      return;
    }
    remoteUsers.forEach((user) => {
      if (user.audioTrack && soundOn) {
        try {
          user.audioTrack.play();
        } catch (_e) {}
      }
    });
    syncLiveUiState();
  }

  async function onMiniPlayerExpanded() {
    minimizingRoom = false;
    await onForegroundResume();
  }

  async function onForegroundResume() {
    if (document.visibilityState !== 'visible') return;
    if (lastJoinMeta?.channel && channelId()) {
      if (liveSocket?.connected) {
        liveSocket.emit('live:heartbeat', { channel: channelId() });
        if (!roomJoinCompleted) rejoinLiveRoom();
      } else if (liveSocket && !socketLeaveIntentional) {
        setLiveStatus('Reconnecting…', null);
        liveSocket.connect();
      } else if (!liveSocket && !socketLeaveIntentional && (roomJoinCompleted || lastJoinMeta)) {
        try {
          const page = document.body.dataset.livePage;
          await connectSocket(page === 'party-room' ? 'party' : 'live');
        } catch (e) {
          liveDebugLog(`Foreground reconnect failed: ${e?.message || e}`);
        }
      }
    }
    await resumeMediaAfterForeground();
  }

  function pauseAgoraForBackground() {
    if (isHost() && publishSucceeded) {
      remoteUsers.forEach((user) => {
        try {
          user.audioTrack?.stop?.();
          user.videoTrack?.stop?.();
        } catch (_e) {}
      });
      return;
    }
    localTracks.forEach((t) => {
      try {
        t.setEnabled?.(false);
      } catch (_e) {}
    });
    remoteUsers.forEach((user) => {
      try {
        user.audioTrack?.stop?.();
        user.videoTrack?.stop?.();
      } catch (_e) {}
    });
  }

  function bindRoomBackgroundSurvival() {
    if (window.__apRoomBgSurvivalBound) return;
    window.__apRoomBgSurvivalBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (window.LiveSession?.shouldKeepPlayback?.()) {
          window.LiveSession?.onAppBackground?.();
        } else {
          pauseAgoraForBackground();
        }
        if (roomJoinCompleted && channelId()) {
          persistDurableLiveSession();
        }
      } else {
        window.LiveSession?.onAppForeground?.();
        onForegroundResume();
      }
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        window.LiveSession?.onAppForeground?.();
        onForegroundResume();
      }
    });
    window.addEventListener('pagehide', () => {
      if (!window.LiveSession?.shouldKeepPlayback?.()) {
        if (!hostEndingIntentionally && !socketLeaveIntentional) {
          pauseAgoraForBackground();
        }
      }
      if (roomJoinCompleted && channelId()) {
        persistDurableLiveSession();
      }
    });
  }

  function bindMediaResumeOnVisibility() {
    if (mediaResumeBound) return;
    mediaResumeBound = true;
    bindRoomBackgroundSurvival();
    const onSessionRefresh = () => {
      resolveSocketAuthToken().then((token) => {
        if (token && liveSocket) {
          liveSocket.auth = { token };
          if (!liveSocket.connected) liveSocket.connect();
          else if (lastJoinMeta && !roomJoinCompleted) rejoinLiveRoom();
        }
      });
    };
    document.addEventListener('ap-session-restored', onSessionRefresh);
    document.addEventListener('ap-session-injected', onSessionRefresh);
  }

  async function resumeHostBroadcastIfNeeded() {
    if (!isHost() || !roomJoinCompleted || publishSucceeded || agoraStartInProgress) return;
    const page = document.body.dataset.livePage;
    const mode = page === 'party-room' ? 'party' : 'live';
    agoraStartInProgress = true;
    try {
      await startAgora(mode);
    } catch (e) {
      console.error('[live] resumeHostBroadcast failed', e);
      syncLiveUiState();
    } finally {
      agoraStartInProgress = false;
    }
  }

  function onSocketRejoinSuccess() {
    renderRoomState();
    applyRoleUiAfterJoin();
    updateLiveDebug({ roomJoined: true, socketConnected: true });
    syncLiveUiState();
    if (lastJoinMeta?.isHost) resumeHostBroadcastIfNeeded();
  }

  function rejoinLiveRoom() {
    if (!lastJoinMeta || !liveSocket?.connected) return;
    const meta = {
      channel: lastJoinMeta.channel || channelId(),
      type: lastJoinMeta.type || (document.body.dataset.livePage === 'party-room' ? 'party' : 'live'),
      displayName: lastJoinMeta.displayName || displayName(currentUser()),
      isHost: Boolean(lastJoinMeta.isHost),
    };
    liveSocket.emit('live:join', meta, (res) => {
      if (res?.ok) {
        roomState = res.state || roomState || { channel: meta.channel, viewers: 1 };
        roomJoinCompleted = true;
        persistJoinMeta({ ...meta, isHost: Boolean(res.state?.hostId && String(res.state.hostId) === String(currentUser()?.id)) });
        onSocketRejoinSuccess();
        liveDebugLog('Rejoined room after reconnect');
        setLiveStatus('', null);
      } else if (meta.isHost) {
        liveDebugLog(`Host rejoin failed: ${res?.message || 'unknown'}`);
        setLiveStatus(`Reconnect failed: ${res?.message || 'unknown'}`, false);
      } else {
        liveDebugLog(`Viewer rejoin failed: ${res?.message || 'unknown'}`);
        setLiveStatus('Reconnecting…', null);
      }
    });
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function isFeedMode() {
    return qs('feed') === '1' && !isHost();
  }

  function channelId() {
    return (
      activeChannelOverride ||
      qs('channel') ||
      qs('room') ||
      (document.body.dataset.livePage === 'party-room' ? 'party-default' : 'live-default')
    )
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
  }

  function clientClaimsHost() {
    return qs('host') === '1';
  }

  function isHost() {
    const me = currentUser();
    if (roomJoinCompleted && me?.id && roomState?.hostId) {
      return String(roomState.hostId) === String(me.id);
    }
    if (roomJoinCompleted) return false;
    return clientClaimsHost();
  }

  function isLiveRoomPage() {
    return document.body.dataset.livePage === 'live-room';
  }

  function isPartyRoomPage() {
    return document.body.dataset.livePage === 'party-room';
  }

  async function ensureSocketIo() {
    if (typeof io !== 'undefined') return;
    const base = socketBase().replace(/\/$/, '');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${base}/socket.io/socket.io.js`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load real-time client (socket.io)'));
      document.head.appendChild(s);
    });
  }

  function syncHostBarUi() {
    const hosting = isHost();
    document.body.classList.toggle('ap-is-host', hosting);
  }

  function applyRoleUiAfterJoin() {
    const hosting = isHost();
    syncHostBarUi();

    if (hosting) {
      const followBtn = document.getElementById('partyBtnFollow');
      if (followBtn) followBtn.textContent = 'Your room';
      const hostFollow = document.getElementById('partyHostFollow');
      if (hostFollow) hostFollow.style.display = 'none';
      const hostLabel = document.getElementById('partyHostLabel');
      if (hostLabel) hostLabel.textContent = 'Hosting';
      const liveSub = document.getElementById('liveSubLabel');
      if (liveSub) liveSub.textContent = 'Hosting';
      const ticker = document.getElementById('partyTicker');
      if (ticker) ticker.textContent = 'You are hosting — tap Share so friends join this room';
    } else {
      document.body.classList.remove('ap-is-host');
      followed = true;
      const joinBtn = document.getElementById('partyBtnJoinSeat');
      if (joinBtn) {
        joinBtn.textContent = 'Request mic';
        joinBtn.style.display = 'none';
      }
    }
    syncBottomBarForRole();
    renderRoomState();
  }

  let broadcastMode = 'video';
  function initBroadcastMode() {
    broadcastMode = (qs('mode') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video';
  }

  function currentUser() {
    if (window.Auth?.getUser?.()) return Auth.getUser();
    if (window.AppState?.user) return AppState.user;
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function displayName(user) {
    if (!user) return 'Guest';
    const n = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return n || user.email?.split('@')[0] || 'User';
  }

  function avatarUrl(name, profilePic) {
    if (profilePic) {
      const resolved = window.SocialShell?.getImageUrl?.(profilePic) || profilePic;
      if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name, resolved);
      return resolved;
    }
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name, profilePic);
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#7c3aed"/></svg>')}`;
  }

  function liveProfilePic(userId, fallbackPic) {
    if (fallbackPic) return fallbackPic;
    const me = currentUser();
    if (userId && me && String(userId) === String(me.id)) return me.profile_pic || null;
    return null;
  }

  async function refreshLiveUserProfile() {
    try {
      if (window.Auth?.refreshSession) await Auth.refreshSession();
    } catch (_e) {}
  }

  function themeCover(kind, label) {
    if (window.SocialUI?.themeCover) return SocialUI.themeCover(kind, label);
    return '';
  }

  function getStreamCoverUrl(hostName) {
    const uid = roomState?.hostId || currentUser()?.id;
    if (uid) {
      try {
        const custom = localStorage.getItem('ap_streamer_cover_' + uid);
        if (custom) return custom;
      } catch (_e) {}
    }
    return themeCover('live', hostName || 'Streamer');
  }

  function applyLiveBackground(mode, hostName) {
    const bg = document.getElementById('liveBg');
    const root = document.getElementById('liveRoomRoot');
    const audioStage = document.getElementById('liveAudioStage');
    const audioAvatar = document.getElementById('liveAudioAvatar');
    const audioLabel = document.getElementById('liveAudioLabel');
    const name = hostName || roomState?.hostName || 'Streamer';
    if (root) root.classList.toggle('is-audio-mode', mode === 'audio');
    if (bg) {
      bg.style.display = 'block';
      if (mode === 'audio') {
        bg.style.background = '';
        bg.style.backgroundImage = `url('${themeCover('audio', name)}')`;
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
      } else {
        const cover = getStreamCoverUrl(name);
        if (cover) {
          bg.style.backgroundImage = `url('${cover}')`;
          bg.style.backgroundSize = 'cover';
          bg.style.backgroundPosition = 'center';
          bg.style.backgroundColor = '#0a0618';
        } else {
          bg.style.backgroundImage = 'none';
          bg.style.background = '#000';
        }
      }
    }
    if (audioAvatar) audioAvatar.src = avatarUrl(name);
    if (audioLabel) audioLabel.textContent = mode === 'audio' ? 'Voice live' : 'Live';
    if (audioStage) audioStage.setAttribute('aria-hidden', mode === 'audio' ? 'false' : 'true');
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop && document.body.classList.contains('live-feed-mode')) {
      backdrop.style.backgroundImage = `url('${themeCover(mode === 'audio' ? 'audio' : 'live', name)}')`;
    }
    updateModeBadge(mode, isHost() && isActuallyLive());
  }

  function updateModeBadge(mode, hosting) {
    const el = document.getElementById('liveModeBadge');
    if (!el) return;
    const showHosting = Boolean(hosting);
    el.classList.toggle('is-audio', mode === 'audio' && !showHosting);
    el.classList.toggle('is-host', showHosting);
    if (showHosting) {
      el.innerHTML =
        mode === 'audio'
          ? '<i class="fas fa-microphone"></i> HOSTING · VOICE'
          : '<i class="fas fa-video"></i> HOSTING · VIDEO';
    } else if (mode === 'audio') {
      el.innerHTML = '<i class="fas fa-microphone"></i> VOICE LIVE';
    } else {
      el.innerHTML = '<i class="fas fa-video"></i> VIDEO LIVE';
    }
    if (isHost() && !showHosting) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  }

  async function getCoins() {
    if (window.SocialWallet) {
      const b = await SocialWallet.fetchBalance();
      return b.coin_balance || 0;
    }
    return 0;
  }

  async function refreshCoinDisplay() {
    const bal = await getCoins();
    const els = [
      document.getElementById('giftCoinsBal'),
      document.getElementById('apTopupBal'),
      document.getElementById('apSurpriseCoins'),
    ].filter(Boolean);
    els.forEach((el) => {
      if (lastCoinBalance !== null && window.SocialFX?.animateBalance) {
        SocialFX.animateBalance(el, lastCoinBalance, bal);
      } else {
        el.textContent = String(bal);
      }
    });
    lastCoinBalance = bal;
    const lvlEl = document.getElementById('giftUserLvl');
    if (lvlEl && window.SocialFX) {
      const me = currentUser();
      const { level } = SocialFX.getUserLevel(me?.id, bal);
      lvlEl.textContent = String(level);
    }
    return bal;
  }

  function toast(msg, type) {
    if (window.SocialUI?.toast) {
      SocialUI.toast(msg, type || 'info');
      return;
    }
    let el = document.getElementById('liveToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'liveToast';
      el.className = 'live-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function socketBase() {
    if (window.__AP_NATIVE_APP__) {
      const direct =
        (typeof window.__AP_SOCKET_URL__ === 'string' && window.__AP_SOCKET_URL__) ||
        (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__.replace(/\/api\/?$/, '')) ||
        (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL);
      if (direct) return String(direct).replace(/\/$/, '');
    }
    if (typeof window.__AP_SOCKET_URL__ === 'string' && window.__AP_SOCKET_URL__) {
      return window.__AP_SOCKET_URL__.replace(/\/$/, '');
    }
    if (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) {
      return window.__AP_API_URL__.replace(/\/api\/?$/, '');
    }
    const h = window.location.hostname || '';
    const port = window.location.port || '';
    const isLanDev =
      (h === 'localhost' || h === '127.0.0.1' || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) &&
      port === '5500';
    if (isLanDev) {
      return window.location.origin.replace(/\/$/, '');
    }
    if (/\.vercel\.app$/i.test(h)) {
      return (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL) || 'http://62.72.56.74:5000';
    }
    if (window.CONFIG?.BACKEND_URL && !/vercel\.app/i.test(window.CONFIG.BACKEND_URL)) {
      return window.CONFIG.BACKEND_URL;
    }
    return (window.AP_CONFIG && window.AP_CONFIG.PRODUCTION_BACKEND_URL) || 'http://62.72.56.74:5000';
  }

  /* ---------- Live debug panel ---------- */
  const remoteUsers = new Map();

  const liveDebugState = {
    channel: '-',
    role: '-',
    apiUrl: '-',
    socketUrl: '-',
    socketConnected: false,
    roomJoined: false,
    agoraJoined: false,
    tokenReceived: false,
    hostPublishing: false,
    publishSucceeded: false,
    remoteUsersCount: 0,
  };
  let lastSocketIssue = '-';

  let publishSucceeded = false;
  const tracedChannel = { url: null, socket: null, token: null, agora: null, db: null };

  function initForensicLog() {
    if (!window.__liveDebug || !Array.isArray(window.__liveDebug.events)) {
      window.__liveDebug = { events: [], lastChannel: null };
    }
  }

  function forensicEvent(name, detail) {
    initForensicLog();
    const entry = { t: Date.now(), iso: new Date().toISOString(), event: name, ...(detail || {}) };
    window.__liveDebug.events.push(entry);
    if (window.__liveDebug.events.length > 300) {
      window.__liveDebug.events.splice(0, window.__liveDebug.events.length - 300);
    }
    try {
      const prev = JSON.parse(localStorage.getItem('ap_live_forensics') || '[]');
      prev.push(entry);
      localStorage.setItem('ap_live_forensics', JSON.stringify(prev.slice(-200)));
    } catch (_e) {}
    console.log('[live-forensic]', name, detail || '');
    liveDebugLog(`${name} ${detail ? JSON.stringify(detail) : ''}`);
  }

  function isActuallyLive() {
    if (isHost()) {
      if (agoraMode === 'party' && partyVoiceSkipped) {
        return Boolean(liveDebugState.socketConnected && liveDebugState.roomJoined);
      }
      return Boolean(
        liveDebugState.socketConnected &&
          liveDebugState.roomJoined &&
          liveDebugState.agoraJoined &&
          publishSucceeded
      );
    }
    return Boolean(
      liveDebugState.socketConnected &&
        liveDebugState.roomJoined &&
        liveDebugState.agoraJoined &&
        remoteUsers.size > 0
    );
  }

  function auditChannel(stage, value) {
    const expected = channelId();
    if (stage === 'url') tracedChannel.url = value;
    else if (stage === 'socket') tracedChannel.socket = value;
    else if (stage === 'token') tracedChannel.token = value;
    else if (stage === 'agora') tracedChannel.agora = value;
    else if (stage === 'db') tracedChannel.db = value;
    initForensicLog();
    window.__liveDebug.lastChannel = { ...tracedChannel };
    if (value && value !== expected) {
      forensicEvent('CHANNEL_MISMATCH', { stage, expected, got: value, traced: { ...tracedChannel } });
    }
  }

  function endHostRoom(reason) {
    if (!isHost() || !liveSocket?.connected) return;
    forensicEvent('ROOM_END_REQUEST', { reason, channel: channelId() });
    liveSocket.emit('live:end', { channel: channelId() }, () => {});
  }

  async function onHostBroadcastFailed(reason, msg) {
    publishSucceeded = false;
    liveDebugState.publishSucceeded = false;
    forensicEvent('PUBLISH_FAILED', { reason, msg, channel: channelId() });
    updateLiveDebug({ hostPublishing: false, publishSucceeded: false });
    for (const t of localTracks) {
      try {
        t.stop?.();
        t.close?.();
      } catch (_e) {}
    }
    localTracks = [];
    if (agoraClient) {
      try {
        await agoraClient.leave();
      } catch (_e) {}
      agoraClient = null;
    }
    liveDebugState.agoraJoined = false;
    updateModeBadge(broadcastMode, false);
    const isParty = document.body.dataset.livePage === 'party-room';
    if (isParty && reason === 'media_blocked' && isLanHttpInNativeWebView()) {
      partyVoiceSkipped = true;
      setLiveStatus('Party live (chat) — voice needs npm start (HTTPS)', false);
      onRoomReady();
      refreshViewerDiagnostics();
      return;
    }
    if (reason === 'media_blocked' && isLanHttpInNativeWebView()) {
      setLiveStatus('Live broadcast needs HTTPS — run npm start (not start:lan)', false);
      onRoomReady();
      refreshViewerDiagnostics();
      return;
    }
    const retryHint = isParty ? ' Tap mic to retry voice.' : ' Tap mic to retry.';
    setLiveStatus((msg || 'Broadcast failed') + retryHint, false);
    hideApLoader();
    refreshViewerDiagnostics();
  }

  function ensureViewerDiagnostics() {
    if (document.getElementById('apLiveViewerDiag')) return;
    const el = document.createElement('div');
    el.id = 'apLiveViewerDiag';
    el.className = 'ap-live-viewer-diag';
    el.innerHTML =
      '<span id="apVDiagRoom">Room joined: —</span>' +
      '<span id="apVDiagAgora">Agora connected: —</span>' +
      '<span id="apVDiagRemote">Remote users: 0</span>' +
      '<span id="apVDiagSocket">Socket: —</span>' +
      '<span id="apVDiagSocketUrl">Socket URL: —</span>' +
      '<span id="apVDiagSocketErr">Socket issue: —</span>';
    document.body.appendChild(el);
  }

  function refreshViewerDiagnostics() {
    ensureViewerDiagnostics();
    const bar = document.getElementById('apLiveViewerDiag');
    if (!bar) return;
    bar.style.display = isHost() && isActuallyLive() ? 'none' : '';
    const set = (id, text) => {
      const n = document.getElementById(id);
      if (n) n.textContent = text;
    };
    set('apVDiagRoom', `Room joined: ${liveDebugState.roomJoined ? 'YES' : 'NO'}`);
    set('apVDiagAgora', `Agora connected: ${liveDebugState.agoraJoined ? 'YES' : 'NO'}`);
    set('apVDiagRemote', `Remote users: ${remoteUsers.size}`);
    set('apVDiagSocket', `Socket: ${liveDebugState.socketConnected ? 'YES' : 'NO'}`);
    set('apVDiagSocketUrl', `Socket URL: ${socketBase()}`);
    set('apVDiagSocketErr', `Socket issue: ${lastSocketIssue || '-'}`);
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out — check connection and camera/mic permission`)), ms);
      }),
    ]);
  }

  function hostStatusLabel() {
    const sessionLive =
      sessionEstablished && publishSucceeded && liveDebugState.roomJoined && liveDebugState.socketConnected;
    if (isActuallyLive() || sessionLive) {
      if (agoraMode === 'party') {
        return partyVoiceSkipped ? 'Party live — voice off' : micMuted ? 'Party live — mic off' : 'Party voice live';
      }
      if (broadcastMode === 'audio') return micMuted ? 'Audio live — mic off' : 'Audio live';
      return micMuted ? 'Video live — mic off' : 'Video live';
    }
    if (agoraStartInProgress) return 'Starting broadcast…';
    if (publishSucceeded && liveDebugState.agoraJoined) return 'Going live…';
    if (liveDebugState.agoraJoined) return 'Starting camera & mic…';
    if (liveDebugState.roomJoined) return 'Connecting to stream server…';
    return 'Joining room…';
  }

  function syncLiveUiState() {
    liveDebugState.publishSucceeded = publishSucceeded;
    refreshViewerDiagnostics();
    if (isHost()) {
      const sessionLive =
        sessionEstablished && publishSucceeded && liveDebugState.roomJoined && liveDebugState.socketConnected;
      updateModeBadge(broadcastMode, isActuallyLive() || sessionLive);
      setLiveStatus(hostStatusLabel(), isActuallyLive() || sessionLive ? true : null);
      return;
    }
    updateModeBadge(broadcastMode, false);
    if (liveDebugState.agoraJoined && remoteUsers.size === 0) {
      setLiveStatus('Waiting for host stream…', null);
    } else if (remoteUsers.size > 0) {
      setLiveStatus('Watching live', true);
    } else if (liveDebugState.roomJoined) {
      setLiveStatus('Connected — waiting for host', null);
    }
  }

  function dbgYesNo(val) {
    return val ? 'yes' : 'no';
  }

  /** Dev-only overlay — off in native app and production unless explicitly enabled */
  function isLiveDebugEnabled() {
    try {
      if (localStorage.getItem('ap_live_debug') === '1') return true;
    } catch (_e) {}
    const q = new URLSearchParams(window.location.search);
    if (q.get('debug') === '1' || q.get('live_debug') === '1') return true;
    if (window.__AP_LIVE_DEBUG__ === true) return true;
    if (window.__AP_NATIVE_APP__ || window.ReactNativeWebView) return false;
    const h = window.location.hostname || '';
    const port = window.location.port || '';
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
      return port === '5500' || port === '5000';
    }
    return false;
  }

  function ensureLiveDebugPanel() {
    if (!isLiveDebugEnabled()) return;
    if (document.getElementById('apLiveDebugPanel')) return;
    const el = document.createElement('div');
    el.id = 'apLiveDebugPanel';
    el.className = 'ap-live-debug-panel';
    el.innerHTML =
      `<div class="ap-live-debug-title">LIVE DEBUG</div>
       <dl class="ap-live-debug-grid">
         <dt>API</dt><dd id="apDbgApi">-</dd>
         <dt>Socket</dt><dd id="apDbgSocketUrl">-</dd>
         <dt>Channel</dt><dd id="apDbgChannel">-</dd>
         <dt>User role</dt><dd id="apDbgRole">-</dd>
         <dt>Socket connected</dt><dd id="apDbgSocket">-</dd>
         <dt>Room joined</dt><dd id="apDbgRoom">-</dd>
         <dt>Agora joined</dt><dd id="apDbgAgora">-</dd>
         <dt>Token received</dt><dd id="apDbgToken">-</dd>
         <dt>Host publishing</dt><dd id="apDbgPublish">-</dd>
         <dt>Remote users</dt><dd id="apDbgRemote">0</dd>
       </dl>
       <pre class="ap-live-debug-log" id="apLiveDebugLog" aria-live="polite"></pre>`;
    document.body.appendChild(el);
    updateLiveDebug({});
  }

  function liveDebugLog(msg) {
    const line = `[live-debug] ${msg}`;
    console.log(line);
    const logEl = document.getElementById('apLiveDebugLog');
    if (logEl) {
      const ts = new Date().toISOString().slice(11, 23);
      logEl.textContent = `[${ts}] ${msg}\n${logEl.textContent}`.slice(0, 4000);
    }
  }

  function updateLiveDebug(partial) {
    Object.assign(liveDebugState, partial);
    if (!isLiveDebugEnabled() && !document.getElementById('apLiveDebugPanel')) return;
    liveDebugState.channel = channelId() || liveDebugState.channel;
    liveDebugState.role = isHost() ? 'host' : 'viewer';
    liveDebugState.apiUrl =
      (window.CONFIG && CONFIG.API_URL) ||
      (window.__AP_API_URL__ && String(window.__AP_API_URL__)) ||
      (window.AP_CONFIG && AP_CONFIG.PRODUCTION_API_URL) ||
      liveDebugState.apiUrl;
    liveDebugState.socketUrl = socketBase();
    liveDebugState.remoteUsersCount = remoteUsers.size;
    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    set('apDbgApi', liveDebugState.apiUrl);
    set('apDbgSocketUrl', liveDebugState.socketUrl);
    set('apDbgChannel', liveDebugState.channel);
    set('apDbgRole', liveDebugState.role);
    set('apDbgSocket', dbgYesNo(liveDebugState.socketConnected));
    set('apDbgRoom', dbgYesNo(liveDebugState.roomJoined));
    set('apDbgAgora', dbgYesNo(liveDebugState.agoraJoined));
    set('apDbgToken', dbgYesNo(liveDebugState.tokenReceived));
    set('apDbgPublish', dbgYesNo(liveDebugState.hostPublishing || publishSucceeded));
    set('apDbgRemote', String(liveDebugState.remoteUsersCount));
    refreshViewerDiagnostics();
  }

  function connectSocket(type) {
    return connectSocketAsync(type);
  }

  async function resolveSocketAuthToken() {
    const now = Date.now();
    if (cachedWsToken && now - cachedWsTokenAt < 4 * 60 * 1000) {
      const usable = !window.Auth?.isAccessTokenUsable || Auth.isAccessTokenUsable(cachedWsToken);
      if (usable) return cachedWsToken;
      cachedWsToken = null;
    }
    if (window.Auth?.ensureAccessToken) {
      const token = await Auth.ensureAccessToken();
      if (token && (!Auth.isAccessTokenUsable || Auth.isAccessTokenUsable(token))) {
        cachedWsToken = token;
        cachedWsTokenAt = now;
        return token;
      }
      if (token) localStorage.removeItem('token');
    }
    let token = localStorage.getItem('token');
    if (token) {
      const usable = !window.Auth?.isAccessTokenUsable || Auth.isAccessTokenUsable(token);
      if (usable) {
        cachedWsToken = token;
        cachedWsTokenAt = now;
        return token;
      }
      localStorage.removeItem('token');
      token = null;
    }
    if (!currentUser()) return null;

    const apiBase =
      (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) ||
      (window.CONFIG && CONFIG.API_URL) ||
      '/api';
    const base = apiBase.replace(/\/$/, '');

    async function tryFetch(path, options, bodyObj) {
      const res = await fetch(`${base}${path}`, {
        credentials: 'include',
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
        body: bodyObj ? JSON.stringify(bodyObj) : options?.body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.data?.accessToken) {
        localStorage.setItem('token', data.data.accessToken);
        if (data.data.refreshToken) {
          localStorage.setItem('ap_refresh_token', data.data.refreshToken);
        }
        return data.data.accessToken;
      }
      return null;
    }

    try {
      const refreshBody = {};
      const rt = localStorage.getItem('ap_refresh_token');
      if (rt) refreshBody.refreshToken = rt;
      const refreshed = await tryFetch('/auth/refresh', { method: 'POST' }, refreshBody);
      if (refreshed) {
        cachedWsToken = refreshed;
        cachedWsTokenAt = Date.now();
        return refreshed;
      }

      const wsToken = await tryFetch('/auth/ws-token', { method: 'GET' });
      if (wsToken) {
        cachedWsToken = wsToken;
        cachedWsTokenAt = Date.now();
        return wsToken;
      }
    } catch (_e) {
      /* fall through */
    }
    return null;
  }

  async function connectSocketAsync(type) {
    ensureLiveDebugPanel();
    try {
      await ensureSocketIo();
    } catch (e) {
      liveDebugLog(`Socket.io load failed: ${e.message}`);
      updateLiveDebug({ socketConnected: false, roomJoined: false });
      throw e;
    }
    if (typeof io === 'undefined') {
      liveDebugLog('Socket skipped — socket.io unavailable');
      updateLiveDebug({ socketConnected: false, roomJoined: false });
      throw new Error('socket.io unavailable');
    }
    if (!currentUser()) {
      liveDebugLog('Socket skipped — not logged in');
      updateLiveDebug({ socketConnected: false, roomJoined: false });
      throw new Error('Not logged in');
    }

    const token = await resolveSocketAuthToken();
    if (!token) {
      liveDebugLog('Socket skipped — missing auth token (sign in again)');
      updateLiveDebug({ socketConnected: false, roomJoined: false });
      throw new Error('Session expired — sign in again to join live');
    }

    if (!liveSocket) {
      liveSocket = io(socketBase(), {
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 25,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

    let socketAuthRetrying = false;
    liveSocket.on('connect', () => {
      liveDebugLog('Socket connected');
      lastSocketIssue = '-';
      updateLiveDebug({ socketConnected: true });
      forensicEvent('SOCKET_CONNECTED', { channel: channelId() });
      if (disconnectUiTimer) {
        clearTimeout(disconnectUiTimer);
        disconnectUiTimer = null;
      }
      if (sessionEstablished && roomJoinCompleted) {
        hideApLoader();
        setLiveStatus('', null);
      }
      if (roomJoinCompleted && lastJoinMeta) {
        if (reconnectRejoinTimer) clearTimeout(reconnectRejoinTimer);
        reconnectRejoinTimer = setTimeout(() => {
          reconnectRejoinTimer = null;
          rejoinLiveRoom();
        }, 400);
      }
    });
    liveSocket.on('disconnect', (reason) => {
      liveDebugLog(`Socket disconnected: ${reason}`);
      lastSocketIssue = `disconnect: ${reason || 'unknown'}`;
      updateLiveDebug({ socketConnected: false, roomJoined: roomJoinCompleted });
      refreshViewerDiagnostics();
      if (!socketLeaveIntentional && lastJoinMeta && reason !== 'io client disconnect') {
        if (disconnectUiTimer) clearTimeout(disconnectUiTimer);
        if (sessionEstablished && roomJoinCompleted) {
          disconnectUiTimer = setTimeout(() => {
            disconnectUiTimer = null;
            if (!liveSocket?.connected && !socketLeaveIntentional) {
              setLiveStatus('Reconnecting…', null);
            }
          }, 2800);
        } else {
          setLiveStatus('Reconnecting…', null);
        }
      }
    });
    liveSocket.on('connect_error', async (err) => {
      const msg = err?.message || String(err);
      liveDebugLog(`Socket connect_error: ${msg}`);
      lastSocketIssue = `connect_error: ${msg}`;
      if (/invalid token/i.test(msg) && !socketAuthRetrying) {
        socketAuthRetrying = true;
        try {
          localStorage.removeItem('token');
          const fresh = await resolveSocketAuthToken();
          if (fresh && liveSocket) {
            liveSocket.auth = { token: fresh };
            liveDebugLog('Retrying socket with refreshed token');
            liveSocket.connect();
            return;
          }
          liveDebugLog('Session expired — sign in again');
          toast('Session expired — please sign in again', 'error');
        } finally {
          socketAuthRetrying = false;
        }
      } else if (!/invalid token/i.test(msg)) {
        toast(`Socket error: ${msg}`, 'error');
      }
      updateLiveDebug({ socketConnected: false, roomJoined: roomJoinCompleted });
      refreshViewerDiagnostics();
    });

    window.SocialFX?.init?.();

    liveSocket.on('live:state', (state) => {
      const prevViewers = roomState?.viewers || lastViewerCount;
      roomState = state;
      if (state?.viewers != null && state.viewers !== prevViewers) {
        window.SocialFX?.onViewerCountChange?.(state.viewers, prevViewers);
      }
      if (renderRoomStateTimer) clearTimeout(renderRoomStateTimer);
      renderRoomStateTimer = setTimeout(() => {
        renderRoomStateTimer = null;
        renderRoomState({ soft: sessionEstablished });
      }, 80);
    });

    liveSocket.on('live:member_mute', (payload) => {
      if (!payload?.userId || !roomState) return;
      const uid = String(payload.userId);
      const muted = payload.muted !== false;
      if (roomState.seats) {
        roomState.seats = roomState.seats.map((s) =>
          String(s.userId) === uid ? { ...s, muted } : s
        );
      }
      const me = currentUser();
      if (me && String(me.id) === uid) micMuted = muted;
      patchSeatMuteUi(uid, muted);
      syncMicButtonUi();
    });

    liveSocket.on('live:chat', (msg) => {
      rememberChatMessage(msg);
      if (msg && /joined/i.test(msg.text || '') && msg.user) {
        window.SocialFX?.showJoinBanner?.({ name: msg.user, avatar: avatarUrl(msg.user) });
      }
      renderChatFeed();
    });

    liveSocket.on('live:gift', (gift) => {
      showWinBanner(gift);
      showGiftFlyBanner(gift);
      const combo = window.SocialFX?.trackCombo?.(gift.emoji || 'gift', gift.qty || 1) || 1;
      window.SocialFX?.playGift?.(gift, { combo });
      onGiftTeamProgress(gift.amount || 100);
      if (roomState) renderRoomState();
    });

    liveSocket.on('pk:start', (snapshot) => {
      beginPkBattle(snapshot);
    });

    liveSocket.on('pk:score', (snapshot) => {
      if (!pkBattleActive && !document.body.classList.contains('is-pk-mode')) return;
      applyPkTeamsFromSnapshot(snapshot);
      pkTimerSec = pkSecsRemaining(snapshot);
      updatePkBar();
    });

    liveSocket.on('pk:end', (snapshot) => {
      endPkBattle(snapshot);
    });

    liveSocket.on('live:viewer_count', ({ viewers }) => {
      const prev = lastViewerCount || roomState?.viewers || 0;
      if (viewers !== prev) window.SocialFX?.onViewerCountChange?.(viewers, prev);
      lastViewerCount = viewers;
      const el = document.getElementById('liveViewerCount');
      if (el) el.textContent = String(viewers);
    });

    liveSocket.on('live:seat_request', (req) => {
      if (isLiveRoomPage()) return;
      if (!isHost() || !req) return;
      const id = String(req.userId || req.id || '');
      if (!id || joinRequests.some((r) => String(r.id) === id)) return;
      joinRequests.push({
        id,
        name: req.name || 'Guest',
        userId: id,
      });
      renderJoinRequests();
      toast(`${req.name || 'Someone'} wants a seat`);
    });

    liveSocket.on('live:seat_response', async (res) => {
      if (isLiveRoomPage()) return;
      if (!res || isHost()) return;
      const me = currentUser();
      if (String(res.userId) !== String(me?.id)) return;
      if (res.accepted) {
        hasSpeakerSeat = true;
        hideMicLinkModal();
        toast('You got a seat — mic is on', 'success');
        await publishGuestAudio();
        renderPartySeats(roomState?.hostName);
      } else {
        showMicLinkModal('rejected');
        toast('Seat request declined');
      }
    });

    liveSocket.on('live:ended', (payload) => {
      const endedCh = String(payload?.channel || '').trim();
      const myCh = channelId();
      if (endedCh && endedCh !== myCh) return;
      if (agoraModeSwitchInProgress) return;
      if (hostEndingIntentionally) {
        liveDebugLog('live:ended after host end — exiting');
        setTimeout(exitRoom, 300);
        return;
      }
      if (isHost() || lastJoinMeta?.isHost) {
        if (hostEndedRecoverTimer) clearTimeout(hostEndedRecoverTimer);
        liveDebugLog('live:ended while hosting — attempting to rejoin');
        setLiveStatus('Reconnecting room…', null);
        hostEndedRecoverTimer = setTimeout(() => {
          hostEndedRecoverTimer = null;
          if (!liveSocket?.connected || !lastJoinMeta || hostEndingIntentionally) return;
          rejoinLiveRoom();
        }, 400);
        return;
      }
      toast('This live has ended');
      setTimeout(exitRoom, 1200);
    });

    liveSocket.on('live:kicked', (payload) => {
      const me = currentUser();
      if (me && String(payload?.userId) === String(me.id)) {
        toast('You were removed from this room', 'error');
        setTimeout(exitRoom, 900);
      }
    });
    }

    if (liveSocket && liveSocket.auth?.token !== token) {
      liveSocket.auth = { token };
    }
    if (liveSocket && !liveSocket.connected) liveSocket.connect();

    const user = currentUser();
    const ch = channelId();
    const hostFlag = clientClaimsHost();
    liveDebugLog(`${hostFlag ? 'HOST' : 'VIEWER'} live:join emit channel=${ch} type=${type}`);
    updateLiveDebug({ channel: ch, role: hostFlag ? 'host' : 'viewer', socketConnected: liveSocket.connected });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Room join timeout — check server connection'));
      }, 20000);

      const emitJoin = () => {
        liveSocket.emit(
          'live:join',
          {
            channel: ch,
            type: type === 'live' ? 'live' : 'party',
            displayName: displayName(user),
            isHost: hostFlag,
          },
          (res) => {
            clearTimeout(timer);
            console.log('[live] live:join ack', { channel: ch, isHost: hostFlag, res });
            liveDebugLog(
              `live:join ack channel=${ch} ok=${Boolean(res?.ok)} msg=${res?.message || 'none'}`
            );
            if (res?.ok) {
              roomState = res.state || { channel: ch, viewers: 1, hostName: displayName(user) };
              roomJoinCompleted = true;
              const me = currentUser();
              const serverIsHost =
                Boolean(me?.id && roomState?.hostId && String(roomState.hostId) === String(me.id));
              lastJoinMeta = {
                channel: ch,
                type: type === 'live' ? 'live' : 'party',
                displayName: displayName(user),
                isHost: serverIsHost,
              };
              persistJoinMeta(lastJoinMeta);
              startHeartbeat();
              updateLiveDebug({ roomJoined: true, socketConnected: true });
              auditChannel('socket', ch);
              auditChannel('db', res.state.channel || ch);
              if (serverIsHost) {
                forensicEvent('ROOM_CREATE_SUCCESS', {
                  channel: ch,
                  roomId: res.state.roomId,
                  hostId: res.state.hostId,
                });
              }
              renderRoomState();
              applyRoleUiAfterJoin();
              setApLoaderStep(2);
              setLiveStatus(serverIsHost ? 'Setting up broadcast…' : 'Connecting to stream…', null);
              if (serverIsHost) {
                syncLiveUiState();
                const isPartyPage = document.body.dataset.livePage === 'party-room';
                toast(
                  isPartyPage
                    ? 'Party live — share the link so others join this room'
                    : 'You are live — share so viewers can find you',
                  'success'
                );
              } else {
                setLiveStatus(`Connected · ${res.state.viewers || 1} in room`, true);
              }
              resolve(liveSocket);
            } else {
              updateLiveDebug({ roomJoined: false });
              const msg = res?.message || 'live:join failed (no message from server)';
              toast(`Room join failed: ${msg}`, 'error');
              setLiveStatus(`Room join failed: ${msg}`, false);
              reject(new Error(msg));
            }
          }
        );
      };

      if (liveSocket.connected) emitJoin();
      else {
        const onConnectError = (err) => {
          clearTimeout(timer);
          liveSocket.off('connect', emitJoin);
          reject(new Error(err?.message || 'Socket connection failed'));
        };
        liveSocket.once('connect_error', onConnectError);
        liveSocket.once('connect', () => {
          liveSocket.off('connect_error', onConnectError);
          emitJoin();
        });
      }
    });
  }

  function leaveRoomOnly() {
    stopHeartbeat();
    if (hostEndedRecoverTimer) {
      clearTimeout(hostEndedRecoverTimer);
      hostEndedRecoverTimer = null;
    }
    roomJoinCompleted = false;
    if (liveSocket?.connected) {
      liveSocket.emit('live:leave');
    }
    publishSucceeded = false;
    updateLiveDebug({ roomJoined: false, publishSucceeded: false });
  }

  function leaveSocket() {
    stopHeartbeat();
    if (hostEndedRecoverTimer) {
      clearTimeout(hostEndedRecoverTimer);
      hostEndedRecoverTimer = null;
    }
    if (partyRulesTimer) {
      clearTimeout(partyRulesTimer);
      partyRulesTimer = null;
    }
    roomJoinCompleted = false;
    lastJoinMeta = null;
    try {
      sessionStorage.removeItem('ap_live_join_meta');
    } catch (_e) {}
    if (liveSocket) {
      socketLeaveIntentional = true;
      if (isHost() && hostEndingIntentionally) {
        liveSocket.emit('live:end', { channel: channelId() });
      }
      liveSocket.emit('live:leave');
      liveSocket.disconnect();
      liveSocket = null;
      socketLeaveIntentional = false;
    }
    publishSucceeded = false;
    hostEndingIntentionally = false;
    updateLiveDebug({ socketConnected: false, roomJoined: false, publishSucceeded: false });
  }

  /* ---------- Agora ---------- */
  let agoraClient = null;
  let localTracks = [];
  let agoraMode = 'live';

  function loadAgoraScript() {
    return new Promise((resolve, reject) => {
      if (window.AgoraRTC) return resolve(window.AgoraRTC);
      const s = document.createElement('script');
      s.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.0.js';
      s.onload = () => resolve(window.AgoraRTC);
      s.onerror = () => reject(new Error('Agora SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  async function fetchAgoraToken(channel, asHost) {
    const user = currentUser();
    const userId = user?.id != null ? String(user.id) : null;
    const inferredHost = Boolean(
      asHost ||
        qs('host') === '1' ||
        (roomState?.hostId && user?.id && String(roomState.hostId) === String(user.id))
    );
    const role = inferredHost
      ? roomState?.hostId && user?.id && String(roomState.hostId) !== String(user.id)
        ? 'publisher'
        : 'host'
      : 'audience';
    const roomType = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';

    liveDebugLog(`Token request channel=${channel} role=${role} inferredHost=${inferredHost} userId=${userId}`);
    forensicEvent('TOKEN_REQUEST_START', { channel, role, inferredHost, userId, roomType });

    const payloads = [
      { channel, role },
      // Compatibility payload for stricter server checks.
      { channel, role, isHost: inferredHost, asHost: inferredHost, roomType, type: roomType, hostId: roomState?.hostId },
    ];

    let data = null;
    let lastErr = null;
    for (let i = 0; i < payloads.length; i++) {
      try {
        data = await API.post('/live/agora/token', payloads[i]);
        if (data?.success) break;
        lastErr = new Error(data?.message || 'Agora token request failed (success=false)');
      } catch (e) {
        lastErr = e;
      }
      liveDebugLog(`Token request retry ${i + 1}/${payloads.length} failed: ${lastErr?.message || lastErr}`);
    }

    if (!data?.success) {
      forensicEvent('TOKEN_REQUEST_FAILED', { channel, role, inferredHost, userId, message: lastErr?.message || data?.message });
      const raw = lastErr?.message || data?.message || 'Agora token request failed';
      if (/publisher token requires host/i.test(raw)) {
        if (!liveDebugState.socketConnected) {
          throw new Error('Real-time socket not connected — room must join before going live. Reload and check Socket: YES in the debug bar.');
        }
        if (!roomJoinCompleted) {
          throw new Error('Room not joined yet — wait for socket connection, then try again.');
        }
        throw new Error('Server does not recognize you as host for this room. Start a new live/party from Streamer Center.');
      }
      throw new Error(raw);
    }
    if (data.mode === 'mock' || !data.token) {
      forensicEvent('TOKEN_REQUEST_FAILED', { channel, role, userId, mode: data.mode });
      throw new Error(
        data.message ||
          'Agora token unavailable — server returned mock mode or empty token (check AGORA_APP_ID and AGORA_APP_CERTIFICATE)'
      );
    }
    const tokenChannel = data.channel || channel;
    auditChannel('token', tokenChannel);
    forensicEvent('TOKEN_SUCCESS', {
      channel: tokenChannel,
      role,
      inferredHost,
      userId,
      uid: data.uid,
      mode: data.mode,
    });
    liveDebugLog(`Token OK mode=${data.mode} uid=${data.uid} channel=${tokenChannel}`);
    updateLiveDebug({ tokenReceived: true });
    return data;
  }

  function setApLoaderStep(step) {
    const steps = document.querySelectorAll('.ap-live-loader-step');
    steps.forEach((el, i) => {
      el.classList.toggle('is-done', i < step);
      el.classList.toggle('is-active', i === step);
    });
  }

  function showApLoader(text, step) {
    const loader = document.getElementById('apLiveLoader');
    const txt = document.getElementById('apLiveLoaderText');
    if (txt && text) txt.textContent = text;
    if (typeof step === 'number') setApLoaderStep(step);
    if (loader) loader.classList.remove('is-hidden');
  }

  function hideApLoader() {
    const loader = document.getElementById('apLiveLoader');
    if (loader) loader.classList.add('is-hidden');
  }

  function isLanDevHost() {
    const h = window.location.hostname || '';
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
    );
  }

  function isLanHttpInNativeWebView() {
    const nativeApp = Boolean(window.ReactNativeWebView || window.__AP_NATIVE_APP__);
    return nativeApp && window.location.protocol === 'http:' && isLanDevHost();
  }

  function requestNativeMediaPermissions() {
    return new Promise((resolve) => {
      if (!window.ReactNativeWebView) {
        resolve({ ok: true, skipped: true });
        return;
      }
      const finish = (detail) => {
        clearTimeout(timer);
        document.removeEventListener('ap-media-permissions', onEvt);
        resolve(detail || { ok: false });
      };
      const onEvt = (e) => finish(e.detail);
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), 10000);
      document.addEventListener('ap-media-permissions', onEvt);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request_media_permissions' }));
    });
  }

  function webMediaBlockedReason() {
    const lanHttp = isLanHttpInNativeWebView();
    if (lanHttp && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
      return 'LAN HTTP blocks camera/mic in Android WebView. For live broadcast use: cd ap-services-app → npm start (HTTPS). On LAN you can still host party chat.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return 'Camera/mic unavailable in this WebView. Allow Camera + Microphone in Android app settings, then reload.';
    }
    return null;
  }

  async function handleHostMediaBlocked(mediaBlock, mode) {
    liveDebugLog(`Host media blocked: ${mediaBlock}`);
    if (mode === 'party' && isLanHttpInNativeWebView()) {
      partyVoiceSkipped = true;
      setLiveStatus('Party live (chat) — voice needs npm start (HTTPS)', false);
      onRoomReady();
      syncLiveUiState();
      refreshViewerDiagnostics();
      return;
    }
    if (isLanHttpInNativeWebView()) {
      setLiveStatus('Live broadcast needs HTTPS — run npm start (not start:lan)', false);
      onRoomReady();
      refreshViewerDiagnostics();
      return;
    }
    await onHostBroadcastFailed('media_blocked', mediaBlock);
  }

  function setLiveStatus(text, ok) {
    const el = document.getElementById('liveStatusBadge');
    const strip = document.getElementById('apRoomStatusStrip');
    const show = Boolean(text);
    if (el) {
      el.style.display = show ? 'inline-flex' : 'none';
      el.textContent = text;
      el.classList.toggle('is-ok', ok === true);
      el.classList.toggle('is-err', ok === false);
      el.classList.toggle('is-warn', show && ok !== true && ok !== false);
    }
    if (strip) strip.classList.toggle('is-visible', show);
    document.body.classList.toggle('ap-live-status-visible', show);
    const loaderTxt = document.getElementById('apLiveLoaderText');
    if (loaderTxt && text) loaderTxt.textContent = text;
    if (ok === true) {
      setApLoaderStep(3);
      hideApLoader();
    } else if (ok === false) {
      hideApLoader();
      if (text) toast(text, 'error');
    } else if (text && !isActuallyLive()) {
      if (sessionEstablished && roomJoinCompleted && (publishSucceeded || partyVoiceSkipped)) {
        return;
      }
      showApLoader(text);
    }
  }

  function onRoomReady() {
    sessionEstablished = true;
    setApLoaderStep(3);
    hideApLoader();
    syncLiveUiState();
    window.LiveSession?.onRoomActive?.();
  }

  async function startAgora(mode) {
    ensureLiveDebugPanel();
    ensureViewerDiagnostics();
    agoraMode = mode || 'live';
    const ch = channelId();
    const host = isHost();
    auditChannel('url', ch);
    publishSucceeded = false;
    liveDebugLog(`${host ? 'HOST' : 'VIEWER'} startAgora mode=${mode} channel=${ch}`);
    updateLiveDebug({
      channel: ch,
      role: host ? 'host' : 'viewer',
      hostPublishing: false,
      publishSucceeded: false,
      agoraJoined: false,
    });
    showApLoader(host ? 'Starting your broadcast…' : 'Connecting to live…', 2);
    setLiveStatus(host ? 'Starting camera & mic…' : 'Connecting to live…', null);
    updateModeBadge(broadcastMode, false);

    const agoraDeadline = setTimeout(() => {
      if (!publishSucceeded && isHost() && !partyVoiceSkipped) {
        const msg = 'Broadcast setup is taking too long. Tap mic to retry, or allow camera/mic in app settings.';
        setLiveStatus(msg, false);
        hideApLoader();
      }
    }, 45000);

    try {
    let cred;
    try {
      cred = await fetchAgoraToken(ch, host);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[live] token failed', e);
      liveDebugLog(`Token FAILED: ${msg}`);
      updateLiveDebug({ tokenReceived: false, agoraJoined: false });
      if (host) {
        await onHostBroadcastFailed('token_failed', msg);
      } else {
        onRoomReady();
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
        setLiveStatus('Waiting for host stream…', null);
        syncLiveUiState();
      }
      return;
    }

    const appId = cred?.appId;
    const token = cred?.token;
    const agoraChannel = cred.channel || ch;
    if (!appId || !token) {
      const msg = cred?.message || 'Server response missing Agora appId or token';
      liveDebugLog(`Token invalid response: ${msg}`);
      updateLiveDebug({ tokenReceived: false });
      if (host) {
        await onHostBroadcastFailed('token_invalid', msg);
      } else {
        setLiveStatus(msg, false);
      }
      return;
    }

    try {
      const AgoraRTC = await loadAgoraScript();
      if (agoraClient) {
        try {
          await agoraClient.leave();
        } catch (leaveErr) {
          liveDebugLog(`Agora leave (pre-join): ${leaveErr?.message || leaveErr}`);
        }
      }

      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      const uid = cred.uid != null ? cred.uid : null;

      agoraClient.on('user-published', async (user, mediaType) => {
        liveDebugLog(`user-published uid=${user.uid} media=${mediaType}`);
        forensicEvent('REMOTE_USER_PUBLISHED', { uid: user.uid, mediaType, channel: agoraChannel });
        await playRemoteMedia(user, mediaType);
      });

      agoraClient.on('user-unpublished', (user) => {
        liveDebugLog(`user-unpublished uid=${user.uid}`);
        remoteUsers.delete(user.uid);
        updateLiveDebug({ remoteUsersCount: remoteUsers.size });
        const container = document.getElementById('liveRemoteHost');
        if (container && remoteUsers.size === 0) {
          container.innerHTML = '';
          setLiveStreamVisible(false);
          if (!isHost()) applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
        }
        syncLiveUiState();
      });

      try {
        await agoraClient.join(appId, agoraChannel, token, uid);
        auditChannel('agora', agoraChannel);
        liveDebugLog(`Agora join OK channel=${agoraChannel} uid=${uid}`);
        updateLiveDebug({ agoraJoined: true });
        forensicEvent('AGORA_JOIN_SUCCESS', { channel: agoraChannel, uid, role: host ? 'host' : 'audience' });
        syncLiveUiState();
        if (!host) {
          for (const remoteUser of agoraClient.remoteUsers) {
            if (remoteUser.hasVideo) await playRemoteMedia(remoteUser, 'video');
            if (remoteUser.hasAudio) await playRemoteMedia(remoteUser, 'audio');
          }
        }
      } catch (joinErr) {
        const msg = joinErr?.message || String(joinErr);
        console.error('[live] Agora join failed', joinErr);
        liveDebugLog(`Agora join FAILED: ${msg}`);
        forensicEvent('AGORA_JOIN_FAILED', { channel: agoraChannel, msg });
        updateLiveDebug({ agoraJoined: false });
        if (host) {
          await onHostBroadcastFailed('agora_join_failed', `Agora join failed: ${msg}`);
        } else {
          setLiveStatus(`Agora join failed: ${msg}`, false);
        }
        return;
      }

      window.SocialFX?.initAgoraVolumeIndicator?.(agoraClient, uid || currentUser()?.id);

      if (host) {
        await requestNativeMediaPermissions();
        const mediaBlock = webMediaBlockedReason();
        if (mediaBlock) {
          await handleHostMediaBlocked(mediaBlock, mode);
          return;
        }
        if (mode === 'party') {
          const audioTrack = await withTimeout(
            AgoraRTC.createMicrophoneAudioTrack(),
            25000,
            'Microphone access'
          );
          localTracks = [audioTrack];
          try {
            await agoraClient.publish(audioTrack);
            publishSucceeded = true;
            partyVoiceSkipped = false;
            liveDebugLog('Publish OK party audio');
            forensicEvent('PUBLISH_SUCCESS', { channel: agoraChannel, mode: 'party' });
            updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
          } catch (pubErr) {
            const msg = pubErr?.message || String(pubErr);
            console.error('[live] publish failed', pubErr);
            await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
            return;
          }
        } else if (broadcastMode === 'audio') {
          const audioTrack = await withTimeout(
            AgoraRTC.createMicrophoneAudioTrack(),
            25000,
            'Microphone access'
          );
          localTracks = [audioTrack];
          try {
            await agoraClient.publish(audioTrack);
            publishSucceeded = true;
            liveDebugLog('Publish OK live audio');
            forensicEvent('PUBLISH_SUCCESS', { channel: agoraChannel, mode: 'audio' });
            updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
          } catch (pubErr) {
            const msg = pubErr?.message || String(pubErr);
            console.error('[live] publish failed', pubErr);
            await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
            return;
          }
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) localBox.style.display = 'none';
          const fallback = document.getElementById('liveLocalVideo');
          if (fallback) fallback.style.display = 'none';
          applyLiveBackground('audio', displayName(currentUser()));
        } else {
          const root = document.getElementById('liveRoomRoot');
          if (root) root.classList.remove('is-audio-mode');
          const [audioTrack, videoTrack] = await withTimeout(
            AgoraRTC.createMicrophoneAndCameraTracks(
              {},
              { facingMode: cameraFacing }
            ),
            30000,
            'Camera and microphone access'
          );
          localTracks = [audioTrack, videoTrack];
          try {
            await agoraClient.publish([audioTrack, videoTrack]);
            publishSucceeded = true;
            liveDebugLog('Publish OK live video+audio');
            forensicEvent('PUBLISH_SUCCESS', { channel: agoraChannel, mode: 'video' });
            updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
          } catch (pubErr) {
            const msg = pubErr?.message || String(pubErr);
            console.error('[live] publish failed', pubErr);
            await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
            return;
          }
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) {
            localBox.innerHTML = '';
            localBox.style.display = '';
            videoTrack.play(localBox);
          }
          applyVideoFilter();
          ensureHostVideoVisible();
          setLiveStreamVisible(true);
        }
        onRoomReady();
        syncLiveUiState();
      } else {
        onRoomReady();
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error('[live] Agora setup failed', err);
      liveDebugLog(`Agora setup FAILED: ${msg}`);
      updateLiveDebug({ agoraJoined: false, hostPublishing: false, publishSucceeded: false });
      if (host) {
        await onHostBroadcastFailed('agora_setup_failed', `Agora error: ${msg}`);
      } else {
        setLiveStatus(`Agora error: ${msg}`, false);
      }
    }
    } finally {
      clearTimeout(agoraDeadline);
    }
  }

  async function restartAgoraForMode() {
    if (agoraModeSwitchInProgress) return;
    agoraModeSwitchInProgress = true;
    try {
      await stopAgora({ skipEndRoom: true });
      const page = document.body.dataset.livePage;
      await startAgora(page === 'party-room' ? 'party' : 'live');
      syncLiveUiState();
    } finally {
      agoraModeSwitchInProgress = false;
    }
  }

  async function startLocalMicOnly() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      window.__apLocalStream = stream;
      micMuted = false;
    } catch (_e) {
      toast('Microphone permission denied', 'warning');
    }
  }

  async function publishGuestAudio() {
    if (!hasSpeakerSeat || isHost() || guestPublishAttempted) return;
    if (localTracks.length) return;
    const user = currentUser();
    if (!user?.id) {
      toast('Sign in again to use the mic', 'error');
      return;
    }
    if (guestPublishInProgress) return;
    guestPublishInProgress = true;
    guestPublishAttempted = true;
    const ch = channelId();
    try {
      const cred = await fetchAgoraToken(ch, true);
      if (!cred?.appId || !cred?.token) {
        toast(cred?.message || 'Could not authorize mic', 'error');
        guestPublishAttempted = false;
        return;
      }

      const AgoraRTC = await loadAgoraScript();

      if (!agoraClient) {
        agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.on('user-published', async (remoteUser, mediaType) => {
          await playRemoteMedia(remoteUser, mediaType);
        });
        agoraClient.on('user-unpublished', (remoteUser) => {
          remoteUsers.delete(remoteUser.uid);
          updateLiveDebug({ remoteUsersCount: remoteUsers.size });
          syncLiveUiState();
        });
      }

      const agoraChannel = cred.channel || ch;
      const uid = cred.uid != null ? cred.uid : null;
      if (liveDebugState.agoraJoined) {
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracks = [audioTrack];
        await agoraClient.publish(audioTrack);
      } else {
        await agoraClient.join(cred.appId, agoraChannel, cred.token, uid);
        updateLiveDebug({ agoraJoined: true });
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracks = [audioTrack];
        await agoraClient.publish(audioTrack);
      }
      publishSucceeded = true;
      micMuted = false;
      liveDebugLog('Publish OK guest audio');
      updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
      syncMicButtonUi();
      renderPartySeats(roomState?.hostName);
      toast('Mic is live — tap mic to mute', 'success');
    } catch (e) {
      const msg = e?.message || String(e);
      liveDebugLog(`Guest publish FAILED: ${msg}`);
      guestPublishAttempted = false;
      toast(`Mic publish failed: ${msg}`, 'error');
    } finally {
      guestPublishInProgress = false;
    }
  }

  function applyVideoFilter() {
    const preset = VIDEO_FILTERS[videoFilterId] || VIDEO_FILTERS.none;
    const css = preset.css || '';
    [
      document.getElementById('liveLocalHost'),
      document.querySelector('#liveLocalHost video'),
      document.getElementById('liveLocalVideo'),
    ]
      .filter(Boolean)
      .forEach((el) => {
        el.style.filter = css;
      });
  }

  function openVideoFilterSheet() {
    if (!isHost() || broadcastMode === 'audio') {
      toast('Filters are for video live only', 'info');
      return;
    }
    let sheet = document.getElementById('apFilterSheet');
    if (!sheet) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-filter-sheet" id="apFilterSheet">
          <div class="ap-filter-panel">
            <div class="ap-filter-head">
              <h3>Video filters</h3>
              <button type="button" id="apFilterClose" aria-label="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="ap-filter-grid" id="apFilterGrid"></div>
          </div>
        </div>`
      );
      sheet = document.getElementById('apFilterSheet');
      document.getElementById('apFilterClose')?.addEventListener('click', () => sheet?.classList.remove('open'));
      sheet?.addEventListener('click', (e) => {
        if (e.target === sheet) sheet.classList.remove('open');
      });
      const grid = document.getElementById('apFilterGrid');
      if (grid) {
        grid.innerHTML = Object.entries(VIDEO_FILTERS)
          .map(
            ([id, f]) =>
              `<button type="button" class="ap-filter-opt" data-filter="${id}">${escapeHtml(f.label)}</button>`
          )
          .join('');
        grid.querySelectorAll('.ap-filter-opt').forEach((btn) => {
          btn.addEventListener('click', () => {
            videoFilterId = btn.dataset.filter || 'none';
            grid.querySelectorAll('.ap-filter-opt').forEach((b) => b.classList.toggle('is-active', b === btn));
            applyVideoFilter();
            toast(`Filter: ${VIDEO_FILTERS[videoFilterId]?.label || 'Original'}`, 'success');
          });
        });
      }
    }
    document
      .querySelectorAll('#apFilterGrid .ap-filter-opt')
      .forEach((btn) => btn.classList.toggle('is-active', btn.dataset.filter === videoFilterId));
    sheet.classList.add('open');
  }

  function getLocalVideoTrack() {
    return localTracks.find((t) => {
      const type = t.getTrackType?.() || t.trackMediaType;
      return type === 'video';
    });
  }

  async function switchCameraFacing() {
    if (!isHost() || broadcastMode === 'audio') {
      toast('Camera flip is for video live only', 'info');
      return;
    }
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    const videoTrack = getLocalVideoTrack();
    try {
      const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());

      if (typeof videoTrack?.switchCamera === 'function') {
        await videoTrack.switchCamera();
        cameraFacing = nextFacing;
        applyVideoFilter();
        toast(nextFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
        return;
      }

      if (videoTrack?.setDevice && AgoraRTC?.getCameras) {
        const cameras = await AgoraRTC.getCameras();
        if (cameras.length >= 2) {
          const currentId = videoTrack.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
          const pick =
            cameras.find((c) => c.deviceId && c.deviceId !== currentId) ||
            cameras[nextFacing === 'user' ? 0 : cameras.length - 1];
          await videoTrack.setDevice(pick.deviceId);
          cameraFacing = nextFacing;
          applyVideoFilter();
          toast(nextFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
          return;
        }
      }

      if (agoraClient && publishSucceeded && videoTrack) {
        const audioTrack = localTracks.find((t) => (t.getTrackType?.() || t.trackMediaType) === 'audio');
        try {
          await agoraClient.unpublish([videoTrack]);
        } catch (_e) {}
        try {
          videoTrack.stop();
          videoTrack.close();
        } catch (_e) {}
        const newVideo = await AgoraRTC.createCameraVideoTrack({ facingMode: nextFacing });
        localTracks = audioTrack ? [audioTrack, newVideo] : [newVideo];
        await agoraClient.publish(newVideo);
        const localBox = document.getElementById('liveLocalHost');
        if (localBox) {
          localBox.innerHTML = '';
          localBox.style.display = '';
          newVideo.play(localBox);
        }
        cameraFacing = nextFacing;
        applyVideoFilter();
        toast(nextFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        toast('Camera not available', 'warning');
        return;
      }
      cameraFacing = nextFacing;
      if (window.__apLocalStream) {
        window.__apLocalStream.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacing } },
        audio: false,
      }).catch(() =>
        navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false })
      );
      window.__apLocalStream = stream;
      const box = document.getElementById('liveLocalHost');
      const vid = box?.querySelector('video') || document.getElementById('liveLocalVideo');
      if (vid) {
        vid.srcObject = stream;
        vid.muted = true;
        await vid.play?.();
      }
      applyVideoFilter();
      toast(nextFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
    } catch (e) {
      toast(e?.message || 'Could not switch camera', 'error');
    }
  }

  async function startLocalPreviewOnly(hostPreview) {
    const video = document.getElementById('liveLocalVideo');
    const box = document.getElementById('liveLocalHost');
    const bg = document.getElementById('liveBg');
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Camera not available on this device', 'warning');
      return;
    }
    const wantVideo = hostPreview !== false && broadcastMode !== 'audio';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: wantVideo ? { facingMode: 'user' } : false,
        audio: true,
      });
      window.__apLocalStream = stream;

      if (isHost() && wantVideo && box) {
        box.innerHTML = '';
        box.style.display = '';
        box.classList.add('live-local-host-mirror');
        const el = document.createElement('video');
        el.srcObject = stream;
        el.autoplay = true;
        el.muted = true;
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        box.appendChild(el);
        await el.play();
        applyVideoFilter();
        if (video) video.style.display = 'none';
        if (bg) bg.style.display = 'none';
        return;
      }

      if (video && wantVideo) {
        video.srcObject = stream;
        video.style.display = 'block';
        video.muted = true;
        await video.play?.();
        if (bg) bg.style.display = 'none';
      }
    } catch (_e) {
      toast('Allow camera access to go live with video', 'warning');
      if (bg && !isHost()) {
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
      }
    }
  }

  async function toggleMic() {
    micMuted = !micMuted;
    const audio = localTracks.find((t) => t.getTrackType?.() === 'audio' || t.setEnabled);
    if (audio?.setEnabled) await audio.setEnabled(!micMuted);
    if (liveSocket) liveSocket.emit('live:mute', { channel: channelId(), muted: micMuted });
    const me = currentUser();
    window.SocialFX?.setSpeaking?.(me?.id || displayName(me), !micMuted);
    if (me?.id) patchSeatMuteUi(String(me.id), micMuted);
    const btn = document.getElementById('liveBtnMic');
    const hostMuteBtn = document.getElementById('liveBtnHostMute');
    const micIcon = micMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    if (btn) {
      btn.innerHTML = `<i class="${micIcon}"></i>`;
      btn.classList.toggle('is-muted', micMuted);
    }
    if (hostMuteBtn) {
      hostMuteBtn.innerHTML = `<i class="${micIcon}"></i> ${micMuted ? 'Muted' : 'Mic'}`;
      hostMuteBtn.classList.toggle('is-muted', micMuted);
    }
    syncMicButtonUi();
    toast(micMuted ? 'Microphone off' : 'Microphone on');
  }

  async function stopAgora(opts = {}) {
    if (isHost() && publishSucceeded && !opts.skipEndRoom && !hostEndingIntentionally) {
      endHostRoom('agora_stopped');
    }
    publishSucceeded = false;
    setLiveStreamVisible(false);
    for (const t of localTracks) {
      try {
        t.stop?.();
        t.close?.();
      } catch (_e) {}
    }
    localTracks = [];
    remoteUsers.clear();
    if (agoraClient) {
      try {
        await agoraClient.leave();
        liveDebugLog('Agora leave OK');
      } catch (e) {
        liveDebugLog(`Agora leave error: ${e?.message || e}`);
      }
      agoraClient = null;
    }
    if (window.__apLocalStream) {
      window.__apLocalStream.getTracks().forEach((t) => t.stop());
      window.__apLocalStream = null;
    }
    updateLiveDebug({ agoraJoined: false, hostPublishing: false, publishSucceeded: false, remoteUsersCount: 0 });
    syncLiveUiState();
  }

  /* ---------- UI: chat / seats / gifts ---------- */
  function shouldShowMsg(msg, tab) {
    if (tab === 'all') return true;
    if (tab === 'room') return msg.type === 'system';
    if (tab === 'chat') return msg.type !== 'system';
    return true;
  }

  function applyChatFilters(msg) {
    if (!shouldShowMsg(msg, chatTab)) return false;
    if (chatTab === 'all') return true;
    if (chatRegionFilter === 'room') {
      return msg.type === 'system' || msg.scope === 'room' || (!msg.scope && !msg.broadcast);
    }
    if (chatRegionFilter === 'region') {
      return msg.type === 'system' || msg.scope === 'region';
    }
    if (chatRegionFilter === 'broadcast') {
      return msg.type === 'system' || msg.broadcast || msg.scope === 'broadcast';
    }
    return true;
  }

  function renderQuickChips() {
    const chips = document.getElementById('apQuickChips');
    if (!chips) return;
    const visible = quickChipsExpanded ? QUICK_CHIP_DEFS : QUICK_CHIP_DEFS.slice(0, 3);
    let html = visible
      .map((c) => {
        if (c.action === 'follow') {
          const lbl = followed ? 'Following ✓' : c.label;
          const cls = followed ? ' ap-chip is-follow-done' : ' ap-chip';
          return `<button type="button" class="${cls.trim()}" data-chip-action="follow">${escapeHtml(lbl)}</button>`;
        }
        return `<button type="button" class="ap-chip" data-chip-send="${escapeHtml(c.send)}">${escapeHtml(c.label)}</button>`;
      })
      .join('');
    if (!quickChipsExpanded) {
      html += `<button type="button" class="ap-chip ap-chip-more" data-chip-more="1">More</button>`;
    }
    chips.innerHTML = html;
    chips.querySelectorAll('[data-chip-send]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sendChat(btn.dataset.chipSend);
        window.SocialFX?.haptic?.(6);
      });
    });
    chips.querySelector('[data-chip-action="follow"]')?.addEventListener('click', () => {
      if (!followed) document.getElementById('partyHostFollow')?.click() || document.getElementById('liveBtnFollow')?.click();
      else toast('Already following', 'info');
    });
    chips.querySelector('[data-chip-more]')?.addEventListener('click', () => {
      quickChipsExpanded = true;
      renderQuickChips();
    });
  }

  function syncToolBadges() {
    let unread = 0;
    try {
      unread = parseInt(localStorage.getItem('chat_unread') || '0', 10) || 0;
    } catch (_e) {}
    document.querySelectorAll('.ap-tool-msg .ap-notify-dot, #apToolsNotifyDot').forEach((dot) => {
      if (unread > 0) {
        dot.hidden = false;
        dot.style.display = '';
      } else {
        dot.hidden = true;
        dot.style.display = 'none';
      }
    });
  }

  function updateGiftMeta() {
    const items = GIFT_CATALOG[giftCategory] || GIFT_CATALOG.gift;
    const g = items[selectedGiftIdx] || items[0];
    const banner = document.getElementById('giftRtpBanner');
    if (banner && g) {
      banner.innerHTML = `<span>【${escapeHtml(g.name)}】Creators receive <strong>90%</strong> · Platform 10% · ${Number(g.cost).toLocaleString()} coins each</span>`;
    }
    const me = currentUser();
    const bal = lastCoinBalance != null ? lastCoinBalance : 0;
    const lvlInfo = window.SocialFX ? SocialFX.getUserLevel(me?.id, bal + sessionGiftCoins) : { level: 1 };
    const lvl = lvlInfo.level || 1;
    const xpNeed = lvl * 3000;
    userXpProgress = Math.min(100, Math.round(((bal + sessionGiftCoins) % xpNeed) / xpNeed * 100));
    const lvlEl = document.getElementById('giftUserLvl');
    if (lvlEl) lvlEl.textContent = String(lvl);
    const xpText = document.getElementById('giftXpText');
    if (xpText) {
      xpText.textContent = `+4XP · XP requires: ${xpNeed.toLocaleString()} · Lv.${lvl + 1}`;
    }
    const xpBar = document.getElementById('giftXpBar');
    if (xpBar) xpBar.style.width = userXpProgress + '%';
    const sendBtn = document.getElementById('giftSendBtn');
    const total = (parseInt(g?.cost, 10) || 0) * giftQty;
    if (sendBtn) {
      sendBtn.disabled = bal < total;
      sendBtn.classList.toggle('is-disabled', bal < total);
    }
  }

  function updateDynamicStats() {
    const viewers = roomState?.viewers || 0;
    const gifts = roomState?.gifts || [];
    const giftTotal = gifts.reduce((s, g) => s + (Number(g.amount) || 0), 0);
    sessionGiftCoins = Math.max(sessionGiftCoins, giftTotal);

    const hourEl = document.getElementById('partyHourNo');
    if (hourEl) {
      const rank = Math.max(1, 60 - Math.min(59, Math.floor(giftTotal / 5000) + Math.floor(viewers / 5)));
      hourEl.textContent = 'No.' + rank;
    }
    const popEl = document.getElementById('partyPopScore');
    if (popEl) popEl.textContent = viewers >= 100 ? '100+' : String(Math.max(viewers, 1));
    const musicEl = document.getElementById('partyMusicScore');
    if (musicEl) musicEl.textContent = String(Math.min(99, Math.floor(giftTotal / 1000) + Math.floor(viewers / 3)));
    const pctEl = document.getElementById('partyPopPct');
    if (pctEl) {
      const pct = Math.min(99.99, (teamProgress / 16) * 100 + (viewers % 10) * 0.1);
      pctEl.textContent = pct.toFixed(2) + '%';
    }
    const chestEl = document.getElementById('partyChestTimer');
    if (chestEl && chestSec > 0) {
      const m = Math.floor(chestSec / 60);
      const s = chestSec % 60;
      chestEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }

  function setupKeyboardOffset() {
    if (window.__apKbBound) return;
    window.__apKbBound = true;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--ap-kb-offset', kb > 50 ? kb + 'px' : '0px');
      document.body.classList.toggle('ap-keyboard-open', kb > 50);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
  }

  function bindEmojiPicker() {
    const btn = document.getElementById('apChatEmojiBtn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    let pop = document.getElementById('apEmojiPopover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'apEmojiPopover';
      pop.className = 'ap-emoji-popover';
      pop.innerHTML = EMOJI_PICKS.map((e) => `<button type="button" data-emo="${e}">${e}</button>`).join('');
      document.body.appendChild(pop);
      pop.querySelectorAll('[data-emo]').forEach((b) => {
        b.addEventListener('click', () => {
          const input = document.getElementById('liveChatInput');
          if (input) {
            input.value += b.dataset.emo;
            input.focus();
          }
          pop.classList.remove('is-open');
        });
      });
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const open = !pop.classList.contains('is-open');
      pop.classList.toggle('is-open', open);
      if (open) {
        const bar = document.getElementById('partyBottomBar');
        const barH = bar ? bar.getBoundingClientRect().height : 58;
        const kb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ap-kb-offset'), 10) || 0;
        pop.style.left = '8px';
        pop.style.right = '8px';
        pop.style.width = 'auto';
        pop.style.bottom = Math.round(barH + kb + 8) + 'px';
        pop.style.zIndex = '80';
      }
    });
    document.addEventListener(
      'click',
      (e) => {
        if (!pop.classList.contains('is-open')) return;
        if (pop.contains(e.target) || e.target === btn || btn.contains(e.target)) return;
        pop.classList.remove('is-open');
      },
      true
    );
  }

  function handleMicButton() {
    if (isLiveRoomPage() && !isHost()) return;
    if (isHost()) {
      if (!publishSucceeded) {
        if (isLanHttpInNativeWebView()) {
          toast('Voice/video needs HTTPS — run npm start in ap-services-app', 'warning');
          return;
        }
        partyVoiceSkipped = false;
        resumeHostBroadcastIfNeeded();
        return;
      }
      toggleMic();
      return;
    }
    if (hasSpeakerSeat) {
      toggleMic();
      return;
    }
    closeLiveOverlays('mic');
    requestSeatJoin();
  }

  function chatMsgKey(msg) {
    if (msg?.id && !String(msg.id).startsWith('local-')) return String(msg.id);
    const atMs = msg?.at ? new Date(msg.at).getTime() : Number(msg?.at) || 0;
    const bucket = atMs ? Math.floor(atMs / 3000) : 0;
    return `${msg?.type || 'chat'}|${msg?.userId || msg?.user || ''}|${msg?.text || ''}|${bucket}`;
  }

  function rememberChatMessage(msg) {
    if (!msg) return;
    const text = String(msg.text || '');
    if (msg.type === 'system' && /watching|viewer count|people are watching/i.test(text)) return;
    const me = currentUser();
    const isMine =
      (me?.id && msg.userId && String(msg.userId) === String(me.id)) ||
      (msg.user && me && displayName(me) === msg.user);
    if (isMine && msg.id && !String(msg.id).startsWith('local-')) {
      const pendingIdx = chatMessages.findIndex(
        (m) =>
          String(m.id || '').startsWith('local-') &&
          m.text === msg.text &&
          (m.user === msg.user || String(m.userId) === String(msg.userId))
      );
      if (pendingIdx >= 0) chatMessages.splice(pendingIdx, 1);
    }
    const key = chatMsgKey(msg);
    if (chatMessages.some((m) => chatMsgKey(m) === key)) return;
    chatMessages.push({ ...msg });
    if (chatMessages.length > 80) chatMessages = chatMessages.slice(-80);
  }

  function renderChatFeed() {
    const feed = document.getElementById('partyChatFeed');
    if (!feed) return;
    feed.innerHTML = '';
    chatMessages
      .filter((m) => applyChatFilters(m))
      .forEach((msg) => {
        const div = document.createElement('div');
        if (msg.type === 'system') {
          const isJoin = /joined/i.test(msg.text || '') || (msg.user && !msg.text);
          div.className = 'party-chat-msg system' + (isJoin ? ' join-msg' : '');
          div.textContent = msg.text || (msg.user ? msg.user + ': joined' : '');
        } else {
          div.className = 'party-chat-msg';
          const lvlInfo = window.SocialFX
            ? SocialFX.getUserLevel(msg.userId || msg.user, msg.giftSpend)
            : { level: msg.lvl || 2, isVip: false, isFan: false };
          const badge = window.SocialFX
            ? SocialFX.levelBadgeHtml(lvlInfo.level, { isVip: lvlInfo.isVip, isFan: lvlInfo.isFan })
            : `<span class="lvl">${msg.lvl || 1}</span>`;
          div.innerHTML = `${badge}<span class="user">${escapeHtml(msg.user)}</span> ${escapeHtml(msg.text)}`;
        }
        feed.appendChild(div);
      });
    feed.scrollTop = feed.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderChatFromState() {
    (roomState?.messages || []).forEach((m) => rememberChatMessage(m));
    renderChatFeed();
  }

  function renderSeatButton(s, seatNum, tierCls) {
    if (!s || s.empty) {
      return `<button type="button" class="party-seat is-empty ${tierCls}" data-join-seat data-seat-num="${seatNum}">
        <div class="seat-avatar seat-avatar--empty"><span class="seat-num">${seatNum}</span><span class="seat-plus">+</span></div>
        <span class="seat-name">Join</span></button>`;
    }
    const hostCls = s.host ? ' is-host' : '';
    const speaking = s.speaking ? ' is-speaking' : '';
    const mutedCls = s.muted ? ' is-muted' : '';
    const mic = s.muted
      ? '<span class="mic-off"><i class="fas fa-microphone-slash"></i></span>'
      : s.host && isHost()
        ? '<span class="mic-live"><i class="fas fa-microphone"></i></span>'
        : '';
    const crown = s.host ? '<span class="seat-crown">👑</span>' : '';
    const waveBars = s.speaking
      ? '<div class="seat-wave-bars"><span></span><span></span><span></span><span></span></div>'
      : '';
    return `
      <button type="button" class="party-seat${hostCls}${speaking}${mutedCls} ${tierCls}" data-seat="${seatNum}" data-user="${escapeHtml(s.name)}" data-user-id="${escapeHtml(String(s.userId || ''))}">
        <div class="seat-avatar">
          <span class="seat-num">${seatNum}</span>
          ${crown}
          <img src="${avatarUrl(s.name, s.profilePic || liveProfilePic(s.userId, null))}" alt="">
          ${mic}
          ${waveBars}
        </div>
        <span class="seat-name">${escapeHtml(s.name)}</span>
        <span class="seat-gifts">🎁 ${formatGiftCount(s.gifts || 0)}</span>
      </button>`;
  }

  function patchSeatMuteUi(userId, muted) {
    const container = document.getElementById('partySeats');
    if (!container || !userId) return;
    container.querySelectorAll('.party-seat[data-user-id]').forEach((btn) => {
      if (String(btn.dataset.userId) !== String(userId)) return;
      btn.classList.toggle('is-muted', Boolean(muted));
      btn.classList.toggle('is-speaking', !muted);
      const micSpan = btn.querySelector('.mic-off, .mic-live');
      if (micSpan) {
        micSpan.className = muted ? 'mic-off' : 'mic-live';
        micSpan.innerHTML = muted
          ? '<i class="fas fa-microphone-slash"></i>'
          : '<i class="fas fa-microphone"></i>';
      }
    });
  }

  function countPartyGuests() {
    const seen = new Set();
    return (roomState?.seats || []).filter((s) => {
      if (!s || s.isHost) return false;
      const key = String(s.userId || s.name || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  function isPartySeatsFull() {
    return countPartyGuests() >= PARTY_MAX_GUESTS;
  }

  function renderPartySeats(hostName) {
    const container = document.getElementById('partySeats');
    if (!container) return;

    const me = displayName(currentUser());
    const meId = currentUser()?.id ? String(currentUser().id) : '';
    const hosting = isHost();
    const host = {
      name: hosting ? me : hostName || 'Host',
      userId: hosting ? meId : roomState?.hostId || '',
      host: true,
      gifts: 0,
      muted: micMuted,
      speaking: hosting && !micMuted,
    };

    const seenGuests = new Set();
    const guests = (roomState?.seats || []).filter((s) => {
      if (!s || !s.name || s.isHost) return false;
      const key = String(s.userId || s.name);
      if (seenGuests.has(key)) return false;
      seenGuests.add(key);
      return true;
    });

    const slots = new Array(PARTY_MAX_SEATS).fill(null);
    slots[PARTY_HOST_SLOT] = host;
    let guestIdx = 0;
    for (let i = 0; i < PARTY_MAX_SEATS; i += 1) {
      if (i === PARTY_HOST_SLOT) continue;
      if (guestIdx < guests.length) {
        slots[i] = { ...guests[guestIdx], host: false };
        guestIdx += 1;
      } else {
        slots[i] = { empty: true, seatNum: i + 1 };
      }
    }

    const tiers = [
      { cls: 'seat-tier-lg', indices: [0, 1, 2] },
      { cls: 'seat-tier-md', indices: [3, 4, 5] },
      { cls: 'seat-tier-md', indices: [6, 7, 8] },
      { cls: 'seat-tier-sm', indices: [9, 10, 11] },
      { cls: 'seat-tier-sm', indices: [12, 13, 14] },
    ];

    const rowClass = [
      'party-seat-row--lg',
      'party-seat-row--md',
      'party-seat-row--md',
      'party-seat-row--sm',
      'party-seat-row--sm',
    ];

    container.innerHTML = tiers
      .map(
        (tier, rowI) => `
      <div class="party-seat-row ${rowClass[rowI]}">
        ${tier.indices.map((idx) => renderSeatButton(slots[idx], idx + 1, tier.cls)).join('')}
      </div>`
      )
      .join('');

    container.querySelectorAll('.party-seat[data-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.user || btn.querySelector('.seat-name')?.textContent;
        openProfileSheet(name, btn.dataset.userId || '');
      });
    });
    container.querySelectorAll('[data-join-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isHost()) openSeatSheet(btn.dataset.seatNum);
        else requestSeatJoin();
      });
    });
  }

  function formatGiftCount(n) {
    const v = Number(n) || 0;
    if (v >= 1000) return (v / 1000).toFixed(2).replace(/\.?0+$/, '') + 'K';
    return String(v);
  }

  function onGiftTeamProgress(amount) {
    const inc = Math.max(1, Math.floor((Number(amount) || 100) / 2000));
    teamProgress = Math.min(11, teamProgress + inc);
    const teamEl = document.getElementById('partyTeamProgress');
    const bar = document.getElementById('partyTeamBar');
    if (teamEl) teamEl.textContent = teamProgress + '/11';
    if (bar) bar.style.width = Math.min(100, (teamProgress / 11) * 100) + '%';
  }

  function syncFollowUI() {
    const hostName = roomState?.hostName || 'Host';
    const hostId = roomState?.hostId || hostName;
    if (isHost()) {
      if (window.SocialInteractions?.isFollowing) {
        followed = SocialInteractions.isFollowing(hostId, hostName);
      }
    } else {
      // Viewers can chat in party/live without tapping Follow first
      followed = true;
    }
    const label = followed ? 'Following ✓' : 'Follow +';
    const btn = document.getElementById('partyBtnFollow') || document.getElementById('liveBtnFollow');
    const hbtn = document.getElementById('partyHostFollow');
    if (btn) {
      btn.textContent = isHost() ? 'Your room' : label;
      btn.classList.toggle('is-following', followed && !isHost());
    }
    if (hbtn) {
      hbtn.textContent = followed ? '✓' : '+';
      hbtn.style.display = isHost() ? 'none' : '';
    }
    renderQuickChips();
    syncBottomBarForRole();
  }

  function renderRoomState() {
    const user = currentUser();
    const meId = user?.id ? String(user.id) : '';
    if (meId && roomState?.seats?.some((s) => String(s.userId) === meId && !s.isHost)) {
      const wasSpeaker = hasSpeakerSeat;
      hasSpeakerSeat = true;
      if (!wasSpeaker && !isHost() && !localTracks.length && !guestPublishInProgress && !guestPublishAttempted) {
        publishGuestAudio();
      }
    }
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    if (joinBtn) {
      joinBtn.textContent = 'Request mic';
      const showRequest = isPartyRoomPage() && !isHost() && !hasSpeakerSeat;
      joinBtn.style.display = showRequest ? '' : 'none';
    }
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostEl) {
      const full = hostName || 'Host';
      hostEl.textContent = full;
      hostEl.title = full;
    }
    if (hostImg) {
      const hostId = roomState?.hostId ? String(roomState.hostId) : '';
      const pic = roomState?.hostProfilePic || liveProfilePic(hostId, isHost() ? currentUser()?.profile_pic : null);
      hostImg.src = avatarUrl(hostName, pic);
      hostImg.dataset.name = hostName;
      if (pic) hostImg.dataset.avatarSrc = String(pic);
    }

    const vc = document.getElementById('liveViewerCount');
    if (vc && roomState) vc.textContent = String(roomState.viewers || (isHost() ? 1 : 0));
    renderTopGifters();
    const hearts = document.getElementById('partyHearts');
    if (hearts) hearts.textContent = String(roomState?.gifts?.length || 0);

    if (document.getElementById('partySeats')) renderPartySeats(hostName);
    renderChatFromState();
    renderGuestRail();
    syncFollowUI();

    const audioAvatar = document.getElementById('liveAudioAvatar');
    if (audioAvatar) audioAvatar.src = avatarUrl(hostName);

    const ticker = document.getElementById('liveTicker');
    if (ticker) {
      const viewers = roomState?.viewers || 0;
      ticker.textContent = `${hostName} is live · ${viewers} watching — chat & send gifts below`;
    }
    const sub = document.getElementById('liveSubLabel');
    if (sub) sub.textContent = isHost() ? 'You are hosting' : 'Live now';
    const rid = document.getElementById('liveRoomId');
    const ch = channelId();
    const viewers = roomState?.viewers || 0;
    if (rid) rid.textContent = 'ID ' + ch.slice(-10);
    const partyRid = document.getElementById('partyRoomId') || document.getElementById('partyRoomIdLive');
    if (partyRid) partyRid.textContent = 'ID:' + ch.slice(-10);
    updateModeBadge(broadcastMode, isHost() && isActuallyLive());
    updateDynamicStats();
    syncToolBadges();
    renderQuickChips();
    syncMicButtonUi();
    bindRoomAvatars();
  }

  function syncMicButtonUi() {
    const micBtn = document.getElementById('liveBtnMic');
    const hostMuteBtn = document.getElementById('liveBtnHostMute');
    [micBtn, hostMuteBtn].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('is-muted', micMuted);
      btn.classList.toggle('is-live', isHost() && !micMuted);
      btn.classList.toggle('is-pending', micLinkPending);
      const icon = btn.querySelector('i');
      if (icon) icon.className = micMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    });
  }

  function showGiftFlyBanner(gift) {
    const el = document.getElementById('apGiftFly');
    if (!el || !gift) return;
    el.innerHTML = `<img src="${avatarUrl(gift.from)}" alt=""><span><strong>${escapeHtml(gift.from)}</strong> sent ${gift.emoji || '🎁'}</span>`;
    el.classList.add('is-visible');
    clearTimeout(el._hide);
    el._hide = setTimeout(() => el.classList.remove('is-visible'), 4500);
  }

  function updatePkBar() {
    if (window.SocialFX?.pkScoreUpdate) {
      SocialFX.pkScoreUpdate(pkScoreLeft, pkScoreRight);
      return;
    }
    const total = pkScoreLeft + pkScoreRight || 1;
    const leftPct = Math.round((pkScoreLeft / total) * 100);
    const bar = document.getElementById('apPkBarLeft');
    const scoreL = document.getElementById('apPkScoreLeft');
    const scoreR = document.getElementById('apPkScoreRight');
    if (bar) bar.style.width = leftPct + '%';
    if (scoreL) scoreL.textContent = String(pkScoreLeft);
    if (scoreR) scoreR.textContent = String(pkScoreRight);
  }

  function tickPkTimer() {
    const el = document.getElementById('apPkTimer');
    if (!el || !document.body.classList.contains('is-pk-mode')) return;
    if (pkTimerSec <= 0) {
      el.textContent = 'PK 00:00';
      setPkStatus('Time is up — ending battle…');
      if (!pkEndRequested && isHost() && liveSocket?.connected) {
        pkEndRequested = true;
        liveSocket.emit('pk:end', { channel: channelId() });
      }
      return;
    }
    pkTimerSec = Math.max(0, pkTimerSec - 1);
    const m = Math.floor(pkTimerSec / 60);
    const s = pkTimerSec % 60;
    el.textContent = 'PK ' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    updatePkBar();
  }

  function renderTopGifters() {
    const row = document.getElementById('partyViewerAvatars');
    if (!row) return;
    const viewers = roomState?.viewers || 1;
    const seats = (roomState?.seats || []).filter((s) => s && s.name && !s.isHost);
    const gifts = roomState?.gifts || [];
    const names = seats.length
      ? seats.map((s) => ({ name: s.name, gifts: s.gifts || 0 }))
      : gifts.slice(0, 2).map((g, i) => ({ name: g.from || 'Fan' + (i + 1), gifts: g.amount || 0 }));
    let html = '';
    if (names.length) {
      html = names
        .slice(0, 3)
        .map(
          (n, i) =>
            `<span class="ap-top-gifter${i === 0 ? ' has-crown' : ''}"><img src="${avatarUrl(n.name)}" alt="${escapeHtml(n.name)}" data-name="${escapeHtml(n.name)}">${
              n.gifts > 0 ? `<em>${formatGiftCount(n.gifts)}</em>` : ''
            }</span>`
        )
        .join('');
    }
    html += `<span class="party-viewer-count" id="liveViewerCount">${viewers}</span>`;
    row.innerHTML = html;
    window.SocialUI?.bindAvatarFallbacks?.(row);
  }

  function renderGuestRail() {
    if (isPartyRoomPage()) return;
    const rail = document.getElementById('apGuestRail');
    if (!rail) return;
    const seats = (roomState?.seats || []).filter((s) => s && !s.isHost);
    if (!seats.length) {
      rail.innerHTML = '';
      rail.style.display = 'none';
      return;
    }
    rail.style.display = 'flex';
    rail.innerHTML = seats
      .slice(0, 5)
      .map(
        (s) => `
      <button type="button" class="ap-guest-seat" data-guest="${escapeHtml(s.name)}" data-guest-id="${escapeHtml(String(s.userId || ''))}">
        <span class="ap-guest-gift">${formatGiftCount(s.gifts || 0)}</span>
        <img src="${avatarUrl(s.name)}" alt="">
        <span class="ap-guest-name">${escapeHtml(String(s.name).slice(0, 8))}</span>
      </button>`
      )
      .join('');
    rail.querySelectorAll('.ap-guest-seat').forEach((btn) => {
      btn.addEventListener('click', () => openProfileSheet(btn.dataset.guest, btn.dataset.guestId || ''));
    });
  }

  function showMicLinkModal(mode) {
    const modal = document.getElementById('apMicLinkModal');
    if (!modal) return;
    closeLiveOverlays('mic');
    const waiting = document.getElementById('apMicLinkWaiting');
    const rejected = document.getElementById('apMicLinkRejected');
    if (waiting) waiting.style.display = mode === 'waiting' ? '' : 'none';
    if (rejected) rejected.style.display = mode === 'rejected' ? '' : 'none';
    modal.classList.add('open');
    syncLiveOverlayClass();
    syncMicButtonUi();
  }

  function hideMicLinkModal() {
    document.getElementById('apMicLinkModal')?.classList.remove('open');
    micLinkPending = false;
    syncMicButtonUi();
    syncLiveOverlayClass();
  }

  function syncLiveOverlayClass() {
    const open = Boolean(
      document.getElementById('partyToolsSheet')?.classList.contains('open') ||
        document.getElementById('giftSheet')?.classList.contains('open') ||
        document.getElementById('apMicLinkModal')?.classList.contains('open') ||
        document.getElementById('apTopupSheet')?.classList.contains('open') ||
        document.getElementById('partyRequestsSheet')?.classList.contains('open')
    );
    document.body.classList.toggle('ap-live-overlay-open', open);
  }

  function syncBottomBarHeightVar() {
    const bar = document.getElementById('partyBottomBar');
    if (!bar) return;
    const h = Math.ceil(bar.getBoundingClientRect().height || 58);
    document.documentElement.style.setProperty('--ap-bottom-bar-h', `${h}px`);
  }

  function openPartyRequestsSheet() {
    syncBottomBarHeightVar();
    pinFixedOverlaysToBody();
    renderJoinRequests();
    document.body.classList.add('party-requests-open');
    document.getElementById('partyRequestsSheet')?.classList.add('open');
    syncLiveOverlayClass();
  }

  function closePartyRequestsSheet() {
    document.body.classList.remove('party-requests-open');
    document.getElementById('partyRequestsSheet')?.classList.remove('open');
    syncLiveOverlayClass();
  }

  function isAppChromeNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    if (el.id === 'partyBottomBar' || el.classList?.contains('party-bottom-bar')) return false;
    if (el.matches?.(
      '.social-bottom-nav, #social-bottom-nav-mount, .social-bridge-header, #ap-bridge-header, .navbar, footer.site-footer, header.site-header'
    )) {
      return true;
    }
    return Boolean(
      el.querySelector?.('.social-bottom-nav, #ap-bridge-header, .social-bridge-header, #social-bottom-nav-mount')
    );
  }

  function hideAppChrome() {
    document.documentElement.classList.add('ap-live-immersive');
    document.documentElement.classList.remove('social-bridge-mode');
    document.documentElement.style.setProperty('--social-bottom-nav-h', '0px');
    document.body.classList.add('ap-live-immersive');
    document.body.style.setProperty('padding-top', '0', 'important');
    document.body.style.setProperty('padding-bottom', '0', 'important');
    document.body.style.setProperty('background', '#000', 'important');
    document.getElementById('ap-bridge-header')?.remove();
    document.querySelectorAll(
      '.social-bottom-nav, #social-bottom-nav-mount, .social-bridge-header, .navbar, footer.site-footer, header.site-header'
    ).forEach((el) => {
      if (el.id === 'partyBottomBar' || el.classList.contains('party-bottom-bar')) return;
      el.remove();
    });
  }

  function scheduleHideAppChrome() {
    hideAppChrome();
    [50, 200, 600, 1500, 3000].forEach((ms) => setTimeout(hideAppChrome, ms));
    if (window.__AP_LIVE_CHROME_OBS__) return;
    let debounceTimer = null;
    window.__AP_LIVE_CHROME_OBS__ = new MutationObserver((mutations) => {
      const chromeAdded = mutations.some(
        (m) => m.type === 'childList' && Array.from(m.addedNodes).some(isAppChromeNode)
      );
      if (!chromeAdded) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(hideAppChrome, 80);
    });
    window.__AP_LIVE_CHROME_OBS__.observe(document.body, { childList: true, subtree: false });
  }

  function closeLiveOverlays(except) {
    if (except !== 'tools') document.getElementById('partyToolsSheet')?.classList.remove('open');
    if (except !== 'gift') document.getElementById('giftSheet')?.classList.remove('open');
    if (except !== 'mic') document.getElementById('apMicLinkModal')?.classList.remove('open');
    if (except !== 'chat') closeChatPanelOnly();
    document.getElementById('apEmojiPopover')?.classList.remove('is-open');
    syncLiveOverlayClass();
  }

  function syncBottomBarForRole() {
    const compose = document.getElementById('liveChatCompose');
    const followBtn = document.getElementById('partyBtnFollow') || document.getElementById('liveBtnFollow');
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    const hosting = isHost();
    if (joinBtn) {
      joinBtn.textContent = 'Request mic';
      joinBtn.style.display = isPartyRoomPage() && !hosting && !hasSpeakerSeat ? '' : 'none';
    }
    if (followBtn) {
      const hideFollow = hosting || followed;
      followBtn.classList.toggle('ap-btn-follow-hidden', hideFollow);
      followBtn.setAttribute('aria-hidden', hideFollow ? 'true' : 'false');
    }
    if (compose) {
      compose.classList.remove('ap-compose-hidden');
    }
  }

  function bindImmersiveToolLinks() {
    const sheet = document.getElementById('partyToolsSheet');
    if (!sheet || sheet.dataset.toolsBound === '1') return;
    sheet.dataset.toolsBound = '1';
    sheet.querySelectorAll('.party-tools-grid a[href]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        sheet.classList.remove('open');
        closeLiveOverlays();
        const href = a.getAttribute('href') || '';
        if (href.includes('chat.html')) {
          focusChatCompose();
          toast('Type your message below', 'info');
          return;
        }
        if (href.includes('coins-recharge') || href.includes('recharge') || href.includes('store.html')) {
          openTopupSheet();
          return;
        }
        if (href.includes('rankings')) {
          openInRoomWebPanel('/rankings.html?app=1&embed=1', 'Rankings');
          return;
        }
        if (href.includes('vip')) {
          openTopupSheet();
          return;
        }
        openInRoomWebPanel(href.includes('?') ? href + '&embed=1' : href + '?app=1&embed=1', 'AP Services');
      });
    });
  }

  function openInRoomWebPanel(url, title) {
    let frame = document.getElementById('apInRoomWebPanel');
    if (!frame) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-inroom-web" id="apInRoomWebPanel">
          <div class="ap-inroom-web-bar">
            <strong id="apInRoomWebTitle">Page</strong>
            <button type="button" id="apInRoomWebClose" aria-label="Close"><i class="fas fa-times"></i></button>
          </div>
          <iframe id="apInRoomWebFrame" title="In-room panel" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
        </div>`
      );
      frame = document.getElementById('apInRoomWebPanel');
      document.getElementById('apInRoomWebClose')?.addEventListener('click', () => {
        frame?.classList.remove('open');
        const iframe = document.getElementById('apInRoomWebFrame');
        if (iframe) iframe.src = 'about:blank';
      });
    }
    const titleEl = document.getElementById('apInRoomWebTitle');
    if (titleEl) titleEl.textContent = title || 'AP Services';
    const iframe = document.getElementById('apInRoomWebFrame');
    if (iframe) iframe.src = url;
    frame?.classList.add('open');
  }

  function bindPartyBackGuard() {
    if (window.__apPartyBackGuard || window.__AP_LIVE_BACK_GUARD__) return;
    window.__apPartyBackGuard = true;
    if (!isPartyRoomPage() && !isLiveRoomPage()) return;
    try {
      history.pushState({ apLiveRoom: true }, '');
      window.addEventListener('popstate', () => {
        if (!isPartyRoomPage() && !isLiveRoomPage()) return;
        if (window.__apLeavingRoom) return;
        history.pushState({ apLiveRoom: true }, '');
        minimizeLiveRoom();
      });
    } catch (_e) {}
  }

  function minimizeLiveRoom() {
    if (minimizingRoom) return;
    hideApLoader();
    setLiveStatus('', null);
    closeLiveOverlays();
    if (window.LiveSession?.minimize?.('/explore.html?app=1')) {
      minimizingRoom = true;
      return;
    }
    minimizingRoom = true;
    const host = roomState?.hostName || (isHost() ? displayName(currentUser()) : 'Live');
    const payload = {
      url: location.pathname + location.search,
      channel: channelId(),
      host,
      type: document.body.dataset.livePage || 'live-room',
      ts: Date.now(),
    };
    try {
      sessionStorage.setItem('ap_live_pip_session', JSON.stringify(payload));
      localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify({ ...payload, expiresAt: Date.now() + LIVE_SESSION_TTL_MS }));
    } catch (_e) {}
    try {
      history.pushState({ apLiveRoom: 1 }, '');
    } catch (_e) {}
  }

  function isChatPanelOpen() {
    return false;
  }

  function closeChatPanelOnly() {
    document.body.classList.remove('ap-chat-open');
    document.getElementById('apChatBackdrop')?.classList.remove('is-visible');
    document.getElementById('apEmojiPopover')?.classList.remove('is-open');
    syncLiveOverlayClass();
  }

  function closeChatUi() {
    closeChatPanelOnly();
    document.body.classList.remove('ap-keyboard-open', 'ap-live-overlay-open');
    document.documentElement.style.setProperty('--ap-kb-offset', '0px');
    chatTab = 'all';
    document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === 'all');
    });
    renderChatFromState();
    const input = document.getElementById('liveChatInput');
    if (input) input.blur();
    syncLiveOverlayClass();
  }

  function focusChatCompose() {
    const input = document.getElementById('liveChatInput');
    if (input) {
      input.focus();
      chatTab = 'chat';
      document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === 'chat');
      });
      renderChatFromState();
    }
  }

  function openChatPanel() {
    focusChatCompose();
  }

  function ensureChatPanelChrome() {
    bindChatPanelUi();
  }

  function bindChatPanelUi() {
    if (window.__apChatPanelUiBound) return;
    window.__apChatPanelUiBound = true;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const input = document.getElementById('liveChatInput');
        if (document.activeElement === input) closeChatUi();
      }
    });
  }

  function toggleChatPanel(forceOpen) {
    if (forceOpen === false) {
      closeChatUi();
      return;
    }
    focusChatCompose();
  }

  function ensureBottomComposeLayout() {
    const bar = document.getElementById('partyBottomBar');
    const compose = document.getElementById('liveChatCompose');
    if (!bar || !compose) return;
    document.getElementById('apSayHiPill')?.remove();
    compose.classList.add('ap-compose-inline');
    const actions = bar.querySelector('.party-bottom-actions');
    if (compose.parentElement !== bar) {
      if (actions) bar.insertBefore(compose, actions);
      else bar.appendChild(compose);
    }
  }

  function navigateToUserProfile(userId, name) {
    const n = encodeURIComponent(name || 'User');
    if (userId) {
      location.href = `/creator-profile.html?userId=${encodeURIComponent(userId)}&name=${n}&app=1`;
      return;
    }
    location.href = `/creator-profile.html?name=${n}&app=1`;
  }

  function bindRoomAvatars() {
    window.SocialUI?.bindAvatarFallbacks?.(document.body);
    const user = currentUser();
    const hostName = roomState?.hostName || displayName(user);
    const hostId = roomState?.hostId ? String(roomState.hostId) : '';
    document.querySelectorAll('#partyHostAvatar, #liveHostAvatar, .ap-top-gifter img').forEach((img) => {
      if (!img.getAttribute('src')) img.src = avatarUrl(hostName);
      img.dataset.name = hostName;
      if ((img.id === 'partyHostAvatar' || img.id === 'liveHostAvatar') && !img.dataset.profileBound) {
        img.dataset.profileBound = '1';
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
          if (hostId && !isHost()) navigateToUserProfile(hostId, hostName);
          else openProfileSheet(hostName, roomState?.hostId || '');
        });
      }
    });
    document.querySelectorAll('#partyHostName, #liveHostName').forEach((el) => {
      if (el.dataset.profileBound) return;
      el.dataset.profileBound = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (hostId && !isHost()) navigateToUserProfile(hostId, hostName);
        else openProfileSheet(hostName, roomState?.hostId || '');
      });
    });
  }

  function openTopupSheet() {
    document.getElementById('apTopupSheet')?.classList.add('open');
    syncLiveOverlayClass();
    if (window.SocialWallet?.fetchBalance) {
      SocialWallet.fetchBalance(true).then((b) => {
        const el = document.getElementById('apTopupBal');
        if (el) el.textContent = Number(b?.coin_balance || 0).toLocaleString('en-IN');
      });
    }
  }

  function openSurpriseShop() {
    document.getElementById('apSurpriseShop')?.classList.add('open');
  }

  function pinFixedOverlaysToBody() {
    [
      'partyBottomBar',
      'apRoomStatusStrip',
      'partyToolsSheet',
      'apMicLinkModal',
      'giftSheet',
      'partyRequestsSheet',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== document.body) document.body.appendChild(el);
    });
    const requests = document.getElementById('partyRequestsSheet');
    if (requests) document.body.appendChild(requests);
  }

  function bindMicLinkModal() {
    if (window.__apMicModalBound) return;
    window.__apMicModalBound = true;
    document.getElementById('apMicLinkContinue')?.addEventListener('click', () => toast('Waiting for host approval…'));
    document.getElementById('apMicLinkCancel')?.addEventListener('click', hideMicLinkModal);
    document.getElementById('apMicLinkCancel2')?.addEventListener('click', hideMicLinkModal);
    document.getElementById('apMicLinkConfirm')?.addEventListener('click', hideMicLinkModal);
    document.getElementById('apMicLinkModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'apMicLinkModal') hideMicLinkModal();
    });
  }

  function updateCharCount() {
    const input = document.getElementById('liveChatInput');
    const el = document.getElementById('apCharCount');
    if (!el || !input) return;
    const len = input.value.length;
    el.textContent = len > 0 ? String(len) : '';
    el.classList.toggle('is-empty', len === 0);
    el.setAttribute('aria-hidden', len === 0 ? 'true' : 'false');
  }

  function clearMessageBadge() {
    try {
      localStorage.setItem('chat_unread', '0');
    } catch (_e) {}
    syncToolBadges();
  }

  function prepareLiveUiShell() {
    scheduleHideAppChrome();
    document.getElementById('apChatPanel')?.remove();
    document.body.classList.remove('ap-chat-open');
    injectLiveOverlays();
    ensureChatPanelChrome();
    ensureBottomComposeLayout();
    syncBottomBarForRole();
    injectGiftSheet();
    if (isPartyRoomPage()) bindMicLinkModal();
    ensureLiveDebugPanel();
    const activeRegion = document.querySelector('.ap-region-tabs button.active');
    chatRegionFilter = activeRegion?.dataset.region || 'room';
    syncToolBadges();
    updateCharCount();
  }

  function pinBottomBarToBody() {
    pinFixedOverlaysToBody();
  }

  function injectLiveOverlays() {
    pinFixedOverlaysToBody();
    if (!document.getElementById('apGiftFly')) {
      document.body.insertAdjacentHTML(
        'afterbegin',
        `<div class="ap-gift-fly" id="apGiftFly" aria-live="polite"></div>`
      );
    }
    if (!document.getElementById('apPkOverlay') && (isPartyRoomPage() || isLiveRoomPage())) {
      const root = document.getElementById('liveRoomRoot') || document.querySelector('.party-room');
      if (root) {
        root.insertAdjacentHTML(
          'afterbegin',
          `<div class="ap-pk-overlay" id="apPkOverlay" aria-hidden="true">
            <div class="ap-pk-bar">
              <div class="ap-pk-bar-left" id="apPkBarLeft" style="width:50%"></div>
              <span class="ap-pk-score ap-pk-score-l" id="apPkScoreLeft">0</span>
              <span class="ap-pk-timer" id="apPkTimer">PK 05:00</span>
              <span class="ap-pk-score ap-pk-score-r" id="apPkScoreRight">0</span>
            </div>
            <p class="ap-pk-status" id="apPkStatus">Send gifts to score in PK</p>
          </div>`
        );
      }
    }
    if (!document.getElementById('apGuestRail')) {
      const overlay = document.querySelector('.live-overlay') || document.querySelector('.party-room');
      overlay?.insertAdjacentHTML(
        'beforeend',
        `<aside class="ap-guest-rail" id="apGuestRail" aria-label="Guests"></aside>`
      );
    }
    if (!document.getElementById('apMicLinkModal') && isPartyRoomPage()) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay" id="apMicLinkModal">
          <div class="ap-miclink-modal">
            <div id="apMicLinkWaiting">
              <div class="ap-miclink-head">On the mic link list</div>
              <div class="ap-miclink-body">
                <p>You're on the link list. Wait for host's approval.</p>
                <button type="button" class="ap-miclink-primary" id="apMicLinkContinue">Confirm</button>
              </div>
              <button type="button" class="ap-miclink-cancel" id="apMicLinkCancel">Cancel the mic link</button>
            </div>
            <div id="apMicLinkRejected" style="display:none">
              <div class="ap-miclink-head">On the mic link list</div>
              <div class="ap-miclink-body ap-miclink-rejected">
                <p><strong>Request declined</strong><br>You're still on the link list. Wait for host's approval.</p>
                <button type="button" class="ap-miclink-primary" id="apMicLinkConfirm">Confirm</button>
              </div>
              <button type="button" class="ap-miclink-cancel" id="apMicLinkCancel2">Cancel the mic link</button>
            </div>
          </div>
        </div>`
      );
      bindMicLinkModal();
    }
    if (!document.getElementById('apTopupSheet')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-topup-sheet" id="apTopupSheet">
          <div class="ap-topup-panel">
            <div class="ap-topup-head">
              <h2>Top-up coins (UPI)</h2>
              <button type="button" id="apTopupClose"><i class="fas fa-times"></i></button>
            </div>
            <p class="ap-topup-balance">🪙 <span id="apTopupBal">0</span></p>
            <div class="ap-topup-banner">Pay via PhonePe / GPay / Paytm UPI — then submit your UTR here. You stay in the party room.</div>
            <div id="apTopupStep1">
              <p class="ap-topup-pay-hint" style="font-size:12px;color:#666;margin:0 0 10px;text-align:center">Select amount (INR) — coins credit after admin verifies UTR</p>
              <div class="ap-topup-grid" id="apTopupGrid"></div>
              <button type="button" class="ap-topup-recharge" id="apTopupRecharge">Continue to payment</button>
            </div>
            <div id="apTopupStep2" hidden>
              <p class="ap-topup-pay-hint" style="text-align:center;margin:8px 0"><strong id="apTopupSelectedLabel">₹199</strong> → <span id="apTopupSelectedCoins">1,990</span> coins</p>
              <div class="ap-topup-qr-wrap" style="text-align:center;margin:8px 0">
                <img src="assets/payment-qr.png" alt="UPI QR" style="max-width:180px;border-radius:12px" onerror="this.style.display='none'">
                <p style="font-size:11px;color:#888">Scan & pay the exact amount</p>
              </div>
              <label style="display:block;font-size:12px;font-weight:600;margin:8px 0 4px" for="apTopupUtr">UTR (from payment app)</label>
              <input type="text" id="apTopupUtr" inputmode="numeric" maxlength="22" placeholder="10–22 digit UTR" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #ddd;font-size:16px">
              <div class="rc-proof-upload ap-topup-proof" id="apTopupProofZone" role="button" tabindex="0" style="margin-top:10px;padding:14px 10px">
                <div id="apTopupProofPlaceholder" class="rc-proof-placeholder">
                  <div class="icon"><i class="fas fa-cloud-upload-alt"></i></div>
                  <p style="margin:0;font-size:13px">Tap to attach receipt (optional)</p>
                </div>
                <div id="apTopupProofPreviewWrap" class="rc-proof-preview-wrap" hidden>
                  <img id="apTopupProofPreview" alt="Payment screenshot" style="max-height:120px">
                  <button type="button" class="rc-proof-change" id="apTopupProofChange">Change image</button>
                </div>
              </div>
              <input type="file" id="apTopupProof" class="rc-file-input-hidden" accept="image/jpeg,image/png,image/webp,image/*" tabindex="-1" aria-hidden="true">
              <button type="button" class="ap-topup-recharge" id="apTopupSubmit" style="margin-top:12px">Submit for verification</button>
              <button type="button" class="ap-topup-back" id="apTopupBack" type="button" style="margin-top:8px;width:100%;border:none;background:none;color:#666;font-size:13px">← Change amount</button>
            </div>
            <label class="ap-topup-agree"><input type="checkbox" checked id="apTopupAgree"> I agree to the <a href="/terms.html?app=1">User Recharge Agreement</a></label>
          </div>
        </div>`
      );
      const packs = [
        [99, 990],
        [199, 1990],
        [499, 4990],
        [999, 9990],
        [1999, 19990],
        [4999, 49990],
      ];
      const grid = document.getElementById('apTopupGrid');
      if (grid) {
        grid.innerHTML = packs
          .map(
            ([inr, coins], i) =>
              `<button type="button" class="ap-topup-pack${i === 1 ? ' is-selected' : ''}" data-inr="${inr}" data-coins="${coins}">
                <strong>${coins.toLocaleString('en-IN')}</strong><span>₹${inr.toLocaleString('en-IN')}</span>
              </button>`
          )
          .join('');
        grid.querySelectorAll('.ap-topup-pack').forEach((btn) => {
          btn.addEventListener('click', () => {
            grid.querySelectorAll('.ap-topup-pack').forEach((b) => b.classList.remove('is-selected'));
            btn.classList.add('is-selected');
          });
        });
      }
      document.getElementById('apTopupClose')?.addEventListener('click', () => {
        document.getElementById('apTopupSheet')?.classList.remove('open');
        document.getElementById('apTopupStep1')?.removeAttribute('hidden');
        document.getElementById('apTopupStep2')?.setAttribute('hidden', '');
        syncLiveOverlayClass();
      });
      document.getElementById('apTopupSheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'apTopupSheet') {
          e.target.classList.remove('open');
          document.getElementById('apTopupStep1')?.removeAttribute('hidden');
          document.getElementById('apTopupStep2')?.setAttribute('hidden', '');
          syncLiveOverlayClass();
        }
      });
      document.getElementById('apTopupRecharge')?.addEventListener('click', () => {
        if (!document.getElementById('apTopupAgree')?.checked) {
          toast('Please agree to the User Recharge Agreement', 'warning');
          return;
        }
        const sel = document.querySelector('#apTopupGrid .ap-topup-pack.is-selected');
        const inr = sel?.dataset?.inr || '199';
        const coins = sel?.dataset?.coins || '1990';
        const lbl = document.getElementById('apTopupSelectedLabel');
        const coinsEl = document.getElementById('apTopupSelectedCoins');
        if (lbl) lbl.textContent = '₹' + Number(inr).toLocaleString('en-IN');
        if (coinsEl) coinsEl.textContent = Number(coins).toLocaleString('en-IN') + ' coins';
        document.getElementById('apTopupStep1')?.setAttribute('hidden', '');
        document.getElementById('apTopupStep2')?.removeAttribute('hidden');
        syncLiveOverlayClass();
        setTimeout(() => {
          document.getElementById('apTopupSubmit')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 120);
      });
      document.getElementById('apTopupBack')?.addEventListener('click', () => {
        document.getElementById('apTopupStep2')?.setAttribute('hidden', '');
        document.getElementById('apTopupStep1')?.removeAttribute('hidden');
      });
      document.getElementById('apTopupUtr')?.addEventListener('focus', () => {
        setTimeout(() => {
          document.getElementById('apTopupSubmit')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 200);
      });
      let apTopupProofFile = null;
      const apProofZone = document.getElementById('apTopupProofZone');
      const apProofInput = document.getElementById('apTopupProof');
      function applyApTopupProof(file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
          toast('Please choose an image file', 'warning');
          return;
        }
        apTopupProofFile = file;
        const preview = document.getElementById('apTopupProofPreview');
        const wrap = document.getElementById('apTopupProofPreviewWrap');
        const placeholder = document.getElementById('apTopupProofPlaceholder');
        apProofZone?.classList.add('has-file');
        if (wrap) wrap.hidden = true;
        if (placeholder) placeholder.hidden = false;
        const reader = new FileReader();
        reader.onload = () => {
          if (preview) preview.src = String(reader.result || '');
          if (wrap) wrap.hidden = false;
          if (placeholder) placeholder.hidden = true;
        };
        reader.readAsDataURL(file);
      }
      apProofZone?.addEventListener('click', () => apProofInput?.click());
      apProofInput?.addEventListener('change', () => {
        if (apProofInput.files?.[0]) applyApTopupProof(apProofInput.files[0]);
      });
      document.getElementById('apTopupProofChange')?.addEventListener('click', (e) => {
        e.stopPropagation();
        apProofInput?.click();
      });
      document.getElementById('apTopupSubmit')?.addEventListener('click', async () => {
        const sel = document.querySelector('#apTopupGrid .ap-topup-pack.is-selected');
        const inr = parseFloat(sel?.dataset?.inr || '199');
        const utr = (document.getElementById('apTopupUtr')?.value || '').trim().replace(/\s+/g, '');
        if (!/^\d{10,22}$/.test(utr)) {
          toast('Enter the 10–22 digit UTR from your UPI receipt', 'warning');
          return;
        }
        const proof = apTopupProofFile;
        const btn = document.getElementById('apTopupSubmit');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Submitting…';
        }
        try {
          if (!window.SocialWallet?.submitRecharge) throw new Error('Wallet unavailable');
          await SocialWallet.submitRecharge(
            { amount_inr: inr, transaction_id: utr, payment_method: 'qr_manual' },
            proof || null
          );
          toast('Submitted! Coins credit after admin verifies UTR.', 'success');
          document.getElementById('apTopupUtr').value = '';
          apTopupProofFile = null;
          if (apProofInput) apProofInput.value = '';
          document.getElementById('apTopupProofPreview')?.removeAttribute('src');
          document.getElementById('apTopupProofPreviewWrap')?.setAttribute('hidden', '');
          document.getElementById('apTopupProofPlaceholder')?.removeAttribute('hidden');
          apProofZone?.classList.remove('has-file');
          document.getElementById('apTopupSheet')?.classList.remove('open');
          document.getElementById('apTopupStep2')?.setAttribute('hidden', '');
          document.getElementById('apTopupStep1')?.removeAttribute('hidden');
          await refreshCoinDisplay();
          document.getElementById('apTopupSheet')?.classList.remove('open');
        } catch (e) {
          toast(e?.message || 'Recharge submit failed', 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Submit for verification';
          }
        }
      });
    }
    if (!document.getElementById('apSurpriseShop')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-surprise-sheet" id="apSurpriseShop">
          <div class="ap-surprise-panel">
            <div class="ap-surprise-head">
              <button type="button" id="apSurpriseBack"><i class="fas fa-chevron-left"></i></button>
              <h2>Surprise Shop</h2>
              <button type="button" id="apSurpriseMore"><i class="fas fa-ellipsis-h"></i></button>
            </div>
            <div class="ap-surprise-hero">
              <div class="ap-surprise-card">
                <span class="ap-surprise-title">Heart Voyage</span>
                <span class="ap-surprise-art">🛥️❤️</span>
              </div>
            </div>
            <div class="ap-surprise-foot">
              <div><strong>Cycle Unlock</strong><p>You have topped up <span id="apSurpriseCoins">0</span> coins. Need <em>1,500,000</em> more to unlock.</p></div>
              <button type="button" class="ap-surprise-recharge" id="apSurpriseRecharge">Recharge</button>
            </div>
          </div>
        </div>`
      );
      document.getElementById('apSurpriseBack')?.addEventListener('click', () => {
        document.getElementById('apSurpriseShop')?.classList.remove('open');
      });
      document.getElementById('apSurpriseRecharge')?.addEventListener('click', openTopupSheet);
      document.getElementById('apSurpriseShop')?.addEventListener('click', (e) => {
        if (e.target.id === 'apSurpriseShop') e.target.classList.remove('open');
      });
    }
    document.body.classList.add('ap-ref-ui');
    if (isPartyRoomPage() && qs('pk') === '1') {
      document.body.classList.add('is-pk-mode');
      document.getElementById('apPkOverlay')?.removeAttribute('aria-hidden');
      pkScoreLeft = 0;
      pkScoreRight = 0;
      updatePkBar();
      window.SocialFX?.pkCountdown?.(3, () => updatePkBar());
    }
  }

  function setLiveStreamVisible(visible) {
    const root = document.getElementById('liveRoomRoot');
    if (root) root.classList.toggle('ap-has-video-stream', Boolean(visible));
    document.body.classList.toggle('ap-has-video-stream', Boolean(visible));
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop) backdrop.style.opacity = visible ? '0' : '';
  }

  async function playRemoteMedia(user, mediaType) {
    if (!user || !agoraClient) return;
    try {
      await agoraClient.subscribe(user, mediaType);
    } catch (subErr) {
      const msg = subErr?.message || String(subErr);
      liveDebugLog(`subscribe FAILED uid=${user.uid} media=${mediaType}: ${msg}`);
      return;
    }
    if (mediaType === 'video') {
      const container = document.getElementById('liveRemoteHost');
      const root = document.getElementById('liveRoomRoot');
      if (root) root.classList.remove('is-audio-mode');
      if (container) {
        container.innerHTML = '';
        user.videoTrack.play(container);
      }
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
      setLiveStreamVisible(true);
    }
    if (mediaType === 'audio') {
      if (soundOn && user.audioTrack) {
        try {
          user.audioTrack.play();
        } catch (_e) {
          setTimeout(() => {
            try {
              user.audioTrack?.play();
            } catch (_e2) {}
          }, 300);
        }
      } else {
        user.audioTrack?.stop();
      }
    }
    remoteUsers.set(user.uid, user);
    updateLiveDebug({ remoteUsersCount: remoteUsers.size });
    syncLiveUiState();
  }

  function ensureHostVideoVisible() {
    if (!isActuallyLive() || broadcastMode === 'audio') return;
    const root = document.getElementById('liveRoomRoot');
    const localBox = document.getElementById('liveLocalHost');
    const fallback = document.getElementById('liveLocalVideo');
    const bg = document.getElementById('liveBg');
    if (root) root.classList.remove('is-audio-mode');
    if (localBox) {
      localBox.style.display = '';
      localBox.classList.add('live-local-host-mirror');
    }
    if (fallback && localBox?.querySelector('video')) fallback.style.display = 'none';
    if (bg) bg.style.display = 'none';
    setLiveStreamVisible(true);
  }

  function showWinBanner(gift) {
    const el = document.getElementById('partyWinBanner');
    if (!el) return;
    el.innerHTML = `WIN · <strong>${escapeHtml(gift.from)}</strong> sent ${gift.emoji} to ${escapeHtml(gift.to)} — <strong>${(gift.amount || 0).toLocaleString()}</strong> 🪙`;
    el.classList.add('is-flash');
    clearTimeout(el._flash);
    el._flash = setTimeout(() => el.classList.remove('is-flash'), 4000);
  }

  function renderJoinRequests() {
    const list = document.getElementById('partyRequestsList');
    const badge = document.getElementById('partyReqCount');
    if (badge) badge.textContent = String(joinRequests.length);
    if (!list) return;
    if (!joinRequests.length) {
      list.innerHTML = '<p class="party-requests-empty">No pending requests</p>';
      return;
    }
    list.innerHTML = joinRequests
      .map(
        (r) => `
      <div class="party-req-row" data-req="${r.id}">
        <img src="${avatarUrl(r.name)}" alt="">
        <div class="info"><strong>${escapeHtml(r.name)}</strong><br><small>wants a seat</small></div>
        <button type="button" class="accept" data-accept="${r.id}">Accept</button>
        <button type="button" class="deny" data-deny="${r.id}">Deny</button>
      </div>`
      )
      .join('');
    list.querySelectorAll('[data-accept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const req = joinRequests.find((x) => String(x.id) === String(btn.dataset.accept));
        if (isPartySeatsFull()) {
          toast('Party is full — max 15 on stage (host + 14 guests)', 'warning');
          return;
        }
        joinRequests = joinRequests.filter((x) => String(x.id) !== String(btn.dataset.accept));
        renderJoinRequests();
        if (req && liveSocket) {
          liveSocket.emit('live:seat_response', {
            channel: channelId(),
            userId: req.userId || req.id,
            name: req.name,
            accepted: true,
          });
        }
        toast('Guest accepted');
      });
    });
    list.querySelectorAll('[data-deny]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const req = joinRequests.find((x) => String(x.id) === String(btn.dataset.deny));
        joinRequests = joinRequests.filter((x) => String(x.id) !== String(btn.dataset.deny));
        renderJoinRequests();
        if (req && liveSocket) {
          liveSocket.emit('live:seat_response', {
            channel: channelId(),
            userId: req.userId || req.id,
            accepted: false,
          });
        }
      });
    });
  }

  function requestSeatJoin() {
    if (isLiveRoomPage()) return;
    if (isHost()) return;
    const user = currentUser();
    if (!user?.id) {
      toast('Please log in to request a seat', 'error');
      return;
    }
    const name = displayName(user);
    const id = String(user.id);
    if (joinRequests.some((r) => String(r.id) === String(id))) {
      toast('Request already sent');
      return;
    }
    if (hasSpeakerSeat) {
      toast('You already have a seat', 'info');
      return;
    }
    if (isPartySeatsFull()) {
      toast('Party is full — all 15 seats taken', 'warning');
      return;
    }
    if (!liveSocket?.connected) {
      toast('Not connected to room — wait a moment or reload', 'error');
      return;
    }
    liveSocket.emit('live:seat_request', {
        channel: channelId(),
        userId: id,
        name,
      });
      liveSocket.emit('live:chat', {
        channel: channelId(),
        type: 'system',
        text: `${name} requested to join a seat`,
      });
    micLinkPending = true;
    showMicLinkModal('waiting');
    toast('Request sent to host');
  }

  function bindHostControls(pageType) {
    syncHostBarUi();

    if (window.__apHostControlsBound) return;
    window.__apHostControlsBound = true;

    document.getElementById('partyBtnInvite')?.addEventListener('click', () => {
      document.getElementById('partyBtnShare')?.click();
    });
    document.getElementById('partyBtnRequests')?.addEventListener('click', () => {
      openPartyRequestsSheet();
    });
    document.getElementById('partyRequestsClose')?.addEventListener('click', () => {
      closePartyRequestsSheet();
    });
    document.getElementById('partyRequestsSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyRequestsSheet') {
        closePartyRequestsSheet();
      }
    });

    document.getElementById('liveBtnInvite')?.addEventListener('click', () => {
      document.getElementById('partyBtnShare')?.click();
    });

    document.getElementById('liveBtnPk')?.addEventListener('click', () => {
      if (!liveSocket?.connected) {
        toast('Not connected to live server', 'error');
        return;
      }
      liveSocket.emit(
        'pk:start',
        { channel: channelId(), durationSeconds: 300, format: '1v1' },
        (res) => {
          if (res?.ok) toast('PK battle started!', 'success');
          else toast(res?.message || 'Could not start PK', 'error');
        }
      );
    });

    document.getElementById('liveBtnHostMute')?.addEventListener('click', () => handleMicButton());

    document.getElementById('liveBtnFlipCam')?.addEventListener('click', () => switchCameraFacing());
    document.getElementById('liveBtnFilters')?.addEventListener('click', () => openVideoFilterSheet());

    const setMode = async (mode) => {
      const changed = broadcastMode !== mode;
      broadcastMode = mode;
      document.getElementById('liveBtnModeVideo')?.classList.toggle('is-active', mode === 'video');
      document.getElementById('liveBtnModeAudio')?.classList.toggle('is-active', mode === 'audio');
      if (changed) toast(mode === 'video' ? 'Video mode' : 'Audio-only mode');
      if (changed && isHost() && pageType === 'live') await restartAgoraForMode();
    };
    document.getElementById('liveBtnModeVideo')?.addEventListener('click', () => setMode('video'));
    document.getElementById('liveBtnModeAudio')?.addEventListener('click', () => setMode('audio'));
    if (isHost() && pageType === 'live') setMode(broadcastMode);
  }

  function getGiftRecipients() {
    const hostId = roomState?.hostId || activeFeedHostId || null;
    const host = { name: roomState?.hostName || 'Host', id: hostId };
    const seats = (roomState?.seats || []).filter((s) => s && s.name);
    const list = [host];
    seats.forEach((s) => {
      if (!list.some((x) => x.name === s.name)) list.push({ name: s.name, id: s.userId });
    });
    return list.filter((r) => r.name);
  }

  function resolveGiftReceiverId(toName) {
    const sheet = document.getElementById('giftSheet');
    if (sheet?.dataset?.toUserId) return String(sheet.dataset.toUserId);
    const recipients = getGiftRecipients();
    const match = recipients.find((r) => r.name === toName) || recipients[0];
    if (match?.id) return String(match.id);
    if (roomState?.hostId) return String(roomState.hostId);
    if (activeFeedHostId) return String(activeFeedHostId);
    return '';
  }

  async function shareRoomLink() {
    openInAppShareSheet();
  }

  function ensureInAppShareSheet() {
    if (document.getElementById('apInAppShareSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="ap-modal-overlay align-bottom" id="apInAppShareSheet">
        <div class="ap-profile-sheet-panel ap-share-sheet-panel">
          <h3 class="ap-share-sheet-title">Invite to room</h3>
          <p class="ap-share-sheet-sub">Pick someone you follow — they'll get a chat invite with your room link</p>
          <div class="ap-share-user-list" id="apShareUserList"></div>
          <div class="ap-share-actions">
            <button type="button" class="ap-share-link-btn" id="apShareCopyLink"><i class="fas fa-link"></i> Copy link</button>
            <button type="button" class="ap-share-cancel" id="apShareCancel">Close</button>
          </div>
        </div>
      </div>`
    );
    document.getElementById('apInAppShareSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'apInAppShareSheet') e.target.classList.remove('open');
    });
    document.getElementById('apShareCancel')?.addEventListener('click', () => {
      document.getElementById('apInAppShareSheet')?.classList.remove('open');
    });
    document.getElementById('apShareCopyLink')?.addEventListener('click', async () => {
      const url = viewerShareUrl();
      try {
        if (window.SocialUI?.shareLink) {
          await SocialUI.shareLink({ title: 'Join my live', url });
        } else if (navigator.share) {
          await navigator.share({ title: 'Join my live', url });
        } else {
          await navigator.clipboard.writeText(url);
          toast('Link copied', 'success');
        }
      } catch (e) {
        if (e?.name !== 'AbortError') toast('Could not share link', 'error');
      }
    });
  }

  async function openInAppShareSheet() {
    ensureInAppShareSheet();
    const sheet = document.getElementById('apInAppShareSheet');
    const list = document.getElementById('apShareUserList');
    if (!sheet || !list) return;
    list.innerHTML = '<p class="ap-share-loading"><span class="ap-share-skeleton"></span> Loading friends…</p>';
    sheet.classList.add('open');

    const hostName = roomState?.hostName || displayName(currentUser()) || 'Host';
    const page = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';
    const url = viewerShareUrl();
    const inviteText = `${hostName} invited you to a ${page} room on AP Services: ${url}`;

    let users = [];
    try {
      if (window.SocialInteractions?.getFollowEntries) {
        users = SocialInteractions.getFollowEntries();
      }
      if ((!users.length || users.length < 2) && window.API && localStorage.getItem('user')) {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const res = await API.get('/social/following?limit=50');
        const rows = Array.isArray(res?.data) ? res.data : [];
        users = rows.map((u) => ({
          id: String(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
        }));
      }
    } catch (_e) {
      users = [];
    }

    if (!users.length) {
      list.innerHTML =
        '<p class="ap-share-empty">Follow people first to invite them here, or copy the room link below.</p>';
      return;
    }

    list.innerHTML = users
      .map(
        (u) => `
      <button type="button" class="ap-share-user-row" data-share-user="${escapeHtml(String(u.id || ''))}" data-share-name="${escapeHtml(u.name || 'User')}">
        <img src="${avatarUrl(u.name)}" alt="">
        <span>${escapeHtml(u.name)}</span>
        <span class="ap-share-status"><i class="fas fa-paper-plane"></i> Invite</span>
      </button>`
      )
      .join('');

    list.querySelectorAll('.ap-share-user-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.shareUser;
        const name = btn.dataset.shareName || 'User';
        const statusEl = btn.querySelector('.ap-share-status');
        if (statusEl) {
          statusEl.innerHTML = '<i class="fas fa-check"></i> Sent';
          statusEl.classList.add('is-sent');
        }
        btn.disabled = true;
        try {
          localStorage.setItem(
            'ap_share_pending',
            JSON.stringify({ userId, name, text: inviteText, at: Date.now() })
          );
        } catch (_e) {}
        toast(`Invite sent to ${name}`, 'success');
        if (userId) {
          setTimeout(() => {
            location.href = `/chat.html?id=${encodeURIComponent(userId)}&app=1`;
          }, 800);
        }
      });
    });
  }

  function renderGiftRecipients(activeName) {
    const row = document.getElementById('giftRecipients');
    if (!row) return;
    const recipients = getGiftRecipients();
    row.innerHTML = recipients
      .map(
        (r) => `
      <button type="button" class="gift-recipient${r.name === activeName ? ' is-active' : ''}" data-to="${escapeHtml(r.name)}" data-user-id="${escapeHtml(String(r.id || ''))}">
        <img src="${avatarUrl(r.name)}" alt="">
        <span>${escapeHtml(r.name.slice(0, 8))}</span>
      </button>`
      )
      .join('');
    row.querySelectorAll('.gift-recipient').forEach((btn) => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('.gift-recipient').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const sheet = document.getElementById('giftSheet');
        if (sheet) {
          sheet.dataset.to = btn.dataset.to;
          sheet.dataset.toUserId = btn.dataset.userId || '';
        }
      });
    });
    const sheet = document.getElementById('giftSheet');
    const activeBtn = row.querySelector('.gift-recipient.is-active');
    if (sheet && activeBtn?.dataset?.userId) sheet.dataset.toUserId = activeBtn.dataset.userId;
  }

  function renderGiftGrid() {
    const grid = document.getElementById('giftGrid');
    if (!grid) return;
    const items = GIFT_CATALOG[giftCategory] || GIFT_CATALOG.gift;
    grid.innerHTML = items
      .map((g, i) => {
        const tier = window.SocialFX?.getGiftTier?.(g) || 'small';
        return `
      <button type="button" data-gift-idx="${i}" data-gift="${g.emoji}" data-cost="${g.cost}" data-tier="${tier}" class="${i === selectedGiftIdx ? 'is-selected' : ''}">
        <span class="g">${g.emoji}</span>
        <span>${g.name}</span>
        ${g.tag ? `<span class="gift-tag">${g.tag}</span>` : ''}
        <small>${g.cost} ${COIN_EMOJI}</small>
      </button>`;
      })
      .join('');
    grid.querySelectorAll('[data-gift-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedGiftIdx = parseInt(btn.dataset.giftIdx, 10) || 0;
        grid.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        updateGiftMeta();
      });
    });
    updateGiftMeta();
  }

  function openGiftSheet(targetName, targetUserId) {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    closeLiveOverlays('gift');
    const to = targetName || roomState?.hostName || 'Host';
    sheet.dataset.to = to;
    if (targetUserId) sheet.dataset.toUserId = String(targetUserId);
    else delete sheet.dataset.toUserId;
    renderGiftRecipients(to);
    renderGiftGrid();
    refreshCoinDisplay();
    updateGiftMeta();
    sheet.classList.add('open');
    syncLiveOverlayClass();
  }

  async function sendGiftViaApi(receiverId, cost, emoji, toName, giftSlug) {
    if (!window.SocialWallet) throw new Error('Wallet unavailable');
    await SocialWallet.sendGift({
      receiver_id: receiverId,
      coin_amount: cost,
      gift_type: giftSlug || emoji || 'gift',
      live_room_id: roomState?.roomId || undefined,
    });
    const giftEvt = { from: displayName(currentUser()), to: toName, emoji, amount: cost, qty: giftQty };
    const combo = window.SocialFX?.trackCombo?.(emoji, giftQty) || 1;
    window.SocialFX?.playGift?.(giftEvt, { combo });
    showWinBanner(giftEvt);
    showGiftFlyBanner(giftEvt);
    onGiftTeamProgress(cost);
    const sendBtn = document.getElementById('giftSendBtn');
    const balEl = document.getElementById('giftCoinsBal');
    if (sendBtn && balEl) window.SocialFX?.coinFly?.(sendBtn, balEl, cost);
    await refreshCoinDisplay();
    toast('Gift sent!', 'success');
    document.getElementById('giftSheet')?.classList.remove('open');
  }

  async function sendSelectedGift() {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    const items = GIFT_CATALOG[giftCategory] || GIFT_CATALOG.gift;
    const g = items[selectedGiftIdx] || items[0];
    if (!g) return;
    const unitCost = parseInt(g.cost, 10) || 10;
    const cost = unitCost * giftQty;
    const balance = await getCoins();
    if (balance < cost) {
      toast('Not enough coins — recharge first', 'warning');
      openTopupSheet();
      return;
    }
    const to = sheet.dataset.to || roomState?.hostName || 'Host';
    const receiverId = resolveGiftReceiverId(to);
    if (!receiverId) {
      toast('Wait for the host to connect, then try again', 'warning');
      return;
    }

    const finishOk = () => {
      const giftEvt = { from: displayName(currentUser()), to, emoji: g.emoji, amount: cost, qty: giftQty };
      const combo = window.SocialFX?.trackCombo?.(g.emoji, giftQty) || 1;
      window.SocialFX?.playGift?.(giftEvt, { combo });
      showWinBanner(giftEvt);
      showGiftFlyBanner(giftEvt);
      onGiftTeamProgress(cost);
      const sendBtn = document.getElementById('giftSendBtn');
      const balEl = document.getElementById('giftCoinsBal');
      if (sendBtn && balEl) window.SocialFX?.coinFly?.(sendBtn, balEl, cost);
      refreshCoinDisplay();
      toast('Gift sent!', 'success');
      sheet.classList.remove('open');
    };

    const tryApi = async (reason) => {
      try {
        await sendGiftViaApi(receiverId, cost, g.emoji, to, g.slug);
      } catch (e) {
        const msg = window.SocialUI?.friendlyMessage(e.message) || e.message || reason || 'Gift failed';
        if (/insufficient/i.test(msg)) {
          toast('Not enough coins — recharge first', 'warning');
          openTopupSheet();
        } else {
          toast(msg, 'error');
        }
      }
    };

    if (liveSocket?.connected) {
      liveSocket.emit(
        'live:gift',
        {
          channel: channelId(),
          to,
          toUserId: receiverId,
          emoji: g.emoji,
          giftSlug: g.slug,
          amount: cost,
          qty: giftQty,
        },
        async (res) => {
          if (res?.ok) {
            finishOk();
            return;
          }
          const msg = res?.message || '';
          if (/room not found|receiver not found/i.test(msg)) {
            await tryApi(msg);
            return;
          }
          if (/insufficient/i.test(msg)) {
            toast('Not enough coins — recharge first', 'warning');
            openTopupSheet();
            return;
          }
          if (msg) toast(msg, 'error');
          else await tryApi('Gift failed');
        }
      );
    } else {
      await tryApi('Gift failed');
    }
  }

  function bindGiftSheet() {
    const sheet = document.getElementById('giftSheet');
    if (!sheet || sheet.dataset.bound) return;
    sheet.dataset.bound = '1';
    document.getElementById('giftSheetClose')?.addEventListener('click', () => {
      sheet.classList.remove('open');
      closeLiveOverlays();
    });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) {
        sheet.classList.remove('open');
        closeLiveOverlays();
      }
    });
    document.getElementById('giftSendBtn')?.addEventListener('click', () => sendSelectedGift());
    document.getElementById('giftSurpriseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      sheet.classList.remove('open');
      openSurpriseShop();
    });
    document.getElementById('giftBalanceBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openTopupSheet();
    });
    document.querySelectorAll('.gift-sheet-tabs button[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gift-sheet-tabs button[data-cat]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        giftCategory = btn.dataset.cat || 'gift';
        selectedGiftIdx = 0;
        renderGiftGrid();
      });
    });
    document.querySelectorAll('.gift-qty-btns button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gift-qty-btns button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        giftQty = parseInt(btn.dataset.qty, 10) || 1;
        updateGiftMeta();
      });
    });
  }

  function ensureChatTabShowsMessages() {
    if (chatTab === 'room') {
      chatTab = 'all';
      document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === 'all');
      });
    }
  }

  function sendChat(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const me = currentUser();
    const lvlInfo = window.SocialFX ? SocialFX.getUserLevel(me?.id) : { level: 2 };
    const scope = chatRegionFilter === 'broadcast' ? 'broadcast' : chatRegionFilter;
    const optimistic = {
      id: 'local-' + Date.now(),
      type: 'chat',
      user: displayName(me),
      userId: me?.id,
      lvl: lvlInfo.level,
      text: t,
      at: Date.now(),
      scope,
      broadcast: chatRegionFilter === 'broadcast',
      pending: !liveSocket?.connected,
    };
    rememberChatMessage(optimistic);
    ensureChatTabShowsMessages();
    renderChatFeed();
    updateCharCount();
    if (!liveSocket?.connected) {
      toast('Not connected yet — message queued locally', 'warning');
      return;
    }
    liveSocket.emit(
      'live:chat',
      {
        channel: channelId(),
        text: t,
        lvl: lvlInfo.level,
        scope,
        broadcast: chatRegionFilter === 'broadcast',
      },
      (res) => {
        if (res?.ok === false) {
          chatMessages = chatMessages.filter((m) => m.id !== optimistic.id);
          renderChatFeed();
          toast(res?.message || 'Could not send comment', 'error');
        }
      }
    );
  }

  function bindChatTabs() {
    document.querySelectorAll('.party-chat-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab || 'all';
        document.querySelectorAll('.party-chat-tabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        chatTab = tab;
        closeChatPanelOnly();
        renderChatFromState();
        if (tab === 'chat') {
          document.getElementById('liveChatInput')?.focus();
        } else {
          document.getElementById('liveChatInput')?.blur();
        }
      });
    });
  }

  function bindCommonControls(pageType) {
    if (window.__apCommonBound) return;
    window.__apCommonBound = true;
    prepareLiveUiShell();
    bindRoomAvatars();
    document.getElementById('partyClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());
    document.getElementById('partyMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());

    document.getElementById('liveHostBarToggle')?.addEventListener('click', () => {
      const bar = document.getElementById('liveHostBar');
      if (!bar) return;
      bar.classList.toggle('is-collapsed');
      const collapsed = bar.classList.contains('is-collapsed');
      const btn = document.getElementById('liveHostBarToggle');
      if (btn) {
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.innerHTML = collapsed
          ? '<i class="fas fa-sliders-h"></i> Host controls'
          : '<i class="fas fa-chevron-up"></i> Hide controls';
      }
    });

    document.getElementById('partyBtnTools')?.addEventListener('click', () => {
      const sheet = document.getElementById('partyToolsSheet');
      if (!sheet) return;
      closeLiveOverlays('tools');
      sheet.classList.add('open');
      syncLiveOverlayClass();
      clearMessageBadge();
    });
    document.getElementById('partyToolsClose')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      closeLiveOverlays();
    });
    document.getElementById('partyToolsSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyToolsSheet') {
        e.target.classList.remove('open');
        closeLiveOverlays();
      }
    });

    document.getElementById('partyBtnGift')?.addEventListener('click', () => openGiftSheet());
    document.getElementById('liveBtnGift')?.addEventListener('click', () => openGiftSheet());

    const toggleFollow = async () => {
      const hostName = roomState?.hostName || 'Host';
      const hostId = roomState?.hostId || hostName;
      const wasFollowing = followed;
      if (window.SocialInteractions?.toggleFollow) {
        followed = await SocialInteractions.toggleFollow(hostId, hostName);
      } else {
        followed = !followed;
      }
      const btn = document.getElementById('partyBtnFollow');
      const hbtn = document.getElementById('partyHostFollow');
      const label = followed ? 'Following ✓' : 'Follow +';
      if (btn) {
        btn.textContent = label;
        btn.classList.toggle('is-following', followed);
      }
      if (hbtn) hbtn.textContent = followed ? '✓' : '+';
      if (followed && !wasFollowing) {
        window.SocialFX?.showFollowBurst?.(hbtn || btn);
      }
      toast(
        followed ? `You're now following ${hostName}` : `Unfollowed ${hostName}`,
        followed ? 'success' : 'info'
      );
    };
    document.getElementById('partyBtnFollow')?.addEventListener('click', toggleFollow);
    document.getElementById('partyHostFollow')?.addEventListener('click', toggleFollow);
    document.getElementById('liveBtnFollow')?.addEventListener('click', toggleFollow);

    document.getElementById('liveBtnMic')?.addEventListener('click', () => handleMicButton());

    document.querySelectorAll('.ap-tool-msg').forEach((link) => {
      link.addEventListener('click', clearMessageBadge);
    });

    document.getElementById('partyBtnSound')?.addEventListener('click', () => {
      soundOn = !soundOn;
      remoteUsers.forEach((user) => {
        if (user.audioTrack) {
          if (soundOn) user.audioTrack.play();
          else user.audioTrack.stop();
        }
      });
      toast(soundOn ? 'Sound on' : 'Sound muted');
      const btn = document.getElementById('partyBtnSound');
      if (btn) {
        const ico = btn.querySelector('i');
        if (ico) ico.className = soundOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        btn.classList.toggle('is-muted', !soundOn);
      }
    });

    document.getElementById('partyBtnShare')?.addEventListener('click', () => shareRoomLink());
    document.getElementById('partyBtnJoinSeat')?.addEventListener('click', () => requestSeatJoin());
    document.getElementById('partyInvitePill')?.addEventListener('click', (e) => {
      e.preventDefault();
      shareRoomLink();
    });
    document.getElementById('apBtnChatBubble')?.addEventListener('click', () => focusChatCompose());

    document.getElementById('partyRuleBtn')?.addEventListener('click', openRulesModal);
    document.getElementById('partyBtnGiftCollection')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      openGiftSheet();
    });
    document.getElementById('partyBtnGiftTools')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      openGiftSheet();
    });
    document.getElementById('partyBtnGiftWish')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      const host = roomState?.hostName || 'Host';
      sendChat(`🌟 Gift wish: I hope @${host} gets amazing gifts today!`);
      toast('Gift wish sent to chat', 'success');
    });
    document.getElementById('partyBtnEffects')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      if (isLiveRoomPage() && isHost() && broadcastMode !== 'audio') {
        openVideoFilterSheet();
        return;
      }
      focusChatCompose();
    });
    document.getElementById('partyBtnMinimize')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      minimizeLiveRoom();
    });
    document.getElementById('partyBtnReport')?.addEventListener('click', async () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      if (liveSocket?.connected) {
        liveSocket.emit('live:chat', {
          channel: channelId(),
          type: 'system',
          text: `Report filed for room ${channelId().slice(0, 8)} — moderators notified`,
        });
      }
      toast('Report submitted. Our team will review.', 'success');
    });

    const chatSend = document.getElementById('liveChatSend');
    const chatInput = document.getElementById('liveChatInput');
    chatSend?.addEventListener('click', () => {
      sendChat(chatInput?.value);
      if (chatInput) chatInput.value = '';
      updateCharCount();
    });
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChat(chatInput.value);
        chatInput.value = '';
        updateCharCount();
      }
    });
    chatInput?.addEventListener('input', updateCharCount);
    chatInput?.addEventListener('focus', () => {
      if (chatTab === 'room') {
        ensureChatTabShowsMessages();
        renderChatFeed();
      }
    });
    document.querySelector('.party-chat-zone')?.addEventListener('click', () => {
      document.getElementById('liveChatInput')?.focus();
    });
    document.querySelector('.party-chat-feed')?.addEventListener('click', () => {
      document.getElementById('liveChatInput')?.focus();
    });

    bindChatTabs();
    bindGiftSheet();
    bindImmersiveToolLinks();
    bindEmojiPicker();
    setupKeyboardOffset();
    syncToolBadges();

    window.SocialFX?.init?.();
    window.SocialFX?.bindDoubleTapLike?.(document.getElementById('liveRemoteHost'));
    window.SocialFX?.bindDoubleTapLike?.(document.getElementById('liveLocalHost'));
    window.SocialFX?.bindDoubleTapLike?.(document.querySelector('.party-room'));

    setInterval(() => {
      chestSec = Math.max(0, chestSec - 1);
      const m = Math.floor(chestSec / 60);
      const s = chestSec % 60;
      const chestEl = document.getElementById('partyChestTimer');
      if (chestEl) chestEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      if (chestSec === 0) {
        window.SocialFX?.chestReward?.();
        chestSec = 294;
      }
      tickPkTimer();
    }, 1000);
  }

  async function exitRoom() {
    window.__apLeavingRoom = true;
    minimizingRoom = false;
    hideApLoader();
    setLiveStatus('', null);
    if (!window.__apLiveSessionExitInProgress) {
      window.LiveSession?.forceCleanup?.();
    }
    try {
      sessionStorage.removeItem('ap_live_pip_session');
      clearDurableLiveSession();
    } catch (_e) {}
    await stopAgora({ skipEndRoom: hostEndingIntentionally });
    leaveSocket();
    const dest = '/explore.html?app=1';
    location.replace(dest);
  }

  async function endRoomOrExit() {
    hideApLoader();
    if (!isHost()) {
      await exitRoom();
      return;
    }
    const page = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';
    const ok = window.confirm(`End this ${page} for everyone now?`);
    if (!ok) return;
    hostEndingIntentionally = true;
    if (liveSocket?.connected) {
      const ended = await new Promise((resolve) => {
        liveSocket.emit('live:end', { channel: channelId() }, (res) => {
          if (!res?.ok) {
            toast(res?.message || `Could not end ${page}`, 'error');
            hostEndingIntentionally = false;
            resolve(false);
            return;
          }
          resolve(true);
        });
      });
      if (!ended) return;
    }
    await exitRoom();
  }

  function injectModals() {
    if (!document.getElementById('apRulesModal')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay" id="apRulesModal">
          <div class="ap-rules-modal">
            <h2>Party rules</h2>
            <p><strong>Party Hosts</strong> must keep the room active, welcome guests, and follow community guidelines.</p>
            <ul>
              <li>No vulgar, violent, or illegal content</li>
              <li>Respect all guests — harassment is not tolerated</li>
              <li>Gifts &amp; coins are final once sent</li>
              <li>AP Services moderators monitor rooms 24/7</li>
            </ul>
            <p><strong>Crown Seat Users</strong> should engage positively and help maintain a friendly atmosphere.</p>
            <button type="button" class="ap-rules-ok" id="apRulesOk">I see.</button>
          </div>
        </div>`
      );
      document.getElementById('apRulesOk')?.addEventListener('click', () => {
        closeRulesModal();
        try { localStorage.setItem('ap_party_rules_seen', '1'); } catch (_e) {}
      });
      document.querySelector('#apRulesModal .ap-rules-modal')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    if (!document.getElementById('apSeatSheet')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay align-bottom" id="apSeatSheet">
          <div class="ap-seat-sheet-panel">
            <div class="ap-seat-badge">👑</div>
            <h3 id="apSeatTitle">Crown seat</h3>
            <p class="ap-seat-desc" id="apSeatDesc">Hosts assign speakers to crown seats. Tap a join request to approve a guest.</p>
            <div class="ap-seat-steps">
              <div class="ap-seat-step"><span>1</span> Guest requests mic</div>
              <div class="ap-seat-step"><span>2</span> Host accepts request</div>
              <div class="ap-seat-step"><span>3</span> Guest appears on seat</div>
            </div>
            <button type="button" class="ap-seat-action" id="apSeatCloseBtn">Got it</button>
          </div>
        </div>`
      );
      document.getElementById('apSeatSheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'apSeatSheet') e.target.classList.remove('open');
      });
      document.getElementById('apSeatCloseBtn')?.addEventListener('click', () => {
        document.getElementById('apSeatSheet')?.classList.remove('open');
      });
    }
    if (!document.getElementById('apViewerOnboard')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay align-bottom" id="apViewerOnboard">
          <div class="ap-seat-sheet-panel ap-viewer-onboard">
            <div class="ap-onboard-steps" id="apOnboardSteps">
              <div class="ap-onboard-step is-active" data-step="1">
                <h3>Welcome to the party</h3>
                <p>Listen in as a guest. You can chat, send gifts, and request a mic seat when ready.</p>
              </div>
              <div class="ap-onboard-step" data-step="2">
                <h3>Request a mic</h3>
                <p>Tap the mic button to ask the host to speak. The host approves join requests — you are never auto-assigned as host.</p>
              </div>
              <div class="ap-onboard-step" data-step="3">
                <h3>Guardian rankings</h3>
                <p>Rankings show verified supporters. Verified badges mean the user completed identity checks on AP Services.</p>
                <a href="/vip.html?tab=guardian&app=1" class="ap-seat-action" style="display:inline-flex;margin-top:10px;text-decoration:none">View Guardian rankings</a>
              </div>
            </div>
            <div class="ap-onboard-dots" id="apOnboardDots"><span class="active"></span><span></span><span></span></div>
            <button type="button" class="ap-seat-action" id="apOnboardNext">Next</button>
          </div>
        </div>`
      );
      let onboardStep = 1;
      document.getElementById('apOnboardNext')?.addEventListener('click', () => {
        if (onboardStep < 3) {
          onboardStep += 1;
          document.querySelectorAll('#apOnboardSteps .ap-onboard-step').forEach((el) => {
            el.classList.toggle('is-active', Number(el.dataset.step) === onboardStep);
          });
          document.querySelectorAll('#apOnboardDots span').forEach((dot, i) => {
            dot.classList.toggle('active', i + 1 === onboardStep);
          });
          const btn = document.getElementById('apOnboardNext');
          if (btn && onboardStep === 3) btn.textContent = 'Start listening';
          return;
        }
        document.getElementById('apViewerOnboard')?.classList.remove('open');
        try {
          sessionStorage.setItem('ap_party_welcome_' + channelId(), '1');
        } catch (_e) {}
      });
      document.getElementById('apViewerOnboard')?.addEventListener('click', (e) => {
        if (e.target.id === 'apViewerOnboard') e.target.classList.remove('open');
      });
    }
    if (!document.getElementById('apProfileSheet')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay align-bottom" id="apProfileSheet">
          <div class="ap-profile-sheet-panel">
            <div class="ap-profile-avatar-wrap">
              <img id="apProfileAvatar" src="" alt="">
              <span class="ap-profile-po-badge">PO</span>
            </div>
            <div class="ap-profile-head">
              <div class="info">
                <h3 id="apProfileName">User</h3>
                <div class="ap-profile-badges">
                  <span>🇮🇳</span><span id="apProfileLvl">Lv.18</span><span>🎵 1</span><span>💎 3</span>
                </div>
                <p class="ap-profile-id-row" id="apProfileId">ID: — <button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button></p>
              </div>
            </div>
            <div class="ap-profile-cards">
              <div class="ap-profile-card ap-profile-card--contrib">
                <h4>Contribution List <i class="fas fa-chevron-right"></i></h4>
                <div class="ap-profile-placeholder-row" id="apProfileContrib"></div>
              </div>
              <div class="ap-profile-card ap-profile-card--fan">
                <h4>Fan Club <i class="fas fa-chevron-right"></i></h4>
                <div class="ap-profile-placeholder-row" id="apProfileFan"></div>
              </div>
            </div>
            <div class="ap-profile-section">
              <h4>Gift Gallery <span>Lit: 0/12</span></h4>
              <div class="ap-profile-placeholder-row" id="apProfileGifts">
                <span>+</span><span>+</span><span>+</span>
              </div>
            </div>
            <div class="ap-profile-section">
              <h4>Medal <span>Number of medals: 0</span></h4>
              <div class="ap-profile-placeholder-row hex" id="apProfileMedals">
                <span>+</span><span>+</span><span>+</span>
              </div>
            </div>
            <button type="button" class="ap-profile-gift-btn" id="apProfileGiftBtn">🎁 Give gifts</button>
            <div class="ap-profile-actions">
              <button type="button" id="apProfileAddFriend"><i class="fas fa-user-plus"></i> Add Friend</button>
              <button type="button" id="apProfileMention"><i class="fas fa-at"></i> Mention</button>
              <button type="button" id="apProfileMessage"><i class="far fa-envelope"></i> Message</button>
              <button type="button" id="apProfileMore"><i class="fas fa-ellipsis-h"></i> More</button>
            </div>
          </div>
        </div>`
      );
      document.getElementById('apProfileSheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'apProfileSheet') e.target.classList.remove('open');
      });
      const profilePanel = document.querySelector('#apProfileSheet .ap-profile-sheet-panel');
      profilePanel?.addEventListener('click', (e) => e.stopPropagation());
      document.getElementById('apProfileGiftBtn')?.addEventListener('click', () => {
        const { name, userId } = activeProfileUser;
        document.getElementById('apProfileSheet')?.classList.remove('open');
        openGiftSheet(name, userId);
      });
      bindProfileSheetActions();
    }
  }

  function bindProfileSheetActions() {
    if (profileSheetActionsBound) return;
    profileSheetActionsBound = true;

    document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
      const id = activeProfileUser.userId;
      if (id && navigator.clipboard) navigator.clipboard.writeText(id).catch(() => {});
      else toast('User ID unavailable', 'warning');
    });

    document.getElementById('apProfileAddFriend')?.addEventListener('click', async () => {
      const { name, userId } = activeProfileUser;
      if (!userId) {
        toast('Follow unavailable for this user', 'warning');
        return;
      }
      if (window.SocialInteractions?.toggleFriend) {
        const now = await SocialInteractions.toggleFriend(userId, name);
        const btn = document.getElementById('apProfileAddFriend');
        if (btn) {
          btn.innerHTML = now
            ? '<i class="fas fa-user-minus"></i> Remove Friend'
            : '<i class="fas fa-user-plus"></i> Add Friend';
        }
        toast(now ? `You're now friends with ${name}` : `Removed ${name} from friends`, now ? 'success' : 'info');
        return;
      }
      toast('Follow feature loading…', 'info');
    });

    document.getElementById('apProfileMention')?.addEventListener('click', () => {
      const input =
        document.getElementById('liveChatInput') ||
        document.getElementById('partyChatInput') ||
        document.querySelector('.party-chat-input input, .live-chat-input input');
      const tag = '@' + String(activeProfileUser.name || 'User').replace(/\s+/g, '');
      if (input) {
        input.value = (input.value ? input.value + ' ' : '') + tag + ' ';
        input.focus();
      } else {
        sendChat(tag);
      }
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });

    document.getElementById('apProfileMessage')?.addEventListener('click', () => {
      const id = activeProfileUser.userId;
      document.getElementById('apProfileSheet')?.classList.remove('open');
      if (id) {
        location.href = `/chat.html?id=${encodeURIComponent(id)}&app=1`;
        return;
      }
      toast('Message unavailable — user ID missing', 'warning');
    });

    document.getElementById('apProfileMore')?.addEventListener('click', () => {
      const name = activeProfileUser.name || 'User';
      const uid = activeProfileUser.userId;
      const panel = document.querySelector('#apProfileSheet .ap-profile-sheet-panel');
      if (!panel) return;
      let menu = panel.querySelector('.ap-profile-more-menu');
      if (menu) {
        menu.remove();
        return;
      }
      menu = document.createElement('div');
      menu.className = 'ap-profile-more-menu';
      menu.innerHTML = `
        <button type="button" data-act="report">Report user</button>
        <button type="button" data-act="block">Block user</button>
        <button type="button" data-act="copy">Copy nickname</button>
        ${uid ? '<button type="button" data-act="chat">Open chat</button>' : ''}`;
      panel.appendChild(menu);
      menu.querySelector('[data-act="report"]')?.addEventListener('click', () => {
        toast('Report submitted — our team will review', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="block"]')?.addEventListener('click', async () => {
        menu.remove();
        if (!uid) {
          toast('Block unavailable — user ID missing', 'warning');
          return;
        }
        if (window.SocialInteractions?.toggleBlock) {
          const blocked = await SocialInteractions.toggleBlock(uid, name);
          if (blocked) document.getElementById('apProfileSheet')?.classList.remove('open');
          return;
        }
        toast('Block feature loading…', 'warning');
      });
      menu.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(name).catch(() => {});
        toast('Nickname copied', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="chat"]')?.addEventListener('click', () => {
        menu.remove();
        document.getElementById('apProfileSheet')?.classList.remove('open');
        location.href = `/chat.html?id=${encodeURIComponent(uid)}&app=1`;
      });
    });
  }

  function maybeShowViewerOnboarding() {
    if (isHost() || !isPartyRoomPage() || !roomJoinCompleted) return;
    const key = 'ap_party_welcome_' + channelId();
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch (_e) {}
    document.getElementById('apViewerOnboard')?.classList.add('open');
  }

  function bindScreenCaptureProtection() {
    if (!window.ReactNativeWebView) return;
    const enable = isLiveRoomPage() || isPartyRoomPage();
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'screen_capture', enable }));
    } catch (_e) {}
  }

  function openRulesModal() {
    const modal = document.getElementById('apRulesModal');
    if (!modal) return;
    modal.classList.add('open');
  }

  function closeRulesModal() {
    document.getElementById('apRulesModal')?.classList.remove('open');
  }

  function maybeShowPartyRules() {
    if (!roomJoinCompleted || !liveSocket?.connected) return;
    try {
      if (localStorage.getItem('ap_party_rules_seen') === '1') return;
    } catch (_e) {}
    if (partyRulesTimer) clearTimeout(partyRulesTimer);
    partyRulesTimer = setTimeout(() => {
      partyRulesTimer = null;
      if (roomJoinCompleted && liveSocket?.connected) openRulesModal();
    }, 1200);
  }

  function openSeatSheet(seatNum) {
    const title = document.getElementById('apSeatTitle');
    const desc = document.getElementById('apSeatDesc');
    if (title) title.textContent = seatNum ? `Crown seat ${seatNum}` : 'Crown seat';
    if (desc) {
      desc.textContent = isHost()
        ? 'Approve a join request to assign this crown seat to a guest speaker.'
        : 'This seat is for approved speakers. Request the mic and wait for the host to accept.';
    }
    document.getElementById('apSeatSheet')?.classList.add('open');
  }

  function resolveLiveProfilePic(name, userId) {
    const uid = String(userId || '');
    if (uid && roomState?.hostId && uid === String(roomState.hostId)) {
      return roomState.hostProfilePic || null;
    }
    const seat = (roomState?.seats || []).find((s) =>
      (uid && String(s.userId) === uid) || (name && s.name === name)
    );
    if (seat?.profilePic || seat?.profile_pic) return seat.profilePic || seat.profile_pic;
    return liveProfilePic(uid, null);
  }

  async function openProfileSheet(name, userId) {
    const n = name || 'User';
    const resolvedId =
      userId ||
      (n === roomState?.hostName ? roomState?.hostId : null) ||
      (roomState?.seats || []).find((s) => s.name === n)?.userId ||
      '';
    activeProfileUser = { name: n, userId: resolvedId ? String(resolvedId) : '' };

    const sheet = document.getElementById('apProfileSheet');
    if (sheet) {
      if (activeProfileUser.userId) sheet.dataset.userId = activeProfileUser.userId;
      else delete sheet.dataset.userId;
    }

    const img = document.getElementById('apProfileAvatar');
    const nm = document.getElementById('apProfileName');
    const idEl = document.getElementById('apProfileId');
    const lvl = document.getElementById('apProfileLvl');
    const initialPic = resolveLiveProfilePic(n, resolvedId);
    if (img) {
      img.src = avatarUrl(n, initialPic);
      img.dataset.userId = resolvedId || '';
    }
    if (nm) nm.textContent = n;
    const idDisplay = activeProfileUser.userId
      ? activeProfileUser.userId.slice(0, 12)
      : String(n).split('').reduce((a, c) => a + c.charCodeAt(0), 0).toString().slice(0, 8);
    if (idEl) {
      idEl.innerHTML = `ID: ${idDisplay} <button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button>`;
      document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
        const full = activeProfileUser.userId || idDisplay;
        if (navigator.clipboard) navigator.clipboard.writeText(full).catch(() => {});
        toast('User ID copied', 'success');
      });
    }
    if (lvl) lvl.textContent = 'Lv.' + (5 + (idDisplay.length % 20));
    const contrib = document.getElementById('apProfileContrib');
    if (contrib) {
      contrib.innerHTML = [n, roomState?.hostName || 'Host']
        .filter(Boolean)
        .slice(0, 3)
        .map((x) => `<img src="${avatarUrl(x, resolveLiveProfilePic(x, x === roomState?.hostName ? roomState?.hostId : null))}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`)
        .join('');
    }
    sheet?.querySelector('.ap-profile-more-menu')?.remove();
    document.getElementById('apProfileSheet')?.classList.add('open');

    if (resolvedId && window.API?.get) {
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => {});
        const res = await API.get('/social/creators/' + encodeURIComponent(resolvedId) + '/engagement');
        const data = res?.data;
        if (data) {
          const pic = data.profilePic || data.profile_pic;
          const displayName = data.displayName || n;
          if (nm) nm.textContent = displayName;
          if (pic && img) img.src = avatarUrl(displayName, pic);
        }
      } catch (_e) { /* keep seat/host avatar */ }
    }
  }

  function injectGiftSheet() {
    if (document.getElementById('giftSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="gift-sheet" id="giftSheet">
        <div class="gift-sheet-panel">
          <div class="gift-send-header">
            <span class="gift-send-label">Send</span>
            <label class="gift-all-toggle"><span>ALL</span><input type="checkbox" id="giftSendAll"></label>
          </div>
          <div class="gift-recipients" id="giftRecipients"></div>
          <div class="gift-rtp-banner" id="giftRtpBanner"><span>Select a gift to see details</span></div>
          <div class="gift-sheet-tabs" id="giftSheetTabs">
            <button type="button" data-cat="new">New</button>
            <button type="button" data-cat="gift" class="active">Gift</button>
            <button type="button" data-cat="lucky">Lucky</button>
            <button type="button" data-cat="island">Interaction</button>
            <button type="button" data-cat="fan">Fan Club</button>
            <button type="button" data-cat="privilege">Privi</button>
            <button type="button" class="gift-tab-bell" aria-label="Notifications"><i class="fas fa-bell"></i></button>
          </div>
          <div class="gift-gallery-hint">
            <span>Still need <strong id="giftLitNeed">26</strong> to light up 🎺</span>
            <button type="button" id="giftGalleryBtn">Gallery</button>
          </div>
          <button type="button" class="gift-balance-btn" id="giftBalanceBtn">🪙 <span id="giftCoinsBal">0</span> &gt;</button>
          <div class="gift-grid" id="giftGrid"></div>
          <div class="gift-qty-row">
            <div class="gift-qty-btns">
              <button type="button" data-qty="1" class="active">1</button>
              <button type="button" data-qty="10">10</button>
              <button type="button" data-qty="50">50</button>
              <button type="button" data-qty="100">100</button>
            </div>
            <button type="button" class="gift-send-btn" id="giftSendBtn">Send</button>
          </div>
        </div>
      </div>`
    );
    const balBtn = document.getElementById('giftBalanceBtn');
    if (balBtn) balBtn.innerHTML = `${COIN_EMOJI} <span id="giftCoinsBal">0</span> &gt;`;
    document.getElementById('giftSendAll')?.addEventListener('change', (e) => {
      const row = document.getElementById('giftRecipients');
      if (!row) return;
      if (e.target.checked) {
        row.querySelectorAll('.gift-recipient').forEach((b) => b.classList.add('is-active'));
      } else {
        row.querySelectorAll('.gift-recipient').forEach((b, i) => b.classList.toggle('is-active', i === 0));
      }
    });
    document.getElementById('giftGalleryBtn')?.addEventListener('click', () => openSurpriseShop());
    giftQty = 1;
    renderGiftGrid();
    refreshCoinDisplay();
    updateGiftMeta();
  }

  function postWelcomeMessage() {
    rememberChatMessage({
      type: 'system',
      text: 'Welcome to AP Services LIVE! Be respectful — admins monitor 24/7. Give a double-tap like to support the host!',
    });
    renderChatFeed();
  }

  function ensureHostChannelInUrl() {
    if (!isHost() || qs('channel') || qs('room')) return;
    const user = currentUser();
    if (!user) return;
    const page = document.body.dataset.livePage;
    const base = String(user.id || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10);
    const prefix = page === 'party-room' ? 'party' : 'live';
    const ch = prefix + '-' + base + '-' + Date.now().toString(36).slice(-6);
    const params = new URLSearchParams(location.search);
    params.set('host', '1');
    params.set('channel', ch);
    if (!params.get('mode') && page === 'live-room') params.set('mode', broadcastMode || 'video');
    history.replaceState(null, '', location.pathname + '?' + params.toString());
    forensicEvent('CHANNEL_GENERATED', { channel: ch, reason: 'missing_channel_param' });
  }

  async function initPartyRoom() {
    if (partyRoomInitStarted) return;
    partyRoomInitStarted = true;
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    await refreshLiveUserProfile();
    const user = currentUser();
    if (!user) {
      partyRoomInitStarted = false;
      toast('Please log in');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }
    initForensicLog();
    restoreChannelFromDurableSession();
    ensureHostChannelInUrl();
    const restored = restoreJoinMeta();
    if (restored && !lastJoinMeta) lastJoinMeta = restored;

    bindCommonControls('party');
    bindHostControls('party');
    setApLoaderStep(1);
    setLiveStatus('Joining room…', null);
    const joinGuard = setTimeout(() => {
      if (!roomJoinCompleted) {
        hideApLoader();
        setLiveStatus('Connection timed out — reload and try again', false);
      }
    }, 28000);
    try {
      await connectSocket('party');
    } catch (e) {
      console.error('[live] party room join failed', e);
      partyRoomInitStarted = false;
      hideApLoader();
      setLiveStatus(e?.message || 'Could not connect to party room', false);
      return;
    } finally {
      clearTimeout(joinGuard);
    }
    applyRoleUiAfterJoin();
    if (!roomJoinCompleted) {
      partyRoomInitStarted = false;
      hideApLoader();
      setLiveStatus('Room join failed — sign in again and retry', false);
      return;
    }
    partyVoiceSkipped = false;
    if (isHost()) {
      await resumeHostBroadcastIfNeeded();
    } else {
      try {
        await startAgora('party');
      } catch (e) {
        console.error('[live] party viewer Agora failed', e);
        onRoomReady();
        setLiveStatus(e?.message || 'Could not connect to party audio', false);
      }
    }
    postWelcomeMessage();
    maybeShowPartyRules();
    maybeShowViewerOnboarding();
    bindScreenCaptureProtection();
    bindMediaResumeOnVisibility();
    bindPartyBackGuard();
  }

  async function rejoinRoomOnSocket(type) {
    if (!liveSocket?.connected) return connectSocket(type);
    const user = currentUser();
    const ch = channelId();
    const hostFlag = lastJoinMeta?.isHost || clientClaimsHost();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Room join timeout')), 15000);
      liveSocket.emit(
        'live:join',
        {
          channel: ch,
          type: type === 'live' ? 'live' : 'party',
          displayName: displayName(user),
          isHost: hostFlag,
        },
        (res) => {
          clearTimeout(timer);
          if (res?.ok) {
            roomState = res.state || { channel: ch, viewers: 1 };
            roomJoinCompleted = true;
            const me = currentUser();
            const serverIsHost =
              Boolean(me?.id && roomState?.hostId && String(roomState.hostId) === String(me.id));
            lastJoinMeta = {
              channel: ch,
              type: type === 'live' ? 'live' : 'party',
              displayName: displayName(user),
              isHost: serverIsHost,
            };
            persistJoinMeta(lastJoinMeta);
            startHeartbeat();
            renderRoomState();
            resolve();
          } else {
            reject(new Error(res?.message || 'live:join failed'));
          }
        }
      );
    });
  }

  let feedRoomsCache = null;
  let feedRoomsCacheAt = 0;

  async function fetchLiveFeedItems() {
    const startChannel = (qs('channel') || qs('room') || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    const now = Date.now();
    if (feedRoomsCache && now - feedRoomsCacheAt < 30000) {
      const items = [...feedRoomsCache];
      if (startChannel) {
        const idx = items.findIndex((x) => x.channel === startChannel);
        if (idx > 0) {
          const [cur] = items.splice(idx, 1);
          items.unshift(cur);
        } else if (idx < 0) {
          items.unshift({
            channel: startChannel,
            hostName: 'Live host',
            viewers: 1,
            mode: (qs('mode') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video',
          });
        }
      }
      return items.slice(0, 24);
    }
    let items = [];
    try {
      const res = await API.get('/live/rooms?type=live&limit=24');
      const rows = Array.isArray(res?.data) ? res.data : [];
      items = rows.map((r) => ({
        channel: r.channel,
        hostName: r.hostName || 'Host',
        hostId: r.hostId,
        viewers: r.viewers || 0,
        mode: String(r.channel || '').includes('audio') ? 'audio' : 'video',
      }));
    } catch (_e) {
      console.warn('[live] feed API', _e);
    }
    if (startChannel) {
      const idx = items.findIndex((x) => x.channel === startChannel);
      if (idx > 0) {
        const [cur] = items.splice(idx, 1);
        items.unshift(cur);
      } else if (idx < 0) {
        items.unshift({
          channel: startChannel,
          hostName: 'Live host',
          viewers: 1,
          mode: (qs('mode') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video',
        });
      }
    }
    feedRoomsCache = items.slice(0, 24);
    feedRoomsCacheAt = Date.now();
    return feedRoomsCache;
  }

  function feedInteractionBlocked() {
    return Boolean(
      document.querySelector(
        '#apProfileSheet.open, #apGiftSheet.open, #apTopupSheet.open, #apSeatSheet.open, .ap-gift-sheet.open'
      ) || document.body.classList.contains('ap-sheet-open')
    );
  }

  async function switchToFeedRoom(index) {
    if (feedSwitching || !feedItems[index]) return;
    if (index === activeFeedIndex && roomState) return;
    feedSwitching = true;
    activeFeedIndex = index;
    const item = feedItems[index];
    activeChannelOverride = item.channel;
    activeFeedHostId = item.hostId ? String(item.hostId) : '';
    broadcastMode = item.mode || 'video';

    document.querySelectorAll('.live-feed-slide').forEach((s, i) => {
      s.classList.toggle('is-active', i === index);
    });

    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop) {
      backdrop.style.backgroundImage = `url('${themeCover(broadcastMode === 'audio' ? 'audio' : 'live', item.hostName)}')`;
    }

    document.getElementById('liveHostName').textContent = item.hostName.slice(0, 18);
    document.getElementById('liveHostAvatar').src = avatarUrl(item.hostName);
    document.getElementById('liveViewerCount').textContent = String(item.viewers || 0);
    updateModeBadge(broadcastMode, false);

    roomState = null;
    chatMessages = [];
    guestPublishAttempted = false;
    setLiveStreamVisible(false);
    setLiveStatus('Switching room…', null);

    if (liveSocket?.connected) {
      liveSocket.emit('live:leave');
    }
    roomJoinCompleted = false;
    await stopAgora({ skipEndRoom: true });
    try {
      await rejoinRoomOnSocket('live');
    } catch (e) {
      console.error('[live] feed room join failed', e);
      feedSwitching = false;
      setLiveStatus(e?.message || 'Could not join room', false);
      return;
    }
    applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', item.hostName);
    await startAgora('live');

    try {
      history.replaceState(
        null,
        '',
        '?channel=' + encodeURIComponent(item.channel) + '&feed=1&app=1'
      );
    } catch (_e) {}

    feedSwitching = false;
  }

  async function initLiveFeedViewer() {
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    const user = currentUser();
    if (!user) {
      toast('Please log in to watch live');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }

    initBroadcastMode();
    bindCommonControls('live');
    feedItems = await fetchLiveFeedItems();
    if (!feedItems.length) {
      toast('No live streams right now');
      setTimeout(() => (location.href = '/explore.html?app=1'), 900);
      return;
    }

    document.body.classList.add('live-feed-mode');
    const scroll = document.getElementById('liveFeedScroll');
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (!scroll) return;

    scroll.innerHTML = feedItems
      .map(
        (item, i) => `
      <section class="live-feed-slide${i === 0 ? ' is-active' : ''}" data-index="${i}"
        style="background-image:url('${themeCover(item.mode === 'audio' ? 'audio' : 'live', item.hostName)}')">
      </section>`
      )
      .join('');
    scroll.removeAttribute('aria-hidden');
    if (backdrop) {
      backdrop.removeAttribute('aria-hidden');
      backdrop.style.backgroundImage = scroll.querySelector('.live-feed-slide')?.style.backgroundImage || '';
    }

    if (feedObserver) feedObserver.disconnect();
    feedObserver = new IntersectionObserver(
      (entries) => {
        if (feedInteractionBlocked() || feedSwitching) return;
        entries.forEach((en) => {
          if (en.isIntersecting && en.intersectionRatio >= 0.55) {
            const i = parseInt(en.target.dataset.index, 10);
            if (!Number.isNaN(i) && i !== activeFeedIndex) switchToFeedRoom(i);
          }
        });
      },
      { root: scroll, threshold: [0.55, 0.75] }
    );
    scroll.querySelectorAll('.live-feed-slide').forEach((s) => feedObserver.observe(s));

    setTimeout(() => document.getElementById('liveSwipeHint')?.classList.add('is-hidden'), 7000);

    await switchToFeedRoom(0);

    window.addEventListener('beforeunload', () => {
      if (window.__apLeavingRoom || window.LiveSession?.shouldKeepPlayback?.()) return;
      stopAgora({ skipEndRoom: true });
      leaveSocket();
    });
  }

  async function initLiveRoom() {
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    await refreshLiveUserProfile();
    const user = currentUser();
    if (!user) {
      toast('Please log in to watch or broadcast');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }

    if (isFeedMode()) {
      await initLiveFeedViewer();
      return;
    }

    document.getElementById('liveSwipeHint')?.classList.add('is-hidden');

    initForensicLog();
    restoreChannelFromDurableSession();
    ensureHostChannelInUrl();
    const restored = restoreJoinMeta();
    if (restored && !lastJoinMeta) lastJoinMeta = restored;
    initBroadcastMode();
    bindCommonControls('live');
    bindHostControls('live');
    auditChannel('url', channelId());
    setApLoaderStep(1);
    setLiveStatus('Joining room…', null);
    const joinGuard = setTimeout(() => {
      if (!roomJoinCompleted) {
        hideApLoader();
        setLiveStatus('Connection timed out — reload and try again', false);
      }
    }, 28000);
    try {
      await connectSocket('live');
    } catch (e) {
      console.error('[live] live room join failed', e);
      hideApLoader();
      setLiveStatus(e?.message || 'Could not connect to live room', false);
      return;
    } finally {
      clearTimeout(joinGuard);
    }
    applyRoleUiAfterJoin();
    if (!roomJoinCompleted) {
      hideApLoader();
      setLiveStatus('Room join failed — sign in again and retry', false);
      return;
    }

    if (isHost() && broadcastMode === 'video') {
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
    } else if (!isHost()) {
      applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
    }
    if (broadcastMode === 'audio') {
      document.getElementById('liveRoomRoot')?.classList.add('is-audio-mode');
    }
    updateModeBadge(broadcastMode, false);

    partyVoiceSkipped = false;
    if (isHost()) {
      await resumeHostBroadcastIfNeeded();
    } else {
      try {
        await startAgora('live');
      } catch (e) {
        console.error('[live] viewer stream connect failed', e);
        onRoomReady();
        setLiveStatus(e?.message || 'Could not connect to stream', false);
      }
    }
    applyRoleUiAfterJoin();
    postWelcomeMessage();
    bindScreenCaptureProtection();
    bindMediaResumeOnVisibility();
    bindPartyBackGuard();
  }

  function initStreamerCenter() {
    const user = currentUser();
    const uidEl = document.getElementById('streamerUid');
    if (uidEl && user) {
      uidEl.textContent = 'ID:' + (String(user.id || user.email || '').slice(0, 12) || '76471242');
    }

    document.querySelectorAll('.streamer-pills button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.streamer-pills button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('streamerStartLive')?.addEventListener('click', () => {
      if (window.SocialShell?.openBroadcastPicker) SocialShell.openBroadcastPicker('live');
      else if (window.SocialShell?.goStartLiveBroadcast) SocialShell.goStartLiveBroadcast({ mode: 'video' });
      else location.href = '/live-room.html?host=1&mode=video&app=1';
    });

    document.getElementById('streamerStartParty')?.addEventListener('click', () => {
      if (window.SocialShell?.goStartParty) SocialShell.goStartParty();
      else location.href = '/party-room.html?host=1&app=1';
    });

    document.querySelector('.btn-upload')?.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = () => toast('Cover saved for next stream');
      inp.click();
    });
  }

  function initLuckyGifts() {
    const params = new URLSearchParams(location.search);
    const isMissions = params.get('tab') === 'missions';
    const rankSection = document.querySelector('.lucky-board');
    const rankFooter = document.querySelector('.lucky-footer');
    const subTabs = document.querySelector('.lucky-sub-tabs');
    const slider = document.querySelector('.lucky-gift-slider');
    document.querySelectorAll('.lucky-main-tabs a').forEach((a) => {
      a.classList.toggle('active', isMissions ? a.href.includes('missions') : !a.href.includes('missions'));
    });
    if (isMissions) {
      if (rankSection) rankSection.style.display = 'none';
      if (rankFooter) rankFooter.style.display = 'none';
      if (subTabs) subTabs.style.display = 'none';
      if (slider) {
        slider.innerHTML =
          '<div style="padding:20px 16px;color:#6b4f10"><h3 style="margin:0 0 10px">Daily missions</h3><ul style="margin:0;padding-left:18px;line-height:1.6;font-size:14px"><li>Send 3 lucky gifts in any live room</li><li>Watch a party for 10 minutes</li><li>Share a live stream with a friend</li></ul><p style="margin:14px 0 0;font-size:12px;color:#78350f">Complete missions during the event window to earn bonus coins.</p></div>';
      }
      return;
    }

    const track = document.getElementById('luckyGiftTrack');
    const slides = [
      { title: 'Dream Ship 300%', icons: '🚢 💎 🌟' },
      { title: 'Lucky gifts 100%', icons: '💜 👠 🔫 🔔 🍭' },
      { title: 'Activity gifts', icons: '🎁 ✨ 🎀' },
    ];
    let idx = 1;
    if (track) {
      track.innerHTML = slides
        .map(
          (s) => `<div class="lucky-gift-slide"><h4>${s.title}</h4><div class="lucky-gift-icons">${s.icons}</div></div>`
        )
        .join('');
      track.style.transform = `translateX(-${idx * 100}%)`;
      setInterval(() => {
        idx = (idx + 1) % slides.length;
        track.style.transform = `translateX(-${idx * 100}%)`;
      }, 4000);
    }

    const LUCKY_RANKS = [
      { rank: 1, name: 'Varsace 🐻', score: '25,682,396', coins: '1,800,000' },
      { rank: 2, name: 'Kuldeep 🎵', score: '18,420,100', coins: '900,000' },
      { rank: 3, name: 'Affy 🍒', score: '12,100,550', coins: '500,000' },
      { rank: 4, name: 'MAAAA', score: '8,200,000', coins: '200,000' },
    ];
    let luckyPeriod = '3day';

    function luckyClaimKey(period, rank) {
      return `ap_lucky_claimed_${period}_${rank}`;
    }

    function luckyClaimsForPeriod(period) {
      try {
        const raw = localStorage.getItem(`ap_lucky_claims_${period}`);
        return raw ? JSON.parse(raw) : {};
      } catch (_e) {
        return {};
      }
    }

    function markLuckyClaimed(period, rank) {
      const map = luckyClaimsForPeriod(period);
      map[String(rank)] = Date.now();
      try {
        localStorage.setItem(`ap_lucky_claims_${period}`, JSON.stringify(map));
      } catch (_e) {}
    }

    function renderLuckyRankList() {
      const list = document.getElementById('luckyRankList');
      if (!list) return;
      const claims = luckyClaimsForPeriod(luckyPeriod);
      list.innerHTML = LUCKY_RANKS.map((r) => {
        const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
        const claimed = Boolean(claims[String(r.rank)]);
        const btnLabel = claimed ? 'Claimed' : 'Receive';
        const btnDisabled = claimed ? ' disabled' : '';
        return `<div class="lucky-rank-row">
          <span class="rank-badge">${medal}</span>
          <img src="${avatarUrl(r.name)}" alt="">
          <div class="info"><div class="name">${r.name} 🇮🇳</div>
          <div class="scores"><span>🎉 ${r.score}</span><span>🪙 ${r.coins}</span></div></div>
          <button type="button" class="btn-receive${claimed ? ' is-claimed' : ''}" data-rank="${r.rank}" data-period="${luckyPeriod}"${btnDisabled}>${btnLabel}</button>
        </div>`;
      }).join('');
      list.querySelectorAll('.btn-receive:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
          const period = btn.dataset.period || luckyPeriod;
          const rank = btn.dataset.rank;
          if (luckyClaimsForPeriod(period)[String(rank)]) {
            toast('Already claimed for this ranking period');
            return;
          }
          markLuckyClaimed(period, rank);
          btn.textContent = 'Claimed';
          btn.disabled = true;
          btn.classList.add('is-claimed');
          toast('Reward claimed for rank ' + rank);
        });
      });
    }

    renderLuckyRankList();

    document.querySelectorAll('.lucky-sub-tabs button').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lucky-sub-tabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        luckyPeriod = idx === 0 ? 'daily' : '3day';
        renderLuckyRankList();
      });
    });

    let sec = 22 * 3600 + 11 * 60 + 55;
    const timerEl = document.getElementById('luckyTimer');
    setInterval(() => {
      if (sec > 0) sec--;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (timerEl) timerEl.textContent = [h, m, s].map((n) => String(n).padStart(2, '0')).join(' : ');
    }, 1000);

    document.getElementById('luckyRulesBtn')?.addEventListener('click', () => {
      window.alert(
        'Lucky Gifts Party rules:\n\n• Gifts sent during the event count toward rankings.\n• Rewards are distributed after each ranking period ends.\n• Verified accounts only — misuse may result in disqualification.\n• AP Services moderators review all claims.'
      );
    });
  }

  async function initCoinsRecharge() {
    const amounts = [99, 199, 499, 999, 1999, 4999];
    const requested = parseInt(qs('amount') || '', 10);
    let selected = amounts.includes(requested) ? requested : amounts[1];
    let coinsPerInr = 10;
    let proofFile = null;
    try {
      const settings = await SocialWallet?.getWalletSettings?.();
      coinsPerInr = settings?.coins_per_inr || 10;
    } catch (_e) {}

    const amountEl = document.getElementById('rechargeAmount');
    const coinsEl = document.getElementById('rechargeCoins');
    const utrEl = document.getElementById('rechargeUtr');
    const wrap = document.getElementById('rechargeAmountBtns');
    const historyEl = document.getElementById('rechargeHistory');
    const submitBtn = document.getElementById('rechargeSubmit');
    const submitHint = document.getElementById('rcSubmitHint');
    const balanceEl = document.getElementById('rcWalletBalance');

    if (balanceEl && SocialWallet?.fetchBalance) {
      try {
        const bal = await SocialWallet.fetchBalance(true);
        const coins = Number(bal?.coin_balance ?? bal?.coins ?? 0);
        balanceEl.innerHTML =
          '<i class="fas fa-coins"></i>' + coins.toLocaleString('en-IN') + ' <span style="font-size:14px;font-weight:600">coins</span>';
      } catch (_e) {
        balanceEl.innerHTML = '<i class="fas fa-coins"></i>—';
      }
    }

    const coinsFor = (inr) => Math.floor(inr * coinsPerInr);
    const bonusRate = (inr) => {
      if (inr >= 4999) return 0.15;
      if (inr >= 1999) return 0.1;
      if (inr >= 499) return 0.05;
      return 0;
    };
    const packageCoins = (inr) => {
      const base = coinsFor(inr);
      const bonus = Math.floor(base * bonusRate(inr));
      return { base, bonus, total: base + bonus };
    };

    const breakdownEl = document.getElementById('rechargeCoinBreakdown');

    const syncAmount = () => {
      const { base, bonus, total } = packageCoins(selected);
      if (amountEl) amountEl.textContent = '₹' + selected.toLocaleString('en-IN');
      if (coinsEl) coinsEl.textContent = total.toLocaleString('en-IN') + ' coins';
      if (breakdownEl) {
        breakdownEl.textContent =
          `Base ${base.toLocaleString('en-IN')} · Bonus +${bonus.toLocaleString('en-IN')} · Total ${total.toLocaleString('en-IN')}`;
      }
      updateRechargeUiState();
    };

    function utrValid() {
      const utr = (utrEl?.value || '').trim().replace(/\s+/g, '');
      return /^\d{10,22}$/.test(utr);
    }

    function updateRechargeUiState() {
      const utrOk = utrValid();
      const stepPkg = document.getElementById('rcStepPkg');
      const stepPay = document.getElementById('rcStepPay');
      const stepUtr = document.getElementById('rcStepUtr');
      if (stepPkg) stepPkg.className = 'rc-step done';
      if (stepPay) stepPay.className = 'rc-step' + (utrOk ? ' done' : ' active');
      if (stepUtr) stepUtr.className = 'rc-step' + (utrOk ? ' done active' : '');

      if (submitBtn) {
        submitBtn.disabled = !utrOk;
        submitBtn.textContent = utrOk ? 'Submit payment for verification' : 'Enter UTR to submit';
        submitBtn.classList.toggle('is-ready', utrOk);
      }
      if (submitHint) {
        if (utrOk) {
          submitHint.textContent = proofFile
            ? 'Ready! Screenshot attached — tap the green button to submit.'
            : 'Ready! Tap the green button to submit your payment.';
          submitHint.className = 'rc-submit-hint is-ready';
        } else {
          submitHint.textContent = 'Step 1: pick package · Step 2: pay via QR · Step 3: paste UTR above';
          submitHint.className = 'rc-submit-hint';
        }
      }
    }

    function clearProofPreview() {
      proofFile = null;
      const zone = document.getElementById('rechargeProofZone');
      const preview = document.getElementById('rechargeProofPreview');
      const wrapPreview = document.getElementById('rechargeProofPreviewWrap');
      const placeholder = document.getElementById('rechargeProofPlaceholder');
      const input = document.getElementById('rechargeProof');
      if (preview?.src?.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      if (preview) preview.removeAttribute('src');
      if (wrapPreview) wrapPreview.hidden = true;
      if (placeholder) placeholder.hidden = false;
      if (zone) zone.classList.remove('has-file');
      if (input) input.value = '';
      updateRechargeUiState();
    }

    function applyProofFile(file) {
      if (!file || !String(file.type || '').startsWith('image/')) {
        if (window.SocialUI) SocialUI.toast('Please choose an image file', 'warning');
        else toast('Please choose an image file', 'warning');
        return;
      }
      proofFile = file;
      const zone = document.getElementById('rechargeProofZone');
      const preview = document.getElementById('rechargeProofPreview');
      const wrapPreview = document.getElementById('rechargeProofPreviewWrap');
      const placeholder = document.getElementById('rechargeProofPlaceholder');
      zone?.classList.add('has-file');
      if (preview?.src?.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      if (wrapPreview) wrapPreview.hidden = true;
      if (placeholder) placeholder.hidden = false;
      const reader = new FileReader();
      reader.onload = () => {
        if (preview) preview.src = String(reader.result || '');
        if (wrapPreview) wrapPreview.hidden = false;
        if (placeholder) placeholder.hidden = true;
        updateRechargeUiState();
      };
      reader.onerror = () => {
        zone?.classList.remove('has-file');
        if (window.SocialUI) SocialUI.toast('Could not read image — try another file', 'error');
        else toast('Could not read image — try another file', 'error');
      };
      reader.readAsDataURL(file);
    }

    const proofZone = document.getElementById('rechargeProofZone');
    const proofInput = document.getElementById('rechargeProof');
    proofZone?.addEventListener('click', () => proofInput?.click());
    proofZone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        proofInput?.click();
      }
    });
    proofInput?.addEventListener('change', () => {
      const file = proofInput.files?.[0];
      if (file) applyProofFile(file);
    });
    document.getElementById('rechargeProofChange')?.addEventListener('click', (e) => {
      e.stopPropagation();
      proofInput?.click();
    });

    syncAmount();

    wrap?.querySelectorAll('button').forEach((btn, i) => {
      const inr = amounts[i];
      const pkg = packageCoins(inr);
      const coinLabel = btn.querySelector('.recharge-coin-label');
      const bonusLabel = btn.querySelector('.recharge-coin-bonus');
      if (coinLabel) coinLabel.textContent = pkg.total.toLocaleString('en-IN') + ' coins';
      if (bonusLabel) {
        bonusLabel.textContent = pkg.bonus > 0 ? `+${pkg.bonus.toLocaleString('en-IN')} bonus` : '';
      }
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selected = inr ?? selected;
        syncAmount();
      });
    });
    const initialIdx = amounts.indexOf(selected);
    if (initialIdx >= 0 && wrap) {
      wrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === initialIdx));
    }

    utrEl?.addEventListener('input', updateRechargeUiState);

    async function loadRechargeHistory() {
      if (!historyEl || !SocialWallet?.getRecharges) return;
      try {
        const res = await SocialWallet.getRecharges();
        const rows = res.data || [];
        if (!rows.length) {
          historyEl.innerHTML = '<p class="rc-history-empty recharge-history-empty">No recharge requests yet.</p>';
          return;
        }
        historyEl.innerHTML = rows
          .map((r) => {
            const st = r.payment_status || 'pending';
            const badge =
              st === 'approved' ? 'approved' : st === 'rejected' ? 'rejected' : 'pending';
            const coins =
              st === 'approved' && r.coins_credited != null
                ? Number(r.coins_credited).toLocaleString('en-IN')
                : packageCoins(r.amount_inr).total.toLocaleString('en-IN');
            return `<div class="rc-history-item recharge-history-item ${badge}">
              <div><strong>₹${Number(r.amount_inr).toLocaleString('en-IN')}</strong> → ${coins} coins</div>
              <div class="rc-history-meta recharge-history-meta">UTR: ${r.transaction_id || '—'} · ${new Date(r.created_at).toLocaleString()}</div>
              <span class="rc-status-badge recharge-status-badge">${st}</span>
            </div>`;
          })
          .join('');
      } catch (_e) {
        historyEl.innerHTML = '';
      }
    }
    loadRechargeHistory();

    submitBtn?.addEventListener('click', async () => {
      const utr = (utrEl?.value || '').trim().replace(/\s+/g, '');
      if (!/^\d{10,22}$/.test(utr)) {
        const msg = 'Enter the 10–22 digit UTR from your UPI payment receipt.';
        if (window.SocialUI) SocialUI.showError('Invalid UTR', msg);
        else toast(msg, 'warning');
        return;
      }
      if (!window.SocialWallet) {
        if (window.SocialUI) SocialUI.showError('Sign in needed', 'Please log in again.');
        else toast('Please log in again.', 'error');
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
      }
      try {
        await SocialWallet.submitRecharge(
          {
            amount_inr: selected,
            transaction_id: utr,
            payment_method: 'qr_manual',
          },
          proofFile
        );
        const { total } = packageCoins(selected);
        if (window.SocialUI) {
          SocialUI.showSuccess(
            'Payment submitted',
            `₹${selected.toLocaleString('en-IN')} → ${total.toLocaleString('en-IN')} coins after admin verification (usually within a few hours).`
          );
        } else toast('Submitted! Coins credited after admin verifies your UTR.', 'success');
        if (utrEl) utrEl.value = '';
        clearProofPreview();
        await loadRechargeHistory();
        if (balanceEl && SocialWallet?.fetchBalance) {
          try {
            const bal = await SocialWallet.fetchBalance(true);
            const coins = Number(bal?.coin_balance ?? bal?.coins ?? 0);
            balanceEl.innerHTML =
              '<i class="fas fa-coins"></i>' + coins.toLocaleString('en-IN') + ' <span style="font-size:14px;font-weight:600">coins</span>';
          } catch (_e) {}
        }
      } catch (e) {
        const msg = window.SocialUI ? SocialUI.friendlyMessage(e.message) : e.message || 'Recharge submission failed';
        if (window.SocialUI) SocialUI.showError('Recharge failed', msg);
        else toast(msg, 'error');
      } finally {
        updateRechargeUiState();
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.textContent = 'Submit payment for verification';
        }
      }
    });

    updateRechargeUiState();
  }

  window.SocialLive = {
    initPartyRoom,
    initLiveRoom,
    initStreamerCenter,
    initLuckyGifts,
    initCoinsRecharge,
    getCoins,
    refreshCoinDisplay,
    isActuallyLive,
    getChannel: channelId,
    minimizeRoom: minimizeLiveRoom,
    onMiniPlayerExpand: onMiniPlayerExpanded,
    exitRoom,
    getForensicReport() {
      return window.__liveDebug || { events: [] };
    },
  };
  window.APLive = window.SocialLive;

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body?.dataset?.livePage;
    if (page === 'party-room' || page === 'live-room') {
      scheduleHideAppChrome();
      prepareLiveUiShell();
    }
    if (page === 'party-room') initPartyRoom();
    if (page === 'live-room') initLiveRoom();
    if (page === 'lucky-gifts') initLuckyGifts();
    if (page === 'streamer-center') initStreamerCenter();
    if (page === 'coins-recharge') initCoinsRecharge();
  });
})();
