/**
 * Party room (voice grid) + Live room (video) - Agora + Socket.io
 * Build: 20260619-livefix
 */
(function () {
  window.__AP_LIVE_BUILD = '20260619-backend-livefix';
  const _liveEmoji = typeof window !== 'undefined' && window.AP_LIVE_EMOJI ? window.AP_LIVE_EMOJI : {};
  const COIN_EMOJI = _liveEmoji.COIN || '\u{1FA99}';

  if (!_liveEmoji.GIFT_CATALOG) {
    console.warn('[live] Load live-emoji-data.js before social-live.js for gift icons');
  }
  const GIFT_CATALOG = _liveEmoji.GIFT_CATALOG || {
    gift: [], lucky: [], new: [], island: [], fan: [], privilege: [], fun: [],
  };

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
  let heartbeatTimer = null;
  let hostEndingIntentionally = false;
  let agoraModeSwitchInProgress = false;
  let activeProfileUser = { name: '', userId: '' };
  let profileSheetActionsBound = false;
  let statusAutoHideTimer = null;
  let statusDismissed = false;
  let modeBadgeHideTimer = null;
  let roomJoinCompleted = false;
  let lastJoinMeta = null;
  let socketLeaveIntentional = false;
  let partyRulesTimer = null;
  let partyRoomInitStarted = false;
  let hostEndedRecoverTimer = null;
  let agoraStartInProgress = false;
  let reconnectRejoinTimer = null;
  let partyVoiceSkipped = false;

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
    if (!roomJoinCompleted && !lastJoinMeta.isHost) return;
    liveSocket.emit('live:join', lastJoinMeta, (res) => {
      if (res?.ok) {
        roomState = res.state || roomState || { channel: lastJoinMeta.channel, viewers: 1 };
        roomJoinCompleted = true;
        onSocketRejoinSuccess();
        liveDebugLog('Rejoined room after reconnect');
      } else if (lastJoinMeta.isHost) {
        liveDebugLog(`Host rejoin failed: ${res?.message || 'unknown'}`);
        setLiveStatus(`Reconnect failed: ${res?.message || 'unknown'}`, false);
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

  function isHost() {
    if (qs('host') === '1') return true;
    const me = currentUser();
    if (me?.id && roomState?.hostId && String(roomState.hostId) === String(me.id)) return true;
    return false;
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
      if (joinBtn) joinBtn.style.display = hasSpeakerSeat ? 'none' : '';
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

  function avatarUrl(name) {
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name);
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#7c3aed"/></svg>')}`;
  }

  function themeCover(kind, label) {
    if (window.SocialUI?.themeCover) return SocialUI.themeCover(kind, label);
    return '';
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
        bg.style.backgroundImage = 'none';
        bg.style.background = '#000';
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
    if (isHost()) {
      el.style.display = 'none';
      return;
    }
    if (!showHosting) {
      el.style.display = '';
      clearTimeout(modeBadgeHideTimer);
      modeBadgeHideTimer = setTimeout(() => {
        if (!isHost()) el.style.display = 'none';
      }, 8000);
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
    const bar = document.getElementById('apLiveViewerDiag');
    if (bar) bar.remove();
  }

  function refreshViewerDiagnostics() {
    const bar = document.getElementById('apLiveViewerDiag');
    if (bar) bar.remove();
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
    if (isActuallyLive()) {
      if (agoraMode === 'party') {
        return partyVoiceSkipped ? 'Party live — voice off' : 'Party voice live';
      }
      if (broadcastMode === 'audio') return 'Audio live';
      return 'Video live';
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
      updateModeBadge(broadcastMode, isActuallyLive());
      setLiveStatus(hostStatusLabel(), isActuallyLive() ? true : null);
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
    if (window.Auth?.ensureAccessToken) {
      const token = await Auth.ensureAccessToken();
      if (token && (!Auth.isAccessTokenUsable || Auth.isAccessTokenUsable(token))) return token;
      if (token) localStorage.removeItem('token');
    }
    let token = localStorage.getItem('token');
    if (token) {
      const usable = !window.Auth?.isAccessTokenUsable || Auth.isAccessTokenUsable(token);
      if (usable) return token;
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
      if (refreshed) return refreshed;

      const wsToken = await tryFetch('/auth/ws-token', { method: 'GET' });
      if (wsToken) return wsToken;
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
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
      });

    let socketAuthRetrying = false;
    liveSocket.on('connect', () => {
      liveDebugLog('Socket connected');
      lastSocketIssue = '-';
      updateLiveDebug({ socketConnected: true });
      forensicEvent('SOCKET_CONNECTED', { channel: channelId() });
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
      if (!socketLeaveIntentional && lastJoinMeta?.isHost && reason !== 'io client disconnect') {
        setLiveStatus('Reconnecting…', null);
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
      updateLiveDebug({ socketConnected: false, roomJoined: false });
      refreshViewerDiagnostics();
    });

    window.SocialFX?.init?.();

    liveSocket.on('live:state', (state) => {
      const prevViewers = roomState?.viewers || lastViewerCount;
      roomState = state;
      if (state?.viewers != null && state.viewers !== prevViewers) {
        window.SocialFX?.onViewerCountChange?.(state.viewers, prevViewers);
      }
      renderRoomState();
    });

    liveSocket.on('live:chat', (msg) => {
      rememberChatMessage(msg);
      renderChatFeed();
    });

    liveSocket.on('live:gift', (gift) => {
      showWinBanner(gift);
      showGiftFlyBanner(gift);
      const combo = window.SocialFX?.trackCombo?.(gift.emoji || 'gift', gift.qty || 1) || 1;
      window.SocialFX?.playGift?.(gift, { combo });
      onGiftTeamProgress(gift.amount || 100);
      if (pkBattleActive || document.body.classList.contains('is-pk-mode')) {
        pkScoreLeft += Math.min(500, gift.amount || 100);
        window.SocialFX?.pkScoreUpdate?.(pkScoreLeft, pkScoreRight);
      }
      if (roomState) renderRoomState();
    });

    liveSocket.on('live:viewer_count', ({ viewers }) => {
      const prev = lastViewerCount || roomState?.viewers || 0;
      if (viewers !== prev) window.SocialFX?.onViewerCountChange?.(viewers, prev);
      lastViewerCount = viewers;
      const el = document.getElementById('liveViewerCount');
      if (el) el.textContent = String(viewers);
    });

    liveSocket.on('pk:start', (snapshot) => {
      pkBattleActive = true;
      document.body.classList.add('is-pk-mode');
      document.getElementById('apPkOverlay')?.removeAttribute('aria-hidden');
      const teams = snapshot?.teams || snapshot?.teamScores || [];
      pkScoreLeft = Number(teams[0]?.team_score || teams[0]?.score || 0);
      pkScoreRight = Number(teams[1]?.team_score || teams[1]?.score || 0);
      window.SocialFX?.pkCountdown?.(5, () => {
        window.SocialFX?.pkScoreUpdate?.(pkScoreLeft, pkScoreRight);
        window.SocialFX?.pushActivity?.({ type: 'gift', html: '<strong>PK Battle</strong> started! 🔥' });
      });
    });

    liveSocket.on('pk:score', (snapshot) => {
      const teams = snapshot?.teams || snapshot?.teamScores || [];
      pkScoreLeft = Number(teams[0]?.team_score || teams[0]?.score || pkScoreLeft);
      pkScoreRight = Number(teams[1]?.team_score || teams[1]?.score || pkScoreRight);
      window.SocialFX?.pkScoreUpdate?.(pkScoreLeft, pkScoreRight);
    });

    liveSocket.on('pk:end', (snapshot) => {
      pkBattleActive = false;
      const teams = snapshot?.teams || snapshot?.teamScores || [];
      const left = Number(teams[0]?.team_score || pkScoreLeft);
      const right = Number(teams[1]?.team_score || pkScoreRight);
      const won = left >= right;
      window.SocialFX?.pkWinner?.(won ? 'winner' : 'loser', snapshot?.winnerName || roomState?.hostName);
      window.SocialFX?.pkScoreUpdate?.(left, right);
    });

    liveSocket.on('live:seat_request', (req) => {
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
    const hostFlag = isHost();
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
              lastJoinMeta = {
                channel: ch,
                type: type === 'live' ? 'live' : 'party',
                displayName: displayName(user),
                isHost: hostFlag,
              };
              startHeartbeat();
              updateLiveDebug({ roomJoined: true, socketConnected: true });
              auditChannel('socket', ch);
              auditChannel('db', res.state.channel || ch);
              if (hostFlag) {
                forensicEvent('ROOM_CREATE_SUCCESS', {
                  channel: ch,
                  roomId: res.state.roomId,
                  hostId: res.state.hostId,
                });
              }
              renderRoomState();
              applyRoleUiAfterJoin();
              hideApLoader();
              if (hostFlag) {
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
    if (liveSocket) {
      socketLeaveIntentional = true;
      if (isHost()) {
        liveSocket.emit('live:end', { channel: channelId() });
      }
      liveSocket.emit('live:leave');
      liveSocket.disconnect();
      liveSocket = null;
      socketLeaveIntentional = false;
    }
    publishSucceeded = false;
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
    const role = inferredHost ? 'host' : 'audience';
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

  function showApLoader(text) {
    if (roomJoinCompleted) {
      if (text) setLiveStatus(text, null);
      hideApLoader();
      return;
    }
    const loader = document.getElementById('apLiveLoader');
    const txt = document.getElementById('apLiveLoaderText');
    if (txt && text) txt.textContent = text;
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

  function dismissLiveStatus() {
    statusDismissed = true;
    clearTimeout(statusAutoHideTimer);
    const el = document.getElementById('liveStatusBadge');
    const strip = document.getElementById('apRoomStatusStrip');
    if (el) {
      el.style.display = 'none';
      el.textContent = '';
    }
    if (strip) strip.classList.remove('is-visible');
    document.body.classList.remove('ap-live-status-visible');
  }

  function setLiveStatus(text, ok) {
    const el = document.getElementById('liveStatusBadge');
    const strip = document.getElementById('apRoomStatusStrip');
    const show = Boolean(text);
    if (!show) {
      statusDismissed = false;
      if (el) el.style.display = 'none';
      if (strip) strip.classList.remove('is-visible');
      document.body.classList.remove('ap-live-status-visible');
      return;
    }
    if (statusDismissed && ok === true) return;
    statusDismissed = false;
    if (el) {
      el.style.display = 'inline-flex';
      el.textContent = text;
      el.classList.toggle('is-ok', ok === true);
      el.classList.toggle('is-err', ok === false);
      el.classList.toggle('is-warn', show && ok !== true && ok !== false);
      let dismissBtn = el.querySelector('.live-status-dismiss');
      if (!dismissBtn) {
        dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'live-status-dismiss';
        dismissBtn.setAttribute('aria-label', 'Dismiss');
        dismissBtn.textContent = '×';
        dismissBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissLiveStatus();
        });
        el.appendChild(dismissBtn);
      }
    }
    if (strip) strip.classList.toggle('is-visible', show);
    document.body.classList.toggle('ap-live-status-visible', show);
    const loaderTxt = document.getElementById('apLiveLoaderText');
    if (loaderTxt && text) loaderTxt.textContent = text;
    if (ok === true) {
      hideApLoader();
    } else if (ok === false) {
      hideApLoader();
      if (text) toast(text, 'error');
    } else if (roomJoinCompleted) {
      hideApLoader();
    } else if (text) {
      showApLoader(text);
    }
    clearTimeout(statusAutoHideTimer);
    if (ok === false) return;
    statusAutoHideTimer = setTimeout(() => dismissLiveStatus(), 5000);
  }

  function onRoomReady() {
    hideApLoader();
    syncLiveUiState();
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
    showApLoader(host ? 'Starting your broadcast…' : 'Connecting to live…');
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

      try {
        await withTimeout(agoraClient.join(appId, agoraChannel, token, uid), 25000, 'Agora channel join');
        auditChannel('agora', agoraChannel);
        liveDebugLog(`Agora join OK channel=${agoraChannel} uid=${uid}`);
        updateLiveDebug({ agoraJoined: true });
        forensicEvent('AGORA_JOIN_SUCCESS', { channel: agoraChannel, uid, role: host ? 'host' : 'audience' });
        syncLiveUiState();
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

      agoraClient.on('user-published', async (user, mediaType) => {
        liveDebugLog(`user-published uid=${user.uid} media=${mediaType}`);
        forensicEvent('REMOTE_USER_PUBLISHED', { uid: user.uid, mediaType, channel: agoraChannel });
        try {
          await agoraClient.subscribe(user, mediaType);
          liveDebugLog(`subscribe OK uid=${user.uid} media=${mediaType}`);
          forensicEvent('REMOTE_USER_SUBSCRIBED', { uid: user.uid, mediaType, channel: agoraChannel });
        } catch (subErr) {
          const msg = subErr?.message || String(subErr);
          console.error('[live] subscribe failed', subErr);
          liveDebugLog(`subscribe FAILED uid=${user.uid} media=${mediaType}: ${msg}`);
          toast(`Subscribe failed (${mediaType}): ${msg}`, 'error');
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
          if (soundOn) user.audioTrack?.play();
          else user.audioTrack?.stop();
        }
        remoteUsers.set(user.uid, user);
        updateLiveDebug({ remoteUsersCount: remoteUsers.size });
        syncLiveUiState();
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

      if (host) {
        const perm = await requestNativeMediaPermissions();
        const needsCamera = mode !== 'party' && broadcastMode !== 'audio';
        if (perm && perm.ok === false && needsCamera) {
          await handleHostMediaBlocked(
            perm.microphone === 'denied' || perm.microphone === 'never_ask_again'
              ? 'Allow Microphone in Android app settings, then tap mic to retry.'
              : 'Allow Camera and Microphone in Android app settings, then switch to Video.',
            mode
          );
          return;
        }
        if (needsCamera && perm && perm.camera && perm.camera !== 'granted') {
          await handleHostMediaBlocked(
            'Camera permission required for video live. Enable Camera in app settings, then tap Video.',
            mode
          );
          return;
        }
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
            AgoraRTC.createMicrophoneAndCameraTracks(),
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
            localBox.classList.add('live-local-host-mirror');
            try {
              videoTrack.play(localBox, { mirror: true });
            } catch (_playErr) {
              videoTrack.play(localBox);
            }
          }
          const root = document.getElementById('liveRoomRoot');
          if (root) root.classList.remove('is-audio-mode');
          const bg = document.getElementById('liveBg');
          if (bg) bg.style.display = 'none';
          const audioStage = document.getElementById('liveAudioStage');
          if (audioStage) audioStage.setAttribute('aria-hidden', 'true');
          const fallback = document.getElementById('liveLocalVideo');
          if (fallback) fallback.style.display = 'none';
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
    if (!hasSpeakerSeat || isHost()) return;
    if (localTracks.length) return;
    const ch = channelId();
    try {
      const cred = await fetchAgoraToken(ch, true);
      if (cred?.appId && agoraClient) {
        const AgoraRTC = await loadAgoraScript();
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTracks = [audioTrack];
        await agoraClient.publish(audioTrack);
        liveDebugLog('Publish OK guest audio');
        updateLiveDebug({ hostPublishing: true });
        micMuted = false;
        return;
      }
    } catch (e) {
      const msg = e?.message || String(e);
      liveDebugLog(`Guest publish FAILED: ${msg}`);
      toast(`Mic publish failed: ${msg}`, 'error');
    }
    await startLocalMicOnly();
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
        if (video) video.style.display = 'none';
        if (bg) bg.style.display = 'none';
        setLiveStreamVisible(true);
        return;
      }

      if (video && wantVideo) {
        video.srcObject = stream;
        video.style.display = 'block';
        video.muted = true;
        await video.play?.();
        if (bg) bg.style.display = 'none';
        setLiveStreamVisible(true);
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
    if (document.getElementById('partySeats')) renderPartySeats(roomState?.hostName);
    const btn = document.getElementById('liveBtnMic');
    if (btn) {
      btn.innerHTML = micMuted
        ? '<i class="fas fa-microphone-slash"></i>'
        : '<i class="fas fa-microphone"></i>';
      btn.classList.toggle('is-muted', micMuted);
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
      const hostPct = 96;
      const earnPct = 4;
      banner.innerHTML = `<span>【${escapeHtml(g.name)}】RTP: ${hostPct}%. By gifting, host receives ${earnPct}% · ${Number(g.cost).toLocaleString()} coins each</span>`;
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
      const open = pop.classList.toggle('is-open');
      if (open) {
        closeChatUi();
        const bar = document.getElementById('partyBottomBar');
        const barH = bar ? bar.getBoundingClientRect().height : 58;
        const kb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ap-kb-offset'), 10) || 0;
        pop.style.left = '8px';
        pop.style.right = '8px';
        pop.style.width = 'auto';
        pop.style.bottom = Math.round(barH + kb + 8) + 'px';
      }
    });
    document.addEventListener('click', (e) => {
      if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        pop.classList.remove('is-open');
      }
    });
  }

  function handleMicButton() {
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
    if (msg?.id) return String(msg.id);
    return `${msg?.type || 'chat'}|${msg?.user || ''}|${msg?.text || ''}|${msg?.at || ''}`;
  }

  function isJoinChatMessage(msg) {
    if (!msg) return false;
    if (msg.type === 'join' || msg.event === 'join') return true;
    const text = String(msg.text || '').toLowerCase();
    if (/\bjoined\b/.test(text)) return true;
    return Boolean(msg.user && !msg.text);
  }

  function rememberChatMessage(msg) {
    if (!msg || isJoinChatMessage(msg)) return;
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
          if (isJoinChatMessage(msg)) return;
          div.className = 'party-chat-msg system';
          div.textContent = msg.text || '';
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
      <button type="button" class="party-seat${hostCls}${speaking} ${tierCls}" data-seat="${seatNum}" data-user="${escapeHtml(s.name)}" data-user-id="${escapeHtml(String(s.userId || ''))}">
        <div class="seat-avatar">
          <span class="seat-num">${seatNum}</span>
          ${crown}
          <img src="${avatarUrl(s.name)}" alt="">
          ${mic}
          ${waveBars}
        </div>
        <span class="seat-name">${escapeHtml(s.name)}</span>
        <span class="seat-gifts">🎁 ${formatGiftCount(s.gifts || 0)}</span>
      </button>`;
  }

  function renderPartySeats(hostName) {
    const container = document.getElementById('partySeats');
    if (!container) return;

    const me = displayName(currentUser());
    const hosting = isHost();
    const host = {
      name: hosting ? me : hostName || 'Host',
      host: true,
      gifts: 0,
      muted: micMuted,
      speaking: hosting && !micMuted,
    };

    const guests = (roomState?.seats || []).filter(
      (s) => s && s.name && s.name !== host.name && !s.isHost
    );

    const totalSeats = 16;
    const slots = new Array(totalSeats).fill(null);
    slots[1] = host;
    let guestIdx = 0;
    for (let i = 0; i < totalSeats; i += 1) {
      if (i === 1) continue;
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
      { cls: 'seat-tier-sm', indices: [6, 7, 8, 9, 10] },
      { cls: 'seat-tier-sm', indices: [11, 12, 13, 14, 15] },
    ];

    const rowClass = ['party-seat-row--lg', 'party-seat-row--md', 'party-seat-row--sm', 'party-seat-row--sm'];

    container.innerHTML = tiers
      .map(
        (tier, rowI) => `
      <div class="party-seat-row ${rowClass[rowI]}">
        ${tier.indices.map((idx) => renderSeatButton(slots[idx], idx + 1, tier.cls)).join('')}
      </div>`
      )
      .join('');

    container.querySelectorAll('.party-seat[data-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.user || btn.querySelector('.seat-name')?.textContent;
        openProfileSheet(name, btn.dataset.userId || '');
      });
    });
    container.querySelectorAll('[data-join-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
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
      hasSpeakerSeat = true;
    }
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    if (joinBtn && !isHost()) {
      joinBtn.style.display = hasSpeakerSeat ? 'none' : '';
    }
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostEl) hostEl.textContent = hostName.slice(0, 14) + (hostName.length > 14 ? '…' : '');
    if (hostImg) {
      hostImg.src = avatarUrl(hostName);
      hostImg.dataset.name = hostName;
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
    if (rid) rid.textContent = '· ID:' + ch.slice(0, 10);
    const partyRid = document.getElementById('partyRoomId') || document.getElementById('partyRoomIdLive');
    if (partyRid) partyRid.textContent = 'ID:' + ch.slice(0, 10);
    updateModeBadge(broadcastMode, isHost() && isActuallyLive());
    updateDynamicStats();
    syncToolBadges();
    renderQuickChips();
    syncMicButtonUi();
    bindRoomAvatars();
  }

  function syncMicButtonUi() {
    const micBtn = document.getElementById('liveBtnMic');
    if (!micBtn) return;
    micBtn.classList.toggle('is-muted', micMuted);
    micBtn.classList.toggle('is-live', isHost() && !micMuted);
    micBtn.classList.toggle('is-pending', micLinkPending);
    const icon = micBtn.querySelector('i');
    if (icon) {
      icon.className = micMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    }
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
    pkTimerSec = Math.max(0, pkTimerSec - 1);
    const m = Math.floor(pkTimerSec / 60);
    const s = pkTimerSec % 60;
    el.textContent = 'PK ' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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
      <button type="button" class="ap-guest-seat" data-guest="${escapeHtml(s.name)}">
        <span class="ap-guest-gift">${formatGiftCount(s.gifts || 0)}</span>
        <img src="${avatarUrl(s.name)}" alt="">
        <span class="ap-guest-name">${escapeHtml(String(s.name).slice(0, 8))}</span>
      </button>`
      )
      .join('');
    rail.querySelectorAll('.ap-guest-seat').forEach((btn) => {
      btn.addEventListener('click', () => openProfileSheet(btn.dataset.guest));
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
        document.getElementById('apMicLinkModal')?.classList.contains('open')
    );
    document.body.classList.toggle('ap-live-overlay-open', open);
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
    const hosting = isHost();
    if (followBtn) {
      const hideFollow = hosting || followed;
      followBtn.classList.toggle('ap-btn-follow-hidden', hideFollow);
      followBtn.setAttribute('aria-hidden', hideFollow ? 'true' : 'false');
    }
    if (compose) {
      compose.classList.remove('ap-compose-hidden');
    }
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

  function bindRoomAvatars() {
    window.SocialUI?.bindAvatarFallbacks?.(document.body);
    const user = currentUser();
    const hostName = roomState?.hostName || displayName(user);
    document.querySelectorAll('#partyHostAvatar, #liveHostAvatar, .ap-top-gifter img').forEach((img) => {
      if (!img.getAttribute('src')) img.src = avatarUrl(hostName);
      img.dataset.name = hostName;
    });
  }

  function openTopupSheet() {
    document.getElementById('apTopupSheet')?.classList.add('open');
  }

  function openSurpriseShop() {
    document.getElementById('apSurpriseShop')?.classList.add('open');
  }

  function pinFixedOverlaysToBody() {
    [
      'partyBottomBar',
      'apRoomStatusStrip',
      'partyToolsSheet',
      'partyRequestsSheet',
      'apMicLinkModal',
      'giftSheet',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== document.body) document.body.appendChild(el);
    });
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
    bindMicLinkModal();
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
    if (!document.getElementById('apPkOverlay')) {
      const root = document.getElementById('liveRoomRoot') || document.querySelector('.party-room');
      if (root) {
        root.insertAdjacentHTML(
          'afterbegin',
          `<div class="ap-pk-overlay" id="apPkOverlay" aria-hidden="true">
            <div class="ap-pk-bar">
              <div class="ap-pk-bar-left" id="apPkBarLeft" style="width:45%"></div>
              <span class="ap-pk-score ap-pk-score-l" id="apPkScoreLeft">0</span>
              <span class="ap-pk-timer" id="apPkTimer">PK 03:08</span>
              <span class="ap-pk-score ap-pk-score-r" id="apPkScoreRight">0</span>
            </div>
            <div class="ap-pk-win ap-pk-win-l">Win x0</div>
            <div class="ap-pk-win ap-pk-win-r">Win x0</div>
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
    if (!document.getElementById('apMicLinkModal')) {
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
              <h2>Top-up coins</h2>
              <button type="button" id="apTopupClose"><i class="fas fa-times"></i></button>
            </div>
            <p class="ap-topup-balance">🪙 <span id="apTopupBal">0</span></p>
            <div class="ap-topup-banner">Official notice — beware of scams. Recharge only via AP Services.</div>
            <button type="button" class="ap-topup-pay"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='24'%3E%3Ctext x='0' y='18' font-size='14' fill='%234285F4'%3EG%3C/text%3E%3Ctext x='14' y='18' font-size='14'%3E Pay%3C/text%3E%3C/svg%3E" alt=""> Google Pay</button>
            <div class="ap-topup-grid" id="apTopupGrid"></div>
            <button type="button" class="ap-topup-recharge" id="apTopupRecharge">Recharge now</button>
            <label class="ap-topup-agree"><input type="checkbox" checked> I have read and agreed on <a href="/terms.html?app=1">User Recharge Agreement</a></label>
          </div>
        </div>`
      );
      const packs = [
        [7000, '0.99'],
        [21000, '3.00'],
        [70000, '10.00'],
        [210000, '30.00'],
        [350000, '50.00'],
        [700000, '100.00'],
        [1400000, '200.00'],
      ];
      const grid = document.getElementById('apTopupGrid');
      if (grid) {
        grid.innerHTML = packs
          .map(
            ([coins, price], i) =>
              `<button type="button" class="ap-topup-pack${i === 0 ? ' is-selected' : ''}" data-coins="${coins}" data-price="${price}">
                <strong>${coins.toLocaleString()}</strong><span>$${price}</span>
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
      });
      document.getElementById('apTopupSheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'apTopupSheet') e.target.classList.remove('open');
      });
      document.getElementById('apTopupRecharge')?.addEventListener('click', () => {
        location.href = '/coins-recharge.html?app=1';
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
    if (qs('pk') === '1') {
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
    if (backdrop && visible) backdrop.style.opacity = '0';
    else if (backdrop && !visible) backdrop.style.opacity = '';
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
    if (isHost()) return;
    const user = currentUser();
    const name = displayName(user);
    const id = user?.id || Date.now();
    if (joinRequests.some((r) => String(r.id) === String(id))) {
      toast('Request already sent');
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
      renderJoinRequests();
      document.getElementById('partyRequestsSheet')?.classList.add('open');
    });
    document.getElementById('partyRequestsClose')?.addEventListener('click', () => {
      document.getElementById('partyRequestsSheet')?.classList.remove('open');
    });
    document.getElementById('partyRequestsSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyRequestsSheet') e.target.classList.remove('open');
    });

    document.getElementById('liveBtnInvite')?.addEventListener('click', () => {
      document.getElementById('partyBtnShare')?.click();
    });

    document.getElementById('liveBtnPk')?.addEventListener('click', () => {
      if (!liveSocket?.connected) {
        toast('Not connected to live server', 'error');
        return;
      }
      const startPk = () => {
        liveSocket.emit(
          'pk:start',
          { channel: channelId(), durationSeconds: 300, format: '1v1' },
          (res) => {
            if (res?.ok) toast('PK battle started!', 'success');
            else toast(res?.message || 'Could not start PK', 'error');
          }
        );
      };
      if (localStorage.getItem('ap_pk_explained') === '1') {
        startPk();
        return;
      }
      toast(
        'PK = gift battle between two hosts. Viewers send gifts to add points — highest score wins!',
        'info'
      );
      localStorage.setItem('ap_pk_explained', '1');
      setTimeout(startPk, 1200);
    });

    const setMode = async (mode) => {
      const changed = broadcastMode !== mode;
      broadcastMode = mode;
      document.getElementById('liveBtnModeVideo')?.classList.toggle('is-active', mode === 'video');
      document.getElementById('liveBtnModeAudio')?.classList.toggle('is-active', mode === 'audio');
      if (changed) toast(mode === 'video' ? 'Video mode — camera on' : 'Audio-only mode');
      if (changed && isHost() && pageType === 'live') await restartAgoraForMode();
    };
    document.getElementById('liveBtnModeVideo')?.addEventListener('click', () => setMode('video'));
    document.getElementById('liveBtnModeAudio')?.addEventListener('click', () => setMode('audio'));
    if (isHost() && pageType === 'live') {
      document.getElementById('liveBtnModeVideo')?.classList.toggle('is-active', broadcastMode === 'video');
      document.getElementById('liveBtnModeAudio')?.classList.toggle('is-active', broadcastMode === 'audio');
    }
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
          <h3 class="ap-share-sheet-title">Share room inside AP Services</h3>
          <p class="ap-share-sheet-sub">Invite people you follow — not outside apps</p>
          <div class="ap-share-user-list" id="apShareUserList"></div>
          <button type="button" class="ap-share-cancel" id="apShareCancel">Cancel</button>
        </div>
      </div>`
    );
    document.getElementById('apInAppShareSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'apInAppShareSheet') e.target.classList.remove('open');
    });
    document.getElementById('apShareCancel')?.addEventListener('click', () => {
      document.getElementById('apInAppShareSheet')?.classList.remove('open');
    });
  }

  async function openInAppShareSheet() {
    ensureInAppShareSheet();
    const sheet = document.getElementById('apInAppShareSheet');
    const list = document.getElementById('apShareUserList');
    if (!sheet || !list) return;
    list.innerHTML = '<p class="ap-share-loading">Loading friends…</p>';
    sheet.classList.add('open');

    const hostName = roomState?.hostName || displayName(currentUser()) || 'Host';
    const page = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';
    const url = location.href.split('#')[0];
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
        '<p class="ap-share-empty">Follow creators first, then share your room with them here.</p>';
      return;
    }

    list.innerHTML = users
      .map(
        (u) => `
      <button type="button" class="ap-share-user-row" data-share-user="${escapeHtml(String(u.id || ''))}" data-share-name="${escapeHtml(u.name || 'User')}">
        <img src="${avatarUrl(u.name)}" alt="">
        <span>${escapeHtml(u.name)}</span>
        <i class="fas fa-paper-plane"></i>
      </button>`
      )
      .join('');

    list.querySelectorAll('.ap-share-user-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.shareUser;
        const name = btn.dataset.shareName || 'User';
        try {
          const key = 'social_share_inbox';
          const inbox = JSON.parse(localStorage.getItem(key) || '{}');
          const threadKey = userId || name;
          if (!inbox[threadKey]) inbox[threadKey] = [];
          inbox[threadKey].push({ text: inviteText, at: Date.now(), from: displayName(currentUser()) });
          localStorage.setItem(key, JSON.stringify(inbox));
          localStorage.setItem(
            'ap_share_pending',
            JSON.stringify({ userId, name, text: inviteText, at: Date.now() })
          );
        } catch (_e) {}
        sheet.classList.remove('open');
        toast(`Invite sent to ${name} in Messages`, 'success');
        if (userId) {
          setTimeout(() => {
            location.href = `/chat.html?id=${encodeURIComponent(userId)}&app=1`;
          }, 600);
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

  function openGiftSheet(targetName) {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    closeLiveOverlays('gift');
    const to = targetName || roomState?.hostName || 'Host';
    sheet.dataset.to = to;
    delete sheet.dataset.toUserId;
    renderGiftRecipients(to);
    renderGiftGrid();
    refreshCoinDisplay();
    updateGiftMeta();
    sheet.classList.add('open');
    syncLiveOverlayClass();
  }

  async function sendGiftViaApi(receiverId, cost, emoji, toName) {
    if (!window.SocialWallet) throw new Error('Wallet unavailable');
    await SocialWallet.sendGift({
      receiver_id: receiverId,
      coin_amount: cost,
      gift_type: emoji || 'gift',
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
      window.location.href = '/coins-recharge.html?app=1';
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
        await sendGiftViaApi(receiverId, cost, g.emoji, to);
      } catch (e) {
        const msg = window.SocialUI?.friendlyMessage(e.message) || e.message || reason || 'Gift failed';
        if (/insufficient/i.test(msg)) {
          toast('Not enough coins — recharge first', 'warning');
          window.location.href = '/coins-recharge.html?app=1';
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
            window.location.href = '/coins-recharge.html?app=1';
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
    liveSocket.emit('live:chat', {
      channel: channelId(),
      text: t,
      lvl: lvlInfo.level,
      scope,
      broadcast: chatRegionFilter === 'broadcast',
    });
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
      focusChatCompose();
    });
    document.getElementById('partyBtnMinimize')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      toast('Swipe up from home to return', 'info');
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
    hideApLoader();
    await stopAgora({ skipEndRoom: hostEndingIntentionally });
    leaveSocket();
    if (history.length > 1) history.back();
    else {
      const back = document.body.dataset.livePage === 'party-room' ? '/party.html' : '/explore.html';
      location.href = back + '?app=1';
    }
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
            <h3 id="apSeatTitle">Empty seat</h3>
            <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0">Tap accept on join requests to fill this seat</p>
            <div class="ap-seat-divider">Alternate member</div>
            <p id="apSeatAlt" style="font-size:12px;color:rgba(255,255,255,0.35)">No alternate member…</p>
            <button type="button" class="ap-seat-action" id="apSeatGuardianBtn">Open Guardian</button>
          </div>
        </div>`
      );
      document.getElementById('apSeatSheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'apSeatSheet') e.target.classList.remove('open');
      });
      document.getElementById('apSeatGuardianBtn')?.addEventListener('click', () => {
        document.getElementById('apSeatSheet')?.classList.remove('open');
        location.href = '/rankings.html?app=1';
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
      document.getElementById('apProfileGiftBtn')?.addEventListener('click', () => {
        const name = document.getElementById('apProfileName')?.textContent;
        document.getElementById('apProfileSheet')?.classList.remove('open');
        openGiftSheet(name);
      });
      document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
        const id = document.getElementById('apProfileId')?.textContent?.replace('ID:', '').trim();
        if (id && navigator.clipboard) navigator.clipboard.writeText(id).catch(() => {});
      });
      bindProfileSheetActions();
    }
  }

  function bindProfileSheetActions() {
    if (profileSheetActionsBound) return;
    profileSheetActionsBound = true;
    document.getElementById('apProfileAddFriend')?.addEventListener('click', async () => {
      const { name, userId } = activeProfileUser;
      if (!name) return;
      if (window.SocialInteractions?.toggleFollow) {
        const now = await SocialInteractions.toggleFollow(userId || name, name);
        toast(now ? `Following ${name}` : `Unfollowed ${name}`, now ? 'success' : 'info');
        return;
      }
      toast('Follow feature loading…', 'info');
    });
    document.getElementById('apProfileMention')?.addEventListener('click', () => {
      const input =
        document.getElementById('partyChatInput') ||
        document.getElementById('liveChatInput') ||
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
      toast('Open their profile to message', 'info');
    });
    document.getElementById('apProfileMore')?.addEventListener('click', () => {
      const name = activeProfileUser.name || 'User';
      const menu = document.createElement('div');
      menu.className = 'ap-profile-more-menu';
      menu.innerHTML = `
        <button type="button" data-act="report">Report user</button>
        <button type="button" data-act="block">Block user</button>
        <button type="button" data-act="copy">Copy nickname</button>`;
      const sheet = document.getElementById('apProfileSheet');
      const panel = sheet?.querySelector('.ap-profile-sheet-panel');
      if (!panel) return;
      panel.querySelector('.ap-profile-more-menu')?.remove();
      panel.appendChild(menu);
      menu.querySelector('[data-act="report"]')?.addEventListener('click', () => {
        toast('Report submitted — our team will review', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="block"]')?.addEventListener('click', () => {
        toast(`${name} blocked for this session`, 'info');
        menu.remove();
        sheet?.classList.remove('open');
      });
      menu.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(name).catch(() => {});
        toast('Nickname copied', 'success');
        menu.remove();
      });
    });

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
    if (title) title.textContent = seatNum ? `Seat ${seatNum} · Empty` : 'Empty seat';
    document.getElementById('apSeatSheet')?.classList.add('open');
  }

  function openProfileSheet(name, userId) {
    const n = name || 'User';
    activeProfileUser = { name: n, userId: userId ? String(userId) : '' };
    const img = document.getElementById('apProfileAvatar');
    const nm = document.getElementById('apProfileName');
    const idEl = document.getElementById('apProfileId');
    const lvl = document.getElementById('apProfileLvl');
    if (img) img.src = avatarUrl(n);
    if (nm) nm.textContent = n;
    const idNum = userId
      ? String(userId).slice(0, 12)
      : String(n).split('').reduce((a, c) => a + c.charCodeAt(0), 0).toString().slice(0, 8);
    if (idEl) {
      idEl.innerHTML = `ID: ${idNum} <button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button>`;
      document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(idNum).catch(() => {});
        toast('ID copied', 'success');
      });
    }
    if (lvl) lvl.textContent = 'Lv.' + (5 + (idNum.length % 20));
    const contrib = document.getElementById('apProfileContrib');
    if (contrib) {
      contrib.innerHTML = [n, roomState?.hostName || 'Host']
        .filter(Boolean)
        .slice(0, 3)
        .map((x) => `<img src="${avatarUrl(x)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`)
        .join('');
    }
    const gifts = document.getElementById('apProfileGifts');
    if (gifts) {
      gifts.innerHTML = ['🎁', '✨', '🎺']
        .map((g) => `<span title="Gift">${g}</span>`)
        .join('');
    }
    document.getElementById('apProfileSheet')?.classList.add('open');
    document.getElementById('apProfileSheet')?.querySelector('.ap-profile-more-menu')?.remove();
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
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    const user = currentUser();
    if (!user) {
      partyRoomInitStarted = false;
      toast('Please log in');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }
    initForensicLog();
    ensureHostChannelInUrl();

    bindCommonControls('party');
    bindHostControls('party');
    setLiveStatus('Joining room…', null);
    try {
      await connectSocket('party');
    } catch (e) {
      console.error('[live] party room join failed', e);
      partyRoomInitStarted = false;
      setLiveStatus(e?.message || 'Could not connect to party room', false);
      return;
    }
    applyRoleUiAfterJoin();
    if (!roomJoinCompleted) {
      partyRoomInitStarted = false;
      const msg = 'Room join failed — check internet and sign in again. If this keeps happening, update the app.';
      setLiveStatus(msg, false);
      toast(msg, 'error');
      return;
    }
    partyVoiceSkipped = false;
    await resumeHostBroadcastIfNeeded();
    postWelcomeMessage();
    maybeShowPartyRules();

    if (!window.__apPartyRoomUnloadBound) {
      window.__apPartyRoomUnloadBound = true;
      window.addEventListener('pagehide', () => {
        stopAgora();
        leaveSocket();
      });
    }
  }

  async function fetchLiveFeedItems() {
    const startChannel = (qs('channel') || qs('room') || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
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
    return items.slice(0, 24);
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
    setLiveStreamVisible(false);

    await stopAgora();
    leaveSocket();
    try {
      await connectSocket('live');
    } catch (e) {
      console.error('[live] feed room join failed', e);
      feedSwitching = false;
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
      stopAgora();
      leaveSocket();
    });
  }

  async function initLiveRoom() {
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
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
    ensureHostChannelInUrl();
    initBroadcastMode();
    bindCommonControls('live');
    bindHostControls('live');
    auditChannel('url', channelId());
    setLiveStatus('Joining room…', null);
    const joinGuard = setTimeout(() => {
      if (!roomJoinCompleted) {
        hideApLoader();
        const lan = isLanHttpInNativeWebView();
        setLiveStatus(
          lan
            ? 'LAN dev cannot host video live — use npm start (HTTPS), not start:lan'
            : 'Connection timed out — check Wi‑Fi, sign in again, then retry',
          false
        );
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
      setLiveStatus('Room join failed — check internet and sign in again. Update app if needed.', false);
      toast('Could not join live room. Pull latest app after update.', 'error');
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

    window.addEventListener('beforeunload', () => {
      stopAgora();
      leaveSocket();
    });
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
      if (window.SocialShell?.goStartLiveBroadcast) SocialShell.goStartLiveBroadcast({ mode: 'video' });
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
    const list = document.getElementById('luckyRankList');
    if (list) {
      list.innerHTML = LUCKY_RANKS.map((r) => {
        const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
        return `<div class="lucky-rank-row">
          <span class="rank-badge">${medal}</span>
          <img src="${avatarUrl(r.name)}" alt="">
          <div class="info"><div class="name">${r.name} 🇮🇳</div>
          <div class="scores"><span>🎉 ${r.score}</span><span>🪙 ${r.coins}</span></div></div>
          <button type="button" class="btn-receive" data-rank="${r.rank}">Receive</button>
        </div>`;
      }).join('');
      list.querySelectorAll('.btn-receive').forEach((btn) => {
        btn.addEventListener('click', () => toast('Reward claimed for rank ' + btn.dataset.rank));
      });
    }

    document.querySelectorAll('.lucky-sub-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lucky-sub-tabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
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
  }

  function initCoinsRecharge() {
    const amounts = [99, 199, 499, 999, 1999, 4999];
    const requested = parseInt(qs('amount') || '', 10);
    let selected = amounts.includes(requested) ? requested : amounts[1];
    const amountEl = document.getElementById('rechargeAmount');
    const utrEl = document.getElementById('rechargeUtr');
    const wrap = document.getElementById('rechargeAmountBtns');
    const syncAmount = () => {
      if (amountEl) amountEl.textContent = '₹' + selected;
    };
    syncAmount();
    wrap?.querySelectorAll('button').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selected = amounts[i] ?? selected;
        syncAmount();
      });
    });
    // Apply initial selection UI if amount was prefilled.
    const initialIdx = amounts.indexOf(selected);
    if (initialIdx >= 0 && wrap) {
      wrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === initialIdx));
    }
    document.getElementById('rechargeSubmit')?.addEventListener('click', async () => {
      const utr = (utrEl?.value || '').trim();
      if (!utr || utr.length < 6) {
        if (window.SocialUI) SocialUI.showError('UTR required', 'Enter your UPI transaction reference (UTR) after scanning the QR code.');
        else toast('Enter your UPI transaction reference (UTR) after scanning the QR.', 'warning');
        return;
      }
      if (!window.SocialWallet) {
        if (window.SocialUI) SocialUI.showError('Sign in needed', 'Wallet service unavailable. Please log in again.');
        else toast('Please log in again.', 'error');
        return;
      }
      try {
        await SocialWallet.submitRecharge({
          amount_inr: selected,
          transaction_id: utr,
          payment_method: 'qr_manual',
        });
        window.SocialFX?.coinRain?.(40);
        if (window.SocialUI) SocialUI.showSuccess('Recharge submitted', 'Coins will be added after admin verification — usually within a few hours.');
        else toast('Recharge submitted! Awaiting verification.', 'success');
        setTimeout(() => { location.href = '/store.html?app=1'; }, 1200);
      } catch (e) {
        const msg = window.SocialUI ? SocialUI.friendlyMessage(e.message) : e.message || 'Recharge submission failed';
        if (window.SocialUI) SocialUI.showError('Recharge failed', msg);
        else toast(msg, 'error');
      }
    });
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
    getForensicReport() {
      return window.__liveDebug || { events: [] };
    },
  };

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
