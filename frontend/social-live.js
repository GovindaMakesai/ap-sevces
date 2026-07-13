/**
 * Party room (voice grid) + Live room (video) - Agora + Socket.io
 */
(function () {
  window.__AP_LIVE_BUILD = '20260713-host-back';
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
  const LIVE_MAX_GUESTS = 4;
  const chatProfileCache = new Map();

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
    '\u{1F917}', '\u{1F618}', '\u{1F48B}', '\u{1F970}', '\u{1F495}', '\u{1FAF6}',
  ];
  const SEAT_REACTION_EMOJIS = _liveEmoji.SEAT_REACTION_EMOJIS || [
    '\u{1F917}', '\u{1F618}', '\u{1F48B}', '\u{1F970}', '\u{1F495}', '\u{1FAF6}', '\u{1F60D}', '\u2764\uFE0F',
  ];
  const PARTY_BACKGROUNDS = [
    { id: 'cosmic', label: 'Cosmic', premium: false, css: 'radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #1e1033 45%, #0a0612 100%)' },
    { id: 'neon', label: 'Neon', premium: false, css: 'linear-gradient(160deg, #0f172a 0%, #581c87 40%, #be185d 100%)' },
    { id: 'sunset', label: 'Sunset', premium: false, css: 'linear-gradient(180deg, #7c2d12 0%, #c2410c 35%, #1c1917 100%)' },
    { id: 'ocean', label: 'Ocean', premium: false, css: 'linear-gradient(180deg, #0c4a6e 0%, #0369a1 40%, #082f49 100%)' },
    { id: 'forest', label: 'Forest', premium: false, css: 'linear-gradient(180deg, #14532d 0%, #166534 40%, #052e16 100%)' },
    { id: 'gold', label: 'Gold VIP', premium: true, css: 'linear-gradient(160deg, #422006 0%, #ca8a04 45%, #1a1000 100%)' },
    { id: 'diamond', label: 'Diamond', premium: true, css: 'linear-gradient(160deg, #0e7490 0%, #a5f3fc 35%, #164e63 100%)' },
    { id: 'galaxy', label: 'Galaxy', premium: true, css: 'radial-gradient(circle at 70% 30%, #6366f1 0%, #312e81 40%, #020617 100%)' },
    { id: 'aurora', label: 'Aurora', premium: true, css: 'linear-gradient(135deg, #064e3b 0%, #7c3aed 50%, #0f172a 100%)' },
    { id: 'royal', label: 'Royal', premium: true, css: 'linear-gradient(160deg, #4a044e 0%, #7e22ce 40%, #1e1b4b 100%)' },
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
  let audioUnlocked = false;
  let audioUnlockBound = false;
  let partyMusicPlayingId = '';
  let partyMusicCustomTracks = [];
  const PARTY_MUSIC_STORAGE_KEY = 'ap_party_music_tracks';
  const PARTY_MUSIC_PRESETS = [
    { id: 'chill', title: 'Chill lounge', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id: 'upbeat', title: 'Upbeat party', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id: 'soft', title: 'Soft evening', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
    { id: 'groove', title: 'Late night groove', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  ];
  let micMuted = false;
  let chestSec = 294;
  let teamProgress = 1;
  let joinRequests = [];
  let roomGiftHistory = [];

  function pushRoomGift(gift) {
    if (!gift) return;
    const entry = {
      id: gift.id || null,
      from: gift.from || gift.senderName || 'User',
      fromUserId: gift.fromUserId || gift.senderId || null,
      to: gift.to || gift.recipientName || gift.recipient || 'Host',
      toUserId: gift.toUserId || gift.recipientId || gift.receiver_id || null,
      emoji: gift.emoji || gift.gift_type || '🎁',
      amount: Number(gift.amount || gift.coins || gift.coin_amount || 0),
      at: gift.at ? new Date(gift.at).getTime() : Date.now(),
    };
    const key = entry.id
      ? `id:${entry.id}`
      : `${entry.from}|${entry.to}|${entry.emoji}|${entry.amount}|${Math.floor(entry.at / 5000)}`;
    if (roomGiftHistory.some((g) => (g.id && entry.id && g.id === entry.id) || g._key === key)) {
      return;
    }
    entry._key = key;
    roomGiftHistory.push(entry);
    if (roomGiftHistory.length > 40) roomGiftHistory = roomGiftHistory.slice(-40);
  }

  function hydrateGiftHistoryFromState(state) {
    const gifts = state?.gifts || [];
    gifts.forEach((g) => pushRoomGift(g));
    (state?.messages || [])
      .filter((m) => m?.type === 'gift')
      .forEach((m) => {
        pushRoomGift({
          id: m.id,
          from: m.user || m.gift?.from,
          fromUserId: m.userId || m.gift?.fromUserId,
          to: m.gift?.to || m.gift?.recipientName || 'Host',
          toUserId: m.gift?.toUserId || m.gift?.receiver_id,
          emoji: m.gift?.emoji || '🎁',
          amount: m.gift?.amount || m.gift?.coin_amount || m.gift?.coins || 0,
          at: m.at,
          ...(m.gift || {}),
        });
      });
  }
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
  let feedTouchStartY = 0;
  let feedTouchStartAt = 0;
  let chatInputFocused = false;
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
  try {
    // One-time: older builds defaulted to "natural" without the user picking a look.
    const rawSaved = localStorage.getItem('ap_live_beauty_filter');
    if (rawSaved === 'natural' && !localStorage.getItem('ap_live_beauty_filter_picked')) {
      localStorage.setItem('ap_live_beauty_filter', 'none');
    }
  } catch (_e) { }
  try {
    const urlFilter = new URLSearchParams(location.search).get('filter');
    const savedFilter = urlFilter || localStorage.getItem('ap_live_beauty_filter');
    const LEGACY_FILTER_MAP = {
      soft_natural: 'natural',
      fair_skin: 'glow',
      porcelain: 'silk',
      clear_skin: 'velvet',
      soft_glam: 'glam',
      rosy_blush: 'rose',
      warm_glow: 'golden',
      cool_fresh: 'fresh',
      radiant: 'glow',
      dreamy: 'dream',
      hd_smooth: 'velvet',
    };
    if (savedFilter) {
      videoFilterId = LEGACY_FILTER_MAP[savedFilter] || savedFilter;
    }
    if (urlFilter) {
      try {
        localStorage.setItem('ap_live_beauty_filter', videoFilterId);
        localStorage.setItem('ap_live_beauty_filter_picked', '1');
      } catch (_e) { }
    }
  } catch (_e) {
    videoFilterId = 'none';
  }
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
  let beautyPipeline = null; // optional canvas beauty (preview/effects only unless enabled)
  let rawCameraTrack = null;
  let beautySyncPromise = null;
  // Canvas custom-track publish was unpublishing the real camera and failing to
  // republish, leaving hosts "Video live" with black/no video for viewers.
  // Publish canvas face beauty/effects to viewers. Swap is guarded: raw camera
  // stays alive as the canvas source and is restored immediately if publish fails.
  const PUBLISH_CANVAS_BEAUTY = true;

  /**
   * Snapchat / Instagram-style looks.
   * Processed on canvas (skin smooth + glow + makeup overlays + grade),
   * plus Agora beauty when available.
   */
  const VIDEO_FILTERS = {
    none: {
      label: 'Original',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#3f3f46,#18181b)',
      css: '',
      grade: 'none',
      skin: 0,
      skinMix: 0,
      glow: 0,
      blush: null,
      highlight: 0,
      lip: null,
      wash: null,
      sparkle: 0,
      vignette: 0,
      beauty: null,
    },
    natural: {
      label: 'Natural',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#f5d0c5,#e8b4a0)',
      css: 'brightness(1.06) contrast(0.96) saturate(1.08)',
      grade: 'brightness(1.06) contrast(0.96) saturate(1.08)',
      skin: 3.2,
      skinMix: 0.58,
      glow: 0.18,
      blush: { color: 'rgba(255,140,130,0.28)', size: 0.12 },
      highlight: 0.22,
      lip: { color: 'rgba(220,90,100,0.18)', y: 0.62 },
      wash: null,
      sparkle: 0,
      vignette: 0.12,
      beauty: { lighteningLevel: 0.45, smoothnessLevel: 0.55, rednessLevel: 0.18, lighteningContrastLevel: 1 },
    },
    glow: {
      label: 'Glow',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#fff7ed,#fdba74)',
      css: 'brightness(1.12) contrast(0.92) saturate(1.12)',
      grade: 'brightness(1.12) contrast(0.92) saturate(1.14)',
      skin: 3.2,
      skinMix: 0.55,
      glow: 0.42,
      blush: { color: 'rgba(255,160,120,0.32)', size: 0.14 },
      highlight: 0.4,
      lip: { color: 'rgba(230,100,110,0.22)', y: 0.62 },
      wash: { color: 'rgba(255,220,180,0.14)', mode: 'soft-light' },
      sparkle: 0.35,
      vignette: 0.18,
      beauty: { lighteningLevel: 0.7, smoothnessLevel: 0.7, rednessLevel: 0.2, lighteningContrastLevel: 1 },
    },
    silk: {
      label: 'Silk',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#faf5ff,#e9d5ff)',
      css: 'brightness(1.1) contrast(0.9) saturate(1.05)',
      grade: 'brightness(1.1) contrast(0.9) saturate(1.05)',
      skin: 4.0,
      skinMix: 0.62,
      glow: 0.35,
      blush: { color: 'rgba(255,170,190,0.3)', size: 0.13 },
      highlight: 0.35,
      lip: { color: 'rgba(210,80,120,0.2)', y: 0.63 },
      wash: { color: 'rgba(250,240,255,0.12)', mode: 'soft-light' },
      sparkle: 0.2,
      vignette: 0.15,
      beauty: { lighteningLevel: 0.75, smoothnessLevel: 0.85, rednessLevel: 0.12, lighteningContrastLevel: 0 },
    },
    velvet: {
      label: 'Velvet',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#ffe4e6,#fda4af)',
      css: 'brightness(1.08) contrast(0.94) saturate(1.1)',
      grade: 'brightness(1.08) contrast(0.94) saturate(1.1)',
      skin: 4.5,
      skinMix: 0.68,
      glow: 0.28,
      blush: { color: 'rgba(255,120,140,0.34)', size: 0.15 },
      highlight: 0.28,
      lip: { color: 'rgba(200,60,90,0.28)', y: 0.63 },
      wash: null,
      sparkle: 0.15,
      vignette: 0.2,
      beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.9, rednessLevel: 0.22, lighteningContrastLevel: 1 },
    },
    glam: {
      label: 'Glam',
      cat: 'beauty',
      swatch: 'linear-gradient(145deg,#fb7185,#be123c)',
      css: 'brightness(1.1) contrast(0.95) saturate(1.28)',
      grade: 'brightness(1.1) contrast(0.95) saturate(1.28) sepia(0.06)',
      skin: 3.4,
      skinMix: 0.52,
      glow: 0.38,
      blush: { color: 'rgba(255,90,110,0.4)', size: 0.16 },
      highlight: 0.45,
      lip: { color: 'rgba(190,30,70,0.42)', y: 0.64 },
      wash: { color: 'rgba(255,180,200,0.1)', mode: 'overlay' },
      sparkle: 0.55,
      vignette: 0.22,
      beauty: { lighteningLevel: 0.65, smoothnessLevel: 0.65, rednessLevel: 0.38, lighteningContrastLevel: 1 },
    },
    rose: {
      label: 'Rose',
      cat: 'looks',
      swatch: 'linear-gradient(145deg,#fecdd3,#e11d48)',
      css: 'brightness(1.08) contrast(0.94) saturate(1.2) hue-rotate(-8deg)',
      grade: 'brightness(1.08) contrast(0.94) saturate(1.22) hue-rotate(-8deg)',
      skin: 2.8,
      skinMix: 0.48,
      glow: 0.3,
      blush: { color: 'rgba(255,100,140,0.45)', size: 0.17 },
      highlight: 0.3,
      lip: { color: 'rgba(220,50,100,0.35)', y: 0.63 },
      wash: { color: 'rgba(255,150,180,0.16)', mode: 'soft-light' },
      sparkle: 0.25,
      vignette: 0.16,
      beauty: { lighteningLevel: 0.6, smoothnessLevel: 0.55, rednessLevel: 0.45, lighteningContrastLevel: 1 },
    },
    peach: {
      label: 'Peach',
      cat: 'looks',
      swatch: 'linear-gradient(145deg,#fed7aa,#fb923c)',
      css: 'brightness(1.1) contrast(0.94) saturate(1.18) sepia(0.12)',
      grade: 'brightness(1.1) contrast(0.94) saturate(1.18) sepia(0.12)',
      skin: 3.0,
      skinMix: 0.5,
      glow: 0.36,
      blush: { color: 'rgba(255,150,100,0.4)', size: 0.15 },
      highlight: 0.34,
      lip: { color: 'rgba(230,90,80,0.3)', y: 0.62 },
      wash: { color: 'rgba(255,200,150,0.18)', mode: 'soft-light' },
      sparkle: 0.2,
      vignette: 0.14,
      beauty: { lighteningLevel: 0.62, smoothnessLevel: 0.58, rednessLevel: 0.3, lighteningContrastLevel: 1 },
    },
    golden: {
      label: 'Golden',
      cat: 'looks',
      swatch: 'linear-gradient(145deg,#fde68a,#d97706)',
      css: 'brightness(1.12) contrast(0.96) saturate(1.25) sepia(0.22)',
      grade: 'brightness(1.12) contrast(0.96) saturate(1.25) sepia(0.22)',
      skin: 2.6,
      skinMix: 0.45,
      glow: 0.48,
      blush: { color: 'rgba(255,170,80,0.35)', size: 0.14 },
      highlight: 0.5,
      lip: { color: 'rgba(200,80,60,0.28)', y: 0.62 },
      wash: { color: 'rgba(255,190,80,0.2)', mode: 'soft-light' },
      sparkle: 0.4,
      vignette: 0.25,
      beauty: { lighteningLevel: 0.68, smoothnessLevel: 0.5, rednessLevel: 0.25, lighteningContrastLevel: 1 },
    },
    fresh: {
      label: 'Fresh',
      cat: 'looks',
      swatch: 'linear-gradient(145deg,#a5f3fc,#22d3ee)',
      css: 'brightness(1.1) contrast(0.98) saturate(1.12) hue-rotate(12deg)',
      grade: 'brightness(1.1) contrast(0.98) saturate(1.12) hue-rotate(12deg)',
      skin: 2.4,
      skinMix: 0.44,
      glow: 0.28,
      blush: { color: 'rgba(255,160,150,0.28)', size: 0.12 },
      highlight: 0.32,
      lip: { color: 'rgba(220,100,120,0.22)', y: 0.62 },
      wash: { color: 'rgba(180,230,255,0.12)', mode: 'soft-light' },
      sparkle: 0.15,
      vignette: 0.12,
      beauty: { lighteningLevel: 0.58, smoothnessLevel: 0.5, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    },
    dream: {
      label: 'Dream',
      cat: 'fx',
      swatch: 'linear-gradient(145deg,#e0e7ff,#a78bfa)',
      css: 'brightness(1.14) contrast(0.88) saturate(1.15)',
      grade: 'brightness(1.14) contrast(0.88) saturate(1.15)',
      skin: 3.6,
      skinMix: 0.58,
      glow: 0.5,
      blush: { color: 'rgba(200,160,255,0.28)', size: 0.14 },
      highlight: 0.42,
      lip: { color: 'rgba(180,100,160,0.25)', y: 0.63 },
      wash: { color: 'rgba(200,180,255,0.16)', mode: 'soft-light' },
      sparkle: 0.65,
      vignette: 0.28,
      beauty: { lighteningLevel: 0.72, smoothnessLevel: 0.75, rednessLevel: 0.15, lighteningContrastLevel: 0 },
    },
    cinema: {
      label: 'Cinema',
      cat: 'fx',
      swatch: 'linear-gradient(145deg,#57534e,#1c1917)',
      css: 'brightness(1.02) contrast(1.12) saturate(0.92)',
      grade: 'brightness(1.02) contrast(1.14) saturate(0.9) sepia(0.08)',
      skin: 2.0,
      skinMix: 0.35,
      glow: 0.15,
      blush: { color: 'rgba(180,100,80,0.22)', size: 0.1 },
      highlight: 0.18,
      lip: { color: 'rgba(140,50,50,0.25)', y: 0.63 },
      wash: { color: 'rgba(40,30,20,0.12)', mode: 'multiply' },
      sparkle: 0,
      vignette: 0.45,
      beauty: { lighteningLevel: 0.35, smoothnessLevel: 0.45, rednessLevel: 0.1, lighteningContrastLevel: 2 },
    },
    neon: {
      label: 'Neon',
      cat: 'fx',
      swatch: 'linear-gradient(145deg,#f0abfc,#22d3ee)',
      css: 'brightness(1.08) contrast(1.08) saturate(1.45) hue-rotate(20deg)',
      grade: 'brightness(1.08) contrast(1.1) saturate(1.5) hue-rotate(18deg)',
      skin: 2.2,
      skinMix: 0.4,
      glow: 0.45,
      blush: { color: 'rgba(255,80,200,0.35)', size: 0.14 },
      highlight: 0.38,
      lip: { color: 'rgba(255,40,180,0.4)', y: 0.63 },
      wash: { color: 'rgba(80,220,255,0.14)', mode: 'screen' },
      sparkle: 0.7,
      vignette: 0.3,
      beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.5, rednessLevel: 0.2, lighteningContrastLevel: 1 },
    },
    dusk: {
      label: 'Dusk',
      cat: 'fx',
      swatch: 'linear-gradient(145deg,#c4b5fd,#7c3aed)',
      css: 'brightness(1.05) contrast(1.02) saturate(1.2) hue-rotate(-18deg)',
      grade: 'brightness(1.05) contrast(1.02) saturate(1.22) hue-rotate(-18deg)',
      skin: 2.8,
      skinMix: 0.48,
      glow: 0.32,
      blush: { color: 'rgba(200,100,180,0.35)', size: 0.14 },
      highlight: 0.3,
      lip: { color: 'rgba(160,40,120,0.35)', y: 0.63 },
      wash: { color: 'rgba(120,60,180,0.14)', mode: 'soft-light' },
      sparkle: 0.3,
      vignette: 0.32,
      beauty: { lighteningLevel: 0.5, smoothnessLevel: 0.55, rednessLevel: 0.28, lighteningContrastLevel: 1 },
    },
    soft_focus: {
      label: 'Soft Focus',
      cat: 'fx',
      swatch: 'linear-gradient(145deg,#fce7f3,#f9a8d4)',
      css: 'brightness(1.12) contrast(0.86) saturate(1.08)',
      grade: 'brightness(1.12) contrast(0.86) saturate(1.08)',
      skin: 5.0,
      skinMix: 0.72,
      glow: 0.55,
      blush: { color: 'rgba(255,180,200,0.3)', size: 0.15 },
      highlight: 0.48,
      lip: { color: 'rgba(220,120,150,0.22)', y: 0.62 },
      wash: { color: 'rgba(255,230,240,0.12)', mode: 'soft-light' },
      sparkle: 0.45,
      vignette: 0.2,
      beauty: { lighteningLevel: 0.7, smoothnessLevel: 0.88, rednessLevel: 0.18, lighteningContrastLevel: 0 },
    },
  };

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (liveSocket?.connected && channelId()) {
        liveSocket.emit('live:heartbeat', { channel: channelId() });
      }
    }, 25000);
    if (window.__apStateRefreshTimer) clearInterval(window.__apStateRefreshTimer);
    if (isPartyRoomPage()) {
      window.__apStateRefreshTimer = setInterval(() => {
        if (roomJoinCompleted && liveSocket?.connected) requestFreshRoomState();
      }, 60000);
    }
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (window.__apStateRefreshTimer) {
      clearInterval(window.__apStateRefreshTimer);
      window.__apStateRefreshTimer = null;
    }
  }

  function persistJoinMeta(meta) {
    if (!meta?.channel) return;
    try {
      sessionStorage.setItem('ap_live_join_meta', JSON.stringify(meta));
      persistDurableLiveSession({ joinMeta: meta });
    } catch (_e) { }
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
    } catch (_e) { }
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
    } catch (_e) { }
    return null;
  }

  function clearDurableLiveSession() {
    try {
      localStorage.removeItem(LIVE_SESSION_KEY);
      sessionStorage.removeItem('ap_live_pip_session');
      sessionStorage.removeItem('ap_live_join_meta');
    } catch (_e) { }
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
    } catch (_e) { }
    return null;
  }

  function viewerShareUrl() {
    const page = document.body.dataset.livePage === 'party-room' ? 'party-room.html' : 'live-room.html';
    const ch = channelId();
    const params = new URLSearchParams();
    if (ch) params.set('channel', ch);
    params.set('app', '1');
    // Viewer join only — never share host=1 / feed swipe mode
    const modeQs = (qs('mode') || '').toLowerCase();
    if (modeQs === 'audio') params.set('mode', 'audio');
    return `${location.origin}/${page}?${params.toString()}`;
  }

  function viewerSharePath() {
    try {
      const u = new URL(viewerShareUrl());
      return u.pathname + u.search;
    } catch (_e) {
      return viewerShareUrl();
    }
  }

  async function sendRoomInviteToUser(userId, text) {
    const uid = String(userId || '').trim();
    if (!uid || !text) throw new Error('Missing invite target');
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => { });
    const api = window.API;
    if (!api?.post) throw new Error('Chat API unavailable');
    // Ensure conversation exists, then send (works for new + existing chats)
    try {
      await api.post('/messages/conversations', { receiverId: uid });
    } catch (_e) {
      /* get-or-create may 404 elsewhere — /send still resolves peer */
    }
    await api.post('/messages/send', { receiverId: uid, text });
  }

  async function resumeMediaAfterForeground() {
    if (document.visibilityState !== 'visible') return;
    if (hasSpeakerSeat || (isHost() && publishSucceeded)) {
      await ensureMicPublishing();
    }
    if (lastJoinMeta?.isHost && publishSucceeded) {
      await applyLocalMicMuteState();
      await ensureHostVideoPublishing().catch(() => { });
      ensureHostVideoVisible();
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
      } catch (_e) { }
      return;
    }
    await resubscribeAllRemoteMedia();
    remoteUsers.forEach((user) => {
      if (user.audioTrack && soundOn) {
        try {
          user.audioTrack.play();
        } catch (_e) { }
      }
      if (user.videoTrack) {
        try {
          const container = document.getElementById('liveRemoteHost');
          if (container) {
            user.videoTrack.play(container);
            setLiveStreamVisible(true);
          }
        } catch (_e) { }
      }
    });
    await ensureMicPublishing();
    syncLiveUiState();
  }

  async function onMiniPlayerExpanded() {
    minimizingRoom = false;
    await onForegroundResume();
    await ensureMicPublishing();
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
        } catch (_e) { }
      });
      return;
    }
    localTracks.forEach((t) => {
      try {
        t.setEnabled?.(false);
      } catch (_e) { }
    });
    remoteUsers.forEach((user) => {
      try {
        user.audioTrack?.stop?.();
        user.videoTrack?.stop?.();
      } catch (_e) { }
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
    if (!isHost() || !roomJoinCompleted || agoraStartInProgress) return;
    if (publishSucceeded) {
      // Already "live" but camera may have died after beauty/flip — recover video.
      if (broadcastMode !== 'audio') {
        await ensureHostVideoPublishing().catch((e) =>
          liveDebugLog(`ensureHostVideo: ${e?.message || e}`)
        );
      }
      return;
    }
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
        seedChatProfileCacheFromState(roomState);
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
    if (me?.id && roomState?.hostId) {
      return String(roomState.hostId) === String(me.id);
    }
    /* Until room state has hostId, keep starter-host UI so controls don't vanish */
    if (!roomState?.hostId) {
      return clientClaimsHost();
    }
    return false;
  }

  /** Host controls / host-only chrome — never trust URL ?host=1 alone */
  function isConfirmedRoomHost() {
    const me = currentUser();
    return Boolean(
      roomJoinCompleted &&
      me?.id &&
      roomState?.hostId &&
      String(roomState.hostId) === String(me.id)
    );
  }

  function isLiveRoomPage() {
    return document.body.dataset.livePage === 'live-room';
  }

  function isPartyRoomPage() {
    return document.body.dataset.livePage === 'party-room';
  }

  function canModerateRoom() {
    if (isHost()) return true;
    const meId = currentUser()?.id;
    if (!meId) return false;
    const members = roomState?.onlineMembers || roomState?.seats || [];
    return members.some(
      (m) => String(m.userId) === String(meId) && (m.isAdmin || m.role === 'admin')
    );
  }

  function isRoomHostUserId(userId) {
    if (!userId) return false;
    return String(roomState?.hostId || '') === String(userId);
  }

  function getPartyMembersForList() {
    return getPartyRoomMembers().filter((m) => m?.userId);
  }

  function memberListRoleLabel(m) {
    const hostId = String(roomState?.hostId || '');
    const uid = String(m.userId || '');
    if (hostId && uid === hostId) return 'Host';
    const seated = new Set(
      (roomState?.seats || []).map((s) => String(s.userId || '')).filter(Boolean)
    );
    if (seated.has(uid)) return 'On seat';
    if (m.isAdmin || m.role === 'admin') return 'Admin';
    return 'In room';
  }

  function syncAgoraUidMap() {
    const map = {};
    const list = [...(roomState?.seats || []), ...(roomState?.onlineMembers || [])];
    list.forEach((m) => {
      if (m.userId != null && m.agoraUid != null) map[String(m.agoraUid)] = String(m.userId);
    });
    const me = currentUser()?.id;
    if (me && liveDebugState.agoraUid != null) map[String(liveDebugState.agoraUid)] = String(me);
    window.__apAgoraUidMap = map;
  }

  function openInPartyBrowse(href) {
    const url = String(href || '').startsWith('http')
      ? href
      : String(href || '').startsWith('/')
        ? href
        : '/' + String(href || '');
    if (window.LiveSession?.openBrowsePage?.(url)) return true;
    if (window.LiveSession?.minimize?.(url)) return true;
    location.href = url;
    return false;
  }

  async function ensureMicPublishing() {
    if (!roomJoinCompleted || partyVoiceSkipped) return;
    if (!isPartyRoomPage() && !isLiveRoomPage()) return;
    if (isHost()) {
      if (!publishSucceeded) await resumeHostBroadcastIfNeeded();
      else {
        await ensureHostAudioPublishing();
        await applyLocalMicMuteState();
      }
      syncMicButtonUi();
      return;
    }
    if (!isPartyRoomPage() && !isLiveRoomPage()) return;
    if (hasSpeakerSeat) {
      if (!publishSucceeded || !localTracks.length) {
        guestPublishAttempted = false;
        await publishGuestAudio();
      } else {
        await applyLocalMicMuteState();
      }
      syncMicButtonUi();
    }
  }

  async function stopGuestMediaPublishing({ rejoinAsAudience = false } = {}) {
    publishSucceeded = false;
    guestPublishAttempted = false;
    hasSpeakerSeat = false;
    for (const t of localTracks) {
      try {
        if (agoraClient) await agoraClient.unpublish(t);
      } catch (_e) { }
      try {
        t.stop?.();
        t.close?.();
      } catch (_e) { }
    }
    localTracks = [];
    updateLiveDebug({ hostPublishing: false, publishSucceeded: false });
    syncMicButtonUi();
    if (rejoinAsAudience && agoraClient && channelId()) {
      try {
        await joinAgoraWithRetry(agoraClient, channelId(), false, 2);
      } catch (e) {
        liveDebugLog(`Audience rejoin after demote failed: ${e?.message || e}`);
      }
    }
  }

  function kickUserFromRoom(userId, reason) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    if (isRoomHostUserId(userId)) {
      toast('Cannot remove the room host', 'warning');
      return;
    }
    liveSocket.emit(
      'live:kick',
      { channel: channelId(), userId, reason: reason || 'kicked_by_mod' },
      (res) => {
        if (res?.ok) toast('User removed from room', 'success');
        else toast(res?.message || 'Could not remove user', 'error');
      }
    );
  }

  function muteRemoteUser(userId, muted) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    liveSocket.emit('live:mute', { channel: channelId(), userId, muted: muted !== false });
    toast(muted !== false ? 'User muted' : 'User unmuted', 'info');
  }

  function grantRoomAdmin(userId, grant) {
    if (!isHost() || !liveSocket?.connected || !userId) return;
    liveSocket.emit(
      grant ? 'live:admin_grant' : 'live:admin_revoke',
      { channel: channelId(), userId },
      (res) => {
        if (res?.ok) toast(grant ? 'Admin granted' : 'Admin revoked', 'success');
        else toast(res?.message || 'Could not update admin', 'error');
      }
    );
  }

  function moveUserSeat(userId, seatIndex) {
    if (!liveSocket?.connected) return;
    liveSocket.emit(
      'live:seat_move',
      { channel: channelId(), userId, seatIndex },
      (res) => {
        if (res?.ok) toast('Seat updated', 'success');
        else toast(res?.message || 'Could not move seat', 'error');
      }
    );
  }

  function clearLocalSeatState(userId) {
    const uid = String(userId || '');
    if (!uid || !roomState) return;
    if (Array.isArray(roomState.seats)) {
      roomState.seats = roomState.seats.filter((s) => String(s?.userId) !== uid);
    }
    if (Array.isArray(roomState.onlineMembers)) {
      roomState.onlineMembers = roomState.onlineMembers.map((m) => {
        if (String(m?.userId) !== uid) return m;
        return {
          ...m,
          role: m.role === 'admin' ? 'admin' : 'viewer',
          seatIndex: null,
          seat_index: null,
        };
      });
    }
  }

  function demoteUserFromSeat(userId) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    if (isRoomHostUserId(userId)) {
      toast('Cannot remove the room host', 'warning');
      return;
    }
    liveSocket.emit('live:demote_speaker', { channel: channelId(), userId }, (res) => {
      if (res?.ok) {
        clearLocalSeatState(userId);
        renderRoomState();
        toast(isLiveRoomPage() ? 'Guest removed from live' : 'Removed from seat', 'success');
      } else {
        toast(res?.message || 'Could not remove guest', 'error');
      }
    });
  }

  function toggleRoomLock() {
    if (!isHost() || !liveSocket?.connected) return;
    const locked = Boolean(roomState?.isLocked);
    if (locked) {
      liveSocket.emit('live:room_lock', { channel: channelId(), locked: false }, (res) => {
        if (res?.ok) toast('Room unlocked', 'success');
        else toast(res?.message || 'Could not unlock', 'error');
      });
      return;
    }
    const password = window.prompt('Set a room password (required to join):');
    if (!password || !password.trim()) return;
    liveSocket.emit(
      'live:room_lock',
      { channel: channelId(), locked: true, password: password.trim() },
      (res) => {
        if (res?.ok) toast('Room locked', 'success');
        else toast(res?.message || 'Could not lock room', 'error');
      }
    );
  }

  async function openModerationMenu(name, userId, seatNum) {
    const me = currentUser()?.id;
    if (!userId || String(userId) === String(me)) {
      openProfileSheet(name, userId);
      return;
    }
    // openProfileSheet is async and removes any prior mod menu — attach actions after it finishes.
    await openProfileSheet(name, userId);
    const panel = document.querySelector('#apProfileSheet .ap-profile-sheet-panel');
    if (!panel || !canModerateRoom()) return;
    panel.querySelector('.ap-profile-more-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ap-profile-more-menu';
    panel.appendChild(menu);
    const isTargetHost = isRoomHostUserId(userId);
    const isAdminMember = (roomState?.onlineMembers || []).some(
      (m) => String(m.userId) === String(userId) && (m.isAdmin || m.role === 'admin')
    );
    const removeLabel = isLiveRoomPage() ? 'Remove from live' : 'Remove from seat';
    const kickLabel = isLiveRoomPage() ? 'Remove from room' : 'Kick from room';
    menu.innerHTML = `
      <button type="button" data-mod="mute">Mute user</button>
      <button type="button" data-mod="unmute">Unmute user</button>
      ${isPartyRoomPage() ? '<button type="button" data-mod="move">Move to seat…</button>' : ''}
      <button type="button" data-mod="demote">${removeLabel}</button>
      ${!isTargetHost ? `<button type="button" data-mod="kick">${kickLabel}</button>` : ''}
      ${isHost() && !isTargetHost ? `<button type="button" data-mod="admin">${isAdminMember ? 'Revoke admin' : 'Make admin'}</button>` : ''}`;
    menu.querySelector('[data-mod="mute"]')?.addEventListener('click', () => {
      muteRemoteUser(userId, true);
      menu.remove();
    });
    menu.querySelector('[data-mod="unmute"]')?.addEventListener('click', () => {
      muteRemoteUser(userId, false);
      menu.remove();
    });
    menu.querySelector('[data-mod="move"]')?.addEventListener('click', () => {
      const seat = window.prompt('Seat number (1–15):', String(seatNum || 3));
      if (seat) moveUserSeat(userId, Number(seat));
      menu.remove();
    });
    menu.querySelector('[data-mod="demote"]')?.addEventListener('click', () => {
      demoteUserFromSeat(userId);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick"]')?.addEventListener('click', () => {
      const roomWord = isLiveRoomPage() ? 'live' : 'party';
      if (window.confirm(`Remove ${name} from this ${roomWord}?`)) kickUserFromRoom(userId);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="admin"]')?.addEventListener('click', () => {
      grantRoomAdmin(userId, !isAdminMember);
      menu.remove();
    });
  }

  function openAvailableUsersForSeat(seatNum) {
    openPartyRequestsSheet();
    renderAvailableUsers();
    toast(`Pick someone to move to seat ${seatNum}`, 'info');
    window.__apPendingSeatMove = seatNum;
  }

  function getPartyRoomMembers() {
    const online = roomState?.onlineMembers;
    if (Array.isArray(online) && online.length) return online;
    const hostId = String(roomState?.hostId || '');
    const fromSeats = (roomState?.seats || [])
      .filter((s) => s?.userId)
      .map((s) => ({
        userId: s.userId,
        name: s.name,
        role: s.isHost ? 'host' : s.isAdmin ? 'admin' : 'speaker',
        profilePic: s.profilePic || null,
        muted: s.muted,
        seatIndex: s.seatIndex,
      }));
    if (fromSeats.length) return fromSeats;
    if (hostId && roomState?.hostName) {
      return [{ userId: hostId, name: roomState.hostName, role: 'host', profilePic: roomState.hostProfilePic }];
    }
    return [];
  }

  function getPartyAudienceMembers() {
    const hostId = String(roomState?.hostId || '');
    const seated = new Set(
      (roomState?.seats || []).map((s) => String(s.userId || '')).filter(Boolean)
    );
    return getPartyRoomMembers().filter((m) => {
      if (!m?.userId) return false;
      const uid = String(m.userId);
      if (hostId && uid === hostId) return false;
      if (seated.has(uid)) return false;
      const role = String(m.role || 'viewer');
      return role === 'viewer' || role === 'admin';
    });
  }

  function requestFreshRoomState() {
    if (!liveSocket?.connected || !channelId()) return;
    liveSocket.emit('live:request_state', { channel: channelId() }, (res) => {
      if (res?.ok && res.state) {
        roomState = res.state;
        seedChatProfileCacheFromState(roomState);
        renderRoomState();
      }
    });
  }

  function ensurePartyAudienceBar() {
    if (!isPartyRoomPage() || document.getElementById('partyAudienceBar')) return;
    const hostBar = document.getElementById('partyHostBar');
    if (!hostBar) return;
    hostBar.insertAdjacentHTML(
      'afterend',
      `<div id="partyAudienceBar" class="party-audience-bar" hidden>
        <div class="party-audience-head">
          <span class="party-audience-title"><i class="fas fa-users"></i> In room · <strong id="partyAudienceCount">0</strong></span>
        </div>
        <div class="party-audience-scroll" id="partyAudienceList" role="list"></div>
        <p class="party-audience-empty" id="partyAudienceEmpty">Waiting for guests — tap Share to invite friends</p>
      </div>`
    );
    document.getElementById('partyAudienceList')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-audience-id]');
      if (!chip) return;
      openProfileSheet(chip.dataset.audienceName || 'Guest', chip.dataset.audienceId || '');
    });
  }

  function renderPartyAudienceBar() {
    if (!isPartyRoomPage() || !canModerateRoom()) return;
    ensurePartyAudienceBar();
    const bar = document.getElementById('partyAudienceBar');
    if (!bar) return;
    const audience = getPartyAudienceMembers();
    const countEl = document.getElementById('partyAudienceCount');
    const listEl = document.getElementById('partyAudienceList');
    const emptyEl = document.getElementById('partyAudienceEmpty');
    const usersBtn = document.getElementById('partyBtnRequests');
    const reqBadge = document.getElementById('partyReqCount');
    if (countEl) countEl.textContent = String(audience.length);
    if (reqBadge) {
      const pending = joinRequests.length;
      reqBadge.textContent = String(pending > 0 ? pending : audience.length);
      reqBadge.hidden = pending === 0 && audience.length === 0;
    }
    if (usersBtn) {
      usersBtn.title =
        audience.length > 0
          ? `${audience.length} guest${audience.length === 1 ? '' : 's'} in room`
          : 'View guests in your party room';
    }
    bar.hidden = false;
    if (!audience.length) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (!listEl) return;
    listEl.innerHTML = audience
      .slice(0, 24)
      .map(
        (m) => `
      <button type="button" class="party-audience-chip" data-audience-id="${escapeHtml(String(m.userId))}" data-audience-name="${escapeAttr(m.name || 'Guest')}" role="listitem">
        <img src="${avatarUrl(m.name, m.profilePic)}" alt="">
        <span>${escapeHtml(String(m.name || 'Guest').slice(0, 12))}</span>
      </button>`
      )
      .join('');
    window.SocialUI?.bindAvatarFallbacks?.(listEl);
  }

  function renderAvailableUsers() {
    const list = document.getElementById('partyAvailableList');
    if (!list) return;
    const available = getPartyMembersForList();
    if (!available.length) {
      list.innerHTML = '<p class="party-requests-empty">No one else in the room yet — share to invite friends</p>';
      return;
    }
    const mod = canModerateRoom();
    list.innerHTML = available
      .map((m) => {
        const role = memberListRoleLabel(m);
        const onSeat = role === 'On seat';
        let actionBtn = '';
        if (mod && !isRoomHostUserId(m.userId)) {
          if (onSeat) {
            actionBtn = `<button type="button" class="deny" data-remove-seat="${escapeHtml(String(m.userId))}">Remove</button>`;
          } else {
            actionBtn = `<button type="button" class="accept" data-invite-seat="${escapeHtml(String(m.userId))}">${isLiveRoomPage() ? 'Add' : 'To seat'}</button>`;
          }
        }
        return `
      <div class="party-req-row" data-user-id="${escapeHtml(String(m.userId))}">
        <img src="${avatarUrl(m.name, m.profilePic)}" alt="">
        <div class="info"><strong>${escapeHtml(m.name || 'Guest')}</strong><br><small class="party-online-dot">● ${escapeHtml(role)}</small></div>
        ${actionBtn}
      </div>`;
      })
      .join('');
    list.querySelectorAll('[data-invite-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.inviteSeat;
        if (!uid || !liveSocket?.connected) {
          toast('Not connected — try again', 'error');
          return;
        }
        if (isLiveRoomPage() && countStageGuests() >= LIVE_MAX_GUESTS) {
          toast('Live stage is full — max 4 guests', 'warning');
          return;
        }
        if (isPartyRoomPage() && isPartySeatsFull()) {
          toast('Party is full — max 15 on stage', 'warning');
          return;
        }
        const pendingSeat = window.__apPendingSeatMove;
        const payload = {
          channel: channelId(),
          userId: uid,
          accepted: true,
        };
        if (pendingSeat) payload.seatIndex = pendingSeat;
        btn.disabled = true;
        liveSocket.emit('live:seat_response', payload, (res) => {
          btn.disabled = false;
          window.__apPendingSeatMove = null;
          if (res?.ok) {
            toast(isLiveRoomPage() ? 'Added to live' : 'Added to seat', 'success');
          } else {
            toast(res?.message || 'Could not add to seat', 'error');
          }
        });
      });
    });
    list.querySelectorAll('[data-remove-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.removeSeat;
        const member = available.find((m) => String(m.userId) === String(uid));
        const label = member?.name || 'this guest';
        if (!window.confirm(`Remove ${label} from ${isLiveRoomPage() ? 'live' : 'the seat'}?`)) return;
        demoteUserFromSeat(uid);
      });
    });
    list.querySelectorAll('.party-req-row[data-user-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const uid = row.dataset.userId;
        const member = available.find((m) => String(m.userId) === String(uid));
        if (mod && uid && !isRoomHostUserId(uid)) {
          openModerationMenu(member?.name || 'Guest', uid);
          return;
        }
        openProfileSheet(member?.name || 'Guest', uid);
      });
    });
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
    /* Host chrome (bottom tools + host bar): real host after join, or starting host before join */
    const hosting = isHost();
    document.body.classList.toggle('ap-is-host', hosting);
    document.body.classList.toggle('ap-can-moderate', canModerateRoom() && !hosting);
    const liveHostBar = document.getElementById('liveHostBar');
    if (liveHostBar) {
      if (hosting) {
        liveHostBar.hidden = false;
        liveHostBar.removeAttribute('hidden');
        liveHostBar.setAttribute('aria-hidden', 'false');
        liveHostBar.style.removeProperty('display');
        liveHostBar.style.removeProperty('visibility');
        liveHostBar.style.removeProperty('pointer-events');
      } else {
        liveHostBar.hidden = true;
        liveHostBar.setAttribute('hidden', '');
        liveHostBar.setAttribute('aria-hidden', 'true');
        liveHostBar.style.setProperty('display', 'none', 'important');
        liveHostBar.classList.add('is-collapsed');
        const btn = document.getElementById('liveHostBarToggle');
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.innerHTML = '<i class="fas fa-sliders-h"></i> Host controls';
        }
      }
    }
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
      followed = true;
      syncHostBarUi();
    }
    syncBottomBarForRole();
    renderRoomState();
  }

  let broadcastMode = 'video';
  function initBroadcastMode() {
    broadcastMode = (qs('mode') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video';
  }

  function syncBroadcastModeInUrl(mode) {
    if (!isLiveRoomPage()) return;
    try {
      const params = new URLSearchParams(location.search);
      params.set('mode', mode === 'audio' ? 'audio' : 'video');
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    } catch (_e) { }
  }

  /** Exit voice-live chrome so camera preview is never covered by the audio stage. */
  function clearAudioModeUi() {
    const root = document.getElementById('liveRoomRoot');
    const audioStage = document.getElementById('liveAudioStage');
    const bg = document.getElementById('liveBg');
    const localBox = document.getElementById('liveLocalHost');
    if (root) root.classList.remove('is-audio-mode');
    if (audioStage) {
      audioStage.style.display = 'none';
      audioStage.setAttribute('aria-hidden', 'true');
    }
    if (localBox) localBox.style.display = '';
    if (bg) bg.style.display = 'none';
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

  function resolveMediaUrl(path, cacheKey) {
    if (!path) return null;
    if (window.SocialShell?.getImageUrl) return SocialShell.getImageUrl(path, cacheKey);
    let p = String(path).trim();
    if (!p) return null;
    if (p.startsWith('data:') || p.startsWith('blob:')) return p;
    if (p.startsWith('//')) p = `https:${p}`;
    if (p.startsWith('http://') || p.startsWith('https://')) {
      if (!cacheKey) return p;
      return p + (p.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
    }
    const base = (window.CONFIG?.BACKEND_URL || String(window.CONFIG?.API_URL || '').replace(/\/api\/?$/, '') || '').replace(/\/$/, '');
    const rel = p.startsWith('/') ? p : `/${p}`;
    const url = base ? `${base}${rel}` : rel;
    if (!cacheKey) return url;
    return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
  }

  function avatarUrl(name, profilePic) {
    const resolved = resolveMediaUrl(profilePic);
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name, resolved);
    if (resolved) return resolved;
    const label = String(name || 'U')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#fff">${label}</text></svg>`
    )}`;
  }

  function liveProfilePic(userId, fallbackPic) {
    if (fallbackPic) return fallbackPic;
    const uid = String(userId || '');
    if (uid && roomState?.hostId && uid === String(roomState.hostId)) {
      return roomState.hostProfilePic || null;
    }
    const seat = (roomState?.seats || []).find((s) => uid && String(s.userId) === uid);
    if (seat?.profilePic) return seat.profilePic;
    const online = (roomState?.onlineMembers || []).find((m) => uid && String(m.userId) === uid);
    if (online?.profilePic) return online.profilePic;
    const me = currentUser();
    if (uid && me && uid === String(me.id)) return me.profile_pic || null;
    return null;
  }

  function resolveHostProfilePic() {
    const hostId = String(roomState?.hostId || '');
    const hostSeat = (roomState?.seats || []).find(
      (s) => s?.isHost || (hostId && String(s?.userId) === hostId)
    );
    const pic =
      roomState?.hostProfilePic ||
      hostSeat?.profilePic ||
      liveProfilePic(hostId, isHost() ? currentUser()?.profile_pic : null);
    return pic || null;
  }

  function mergeRoomState(incoming) {
    if (!incoming) return roomState;
    if (!roomState) return incoming;
    const prev = roomState;
    const merged = { ...incoming };
    // Trust server seats. Previously we "carried" missing seats back which made
    // Remove-from-seat look broken (guest stayed on the rail).
    if (!Array.isArray(merged.seats)) merged.seats = Array.isArray(prev.seats) ? prev.seats : [];
    if (!merged.hostProfilePic && prev.hostProfilePic) merged.hostProfilePic = prev.hostProfilePic;
    if (!merged.hostName && prev.hostName) merged.hostName = prev.hostName;
    if (!merged.hostUserRole && prev.hostUserRole) merged.hostUserRole = prev.hostUserRole;
    return merged;
  }

  function collectPartySeatGuests() {
    const hostId = String(roomState?.hostId || '');
    const seen = new Set();
    const guests = [];
    const pushGuest = (g) => {
      if (!g) return;
      const uid = g.userId != null ? String(g.userId) : '';
      const key = uid || String(g.name || '');
      if (!key || (hostId && uid === hostId)) return;
      if (seen.has(key)) return;
      seen.add(key);
      guests.push({
        userId: g.userId,
        name: g.name || 'Guest',
        profilePic: g.profilePic || g.profile_pic || liveProfilePic(g.userId, null),
        muted: Boolean(g.muted),
        gifts: Number(g.gifts || 0),
        seatIndex: g.seatIndex != null ? g.seatIndex : g.seat_index,
        isHost: false,
        isAdmin: Boolean(g.isAdmin || g.role === 'admin'),
        userRole: g.userRole || g.user_role || null,
      });
    };
    (roomState?.seats || []).forEach((s) => {
      if (!s || s.isHost) return;
      pushGuest(s);
    });
    (roomState?.onlineMembers || []).forEach((m) => {
      if (!m || m.role === 'host') return;
      const onStage =
        m.role === 'speaker' ||
        m.role === 'admin' ||
        (m.seatIndex != null && m.role !== 'viewer') ||
        (m.seat_index != null && m.role !== 'viewer');
      if (onStage) pushGuest(m);
    });
    return guests;
  }

  function paintHostAvatarImg(img, hostName) {
    if (!img) return;
    const pic = resolveHostProfilePic();
    const url = avatarUrl(hostName, pic);
    img.alt = hostName || 'Host';
    img.dataset.name = hostName || 'Host';
    if (pic) img.dataset.avatarSrc = String(pic);
    img.onerror = () => {
      img.onerror = null;
      img.src = avatarUrl(hostName, null);
    };
    if (img.src !== url) img.src = url;
    const wrap = img.closest('.party-host-avatar, .live-host-avatar, .ap-host-avatar-wrap') || img.parentElement;
    const admin = Boolean(roomState?.hostIsPlatformAdmin);
    if (wrap) {
      wrap.classList.toggle('ap-admin-frame', admin);
      let tag = wrap.querySelector('.ap-admin-avatar-tag');
      if (admin && !tag) {
        tag = document.createElement('span');
        tag.className = 'ap-admin-avatar-tag';
        tag.textContent = 'ADMIN';
        wrap.appendChild(tag);
      } else if (tag) {
        tag.hidden = !admin;
      }
    }
  }

  async function refreshLiveUserProfile() {
    try {
      await withTimeout(
        (async () => {
          if (window.Auth?.repairSession) {
            await Auth.repairSession();
          } else if (window.Auth?.ensureAccessToken) {
            await Auth.ensureAccessToken();
          } else if (window.Auth?.refreshSession) {
            await Auth.refreshSession();
          }
        })(),
        3000,
        'Session refresh'
      );
    } catch (_e) { }
  }

  function paintLiveTickerStatus(text, ok) {
    const ticker = document.getElementById('liveTicker');
    if (!ticker || !text) return;
    const hostName = roomState?.hostName || 'Host';
    const viewers = roomState?.viewers || 0;
    if (ok === true && /watching live|connected/i.test(text)) {
      ticker.innerHTML =
        '<span class="live-watch-pill">● Watching live</span>' +
        escapeHtml(hostName) +
        ' · ' +
        viewers +
        ' watching';
    } else if (ok === true) {
      ticker.textContent = text;
    }
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
      } catch (_e) { }
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
    const isAudio = mode === 'audio';
    const hasVideoStream =
      Boolean(root?.classList.contains('ap-has-video-stream')) ||
      Boolean(document.body.classList.contains('ap-has-video-stream')) ||
      Boolean(getLocalVideoTrack?.() || rawCameraTrack);
    if (root) root.classList.toggle('is-audio-mode', isAudio);
    if (audioStage) {
      audioStage.style.display = isAudio ? '' : 'none';
      audioStage.setAttribute('aria-hidden', isAudio ? 'false' : 'true');
    }
    if (bg) {
      if (isAudio) {
        bg.style.display = 'block';
        bg.style.background = '';
        bg.style.backgroundImage = `url('${themeCover('audio', name)}')`;
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
      } else if (hasVideoStream && !isAudio) {
        // Keep camera visible — don't re-cover with the audio/live poster.
        bg.style.display = 'none';
      } else {
        bg.style.display = 'block';
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
    if (audioLabel) audioLabel.textContent = isAudio ? 'Voice live' : 'Live';
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop && document.body.classList.contains('live-feed-mode')) {
      backdrop.style.backgroundImage = `url('${themeCover(isAudio ? 'audio' : 'live', name)}')`;
    }
    updateModeBadge(isAudio ? 'audio' : 'video', isHost() && isActuallyLive());
  }

  function updateModeBadge(mode, hosting) {
    const el = document.getElementById('liveModeBadge');
    if (!el) return;
    /* Hosts use the header "You are hosting" label — badge overlaps that pill */
    if (isHost()) {
      el.style.display = 'none';
      el.classList.remove('is-audio', 'is-host');
      return;
    }
    const showHosting = Boolean(hosting);
    el.classList.toggle('is-audio', mode === 'audio' && !showHosting);
    el.classList.toggle('is-host', showHosting);
    if (mode === 'audio') {
      el.innerHTML = '<i class="fas fa-microphone"></i> VOICE LIVE';
    } else {
      el.innerHTML = '<i class="fas fa-video"></i> VIDEO LIVE';
    }
    el.style.display = '';
  }

  async function getCoins(forceFresh = false) {
    if (window.SocialWallet) {
      const b = await SocialWallet.fetchBalance(forceFresh);
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
    } catch (_e) { }
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
    liveSocket.emit('live:end', { channel: channelId() }, () => { });
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
      } catch (_e) { }
    }
    localTracks = [];
    if (agoraClient) {
      try {
        await agoraClient.leave();
      } catch (_e) { }
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
    if (isParty && !sessionEstablished) onRoomReady();
    refreshViewerDiagnostics();

    // Auto-recover intermittent publish/join failures (not permission/billing blocks).
    const skipAuto =
      reason === 'media_blocked' ||
      /permission|NotAllowed|billing|CAN_NOT_GET_GATEWAY|suspended|quota/i.test(String(msg || '') + reason);
    if (!skipAuto && !window.__apHostPublishAutoTries) window.__apHostPublishAutoTries = 0;
    if (!skipAuto && window.__apHostPublishAutoTries < 3) {
      window.__apHostPublishAutoTries += 1;
      setTimeout(() => {
        if (socketLeaveIntentional) return;
        resumeHostBroadcastIfNeeded()
          .then(() => {
            if (publishSucceeded) window.__apHostPublishAutoTries = 0;
          })
          .catch(() => { });
      }, 1500 * window.__apHostPublishAutoTries);
    }
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
    if (liveDebugState.roomJoined) return 'Connecting voice…';
    return 'Connecting…';
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
      setLiveStatus(isPartyRoomPage() ? 'In party' : 'In room', true);
    }
  }

  function dbgYesNo(val) {
    return val ? 'yes' : 'no';
  }

  /** Dev-only overlay — off in native app and production unless explicitly enabled */
  function isLiveDebugEnabled() {
    try {
      if (localStorage.getItem('ap_live_debug') === '1') return true;
    } catch (_e) { }
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

    if (window.Auth?.repairSession) {
      try {
        const repaired = await Auth.repairSession();
        if (repaired) {
          const repairedTok = localStorage.getItem('token');
          if (repairedTok && (!Auth.isAccessTokenUsable || Auth.isAccessTokenUsable(repairedTok))) {
            cachedWsToken = repairedTok;
            cachedWsTokenAt = now;
            return repairedTok;
          }
        }
      } catch (_e) {
        /* fall through */
      }
    }

    if (window.API?.get) {
      try {
        const res = await API.get('/auth/ws-token');
        if (res?.data?.accessToken) {
          localStorage.setItem('token', res.data.accessToken);
          if (res.data.refreshToken) {
            localStorage.setItem('ap_refresh_token', res.data.refreshToken);
          }
          cachedWsToken = res.data.accessToken;
          cachedWsTokenAt = now;
          return res.data.accessToken;
        }
      } catch (_e) {
        /* fall through */
      }
    }

    const apiBase =
      (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) ||
      (window.CONFIG && CONFIG.API_URL) ||
      '/api';
    const base = apiBase.replace(/\/$/, '');

    async function tryFetch(path, options, bodyObj) {
      const headers = { 'Content-Type': 'application/json', ...(options?.headers || {}) };
      const bearer = localStorage.getItem('token');
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const res = await fetch(`${base}${path}`, {
        credentials: 'include',
        ...options,
        headers,
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
      lastSocketIssue = 'missing auth token';
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
        if (/invalid token|authentication required|jwt expired|unauthorized/i.test(msg) && !socketAuthRetrying) {
          socketAuthRetrying = true;
          try {
            localStorage.removeItem('token');
            cachedWsToken = null;
            if (window.Auth?.repairSession) await Auth.repairSession().catch(() => { });
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
        const prevSeatIds = new Set(
          (roomState?.seats || [])
            .filter((s) => s && !s.isHost && s.userId)
            .map((s) => String(s.userId))
        );
        const prevViewers = roomState?.viewers || lastViewerCount;
        roomState = mergeRoomState(state);
        seedChatProfileCacheFromState(roomState);
        hydrateGiftHistoryFromState(roomState);
        if (state?.viewers != null && state.viewers !== prevViewers) {
          window.SocialFX?.onViewerCountChange?.(state.viewers, prevViewers);
        }
        const nextSeatIds = (roomState?.seats || [])
          .filter((s) => s && !s.isHost && s.userId)
          .map((s) => String(s.userId));
        const seatAdded = nextSeatIds.some((id) => !prevSeatIds.has(id));
        if (renderRoomStateTimer) clearTimeout(renderRoomStateTimer);
        renderRoomStateTimer = setTimeout(() => {
          renderRoomStateTimer = null;
          renderRoomState({ soft: sessionEstablished });
          renderRoomGiftPanels();
          // New on-seat guest — pull their mic (host + other viewers)
          if (seatAdded && agoraClient && liveDebugState.agoraJoined) {
            resubscribeAllRemoteMedia().catch(() => { });
            ensureRemoteAudioPlaying().catch(() => { });
            setTimeout(() => {
              resubscribeAllRemoteMedia().catch(() => { });
              ensureRemoteAudioPlaying().catch(() => { });
            }, 800);
          }
        }, 80);
      });

      liveSocket.on('live:guest_mic_ready', (payload) => {
        const uid = payload?.userId != null ? String(payload.userId) : '';
        const me = currentUser();
        if (uid && me && uid === String(me.id)) return;
        liveDebugLog(`guest_mic_ready from ${uid || payload?.agoraUid || '?'}`);
        resubscribeAllRemoteMedia().catch(() => { });
        ensureRemoteAudioPlaying().catch(() => { });
        setTimeout(() => ensureRemoteAudioPlaying().catch(() => { }), 600);
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
        if (me && String(me.id) === uid) {
          micMuted = muted;
          void applyLocalMicMuteState();
        }
        patchSeatMuteUi(uid, muted);
        syncMicButtonUi();
      });

      liveSocket.on('live:chat', (msg) => {
        rememberChatMessage(msg);
        const em = extractEmojiReaction(msg?.text);
        if (em && msg?.userId) spawnSeatEmojiReaction(msg.userId, em);
        if (msg && /joined/i.test(msg.text || '') && msg.user) {
          window.SocialFX?.showJoinBanner?.({ name: msg.user, avatar: avatarUrl(msg.user, getChatProfilePic(msg)) });
        }
        renderChatFeed();
      });

      liveSocket.on('live:gift', (gift) => {
        if (gift) {
          pushRoomGift(gift);
          rememberChatMessage({
            type: 'gift',
            user: gift.from || gift.senderName || 'User',
            userId: gift.fromUserId || gift.senderId || null,
            text: `${gift.emoji || '🎁'} sent to ${gift.to || gift.recipientName || 'Host'} · ${formatGiftCount(gift.amount || gift.coins || 0)} coins`,
            gift,
          });
          renderChatFeed();
        }
        showWinBanner(gift);
        showGiftFlyBanner(gift);
        const combo = window.SocialFX?.trackCombo?.(gift?.emoji || 'gift', gift?.qty || 1) || 1;
        window.SocialFX?.playGift?.(gift, { combo });
        onGiftTeamProgress(gift?.amount || gift?.coins || 100);
        if (roomState) renderRoomState();
        renderRoomGiftPanels();
        /* Host points (stars) update after gift settlement */
        if (isConfirmedRoomHost() || isHost()) {
          refreshCoinDisplay().catch(() => { });
          if (window.SocialWallet?.fetchBalance) SocialWallet.fetchBalance(true).catch(() => { });
        }
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
        if (roomState) roomState.viewers = viewers;
        const el = document.getElementById('liveViewerCount');
        if (el) el.textContent = String(viewers);
        if (isHost() && isPartyRoomPage() && viewers !== getPartyAudienceMembers().length + 1) {
          requestFreshRoomState();
        } else {
          renderTopGifters();
          renderPartyAudienceBar();
        }
      });

      liveSocket.on('live:seat_request', (req) => {
        if (!canModerateRoom() || !req) return;
        const id = String(req.userId || req.id || '');
        if (!id || joinRequests.some((r) => String(r.id) === id)) return;
        joinRequests.push({
          id,
          name: req.name || 'Guest',
          userId: id,
        });
        renderJoinRequests();
        toast(`${req.name || 'Someone'} wants to join${isLiveRoomPage() ? ' the stream' : ' a seat'}`);
      });

      liveSocket.on('live:seat_response', async (res) => {
        if (!res || isHost()) return;
        const me = currentUser();
        if (String(res.userId) !== String(me?.id)) return;
        if (res.accepted) {
          hasSpeakerSeat = true;
          guestPublishAttempted = false;
          publishSucceeded = false;
          hideMicLinkModal();
          toast(isLiveRoomPage() ? 'You joined the live — enabling mic…' : 'You got a seat — enabling mic…', 'success');
          // Brief wait so publisher-token ACL sees the new speaker/seat row
          await new Promise((r) => setTimeout(r, 250));
          await publishGuestAudio();
          if (!publishSucceeded) {
            await new Promise((r) => setTimeout(r, 800));
            await publishGuestAudio();
          }
          if (isPartyRoomPage()) renderPartySeats(roomState?.hostName);
          else renderGuestRail();
        } else {
          showMicLinkModal('rejected');
          toast(isLiveRoomPage() ? 'Join request declined' : 'Seat request declined');
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
          return;
        }
        renderRoomState();
      });

      liveSocket.on('live:demoted', (payload) => {
        const me = currentUser();
        const uid = payload?.userId;
        if (uid) clearLocalSeatState(uid);
        if (me && String(uid) === String(me.id)) {
          stopGuestMediaPublishing({ rejoinAsAudience: true }).catch(() => { });
          toast(
            isLiveRoomPage() ? 'Host removed you from live' : 'You were removed from the seat',
            'warning'
          );
        }
        renderRoomState();
      });

      liveSocket.on('live:admin_changed', (payload) => {
        const me = currentUser();
        if (me && String(payload?.userId) === String(me.id)) {
          toast(payload?.isAdmin ? 'You are now a room admin' : 'Admin access removed', 'info');
        }
        renderRoomState();
      });

      liveSocket.on('live:room_style', (payload) => {
        if (!roomState) return;
        roomState.roomStyle = payload || roomState.roomStyle;
        applyRoomBackground(payload?.backgroundId || roomState.roomStyle?.backgroundId);
      });

      liveSocket.on('live:room_lock', (payload) => {
        if (roomState) roomState.isLocked = payload?.locked !== false;
        toast(payload?.locked !== false ? 'Room is now locked' : 'Room unlocked', 'info');
        renderRoomState();
      });

      liveSocket.on('live:seat_moved', () => {
        renderRoomState();
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
      }, 15000);

      const emitJoin = (joinPayload = {}) => {
        liveSocket.emit(
          'live:join',
          {
            channel: ch,
            type: type === 'live' ? 'live' : 'party',
            displayName: displayName(user),
            isHost: hostFlag,
            ...joinPayload,
          },
          (res) => {
            clearTimeout(timer);
            console.log('[live] live:join ack', { channel: ch, isHost: hostFlag, res });
            liveDebugLog(
              `live:join ack channel=${ch} ok=${Boolean(res?.ok)} msg=${res?.message || 'none'}`
            );
            if (res?.needsPassword) {
              const pwd = window.prompt(res?.message || 'This room is locked. Enter password:');
              if (pwd) emitJoin({ password: pwd });
              else reject(new Error('Room password required'));
              return;
            }
            if (res?.ok) {
              roomState = res.state || { channel: ch, viewers: 1, hostName: displayName(user) };
              seedChatProfileCacheFromState(roomState);
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
              finalizeRoomEntry();
              try {
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
              } catch (renderErr) {
                console.error('[live] post-join render failed', renderErr);
              }
              setApLoaderStep(2);
              setLiveStatus(serverIsHost ? 'Setting up voice…' : 'In room', serverIsHost ? null : true);
              if (serverIsHost) {
                syncLiveUiState();
                const isPartyPage = document.body.dataset.livePage === 'party-room';
                toast(
                  isPartyPage
                    ? 'Party live — share the link so others join this room'
                    : 'You are live — share so viewers can find you',
                  'success'
                );
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
    stopPartyMusic();
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
    } catch (_e) { }
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
    hasSpeakerSeat = false;
    guestPublishAttempted = false;
    guestPublishInProgress = false;
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

  async function fetchAgoraToken(channel, asPublisher = false) {
    const user = currentUser();
    const userId = user?.id != null ? String(user.id) : null;
    const isActualHost = Boolean(
      (roomState?.hostId && user?.id && String(roomState.hostId) === String(user.id)) ||
      (qs('host') === '1' && !hasSpeakerSeat && !roomState?.hostId)
    );
    // Publisher request must NOT imply host — seated guests need publisher tokens too.
    const wantsPublisher = Boolean(asPublisher) || isActualHost || hasSpeakerSeat;
    const role = wantsPublisher ? (isActualHost ? 'host' : 'publisher') : 'audience';
    const roomType = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';

    liveDebugLog(
      `Token request channel=${channel} role=${role} asPublisher=${Boolean(asPublisher)} seated=${hasSpeakerSeat} userId=${userId}`
    );
    forensicEvent('TOKEN_REQUEST_START', {
      channel,
      role,
      asPublisher: Boolean(asPublisher),
      hasSpeakerSeat,
      userId,
      roomType,
    });

    const payloads = [
      { channel, role },
      {
        channel,
        role,
        isHost: isActualHost,
        asHost: isActualHost,
        roomType,
        type: roomType,
        hostId: roomState?.hostId,
        seated: hasSpeakerSeat,
      },
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
      forensicEvent('TOKEN_REQUEST_FAILED', {
        channel,
        role,
        hasSpeakerSeat,
        userId,
        message: lastErr?.message || data?.message,
      });
      const raw = lastErr?.message || data?.message || 'Agora token request failed';
      if (/publisher token requires/i.test(raw)) {
        if (!liveDebugState.socketConnected) {
          throw new Error(
            'Real-time socket not connected — room must join before going live. Reload and check Socket: YES in the debug bar.'
          );
        }
        if (!roomJoinCompleted) {
          throw new Error('Room not joined yet — wait for socket connection, then try again.');
        }
        if (hasSpeakerSeat) {
          throw new Error('Seat accepted but mic token denied — ask host to remove/re-add you to the seat.');
        }
        throw new Error(
          'Server does not recognize you as host for this room. Start a new live/party from Streamer Center.'
        );
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
      hasSpeakerSeat,
      userId,
      uid: data.uid,
      mode: data.mode,
    });
    liveDebugLog(`Token OK mode=${data.mode} uid=${data.uid} channel=${tokenChannel} role=${role}`);
    updateLiveDebug({ tokenReceived: true });
    return data;
  }

  function agoraUidFromCred(cred) {
    if (cred?.uid == null || cred.uid === '') return null;
    const n = Number(cred.uid);
    return Number.isFinite(n) ? n : null;
  }

  function friendlyAgoraError(msg) {
    const raw = String(msg || '');
    if (/CAN_NOT_GET_GATEWAY/i.test(raw)) {
      return 'Live audio/video is blocked: Agora account suspended (unpaid balance). Open Agora Console → Billing, add a card or top up until Available Balance is $0 or positive, then start a new live.';
    }
    if (/quota|minutes|exhausted/i.test(raw)) {
      return 'Agora quota exceeded — top up minutes in Agora Console Billing, then retry.';
    }
    if (/dynamic use static key|invalid token|token/i.test(raw)) {
      return 'Agora token invalid — check AGORA_APP_ID / AGORA_APP_CERTIFICATE on the server.';
    }
    if (/permission|NotAllowedError|NotFoundError|Could not start video source/i.test(raw)) {
      return 'Camera/mic permission blocked — allow access in browser/app settings and retry.';
    }
    return raw || 'Voice connection failed';
  }

  function bindAgoraClientHandlers(client, agoraChannel) {
    if (!client || client.__apHandlersBound) return;
    client.__apHandlersBound = true;
    client.on('user-published', async (user, mediaType) => {
      liveDebugLog(`user-published uid=${user.uid} media=${mediaType}`);
      forensicEvent('REMOTE_USER_PUBLISHED', { uid: user.uid, mediaType, channel: agoraChannel });
      await playRemoteMedia(user, mediaType);
    });
    client.on('user-unpublished', (user, mediaType) => {
      liveDebugLog(`user-unpublished uid=${user.uid} media=${mediaType || 'all'}`);
      const existing = remoteUsers.get(user.uid) || user;
      if (mediaType === 'video') {
        try {
          existing.videoTrack?.stop?.();
        } catch (_e) { }
        const container = document.getElementById('liveRemoteHost');
        if (container && !existing.hasAudio) {
          // Keep last frame briefly; only clear if nothing else is published.
        }
      } else if (mediaType === 'audio') {
        try {
          existing.audioTrack?.stop?.();
        } catch (_e) { }
      }
      const stillHasVideo = mediaType === 'audio' ? Boolean(existing.hasVideo || existing.videoTrack) : false;
      const stillHasAudio = mediaType === 'video' ? Boolean(existing.hasAudio || existing.audioTrack) : false;
      if (!mediaType || (!stillHasVideo && !stillHasAudio && !existing.hasVideo && !existing.hasAudio)) {
        remoteUsers.delete(user.uid);
      } else {
        remoteUsers.set(user.uid, existing);
      }
      updateLiveDebug({ remoteUsersCount: remoteUsers.size });
      const container = document.getElementById('liveRemoteHost');
      if (container && remoteUsers.size === 0 && mediaType !== 'audio') {
        // Don't wipe on audio-only unpublish; camera flip briefly unpublishes video.
        if (mediaType === 'video') {
          // Leave container — health watchdog / republish will restore.
        } else {
          container.innerHTML = '';
          setLiveStreamVisible(false);
          if (!isHost()) applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
        }
      }
      syncLiveUiState();
    });
    client.on('token-privilege-will-expire', () => {
      refreshAgoraTokenAndRenew().catch(() => { });
    });
    client.on('connection-state-change', (cur, prev, reason) => {
      liveDebugLog(`Agora connection ${prev} → ${cur} (${reason || ''})`);
      if (cur === 'CONNECTED' && prev && prev !== 'CONNECTED') {
        resubscribeAllRemoteMedia().catch(() => { });
        if (isHost() || hasSpeakerSeat) ensureMicPublishing().catch(() => { });
      }
      if (cur === 'DISCONNECTED' || cur === 'FAILED') {
        scheduleMediaRecover('connection_' + cur);
      }
    });
    startMediaHealthWatchdog();
  }

  async function refreshAgoraTokenAndRenew() {
    if (!agoraClient?.renewToken || !liveDebugState.agoraJoined) return;
    const asPublisher = isHost() || hasSpeakerSeat;
    const cred = await fetchAgoraToken(channelId(), asPublisher);
    if (!cred?.token) return;
    await agoraClient.renewToken(cred.token);
    liveDebugLog('Agora token renewed');
  }

  let __mediaRecoverTimer = null;
  let __mediaRecoverBusy = false;
  let __mediaBadStreak = 0;

  async function resubscribeAllRemoteMedia() {
    if (!agoraClient || !liveDebugState.agoraJoined) return;
    const remotes = agoraClient.remoteUsers || [];
    for (const user of remotes) {
      try {
        if (user.hasVideo) await playRemoteMedia(user, 'video');
        if (user.hasAudio) await playRemoteMedia(user, 'audio');
      } catch (_e) { }
    }
  }

  function scheduleMediaRecover(reason) {
    if (__mediaRecoverTimer) return;
    __mediaRecoverTimer = setTimeout(async () => {
      __mediaRecoverTimer = null;
      if (__mediaRecoverBusy || socketLeaveIntentional) return;
      __mediaRecoverBusy = true;
      try {
        liveDebugLog(`media recover: ${reason}`);
        if (!agoraClient || !liveDebugState.agoraJoined) {
          const page = document.body.dataset.livePage;
          await startAgora(page === 'party-room' ? 'party' : 'live');
        } else {
          await resubscribeAllRemoteMedia();
          if ((isHost() || hasSpeakerSeat) && !publishSucceeded) {
            await ensureMicPublishing();
          }
          if (isHost() && broadcastMode !== 'audio' && publishSucceeded) {
            await ensureHostVideoPublishing();
          }
          if (isHost() && publishSucceeded) {
            await ensureHostAudioPublishing();
          }
          if (!isHost()) {
            await resubscribeAllRemoteMedia();
            await ensureRemoteAudioPlaying();
          }
        }
      } catch (e) {
        liveDebugLog(`media recover failed: ${e?.message || e}`);
      } finally {
        __mediaRecoverBusy = false;
      }
    }, 1200);
  }

  function hasPlayingRemoteVideo() {
    const container = document.getElementById('liveRemoteHost');
    const vid = container?.querySelector?.('video');
    if (!vid) return false;
    return !vid.paused && vid.readyState >= 2 && vid.videoWidth > 0;
  }

  function startMediaHealthWatchdog() {
    if (window.__apMediaHealthWatch) return;
    window.__apMediaHealthWatch = setInterval(() => {
      if (socketLeaveIntentional || !roomJoinCompleted) return;
      if (document.visibilityState !== 'visible') return;
      if (!agoraClient || !liveDebugState.agoraJoined) {
        __mediaBadStreak += 1;
        if (__mediaBadStreak >= 2) scheduleMediaRecover('not_joined');
        return;
      }

      const remotes = agoraClient.remoteUsers || [];
      const expectRemoteAv = !isHost() || remotes.length > 0;
      let unhealthy = false;

      if (!isHost() && remotes.length === 0) {
        // Host may briefly have no remotes during camera flip — wait a bit.
        __mediaBadStreak += 1;
        if (__mediaBadStreak >= 3) unhealthy = true;
      }

      for (const user of remotes) {
        if (user.hasVideo && !hasPlayingRemoteVideo()) unhealthy = true;
        if (user.hasAudio && soundOn) {
          if (!user.audioTrack) {
            unhealthy = true;
          } else {
            try {
              const p = user.audioTrack.play?.();
              if (p && typeof p.then === 'function') {
                p.catch(() => {
                  showTapForSoundHint();
                });
              }
            } catch (_e) {
              unhealthy = true;
              showTapForSoundHint();
            }
          }
        }
      }

      if (isHost() && publishSucceeded) {
        const audioOk = isLocalMicHealthy();
        const videoOk =
          broadcastMode === 'audio' || isPartyRoomPage() ? true : isLocalCameraHealthy();
        if (!audioOk || !videoOk) unhealthy = true;
      }
      if (!isHost() && hasSpeakerSeat && publishSucceeded) {
        if (!isLocalMicHealthy()) unhealthy = true;
      }

      if (unhealthy) {
        __mediaBadStreak += 1;
        if (__mediaBadStreak >= 2) {
          __mediaBadStreak = 0;
          scheduleMediaRecover('health_watchdog');
        }
      } else {
        __mediaBadStreak = 0;
      }
    }, 4000);
  }

  async function joinAgoraWithRetry(client, channel, asPublisher, maxAttempts = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let cred;
      try {
        cred = await fetchAgoraToken(channel, asPublisher);
      } catch (e) {
        lastErr = e;
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      const appId = String(cred?.appId || '').trim();
      const token = cred?.token;
      const agoraChannel = cred?.channel || channel;
      const uid = agoraUidFromCred(cred);
      if (!appId || !token) {
        lastErr = new Error(cred?.message || 'Missing Agora appId or token');
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      try {
        if (liveDebugState.agoraJoined && client) {
          try {
            await client.leave();
          } catch (_e) { }
          liveDebugState.agoraJoined = false;
        }
        bindAgoraClientHandlers(client, agoraChannel);
        await withTimeout(
          client.join(appId, agoraChannel, token, uid),
          12000,
          'Voice channel join'
        );
        auditChannel('agora', agoraChannel);
        liveDebugLog(`Agora join OK channel=${agoraChannel} uid=${uid} attempt=${attempt}`);
        updateLiveDebug({ agoraJoined: true, agoraUid: uid });
        syncAgoraUidMap();
        return { appId, token, channel: agoraChannel, uid };
      } catch (e) {
        lastErr = e;
        liveDebugLog(`Agora join attempt ${attempt}/${maxAttempts} failed: ${e?.message || e}`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 900 * attempt));
        }
      }
    }
    throw lastErr || new Error('Agora join failed');
  }

  function schedulePartyAgoraRetry() {
    if (window.__apPartyAgoraRetryTimer) return;
    let tries = 0;
    window.__apPartyAgoraRetryTimer = setInterval(async () => {
      if (!isPartyRoomPage() || !roomJoinCompleted || liveDebugState.agoraJoined || isHost()) {
        clearInterval(window.__apPartyAgoraRetryTimer);
        window.__apPartyAgoraRetryTimer = null;
        return;
      }
      tries += 1;
      if (tries > 6) {
        clearInterval(window.__apPartyAgoraRetryTimer);
        window.__apPartyAgoraRetryTimer = null;
        setLiveStatus('Voice unavailable — chat still works', null);
        return;
      }
      try {
        await startAgora('party');
        partyVoiceSkipped = false;
        clearInterval(window.__apPartyAgoraRetryTimer);
        window.__apPartyAgoraRetryTimer = null;
      } catch (_e) { }
    }, 5000);
  }

  function setApLoaderStep(_step) {
    /* steps UI removed — host cover loader only */
  }

  function readLaunchCover(channel) {
    try {
      const raw = sessionStorage.getItem('ap_live_launch_cover');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data) return null;
      if (channel && data.channel && String(data.channel) !== String(channel)) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function stashLaunchCover(channel, name, image) {
    if (!channel || !image) return;
    try {
      sessionStorage.setItem(
        'ap_live_launch_cover',
        JSON.stringify({
          channel: String(channel),
          name: String(name || 'Host'),
          image: String(image),
          ts: Date.now(),
        })
      );
    } catch (_e) { }
  }

  function resolveEntryCoverUrl(name, profilePic, party) {
    const label = String(name || 'Host').trim() || 'Host';
    if (profilePic) {
      const resolved =
        window.SocialShell?.getImageUrl?.(profilePic) ||
        (String(profilePic).startsWith('http') || String(profilePic).startsWith('data:')
          ? profilePic
          : null);
      if (resolved) return avatarUrl(label, resolved);
    }
    if (isHost()) {
      const custom = getStreamCoverUrl(label);
      if (custom) return custom;
    }
    return themeCover(party ? 'party' : 'live', label);
  }

  function paintApLoaderCover(name, profilePic, party, opts) {
    const options = opts || {};
    const loader = document.getElementById('apLiveLoader');
    const cover = document.getElementById('apLiveLoaderCover');
    const avatar = document.getElementById('apLiveLoaderAvatar');
    const label = document.getElementById('apLiveLoaderText');
    const pulse = document.querySelector('.ap-live-loader-pulse');
    if (!loader || !cover) return;

    const isParty = party != null ? Boolean(party) : isPartyRoomPage();
    const hostName = String(name || roomState?.hostName || 'Host').trim() || 'Host';
    const pic = profilePic || roomState?.hostProfilePic || null;
    const imageUrl = resolveEntryCoverUrl(hostName, pic, isParty);

    if (imageUrl) {
      cover.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, '\\"')}")`;
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
    }

    if (avatar) {
      const avatarSrc = avatarUrl(hostName, pic);
      if (avatarSrc) {
        avatar.src = avatarSrc;
        avatar.alt = hostName;
        avatar.hidden = false;
      } else {
        avatar.hidden = true;
      }
    }

    if (label && options.text) {
      label.textContent = options.text;
    } else if (label && !roomJoinCompleted) {
      label.textContent = isParty ? 'Entering ' + hostName + "'s party" : 'Entering ' + hostName + "'s live";
    }
    if (pulse) pulse.textContent = isParty ? 'Party' : 'Live';

    const mayShow =
      !apLoaderDismissed &&
      options.show !== false &&
      !roomJoinCompleted &&
      !sessionEstablished;
    if (mayShow) {
      loader.classList.remove('is-hidden');
      loader.style.display = '';
      scheduleLoaderForceDismiss();
    } else if (roomJoinCompleted || sessionEstablished || apLoaderDismissed) {
      hideApLoader();
    }
  }

  let apLoaderForceTimer = null;
  let apLoaderDismissed = false;

  function forceRevealRoomShell() {
    apLoaderDismissed = true;
    document.body.classList.add('ap-room-active');
    const loader = document.getElementById('apLiveLoader');
    if (loader) {
      loader.classList.add('is-hidden');
      loader.style.display = 'none';
      loader.style.visibility = 'hidden';
      loader.style.pointerEvents = 'none';
    }
    if (apLoaderForceTimer) {
      clearTimeout(apLoaderForceTimer);
      apLoaderForceTimer = null;
    }
  }

  function scheduleLoaderForceDismiss(ms) {
    const wait = ms || 3500;
    if (apLoaderForceTimer) clearTimeout(apLoaderForceTimer);
    apLoaderForceTimer = setTimeout(() => {
      apLoaderForceTimer = null;
      forceRevealRoomShell();
      if (roomJoinCompleted && !sessionEstablished) onRoomReady();
      else if (!sessionEstablished) {
        sessionEstablished = true;
        syncLiveUiState();
      }
    }, wait);
  }

  function installLoaderEscapeHatch() {
    if (window.__apLoaderEscapeInstalled) return;
    window.__apLoaderEscapeInstalled = true;
    scheduleLoaderForceDismiss(2500);
    setTimeout(() => {
      forceRevealRoomShell();
      if (roomJoinCompleted && !sessionEstablished) onRoomReady();
      else if (!sessionEstablished) {
        sessionEstablished = true;
        syncLiveUiState();
      }
    }, 5000);
  }

  function bindApLoaderDismiss() {
    const skip = document.getElementById('apLiveLoaderSkip');
    const loader = document.getElementById('apLiveLoader');
    const dismiss = () => {
      forceRevealRoomShell();
      if (roomJoinCompleted && !sessionEstablished) onRoomReady();
      else if (!sessionEstablished) {
        sessionEstablished = true;
        syncLiveUiState();
      }
    };
    skip?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    });
    loader?.addEventListener('click', (e) => {
      if (e.target === skip || skip?.contains(e.target)) return;
      if (!loader.classList.contains('is-hidden')) dismiss();
    });
  }

  async function primeApLoaderCover() {
    if (!isLiveRoomPage() && !isPartyRoomPage()) return;
    const party = isPartyRoomPage();
    const ch = channelId();
    const qs = new URLSearchParams(location.search);
    const launch = readLaunchCover(ch);
    let name = launch?.name || qs.get('hostName') || qs.get('host') || '';
    let pic = qs.get('profilePic') || null;

    if (launch?.image) {
      const cover = document.getElementById('apLiveLoaderCover');
      const avatar = document.getElementById('apLiveLoaderAvatar');
      if (cover) {
        cover.style.backgroundImage = `url("${String(launch.image).replace(/"/g, '\\"')}")`;
        cover.style.backgroundSize = 'cover';
        cover.style.backgroundPosition = 'center';
      }
      if (avatar && launch.image) {
        avatar.src = launch.image;
        avatar.alt = launch.name || name || 'Host';
        avatar.hidden = false;
      }
      paintApLoaderCover(launch.name || name || 'Host', pic, party);
      return;
    }

    if (isHost()) {
      const me = currentUser();
      name = name || displayName(me);
      pic = pic || me?.profile_pic || null;
      paintApLoaderCover(name, pic, party);
      return;
    }

    if (!pic && ch && window.API) {
      try {
        const fetchList = API.getFresh || API.get;
        const type = party ? 'party' : 'live';
        const res = await fetchList(`/live/rooms?type=${type}&limit=40`);
        const rows = Array.isArray(res?.data) ? res.data : [];
        const room = rows.find((r) => String(r.channel) === String(ch));
        if (room) {
          name = name || room.hostName || 'Host';
          pic = room.hostProfilePic || room.host_profile_pic || null;
        }
      } catch (_e) { }
    }

    paintApLoaderCover(name || 'Host', pic, party);
  }

  function showApLoader(text, _step) {
    if (apLoaderDismissed || roomJoinCompleted || sessionEstablished) {
      hideApLoader();
      return;
    }
    const loader = document.getElementById('apLiveLoader');
    const txt = document.getElementById('apLiveLoaderText');
    if (txt && text) txt.textContent = text;
    if (loader) {
      loader.classList.remove('is-hidden');
      loader.style.display = '';
    }
    scheduleLoaderForceDismiss();
  }

  function hideApLoader() {
    apLoaderDismissed = true;
    if (apLoaderForceTimer) {
      clearTimeout(apLoaderForceTimer);
      apLoaderForceTimer = null;
    }
    const loader = document.getElementById('apLiveLoader');
    if (loader) {
      loader.classList.add('is-hidden');
      loader.style.display = 'none';
      loader.style.visibility = 'hidden';
      loader.style.pointerEvents = 'none';
    }
    document.body.classList.add('ap-room-active');
    try {
      sessionStorage.removeItem('ap_live_launch_cover');
    } catch (_e) { }
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

  function handleRoomJoinFailure() {
    hideApLoader();
    const authish = /sign in|session|token|auth|expired|not logged/i.test(lastSocketIssue || '');
    setLiveStatus(
      authish
        ? 'Session expired — please sign in again'
        : 'Could not join room — check connection and retry',
      false
    );
    if (authish) {
      setTimeout(() => {
        location.href =
          '/app-auth.html?app=1&redirect=' + encodeURIComponent(location.pathname + location.search);
      }, 1600);
    }
  }

  function setLiveStatus(text, ok) {
    const el = document.getElementById('liveStatusBadge');
    const strip = document.getElementById('apRoomStatusStrip');
    const show = Boolean(text);
    const viewerOk = ok === true && !isHost();
    const roomReady = roomJoinCompleted || sessionEstablished;
    if (viewerOk) {
      paintLiveTickerStatus(text, ok);
      if (el) el.style.display = 'none';
      if (strip) strip.classList.remove('is-visible');
      document.body.classList.remove('ap-live-status-visible');
      hideApLoader();
      setApLoaderStep(3);
      return;
    }
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
    if (loaderTxt && text && !roomReady) loaderTxt.textContent = text;
    if (ok === true) {
      setApLoaderStep(3);
      hideApLoader();
    } else if (ok === false) {
      hideApLoader();
      if (text) toast(text, 'error');
    } else if (text && !roomReady && !isActuallyLive() && !apLoaderDismissed) {
      showApLoader(text);
    }
  }

  function onRoomReady() {
    sessionEstablished = true;
    document.body.classList.add('ap-room-active');
    setApLoaderStep(3);
    hideApLoader();
    syncLiveUiState();
    window.LiveSession?.onRoomActive?.();
  }

  function finalizeRoomEntry() {
    if (!sessionEstablished) onRoomReady();
    else hideApLoader();
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
    if (sessionEstablished) {
      setLiveStatus(
        host
          ? isPartyRoomPage()
            ? 'Connecting microphone…'
            : 'Starting camera & mic…'
          : isPartyRoomPage()
            ? 'Connecting to party audio…'
            : 'Connecting to live…',
        null
      );
    } else {
      showApLoader(host ? 'Starting your broadcast…' : 'Connecting to live…', 2);
      setLiveStatus(host ? 'Starting camera & mic…' : 'Connecting to live…', null);
    }
    updateModeBadge(broadcastMode, false);

    const agoraDeadline = setTimeout(() => {
      if (publishSucceeded || partyVoiceSkipped) return;
      if (isHost()) {
        const msg = 'Broadcast setup is taking too long. Tap mic to retry, or allow camera/mic in app settings.';
        setLiveStatus(msg, false);
        hideApLoader();
        if (isPartyRoomPage() && !sessionEstablished) onRoomReady();
      } else if (isPartyRoomPage()) {
        partyVoiceSkipped = true;
        if (!sessionEstablished) onRoomReady();
        setLiveStatus('Voice unavailable — chat still works', null);
        schedulePartyAgoraRetry();
      }
    }, 20000);

    try {
      const AgoraRTC = await loadAgoraScript();
      if (agoraClient) {
        try {
          await agoraClient.leave();
        } catch (_e) { }
        agoraClient = null;
        liveDebugState.agoraJoined = false;
      }
      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      let joined;
      try {
        const asPublisher = host || hasSpeakerSeat;
        joined = await joinAgoraWithRetry(agoraClient, ch, asPublisher, 3);
        forensicEvent('AGORA_JOIN_SUCCESS', {
          channel: joined.channel,
          uid: joined.uid,
          role: host ? 'host' : 'audience',
        });
        syncLiveUiState();
        if (!host) {
          bindAudioUnlockGestures();
          for (const remoteUser of agoraClient.remoteUsers) {
            if (remoteUser.hasVideo) await playRemoteMedia(remoteUser, 'video');
            if (remoteUser.hasAudio) await playRemoteMedia(remoteUser, 'audio');
          }
          await ensureRemoteAudioPlaying();
        }
      } catch (joinErr) {
        const msg = joinErr?.message || String(joinErr);
        console.error('[live] Agora join failed', joinErr);
        liveDebugLog(`Agora join FAILED: ${msg}`);
        forensicEvent('AGORA_JOIN_FAILED', { channel: ch, msg });
        updateLiveDebug({ agoraJoined: false });
        const friendly = friendlyAgoraError(msg);
        if (host) {
          toast(friendly, 'error');
          await onHostBroadcastFailed('agora_join_failed', friendly);
        } else if (isPartyRoomPage()) {
          partyVoiceSkipped = true;
          onRoomReady();
          if (/CAN_NOT_GET_GATEWAY/i.test(msg)) {
            setLiveStatus(friendly, false);
            toast(friendly, 'error');
          } else {
            setLiveStatus('Connecting to party audio…', null);
            schedulePartyAgoraRetry();
          }
        } else {
          onRoomReady();
          setLiveStatus(friendly, /CAN_NOT_GET_GATEWAY/i.test(msg) ? false : null);
          if (/CAN_NOT_GET_GATEWAY/i.test(msg)) toast(friendly, 'error');
        }
        return;
      }

      const uid = joined.uid;
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
            forensicEvent('PUBLISH_SUCCESS', { channel: joined.channel, mode: 'party' });
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
            forensicEvent('PUBLISH_SUCCESS', { channel: joined.channel, mode: 'audio' });
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
          rawCameraTrack = videoTrack;
          localTracks = [audioTrack, videoTrack];
          try {
            await agoraClient.publish([audioTrack, videoTrack]);
            publishSucceeded = true;
            liveDebugLog('Publish OK live video+audio');
            forensicEvent('PUBLISH_SUCCESS', { channel: joined.channel, mode: 'video' });
            updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
          } catch (pubErr) {
            const msg = pubErr?.message || String(pubErr);
            console.error('[live] publish failed', pubErr);
            await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
            return;
          }
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) {
            playLocalHostPreview(videoTrack);
          }
          // Preview shows processed frames when beauty is published.
          applyVideoFilter();
          ensureHostVideoVisible();
          setLiveStreamVisible(true);
          // Verify mic stayed published (some devices drop audio after camera start)
          setTimeout(() => {
            ensureHostAudioPublishing().catch((e) => liveDebugLog(`post-live mic check: ${e?.message || e}`));
          }, 1200);
          setTimeout(() => {
            if (videoFilterId && videoFilterId !== 'none') {
              syncPublishedBeautyTrack().catch((e) => liveDebugLog(`post-live beauty: ${e?.message || e}`));
            }
          }, 700);
        }
        onRoomReady();
        syncLiveUiState();
      } else {
        onRoomReady();
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
        if (hasSpeakerSeat) {
          await publishGuestAudio().catch((e) =>
            liveDebugLog(`Guest publish after join: ${e?.message || e}`)
          );
        }
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
    } finally {
      clearTimeout(agoraDeadline);
    }
  }

  async function restartAgoraForMode() {
    if (agoraModeSwitchInProgress) return;
    agoraModeSwitchInProgress = true;
    const mode = broadcastMode === 'audio' ? 'audio' : 'video';
    try {
      if (mode === 'video') clearAudioModeUi();
      // Prefer in-place track switch so mic/camera don't get stuck after leave/rejoin.
      if (agoraClient && publishSucceeded && isHost() && !isPartyRoomPage()) {
        await switchHostBroadcastTracks(mode);
        if (mode === 'video') {
          clearAudioModeUi();
          ensureHostVideoVisible();
        }
        syncLiveUiState();
        return;
      }
      await stopAgora({ skipEndRoom: true });
      await new Promise((r) => setTimeout(r, 250));
      const page = document.body.dataset.livePage;
      await startAgora(page === 'party-room' ? 'party' : 'live');
      if (mode === 'video') {
        clearAudioModeUi();
        ensureHostVideoVisible();
      }
      syncLiveUiState();
    } catch (e) {
      liveDebugLog(`mode switch failed: ${e?.message || e}`);
      toast('Could not switch mode — retrying…', 'warning');
      try {
        await stopAgora({ skipEndRoom: true });
        await new Promise((r) => setTimeout(r, 400));
        await startAgora(isPartyRoomPage() ? 'party' : 'live');
        if (mode === 'video') {
          clearAudioModeUi();
          ensureHostVideoVisible();
        }
      } catch (e2) {
        toast(e2?.message || 'Mode switch failed', 'error');
      }
      syncLiveUiState();
    } finally {
      agoraModeSwitchInProgress = false;
    }
  }

  async function switchHostBroadcastTracks(mode) {
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    const hostName = roomState?.hostName || displayName(currentUser());

    if (mode === 'audio') {
      if (beautyPipeline?.customTrack) {
        try {
          await agoraClient.unpublish([beautyPipeline.customTrack]);
        } catch (_e) { }
        stopBeautyPipeline();
      }
      const video = getLocalVideoTrack() || rawCameraTrack;
      if (video) {
        try {
          await agoraClient.unpublish([video]);
        } catch (_e) { }
        try {
          video.stop?.();
          video.close?.();
        } catch (_e) { }
      }
      localTracks = localTracks.filter((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type !== 'video' && t !== video && t !== rawCameraTrack;
      });
      rawCameraTrack = null;

      let audio = getLocalAudioTrack();
      if (!audio) {
        audio = await withTimeout(AgoraRTC.createMicrophoneAudioTrack(), 25000, 'Microphone access');
        await agoraClient.publish(audio);
        localTracks = [audio];
      } else {
        try {
          if (typeof audio.setEnabled === 'function') await audio.setEnabled(true);
          if (typeof audio.setMuted === 'function') await audio.setMuted(false);
        } catch (_e) { }
        const published = agoraClient.localTracks || [];
        if (!published.includes?.(audio)) {
          try {
            await agoraClient.publish(audio);
          } catch (_e) { }
        }
      }
      micMuted = false;
      publishSucceeded = true;

      const localBox = document.getElementById('liveLocalHost');
      if (localBox) {
        localBox.innerHTML = '';
        localBox.style.display = 'none';
      }
      const fallback = document.getElementById('liveLocalVideo');
      if (fallback) fallback.style.display = 'none';
      setLiveStreamVisible(false);
      applyLiveBackground('audio', hostName);
      syncBroadcastModeInUrl('audio');
      syncMicButtonUi();
      liveDebugLog('Switched to audio-only (in-place)');
      return;
    }

    // video mode — leave audio chrome first, keep mic, always recreate camera
    clearAudioModeUi();

    let audio = getLocalAudioTrack();
    if (!audio) {
      audio = await withTimeout(AgoraRTC.createMicrophoneAudioTrack(), 25000, 'Microphone access');
      try {
        await agoraClient.publish(audio);
      } catch (_e) { }
      localTracks = [audio, ...localTracks.filter((t) => t !== audio)];
    } else {
      try {
        if (typeof audio.setEnabled === 'function') await audio.setEnabled(true);
        if (typeof audio.setMuted === 'function') await audio.setMuted(false);
      } catch (_e) { }
    }
    micMuted = false;

    // Tear down any leftover / closed video (audio-only leave closes camera).
    if (beautyPipeline?.customTrack) {
      try {
        await agoraClient.unpublish([beautyPipeline.customTrack]);
      } catch (_e) { }
      stopBeautyPipeline();
    }
    const staleVideos = [
      ...localTracks.filter((t) => (t.getTrackType?.() || t.trackMediaType) === 'video'),
      rawCameraTrack,
    ].filter(Boolean);
    const uniqueStale = [...new Set(staleVideos)];
    for (const old of uniqueStale) {
      try {
        await agoraClient.unpublish([old]);
      } catch (_e) { }
      try {
        old.stop?.();
        old.close?.();
      } catch (_e) { }
    }
    localTracks = localTracks.filter((t) => (t.getTrackType?.() || t.trackMediaType) !== 'video');
    rawCameraTrack = null;

    const video = await withTimeout(
      AgoraRTC.createCameraVideoTrack({ facingMode: cameraFacing }),
      30000,
      'Camera access'
    );
    rawCameraTrack = video;
    try {
      await agoraClient.publish(video);
    } catch (pubErr) {
      try {
        video.stop?.();
        video.close?.();
      } catch (_e) { }
      rawCameraTrack = null;
      throw pubErr;
    }
    localTracks = audio ? [audio, video] : [video];

    publishSucceeded = true;
    clearAudioModeUi();
    playLocalHostPreview(video);
    setLiveStreamVisible(true);
    applyLiveBackground('live', hostName);
    ensureHostVideoVisible();
    syncBroadcastModeInUrl('video');
    syncMicButtonUi();
    if (videoFilterId && videoFilterId !== 'none') {
      setTimeout(() => {
        syncPublishedBeautyTrack().catch((e) => liveDebugLog(`post-switch beauty: ${e?.message || e}`));
      }, 400);
    }
    liveDebugLog('Switched to video (in-place)');
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
    if (localTracks.length && publishSucceeded && getLocalAudioTrack() && isLocalMicHealthy()) {
      await applyLocalMicMuteState();
      syncMicButtonUi();
      return;
    }
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
      const AgoraRTC = await loadAgoraScript();

      // Fresh client avoids sticky audience-join state after seat accept
      if (agoraClient) {
        try {
          for (const t of localTracks) {
            try {
              await agoraClient.unpublish(t);
            } catch (_e) { }
            try {
              t.stop?.();
              t.close?.();
            } catch (_e2) { }
          }
        } catch (_e) { }
        localTracks = [];
        try {
          await agoraClient.leave();
        } catch (_e) { }
        agoraClient = null;
        liveDebugState.agoraJoined = false;
      }
      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      await joinAgoraWithRetry(agoraClient, ch, true, 3);

      const audioTrack = await withTimeout(
        AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true,
        }),
        25000,
        'Microphone access'
      );
      try {
        if (typeof audioTrack.setEnabled === 'function') await audioTrack.setEnabled(true);
        if (typeof audioTrack.setMuted === 'function') await audioTrack.setMuted(false);
      } catch (_e) { }
      localTracks = [audioTrack];
      await agoraClient.publish([audioTrack]);
      publishSucceeded = true;
      partyVoiceSkipped = false;
      micMuted = false;
      liveDebugLog('Publish OK guest audio');
      updateLiveDebug({ hostPublishing: true, publishSucceeded: true, agoraJoined: true });

      // Rejoin drops remote subscriptions — restore host A/V
      bindAudioUnlockGestures();
      for (const remoteUser of agoraClient.remoteUsers || []) {
        try {
          if (remoteUser.hasVideo) await playRemoteMedia(remoteUser, 'video');
          if (remoteUser.hasAudio) await playRemoteMedia(remoteUser, 'audio');
        } catch (subErr) {
          liveDebugLog(`guest resubscribe: ${subErr?.message || subErr}`);
        }
      }
      await ensureRemoteAudioPlaying().catch(() => { });
      setTimeout(() => ensureRemoteAudioPlaying().catch(() => { }), 400);
      setTimeout(() => ensureRemoteAudioPlaying().catch(() => { }), 1200);

      // Tell host/viewers to pull our mic (covers missed user-published on some devices)
      try {
        liveSocket?.emit('live:guest_mic_ready', {
          channel: ch,
          userId: user.id,
          agoraUid: liveDebugState.agoraUid,
        });
      } catch (_e) { }

      syncMicButtonUi();
      renderPartySeats(roomState?.hostName);
      renderGuestRail();
      toast('Mic is live — tap mic to mute', 'success');
    } catch (e) {
      const msg = friendlyAgoraError(e?.message || String(e));
      liveDebugLog(`Guest publish FAILED: ${msg}`);
      publishSucceeded = false;
      guestPublishAttempted = false;
      toast(`Mic failed: ${msg}`, 'error');
    } finally {
      guestPublishInProgress = false;
    }
  }

  function applyBeautyEngineState() {
    clearTimeout(window.__apBeautySyncTimer);
    window.__apBeautySyncTimer = setTimeout(() => {
      syncPublishedBeautyTrack().catch((e) => liveDebugLog(`beauty engine sync: ${e?.message || e}`));
    }, 100);
  }

  function stopBeautyPipeline() {
    if (window.APBeauty?.camera) {
      try {
        window.APBeauty.camera.stop?.();
      } catch (_e) { }
    }
    if (!beautyPipeline) return;
    try {
      cancelAnimationFrame(beautyPipeline.raf);
    } catch (_e) { }
    try {
      beautyPipeline.stream?.getTracks?.().forEach((t) => t.stop());
    } catch (_e) { }
    try {
      beautyPipeline.customTrack?.stop?.();
      beautyPipeline.customTrack?.close?.();
    } catch (_e) { }
    try {
      beautyPipeline.video?.remove?.();
      beautyPipeline.canvas?.remove?.();
      beautyPipeline.soft?.remove?.();
      beautyPipeline.mask?.remove?.();
    } catch (_e) { }
    beautyPipeline = null;
  }

  async function applyAgoraBeautyEffect(videoTrack) {
    const track = videoTrack || getLocalVideoTrack() || rawCameraTrack;
    if (!track || typeof track.setBeautyEffect !== 'function') return false;
    const preset = VIDEO_FILTERS[videoFilterId] || VIDEO_FILTERS.none;
    try {
      if (!preset.beauty) {
        await track.setBeautyEffect(false);
        return true;
      }
      await track.setBeautyEffect(true, preset.beauty);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function ensureBeautyAux(w, h) {
    if (!beautyPipeline) return null;
    if (
      beautyPipeline.soft &&
      beautyPipeline.soft.width === w &&
      beautyPipeline.soft.height === h
    ) {
      return beautyPipeline;
    }
    const soft = document.createElement('canvas');
    soft.width = w;
    soft.height = h;
    soft.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    mask.style.cssText = soft.style.cssText;
    document.body.appendChild(soft);
    document.body.appendChild(mask);
    beautyPipeline.soft = soft;
    beautyPipeline.softCtx = soft.getContext('2d', { alpha: true, desynchronized: true });
    beautyPipeline.mask = mask;
    beautyPipeline.maskCtx = mask.getContext('2d', { alpha: true, desynchronized: true });
    beautyPipeline.sparkles = [];
    for (let i = 0; i < 28; i++) {
      beautyPipeline.sparkles.push({
        x: Math.random(),
        y: Math.random() * 0.7,
        r: 0.8 + Math.random() * 2.2,
        a: 0.25 + Math.random() * 0.55,
        sp: 0.002 + Math.random() * 0.006,
        ph: Math.random() * Math.PI * 2,
      });
    }
    return beautyPipeline;
  }

  let beautyFaceBox = null; // {x,y,w,h} normalized 0..1 from FaceDetector when available
  let beautyFaceDetector = null;
  let beautyFaceDetectAt = 0;

  function beautyFaceLayout(w, h) {
    const box = beautyFaceBox;
    if (!box) {
      return { cx: w * 0.5, cy: h * 0.4, rx: w * 0.38, ry: h * 0.34 };
    }
    return {
      cx: (box.x + box.w / 2) * w,
      cy: (box.y + box.h * 0.42) * h,
      rx: Math.max(w * 0.16, box.w * w * 0.55),
      ry: Math.max(h * 0.18, box.h * h * 0.52),
    };
  }

  function drawFaceSoftMask(maskCtx, w, h) {
    maskCtx.clearRect(0, 0, w, h);
    // Prefer tracked face box (browser FaceDetector) — closer to Instagram placement.
    const { cx, cy, rx, ry } = beautyFaceLayout(w, h);
    const g = maskCtx.createRadialGradient(cx, cy, rx * 0.12, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    maskCtx.fillStyle = g;
    maskCtx.beginPath();
    maskCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    maskCtx.fill();
  }

  async function detectBeautyFaceBox(videoEl) {
    if (!videoEl || videoEl.readyState < 2) return;
    const now = Date.now();
    if (now - beautyFaceDetectAt < 180) return;
    beautyFaceDetectAt = now;
    try {
      if (!beautyFaceDetector && typeof FaceDetector !== 'undefined') {
        beautyFaceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      }
      if (!beautyFaceDetector) return;
      const faces = await beautyFaceDetector.detect(videoEl);
      const face = faces?.[0];
      if (!face?.boundingBox) return;
      const bw = Math.max(1, videoEl.videoWidth || 1);
      const bh = Math.max(1, videoEl.videoHeight || 1);
      const b = face.boundingBox;
      beautyFaceBox = {
        x: b.x / bw,
        y: b.y / bh,
        w: b.width / bw,
        h: b.height / bh,
      };
    } catch (_e) {
      /* FaceDetector unsupported or failed — keep oval fallback */
    }
  }

  function drawCheekBlush(ctx, w, h, blush) {
    if (!blush) return;
    const { cx, cy, rx, ry } = beautyFaceLayout(w, h);
    const size = Math.min(rx, ry) * (blush.size ? blush.size * 2.2 : 0.42);
    const cheeks = [
      [cx - rx * 0.62, cy + ry * 0.18],
      [cx + rx * 0.62, cy + ry * 0.18],
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    cheeks.forEach(([x, y]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, size);
      g.addColorStop(0, blush.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawHighlight(ctx, w, h, amount) {
    if (!amount) return;
    const { cx, cy, rx, ry } = beautyFaceLayout(w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = amount;
    const spots = [
      [cx, cy - ry * 0.55, rx * 0.55],
      [cx, cy - ry * 0.05, rx * 0.18],
      [cx - rx * 0.45, cy - ry * 0.08, rx * 0.22],
      [cx + rx * 0.45, cy - ry * 0.08, rx * 0.22],
      [cx, cy + ry * 0.35, rx * 0.28],
    ];
    spots.forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawLipTint(ctx, w, h, lip) {
    if (!lip) return;
    const { cx, cy, rx, ry } = beautyFaceLayout(w, h);
    const y = cy + ry * (lip.y != null ? lip.y * 1.2 : 0.58);
    const lipRx = rx * 0.28;
    const lipRy = ry * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(cx, y, 0, cx, y, lipRx);
    g.addColorStop(0, lip.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, y, lipRx, lipRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWash(ctx, w, h, wash) {
    if (!wash) return;
    ctx.save();
    ctx.globalCompositeOperation = wash.mode || 'soft-light';
    ctx.fillStyle = wash.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawSparkles(ctx, w, h, amount, sparkles, t) {
    if (!amount || !sparkles?.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    sparkles.forEach((s) => {
      const pulse = 0.45 + 0.55 * Math.sin(t * 0.004 + s.ph);
      const x = ((s.x + t * s.sp * 0.02) % 1) * w;
      const y = s.y * h;
      ctx.globalAlpha = s.a * amount * pulse;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = s.a * amount * pulse * 0.7;
      ctx.fillRect(x - s.r * 2.2, y - 0.6, s.r * 4.4, 1.2);
      ctx.fillRect(x - 0.6, y - s.r * 2.2, 1.2, s.r * 4.4);
    });
    ctx.restore();
  }

  function drawVignette(ctx, w, h, amount) {
    if (!amount) return;
    ctx.save();
    const g = ctx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      Math.min(w, h) * 0.25,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.75, amount)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawFaceGlow(ctx, w, h, amount) {
    if (!amount) return;
    const { cx, cy, rx, ry } = beautyFaceLayout(w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = amount * 0.55;
    const g = ctx.createRadialGradient(cx, cy - ry * 0.1, 0, cx, cy - ry * 0.1, Math.max(rx, ry) * 1.05);
    g.addColorStop(0, 'rgba(255,245,230,0.9)');
    g.addColorStop(0.55, 'rgba(255,220,200,0.25)');
    g.addColorStop(1, 'rgba(255,200,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function beautyDrawLoop() {
    if (!beautyPipeline) return;
    const { video, canvas, ctx } = beautyPipeline;
    if (video.readyState >= 2 && canvas.width && canvas.height) {
      const preset = VIDEO_FILTERS[videoFilterId] || VIDEO_FILTERS.none;
      const w = canvas.width;
      const h = canvas.height;
      const aux = ensureBeautyAux(w, h);
      const softCtx = aux.softCtx;
      const maskCtx = aux.maskCtx;
      void detectBeautyFaceBox(video);

      ctx.filter = preset.grade || 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';

      if (preset.skin > 0 && preset.skinMix > 0) {
        softCtx.clearRect(0, 0, w, h);
        softCtx.filter = `blur(${preset.skin}px) brightness(1.04) saturate(1.04)`;
        softCtx.drawImage(video, 0, 0, w, h);
        softCtx.filter = 'none';
        drawFaceSoftMask(maskCtx, w, h);
        softCtx.globalCompositeOperation = 'destination-in';
        softCtx.drawImage(aux.mask, 0, 0);
        softCtx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha = preset.skinMix;
        ctx.drawImage(aux.soft, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = Math.min(0.28, preset.skinMix * 0.35);
        ctx.globalCompositeOperation = 'overlay';
        ctx.filter = 'contrast(1.25) brightness(1.05)';
        ctx.drawImage(video, 0, 0, w, h);
        ctx.filter = 'none';
        ctx.restore();
      }

      drawFaceGlow(ctx, w, h, preset.glow || 0);
      drawCheekBlush(ctx, w, h, preset.blush);
      drawHighlight(ctx, w, h, preset.highlight || 0);
      drawLipTint(ctx, w, h, preset.lip);
      drawWash(ctx, w, h, preset.wash);
      drawSparkles(ctx, w, h, preset.sparkle || 0, aux.sparkles, performance.now());
      drawVignette(ctx, w, h, preset.vignette || 0);
    }
    beautyPipeline.raf = requestAnimationFrame(beautyDrawLoop);
  }

  async function startBeautyPipeline(sourceTrack) {
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    const track = sourceTrack || rawCameraTrack || getLocalVideoTrack();
    if (!track) return null;
    stopBeautyPipeline();

    const mediaTrack =
      track.getMediaStreamTrack?.() ||
      (track.mediaStreamTrack ? track.mediaStreamTrack : null);
    if (!mediaTrack) return null;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    video.srcObject = new MediaStream([mediaTrack]);
    document.body.appendChild(video);
    await video.play().catch(() => { });

    const canvas = document.createElement('canvas');
    const w = video.videoWidth || mediaTrack.getSettings?.()?.width || 720;
    const h = video.videoHeight || mediaTrack.getSettings?.()?.height || 1280;
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    beautyPipeline = {
      video,
      canvas,
      ctx,
      raf: 0,
      stream: null,
      customTrack: null,
      sourceTrack: track,
      soft: null,
      softCtx: null,
      mask: null,
      maskCtx: null,
      sparkles: [],
    };
    ensureBeautyAux(w, h);
    beautyDrawLoop();

    // Wait until the camera has real frames (avoids publishing a black canvas)
    await new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
        if (Date.now() - started > 2500) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    const stream = canvas.captureStream(28);
    beautyPipeline.stream = stream;
    const mst = stream.getVideoTracks()[0];
    if (!mst) return null;

    const customTrack = await AgoraRTC.createCustomVideoTrack({
      mediaStreamTrack: mst,
      optimizationMode: 'detail',
    });
    beautyPipeline.customTrack = customTrack;
    return customTrack;
  }

  function canvasLooksAlive(canvas) {
    try {
      const w = canvas?.width || 0;
      const h = canvas?.height || 0;
      if (w < 8 || h < 8) return false;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      const sample = ctx.getImageData(Math.floor(w * 0.4), Math.floor(h * 0.35), 12, 12).data;
      let lit = 0;
      for (let i = 0; i < sample.length; i += 4) {
        if (sample[i] + sample[i + 1] + sample[i + 2] > 30) lit += 1;
      }
      return lit > 8;
    } catch (_e) {
      return false;
    }
  }

  async function waitForBeautyFrames(timeoutMs = 2200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (beautyPipeline?.canvas && canvasLooksAlive(beautyPipeline.canvas)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return Boolean(beautyPipeline?.canvas && canvasLooksAlive(beautyPipeline.canvas));
  }

  async function syncPublishedBeautyTrack() {
    if (!agoraClient || !publishSucceeded || !isHost() || broadcastMode === 'audio') return;
    if (beautySyncPromise) return beautySyncPromise;
    beautySyncPromise = (async () => {
      const audioTrack =
        localTracks.find((t) => (t.getTrackType?.() || t.trackMediaType) === 'audio') ||
        getLocalAudioTrack?.();

      // Prefer Earn4U Beauty Engine when loaded AND enabled
      const APB = window.APBeauty;
      if (APB?.camera && APB?.engine && APB.engine.isBeautyActive?.()) {
        try {
          const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
          let custom = APB.camera.getCustomTrack?.();
          if (!custom) {
            custom = await APB.camera.start(AgoraRTC, rawCameraTrack);
          }
          const published = agoraClient.localTracks || [];
          const oldVideo = published.find?.((t) => {
            const type = t.getTrackType?.() || t.trackMediaType;
            return type === 'video' && t !== custom;
          });
          if (oldVideo) {
            try {
              await agoraClient.unpublish([oldVideo]);
            } catch (_e) { }
          }
          if (!published.includes?.(custom)) {
            await agoraClient.publish(custom);
          }
          localTracks = audioTrack ? [audioTrack, custom] : [custom];
          playLocalHostPreview(custom);
          ensureHostVideoVisible();
          setLiveStreamVisible(true);
          liveDebugLog(`beauty engine published provider=${APB.engine.manager?.getActiveProviderId?.()}`);
          return;
        } catch (e) {
          liveDebugLog(`beauty engine failed, legacy canvas: ${e?.message || e}`);
          try {
            await APB.camera.stop?.();
          } catch (_e) { }
          // fall through to legacy
        }
      } else if (APB?.camera?.getCustomTrack?.()) {
        // Engine turned off — drop custom track before legacy/raw path
        try {
          await agoraClient.unpublish([APB.camera.getCustomTrack()]);
        } catch (_e) { }
        try {
          await APB.camera.stop?.();
        } catch (_e) { }
      }

      const wantBeauty = Boolean(PUBLISH_CANVAS_BEAUTY && videoFilterId && videoFilterId !== 'none');

      const restoreRawCamera = async () => {
        if (!rawCameraTrack) return;
        try {
          const published = agoraClient.localTracks || [];
          const already = published.includes?.(rawCameraTrack);
          if (!already) await agoraClient.publish(rawCameraTrack);
        } catch (e) {
          liveDebugLog(`restore camera publish failed: ${e?.message || e}`);
        }
        localTracks = audioTrack ? [audioTrack, rawCameraTrack] : [rawCameraTrack];
        playLocalHostPreview(rawCameraTrack);
        await applyAgoraBeautyEffect(rawCameraTrack);
        applyLocalPreviewCss();
        ensureHostVideoVisible();
      };

      if (!wantBeauty) {
        if (beautyPipeline?.customTrack) {
          try {
            await agoraClient.unpublish([beautyPipeline.customTrack]);
          } catch (_e) { }
          stopBeautyPipeline();
        }
        await restoreRawCamera();
        return;
      }

      // Pipeline already live — filter change only updates the draw loop.
      if (beautyPipeline?.customTrack) {
        const published = agoraClient.localTracks || [];
        if (published.includes?.(beautyPipeline.customTrack)) {
          await applyAgoraBeautyEffect(rawCameraTrack);
          applyLocalPreviewCss();
          playLocalHostPreview(beautyPipeline.customTrack);
          return;
        }
      }

      let custom = beautyPipeline?.customTrack;
      if (!custom) {
        custom = await startBeautyPipeline(rawCameraTrack);
      }
      if (!custom) {
        liveDebugLog('beauty pipeline unavailable — keeping raw camera');
        await restoreRawCamera();
        return;
      }

      const framesOk = await waitForBeautyFrames(2200);
      if (!framesOk) {
        liveDebugLog('beauty canvas still black — keeping raw camera');
        try {
          await agoraClient.unpublish([custom]);
        } catch (_e) { }
        stopBeautyPipeline();
        await restoreRawCamera();
        toast('Face effect not ready — try another look', 'warning');
        return;
      }

      await applyAgoraBeautyEffect(rawCameraTrack);

      const oldVideo = getLocalVideoTrack();
      try {
        // Unpublish raw only after canvas has real frames, then publish beauty.
        if (oldVideo && oldVideo !== custom) {
          try {
            await agoraClient.unpublish([oldVideo]);
          } catch (_e) { }
        }
        await agoraClient.publish(custom);
        localTracks = audioTrack ? [audioTrack, custom] : [custom];
        applyLocalPreviewCss();
        playLocalHostPreview(custom);
        ensureHostVideoVisible();
        setLiveStreamVisible(true);
        liveDebugLog(`beauty published filter=${videoFilterId}`);
      } catch (e) {
        liveDebugLog(`beauty publish failed: ${e?.message || e}`);
        try {
          await agoraClient.unpublish([custom]);
        } catch (_e) { }
        stopBeautyPipeline();
        await restoreRawCamera();
        toast('Could not apply face effect — camera restored', 'warning');
      }
    })().finally(() => {
      beautySyncPromise = null;
    });
    return beautySyncPromise;
  }

  function isLocalCameraHealthy() {
    const track = rawCameraTrack || getLocalVideoTrack();
    if (!track) return false;
    try {
      const mst = track.getMediaStreamTrack?.();
      if (mst && mst.readyState === 'ended') return false;
      if (track.isPlaying === false && typeof track.isPlaying === 'boolean') {
        // still may be published; readyState is the real check
      }
    } catch (_e) { }
    // Prefer Agora's published list when available
    try {
      const published = agoraClient?.localTracks || [];
      const hasPublishedVideo = published.some((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type === 'video';
      });
      if (published.length && !hasPublishedVideo) return false;
    } catch (_e) { }
    return true;
  }

  async function ensureHostVideoPublishing() {
    if (!isHost() || broadcastMode === 'audio' || !agoraClient || !publishSucceeded) return;
    if (!liveDebugState.agoraJoined) return;

    if (isLocalCameraHealthy() && getLocalVideoTrack()) {
      ensureHostVideoVisible();
      return;
    }

    liveDebugLog('host video missing/unhealthy — republishing camera');
    const audioTrack = getLocalAudioTrack?.() ||
      localTracks.find((t) => (t.getTrackType?.() || t.trackMediaType) === 'audio');

    // Tear down broken beauty custom track if any
    if (beautyPipeline?.customTrack) {
      try {
        await agoraClient.unpublish([beautyPipeline.customTrack]);
      } catch (_e) { }
      stopBeautyPipeline();
    }

    // Drop dead video from localTracks
    localTracks = localTracks.filter((t) => {
      const type = t.getTrackType?.() || t.trackMediaType;
      if (type !== 'video') return true;
      try {
        const mst = t.getMediaStreamTrack?.();
        return mst && mst.readyState !== 'ended';
      } catch (_e) {
        return false;
      }
    });

    let cam = rawCameraTrack;
    const camDead = (() => {
      try {
        return !cam || cam.getMediaStreamTrack?.()?.readyState === 'ended';
      } catch (_e) {
        return true;
      }
    })();

    if (camDead) {
      try {
        const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
        cam = await AgoraRTC.createCameraVideoTrack({ facingMode: cameraFacing });
        rawCameraTrack = cam;
      } catch (e) {
        liveDebugLog(`recreate camera failed: ${e?.message || e}`);
        toast('Camera stopped — tap Flip or rejoin to restore', 'warning');
        return;
      }
    }

    try {
      // Unpublish any stale video tracks first
      const stale = (agoraClient.localTracks || []).filter((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type === 'video' && t !== cam;
      });
      if (stale.length) {
        try {
          await agoraClient.unpublish(stale);
        } catch (_e) { }
      }
      const already = (agoraClient.localTracks || []).includes?.(cam);
      if (!already) await agoraClient.publish(cam);
      localTracks = audioTrack ? [audioTrack, cam] : [cam];
      playLocalHostPreview(cam);
      await applyAgoraBeautyEffect(cam);
      applyLocalPreviewCss();
      ensureHostVideoVisible();
      setLiveStreamVisible(true);
      liveDebugLog('host camera republished OK');
      await ensureHostAudioPublishing();
      if (PUBLISH_CANVAS_BEAUTY && videoFilterId && videoFilterId !== 'none') {
        setTimeout(() => {
          syncPublishedBeautyTrack().catch((e) => liveDebugLog(`beauty reapply: ${e?.message || e}`));
        }, 400);
      }
    } catch (e) {
      liveDebugLog(`host camera republish failed: ${e?.message || e}`);
    }
  }

  function isCanvasBeautyLive() {
    return Boolean(
      PUBLISH_CANVAS_BEAUTY &&
      beautyPipeline?.customTrack &&
      videoFilterId &&
      videoFilterId !== 'none'
    );
  }

  function applyLocalPreviewCss() {
    // When canvas beauty is published, effects are already in the frames —
    // CSS tint on top made it look like only the background color changed.
    const css = isCanvasBeautyLive() ? '' : VIDEO_FILTERS[videoFilterId]?.css || '';
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

  function applyVideoFilter() {
    applyLocalPreviewCss();
    applyAgoraBeautyEffect(rawCameraTrack || getLocalVideoTrack()).catch(() => { });
    clearTimeout(window.__apBeautySyncTimer);
    window.__apBeautySyncTimer = setTimeout(() => {
      syncPublishedBeautyTrack().catch((e) => liveDebugLog(`beauty sync: ${e?.message || e}`));
    }, 120);
  }

  function renderFilterRail(cat = 'all') {
    const rail = document.getElementById('apFilterGrid');
    if (!rail) return;
    const entries = Object.entries(VIDEO_FILTERS).filter(([, f]) => cat === 'all' || f.cat === cat || !f.cat);
    rail.innerHTML = entries
      .map(
        ([id, f]) =>
          `<button type="button" class="ap-filter-chip${id === videoFilterId ? ' is-active' : ''}" data-filter="${id}" data-cat="${f.cat || 'beauty'}">
            <span class="ap-filter-swatch" style="background:${f.swatch || '#333'}"></span>
            <span class="ap-filter-name">${escapeHtml(f.label)}</span>
          </button>`
      )
      .join('');
    rail.querySelectorAll('.ap-filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        videoFilterId = btn.dataset.filter || 'none';
        try {
          localStorage.setItem('ap_live_beauty_filter', videoFilterId);
          localStorage.setItem('ap_live_beauty_filter_picked', '1');
        } catch (_e) { }
        rail.querySelectorAll('.ap-filter-chip').forEach((b) => b.classList.toggle('is-active', b === btn));
        applyVideoFilter();
        toast(VIDEO_FILTERS[videoFilterId]?.label || 'Original', 'success');
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });
  }

  function openVideoFilterSheet() {
    if (!isHost() || broadcastMode === 'audio') {
      toast('Filters are for video live only', 'info');
      return;
    }
    // Earn4U Beauty Engine sheet (MediaPipe / commercial providers)
    if (window.APBeauty?.openSheet) {
      window.APBeauty.openSheet();
      return;
    }
    let sheet = document.getElementById('apFilterSheet');
    if (!sheet) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-filter-sheet" id="apFilterSheet">
          <div class="ap-filter-panel">
            <div class="ap-filter-head">
              <div>
                <h3>Filters</h3>
                <p class="ap-filter-sub">Beauty &amp; effects apply to your face on the live stream</p>
              </div>
              <button type="button" id="apFilterClose" aria-label="Close"><i class="fas fa-times"></i></button>
            </div>
            <div class="ap-filter-cats" id="apFilterCats">
              <button type="button" class="ap-filter-cat is-on" data-cat="all">All</button>
              <button type="button" class="ap-filter-cat" data-cat="beauty">Beauty</button>
              <button type="button" class="ap-filter-cat" data-cat="looks">Looks</button>
              <button type="button" class="ap-filter-cat" data-cat="fx">Effects</button>
            </div>
            <div class="ap-filter-rail" id="apFilterGrid"></div>
          </div>
        </div>`
      );
      sheet = document.getElementById('apFilterSheet');
      document.getElementById('apFilterClose')?.addEventListener('click', () => sheet?.classList.remove('open'));
      sheet?.addEventListener('click', (e) => {
        if (e.target === sheet) sheet.classList.remove('open');
      });
      document.getElementById('apFilterCats')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.ap-filter-cat');
        if (!btn) return;
        document.querySelectorAll('.ap-filter-cat').forEach((b) => b.classList.toggle('is-on', b === btn));
        renderFilterRail(btn.dataset.cat || 'all');
      });
      renderFilterRail('all');
    } else {
      renderFilterRail(document.querySelector('.ap-filter-cat.is-on')?.dataset?.cat || 'all');
    }
    sheet.classList.add('open');
    requestAnimationFrame(() => {
      document
        .querySelector('#apFilterGrid .ap-filter-chip.is-active')
        ?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }

  function getLocalVideoTrack() {
    return localTracks.find((t) => {
      const type = t.getTrackType?.() || t.trackMediaType;
      return type === 'video';
    });
  }

  function detectCameraFacing(track, fallback = 'user') {
    try {
      const facing = track?.getMediaStreamTrack?.()?.getSettings?.()?.facingMode;
      if (facing === 'environment' || facing === 'user') return facing;
    } catch (_e) { }
    return fallback === 'environment' ? 'environment' : 'user';
  }

  function applyHostPreviewMirror(localBox, facing) {
    if (!localBox) return;
    const wantMirror = facing === 'user';
    localBox.classList.toggle('live-local-host-mirror', wantMirror);
    localBox.querySelectorAll('video').forEach((v) => {
      // Force override Agora/browser inline transforms so flip can't stick.
      v.style.setProperty('transform', wantMirror ? 'scaleX(-1)' : 'none', 'important');
    });
  }

  function playLocalHostPreview(videoTrack) {
    const localBox = document.getElementById('liveLocalHost');
    if (!localBox || !videoTrack?.play) return;
    localBox.innerHTML = '';
    localBox.style.display = '';
    // Always disable Agora's built-in mirror — it sticks across switchCamera().
    // Front selfie flip is CSS-only; back camera stays unflipped.
    videoTrack.play(localBox, { mirror: false });
    applyHostPreviewMirror(localBox, cameraFacing);
    requestAnimationFrame(() => applyHostPreviewMirror(localBox, cameraFacing));
    setTimeout(() => applyHostPreviewMirror(localBox, cameraFacing), 50);
  }

  async function replaceHostCameraTrack(nextFacing) {
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    const oldVideo = getLocalVideoTrack();
    const audioTrack = localTracks.find((t) => (t.getTrackType?.() || t.trackMediaType) === 'audio');
    if (!agoraClient || !publishSucceeded) return null;

    // Unpublish beauty custom track BEFORE stopping it (stopping a published track = black video)
    if (beautyPipeline?.customTrack) {
      try {
        await agoraClient.unpublish([beautyPipeline.customTrack]);
      } catch (_e) { }
      stopBeautyPipeline();
    }

    // Create + publish new first so viewers keep a stream during camera flip.
    const newVideo = await AgoraRTC.createCameraVideoTrack({
      facingMode: nextFacing,
    });
    rawCameraTrack = newVideo;
    try {
      await agoraClient.publish(newVideo);
    } catch (pubErr) {
      try {
        newVideo.stop();
        newVideo.close();
      } catch (_e) { }
      throw pubErr;
    }

    if (oldVideo && oldVideo !== newVideo) {
      try {
        await agoraClient.unpublish([oldVideo]);
      } catch (_e) { }
      try {
        oldVideo.stop();
        oldVideo.close();
      } catch (_e) { }
    }

    localTracks = audioTrack ? [audioTrack, newVideo] : [newVideo];
    cameraFacing = detectCameraFacing(newVideo, nextFacing);
    playLocalHostPreview(newVideo);
    applyVideoFilter();
    return newVideo;
  }

  async function switchCameraFacing() {
    if (!isHost() || broadcastMode === 'audio') {
      toast('Camera flip is for video live only', 'info');
      return;
    }
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());

      // Recreate track (not switchCamera) so mirror state cannot stick from front → back.
      if (agoraClient && publishSucceeded) {
        try {
          await replaceHostCameraTrack(nextFacing);
          applyVideoFilter();
          toast(cameraFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
          return;
        } catch (recreateErr) {
          console.warn('[live] camera recreate failed, falling back', recreateErr);
        }
      }

      const videoTrack = getLocalVideoTrack();
      if (typeof videoTrack?.switchCamera === 'function') {
        await videoTrack.switchCamera();
        cameraFacing = detectCameraFacing(videoTrack, nextFacing);
        playLocalHostPreview(videoTrack);
        applyVideoFilter();
        toast(cameraFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
        return;
      }

      if (videoTrack?.setDevice && AgoraRTC?.getCameras) {
        const cameras = await AgoraRTC.getCameras();
        if (cameras.length >= 2) {
          const currentId = videoTrack.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
          const envCam = cameras.find((c) => /back|rear|environment/i.test(c.label || ''));
          const userCam = cameras.find((c) => /front|user|face/i.test(c.label || ''));
          const pick =
            (nextFacing === 'environment' ? envCam : userCam) ||
            cameras.find((c) => c.deviceId && c.deviceId !== currentId) ||
            cameras[0];
          await videoTrack.setDevice(pick.deviceId);
          cameraFacing = detectCameraFacing(videoTrack, nextFacing);
          playLocalHostPreview(videoTrack);
          applyVideoFilter();
          toast(cameraFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
          return;
        }
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
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing } },
          audio: false,
        })
      );
      window.__apLocalStream = stream;
      const box = document.getElementById('liveLocalHost');
      const vid = box?.querySelector('video') || document.getElementById('liveLocalVideo');
      if (vid) {
        vid.srcObject = stream;
        vid.muted = true;
        await vid.play?.();
      }
      applyHostPreviewMirror(box, cameraFacing);
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
        cameraFacing = 'user';
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

  function getLocalAudioTrack() {
    return (
      localTracks.find((t) => typeof t.getTrackType === 'function' && t.getTrackType() === 'audio') ||
      localTracks.find((t) => typeof t.setMuted === 'function' && typeof t.setEnabled === 'function' && !t.getTrackType) ||
      null
    );
  }

  async function applyLocalMicMuteState() {
    const audio = getLocalAudioTrack();
    if (audio) {
      try {
        if (typeof audio.setMuted === 'function') await audio.setMuted(micMuted);
        if (typeof audio.setEnabled === 'function') await audio.setEnabled(!micMuted);
      } catch (_e) { }
    }
    const stream = window.__apLocalStream;
    if (stream?.getAudioTracks) {
      stream.getAudioTracks().forEach((t) => {
        try {
          t.enabled = !micMuted;
        } catch (_e) { }
      });
    }
    localTracks.forEach((t) => {
      try {
        if (t.getTrackType?.() === 'video') t.setEnabled?.(true);
      } catch (_e) { }
    });
  }

  async function toggleMic() {
    const wasMuted = micMuted;
    micMuted = !micMuted;
    if (!micMuted && !wasMuted) {
      /* noop */
    }
    if (!micMuted) {
      if (hasSpeakerSeat && (!publishSucceeded || !getLocalAudioTrack())) {
        await publishGuestAudio();
      }
      const audio = getLocalAudioTrack();
      if (audio) {
        try {
          if (typeof audio.setEnabled === 'function') await audio.setEnabled(true);
          if (typeof audio.setMuted === 'function') await audio.setMuted(false);
        } catch (_e) { }
      }
    }
    await applyLocalMicMuteState();
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
    stopBeautyPipeline();
    guestPublishAttempted = false;
    guestPublishInProgress = false;
    for (const t of localTracks) {
      try {
        t.stop?.();
        t.close?.();
      } catch (_e) { }
    }
    localTracks = [];
    if (rawCameraTrack) {
      try {
        rawCameraTrack.stop?.();
        rawCameraTrack.close?.();
      } catch (_e) { }
      rawCameraTrack = null;
    }
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
    } catch (_e) { }
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
          const emo = b.dataset.emo;
          const input = document.getElementById('liveChatInput');
          const me = currentUser();
          if (me?.id && emo) spawnSeatEmojiReaction(me.id, emo);
          if (input) {
            input.value += emo;
            input.focus();
          }
          pop.classList.remove('is-open');
          if (emo && liveSocket?.connected) sendChat(emo);
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
    if (isLiveRoomPage() && !isHost() && !hasSpeakerSeat) {
      closeLiveOverlays('mic');
      requestSeatJoin();
      return;
    }
    if (isLiveRoomPage() && !isHost() && hasSpeakerSeat) {
      toggleMic();
      return;
    }
    if (isLiveRoomPage() && isHost()) {
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

  function cacheChatProfile(userId, pic) {
    const uid = String(userId || '').trim();
    if (!uid || !pic) return;
    chatProfileCache.set(uid, pic);
  }

  function seedChatProfileCacheFromState(state) {
    if (!state) return;
    (state.seats || []).forEach((s) => {
      const pic = s?.profilePic || s?.profile_pic;
      if (s?.userId && pic) cacheChatProfile(s.userId, pic);
    });
    (state.onlineMembers || []).forEach((m) => {
      const pic = m?.profilePic || m?.profile_pic;
      if (m?.userId && pic) cacheChatProfile(m.userId, pic);
    });
    if (state.hostId && state.hostProfilePic) cacheChatProfile(state.hostId, state.hostProfilePic);
    (state.messages || []).forEach((m) => {
      if (m?.userId && m.profilePic) cacheChatProfile(m.userId, m.profilePic);
    });
  }

  function getChatProfilePic(msg) {
    if (!msg) return null;
    if (msg.profilePic) {
      if (msg.userId) cacheChatProfile(msg.userId, msg.profilePic);
      return msg.profilePic;
    }
    const uid = String(msg.userId || '').trim();
    if (uid && chatProfileCache.has(uid)) return chatProfileCache.get(uid);
    const resolved = resolveLiveProfilePic(msg.user, uid) || liveProfilePic(uid, null);
    if (resolved && uid) cacheChatProfile(uid, resolved);
    return resolved || null;
  }

  function extractEmojiReaction(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 16) return null;
    if (EMOJI_PICKS.includes(t) || SEAT_REACTION_EMOJIS.includes(t)) return t;
    const stripped = t.replace(/[\s\u200d\ufe0f]/g, '');
    if (!stripped) return null;
    try {
      if (/^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F9B0}-\u{1F9B3}]+$/u.test(stripped)) return t;
    } catch (_e) {
      if (/^[\u{1F300}-\u{1FAFF}]+$/u.test(stripped)) return t;
    }
    return null;
  }

  function spawnSeatEmojiReaction(userId, emoji) {
    const uid = String(userId || '');
    if (!uid || !emoji) return;
    const targets = [];
    if (isPartyRoomPage()) {
      const seat = document.querySelector(`.party-seat[data-user-id="${uid}"] .seat-avatar`);
      if (seat) targets.push(seat);
    }
    if (isLiveRoomPage()) {
      const guest = document.querySelector(`.ap-guest-seat[data-guest-id="${uid}"]`);
      if (guest) targets.push(guest);
      if (uid === String(roomState?.hostId || '')) {
        const hostImg = document.getElementById('liveHostAvatar');
        if (hostImg?.parentElement) targets.push(hostImg.parentElement);
      }
    }
    if (!targets.length && uid === String(currentUser()?.id || '')) {
      const mine = document.querySelector(`.party-seat[data-user-id="${uid}"] .seat-avatar`);
      if (mine) targets.push(mine);
    }
    const floatCount = SEAT_REACTION_EMOJIS.includes(emoji) ? 7 : 4;
    targets.forEach((el) => spawnFloatingEmojisOnEl(el, emoji, floatCount));
  }

  function spawnFloatingEmojisOnEl(container, emoji, count) {
    if (!container) return;
    const host = container.classList?.contains('seat-avatar') || container.classList?.contains('ap-guest-seat')
      ? container
      : container;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const isAffection = SEAT_REACTION_EMOJIS.includes(emoji);
    for (let i = 0; i < (count || 3); i += 1) {
      const el = document.createElement('span');
      el.className = 'ap-seat-emoji-float' + (isAffection ? ' ap-seat-emoji-float--affection' : '');
      el.textContent = emoji;
      el.style.setProperty('--drift-x', `${Math.round((Math.random() - 0.5) * 36)}px`);
      el.style.setProperty('--rise', `${Math.round(28 + Math.random() * 24)}px`);
      el.style.animationDelay = `${i * 0.12}s`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    }
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
    const pic = getChatProfilePic(msg);
    const enriched = { ...msg, profilePic: pic || msg.profilePic || null };
    if (enriched.userId && enriched.profilePic) cacheChatProfile(enriched.userId, enriched.profilePic);
    const existingIdx = chatMessages.findIndex((m) => chatMsgKey(m) === key);
    if (existingIdx >= 0) {
      const prev = chatMessages[existingIdx];
      chatMessages[existingIdx] = {
        ...prev,
        ...enriched,
        profilePic: enriched.profilePic || prev.profilePic || null,
      };
      return;
    }
    if (chatMessages.some((m) => chatMsgKey(m) === key)) return;
    chatMessages.push(enriched);
    if (chatMessages.length > 250) chatMessages = chatMessages.slice(-250);
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
          const isJoin = /\bjoined\b/i.test(msg.text || '');
          const isLeave = /\bleft\b/i.test(msg.text || '');
          div.className =
            'party-chat-msg system' + (isJoin ? ' join-msg' : '') + (isLeave ? ' leave-msg' : '');
          div.textContent = msg.text || '';
        } else if (msg.type === 'gift') {
          div.className = 'party-chat-msg party-chat-msg--gift';
          const g = msg.gift || {};
          div.innerHTML =
            `<span class="party-chat-gift-ico">${escapeHtml(g.emoji || '🎁')}</span>` +
            `<span><strong>${escapeHtml(msg.user || g.from || 'User')}</strong> sent ${escapeHtml(g.emoji || '🎁')} to ` +
            `<strong>${escapeHtml(g.to || g.recipientName || 'Host')}</strong> · ${formatGiftCount(g.amount || g.coins || 0)} coins</span>`;
        } else {
          div.className = 'party-chat-msg';
          const uid = msg.userId || '';
          const pic = msg.profilePic || getChatProfilePic(msg);
          const avatarSrc = avatarUrl(msg.user, pic);
          const lvlInfo = window.SocialFX
            ? SocialFX.getUserLevel(msg.userId || msg.user, msg.giftSpend)
            : { level: msg.lvl || 2, isVip: false, isFan: false };
          const badge = window.SocialFX
            ? SocialFX.levelBadgeHtml(lvlInfo.level, { isVip: lvlInfo.isVip, isFan: lvlInfo.isFan })
            : `<span class="lvl">${msg.lvl || 1}</span>`;
          const admin = uid && isAdminUserId(uid);
          const adminBadge = admin ? '<span class="party-chat-admin-badge">Admin</span>' : '';
          const roleBadge =
            !admin && msg.role
              ? window.formatRoleBadgeHtml?.(msg.role, { withEmoji: true }) || ''
              : '';
          div.innerHTML = `<button type="button" class="party-chat-avatar-btn${adminAvatarFrameClass(admin)}" data-chat-user="${escapeAttr(msg.user || 'User')}" data-chat-uid="${escapeHtml(String(uid))}"><img src="${escapeAttr(avatarSrc)}" alt="" data-name="${escapeAttr(msg.user || 'User')}" data-avatar-src="${escapeAttr(pic || '')}" loading="lazy" decoding="async" fetchpriority="low">${adminAvatarTagHtml(admin)}</button>${badge}${adminBadge}${roleBadge}<button type="button" class="party-chat-user-btn" data-chat-user="${escapeAttr(msg.user || 'User')}" data-chat-uid="${escapeHtml(String(uid))}"><span class="user${admin ? ' is-admin-name' : ''}">${escapeHtml(msg.user)}</span></button> <span class="party-chat-text">${escapeHtml(msg.text)}</span>`;
          const img = div.querySelector('.party-chat-avatar-btn img');
          if (img) {
            img.onerror = () => {
              img.onerror = null;
              img.src = avatarUrl(msg.user, null);
            };
          }
          div.querySelectorAll('.party-chat-avatar-btn, .party-chat-user-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              openProfileSheet(btn.dataset.chatUser || 'User', btn.dataset.chatUid || '');
            });
          });
        }
        feed.appendChild(div);
      });
    window.SocialUI?.bindAvatarFallbacks?.(feed);
    feed.scrollTop = feed.scrollHeight;
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

  function renderChatFromState() {
    (roomState?.messages || []).forEach((m) => {
      const enriched = { ...m, profilePic: m.profilePic || getChatProfilePic(m) };
      rememberChatMessage(enriched);
    });
    renderChatFeed();
  }

  function renderSeatButton(s, seatNum, tierCls) {
    if (!s || s.empty) {
      return `<button type="button" class="party-seat is-empty ${tierCls}" data-join-seat data-seat-num="${seatNum}">
        <div class="seat-avatar seat-avatar--empty"><span class="seat-num">${seatNum}</span><span class="seat-plus">+</span></div>
        <span class="seat-name">Open</span></button>`;
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
    const admin = memberIsAdminMarked(s) || isAdminUserId(s.userId);
    const adminBadge =
      !s.host && admin ? '<span class="seat-admin-badge">Admin</span>' : '';
    const roleBadge =
      !admin && s.userRole
        ? window.formatRoleBadgeHtml?.(s.userRole, { withEmoji: false }) || ''
        : '';
    const waveBars = s.speaking
      ? '<div class="seat-wave-bars"><span></span><span></span><span></span><span></span></div>'
      : '';
    return `
      <button type="button" class="party-seat${hostCls}${speaking}${mutedCls} ${tierCls}${admin ? ' is-admin-user' : ''}" data-seat="${seatNum}" data-user="${escapeHtml(s.name)}" data-user-id="${escapeHtml(String(s.userId || ''))}">
        <div class="seat-avatar${adminAvatarFrameClass(admin)}">
          <span class="seat-num">${seatNum}</span>
          ${crown}
          ${adminBadge}
          ${adminAvatarTagHtml(admin)}
          <img src="${avatarUrl(s.name, s.profilePic || liveProfilePic(s.userId, s.host ? resolveHostProfilePic() : null))}" alt="" data-name="${escapeAttr(s.name || 'User')}" loading="eager" decoding="async">
          ${mic}
          ${waveBars}
        </div>
        <span class="seat-name">${escapeHtml(s.name)}${roleBadge ? ` ${roleBadge}` : ''}</span>
        <span class="seat-gifts">🎁 ${formatGiftCount(s.gifts || 0)}</span>
      </button>`;
  }

  function patchSeatMuteUi(userId, muted) {
    const container = document.getElementById('partySeats');
    if (!container || !userId) return;
    container.querySelectorAll('.party-seat[data-user-id]').forEach((btn) => {
      if (String(btn.dataset.userId) !== String(userId)) return;
      btn.classList.toggle('is-muted', Boolean(muted));
      btn.classList.remove('is-speaking');
      const micSpan = btn.querySelector('.mic-off, .mic-live');
      if (micSpan) {
        micSpan.className = muted ? 'mic-off' : 'mic-live';
        micSpan.innerHTML = muted
          ? '<i class="fas fa-microphone-slash"></i>'
          : '<i class="fas fa-microphone"></i>';
      }
    });
  }

  function countStageGuests() {
    const seen = new Set();
    return (roomState?.seats || []).filter((s) => {
      if (!s || s.isHost) return false;
      const key = String(s.userId || s.name || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  function isStageFull() {
    if (isLiveRoomPage()) return countStageGuests() >= LIVE_MAX_GUESTS;
    return countStageGuests() >= PARTY_MAX_GUESTS;
  }

  function isPartySeatsFull() {
    return isStageFull();
  }

  function countPartyGuests() {
    return countStageGuests();
  }

  function renderPartySeats(hostName) {
    const container = document.getElementById('partySeats');
    if (!container) return;

    const me = displayName(currentUser());
    const meId = currentUser()?.id ? String(currentUser().id) : '';
    const hosting = isHost();
    const hostPic = resolveHostProfilePic();
    const host = {
      name: hosting ? me : hostName || 'Host',
      userId: hosting ? meId : roomState?.hostId || '',
      profilePic: hostPic,
      host: true,
      gifts: 0,
      muted: micMuted,
      speaking: hosting && !micMuted,
      userRole:
        roomState?.hostUserRole ||
        (hosting ? currentUser()?.role : null) ||
        null,
    };

    const seenGuests = new Set();
    const guests = collectPartySeatGuests().filter((s) => {
      const key = String(s.userId || s.name);
      if (seenGuests.has(key)) return false;
      seenGuests.add(key);
      return true;
    });

    const slots = new Array(PARTY_MAX_SEATS).fill(null);
    slots[PARTY_HOST_SLOT] = host;
    const unplaced = [];
    guests.forEach((g) => {
      const idx =
        g.seatIndex != null ? Number(g.seatIndex) - 1 : g.seat_index != null ? Number(g.seat_index) - 1 : -1;
      if (idx >= 0 && idx < PARTY_MAX_SEATS && idx !== PARTY_HOST_SLOT && !slots[idx]) {
        slots[idx] = { ...g, host: false };
      } else {
        unplaced.push({ ...g, host: false });
      }
    });
    let guestIdx = 0;
    for (let i = 0; i < PARTY_MAX_SEATS; i += 1) {
      if (i === PARTY_HOST_SLOT || slots[i]) continue;
      const next = unplaced[guestIdx];
      if (next) {
        slots[i] = next;
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
        const uid = btn.dataset.userId || '';
        const seatNum = Number(btn.dataset.seat) || 0;
        if (canModerateRoom() && uid && !btn.classList.contains('is-host')) {
          openModerationMenu(name, uid, seatNum);
          return;
        }
        if (canModerateRoom() && btn.classList.contains('is-empty')) {
          openAvailableUsersForSeat(seatNum);
          return;
        }
        openProfileSheet(name, uid);
      });
    });
    container.querySelectorAll('[data-join-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isHost()) openSeatSheet(btn.dataset.seatNum);
        else requestSeatJoin();
      });
    });
    if (canModerateRoom()) bindSeatDragDrop(container);
    window.SocialUI?.bindAvatarFallbacks?.(container);
    paintHostAvatarImg(document.getElementById('partyHostAvatar'), hostName);
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
    if (roomJoinCompleted) hideApLoader();
    const user = currentUser();
    const meId = user?.id ? String(user.id) : '';
    if (meId && roomState?.seats?.some((s) => String(s.userId) === meId && !s.isHost)) {
      hasSpeakerSeat = true;
      if (
        !isHost() &&
        !publishSucceeded &&
        !guestPublishInProgress &&
        (!guestPublishAttempted || !getLocalAudioTrack())
      ) {
        const now = Date.now();
        if (!window.__apGuestPubRetryAt || now - window.__apGuestPubRetryAt > 2500) {
          window.__apGuestPubRetryAt = now;
          publishGuestAudio().catch(() => { });
        }
      }
    } else if (meId && hasSpeakerSeat) {
      const stillSeated = (roomState?.seats || []).some(
        (s) => String(s.userId) === meId && !s.isHost
      );
      if (!stillSeated) {
        hasSpeakerSeat = false;
        guestPublishAttempted = false;
      }
    }
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    if (joinBtn) {
      joinBtn.textContent = isLiveRoomPage() ? 'Join live' : 'Request mic';
      const showRequest = !isHost() && !hasSpeakerSeat && (isPartyRoomPage() || isLiveRoomPage());
      joinBtn.style.display = showRequest ? '' : 'none';
    }
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostEl) {
      const full = hostName || 'Host';
      const hostRole =
        roomState?.hostUserRole || (isHost() ? currentUser()?.role : null) || null;
      const hostBadge =
        !roomState?.hostIsPlatformAdmin && hostRole
          ? window.formatRoleBadgeHtml?.(hostRole, { withEmoji: false }) || ''
          : '';
      hostEl.innerHTML = `${escapeHtml(full)}${hostBadge ? ` ${hostBadge}` : ''}`;
      hostEl.title = full;
    }
    if (hostImg) {
      paintHostAvatarImg(hostImg, hostName);
    }

    const vc = document.getElementById('liveViewerCount');
    if (vc && roomState) vc.textContent = String(roomState.viewers || (isHost() ? 1 : 0));
    renderTopGifters();
    const hearts = document.getElementById('partyHearts');
    if (hearts) hearts.textContent = String(roomState?.gifts?.length || 0);

    if (document.getElementById('partySeats')) renderPartySeats(hostName);
    renderChatFromState();
    hydrateGiftHistoryFromState(roomState);
    renderRoomGiftPanels();
    renderGuestRail();
    syncFollowUI();
    syncAgoraUidMap();
    renderPartyAudienceBar();
    renderAvailableUsers();

    const lockBtn = document.getElementById('partyBtnLock');
    if (lockBtn) {
      lockBtn.classList.toggle('is-active', Boolean(roomState?.isLocked));
      const lockLbl = lockBtn.querySelector('.party-lock-label');
      if (lockLbl) lockLbl.textContent = roomState?.isLocked ? 'Unlock' : 'Lock room';
    }

    const audioAvatar = document.getElementById('liveAudioAvatar');
    if (audioAvatar) audioAvatar.src = avatarUrl(hostName);

    const ticker = document.getElementById('liveTicker');
    if (ticker) {
      const viewers = roomState?.viewers || 0;
      if (!isHost() && remoteUsers.size > 0) {
        ticker.innerHTML =
          '<span class="live-watch-pill">● Watching live</span>' +
          escapeHtml(hostName) +
          ' · ' +
          viewers +
          ' watching';
      } else {
        ticker.textContent = `${hostName} is live · ${viewers} watching`;
      }
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
    syncHostBarUi();
    if (roomState?.roomStyle?.backgroundId) applyRoomBackground(roomState.roomStyle.backgroundId);
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
      let icon = btn.querySelector('i');
      if (!icon) {
        btn.textContent = '';
        icon = document.createElement('i');
        btn.appendChild(icon);
      }
      icon.className = micMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
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
    const audience = getPartyAudienceMembers();
    const seats = (roomState?.seats || []).filter((s) => s && s.name && !s.isHost);
    const gifts = roomState?.gifts || [];
    let show = audience.slice(0, 4).map((m) => ({
      name: m.name || 'Guest',
      profilePic: m.profilePic,
      gifts: 0,
      userId: m.userId,
    }));
    if (!show.length && seats.length) {
      show = seats.slice(0, 3).map((s) => ({ name: s.name, profilePic: s.profilePic, gifts: s.gifts || 0, userId: s.userId }));
    }
    if (!show.length && gifts.length) {
      show = gifts.slice(0, 2).map((g, i) => ({ name: g.from || 'Fan' + (i + 1), gifts: g.amount || 0 }));
    }
    let html = '';
    if (show.length) {
      html = show
        .slice(0, 4)
        .map(
          (n, i) =>
            `<span class="ap-top-gifter${i === 0 ? ' has-crown' : ''}"${n.userId ? ` data-audience-id="${escapeHtml(String(n.userId))}" data-audience-name="${escapeAttr(n.name || 'Guest')}"` : ''
            }><img src="${avatarUrl(n.name, n.profilePic)}" alt="${escapeHtml(n.name)}" data-name="${escapeHtml(n.name)}">${n.gifts > 0 ? `<em>${formatGiftCount(n.gifts)}</em>` : ''
            }</span>`
        )
        .join('');
    }
    html += `<span class="party-viewer-count${isLiveRoomPage() ? ' live-joined-count' : ''}" id="liveViewerCount" title="Tap to view everyone in room">${viewers}${isLiveRoomPage() ? ' joined' : ''}</span>`;
    row.innerHTML = html;
    row.classList.toggle('is-clickable', isPartyRoomPage() || isLiveRoomPage());
    if (!row.dataset.audienceBound) {
      row.dataset.audienceBound = '1';
      row.addEventListener('click', (e) => {
        if (!isPartyRoomPage() && !isLiveRoomPage()) return;
        if (e.target.closest('.ap-top-gifter[data-audience-id]')) {
          const chip = e.target.closest('[data-audience-id]');
          openProfileSheet(chip.dataset.audienceName || 'Guest', chip.dataset.audienceId || '');
          return;
        }
        openPartyRequestsSheet();
      });
    }
    window.SocialUI?.bindAvatarFallbacks?.(row);
  }

  function renderGuestRail() {
    const rail = document.getElementById('apGuestRail');
    if (!rail) return;
    const guests = collectPartySeatGuests().slice(0, LIVE_MAX_GUESTS);
    if (!guests.length) {
      rail.innerHTML = '';
      rail.style.display = 'none';
      document.body.classList.remove('ap-has-live-guests');
      return;
    }
    document.body.classList.add('ap-has-live-guests');
    rail.style.display = 'flex';
    rail.innerHTML = guests
      .map((s) => {
        const uid = String(s.userId || '');
        const canRemove = canModerateRoom() && uid && !isRoomHostUserId(uid);
        const admin = memberIsAdminMarked(s) || isAdminUserId(uid);
        const roleBadge =
          !admin && s.userRole
            ? window.formatRoleBadgeHtml?.(s.userRole, { withEmoji: false }) || ''
            : '';
        return `
      <button type="button" class="ap-guest-seat${admin ? ' is-admin-user' : ''}" data-guest="${escapeHtml(s.name)}" data-guest-id="${escapeHtml(uid)}">
        ${canRemove ? `<span class="ap-guest-remove" data-remove-guest="${escapeHtml(uid)}" title="Remove guest" aria-label="Remove guest">×</span>` : ''}
        <span class="ap-guest-gift">${formatGiftCount(s.gifts || 0)}</span>
        <span class="ap-guest-avatar${adminAvatarFrameClass(admin)}">
          ${adminAvatarTagHtml(admin)}
          <img src="${avatarUrl(s.name, s.profilePic || liveProfilePic(s.userId, null))}" alt="" data-name="${escapeAttr(s.name || 'Guest')}" loading="lazy">
        </span>
        <span class="ap-guest-name">${escapeHtml(String(s.name).slice(0, 8))}${roleBadge ? ` ${roleBadge}` : ''}</span>
      </button>`;
      })
      .join('');
    rail.querySelectorAll('[data-remove-guest]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.removeGuest;
        const seat = guests.find((g) => String(g.userId) === String(uid));
        const label = seat?.name || 'this guest';
        if (!window.confirm(`Remove ${label} from live?`)) return;
        demoteUserFromSeat(uid);
      });
    });
    rail.querySelectorAll('.ap-guest-seat').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.guest || 'Guest';
        const uid = btn.dataset.guestId || '';
        if (canModerateRoom() && uid && !isRoomHostUserId(uid)) {
          openModerationMenu(name, uid);
          return;
        }
        openProfileSheet(name, uid);
      });
    });
    window.SocialUI?.bindAvatarFallbacks?.(rail);
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
      document.getElementById('partyRequestsSheet')?.classList.contains('open') ||
      document.getElementById('partyMusicSheet')?.classList.contains('open') ||
      document.getElementById('partyBgPickerSheet')?.classList.contains('open')
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
    bindPartyRequestsSheet();
    syncBottomBarHeightVar();
    pinFixedOverlaysToBody();
    renderJoinRequests();
    renderAvailableUsers();
    renderRoomGiftPanels();
    const head = document.querySelector('#partyRequestsSheet .party-requests-head h3');
    const hint = document.querySelector('#partyRequestsSheet .party-requests-hint');
    if (head) head.textContent = canModerateRoom() ? 'Room members' : 'People in room';
    if (hint) {
      if (canModerateRoom()) {
        hint.textContent = isLiveRoomPage()
          ? 'Accept mic requests to add guests. Tap a guest or use Remove to take them off live.'
          : 'Accept mic requests and invite listeners to seats. Tap a seated guest to remove them.';
      } else {
        hint.textContent = isLiveRoomPage()
          ? 'Everyone currently in this live. Tap a name to view their profile.'
          : 'Everyone currently in this party room. Tap a name to view their profile.';
      }
    }
    document.body.classList.add('party-requests-open');
    document.getElementById('partyRequestsSheet')?.classList.add('open');
    syncLiveOverlayClass();
  }

  function closePartyRequestsSheet() {
    document.body.classList.remove('party-requests-open');
    document.getElementById('partyRequestsSheet')?.classList.remove('open');
    syncLiveOverlayClass();
  }

  function bindPartyRequestsSheet() {
    const sheet = document.getElementById('partyRequestsSheet');
    if (!sheet || sheet.dataset.requestsBound === '1') return;
    sheet.dataset.requestsBound = '1';
    document.getElementById('partyRequestsClose')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePartyRequestsSheet();
    });
    sheet.addEventListener('click', (e) => {
      if (!e.target.closest('.party-requests-panel')) closePartyRequestsSheet();
    });
    sheet.querySelector('.party-requests-panel')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  function ensureInviteInline() {
    const pill = document.getElementById('partyInvitePill');
    if (!pill) return;
    pill.classList.remove('party-event-pill--inline');
    if (isLiveRoomPage()) {
      const target = document.getElementById('partyLiveActions');
      if (!target) return;
      const hostBar = document.getElementById('liveHostBar');
      if (pill.parentElement !== target || (hostBar && pill.nextElementSibling !== hostBar && hostBar.parentElement === target)) {
        if (hostBar && hostBar.parentElement === target) target.insertBefore(pill, hostBar);
        else target.appendChild(pill);
      }
      return;
    }
    const target = document.querySelector('.party-invite-row') || document.getElementById('partyHostBar');
    if (target && pill.parentElement !== target) target.appendChild(pill);
  }

  function loadPartyMusicCustomTracks() {
    try {
      const raw = localStorage.getItem(PARTY_MUSIC_STORAGE_KEY);
      partyMusicCustomTracks = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(partyMusicCustomTracks)) partyMusicCustomTracks = [];
    } catch (_e) {
      partyMusicCustomTracks = [];
    }
  }

  function savePartyMusicCustomTracks() {
    try {
      localStorage.setItem(PARTY_MUSIC_STORAGE_KEY, JSON.stringify(partyMusicCustomTracks.slice(0, 20)));
    } catch (_e) { }
  }

  function getPartyMusicTracks() {
    loadPartyMusicCustomTracks();
    return [...PARTY_MUSIC_PRESETS, ...partyMusicCustomTracks];
  }

  function resolvePartyMusicUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (u.startsWith('http') || u.startsWith('blob:') || u.startsWith('data:')) return u;
    if (window.SocialShell?.getImageUrl) return SocialShell.getImageUrl(u) || u;
    const base = (window.CONFIG?.BACKEND_URL || '').replace(/\/$/, '');
    return base ? `${base}${u.startsWith('/') ? '' : '/'}${u}` : u;
  }

  function applyRoomBackground(backgroundId) {
    const bg = PARTY_BACKGROUNDS.find((b) => b.id === backgroundId) || PARTY_BACKGROUNDS[0];
    const floor = document.querySelector('.party-room-grid-floor');
    const roomRoot = document.querySelector('.party-room') || document.querySelector('.live-room');
    const target = floor || roomRoot;
    if (target && bg?.css) {
      target.style.background = bg.css;
      target.style.backgroundSize = 'cover';
    }
    if (roomRoot && !floor) {
      roomRoot.style.background = bg.css;
    }
  }

  function isAdminUserId(userId) {
    const uid = String(userId || '');
    if (!uid) return false;
    if (roomState?.hostId && uid === String(roomState.hostId) && roomState.hostIsPlatformAdmin) {
      return true;
    }
    return (roomState?.onlineMembers || []).some(
      (m) =>
        String(m.userId) === uid &&
        (m.isAdmin || m.isPlatformAdmin || m.role === 'admin')
    ) || (roomState?.seats || []).some(
      (s) =>
        String(s.userId) === uid &&
        (s.isAdmin || s.isPlatformAdmin || s.role === 'admin')
    );
  }

  function isPlatformAdminUserId(userId) {
    const uid = String(userId || '');
    if (!uid) return false;
    if (roomState?.hostId && uid === String(roomState.hostId) && roomState.hostIsPlatformAdmin) {
      return true;
    }
    return (roomState?.onlineMembers || []).some(
      (m) => String(m.userId) === uid && m.isPlatformAdmin
    ) || (roomState?.seats || []).some((s) => String(s.userId) === uid && s.isPlatformAdmin);
  }

  function memberIsAdminMarked(member) {
    if (!member) return false;
    return Boolean(
      member.isAdmin ||
      member.isPlatformAdmin ||
      member.role === 'admin' ||
      isAdminUserId(member.userId)
    );
  }

  function adminAvatarFrameClass(isAdmin) {
    return isAdmin ? ' ap-admin-frame' : '';
  }

  function adminAvatarTagHtml(isAdmin) {
    return isAdmin ? '<span class="ap-admin-avatar-tag" title="Admin">ADMIN</span>' : '';
  }

  function ensureRoomBackgroundPicker() {
    if (!isHost() || document.getElementById('partyBgPickerSheet')) return;
    const items = PARTY_BACKGROUNDS.map(
      (b) =>
        `<button type="button" class="party-bg-tile${b.premium ? ' is-premium' : ''}" data-bg-id="${escapeAttr(b.id)}" style="background:${b.css}">` +
        `<span>${escapeHtml(b.label)}</span>${b.premium ? '<em>VIP</em>' : ''}</button>`
    ).join('');
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="party-music-sheet party-bg-sheet" id="partyBgPickerSheet" aria-hidden="true">
        <div class="party-music-panel">
          <h3>Room background</h3>
          <p>Pick a look for your party — premium themes need coins or VIP.</p>
          <div class="party-bg-grid">${items}</div>
          <div class="party-music-actions">
            <button type="button" class="party-music-close" id="partyBgPickerClose">Close</button>
          </div>
        </div>
      </div>`
    );
    document.getElementById('partyBgPickerClose')?.addEventListener('click', () => {
      document.getElementById('partyBgPickerSheet')?.classList.remove('open');
      syncLiveOverlayClass();
    });
    document.getElementById('partyBgPickerSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyBgPickerSheet') {
        e.target.classList.remove('open');
        syncLiveOverlayClass();
      }
    });
    document.querySelector('#partyBgPickerSheet .party-music-panel')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.querySelectorAll('.party-bg-tile').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const bg = PARTY_BACKGROUNDS.find((b) => b.id === btn.dataset.bgId);
        if (!bg) return;
        if (bg.premium) {
          const bal = await getCoins(true);
          if (bal < 500) {
            toast('Premium backgrounds need 500+ coins or VIP', 'warning');
            openTopupSheet();
            return;
          }
        }
        applyRoomBackground(bg.id);
        if (roomState) roomState.roomStyle = { backgroundId: bg.id };
        if (liveSocket?.connected && isHost()) {
          liveSocket.emit('live:room_style', { channel: channelId(), backgroundId: bg.id });
        }
        toast(`Background: ${bg.label}`, 'success');
        document.getElementById('partyBgPickerSheet')?.classList.remove('open');
        syncLiveOverlayClass();
      });
    });
  }

  function openRoomBackgroundPicker() {
    ensureRoomBackgroundPicker();
    document.getElementById('partyToolsSheet')?.classList.remove('open');
    document.getElementById('partyBgPickerSheet')?.classList.add('open');
    syncLiveOverlayClass();
  }

  async function uploadPartyMusicFile(file) {
    if (!file || !window.API) throw new Error('No file');
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    const fd = new FormData();
    fd.append('music', file);
    const res = await API.post('/live/party-music', fd);
    const data = res?.data?.data || res?.data;
    if (!data?.url) throw new Error(res?.data?.message || 'Upload failed');
    return data;
  }

  function renderPartyMusicList() {
    const list = document.getElementById('partyMusicList');
    if (!list) return;
    const tracks = getPartyMusicTracks();
    list.innerHTML =
      tracks
        .map(
          (track) =>
            `<button type="button" class="party-music-track" data-music-id="${escapeAttr(track.id)}">` +
            `<i class="fas fa-play"></i><span>${escapeHtml(track.title)}</span></button>`
        )
        .join('') +
      `<label class="party-music-upload"><i class="fas fa-upload"></i> Upload your music<input type="file" id="partyMusicUploadInput" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden></label>`;
    list.querySelectorAll('[data-music-id]').forEach((btn) => {
      btn.addEventListener('click', () => playPartyMusic(btn.dataset.musicId));
    });
    document.getElementById('partyMusicUploadInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        toast('Uploading music…', 'info');
        const uploaded = await uploadPartyMusicFile(file);
        const id = `custom-${Date.now()}`;
        partyMusicCustomTracks.unshift({
          id,
          title: uploaded.name || file.name || 'My track',
          url: uploaded.url,
        });
        savePartyMusicCustomTracks();
        renderPartyMusicList();
        playPartyMusic(id);
      } catch (err) {
        toast(err?.message || 'Could not upload music', 'error');
      }
    });
  }

  function ensurePartyMusicUi() {
    const list = document.getElementById('partyMusicList');
    if (!list) return;
    if (list.dataset.bound !== '1') {
      list.dataset.bound = '1';
      renderPartyMusicList();
      return;
    }
    renderPartyMusicList();
  }

  function getPartyBgMusicEl() {
    return document.getElementById('partyBgMusic');
  }

  function syncPartyMusicUi() {
    document.querySelectorAll('.party-music-track').forEach((btn) => {
      btn.classList.toggle('is-playing', btn.dataset.musicId === partyMusicPlayingId);
      const icon = btn.querySelector('i');
      if (icon) icon.className = btn.dataset.musicId === partyMusicPlayingId ? 'fas fa-pause' : 'fas fa-play';
    });
  }

  function stopPartyMusic() {
    const audio = getPartyBgMusicEl();
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    partyMusicPlayingId = '';
    syncPartyMusicUi();
  }

  function playPartyMusic(trackId) {
    const track = getPartyMusicTracks().find((t) => t.id === trackId);
    if (!track) return;
    const audio = getPartyBgMusicEl();
    if (!audio) return;
    if (partyMusicPlayingId === trackId && !audio.paused) {
      stopPartyMusic();
      toast('Music stopped', 'info');
      return;
    }
    partyMusicPlayingId = trackId;
    audio.src = resolvePartyMusicUrl(track.url);
    audio.volume = 0.35;
    audio.play().then(() => {
      syncPartyMusicUi();
      toast(`Playing ${track.title}`, 'success');
    }).catch(() => {
      partyMusicPlayingId = '';
      syncPartyMusicUi();
      toast('Could not play music on this device', 'warning');
    });
  }

  function openPartyMusicSheet() {
    ensurePartyMusicUi();
    syncPartyMusicUi();
    document.getElementById('partyToolsSheet')?.classList.remove('open');
    document.getElementById('partyMusicSheet')?.classList.add('open');
    syncLiveOverlayClass();
  }

  function closePartyMusicSheet() {
    document.getElementById('partyMusicSheet')?.classList.remove('open');
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
    if (except !== 'requests') closePartyRequestsSheet();
    if (except !== 'music') closePartyMusicSheet();
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
      joinBtn.textContent = isLiveRoomPage() ? 'Join live' : 'Request mic';
      const showRequest = !hosting && !hasSpeakerSeat && (isPartyRoomPage() || isLiveRoomPage());
      joinBtn.style.display = showRequest ? '' : 'none';
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
        ensureMicPublishing();
      });
    }
    const titleEl = document.getElementById('apInRoomWebTitle');
    if (titleEl) titleEl.textContent = title || 'AP Services';
    const iframe = document.getElementById('apInRoomWebFrame');
    if (iframe) iframe.src = url;
    frame?.classList.add('open');
  }

  function closeLiveUiForBack() {
    const inRoomWeb = document.getElementById('apInRoomWebPanel')?.classList.contains('open');
    if (inRoomWeb) {
      document.getElementById('apInRoomWebPanel')?.classList.remove('open');
      const iframe = document.getElementById('apInRoomWebFrame');
      if (iframe) iframe.src = 'about:blank';
      ensureMicPublishing();
      return true;
    }
    const openSheet = document.querySelector(
      '.party-tools-sheet.open, .gift-sheet.open, .party-requests-sheet.open, .social-broadcast-sheet-wrap.is-open, .ap-modal-overlay.open, .ap-modal-overlay.show'
    );
    const emojiOpen = document.getElementById('apEmojiPopover')?.classList.contains('is-open');
    if (openSheet || emojiOpen) {
      if (openSheet) {
        openSheet.classList.remove('open', 'is-open', 'is-visible', 'show');
      }
      if (emojiOpen) document.getElementById('apEmojiPopover')?.classList.remove('is-open');
      document.body.classList.remove('ap-live-overlay-open', 'ap-chat-open');
      closeLiveOverlays();
      return true;
    }
    return false;
  }

  async function leaveToExplore(opts = {}) {
    if (window.__apLeavingRoom) return;
    hideApLoader();
    setLiveStatus('', null);
    closeLiveOverlays();

    const browseUrl = opts.browseUrl || '/explore.html?app=1&source=expo-app';
    if (opts.minimize !== false) {
      if (window.LiveSession?.minimize?.(browseUrl)) {
        minimizingRoom = true;
        try {
          history.pushState({ apLiveRoom: 1 }, '');
          history.pushState({ apLiveRoom: 2 }, '');
        } catch (_e) { }
        return;
      }
      if ((isPartyRoomPage() || isLiveRoomPage()) && window.LiveSession?.openBrowsePage?.(browseUrl)) {
        minimizingRoom = true;
        return;
      }
      if ((isPartyRoomPage() || isLiveRoomPage()) && opts.minimize !== false) {
        return;
      }
    }

    window.__apLeavingRoom = true;
    minimizingRoom = false;
    try {
      await stopAgora({ skipEndRoom: !isHost() || hostEndingIntentionally });
    } catch (_e) { }
    leaveSocket();
    try {
      sessionStorage.removeItem('ap_live_pip_session');
      if (!window.__apLiveSessionExitInProgress) window.LiveSession?.forceCleanup?.();
    } catch (_e) { }
    location.href = browseUrl;
  }

  function handleLiveRoomBack() {
    if (window.__apLeavingRoom) return true;
    if (window.LiveSession?.isMinimized?.()) {
      return window.LiveSession.handleBack?.() ?? true;
    }
    if (closeLiveUiForBack()) return true;
    if (window.LiveSession?.handleBack?.()) return true;
    if (window.LiveSession?.minimize?.('/explore.html?app=1&source=expo-app')) return true;
    leaveToExplore({ minimize: true });
    return true;
  }

  function initLiveBackGuard() {
    if (window.__AP_LIVE_BACK_GUARD__) return;
    window.__AP_LIVE_BACK_GUARD__ = true;
    if (!isLiveRoomPage() && !isPartyRoomPage()) return;
    try {
      history.pushState({ apLiveRoom: 1 }, '');
      history.pushState({ apLiveRoom: 2 }, '');
    } catch (_e) { }
    window.addEventListener('popstate', () => {
      if (window.__apLeavingRoom) return;
      handleLiveRoomBack();
    });
  }

  function bindPartyBackGuard() {
    initLiveBackGuard();
  }

  function minimizeLiveRoom() {
    if (minimizingRoom) return;
    leaveToExplore({ minimize: true });
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
      /* Keep full room history visible while composing (do not filter to chat-only) */
      chatTab = 'all';
      document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === 'all');
      });
      document.body.classList.add('ap-chat-open');
      renderChatFromState();
      requestAnimationFrame(() => {
        const feed = document.getElementById('partyChatFeed');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
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
    } catch (_e) { }
    syncToolBadges();
  }

  function prepareLiveUiShell() {
    scheduleHideAppChrome();
    document.getElementById('apChatPanel')?.remove();
    document.body.classList.remove('ap-chat-open');
    injectLiveOverlays();
    bindPartyRequestsSheet();
    ensureInviteInline();
    ensureChatPanelChrome();
    ensureBottomComposeLayout();
    syncBottomBarForRole();
    syncHostBarUi();
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
    if (!document.getElementById('partyRequestsSheet') && isLiveRoomPage()) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="party-requests-sheet" id="partyRequestsSheet">
          <div class="party-requests-panel">
            <div class="party-requests-head">
              <h3>People in live</h3>
              <button type="button" id="partyRequestsClose"><i class="fas fa-times"></i></button>
            </div>
            <p class="party-requests-hint">Viewers watching the stream. Accept mic requests to let guests join on camera (up to 4 guests).</p>
            <div id="partyRequestsList" class="party-requests-list"></div>
            <h4 class="party-requests-subtitle">In room (online)</h4>
            <div id="partyAvailableList" class="party-requests-list"></div>
            <h4 class="party-requests-subtitle">Room gift totals</h4>
            <div id="partyRoomGiftAnalytics" class="party-gift-analytics"></div>
            <h4 class="party-requests-subtitle">Gift history</h4>
            <div id="partyGiftHistoryList" class="party-gift-history"></div>
          </div>
        </div>`
      );
    }
    if (!document.getElementById('apMicLinkModal') && (isPartyRoomPage() || isLiveRoomPage())) {
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
    let subscribed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await agoraClient.subscribe(user, mediaType);
        subscribed = true;
        break;
      } catch (subErr) {
        const msg = subErr?.message || String(subErr);
        liveDebugLog(`subscribe FAILED uid=${user.uid} media=${mediaType} attempt=${attempt}: ${msg}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (!subscribed) {
      scheduleMediaRecover('subscribe_failed');
      return;
    }
    if (mediaType === 'video') {
      const container = document.getElementById('liveRemoteHost');
      const root = document.getElementById('liveRoomRoot');
      // Host switched audio → video: leave voice stage even if URL still says mode=audio
      if (!isHost()) {
        broadcastMode = 'video';
        clearAudioModeUi();
      }
      if (root) root.classList.remove('is-audio-mode');
      if (container && user.videoTrack) {
        container.innerHTML = '';
        try {
          user.videoTrack.play(container);
        } catch (playErr) {
          liveDebugLog(`video play failed: ${playErr?.message || playErr}`);
          setTimeout(() => {
            try {
              user.videoTrack?.play(container);
            } catch (_e2) { }
          }, 400);
        }
      }
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
      setLiveStreamVisible(true);
      updateModeBadge('video', false);
      // Video often unlocks first; retry audio right after so voice isn't stuck silent.
      setTimeout(() => ensureRemoteAudioPlaying().catch(() => { }), 200);
    }
    if (mediaType === 'audio') {
      // Hosts must always hear on-seat guests; soundOn only mutes for viewers.
      const shouldPlay = Boolean(soundOn || isHost());
      if (shouldPlay && user.audioTrack) {
        try {
          user.audioTrack.setVolume?.(100);
        } catch (_e) { }
        try {
          const p = user.audioTrack.play();
          if (p && typeof p.then === 'function') {
            await p.catch((err) => {
              liveDebugLog(`audio play blocked: ${err?.message || err}`);
              showTapForSoundHint();
            });
          }
          audioUnlocked = true;
          hideTapForSoundHint();
        } catch (_e) {
          showTapForSoundHint();
        }
      } else if (!shouldPlay) {
        try {
          user.audioTrack?.stop();
        } catch (_e) { }
      }
    }
    remoteUsers.set(user.uid, user);
    updateLiveDebug({ remoteUsersCount: remoteUsers.size });
    syncLiveUiState();
  }

  function isLocalMicHealthy() {
    const track = getLocalAudioTrack?.();
    if (!track) return false;
    try {
      const mst = track.getMediaStreamTrack?.();
      if (mst && mst.readyState === 'ended') return false;
      if (mst && mst.muted && !micMuted) return false;
    } catch (_e) { }
    try {
      const published = agoraClient?.localTracks || [];
      if (published.length) {
        return published.some((t) => {
          const type = t.getTrackType?.() || t.trackMediaType;
          return type === 'audio';
        });
      }
    } catch (_e) { }
    return true;
  }

  async function ensureHostAudioPublishing() {
    if (!isHost() || !agoraClient || !publishSucceeded || !liveDebugState.agoraJoined) return;
    if (isLocalMicHealthy()) {
      await applyLocalMicMuteState();
      return;
    }
    liveDebugLog('host mic missing/unhealthy — republishing audio');
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    // Drop dead audio tracks
    localTracks = localTracks.filter((t) => {
      const type = t.getTrackType?.() || t.trackMediaType;
      if (type !== 'audio') return true;
      try {
        return t.getMediaStreamTrack?.()?.readyState !== 'ended';
      } catch (_e) {
        return false;
      }
    });
    try {
      const staleAudio = (agoraClient.localTracks || []).filter((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type === 'audio';
      });
      if (staleAudio.length) {
        try {
          await agoraClient.unpublish(staleAudio);
        } catch (_e) { }
        staleAudio.forEach((t) => {
          try {
            t.stop?.();
            t.close?.();
          } catch (_e) { }
        });
      }
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await agoraClient.publish(audioTrack);
      const video = getLocalVideoTrack() || rawCameraTrack;
      localTracks = video ? [audioTrack, video] : [audioTrack];
      micMuted = false;
      await applyLocalMicMuteState();
      syncMicButtonUi();
      liveDebugLog('host mic republished OK');
    } catch (e) {
      liveDebugLog(`host mic republish failed: ${e?.message || e}`);
    }
  }

  async function ensureRemoteAudioPlaying() {
    // Hosts must hear on-seat guests even if viewer "sound" toggle is off.
    if (!agoraClient) return;
    if (!soundOn && !isHost()) return;
    const remotes = agoraClient.remoteUsers || [];
    for (const user of remotes) {
      try {
        if (user.hasAudio && !user.audioTrack) {
          await playRemoteMedia(user, 'audio');
        } else if (user.audioTrack) {
          user.audioTrack.setVolume?.(100);
          const p = user.audioTrack.play?.();
          if (p && typeof p.then === 'function') await p.catch(() => showTapForSoundHint());
          else audioUnlocked = true;
        }
      } catch (_e) {
        showTapForSoundHint();
      }
    }
  }

  function showTapForSoundHint() {
    if (!soundOn) return;
    let el = document.getElementById('apTapForSound');
    if (!el) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<button type="button" id="apTapForSound" class="ap-tap-for-sound" aria-label="Enable sound">
          <i class="fas fa-volume-up"></i> Tap for sound
        </button>`
      );
      el = document.getElementById('apTapForSound');
      el?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        audioUnlocked = true;
        soundOn = true;
        await ensureRemoteAudioPlaying();
        hideTapForSoundHint();
        toast('Sound on', 'success');
        const btn = document.getElementById('partyBtnSound');
        if (btn) {
          const ico = btn.querySelector('i');
          if (ico) ico.className = 'fas fa-volume-up';
          btn.classList.remove('is-muted');
        }
      });
    }
    if (el) el.classList.add('is-visible');
  }

  function hideTapForSoundHint() {
    document.getElementById('apTapForSound')?.classList.remove('is-visible');
  }

  function bindAudioUnlockGestures() {
    if (audioUnlockBound || isHost()) return;
    audioUnlockBound = true;
    const unlock = () => {
      if (audioUnlocked && !document.getElementById('apTapForSound')?.classList.contains('is-visible')) return;
      ensureRemoteAudioPlaying().catch(() => { });
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock, { passive: true });
  }

  function ensureHostVideoVisible() {
    if (broadcastMode === 'audio') return;
    if (!publishSucceeded && !getLocalVideoTrack() && !rawCameraTrack) return;
    const root = document.getElementById('liveRoomRoot');
    const localBox = document.getElementById('liveLocalHost');
    const fallback = document.getElementById('liveLocalVideo');
    const bg = document.getElementById('liveBg');
    if (root) root.classList.remove('is-audio-mode');
    if (localBox) {
      localBox.style.display = '';
      applyHostPreviewMirror(localBox, cameraFacing);
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
    const mod = canModerateRoom();
    if (badge) badge.textContent = String(mod ? joinRequests.length : getPartyMembersForList().length);
    if (!list) return;
    if (!mod) {
      list.innerHTML = '<p class="party-requests-empty">Mic requests are reviewed by the host or room admin</p>';
      return;
    }
    if (!joinRequests.length) {
      list.innerHTML = '<p class="party-requests-empty">No pending mic requests</p>';
      return;
    }
    list.innerHTML = joinRequests
      .map(
        (r) => `
      <div class="party-req-row" data-req="${r.id}">
        <img src="${avatarUrl(r.name, r.profilePic)}" alt="">
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
          liveSocket.emit(
            'live:seat_response',
            {
              channel: channelId(),
              userId: req.userId || req.id,
              name: req.name,
              accepted: true,
            },
            (res) => {
              if (res?.ok) toast(isLiveRoomPage() ? 'Guest joined live' : 'Guest accepted', 'success');
              else toast(res?.message || 'Could not accept guest', 'error');
            }
          );
        } else {
          toast('Guest accepted');
        }
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

  function renderRoomGiftPanels() {
    const analyticsEl = document.getElementById('partyRoomGiftAnalytics');
    const historyEl = document.getElementById('partyGiftHistoryList');
    if (!analyticsEl && !historyEl) return;

    const totals = new Map();
    roomGiftHistory.forEach((g) => {
      const key = String(g.toUserId || g.to || 'host');
      const label = g.to || 'Host';
      const prev = totals.get(key) || { label, coins: 0, count: 0 };
      prev.coins += Number(g.amount || 0);
      prev.count += 1;
      totals.set(key, prev);
    });
    (roomState?.gifts || []).forEach((g) => {
      const key = String(g.toUserId || g.to || g.from || 'guest');
      const label = g.to || g.from || 'Guest';
      const prev = totals.get(key) || { label, coins: 0, count: 0 };
      prev.coins += Number(g.amount || g.coins || 0);
      prev.count += 1;
      totals.set(key, prev);
    });

    if (analyticsEl) {
      const rows = [...totals.values()].sort((a, b) => b.coins - a.coins).slice(0, 8);
      analyticsEl.innerHTML = rows.length
        ? rows
          .map(
            (r) =>
              `<div class="party-gift-stat-row"><span>${escapeHtml(r.label)}</span><strong>${formatGiftCount(r.coins)} coins · ${r.count} gifts</strong></div>`
          )
          .join('')
        : '<p class="party-requests-empty">No gifts sent in this room yet</p>';
    }

    if (historyEl) {
      const recent = roomGiftHistory.slice(-12).reverse();
      historyEl.innerHTML = recent.length
        ? recent
          .map(
            (g) =>
              `<div class="party-gift-history-row"><img src="${avatarUrl(g.from)}" alt=""><span><strong>${escapeHtml(g.from)}</strong> → ${escapeHtml(g.to)} ${g.emoji || '🎁'} <em>${formatGiftCount(g.amount)}</em></span></div>`
          )
          .join('')
        : '<p class="party-requests-empty">Gift history will appear here as people send gifts</p>';
    }
  }

  function bindSeatDragDrop(container) {
    if (!container || !canModerateRoom()) return;
    if ('ontouchstart' in window) return;
    let dragUserId = null;
    container.querySelectorAll('.party-seat[data-seat][data-user-id]').forEach((seat) => {
      if (seat.classList.contains('is-host') || seat.classList.contains('is-empty')) return;
      seat.draggable = true;
      seat.addEventListener('dragstart', (e) => {
        dragUserId = seat.dataset.userId;
        seat.classList.add('is-dragging');
        try {
          e.dataTransfer.setData('text/plain', dragUserId || '');
          e.dataTransfer.effectAllowed = 'move';
        } catch (_e) { }
      });
      seat.addEventListener('dragend', () => seat.classList.remove('is-dragging'));
    });
    container.querySelectorAll('.party-seat[data-seat]').forEach((target) => {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        target.classList.add('is-drop-target');
      });
      target.addEventListener('dragleave', () => target.classList.remove('is-drop-target'));
      target.addEventListener('drop', (e) => {
        e.preventDefault();
        target.classList.remove('is-drop-target');
        const uid = dragUserId || e.dataTransfer.getData('text/plain');
        const seatNum = Number(target.dataset.seat);
        if (uid && seatNum && canModerateRoom() && !isRoomHostUserId(uid)) {
          moveUserSeat(uid, seatNum);
        }
        dragUserId = null;
      });
    });
  }

  function requestSeatJoin() {
    if (isHost()) return;
    const user = currentUser();
    if (!user?.id) {
      toast('Please log in to join', 'error');
      return;
    }
    const name = displayName(user);
    const id = String(user.id);
    if (joinRequests.some((r) => String(r.id) === String(id))) {
      toast('Request already sent');
      return;
    }
    if (hasSpeakerSeat) {
      toast(isLiveRoomPage() ? 'You are already on the stream' : 'You already have a seat', 'info');
      return;
    }
    if (isStageFull()) {
      toast(
        isLiveRoomPage()
          ? 'Live stage is full — max 5 people (host + 4 guests)'
          : 'Party is full — all 15 seats taken',
        'warning'
      );
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
      text: `${name} requested to join${isLiveRoomPage() ? ' the live' : ' a seat'}`,
    });
    micLinkPending = true;
    showMicLinkModal('waiting');
    toast(isLiveRoomPage() ? 'Request sent to host' : 'Request sent to host');
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
    bindPartyRequestsSheet();
    document.getElementById('partyBtnLock')?.addEventListener('click', () => toggleRoomLock());

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

    document.getElementById('liveBtnHostMute')?.addEventListener('click', () => toggleMic());

    document.getElementById('liveBtnFlipCam')?.addEventListener('click', () => switchCameraFacing());
    document.getElementById('liveBtnFilters')?.addEventListener('click', () => openVideoFilterSheet());

    const setMode = async (mode) => {
      const next = mode === 'audio' ? 'audio' : 'video';
      const changed = broadcastMode !== next;
      broadcastMode = next;
      syncBroadcastModeInUrl(next);
      document.getElementById('liveBtnModeVideo')?.classList.toggle('is-active', next === 'video');
      document.getElementById('liveBtnModeAudio')?.classList.toggle('is-active', next === 'audio');
      if (next === 'video') clearAudioModeUi();
      else applyLiveBackground('audio', roomState?.hostName || displayName(currentUser()));
      if (changed) toast(next === 'video' ? 'Video mode' : 'Audio-only mode');
      if (changed && isHost() && pageType === 'live') await restartAgoraForMode();
      if (next === 'video') {
        clearAudioModeUi();
        ensureHostVideoVisible();
      }
      syncLiveUiState();
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

  function getActiveGiftRecipients() {
    const meId = String(currentUser()?.id || '');
    const all = getGiftRecipients();
    const sendAll = document.getElementById('giftSendAll')?.checked;
    if (sendAll) return all.filter((r) => String(r.id || '') !== meId);
    const sheet = document.getElementById('giftSheet');
    const to = sheet?.dataset?.to || roomState?.hostName || 'Host';
    const one = all.find((r) => r.name === to) || all[0];
    return one ? [one] : [];
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
    const path = viewerSharePath();
    const inviteText =
      `${hostName} invited you to a ${page} room on AP Services.\n` +
      `Tap Join to enter: ${path}\n${url}`;

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

    const seen = new Set();
    users = users.filter((u) => {
      const id = String(u.id || u.key || '').trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    if (!users.length) {
      list.innerHTML =
        '<p class="ap-share-empty">Follow people first to invite them here, or copy the room link below.</p>' +
        `<button type="button" class="ap-share-copy-link" id="apShareCopyLink">Copy room link</button>`;
      document.getElementById('apShareCopyLink')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard?.writeText(url);
          toast('Room link copied', 'success');
        } catch (_e) {
          prompt('Copy room link:', url);
        }
      });
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
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.shareUser;
        const name = btn.dataset.shareName || 'User';
        const statusEl = btn.querySelector('.ap-share-status');
        if (btn.disabled) return;
        btn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
        try {
          await sendRoomInviteToUser(userId, inviteText);
          if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check"></i> Sent';
            statusEl.classList.add('is-sent');
          }
          toast(`Invite sent to ${name}`, 'success');
          try {
            localStorage.removeItem('ap_share_pending');
          } catch (_e) { }
        } catch (e) {
          btn.disabled = false;
          if (statusEl) statusEl.innerHTML = '<i class="fas fa-paper-plane"></i> Retry';
          // Fallback: open chat with pending text so invite still goes out
          try {
            localStorage.setItem(
              'ap_share_pending',
              JSON.stringify({ userId, name, text: inviteText, at: Date.now() })
            );
          } catch (_e) { }
          toast(e?.message || 'Could not send invite — opening chat…', 'warning');
          if (userId) {
            setTimeout(() => {
              openInPartyBrowse(`/chat.html?id=${encodeURIComponent(userId)}&app=1`);
            }, 400);
          }
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
    if (window.__apGiftSending) return;
    const items = GIFT_CATALOG[giftCategory] || GIFT_CATALOG.gift;
    const g = items[selectedGiftIdx] || items[0];
    if (!g) return;
    const unitCost = parseInt(g.cost, 10) || 10;
    const cost = unitCost * giftQty;
    const sendAll = document.getElementById('giftSendAll')?.checked;
    const recipients = getActiveGiftRecipients();
    if (!recipients.length) {
      toast('Pick someone to receive the gift', 'warning');
      return;
    }
    const totalCost = sendAll ? cost * recipients.length : cost;
    const balance = await getCoins(true);
    if (balance < totalCost) {
      toast('Not enough coins — recharge first', 'warning');
      openTopupSheet();
      return;
    }
    const to = sheet.dataset.to || roomState?.hostName || 'Host';
    const receiverId = resolveGiftReceiverId(to);
    if (!sendAll && !receiverId) {
      toast('Wait for the host to connect, then try again', 'warning');
      return;
    }

    window.__apGiftSending = true;
    const sendBtn = document.getElementById('giftSendBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
    }

    const finishOk = async (chargedAmount) => {
      if (window.SocialWallet?.fetchBalance) await SocialWallet.fetchBalance(true);
      const amt = Number(chargedAmount || cost);
      const giftEvt = {
        from: displayName(currentUser()),
        fromUserId: currentUser()?.id || null,
        to,
        toUserId: receiverId || null,
        emoji: g.emoji,
        amount: amt,
        qty: giftQty,
      };
      pushRoomGift(giftEvt);
      const combo = window.SocialFX?.trackCombo?.(g.emoji, giftQty) || 1;
      window.SocialFX?.playGift?.(giftEvt, { combo });
      showWinBanner(giftEvt);
      showGiftFlyBanner(giftEvt);
      onGiftTeamProgress(amt);
      const sendBtnEl = document.getElementById('giftSendBtn');
      const balEl = document.getElementById('giftCoinsBal');
      if (sendBtnEl && balEl) window.SocialFX?.coinFly?.(sendBtnEl, balEl, amt);
      await refreshCoinDisplay();
      renderRoomGiftPanels();
      toast('Gift sent!', 'success');
      sheet.classList.remove('open');
    };

    const releaseGiftSend = () => {
      window.__apGiftSending = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
      }
    };

    const tryApi = async (reason) => {
      try {
        await sendGiftViaApi(receiverId, cost, g.emoji, to, g.slug);
        pushRoomGift({
          from: displayName(currentUser()),
          fromUserId: currentUser()?.id || null,
          to,
          toUserId: receiverId,
          emoji: g.emoji,
          amount: cost,
          qty: giftQty,
        });
        renderRoomGiftPanels();
      } catch (e) {
        const msg = window.SocialUI?.friendlyMessage(e.message) || e.message || reason || 'Gift failed';
        if (/insufficient/i.test(msg)) {
          toast('Not enough coins — recharge first', 'warning');
          openTopupSheet();
        } else {
          toast(msg, 'error');
        }
      } finally {
        releaseGiftSend();
      }
    };

    const targets = sendAll ? recipients : [{ name: to, id: receiverId }];

    const emitOneGift = (target) =>
      new Promise((resolve) => {
        if (!liveSocket?.connected) {
          resolve({ ok: false, message: 'Not connected' });
          return;
        }
        const timer = setTimeout(() => resolve({ ok: false, message: 'Gift timed out' }), 12000);
        liveSocket.emit(
          'live:gift',
          {
            channel: channelId(),
            to: target.name,
            toUserId: String(target.id || ''),
            emoji: g.emoji,
            giftSlug: g.slug,
            amount: cost,
            qty: giftQty,
          },
          (res) => {
            clearTimeout(timer);
            resolve(res || { ok: false, message: 'Gift failed' });
          }
        );
      });

    if (liveSocket?.connected) {
      (async () => {
        let sent = 0;
        let lastCharged = cost;
        let lastError = '';
        try {
          for (const target of targets) {
            if (!target.id) {
              lastError = 'Receiver not found';
              continue;
            }
            const res = await emitOneGift(target);
            if (!res?.ok) {
              lastError = res?.message || 'Gift failed for ' + (target.name || 'user');
              break;
            }
            sent += 1;
            const bal = res?.data?.balance?.coin_balance;
            if (bal != null && window.SocialWallet) {
              try {
                /* keep local cache in sync if server returned balance */
              } catch (_e) { }
            }
            lastCharged = Number(res?.data?.gift?.amount || cost);
          }
          if (sent > 0) {
            await finishOk(lastCharged);
          } else {
            toast(lastError || 'Gift failed', 'error');
            if (/insufficient/i.test(lastError || '')) openTopupSheet();
            /* Socket rejected — try REST once for single recipient */
            if (!sendAll && receiverId && /not connected|timed out|failed/i.test(lastError || '')) {
              await tryApi(lastError);
              return;
            }
          }
        } finally {
          releaseGiftSend();
        }
      })();
      return;
    }

    await tryApi('Gift failed');
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
      profilePic: me?.profile_pic || null,
      role: me?.role || null,
      lvl: lvlInfo.level,
      text: t,
      at: Date.now(),
      scope,
      broadcast: chatRegionFilter === 'broadcast',
      pending: !liveSocket?.connected,
    };
    if (optimistic.userId && optimistic.profilePic) cacheChatProfile(optimistic.userId, optimistic.profilePic);
    const em = extractEmojiReaction(t);
    if (em && optimistic.userId) spawnSeatEmojiReaction(optimistic.userId, em);
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
    const chatInputEl = document.getElementById('liveChatInput');
    if (chatInputEl && !chatInputEl.dataset.focusBound) {
      chatInputEl.dataset.focusBound = '1';
      chatInputEl.addEventListener('focus', () => {
        chatInputFocused = true;
        chatTab = 'all';
        document.body.classList.add('ap-chat-open');
        renderChatFromState();
        requestAnimationFrame(() => {
          const feed = document.getElementById('partyChatFeed');
          if (feed) feed.scrollTop = feed.scrollHeight;
        });
      });
      chatInputEl.addEventListener('blur', () => {
        setTimeout(() => {
          chatInputFocused = document.activeElement === chatInputEl;
          if (!chatInputFocused) document.body.classList.remove('ap-chat-open');
        }, 150);
      });
    }
    document.getElementById('partyClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());
    document.getElementById('partyMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());

    document.getElementById('liveHostBarToggle')?.addEventListener('click', () => {
      if (!isHost()) {
        syncHostBarUi();
        return;
      }
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

    function setLiveChatHidden(hidden) {
      const on = Boolean(hidden);
      document.body.classList.toggle('ap-chat-hidden', on);
      ensureLiveChatShowFab();
      const showFab = document.getElementById('liveBtnShowChat');
      if (showFab) {
        if (on) {
          showFab.removeAttribute('hidden');
          showFab.setAttribute('aria-hidden', 'false');
          showFab.style.setProperty('display', 'inline-flex', 'important');
        } else {
          showFab.setAttribute('hidden', '');
          showFab.setAttribute('aria-hidden', 'true');
          showFab.style.setProperty('display', 'none', 'important');
        }
      }
      try {
        localStorage.setItem('ap_live_chat_hidden', on ? '1' : '0');
      } catch (_e) { }
    }
    window.setLiveChatHidden = setLiveChatHidden;

    function ensureLiveChatShowFab() {
      let fab = document.getElementById('liveBtnShowChat');
      if (!fab) {
        fab = document.createElement('button');
        fab.type = 'button';
        fab.id = 'liveBtnShowChat';
        fab.className = 'live-show-chat-fab';
        fab.setAttribute('aria-label', 'Show chat');
        fab.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i><span>Chat</span>';
        document.body.appendChild(fab);
      } else if (fab.parentElement !== document.body) {
        // Escape live-overlay stacking so taps always hit the button
        document.body.appendChild(fab);
      }
      return fab;
    }
    ensureLiveChatShowFab();

    if (!window.__apChatVisBound) {
      window.__apChatVisBound = true;
      let chatVisLockUntil = 0;
      const handleChatVisTap = (e) => {
        const hideBtn = e.target?.closest?.('#liveBtnHideChat, .party-chat-hide-btn--solo');
        const showBtn = e.target?.closest?.('#liveBtnShowChat');
        if (!hideBtn && !showBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now < chatVisLockUntil) return;
        chatVisLockUntil = now + 400;
        if (hideBtn) {
          setLiveChatHidden(true);
          toast('Chat hidden — tap Chat to show', 'info');
        } else if (showBtn) {
          setLiveChatHidden(false);
          chatTab = 'all';
          document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === 'all');
          });
          renderChatFromState();
          requestAnimationFrame(() => {
            const feed = document.getElementById('partyChatFeed');
            if (feed) feed.scrollTop = feed.scrollHeight;
          });
          toast('Chat shown', 'info');
        }
      };
      document.addEventListener('click', handleChatVisTap, true);
      document.addEventListener(
        'touchend',
        handleChatVisTap,
        { capture: true, passive: false }
      );
    }

    try {
      if (localStorage.getItem('ap_live_chat_hidden') === '1') setLiveChatHidden(true);
      else setLiveChatHidden(false);
    } catch (_e) {
      setLiveChatHidden(false);
    }

    // Swipe down on chat row to hide (phones)
    const chatRow = document.getElementById('partyChatRow') || document.querySelector('.party-chat-row');
    if (chatRow && chatRow.dataset.swipeHideBound !== '1') {
      chatRow.dataset.swipeHideBound = '1';
      let startY = 0;
      let startX = 0;
      let tracking = false;
      chatRow.addEventListener(
        'touchstart',
        (e) => {
          if (e.target?.closest?.('#liveBtnHideChat, .party-chat-hide-btn--solo, a, button, input')) {
            tracking = false;
            return;
          }
          if (e.touches.length !== 1) return;
          startY = e.touches[0].clientY;
          startX = e.touches[0].clientX;
          tracking = true;
        },
        { passive: true }
      );
      chatRow.addEventListener(
        'touchend',
        (e) => {
          if (!tracking) return;
          tracking = false;
          const t = e.changedTouches?.[0];
          if (!t) return;
          const dy = t.clientY - startY;
          const dx = t.clientX - startX;
          if (dy > 56 && Math.abs(dy) > Math.abs(dx) * 1.15) {
            setLiveChatHidden(true);
            toast('Chat hidden — tap Chat to show', 'info');
          }
        },
        { passive: true }
      );
    }

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

    document.getElementById('partyBtnSound')?.addEventListener('click', async () => {
      soundOn = !soundOn;
      audioUnlocked = soundOn;
      if (soundOn) {
        await ensureRemoteAudioPlaying();
        hideTapForSoundHint();
      } else {
        remoteUsers.forEach((user) => {
          try {
            user.audioTrack?.stop();
          } catch (_e) { }
        });
      }
      toast(soundOn ? 'Sound on' : 'Sound muted');
      const btn = document.getElementById('partyBtnSound');
      if (btn) {
        const ico = btn.querySelector('i');
        if (ico) ico.className = soundOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        btn.classList.toggle('is-muted', !soundOn);
      }
    });

    document.getElementById('partyBtnMusic')?.addEventListener('click', () => openPartyMusicSheet());
    document.getElementById('partyBtnBackground')?.addEventListener('click', () => openRoomBackgroundPicker());
    document.getElementById('partyMusicStop')?.addEventListener('click', () => {
      stopPartyMusic();
      toast('Music stopped', 'info');
    });
    document.getElementById('partyMusicClose')?.addEventListener('click', () => closePartyMusicSheet());
    document.getElementById('partyMusicSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyMusicSheet') closePartyMusicSheet();
    });
    document.getElementById('partyMusicSheet')?.querySelector('.party-music-panel')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.getElementById('partyBtnShare')?.addEventListener('click', () => openInAppShareSheet());
    document.getElementById('partyBtnJoinSeat')?.addEventListener('click', () => requestSeatJoin());
    document.getElementById('partyInvitePill')?.addEventListener('click', (e) => {
      e.preventDefault();
      openInAppShareSheet();
    });
    document.getElementById('partyBtnUsersAll')?.addEventListener('click', () => openPartyRequestsSheet());
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
    releaseScreenCaptureProtection();
    minimizingRoom = false;
    hideApLoader();
    setLiveStatus('', null);
    if (!window.__apLiveSessionExitInProgress) {
      window.LiveSession?.forceCleanup?.();
    }
    try {
      sessionStorage.removeItem('ap_live_pip_session');
      clearDurableLiveSession();
    } catch (_e) { }
    await stopAgora({ skipEndRoom: hostEndingIntentionally });
    leaveSocket();
    const dest = '/explore.html?app=1';
    location.href = dest;
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
        try { localStorage.setItem('ap_party_rules_seen', '1'); } catch (_e) { }
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
        } catch (_e) { }
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
            <div class="ap-profile-avatar-wrap" id="apProfileAvatarWrap">
              <img id="apProfileAvatar" src="" alt="">
              <span class="ap-admin-avatar-tag" id="apProfileAdminTag" hidden>ADMIN</span>
              <span class="ap-profile-po-badge">PO</span>
            </div>
            <div class="ap-profile-head">
              <div class="info">
                <h3 id="apProfileName">User</h3>
                <div class="ap-profile-badges">
                  <span id="apProfileRoleBadge"></span><span>🇮🇳</span><span id="apProfileLvl">Lv.18</span><span>🎵 1</span><span>💎 3</span>
                </div>
                <p class="ap-profile-id-row" id="apProfileId">ID: — <button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button></p>
                <div class="ap-profile-social-stats" id="apProfileSocialStats">
                  <div class="ap-profile-stat"><strong id="apProfileFollowers">0</strong><span>Followers</span></div>
                  <div class="ap-profile-stat"><strong id="apProfileFollowing">0</strong><span>Following</span></div>
                </div>
              </div>
            </div>
            <div class="ap-profile-cards">
              <div class="ap-profile-card ap-profile-card--contrib">
                <h4>Top supporters <i class="fas fa-chevron-right"></i></h4>
                <div class="ap-profile-placeholder-row" id="apProfileContrib"></div>
              </div>
            </div>
            <div class="ap-profile-section">
              <h4>Gift Gallery <span id="apProfileGiftLit">Lit: 0/12</span></h4>
              <div class="ap-profile-placeholder-row" id="apProfileGifts">
                <span>+</span><span>+</span><span>+</span>
              </div>
            </div>
            <div class="ap-profile-section ap-profile-section--compact">
              <h4>Medal <span>Number of medals: 0</span></h4>
              <div class="ap-profile-placeholder-row hex" id="apProfileMedals">
                <span>+</span><span>+</span><span>+</span>
              </div>
            </div>
            <button type="button" class="ap-profile-gift-btn" id="apProfileGiftBtn"><i class="fas fa-gift"></i> Send gift</button>
            <div class="ap-profile-actions ap-profile-actions--grid">
              <button type="button" class="ap-profile-action-btn" id="apProfileViewFull"><i class="fas fa-user"></i><span>Profile</span></button>
              <button type="button" class="ap-profile-action-btn ap-profile-action-btn--primary" id="apProfileAddFriend"><i class="fas fa-user-plus"></i><span>Add friend</span></button>
              <button type="button" class="ap-profile-action-btn" id="apProfileMention"><i class="fas fa-at"></i><span>Mention</span></button>
              <button type="button" class="ap-profile-action-btn" id="apProfileMessage"><i class="far fa-envelope"></i><span>Message</span></button>
              <button type="button" class="ap-profile-action-btn ap-profile-action-btn--ghost" id="apProfileMore"><i class="fas fa-ellipsis-h"></i><span>More</span></button>
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
      if (id && navigator.clipboard) navigator.clipboard.writeText(id).catch(() => { });
      else toast('User ID unavailable', 'warning');
    });

    document.getElementById('apProfileViewFull')?.addEventListener('click', () => {
      const { name, userId } = activeProfileUser;
      document.getElementById('apProfileSheet')?.classList.remove('open');
      if (userId) navigateToUserProfile(userId, name);
      else toast('Profile unavailable — user ID missing', 'warning');
    });

    document.getElementById('apProfileAddFriend')?.addEventListener('click', async () => {
      const { name, userId } = activeProfileUser;
      if (!userId) {
        toast('Follow unavailable for this user', 'warning');
        return;
      }
      if (window.SocialInteractions?.toggleFollow) {
        const now = await SocialInteractions.toggleFollow(userId, name);
        const btn = document.getElementById('apProfileAddFriend');
        if (btn) {
          btn.innerHTML = now
            ? '<i class="fas fa-user-check"></i><span>Following</span>'
            : '<i class="fas fa-user-plus"></i><span>Add friend</span>';
        }
        toast(now ? `You're now following ${name}` : `Unfollowed ${name}`, now ? 'success' : 'info');
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
        openInPartyBrowse(`/chat.html?id=${encodeURIComponent(id)}&app=1`);
        return;
      }
      toast('Message unavailable — user ID missing', 'warning');
    });

    document.getElementById('apProfileMore')?.addEventListener('click', () => {
      const name = activeProfileUser.name || 'User';
      const uid = activeProfileUser.userId;
      if (canModerateRoom() && uid && !isRoomHostUserId(uid) && String(uid) !== String(currentUser()?.id || '')) {
        openModerationMenu(name, uid);
        return;
      }
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
        <button type="button" data-act="copy">Copy nickname</button>
        ${uid ? '<button type="button" data-act="chat">Open chat</button>' : ''}`;
      panel.appendChild(menu);
      menu.querySelector('[data-act="report"]')?.addEventListener('click', () => {
        toast('Report submitted — our team will review', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(name).catch(() => { });
        toast('Nickname copied', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="chat"]')?.addEventListener('click', () => {
        document.getElementById('apProfileSheet')?.classList.remove('open');
        if (uid) openInPartyBrowse(`/chat.html?id=${encodeURIComponent(uid)}&app=1`);
        menu.remove();
      });
    });
  }

  function maybeShowViewerOnboarding() {
    if (isHost() || !isPartyRoomPage() || !roomJoinCompleted) return;
    const key = 'ap_party_welcome_' + channelId();
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch (_e) { }
    document.getElementById('apViewerOnboard')?.classList.add('open');
  }

  let screenCaptureEnabled = null;

  function postNativeMessage(payload) {
    try {
      const raw = JSON.stringify(payload);
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(raw);
        return true;
      }
    } catch (_e) { }
    return false;
  }

  function setScreenCaptureProtection(enable) {
    const shouldBlock =
      Boolean(enable) && (isLiveRoomPage() || isPartyRoomPage());
    if (screenCaptureEnabled === shouldBlock) return;
    screenCaptureEnabled = shouldBlock;
    postNativeMessage({ type: 'screen_capture', enable: shouldBlock });
  }

  function releaseScreenCaptureProtection() {
    setScreenCaptureProtection(false);
  }

  function bindScreenCaptureProtection() {
    setScreenCaptureProtection(true);
  }

  function bindScreenCaptureLifecycle() {
    if (bindScreenCaptureLifecycle.bound) return;
    bindScreenCaptureLifecycle.bound = true;
    setScreenCaptureProtection(true);
    window.addEventListener('pagehide', () => {
      if (window.__apLeavingRoom) releaseScreenCaptureProtection();
    });
    window.addEventListener('beforeunload', () => {
      if (window.__apLeavingRoom) releaseScreenCaptureProtection();
    });
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
    } catch (_e) { }
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
      return resolveHostProfilePic();
    }
    const seat = (roomState?.seats || []).find((s) =>
      (uid && String(s.userId) === uid) || (name && s.name === name)
    );
    if (seat?.profilePic || seat?.profile_pic) return seat.profilePic || seat.profile_pic;
    return liveProfilePic(uid, null);
  }

  function formatProfileCount(n) {
    const v = Number(n || 0);
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  function profilePicUrl(name, pic, cacheKey) {
    if (!pic) return avatarUrl(name, null);
    return avatarUrl(name, resolveMediaUrl(pic, cacheKey || pic) || pic);
  }

  async function loadProfileEngagement(userId, name, img, nameEl) {
    if (!userId || !window.API?.get) return null;
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => { });
      const res = await API.get('/social/creators/' + encodeURIComponent(userId) + '/engagement');
      const data = res?.data;
      if (!data) return null;
      const displayName = data.displayName || name;
      if (nameEl) nameEl.textContent = displayName;
      if (img && (data.profilePic || data.profile_pic)) {
        img.src = profilePicUrl(displayName, data.profilePic || data.profile_pic, data.profileUpdatedAt || userId);
        img.onerror = () => {
          img.onerror = null;
          img.src = avatarUrl(displayName);
        };
      }
      const followersEl = document.getElementById('apProfileFollowers');
      const followingEl = document.getElementById('apProfileFollowing');
      if (followersEl) followersEl.textContent = formatProfileCount(data.followers);
      if (followingEl) followingEl.textContent = formatProfileCount(data.following);
      const roleBadgeEl = document.getElementById('apProfileRoleBadge');
      if (roleBadgeEl && data.role && !activeProfileUser?.isAdmin) {
        roleBadgeEl.innerHTML = window.formatRoleBadgeHtml?.(data.role, { withEmoji: true }) || '';
        roleBadgeEl.hidden = !roleBadgeEl.innerHTML;
        if (activeProfileUser) activeProfileUser.userRole = data.role;
      }
      return data;
    } catch (e) {
      console.warn('[live] profile engagement', e);
      return null;
    }
  }

  async function openProfileSheet(name, userId) {
    const n = name || 'User';
    const resolvedId =
      userId ||
      (n === roomState?.hostName ? roomState?.hostId : null) ||
      (roomState?.seats || []).find((s) => s.name === n)?.userId ||
      '';
    const seatHit =
      (roomState?.seats || []).find((s) => String(s.userId || '') === String(resolvedId)) ||
      (roomState?.onlineMembers || []).find((s) => String(s.userId || '') === String(resolvedId)) ||
      (roomState?.seats || []).find((s) => s.name === n) ||
      null;
    const resolvedDisplayId =
      seatHit?.displayId ||
      (n === roomState?.hostName ? roomState?.hostDisplayId : null) ||
      null;
    activeProfileUser = {
      name: n,
      userId: resolvedId ? String(resolvedId) : '',
      displayId: resolvedDisplayId ? String(resolvedDisplayId) : '',
      userRole:
        seatHit?.userRole ||
        (resolvedId &&
          roomState?.hostId &&
          String(resolvedId) === String(roomState.hostId)
          ? roomState.hostUserRole
          : null) ||
        null,
      isAdmin: Boolean(
        memberIsAdminMarked(seatHit) ||
        isAdminUserId(resolvedId) ||
        (resolvedId &&
          roomState?.hostId &&
          String(resolvedId) === String(roomState.hostId) &&
          roomState.hostIsPlatformAdmin)
      ),
    };

    const sheet = document.getElementById('apProfileSheet');
    if (sheet) {
      if (activeProfileUser.userId) sheet.dataset.userId = activeProfileUser.userId;
      else delete sheet.dataset.userId;
      sheet.classList.toggle('is-admin-profile', activeProfileUser.isAdmin);
    }

    const avatarWrap = document.getElementById('apProfileAvatarWrap');
    const adminTag = document.getElementById('apProfileAdminTag');
    if (avatarWrap) avatarWrap.classList.toggle('ap-admin-frame', activeProfileUser.isAdmin);
    if (adminTag) adminTag.hidden = !activeProfileUser.isAdmin;

    const roleBadgeEl = document.getElementById('apProfileRoleBadge');
    if (roleBadgeEl) {
      roleBadgeEl.innerHTML = activeProfileUser.isAdmin
        ? ''
        : window.formatRoleBadgeHtml?.(activeProfileUser.userRole, { withEmoji: true }) || '';
      roleBadgeEl.hidden = !roleBadgeEl.innerHTML;
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
    if (nm) {
      nm.textContent = n;
      nm.classList.toggle('is-admin-name', activeProfileUser.isAdmin);
    }
    const idDisplay =
      window.formatUserDisplayId?.(null, activeProfileUser.displayId) ||
      activeProfileUser.displayId ||
      '';
    if (idEl) {
      const idHtml =
        window.formatAdminIdHtml?.(idDisplay, { isAdmin: activeProfileUser.isAdmin }) ||
        `ID: ${idDisplay || '—'}`;
      idEl.innerHTML = `${idHtml} <button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button>`;
      idEl.classList.toggle('is-admin-id', activeProfileUser.isAdmin);
      document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
        const full = idDisplay || activeProfileUser.displayId;
        if (!full) return;
        if (navigator.clipboard) navigator.clipboard.writeText(full).catch(() => { });
        toast('User ID copied', 'success');
      });
    }
    if (lvl) lvl.textContent = 'Lv.' + (5 + ((idDisplay || '0').length % 20));
    const followersEl = document.getElementById('apProfileFollowers');
    const followingEl = document.getElementById('apProfileFollowing');
    if (followersEl) followersEl.textContent = '0';
    if (followingEl) followingEl.textContent = '0';
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

    if (resolvedId) {
      await loadProfileEngagement(resolvedId, n, img, nm);
    }
    const friendBtn = document.getElementById('apProfileAddFriend');
    if (friendBtn && resolvedId && window.SocialInteractions?.isFollowing) {
      const following = SocialInteractions.isFollowing(resolvedId, n);
      friendBtn.innerHTML = following
        ? '<i class="fas fa-user-check"></i><span>Following</span>'
        : '<i class="fas fa-user-plus"></i><span>Add friend</span>';
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
      const meId = String(currentUser()?.id || '');
      if (!row) return;
      if (e.target.checked) {
        row.querySelectorAll('.gift-recipient').forEach((b) => {
          b.classList.toggle('is-active', String(b.dataset.userId || '') !== meId);
        });
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
    try {
      sessionStorage.removeItem('ap_live_join_meta');
      localStorage.removeItem(LIVE_SESSION_KEY);
    } catch (_e) { }
    lastJoinMeta = null;
    forensicEvent('CHANNEL_GENERATED', { channel: ch, reason: 'missing_channel_param' });
  }

  async function startLiveVoiceAsync() {
    if (!isLiveRoomPage() || !roomJoinCompleted) return;
    try {
      if (isHost()) {
        await resumeHostBroadcastIfNeeded();
      } else {
        await startAgora('live');
      }
    } catch (e) {
      console.error('[live] live voice failed', e);
      if (!sessionEstablished) onRoomReady();
      setLiveStatus(e?.message || 'Could not connect to stream', null);
    }
  }

  async function startPartyVoiceAsync() {
    if (!isPartyRoomPage() || !roomJoinCompleted) return;
    try {
      if (isHost()) {
        await resumeHostBroadcastIfNeeded();
      } else {
        await startAgora('party');
      }
    } catch (e) {
      console.error('[live] party voice failed', e);
      if (!sessionEstablished) onRoomReady();
      if (isPartyRoomPage() && !isHost()) {
        partyVoiceSkipped = true;
        setLiveStatus(e?.message || 'Could not connect to party audio', null);
        schedulePartyAgoraRetry();
      } else if (isPartyRoomPage() && isHost()) {
        setLiveStatus((e?.message || 'Voice setup failed') + ' Tap mic to retry.', false);
      }
    }
  }

  async function initPartyRoom() {
    bindScreenCaptureLifecycle();
    if (partyRoomInitStarted) return;
    partyRoomInitStarted = true;
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    prepareLiveUiShell();
    const profileRefresh = refreshLiveUserProfile();
    const user = currentUser();
    if (!user) {
      partyRoomInitStarted = false;
      toast('Please log in');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }
    await Promise.race([
      profileRefresh,
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => { });
    initForensicLog();
    restoreChannelFromDurableSession();
    ensureHostChannelInUrl();
    const restored = restoreJoinMeta();
    if (restored && !lastJoinMeta) lastJoinMeta = restored;

    bindCommonControls('party');
    bindHostControls('party');
    if (isHost()) forceRevealRoomShell();
    setApLoaderStep(1);
    const joinGuard = setTimeout(() => {
      forceRevealRoomShell();
      if (!roomJoinCompleted) {
        partyRoomInitStarted = false;
        setLiveStatus('Connection timed out — tap mic or reload', false);
      } else if (!sessionEstablished) {
        finalizeRoomEntry();
        setLiveStatus('Voice still connecting…', null);
      }
    }, 12000);
    try {
      await connectSocket('party');
    } catch (e) {
      console.error('[live] party room join failed', e);
      partyRoomInitStarted = false;
      hideApLoader();
      if (/sign in|session|expired|not logged|auth|token/i.test(e?.message || '')) {
        lastSocketIssue = e.message;
        handleRoomJoinFailure();
      } else {
        setLiveStatus(e?.message || 'Could not connect to party room', false);
      }
      return;
    } finally {
      clearTimeout(joinGuard);
    }
    applyRoleUiAfterJoin();
    if (!roomJoinCompleted) {
      partyRoomInitStarted = false;
      handleRoomJoinFailure();
      return;
    }
    partyVoiceSkipped = false;
    void startPartyVoiceAsync();
    postWelcomeMessage();
    maybeShowPartyRules();
    maybeShowViewerOnboarding();
    bindScreenCaptureProtection();
    bindMediaResumeOnVisibility();
    bindPartyBackGuard();
    if (!window.__apPartyVoiceHealth) {
      window.__apPartyVoiceHealth = setInterval(() => {
        if (!isPartyRoomPage() || !roomJoinCompleted || socketLeaveIntentional) return;
        if (!liveSocket?.connected && lastJoinMeta) {
          try {
            liveSocket?.connect?.();
          } catch (_e) { }
        }
        if ((hasSpeakerSeat || isHost()) && (!publishSucceeded || !localTracks.length)) {
          ensureMicPublishing();
        }
      }, 30000);
    }
    if (!window.__apPartyHostAudienceRefresh && isHost()) {
      window.__apPartyHostAudienceRefresh = setInterval(() => {
        if (!isPartyRoomPage() || !roomJoinCompleted || !isHost() || socketLeaveIntentional) return;
        requestFreshRoomState();
      }, 12000);
    }
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
            seedChatProfileCacheFromState(roomState);
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
    if (chatInputFocused || document.body.classList.contains('ap-keyboard-open')) return true;
    const chatInput = document.getElementById('liveChatInput');
    if (chatInput && document.activeElement === chatInput) return true;
    return Boolean(
      document.querySelector(
        '#apProfileSheet.open, #apGiftSheet.open, #giftSheet.open, #apTopupSheet.open, #apSeatSheet.open, .ap-gift-sheet.open, .gift-sheet.open, .party-tools-sheet.open, .party-requests-sheet.open, .party-music-sheet.open, #partyBgPickerSheet.open, #apInAppShareSheet.open, #apEmojiPopover.is-open'
      ) || document.body.classList.contains('ap-sheet-open') || document.body.classList.contains('ap-live-overlay-open') || document.body.classList.contains('party-requests-open')
    );
  }

  function bindFeedScrollGuard() {
    const scroll = document.getElementById('liveFeedScroll');
    if (!scroll || scroll.dataset.guardBound === '1') return;
    scroll.dataset.guardBound = '1';
    scroll.addEventListener(
      'touchstart',
      (e) => {
        feedTouchStartY = e.touches?.[0]?.clientY || 0;
        feedTouchStartAt = Date.now();
      },
      { passive: true }
    );
    scroll.addEventListener(
      'touchmove',
      (e) => {
        if (feedInteractionBlocked()) {
          e.stopPropagation();
        }
      },
      { passive: false }
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
    } catch (_e) { }

    feedSwitching = false;
  }

  async function initLiveFeedViewer() {
    bindScreenCaptureLifecycle();
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
          if (en.isIntersecting && en.intersectionRatio >= 0.88) {
            const i = parseInt(en.target.dataset.index, 10);
            if (!Number.isNaN(i) && i !== activeFeedIndex) switchToFeedRoom(i);
          }
        });
      },
      { root: scroll, threshold: [0.88, 0.95] }
    );
    scroll.querySelectorAll('.live-feed-slide').forEach((s) => feedObserver.observe(s));
    bindFeedScrollGuard();

    setTimeout(() => document.getElementById('liveSwipeHint')?.classList.add('is-hidden'), 7000);

    await switchToFeedRoom(0);
    bindScreenCaptureProtection();

    window.addEventListener('beforeunload', () => {
      if (window.__apLeavingRoom || window.LiveSession?.shouldKeepPlayback?.()) return;
      stopAgora({ skipEndRoom: true });
      leaveSocket();
    });
  }

  async function initLiveRoom() {
    bindScreenCaptureLifecycle();
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    prepareLiveUiShell();
    const profileRefresh = refreshLiveUserProfile();
    const user = currentUser();
    if (!user) {
      toast('Please log in to watch or broadcast');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }
    await Promise.race([
      profileRefresh,
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => { });

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
    if (isHost()) forceRevealRoomShell();
    setApLoaderStep(1);
    const joinGuard = setTimeout(() => {
      forceRevealRoomShell();
      if (!roomJoinCompleted) {
        setLiveStatus('Connection timed out — tap mic or reload', false);
      } else if (!sessionEstablished) {
        finalizeRoomEntry();
        setLiveStatus('Stream still connecting…', null);
      }
    }, 12000);
    try {
      await connectSocket('live');
    } catch (e) {
      console.error('[live] live room join failed', e);
      hideApLoader();
      if (/sign in|session|expired|not logged|auth|token/i.test(e?.message || '')) {
        lastSocketIssue = e.message;
        handleRoomJoinFailure();
      } else {
        setLiveStatus(e?.message || 'Could not connect to live room', false);
      }
      return;
    } finally {
      clearTimeout(joinGuard);
    }
    applyRoleUiAfterJoin();
    if (!roomJoinCompleted) {
      handleRoomJoinFailure();
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
    void startLiveVoiceAsync();
    applyRoleUiAfterJoin();
    postWelcomeMessage();
    bindScreenCaptureProtection();
    bindMediaResumeOnVisibility();
    bindPartyBackGuard();
  }

  let streamerStatsPeriod = 'today';
  let userAnalyticsPeriod = 'today';
  let streamerDailyAll = [];
  let streamerLivePage = 1;
  let streamerPartyPage = 1;
  const STREAMER_PAGE_SIZE = 7;

  function periodDaysLabel(period) {
    if (period === 'week') return 7;
    if (period === 'month') return 30;
    if (period === '90' || period === 'older') return 90;
    const n = parseInt(period, 10);
    if (Number.isFinite(n) && n >= 1) return n;
    return 1;
  }

  function setPeriodDaysUi(kind, days) {
    const n = Math.max(1, Number(days) || 1);
    const dayWord = n === 1 ? 'day' : 'days';
    if (kind === 'stats') {
      const el = document.getElementById('streamerPeriodDays');
      if (el) el.textContent = String(n);
      const label = document.getElementById('streamerPeriodDaysLabel');
      if (label) label.innerHTML = `Showing <strong>${n}</strong> ${dayWord}`;
    } else {
      const el = document.getElementById('activityPeriodDays');
      if (el) el.textContent = String(n);
      const label = document.getElementById('activityPeriodDaysLabel');
      if (label) label.innerHTML = `Showing <strong>${n}</strong> ${dayWord}`;
    }
  }

  function formatActivityDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }

  async function loadUserAnalytics(period = 'today') {
    userAnalyticsPeriod = period || 'today';
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setPeriodDaysUi('activity', periodDaysLabel(userAnalyticsPeriod));
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => { });
      const res = await API.get('/live/my-analytics?period=' + encodeURIComponent(period));
      const data = res?.data || {};
      const days = Number(data.periodDays) || periodDaysLabel(period);
      setPeriodDaysUi('activity', days);
      setText('activityWatchTime', data.totalWatchFormatted || formatActivityDuration(data.totalWatchSeconds));
      setText('activityHostTime', data.totalHostFormatted || formatActivityDuration(data.totalHostSeconds));
      setText('activityGiftsSent', String(data.giftsSentCoins || 0));
      setText('activityGiftsRecv', String(data.giftsReceivedCoins || 0));
      setText('activityRoomsJoined', String(data.roomsJoined || 0));
      setText('activityPartyWatch', formatActivityDuration(data.partyWatchSeconds));
    } catch (e) {
      console.warn('[analytics] load failed', e);
    }
  }

  async function loadStreamerStats(period = 'today') {
    streamerStatsPeriod = period || 'today';
    streamerLivePage = 1;
    streamerPartyPage = 1;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setPeriodDaysUi('stats', periodDaysLabel(streamerStatsPeriod));
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => { });
      const res = await API.get('/live/streamer-stats?period=' + encodeURIComponent(period));
      const data = res?.data || {};
      const days = Number(data.periodDays) || periodDaysLabel(period);
      setPeriodDaysUi('stats', days);
      const points = Number(data.giftCoins || 0);
      const followers = Number(data.newFollowers || 0);
      setText(
        'streamerLiveOnlyHours',
        data.liveHoursLabel || formatHoursShort(data.liveSeconds)
      );
      setText(
        'streamerPartyOnlyHours',
        data.partyHoursLabel || formatHoursShort(data.partySeconds)
      );
      setText('streamerWonPoints', String(points));
      setText('streamerNewFollowers', String(followers));
      const last = data.lastSession;
      if (last) {
        setText('streamerLastHours', last.formatted || '00:00:00');
        setText('streamerLastAudiences', String(last.peakViewers || 0));
      } else {
        setText('streamerLastHours', '00:00:00');
        setText('streamerLastAudiences', '0');
      }
      setText('streamerLastPoints', String(points));
      setText('streamerLastFollowers', String(followers));
      streamerDailyAll = data.daily || [];
      renderDailyHoursPaged();
      toggleMoreThanMonthTabs(Boolean(data.hasOlderThanMonth));
    } catch (e) {
      console.warn('[streamer] stats load failed', e);
    }
  }

  function toggleMoreThanMonthTabs(show) {
    const statsTab = document.getElementById('streamerMoreMonthTab');
    const activityTab = document.getElementById('activityMoreMonthTab');
    if (statsTab) statsTab.hidden = !show;
    if (activityTab) activityTab.hidden = !show;
    if (!show) {
      if (streamerStatsPeriod === '90' || streamerStatsPeriod === '14') {
        streamerStatsPeriod = 'month';
        document.querySelectorAll('[data-stats-period]').forEach((b) => {
          b.classList.toggle('active', b.dataset.statsPeriod === 'month');
        });
      }
      if (userAnalyticsPeriod === '90' || userAnalyticsPeriod === '14') {
        userAnalyticsPeriod = 'month';
        document.querySelectorAll('[data-activity-period]').forEach((b) => {
          b.classList.toggle('active', b.dataset.activityPeriod === 'month');
        });
      }
    }
  }

  function formatHoursShort(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h <= 0 && m <= 0) return '0h 0m';
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  }

  function dailyDateLabel(dateStr) {
    const today = new Date().toISOString().slice(0, 10);
    if (dateStr === today) return 'Today';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function pageSlice(rows, page) {
    const totalPages = Math.max(1, Math.ceil(rows.length / STREAMER_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * STREAMER_PAGE_SIZE;
    return {
      rows: rows.slice(start, start + STREAMER_PAGE_SIZE),
      page: safePage,
      totalPages,
    };
  }

  function renderKindDailyList(kind, page) {
    const isLive = kind === 'live';
    const listId = isLive ? 'streamerDailyLiveList' : 'streamerDailyPartyList';
    const pagerId = isLive ? 'streamerLivePager' : 'streamerPartyPager';
    const labelId = isLive ? 'streamerLivePageLabel' : 'streamerPartyPageLabel';
    const list = document.getElementById(listId);
    const pager = document.getElementById(pagerId);
    const label = document.getElementById(labelId);
    if (!list) return 1;

    const filtered = (streamerDailyAll || []).filter((d) =>
      isLive ? Number(d.liveSeconds || 0) > 0 : Number(d.partySeconds || 0) > 0
    );
    if (!filtered.length) {
      list.innerHTML = `<p style="font-size:12px;color:#9ca3af">No ${isLive ? 'live' : 'party'} hours in this period</p>`;
      if (pager) pager.hidden = true;
      return 1;
    }

    const sliced = pageSlice(filtered, page);
    list.innerHTML = sliced.rows
      .map((d) => {
        const secs = isLive ? d.liveSeconds : d.partySeconds;
        const hrs = isLive
          ? d.liveHoursLabel || formatHoursShort(secs)
          : d.partyHoursLabel || formatHoursShort(secs);
        return `<div class="streamer-daily-row streamer-daily-row--${kind}">
          <div><strong>${dailyDateLabel(d.date)}</strong></div>
          <div class="hrs">${hrs}</div>
        </div>`;
      })
      .join('');

    if (pager) {
      pager.hidden = sliced.totalPages <= 1;
      const prev = pager.querySelector('[data-page-dir="-1"]');
      const next = pager.querySelector('[data-page-dir="1"]');
      if (prev) prev.disabled = sliced.page <= 1;
      if (next) next.disabled = sliced.page >= sliced.totalPages;
    }
    if (label) label.textContent = `${sliced.page} / ${sliced.totalPages}`;
    return sliced.page;
  }

  function renderDailyHoursPaged() {
    streamerLivePage = renderKindDailyList('live', streamerLivePage);
    streamerPartyPage = renderKindDailyList('party', streamerPartyPage);
  }

  function initStreamerCenter() {
    const user = currentUser();
    const uidEl = document.getElementById('streamerUid');
    if (uidEl && user) {
      const publicId = window.formatUserDisplayId?.(user) || String(user.display_id || '');
      uidEl.textContent = publicId ? 'ID:' + publicId : 'ID:—';
    }

    document.querySelectorAll('[data-stats-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-stats-period]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadStreamerStats(btn.dataset.statsPeriod || 'today');
      });
    });

    document.querySelectorAll('[data-activity-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-activity-period]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadUserAnalytics(btn.dataset.activityPeriod || 'today');
      });
    });

    document.getElementById('streamerLivePager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page-dir]');
      if (!btn) return;
      streamerLivePage += Number(btn.dataset.pageDir) || 0;
      renderDailyHoursPaged();
    });
    document.getElementById('streamerPartyPager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page-dir]');
      if (!btn) return;
      streamerPartyPage += Number(btn.dataset.pageDir) || 0;
      renderDailyHoursPaged();
    });

    loadStreamerStats('today');
    loadUserAnalytics('today');

    if (!window.__apStreamerStatsRefreshBound) {
      window.__apStreamerStatsRefreshBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && document.body?.dataset?.livePage === 'streamer-center') {
          loadStreamerStats(streamerStatsPeriod);
          loadUserAnalytics(userAnalyticsPeriod);
        }
      });
      document.addEventListener('ap-page-refreshed', () => {
        if (document.body?.dataset?.livePage === 'streamer-center') {
          loadStreamerStats(streamerStatsPeriod);
          loadUserAnalytics(userAnalyticsPeriod);
        }
      });
    }

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
      } catch (_e) { }
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
    } catch (_e) { }

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
          } catch (_e) { }
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
    loadStreamerStats,
    loadUserAnalytics,
    initLuckyGifts,
    initCoinsRecharge,
    getCoins,
    refreshCoinDisplay,
    isActuallyLive,
    getChannel: channelId,
    minimizeRoom: minimizeLiveRoom,
    handleBack: handleLiveRoomBack,
    leaveToExplore,
    onMiniPlayerExpand: onMiniPlayerExpanded,
    exitRoom,
    applyBeautyEngineState,
    openBeautySheet: () => openVideoFilterSheet(),
    getForensicReport() {
      return window.__liveDebug || { events: [] };
    },
  };
  window.APLive = window.SocialLive;

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body?.dataset?.livePage;
    if (page === 'party-room' || page === 'live-room') {
      bindApLoaderDismiss();
      installLoaderEscapeHatch();
      initLiveBackGuard();
      primeApLoaderCover();
      bindScreenCaptureLifecycle();
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
