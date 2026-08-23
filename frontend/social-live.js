/**
 * Party room (voice grid) + Live room (video) - Agora + Socket.io
 */
(function () {
  window.__AP_LIVE_BUILD = '20260724-phase2a-route';
  const _liveEmoji = typeof window !== 'undefined' && window.AP_LIVE_EMOJI ? window.AP_LIVE_EMOJI : {};
  const COIN_EMOJI = _liveEmoji.COIN || '\u{1FA99}';

  function liveMedia() {
    return window.APLiveMedia || null;
  }

  if (!_liveEmoji.GIFT_CATALOG) {
    console.warn('[live] Load live-emoji-data.js before social-live.js for gift icons');
  }
  const GIFT_CATALOG = _liveEmoji.GIFT_CATALOG || {
    gift: [], lucky: [], new: [], island: [], fan: [], privilege: [], fun: [],
  };

  const PARTY_MAX_SEATS = 15;
  const PARTY_HOST_SLOT = 1;
  const PARTY_MAX_GUESTS = PARTY_MAX_SEATS - 1;
  const LIVE_MAX_GUESTS = 5; /* host + 5 guests = 6 on live stream */
  const LIVE_MAX_ON_STAGE = LIVE_MAX_GUESTS + 1;

  const chatProfileCache = new Map();

  function giftSlugFor(item) {
    if (item?.slug) return item.slug;
    const base = String(item?.name || 'gift')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return `${base}_${item?.cost || 0}`;
  }

  /** Max single gift charge (catalog + send validation) */
  const MAX_GIFT_COINS = 10000000;

  function withinGiftCoinCap(g) {
    return Number(g?.cost || 0) <= MAX_GIFT_COINS;
  }

  function capGiftList(list) {
    return (list || []).filter(withinGiftCoinCap);
  }

  Object.keys(GIFT_CATALOG).forEach((cat) => {
    GIFT_CATALOG[cat] = capGiftList(
      (GIFT_CATALOG[cat] || []).map((g) => ({ ...g, slug: giftSlugFor(g) }))
    );
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
    {
      id: 'lakeside',
      label: 'Lakeside',
      premium: false,
      css:
        'linear-gradient(180deg, rgba(8,12,28,0.2), rgba(8,12,28,0.45)), url("https://images.unsplash.com/photo-1478131143081-801f4ae78442?auto=format&fit=crop&w=1200&q=80") center/cover no-repeat',
    },
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
  const PARTY_GAME_TYPES = [
    { id: 'none', label: 'None', emoji: '⬜' },
    { id: 'jungle', label: 'Krazy Jungle', emoji: '🦁', game: '/games/crazy-fruit.html' },
    { id: 'circus', label: 'Krazy Circus', emoji: '🎪', game: '/games/greedy.html' },
    { id: 'battle', label: 'Royal Battle', emoji: '🃏', game: '/games/teen-patti.html' },
    { id: 'ocean', label: 'Ocean Slot', emoji: '🐠', game: '/games/greedy.html' },
    { id: 'khazana', label: 'Khazana', emoji: '💎', game: '/games/greedy.html' },
    { id: 'panda', label: 'Jungle Delight', emoji: '🐼', game: '/games/crazy-fruit.html' },
    { id: 'candy', label: 'Candy Slot', emoji: '🍭', game: '/games/greedy.html' },
    { id: 'magic', label: 'Magic Slot', emoji: '🧙', game: '/games/greedy.html' },
    { id: 'halloween', label: 'Halloween Slot', emoji: '🎃', game: '/games/greedy.html' },
    { id: 'football', label: 'Football Slot', emoji: '⚽', game: '/games/greedy.html' },
    { id: 'christmas', label: 'Christmas Slot', emoji: '🎅', game: '/games/greedy.html' },
    { id: 'scratch', label: 'Scratch Card', emoji: '🎫', game: '/games/greedy.html' },
    { id: 'kards', label: 'Krazy Kards', emoji: '🐘', game: '/games/teen-patti.html' },
    { id: 'shark', label: 'Shark Tank', emoji: '🦈', game: '/games/greedy.html' },
    { id: 'ludo', label: 'Ludo', emoji: '🎲', game: '/games/greedy.html' },
  ];
  let partySeatMenuCtx = null;
  let partySeatMoveUserId = null;
  let partySeatMoveUserName = '';
  let partySeatsFitTimer = null;
  let lastPartySeatsStructureKey = '';
  let quickChipsExpanded = false;
  let chatRegionFilter = 'room';
  let sessionGiftCoins = 0;
  let userXpProgress = 0;
  const GIFT_OPTIONS = GIFT_CATALOG.gift;

  let giftCategory = 'popular';
  let giftQty = 1;
  let selectedGiftIdx = 0;
  let giftSearchQuery = '';
  let activeFeedHostId = '';

  function sortGiftsCheapFirst(list) {
    return (list || [])
      .slice()
      .sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  }

  const GIFT_TAB_HTML = `
            <button type="button" data-cat="recent">Recent</button>
            <button type="button" data-cat="popular" class="active">Popular</button>
            <button type="button" data-cat="premium">Premium</button>
            <button type="button" data-cat="vip">VIP</button>
            <button type="button" data-cat="flowers">Flowers</button>
            <button type="button" data-cat="lucky">Lucky</button>
            <button type="button" data-cat="cars">Luxury</button>`;

  function giftMemoryKey(kind) {
    const uid = currentUser()?.id || 'guest';
    return `ap_gift_${kind}_${uid}`;
  }

  function readGiftMemory(kind) {
    try {
      return JSON.parse(localStorage.getItem(giftMemoryKey(kind)) || '[]') || [];
    } catch (_e) {
      return [];
    }
  }

  function writeGiftMemory(kind, list) {
    try {
      localStorage.setItem(giftMemoryKey(kind), JSON.stringify((list || []).slice(0, 24)));
    } catch (_e) { }
  }

  function rememberGiftUse(item) {
    if (!item) return;
    const slug = item.slug || giftSlugFor(item);
    const recent = readGiftMemory('recent').filter((x) => x.slug !== slug);
    recent.unshift({
      emoji: item.emoji,
      name: item.name,
      cost: item.cost,
      tag: item.tag,
      slug,
    });
    writeGiftMemory('recent', recent);
  }

  function toggleGiftFavorite(item) {
    if (!item) return false;
    const slug = item.slug || giftSlugFor(item);
    const favs = readGiftMemory('fav');
    const idx = favs.findIndex((x) => x.slug === slug);
    if (idx >= 0) favs.splice(idx, 1);
    else {
      favs.unshift({
        emoji: item.emoji,
        name: item.name,
        cost: item.cost,
        tag: item.tag || '♥',
        slug,
      });
    }
    writeGiftMemory('fav', favs);
    return idx < 0;
  }

  function isGiftFavorite(item) {
    const slug = item?.slug || giftSlugFor(item || {});
    return readGiftMemory('fav').some((x) => x.slug === slug);
  }

  function collectAllGifts() {
    const out = [];
    const seen = new Set();
    Object.values(GIFT_CATALOG).forEach((arr) => {
      (arr || []).forEach((g) => {
        const key = `${g.slug || giftSlugFor(g)}:${g.cost}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(g);
      });
    });
    return out;
  }

  function giftsForAnimatedTab() {
    const animated = GIFT_CATALOG.animated;
    if (animated && animated.length) {
      return capGiftList(
        sortGiftsCheapFirst(
          animated.map((g) => ({ ...g, slug: g.slug || giftSlugFor(g) }))
        )
      );
    }
    return capGiftList(sortGiftsCheapFirst(GIFT_CATALOG.gift || []));
  }

  function uniqueBySlug(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((g) => {
      const key = String(g?.slug || giftSlugFor(g) || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(g);
    });
    return out;
  }

  function animatedSlugSet() {
    const set = new Set();
    (GIFT_CATALOG.animated || []).forEach((g) => set.add(String(g.slug || giftSlugFor(g))));
    return set;
  }

  function excludeAnimated(list) {
    const slugs = animatedSlugSet();
    if (!slugs.size) return list || [];
    return (list || []).filter((g) => !slugs.has(String(g.slug || giftSlugFor(g))));
  }

  function compactGiftThumbUrl(url) {
    const compact = window.AP_GIFT_ANIMATION?.compactThumbUrl;
    if (typeof compact === 'function') return compact(url);
    return String(url || '');
  }

  function giftThumbnailUrl(g) {
    const slug = g?.slug || giftSlugFor(g);
    if (g?.animationEmbedUrl && g?.thumbnailUrl) return compactGiftThumbUrl(g.thumbnailUrl);
    const anim = window.AP_GIFT_ANIMATION?.getAnimatedGift?.(slug);
    if (anim?.thumbnailUrl) return compactGiftThumbUrl(anim.thumbnailUrl);
    return '';
  }

  function giftCardVisualHtml(g) {
    const thumb = giftThumbnailUrl(g);
    if (thumb) {
      return `<img class="gift-thumb-img" src="${escapeAttr(thumb)}" alt="" width="52" height="52" loading="lazy" decoding="async">`;
    }
    return `<span class="g">${g.emoji}</span>`;
  }

  function giftsForCategory(cat) {
    if (cat === 'animated') return giftsForAnimatedTab();
    if (cat === 'recent') return uniqueBySlug(capGiftList(readGiftMemory('recent')));
    if (cat === 'favorites') return uniqueBySlug(capGiftList(readGiftMemory('fav')));
    if (cat === 'popular' || cat === 'gift' || cat === 'trending' || cat === 'new') {
      return uniqueBySlug(capGiftList(sortGiftsCheapFirst(excludeAnimated(GIFT_CATALOG.gift || []))));
    }
    if (cat === 'premium') {
      return giftsForAnimatedTab();
    }
    if (cat === 'vip' || cat === 'privilege') {
      return uniqueBySlug(
        capGiftList(
          sortGiftsCheapFirst(
            excludeAnimated([...(GIFT_CATALOG.privilege || []), ...(GIFT_CATALOG.jewelry || [])])
          )
        )
      );
    }
    if (cat === 'flowers') {
      return uniqueBySlug(capGiftList(sortGiftsCheapFirst(excludeAnimated(GIFT_CATALOG.flowers || []))));
    }
    if (cat === 'lucky') {
      return uniqueBySlug(
        capGiftList(
          sortGiftsCheapFirst(excludeAnimated([...(GIFT_CATALOG.lucky || []), ...(GIFT_CATALOG.seasonal || [])]))
        )
      );
    }
    if (cat === 'island') {
      return uniqueBySlug(capGiftList(sortGiftsCheapFirst(excludeAnimated(GIFT_CATALOG.lifestyle || GIFT_CATALOG.gift || []))));
    }
    if (cat === 'cars') {
      return uniqueBySlug(
        capGiftList(
          sortGiftsCheapFirst(
            excludeAnimated([
              ...(GIFT_CATALOG.cars || []),
              ...(GIFT_CATALOG.lifestyle || []),
              ...(GIFT_CATALOG.animals || []),
              ...(GIFT_CATALOG.fantasy || []),
              ...(GIFT_CATALOG.cosmic || []),
            ])
          )
        )
      );
    }
    return uniqueBySlug(capGiftList(sortGiftsCheapFirst(excludeAnimated(GIFT_CATALOG[cat] || GIFT_CATALOG.gift || []))));
  }

  let liveSocket = null;
  let roomState = null;
  let chatTab = 'all';
  let followed = false;
  let soundOn = true;
  let audioUnlocked = false;
  let audioUnlockBound = false;
  let __audioKickSeq = 0;
  let __audioSinkWatchTimer = null;
  let __audioSinkWatchUntil = 0;
  const __remoteAudioSinkEls = new Map();
  const __remoteAudioGraph = new Map();
  let partyMusicPlayingId = '';
  let partyMusicCustomTracks = [];
  let partyMusicAgoraTrack = null;
  let partyMusicPublishBusy = false;
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
  /** Prevent gift banner/chat from repeating 2–3× (socket + state + local finish). */
  const recentGiftFxKeys = new Map();
  const RECENT_GIFT_FX_MS = 10000;

  function normalizeGiftTxId(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.replace(/^(gift-|evt-)/i, '');
  }

  function giftFingerprint(giftOrMsg) {
    if (!giftOrMsg) return '';
    const g = giftOrMsg.gift || giftOrMsg;
    const txId = normalizeGiftTxId(
      g.gift_tx_id ||
      g.giftId ||
      (String(g.id || '').length >= 8 && !/^\d+$/.test(String(g.id || '')) ? g.id : '') ||
      (String(giftOrMsg.id || '').startsWith('gift-') ? giftOrMsg.id : '')
    );
    if (txId) return `id:${txId}`;
    /* Soft key: user ids + amount — ignore emoji (🌹 vs rose) so socket/state merge */
    const from = String(g.fromUserId || g.senderId || giftOrMsg.userId || '');
    const to = String(g.toUserId || g.receiver_id || g.recipientId || '');
    const amt = Number(g.amount || g.coins || g.coin_amount || 0);
    const qty = Number(g.qty || 1);
    if (from && to && amt > 0) return `uid:${from}|${to}|${amt}|${qty}`;
    const fromName = String(g.from || giftOrMsg.user || '');
    const toName = String(g.to || '');
    return `name:${fromName}|${toName}|${amt}|${qty}`;
  }

  function pruneRecentGiftFx(now = Date.now()) {
    for (const [k, t] of recentGiftFxKeys) {
      if (now - t > RECENT_GIFT_FX_MS) recentGiftFxKeys.delete(k);
    }
  }

  /** Returns true the first time this gift effect should play; false if duplicate. */
  function claimGiftPresentation(gift) {
    if (!gift) return false;
    pruneRecentGiftFx();
    const key = giftFingerprint(gift);
    if (!key) return true;
    const soft = key.startsWith('id:')
      ? giftFingerprint({
        ...gift,
        id: null,
        gift_tx_id: null,
        gift: gift.gift ? { ...gift.gift, id: null, gift_tx_id: null } : undefined,
      })
      : key;
    if (recentGiftFxKeys.has(key) || (soft && recentGiftFxKeys.has(soft))) return false;
    const now = Date.now();
    recentGiftFxKeys.set(key, now);
    if (soft) recentGiftFxKeys.set(soft, now);
    return true;
  }

  function presentGiftLocally(giftEvt) {
    if (!giftEvt) return false;
    const isFresh = claimGiftPresentation(giftEvt);
    if (!isFresh) return false;
    const combo = window.SocialFX?.trackCombo?.(giftEvt.emoji || 'gift', giftEvt.qty || 1) || 1;
    const hasAnimStream = window.GiftAnimationOverlay?.hasAnimationForGift?.(giftEvt);
    if (hasAnimStream) {
      try {
        window.GiftAnimationOverlay?.onGiftReceived?.(giftEvt);
      } catch (_e) { /* presentation only */ }
    }
    window.SocialFX?.playGift?.(giftEvt, {
      combo,
      skipActivity: true,
      skipCinematic: hasAnimStream,
      skipSound: hasAnimStream,
    });
    onGiftTeamProgress(giftEvt.amount || giftEvt.coins || 0);
    return true;
  }

  function giftHistorySoftKey(entry) {
    const from = String(entry.fromUserId || '');
    const to = String(entry.toUserId || '');
    const amt = Number(entry.amount || 0);
    const bucket = Math.floor(Number(entry.at || Date.now()) / 8000);
    if (from && to && amt > 0) return `uid:${from}|${to}|${amt}|${bucket}`;
    return `name:${entry.from || ''}|${entry.to || ''}|${amt}|${bucket}`;
  }

  function pushRoomGift(gift) {
    if (!gift) return;
    const txId = normalizeGiftTxId(gift.gift_tx_id || gift.giftId || gift.id);
    const entry = {
      id: txId || gift.id || null,
      gift_tx_id: txId || null,
      from: gift.from || gift.senderName || 'User',
      fromUserId: gift.fromUserId || gift.senderId || null,
      to: gift.to || gift.recipientName || gift.recipient || 'Host',
      toUserId: gift.toUserId || gift.recipientId || gift.receiver_id || null,
      emoji: gift.emoji || gift.gift_type || '🎁',
      amount: Number(gift.amount || gift.coins || gift.coin_amount || 0),
      at: gift.at ? new Date(gift.at).getTime() : Date.now(),
    };
    const soft = giftHistorySoftKey(entry);
    const idKey = entry.id ? `id:${normalizeGiftTxId(entry.id)}` : '';
    if (
      roomGiftHistory.some((g) => {
        if (idKey && g.id && `id:${normalizeGiftTxId(g.id)}` === idKey) return true;
        if (g.gift_tx_id && entry.gift_tx_id && String(g.gift_tx_id) === String(entry.gift_tx_id)) return true;
        if (g._soft === soft) return true;
        return false;
      })
    ) {
      return;
    }
    entry._key = idKey || soft;
    entry._soft = soft;
    roomGiftHistory.push(entry);
    if (roomGiftHistory.length > 40) roomGiftHistory = roomGiftHistory.slice(-40);
  }

  function hydrateGiftHistoryFromState(state) {
    const gifts = state?.gifts || [];
    /* Prefer gifts[] only — gift chat messages are the same sends (was doubling history) */
    if (gifts.length) {
      gifts.forEach((g) => pushRoomGift(g));
      return;
    }
    (state?.messages || [])
      .filter((m) => m?.type === 'gift')
      .forEach((m) => {
        pushRoomGift({
          id: m.gift?.gift_tx_id || m.gift?.id || m.id,
          gift_tx_id: m.gift?.gift_tx_id || m.gift?.id,
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
  let chatClearedAt = 0;
  let hasSpeakerSeat = false;
  let pkScoreLeft = 0;
  let pkScoreRight = 0;
  let pkTimerSec = 188;
  let micLinkPending = false;
  let micRequestWatchdog = null;
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
  /** User ids who can end this battle (PK hosts / participants) */
  let pkEnderIds = new Set();
  let pkRivalAgoraClient = null;
  let pkRivalChannelJoined = '';
  let pkLinkedChannels = [];
  let pkViewSwapped = false;
  let pkRivalWatchTimer = null;
  let pkActiveBattleId = null;

  function isPkViewSwapped(snapshot) {
    const me = String(currentUser()?.id || '');
    const mine = String(channelId() || '');
    if (!me && !mine) return false;
    if (snapshot?.rivalChannel && String(snapshot.rivalChannel) === mine) return true;
    if (snapshot?.challengerChannel && String(snapshot.challengerChannel) === mine) return false;
    if (snapshot?.rivalUserId && String(snapshot.rivalUserId) === me) return true;
    if (snapshot?.challengerUserId && String(snapshot.challengerUserId) === me) return false;
    return (snapshot?.participants || []).some(
      (p) => String(p.user_id || p.userId) === me && Number(p.team) === 2
    );
  }

  function resolvePkRivalChannel(snapshot) {
    const mine = String(channelId() || '');
    const linked = Array.isArray(snapshot?.linkedChannels)
      ? snapshot.linkedChannels.map(String)
      : Array.isArray(pkLinkedChannels)
        ? pkLinkedChannels.map(String)
        : [];
    /* Always pick the OTHER linked channel relative to this room */
    if (pkViewSwapped || (snapshot && isPkViewSwapped(snapshot))) {
      if (snapshot?.challengerChannel && String(snapshot.challengerChannel) !== mine) {
        return String(snapshot.challengerChannel);
      }
    }
    if (snapshot?.rivalChannel && String(snapshot.rivalChannel) !== mine) {
      return String(snapshot.rivalChannel);
    }
    if (snapshot?.challengerChannel && String(snapshot.challengerChannel) !== mine) {
      return String(snapshot.challengerChannel);
    }
    const other = linked.find((c) => c && c !== mine);
    if (other) return other;
    if (pkMatchedRivalMeta?.channel && String(pkMatchedRivalMeta.channel) !== mine) {
      return String(pkMatchedRivalMeta.channel);
    }
    return '';
  }

  function ensurePkRivalMediaBox() {
    const root = document.getElementById('liveRoomRoot') || document.querySelector('.party-room');
    if (!root) return null;
    let box = document.getElementById('apPkRivalMedia');
    if (!box) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div id="apPkRivalMedia" class="ap-pk-rival-media" aria-hidden="true"></div>`
      );
      box = document.getElementById('apPkRivalMedia');
    }
    return box;
  }

  function ensurePkSelfMediaBox() {
    const root = document.getElementById('liveRoomRoot') || document.querySelector('.party-room');
    if (!root) return null;
    let box = document.getElementById('apPkSelfMedia');
    if (!box) {
      const rival = document.getElementById('apPkRivalMedia');
      const html = `<div id="apPkSelfMedia" class="ap-pk-self-media" aria-hidden="true"></div>`;
      if (rival) rival.insertAdjacentHTML('beforebegin', html);
      else root.insertAdjacentHTML('beforeend', html);
      box = document.getElementById('apPkSelfMedia');
    }
    return box;
  }

  function resolveHostPreviewTrack() {
    return (
      beautyPipeline?.customTrack ||
      rawCameraTrack ||
      getLocalVideoTrack?.() ||
      null
    );
  }

  function paintPkSelfPreview(videoTrack) {
    if (!isPkLiveNow()) return;
    if (!isHost() && !clientClaimsHost?.()) return;
    const track = videoTrack || resolveHostPreviewTrack();
    const box = ensurePkSelfMediaBox();
    if (!box || !track?.play) return;
    try {
      box.innerHTML = '';
      box.removeAttribute('aria-hidden');
      document.body.classList.add('ap-pk-has-self');
      document.documentElement.classList.add('ap-pk-has-self');
      track.play(box, { mirror: false, fit: 'cover' });
      applyHostPreviewMirror(box, cameraFacing);
      requestAnimationFrame(() => applyHostPreviewMirror(box, cameraFacing));
    } catch (e) {
      console.warn('[pk] self preview', e?.message || e);
    }
  }

  function clearPkSelfMedia() {
    const box = document.getElementById('apPkSelfMedia');
    if (box) {
      box.innerHTML = '';
      box.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('ap-pk-has-self');
    document.documentElement.classList.remove('ap-pk-has-self');
  }

  let pkRivalJoinPromise = null;
  /** Agora uid of the rival room HOST — only their A/V is played from rival channel */
  let pkRivalHostAgoraUid = null;
  /** Last PK snapshot for orientation on end */
  let pkLastSnapshot = null;

  function pkMyTeamFromSnapshot(snapshot) {
    const mine = String(channelId() || '');
    const me = String(currentUser()?.id || '');
    if (snapshot?.rivalChannel && String(snapshot.rivalChannel) === mine) return 2;
    if (snapshot?.challengerChannel && String(snapshot.challengerChannel) === mine) return 1;
    if (snapshot?.rivalUserId && String(snapshot.rivalUserId) === me) return 2;
    if (snapshot?.challengerUserId && String(snapshot.challengerUserId) === me) return 1;
    if ((snapshot?.participants || []).some((p) => String(p.user_id || p.userId) === me && Number(p.team) === 2)) {
      return 2;
    }
    return 1;
  }

  function resolvePkSideNames(snapshot) {
    const mine = String(channelId() || '');
    const thisRoomHost =
      roomState?.hostName ||
      document.getElementById('liveHostName')?.textContent ||
      (isHost?.() || clientClaimsHost?.() ? displayName(currentUser()) : null) ||
      'Host';
    const challenger =
      snapshot?.hostName ||
      (snapshot?.participants || []).find((p) => Number(p.team) === 1)?.display_name ||
      'Host';
    const rival =
      snapshot?.rivalName ||
      snapshot?.opponentName ||
      pkMatchedRivalMeta?.name ||
      (snapshot?.participants || []).find((p) => Number(p.team) === 2)?.display_name ||
      'Rival';

    /* Left slot = THIS room host video. Right = other PK host. Never swap by raw team labels. */
    if (snapshot?.challengerChannel && String(snapshot.challengerChannel) === mine) {
      return { labelL: challenger || thisRoomHost, labelR: rival, myTeam: 1 };
    }
    if (snapshot?.rivalChannel && String(snapshot.rivalChannel) === mine) {
      return { labelL: rival || thisRoomHost, labelR: challenger, myTeam: 2 };
    }
    if (isHost?.() || clientClaimsHost?.()) {
      const me = String(currentUser()?.id || '');
      if (snapshot?.challengerUserId && String(snapshot.challengerUserId) === me) {
        return { labelL: challenger || thisRoomHost, labelR: rival, myTeam: 1 };
      }
      if (snapshot?.rivalUserId && String(snapshot.rivalUserId) === me) {
        return { labelL: rival || thisRoomHost, labelR: challenger, myTeam: 2 };
      }
    }
    /* Audience: this room host left, their PK rival right */
    const thisHostId = String(roomState?.hostId || '');
    if (thisHostId && snapshot?.rivalUserId && thisHostId === String(snapshot.rivalUserId)) {
      return { labelL: rival || thisRoomHost, labelR: challenger, myTeam: 2 };
    }
    if (thisHostId && snapshot?.challengerUserId && thisHostId === String(snapshot.challengerUserId)) {
      return { labelL: challenger || thisRoomHost, labelR: rival, myTeam: 1 };
    }
    return {
      labelL: thisRoomHost,
      labelR: pkMatchedRivalMeta?.name || rival,
      myTeam: pkMyTeamFromSnapshot(snapshot),
    };
  }

  function resolveRivalHostAgoraUid(snapshot, rivalCh) {
    if (!snapshot) return null;
    const ch = String(rivalCh || '');
    if (snapshot.rivalChannel && ch === String(snapshot.rivalChannel) && snapshot.rivalAgoraUid != null) {
      return Number(snapshot.rivalAgoraUid);
    }
    if (
      snapshot.challengerChannel &&
      ch === String(snapshot.challengerChannel) &&
      snapshot.challengerAgoraUid != null
    ) {
      return Number(snapshot.challengerAgoraUid);
    }
    if (snapshot.rivalAgoraUid != null && ch === String(snapshot.rivalChannel || '')) {
      return Number(snapshot.rivalAgoraUid);
    }
    if (snapshot.challengerAgoraUid != null && ch === String(snapshot.challengerChannel || '')) {
      return Number(snapshot.challengerAgoraUid);
    }
    /* Prefer the rival meta user if we have only one side */
    if (pkMatchedRivalMeta?.userId && window.__apAgoraUidMap) {
      const map = window.__apAgoraUidMap;
      for (const [aUid, uId] of Object.entries(map)) {
        if (String(uId) === String(pkMatchedRivalMeta.userId)) return Number(aUid);
      }
    }
    return null;
  }

  function isPkRivalHostAgoraUser(user) {
    if (!user) return false;
    if (pkRivalHostAgoraUid != null && Number(user.uid) === Number(pkRivalHostAgoraUid)) return true;
    if (pkRivalHostAgoraUid != null) return false;
    /* Fallback: only first remote user with video (likely host) */
    return Boolean(user.hasVideo || user.videoTrack);
  }

  async function stopPkRivalAgora() {
    const box = document.getElementById('apPkRivalMedia');
    if (box) {
      box.innerHTML = '';
      box.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('ap-pk-has-rival');
    document.documentElement.classList.remove('ap-pk-has-rival');
    const client = pkRivalAgoraClient;
    pkRivalAgoraClient = null;
    pkRivalChannelJoined = '';
    pkRivalHostAgoraUid = null;
    if (!client) return;
    try {
      client.removeAllListeners?.();
    } catch (_e) {}
    try {
      await client.leave();
    } catch (_e) {}
  }

  async function startPkRivalAgora(rivalChannel, snapshotHint) {
    const ch = String(rivalChannel || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!ch || ch === String(channelId() || '')) return;
    const snap = snapshotHint || pkLastSnapshot;
    pkRivalHostAgoraUid = resolveRivalHostAgoraUid(snap, ch);

    if (pkRivalChannelJoined === ch && pkRivalAgoraClient) {
      /* already linked — re-subscribe host media only */
      try {
        const box = ensurePkRivalMediaBox();
        if (box && pkRivalAgoraClient.remoteUsers?.length) {
          for (const user of pkRivalAgoraClient.remoteUsers) {
            const isHostPub = isPkRivalHostAgoraUser(user);
            if (user.hasVideo && isHostPub && !box.querySelector('video')) {
              try {
                await pkRivalAgoraClient.subscribe(user, 'video');
                if (user.videoTrack) {
                  box.innerHTML = '';
                  box.setAttribute('aria-hidden', 'false');
                  user.videoTrack.play(box, { fit: 'cover' });
                  document.body.classList.add('ap-pk-has-rival');
                  document.documentElement.classList.add('ap-pk-has-rival');
                }
              } catch (_e) {}
            }
            if (user.hasAudio) {
              if (isHostPub) {
                try {
                  await pkRivalAgoraClient.subscribe(user, 'audio');
                  user.audioTrack?.play?.();
                  user.audioTrack?.setVolume?.(100);
                } catch (_e) {}
              } else {
                try {
                  user.audioTrack?.stop?.();
                  user.audioTrack?.setVolume?.(0);
                  await pkRivalAgoraClient.unsubscribe?.(user, 'audio');
                } catch (_e) {}
              }
            }
          }
        }
      } catch (_e) {}
      return;
    }
    if (pkRivalJoinPromise) {
      try {
        await pkRivalJoinPromise;
      } catch (_e) {}
      if (pkRivalChannelJoined === ch && pkRivalAgoraClient) return;
    }

    pkRivalJoinPromise = (async () => {
      await stopPkRivalAgora();
      pkRivalHostAgoraUid = resolveRivalHostAgoraUid(snap, ch);
      const box = ensurePkRivalMediaBox();
      if (!box) return;

      const AgoraRTC = await loadAgoraScript();
      const res = await (window.API?.postFresh || window.API?.post)?.call(
        window.API,
        '/live/agora/token',
        { channel: ch, role: 'audience' }
      );
      const appId = String(res?.appId || res?.data?.appId || '').trim();
      const token = res?.token || res?.data?.token;
      const uid = res?.uid != null ? res.uid : res?.data?.uid;
      if (!appId || !token) {
        console.warn('[pk] rival agora token missing', res);
        toast('Could not connect rival stream', 'warning');
        return;
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      pkRivalAgoraClient = client;
      pkRivalChannelJoined = ch;

      const playUser = async (user, mediaType) => {
        if (!pkRivalAgoraClient || pkRivalAgoraClient !== client) return;
        const isHostPub = isPkRivalHostAgoraUser(user);
        /* Guests on rival stream: no audio (and skip their video to keep host camera) */
        if (!isHostPub) {
          if (mediaType === 'audio') return;
          if (mediaType === 'video' && box.querySelector('video')) return;
          if (mediaType === 'video' && pkRivalHostAgoraUid != null) return;
        }
        try {
          await client.subscribe(user, mediaType);
        } catch (e) {
          console.warn('[pk] rival subscribe', mediaType, e?.message || e);
          return;
        }
        if (mediaType === 'video' && user.videoTrack && isHostPub) {
          box.innerHTML = '';
          box.setAttribute('aria-hidden', 'false');
          user.videoTrack.play(box, { fit: 'cover' });
          document.body.classList.add('ap-pk-has-rival');
          document.documentElement.classList.add('ap-pk-has-rival');
          try {
            const wait = document.getElementById('apPkWaitingR');
            if (wait) wait.hidden = true;
          } catch (_e) {}
          setPkStatus('PK LIVE — streams linked');
        }
        if (mediaType === 'audio' && user.audioTrack && isHostPub) {
          try {
            user.audioTrack.play();
            user.audioTrack.setVolume?.(100);
          } catch (_e) {}
        } else if (mediaType === 'audio' && user.audioTrack && !isHostPub) {
          try {
            user.audioTrack.setVolume?.(0);
            user.audioTrack.stop?.();
          } catch (_e) {}
        }
      };

      client.on('user-published', (user, mediaType) => {
        playUser(user, mediaType).catch(() => {});
      });
      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video' && isPkRivalHostAgoraUser(user)) {
          try {
            user.videoTrack?.stop?.();
          } catch (_e) {}
        }
      });

      await client.join(appId, ch, token, uid != null ? Number(uid) || uid : null);

      for (const user of client.remoteUsers || []) {
        if (user.hasVideo) await playUser(user, 'video');
        if (user.hasAudio) await playUser(user, 'audio');
      }
      if (box.querySelector('video')) setPkStatus('PK LIVE — streams linked');
      else setPkStatus('Linking rival stream…');
    })();

    try {
      await pkRivalJoinPromise;
    } catch (e) {
      console.error('[pk] rival agora join failed', e);
      toast('Rival audio/video unavailable — gift war still active', 'warning');
      await stopPkRivalAgora();
    } finally {
      pkRivalJoinPromise = null;
    }
  }

  function rememberPkEnders(snapshot) {
    const next = new Set();
    (snapshot?.participants || []).forEach((p) => {
      const id = String(p?.user_id || p?.userId || '');
      if (id) next.add(id);
    });
    if (snapshot?.battle?.host_user_id) next.add(String(snapshot.battle.host_user_id));
    if (pkMatchedRivalMeta?.userId) next.add(String(pkMatchedRivalMeta.userId));
    const me = String(currentUser()?.id || '');
    if (me && (pkBattleActive || snapshot)) next.add(me);
    /* room host of this live always allowed */
    if (roomState?.hostId) next.add(String(roomState.hostId));
    pkEnderIds = next;
  }

  function canEndPkBattle() {
    const me = String(currentUser()?.id || '');
    if (!me) return false;
    if (isHost?.() || clientClaimsHost?.()) return true;
    if (pkEnderIds.has(me)) return true;
    if (pkMatchedRivalMeta?.userId && String(pkMatchedRivalMeta.userId) === me) return true;
    return false;
  }

  function pkSecsRemaining(snapshot) {
    const endsAt = snapshot?.battle?.ends_at;
    if (endsAt) return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
    return Number(snapshot?.battle?.duration_seconds) || pkTimerSec || 300;
  }

  function applyPkTeamsFromSnapshot(snapshot) {
    const teams = snapshot?.teams || snapshot?.teamScores || [];
    const byTeam = (n) => {
      const hit = teams.find((t) => Number(t.team) === n);
      if (hit) return Number(hit.team_score ?? hit.score ?? 0);
      if (teams[n - 1] && Number(teams[n - 1].team) === n) {
        return Number(teams[n - 1].team_score ?? teams[n - 1].score ?? 0);
      }
      return Number(teams[n - 1]?.team_score ?? teams[n - 1]?.score ?? 0);
    };
    const t1 = byTeam(1);
    const t2 = byTeam(2);
    const myTeam = pkMyTeamFromSnapshot(snapshot);
    /* Left score always = this room's team (what's under your video) */
    if (myTeam === 2) {
      pkScoreLeft = t2;
      pkScoreRight = t1;
    } else {
      pkScoreLeft = t1;
      pkScoreRight = t2;
    }
  }

  function setPkStatus(text) {
    const el = document.getElementById('apPkStatus');
    if (el) el.textContent = text || '';
  }

  function isPkLiveNow() {
    return Boolean(pkBattleActive || document.body.classList.contains('is-pk-mode'));
  }

  function syncPkControlUi() {
    const live = isPkLiveNow();
    const canEnd = Boolean(live && canEndPkBattle());
    document.body.classList.toggle('ap-pk-can-end', canEnd);
    document.documentElement.classList.toggle('ap-pk-can-end', canEnd);
    const stopBtn = document.getElementById('apPkStopBtn');
    if (stopBtn) {
      stopBtn.hidden = !canEnd;
      stopBtn.disabled = Boolean(pkEndRequested);
      stopBtn.setAttribute('aria-hidden', canEnd ? 'false' : 'true');
      stopBtn.textContent = pkEndRequested ? 'Ending…' : 'End PK';
      stopBtn.classList.remove('host-only-tool');
    }
    const toolBtn = document.getElementById('liveBtnPk');
    if (toolBtn) {
      const isRoomHost = Boolean(isHost?.() || clientClaimsHost?.());
      const showStopOnTools = canEnd && isRoomHost;
      toolBtn.classList.toggle('is-pk-stop', showStopOnTools);
      toolBtn.setAttribute('aria-label', showStopOnTools ? 'End PK' : 'Start PK');
      let label = toolBtn.querySelector('.ap-pk-tool-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'ap-pk-tool-label';
        toolBtn.appendChild(label);
      }
      label.textContent = showStopOnTools ? 'End PK' : 'Room PK';
      if (!showStopOnTools) {
        let ico = toolBtn.querySelector('.ico.pk');
        if (ico && !ico.querySelector('.ap-pk-ico-mark')) {
          ico.innerHTML = '<span class="ap-pk-ico-mark" aria-hidden="true"><b>P</b><i>K</i></span>';
        }
      }
    }
  }

  function requestStopPk({ skipConfirm = false } = {}) {
    if (!canEndPkBattle()) {
      toast('Only PK hosts can end this battle', 'warning');
      return;
    }
    if (!isPkLiveNow()) {
      toast('No PK battle is running', 'info');
      return;
    }
    if (pkEndRequested) {
      toast('Ending PK…', 'info');
      return;
    }
    if (!skipConfirm && !window.confirm('End PK now? This counts as forfeit — the other host wins.')) return;
    if (!liveSocket?.connected) {
      toast('Not connected — try again', 'error');
      return;
    }
    pkEndRequested = true;
    setPkStatus('Ending PK…');
    syncPkControlUi();
    liveSocket.emit(
      'pk:end',
      {
        channel: channelId(),
        reason: skipConfirm ? 'timeout' : 'forfeit',
        natural: Boolean(skipConfirm),
      },
      (res) => {
      if (res && res.ok === false) {
        pkEndRequested = false;
        setPkStatus('');
        syncPkControlUi();
        toast(res.message || 'Could not end PK', 'error');
        return;
      }
      if (res?.battle) endPkBattle(res.battle);
    });
  }

  function showPkOverlay(show) {
    ensurePkBattleChrome();
    const overlay = document.getElementById('apPkOverlay');
    if (!overlay) return;
    if (show) {
      overlay.removeAttribute('aria-hidden');
      document.body.classList.add('is-pk-mode');
      document.documentElement.classList.add('is-pk-mode');
      syncHostBarUi?.();
      ensurePkSelfMediaBox();
      syncPkStageUi();
      syncPkControlUi();
      ensurePkMediaAlive('pk-show');
    } else {
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-pk-mode', 'ap-pk-has-rival', 'ap-pk-has-self');
      document.documentElement.classList.remove('is-pk-mode', 'ap-pk-has-rival', 'ap-pk-has-self');
      clearPkSelfMedia();
      try {
        const track = resolveHostPreviewTrack();
        if (track?.play) playLocalHostPreview(track);
      } catch (_e) {}
      document.body.removeAttribute('data-pk-slots');
      document.documentElement.removeAttribute('data-pk-slots');
      setPkStatus('');
      const wait = document.getElementById('apPkWaitingR');
      if (wait) wait.hidden = true;
      syncPkControlUi();
      ensurePkMediaAlive('pk-hide');
    }
  }

  function ensurePkBattleChrome() {
    const root = document.getElementById('liveRoomRoot') || document.querySelector('.party-room');
    if (!root) return;
    const existing = document.getElementById('apPkOverlay');
    /* Force arena + bottom party dock layout */
    if (existing && !existing.querySelector('.ap-pk-party-dock')) {
      existing.remove();
    }
    if (!document.getElementById('apPkOverlay')) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-pk-overlay" id="apPkOverlay" aria-hidden="true">
        <div class="ap-pk-stage" id="apPkStage" data-slots="2">
          <div class="ap-pk-side ap-pk-side-l">
            <div class="ap-pk-side-topline">
              <span class="ap-pk-win ap-pk-win-l" id="apPkWinL">Win x0</span>
              <span class="ap-pk-rank-chip" id="apPkRankL">No Rank</span>
            </div>
            <div class="ap-pk-emblem" id="apPkEmblemL" aria-hidden="true">🦁</div>
            <div class="ap-pk-side-name" id="apPkNameL">Host</div>
          </div>
          <div class="ap-pk-bolt" aria-hidden="true">
            <span class="ap-pk-bolt-icon">⚡</span>
          </div>
          <div class="ap-pk-side ap-pk-side-r">
            <div class="ap-pk-side-topline">
              <span class="ap-pk-win ap-pk-win-r" id="apPkWinR">Win x0</span>
              <span class="ap-pk-rank-chip" id="apPkRankR">Rival</span>
            </div>
            <div class="ap-pk-emblem" id="apPkEmblemR" aria-hidden="true">🦁</div>
            <div class="ap-pk-side-name" id="apPkNameR">Opponent</div>
            <div class="ap-pk-waiting" id="apPkWaitingR">
              <img class="ap-pk-rival-avatar" id="apPkRivalAvatar" alt="" hidden>
              <div class="ap-pk-waiting-ring" id="apPkWaitingRing"></div>
              <span>Waiting for rival…</span>
            </div>
          </div>
        </div>
        <div class="ap-pk-score-wrap ap-pk-party-dock" id="apPkPartyDock">
          <div class="ap-pk-bar" aria-hidden="true">
            <div class="ap-pk-bar-left" id="apPkBarLeft" style="width:50%"></div>
            <span class="ap-pk-score ap-pk-score-l" id="apPkScoreLeft">0</span>
            <span class="ap-pk-center-badge" aria-hidden="true">PK</span>
            <span class="ap-pk-score ap-pk-score-r" id="apPkScoreRight">0</span>
          </div>
          <div class="ap-pk-party-dock-meta">
            <div class="ap-pk-timer-pill" id="apPkTimer">04:00</div>
            <button type="button" class="ap-pk-stop-btn" id="apPkStopBtn" hidden aria-hidden="true">End PK</button>
          </div>
          <p class="ap-pk-status" id="apPkStatus"></p>
        </div>
      </div>`
      );
    }
    if (!document.getElementById('apPkStopBtn')) {
      const wrap = document.querySelector('#apPkOverlay .ap-pk-party-dock-meta') ||
        document.querySelector('#apPkOverlay .ap-pk-score-wrap');
      if (wrap) {
        wrap.insertAdjacentHTML(
          'beforeend',
          `<button type="button" class="ap-pk-stop-btn" id="apPkStopBtn" hidden aria-hidden="true">End PK</button>`
        );
      }
    }
    if (!document.getElementById('apPkRivalAvatar')) {
      const wait = document.getElementById('apPkWaitingR');
      if (wait && !wait.querySelector('.ap-pk-rival-avatar')) {
        wait.insertAdjacentHTML(
          'afterbegin',
          `<img class="ap-pk-rival-avatar" id="apPkRivalAvatar" alt="" hidden>
           <div class="ap-pk-waiting-ring" id="apPkWaitingRing"></div>`
        );
      }
    }
    const stopBtn = document.getElementById('apPkStopBtn');
    if (stopBtn && !stopBtn.dataset.bound) {
      stopBtn.dataset.bound = '1';
      stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        requestStopPk();
      });
    }
  }

  function pkSlotCountFromSnapshot(snapshot) {
    const parts = snapshot?.participants || [];
    const n = Math.max(2, parts.length || 2, pkModeActive === 'team' ? 3 : 2);
    if (n <= 2) return 2;
    if (n <= 3) return 3;
    if (n <= 4) return 4;
    return 6;
  }

  function syncPkStageUi(snapshot) {
    ensurePkBattleChrome();
    const snap = snapshot || pkLastSnapshot;
    const parts = snap?.participants || [];
    const teams = snap?.teams || [];
    const sides = resolvePkSideNames(snap);
    pkViewSwapped = sides.myTeam === 2;
    const labelL = sides.labelL;
    const labelR = sides.labelR;

    const slots = pkSlotCountFromSnapshot(snap);
    document.body.setAttribute('data-pk-slots', String(slots));
    document.documentElement.setAttribute('data-pk-slots', String(slots));
    const stage = document.getElementById('apPkStage');
    if (stage) stage.setAttribute('data-slots', String(slots));

    const nameL = document.getElementById('apPkNameL');
    const nameR = document.getElementById('apPkNameR');
    if (nameL) nameL.textContent = labelL;
    if (nameR) nameR.textContent = labelR;

    const hasRemoteVideo = hasUsablePkRivalVideo();
    document.body.classList.toggle('ap-pk-has-rival', hasRemoteVideo);
    document.documentElement.classList.toggle('ap-pk-has-rival', hasRemoteVideo);

    const wait = document.getElementById('apPkWaitingR');
    if (wait) {
      wait.hidden = hasRemoteVideo;
      const label = wait.querySelector('span');
      const avatar = document.getElementById('apPkRivalAvatar');
      const ring = document.getElementById('apPkWaitingRing');
      const pic = snap?.rivalProfilePic || pkMatchedRivalMeta?.profilePic || null;
      if (avatar) {
        if (pic) {
          avatar.src = avatarUrl(labelR, pic);
          avatar.hidden = false;
          avatar.alt = labelR || 'Rival';
        } else {
          avatar.removeAttribute('src');
          avatar.hidden = true;
        }
      }
      if (ring) ring.hidden = Boolean(pic);
      if (label && !hasRemoteVideo) {
        label.textContent = labelR || 'Rival';
      }
    }

    const rankR = document.getElementById('apPkRankR');
    if (rankR) rankR.textContent = 'Rival';
    const rankL = document.getElementById('apPkRankL');
    if (rankL) rankL.textContent = 'You';

    if (teams.length || snap) {
      applyPkTeamsFromSnapshot(snap);
    }
    if (snap) rememberPkEnders(snap);
    syncPkControlUi();
    const bar = document.getElementById('apPkBarLeft');
    if (bar && !bar.style.width) bar.style.width = '50%';
  }

  function postPkSystemChat(lines) {
    const list = Array.isArray(lines) ? lines : [lines];
    list.forEach((text, idx) => {
      const t = String(text || '').trim();
      if (!t) return;
      /* Local only — never emit to server (avoids bridge loops + multi-room spam) */
      const msg = {
        id: 'pk-local-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).slice(2, 6),
        type: 'system',
        text: t,
        at: Date.now(),
        scope: 'room',
        pkLocal: true,
      };
      try {
        rememberChatMessage?.(msg);
      } catch (_e) {}
    });
    try {
      ensureChatTabShowsMessages?.();
      renderChatFeed?.();
    } catch (_e) {}
  }

  function formatPkClock(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  /** Selection sheet must never sit on top of an active PK battle. */
  function dismissPkSelectionUi() {
    stopPkMatchCountdown?.();
    const types = document.getElementById('apPkTypesSheet');
    if (types) {
      types.classList.remove('open', 'is-matching');
      types.setAttribute('aria-hidden', 'true');
      types.style.display = 'none';
      types.style.pointerEvents = 'none';
    }
    try {
      closeToolsSheetOnly?.();
    } catch (_e) {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    }
    document.getElementById('partyToolsSheet')?.classList.remove('open');
    const tools = document.getElementById('partyToolsSheet');
    if (tools) {
      tools.style.display = 'none';
      tools.style.pointerEvents = 'none';
      tools.setAttribute('aria-hidden', 'true');
    }
  }

  let pkSelectedType = 'random';
  let pkStartInFlight = false;
  let pkFriendPick = null; /* { userId, name, profilePic?, channel? } */
  let pkModeActive = 'random';
  let pkMatchSeq = 0;
  let pkMatchedRivalMeta = null; /* last random-matched host card */
  let pkPendingChallengeId = null;
  let pkFriendCandidatesCache = [];
  let pkFriendLoadInFlight = null;
  let pkDurationSeconds = 300; /* 5 / 15 / 30 mins */
  let pkMatchCountdownTimer = null;
  let pkRoomInviteCache = [];
  let pkSheetView = 'home'; /* home | invite | match */

  function personLabel(u) {
    if (!u) return 'User';
    const n =
      u.name ||
      u.displayName ||
      u.hostName ||
      `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.trim();
    return n || 'User';
  }

  function pushPkCandidate(map, m, flags = {}) {
    const uid = String(m?.userId || m?.id || m?.hostId || '').trim();
    if (!uid) return;
    const me = String(currentUser()?.id || '');
    const hostId = String(roomState?.hostId || me);
    if (uid === me || uid === hostId) return;
    const prev = map.get(uid) || {
      userId: uid,
      name: 'User',
      profilePic: null,
      channel: '',
      inRoom: false,
      live: false,
      following: false,
      follower: false,
    };
    prev.name = personLabel(m) !== 'User' ? personLabel(m) : prev.name;
    prev.profilePic =
      m.profilePic ||
      m.profile_pic ||
      m.hostProfilePic ||
      prev.profilePic ||
      null;
    prev.channel = m.channel || m.targetChannel || prev.channel || '';
    if (flags.inRoom) prev.inRoom = true;
    if (flags.live) prev.live = true;
    if (flags.following) prev.following = true;
    if (flags.follower) prev.follower = true;
    map.set(uid, prev);
  }

  function listPkRoomCandidates() {
    const map = new Map();
    try {
      (getPartyRoomMembers?.() || []).forEach((m) => pushPkCandidate(map, m, { inRoom: true }));
    } catch (_e) {}
    try {
      (getPartyAudienceMembers?.() || []).forEach((m) => pushPkCandidate(map, m, { inRoom: true }));
    } catch (_e) {}
    try {
      (roomState?.members || roomState?.viewersList || []).forEach((m) =>
        pushPkCandidate(
          map,
          {
            userId: m.userId || m.id,
            name: m.name || m.displayName,
            profilePic: m.profilePic || m.profile_pic,
          },
          { inRoom: true }
        )
      );
    } catch (_e) {}
    return map;
  }

  async function loadPkFriendCandidates({ force = false } = {}) {
    if (!force && pkFriendCandidatesCache.length) return pkFriendCandidatesCache;
    if (pkFriendLoadInFlight) return pkFriendLoadInFlight;
    pkFriendLoadInFlight = (async () => {
      const map = listPkRoomCandidates();
      const api = window.API;
      if (api?.get) {
        const get = api.getFresh || api.get;
        try {
          const [following, followers, liveFollowing] = await Promise.all([
            get.call(api, '/social/following?limit=100').catch(() => null),
            get.call(api, '/social/followers?limit=100').catch(() => null),
            get.call(api, '/social/following/live').catch(() => null),
          ]);
          const fRows = Array.isArray(following?.data) ? following.data : [];
          fRows.forEach((u) =>
            pushPkCandidate(
              map,
              {
                userId: u.id,
                name: personLabel(u),
                profilePic: u.profile_pic || u.profilePic,
              },
              { following: true }
            )
          );
          const foRows = Array.isArray(followers?.data) ? followers.data : [];
          foRows.forEach((u) =>
            pushPkCandidate(
              map,
              {
                userId: u.id,
                name: personLabel(u),
                profilePic: u.profile_pic || u.profilePic,
              },
              { follower: true }
            )
          );
          const liveRows = Array.isArray(liveFollowing?.data) ? liveFollowing.data : [];
          liveRows.forEach((u) =>
            pushPkCandidate(
              map,
              {
                userId: u.id,
                name: u.name || personLabel(u),
                channel: u.channel || '',
              },
              { live: true, following: true }
            )
          );
        } catch (_e) {
          /* keep room list */
        }
        try {
          const rooms = await fetchPkLiveRoomCandidates();
          rooms.forEach((r) =>
            pushPkCandidate(
              map,
              {
                userId: r.hostId || r.host_user_id,
                name: r.hostName || r.host_display_name,
                profilePic: r.hostProfilePic || r.hostStreamCover,
                channel: r.channel,
              },
              { live: true }
            )
          );
        } catch (_e) {}
      }
      const list = [...map.values()].sort((a, b) => {
        const score = (x) => (x.live ? 8 : 0) + (x.inRoom ? 4 : 0) + (x.following ? 2 : 0) + (x.follower ? 1 : 0);
        return score(b) - score(a) || String(a.name).localeCompare(String(b.name));
      });
      pkFriendCandidatesCache = list.slice(0, 80);
      return pkFriendCandidatesCache;
    })();
    try {
      return await pkFriendLoadInFlight;
    } finally {
      pkFriendLoadInFlight = null;
    }
  }

  /** @deprecated use loadPkFriendCandidates — kept for sync room-only fallback */
  function listPkInviteCandidates() {
    return [...listPkRoomCandidates().values()].slice(0, 40);
  }

  function hasUsablePkRivalVideo() {
    const riv = document.getElementById('apPkRivalMedia');
    if (riv?.querySelector('video, canvas')) {
      const v = riv.querySelector('video');
      if (!v || (v.videoWidth > 0 && v.videoHeight > 0) || v.dataset.apPlaying === '1') return true;
      if (v && Number(v.readyState || 0) >= 2) return true;
    }
    const container = document.getElementById('liveRemoteHost');
    const vid = container?.querySelector?.('video');
    if (!vid) return Boolean(pkRivalChannelJoined);
    if (vid.videoWidth > 0 && vid.videoHeight > 0) return true;
    if (vid.dataset.apPlaying === '1' && Number(vid.readyState || 0) >= 2) return true;
    return Boolean(pkRivalChannelJoined);
  }

  async function fetchPkLiveRoomCandidates() {
    const api = window.API;
    if (!api?.get) return [];
    const fetchFn = api.getFresh || api.get;
    const me = String(currentUser()?.id || '');
    const ch = String(channelId() || '');
    const hostId = String(roomState?.hostId || me);
    const all = [];
    for (const type of ['live', 'party']) {
      try {
        const res = await fetchFn.call(api, `/live/rooms?type=${type}&limit=40&sort=trending`);
        const rows = Array.isArray(res?.data) ? res.data : [];
        all.push(...rows);
      } catch (_e) {
        /* ignore type */
      }
    }
    const byHost = new Map();
    all.forEach((r) => {
      const uid = String(r.hostId || r.host_user_id || '');
      if (!uid) return;
      if (!byHost.has(uid)) byHost.set(uid, r);
    });
    return [...byHost.values()].filter((r) => {
      const uid = String(r.hostId || r.host_user_id || '');
      const rCh = String(r.channel || '');
      if (!uid || uid === me || uid === hostId) return false;
      if (rCh && rCh === ch) return false;
      return true;
    });
  }

  async function findRandomPkRivalOnce() {
    const list = await fetchPkLiveRoomCandidates();
    if (!list.length) return null;
    list.sort((a, b) => Number(b.viewers || b.viewer_count || 0) - Number(a.viewers || a.viewer_count || 0));
    const pool = list.slice(0, Math.max(3, Math.ceil(list.length / 2)));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return {
      userId: String(pick.hostId || pick.host_user_id),
      name: pick.hostName || pick.host_display_name || 'Rival host',
      profilePic: pick.hostProfilePic || pick.hostStreamCover || pick.host_profile_pic || null,
      channel: pick.channel || '',
      viewers: Number(pick.viewers || pick.viewer_count || 0),
    };
  }

  function delayMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function searchRandomPkRival(seq) {
    const deadline = Date.now() + 7500;
    let attempt = 0;
    while (Date.now() < deadline) {
      if (seq !== pkMatchSeq) return { cancelled: true };
      attempt += 1;
      setPkMatching(
        true,
        attempt === 1 ? 'Searching live streams…' : attempt < 4 ? 'Looking for hosts online…' : 'Still matching…'
      );
      try {
        const rival = await findRandomPkRivalOnce();
        if (seq !== pkMatchSeq) return { cancelled: true };
        if (rival?.userId) return { rival };
      } catch (_e) {
        /* retry */
      }
      await delayMs(850);
      if (seq !== pkMatchSeq) return { cancelled: true };
    }
    return { rival: null };
  }

  function cancelPkMatching(showToast = true) {
    pkMatchSeq += 1;
    pkStartInFlight = false;
    if (pkPendingChallengeId && liveSocket?.connected) {
      liveSocket.emit('pk:challenge:cancel', { challengeId: pkPendingChallengeId });
    }
    pkPendingChallengeId = null;
    stopPkMatchCountdown();
    setPkMatching(false);
    setPkStatus('');
    if (showToast) toast('PK matching cancelled', 'info');
  }

  function emitPkStartAfterMatch(mode, payload) {
    liveSocket.emit('pk:start', payload, (res) => {
      pkStartInFlight = false;
      if (res?.ok) {
        dismissPkSelectionUi();
        const snap = res.battle || res;
        if (snap) {
          snap.mode = mode;
          if (pkMatchedRivalMeta) {
            snap.rivalName = pkMatchedRivalMeta.name;
            snap.opponentName = pkMatchedRivalMeta.name;
            snap.rivalProfilePic = pkMatchedRivalMeta.profilePic;
          }
        }
        beginPkBattle(snap);
        if (mode === 'friend' && pkFriendPick?.name) {
          toast(`Friend PK vs ${pkFriendPick.name}`, 'success');
        } else if (mode === 'team') {
          toast('Team PK live — sides open for gifts', 'success');
        } else if (mode === 'random' && pkMatchedRivalMeta?.name) {
          toast(`Random PK vs ${pkMatchedRivalMeta.name}`, 'success');
        }
      } else {
        setPkMatching(false);
        setPkStatus('');
        selectPkType(pkSelectedType);
        toast(res?.message || 'Could not start PK', 'error');
      }
    });
  }

  function sendPkChallenge(opts) {
    const {
      userId,
      name,
      channel: targetChannel = '',
      mode = 'friend',
      profilePic = null,
    } = opts || {};
    return new Promise((resolve) => {
      if (!liveSocket?.connected) {
        resolve({ ok: false, message: 'Not connected' });
        return;
      }
      const payload = {
        channel: channelId(),
        userId,
        opponentUserId: userId,
        opponentName: name || 'Rival',
        targetChannel: targetChannel || '',
        rivalChannel: targetChannel || '',
        mode,
        hostName:
          roomState?.hostName ||
          document.getElementById('liveHostName')?.textContent ||
          displayName(currentUser()) ||
          'Host',
        durationSeconds: pkDurationSeconds || 300,
      };
      pkMatchedRivalMeta = { userId, name: name || 'Rival', profilePic, channel: targetChannel };
      liveSocket.emit('pk:challenge', payload, (res) => {
        if (res?.ok && res.challengeId) {
          pkPendingChallengeId = res.challengeId;
        }
        resolve(res || { ok: false, message: 'No response' });
      });
    });
  }

  function pkDurationLabel(secs) {
    const m = Math.round(Number(secs || 300) / 60) || 5;
    return `${m}min${m === 1 ? '' : 's'}`;
  }

  function stopPkMatchCountdown() {
    if (pkMatchCountdownTimer) {
      clearInterval(pkMatchCountdownTimer);
      pkMatchCountdownTimer = null;
    }
  }

  function startPkMatchCountdown(totalSec) {
    stopPkMatchCountdown();
    let left = Math.max(1, Math.floor(Number(totalSec) || 300));
    const el = document.getElementById('apPkMatchCountdown');
    const ring = document.getElementById('apPkMatchRingProgress');
    const total = left;
    const circ = 2 * Math.PI * 54; /* r=54 */
    const paint = () => {
      if (el) el.textContent = `${left}s`;
      if (ring) {
        const ratio = Math.max(0, left / total);
        ring.style.strokeDasharray = String(circ);
        ring.style.strokeDashoffset = String(circ * (1 - ratio));
      }
    };
    paint();
    pkMatchCountdownTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        stopPkMatchCountdown();
        paint();
        if (pkStartInFlight && !pkBattleActive) {
          cancelPkMatching(false);
          setPkSheetView('home');
          toast('Matching timed out — try again', 'warning');
        }
        return;
      }
      paint();
    }, 1000);
  }

  function setPkSheetView(view) {
    pkSheetView = view || 'home';
    const home = document.getElementById('apPkViewHome');
    const invite = document.getElementById('apPkViewInvite');
    const match = document.getElementById('apPkViewMatch');
    const panel = document.querySelector('#apPkTypesSheet .ap-pk-room-panel');
    if (home) home.hidden = pkSheetView !== 'home';
    if (invite) invite.hidden = pkSheetView !== 'invite';
    if (match) match.hidden = pkSheetView !== 'match';
    panel?.setAttribute('data-view', pkSheetView);
    document.getElementById('apPkTypesSheet')?.classList.toggle('is-matching', pkSheetView === 'match');
  }

  function setPkDurationMinutes(mins) {
    const m = Number(mins) === 15 || Number(mins) === 30 ? Number(mins) : 5;
    pkDurationSeconds = m * 60;
    document.querySelectorAll('#apPkTypesSheet [data-pk-mins]').forEach((btn) => {
      const on = Number(btn.getAttribute('data-pk-mins')) === m;
      btn.classList.toggle('is-selected', on);
    });
    const rnd = document.getElementById('apPkRandomDur');
    if (rnd) rnd.textContent = `${m}min`;
    const matchDur = document.getElementById('apPkMatchDurLabel');
    if (matchDur) matchDur.textContent = `${m}mins`;
  }

  function ensurePkTypesSheet() {
    const existing = document.getElementById('apPkTypesSheet');
    if (
      existing &&
      (!document.getElementById('apPkViewHome') ||
        !document.getElementById('apPkFriendPick') ||
        !document.querySelector('#apPkTypesSheet [data-pk-type]'))
    ) {
      existing.remove();
    }
    if (document.getElementById('apPkTypesSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="ap-pk-types-sheet ap-pk-room-sheet" id="apPkTypesSheet" aria-hidden="true">
        <div class="ap-pk-types-panel ap-pk-room-panel" role="dialog" aria-label="Room PK" data-view="home">
          <!-- Home: time + random / invite -->
          <div class="ap-pk-view ap-pk-view-home" id="apPkViewHome">
            <header class="ap-pk-room-head">
              <div class="ap-pk-room-title">
                <span class="ap-pk-logo" aria-hidden="true"><b>P</b><i>K</i></span>
                <h3>Room PK</h3>
              </div>
              <div class="ap-pk-room-head-actions">
                <button type="button" class="ap-pk-invitation-btn" id="apPkOpenInvite" aria-label="Invitation">
                  <span class="ap-pk-swords" aria-hidden="true">⚔</span>
                  Invitation
                </button>
                <button type="button" class="ap-pk-help-btn" id="apPkHelp" aria-label="Help">?</button>
              </div>
            </header>
            <div class="ap-pk-time-block">
              <span class="ap-pk-time-label">Time</span>
              <div class="ap-pk-time-options" role="group" aria-label="Battle duration">
                <button type="button" class="ap-pk-time-chip is-selected" data-pk-mins="5">5mins</button>
                <button type="button" class="ap-pk-time-chip" data-pk-mins="15">15mins</button>
                <button type="button" class="ap-pk-time-chip" data-pk-mins="30">30mins</button>
              </div>
            </div>
            <div class="ap-pk-type-cards" role="listbox" aria-label="PK mode">
              <button type="button" class="ap-pk-type-card" data-pk-type="friend" role="option">
                <span class="ap-pk-type-tag">1V1</span>
                <span class="ap-pk-type-art ap-pk-type-art--friend" aria-hidden="true"><i class="fas fa-user-friends"></i></span>
                <span class="ap-pk-type-name">Friend PK</span>
              </button>
              <button type="button" class="ap-pk-type-card is-selected" data-pk-type="random" role="option" aria-selected="true">
                <span class="ap-pk-type-tag">1V1</span>
                <span class="ap-pk-type-art ap-pk-type-art--random" aria-hidden="true"><i class="fas fa-random"></i></span>
                <span class="ap-pk-type-name">Random PK</span>
              </button>
              <button type="button" class="ap-pk-type-card" data-pk-type="team" role="option">
                <span class="ap-pk-type-tag">Team</span>
                <span class="ap-pk-type-new">New</span>
                <span class="ap-pk-type-art ap-pk-type-art--team" aria-hidden="true"><i class="fas fa-users"></i></span>
                <span class="ap-pk-type-name">Team PK</span>
              </button>
            </div>
            <div class="ap-pk-friend-pick" id="apPkFriendPick" hidden>
              <p class="ap-pk-friend-pick-title" id="apPkFriendPickTitle">Pick a friend</p>
              <div class="ap-pk-friend-list" id="apPkFriendList"></div>
              <p class="ap-pk-friend-empty" id="apPkFriendEmpty" hidden>Loading friends…</p>
            </div>
            <div class="ap-pk-room-cta" id="apPkRoomCta">
              <button type="button" class="ap-pk-random-btn" id="apPkRandomMatch">
                <span class="ap-pk-random-title">Random Match</span>
                <span class="ap-pk-random-sub" id="apPkRandomDur">5min</span>
              </button>
              <button type="button" class="ap-pk-invite-room-btn" id="apPkInviteRoom">Invite a room</button>
            </div>
            <button type="button" class="ap-pk-confirm-btn" id="apPkConfirmStart" hidden>Start PK</button>
          </div>

          <!-- Invite a room -->
          <div class="ap-pk-view ap-pk-view-invite" id="apPkViewInvite" hidden>
            <header class="ap-pk-invite-head">
              <button type="button" class="ap-pk-invite-back" id="apPkInviteBack" aria-label="Back">
                <i class="fas fa-chevron-left"></i>
              </button>
              <h3>Invite a room</h3>
              <span class="ap-pk-invite-head-spacer"></span>
            </header>
            <label class="ap-pk-room-search">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input type="search" id="apPkRoomSearch" placeholder="Search Room ID/User ID" autocomplete="off" enterkeyhint="search" />
            </label>
            <div class="ap-pk-room-invite-list" id="apPkRoomInviteList" role="list"></div>
            <p class="ap-pk-room-invite-empty" id="apPkRoomInviteEmpty" hidden>Loading rooms…</p>
          </div>

          <!-- Matching -->
          <div class="ap-pk-view ap-pk-view-match" id="apPkViewMatch" hidden>
            <header class="ap-pk-match-head">
              <div class="ap-pk-match-title">
                <span class="ap-pk-logo" aria-hidden="true"><b>P</b><i>K</i></span>
                <span>PK Matching..</span>
              </div>
              <span class="ap-pk-match-dur" id="apPkMatchDurLabel">5mins</span>
            </header>
            <div class="ap-pk-match-body">
              <div class="ap-pk-match-circle" aria-hidden="true">
                <svg viewBox="0 0 120 120" class="ap-pk-match-svg">
                  <defs>
                    <linearGradient id="apPkRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="#60a5fa"/>
                      <stop offset="100%" stop-color="#f472b6"/>
                    </linearGradient>
                  </defs>
                  <circle class="ap-pk-match-ring-bg" cx="60" cy="60" r="54" fill="none" stroke-width="8" />
                  <circle id="apPkMatchRingProgress" class="ap-pk-match-ring-fg" cx="60" cy="60" r="54" fill="none" stroke="url(#apPkRingGrad)" stroke-width="8"
                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                </svg>
                <span class="ap-pk-match-secs" id="apPkMatchCountdown">300s</span>
              </div>
              <p class="ap-pk-match-hint" id="apPkMatchLabel">Finding a host…</p>
              <button type="button" class="ap-pk-match-cancel" id="apPkMatchCancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>`
    );
    const sheet = document.getElementById('apPkTypesSheet');
    sheet?.addEventListener('click', (e) => {
      if (e.target === sheet && pkSheetView !== 'match') closePkTypesSheet();
    });
    sheet?.querySelector('.ap-pk-room-panel')?.addEventListener('click', (e) => e.stopPropagation());

    document.querySelectorAll('#apPkTypesSheet [data-pk-mins]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (pkStartInFlight) return;
        setPkDurationMinutes(btn.getAttribute('data-pk-mins'));
      });
    });

    document.querySelectorAll('#apPkTypesSheet [data-pk-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (pkStartInFlight) return;
        selectPkType(btn.getAttribute('data-pk-type') || 'random');
      });
    });

    document.getElementById('apPkRandomMatch')?.addEventListener('click', () => {
      if (pkStartInFlight) return;
      pkSelectedType = 'random';
      pkFriendPick = null;
      selectPkType('random');
      confirmStartPk();
    });

    document.getElementById('apPkConfirmStart')?.addEventListener('click', () => {
      if (pkStartInFlight) return;
      confirmStartPk();
    });

    const openInvite = () => {
      if (pkStartInFlight) return;
      setPkSheetView('invite');
      renderPkRoomInviteList('');
    };
    document.getElementById('apPkInviteRoom')?.addEventListener('click', openInvite);
    document.getElementById('apPkOpenInvite')?.addEventListener('click', openInvite);
    document.getElementById('apPkInviteBack')?.addEventListener('click', () => setPkSheetView('home'));
    document.getElementById('apPkHelp')?.addEventListener('click', () => {
      toast(
        'Friend / Random / Team PK + time. Invite another live room or match randomly. Both streams show the competition when they Accept.',
        'info'
      );
    });
    document.getElementById('apPkRoomSearch')?.addEventListener('input', (e) => {
      renderPkRoomInviteList(String(e.target?.value || ''));
    });
    document.getElementById('apPkMatchCancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelPkMatching(true);
      setPkSheetView('home');
    });
    setPkDurationMinutes(5);
    selectPkType('random');
  }

  function renderPkFriendPicker() {
    const wrap = document.getElementById('apPkFriendPick');
    const list = document.getElementById('apPkFriendList');
    const empty = document.getElementById('apPkFriendEmpty');
    const title = document.getElementById('apPkFriendPickTitle');
    if (!wrap || !list) return;
    const needPick = pkSelectedType === 'friend' || pkSelectedType === 'team';
    wrap.hidden = !needPick;
    if (!needPick) return;
    if (title) {
      title.textContent =
        pkSelectedType === 'team'
          ? 'Pick a rival (optional) — friends, followers & live hosts'
          : 'Pick someone — friends, followers, in-room, or live hosts';
    }
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Loading friends & followers…';
    }
    list.innerHTML = `<div class="ap-pk-friend-loading">Loading…</div>`;

    loadPkFriendCandidates({ force: true }).then((candidates) => {
      if (pkSelectedType !== 'friend' && pkSelectedType !== 'team') return;
      if (!candidates.length) {
        list.innerHTML = '';
        if (empty) {
          empty.hidden = false;
          empty.textContent =
            'No friends or followers found. Follow creators or Invite a room for live hosts.';
        }
        return;
      }
      if (empty) empty.hidden = true;
      list.innerHTML = candidates
        .map((c) => {
          const sel = pkFriendPick && String(pkFriendPick.userId) === String(c.userId);
          const badge = c.live
            ? 'LIVE'
            : c.inRoom
              ? 'Here'
              : c.following
                ? 'Friend'
                : c.follower
                  ? 'Follower'
                  : '';
          return `<button type="button" class="ap-pk-friend-chip${sel ? ' is-selected' : ''}${
            c.live ? ' is-live' : ''
          }" data-pk-uid="${escapeHtml(String(c.userId))}" data-pk-name="${escapeAttr(c.name)}" data-pk-pic="${escapeAttr(
            c.profilePic || ''
          )}" data-pk-channel="${escapeAttr(c.channel || '')}">
          <img src="${avatarUrl(c.name, c.profilePic)}" alt="">
          <span class="ap-pk-friend-chip-text">${escapeHtml(String(c.name).slice(0, 14))}</span>
          ${badge ? `<em class="ap-pk-friend-badge">${badge}</em>` : ''}
        </button>`;
        })
        .join('');
      list.querySelectorAll('.ap-pk-friend-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          pkFriendPick = {
            userId: btn.getAttribute('data-pk-uid'),
            name: btn.getAttribute('data-pk-name') || 'Friend',
            profilePic: btn.getAttribute('data-pk-pic') || null,
            channel: btn.getAttribute('data-pk-channel') || '',
          };
          list.querySelectorAll('.ap-pk-friend-chip').forEach((b) => {
            const on =
              pkFriendPick && String(pkFriendPick.userId) === String(b.getAttribute('data-pk-uid'));
            b.classList.toggle('is-selected', Boolean(on));
          });
        });
      });
      window.SocialUI?.bindAvatarFallbacks?.(list);
    });
  }

  function selectPkType(type) {
    const t = type === 'friend' || type === 'team' ? type : 'random';
    pkSelectedType = t;
    if (t === 'random') pkFriendPick = null;
    document.querySelectorAll('#apPkTypesSheet [data-pk-type]').forEach((btn) => {
      const on = btn.getAttribute('data-pk-type') === t;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderPkFriendPicker();
    const cta = document.getElementById('apPkRoomCta');
    const startBtn = document.getElementById('apPkConfirmStart');
    if (cta) cta.hidden = t !== 'random';
    if (startBtn) {
      if (t === 'random') {
        startBtn.hidden = true;
      } else {
        startBtn.hidden = false;
        startBtn.textContent =
          t === 'friend'
            ? pkFriendPick
              ? `Challenge ${String(pkFriendPick.name || 'friend').slice(0, 12)}`
              : 'Pick a friend then Start'
            : 'Start Team PK';
        startBtn.disabled = Boolean(pkStartInFlight);
      }
    }
  }

  function roomInviteDisplayName(r) {
    return (
      r.host_display_name ||
      r.hostName ||
      r.title ||
      r.roomName ||
      r.host_displayName ||
      'Live room'
    );
  }

  async function renderPkRoomInviteList(query) {
    const list = document.getElementById('apPkRoomInviteList');
    const empty = document.getElementById('apPkRoomInviteEmpty');
    if (!list) return;
    const q = String(query || '').trim().toLowerCase();
    list.innerHTML = `<div class="ap-pk-room-invite-loading">Loading…</div>`;
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Loading rooms…';
    }

    let rooms = pkRoomInviteCache;
    if (!rooms.length || !q) {
      try {
        rooms = await fetchPkLiveRoomCandidates();
        pkRoomInviteCache = rooms;
      } catch (_e) {
        rooms = [];
      }
    }

    const filtered = rooms.filter((r) => {
      if (!q) return true;
      const name = roomInviteDisplayName(r).toLowerCase();
      const ch = String(r.channel || '').toLowerCase();
      const uid = String(r.hostId || r.host_user_id || '').toLowerCase();
      const displayId = String(r.hostDisplayId || r.display_id || r.host_display_id || '').toLowerCase();
      return name.includes(q) || ch.includes(q) || uid.includes(q) || displayId.includes(q);
    });

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = q
          ? 'No rooms match that search'
          : 'No other live rooms right now — try Random Match';
      }
      return;
    }
    if (empty) empty.hidden = true;

    list.innerHTML = filtered
      .map((r) => {
        const uid = String(r.hostId || r.host_user_id || '');
        const name = roomInviteDisplayName(r);
        const pic = r.hostProfilePic || r.hostStreamCover || r.host_profile_pic || r.stream_cover_url || null;
        const viewers = Number(r.viewers || r.viewer_count || 0);
        const ch = String(r.channel || '');
        return `<div class="ap-pk-room-row" role="listitem">
          <img class="ap-pk-room-avatar" src="${avatarUrl(name, pic)}" alt="">
          <div class="ap-pk-room-meta">
            <span class="ap-pk-room-name">${escapeHtml(String(name).slice(0, 28))}</span>
            <span class="ap-pk-room-viewers"><i class="fas fa-user"></i> ${viewers}</span>
          </div>
          <button type="button" class="ap-pk-room-invite-cta" data-pk-uid="${escapeAttr(uid)}"
            data-pk-name="${escapeAttr(name)}" data-pk-pic="${escapeAttr(pic || '')}" data-pk-channel="${escapeAttr(ch)}">Invite</button>
        </div>`;
      })
      .join('');

    list.querySelectorAll('.ap-pk-room-invite-cta').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (pkStartInFlight) return;
        pkFriendPick = {
          userId: btn.getAttribute('data-pk-uid'),
          name: btn.getAttribute('data-pk-name') || 'Rival',
          profilePic: btn.getAttribute('data-pk-pic') || null,
          channel: btn.getAttribute('data-pk-channel') || '',
        };
        pkSelectedType = 'friend';
        confirmStartPk();
      });
    });
    window.SocialUI?.bindAvatarFallbacks?.(list);
  }

  function setPkMatching(on, label) {
    const matchLabel = document.getElementById('apPkMatchLabel');
    if (on) {
      if (pkSheetView !== 'match') {
        setPkSheetView('match');
        startPkMatchCountdown(pkDurationSeconds || 300);
      } else {
        setPkSheetView('match');
      }
      if (matchLabel && label) matchLabel.textContent = label;
    } else {
      stopPkMatchCountdown();
      if (pkSheetView === 'match') setPkSheetView('home');
      if (matchLabel && !label) matchLabel.textContent = 'Finding a host…';
    }
  }

  function closePkTypesSheet() {
    if (pkStartInFlight && !pkBattleActive) {
      cancelPkMatching(false);
    }
    pkStartInFlight = false;
    stopPkMatchCountdown();
    setPkMatching(false);
    setPkSheetView('home');
    const sheet = document.getElementById('apPkTypesSheet');
    if (!sheet) return;
    sheet.classList.remove('open', 'is-matching');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.style.display = 'none';
    sheet.style.pointerEvents = 'none';
    syncLiveOverlayClass();
  }

  function openPkTypesSheet() {
    if (!isHost() && !clientClaimsHost?.()) {
      toast('Only the host can start PK', 'warning');
      return;
    }
    if (isPkLiveNow()) {
      dismissPkSelectionUi();
      showPkOverlay(true);
      requestStopPk();
      return;
    }
    ensurePkTypesSheet();
    try {
      closeToolsSheetOnly?.();
    } catch (_e) {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    }
    const tools = document.getElementById('partyToolsSheet');
    if (tools) {
      tools.classList.remove('open');
      tools.style.display = 'none';
      tools.style.pointerEvents = 'none';
    }
    pkStartInFlight = false;
    pkRoomInviteCache = [];
    stopPkMatchCountdown();
    setPkMatching(false);
    setPkDurationMinutes(Math.round((pkDurationSeconds || 300) / 60));
    selectPkType(pkSelectedType || 'random');
    setPkSheetView('home');
    const sheet = document.getElementById('apPkTypesSheet');
    if (!sheet) return;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    sheet.style.display = 'flex';
    sheet.style.pointerEvents = 'auto';
    if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
    syncLiveOverlayClass();
  }

  function confirmStartPk() {
    if (pkStartInFlight) return;
    if (pkBattleActive) {
      dismissPkSelectionUi();
      return;
    }
    if (!liveSocket?.connected) {
      toast('Not connected to live server', 'error');
      return;
    }

    if (pkSelectedType === 'friend' && !pkFriendPick?.userId) {
      toast('Pick a room to invite', 'warning');
      setPkSheetView('invite');
      renderPkRoomInviteList('');
      return;
    }

    pkStartInFlight = true;
    const mode = pkSelectedType || 'random';
    const durationSeconds = pkDurationSeconds || 300;

    /* Random + Invite room: challenge and wait — battle only after they accept */
    if (mode === 'random' || mode === 'friend' || (mode === 'team' && pkFriendPick?.userId)) {
      const seq = ++pkMatchSeq;
      const run = async () => {
        let rival = null;
        if (mode === 'random') {
          pkMatchedRivalMeta = null;
          setPkMatching(true, 'Searching live streams…');
          setPkStatus('Searching…');
          const result = await searchRandomPkRival(seq);
          if (seq !== pkMatchSeq) return;
          if (result.cancelled) {
            pkStartInFlight = false;
            return;
          }
          if (!result.rival) {
            pkStartInFlight = false;
            setPkMatching(false);
            setPkStatus('');
            setPkSheetView('home');
            toast('No other live hosts online to challenge right now', 'warning');
            return;
          }
          rival = result.rival;
        } else {
          rival = {
            userId: pkFriendPick.userId,
            name: pkFriendPick.name || 'Rival',
            profilePic: pkFriendPick.profilePic || null,
            channel: pkFriendPick.channel || '',
          };
        }

        setPkMatching(true, `Waiting for ${rival.name}…`);
        setPkStatus(`Waiting for ${rival.name}`);
        const res = await sendPkChallenge({
          userId: rival.userId,
          name: rival.name,
          channel: rival.channel || '',
          mode: mode === 'team' ? 'friend' : mode,
          profilePic: rival.profilePic,
        });
        if (seq !== pkMatchSeq) return;
        if (!res?.ok) {
          pkStartInFlight = false;
          pkPendingChallengeId = null;
          setPkMatching(false);
          setPkStatus('');
          setPkSheetView(mode === 'friend' ? 'invite' : 'home');
          toast(res?.message || 'Could not send PK challenge', 'error');
          return;
        }
        setPkMatching(true, `Waiting for ${rival.name} to accept…`);
        toast(`Challenge sent to ${rival.name}`, 'info');
      };
      run();
      return;
    }

    /* Team alone (no rival): open sides for gift war */
    setPkMatching(true, 'Starting Team PK…');
    setPkStatus('Starting PK…');
    const payload = {
      channel: channelId(),
      durationSeconds,
      mode: 'team',
      format: '1v2',
      forceStart: true,
      hostName:
        roomState?.hostName ||
        document.getElementById('liveHostName')?.textContent ||
        displayName(currentUser()) ||
        'Host',
    };
    window.setTimeout(() => {
      if (!liveSocket?.connected) {
        pkStartInFlight = false;
        setPkMatching(false);
        toast('Not connected to live server', 'error');
        return;
      }
      emitPkStartAfterMatch('team', payload);
    }, 200);
  }

  function ensurePkMediaAlive(reason) {
    try {
      /* Never leave tracks muted/hidden after PK chrome mounts */
      (localTracks || []).forEach((t) => {
        try {
          if (t && typeof t.setEnabled === 'function') t.setEnabled(true);
        } catch (_e) {}
        try {
          if (t && typeof t.setMuted === 'function' && t.trackMediaType === 'audio' && !micMuted) {
            t.setMuted(false);
          }
        } catch (_e) {}
      });
    } catch (_e) {}

    try {
      if (isHost() || clientClaimsHost?.()) {
        paintPkSelfPreview(resolveHostPreviewTrack());
        ensureHostVideoVisible?.();
      }
    } catch (_e) {}

    try {
      document
        .querySelectorAll(
          '#apPkSelfMedia video, #apPkSelfMedia canvas, #liveLocalHost video, #liveLocalVideo, #liveLocalHost canvas'
        )
        .forEach((el) => {
          el.style.opacity = '1';
          el.style.visibility = 'visible';
          el.style.display = '';
          if (el.tagName === 'VIDEO') {
            el.muted = true;
            el.playsInline = true;
            const p = el.play?.();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        });
      document.querySelectorAll('#liveRemoteHost video').forEach((el) => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.style.display = '';
        const p = el.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      });
    } catch (_e) {}

    try {
      kickstartRemoteAudio?.(reason || 'pk-media');
    } catch (_e) {}
    try {
      setLiveStreamVisible?.(true);
    } catch (_e) {}
    try {
      if (isHost() || clientClaimsHost?.()) {
        resumeHostBroadcastIfNeeded?.();
      }
    } catch (_e) {}
  }

  function showPkChallengeSheet(payload) {
    ensurePkChallengeSheet();
    const sheet = document.getElementById('apPkChallengeSheet');
    if (!sheet || !payload?.challengeId) return;
    sheet.dataset.challengeId = String(payload.challengeId);
    sheet.dataset.fromName = payload.fromName || 'Host';
    sheet.dataset.mode = payload.mode || 'friend';
    const title = document.getElementById('apPkChallengeTitle');
    const body = document.getElementById('apPkChallengeBody');
    const mode =
      payload.mode === 'random' ? 'Random PK' : payload.mode === 'team' ? 'Team PK' : 'Friend PK';
    if (title) title.textContent = `${payload.fromName || 'Host'} challenges you`;
    if (body) body.textContent = `${mode} — Accept to start. Your voice & video stay live.`;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    sheet.style.display = 'flex';
  }

  function hidePkChallengeSheet() {
    const sheet = document.getElementById('apPkChallengeSheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.style.display = 'none';
  }

  function ensurePkChallengeSheet() {
    if (document.getElementById('apPkChallengeSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="ap-pk-challenge-sheet" id="apPkChallengeSheet" aria-hidden="true" style="display:none">
        <div class="ap-pk-challenge-panel" role="dialog" aria-label="PK challenge">
          <h3 id="apPkChallengeTitle">PK Challenge</h3>
          <p id="apPkChallengeBody">Someone challenged you to PK.</p>
          <div class="ap-pk-challenge-actions">
            <button type="button" class="ap-pk-challenge-decline" id="apPkChallengeDecline">Decline</button>
            <button type="button" class="ap-pk-challenge-accept" id="apPkChallengeAccept">Accept PK</button>
          </div>
        </div>
      </div>`
    );
    const respond = (accept) => {
      const sheet = document.getElementById('apPkChallengeSheet');
      const challengeId = sheet?.dataset?.challengeId;
      hidePkChallengeSheet();
      if (!challengeId || !liveSocket?.connected) return;
      liveSocket.emit(
        'pk:challenge:respond',
        {
          challengeId,
          accept: Boolean(accept),
          displayName: displayName(currentUser()),
          channel: channelId(),
          targetChannel: channelId(),
        },
        (res) => {
          if (!accept) {
            toast('PK declined', 'info');
            return;
          }
          if (res?.ok && res.battle) {
            beginPkBattle(res.battle);
            ensurePkMediaAlive('pk-accept');
            toast('PK started — mutual link on!', 'success');
          } else {
            toast(res?.message || 'Could not join PK', 'error');
          }
        }
      );
    };
    document.getElementById('apPkChallengeAccept')?.addEventListener('click', () => respond(true));
    document.getElementById('apPkChallengeDecline')?.addEventListener('click', () => respond(false));
  }

  function beginPkBattle(snapshot) {
    if (!snapshot) return;
    const battleId = snapshot?.battle?.id || snapshot?.id || null;
    /* Refresh only if same mutual battle already running (dedupe multi-emit) */
    if (pkBattleActive && battleId && pkActiveBattleId && String(battleId) === String(pkActiveBattleId)) {
      pkLastSnapshot = snapshot;
      if (Array.isArray(snapshot?.linkedChannels)) {
        pkLinkedChannels = snapshot.linkedChannels.map(String);
      }
      pkViewSwapped = resolvePkSideNames(snapshot).myTeam === 2;
      applyPkTeamsFromSnapshot(snapshot);
      syncPkStageUi(snapshot);
      updatePkBar();
      rememberPkEnders(snapshot);
      syncPkControlUi();
      const rivalCh = resolvePkRivalChannel(snapshot);
      pkRivalHostAgoraUid = resolveRivalHostAgoraUid(snapshot, rivalCh);
      if (rivalCh) startPkRivalAgora(rivalCh, snapshot).catch(() => {});
      return;
    }

    /* Critical: never leave PK Types / tools covering the live PK UI */
    dismissPkSelectionUi();
    hidePkChallengeSheet();
    ensurePkBattleChrome();
    ensurePkRivalMediaBox();
    ensurePkSelfMediaBox();
    pkBattleActive = true;
    pkEndRequested = false;
    pkStartInFlight = false;
    pkPendingChallengeId = null;
    pkActiveBattleId = battleId;
    pkModeActive = snapshot?.mode || pkSelectedType || 'random';
    pkLastSnapshot = snapshot;
    const sides = resolvePkSideNames(snapshot);
    pkViewSwapped = sides.myTeam === 2;
    if (Array.isArray(snapshot?.linkedChannels)) {
      pkLinkedChannels = snapshot.linkedChannels.map(String);
    } else {
      const pair = [snapshot?.challengerChannel, snapshot?.rivalChannel].filter(Boolean).map(String);
      if (pair.length) pkLinkedChannels = pair;
    }
    const otherCh = resolvePkRivalChannel(snapshot);
    const otherName = sides.labelR;
    const otherId =
      sides.myTeam === 2
        ? snapshot.challengerUserId
        : snapshot.rivalUserId || pkMatchedRivalMeta?.userId;
    pkMatchedRivalMeta = {
      ...(pkMatchedRivalMeta || {}),
      name: otherName,
      profilePic: snapshot.rivalProfilePic || pkMatchedRivalMeta?.profilePic || null,
      userId: otherId || pkMatchedRivalMeta?.userId || null,
      channel: otherCh || pkMatchedRivalMeta?.channel || null,
    };
    pkRivalHostAgoraUid = resolveRivalHostAgoraUid(snapshot, otherCh);
    rememberPkEnders(snapshot);
    setPkMatching(false);
    applyPkTeamsFromSnapshot(snapshot);
    pkTimerSec = pkSecsRemaining(snapshot);
    showPkOverlay(true);
    syncPkStageUi(snapshot);
    updatePkBar();
    syncPkControlUi();
    const timerEl = document.getElementById('apPkTimer');
    if (timerEl) timerEl.textContent = formatPkClock(pkTimerSec);
    setPkStatus(otherCh ? 'PK starting — linking streams…' : 'Get ready…');
    ensurePkMediaAlive('pk-start');
    window.setTimeout(() => ensurePkMediaAlive('pk-start-late'), 400);
    window.setTimeout(() => ensurePkMediaAlive('pk-start-retry'), 1200);

    /* Dual-host PK: both sides join the OTHER room as audience for A/V */
    if (otherCh) {
      if (pkMatchedRivalMeta) pkMatchedRivalMeta.channel = otherCh;
      startPkRivalAgora(otherCh, snapshot).catch((e) => console.warn('[pk] rival start', e));
      if (pkRivalWatchTimer) clearInterval(pkRivalWatchTimer);
      pkRivalWatchTimer = setInterval(() => {
        if (!pkBattleActive) {
          clearInterval(pkRivalWatchTimer);
          pkRivalWatchTimer = null;
          return;
        }
        const hasVid = Boolean(document.querySelector('#apPkRivalMedia video'));
        if (!pkRivalChannelJoined || !hasVid) {
          startPkRivalAgora(otherCh, pkLastSnapshot).catch(() => {});
        }
        const selfBox = document.getElementById('apPkSelfMedia');
        if (!selfBox?.querySelector('video, canvas')) {
          paintPkSelfPreview(resolveHostPreviewTrack());
        }
      }, 4000);
    }

    const localName = sides.labelL;
    const modeLabel =
      pkModeActive === 'friend' ? 'Friend PK' : pkModeActive === 'team' ? 'Team PK' : 'Random PK';
    postPkSystemChat([
      'PK is mutual — chats & gifts are shared on both sides!',
      `${localName} vs ${otherName} — ${modeLabel}`,
    ]);

    window.SocialFX?.pkCountdown?.(3, () => {
      setPkStatus(otherCh ? 'PK LIVE — streams linked' : 'PK LIVE — send gifts to score!');
      updatePkBar();
      ensurePkMediaAlive('pk-countdown-done');
      syncPkControlUi();
      if (otherCh) startPkRivalAgora(otherCh, pkLastSnapshot).catch(() => {});
    });
  }

  function endPkBattle(snapshot) {
    /* Dedupe multi-emit (ack + broadcast + both link rooms) */
    if (!pkBattleActive && !pkActiveBattleId) return;
    const snap = snapshot || pkLastSnapshot || {};
    const myTeam = pkMyTeamFromSnapshot(snap);
    const sides = resolvePkSideNames(snap);
    const teams = snap?.teams || [];
    const scoreOf = (n) => {
      const hit = teams.find((t) => Number(t.team) === n);
      if (hit) return Number(hit.team_score ?? hit.score ?? 0);
      return Number(teams[n - 1]?.team_score ?? teams[n - 1]?.score ?? 0);
    };
    let t1 = scoreOf(1);
    let t2 = scoreOf(2);
    if (!teams.length) {
      /* fall back to last bar orientation */
      if (myTeam === 2) {
        t2 = pkScoreLeft;
        t1 = pkScoreRight;
      } else {
        t1 = pkScoreLeft;
        t2 = pkScoreRight;
      }
    }
    let winnerTeam =
      snap?.winnerTeam != null
        ? Number(snap.winnerTeam)
        : snap?.battle?.winner_team != null
          ? Number(snap.battle.winner_team)
          : null;
    if (winnerTeam == null && !snap?.isDraw) {
      if (t1 === t2) winnerTeam = null;
      else winnerTeam = t1 > t2 ? 1 : 2;
    }
    const left = myTeam === 2 ? t2 : t1;
    const right = myTeam === 2 ? t1 : t2;
    const iWon = winnerTeam != null && Number(winnerTeam) === myTeam;
    const isDraw = Boolean(snap?.isDraw) && !snap?.forfeit && winnerTeam == null;
    const winnerName = snap?.winnerName || (winnerTeam === 1 ? sides.labelL : sides.labelR);
    const forfeitLoss = Boolean(snap?.forfeit) && !iWon;

    pkBattleActive = false;
    pkStartInFlight = false;
    pkEndRequested = false;
    pkMatchedRivalMeta = null;
    pkEnderIds = new Set();
    pkLinkedChannels = [];
    pkViewSwapped = false;
    pkActiveBattleId = null;
    pkRivalHostAgoraUid = null;
    pkLastSnapshot = null;
    if (pkRivalWatchTimer) {
      clearInterval(pkRivalWatchTimer);
      pkRivalWatchTimer = null;
    }
    document.body.classList.remove('ap-pk-can-end');
    document.documentElement.classList.remove('ap-pk-can-end');
    stopPkRivalAgora().catch(() => {});
    clearPkSelfMedia();
    dismissPkSelectionUi();
    pkScoreLeft = left;
    pkScoreRight = right;
    if (isDraw) {
      setPkStatus('Draw!');
      window.SocialFX?.pkWinner?.('draw', 'Draw');
      postPkSystemChat(`PK ended in a draw — ${left} : ${right}`);
    } else if (iWon) {
      setPkStatus(snap?.forfeit ? 'Rival left — you win!' : 'You win!');
      window.SocialFX?.pkWinner?.('winner', sides.labelL || roomState?.hostName || 'You');
      postPkSystemChat(
        snap?.forfeit
          ? `Rival left PK — you win! ${left} : ${right}`
          : `You win PK! Final ${left} : ${right}`
      );
    } else {
      setPkStatus(forfeitLoss ? 'You left — Defeat' : 'You lost');
      window.SocialFX?.pkWinner?.(
        'loser',
        winnerName || sides.labelR || 'Rival'
      );
      postPkSystemChat(
        forfeitLoss
          ? `You left PK — rival wins. Final ${left} : ${right}`
          : `You lost PK — final ${left} : ${right}`
      );
    }
    window.SocialFX?.pkScoreUpdate?.(left, right);
    syncPkControlUi();
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
  /** null = auto (front = mirror on); true/false = host override from tools */
  let hostMirrorOverride = null;
  /** Display state — ANS/AEC applied at mic create; in-room toggling doesn't rebuild tracks */
  /* Samsung/OEM 3A (AGC+ANS) ducks and delays uplink — default off, host can turn on */
  let noiseReductionUiOn = !/Android/i.test(String(typeof navigator !== 'undefined' ? navigator.userAgent : ''));
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
  let guestPublishQueued = false;
  let seatPromoteAt = 0;
  /** Keep on-stage guests visible across brief empty seat snapshots / socket races */
  const stickyStageGuests = new Map();
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
  // Canvas custom-track is heavy (full-frame blur @RAF). Prefer Agora native
  // beauty + CSS preview so live stays smooth. Canvas publish only on strong
  // devices or when localStorage ap_publish_canvas_beauty=1.
  const BEAUTY_PROCESS_MAX_W = 480;
  const BEAUTY_TARGET_FPS = 18;
  const BEAUTY_FRAME_MS = 1000 / BEAUTY_TARGET_FPS;

  /** Lighter encode on weak phones so faces actually publish instead of black/stuck video. */
  function isLowEndLiveDevice() {
    try {
      const cores = Number(navigator.hardwareConcurrency) || 4;
      const mem = Number(navigator.deviceMemory) || 4;
      const saveData = Boolean(navigator.connection?.saveData);
      return saveData || cores <= 4 || mem <= 2;
    } catch (_e) {
      return true;
    }
  }

  function getLiveCameraEncoderConfig() {
    return isLowEndLiveDevice() ? '360p_1' : '480p_1';
  }

  function shouldPublishCanvasBeauty() {
    try {
      const force = localStorage.getItem('ap_publish_canvas_beauty');
      if (force === '1') return true;
      if (force === '0') return false;
    } catch (_e) { }
    try {
      if (isLowEndLiveDevice()) return false;
      const cores = Number(navigator.hardwareConcurrency) || 4;
      const mem = Number(navigator.deviceMemory) || 4;
      return cores >= 8 && mem >= 6;
    } catch (_e) {
      return false;
    }
  }
  const PUBLISH_CANVAS_BEAUTY = shouldPublishCanvasBeauty();

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
      lip: null,
      wash: null,
      sparkle: 0,
      vignette: 0.12,
      beauty: { lighteningLevel: 0.45, smoothnessLevel: 0.55, rednessLevel: 0.1, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,220,180,0.14)', mode: 'soft-light' },
      sparkle: 0.35,
      vignette: 0.18,
      beauty: { lighteningLevel: 0.7, smoothnessLevel: 0.7, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
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
      lip: null,
      wash: null,
      sparkle: 0.15,
      vignette: 0.2,
      beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.9, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,180,200,0.1)', mode: 'overlay' },
      sparkle: 0.55,
      vignette: 0.22,
      beauty: { lighteningLevel: 0.65, smoothnessLevel: 0.65, rednessLevel: 0.15, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,150,180,0.16)', mode: 'soft-light' },
      sparkle: 0.25,
      vignette: 0.16,
      beauty: { lighteningLevel: 0.6, smoothnessLevel: 0.55, rednessLevel: 0.15, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,200,150,0.18)', mode: 'soft-light' },
      sparkle: 0.2,
      vignette: 0.14,
      beauty: { lighteningLevel: 0.62, smoothnessLevel: 0.58, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,190,80,0.2)', mode: 'soft-light' },
      sparkle: 0.4,
      vignette: 0.25,
      beauty: { lighteningLevel: 0.68, smoothnessLevel: 0.5, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
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
      lip: null,
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
      lip: null,
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
      lip: null,
      wash: { color: 'rgba(80,220,255,0.14)', mode: 'screen' },
      sparkle: 0.7,
      vignette: 0.3,
      beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.5, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(120,60,180,0.14)', mode: 'soft-light' },
      sparkle: 0.3,
      vignette: 0.32,
      beauty: { lighteningLevel: 0.5, smoothnessLevel: 0.55, rednessLevel: 0.12, lighteningContrastLevel: 1 },
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
      lip: null,
      wash: { color: 'rgba(255,230,240,0.12)', mode: 'soft-light' },
      sparkle: 0.45,
      vignette: 0.2,
      beauty: { lighteningLevel: 0.7, smoothnessLevel: 0.88, rednessLevel: 0.1, lighteningContrastLevel: 0 },
    },
  };

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (document.hidden) return;
      if (liveSocket?.connected && channelId()) {
        liveSocket.emit('live:heartbeat', { channel: channelId() });
      }
    }, 35000);
    if (window.__apStateRefreshTimer) clearInterval(window.__apStateRefreshTimer);
    if (isPartyRoomPage()) {
      window.__apStateRefreshTimer = setInterval(() => {
        if (document.hidden) return;
        if (roomJoinCompleted && liveSocket?.connected) requestFreshRoomState();
      }, 90000);
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
      /* Hosts also need guest voice after background stop — do not skip remote restore */
      await unlockBrowserAudio();
      await resubscribeAllRemoteMedia({ force: false }).catch(() => { });
      await ensureRemoteAudioPlaying().catch(() => { });
      kickstartRemoteAudio('host-foreground-resume');
      syncLiveUiState();
      hideApLoader();
      return;
    }
    if (lastJoinMeta?.isHost) {
      await resumeHostBroadcastIfNeeded();
      await unlockBrowserAudio();
      await resubscribeAllRemoteMedia({ force: false }).catch(() => { });
      await ensureRemoteAudioPlaying().catch(() => { });
      kickstartRemoteAudio('host-foreground-rejoin');
      return;
    }
    if (!agoraClient || !liveDebugState.agoraJoined) {
      try {
        const page = document.body.dataset.livePage;
        await startAgora(page === 'party-room' ? 'party' : 'live');
      } catch (_e) { }
      return;
    }
    await resubscribeAllRemoteMedia({ force: false });
    await unlockBrowserAudio();
    await ensureRemoteAudioPlaying().catch(() => { });
    kickstartRemoteAudio('foreground-resume');
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
      await ensureHostVideoPublishing().catch((e) =>
        liveDebugLog(`ensureHostVideo: ${e?.message || e}`)
      );
      return;
    }
    const page = document.body.dataset.livePage;
    const mode = page === 'party-room' ? 'party' : 'live';
    try {
      await startAgora(mode);
    } catch (e) {
      console.error('[live] resumeHostBroadcast failed', e);
      syncLiveUiState();
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

  function sameLiveUserId(a, b) {
    if (a == null || b == null || a === '' || b === '') return false;
    return String(a) === String(b);
  }

  function currentUserIds() {
    const me = currentUser();
    if (!me) return { id: '', displayId: '' };
    return {
      id: me.id != null ? String(me.id) : '',
      displayId:
        me.display_id != null
          ? String(me.display_id)
          : me.displayId != null
            ? String(me.displayId)
            : '',
    };
  }

  function isHost() {
    const { id: meId, displayId: meDisplay } = currentUserIds();
    if (roomState?.hostId && meId && sameLiveUserId(roomState.hostId, meId)) return true;
    if (roomState?.hostDisplayId && meDisplay && sameLiveUserId(roomState.hostDisplayId, meDisplay)) {
      return true;
    }
    /* Until room state has hostId, keep starter-host UI so controls don't vanish */
    if (!roomState?.hostId) {
      return clientClaimsHost();
    }
    return false;
  }

  /** Host-only power: grant room/live admin */
  function canGrantRoomAdmin() {
    return isHost() || isConfirmedRoomHost();
  }

  /** Room/live admin only — not platform account admin */
  function isRoomAdminMember(m) {
    if (!m) return false;
    if (String(m.role || '') === 'admin') return true;
    if (m.isAdmin && !m.isPlatformAdmin && String(m.role || '') !== 'host') return true;
    return false;
  }

  /** Host controls / host-only chrome — never trust URL ?host=1 alone */
  function isConfirmedRoomHost() {
    const { id: meId, displayId: meDisplay } = currentUserIds();
    if (!roomJoinCompleted) return false;
    if (roomState?.hostId && meId && sameLiveUserId(roomState.hostId, meId)) return true;
    if (roomState?.hostDisplayId && meDisplay && sameLiveUserId(roomState.hostDisplayId, meDisplay)) {
      return true;
    }
    return false;
  }

  function isLiveRoomPage() {
    return document.body.dataset.livePage === 'live-room';
  }

  function isPartyRoomPage() {
    return document.body.dataset.livePage === 'party-room';
  }

  /** Official Android/iOS shell — FLAG_SECURE only works here */
  function isNativeApApp() {
    try {
      if (window.__AP_NATIVE_APP__ === true) return true;
      if (window.ReactNativeWebView) return true;
      if (window.Capacitor?.isNativePlatform?.()) return true;
      if (document.documentElement.classList.contains('ap-expo-app')) return true;
      /* App WebView often sets app=1 before the bridge flag injects */
      if (new URLSearchParams(location.search).get('app') === '1' && /; wv\)|Expo|APServices/i.test(navigator.userAgent || '')) {
        return true;
      }
    } catch (_e) { }
    return false;
  }

  const PLAY_STORE_LIVE_URL =
    'https://play.google.com/store/apps/details?id=com.apservices.app';

  /**
   * Creator safety: browsers can always screenshot. Force audience to the app
   * where Android FLAG_SECURE blacks out screenshots & screen recording.
   */
  function showLiveAppOnlySafetyGate() {
    if (document.getElementById('apLiveAppOnlyGate')) return;
    hideApLoader?.();
    const gate = document.createElement('div');
    gate.id = 'apLiveAppOnlyGate';
    gate.className = 'ap-live-app-only-gate';
    gate.innerHTML = `
      <div class="ap-live-app-only-card">
        <i class="fas fa-shield-alt" aria-hidden="true"></i>
        <h1>Watch in the AP Services app</h1>
        <p>For creator safety, live video cannot play in a browser. Screenshots and screen recording are blocked only inside the official app.</p>
        <a class="ap-live-app-only-btn" href="${PLAY_STORE_LIVE_URL}" rel="noopener" target="_blank">Open Play Store</a>
        <button type="button" class="ap-live-app-only-back" id="apLiveAppOnlyBack">Go back</button>
      </div>`;
    document.body.appendChild(gate);
    document.getElementById('apLiveAppOnlyBack')?.addEventListener('click', () => {
      location.href = '/explore.html?app=1';
    });
    /* Do NOT remove video/canvas nodes — false gate flashes wipe faces while audio keeps playing */
  }

  function enforceLiveViewerAppOnly() {
    if (isNativeApApp()) return true;
    /* Only real confirmed hosts may use browser (to go live). URL ?host=1 alone is not enough. */
    if (isConfirmedRoomHost()) return true;
    showLiveAppOnlySafetyGate();
    return false;
  }

  function clearMicRequestState() {
    micLinkPending = false;
    if (micRequestWatchdog) {
      clearTimeout(micRequestWatchdog);
      micRequestWatchdog = null;
    }
    hideMicLinkModal();
    syncMicButtonUi();
    syncLiveOverlayClass();
  }

  function startMicRequestWatchdog() {
    if (micRequestWatchdog) clearTimeout(micRequestWatchdog);
    micRequestWatchdog = setTimeout(() => {
      micRequestWatchdog = null;
      if (hasSpeakerSeat || isHost()) return;
      if (!micLinkPending) return;
      micLinkPending = false;
      hideMicLinkModal();
      syncMicButtonUi();
      syncLiveOverlayClass();
      toast('Host did not respond — tap the mic button to try again', 'warning');
    }, 180000);
  }

  function syncJoinRequestsFromState() {
    if (!canModerateRoom()) {
      hideMicRequestActionBar();
      return;
    }
    const seated = new Set(
      (roomState?.seats || [])
        .filter((s) => s && !s.isHost && s.userId)
        .map((s) => String(s.userId))
    );
    const fromServer = (roomState?.seatRequests || []).map((r) => ({
      id: String(r.userId || r.id),
      userId: String(r.userId || r.id),
      name: r.name || 'Guest',
      profilePic: r.profilePic || r.profile_pic || null,
    }));
    const merged = new Map();
    joinRequests.forEach((r) => {
      const id = String(r.id || r.userId);
      if (id && !seated.has(id)) merged.set(id, { ...r, id, userId: id });
    });
    fromServer.forEach((r) => {
      if (r.id && !seated.has(r.id)) merged.set(r.id, r);
    });
    const next = [...merged.values()];
    const changed =
      next.length !== joinRequests.length ||
      next.some((r, i) => String(r.id) !== String(joinRequests[i]?.id));
    joinRequests = next;
    if (changed) renderJoinRequests();
    /* Always re-surface pending requests into chat + action bar (fixes missed socket events) */
    joinRequests.forEach((r) => pushMicInviteToChat(r, { quiet: true }));
    renderMicRequestActionBar();
  }

  function emitSeatResponse(payload, onDone) {
    if (!liveSocket?.connected) {
      onDone?.({ ok: false, message: 'Not connected' });
      return;
    }
    const ch = String(payload?.channel || channelId() || '').trim();
    if (!ch) {
      onDone?.({ ok: false, message: 'Room channel not ready — try again' });
      return;
    }
    if (!payload?.channel) payload = { ...payload, channel: ch };
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      onDone?.(res);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, message: 'Accept timed out — try again' });
    }, 10000);
    liveSocket.emit('live:seat_response', payload, (res) => finish(res || { ok: false }));
  }

  function canModerateRoom() {
    if (isHost() || clientClaimsHost()) return true;
    const meId = currentUser()?.id;
    if (!meId) return false;
    const memberUid = (m) =>
      String(
        m?.userId ??
        m?.user_id ??
        m?.id ??
        m?.uid ??
        ''
      );
    const members = [
      ...(Array.isArray(roomState?.onlineMembers) ? roomState.onlineMembers : []),
      ...(Array.isArray(roomState?.seats) ? roomState.seats : []),
    ];
    if (
      members.some(
        (m) =>
          memberUid(m) === String(meId) &&
          (m.isAdmin || m.role === 'admin' || m.isPlatformAdmin)
      )
    ) {
      return true;
    }
    /* Platform account admins can always moderate live rooms */
    const role = String(currentUser()?.role || '').toLowerCase();
    return ['admin', 'super_admin', 'founder', 'ceo'].includes(role);
  }

  function isRoomHostUserId(userId) {
    if (!userId) return false;
    const hid = roomState?.hostId;
    if (!hid) return false;
    if (typeof sameLiveUserId === 'function') return sameLiveUserId(hid, userId);
    return String(hid) === String(userId);
  }

  function getPartyMembersForList() {
    return getPartyRoomMembers()
      .filter((m) => m?.userId)
      .filter((m) => !window.SocialInteractions?.isBlocked?.(m.userId));
  }

  function isLiveUserBlocked(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    return Boolean(window.SocialInteractions?.isBlocked?.(uid));
  }

  /** Remove blocked people from seats / members / sticky so live:state cannot bring them back. */
  function stripBlockedUsersFromRoomState(state) {
    if (!state) return state;
    const blocked = (uid) => isLiveUserBlocked(uid);
    if (Array.isArray(state.seats)) {
      state.seats = state.seats.filter((s) => {
        const uid = String(s?.userId || '');
        if (!uid || !blocked(uid)) return true;
        forgetStickyStageGuest(uid);
        return false;
      });
    }
    if (Array.isArray(state.onlineMembers)) {
      state.onlineMembers = state.onlineMembers.filter(
        (m) => !blocked(String(m?.userId || m?.id || ''))
      );
    }
    if (Array.isArray(state.messages)) {
      state.messages = state.messages.filter(
        (m) => !blocked(String(m?.userId || m?.fromUserId || m?.senderId || ''))
      );
    }
    try {
      for (const uid of [...stickyStageGuests.keys()]) {
        if (blocked(uid)) stickyStageGuests.delete(uid);
      }
    } catch (_e) { /* ignore */ }
    return state;
  }

  function purgeAllBlockedFromLiveUi() {
    const ids = window.SocialInteractions?.getBlockedIds?.() || [];
    ids.forEach((id) => purgeBlockedUserFromLive(id));
    if (roomState) {
      stripBlockedUsersFromRoomState(roomState);
      try {
        if (typeof renderRoomState === 'function') renderRoomState();
      } catch (_e) { /* ignore */ }
    }
  }

  function purgeBlockedUserFromLive(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return;
    chatMessages = (chatMessages || []).filter((m) => String(m.userId || '') !== uid);
    forgetStickyStageGuest(uid);
    if (Array.isArray(roomState?.onlineMembers)) {
      roomState.onlineMembers = roomState.onlineMembers.filter((m) => String(m.userId || m.id || '') !== uid);
    }
    if (Array.isArray(roomState?.seats)) {
      roomState.seats = roomState.seats.filter((s) => String(s.userId || '') !== uid);
    }
    try {
      /* Stop their remote AV so you don't hear/see them after block */
      const map = window.__apAgoraUidMap || {};
      const agoraUid = Object.keys(map).find((k) => String(map[k]) === uid);
      if (agoraUid != null && agoraClient) {
        const remote = (agoraClient.remoteUsers || []).find((u) => String(u.uid) === String(agoraUid));
        try {
          remote?.audioTrack?.stop?.();
        } catch (_e) { }
        try {
          remote?.videoTrack?.stop?.();
        } catch (_e2) { }
      }
      document.querySelectorAll(`[data-guest-wrap="${CSS.escape(uid)}"], .party-seat[data-user-id="${CSS.escape(uid)}"]`).forEach((el) => {
        el.remove();
      });
      renderChatFeed();
      renderAvailableUsers();
      renderPartyAudienceBar();
      if (typeof renderRoomState === 'function') renderRoomState();
    } catch (_e) { /* ignore */ }
  }

  function roomAdminLabel() {
    return isLiveRoomPage() ? 'Live admin' : 'Room admin';
  }

  function memberListRoleLabel(m) {
    const hostId = String(roomState?.hostId || '');
    const uid = String(m.userId || '');
    if (hostId && uid === hostId) return 'Host';
    const seated = new Set(
      (roomState?.seats || []).map((s) => String(s.userId || '')).filter(Boolean)
    );
    if (stickyStageGuests.has(uid)) seated.add(uid);
    const isAdmin = isRoomAdminMember(m);
    const adminLabel = roomAdminLabel();
    const onStage =
      seated.has(uid) ||
      m.role === 'speaker' ||
      (m.seatIndex != null && m.role !== 'viewer');
    if (onStage) {
      const stage = isLiveRoomPage() ? 'On mic' : 'On seat';
      return isAdmin ? `${adminLabel} · ${stage}` : stage;
    }
    if (isAdmin) return adminLabel;
    return 'In room';
  }

  function memberIsOnStage(mOrId) {
    const uid =
      typeof mOrId === 'object' && mOrId
        ? String(mOrId.userId || mOrId.id || '')
        : String(mOrId || '');
    if (!uid) return false;
    if (isRoomHostUserId(uid)) return true;
    if (stickyStageGuests.has(uid)) return true;
    if ((roomState?.seats || []).some((s) => String(s.userId || '') === uid)) return true;
    if (typeof mOrId === 'object' && mOrId) {
      if (mOrId.seatIndex != null || mOrId.seat_index != null) return true;
      if (mOrId.role === 'speaker') return true;
    }
    try {
      if (document.querySelector(`.ap-guest-seat[data-guest-id="${CSS.escape(uid)}"]`)) return true;
      if (document.querySelector(`.party-seat[data-user-id="${CSS.escape(uid)}"]:not(.is-empty)`)) return true;
    } catch (_e) { /* ignore */ }
    return false;
  }

  function clearLocalSeatState(userId) {
    const uid = String(userId || '');
    if (!uid || !roomState) return;
    forgetStickyStageGuest(uid);
    if (Array.isArray(roomState.seats)) {
      roomState.seats = roomState.seats.filter((s) => String(s?.userId) !== uid);
    }
    if (Array.isArray(roomState.onlineMembers)) {
      roomState.onlineMembers = roomState.onlineMembers.map((m) => {
        if (String(m?.userId) !== uid) return m;
        const keepAdmin = Boolean(m.isAdmin || m.role === 'admin');
        return {
          ...m,
          role: keepAdmin ? 'admin' : 'viewer',
          isAdmin: keepAdmin,
          seatIndex: null,
          seat_index: null,
        };
      });
    }
  }

  function demoteUserFromSeat(userId) {
    if (!liveSocket?.connected || !userId) return;
    const meId = String(currentUser()?.id || '');
    const targetId = String(userId);
    const selfLeave = meId && targetId === meId;
    if (!selfLeave && !canModerateRoom()) return;
    if (isRoomHostUserId(userId)) {
      toast('Cannot remove the room host', 'warning');
      return;
    }
    const memberHit =
      (roomState?.seats || []).find((s) => String(s.userId) === String(userId)) ||
      (roomState?.onlineMembers || []).find((m) => String(m.userId) === String(userId));
    const stayAdmin = isRoomAdminMember(memberHit);
    liveSocket.emit('live:demote_speaker', { channel: channelId(), userId }, (res) => {
      if (res?.ok) {
        clearLocalSeatState(userId);
        if (selfLeave) {
          hasSpeakerSeat = false;
          forgetStickyStageGuest(targetId);
        }
        renderRoomState();
        syncHostBarUi();
        toast(
          selfLeave
            ? stayAdmin
              ? `Left the seat — you are still a ${roomAdminLabel().toLowerCase()}`
              : 'Left the seat'
            : stayAdmin
              ? `Removed from the seat — still ${roomAdminLabel().toLowerCase()}`
              : 'Removed from the seat',
          'success'
        );
      } else {
        toast(res?.message || (selfLeave ? 'Could not leave the seat' : 'Could not remove from seat'), 'error');
      }
    });
  }

  function leaveOwnSeat() {
    const meId = currentUser()?.id;
    if (!meId || isHost()) return;
    if (!memberIsOnStage(meId) && !hasSpeakerSeat) {
      toast('You are not on a seat', 'info');
      return;
    }
    demoteUserFromSeat(meId);
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
    /* Phase 1: demote = unpublish + audience token renew. Stay joined — no leave/rejoin. */
    publishSucceeded = false;
    guestPublishAttempted = false;
    hasSpeakerSeat = false;
    syncLiveMediaPublisherMode();
    const tracks = [...localTracks];
    localTracks = [];
    if (tracks.length) {
      try {
        await lifeUnpublish(tracks);
      } catch (_e) { }
      for (const t of tracks) {
        try {
          t.stop?.();
          t.close?.();
        } catch (_e2) { }
      }
    }
    updateLiveDebug({ hostPublishing: false, publishSucceeded: false });
    syncMicButtonUi();
    boostRemoteAudioVolumes();
    if (rejoinAsAudience && agoraClient && liveDebugState.agoraJoined && channelId()) {
      try {
        await refreshAgoraTokenAndRenew();
        liveDebugLog('demote: stayed joined — renewed audience token');
      } catch (e) {
        liveDebugLog(`Audience token renew after demote failed: ${e?.message || e}`);
      }
    }
    /* Phase 2A: leave communication/recording mode → audience playback */
    notifyLiveAudioRoute('exitTalk', { reason: 'demote_or_leave_seat' });
  }

  function pickKickDurationHours() {
    return new Promise((resolve) => {
      document.getElementById('apKickDurationSheet')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'apKickDurationSheet';
      sheet.className = 'ap-kick-duration-sheet open';
      sheet.innerHTML = `
        <div class="ap-kick-duration-panel" role="dialog" aria-label="Kick duration">
          <h3>Kick out from live</h3>
          <p>They cannot rejoin until the block expires.</p>
          <button type="button" class="ap-kick-opt" data-h="2"><i class="fas fa-ban"></i><span>Kick out · 2 hours</span></button>
          <button type="button" class="ap-kick-opt" data-h="24"><i class="fas fa-ban"></i><span>Kick out · 24 hours</span></button>
          <button type="button" class="ap-kick-cancel" data-cancel="1">Cancel</button>
        </div>`;
      document.body.appendChild(sheet);
      const done = (hours) => {
        sheet.remove();
        resolve(hours);
      };
      sheet.querySelectorAll('[data-h]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          done(Number(btn.dataset.h));
        });
      });
      sheet.querySelector('[data-cancel]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      });
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet) done(null);
      });
    });
  }

  function formatBanDurationLabel(hours) {
    if (hours === 0 || hours == null) return 'permanently';
    if (hours === 2) return 'for 2 hours';
    if (hours === 6) return 'for 6 hours';
    if (hours === 24) return 'for 24 hours';
    if (hours === 168) return 'for 7 days';
    return `for ${hours} hours`;
  }

  function formatBanBlockMessage(payload) {
    if (payload?.message) return String(payload.message);
    if (payload?.permanent || (!payload?.expiresAt && payload?.remainingHours == null)) {
      return 'You are blocked from this live permanently and cannot rejoin.';
    }
    const hours = Number(payload?.remainingHours);
    if (Number.isFinite(hours) && hours > 0) {
      const until = payload?.expiresAt ? ` (until ${new Date(payload.expiresAt).toLocaleString()})` : '';
      return `You can't enter this live for ${hours} more hour${hours === 1 ? '' : 's'}${until}.`;
    }
    if (payload?.expiresAt) {
      const end = new Date(payload.expiresAt);
      const remain = Math.max(1, Math.ceil((end.getTime() - Date.now()) / 3600000));
      return `You can't enter this live for ${remain} more hour${remain === 1 ? '' : 's'} (until ${end.toLocaleString()}).`;
    }
    return 'You are blocked from this live and cannot rejoin right now.';
  }

  function notifyBlockedFromRoom(payload) {
    const msg = formatBanBlockMessage(payload);
    toast(msg, 'error');
    try {
      window.alert(msg);
    } catch (_e) { }
  }

  function isPlatformAdminSelf() {
    const role = String(currentUser()?.role || '').toLowerCase();
    if (['admin', 'super_admin', 'founder', 'ceo'].includes(role)) return true;
    const meId = String(currentUser()?.id || '');
    if (!meId) return false;
    /* Fallback: room snapshot flags platform admins even if local user.role is stale */
    return (
      (roomState?.onlineMembers || []).some(
        (m) => String(m.userId || '') === meId && m.isPlatformAdmin
      ) ||
      (roomState?.seats || []).some(
        (s) => String(s.userId || '') === meId && s.isPlatformAdmin
      )
    );
  }

  async function kickUserFromRoom(userId, reason, durationHours) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    if (isRoomHostUserId(userId) && !isPlatformAdminSelf()) {
      toast('Cannot remove the room host', 'warning');
      return;
    }
    if (isRoomHostUserId(userId) && isPlatformAdminSelf()) {
      const hours =
        durationHours === 0 || durationHours == null
          ? 0
          : Number(durationHours) || 0;
      const label =
        hours >= 2
          ? `Kick the host for ${hours} hours and end this live?\n\nThey cannot go live again until the block expires.`
          : 'Kick the host and end this live?\n\nAll viewers will be disconnected. This does not ban the host account.';
      if (!window.confirm(label)) {
        return;
      }
      liveSocket.emit(
        'live:kick',
        {
          channel: channelId(),
          userId,
          reason: reason || 'admin_kicked_host',
          durationHours: hours > 0 ? hours : 0,
        },
        (res) => {
          if (res?.ok) {
            toast(
              hours >= 2
                ? `Host removed — blocked from going live for ${hours} hours`
                : 'Host removed — live ended',
              'success'
            );
          } else toast(res?.message || 'Could not remove host', 'error');
        }
      );
      return;
    }
    let hours = durationHours;
    if (hours === undefined) {
      hours = await pickKickDurationHours();
      if (hours == null) return;
    }
    const payload = {
      channel: channelId(),
      userId,
      reason: reason || 'kicked_by_mod',
      durationHours: hours,
    };
    liveSocket.emit('live:kick', payload, (res) => {
      if (res?.ok) {
        toast(`User kicked out ${formatBanDurationLabel(hours)}`, 'success');
      } else {
        toast(res?.message || 'Could not remove user', 'error');
      }
    });
  }

  /** Live “Kick out” = timed ban (cannot rejoin). Party “Remove from seat” stays demote. */
  async function removeUserFromLiveOrSeat(userId, displayName, durationHours) {
    if (!canModerateRoom() || !userId) return;
    if (isRoomHostUserId(userId)) {
      if (isPlatformAdminSelf()) {
        await kickUserFromRoom(userId, 'admin_kicked_host', 0);
        return;
      }
      toast('Cannot remove the room host', 'warning');
      return;
    }
    if (isLiveRoomPage()) {
      let hours = durationHours;
      if (hours === undefined) {
        hours = await pickKickDurationHours();
        if (hours == null) return;
      }
      const label = displayName || 'this user';
      if (
        !window.confirm(
          `Kick ${label} out of this live ${formatBanDurationLabel(hours)}?\n\nThey will see how long they cannot rejoin.`
        )
      ) {
        return;
      }
      await kickUserFromRoom(userId, 'removed_from_live', hours);
      return;
    }
    demoteUserFromSeat(userId);
  }

  function muteRemoteUser(userId, muted) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    liveSocket.emit('live:mute', { channel: channelId(), userId, muted: muted !== false });
    toast(muted !== false ? 'User muted' : 'User unmuted', 'info');
  }

  function muteUserChat(userId, muted) {
    if (!canModerateRoom() || !liveSocket?.connected || !userId) return;
    if (isRoomHostUserId(userId)) {
      toast('Cannot mute the host from chat', 'warning');
      return;
    }
    liveSocket.emit(
      'live:chat_mute',
      { channel: channelId(), userId, muted: muted !== false },
      (res) => {
        if (res?.ok === false) toast(res?.message || 'Could not update chat mute', 'error');
        else toast(muted !== false ? 'User muted from chat' : 'Chat unmute restored', 'success');
      }
    );
  }

  function deleteChatMessage(messageId) {
    if (!canModerateRoom() || !liveSocket?.connected || !messageId) return;
    if (String(messageId).startsWith('local-')) {
      chatMessages = chatMessages.filter((m) => String(m.id) !== String(messageId));
      renderChatFeed();
      return;
    }
    liveSocket.emit(
      'live:chat_delete',
      { channel: channelId(), messageId },
      (res) => {
        if (res?.ok === false) {
          toast(res?.message || 'Could not remove message', 'error');
          return;
        }
        chatMessages = chatMessages.filter((m) => String(m.id) !== String(messageId));
        renderChatFeed();
        toast('Message removed', 'success');
      }
    );
  }

  function isLocallyChatMuted() {
    const me = currentUser()?.id;
    if (!me) return false;
    if (canModerateRoom()) return false;
    if (roomState?.chatLocked) return true;
    const member = (roomState?.onlineMembers || []).find((m) => String(m.userId) === String(me));
    return Boolean(member?.chatMuted);
  }

  function syncChatMuteUi() {
    const muted = isLocallyChatMuted();
    const locked = Boolean(roomState?.chatLocked);
    const input = document.getElementById('liveChatInput');
    const send = document.getElementById('liveChatSend');
    let placeholder = 'Say something…';
    if (muted && locked) placeholder = 'Host muted all chat…';
    else if (muted) placeholder = 'Chat muted by host…';
    if (input) {
      if (!input.dataset.apPlaceholder) input.dataset.apPlaceholder = input.placeholder || 'Say something…';
      input.disabled = muted;
      input.placeholder = muted ? placeholder : input.dataset.apPlaceholder;
    }
    if (send) send.disabled = muted;
    document.body.classList.toggle('ap-chat-muted', muted);
    document.body.classList.toggle('ap-chat-locked', locked);
    const muteAllBtn = document.getElementById('liveBtnMuteAllChat') || document.getElementById('partyBtnMuteAllChat');
    if (muteAllBtn) {
      muteAllBtn.classList.toggle('is-active', locked);
      muteAllBtn.innerHTML = locked
        ? '<i class="fas fa-comments"></i> Unmute all chat'
        : '<i class="fas fa-comment-slash"></i> Mute all chat';
    }
    const toolsMute = document.getElementById('partyToolsMuteAllChat');
    if (toolsMute) {
      toolsMute.classList.toggle('is-active', locked);
      const label = toolsMute.querySelector('span:last-child') || toolsMute;
      if (toolsMute.querySelector('.ico')) {
        toolsMute.innerHTML = locked
          ? '<span class="ico"><i class="fas fa-comments"></i></span>Unmute chat'
          : '<span class="ico"><i class="fas fa-comment-slash"></i></span>Mute all chat';
      } else if (label) {
        label.textContent = locked ? 'Unmute chat' : 'Mute all chat';
      }
    }
    if (document.getElementById('partyJoinedModBar')) syncJoinedModToolbar();
  }

  function setRoomChatLocked(locked) {
    if (!canModerateRoom() || !liveSocket?.connected) return;
    liveSocket.emit(
      'live:chat_lock',
      { channel: channelId(), locked: locked !== false },
      (res) => {
        if (res?.ok === false) toast(res?.message || 'Could not update chat', 'error');
        else {
          if (roomState) roomState.chatLocked = locked !== false;
          syncChatMuteUi();
          toast(locked !== false ? 'All chat muted' : 'Chat unmuted for room', 'success');
        }
      }
    );
  }

  function clearLiveChat() {
    if (!canModerateRoom() || !liveSocket?.connected) return;
    if (
      !window.confirm(
        'Clear the whole chat feed for everyone?\n\nThis removes messages, gift notices, join/leave updates, and seat notices.'
      )
    ) {
      return;
    }
    liveSocket.emit('live:chat_clear', { channel: channelId() }, (res) => {
      if (res?.ok === false) {
        toast(res?.message || 'Could not clear chat', 'error');
        return;
      }
      chatClearedAt = Date.now();
      chatMessages = [];
      roomGiftHistory = [];
      if (roomState?.messages) roomState.messages = [];
      renderChatFeed();
      toast('Chat cleared (messages, gifts & join notices)', 'success');
    });
  }

  function openChatMessageModMenu(msg, anchorEl) {
    if (!canModerateRoom() || !msg) return;
    const t = String(msg.type || 'chat');
    if (t === 'system' || t === 'gift' || t === 'mic_invite') return;

    /* Debounce double-fire from pointerup+click on mobile WebViews */
    const now = Date.now();
    if (now < (Number(window.__apChatModOpenBusyUntil) || 0)) return;
    window.__apChatModOpenBusyUntil = now + 400;

    const existing = document.getElementById('apChatModMenu');
    if (existing) {
      existing.remove();
      document.removeEventListener('pointerdown', window.__apChatModDocClose, true);
      document.removeEventListener('click', window.__apChatModDocClose, true);
    }

    const menu = document.createElement('div');
    menu.id = 'apChatModMenu';
    menu.className = 'ap-chat-mod-menu';
    menu.setAttribute('role', 'menu');
    const uid = String(msg.userId || '').trim();
    const name = msg.user || 'User';
    const canKick = uid && (!isRoomHostUserId(uid) || isPlatformAdminSelf());
    const meId = String(currentUser()?.id || '');
    const isSelf = uid && uid === meId;
    const blocked = Boolean(uid && window.SocialInteractions?.isBlocked?.(uid));
    const isHostTarget = isRoomHostUserId(uid);
    menu.innerHTML = `
      <button type="button" data-cmod="delete"><i class="fas fa-trash"></i><span>Remove message</span></button>
      ${canKick && !isSelf && !isHostTarget ? '<button type="button" data-cmod="mutechat"><i class="fas fa-comment-slash"></i><span>Mute chat</span></button>' : ''}
      ${canKick && !isSelf && !isHostTarget ? '<button type="button" data-cmod="kick2"><i class="fas fa-ban"></i><span>Kick out · 2 hours</span></button>' : ''}
      ${canKick && !isSelf && !isHostTarget ? '<button type="button" data-cmod="kick24"><i class="fas fa-ban"></i><span>Kick out · 24 hours</span></button>' : ''}
      ${canKick && !isSelf && isHostTarget ? '<button type="button" data-cmod="kick-host-2"><i class="fas fa-ban"></i><span>Kick host · 2 hours</span></button>' : ''}
      ${canKick && !isSelf && isHostTarget ? '<button type="button" data-cmod="kick-host-24"><i class="fas fa-ban"></i><span>Kick host · 24 hours</span></button>' : ''}
      ${canKick && !isSelf ? `<button type="button" data-cmod="block"><i class="fas fa-user-slash"></i><span>${blocked ? 'Unblock user' : 'Block user'}</span></button>` : ''}
      ${canKick && !isSelf ? '<button type="button" data-cmod="profile"><i class="fas fa-user"></i><span>View profile / more</span></button>' : ''}
      <button type="button" data-cmod="cancel"><i class="fas fa-times"></i><span>Cancel</span></button>`;
    document.body.appendChild(menu);

    const placeMenu = () => {
      const rect =
        (anchorEl || document.body).getBoundingClientRect?.() ||
        { left: 40, top: 120, bottom: 160, right: 80, width: 40, height: 28 };
      const mw = Math.min(260, window.innerWidth - 24);
      menu.style.width = `${mw}px`;
      let left = (rect.right || rect.left + 40) - mw;
      if (left < 12) left = 12;
      if (left + mw > window.innerWidth - 12) left = window.innerWidth - mw - 12;
      let top = (rect.bottom || rect.top + 28) + 6;
      const mh = menu.offsetHeight || 220;
      if (top + mh > window.innerHeight - 12) {
        top = Math.max(12, (rect.top || 120) - mh - 6);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    placeMenu();
    requestAnimationFrame(placeMenu);

    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('click', onDoc, true);
      if (window.__apChatModDocClose === onDoc) window.__apChatModDocClose = null;
    };

    function onDoc(e) {
      if (menu.contains(e.target)) return;
      if (anchorEl && (anchorEl === e.target || anchorEl.contains?.(e.target))) return;
      if (e.target?.closest?.('.party-chat-mod-btn')) return;
      close();
    }
    window.__apChatModDocClose = onDoc;

    menu.querySelector('[data-cmod="delete"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      if (window.confirm('Remove this message for everyone?')) deleteChatMessage(msg.id);
    });
    menu.querySelector('[data-cmod="mutechat"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      muteUserChat(uid, true);
    });
    menu.querySelector('[data-cmod="kick2"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      if (window.confirm(`Kick ${name} out of this live for 2 hours?`)) {
        kickUserFromRoom(uid, 'abusive_chat', 2);
      }
    });
    menu.querySelector('[data-cmod="kick24"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      if (window.confirm(`Kick ${name} out of this live for 24 hours?`)) {
        kickUserFromRoom(uid, 'abusive_chat', 24);
      }
    });
    menu.querySelector('[data-cmod="kick-host-2"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      kickUserFromRoom(uid, 'admin_kicked_host', 2);
    });
    menu.querySelector('[data-cmod="kick-host-24"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      kickUserFromRoom(uid, 'admin_kicked_host', 24);
    });
    menu.querySelector('[data-cmod="block"]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      await blockProfileUser(uid, name);
    });
    menu.querySelector('[data-cmod="profile"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      openModerationMenu(name, uid);
    });
    menu.querySelector('[data-cmod="cancel"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });

    /* Delay outside-close so the opening tap cannot dismiss the menu */
    setTimeout(() => {
      if (!document.getElementById('apChatModMenu')) return;
      document.addEventListener('pointerdown', onDoc, true);
      document.addEventListener('click', onDoc, true);
    }, 200);
  }

  function grantRoomAdmin(userId, grant) {
    if (!liveSocket?.connected || !userId) return;
    if (grant) {
      if (!canGrantRoomAdmin()) {
        toast('Only the host can make someone a room admin', 'warning');
        return;
      }
    } else if (!canGrantRoomAdmin() && !canModerateRoom()) {
      toast('Only host or room admin can remove admin', 'warning');
      return;
    }
    const label = roomAdminLabel();
    liveSocket.emit(
      grant ? 'live:admin_grant' : 'live:admin_revoke',
      { channel: channelId(), userId },
      (res) => {
        if (res?.ok) {
          toast(grant ? `${label} granted` : `Removed from ${label.toLowerCase()}`, 'success');
          /* Optimistic UI so Make ↔ Remove toggles immediately */
          const uid = String(userId);
          if (roomState?.onlineMembers) {
            roomState.onlineMembers = roomState.onlineMembers.map((m) =>
              String(m.userId) === uid
                ? { ...m, isAdmin: Boolean(grant), role: grant ? 'admin' : m.seatIndex != null ? 'speaker' : 'viewer' }
                : m
            );
          }
          if (roomState?.seats) {
            roomState.seats = roomState.seats.map((s) =>
              String(s.userId) === uid
                ? { ...s, isAdmin: Boolean(grant), role: grant ? 'admin' : s.role === 'admin' ? 'speaker' : s.role }
                : s
            );
          }
          renderAvailableUsers();
          renderRoomState();
        } else toast(res?.message || `Could not update ${label.toLowerCase()}`, 'error');
      }
    );
  }

  async function blockProfileUser(userId, userName) {
    const uid = String(userId || '').trim();
    if (!uid) {
      toast('User ID missing', 'warning');
      return false;
    }
    if (window.SocialInteractions?.toggleBlock) {
      const blocked = await window.SocialInteractions.toggleBlock(uid, userName || 'User');
      if (blocked) {
        purgeBlockedUserFromLive(uid);
        /* If you blocked the host of this room, leave */
        if (isRoomHostUserId(uid) && !isHost()) {
          toast('Leaving this live — host blocked', 'info');
          setTimeout(() => {
            try {
              window.location.href = '/explore.html?app=1';
            } catch (_e) { /* ignore */ }
          }, 600);
        }
      }
      return blocked;
    }
    toast('Block is unavailable right now', 'error');
    return false;
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
      await openProfileSheet(name, userId);
      /* Anyone on a seat (incl. room/live admin) can leave their own seat */
      if (userId && String(userId) === String(me) && !isHost() && (memberIsOnStage(userId) || hasSpeakerSeat)) {
        const panel = document.querySelector('#apProfileSheet .ap-profile-sheet-panel');
        if (panel) {
          panel.querySelector('.ap-profile-more-menu')?.remove();
          const menu = document.createElement('div');
          menu.className = 'ap-profile-more-menu';
          menu.innerHTML =
            '<button type="button" data-mod="demote"><i class="fas fa-user-minus"></i><span>Leave the seat</span></button>';
          panel.appendChild(menu);
          menu.querySelector('[data-mod="demote"]')?.addEventListener('click', () => {
            leaveOwnSeat();
            menu.remove();
            document.getElementById('apProfileSheet')?.classList.remove('open');
          });
        }
      }
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
    const memberHit =
      (roomState?.seats || []).find((s) => String(s.userId) === String(userId)) ||
      (roomState?.onlineMembers || []).find((m) => String(m.userId) === String(userId)) ||
      { userId, name };
    const isAdminMember = isRoomAdminMember(memberHit);
    const onStage = memberIsOnStage(userId) || memberIsOnStage(memberHit);
    /* Platform admins can kick the host; room mods cannot */
    const canSeatMod = !isTargetHost;
    const canKick = !isTargetHost || isPlatformAdminSelf();
    const adminLabel = roomAdminLabel();
    const blocked = Boolean(userId && window.SocialInteractions?.isBlocked?.(userId));
    const demoteLabel = isAdminMember
      ? `Remove from the seat (keep ${adminLabel.toLowerCase()})`
      : 'Remove from the seat';
    /* Host: Make admin ↔ Remove admin. Live/room admins can Remove admin (not grant). */
    const canMakeAdmin = canGrantRoomAdmin() && !isTargetHost && !isAdminMember;
    const canRemoveAdmin =
      !isTargetHost &&
      isAdminMember &&
      (canGrantRoomAdmin() || canModerateRoom()) &&
      String(userId) !== String(currentUser()?.id || '');
    const chatLocked = Boolean(roomState?.chatLocked);
    menu.innerHTML = `
      ${canMakeAdmin ? `<button type="button" data-mod="admin-grant"><i class="fas fa-user-shield"></i><span>Make admin</span></button>` : ''}
      ${canRemoveAdmin ? `<button type="button" data-mod="admin-revoke"><i class="fas fa-user-slash"></i><span>Remove admin</span></button>` : ''}
      ${!isTargetHost ? '<button type="button" data-mod="mute"><i class="fas fa-microphone-slash"></i><span>Mute mic</span></button>' : ''}
      ${!isTargetHost ? '<button type="button" data-mod="unmute"><i class="fas fa-microphone"></i><span>Unmute mic</span></button>' : ''}
      ${!onStage && isPartyRoomPage() && !isTargetHost ? '<button type="button" data-mod="addseat"><i class="fas fa-plus"></i><span>Add to seat</span></button>' : ''}
      ${!onStage && isLiveRoomPage() && !isTargetHost ? '<button type="button" data-mod="addseat"><i class="fas fa-plus"></i><span>Add to live</span></button>' : ''}
      ${isPartyRoomPage() && onStage && !isTargetHost ? '<button type="button" data-mod="move"><i class="fas fa-exchange-alt"></i><span>Move to seat…</span></button>' : ''}
      ${canSeatMod && onStage ? `<button type="button" data-mod="demote"><i class="fas fa-user-minus"></i><span>${demoteLabel}</span></button>` : ''}
      ${canKick && isTargetHost ? '<button type="button" data-mod="kick-host-2"><i class="fas fa-ban"></i><span>Kick host · 2 hours</span></button>' : ''}
      ${canKick && isTargetHost ? '<button type="button" data-mod="kick-host-24"><i class="fas fa-ban"></i><span>Kick host · 24 hours</span></button>' : ''}
      ${canKick && isTargetHost ? '<button type="button" data-mod="kick-host"><i class="fas fa-gavel"></i><span>Kick host &amp; end live</span></button>' : ''}
      ${canKick && !isTargetHost ? '<button type="button" data-mod="kick2"><i class="fas fa-ban"></i><span>Kick out · 2 hours</span></button>' : ''}
      ${canKick && !isTargetHost ? '<button type="button" data-mod="kick24"><i class="fas fa-ban"></i><span>Kick out · 24 hours</span></button>' : ''}
      ${canKick && !isTargetHost ? `<button type="button" data-mod="block"><i class="fas fa-user-slash"></i><span>${blocked ? 'Unblock user' : 'Block user'}</span></button>` : ''}
      <button type="button" data-mod="mute-all-chat"><i class="fas fa-comment-slash"></i><span>${chatLocked ? 'Unmute all chat' : 'Mute all chat'}</span></button>
      <button type="button" data-mod="clear-chat"><i class="fas fa-eraser"></i><span>Clear all chat</span></button>`;
    menu.querySelector('[data-mod="mute"]')?.addEventListener('click', () => {
      muteRemoteUser(userId, true);
      menu.remove();
    });
    menu.querySelector('[data-mod="unmute"]')?.addEventListener('click', () => {
      muteRemoteUser(userId, false);
      menu.remove();
    });
    menu.querySelector('[data-mod="addseat"]')?.addEventListener('click', () => {
      const btn = document.createElement('button');
      btn.dataset.inviteSeat = String(userId);
      btn.dataset.inviteName = name || 'Guest';
      handleSeatInviteClick(btn);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="move"]')?.addEventListener('click', () => {
      startPartySeatMovePick(userId, seatNum, name);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="demote"]')?.addEventListener('click', () => {
      demoteUserFromSeat(userId);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick-host-2"]')?.addEventListener('click', () => {
      kickUserFromRoom(userId, 'admin_kicked_host', 2);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick-host-24"]')?.addEventListener('click', () => {
      kickUserFromRoom(userId, 'admin_kicked_host', 24);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick-host"]')?.addEventListener('click', () => {
      kickUserFromRoom(userId, 'admin_kicked_host', 0);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick2"]')?.addEventListener('click', () => {
      if (isLiveRoomPage()) removeUserFromLiveOrSeat(userId, name, 2);
      else kickUserFromRoom(userId, 'blocked_by_host', 2);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="kick24"]')?.addEventListener('click', () => {
      if (isLiveRoomPage()) removeUserFromLiveOrSeat(userId, name, 24);
      else kickUserFromRoom(userId, 'blocked_by_host', 24);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="block"]')?.addEventListener('click', async () => {
      await blockProfileUser(userId, name);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="admin-grant"]')?.addEventListener('click', () => {
      grantRoomAdmin(userId, true);
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="admin-revoke"]')?.addEventListener('click', () => {
      if (window.confirm(`Remove admin from ${name}?`)) {
        grantRoomAdmin(userId, false);
      }
      menu.remove();
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    menu.querySelector('[data-mod="mute-all-chat"]')?.addEventListener('click', () => {
      setRoomChatLocked(!Boolean(roomState?.chatLocked));
      menu.remove();
    });
    menu.querySelector('[data-mod="clear-chat"]')?.addEventListener('click', () => {
      clearLiveChat();
      menu.remove();
    });
  }

  function ensureJoinedModToolbar() {
    const panel = document.querySelector('#partyRequestsSheet .party-requests-panel');
    if (!panel) return null;
    let bar = document.getElementById('partyJoinedModBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'partyJoinedModBar';
      bar.className = 'party-joined-mod-bar';
      const hint = panel.querySelector('.party-requests-hint');
      if (hint) hint.insertAdjacentElement('afterend', bar);
      else panel.insertBefore(bar, panel.firstChild?.nextSibling || null);
    }
    return bar;
  }

  function syncJoinedModToolbar() {
    const bar = ensureJoinedModToolbar();
    if (!bar) return;
    const mod = canModerateRoom();
    if (!mod) {
      bar.hidden = true;
      bar.setAttribute('hidden', '');
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.removeAttribute('hidden');
    const locked = Boolean(roomState?.chatLocked);
    bar.innerHTML = `
      <button type="button" class="party-joined-mod-btn" data-joined-mod="mute-chat">
        <i class="fas ${locked ? 'fa-comments' : 'fa-comment-slash'}"></i>
        <span>${locked ? 'Unmute chat' : 'Mute all chat'}</span>
      </button>
      <button type="button" class="party-joined-mod-btn" data-joined-mod="clear-chat">
        <i class="fas fa-eraser"></i>
        <span>Clear all chat</span>
      </button>`;
    bar.querySelector('[data-joined-mod="mute-chat"]')?.addEventListener('click', () => {
      setRoomChatLocked(!Boolean(roomState?.chatLocked));
      syncJoinedModToolbar();
    });
    bar.querySelector('[data-joined-mod="clear-chat"]')?.addEventListener('click', () => {
      clearLiveChat();
    });
  }

  function openAvailableUsersForSeat(seatNum) {
    openPartyRequestsSheet();
    renderAvailableUsers();
    toast(`Pick someone to move to seat ${seatNum}`, 'info');
    window.__apPendingSeatMove = seatNum;
  }

  function getPartyRoomMembers() {
    const hide = (list) =>
      (list || []).filter((m) => m?.userId && !isLiveUserBlocked(m.userId || m.id));
    const online = roomState?.onlineMembers;
    if (Array.isArray(online) && online.length) return hide(online);
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
    if (fromSeats.length) return hide(fromSeats);
    if (hostId && roomState?.hostName && !isLiveUserBlocked(hostId)) {
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
        roomState = mergeRoomState(res.state);
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
    const hosting = canGrantRoomAdmin();
    list.innerHTML = available
      .map((m) => {
        const role = memberListRoleLabel(m);
        const onSeat = memberIsOnStage(m.userId) || memberIsOnStage(m);
        const isTargetAdmin = isRoomAdminMember(m);
        const uid = String(m.userId || '');
        const isSelf = uid && uid === String(currentUser()?.id || '');
        let actionBtn = '';
        if (isSelf && !isHost() && onSeat) {
          actionBtn = `<div class="party-req-actions"><button type="button" class="deny" data-leave-own-seat="1">Leave seat</button></div>`;
        } else if (mod && !isRoomHostUserId(m.userId) && !isSelf) {
          const bits = [];
          if (hosting) {
            bits.push(
              isTargetAdmin
                ? `<button type="button" class="deny party-admin-toggle" data-admin-revoke="${escapeHtml(uid)}">Remove admin</button>`
                : `<button type="button" class="accept party-admin-toggle" data-admin-grant="${escapeHtml(uid)}">Make admin</button>`
            );
          } else if (isTargetAdmin) {
            bits.push(
              `<button type="button" class="deny party-admin-toggle" data-admin-revoke="${escapeHtml(uid)}">Remove admin</button>`
            );
          }
          if (onSeat) {
            bits.push(
              `<button type="button" class="deny" data-remove-seat="${escapeHtml(uid)}">${isTargetAdmin ? 'Remove seat' : 'Remove from seat'}</button>`
            );
          } else {
            bits.push(
              `<button type="button" class="accept" data-invite-seat="${escapeHtml(uid)}">${isLiveRoomPage() ? 'Add to live' : 'To seat'}</button>`
            );
          }
          actionBtn = `<div class="party-req-actions">${bits.join('')}</div>`;
        }
        return `
      <div class="party-req-row" data-user-id="${escapeHtml(uid)}">
        <img src="${avatarUrl(m.name, m.profilePic)}" alt="">
        <div class="info"><strong>${escapeHtml(m.name || 'Guest')}</strong><br><small class="party-online-dot">● ${escapeHtml(role)}</small></div>
        ${actionBtn}
      </div>`;
      })
      .join('');
    /* Accept / Add / Remove clicks: delegated in bindPartyRequestsSheet */
    list.querySelectorAll('[data-leave-own-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        leaveOwnSeat();
      });
    });
    list.querySelectorAll('[data-admin-grant]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.getAttribute('data-admin-grant');
        if (uid) grantRoomAdmin(uid, true);
      });
    });
    list.querySelectorAll('[data-admin-revoke]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.getAttribute('data-admin-revoke');
        const member = available.find((m) => String(m.userId) === String(uid));
        if (uid && window.confirm(`Remove admin from ${member?.name || 'this user'}?`)) {
          grantRoomAdmin(uid, false);
        }
      });
    });
    list.querySelectorAll('.party-req-row[data-user-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const uid = row.dataset.userId;
        const member = available.find((m) => String(m.userId) === String(uid));
        if (mod && uid && !isRoomHostUserId(uid) && String(uid) !== String(currentUser()?.id || '')) {
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
    /* Host/admin control bars removed from live UI — keep chrome clean.
       Moderation stays via people sheet + Basic Tools. */
    const hosting = isHost();
    const moderating = canModerateRoom();
    document.body.classList.toggle('ap-is-host', hosting);
    document.body.classList.toggle('ap-can-moderate', moderating && !hosting);
    const liveHostBar = document.getElementById('liveHostBar');
    if (liveHostBar) {
      liveHostBar.hidden = true;
      liveHostBar.setAttribute('hidden', '');
      liveHostBar.setAttribute('aria-hidden', 'true');
      liveHostBar.style.setProperty('display', 'none', 'important');
      liveHostBar.classList.add('is-collapsed');
    }
    const partyHostBar = document.getElementById('partyHostBar');
    if (partyHostBar) {
      partyHostBar.hidden = true;
      partyHostBar.setAttribute('hidden', '');
      partyHostBar.setAttribute('aria-hidden', 'true');
      partyHostBar.style.setProperty('display', 'none', 'important');
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
    broadcastMode = 'video';
    if (isLiveRoomPage()) syncBroadcastModeInUrl();
  }

  function syncBroadcastModeInUrl() {
    if (!isLiveRoomPage()) return;
    try {
      const params = new URLSearchParams(location.search);
      params.set('mode', 'video');
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    } catch (_e) { }
  }

  /** Hide poster chrome when camera stream is active. */
  function clearAudioModeUi() {
    const bg = document.getElementById('liveBg');
    const localBox = document.getElementById('liveLocalHost');
    const root = document.getElementById('liveRoomRoot');
    if (root) root.classList.remove('is-audio-mode');
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
    const label =
      (window.SocialUI?.initials && SocialUI.initials(name)) ||
      String(name || 'U')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[^A-Za-z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase() ||
      'U';
    try {
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#fff">${label}</text></svg>`
      )}`;
    } catch (_e) {
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="64" fill="#c9a227"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#fff">U</text></svg>'
      )}`;
    }
  }

  function triggerEntryFrameForJoin(payload) {
    if (!payload || payload.isHost || payload.silent) return;
    const uid = String(payload.userId || '').trim();
    const name = String(payload.name || 'Someone').slice(0, 40);
    if (!uid && !payload.entryFrame) return;
    const avatar = payload.profilePic
      ? avatarUrl(name, payload.profilePic)
      : uid
        ? avatarUrl(name, getChatProfilePic({ userId: uid, user: name }))
        : '';
    const C = window.Cosmetics;
    if (!C) return;
    if (payload.entryFrame && uid) {
      const cached = C.getCachedForUser(uid) || {};
      C.setCachedForUser(uid, { ...cached, entryFrame: payload.entryFrame });
      C.showEntryFrame(payload.entryFrame, { name, userId: uid, avatarUrl: avatar });
      return;
    }
    if (uid) {
      C.showEntryFrameForUser(uid, { name, avatarUrl: avatar }).catch(() => {});
    }
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
    if (roomState?.hostStreamCover) return roomState.hostStreamCover;
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

  function rememberStickyStageGuest(g) {
    if (!g?.userId) return;
    const uid = String(g.userId);
    if (isLiveUserBlocked(uid)) return;
    const hostId = String(roomState?.hostId || '');
    if (hostId && uid === hostId) return;
    stickyStageGuests.set(uid, {
      userId: g.userId,
      name: g.name || stickyStageGuests.get(uid)?.name || 'Guest',
      profilePic: g.profilePic || g.profile_pic || stickyStageGuests.get(uid)?.profilePic || null,
      muted: Boolean(g.muted),
      gifts: Number(g.gifts || stickyStageGuests.get(uid)?.gifts || 0),
      seatIndex: g.seatIndex != null ? g.seatIndex : g.seat_index,
      isHost: false,
      isAdmin: Boolean(g.isAdmin || g.role === 'admin'),
      userRole: g.userRole || g.user_role || stickyStageGuests.get(uid)?.userRole || null,
      stickyAt: Date.now(),
    });
  }

  function forgetStickyStageGuest(userId) {
    if (userId == null) return;
    stickyStageGuests.delete(String(userId));
  }

  function syncStickyStageGuestsFromState(state) {
    const seats = state?.seats || [];
    const guestSeats = seats.filter((s) => s && !s.isHost && s.userId);
    guestSeats.forEach((s) => rememberStickyStageGuest(s));
    (state?.onlineMembers || []).forEach((m) => {
      if (!m?.userId || m.role === 'host') return;
      const onStage = memberIsOnMic(m);
      if (onStage) rememberStickyStageGuest(m);
    });
    /* Drop sticky entries that were explicitly removed and not republishing */
    if (guestSeats.length || Array.isArray(state?.seats)) {
      const seatedIds = new Set(guestSeats.map((s) => String(s.userId)));
      const publishingUids = new Set();
      try {
        const map = window.__apAgoraUidMap || {};
        (agoraClient?.remoteUsers || []).forEach((u) => {
          if (!u?.hasAudio && !u?.hasVideo) return;
          const appId = map[String(u.uid)];
          if (appId) publishingUids.add(String(appId));
        });
      } catch (_e) { }
      for (const uid of [...stickyStageGuests.keys()]) {
        if (seatedIds.has(uid) || publishingUids.has(uid)) continue;
        /* Keep briefly after promote; otherwise drop if snapshot has no guest seats list at all mid-race */
        const entry = stickyStageGuests.get(uid);
        if (Date.now() - (entry?.stickyAt || 0) < 12000) continue;
        if (guestSeats.length === 0 && Date.now() - seatPromoteAt < 15000) continue;
        stickyStageGuests.delete(uid);
      }
    }
  }

  function mergeRoomState(incoming) {
    if (!incoming) return roomState;
    if (!roomState) return incoming;
    const prev = roomState;
    const merged = { ...incoming };
    // Trust server seats. Previously we "carried" missing seats back which made
    // Remove-from-seat look broken (guest stayed on the rail).
    if (!Array.isArray(merged.seats)) merged.seats = Array.isArray(prev.seats) ? prev.seats : [];
    else {
      const incomingGuests = merged.seats.filter((s) => s && !s.isHost);
      const prevGuests = (prev.seats || []).filter((s) => s && !s.isHost);
      /* Stale empty snapshots can wipe a just-accepted seat and unblock the guest. */
      const promoteGuard = Date.now() - seatPromoteAt < 15000;
      const stickyActive = stickyStageGuests.size > 0 && incomingGuests.length === 0;
      if (
        incomingGuests.length === 0 &&
        prevGuests.length > 0 &&
        String(merged.status || prev.status || 'active') !== 'ended' &&
        (promoteGuard || stickyActive)
      ) {
        merged.seats = prev.seats;
      }
    }
    if (!merged.hostProfilePic && prev.hostProfilePic) merged.hostProfilePic = prev.hostProfilePic;
    if (!merged.hostStreamCover && prev.hostStreamCover) merged.hostStreamCover = prev.hostStreamCover;
    if (!merged.hostId && prev.hostId) merged.hostId = prev.hostId;
    if (!merged.hostName && prev.hostName) merged.hostName = prev.hostName;
    if (!merged.hostUserRole && prev.hostUserRole) merged.hostUserRole = prev.hostUserRole;
    stripBlockedUsersFromRoomState(merged);
    if (chatClearedAt && Date.now() - chatClearedAt < 30000) {
      merged.messages = [];
    }
    syncStickyStageGuestsFromState(merged);
    return merged;
  }

  function collectPartySeatGuests() {
    const hostId = String(roomState?.hostId || '');
    const seen = new Set();
    const guests = [];
    const pushGuest = (g) => {
      if (!g) return;
      const uid = g.userId != null ? String(g.userId) : '';
      if (uid && isLiveUserBlocked(uid)) return;
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
        onMic: true,
      });
    };
    (roomState?.seats || []).forEach((s) => {
      if (!s || s.isHost) return;
      pushGuest(s);
      rememberStickyStageGuest(s);
    });
    (roomState?.onlineMembers || []).forEach((m) => {
      if (!m || m.role === 'host') return;
      if (memberIsOnMic(m)) {
        pushGuest(m);
        rememberStickyStageGuest(m);
      }
    });
    stickyStageGuests.forEach((g) => pushGuest(g));
    /* Fallback: remotes publishing audio who map to known members (hear-but-no-seat race) */
    try {
      const map = window.__apAgoraUidMap || {};
      const byUser = new Map(
        [...(roomState?.onlineMembers || []), ...(roomState?.seats || [])]
          .filter((m) => m?.userId)
          .map((m) => [String(m.userId), m])
      );
      (agoraClient?.remoteUsers || []).forEach((u) => {
        if (!u?.hasAudio && !u?.hasVideo) return;
        const appId = map[String(u.uid)];
        if (!appId || (hostId && appId === hostId)) return;
        if (seen.has(appId)) return;
        const known = byUser.get(appId) || stickyStageGuests.get(appId);
        if (known) {
          pushGuest({ ...known, userId: known.userId || appId });
        }
      });
    } catch (_e) { }
    return guests;
  }

  function paintHostAvatarImg(img, hostName, coverOverride) {
    if (!img) return;
    const pic = coverOverride || resolveHostProfilePic();
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
    if (wrap) {
      wrap.classList.remove('ap-admin-frame');
      wrap.querySelectorAll('.ap-admin-avatar-tag').forEach((t) => t.remove());
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
    if (roomState?.hostStreamCover) {
      return resolveMediaUrl(roomState.hostStreamCover) || roomState.hostStreamCover;
    }
    const uid = roomState?.hostId || currentUser()?.id;
    if (uid) {
      try {
        const custom = localStorage.getItem('ap_streamer_cover_' + uid);
        if (custom) return custom;
      } catch (_e) { }
    }
    if (roomState?.hostProfilePic) {
      return resolveMediaUrl(roomState.hostProfilePic) || roomState.hostProfilePic;
    }
    return themeCover('live', hostName || 'Streamer');
  }

  function readPendingStreamMeta() {
    try {
      const raw = sessionStorage.getItem('ap_live_stream_meta');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.ts || Date.now() - data.ts > 15 * 60 * 1000) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function clearPendingStreamMeta() {
    try {
      sessionStorage.removeItem('ap_live_stream_meta');
    } catch (_e) { /* ignore */ }
  }

  function openEditLivePresentation() {
    if (!isHost() && !clientClaimsHost()) {
      toast('Only the host can edit live name and picture', 'warning');
      return;
    }
    if (isPartyRoomPage()) {
      openPartyEditInfoModal();
      return;
    }
    const currentName = roomState?.hostName || displayName(currentUser());
    const nextName = window.prompt('Live stream name (does not change your profile name):', currentName);
    if (nextName == null) return;
    const trimmed = String(nextName).trim().slice(0, 48);
    if (!trimmed) {
      toast('Live name cannot be empty', 'warning');
      return;
    }
    const cover = window.prompt(
      'Live cover image URL (optional — leave blank to keep current; type CLEAR to remove).\nDoes not change your profile picture.',
      roomState?.hostStreamCover || ''
    );
    if (cover == null) return;
    const payload = {
      channel: channelId(),
      streamTitle: trimmed,
    };
    if (String(cover).trim().toUpperCase() === 'CLEAR') payload.streamCoverUrl = '';
    else if (String(cover).trim()) payload.streamCoverUrl = String(cover).trim().slice(0, 700);
    liveSocket?.emit('live:update_presentation', payload, (res) => {
      if (res?.ok) {
        toast('Live name/picture updated for this stream only', 'success');
        if (res.state) {
          roomState = { ...(roomState || {}), ...res.state };
          renderRoomState();
        }
      } else toast(res?.message || 'Could not update', 'error');
    });
  }

  function applyLiveBackground(_mode, hostName) {
    const bg = document.getElementById('liveBg');
    const root = document.getElementById('liveRoomRoot');
    const name = hostName || roomState?.hostName || 'Streamer';
    const hasVideoStream =
      Boolean(root?.classList.contains('ap-has-video-stream')) ||
      Boolean(document.body.classList.contains('ap-has-video-stream')) ||
      Boolean(getLocalVideoTrack?.() || rawCameraTrack);
    if (bg) {
      if (hasVideoStream) {
        bg.style.display = 'none';
      } else {
        bg.style.display = 'block';
        const cover =
          resolveStickyPosterUrl() ||
          getStreamCoverUrl(name) ||
          themeCover('live', name);
        if (cover) {
          bg.style.backgroundImage = `url('${cover}')`;
          bg.style.backgroundSize = 'cover';
          bg.style.backgroundPosition = 'center';
          bg.style.backgroundColor = '#0a0618';
        } else {
          bg.style.backgroundImage = 'none';
          bg.style.background = '#0a0618';
        }
      }
    }
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop && document.body.classList.contains('live-feed-mode')) {
      const feedCover = getStreamCoverUrl(name) || themeCover('live', name);
      backdrop.style.backgroundImage = `url('${feedCover}')`;
    }
    updateModeBadge('video', isHost() && isActuallyLive());
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
    el.classList.remove('is-audio', 'is-host');
    el.classList.toggle('is-host', showHosting);
    el.innerHTML = '<i class="fas fa-video"></i> VIDEO LIVE';
    el.style.display = '';
  }

  function memberIsOnMic(m) {
    if (!m || m.isHost || m.role === 'host') return false;
    /* Room admins are moderators — not on mic unless they have a seat */
    if (m.seatIndex != null || m.seat_index != null) return true;
    return m.role === 'speaker';
  }

  async function getCoins(forceFresh = false) {
    if (window.SocialWallet) {
      try {
        if (window.Auth?.ensureAccessToken) {
          await Promise.race([
            Auth.ensureAccessToken(),
            new Promise((resolve) => setTimeout(resolve, 3500)),
          ]);
        }
      } catch (_e) { }
      const b = await Promise.race([
        SocialWallet.fetchBalance(forceFresh),
        new Promise((_, rej) => setTimeout(() => rej(new Error('balance timeout')), forceFresh ? 4500 : 8000)),
      ]).catch(() => SocialWallet.getCachedBalance?.() || null);
      if (!b) return 0;
      return SocialWallet.getGiftableCoins
        ? SocialWallet.getGiftableCoins(b)
        : (b.giftable_coins ?? b.coin_balance ?? 0);
    }
    return 0;
  }

  async function getWalletCoins(forceFresh = false) {
    if (window.SocialWallet) {
      const b = await SocialWallet.fetchBalance(forceFresh);
      return Number(b.coin_balance || 0);
    }
    return 0;
  }

  async function refreshCoinDisplay() {
    const [bal, walletBal] = await Promise.all([getCoins(), getWalletCoins()]);
    const giftEls = [document.getElementById('giftCoinsBal')].filter(Boolean);
    giftEls.forEach((el) => {
      if (lastCoinBalance !== null && window.SocialFX?.animateBalance) {
        SocialFX.animateBalance(el, lastCoinBalance, bal);
      } else {
        el.textContent = String(bal);
      }
    });
    const walletEls = [
      document.getElementById('apTopupBal'),
      document.getElementById('apSurpriseCoins'),
    ].filter(Boolean);
    walletEls.forEach((el) => {
      el.textContent = String(walletBal);
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
      window.APVoiceMetrics?.onForensic?.(name, detail);
    } catch (_m) { }
    /* Hot path: skip localStorage + console unless live debug is on */
    if (!isLiveDebugEnabled()) return;
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
    await disposeAgoraClient(
      isPeerConnectionLimitError(msg) ? 'peerconnection_limit' : 'host_broadcast_failed'
    );
    updateModeBadge('video', false);
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
    const peerLimit = isPeerConnectionLimitError(msg);
    const retryHint = peerLimit
      ? ' Wait a moment, then tap mic to retry.'
      : isParty
        ? ' Tap mic to retry voice.'
        : ' Tap mic to retry.';
    setLiveStatus((msg || 'Broadcast failed') + retryHint, false);
    hideApLoader();
    if (isParty && !sessionEstablished) onRoomReady();
    refreshViewerDiagnostics();

    // Auto-recover intermittent failures — never spam createClient on PeerConnection limit
    const skipAuto =
      peerLimit ||
      reason === 'media_blocked' ||
      /permission|NotAllowed|billing|CAN_NOT_GET_GATEWAY|suspended|quota|PeerConnection/i.test(
        String(msg || '') + reason
      );
    if (!skipAuto && !window.__apHostPublishAutoTries) window.__apHostPublishAutoTries = 0;
    if (!skipAuto && window.__apHostPublishAutoTries < 1) {
      window.__apHostPublishAutoTries += 1;
      setTimeout(() => {
        if (socketLeaveIntentional) return;
        resumeHostBroadcastIfNeeded()
          .then(() => {
            if (publishSucceeded) window.__apHostPublishAutoTries = 0;
          })
          .catch(() => { });
      }, 2500);
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
      return micMuted ? 'Live — mic off' : 'Live';
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
      updateModeBadge('video', isActuallyLive() || sessionLive);
      setLiveStatus(hostStatusLabel(), isActuallyLive() || sessionLive ? true : null);
      return;
    }
    updateModeBadge('video', false);
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
    if (!isLiveDebugEnabled()) return;
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
      liveSocket.on('user:session_revoked', (payload) => {
        if (payload?.reason === 'account_deactivated' && typeof Auth?.forceLogoutDeactivated === 'function') {
          Auth.forceLogoutDeactivated(payload.message);
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
        /* Mutual PK: apply battle UI on both rooms + late joiners */
        try {
          const pkSnap = state?.pkBattle;
          if (pkSnap && pkSnap.battle?.status === 'active') {
            beginPkBattle(pkSnap);
          } else if (
            pkBattleActive &&
            (state?.pkStatus === 'ended' || state?.pkStatus === 'none' || state?.pkStatus === null) &&
            !pkSnap
          ) {
            /* only clear if backend clear marks ended — don't kill mid-battle if field missing */
            if (state?.pkStatus === 'ended') endPkBattle(state);
          }
        } catch (_pkState) {}
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
          /* Seat changes sometimes leave sheets/overlays blocking the gift icon */
          recoverStuckLiveUi({ forceGift: true });
          renderRoomState({ soft: sessionEstablished });
          renderRoomGiftPanels();
          refreshOpenGiftRecipients();
          // New on-seat guest — pull their mic (host + other viewers)
          // Defer while a gift is in flight so seat churn can't kill Send
          if (seatAdded && agoraClient && liveDebugState.agoraJoined) {
            runOrDeferMeshPull(() => {
              refreshPartyMeshAudio('seat-added');
              setTimeout(() => refreshPartyMeshAudio('seat-added-late'), 1200);
            });
          }
        }, 80);
      });

      liveSocket.on('live:guest_mic_ready', (payload) => {
        const uid = payload?.userId != null ? String(payload.userId) : '';
        const me = currentUser();
        if (uid && me && uid === String(me.id)) return;
        liveDebugLog(`guest_mic_ready from ${uid || payload?.agoraUid || '?'}`);
        if (uid) {
          rememberStickyStageGuest({
            userId: uid,
            name:
              (roomState?.seats || []).find((s) => String(s.userId) === uid)?.name ||
              (roomState?.onlineMembers || []).find((m) => String(m.userId) === uid)?.name ||
              'Guest',
          });
          if (payload?.agoraUid != null) {
            window.__apAgoraUidMap = window.__apAgoraUidMap || {};
            window.__apAgoraUidMap[String(payload.agoraUid)] = uid;
            const did = payload.displayId != null ? String(payload.displayId) : '';
            if (
              payload.quietDevice ||
              accountKeyMatchesQuiet(uid) ||
              accountKeyMatchesQuiet(did)
            ) {
              try {
                window.__apQuietAgoraUids = window.__apQuietAgoraUids || {};
                window.__apQuietAgoraUids[String(payload.agoraUid)] = true;
              } catch (_q) { }
            }
          }
          renderGuestRail();
        }
        const pullGuestMic = () => {
          refreshPartyMeshAudio('guest_mic_ready');
        };
        runOrDeferMeshPull(() => {
          pullGuestMic();
          setTimeout(pullGuestMic, 1000);
          setTimeout(pullGuestMic, 2500);
        });
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
          triggerEntryFrameForJoin?.({
            userId: msg.userId,
            name: msg.user,
            profilePic: msg.profilePic || getChatProfilePic(msg),
          });
        }
        renderChatFeed();
      });

      liveSocket.on('live:chat_deleted', (payload) => {
        const id = String(payload?.id || '');
        if (!id) return;
        chatMessages = chatMessages.filter((m) => String(m.id) !== id);
        renderChatFeed();
      });

      liveSocket.on('live:chat_cleared', () => {
        chatClearedAt = Date.now();
        chatMessages = [];
        roomGiftHistory = [];
        if (roomState?.messages) roomState.messages = [];
        renderChatFeed();
      });

      liveSocket.on('live:chat_lock', (payload) => {
        if (roomState) roomState.chatLocked = payload?.locked !== false;
        syncChatMuteUi();
        const me = currentUser();
        if (me && !canModerateRoom()) {
          toast(
            payload?.locked !== false ? 'Host muted all chat' : 'Chat is open again',
            payload?.locked !== false ? 'warning' : 'success'
          );
        }
      });

      liveSocket.on('live:chat_mute_all', (payload) => {
        const muted = payload?.muted !== false;
        if (roomState?.onlineMembers) {
          const me = currentUser()?.id;
          roomState.onlineMembers = roomState.onlineMembers.map((m) => {
            if (String(m.userId) === String(me) && canModerateRoom()) return m;
            if (isRoomHostUserId(m.userId)) return m;
            return { ...m, chatMuted: muted };
          });
        }
        syncChatMuteUi();
      });

      liveSocket.on('live:member_chat_mute', (payload) => {
        const uid = String(payload?.userId || '');
        const muted = payload?.muted !== false;
        if (roomState?.onlineMembers) {
          roomState.onlineMembers = roomState.onlineMembers.map((m) =>
            String(m.userId) === uid ? { ...m, chatMuted: muted } : m
          );
        }
        const me = currentUser();
        if (me && String(me.id) === uid) {
          syncChatMuteUi();
          const why =
            payload?.reason === 'abusive_language'
              ? 'You were muted for abusive language'
              : muted
                ? 'Host muted you from chat'
                : 'You can chat again';
          toast(why, muted ? 'warning' : 'success');
        }
      });

      liveSocket.on('live:mod_alert', (payload) => {
        if (!canModerateRoom() && !isHost() && !clientClaimsHost()) return;
        const who = payload?.user || 'Someone';
        const strikes = payload?.strikes != null ? ` · strike ${payload.strikes}/3` : '';
        if (payload?.type === 'abuse') {
          const act =
            payload.action === 'ban'
              ? 'auto-banned'
              : payload.action === 'mute'
                ? 'auto-muted'
                : 'warned (message blocked)';
          toast(`Chat filter: ${who} ${act}${strikes}`, 'warning');
          return;
        }
      });

      liveSocket.on('live:gift', (gift) => {
        if (!gift) return;
        const normalized = {
          ...gift,
          id: gift.id || gift.gift_tx_id,
          gift_tx_id: gift.gift_tx_id || gift.id,
        };
        const isFresh = claimGiftPresentation(normalized);
        pushRoomGift(normalized);
        rememberChatMessage({
          type: 'gift',
          id: normalized.id ? `gift-${normalizeGiftTxId(normalized.id)}` : undefined,
          user: normalized.from || normalized.senderName || 'User',
          userId: normalized.fromUserId || normalized.senderId || null,
          text: `${normalized.emoji || '🎁'} sent to ${normalized.to || normalized.recipientName || 'Host'} · ${formatGiftCount(normalized.amount || normalized.coins || 0)} coins`,
          gift: normalized,
          at: normalized.at || Date.now(),
        });
        renderChatFeed();
        if (!isFresh) {
          if (roomState) renderRoomState();
          renderRoomGiftPanels();
          return;
        }
        const combo = window.SocialFX?.trackCombo?.(normalized?.emoji || 'gift', normalized?.qty || 1) || 1;
        const hasAnimStream = window.GiftAnimationOverlay?.hasAnimationForGift?.(normalized);
        if (hasAnimStream) {
          try {
            window.GiftAnimationOverlay?.onGiftReceived?.(normalized);
          } catch (_giftAnimErr) { /* presentation only */ }
        }
        window.SocialFX?.playGift?.(normalized, {
          combo,
          skipActivity: true,
          skipCinematic: hasAnimStream,
          skipSound: hasAnimStream,
        });
        onGiftTeamProgress(normalized?.amount || normalized?.coins || 100);
        if (roomState) renderRoomState();
        renderRoomGiftPanels();
        /* Host points (stars) update after gift settlement */
        if (isConfirmedRoomHost() || isHost()) {
          refreshCoinDisplay().catch(() => { });
          if (window.SocialWallet?.fetchBalance) SocialWallet.fetchBalance(true).catch(() => { });
        }
      });

      liveSocket.on('live:game', (payload) => {
        if (!payload || payload.game !== 'greedy') return;
        if (payload.channel && channelId() && String(payload.channel) !== String(channelId())) return;
        const frame = document.getElementById('apGameFrame');
        if (!frame?.contentWindow) return;
        try {
          frame.contentWindow.postMessage({
            type: 'GAME_ROOM_EVENT',
            game: payload.game || 'greedy',
            ...payload,
          }, '*');
        } catch (_e) { }
      });

      liveSocket.on('pk:start', (snapshot) => {
        pkPendingChallengeId = null;
        pkStartInFlight = false;
        beginPkBattle(snapshot);
      });

      liveSocket.on('pk:join', (snapshot) => {
        if (!pkBattleActive) beginPkBattle(snapshot);
        else {
          applyPkTeamsFromSnapshot(snapshot);
          syncPkStageUi(snapshot);
          updatePkBar();
        }
      });

      liveSocket.on('pk:challenge', (payload) => {
        const me = String(currentUser()?.id || '');
        const target = String(payload?.targetUserId || '');
        if (target && target !== me) return;
        if (payload?.fromUserId && String(payload.fromUserId) === me) return;
        if (pkBattleActive) return;
        if (payload?.challengeId && window.__apPkChallengeSeen?.has?.(payload.challengeId)) return;
        window.__apPkChallengeSeen = window.__apPkChallengeSeen || new Set();
        window.__apPkChallengeSeen.add(payload.challengeId);
        /* In-app sheet (confirm is unreliable in WebView) */
        showPkChallengeSheet(payload);
      });

      liveSocket.on('pk:challenge:declined', (payload) => {
        if (!pkPendingChallengeId || String(payload?.challengeId) !== String(pkPendingChallengeId)) {
          if (pkStartInFlight && pkPendingChallengeId) {
            /* still ours */
          } else if (payload?.targetUserId && pkMatchedRivalMeta?.userId) {
            /* ok */
          } else {
            return;
          }
        }
        pkPendingChallengeId = null;
        pkStartInFlight = false;
        setPkMatching(false);
        setPkStatus('');
        selectPkType(pkSelectedType || 'random');
        toast(`${payload?.fromName || 'Opponent'} declined the PK`, 'warning');
      });

      liveSocket.on('pk:challenge:timeout', (payload) => {
        if (pkPendingChallengeId && String(payload?.challengeId) !== String(pkPendingChallengeId)) return;
        pkPendingChallengeId = null;
        pkStartInFlight = false;
        setPkMatching(false);
        setPkStatus('');
        selectPkType(pkSelectedType || 'random');
        toast('PK challenge timed out — try again', 'warning');
      });

      liveSocket.on('pk:challenge:accepted', (payload) => {
        pkPendingChallengeId = null;
        pkStartInFlight = false;
        if (payload?.battle) beginPkBattle(payload.battle);
      });

      liveSocket.on('pk:invite', (payload) => {
        /* Legacy invite — convert to confirm for same-room guests */
        const me = String(currentUser()?.id || '');
        if (payload?.targetUserId && String(payload.targetUserId) !== me) return;
        if (payload?.fromUserId && String(payload.fromUserId) === me) return;
        if (pkBattleActive) return;
        if (isHost() || clientClaimsHost?.()) {
          /* hosts use pk:challenge now */
          return;
        }
        const fromName = payload?.fromName || 'Host';
        if (!window.confirm(`${fromName} invited you to PK. Accept?`)) return;
        if (liveSocket?.connected) {
          liveSocket.emit(
            'pk:join',
            {
              channel: channelId() || payload?.channel,
              team: 2,
              displayName: displayName(currentUser()),
            },
            (res) => {
              if (res?.ok) {
                beginPkBattle(res.battle || res);
                toast('You joined the PK!', 'success');
              }
            }
          );
        }
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
        if (el) {
          el.textContent = isLiveRoomPage() ? `${viewers} joined` : String(viewers);
        }
        if (isHost() && isPartyRoomPage() && viewers !== getPartyAudienceMembers().length + 1) {
          requestFreshRoomState();
        } else {
          renderTopGifters();
          renderPartyAudienceBar();
        }
      });

      liveSocket.on('live:member_joined', (payload) => {
        if (!payload) return;
        const name = String(payload.name || 'Someone').slice(0, 32);
        if (payload.viewers != null) {
          lastViewerCount = Number(payload.viewers) || 0;
          if (roomState) roomState.viewers = lastViewerCount;
          const el = document.getElementById('liveViewerCount');
          if (el) {
            el.textContent = isLiveRoomPage()
              ? `${lastViewerCount} joined`
              : String(lastViewerCount);
          }
        }
        /* Join chat line comes from live:chat — avoid duplicate banner here */
        if (!payload.isHost && !payload.silent && name) {
          try {
            triggerEntryFrameForJoin?.(payload);
          } catch (_e) { /* optional */ }
        }
        requestFreshRoomState();
      });

      liveSocket.on('live:member_left', (payload) => {
        if (!payload) return;
        if (payload.viewers != null) {
          lastViewerCount = Number(payload.viewers) || 0;
          if (roomState) roomState.viewers = lastViewerCount;
          const el = document.getElementById('liveViewerCount');
          if (el) {
            el.textContent = isLiveRoomPage()
              ? `${lastViewerCount} joined`
              : String(lastViewerCount);
          }
        }
        const uid = String(payload.userId || '');
        if (uid) forgetStickyStageGuest(uid);
        requestFreshRoomState();
      });

      liveSocket.on('live:members_sync', (payload) => {
        if (!payload || !roomState) return;
        if (payload.viewers != null) roomState.viewers = Number(payload.viewers) || 0;
        if (Array.isArray(payload.onlineMembers)) roomState.onlineMembers = payload.onlineMembers;
        if (Array.isArray(payload.seats)) roomState.seats = payload.seats;
        stripBlockedUsersFromRoomState(roomState);
        renderRoomState();
      });

      liveSocket.on('live:presentation', (payload) => {
        if (!payload || !roomState) return;
        if (payload.hostName) roomState.hostName = payload.hostName;
        if (payload.hostStreamCover !== undefined) roomState.hostStreamCover = payload.hostStreamCover;
        if (payload.hostProfilePic !== undefined) roomState.hostProfilePic = payload.hostProfilePic;
        renderRoomState();
        applyLiveBackground('live', roomState.hostName);
      });

      liveSocket.on('live:seat_request', (req) => {
        if (!req) return;
        /* Host may receive via user: room before canModerate is ready — still queue if host */
        if (!canModerateRoom() && !isHost() && !clientClaimsHost()) return;
        const id = String(req.userId || req.id || '');
        if (!id) return;
        const entry = {
          id,
          name: req.name || 'Guest',
          userId: id,
          profilePic: req.profilePic || req.profile_pic || null,
        };
        const existingIdx = joinRequests.findIndex((r) => String(r.id) === id);
        if (existingIdx >= 0) {
          joinRequests[existingIdx] = { ...joinRequests[existingIdx], ...entry };
        } else {
          joinRequests.push(entry);
        }
        renderJoinRequests();
        pushMicInviteToChat(entry);
        renderMicRequestActionBar();
      });

      liveSocket.on('live:seat_response', async (res) => {
        if (!res || isHost()) return;
        const me = currentUser();
        if (String(res.userId) !== String(me?.id)) return;
        if (res.accepted) {
          hasSpeakerSeat = true;
          seatPromoteAt = Date.now();
          guestPublishAttempted = false;
          publishSucceeded = false;
          clearMicRequestState();
          rememberStickyStageGuest({
            userId: me.id,
            name: displayName(me),
            profilePic: me.profilePic || me.profile_pic || null,
          });
          toast(isLiveRoomPage() ? 'You joined the live — enabling mic…' : 'You got a seat — enabling mic…', 'success');
          syncLiveMediaPublisherMode();
          requestNativeSpeakerAudio();
          // Single publish path — avoid leave/rejoin thrash from duplicate callers
          await waitForPublisherAcl(channelId(), 12);
          await publishGuestAudio();
          if (!publishSucceeded && !guestPublishInProgress) {
            await new Promise((r) => setTimeout(r, 800));
            await publishGuestAudio();
          }
          syncLiveMediaPublisherMode();
          boostRemoteAudioVolumes();
          ensureRemoteAudioPlaying().catch(() => { });
          if (isPartyRoomPage()) renderPartySeats(roomState?.hostName);
          else renderGuestRail();
          if (publishSucceeded) {
            toast(isLiveRoomPage() ? 'You are on the live stream' : 'You are on the seat', 'success');
          }
        } else {
          clearMicRequestState();
          showMicLinkModal('rejected');
          toast(isLiveRoomPage() ? 'Join request declined' : 'Seat request declined');
        }
      });

      liveSocket.on('live:ended', (payload) => {
        const endedCh = String(payload?.channel || '').trim();
        const myCh = channelId();
        if (endedCh && endedCh !== myCh) return;
        if (agoraModeSwitchInProgress) return;
        const adminKickedHost =
          payload?.reason === 'admin_kicked_host' ||
          payload?.hostKicked === true ||
          String(payload?.reason || '').includes('admin_kick');
        if (adminKickedHost) {
          /* Do NOT auto-rejoin — platform admin ended this live */
          const wasHosting = Boolean(isHost() || lastJoinMeta?.isHost);
          hostEndingIntentionally = true;
          lastJoinMeta = null;
          if (hostEndedRecoverTimer) {
            clearTimeout(hostEndedRecoverTimer);
            hostEndedRecoverTimer = null;
          }
          toast(
            wasHosting
              ? 'An admin removed you and ended this live'
              : 'Admin ended this live — host was removed',
            'warning'
          );
          setTimeout(exitRoom, 600);
          return;
        }
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
          notifyBlockedFromRoom(payload);
          try {
            localStorage.setItem(
              'ap_live_ban_' + String(payload?.channel || channelId() || ''),
              JSON.stringify({
                expiresAt: payload?.expiresAt || null,
                remainingHours: payload?.remainingHours ?? null,
                permanent: Boolean(payload?.permanent),
                message: formatBanBlockMessage(payload),
                at: Date.now(),
              })
            );
          } catch (_e) { }
          setTimeout(() => {
            try {
              leaveRoomOnly();
            } catch (_e) { }
            exitRoom();
          }, 600);
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
          const stillAdmin = canModerateRoom();
          toast(
            stillAdmin
              ? `Removed from the seat — you are still a ${roomAdminLabel().toLowerCase()}`
              : isLiveRoomPage()
                ? 'Removed from the mic'
                : 'You were removed from the seat',
            'warning'
          );
          syncHostBarUi();
        }
        renderRoomState();
        syncHostBarUi();
      });

      liveSocket.on('live:admin_changed', (payload) => {
        const me = currentUser();
        const uid = String(payload?.userId || '');
        const isAdmin = Boolean(payload?.isAdmin);
        if (roomState?.onlineMembers) {
          let found = false;
          roomState.onlineMembers = roomState.onlineMembers.map((m) => {
            if (String(m.userId) !== uid) return m;
            found = true;
            return { ...m, isAdmin, role: isAdmin ? 'admin' : m.seatIndex != null ? 'speaker' : 'viewer' };
          });
          if (!found && uid) {
            roomState.onlineMembers.push({
              userId: uid,
              name: 'Admin',
              role: isAdmin ? 'admin' : 'viewer',
              isAdmin,
            });
          }
        }
        if (roomState?.seats) {
          roomState.seats = roomState.seats.map((s) =>
            String(s.userId) === uid ? { ...s, isAdmin, role: isAdmin ? 'admin' : s.role } : s
          );
        }
        if (me && uid === String(me.id)) {
          toast(isAdmin ? `You are now a ${roomAdminLabel().toLowerCase()} — you can manage seats, mute, and kick` : `${roomAdminLabel()} access removed`, 'info');
          syncHostBarUi();
          applyRoleUiAfterJoin();
        }
        renderRoomState();
        syncHostBarUi();
        renderAvailableUsers();
        syncJoinedModToolbar();
      });

      liveSocket.on('live:room_style', (payload) => {
        if (!roomState) return;
        roomState.roomStyle = { ...(roomState.roomStyle || {}), ...(payload || {}) };
        applyRoomBackground(payload?.backgroundId || roomState.roomStyle?.backgroundId);
        syncPartyAnnouncement();
        if (isPartyRoomPage()) renderPartySeats(roomState?.hostName);
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
        const meta = readPendingStreamMeta();
        const hostExtras =
          hostFlag && meta
            ? {
              streamTitle: meta.streamTitle || undefined,
              streamCoverUrl: meta.streamCoverUrl || undefined,
            }
            : {};
        liveSocket.emit(
          'live:join',
          {
            channel: ch,
            type: type === 'live' ? 'live' : 'party',
            displayName: displayName(user),
            isHost: hostFlag,
            ...hostExtras,
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
              if (hostFlag) clearPendingStreamMeta();
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
              } else if (window.Cosmetics) {
                window.Cosmetics.fetchEquipped()
                  .then(() => {
                    window.Cosmetics.showSelfEntryFrameOnJoin?.({
                      name: displayName(user),
                      avatarUrl: avatarUrl(displayName(user), me?.profile_pic || me?.profilePic),
                    });
                  })
                  .catch(() => {});
              }
              resolve(liveSocket);
            } else {
              updateLiveDebug({ roomJoined: false });
              if (res?.banned) {
                const banMsg = formatBanBlockMessage(res);
                notifyBlockedFromRoom(res);
                setLiveStatus(banMsg, false);
                reject(new Error(banMsg));
                return;
              }
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
    try {
      window.GiftAnimationOverlay?.cleanup?.();
    } catch (_e) { /* */ }
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
    try {
      window.GiftAnimationOverlay?.cleanup?.();
    } catch (_e) { /* */ }
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
    __viewerAgoraEarlyPromise = null;
    __viewerAgoraEarlyChannel = null;
    updateLiveDebug({ socketConnected: false, roomJoined: false, publishSucceeded: false });
  }

  /* ---------- Agora ---------- */
  let agoraClient = null;
  let localTracks = [];
  let agoraMode = 'live';
  let agoraLoadPromise = null;
  let __agoraHealthBound = false;

  function agoraLife() {
    return window.APAgoraLife || null;
  }

  function isPeerConnectionLimitError(err) {
    const msg = String(err?.message || err || '');
    if (agoraLife()?.isUnrecoverableError?.(err)) {
      return /PeerConnection|RTCPeerConnection/i.test(msg);
    }
    return /Cannot create so many PeerConnections|Failed to construct ['"]RTCPeerConnection['"]/i.test(
      msg
    );
  }

  function isUnrecoverableAgoraError(err) {
    if (agoraLife()?.isUnrecoverableError) return agoraLife().isUnrecoverableError(err);
    const msg = String(err?.message || err || '');
    return /Cannot create so many PeerConnections|Failed to construct ['"]RTCPeerConnection['"]|UID_CONFLICT|CAN_NOT_GET_GATEWAY/i.test(
      msg
    );
  }

  /** Serialize every lifecycle op through APAgoraLife (nested-safe). */
  function runAgoraLifecycle(name, fn) {
    const life = agoraLife();
    if (life?.run) return life.run(name, fn);
    return Promise.resolve().then(fn);
  }

  async function lifePublish(tracks) {
    const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);
    if (!list.length || !agoraClient) return;
    const life = agoraLife();
    if (life?.publish) {
      await life.publish(list, { client: agoraClient });
      return;
    }
    await agoraClient.publish(list.length === 1 ? list[0] : list);
  }

  async function lifeUnpublish(tracks) {
    const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);
    if (!list.length || !agoraClient) return;
    const life = agoraLife();
    if (life?.unpublish) {
      await life.unpublish(list, { client: agoraClient });
      return;
    }
    try {
      await agoraClient.unpublish(list.length === 1 ? list[0] : list);
    } catch (_e) { }
  }

  function syncLifeClientMeta() {
    try {
      agoraLife()?.syncExternalClient?.(agoraClient, {
        joined: Boolean(liveDebugState.agoraJoined),
        channel: liveDebugState.channel || channelId(),
      });
    } catch (_e) { }
  }

  function clearAllRemoteAudioSinks() {
    try {
      __remoteAudioSinkEls.forEach((_el, uid) => {
        try {
          removeRemoteAudioSink(uid);
        } catch (_e) { }
      });
      __remoteAudioSinkEls.clear();
    } catch (_e2) { }
  }

  /**
   * Fully tear down Agora client + tracks so WebView releases RTCPeerConnections.
   * Only for exit, channel change, or unrecoverable errors — never for seat role changes.
   */
  async function disposeAgoraClient(reason = '') {
    return runAgoraLifecycle('dispose:' + reason, async () => {
      const client = agoraClient;
      agoraClient = null;
      liveDebugState.agoraJoined = false;
      __mediaStableSince = 0;
      __mediaBadStreak = 0;
      __agoraHealthBound = false;
      syncLifeClientMeta();
      if (!client) {
        clearAllRemoteAudioSinks();
        return;
      }
      liveDebugLog(`dispose Agora (${reason})`);
      try {
        window.APVoiceMetrics?.noteDispose?.(reason);
      } catch (_m) { }
      try {
        liveMedia()?.dispose?.();
      } catch (_eng) { }
      try {
        for (const t of localTracks) {
          try {
            await client.unpublish?.(t);
          } catch (_e) { }
          try {
            t.stop?.();
            t.close?.();
          } catch (_e2) { }
        }
      } catch (_e3) { }
      localTracks = [];
      try {
        disposeHostMicBoostGraph();
      } catch (_boost) { }
      if (rawCameraTrack) {
        try {
          rawCameraTrack.stop?.();
          rawCameraTrack.close?.();
        } catch (_e4) { }
        rawCameraTrack = null;
      }
      try {
        const remotes = [...(client.remoteUsers || [])];
        for (const u of remotes) {
          try {
            u.audioTrack?.stop?.();
          } catch (_e5) { }
          try {
            u.videoTrack?.stop?.();
          } catch (_e6) { }
          try {
            await client.unsubscribe?.(u);
          } catch (_e7) { }
        }
      } catch (_e8) { }
      remoteUsers.clear();
      clearAllRemoteAudioSinks();
      try {
        client.__apHandlersBound = false;
      } catch (_e9) { }
      try {
        await client.leave();
      } catch (_e10) { }
      try {
        agoraLife()?.syncExternalClient?.(null, { joined: false, channel: null });
      } catch (_e11) { }
      /* Android WebView needs a beat before the next createClient */
      await new Promise((r) => setTimeout(r, reason === 'peerconnection_limit' ? 900 : 400));
    });
  }

  async function ensureAgoraClient() {
    return runAgoraLifecycle('ensureClient', async () => {
      if (agoraClient) {
        syncLifeClientMeta();
        return agoraClient;
      }
      const AgoraRTC = await loadAgoraScript();
      try {
        agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      } catch (e) {
        if (isPeerConnectionLimitError(e)) {
          liveDebugLog('createClient PeerConnection limit — force dispose + retry');
          await disposeAgoraClient('peerconnection_limit');
          await new Promise((r) => setTimeout(r, 700));
          agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        } else {
          throw e;
        }
      }
      syncLifeClientMeta();
      return agoraClient;
    });
  }

  function loadAgoraScript() {
    if (window.AgoraRTC) return Promise.resolve(window.AgoraRTC);
    if (agoraLoadPromise) return agoraLoadPromise;
    agoraLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ap-agora-sdk]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.AgoraRTC));
        existing.addEventListener('error', () => reject(new Error('Agora SDK failed to load')));
        if (window.AgoraRTC) resolve(window.AgoraRTC);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.22.0.js';
      s.async = true;
      s.dataset.apAgoraSdk = '1';
      s.onload = () => resolve(window.AgoraRTC);
      s.onerror = () => reject(new Error('Agora SDK failed to load'));
      document.head.appendChild(s);
    });
    return agoraLoadPromise;
  }

  /* Start Agora download as early as possible (parallel with auth/socket) */
  try {
    loadAgoraScript().catch(() => { });
  } catch (_e) { }

  let __agoraTokenInflight = new Map();
  let __viewerAgoraEarlyPromise = null;
  let __viewerAgoraEarlyChannel = null;

  /** Subscribe remotes — audio + video in true parallel (both instant). */
  async function subscribeRemotesPreferAudio(reason) {
    if (!agoraClient || !liveDebugState.agoraJoined) return;
    const remotes = agoraClient.remoteUsers || [];
    if (!remotes.length) {
      kickstartRemoteAudio(reason || 'no-remotes-yet');
      return;
    }
    bindAudioUnlockGestures();
    unlockBrowserAudio().catch(() => { });
    kickstartRemoteAudio(reason || 'parallel-av');

    /* Fire A+V together — never wait on one before starting the other */
    const jobs = [];
    for (const u of remotes) {
      if (u.hasVideo) jobs.push(playRemoteMedia(u, 'video').catch(() => { }));
      if (u.hasAudio) jobs.push(playRemoteMedia(u, 'audio').catch(() => { }));
    }
    /* Start reveal immediately while subscribes run */
    if (!isHost() && isLiveRoomPage()) {
      revealLiveVideoWhenReady(120);
    }
    await Promise.all(jobs);
    ensureRemoteAudioPlaying().catch(() => { });
    boostRemoteAudioVolumes();
    if (hasPlayingRemoteVideo() || document.querySelector('#liveRemoteHost video')) {
      setLiveStreamVisible(true);
      clearStickyLivePoster();
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
    }
  }

  /**
   * Viewers: join Agora as audience in parallel with socket live:join.
   * Biggest TTFV win — media channel connects while room DB/socket work runs.
   */
  async function startViewerAgoraEarly(mode = 'live') {
    if (isHost() || clientClaimsHost() || hasSpeakerSeat) return null;
    const ch = channelId();
    if (!ch) return null;
    if (__viewerAgoraEarlyPromise && __viewerAgoraEarlyChannel === String(ch)) {
      return __viewerAgoraEarlyPromise;
    }
    __viewerAgoraEarlyChannel = String(ch);
    __viewerAgoraEarlyPromise = (async () => {
      try {
        if (window.Auth?.ensureAccessToken) {
          await Auth.ensureAccessToken().catch(() => { });
        }
        const AgoraRTC = await loadAgoraScript();
        const alreadyOnChannel =
          agoraClient &&
          liveDebugState.agoraJoined &&
          String(liveDebugState.channel || '') === String(ch);
        if (!alreadyOnChannel) {
          if (agoraClient) {
            await disposeAgoraClient('early_rejoin');
          }
          await ensureAgoraClient();
          updateLiveDebug({ channel: ch, role: 'viewer' });
          await joinAgoraWithRetry(agoraClient, ch, false, 2);
          forensicEvent('AGORA_EARLY_JOIN_SUCCESS', { channel: ch, mode });
        }
        updateLiveDebug({
          channel: ch,
          role: 'viewer',
          agoraJoined: true,
          tokenReceived: true,
        });
        await subscribeRemotesPreferAudio(alreadyOnChannel ? 'early-reuse' : 'early-join');
        liveDebugLog(`viewer Agora early join OK channel=${ch}`);
        return { ok: true, channel: ch };
      } catch (e) {
        liveDebugLog(`viewer Agora early join failed: ${e?.message || e}`);
        forensicEvent('AGORA_EARLY_JOIN_FAILED', { channel: ch, msg: e?.message || String(e) });
        __viewerAgoraEarlyPromise = null;
        return { ok: false, error: e };
      }
    })();
    return __viewerAgoraEarlyPromise;
  }

  async function warmViewerAgoraPipeline() {
    /* Kept for callers — full early join supersedes warm-only */
    return startViewerAgoraEarly(isPartyRoomPage() ? 'party' : 'live');
  }

  async function fetchAgoraToken(channel, asPublisher = false) {
    const cacheKey = `${String(channel)}:${asPublisher ? '1' : '0'}:${hasSpeakerSeat ? '1' : '0'}`;
    if (__agoraTokenInflight.has(cacheKey)) {
      return __agoraTokenInflight.get(cacheKey);
    }
    const run = (async () => {
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

      const payloads = asPublisher
        ? [
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
        ]
        : [{ channel, role }];

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
    })();
    __agoraTokenInflight.set(cacheKey, run);
    try {
      return await run;
    } finally {
      __agoraTokenInflight.delete(cacheKey);
    }
  }

  function agoraUidFromCred(cred) {
    if (cred?.uid == null || cred.uid === '') return null;
    const n = Number(cred.uid);
    return Number.isFinite(n) ? n : null;
  }

  function friendlyAgoraError(msg) {
    const raw = String(msg || '');
    if (/Cannot create so many PeerConnections|RTCPeerConnection/i.test(raw)) {
      return 'Connection overload — wait 2 seconds, then tap mic once to retry.';
    }
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
    try {
      agoraLife()?.configure?.({
        log: (msg, data) => liveDebugLog(`life:${msg}${data ? ' ' + JSON.stringify(data) : ''}`),
      });
      const eng = liveMedia();
      if (eng && !__agoraHealthBound) {
        __agoraHealthBound = true;
        eng.configure({
          log: (msg, data) => liveDebugLog(`media:${msg}${data ? ' ' + JSON.stringify(data) : ''}`),
          shouldHear: () => shouldHearRemoteAudio(),
          requestSpeaker: () => requestNativeSpeakerAudio(),
          unlockAudio: () => unlockBrowserAudio(),
          /* Flat Agora default for everyone; Minal/Veena get host-only playback boost */
          volumeFor: (ctx) => remotePlaybackVolume(ctx?.uid ?? ctx?.user),
        });
        syncLiveMediaPublisherMode();
        /* Phase 1: ONLY APLiveMedia owns health — no social-live media watchdog / mesh timer */
        eng.startHealthWatch(() => agoraClient, {
          intervalMs: 5000,
          onDeadTrack: (user) => {
            eng.remountIfDead(user, async (u) => {
              await playRemoteMedia(u, 'audio', { force: false });
            }).catch(() => { });
          },
          onMissingTrack: (user) => {
            playRemoteMedia(user, 'audio', { force: false }).catch(() => { });
          },
          onStuckSilent: (user) => {
            /* Confirmed unhealthy after hysteresis inside engine — soft play only */
            eng.playRemoteAudio(user, { force: false }).catch(() => { });
          },
        });
      }
    } catch (_cfg) { }
    client.on('user-published', async (user, mediaType) => {
      liveDebugLog(`user-published uid=${user.uid} media=${mediaType}`);
      forensicEvent('REMOTE_USER_PUBLISHED', { uid: user.uid, mediaType, channel: agoraChannel });
      /* Never force-play healthy remotes — subscribe/play only if needed */
      void playRemoteMedia(user, mediaType, { force: false })
        .then(() => {
          if (mediaType === 'audio') {
            const eng = liveMedia();
            if (eng) {
              eng.playRemoteAudio(user, { force: false }).then(() => eng.boostAll(agoraClient));
            } else {
              ensureRemoteAudioPlaying().catch(() => { });
            }
            /* Do NOT re-setVolume / re-normalize mic when remotes join — that couples
             * host level to room size and re-triggers browser AEC adaptation. */
          }
          if (mediaType === 'video') {
            setLiveStreamVisible(true);
            clearStickyLivePoster(true);
            hideApLoader();
          }
        })
        .catch((e) => liveDebugLog(`user-published play failed: ${e?.message || e}`));
    });
    client.on('user-unpublished', (user, mediaType) => {
      liveDebugLog(`user-unpublished uid=${user.uid} media=${mediaType || 'all'}`);
      const existing = remoteUsers.get(user.uid) || user;
      if (mediaType === 'video') {
        try {
          existing.videoTrack?.stop?.();
        } catch (_e) { }
      } else if (mediaType === 'audio') {
        try {
          existing.audioTrack?.stop?.();
        } catch (_e) { }
        removeRemoteAudioSink(user.uid);
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
        if (mediaType === 'video') {
          // Leave container — republish will restore.
        } else {
          container.innerHTML = '';
          setLiveStreamVisible(false);
          if (!isHost()) applyLiveBackground('live', roomState?.hostName);
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
        resubscribeAllRemoteMedia({ force: false }).catch(() => { });
        if (isHost() || hasSpeakerSeat) ensureMicPublishing().catch(() => { });
      }
      if (cur === 'DISCONNECTED' || cur === 'FAILED') {
        scheduleMediaRecover('connection_' + cur);
      }
    });
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
  let __mediaRecoverAt = 0;
  let __mediaStableSince = 0;

  async function resubscribeAllRemoteMedia({ force = false } = {}) {
    if (!agoraClient || !liveDebugState.agoraJoined) return;
    const remotes = agoraClient.remoteUsers || [];
    await Promise.all(
      remotes.map(async (user) => {
        try {
          const jobs = [];
          if (user.hasVideo) jobs.push(playRemoteMedia(user, 'video', { force }));
          if (user.hasAudio) jobs.push(playRemoteMedia(user, 'audio', { force }));
          await Promise.all(jobs);
        } catch (_e) { }
      })
    );
    boostRemoteAudioVolumes();
  }

  async function joinAgoraWithRetry(client, channel, asPublisher, maxAttempts = 2) {
    return runAgoraLifecycle('join', async () => {
      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let cred;
        try {
          cred = await fetchAgoraToken(channel, asPublisher);
        } catch (e) {
          lastErr = e;
          if (attempt >= maxAttempts) break;
          await new Promise((r) => setTimeout(r, 250 * attempt));
          continue;
        }
        const appId = String(cred?.appId || '').trim();
        const token = cred?.token;
        const agoraChannel = cred?.channel || channel;
        const uid = agoraUidFromCred(cred);
        if (!appId || !token) {
          lastErr = new Error(cred?.message || 'Missing Agora appId or token');
          if (attempt >= maxAttempts) break;
          await new Promise((r) => setTimeout(r, 250 * attempt));
          continue;
        }
        try {
          bindAgoraClientHandlers(client, agoraChannel);
          await withTimeout(
            client.join(appId, agoraChannel, token, uid),
            10000,
            'Voice channel join'
          );
          auditChannel('agora', agoraChannel);
          liveDebugLog(`Agora join OK channel=${agoraChannel} uid=${uid} attempt=${attempt}`);
          updateLiveDebug({ agoraJoined: true, agoraUid: uid, channel: agoraChannel });
          __mediaStableSince = Date.now();
          __mediaBadStreak = 0;
          syncAgoraUidMap();
          syncLifeClientMeta();
          return { appId, token, channel: agoraChannel, uid };
        } catch (e) {
          lastErr = e;
          liveDebugLog(`Agora join attempt ${attempt}/${maxAttempts} failed: ${e?.message || e}`);
          if (isPeerConnectionLimitError(e)) {
            throw e;
          }
          if (attempt < maxAttempts) {
            try {
              await client.leave();
            } catch (_leave) { }
            liveDebugState.agoraJoined = false;
            syncLifeClientMeta();
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
      throw lastErr || new Error('Agora join failed');
    });
  }

  function scheduleMediaRecover(reason) {
    if (guestPublishInProgress || socketLeaveIntentional || agoraStartInProgress) return;
    if (__mediaRecoverTimer || __mediaRecoverBusy) return;
    /* Cooldown — rapid recover/resubscribe is what makes voice+video stutter */
    if (Date.now() - __mediaRecoverAt < 12000) {
      liveDebugLog(`media recover skipped (cooldown): ${reason}`);
      return;
    }
    __mediaRecoverTimer = setTimeout(async () => {
      __mediaRecoverTimer = null;
      if (__mediaRecoverBusy || socketLeaveIntentional || guestPublishInProgress || agoraStartInProgress) return;
      if (Date.now() - __mediaRecoverAt < 12000) return;
      __mediaRecoverBusy = true;
      __mediaRecoverAt = Date.now();
      try {
        await runAgoraLifecycle('recover:' + reason, async () => {
          liveDebugLog(`media recover: ${reason}`);
          try {
            window.APVoiceMetrics?.noteRecover?.(reason);
            forensicEvent('MEDIA_RECOVER', { reason });
          } catch (_m) { }
          if (!agoraClient || !liveDebugState.agoraJoined) {
            const page = document.body.dataset.livePage;
            await startAgora(page === 'party-room' ? 'party' : 'live');
            return;
          }
          /* Soft recover only — never tear down working tracks */
          await resubscribeAllRemoteMedia({ force: false });
          if ((isHost() || hasSpeakerSeat) && !publishSucceeded) {
            await ensureMicPublishing();
          }
          if (isHost() && broadcastMode !== 'audio' && publishSucceeded) {
            await ensureHostVideoPublishing();
          }
          if (isHost() && publishSucceeded) {
            await ensureHostAudioPublishing();
          }
          await unlockBrowserAudio();
          await ensureRemoteAudioPlaying();
        });
      } catch (e) {
        liveDebugLog(`media recover failed: ${e?.message || e}`);
        if (isPeerConnectionLimitError(e) || isUnrecoverableAgoraError(e)) {
          await disposeAgoraClient('peerconnection_limit');
        }
      } finally {
        __mediaRecoverBusy = false;
      }
    }, 1800);
  }

  function hasPlayingRemoteVideo() {
    const container = document.getElementById('liveRemoteHost');
    const vid = container?.querySelector?.('video');
    if (!vid) return false;
    /* Instant: play() already attached even before first decoded frame */
    if (vid.dataset.apPlaying === '1') return true;
    if (vid.videoWidth > 0) return true;
    if (vid.readyState >= 1) return true;
    return !vid.paused && vid.readyState >= 2;
  }

  function extractCssUrl(bgImage) {
    const m = String(bgImage || '').match(/url\(["']?([^"')]+)["']?\)/i);
    return m ? m[1] : '';
  }

  function resolveStickyPosterUrl() {
    try {
      const coverEl = document.getElementById('apLiveLoaderCover');
      const fromLoader = extractCssUrl(coverEl?.style?.backgroundImage);
      if (fromLoader) return fromLoader;
    } catch (_e) { }
    const launch = readLaunchCover(channelId());
    if (launch?.image) {
      return (
        window.SocialShell?.getImageUrl?.(launch.image) ||
        (String(launch.image).startsWith('http') ? launch.image : null) ||
        launch.image
      );
    }
    const name = roomState?.hostName || 'Host';
    const pic = roomState?.hostProfilePic || null;
    return resolveEntryCoverUrl(name, pic, false);
  }

  /** Host cover stays above video until first frame — kills black flash after loader */
  function ensureStickyLivePoster() {
    if (isHost() || !isLiveRoomPage()) return;
    if (broadcastMode !== 'video') return;
    if (hasPlayingRemoteVideo()) {
      clearStickyLivePoster(true);
      return;
    }
    const root = document.getElementById('liveRoomRoot');
    if (!root) return;
    let poster = document.getElementById('apLiveStickyPoster');
    if (!poster) {
      poster = document.createElement('div');
      poster.id = 'apLiveStickyPoster';
      poster.className = 'ap-live-sticky-poster';
      poster.setAttribute('aria-hidden', 'true');
      const remote = document.getElementById('liveRemoteHost');
      if (remote) root.insertBefore(poster, remote);
      else root.appendChild(poster);
    }
    const url = resolveStickyPosterUrl();
    if (url) {
      poster.style.backgroundImage = `url("${String(url).replace(/"/g, '\\"')}")`;
    }
    poster.classList.remove('is-gone');
    const bg = document.getElementById('liveBg');
    if (bg && url) {
      bg.style.display = '';
      bg.style.backgroundImage = `url("${String(url).replace(/"/g, '\\"')}")`;
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
      bg.style.backgroundColor = '#0a0618';
    }
  }

  function clearStickyLivePoster(immediate) {
    const poster = document.getElementById('apLiveStickyPoster');
    if (!poster) return;
    poster.classList.add('is-gone');
    const remove = () => {
      try {
        poster.remove();
      } catch (_e) { }
    };
    if (immediate) remove();
    else setTimeout(remove, 320);
  }

  function bindRemoteVideoReveal(container) {
    const vid = container?.querySelector?.('video');
    if (!vid || vid.dataset.apRevealBound === '1') return;
    vid.dataset.apRevealBound = '1';
    const kick = () => {
      if (!hasPlayingRemoteVideo() && !(vid.videoWidth > 0) && vid.dataset.apPlaying !== '1') return;
      setLiveStreamVisible(true);
      clearStickyLivePoster(true);
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
      hideApLoader();
    };
    ['loadeddata', 'loadedmetadata', 'playing', 'canplay', 'resize'].forEach((ev) => {
      vid.addEventListener(ev, kick, { passive: true });
    });
    requestAnimationFrame(kick);
  }

  function startMediaHealthWatchdog() {
    /* Phase 1: disabled — APLiveMedia.startHealthWatch is the sole recovery owner */
    if (window.__apMediaHealthWatch) {
      clearInterval(window.__apMediaHealthWatch);
      window.__apMediaHealthWatch = null;
    }
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
    const streamCover = getStreamCoverUrl(label);
    if (streamCover && roomState?.hostStreamCover) {
      return streamCover;
    }
    if (profilePic) {
      const resolved =
        window.SocialShell?.getImageUrl?.(profilePic) ||
        (String(profilePic).startsWith('http') || String(profilePic).startsWith('data:')
          ? profilePic
          : null);
      if (resolved) return avatarUrl(label, resolved);
    }
    if (streamCover) return streamCover;
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
    primeLiveRoomChrome();
    ensureStickyLivePoster();
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
    const wait = ms || 9000;
    if (apLoaderForceTimer) clearTimeout(apLoaderForceTimer);
    apLoaderForceTimer = setTimeout(() => {
      apLoaderForceTimer = null;
      primeLiveRoomChrome();
      forceRevealRoomShell();
      if (roomJoinCompleted && !sessionEstablished) onRoomReady();
      else if (!roomJoinCompleted) {
        setLiveStatus('Still connecting to room…', null);
      }
    }, wait);
  }

  function installLoaderEscapeHatch() {
    if (window.__apLoaderEscapeInstalled) return;
    window.__apLoaderEscapeInstalled = true;
    scheduleLoaderForceDismiss(9000);
  }

  function bindApLoaderDismiss() {
    const skip = document.getElementById('apLiveLoaderSkip');
    const loader = document.getElementById('apLiveLoader');
    const dismiss = () => {
      primeLiveRoomChrome();
      forceRevealRoomShell();
      if (roomJoinCompleted && !sessionEstablished) onRoomReady();
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
    ensureStickyLivePoster();
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
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), 4500);
      document.addEventListener('ap-media-permissions', onEvt);
      /* Host: ask native NOT to enter communication/recording audio mode (Samsung AEC). */
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'request_media_permissions',
          microphone: true,
          recordingAudioMode: false,
        })
      );
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
    /* Paint host cover before dismissing loader so viewers never see black */
    ensureStickyLivePoster();
    hideApLoader();
    syncLiveUiState();
    window.LiveSession?.onRoomActive?.();
    /* Host must NOT use enterTalk/recording mode on Android — Samsung HW AEC
     * in MODE_IN_COMMUNICATION cancels the host's own uplink (must-shout bug).
     * Samsung seats use the same rule (P0 A51 quiet mic when joining another room). */
    if (isHost()) {
      applyPublisherNativeAudioRoute('onRoomReady_host');
    } else if (hasSpeakerSeat) {
      applyPublisherNativeAudioRoute('onRoomReady_seat');
    } else {
      logAudioTransition('native_enterPlayback', { reason: 'onRoomReady_audience' });
      notifyLiveAudioRoute('enterPlayback', { reason: 'onRoomReady' });
    }
    /* Force audible path on join — some phones stay silent until unlock + speaker route */
    soundOn = true;
    requestNativeSpeakerAudio();
    unlockBrowserAudio()
      .then(() => {
        unmuteDomMediaElements();
        return ensureRemoteAudioPlaying();
      })
      .then(() => boostRemoteAudioVolumes())
      .catch(() => {});
    setTimeout(() => {
      unmuteDomMediaElements();
      ensureRemoteAudioPlaying().catch(() => {});
      boostRemoteAudioVolumes();
    }, 900);
    setTimeout(() => {
      if (!shouldHearRemoteAudio()) return;
      if (!isRemoteAudioAudibleNow()) {
        forceRemoteAudio('onRoomReady_silent');
      }
    }, 2800);
    if (!isHost() && isLiveRoomPage()) {
      revealLiveVideoWhenReady(80);
    }
  }

  function finalizeRoomEntry() {
    if (!sessionEstablished) onRoomReady();
    else hideApLoader();
  }

  async function startAgora(mode) {
    if (guestPublishInProgress) {
      liveDebugLog('startAgora skipped — guest publish in progress');
      return;
    }
    if (agoraStartInProgress) {
      liveDebugLog('startAgora skipped — already in progress');
      return;
    }
    agoraStartInProgress = true;
    /* Wait for parallel early audience join if it is in flight */
    if (!isHost() && __viewerAgoraEarlyPromise) {
      try {
        await __viewerAgoraEarlyPromise;
      } catch (_e) { }
    }
    ensureLiveDebugPanel();
    ensureViewerDiagnostics();
    agoraMode = mode || 'live';
    const ch = channelId();
    const host = isHost();
    auditChannel('url', ch);
    /* Don't wipe a successful guest mic when recover re-enters startAgora */
    if (!(hasSpeakerSeat && publishSucceeded && getLocalAudioTrack())) {
      publishSucceeded = false;
    }
    liveDebugLog(`${host ? 'HOST' : 'VIEWER'} startAgora mode=${mode} channel=${ch}`);
    updateLiveDebug({
      channel: ch,
      role: host ? 'host' : 'viewer',
      hostPublishing: Boolean(hasSpeakerSeat && publishSucceeded),
      publishSucceeded: Boolean(publishSucceeded),
      agoraJoined: Boolean(liveDebugState.agoraJoined && String(liveDebugState.channel || '') === String(ch)),
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
    updateModeBadge('video', false);

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
      await runAgoraLifecycle('startAgora', async () => {
        await loadAgoraScript();
        const permsP = host
          ? requestNativeMediaPermissions().catch(() => ({ ok: false, reason: 'perm_error' }))
          : Promise.resolve({ ok: true, skipped: true });
        const alreadyOnChannel =
          agoraClient &&
          liveDebugState.agoraJoined &&
          String(liveDebugState.channel || '') === String(ch);
        if (!alreadyOnChannel) {
          if (agoraClient) {
            await disposeAgoraClient('startAgora_rejoin');
          }
          await ensureAgoraClient();
        }

        let joined;
        try {
          const asPublisher = host || hasSpeakerSeat;
          if (!alreadyOnChannel) {
            joined = await joinAgoraWithRetry(agoraClient, ch, asPublisher, 2);
            forensicEvent('AGORA_JOIN_SUCCESS', {
              channel: joined.channel,
              uid: joined.uid,
              role: host ? 'host' : 'audience',
            });
          } else {
            joined = { channel: ch, uid: liveDebugState.agoraUid };
            liveDebugLog('Agora already joined (early path) — subscribe only');
          }
          syncLiveUiState();
          /* Audio first — voice should not wait on video decode */
          await subscribeRemotesPreferAudio(host ? 'host-joined' : alreadyOnChannel ? 'viewer-early' : 'viewer-joined');
        } catch (joinErr) {
          const msg = joinErr?.message || String(joinErr);
          console.error('[live] Agora join failed', joinErr);
          liveDebugLog(`Agora join FAILED: ${msg}`);
          forensicEvent('AGORA_JOIN_FAILED', { channel: ch, msg });
          updateLiveDebug({ agoraJoined: false });
          if (isPeerConnectionLimitError(joinErr) || isPeerConnectionLimitError(msg)) {
            await disposeAgoraClient('peerconnection_limit');
          }
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
          await permsP;
          const mediaBlock = webMediaBlockedReason();
          if (mediaBlock) {
            await handleHostMediaBlocked(mediaBlock, mode);
            return;
          }
          if (mode === 'party') {
            const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
            localTracks = [audioTrack];
            try {
              await lifePublish(audioTrack);
              publishSucceeded = true;
              partyVoiceSkipped = false;
              liveDebugLog('Publish OK party audio');
              forensicEvent('PUBLISH_SUCCESS', { channel: joined.channel, mode: 'party' });
              updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
              notifyLiveAudioRoute('enterPlayback', { reason: 'host_party_publish' });
              ensureRemoteAudioPlaying().then(() => boostRemoteAudioVolumes()).catch(() => { });
              setTimeout(() => boostRemoteAudioVolumes(), 1000);
            } catch (pubErr) {
              const msg = pubErr?.message || String(pubErr);
              console.error('[live] publish failed', pubErr);
              await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
              return;
            }
          } else {
            const root = document.getElementById('liveRoomRoot');
            if (root) root.classList.remove('is-audio-mode');
            /* Create mic + camera together, publish both at once — viewers get A/V at the same time */
            let audioTrack = null;
            let videoTrack = null;
            const mediaResults = await Promise.allSettled([
              createRoomMicrophoneTrack(AgoraRTC),
              withTimeout(
                AgoraRTC.createCameraVideoTrack({
                  facingMode: cameraFacing,
                  encoderConfig: getLiveCameraEncoderConfig(),
                }),
                isLowEndLiveDevice() ? 15000 : 20000,
                'Camera access'
              ),
            ]);
            if (mediaResults[0].status === 'fulfilled') {
              audioTrack = mediaResults[0].value;
            } else {
              liveDebugLog(`Host mic create failed: ${mediaResults[0].reason?.message || mediaResults[0].reason}`);
            }
            if (mediaResults[1].status === 'fulfilled') {
              videoTrack = mediaResults[1].value;
              rawCameraTrack = videoTrack;
              const localBox = document.getElementById('liveLocalHost');
              if (localBox) playLocalHostPreview(videoTrack);
              ensureHostVideoVisible();
              setLiveStreamVisible(true);
            } else {
              liveDebugLog(`Host camera create failed: ${mediaResults[1].reason?.message || mediaResults[1].reason}`);
              try {
                videoTrack = await withTimeout(
                  AgoraRTC.createCameraVideoTrack({
                    facingMode: cameraFacing,
                    encoderConfig: '360p_1',
                  }),
                  12000,
                  'Camera access retry'
                );
                rawCameraTrack = videoTrack;
                const localBox = document.getElementById('liveLocalHost');
                if (localBox) playLocalHostPreview(videoTrack);
                ensureHostVideoVisible();
                setLiveStreamVisible(true);
                liveDebugLog('Host camera retry OK (360p)');
              } catch (retryErr) {
                liveDebugLog(`Host camera retry failed: ${retryErr?.message || retryErr}`);
              }
            }

            const toPublish = [audioTrack, videoTrack].filter(Boolean);
            if (!toPublish.length) {
              await onHostBroadcastFailed('publish_failed', 'Could not open camera or microphone');
              return;
            }
            try {
              /* Single stream only — dual low→high switch mid-watch breaks video/audio */
              await lifePublish(toPublish);
              localTracks = toPublish;
              publishSucceeded = true;
              liveDebugLog(`Publish OK live A/V together (a=${Boolean(audioTrack)} v=${Boolean(videoTrack)})`);
              forensicEvent('PUBLISH_SUCCESS', {
                channel: joined.channel,
                mode: 'video',
                parallel: true,
              });
              updateLiveDebug({ hostPublishing: true, publishSucceeded: true });
              /* AEC ducks seat mics once host mic is live — apply publisher volume immediately */
              syncLiveMediaPublisherMode();
              notifyLiveAudioRoute('enterPlayback', { reason: 'host_av_publish' });
              setTimeout(() => notifyLiveAudioRoute('reevaluate', { reason: 'host_av_settled' }), 400);
              setTimeout(() => notifyLiveAudioRoute('reevaluate', { reason: 'host_av_bt_check' }), 1500);
              ensureRemoteAudioPlaying()
                .then(() => {
                  boostRemoteAudioVolumes();
                  return routeRemoteAudioOutputs();
                })
                .catch(() => { });
              setTimeout(() => boostRemoteAudioVolumes(), 1000);
            } catch (pubErr) {
              const msg = pubErr?.message || String(pubErr);
              console.error('[live] publish failed', pubErr);
              await onHostBroadcastFailed('publish_failed', `Publish failed: ${msg}`);
              return;
            }
            if (!videoTrack && audioTrack) {
              toast('Camera failed — retry Go Live or flip camera. Audio is live for now.', 'warning');
              setLiveStatus('Camera failed — tap flip camera or restart live', false);
            }
            if (videoTrack) {
              applyVideoFilter();
              ensureHostVideoVisible();
              setLiveStreamVisible(true);
            }
            // Verify mic stayed published (some devices drop audio after camera start)
            setTimeout(() => {
              ensureHostAudioPublishing().catch((e) => liveDebugLog(`post-live mic check: ${e?.message || e}`));
            }, 800);
            setTimeout(() => {
              ensureHostAudioPublishing().catch((e) => liveDebugLog(`post-live mic check2: ${e?.message || e}`));
            }, 2500);
            setTimeout(() => {
              if (videoFilterId && videoFilterId !== 'none' && !isLowEndLiveDevice()) {
                syncPublishedBeautyTrack().catch((e) => liveDebugLog(`post-live beauty: ${e?.message || e}`));
              }
            }, 900);
          }
          onRoomReady();
          syncLiveUiState();
        } else {
          onRoomReady();
          applyLiveBackground('live', roomState?.hostName);
          if (hasSpeakerSeat) {
            await publishGuestAudio().catch((e) =>
              liveDebugLog(`Guest publish after join: ${e?.message || e}`)
            );
          }
          notifyLiveAudioRoute('enterPlayback', { reason: 'viewer_joined' });
          setTimeout(() => notifyLiveAudioRoute('reevaluate', { reason: 'viewer_bt_settled' }), 500);
          ensureRemoteAudioPlaying()
            .then(() => {
              boostRemoteAudioVolumes();
              return routeRemoteAudioOutputs();
            })
            .catch(() => { });
        }
      }); // end runAgoraLifecycle startAgora
    } catch (err) {
      const msg = err?.message || String(err);
      console.error('[live] Agora setup failed', err);
      liveDebugLog(`Agora setup FAILED: ${msg}`);
      updateLiveDebug({ agoraJoined: false, hostPublishing: false, publishSucceeded: false });
      if (isPeerConnectionLimitError(err) || isPeerConnectionLimitError(msg)) {
        await disposeAgoraClient('peerconnection_limit');
      }
      if (host) {
        await onHostBroadcastFailed('agora_setup_failed', `Agora error: ${msg}`);
      } else {
        setLiveStatus(`Agora error: ${msg}`, false);
      }
    } finally {
      clearTimeout(agoraDeadline);
      agoraStartInProgress = false;
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

  async function waitForPublisherAcl(channel, maxAttempts = 12) {
    const ch = String(channel || channelId() || '').trim();
    if (!ch || !window.API?.post) return false;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const data = await API.post('/live/agora/token', {
          channel: ch,
          role: 'publisher',
          asPublisher: true,
        });
        if (data?.success && data?.token) return true;
        const msg = String(data?.message || '');
        if (msg && !/publisher token requires/i.test(msg)) return false;
      } catch (e) {
        const msg = String(e?.message || e || '');
        if (msg && !/publisher token requires|403|denied/i.test(msg)) {
          /* network blip — keep trying briefly */
        }
      }
      await new Promise((r) => setTimeout(r, 200 + i * 80));
    }
    return false;
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
    if (guestPublishInProgress) {
      guestPublishQueued = true;
      return;
    }
    guestPublishInProgress = true;
    guestPublishAttempted = true;
    const ch = channelId();
    try {
      try {
        window.APVoiceMetrics?.noteSeatJoinStart?.();
      } catch (_m0) { }
      await runAgoraLifecycle('seatUpgrade', async () => {
        const AgoraRTC = await loadAgoraScript();
        const alreadyJoined = Boolean(agoraClient && liveDebugState.agoraJoined);

        async function publishInPlace() {
          await waitForPublisherAcl(ch, 8);
          await refreshAgoraTokenAndRenew();
          const stale = [...localTracks];
          localTracks = [];
          if (stale.length) {
            await lifeUnpublish(stale);
            for (const t of stale) {
              try {
                t.stop?.();
                t.close?.();
              } catch (_e2) { }
            }
          }
          const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
          localTracks = [audioTrack];
          await lifePublish([audioTrack]);
          liveDebugLog('Guest mic published in-place (no leave)');
        }

        if (alreadyJoined) {
          try {
            await publishInPlace();
          } catch (upgradeErr) {
            liveDebugLog(`In-place guest publish failed: ${upgradeErr?.message || upgradeErr}`);
            /* One soft retry in-place — never dispose for normal seat upgrade */
            await new Promise((r) => setTimeout(r, 350));
            try {
              await publishInPlace();
            } catch (retryErr) {
              if (!isUnrecoverableAgoraError(retryErr) && !isPeerConnectionLimitError(retryErr)) {
                throw retryErr;
              }
              liveDebugLog(
                `Unrecoverable seat upgrade — hard rejoin: ${retryErr?.message || retryErr}`
              );
              await disposeAgoraClient('guest_publish_unrecoverable');
              await ensureAgoraClient();
              await joinAgoraWithRetry(agoraClient, ch, true, 2);
              bindAudioUnlockGestures();
              await unlockBrowserAudio();
              await subscribeRemotesPreferAudio('guest-unrecoverable-rejoin');
              const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
              localTracks = [audioTrack];
              await lifePublish([audioTrack]);
            }
          }
        } else {
          await ensureAgoraClient();
          await joinAgoraWithRetry(agoraClient, ch, true, 2);
          bindAudioUnlockGestures();
          await unlockBrowserAudio();
          await subscribeRemotesPreferAudio('guest-first-join');
          const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
          localTracks = [audioTrack];
          await lifePublish([audioTrack]);
        }

        publishSucceeded = true;
        partyVoiceSkipped = false;
        micMuted = false;
        liveDebugLog('Publish OK guest audio (no camera)');
        updateLiveDebug({ hostPublishing: true, publishSucceeded: true, agoraJoined: true });
        syncLifeClientMeta();
      });

      rememberStickyStageGuest({
        userId: user.id,
        name: displayName(user),
        profilePic: user.profilePic || user.profile_pic || null,
      });

      await normalizeLocalMicLevel();
      if (isQuietDevicePublisherMe()) {
        /* Extra re-assert: Minal seat path was inaudible on hardware mics */
        scheduleQuietDeviceMicBoost(getLocalAudioTrack());
        try {
          getLocalAudioTrack()?.setVolume?.(QUIET_DEVICE_SEND_VOLUME);
        } catch (_qv) { }
      }
      syncLiveMediaPublisherMode();
      boostRemoteAudioVolumes();
      await ensureRemoteAudioPlaying().catch(() => { });

      try {
        liveSocket?.emit('live:guest_mic_ready', {
          channel: ch,
          userId: user.id,
          agoraUid: liveDebugState.agoraUid,
          hasVideo: false,
          quietDevice: isQuietDevicePublisherMe(),
          displayId: user.display_id || user.displayId || null,
        });
        setTimeout(() => {
          try {
            liveSocket?.emit('live:guest_mic_ready', {
              channel: ch,
              userId: user.id,
              agoraUid: liveDebugState.agoraUid,
              hasVideo: false,
              quietDevice: isQuietDevicePublisherMe(),
              displayId: user.display_id || user.displayId || null,
            });
          } catch (_e2) { }
        }, 1500);
      } catch (_e) { }

      syncMicButtonUi();
      renderPartySeats(roomState?.hostName);
      renderGuestRail();
      try {
        window.APVoiceMetrics?.noteSeatJoinOk?.();
      } catch (_m1) { }
      applyPublisherNativeAudioRoute('guest_publish_ok');
      toast('Mic is live — camera stays off. Tap mic to mute', 'success');
    } catch (e) {
      const msg = friendlyAgoraError(e?.message || String(e));
      liveDebugLog(`Guest publish FAILED: ${msg}`);
      publishSucceeded = false;
      guestPublishAttempted = false;
      try {
        window.APVoiceMetrics?.noteSeatJoinFail?.(msg);
      } catch (_m2) { }
      toast(`Mic failed: ${msg}`, 'error');
    } finally {
      guestPublishInProgress = false;
      if (guestPublishQueued && hasSpeakerSeat && !publishSucceeded) {
        guestPublishQueued = false;
        setTimeout(() => publishGuestAudio().catch(() => { }), 400);
      } else {
        guestPublishQueued = false;
      }
    }
  }

  function applyBeautyEngineState() {
    clearTimeout(window.__apBeautySyncTimer);
    window.__apBeautySyncTimer = setTimeout(() => {
      ensureBeautyLoaded()
        .then(() => syncPublishedBeautyTrack())
        .catch((e) => liveDebugLog(`beauty engine sync: ${e?.message || e}`));
    }, 100);
  }

  let beautyLoadPromise = null;
  function ensureBeautyLoaded() {
    if (window.APBeauty) return Promise.resolve(window.APBeauty);
    if (beautyLoadPromise) return beautyLoadPromise;
    beautyLoadPromise = import(`/beauty/index.js?v=20260718-perf`)
      .then(() => window.APBeauty)
      .catch((err) => {
        beautyLoadPromise = null;
        throw err;
      });
    return beautyLoadPromise;
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
    const softW = Math.max(160, Math.round(w * 0.5));
    const softH = Math.max(160, Math.round(h * 0.5));
    if (
      beautyPipeline.soft &&
      beautyPipeline.soft.width === softW &&
      beautyPipeline.soft.height === softH &&
      beautyPipeline.mask &&
      beautyPipeline.mask.width === w &&
      beautyPipeline.mask.height === h
    ) {
      return beautyPipeline;
    }
    const soft = document.createElement('canvas');
    soft.width = softW;
    soft.height = softH;
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
    for (let i = 0; i < 8; i++) {
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
    if (now - beautyFaceDetectAt < 500) return;
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

  function drawLipTint(_ctx, _w, _h, _lip) {
    /* Disabled — oval lip paint floated off the mouth and looked fake on every filter. */
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

  function beautyDrawLoop(ts) {
    if (!beautyPipeline) return;
    beautyPipeline.raf = requestAnimationFrame(beautyDrawLoop);
    const now = typeof ts === 'number' ? ts : performance.now();
    if (beautyPipeline._lastDrawTs && now - beautyPipeline._lastDrawTs < BEAUTY_FRAME_MS - 1) {
      return;
    }
    beautyPipeline._lastDrawTs = now;

    const { video, canvas, ctx } = beautyPipeline;
    if (!(video.readyState >= 2 && canvas.width && canvas.height)) return;

    const frameStart = performance.now();
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

    /* Skin soften at half-res — blur() on full HD is what made live crawl */
    if (preset.skin > 0 && preset.skinMix > 0 && softCtx) {
      const sw = aux.soft.width;
      const sh = aux.soft.height;
      const blurPx = Math.max(1.2, Math.min(2.8, preset.skin * 0.45));
      softCtx.clearRect(0, 0, sw, sh);
      softCtx.filter = `blur(${blurPx}px)`;
      softCtx.drawImage(video, 0, 0, sw, sh);
      softCtx.filter = 'none';
      drawFaceSoftMask(maskCtx, w, h);
      softCtx.globalCompositeOperation = 'destination-in';
      softCtx.drawImage(aux.mask, 0, 0, sw, sh);
      softCtx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, preset.skinMix * 0.85);
      ctx.drawImage(aux.soft, 0, 0, w, h);
      ctx.restore();
    }

    const heavyOk = !(beautyPipeline._lastFrameMs > 28);
    if (heavyOk) {
      drawFaceGlow(ctx, w, h, (preset.glow || 0) * 0.85);
      drawCheekBlush(ctx, w, h, preset.blush);
      drawHighlight(ctx, w, h, (preset.highlight || 0) * 0.85);
      drawLipTint(ctx, w, h, preset.lip);
      if (preset.wash) drawWash(ctx, w, h, preset.wash);
      if ((preset.sparkle || 0) > 0.05) {
        drawSparkles(ctx, w, h, preset.sparkle * 0.7, aux.sparkles, now);
      }
      drawVignette(ctx, w, h, (preset.vignette || 0) * 0.8);
    }
    beautyPipeline._lastFrameMs = performance.now() - frameStart;
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
    const srcW = video.videoWidth || mediaTrack.getSettings?.()?.width || 720;
    const srcH = video.videoHeight || mediaTrack.getSettings?.()?.height || 1280;
    const scale = Math.min(1, BEAUTY_PROCESS_MAX_W / Math.max(1, srcW));
    const w = Math.max(240, Math.round(srcW * scale));
    const h = Math.max(320, Math.round(srcH * scale));
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
    const stream = canvas.captureStream(BEAUTY_TARGET_FPS);
    beautyPipeline.stream = stream;
    const mst = stream.getVideoTracks()[0];
    if (!mst) return null;

    const customTrack = await AgoraRTC.createCustomVideoTrack({
      mediaStreamTrack: mst,
      optimizationMode: 'motion',
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
    if (!agoraClient || !publishSucceeded || !isHost()) return;
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
            /* Publish beauty first, then drop raw — avoids black gap viewers see as "no face" */
            if (!published.includes?.(custom)) {
              await lifePublish(custom);
            }
            if (oldVideo !== custom) {
              try {
                await lifeUnpublish([oldVideo]);
              } catch (_e) { }
            }
          } else if (!published.includes?.(custom)) {
            await lifePublish(custom);
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
          await lifeUnpublish([APB.camera.getCustomTrack()]);
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
          if (!already) await lifePublish(rawCameraTrack);
        } catch (e) {
          liveDebugLog(`restore camera publish failed: ${e?.message || e}`);
        }
        localTracks = audioTrack ? [audioTrack, rawCameraTrack] : [rawCameraTrack];
        playLocalHostPreview(rawCameraTrack);
        await applyAgoraBeautyEffect(rawCameraTrack);
        applyLocalPreviewCss();
        /* Agora beauty only on raw path — canvas path does its own look */
        ensureHostVideoVisible();
      };

      if (!wantBeauty) {
        if (beautyPipeline?.customTrack) {
          try {
            await lifeUnpublish([beautyPipeline.customTrack]);
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
          /* Raw is canvas source only — Agora beauty here doubles cost */
          try {
            if (rawCameraTrack?.setBeautyEffect) await rawCameraTrack.setBeautyEffect(false);
          } catch (_e) { }
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
          await lifeUnpublish([custom]);
        } catch (_e) { }
        stopBeautyPipeline();
        await restoreRawCamera();
        toast('Face effect not ready — try another look', 'warning');
        return;
      }

      try {
        if (rawCameraTrack?.setBeautyEffect) await rawCameraTrack.setBeautyEffect(false);
      } catch (_e) { }

      const oldVideo = getLocalVideoTrack();
      try {
        /* Publish beauty first so viewers never see a video-less gap */
        await lifePublish(custom);
        localTracks = audioTrack ? [audioTrack, custom] : [custom];
        applyLocalPreviewCss();
        playLocalHostPreview(custom);
        if (oldVideo && oldVideo !== custom) {
          try {
            await lifeUnpublish([oldVideo]);
          } catch (_e) { }
        }
        ensureHostVideoVisible();
        setLiveStreamVisible(true);
        liveDebugLog(`beauty published filter=${videoFilterId}`);
      } catch (e) {
        liveDebugLog(`beauty publish failed: ${e?.message || e}`);
        try {
          await lifeUnpublish([custom]);
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
    if (!isHost() || !agoraClient || !publishSucceeded) return;
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
        await lifeUnpublish([beautyPipeline.customTrack]);
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
        cam = await AgoraRTC.createCameraVideoTrack({
          facingMode: cameraFacing,
          encoderConfig: getLiveCameraEncoderConfig(),
        });
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
          await lifeUnpublish(stale);
        } catch (_e) { }
      }
      const already = (agoraClient.localTracks || []).includes?.(cam);
      if (!already) await lifePublish(cam);
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
    const canvasLive = Boolean(
      PUBLISH_CANVAS_BEAUTY &&
      beautyPipeline?.customTrack &&
      videoFilterId &&
      videoFilterId !== 'none'
    );
    if (canvasLive) {
      /* Draw loop reads videoFilterId — no republish needed on filter swap */
      try {
        if (rawCameraTrack?.setBeautyEffect) rawCameraTrack.setBeautyEffect(false);
      } catch (_e) { }
      return;
    }
    applyAgoraBeautyEffect(rawCameraTrack || getLocalVideoTrack()).catch(() => { });
    clearTimeout(window.__apBeautySyncTimer);
    window.__apBeautySyncTimer = setTimeout(() => {
      syncPublishedBeautyTrack().catch((e) => liveDebugLog(`beauty sync: ${e?.message || e}`));
    }, PUBLISH_CANVAS_BEAUTY ? 220 : 60);
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
        const next = btn.dataset.filter || 'none';
        if (next === videoFilterId) return;
        videoFilterId = next;
        try {
          localStorage.setItem('ap_live_beauty_filter', videoFilterId);
          localStorage.setItem('ap_live_beauty_filter_picked', '1');
        } catch (_e) { }
        rail.querySelectorAll('.ap-filter-chip').forEach((b) => b.classList.toggle('is-active', b === btn));
        clearTimeout(window.__apFilterPickToast);
        applyVideoFilter();
        window.__apFilterPickToast = setTimeout(() => {
          toast(VIDEO_FILTERS[videoFilterId]?.label || 'Original', 'success');
        }, 280);
        try {
          btn.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
        } catch (_e) { }
      });
    });
  }

  async function openVideoFilterSheet() {
    if (!isHost()) {
      toast('Filters are for video live only', 'info');
      return;
    }
    // Earn4U Beauty Engine sheet (lazy-loaded for hosts only)
    try {
      await ensureBeautyLoaded();
    } catch (_e) { }
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

  function classifyCameraLabel(label) {
    const s = String(label || '').toLowerCase();
    if (/back|rear|environment|world|trailing/i.test(s)) return 'environment';
    if (/front|user|face|selfie|facing/i.test(s)) return 'user';
    return null;
  }

  async function pickCameraDeviceId(AgoraRTC, nextFacing, currentId) {
    if (!AgoraRTC?.getCameras) return null;
    let cameras = [];
    try {
      cameras = await AgoraRTC.getCameras();
    } catch (_e) {
      return null;
    }
    if (!cameras?.length) return null;
    const envCam = cameras.find((c) => classifyCameraLabel(c.label) === 'environment');
    const userCam = cameras.find((c) => classifyCameraLabel(c.label) === 'user');
    const preferred =
      (nextFacing === 'environment' ? envCam : userCam) ||
      cameras.find((c) => c.deviceId && c.deviceId !== currentId) ||
      null;
    return preferred?.deviceId || null;
  }

  async function waitForLocalVideoFrames(track, timeoutMs = 2800) {
    if (!track) return false;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const mst = track.getMediaStreamTrack?.();
        if (mst && mst.readyState === 'ended') return false;
        const settings = mst?.getSettings?.() || {};
        if ((settings.width || 0) > 0 && (settings.height || 0) > 0) return true;
        const box = document.getElementById('liveLocalHost');
        const vid = box?.querySelector?.('video');
        if (vid && vid.readyState >= 2 && vid.videoWidth > 0) return true;
      } catch (_e) { }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }

  function applyHostPreviewMirror(localBox, facing) {
    if (!localBox) return;
    const wantMirror =
      hostMirrorOverride != null ? Boolean(hostMirrorOverride) : facing === 'user';
    localBox.classList.toggle('live-local-host-mirror', wantMirror);
    localBox.querySelectorAll('video').forEach((v) => {
      // Force override Agora/browser inline transforms so flip can't stick.
      v.style.setProperty('transform', wantMirror ? 'scaleX(-1)' : 'none', 'important');
    });
  }

  function toggleHostMirrorPreview() {
    const box = document.getElementById('liveLocalHost');
    if (!box) {
      toast('Mirror is available on video livestreams', 'info');
      return;
    }
    const currently = box.classList.contains('live-local-host-mirror');
    hostMirrorOverride = !currently;
    applyHostPreviewMirror(box, cameraFacing);
    toast(hostMirrorOverride ? 'Mirror on (local preview)' : 'Mirror off', 'success');
  }

  function playLocalHostPreview(videoTrack) {
    if (isPkLiveNow() && (isHost() || clientClaimsHost?.())) {
      paintPkSelfPreview(videoTrack);
      return;
    }
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
    setTimeout(() => applyHostPreviewMirror(localBox, cameraFacing), 200);
  }

  async function replaceHostCameraTrack(nextFacing) {
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    const oldVideo = getLocalVideoTrack();
    const audioTrack = localTracks.find((t) => (t.getTrackType?.() || t.trackMediaType) === 'audio');
    if (!agoraClient || !publishSucceeded) return null;

    // Unpublish beauty custom track BEFORE stopping it (stopping a published track = black video)
    if (beautyPipeline?.customTrack) {
      try {
        await lifeUnpublish([beautyPipeline.customTrack]);
      } catch (_e) { }
      stopBeautyPipeline();
    }
    try {
      const APB = window.APBeauty;
      if (APB?.camera?.getCustomTrack?.()) {
        try {
          await lifeUnpublish([APB.camera.getCustomTrack()]);
        } catch (_e) { }
        try {
          await APB.camera.stop?.();
        } catch (_e) { }
      }
    } catch (_e) { }

    const currentId = oldVideo?.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
    const cameraId = await pickCameraDeviceId(AgoraRTC, nextFacing, currentId);

    // Mobile WebViews often only allow one camera open — release old first.
    if (oldVideo) {
      try {
        await lifeUnpublish([oldVideo]);
      } catch (_e) { }
      try {
        oldVideo.stop();
        oldVideo.close();
      } catch (_e) { }
      await new Promise((r) => setTimeout(r, 120));
    }

    const createOpts = cameraId
      ? { cameraId, facingMode: nextFacing, encoderConfig: getLiveCameraEncoderConfig() }
      : { facingMode: nextFacing, encoderConfig: getLiveCameraEncoderConfig() };
    let newVideo;
    try {
      newVideo = await AgoraRTC.createCameraVideoTrack(createOpts);
    } catch (firstErr) {
      liveDebugLog(`camera create failed (${nextFacing}): ${firstErr?.message || firstErr}`);
      newVideo = await AgoraRTC.createCameraVideoTrack({
        facingMode: { exact: nextFacing },
        encoderConfig: '360p_1',
      }).catch(() =>
        AgoraRTC.createCameraVideoTrack({
          facingMode: nextFacing,
          encoderConfig: '360p_1',
        })
      );
    }
    rawCameraTrack = newVideo;
    try {
      await lifePublish(newVideo);
    } catch (pubErr) {
      try {
        newVideo.stop();
        newVideo.close();
      } catch (_e) { }
      throw pubErr;
    }

    localTracks = audioTrack ? [audioTrack, newVideo] : [newVideo];
    cameraFacing = detectCameraFacing(newVideo, nextFacing);
    if (cameraId) {
      try {
        const cams = await AgoraRTC.getCameras();
        const cam = cams.find((c) => c.deviceId === cameraId);
        const byLabel = classifyCameraLabel(cam?.label);
        if (byLabel) cameraFacing = byLabel;
      } catch (_e) { }
    }
    playLocalHostPreview(newVideo);
    ensureHostVideoVisible();
    const framesOk = await waitForLocalVideoFrames(newVideo, 2800);
    if (!framesOk) {
      liveDebugLog('camera frames not ready after flip');
    }
    applyVideoFilter();
    return newVideo;
  }

  async function switchCameraFacing() {
    if (!isHost()) {
      toast('Camera flip is for video live only', 'info');
      return;
    }
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
      const videoTrack = getLocalVideoTrack();

      // Prefer setDevice when beauty is off — less black-screen prone on front cam.
      const beautyOn = Boolean(
        beautyPipeline?.customTrack ||
        (window.APBeauty?.camera?.getCustomTrack?.()) ||
        (videoFilterId && videoFilterId !== 'none')
      );
      if (!beautyOn && videoTrack?.setDevice && AgoraRTC?.getCameras) {
        const currentId = videoTrack.getMediaStreamTrack?.()?.getSettings?.()?.deviceId;
        const deviceId = await pickCameraDeviceId(AgoraRTC, nextFacing, currentId);
        if (deviceId && deviceId !== currentId) {
          try {
            await videoTrack.setDevice(deviceId);
            rawCameraTrack = videoTrack;
            cameraFacing = detectCameraFacing(videoTrack, nextFacing);
            try {
              const cams = await AgoraRTC.getCameras();
              const cam = cams.find((c) => c.deviceId === deviceId);
              const byLabel = classifyCameraLabel(cam?.label);
              if (byLabel) cameraFacing = byLabel;
            } catch (_e) { }
            playLocalHostPreview(videoTrack);
            ensureHostVideoVisible();
            await waitForLocalVideoFrames(videoTrack, 2000);
            toast(cameraFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
            return;
          } catch (setErr) {
            liveDebugLog(`setDevice flip failed: ${setErr?.message || setErr}`);
          }
        }
      }

      // Full recreate (needed when beauty custom track is published).
      if (agoraClient && publishSucceeded) {
        try {
          await replaceHostCameraTrack(nextFacing);
          toast(cameraFacing === 'user' ? 'Front camera' : 'Back camera', 'success');
          return;
        } catch (recreateErr) {
          console.warn('[live] camera recreate failed, falling back', recreateErr);
        }
      }

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
          const deviceId = await pickCameraDeviceId(AgoraRTC, nextFacing, currentId);
          const pick = cameras.find((c) => c.deviceId === deviceId) ||
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
        video: { facingMode: { ideal: nextFacing } },
        audio: false,
      }).catch(() =>
        navigator.mediaDevices.getUserMedia({
          video: true,
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
        applyLiveBackground('live', roomState?.hostName);
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

  /**
   * Mic / remote volumes — equal for host and seats by default.
   *
   * INVARIANT: never scale by participant / seat count.
   * Minal (4429133) + Veena (7337852) device accounts only:
   * - higher uplink (send) so others hear them as host or seat
   * - listeners who share those accounts boost host playback as before
   */
  const LIVE_TRACK_VOLUME = 100;
  const LIVE_PUBLISHER_SEND_VOLUME = 140;
  const QUIET_DEVICE_ACCOUNTS = new Set([
    '4429133', /* Minal */
    '7337852', /* Veena */
    '42a3da61-ae9f-473f-8faf-1fbef5e9dd10',
    'db419b3a-a715-4d08-830c-b30592ae1b89',
  ]);
  const OEM_PUBLISHER_SEND_VOLUME = 220;
  const QUIET_NAME_RE = /^(mini|minal|meenal|minall|veena)$/i;
  /* Send level when THIS device account is publishing (host or seat) */
  const QUIET_DEVICE_SEND_VOLUME = 320;
  /* How loud others hear a quiet-device publisher (host or seat remote track) */
  const QUIET_DEVICE_REMOTE_PLAYBACK = 280;
  /* How loud a quiet-device listener hears the room host (existing behavior) */
  const QUIET_PHONE_HOST_PLAYBACK_VOLUME = 240;

  function isAndroidHostMicRisk() {
    try {
      return /Android/i.test(String(navigator.userAgent || ''));
    } catch (_e) {
      return false;
    }
  }

  function isOemHostMicRisk() {
    try {
      const ua = String(navigator.userAgent || '');
      return /Samsung|SM-[A-Z0-9]|Vivo|iQOO|OPPO|Realme|OnePlus|Xiaomi|Redmi|POCO|Infinix|Tecno/i.test(
        ua
      );
    } catch (_e) {
      return false;
    }
  }

  function isSamsungHostMicRisk() {
    return isOemHostMicRisk();
  }

  function accountKeyMatchesQuiet(idOrDisplay) {
    if (idOrDisplay == null || idOrDisplay === '') return false;
    return QUIET_DEVICE_ACCOUNTS.has(String(idOrDisplay).trim());
  }

  function nameLooksQuietReported(name) {
    const n = String(name || '')
      .trim()
      .split(/\s+/)[0];
    return Boolean(n) && QUIET_NAME_RE.test(n);
  }

  /** True when this device is a known quiet Samsung publisher (Mini / Minal / Veena). */
  function isQuietDevicePublisherMe() {
    try {
      const { id, displayId } = currentUserIds();
      if (accountKeyMatchesQuiet(displayId) || accountKeyMatchesQuiet(id)) return true;
      const me = currentUser();
      return (
        nameLooksQuietReported(me?.username) ||
        nameLooksQuietReported(me?.name) ||
        nameLooksQuietReported(me?.first_name) ||
        nameLooksQuietReported(me?.displayName)
      );
    } catch (_e) {
      return false;
    }
  }

  function isQuietPhoneHostListener() {
    return isQuietDevicePublisherMe();
  }

  function appUserIdForAgoraUid(agoraUid) {
    if (agoraUid == null) return null;
    try {
      const map = window.__apAgoraUidMap || {};
      const v = map[String(agoraUid)];
      if (v) return String(v);
    } catch (_e) { }
    return null;
  }

  function collectRoomPeople() {
    const out = [];
    try {
      if (roomState?.hostId || roomState?.hostName) {
        out.push({
          userId: roomState.hostId,
          displayId: roomState.hostDisplayId || roomState.host_display_id,
          agoraUid: roomState.hostAgoraUid,
        });
      }
    } catch (_h) { }
    for (const key of ['members', 'seats', 'guests', 'speakers']) {
      try {
        const raw = roomState?.[key];
        if (!raw) continue;
        const list = Array.isArray(raw) ? raw : Object.values(raw);
        for (const m of list) {
          if (m && typeof m === 'object') out.push(m);
        }
      } catch (_e) { }
    }
    return out;
  }

  function personIsQuietDevice(m) {
    if (!m || typeof m !== 'object') return false;
    return (
      accountKeyMatchesQuiet(m.userId || m.user_id || m.id) ||
      accountKeyMatchesQuiet(m.display_id || m.displayId || m.displayid) ||
      nameLooksQuietReported(m.name || m.username || m.displayName || m.nick)
    );
  }

  function isQuietDevicePublisherUid(agoraUid) {
    if (agoraUid == null) return false;
    try {
      if (window.__apQuietAgoraUids && window.__apQuietAgoraUids[String(agoraUid)]) {
        return true;
      }
    } catch (_z) { }
    const appId = appUserIdForAgoraUid(agoraUid);
    if (appId && accountKeyMatchesQuiet(appId)) return true;
    const people = collectRoomPeople();
    for (const m of people) {
      if (!personIsQuietDevice(m)) continue;
      const uid = m.userId || m.user_id || m.id;
      if (appId && uid != null && String(uid) === String(appId)) return true;
      const aUid = m.agoraUid != null ? m.agoraUid : m.agora_uid;
      if (aUid != null && String(aUid) === String(agoraUid)) return true;
    }
    /* Map resolved UUID → check if that user has quiet display_id in room */
    if (appId) {
      for (const m of people) {
        const uid = m.userId || m.user_id || m.id;
        if (uid != null && String(uid) === String(appId) && personIsQuietDevice(m)) {
          return true;
        }
      }
    }
    return false;
  }

  function isAgoraUidRoomHost(agoraUid) {
    if (agoraUid == null) return false;
    try {
      const map = window.__apAgoraUidMap || {};
      const appId = map[String(agoraUid)];
      if (appId && isRoomHostUserId(appId)) return true;
    } catch (_e) { }
    return false;
  }

  function localMicSendVolume() {
    if (isQuietDevicePublisherMe() && (isHost() || hasSpeakerSeat)) {
      return QUIET_DEVICE_SEND_VOLUME;
    }
    if ((isHost() || hasSpeakerSeat) && isOemHostMicRisk()) return OEM_PUBLISHER_SEND_VOLUME;
    if (isHost() || hasSpeakerSeat) return LIVE_PUBLISHER_SEND_VOLUME;
    return LIVE_TRACK_VOLUME;
  }

  function remotePlaybackVolume(userOrUid) {
    const uid =
      userOrUid != null && typeof userOrUid === 'object'
        ? userOrUid.uid
        : userOrUid;
    /* Everyone: hear Minal/Veena louder when they host or take a seat */
    if (uid != null && isQuietDevicePublisherUid(uid)) {
      return QUIET_DEVICE_REMOTE_PLAYBACK;
    }
    if (!isQuietPhoneHostListener()) return LIVE_TRACK_VOLUME;
    /* Minal/Veena listening: boost room host */
    if (uid == null || isAgoraUidRoomHost(uid)) return QUIET_PHONE_HOST_PLAYBACK_VOLUME;
    try {
      const map = window.__apAgoraUidMap || {};
      const hostId = roomState?.hostId;
      const hostMapped = hostId
        ? Object.keys(map).some((k) => String(map[k]) === String(hostId))
        : false;
      if (!hostMapped) return QUIET_PHONE_HOST_PLAYBACK_VOLUME;
    } catch (_e) {
      return QUIET_PHONE_HOST_PLAYBACK_VOLUME;
    }
    return LIVE_TRACK_VOLUME;
  }

  function logAudioTransition(event, extra) {
    const payload = {
      t: Date.now(),
      event,
      host: Boolean(isHost()),
      seat: Boolean(hasSpeakerSeat),
      samsung: isSamsungHostMicRisk(),
      oem: isOemHostMicRisk(),
      android: isAndroidHostMicRisk(),
      sendVol: localMicSendVolume(),
      remoteVol: remotePlaybackVolume(),
      ...(extra || {}),
    };
    try {
      liveDebugLog(`audio_tx ${event} ${JSON.stringify(payload)}`);
    } catch (_e) { }
    try {
      console.warn('[AP-AUDIO-TX]', event, payload);
    } catch (_e2) { }
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'temp_voice_route_debug', entry: payload })
      );
    } catch (_e3) { }
  }

  function disposeHostMicBoostGraph() {
    try {
      window.__apHostMicBoostGain?.disconnect?.();
    } catch (_e) { }
    try {
      window.__apHostMicBoostCtx?.close?.();
    } catch (_e2) { }
    try {
      window.__apHostMicRawStream?.getTracks?.().forEach((t) => t.stop());
    } catch (_e3) { }
    window.__apHostMicBoostGain = null;
    window.__apHostMicBoostCtx = null;
    window.__apHostMicRawStream = null;
  }

  async function pickBestHostMicrophoneId(rtc) {
    try {
      const list =
        (typeof rtc.getMicrophones === 'function' ? await rtc.getMicrophones() : null) ||
        (await navigator.mediaDevices?.enumerateDevices?.())?.filter((d) => d.kind === 'audioinput') ||
        [];
      if (!list.length) return undefined;
      const score = (label) => {
        const s = String(label || '').toLowerCase();
        /* Prefer BT/wired headset when present so host voice matches what they hear */
        if (/bluetooth|airpods|galaxy buds|wh-?\d|headset|headphone|usb.?audio|ear.?buds/i.test(s)) return 5;
        if (/voice.?recog|recognition|communication|voip/i.test(s)) return 0;
        if (/camcorder|camera|back|speaker.?phone|default/i.test(s)) return 3;
        if (/samsung|sm-/i.test(s)) return 2;
        return 1;
      };
      const ranked = [...list].sort((a, b) => score(b.label) - score(a.label));
      const best = ranked[0];
      liveDebugLog(`mic pick: ${best?.label || best?.deviceId || 'default'} score=${score(best?.label)}`);
      return best?.deviceId || undefined;
    } catch (_e) {
      return undefined;
    }
  }

  /** Exit Android communication mode before opening the mic (old + new app builds). */
  function leaveHostCommunicationAudioMode(reason) {
    try {
      logAudioTransition('leave_communication_mode', { reason: reason || 'pre_mic' });
      notifyLiveAudioRoute('enterPlayback', { reason: reason || 'host_pre_mic' });
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'force_speaker_audio',
          recording: false,
          bluetoothSafe: true,
          ts: Date.now(),
        })
      );
    } catch (_e) { }
  }

  /**
   * Android seats + all hosts: enterPlayback only (HW AEC in talk-mode = must-shout / silent host).
   * Desktop seats may still use enterTalk.
   */
  function applyPublisherNativeAudioRoute(reason) {
    const oem = isOemHostMicRisk();
    const android = isAndroidHostMicRisk();
    const seatTalking = Boolean(!isHost() && hasSpeakerSeat);
    if (seatTalking && !android) {
      logAudioTransition('native_enterTalk', { reason });
      notifyLiveAudioRoute('enterTalk', { bluetoothSafe: true, reason });
      return;
    }
    logAudioTransition('native_enterPlayback', { reason, seatTalking, oem, android });
    notifyLiveAudioRoute('enterPlayback', { reason });
  }

  async function createRoomMicrophoneTrack(AgoraRTC) {
    const rtc = AgoraRTC || window.AgoraRTC;
    if (!rtc?.createMicrophoneAudioTrack) throw new Error('Microphone API unavailable');
    const hostLike = Boolean(isHost());
    const seatLike = Boolean(!hostLike && hasSpeakerSeat);
    const oem = isOemHostMicRisk();
    const android = isAndroidHostMicRisk();
    liveDebugLog(
      `mic create host=${hostLike} seat=${seatLike} android=${android} oem=${oem} vol=${localMicSendVolume()}`
    );
    logAudioTransition('mic_create_start', { hostLike, seatLike, oem, android });

    /*
     * Same path for host + seats: leave talk/recording mode before getUserMedia
     * on Android so OEM HW AEC doesn't cancel uplink on some phones only.
     */
    if ((hostLike || seatLike) && android) {
      leaveHostCommunicationAudioMode(hostLike ? 'host_pre_mic' : 'android_seat_pre_mic');
      await new Promise((r) => setTimeout(r, 120));
    } else if (hostLike) {
      leaveHostCommunicationAudioMode('host_pre_mic');
      await new Promise((r) => setTimeout(r, 120));
    }

    disposeHostMicBoostGraph();
    /*
     * 3A = AGC + ANS. Samsung/OEM HW already runs AEC in the capture path;
     * extra AGC/ANS makes some hosts (Mini) sound delayed / “slow”.
     * Quiet-device publishers keep AGC on so others can hear them.
     */
    const quietPub = isQuietDevicePublisherMe();
    const threeA = Boolean(noiseReductionUiOn);
    const opts = {
      AEC: true,
      ANS: threeA && !oem,
      AGC: quietPub || (threeA && !oem),
      encoderConfig: 'speech_standard',
    };

    let audioTrack = null;
    try {
      audioTrack = await withTimeout(
        rtc.createMicrophoneAudioTrack({ ...opts }),
        25000,
        'Microphone access'
      );
    } catch (firstErr) {
      liveDebugLog(`mic create retry: ${firstErr?.message || firstErr}`);
      audioTrack = await withTimeout(
        rtc.createMicrophoneAudioTrack({
          AEC: true,
          ANS: threeA && !oem,
          AGC: quietPub || (threeA && !oem),
        }),
        25000,
        'Microphone access'
      );
    }

    await normalizeLocalMicLevel(audioTrack);
    if (quietPub && (hostLike || seatLike)) {
      scheduleQuietDeviceMicBoost(audioTrack);
    }
    return audioTrack;
  }

  let __quietDeviceMicBoostTimer = null;
  function scheduleQuietDeviceMicBoost(track) {
    try {
      clearInterval(__quietDeviceMicBoostTimer);
    } catch (_e) { }
    if (!isQuietDevicePublisherMe()) return;
    let n = 0;
    __quietDeviceMicBoostTimer = setInterval(() => {
      n += 1;
      if (!isQuietDevicePublisherMe() || (!isHost() && !hasSpeakerSeat) || n > 12) {
        clearInterval(__quietDeviceMicBoostTimer);
        __quietDeviceMicBoostTimer = null;
        return;
      }
      try {
        const audio = track || getLocalAudioTrack();
        if (!audio) return;
        if (micMuted) return;
        audio.setVolume?.(QUIET_DEVICE_SEND_VOLUME);
        if (typeof audio.setEnabled === 'function') audio.setEnabled(true);
        if (typeof audio.setMuted === 'function') audio.setMuted(false);
      } catch (_e2) { }
    }, 1500);
  }

  async function normalizeLocalMicLevel(track) {
    const audio = track || getLocalAudioTrack();
    if (!audio) return;
    try {
      if (typeof audio.setEnabled === 'function') await audio.setEnabled(!micMuted);
      if (typeof audio.setMuted === 'function') await audio.setMuted(Boolean(micMuted));
    } catch (_e) { }
    try {
      audio.setVolume?.(localMicSendVolume());
    } catch (_e2) { }
  }

  async function applyLocalMicMuteState() {
    const audio = getLocalAudioTrack();
    if (audio) {
      try {
        if (typeof audio.setMuted === 'function') await audio.setMuted(micMuted);
        if (typeof audio.setEnabled === 'function') await audio.setEnabled(!micMuted);
      } catch (_e) { }
      if (!micMuted) {
        try {
          audio.setVolume?.(localMicSendVolume());
        } catch (_e2) { }
      }
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
    stopPartyMeshKeepalive();
    __viewerAgoraEarlyPromise = null;
    __viewerAgoraEarlyChannel = null;
    await disposeAgoraClient('stopAgora');
    if (window.__apLocalStream) {
      window.__apLocalStream.getTracks().forEach((t) => t.stop());
      window.__apLocalStream = null;
    }
    updateLiveDebug({ agoraJoined: false, hostPublishing: false, publishSucceeded: false, remoteUsersCount: 0 });
    syncLiveUiState();
    notifyLiveAudioRoute('leaveLive', { reason: 'stopAgora' });
  }

  /* ---------- UI: chat / seats / gifts ---------- */
  function shouldShowMsg(msg, tab) {
    if (tab === 'all') return true;
    if (msg.type === 'mic_invite') return canModerateRoom();
    if (tab === 'room') return msg.type === 'system' || msg.type === 'mic_invite';
    if (tab === 'chat') return msg.type !== 'system' && msg.type !== 'mic_invite';
    return true;
  }

  function applyChatFilters(msg) {
    const uid = String(msg?.userId || msg?.fromUserId || msg?.senderId || '').trim();
    if (uid && isLiveUserBlocked(uid)) return false;
    if (msg.type === 'mic_invite' && !canModerateRoom()) return false;
    if (!shouldShowMsg(msg, chatTab)) return false;
    if (chatTab === 'all') return true;
    if (chatRegionFilter === 'room') {
      return (
        msg.type === 'system' ||
        msg.type === 'mic_invite' ||
        msg.scope === 'room' ||
        (!msg.scope && !msg.broadcast)
      );
    }
    if (chatRegionFilter === 'region') {
      return msg.type === 'system' || msg.type === 'mic_invite' || msg.scope === 'region';
    }
    if (chatRegionFilter === 'broadcast') {
      return msg.type === 'system' || msg.type === 'mic_invite' || msg.broadcast || msg.scope === 'broadcast';
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

  function formatGiftCoinPrice(n) {
    const v = Math.max(0, Number(n) || 0);
    return `${v.toLocaleString('en-IN')} coins`;
  }

  function updateGiftMeta() {
    const items = giftsForCategory(giftCategory);
    const g = items[selectedGiftIdx] || items[0];
    const banner = document.getElementById('giftRtpBanner');
    if (banner && g) {
      const slug = g.slug || giftSlugFor(g);
      const thumb = giftThumbnailUrl(g);
      const thumbHtml = thumb
        ? `<img class="gift-rtp-thumb" src="${escapeAttr(thumb)}" alt="" loading="lazy">`
        : '';
      const hasAnim = window.GiftAnimationOverlay?.hasAnimationForGift?.({
        giftSlug: slug,
        giftName: g.name,
        amount: g.cost,
      });
      const previewBtn = hasAnim
        ? `<button type="button" class="gift-anim-preview-btn" id="giftAnimPreviewBtn">Preview</button>`
        : '';
      banner.hidden = false;
      banner.innerHTML = `<span>${thumbHtml}【${escapeHtml(g.name)}】Creators receive <strong>90%</strong> · Platform 10% · ${formatGiftCoinPrice(g.cost)} each${previewBtn}</span>`;
      const previewEl = document.getElementById('giftAnimPreviewBtn');
      if (previewEl && !previewEl.dataset.bound) {
        previewEl.dataset.bound = '1';
        previewEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.GiftAnimationOverlay?.previewSlug?.(slug);
        });
      }
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
      /* Don't use native disabled — it eats taps. Visual state only. */
      sendBtn.disabled = false;
      sendBtn.classList.toggle('is-disabled', bal < total);
      sendBtn.title = bal < total ? 'Not enough gift coins' : 'Send gift';
      sendBtn.textContent = total > 0 ? `Send · ${formatGiftCoinPrice(total)}` : 'Send';
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
    if (isPartyRoomPage() && !isHost() && micLinkPending && !hasSpeakerSeat) {
      clearMicRequestState();
      toast('Seat request cancelled', 'info');
      return;
    }
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
    if (isPartyRoomPage() && isHost()) {
      if (!publishSucceeded) {
        if (isLanHttpInNativeWebView()) {
          toast('Voice needs HTTPS — run npm start in ap-services-app', 'warning');
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
    if (msg?.type === 'gift') {
      const fp = giftFingerprint(msg);
      if (fp) {
        if (fp.startsWith('id:')) return `gift|${fp}`;
        const atMs = msg?.at ? new Date(msg.at).getTime() : Number(msg?.at) || Date.now();
        return `gift|${fp}|${Math.floor(atMs / 8000)}`;
      }
    }
    /* Stable id: strip PK bridge suffix so original + bridged don't both land */
    if (msg?.id && !String(msg.id).startsWith('local-') && !String(msg.id).startsWith('pk-local-')) {
      return String(msg.id).replace(/-pk$/i, '');
    }
    if (msg?.type === 'system') {
      return `system|${String(msg.text || '').trim().toLowerCase()}`;
    }
    const atMs = msg?.at ? new Date(msg.at).getTime() : Number(msg?.at) || 0;
    const bucket = atMs ? Math.floor(atMs / 8000) : 0;
    return `${msg?.type || 'chat'}|${msg?.userId || msg?.user || ''}|${String(msg?.text || '').trim()}|${msg?.imageUrl || ''}|${bucket}`;
  }

  function findExistingGiftMessage(msg) {
    if (msg?.type !== 'gift') return -1;
    const fp = giftFingerprint(msg);
    if (!fp) return -1;
    const msgAt = msg?.at ? new Date(msg.at).getTime() : Date.now();
    const softOf = (x) =>
      giftFingerprint({
        ...x,
        id: null,
        gift_tx_id: null,
        gift: x.gift ? { ...x.gift, id: null, gift_tx_id: null } : undefined,
      });
    const soft = softOf(msg);
    return chatMessages.findIndex((m) => {
      if (m?.type !== 'gift') return false;
      const other = giftFingerprint(m);
      if (!other) return false;
      if (other === fp) return true;
      /* Same send via live:gift vs live:state (evt / User-Host) within a few seconds */
      if (!soft || softOf(m) !== soft) return false;
      const otherAt = m?.at ? new Date(m.at).getTime() : 0;
      return Math.abs(msgAt - otherAt) < 12000 || !otherAt;
    });
  }

  function pkChatSideForMsg(msg) {
    if (!pkBattleActive && !document.body.classList.contains('is-pk-mode')) return '';
    const mine = String(channelId() || '');
    if (!mine) return '';
    const from = String(msg?.fromChannel || msg?.channel || '');
    if (msg?.pkBridge || (from && from !== mine)) return 'away';
    if (from && from === mine) return 'home';
    /* local / own room traffic */
    if (!from && !msg?.pkBridge) return 'home';
    return 'home';
  }

  function rememberChatMessage(msg) {
    if (!msg) return;
    const text = String(msg.text || '');
    if (msg.type === 'system' && /watching|viewer count|people are watching/i.test(text)) return;
    /* Seat/mic requests already show as Agree/Decline — drop duplicate system lines */
    if (
      msg.type === 'system' &&
      /requested to join|requested mic|wants to join (on mic|the (live|stream)|a seat)/i.test(text)
    ) {
      return;
    }
    /* Deduplicate PK start / mutual spam if beginPkBattle re-fires */
    if (
      msg.type === 'system' &&
      /pk is mutual|click gifts to increase|vs .* — (friend|team|random) pk/i.test(text)
    ) {
      const soft = String(text).trim().toLowerCase();
      const already = chatMessages.some(
        (m) => m.type === 'system' && String(m.text || '').trim().toLowerCase() === soft
      );
      if (already) return;
    }
    const me = currentUser();
    const isMine =
      (me?.id && msg.userId && String(msg.userId) === String(me.id)) ||
      (msg.user && me && displayName(me) === msg.user);
    if (isMine && msg.id && !String(msg.id).startsWith('local-')) {
      const pendingIdx = chatMessages.findIndex(
        (m) =>
          String(m.id || '').startsWith('local-') &&
          m.text === msg.text &&
          (m.imageUrl || '') === (msg.imageUrl || '') &&
          (m.user === msg.user || String(m.userId) === String(msg.userId))
      );
      if (pendingIdx >= 0) chatMessages.splice(pendingIdx, 1);
    }
    const pic = getChatProfilePic(msg);
    const side = pkChatSideForMsg(msg);
    const enriched = {
      ...msg,
      profilePic: pic || msg.profilePic || null,
      pkSide: side || msg.pkSide || null,
    };
    if (enriched.userId && enriched.profilePic) cacheChatProfile(enriched.userId, enriched.profilePic);
    if (enriched.userId && window.Cosmetics?.prefetchUsers) Cosmetics.prefetchUsers([enriched.userId]);
    const giftIdx = findExistingGiftMessage(enriched);
    if (giftIdx >= 0) {
      const prev = chatMessages[giftIdx];
      chatMessages[giftIdx] = {
        ...prev,
        ...enriched,
        id: enriched.id || prev.id,
        gift: { ...(prev.gift || {}), ...(enriched.gift || {}) },
        profilePic: enriched.profilePic || prev.profilePic || null,
        pkSide: enriched.pkSide || prev.pkSide || null,
      };
      return;
    }
    const key = chatMsgKey(msg);
    const existingIdx = chatMessages.findIndex((m) => chatMsgKey(m) === key);
    if (existingIdx >= 0) {
      const prev = chatMessages[existingIdx];
      /* Prefer non-bridged copy so we don't thrash in place repeatedly */
      if (prev.pkBridge && !enriched.pkBridge) {
        chatMessages[existingIdx] = {
          ...prev,
          ...enriched,
          profilePic: enriched.profilePic || prev.profilePic || null,
          pkSide: enriched.pkSide || prev.pkSide || null,
        };
      } else {
        chatMessages[existingIdx] = {
          ...prev,
          profilePic: enriched.profilePic || prev.profilePic || null,
          pkSide: enriched.pkSide || prev.pkSide || null,
        };
      }
      return;
    }
    /* Soft text+user dedupe within 12s for regular chat */
    if (msg.type !== 'gift' && msg.type !== 'mic_invite' && text) {
      const now = Date.now();
      const softDup = chatMessages.findIndex((m) => {
        if ((m.type || 'chat') !== (msg.type || 'chat')) return false;
        if (String(m.text || '') !== text) return false;
        if (String(m.userId || m.user || '') !== String(msg.userId || msg.user || '')) return false;
        const a = m.at ? new Date(m.at).getTime() : 0;
        return !a || Math.abs(now - a) < 12000;
      });
      if (softDup >= 0) return;
    }
    if (chatMessages.some((m) => chatMsgKey(m) === key)) return;
    chatMessages.push(enriched);
    if (chatMessages.length > 250) chatMessages = chatMessages.slice(-250);
  }

  function renderChatFeed() {
    const feed = document.getElementById('partyChatFeed');
    if (!feed) return;
    /* Only auto-scroll if the user was already near the bottom (within 60 px) */
    const wasNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
    feed.innerHTML = '';
    const filtered = chatMessages.filter((m) => applyChatFilters(m));
    /* Pending mic requests always render last (bottom / latest) */
    const pendingMic = filtered.filter(
      (m) => m.type === 'mic_invite' && (m.inviteStatus || 'pending') === 'pending'
    );
    const rest = filtered.filter(
      (m) => !(m.type === 'mic_invite' && (m.inviteStatus || 'pending') === 'pending')
    );
    [...rest, ...pendingMic].forEach((msg) => {
      const div = document.createElement('div');
      if (msg.type === 'system') {
        const isJoin = /\bjoined\b/i.test(msg.text || '');
        const isLeave = /\bleft\b/i.test(msg.text || '');
        const uid = String(msg.userId || '');
        const uname = msg.user || String(msg.text || '').replace(/\s+(joined|left).*$/i, '').trim() || 'User';
        div.className =
          'party-chat-msg system' +
          (isJoin ? ' join-msg' : '') +
          (isLeave ? ' leave-msg' : '') +
          (uid ? ' is-tappable' : '');
        if (uid) {
          div.innerHTML = `<button type="button" class="party-chat-sys-user" data-chat-user="${escapeAttr(uname)}" data-chat-uid="${escapeHtml(uid)}">${escapeHtml(msg.text || '')}</button>`;
          div.querySelector('.party-chat-sys-user')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileSheet(uname, uid);
          });
        } else {
          div.textContent = msg.text || '';
        }
      } else if (msg.type === 'mic_invite') {
        const uid = String(msg.inviteUserId || msg.userId || '');
        const uname = msg.inviteName || msg.user || 'Guest';
        const status = msg.inviteStatus || 'pending';
        const pic = msg.profilePic || null;
        div.className = 'party-chat-msg party-chat-mic-invite' + (status !== 'pending' ? ' is-resolved' : '');
        div.dataset.micInviteUid = uid;
        if (status === 'pending') {
          div.innerHTML =
            `<button type="button" class="party-chat-avatar-btn" data-chat-user="${escapeAttr(uname)}" data-chat-uid="${escapeHtml(uid)}">` +
            `<img src="${escapeAttr(avatarUrl(uname, pic))}" alt="" loading="lazy"></button>` +
            `<div class="party-chat-mic-body">` +
            `<div class="party-chat-mic-text"><strong>${escapeHtml(uname)}</strong> wants to join on mic</div>` +
            `<div class="party-chat-mic-actions">` +
            `<button type="button" class="party-chat-mic-deny" data-mic-deny="${escapeHtml(uid)}">Decline</button>` +
            `<button type="button" class="party-chat-mic-agree" data-mic-agree="${escapeHtml(uid)}">Agree</button>` +
            `</div></div>`;
        } else {
          const label = status === 'accepted' ? 'Agreed' : 'Declined';
          div.innerHTML =
            `<span class="party-chat-mic-resolved">${label}: <strong>${escapeHtml(uname)}</strong> mic request</span>`;
        }
        div.querySelector('.party-chat-avatar-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openProfileSheet(uname, uid);
        });
      } else if (msg.type === 'gift') {
        div.className = 'party-chat-msg party-chat-msg--gift is-tappable';
        const g = msg.gift || {};
        const fromId = String(msg.userId || g.fromUserId || g.senderId || '');
        const toId = String(g.toUserId || g.receiver_id || g.recipientId || '');
        const fromName = msg.user || g.from || 'User';
        const toName = g.to || g.recipientName || 'Host';
        div.innerHTML =
          `<button type="button" class="party-chat-gift-ico party-chat-gift-tap" data-gift-user="${escapeAttr(fromName)}" data-gift-uid="${escapeHtml(fromId)}" data-gift-to="${escapeAttr(toName)}" data-gift-toid="${escapeHtml(toId)}" aria-label="Open gift profile">${escapeHtml(g.emoji || '🎁')}</button>` +
          `<span class="party-chat-gift-body">` +
          `<button type="button" class="party-chat-gift-tap" data-gift-user="${escapeAttr(fromName)}" data-gift-uid="${escapeHtml(fromId)}"><strong>${escapeHtml(fromName)}</strong></button>` +
          ` sent ${escapeHtml(g.emoji || '🎁')} to ` +
          `<button type="button" class="party-chat-gift-tap" data-gift-user="${escapeAttr(toName)}" data-gift-uid="${escapeHtml(toId)}"><strong>${escapeHtml(toName)}</strong></button>` +
          ` · ${formatGiftCount(g.amount || g.coins || 0)} coins</span>`;
        div.querySelectorAll('.party-chat-gift-tap').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const uid = btn.dataset.giftUid || '';
            const name = btn.dataset.giftUser || 'User';
            if (uid) openProfileSheet(name, uid);
            else if (name) openProfileSheet(name, '');
          });
        });
        div.addEventListener('click', (e) => {
          if (e.target.closest('.party-chat-gift-tap')) return;
          const giftTo = toId || fromId;
          const giftName = toId ? toName : fromName;
          if (giftTo) openGiftSheet(giftName, giftTo);
          else if (fromId) openProfileSheet(fromName, fromId);
        });
      } else {
        const pkSide = msg.pkSide || pkChatSideForMsg(msg);
        div.className =
          'party-chat-msg' +
          (pkSide === 'away' ? ' is-pk-away' : '') +
          (pkSide === 'home' && (pkBattleActive || document.body.classList.contains('is-pk-mode'))
            ? ' is-pk-home'
            : '');
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
        const sideTag =
          pkSide === 'away'
            ? '<span class="party-chat-pk-tag away">Rival</span>'
            : pkSide === 'home' && (pkBattleActive || document.body.classList.contains('is-pk-mode'))
              ? '<span class="party-chat-pk-tag home">Us</span>'
              : '';
        div.innerHTML =
          `<button type="button" class="party-chat-avatar-btn${adminAvatarFrameClass(admin)}" data-chat-user="${escapeAttr(msg.user || 'User')}" data-chat-uid="${escapeHtml(String(uid))}">` +
          `<img src="${escapeAttr(avatarSrc)}" alt="" data-name="${escapeAttr(msg.user || 'User')}" data-avatar-src="${escapeAttr(pic || '')}" loading="lazy" decoding="async" fetchpriority="low">${adminAvatarTagHtml(admin)}</button>` +
          `<div class="party-chat-body">` +
          `<div class="party-chat-meta">${badge}${adminBadge}${sideTag}` +
          `<button type="button" class="party-chat-user-btn" data-chat-user="${escapeAttr(msg.user || 'User')}" data-chat-uid="${escapeHtml(String(uid))}">` +
          `<span class="user${admin ? ' is-admin-name' : ''}">${escapeHtml(msg.user)}</span></button>` +
          `${canModerateRoom() ? `<button type="button" class="party-chat-mod-btn" aria-label="Moderate message" data-msg-id="${escapeAttr(String(msg.id || ''))}"><i class="fas fa-ellipsis-v" aria-hidden="true"></i></button>` : ''}` +
          `</div>` +
          (msg.text ? `<span class="party-chat-text${window.Cosmetics ? ' ' + Cosmetics.chatBubbleClasses(Cosmetics.getCachedForUser(uid)?.chatBubble) : ''}">${escapeHtml(msg.text)}</span>` : '') +
          (msg.imageUrl
            ? `<div class="party-chat-media"><img src="${escapeAttr(resolveMediaUrl(msg.imageUrl))}" alt="Photo" class="party-chat-image" loading="lazy" decoding="async"></div>`
            : '') +
          `</div>`;
        const img = div.querySelector('.party-chat-avatar-btn img');
        if (img) {
          img.onerror = () => {
            img.onerror = null;
            img.src = avatarUrl(msg.user, null);
          };
        }
        div.querySelectorAll('.party-chat-avatar-btn, .party-chat-user-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openProfileSheet(btn.dataset.chatUser || 'User', btn.dataset.chatUid || '');
          });
        });
        const modBtn = div.querySelector('.party-chat-mod-btn');
        if (modBtn) {
          modBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openChatMessageModMenu({ ...msg, type: msg.type || 'chat' }, modBtn);
          });
          div.addEventListener('contextmenu', (e) => {
            if (!canModerateRoom()) return;
            e.preventDefault();
            openChatMessageModMenu({ ...msg, type: msg.type || 'chat' }, modBtn);
          });
        }
      }
      feed.appendChild(div);
    });
    bindMicInviteChatActions();
    window.SocialUI?.bindAvatarFallbacks?.(feed);
    if (wasNearBottom) feed.scrollTop = feed.scrollHeight;
    bindChatFeedScroll();
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
    const msgs = roomState?.messages || [];
    if (chatClearedAt) {
      /* After a clear, drop every message from the server state snapshot for 30 s.
       * The server marks them deleted, but a state broadcast queued before the
       * clear DB commit can still carry stale messages. After 30 s the server DB
       * is consistent and we can trust incoming messages again. */
      const age = Date.now() - chatClearedAt;
      if (age < 30000) {
        /* Completely ignore server messages — only real-time live:chat events pass */
        renderChatFeed();
        return;
      }
      /* 30 s passed — trust server again */
      chatClearedAt = 0;
    }
    msgs.forEach((m) => {
      const enriched = { ...m, profilePic: m.profilePic || getChatProfilePic(m) };
      rememberChatMessage(enriched);
    });
    renderChatFeed();
  }

  function renderSeatButton(s, seatNum, tierCls) {
    if (!s || s.empty) {
      const emptyLabel = isPartyRoomPage() ? `No.${seatNum}` : 'Open';
      return `<button type="button" class="party-seat is-empty ${tierCls}" data-join-seat data-seat-num="${seatNum}">
        <div class="seat-avatar seat-avatar--empty"><span class="seat-num">${seatNum}</span><span class="seat-plus">+</span></div>
        <span class="seat-name">${emptyLabel}</span></button>`;
    }
    const hostCls = s.host ? ' is-host' : '';
    const speaking = s.speaking ? ' is-speaking' : '';
    const mutedCls = s.muted ? ' is-muted' : '';
    const crown = s.host ? '<span class="seat-crown">👑</span>' : '';
    const admin = memberIsAdminMarked(s) || isAdminUserId(s.userId);
    const adminBadge =
      !s.host && admin ? '<span class="seat-admin-badge">Admin</span>' : '';
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
          <img src="${avatarUrl(s.name, s.profilePic || liveProfilePic(s.userId, s.host ? resolveHostProfilePic() : null))}" alt="" data-name="${escapeAttr(s.name || 'User')}" loading="lazy" decoding="async">
          ${waveBars}
        </div>
        <span class="seat-name">${escapeHtml(s.name)}</span>
        ${Number(s.gifts) > 0 ? `<span class="seat-gifts">🎁 ${formatGiftCount(s.gifts)}</span>` : ''}
      </button>`;
  }

  function patchSeatMuteUi(userId, muted) {
    const container = document.getElementById('partySeats');
    if (!container || !userId) return;
    container.querySelectorAll('.party-seat[data-user-id]').forEach((btn) => {
      if (String(btn.dataset.userId) !== String(userId)) return;
      btn.classList.toggle('is-muted', Boolean(muted));
      if (muted) btn.classList.remove('is-speaking');
    });
    document.querySelectorAll(`.ap-guest-seat[data-guest-id="${String(userId)}"]`).forEach((btn) => {
      btn.classList.toggle('is-muted', Boolean(muted));
      btn.classList.toggle('is-on-mic', !muted);
      if (muted) btn.classList.remove('is-speaking');
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

  function buildPartySeatsSlots(hostName) {
    const me = displayName(currentUser());
    const meId = currentUser()?.id ? String(currentUser().id) : '';
    const hosting = isHost();
    const hostPic = resolveHostProfilePic();
    const host = {
      name: (hosting ? roomState?.hostName || me : hostName) || 'Host',
      userId: hosting ? meId : roomState?.hostId || '',
      profilePic: hostPic || getStreamCoverUrl(hostName),
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

    const maxSeats = partyMaxSeats();
    const slots = new Array(maxSeats).fill(null);
    slots[PARTY_HOST_SLOT - 1] = host;
    const unplaced = [];
    guests.forEach((g) => {
      const idx =
        g.seatIndex != null ? Number(g.seatIndex) - 1 : g.seat_index != null ? Number(g.seat_index) - 1 : -1;
      if (idx >= 0 && idx < maxSeats && idx !== PARTY_HOST_SLOT - 1 && !slots[idx]) {
        slots[idx] = { ...g, host: false };
      } else {
        unplaced.push({ ...g, host: false });
      }
    });
    let guestIdx = 0;
    for (let i = 0; i < maxSeats; i += 1) {
      if (i === PARTY_HOST_SLOT - 1 || slots[i]) continue;
      const next = unplaced[guestIdx];
      if (next) {
        slots[i] = next;
        guestIdx += 1;
      } else {
        slots[i] = { empty: true, seatNum: i + 1 };
      }
    }
    return { slots, maxSeats, host };
  }

  function partySeatsStructureKey(slots, maxSeats) {
    return JSON.stringify({
      n: maxSeats,
      s: slots.map((slot, i) => {
        if (!slot || slot.empty) return ['e', i + 1];
        return [
          slot.host ? 'h' : 'g',
          String(slot.userId || ''),
          slot.name || '',
          Number(slot.gifts) || 0,
          memberIsAdminMarked(slot) || isAdminUserId(slot.userId) ? 1 : 0,
        ];
      }),
    });
  }

  function patchPartySeatActivity(slots) {
    const container = document.getElementById('partySeats');
    if (!container) return;
    slots.forEach((slot, idx) => {
      if (!slot || slot.empty) return;
      const uid = String(slot.userId || '');
      if (!uid) return;
      container.querySelectorAll(`.party-seat[data-user-id="${uid}"]`).forEach((btn) => {
        btn.classList.toggle('is-muted', Boolean(slot.muted));
        btn.classList.toggle('is-speaking', Boolean(slot.speaking) && !slot.muted);
      });
    });
    if (isHost()) {
      container.querySelectorAll('.party-seat.is-host').forEach((btn) => {
        btn.classList.toggle('is-muted', micMuted);
        btn.classList.toggle('is-speaking', !micMuted);
      });
    }
  }

  function renderPartyHostCpBanner() {
    const banner = document.getElementById('partyCpBanner');
    const couple = document.getElementById('partyCpCouple');
    if (!banner || !couple || !isPartyRoomPage()) return;

    const hostId = roomState?.hostId ? String(roomState.hostId) : '';
    if (!hostId) {
      banner.hidden = true;
      banner.setAttribute('aria-hidden', 'true');
      couple.innerHTML = '';
      return;
    }

    const join = global.joinApiUrl || ((p) => '/api' + p);
    const headers = { Accept: 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;

    fetch(join('/cp/profile/' + encodeURIComponent(hostId)), { credentials: 'include', headers })
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        if (!json?.success || !json.data?.partner) {
          banner.hidden = true;
          banner.setAttribute('aria-hidden', 'true');
          couple.innerHTML = '';
          return;
        }
        const d = json.data;
        const av = (name, pic) => {
          if (global.CpProfileCard?.avatarUrl) return CpProfileCard.avatarUrl(name, pic);
          return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=ec4899&color=fff`;
        };
        const ringId = d.ringId || d.ring?.id || 'cp';
        couple.innerHTML =
          `<img src="${av(d.user.name, d.user.profilePic)}" alt="">` +
          `<div class="party-cp-ring-badge"><span class="party-cp-ring-slot"></span></div>` +
          `<img src="${av(d.partner.name, d.partner.profilePic)}" alt="">` +
          `<span class="party-cp-couple-mini-label">CP</span>`;
        const slot = couple.querySelector('.party-cp-ring-slot');
        if (slot && global.CpRings) {
          (global.CpRings.mountWorn || global.CpRings.mount)(slot, ringId, 'sm', d.cpLevel || 0);
        }
        banner.hidden = false;
        banner.removeAttribute('aria-hidden');
      })
      .catch(() => {
        banner.hidden = true;
        banner.setAttribute('aria-hidden', 'true');
        couple.innerHTML = '';
      });
  }

  let hostBadgePaintSeq = 0;
  let hostBadgePaintedId = '';

  async function paintPartyHostBadges({ force = false } = {}) {
    const el = document.getElementById('partyHostBadges');
    const hostId = roomState?.hostId ? String(roomState.hostId) : '';
    if (!el || !hostId) return;
    if (!isPartyRoomPage() && !isLiveRoomPage()) return;
    if (
      !force &&
      hostBadgePaintedId === hostId &&
      el.dataset.badgeReady === '1' &&
      (el.dataset.badgeHtml || el.innerHTML.trim())
    ) {
      return;
    }
    const seq = ++hostBadgePaintSeq;
    try {
      if (global.ProfileBadges?.fetchAndPaintLiveHost) {
        await global.ProfileBadges.fetchAndPaintLiveHost(el, hostId, { link: false });
      } else if (global.ProfileBadges?.fetchBadges) {
        const badges = await global.ProfileBadges.fetchBadges(hostId);
        if (seq !== hostBadgePaintSeq) return;
        const html = global.ProfileBadges.formatLiveProfileBadgesHtml
          ? global.ProfileBadges.formatLiveProfileBadgesHtml(badges, { link: false })
          : global.ProfileBadges.formatProfileStatusBadgesHtml?.(badges, { link: false }) || '';
        global.ProfileBadges.applyBadgeHtml?.(el, html);
      }
      if (seq !== hostBadgePaintSeq) return;
      hostBadgePaintedId = hostId;
      el.dataset.badgeReady = '1';
    } catch (_e) {
      if (seq !== hostBadgePaintSeq) return;
      el.hidden = true;
      delete el.dataset.badgeReady;
      delete el.dataset.badgeHtml;
    }
  }

  function renderPartyCpOnSeats() {
    renderPartyHostCpBanner();
    const wrap = document.querySelector('body[data-live-page="party-room"] .party-seats-wrap');
    const grid = document.getElementById('partySeats');
    if (!wrap || !grid || !isPartyRoomPage()) return;

    wrap.querySelectorAll('.party-cp-seat-ring').forEach((el) => el.remove());
    grid.querySelectorAll('.party-seat.is-cp-partner').forEach((el) => el.classList.remove('is-cp-partner'));

    const pairs = roomState?.cpInRoom || [];
    if (!pairs.length) return;

    pairs.forEach((pair) => {
      const idA = String(pair.userA?.userId || '');
      const idB = String(pair.userB?.userId || '');
      const ringId = pair.ring?.id || pair.ringId || 'ruby';
      if (!idA || !idB) return;

      const seatA = idA ? grid.querySelector(`.party-seat[data-user-id="${CSS.escape(idA)}"]:not(.is-empty)`) : null;
      const seatB = idB ? grid.querySelector(`.party-seat[data-user-id="${CSS.escape(idB)}"]:not(.is-empty)`) : null;
      const seated = [seatA, seatB].filter(Boolean);
      if (!seated.length) return;

      seated.forEach((seat) => seat.classList.add('is-cp-partner'));

      const bridge = document.createElement('div');
      bridge.className = 'party-cp-seat-ring';
      bridge.setAttribute('aria-hidden', 'true');
      bridge.title = pair.ring?.name ? `CP · ${pair.ring.name}` : 'CP couple';
      bridge.innerHTML = '<span class="party-cp-seat-ring-slot"></span>';
      wrap.appendChild(bridge);

      const rectWrap = wrap.getBoundingClientRect();
      let cx;
      let cy;
      if (seatA && seatB) {
        const rA = seatA.getBoundingClientRect();
        const rB = seatB.getBoundingClientRect();
        cx = (rA.left + rA.right + rB.left + rB.right) / 4 - rectWrap.left;
        cy = (rA.top + rA.bottom + rB.top + rB.bottom) / 4 - rectWrap.top;
      } else {
        const r = seated[0].getBoundingClientRect();
        cx = (r.left + r.right) / 2 - rectWrap.left;
        cy = r.top - rectWrap.top - 8;
      }

      bridge.style.left = `${Math.round(cx)}px`;
      bridge.style.top = `${Math.round(cy)}px`;
      const cpLevel = Number(pair.cpLevel) || 0;
      global.CpRings?.mountWorn?.(
        bridge.querySelector('.party-cp-seat-ring-slot'),
        ringId,
        seatA && seatB ? 'md' : 'sm',
        cpLevel
      ) ||
        global.CpRings?.mount?.(
          bridge.querySelector('.party-cp-seat-ring-slot'),
          ringId,
          seatA && seatB ? 'md' : 'sm',
          cpLevel
        );
    });
  }

  function renderPartySeats(hostName) {
    const container = document.getElementById('partySeats');
    if (!container) return;

    const { slots, maxSeats, host } = buildPartySeatsSlots(hostName);
    const structureKey = partySeatsStructureKey(slots, maxSeats);
    if (structureKey === lastPartySeatsStructureKey) {
      patchPartySeatActivity(slots);
      paintHostAvatarImg(document.getElementById('partyHostAvatar'), hostName);
      renderPartyCpOnSeats();
      return;
    }
    lastPartySeatsStructureKey = structureKey;

    const tiers = getPartySeatLayout(maxSeats);

    container.innerHTML = tiers
      .map(
        (tier) => `
      <div class="party-seat-row ${tier.row || 'party-seat-row--md'}">
        ${tier.indices.map((idx) => renderSeatButton(slots[idx], idx + 1, tier.cls)).join('')}
      </div>`
      )
      .join('');

    bindPartySeatDelegation();
    if (canModerateRoom()) bindSeatDragDrop(container);
    window.SocialUI?.bindAvatarFallbacks?.(container);
    paintHostAvatarImg(document.getElementById('partyHostAvatar'), hostName);
    scheduleFitPartySeatsToViewport();
    renderPartyCpOnSeats();
  }

  function scheduleFitPartySeatsToViewport() {
    if (!isPartyRoomPage()) return;
    if (partySeatsFitTimer) clearTimeout(partySeatsFitTimer);
    partySeatsFitTimer = setTimeout(() => {
      partySeatsFitTimer = null;
      fitPartySeatsToViewport();
    }, 50);
  }

  function fitPartySeatsToViewport() {
    if (!isPartyRoomPage()) return;
    const wrap = document.querySelector('body[data-live-page="party-room"] .party-seats-wrap');
    const grid = document.getElementById('partySeats');
    if (!wrap || !grid) return;
    grid.style.transform = 'none';
    grid.style.marginBottom = '0';
    const available = wrap.clientHeight;
    const needed = grid.scrollHeight;
    if (available > 0 && needed > available) {
      const scale = Math.max(0.52, Math.min(1, available / needed));
      grid.style.transform = `scale(${scale})`;
      grid.style.marginBottom = `${Math.round((needed * (scale - 1)) / 2)}px`;
    }
    renderPartyCpOnSeats();
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
      if (micLinkPending) clearMicRequestState();
      /* Seat accept handler owns the first publish — don't race leave/rejoin here */
      const seatPromoteFresh = Date.now() - seatPromoteAt < 12000;
      if (
        !isHost() &&
        !publishSucceeded &&
        !guestPublishInProgress &&
        !seatPromoteFresh &&
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
        /* Don't clear mid-publish or right after host accept — stale state races. */
        if (guestPublishInProgress || Date.now() - seatPromoteAt < 8000) {
          /* keep hasSpeakerSeat */
        } else {
          hasSpeakerSeat = false;
          guestPublishAttempted = false;
        }
      }
    }
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    if (joinBtn) {
      joinBtn.hidden = true;
      joinBtn.style.display = 'none';
      joinBtn.setAttribute('aria-hidden', 'true');
      joinBtn.style.pointerEvents = 'none';
    }
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    const hostIdNow = roomState?.hostId ? String(roomState.hostId) : '';
    if (hostIdNow && hostIdNow !== hostBadgePaintedId) {
      const hostBadgeEl = document.getElementById('partyHostBadges');
      if (hostBadgeEl) {
        hostBadgeEl.innerHTML = '';
        hostBadgeEl.hidden = true;
        delete hostBadgeEl.dataset.badgeReady;
        delete hostBadgeEl.dataset.badgeHtml;
      }
    }
    if (hostEl) {
      const full = hostName || 'Host';
      hostEl.textContent = full;
      hostEl.title = full;
    }
    paintPartyHostBadges();
    if (hostImg) {
      paintHostAvatarImg(hostImg, hostName, getStreamCoverUrl(hostName));
    }
    const editLiveBtn = document.getElementById('liveEditPresentationBtn');
    if (editLiveBtn) {
      const showEdit = Boolean(isHost() || clientClaimsHost());
      editLiveBtn.hidden = !showEdit;
      editLiveBtn.style.display = showEdit ? '' : 'none';
    }

    const vc = document.getElementById('liveViewerCount');
    if (vc && roomState) {
      const n = roomState.viewers || (isHost() ? 1 : 0);
      vc.textContent = isLiveRoomPage() ? `${n} joined` : String(n);
    }
    renderTopGifters();
    const hearts = document.getElementById('partyHearts');
    if (hearts) hearts.textContent = String(roomState?.gifts?.length || 0);

    if (document.getElementById('partySeats')) {
      renderPartySeats(hostName);
      renderPartyCpOnSeats();
    }
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
    if (rid) rid.textContent = formatLiveRoomIdLine(ch);
    const partyRid = document.getElementById('partyRoomId') || document.getElementById('partyRoomIdLive');
    if (partyRid) partyRid.textContent = 'ID:' + ch.slice(-10);
    updateModeBadge('video', isHost() && isActuallyLive());
    updateDynamicStats();
    syncToolBadges();
    renderQuickChips();
    syncMicButtonUi();
    syncChatMuteUi();
    syncHostBarUi();
    syncJoinRequestsFromState();
    if (roomState?.roomStyle?.backgroundId) applyRoomBackground(roomState.roomStyle.backgroundId);
    syncPartyAnnouncement();
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
    const amount = Number(gift.amount || gift.coins || gift.cost || 0) || 0;
    const qty = Math.max(1, Number(gift.qty || gift.quantity || 1) || 1);
    const costLabel = amount > 0 ? ` · ${formatGiftCoinPrice(amount)}` : '';
    const qtyLabel = qty > 1 ? ` ×${qty}` : '';
    el.innerHTML = `<img src="${avatarUrl(gift.from)}" alt=""><span><strong>${escapeHtml(gift.from)}</strong> sent ${gift.emoji || '🎁'}${qtyLabel}${costLabel}</span>`;
    el.classList.add('is-visible');
    clearTimeout(el._hide);
    el._hide = setTimeout(() => el.classList.remove('is-visible'), 4500);
  }

  function updatePkBar() {
    if (window.SocialFX?.pkScoreUpdate) {
      SocialFX.pkScoreUpdate(pkScoreLeft, pkScoreRight);
    }
    const total = pkScoreLeft + pkScoreRight || 1;
    const leftPct = Math.max(8, Math.min(92, Math.round((pkScoreLeft / total) * 100)));
    const bar = document.getElementById('apPkBarLeft');
    const scoreL = document.getElementById('apPkScoreLeft');
    const scoreR = document.getElementById('apPkScoreRight');
    if (bar) {
      bar.classList.add('ap-pk-bar-fill');
      bar.style.width = leftPct + '%';
    }
    if (scoreL) scoreL.textContent = String(pkScoreLeft);
    if (scoreR) scoreR.textContent = String(pkScoreRight);
    syncPkStageUi();
  }

  function tickPkTimer() {
    const el = document.getElementById('apPkTimer');
    if (!el || !document.body.classList.contains('is-pk-mode')) return;
    if (pkTimerSec <= 0) {
      el.textContent = '00:00';
      setPkStatus('Time is up — ending battle…');
      if (!pkEndRequested && canEndPkBattle() && liveSocket?.connected) {
        requestStopPk({ skipConfirm: true });
      }
      return;
    }
    pkTimerSec = Math.max(0, pkTimerSec - 1);
    el.textContent = formatPkClock(pkTimerSec);
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
    html += `<button type="button" class="party-viewer-count${isLiveRoomPage() ? ' live-joined-count' : ''}" id="liveViewerCount" title="Tap to view everyone in room">${viewers}${isLiveRoomPage() ? ' joined' : ''}</button>`;
    row.innerHTML = html;
    row.classList.toggle('is-clickable', isPartyRoomPage() || isLiveRoomPage());
    const joinedBtn = document.getElementById('liveViewerCount');
    if (joinedBtn) {
      joinedBtn.style.pointerEvents = 'auto';
      joinedBtn.style.zIndex = '14900';
      joinedBtn.style.position = 'relative';
    }
    row.style.pointerEvents = 'auto';
    row.style.zIndex = '14900';
    if (!row.dataset.audienceBound) {
      row.dataset.audienceBound = '1';
      const openJoined = (e) => {
        if (!isPartyRoomPage() && !isLiveRoomPage()) return;
        if (e.target.closest('.ap-top-gifter[data-audience-id]')) {
          unlockLiveChrome({ forceGift: true });
          const chip = e.target.closest('[data-audience-id]');
          openProfileSheet(chip.dataset.audienceName || 'Guest', chip.dataset.audienceId || '');
          return;
        }
        if (
          e.target.closest('#liveViewerCount') ||
          e.target.closest('.party-viewer-count') ||
          e.target.closest('.live-joined-count') ||
          e.target.closest('#apJoinedHitPad') ||
          e.currentTarget === row
        ) {
          openJoinedSheetReliable(e);
        }
      };
      row.addEventListener('click', openJoined, true);
      row.addEventListener('pointerup', openJoined, true);
    }
    window.SocialUI?.bindAvatarFallbacks?.(row);
  }

  /** Live guest seats: mount on #liveRoomRoot (not flex overlay) so rail stays on the right */
  function ensureGuestRailMount() {
    let rail = document.getElementById('apGuestRail');
    if (!rail) {
      const shell =
        document.getElementById('liveRoomRoot') ||
        document.querySelector('.party-room') ||
        document.querySelector('.live-overlay');
      if (!shell) return null;
      shell.insertAdjacentHTML(
        'beforeend',
        `<aside class="ap-guest-rail" id="apGuestRail" aria-label="Guests"></aside>`
      );
      rail = document.getElementById('apGuestRail');
    }
    if (isLiveRoomPage()) {
      const shell = document.getElementById('liveRoomRoot');
      if (shell && rail && rail.parentElement !== shell) {
        shell.appendChild(rail);
      }
    }
    return rail;
  }

  function renderGuestRail() {
    const rail = ensureGuestRailMount();
    if (!rail) return;
    const guests = collectPartySeatGuests().slice(0, LIVE_MAX_GUESTS);
    if (!guests.length) {
      rail.innerHTML = '';
      rail.style.display = 'none';
      document.body.classList.remove('ap-has-live-guests');
      return;
    }
    document.body.classList.add('ap-has-live-guests');
    rail.style.removeProperty('display');
    rail.innerHTML = guests
      .map((s) => {
        const uid = String(s.userId || '');
        const admin = memberIsAdminMarked(s) || isAdminUserId(uid);
        const muted = Boolean(s.muted);
        const speaking = s.speaking ? ' is-speaking' : '';
        const canRemove =
          uid &&
          !isRoomHostUserId(uid) &&
          (canModerateRoom() || String(uid) === String(currentUser()?.id || ''));
        const removeLabel =
          String(uid) === String(currentUser()?.id || '') ? 'Leave the seat' : 'Remove from seat';
        return `
      <div class="ap-guest-wrap" data-guest-wrap="${escapeHtml(uid)}">
        <button type="button" class="ap-guest-seat${admin ? ' is-admin-user' : ''}${muted ? ' is-muted' : ' is-on-mic'}${speaking}" data-guest="${escapeHtml(s.name)}" data-guest-id="${escapeHtml(uid)}">
          ${Number(s.gifts) > 0 ? `<span class="ap-guest-gift">${formatGiftCount(s.gifts)}</span>` : ''}
          <span class="ap-guest-avatar${adminAvatarFrameClass(admin)}">
            ${adminAvatarTagHtml(admin)}
            <span class="ap-guest-video" id="apGuestVideo-${escapeHtml(uid)}" hidden></span>
            <img src="${avatarUrl(s.name, s.profilePic || liveProfilePic(s.userId, null))}" alt="" data-name="${escapeAttr(s.name || 'Guest')}" loading="lazy">
          </span>
          <span class="ap-guest-name">${escapeHtml(String(s.name).slice(0, 8))}</span>
        </button>
        ${canRemove ? `<button type="button" class="ap-guest-remove" data-remove-seat="${escapeHtml(uid)}" aria-label="${removeLabel}" title="${removeLabel}"><i class="fas fa-times"></i></button>` : ''}
      </div>`;
      })
      .join('');
    /* Re-attach any already-subscribed guest video after rail rebuild */
    try {
      const map = window.__apAgoraUidMap || {};
      (agoraClient?.remoteUsers || []).forEach((u) => {
        if (!u?.hasVideo || !u.videoTrack) return;
        const appId = map[String(u.uid)];
        if (!appId || isRoomHostUserId(appId)) return;
        const tile = document.getElementById(`apGuestVideo-${appId}`);
        if (tile) {
          tile.hidden = false;
          tile.innerHTML = '';
          try {
            u.videoTrack.play(tile);
          } catch (_e) { }
        }
      });
    } catch (_e2) { }
    rail.querySelectorAll('.ap-guest-seat').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const name = btn.dataset.guest || 'Guest';
        const uid = btn.dataset.guestId || '';
        if (canModerateRoom() && uid && !isRoomHostUserId(uid)) {
          openModerationMenu(name, uid);
          return;
        }
        openProfileSheet(name, uid);
      });
    });
    rail.querySelectorAll('[data-remove-seat]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.removeSeat;
        if (!uid) return;
        if (String(uid) === String(currentUser()?.id || '')) {
          leaveOwnSeat();
          return;
        }
        if (!canModerateRoom()) return;
        demoteUserFromSeat(uid);
      });
    });
    window.SocialUI?.bindAvatarFallbacks?.(rail);
  }

  function showMicLinkModal(mode) {
    if (isPartyRoomPage()) {
      syncMicButtonUi();
      return;
    }
    const modal = document.getElementById('apMicLinkModal');
    if (!modal) return;
    closeLiveOverlays('mic');
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    const waiting = document.getElementById('apMicLinkWaiting');
    const rejected = document.getElementById('apMicLinkRejected');
    if (waiting) waiting.style.display = mode === 'waiting' ? '' : 'none';
    if (rejected) rejected.style.display = mode === 'rejected' ? '' : 'none';
    modal.classList.add('open');
    syncLiveOverlayClass();
    syncMicButtonUi();
  }

  function hideMicLinkModal() {
    const modal = document.getElementById('apMicLinkModal');
    modal?.classList.remove('open');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    syncMicButtonUi();
    syncLiveOverlayClass();
  }

  function hideHostMicInvitePopup() {
    /* Popup retired — keep helper so old callers don't throw */
    document.getElementById('apHostMicInviteModal')?.classList.remove('open');
    syncLiveOverlayClass();
  }

  function pushMicInviteToChat(req, opts = {}) {
    if (!req) return;
    if (!canModerateRoom() && !isHost() && !clientClaimsHost()) return;
    const uid = String(req.userId || req.id || '');
    if (!uid) return;
    const name = req.name || 'Guest';
    const pendingIdx = chatMessages.findIndex(
      (m) => m.type === 'mic_invite' && String(m.inviteUserId) === uid && m.inviteStatus === 'pending'
    );
    if (pendingIdx >= 0) {
      const pending = chatMessages[pendingIdx];
      pending.inviteName = name;
      pending.profilePic = req.profilePic || pending.profilePic || null;
      pending.user = name;
      pending.at = new Date().toISOString();
      /* Always keep pending mic cards at the bottom (latest), not stuck at the top */
      chatMessages.splice(pendingIdx, 1);
      chatMessages.push(pending);
      renderChatFeed();
      scrollChatToLatestMicInvite(uid);
      return;
    }
    rememberChatMessage({
      id: `mic-invite-${uid}`,
      type: 'mic_invite',
      user: name,
      userId: uid,
      inviteUserId: uid,
      inviteName: name,
      profilePic: req.profilePic || null,
      inviteStatus: 'pending',
      text: `${name} requested mic`,
      at: new Date().toISOString(),
      scope: 'room',
    });
    /* Ensure brand-new invite sits at the end even if rememberChatMessage updated in place */
    const newIdx = chatMessages.findIndex(
      (m) => m.type === 'mic_invite' && String(m.inviteUserId) === uid && m.inviteStatus === 'pending'
    );
    if (newIdx >= 0 && newIdx !== chatMessages.length - 1) {
      const card = chatMessages.splice(newIdx, 1)[0];
      chatMessages.push(card);
    }
    renderChatFeed();
    /* Keep chat visible so host can tap Agree/Decline */
    document.body.classList.remove('ap-chat-hidden');
    document.getElementById('partyChatRow')?.classList.remove('is-hidden');
    document.getElementById('liveBtnShowChat')?.setAttribute('hidden', '');
    if (chatTab === 'chat') {
      chatTab = 'all';
      document.querySelectorAll('[data-chat-tab]').forEach((b) => {
        b.classList.toggle('active', b.dataset.chatTab === 'all');
      });
    }
    scrollChatToLatestMicInvite(uid);
  }

  function scrollChatToLatestMicInvite(uid) {
    try {
      const feed = document.getElementById('partyChatFeed');
      if (!feed) return;
      /* Stick to bottom so the latest request sits below older chat */
      feed.scrollTop = feed.scrollHeight;
      const card =
        (uid && feed.querySelector(`.party-chat-mic-invite[data-mic-invite-uid="${CSS.escape(String(uid))}"]`)) ||
        feed.querySelector('.party-chat-mic-invite:not(.is-resolved)');
      if (card) {
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
      requestAnimationFrame(() => {
        feed.scrollTop = feed.scrollHeight;
      });
    } catch (_e) {
      const feed = document.getElementById('partyChatFeed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }
  }

  /* Floating top Agree/Decline bar removed — only chat Agree/Decline stays */
  function hideMicRequestActionBar() {
    document.getElementById('apMicRequestBar')?.remove();
  }

  function renderMicRequestActionBar() {
    hideMicRequestActionBar();
  }

  function showHostMicInvitePopup(req) {
    pushMicInviteToChat(req);
  }

  function presentNextHostMicInvite() {
    const next = joinRequests[0];
    if (next) pushMicInviteToChat(next);
  }

  function markMicInviteChatStatus(userId, status) {
    const uid = String(userId || '');
    let changed = false;
    chatMessages.forEach((m) => {
      if (m.type !== 'mic_invite') return;
      if (String(m.inviteUserId || m.userId) !== uid) return;
      if (m.inviteStatus === 'pending' || status === 'accepted' || status === 'declined') {
        m.inviteStatus = status;
        changed = true;
      }
    });
    if (changed) renderChatFeed();
  }

  function bindMicInviteChatActions() {
    if (window.__apMicInviteDocBound) {
      const feed = document.getElementById('partyChatFeed');
      if (feed) feed.dataset.micInviteBound = '1';
      return;
    }
    window.__apMicInviteDocBound = true;
    const handleMicInviteTap = (e) => {
      const agreeBtn = e.target?.closest?.('[data-mic-agree]');
      const denyBtn = e.target?.closest?.('[data-mic-deny]');
      if (!agreeBtn && !denyBtn) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (Date.now() < (Number(window.__apMicInviteLockUntil) || 0)) return;
      window.__apMicInviteLockUntil = Date.now() + 500;
      if (!canModerateRoom() && !isHost() && !clientClaimsHost()) {
        toast('Only host or admin can respond to join requests', 'warning');
        return;
      }
      const uid = String(
        agreeBtn?.getAttribute('data-mic-agree') || denyBtn?.getAttribute('data-mic-deny') || ''
      ).trim();
      if (!uid) return;
      const card =
        agreeBtn?.closest('.party-chat-mic-invite') ||
        denyBtn?.closest('.party-chat-mic-invite');
      if (card?.classList.contains('is-resolved')) return;
      const uname =
        card?.querySelector('.party-chat-mic-text strong')?.textContent?.trim() || 'Guest';
      const req =
        joinRequests.find((x) => String(x.id) === uid || String(x.userId) === uid) || {
          id: uid,
          userId: uid,
          name: uname,
        };
      if (agreeBtn) acceptMicRequest(req, { btn: agreeBtn });
      else denyMicRequest(req);
    };
    /* Document capture — survives chat re-renders and ghost overlay blocks */
    document.addEventListener('click', handleMicInviteTap, true);
    const feed = document.getElementById('partyChatFeed');
    if (feed) feed.dataset.micInviteBound = '1';
  }

  function acceptMicRequest(req, opts = {}) {
    if (!req) {
      toast('Request expired — ask them to request again', 'warning');
      renderJoinRequests();
      return;
    }
    if (!canModerateRoom() && !isHost() && !clientClaimsHost()) {
      toast('Only host or admin can accept join requests', 'warning');
      return;
    }
    if (isLiveRoomPage() && countStageGuests() >= LIVE_MAX_GUESTS) {
      toast(`Live stage is full — max ${LIVE_MAX_ON_STAGE} people (host + ${LIVE_MAX_GUESTS} guests)`, 'warning');
      return;
    }
    if (isPartyRoomPage() && isPartySeatsFull()) {
      toast('Party is full — max 15 on stage (host + 14 guests)', 'warning');
      return;
    }
    if (!liveSocket?.connected) {
      toast('Not connected — try again', 'error');
      return;
    }
    const btn = opts.btn || null;
    if (btn) {
      btn.disabled = true;
      btn.dataset.busy = '1';
      btn.textContent = '…';
    }
    const uid = String(req.userId || req.id || '');
    emitSeatResponse(
      {
        channel: channelId(),
        userId: req.userId || req.id,
        name: req.name,
        accepted: true,
      },
      (res) => {
        if (btn) {
          btn.disabled = false;
          btn.dataset.busy = '0';
          btn.textContent = 'Agree';
        }
        if (res?.ok) {
          joinRequests = joinRequests.filter((x) => String(x.id) !== String(req.id) && String(x.id) !== uid);
          renderJoinRequests();
          markMicInviteChatStatus(uid, 'accepted');
          hideHostMicInvitePopup();
          renderMicRequestActionBar();
          toast(isLiveRoomPage() ? 'Guest joined live' : 'Guest accepted', 'success');
        } else {
          toast(res?.message || 'Could not accept guest', 'error');
        }
      }
    );
  }

  function denyMicRequest(req) {
    if (!req) {
      hideHostMicInvitePopup();
      renderMicRequestActionBar();
      return;
    }
    if (!canModerateRoom() && !isHost() && !clientClaimsHost()) {
      toast('Only host or admin can decline join requests', 'warning');
      return;
    }
    const reqId = String(req.id || req.userId || '');
    joinRequests = joinRequests.filter((x) => String(x.id) !== reqId);
    renderJoinRequests();
    if (liveSocket) {
      emitSeatResponse({
        channel: channelId(),
        userId: req.userId || req.id,
        accepted: false,
      });
    }
    markMicInviteChatStatus(reqId, 'declined');
    hideHostMicInvitePopup();
    renderMicRequestActionBar();
    toast('Mic request declined');
  }

  function syncLiveOverlayClass() {
    const open = Boolean(
      document.getElementById('partyToolsSheet')?.classList.contains('open') ||
      document.getElementById('giftSheet')?.classList.contains('open') ||
      document.getElementById('apMicLinkModal')?.classList.contains('open') ||
      document.getElementById('apHostMicInviteModal')?.classList.contains('open') ||
      document.getElementById('apTopupSheet')?.classList.contains('open') ||
      document.getElementById('partyRequestsSheet')?.classList.contains('open') ||
      document.getElementById('partyMusicSheet')?.classList.contains('open') ||
      document.getElementById('partyBgPickerSheet')?.classList.contains('open') ||
      document.getElementById('apInAppShareSheet')?.classList.contains('open') ||
      document.getElementById('apSurpriseShop')?.classList.contains('open') ||
      document.getElementById('apFilterSheet')?.classList.contains('open') ||
      document.getElementById('apPartyRoomSettings')?.classList.contains('open') ||
      document.getElementById('apPartySettingModal')?.classList.contains('open') ||
      document.getElementById('apPartyEditInfoModal')?.classList.contains('open') ||
      document.getElementById('apPartyRoomProfile')?.classList.contains('open') ||
      document.querySelector('.ap-pk-types-sheet.open')
    );
    document.body.classList.toggle('ap-live-overlay-open', open);
    if (!document.getElementById('partyRequestsSheet')?.classList.contains('open')) {
      document.body.classList.remove('party-requests-open');
    }
    try {
      syncBottomBarHeightVar();
    } catch (_e) {}
  }

  /** Clear ghost overlays / frozen Sending state that block gifts & bottom buttons */
  function recoverStuckLiveUi(opts = {}) {
    const forceGift = Boolean(opts.forceGift);
    const age = Date.now() - (Number(window.__apGiftSendingAt) || 0);
    /* Never interrupt an in-flight gift from live:state — only hard unlock on force / long hang */
    if (window.__apGiftSending && (forceGift || age > 12000)) {
      window.__apGiftSending = false;
      window.__apGiftSendingAt = 0;
      if (window.__apGiftSendWatchdog) {
        clearTimeout(window.__apGiftSendWatchdog);
        window.__apGiftSendWatchdog = null;
      }
      const btn = document.getElementById('giftSendBtn');
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.classList.remove('is-sending');
        btn.textContent = 'Send';
      }
    }

    const openSel =
      '#giftSheet.open, #partyToolsSheet.open, #apMicLinkModal.open, #apHostMicInviteModal.open, #apTopupSheet.open, ' +
      '#partyRequestsSheet.open, #partyMusicSheet.open, #partyBgPickerSheet.open, ' +
      '#apInAppShareSheet.open, #apSurpriseShop.open, #apFilterSheet.open, #apProfileSheet.open, ' +
      '#apInRoomWebPanel.open, #apSeatSheet.open';

    /* Requests sheet closed but body class left on → gift icon dead */
    const reqSheet = document.getElementById('partyRequestsSheet');
    if (
      document.body.classList.contains('party-requests-open') &&
      !reqSheet?.classList.contains('open')
    ) {
      document.body.classList.remove('party-requests-open');
    }

    /* Closed overlays sometimes keep stray .open from race — force-clear ghosts.
       Never kill tools/gift/requests that are actually open+visible (watchdog used to
       close Basic Tools instantly because the sheet covered the Tools button). */
    if (forceGift) {
      document.querySelectorAll('.ap-modal-overlay.open').forEach((el) => {
        if (el.id === 'apHostMicInviteModal') return;
        if (el.id === 'giftSheet' || el.classList.contains('gift-sheet')) return;
        if (el.id === 'apProfileSheet' || el.id === 'apSeatSheet') return;
        if (
          el.id === 'apPartyRoomSettings' ||
          el.id === 'apPartySettingModal' ||
          el.id === 'apPartyEditInfoModal' ||
          el.id === 'apPartyRoomProfile'
        ) {
          return;
        }
        el.classList.remove('open');
      });
      ['partyToolsSheet', 'giftSheet', 'partyRequestsSheet'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el?.classList.contains('open')) return;
        if (isSheetReallyOpen(el)) return;
        el.classList.remove('open');
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      });
      hideMicLinkModal();
      document.getElementById('partyMusicSheet')?.classList.remove('open');
      document.getElementById('apInAppShareSheet')?.classList.remove('open');
      document.getElementById('apTopupSheet')?.classList.remove('open');
      document.getElementById('apSurpriseShop')?.classList.remove('open');
      document.getElementById('apFilterSheet')?.classList.remove('open');
      document.getElementById('apEmojiPopover')?.classList.remove('is-open');
    }

    if (!document.querySelector(openSel)) {
      document.body.classList.remove('ap-live-overlay-open', 'party-requests-open', 'ap-sheet-open');
      hideMicLinkModal();
    } else {
      syncLiveOverlayClass();
    }

    /* Always keep gift / bottom bar interactive unless a sheet is open on top */
    const bar = document.getElementById('partyBottomBar');
    const sheetOnTop = Boolean(
      document.querySelector(
        '#giftSheet.open, #partyToolsSheet.open, .ap-pk-types-sheet.open, #partyRequestsSheet.open'
      )
    );
    if (bar) {
      bar.style.visibility = 'visible';
      bar.style.opacity = '1';
      bar.style.removeProperty('transform');
      bar.style.pointerEvents = sheetOnTop ? 'none' : 'auto';
      if (isPartyRoomPage()) {
        bar.style.zIndex = sheetOnTop ? '40' : '60';
      } else {
        bar.style.zIndex = sheetOnTop ? '12000' : '14000';
      }
    }
    ['liveBtnGift', 'partyBtnGift'].forEach((id) => {
      const giftBtn = document.getElementById(id);
      if (!giftBtn) return;
      giftBtn.style.pointerEvents = sheetOnTop ? 'none' : 'auto';
      giftBtn.removeAttribute('disabled');
      giftBtn.setAttribute('aria-disabled', 'false');
    });
    try {
      syncBottomBarHeightVar();
    } catch (_e) {}
  }

  function syncBottomBarHeightVar() {
    const bar = document.getElementById('partyBottomBar');
    if (!bar) return;
    /* Keep compose from swallowing gift/tools; bar stays UNDER open sheets (gift/tools/PK) */
    try {
      const compose = document.getElementById('liveChatCompose');
      const actions = bar.querySelector('.party-bottom-actions');
      const gift = document.getElementById('liveBtnGift') || document.getElementById('partyBtnGift');
      const sheetOpen = Boolean(
        document.querySelector(
          '#giftSheet.open, #partyToolsSheet.open, .ap-pk-types-sheet.open, .party-requests-sheet.open'
        )
      );
      bar.style.display = isPartyRoomPage() ? 'grid' : 'flex';
      if (isPartyRoomPage()) {
        bar.style.gridTemplateColumns = '1fr auto';
        bar.style.gridTemplateRows = 'auto auto';
        bar.style.flexWrap = '';
        bar.style.bottom = '0';
      } else {
        bar.style.flexWrap = 'nowrap';
        bar.style.bottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
      }
      /* Below gift/tools (32000); above chat/PK overlays */
      if (isPartyRoomPage()) {
        bar.style.zIndex = sheetOpen ? '40' : '60';
      } else {
        bar.style.zIndex = sheetOpen ? '12000' : '14000';
      }
      bar.style.pointerEvents = sheetOpen ? 'none' : 'auto';
      bar.style.alignItems = 'center';
      bar.style.overflow = 'visible';
      if (compose) {
        if (isPartyRoomPage()) {
          compose.style.flex = '';
          compose.style.display = 'grid';
          compose.style.gridColumn = '1 / -1';
          compose.style.gridRow = '1';
          compose.style.width = '100%';
          compose.style.minWidth = '0';
          compose.style.maxWidth = '100%';
          compose.style.removeProperty('left');
          compose.style.removeProperty('right');
          compose.style.removeProperty('bottom');
        } else {
          compose.style.flex = '1 1 0%';
          compose.style.minWidth = '0';
          compose.style.maxWidth = 'none';
        }
        compose.style.overflow = 'hidden';
        compose.style.position = 'relative';
        compose.style.zIndex = '1';
      }
      if (isPartyRoomPage()) {
        if (actions) {
          actions.style.display = 'none';
          actions.style.visibility = 'hidden';
          actions.style.pointerEvents = 'none';
          actions.hidden = true;
        }
        const legacyGift = document.getElementById('liveBtnGift');
        if (legacyGift) {
          legacyGift.style.display = 'none';
          legacyGift.style.visibility = 'hidden';
          legacyGift.style.pointerEvents = 'none';
          legacyGift.hidden = true;
        }
        const partyGift = document.getElementById('partyBtnGift');
        if (partyGift) {
          partyGift.style.flexShrink = '0';
          partyGift.style.position = 'relative';
          partyGift.style.zIndex = '6';
          partyGift.style.pointerEvents = sheetOpen ? 'none' : 'auto';
          partyGift.style.opacity = '1';
          partyGift.style.visibility = 'visible';
          partyGift.style.display = 'inline-flex';
          partyGift.style.alignItems = 'center';
          partyGift.style.justifyContent = 'center';
          partyGift.removeAttribute('disabled');
        }
      } else {
        if (actions) {
          actions.style.flex = '0 0 auto';
          actions.style.flexShrink = '0';
          actions.style.position = 'relative';
          actions.style.zIndex = '5';
          actions.style.pointerEvents = sheetOpen ? 'none' : 'auto';
          actions.style.display = 'flex';
          actions.style.alignItems = 'center';
        }
        if (gift) {
          gift.style.flexShrink = '0';
          gift.style.position = 'relative';
          gift.style.zIndex = '6';
          gift.style.pointerEvents = sheetOpen ? 'none' : 'auto';
          gift.style.opacity = '1';
          gift.style.visibility = 'visible';
          gift.style.display = 'inline-flex';
          gift.style.alignItems = 'center';
          gift.style.justifyContent = 'center';
          gift.removeAttribute('disabled');
        }
      }
    } catch (_e) {
      /* non-fatal */
    }
    let h = Math.ceil(bar.getBoundingClientRect().height || 58);
    /* Cap — a bloated height pushes sticky bars into the invite/joined hit zone */
    if (!Number.isFinite(h) || h < 48) h = 58;
    if (isPartyRoomPage()) {
      if (h > 160) h = 112;
    } else if (h > 120) {
      h = 72;
    }
    document.documentElement.style.setProperty('--ap-bottom-bar-h', `${h}px`);
  }

  /** Unlock Joined / gift / Tools / Users when invisible overlays trap taps */
  function unlockLiveChrome(opts = {}) {
    recoverStuckLiveUi({ forceGift: Boolean(opts.forceGift ?? true) });

    const stuckOpenIds = [
      'partyRequestsSheet',
      'partyToolsSheet',
      'giftSheet',
      'apMicLinkModal',
      'apHostMicInviteModal',
      'apTopupSheet',
      'partyMusicSheet',
      'partyBgPickerSheet',
      'apInAppShareSheet',
      'apSurpriseShop',
      'apFilterSheet',
      'apInRoomWebPanel',
      'apProfileSheet',
      'apSeatSheet',
      'apKickDurationSheet',
    ];

    stuckOpenIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const isOpen = el.classList.contains('open');
      if (!isOpen) {
        /* Never use visibility:hidden — it leaks into the next open and makes an invisible full-screen tap shield */
        el.style.pointerEvents = 'none';
        el.style.removeProperty('visibility');
        el.style.display = 'none';
        return;
      }
      /* Ghost "open but invisible / off-screen" sheets trap every tap — force-close them */
      try {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const ghost =
          cs.visibility === 'hidden' ||
          el.style.visibility === 'hidden' ||
          cs.display === 'none' ||
          cs.opacity === '0' ||
          (rect.width < 8 && rect.height < 8) ||
          (rect.bottom <= 0 || rect.top >= window.innerHeight);
        if (ghost) {
          el.classList.remove('open', 'is-open', 'show');
          el.style.pointerEvents = 'none';
          el.style.display = 'none';
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
          return;
        }
      } catch (_e) { /* ignore */ }
      el.style.pointerEvents = 'auto';
      el.style.removeProperty('visibility');
      el.style.removeProperty('display');
    });

    if (!document.getElementById('partyRequestsSheet')?.classList.contains('open')) {
      document.body.classList.remove('party-requests-open');
    }
    const anyOpen = stuckOpenIds.some((id) => document.getElementById(id)?.classList.contains('open'));
    if (!anyOpen) {
      document.body.classList.remove('ap-live-overlay-open', 'ap-sheet-open', 'party-requests-open');
    }

    const bar = document.getElementById('partyBottomBar');
    if (bar && !document.getElementById('partyRequestsSheet')?.classList.contains('open')) {
      bar.style.pointerEvents = 'auto';
      bar.style.visibility = 'visible';
      bar.style.opacity = '1';
      bar.style.removeProperty('transform');
      bar.style.zIndex = '14000';
    }

    [
      'liveBtnGift',
      'partyBtnGift',
      'partyBtnUsersAll',
      'partyInvitePill',
      'liveViewerCount',
      'partyBtnTools',
      'liveBtnMic',
      'partyBtnRequests',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.pointerEvents = 'auto';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.removeAttribute('disabled');
      el.setAttribute('aria-disabled', 'false');
      if (
        id === 'liveBtnGift' ||
        id === 'partyBtnGift' ||
        id === 'partyBtnTools' ||
        id === 'liveBtnMic' ||
        id === 'liveViewerCount' ||
        id === 'partyBtnUsersAll'
      ) {
        el.style.zIndex = '14100';
      }
    });

    const actions = document.querySelector('#partyBottomBar .party-bottom-actions');
    if (actions) {
      actions.style.pointerEvents = 'auto';
      actions.style.zIndex = '14050';
    }

    const viewers = document.getElementById('partyViewerAvatars');
    if (viewers) {
      viewers.style.pointerEvents = 'auto';
      viewers.style.zIndex = '14100';
    }
    const liveActions = document.getElementById('partyLiveActions');
    if (liveActions) {
      liveActions.style.pointerEvents = 'auto';
      liveActions.style.zIndex = '14050';
    }
    const headerRight = document.querySelector('.party-header-right');
    if (headerRight) {
      headerRight.style.pointerEvents = 'auto';
      headerRight.style.zIndex = '14100';
    }
    const header = document.querySelector('.party-header, .live-room .party-header');
    if (header) {
      header.style.pointerEvents = 'none';
      header.style.zIndex = '14100';
      Array.from(header.children).forEach((ch) => {
        ch.style.pointerEvents = 'auto';
      });
    }

    /* FX layer must never steal taps */
    const fx = document.getElementById('apFxRoot');
    if (fx) {
      fx.style.pointerEvents = 'none';
      fx.querySelectorAll('*').forEach((n) => {
        if (n.style) n.style.pointerEvents = 'none';
      });
    }

    hideMicRequestActionBar();
    syncBottomBarHeightVar();
  }

  /**
   * When rooms get busy, gift FX / chat / ghost sheets sit above Joined / Gift / Tools
   * and swallow taps. Salvage by routing the gesture to chrome under the finger.
   */
  function installChromeHitSalvage() {
    if (window.__apChromeHitSalvage) return;
    window.__apChromeHitSalvage = true;
    let lockUntil = 0;

    const CHROME = [
      {
        match: (el) =>
          el?.closest?.(
            '#liveViewerCount, .live-joined-count, .party-viewer-count, #partyBtnUsersAll, #partyViewerAvatars.is-clickable'
          ),
        run: () => {
          openJoinedSheetReliable();
        },
      },
      {
        match: (el) => el?.closest?.('#partyBtnTools, .ap-btn-grid'),
        run: () => {
          openToolsSheetReliable();
        },
      },
      {
        match: (el) => el?.closest?.('[data-mic-agree], [data-mic-deny], .party-chat-mic-actions'),
        run: (hit) => {
          const agree = hit?.closest?.('[data-mic-agree]') || hit?.querySelector?.('[data-mic-agree]');
          const deny = hit?.closest?.('[data-mic-deny]') || hit?.querySelector?.('[data-mic-deny]');
          const btn = agree || deny;
          if (!btn) return;
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        },
      },
      {
        match: (el) => el?.closest?.('#liveBtnGift, #partyBtnGift, .ap-btn-gift-hero, .party-btn-gift, #apGiftHitPad'),
        run: () => {
          openGiftSheetReliable();
        },
      },
    ];

    function isPassThroughLayer(el) {
      if (!el || el === document.body || el === document.documentElement) return true;
      if (
        el.closest?.(
          '#partyBottomBar, #partyBtnTools, #liveBtnGift, #partyBtnGift, #liveBtnMic, #liveViewerCount, #partyBtnUsersAll, #partyViewerAvatars, #partyInvitePill, .party-header-right, .party-bottom-actions, .ap-btn-grid, .ap-btn-gift-hero'
        )
      ) {
        return false;
      }
      const id = el.id || '';
      const cls = typeof el.className === 'string' ? el.className : '';
      if (
        id === 'apFxRoot' ||
        id === 'liveLocalVideo' ||
        id === 'liveRemoteVideo' ||
        cls.includes('ap-fx') ||
        cls.includes('live-spacer') ||
        cls.includes('live-overlay') ||
        cls.includes('party-chat-row') ||
        cls.includes('party-chat-zone') ||
        cls.includes('party-chat-feed') ||
        cls.includes('ap-guest-rail') ||
        cls.includes('live-room-stage') ||
        cls.includes('party-room-stage')
      ) {
        return true;
      }
      try {
        if (getComputedStyle(el).pointerEvents === 'none') return true;
      } catch (_e) { /* ignore */ }
      /* Stuck full-screen sheets that aren't meant to be interactive */
      if (
        (el.classList?.contains('gift-sheet') ||
          el.classList?.contains('party-tools-sheet') ||
          el.classList?.contains('party-requests-sheet') ||
          el.classList?.contains('ap-modal-overlay')) &&
        el.classList.contains('open')
      ) {
        try {
          const cs = getComputedStyle(el);
          if (cs.opacity === '0' || cs.visibility === 'hidden') return true;
        } catch (_e2) { /* ignore */ }
      }
      return false;
    }

    function resolveChrome(x, y) {
      let stack = [];
      try {
        stack = document.elementsFromPoint(x, y) || [];
      } catch (_e) {
        return null;
      }
      for (const node of stack) {
        for (const spec of CHROME) {
          const hit = spec.match(node);
          if (hit) {
            const blockers = [];
            for (const above of stack) {
              if (above === hit || hit.contains?.(above)) break;
              if (!isPassThroughLayer(above)) blockers.push(above);
            }
            return { hit, spec, blocked: blockers.length > 0, blockers };
          }
        }
      }
      return null;
    }

    const onPointer = (e) => {
      if (e.type !== 'click') return;
      if (e.button != null && e.button !== 0) return;
      if (Date.now() < lockUntil) return;
      if (Date.now() < (Number(window.__apToolsOpenGuardUntil) || 0)) return;
      if (Date.now() - (Number(window.__apPartyModalOpenedAt) || 0) < 700) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (x == null || y == null) return;
      const found = resolveChrome(x, y);
      if (!found || !found.blocked) return;
      /*
       * Only salvage on click when something is blocking chrome.
       * Never unlock/open on pointerdown — that caused tools to flicker open/close.
       */
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      lockUntil = Date.now() + 450;
      unlockLiveChrome({ forceGift: true });
      /* Close ghost sheets that were blocking */
      found.blockers.forEach((b) => {
        const sheet = b.closest?.(
          '.gift-sheet, .party-tools-sheet, .party-requests-sheet, .ap-modal-overlay, .party-music-sheet'
        );
        if (sheet && sheet.classList.contains('open')) {
          const partyModalIds = new Set([
            'apPartyRoomSettings',
            'apPartySettingModal',
            'apPartyEditInfoModal',
            'apPartyRoomProfile',
          ]);
          if (partyModalIds.has(sheet.id)) return;
          try {
            const cs = getComputedStyle(sheet);
            if (cs.opacity === '0' || cs.visibility === 'hidden' || sheet.style.pointerEvents === 'none') {
              sheet.classList.remove('open');
              sheet.style.display = 'none';
              sheet.style.pointerEvents = 'none';
            }
          } catch (_e) { /* ignore */ }
        }
      });
      try {
        found.spec.run(found.hit);
      } catch (_e2) { /* ignore */ }
    };

    document.addEventListener('click', onPointer, true);
  }

  function startLiveChromeWatchdog() {
    if (window.__apLiveChromeWatchdog) return;
    installChromeHitSalvage();
    installGiftHitPad();
    installJoinedHitPad();
    window.__apLiveChromeWatchdog = setInterval(() => {
      if (!document.body?.dataset?.livePage) return;
      const gift = document.getElementById('giftSheet');
      const tools = document.getElementById('partyToolsSheet');
      const req = document.getElementById('partyRequestsSheet');
      const bar = document.getElementById('partyBottomBar');
      const reqOpen = req?.classList.contains('open');
      const giftOpen = gift?.classList.contains('open');
      const toolsOpen = tools?.classList.contains('open');

      /* Invisible-but-open gift sheet = permanent tap death for Joined / gift / Users */
      if (giftOpen) {
        try {
          const cs = getComputedStyle(gift);
          const rect = gift.getBoundingClientRect();
          if (
            cs.visibility === 'hidden' ||
            gift.style.visibility === 'hidden' ||
            cs.opacity === '0' ||
            rect.height < 8
          ) {
            gift.classList.remove('open');
            gift.style.removeProperty('visibility');
            gift.style.display = 'none';
            gift.style.pointerEvents = 'none';
            unlockLiveChrome({ forceGift: true });
            return;
          }
        } catch (_e) { /* ignore */ }
      }

      if (toolsOpen) {
        try {
          const cs = getComputedStyle(tools);
          if (cs.visibility === 'hidden' || tools.style.visibility === 'hidden' || cs.display === 'none') {
            tools.classList.remove('open');
            tools.style.pointerEvents = 'none';
            tools.style.display = 'none';
            unlockLiveChrome({ forceGift: true });
            return;
          }
        } catch (_e2) { /* ignore */ }
      }

      if (reqOpen) {
        try {
          const cs = getComputedStyle(req);
          const rect = req.getBoundingClientRect();
          if (cs.visibility === 'hidden' || cs.opacity === '0' || rect.height < 8) {
            req.classList.remove('open');
            req.style.display = 'none';
            req.style.pointerEvents = 'none';
            document.body.classList.remove('party-requests-open');
            unlockLiveChrome({ forceGift: true });
            return;
          }
        } catch (_e3) { /* ignore */ }
      }

      /* Ghost body class after closing people list (common with large rooms) */
      if (document.body.classList.contains('party-requests-open') && !reqOpen) {
        unlockLiveChrome({ forceGift: true });
        return;
      }
      if (document.body.classList.contains('ap-live-overlay-open') && !reqOpen && !giftOpen && !toolsOpen) {
        const othersOpen = [
          'apMicLinkModal',
          'apTopupSheet',
          'partyMusicSheet',
          'apInAppShareSheet',
          'apSurpriseShop',
          'apFilterSheet',
          'apInRoomWebPanel',
          'apProfileSheet',
          'apSeatSheet',
        ].some((id) => document.getElementById(id)?.classList.contains('open'));
        if (!othersOpen) unlockLiveChrome({ forceGift: true });
        return;
      }

      /* Bottom actions blocked while sheets closed — force restore */
      if (bar && !reqOpen && !giftOpen && !toolsOpen) {
        const pe = (bar.style.pointerEvents || '').toLowerCase();
        const hidden =
          pe === 'none' ||
          bar.style.visibility === 'hidden' ||
          document.body.classList.contains('party-requests-open');
        if (hidden) unlockLiveChrome({ forceGift: true });
      }

      /* Do not probe chrome while a real sheet is open — sheet covers Tools/Gift and
         unlocking would instantly close Basic Tools (open → close flicker). */
      if (reqOpen || giftOpen || toolsOpen) return;

      /* Probe Joined / Gift / Tools centers — if covered by a non-chrome layer, unlock */
      ['liveViewerCount', 'partyBtnTools', 'liveBtnGift', 'partyBtnGift', 'partyBtnUsersAll'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        try {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return;
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          if (!top) return;
          if (el === top || el.contains(top) || top.closest?.(`#${id}`)) return;
          if (
            top.closest?.(
              '#partyBottomBar, #partyViewerAvatars, .party-header-right, #partyLiveActions, .party-bottom-actions, #partyToolsSheet, #giftSheet, #partyRequestsSheet'
            )
          ) {
            return;
          }
          unlockLiveChrome({ forceGift: true });
        } catch (_e4) { /* ignore */ }
      });
    }, 2500);
  }

  function openPartyRequestsSheet() {
    recoverStuckLiveUi({ forceGift: true });
    /* Clear any full-screen ghosts that swallow Accept / Add taps */
    document.getElementById('giftSheet')?.classList.remove('open');
    hideMicLinkModal();
    document.getElementById('apInAppShareSheet')?.classList.remove('open');
    document.getElementById('apTopupSheet')?.classList.remove('open');
    document.getElementById('partyToolsSheet')?.classList.remove('open');
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
          ? 'Make/remove admin, clear chat, and manage guests here. Tap a guest for more options.'
          : 'Make/remove admin, clear chat, and manage seats here. Tap a guest for more options.';
      } else {
        hint.textContent = isLiveRoomPage()
          ? 'Everyone currently in this live. Tap a name to view their profile.'
          : 'Everyone currently in this party room. Tap a name to view their profile.';
      }
    }
    syncJoinedModToolbar();
    document.body.classList.add('party-requests-open');
    const sheet = document.getElementById('partyRequestsSheet');
    if (sheet) {
      sheet.classList.add('open');
      sheet.style.zIndex = '15050';
      sheet.style.pointerEvents = 'auto';
      sheet.style.visibility = 'visible';
      sheet.style.removeProperty('display');
      if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
    }
    /* Same finger that opened often lands on the backdrop and used to close instantly */
    window.__apJoinedOpenGuardUntil = Date.now() + 900;
    syncLiveOverlayClass();
  }

  function openJoinedSheetReliable(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof e?.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (!isPartyRoomPage() && !isLiveRoomPage()) return;
    const now = Date.now();
    if (now < (Number(window.__apJoinedOpenBusyUntil) || 0)) return;
    window.__apJoinedOpenBusyUntil = now + 500;
    unlockLiveChrome({ forceGift: true });
    const sheet = document.getElementById('partyRequestsSheet');
    if (isSheetReallyOpen(sheet)) return;
    if (sheet) {
      sheet.classList.remove('open');
      sheet.style.display = 'none';
      sheet.style.pointerEvents = 'none';
    }
    document.getElementById('giftSheet')?.classList.remove('open');
    document.getElementById('partyToolsSheet')?.classList.remove('open');
    openPartyRequestsSheet();
  }

  function closePartyRequestsSheet() {
    document.body.classList.remove('party-requests-open');
    const sheet = document.getElementById('partyRequestsSheet');
    if (sheet) {
      sheet.classList.remove('open');
      sheet.style.pointerEvents = 'none';
      sheet.style.visibility = 'hidden';
      sheet.style.display = 'none';
    }
    syncLiveOverlayClass();
    unlockLiveChrome({ forceGift: true });
  }

  function handleSeatAcceptClick(btn) {
    if (btn.disabled || btn.dataset.busy === '1') return;
    const id = String(btn.dataset.accept || '');
    const req =
      joinRequests.find((x) => String(x.id) === id) ||
      (id
        ? {
          id,
          userId: id,
          name: btn.closest('.party-req-row')?.querySelector('strong')?.textContent || 'Guest',
        }
        : null);
    acceptMicRequest(req, { btn });
  }

  function handleSeatDenyClick(btn) {
    const id = String(btn.dataset.deny || '');
    const req =
      joinRequests.find((x) => String(x.id) === id) ||
      (id
        ? {
          id,
          userId: id,
          name: btn.closest('.party-req-row')?.querySelector('strong')?.textContent || 'Guest',
        }
        : null);
    denyMicRequest(req);
  }

  function handleSeatInviteClick(btn) {
    const uid = btn.dataset.inviteSeat;
    if (!uid || !liveSocket?.connected) {
      toast('Not connected — try again', 'error');
      return;
    }
    if (isLiveRoomPage() && countStageGuests() >= LIVE_MAX_GUESTS) {
      toast(`Live stage is full — max ${LIVE_MAX_ON_STAGE} people (host + ${LIVE_MAX_GUESTS} guests)`, 'warning');
      return;
    }
    if (isPartyRoomPage() && isPartySeatsFull()) {
      toast('Party is full — max 15 on stage', 'warning');
      return;
    }
    const member = getPartyMembersForList().find((m) => String(m.userId) === String(uid));
    const pendingSeat = window.__apPendingSeatMove;
    const payload = {
      channel: channelId(),
      userId: uid,
      name: member?.name || btn.dataset.inviteName || 'Guest',
      accepted: true,
    };
    if (pendingSeat) payload.seatIndex = pendingSeat;
    btn.disabled = true;
    btn.dataset.busy = '1';
    const prevLabel = btn.textContent;
    btn.textContent = '…';
    emitSeatResponse(payload, (res) => {
      btn.disabled = false;
      btn.dataset.busy = '0';
      btn.textContent = prevLabel || (isLiveRoomPage() ? 'Add' : 'To seat');
      window.__apPendingSeatMove = null;
      if (res?.ok) {
        toast(isLiveRoomPage() ? 'Added to live' : 'Added to seat', 'success');
        joinRequests = joinRequests.filter((x) => String(x.id) !== String(uid));
        markMicInviteChatStatus(uid, 'accepted');
        renderAvailableUsers();
        renderJoinRequests();
        renderMicRequestActionBar();
        requestFreshRoomState?.();
      } else {
        toast(res?.message || 'Could not add — ask them to reopen the live, then try Add again', 'error');
      }
    });
  }

  function bindPartyRequestsSheet() {
    const sheet = document.getElementById('partyRequestsSheet');
    if (!sheet) return;

    const closeBtn = document.getElementById('partyRequestsClose');
    if (closeBtn && closeBtn.dataset.closeBound !== '1') {
      closeBtn.dataset.closeBound = '1';
      /* Capture so panel seat-action stopPropagation cannot block the X */
      closeBtn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePartyRequestsSheet();
        },
        true
      );
    }

    if (sheet.dataset.requestsBound !== '1') {
      sheet.dataset.requestsBound = '1';
      sheet.addEventListener('click', (e) => {
        if (e.target.closest('#partyRequestsClose')) {
          e.preventDefault();
          e.stopPropagation();
          closePartyRequestsSheet();
          return;
        }
        if (!e.target.closest('.party-requests-panel')) {
          if (Date.now() < (Number(window.__apJoinedOpenGuardUntil) || 0)) return;
          closePartyRequestsSheet();
        }
      });
    }

    /* Always (re)bind panel actions — sheet may be reparented */
    const panel = sheet.querySelector('.party-requests-panel');
    if (!panel || panel.dataset.seatActionsBound === '1') return;
    panel.dataset.seatActionsBound = '1';
    panel.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('#partyRequestsClose')) {
          e.preventDefault();
          e.stopPropagation();
          closePartyRequestsSheet();
          return;
        }
        const acceptBtn = e.target.closest('[data-accept]');
        if (acceptBtn && panel.contains(acceptBtn)) {
          e.preventDefault();
          e.stopPropagation();
          handleSeatAcceptClick(acceptBtn);
          return;
        }
        const denyBtn = e.target.closest('[data-deny]');
        if (denyBtn && panel.contains(denyBtn)) {
          e.preventDefault();
          handleSeatDenyClick(denyBtn);
          return;
        }
        const inviteBtn = e.target.closest('[data-invite-seat]');
        if (inviteBtn && panel.contains(inviteBtn)) {
          e.preventDefault();
          e.stopPropagation();
          handleSeatInviteClick(inviteBtn);
          return;
        }
        const grantAdminBtn = e.target.closest('[data-admin-grant]');
        if (grantAdminBtn && panel.contains(grantAdminBtn)) {
          e.preventDefault();
          e.stopPropagation();
          const uid = grantAdminBtn.getAttribute('data-admin-grant');
          if (uid) grantRoomAdmin(uid, true);
          return;
        }
        const revokeAdminBtn = e.target.closest('[data-admin-revoke]');
        if (revokeAdminBtn && panel.contains(revokeAdminBtn)) {
          e.preventDefault();
          e.stopPropagation();
          const uid = revokeAdminBtn.getAttribute('data-admin-revoke');
          const member = getPartyMembersForList().find((m) => String(m.userId) === String(uid));
          if (uid && window.confirm(`Remove admin from ${member?.name || 'this user'}?`)) {
            grantRoomAdmin(uid, false);
          }
          return;
        }
        const removeBtn = e.target.closest('[data-remove-seat]');
        if (removeBtn && panel.contains(removeBtn)) {
          e.preventDefault();
          e.stopPropagation();
          const uid = removeBtn.dataset.removeSeat;
          const member = getPartyMembersForList().find((m) => String(m.userId) === String(uid));
          const label = member?.name || 'this guest';
          if (!window.confirm(`Remove ${label} from the seat?\n\nThey stay in the room${member?.isAdmin || member?.role === 'admin' ? ` as ${roomAdminLabel().toLowerCase()}` : ''}.`)) return;
          demoteUserFromSeat(uid);
        }
      },
      true
    );
  }

  function ensureInviteInline() {
    const pill = document.getElementById('partyInvitePill');
    if (!pill) return;
    pill.classList.remove('party-event-pill--inline');
    if (isLiveRoomPage()) {
      const target = document.getElementById('partyLiveActions');
      if (!target) return;
      const usersBtn = document.getElementById('partyBtnUsersAll');
      /* Order: Users → Invite (host controls bar removed) */
      if (usersBtn && usersBtn.parentElement === target && target.firstElementChild !== usersBtn) {
        target.insertBefore(usersBtn, target.firstElementChild);
      }
      if (pill.parentElement !== target || target.lastElementChild !== pill) {
        target.appendChild(pill);
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

  function partyMaxSeats() {
    if (!isPartyRoomPage()) return PARTY_MAX_SEATS;
    const n = Number(roomState?.roomStyle?.micCount) || 15;
    return Math.max(5, Math.min(30, n));
  }

  function getPartySeatLayout(count) {
    const n = Math.max(5, Math.min(30, Number(count) || 15));
    const all = Array.from({ length: n }, (_, i) => i);
    if (n <= 5) {
      return [
        { cls: 'seat-tier-lg', row: 'party-seat-row--lg', indices: [0] },
        { cls: 'seat-tier-md', row: 'party-seat-row--md', indices: all.slice(1) },
      ];
    }
    if (n <= 10) {
      return [
        { cls: 'seat-tier-lg', row: 'party-seat-row--lg', indices: [0, 1] },
        { cls: 'seat-tier-md', row: 'party-seat-row--md', indices: [2, 3, 4, 5] },
        { cls: 'seat-tier-md', row: 'party-seat-row--md', indices: [6, 7, 8, 9] },
      ];
    }
    const perRow = n <= 15 ? 3 : 5;
    const tiers = [];
    for (let r = 0; r < Math.ceil(n / perRow); r += 1) {
      const start = r * perRow;
      tiers.push({
        cls: r === 0 ? 'seat-tier-lg' : r < 2 ? 'seat-tier-md' : 'seat-tier-sm',
        row: r === 0 ? 'party-seat-row--lg' : r < 2 ? 'party-seat-row--md' : 'party-seat-row--sm',
        indices: all.slice(start, Math.min(start + perRow, n)),
      });
    }
    return tiers;
  }

  function syncPartyAnnouncement() {
    if (!isPartyRoomPage()) return;
    const wrap = document.getElementById('partyAnnouncement');
    const textEl = document.getElementById('partyAnnouncementText');
    const profEl = document.getElementById('apPartyProfileAnnouncement');
    const ann = String(roomState?.roomStyle?.announcement || '').trim();
    if (textEl) textEl.textContent = ann;
    if (profEl) profEl.textContent = ann || 'No announcement yet';
    if (wrap) wrap.classList.toggle('is-empty', !ann);
  }

  function applyRoomBackground(backgroundId) {
    const bg = PARTY_BACKGROUNDS.find((b) => b.id === backgroundId) || PARTY_BACKGROUNDS[0];
    const refBg = document.getElementById('partyRefBg');
    const roomRoot = document.querySelector('.party-room') || document.querySelector('.live-room');
    const target = refBg || roomRoot;
    if (target && bg?.css) {
      target.style.background = bg.css;
      target.style.backgroundSize = 'cover';
      target.style.backgroundPosition = 'center';
    }
    if (roomRoot && !refBg) {
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

  function adminAvatarFrameClass(_isAdmin) {
    /* Gold admin ring looked cluttered in live UI — keep identity via role label only */
    return '';
  }

  function adminAvatarTagHtml(_isAdmin) {
    return '';
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
    let el = document.getElementById('partyBgMusic');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'partyBgMusic';
      el.loop = true;
      el.preload = 'auto';
      el.dataset.apUnlock = '1';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.style.cssText =
        'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function syncPartyMusicUi() {
    document.querySelectorAll('.party-music-track').forEach((btn) => {
      btn.classList.toggle('is-playing', btn.dataset.musicId === partyMusicPlayingId);
      const icon = btn.querySelector('i');
      if (icon) icon.className = btn.dataset.musicId === partyMusicPlayingId ? 'fas fa-pause' : 'fas fa-play';
    });
  }

  async function stopPartyMusicAgoraTrack() {
    const track = partyMusicAgoraTrack;
    partyMusicAgoraTrack = null;
    if (!track) return;
    try {
      if (agoraClient && publishSucceeded) {
        await lifeUnpublish([track]).catch(() => { });
      }
    } catch (_e) { }
    try {
      track.stopProcessAudioBuffer?.();
    } catch (_e) { }
    try {
      track.stop?.();
    } catch (_e) { }
    try {
      track.close?.();
    } catch (_e) { }
  }

  async function publishPartyMusicToStream(url) {
    if (!agoraClient || !publishSucceeded) return false;
    if (!(isHost() || hasSpeakerSeat)) return false;
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript().catch(() => null));
    if (!AgoraRTC?.createBufferSourceAudioTrack) return false;
    await stopPartyMusicAgoraTrack();
    try {
      const track = await AgoraRTC.createBufferSourceAudioTrack({
        source: url,
        cacheOnlineFile: true,
      });
      await track.startProcessAudioBuffer({ loop: true });
      try {
        track.setVolume?.(55);
      } catch (_e) { }
      await lifePublish([track]);
      partyMusicAgoraTrack = track;
      return true;
    } catch (err) {
      liveDebugLog('party music agora publish failed', err?.message || err);
      await stopPartyMusicAgoraTrack();
      return false;
    }
  }

  function stopPartyMusic() {
    const audio = getPartyBgMusicEl();
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch (_e) { }
    }
    stopPartyMusicAgoraTrack();
    partyMusicPlayingId = '';
    syncPartyMusicUi();
  }

  async function playPartyMusic(trackId) {
    if (partyMusicPublishBusy) return;
    const track = getPartyMusicTracks().find((t) => t.id === trackId);
    if (!track) return;
    const audio = getPartyBgMusicEl();
    if (!audio) {
      toast('Music player missing — refresh the page', 'error');
      return;
    }
    if (partyMusicPlayingId === trackId && !audio.paused) {
      stopPartyMusic();
      toast('Music stopped', 'info');
      return;
    }

    partyMusicPublishBusy = true;
    try {
      await unlockBrowserAudio?.().catch?.(() => { });
      const prevId = partyMusicPlayingId;
      const audioWasPlaying = audio && !audio.paused;
      if (prevId || audioWasPlaying || partyMusicAgoraTrack) {
        await stopPartyMusicAgoraTrack();
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch (_e) { }
        partyMusicPlayingId = '';
      }
      partyMusicPlayingId = trackId;
      const url = resolvePartyMusicUrl(track.url);
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      audio.volume = 0.4;
      audio.loop = true;

      let localOk = false;
      try {
        await audio.play();
        localOk = true;
      } catch (playErr) {
        liveDebugLog('party music local play failed', playErr?.message || playErr);
      }

      let streamOk = false;
      try {
        streamOk = await publishPartyMusicToStream(url);
      } catch (_e) {
        streamOk = false;
      }

      syncPartyMusicUi();
      if (localOk || streamOk) {
        toast(
          streamOk ? `Playing on stream · ${track.title}` : `Playing ${track.title}`,
          'success'
        );
      } else {
        partyMusicPlayingId = '';
        syncPartyMusicUi();
        toast('Could not play music — try Upload, or tap again after unlocking sound', 'warning');
      }
    } finally {
      partyMusicPublishBusy = false;
    }
  }

  function openPartyMusicSheet() {
    ensurePartyMusicUi();
    syncPartyMusicUi();
    document.getElementById('partyToolsSheet')?.classList.remove('open');
    const sheet = document.getElementById('partyMusicSheet');
    if (sheet) {
      sheet.classList.add('open');
      sheet.style.display = 'flex';
      sheet.style.visibility = 'visible';
      sheet.style.pointerEvents = 'auto';
      sheet.setAttribute('aria-hidden', 'false');
    }
    syncLiveOverlayClass();
  }

  function closePartyMusicSheet() {
    const sheet = document.getElementById('partyMusicSheet');
    if (sheet) {
      sheet.classList.remove('open');
      sheet.style.removeProperty('display');
      sheet.style.removeProperty('visibility');
      sheet.style.removeProperty('pointer-events');
      sheet.setAttribute('aria-hidden', 'true');
    }
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
    if (except !== 'mic') hideMicLinkModal();
    if (except !== 'hostMic') document.getElementById('apHostMicInviteModal')?.classList.remove('open');
    if (except !== 'share') document.getElementById('apInAppShareSheet')?.classList.remove('open');
    if (except !== 'requests') closePartyRequestsSheet();
    if (except !== 'music') closePartyMusicSheet();
    if (except !== 'chat') closeChatPanelOnly();
    if (except !== 'pkTypes' && !pkStartInFlight) {
      const types = document.getElementById('apPkTypesSheet');
      if (types) {
        types.classList.remove('open', 'is-matching');
        types.setAttribute('aria-hidden', 'true');
        types.style.display = 'none';
        types.style.pointerEvents = 'none';
      }
    }
    document.getElementById('apEmojiPopover')?.classList.remove('is-open');
    syncLiveOverlayClass();
  }

  function syncBottomBarForRole() {
    const compose = document.getElementById('liveChatCompose');
    const followBtn = document.getElementById('partyBtnFollow') || document.getElementById('liveBtnFollow');
    const joinBtn = document.getElementById('partyBtnJoinSeat');
    const hosting = isHost();
    if (joinBtn) {
      joinBtn.hidden = true;
      joinBtn.style.display = 'none';
      joinBtn.setAttribute('aria-hidden', 'true');
      joinBtn.style.pointerEvents = 'none';
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
      '.party-tools-sheet.open, .gift-sheet.open, .party-requests-sheet.open, .social-broadcast-sheet-wrap.is-open, .ap-modal-overlay.open, .ap-modal-overlay.show, .ap-pk-types-sheet.open'
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
    if (isPartyRoomPage()) {
      document.body.classList.remove('ap-chat-compose-open');
      document.getElementById('partyRefChatBtn')?.classList.remove('is-active');
    }
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
      if (isPartyRoomPage()) {
        document.body.classList.add('ap-chat-compose-open');
        document.getElementById('partyRefChatBtn')?.classList.add('is-active');
        window.setLiveChatHidden?.(false);
      }
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

    bindChatFeedScroll();
  }

  /** Keep vertical pan on the chat feed (WebView + live feed swipe steal otherwise). */
  function bindChatFeedScroll() {
    const feed = document.getElementById('partyChatFeed');
    if (!feed || feed.dataset.scrollBound === '1') return;
    feed.dataset.scrollBound = '1';
    feed.style.touchAction = 'pan-y';
    feed.style.webkitOverflowScrolling = 'touch';
    feed.style.overflowY = 'scroll';

    const stopParentSwipe = (e) => {
      /* Let the feed scroll; don't let room/feed swipe steal the gesture */
      e.stopPropagation();
    };
    feed.addEventListener('touchstart', stopParentSwipe, { passive: true, capture: true });
    feed.addEventListener('touchmove', stopParentSwipe, { passive: true, capture: true });
    feed.addEventListener(
      'wheel',
      (e) => {
        e.stopPropagation();
      },
      { passive: true, capture: true }
    );
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
    compose.classList.remove('ap-compose-float');
    const anchor = bar.querySelector('.party-ref-bottom-right') || bar.querySelector('.party-bottom-actions');
    if (compose.parentElement !== bar) {
      if (anchor) bar.insertBefore(compose, anchor);
      else bar.appendChild(compose);
    } else if (anchor && compose.nextElementSibling !== anchor && compose.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) {
      bar.insertBefore(compose, anchor);
    }
    if (isPartyRoomPage()) {
      if (bar.firstElementChild !== compose) bar.insertBefore(compose, bar.firstElementChild);
      document.body.classList.add('ap-chat-compose-open');
    }
  }

  function navigateToUserProfile(userId, name) {
    const enc = window.SocialUI?.safeEncodeURIComponent || encodeURIComponent;
    let n = 'User';
    try {
      n = enc(name || 'User');
    } catch (_e) {
      n = 'User';
    }
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
    const openHostProfile = (e) => {
      if (e?.target?.closest?.('#partyHostFollow, .party-follow-btn, #partyHostFollow')) return;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const hid = hostId || String(roomState?.hostId || '');
      /* Platform admins: open host mod menu with Kick host · 2h / 24h */
      if (hid && isPlatformAdminSelf() && canModerateRoom()) {
        openModerationMenu(hostName, hid);
        return;
      }
      openProfileSheet(hostName, hid);
    };
    document.querySelectorAll('#partyHostAvatar, #liveHostAvatar').forEach((img) => {
      if (!img.getAttribute('src')) img.src = avatarUrl(hostName);
      img.dataset.name = hostName;
      if (img.dataset.profileBound === '1') return;
      img.dataset.profileBound = '1';
      img.style.cursor = 'pointer';
      img.style.pointerEvents = 'auto';
      img.addEventListener('click', openHostProfile, true);
    });
    document.querySelectorAll('#partyHostName, #liveHostName').forEach((el) => {
      if (el.dataset.profileBound === '1') return;
      el.dataset.profileBound = '1';
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', openHostProfile, true);
    });
    document.querySelectorAll('.ap-top-gifter img').forEach((img) => {
      if (!img.getAttribute('src')) img.src = avatarUrl(hostName);
      img.dataset.name = hostName;
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
      'partyToolsSheet',
      'apMicLinkModal',
      'apHostMicInviteModal',
      'giftSheet',
      'partyRequestsSheet',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== document.body) document.body.appendChild(el);
    });
    const requests = document.getElementById('partyRequestsSheet');
    if (requests) document.body.appendChild(requests);
    /* Bottom bar always last among chrome so it paints above leftover sheets in DOM order */
    const bar = document.getElementById('partyBottomBar');
    if (bar) document.body.appendChild(bar);
  }

  function bindMicLinkModal() {
    if (window.__apMicModalBound) return;
    window.__apMicModalBound = true;
    document.getElementById('apMicLinkContinue')?.addEventListener('click', () => toast('Waiting for host approval…'));
    document.getElementById('apMicLinkCancel')?.addEventListener('click', clearMicRequestState);
    document.getElementById('apMicLinkCancel2')?.addEventListener('click', clearMicRequestState);
    document.getElementById('apMicLinkConfirm')?.addEventListener('click', hideMicLinkModal);
    document.getElementById('apMicLinkModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'apMicLinkModal') clearMicRequestState();
    });
  }

  function ensureHostMicInviteModal() {
    /* Popup retired — mic Agree/Decline now lives in chat */
    document.getElementById('apHostMicInviteModal')?.classList.remove('open');
    document.getElementById('apHostMicInviteModal')?.remove();
  }

  function bindHostMicInviteModal() {
    /* no-op — chat actions handle Agree/Decline */
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
    if (isPartyRoomPage() || isLiveRoomPage()) {
      bindMicLinkModal();
      ensureHostMicInviteModal();
    }
    ensureLiveDebugPanel();
    const activeRegion = document.querySelector('.ap-region-tabs button.active');
    chatRegionFilter = activeRegion?.dataset.region || 'room';
    syncToolBadges();
    updateCharCount();
    primeLiveRoomChrome();
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
      ensurePkBattleChrome();
    }
    ensureGuestRailMount();
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
        `<div class="ap-modal-overlay" id="apMicLinkModal" hidden aria-hidden="true">
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
    ensureHostMicInviteModal();
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
    /* Reference white gift panel + starry chrome — party room only; live-room uses pro dark theme */
    if (isPartyRoomPage()) document.body.classList.add('ap-ref-ui');
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
    const hasFrames = hasPlayingRemoteVideo();
    const hasVideoEl = Boolean(
      document.querySelector(
        '#liveRemoteHost video, #liveLocalHost video, #liveLocalHost canvas, .ap-guest-video video'
      )
    );
    /* Show as soon as video element is attached — don't wait on slow decode */
    const on =
      Boolean(visible) && (hasFrames || hasVideoEl || isHost() || clientClaimsHost());
    if (root) root.classList.toggle('ap-has-video-stream', on);
    document.body.classList.toggle('ap-has-video-stream', on);
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop) backdrop.style.opacity = on ? '0' : '';
    const bg = document.getElementById('liveBg');
    if (bg && !isHost()) {
      if (on) {
        bg.style.display = 'none';
        clearStickyLivePoster();
      } else {
        bg.style.display = '';
        ensureStickyLivePoster();
      }
    }
  }

  function revealLiveVideoWhenReady(attemptsLeft = 120) {
    const hasEl = Boolean(document.querySelector('#liveRemoteHost video'));
    if (hasPlayingRemoteVideo() || hasEl) {
      setLiveStreamVisible(true);
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
      clearStickyLivePoster(true);
      hideApLoader();
      return;
    }
    ensureStickyLivePoster();
    if (attemptsLeft <= 0) {
      ensureRemoteAudioPlaying().catch(() => { });
      return;
    }
    setTimeout(() => revealLiveVideoWhenReady(attemptsLeft - 1), 16);
  }

  async function playRemoteMedia(user, mediaType, { force = false } = {}) {
    if (!user || !agoraClient) return;
    /* Never play AV for users you blocked (or who blocked you — mirrored in cache) */
    try {
      syncAgoraUidMap();
      const map = window.__apAgoraUidMap || {};
      const appUserId = map[String(user.uid)] || null;
      if (appUserId && isLiveUserBlocked(appUserId)) {
        liveDebugLog(`skip media for blocked uid=${appUserId} media=${mediaType}`);
        try {
          user.audioTrack?.stop?.();
        } catch (_e) { }
        try {
          user.videoTrack?.stop?.();
        } catch (_e2) { }
        return;
      }
    } catch (_e3) { }

    /* Already subscribed + playing — re-subscribe tears A/V and causes choppy voice/video */
    if (!force) {
      if (mediaType === 'audio' && user.audioTrack) {
        const eng = liveMedia();
        const looksHealthy =
          user.audioTrack.isPlaying === true && !eng?.trackLooksSilent?.(user);
        if (looksHealthy) {
          await tryPlayRemoteAudioTrack(user);
          boostRemoteAudioVolumes();
          return;
        }
      }
      if (mediaType === 'video' && user.videoTrack) {
        const hostBox = document.getElementById('liveRemoteHost');
        const playingEl =
          hostBox?.querySelector?.('video[data-ap-playing="1"]') ||
          document.querySelector(`#apGuestVideo-${String(user.uid)} video[data-ap-playing="1"]`);
        if (playingEl || user.videoTrack.isPlaying === true) {
          return;
        }
      }
    }
    /* force=true: replay only — never unsubscribe (AEC duck ≠ dead track) */

    /* Browser viewers must not receive playable video (screenshot risk) — check BEFORE subscribe */
    if (mediaType === 'video' && !isNativeApApp() && !isConfirmedRoomHost()) {
      showLiveAppOnlySafetyGate();
      try {
        user.videoTrack?.stop?.();
      } catch (_e) { }
      return;
    }

    let subscribed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await withTimeout(
          agoraClient.subscribe(user, mediaType),
          mediaType === 'video' ? 6000 : 8000,
          `subscribe ${mediaType}`
        );
        subscribed = true;
        break;
      } catch (subErr) {
        const msg = subErr?.message || String(subErr);
        liveDebugLog(`subscribe FAILED uid=${user.uid} media=${mediaType} attempt=${attempt}: ${msg}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 50 * attempt));
      }
    }
    if (!subscribed) {
      scheduleMediaRecover('subscribe_failed');
      return;
    }
    if (mediaType === 'video' && !isNativeApApp() && !isConfirmedRoomHost()) {
      try {
        user.videoTrack?.stop?.();
      } catch (_e) { }
      showLiveAppOnlySafetyGate();
      return;
    }
    if (mediaType === 'video') {
      const containerHost = document.getElementById('liveRemoteHost');
      const root = document.getElementById('liveRoomRoot');
      // Host switched audio → video: leave voice stage even if URL still says mode=audio
      if (!isHost()) {
        broadcastMode = 'video';
        clearAudioModeUi();
      }
      if (root) root.classList.remove('is-audio-mode');

      syncAgoraUidMap();
      const map = window.__apAgoraUidMap || {};
      const appUserId = map[String(user.uid)] || null;
      const hostId = String(roomState?.hostId || '');
      const isGuestVideo = Boolean(appUserId && hostId && appUserId !== hostId);

      let container = containerHost;
      if (isGuestVideo) {
        rememberStickyStageGuest({
          userId: appUserId,
          name:
            (roomState?.seats || []).find((s) => String(s.userId) === appUserId)?.name ||
            (roomState?.onlineMembers || []).find((m) => String(m.userId) === appUserId)?.name ||
            'Guest',
        });
        renderGuestRail();
        const tile = document.getElementById(`apGuestVideo-${appUserId}`);
        if (tile) {
          container = tile;
          tile.hidden = false;
        }
      }

      if (container && user.videoTrack) {
        if (container === containerHost) container.innerHTML = '';
        else container.innerHTML = '';
        try {
          user.videoTrack.play(container);
        } catch (playErr) {
          liveDebugLog(`video play failed: ${playErr?.message || playErr}`);
          setTimeout(() => {
            try {
              user.videoTrack?.play(container);
              const v2 = container.querySelector('video');
              if (v2) v2.dataset.apPlaying = '1';
              bindRemoteVideoReveal(container);
              setLiveStreamVisible(true);
              clearStickyLivePoster();
            } catch (_e2) { }
          }, 50);
        }
        const vid = container.querySelector('video');
        if (vid) vid.dataset.apPlaying = '1';
        bindRemoteVideoReveal(container);
        /* Reveal video immediately in parallel with audio — don't wait on decode */
        setLiveStreamVisible(true);
        clearStickyLivePoster(true);
        const bgNow = document.getElementById('liveBg');
        if (bgNow) bgNow.style.display = 'none';
        hideApLoader();
      }
      if (!isGuestVideo) {
        revealLiveVideoWhenReady(60);
        updateModeBadge('video', false);
      }
      /* Soft audio nudge only — avoid burst re-subscribe that chops voice */
      ensureRemoteAudioPlaying().catch(() => { });
      kickstartRemoteAudio('remote-video');
    }
    if (mediaType === 'audio') {
      const shouldPlay = shouldHearRemoteAudio();
      if (shouldPlay && user.audioTrack) {
        await tryPlayRemoteAudioTrack(user);
        boostRemoteAudioVolumes();
      } else if (!shouldPlay) {
        try {
          user.audioTrack?.stop();
        } catch (_e) { }
        removeRemoteAudioSink(user.uid);
      }
      syncAgoraUidMap();
      const map = window.__apAgoraUidMap || {};
      const appUserId = map[String(user.uid)] || null;
      if (appUserId && !isRoomHostUserId(appUserId)) {
        rememberStickyStageGuest({
          userId: appUserId,
          name:
            (roomState?.seats || []).find((s) => String(s.userId) === appUserId)?.name ||
            (roomState?.onlineMembers || []).find((m) => String(m.userId) === appUserId)?.name ||
            'Guest',
        });
        renderGuestRail();
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
          await lifeUnpublish(staleAudio);
        } catch (_e) { }
        staleAudio.forEach((t) => {
          try {
            t.stop?.();
            t.close?.();
          } catch (_e) { }
        });
      }
      const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
      await lifePublish(audioTrack);
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

  async function republishLocalMicForNoisePolicy() {
    if (!agoraClient || !publishSucceeded || !liveDebugState.agoraJoined) return;
    if (!isHost() && !hasSpeakerSeat) return;
    const AgoraRTC = window.AgoraRTC || (await loadAgoraScript());
    try {
      const staleAudio = (agoraClient.localTracks || []).filter((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type === 'audio';
      });
      if (staleAudio.length) {
        try {
          await lifeUnpublish(staleAudio);
        } catch (_e) { }
        staleAudio.forEach((t) => {
          try {
            t.stop?.();
            t.close?.();
          } catch (_e2) { }
        });
      }
      localTracks = localTracks.filter((t) => {
        const type = t.getTrackType?.() || t.trackMediaType;
        return type !== 'audio';
      });
      const audioTrack = await createRoomMicrophoneTrack(AgoraRTC);
      await lifePublish(audioTrack);
      const video = getLocalVideoTrack() || rawCameraTrack;
      localTracks = video ? [audioTrack, video] : [audioTrack];
      await applyLocalMicMuteState();
      syncMicButtonUi();
      liveDebugLog(`mic republished 3A=${noiseReductionUiOn}`);
    } catch (e) {
      liveDebugLog(`mic 3A republish failed: ${e?.message || e}`);
      toast('Could not recapture microphone', 'warning');
    }
  }

  async function unlockBrowserAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!window.__apLiveAudioCtx) window.__apLiveAudioCtx = new Ctx();
      const ctx = window.__apLiveAudioCtx;
      if (ctx.state === 'suspended') await ctx.resume();
      try {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch (_e) { }
      routeRemoteAudioOutputs().catch(() => { });
      return ctx.state === 'running' || ctx.state === 'suspended';
    } catch (_e) {
      return false;
    }
  }

  function consumeEntryAudioGesture() {
    try {
      const raw = sessionStorage.getItem('ap_audio_gesture');
      if (!raw) return false;
      const ts = Number(raw) || 0;
      sessionStorage.removeItem('ap_audio_gesture');
      /* Gesture from feed tap within last 2 minutes */
      return !ts || Date.now() - ts < 120000;
    } catch (_e) {
      return false;
    }
  }

  function shouldHearRemoteAudio() {
    return Boolean(soundOn || isHost() || hasSpeakerSeat);
  }

  function syncLiveMediaPublisherMode() {
    const eng = liveMedia();
    if (!eng) return;
    /* Enable AEC compensation as soon as we have a seat — don't wait for publishSucceeded */
    eng.setPublisherMode(Boolean(isHost() || hasSpeakerSeat));
  }

  let __partyMeshTimer = null;
  let __pendingMeshPull = null;
  function runOrDeferMeshPull(fn) {
    if (window.__apGiftSending) {
      __pendingMeshPull = fn;
      setTimeout(() => {
        if (window.__apGiftSending) return;
        const queued = __pendingMeshPull;
        __pendingMeshPull = null;
        if (typeof queued === 'function') queued();
      }, 900);
      return;
    }
    fn();
  }

  function refreshPartyMeshAudio(reason) {
    if (!agoraClient || !shouldHearRemoteAudio()) return;
    const eng = liveMedia();
    const remotes = agoraClient.remoteUsers || [];
    liveDebugLog(`party mesh soft (${reason || 'nudge'}) remotes=${remotes.length}`);
    syncLiveMediaPublisherMode();
    const pull = async () => {
      /* Subscribe missing tracks only — never force-replay healthy audio */
      await Promise.all(
        remotes.map(async (user) => {
          try {
            if (user.hasAudio && !user.audioTrack) {
              await playRemoteMedia(user, 'audio', { force: false });
            }
          } catch (_e) { }
        })
      );
      if (eng?.ensureAllRemoteAudioDetailed) {
        await eng.ensureAllRemoteAudioDetailed(agoraClient, { force: false });
      } else {
        await ensureRemoteAudioPlaying();
      }
    };
    pull().catch(() => ensureRemoteAudioPlaying());
  }

  function startPartyMeshKeepalive() {
    /* Phase 1: disabled — duplicate mesh timer caused force recovery thrash */
    stopPartyMeshKeepalive();
  }

  function stopPartyMeshKeepalive() {
    if (__partyMeshTimer) {
      clearInterval(__partyMeshTimer);
      __partyMeshTimer = null;
    }
  }

  function isNativeAppWebView() {
    try {
      return Boolean(window.ReactNativeWebView) || /; wv\)/i.test(navigator.userAgent || '');
    } catch (_e) {
      return false;
    }
  }

  function notifyLiveAudioRoute(action, extra = {}) {
    try {
      logAudioTransition(`route_${action}`, extra);
      if (!window.ReactNativeWebView?.postMessage) return;
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'live_audio_route',
          action,
          ts: Date.now(),
          ...extra,
        })
      );
    } catch (_e) { }
  }

  function requestNativeSpeakerAudio(opts = {}) {
    try {
      /* Host + all Android seats: playback (avoid HW AEC). Desktop seats: talk. Audience: play. */
      const seatTalking = Boolean(!isHost() && hasSpeakerSeat);
      const android = isAndroidHostMicRisk();
      const mode = seatTalking && !android ? 'talk' : 'play';
      const now = Date.now();
      if (
        !opts.force &&
        window.__apLiveAudioMode === mode &&
        now - Number(window.__apLiveAudioModeAt || 0) < 1200
      ) {
        return;
      }
      window.__apLiveAudioMode = mode;
      window.__apLiveAudioModeAt = now;
      logAudioTransition('requestNativeSpeakerAudio', { mode, reason: opts.reason || 'request' });
      if (mode === 'talk') {
        notifyLiveAudioRoute('enterTalk', { bluetoothSafe: true, reason: opts.reason || 'requestNativeSpeakerAudio' });
      } else {
        notifyLiveAudioRoute('enterPlayback', { reason: opts.reason || 'requestNativeSpeakerAudio' });
      }
      /* Compat for older app builds — only once per mode change to avoid BT thrash */
      if (opts.force || window.__apForceSpeakerPostedMode !== mode) {
        window.__apForceSpeakerPostedMode = mode;
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'force_speaker_audio',
            recording: mode === 'talk',
            bluetoothSafe: true,
            ts: Date.now(),
          })
        );
      }
    } catch (_e) { }
  }

  /** Route remote audio — desktop uses setSinkId; Android WebView cannot — native LiveAudioRoute owns BT. */
  async function routeRemoteAudioOutputs() {
    try {
      if (/Android/i.test(navigator.userAgent || '')) {
        liveDebugLog('audio output: skip setSinkId on Android (native LiveAudioRoute)');
        notifyLiveAudioRoute('reevaluate', { reason: 'android_bluetooth_output' });
        return;
      }
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outs = devices.filter((d) => d.kind === 'audiooutput');
      if (!outs.length) return;
      if (typeof HTMLMediaElement === 'undefined' || typeof HTMLMediaElement.prototype.setSinkId !== 'function') {
        return;
      }
      const bt = outs.find((d) =>
        /bluetooth|bt |airpods|galaxy buds|headset|headphone|wh-?\d|ears/i.test(String(d.label || ''))
      );
      const pick = bt || outs.find((d) => d.deviceId && d.deviceId !== 'communications') || outs[0];
      if (!pick?.deviceId) return;
      const els = document.querySelectorAll(
        'audio.ap-remote-audio-sink, audio[data-ap-remote-audio="1"], audio#apRemoteAudioSink'
      );
      await Promise.all(
        Array.from(els).map(async (el) => {
          try {
            if (typeof el.setSinkId === 'function') {
              await el.setSinkId(pick.deviceId);
            }
          } catch (_e) { }
        })
      );
      liveDebugLog(`audio output routed → ${pick.label || pick.deviceId}`);
    } catch (_e) { }
  }

  /* Slice 2: notify native when outputs change (BT / headset). Native re-applies LiveAudioRoute. */
  try {
    if (!window.__apAudioRouteDeviceChangeBound && navigator.mediaDevices?.addEventListener) {
      window.__apAudioRouteDeviceChangeBound = true;
      let btRouteTimer = null;
      navigator.mediaDevices.addEventListener('devicechange', () => {
        clearTimeout(btRouteTimer);
        btRouteTimer = setTimeout(() => {
          /* Reevaluate only — do NOT force speaker again (fights Bluetooth A2DP/SCO) */
          notifyLiveAudioRoute('reevaluate', { reason: 'mediaDevices_devicechange' });
          ensureRemoteAudioPlaying()
            .then(() => {
              boostRemoteAudioVolumes();
              return routeRemoteAudioOutputs();
            })
            .catch(() => { });
          setTimeout(() => boostRemoteAudioVolumes(), 600);
        }, 500);
      });
    }
  } catch (_e) { }

  function disconnectRemoteAudioGraph(uid) {
    const key = String(uid);
    const node = __remoteAudioGraph.get(key);
    if (!node) return;
    try {
      node.source?.disconnect?.();
    } catch (_e) { }
    try {
      node.gain?.disconnect?.();
    } catch (_e2) { }
    try {
      if (node.cloned && node.source?.mediaStream) {
        node.source.mediaStream.getTracks?.().forEach((t) => {
          try {
            t.stop?.();
          } catch (_e3) { }
        });
      }
    } catch (_e4) { }
    __remoteAudioGraph.delete(key);
  }

  /**
   * Legacy Web Audio path — unused when LiveMediaEngine is loaded.
   * Kept as last-resort fallback only.
   */
  async function playRemoteAudioViaWebAudio(user) {
    if (!user?.audioTrack || !shouldHearRemoteAudio()) return false;
    try {
      await unlockBrowserAudio();
      const ctx = window.__apLiveAudioCtx;
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      const mst =
        typeof user.audioTrack.getMediaStreamTrack === 'function'
          ? user.audioTrack.getMediaStreamTrack()
          : null;
      if (!mst || mst.readyState === 'ended') return false;
      disconnectRemoteAudioGraph(user.uid);
      const source = ctx.createMediaStreamSource(new MediaStream([mst]));
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      __remoteAudioGraph.set(String(user.uid), { source, gain, trackId: mst.id });
      return ctx.state === 'running';
    } catch (err) {
      liveDebugLog(`web-audio play failed uid=${user.uid}: ${err?.message || err}`);
      return false;
    }
  }

  function getOrCreateRemoteAudioSink(uid) {
    const key = String(uid);
    let el = __remoteAudioSinkEls.get(key);
    if (el && el.isConnected) return el;
    el = document.getElementById(`apRemoteAudioSink-${key}`);
    if (!el) {
      el = document.createElement('audio');
      el.id = `apRemoteAudioSink-${key}`;
      el.className = 'ap-remote-audio-sink';
      el.dataset.apRemoteAudio = '1';
      el.autoplay = true;
      el.controls = false;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.setAttribute('x5-playsinline', '');
      el.setAttribute('x5-video-player-type', 'h5');
      /* On-screen tiny sink — left:-9999px is muted by some Android WebViews */
      el.style.cssText =
        'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
      document.body.appendChild(el);
    }
    __remoteAudioSinkEls.set(key, el);
    return el;
  }

  function removeRemoteAudioSink(uid) {
    const key = String(uid);
    disconnectRemoteAudioGraph(uid);
    const el = __remoteAudioSinkEls.get(key) || document.getElementById(`apRemoteAudioSink-${key}`);
    __remoteAudioSinkEls.delete(key);
    if (el) {
      try {
        el.pause?.();
        el.srcObject = null;
        el.removeAttribute('src');
        el.remove();
      } catch (_e) { }
    }
  }

  /**
   * Android/iOS WebView often "plays" Agora audio with no audible output.
   * Pipe the MediaStreamTrack into an explicit <audio> element as a second path.
   */
  async function playRemoteAudioViaDomSink(user) {
    if (!user?.audioTrack || !shouldHearRemoteAudio()) return false;
    try {
      const mst =
        typeof user.audioTrack.getMediaStreamTrack === 'function'
          ? user.audioTrack.getMediaStreamTrack()
          : null;
      if (!mst || mst.readyState === 'ended') return false;
      disconnectRemoteAudioGraph(user.uid);
      const el = getOrCreateRemoteAudioSink(user.uid);
      el.muted = false;
      el.defaultMuted = false;
      el.volume = 1;
      try {
        el.removeAttribute('muted');
      } catch (_e) { }
      const stream = el.srcObject;
      const sameTrack =
        stream &&
        typeof stream.getAudioTracks === 'function' &&
        stream.getAudioTracks()[0] === mst;
      if (!sameTrack) {
        el.srcObject = new MediaStream([mst]);
      }
      const playP = el.play?.();
      if (playP && typeof playP.then === 'function') await playP;
      return !el.paused && !el.muted;
    } catch (err) {
      liveDebugLog(`audio sink failed uid=${user.uid}: ${err?.message || err}`);
      return false;
    }
  }

  async function remountRemoteAudio(user) {
    if (!user || !agoraClient || !shouldHearRemoteAudio()) return false;
    const eng = liveMedia();
    if (eng) {
      return eng.remountIfDead(user, async (u) => {
        await playRemoteMedia(u, 'audio', { force: true });
      });
    }
    return tryPlayRemoteAudioTrack(user);
  }

  function boostRemoteAudioVolumes() {
    syncLiveMediaPublisherMode();
    const eng = liveMedia();
    logAudioTransition('boost_remote_volumes', {
      vol: remotePlaybackVolume(),
      quietPhone: isQuietPhoneHostListener(),
    });
    if (eng) {
      eng.boostAll(agoraClient);
      return;
    }
    try {
      for (const user of agoraClient?.remoteUsers || []) {
        try {
          user.audioTrack?.setVolume?.(remotePlaybackVolume(user));
        } catch (_e) { }
      }
    } catch (_e) { }
  }

  function isRemoteAudioTrackAudible(track) {
    if (!track) return false;
    try {
      if (track.isPlaying === true) return true;
      if (typeof track.getVolumeLevel === 'function') {
        const lvl = Number(track.getVolumeLevel()) || 0;
        return lvl > 0.0001;
      }
      return true;
    } catch (_e) {
      return Boolean(track);
    }
  }

  async function tryPlayRemoteAudioTrack(user, opts) {
    if (!user?.audioTrack) return false;
    if (!shouldHearRemoteAudio()) return false;
    requestNativeSpeakerAudio();
    const force = Boolean(opts?.force);
    /* Drop legacy Web Audio graphs — dual path = double/fish-market noise */
    try {
      disconnectRemoteAudioGraph(user.uid);
    } catch (_g) { }
    const eng = liveMedia();
    if (eng) {
      syncLiveMediaPublisherMode();
      const ok = await eng.playRemoteAudio(user, { force });
      if (ok) {
        audioUnlocked = true;
        hideTapForSoundHint();
      }
      return ok;
    }
    /* Legacy fallback if engine script missing */
    try {
      user.audioTrack.setVolume?.(remotePlaybackVolume());
      const sink = getOrCreateRemoteAudioSink(user.uid);
      sink.muted = false;
      sink.volume = 1;
      const p = user.audioTrack.play?.(sink);
      if (p && typeof p.then === 'function') await p;
      audioUnlocked = true;
      hideTapForSoundHint();
      return true;
    } catch (err) {
      liveDebugLog(`audio play blocked: ${err?.message || err}`);
      return false;
    }
  }

  function unmuteDomMediaElements() {
    try {
      const nodes = document.querySelectorAll(
        'audio.ap-remote-audio-sink, audio[data-ap-remote-audio="1"], #partyBgMusic, audio[data-ap-unlock="1"]'
      );
      nodes.forEach((el) => {
        try {
          el.muted = false;
          el.defaultMuted = false;
          el.volume = Math.max(Number(el.volume) || 0, 1);
          try {
            el.removeAttribute('muted');
          } catch (_m) {}
          if (el.paused) {
            const playP = el.play?.();
            if (playP && typeof playP.catch === 'function') playP.catch(() => { });
          }
        } catch (_e) { }
      });
    } catch (_e) { }
  }

  async function ensureRemoteAudioPlaying() {
    if (!agoraClient) return false;
    if (!shouldHearRemoteAudio()) return false;
    await unlockBrowserAudio();
    const eng = liveMedia();
    if (eng) {
      syncLiveMediaPublisherMode();
      /* Subscribe missing tracks first */
      const remotes = agoraClient.remoteUsers || [];
      await Promise.all(
        remotes.map(async (user) => {
          try {
            if (user.hasAudio && !user.audioTrack) {
              await playRemoteMedia(user, 'audio', { force: false });
            }
          } catch (_e) { }
        })
      );
      const status = eng.ensureAllRemoteAudioDetailed
        ? await eng.ensureAllRemoteAudioDetailed(agoraClient, { force: false })
        : { allOk: await eng.ensureAllRemoteAudio(agoraClient, { force: false }) };
      if (status?.allOk) {
        audioUnlocked = true;
        hideTapForSoundHint();
      }
      return Boolean(status?.allOk);
    }
    const remotes = agoraClient.remoteUsers || [];
    let okCount = 0;
    let needCount = 0;
    await Promise.all(
      remotes.map(async (user) => {
        try {
          if (!(user.hasAudio || user.audioTrack)) return;
          needCount += 1;
          if (user.hasAudio && !user.audioTrack) {
            await playRemoteMedia(user, 'audio', { force: false });
          }
          if (user.audioTrack) {
            const ok = await tryPlayRemoteAudioTrack(user, { force: false });
            if (ok) okCount += 1;
          }
        } catch (_e) { }
      })
    );
    const allOk = needCount > 0 && okCount >= needCount;
    if (allOk) {
      audioUnlocked = true;
      hideTapForSoundHint();
      boostRemoteAudioVolumes();
    }
    return allOk;
  }

  /** Soft kickstart — ensure playing once; never restart health watch or thrash healthy audio. */
  function kickstartRemoteAudio(reason) {
    if (!shouldHearRemoteAudio()) return;
    requestNativeSpeakerAudio();
    liveDebugLog(`audio kickstart soft (${reason})`);
    unlockBrowserAudio()
      .then(() => ensureRemoteAudioPlaying())
      .then((ok) => {
        if (ok) boostRemoteAudioVolumes();
      })
      .catch(() => { });
  }

  /**
   * Legacy silent watchdog — only used if LiveMediaEngine is absent.
   */
  function startSilentAudioWatchdog(ms = 30000) {
    __audioSinkWatchUntil = Math.max(__audioSinkWatchUntil, Date.now() + ms);
    if (__audioSinkWatchTimer) return;
    let quietTicks = 0;
    __audioSinkWatchTimer = setInterval(() => {
      if (socketLeaveIntentional || Date.now() > __audioSinkWatchUntil) {
        clearInterval(__audioSinkWatchTimer);
        __audioSinkWatchTimer = null;
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (!agoraClient || !shouldHearRemoteAudio()) return;
      if (liveMedia()) return;
      const remotes = (agoraClient.remoteUsers || []).filter((u) => u.hasAudio);
      if (!remotes.length) return;
      let needs = false;
      remotes.forEach((user) => {
        if (!user.audioTrack || user.audioTrack.isPlaying === false) needs = true;
      });
      if (needs) {
        quietTicks += 1;
        ensureRemoteAudioPlaying().catch(() => { });
        if (quietTicks >= 5) quietTicks = 0;
      } else quietTicks = 0;
    }, 4000);
  }

  function forceRemoteAudio(reason) {
    requestNativeSpeakerAudio();
    if (!soundOn && !isHost() && !hasSpeakerSeat) {
      soundOn = true;
      try {
        const btn = document.getElementById('btnSound');
        const ico = btn?.querySelector?.('i');
        if (ico) ico.className = 'fas fa-volume-up';
        btn?.classList?.remove?.('is-muted');
      } catch (_e) { }
    }
    kickstartRemoteAudio(reason || 'force');
    ensureRemoteAudioPlaying().catch(() => { });
  }

  function ensureTapForSoundEl() {
    let el = document.getElementById('apTapForSound');
    if (el) return el;
    el = document.createElement('button');
    el.type = 'button';
    el.id = 'apTapForSound';
    el.className = 'ap-tap-for-sound';
    el.setAttribute('aria-label', 'Tap to enable live sound');
    el.innerHTML = '<i class="fas fa-volume-up"></i><span>Tap for sound</span>';
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      soundOn = true;
      audioUnlocked = true;
      requestNativeSpeakerAudio();
      try {
        await unlockBrowserAudio();
      } catch (_e) { /* ignore */ }
      unmuteDomMediaElements();
      const eng = liveMedia();
      if (eng && agoraClient) {
        for (const user of agoraClient.remoteUsers || []) {
          if (user.hasAudio && !user.audioTrack) {
            try {
              await playRemoteMedia(user, 'audio', { force: true });
            } catch (_e2) { /* ignore */ }
          }
          if (user.audioTrack) {
            try {
              user.audioTrack.setVolume?.(remotePlaybackVolume(user));
              await eng.playRemoteAudio(user, { force: true });
            } catch (_e3) { /* ignore */ }
          }
        }
        eng.boostAll(agoraClient);
      }
      forceRemoteAudio('tap_for_sound');
      await ensureRemoteAudioPlaying();
      boostRemoteAudioVolumes();
      toast('Sound on', 'success');
      hideTapForSoundHint();
      try {
        sessionStorage.setItem('ap_sound_unlocked', '1');
      } catch (_e) { /* ignore */ }
    });
    document.body.appendChild(el);
    return el;
  }

  function isRemoteAudioAudibleNow() {
    try {
      const remotes = agoraClient?.remoteUsers || [];
      for (const user of remotes) {
        const t = user?.audioTrack;
        if (!t) continue;
        if (t.isPlaying === true) {
          try {
            if (typeof t.getVolumeLevel === 'function') {
              if (Number(t.getVolumeLevel()) > 0.002) return true;
            } else return true;
          } catch (_e) {
            return true;
          }
        }
      }
      const sinks = document.querySelectorAll('audio.ap-remote-audio-sink, audio[data-ap-remote-audio]');
      for (const el of sinks) {
        if (el && !el.paused && !el.muted && el.volume > 0) return true;
      }
    } catch (_e) { /* ignore */ }
    return false;
  }

  function soundHintWasDismissed() {
    try {
      return sessionStorage.getItem('ap_sound_unlocked') === '1';
    } catch (_e) {
      return false;
    }
  }

  function showTapForSoundHint() {
    if (isPartyRoomPage()) return;
    if (audioUnlocked || soundHintWasDismissed()) return;
    if (!shouldHearRemoteAudio()) return;
    const el = ensureTapForSoundEl();
    el.classList.add('is-visible');
    el.style.display = '';
  }

  function hideTapForSoundHint() {
    const el = document.getElementById('apTapForSound');
    if (el) {
      el.classList.remove('is-visible');
      el.style.display = 'none';
    }
  }

  function scheduleSilentAudioPrompt() {
    if (audioUnlocked || soundHintWasDismissed()) return;
    if (window.__apSilentAudioPromptTimer) clearTimeout(window.__apSilentAudioPromptTimer);
    window.__apSilentAudioPromptTimer = setTimeout(() => {
      try {
        if (document.visibilityState !== 'visible') return;
        if (!agoraClient || !shouldHearRemoteAudio()) return;
        const hasRemoteAudio = (agoraClient.remoteUsers || []).some((u) => u.hasAudio || u.audioTrack);
        if (!hasRemoteAudio) return;
        if (isRemoteAudioAudibleNow() || audioUnlocked || soundHintWasDismissed()) {
          hideTapForSoundHint();
          return;
        }
        forceRemoteAudio('silent_prompt');
        showTapForSoundHint();
      } catch (_e) { /* ignore */ }
    }, 2200);
  }

  function bindAudioUnlockGestures() {
    if (audioUnlockBound) return;
    audioUnlockBound = true;
    const unlock = () => {
      unlockBrowserAudio()
        .then(() => ensureRemoteAudioPlaying())
        .then((ok) => {
          if (ok) {
            audioUnlocked = true;
            if (isRemoteAudioAudibleNow()) hideTapForSoundHint();
            boostRemoteAudioVolumes();
          } else {
            scheduleSilentAudioPrompt();
          }
        })
        .catch(() => {
          scheduleSilentAudioPrompt();
        });
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('keydown', unlock, { passive: true });
    /* First paint: if user entered from a feed tap, treat as unlocked */
    if (consumeEntryAudioGesture()) {
      audioUnlocked = true;
      unlock();
    }
    scheduleSilentAudioPrompt();
  }

  function ensureHostVideoVisible() {
    if (broadcastMode !== 'video') return;
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

  function showWinBanner(_gift) {
    /* Disabled — chat already shows "X sent to Y"; WIN flash was a duplicate notice */
    const el = document.getElementById('partyWinBanner');
    if (!el) return;
    el.innerHTML = '';
    el.classList.remove('is-flash');
  }

  function renderJoinRequests() {
    const list = document.getElementById('partyRequestsList');
    const badge = document.getElementById('partyReqCount');
    const badgeFloat = document.getElementById('partyReqCountFloat');
    const mod = canModerateRoom();
    const countStr = String(mod ? joinRequests.length : getPartyMembersForList().length);
    if (badge) badge.textContent = countStr;
    if (badgeFloat) {
      const n = mod ? joinRequests.length : 0;
      badgeFloat.textContent = String(n);
      if (n > 0) {
        badgeFloat.hidden = false;
        badgeFloat.removeAttribute('hidden');
      } else {
        badgeFloat.hidden = true;
        badgeFloat.setAttribute('hidden', '');
      }
    }
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
    /* Clicks handled by delegated bindPartyRequestsSheet listeners */
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
    /* Do not also sum roomState.gifts — those are the same sends already in roomGiftHistory */
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
    if (micLinkPending) {
      toast('Request pending — tap mic to cancel', 'info');
      return;
    }
    if (hasSpeakerSeat) {
      toast(isLiveRoomPage() ? 'You are already on the stream' : 'You already have a seat', 'info');
      return;
    }
    if (isStageFull()) {
      toast(
        isLiveRoomPage()
          ? `Live stage is full — max ${LIVE_MAX_ON_STAGE} people (host + ${LIVE_MAX_GUESTS} guests)`
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
    micLinkPending = true;
    startMicRequestWatchdog();
    toast(isPartyRoomPage() ? 'Seat request sent — tap mic to cancel' : 'Request sent to host', 'info');
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
      /* Live PK → stop; otherwise open PK Types (start only after confirm) */
      if (isPkLiveNow()) {
        try {
          closeToolsSheetOnly?.();
        } catch (_e) {
          document.getElementById('partyToolsSheet')?.classList.remove('open');
        }
        requestStopPk();
        return;
      }
      openPkTypesSheet();
    });

    document.getElementById('liveBtnHostMute')?.addEventListener('click', () => toggleMic());
    document.getElementById('liveBtnMuteAllChat')?.addEventListener('click', () => {
      setRoomChatLocked(!Boolean(roomState?.chatLocked));
    });
    document.getElementById('liveBtnClearChat')?.addEventListener('click', () => clearLiveChat());
    document.getElementById('partyBtnMuteAllChat')?.addEventListener('click', () => {
      setRoomChatLocked(!Boolean(roomState?.chatLocked));
    });
    document.getElementById('partyBtnClearChat')?.addEventListener('click', () => clearLiveChat());
    document.getElementById('partyToolsMuteAllChat')?.addEventListener('click', () => {
      setRoomChatLocked(!Boolean(roomState?.chatLocked));
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    });
    document.getElementById('partyToolsClearChat')?.addEventListener('click', () => {
      clearLiveChat();
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    });

    document.getElementById('liveBtnFlipCam')?.addEventListener('click', () => switchCameraFacing());
    document.getElementById('liveBtnFilters')?.addEventListener('click', () => openVideoFilterSheet());
    document.getElementById('partyToolsFlipCam')?.addEventListener('click', () => {
      switchCameraFacing();
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    });
    document.getElementById('partyToolsFilters')?.addEventListener('click', () => {
      openVideoFilterSheet();
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    });
  }

  function isValidGiftUserId(id) {
    const s = String(id || '').trim();
    if (!s || s === 'null' || s === 'undefined') return false;
    /* UUID or numeric display-backed ids — reject obvious garbage */
    return s.length >= 8;
  }

  function getGiftRecipients() {
    const meId = String(currentUser()?.id || '');
    const hostId = String(roomState?.hostId || activeFeedHostId || '');
    const hostName = roomState?.hostName || 'Host';
    const list = [];
    const push = (name, id, kind) => {
      const uid = isValidGiftUserId(id) ? String(id).trim() : '';
      if (!uid || uid === meId) return;
      if (list.some((x) => String(x.id) === uid)) return;
      list.push({
        name: String(name || (kind === 'host' ? 'Host' : 'Guest')).slice(0, 32),
        id: uid,
        kind: kind || 'guest',
      });
    };

    /* Streamer always first for viewers */
    if (hostId && hostId !== meId) push(hostName, hostId, 'host');

    /* On-stage guests only (valid user ids) — not every lurker */
    (roomState?.seats || []).forEach((s) => {
      if (!s) return;
      const uid = (s.userId ?? s.user_id ?? s.id ?? s.uid) != null ? String(s.userId ?? s.user_id ?? s.id ?? s.uid) : '';
      if (!uid || uid === meId) return;
      if (s.isHost || (hostId && uid === hostId)) return;
      push(s.name || 'Guest', uid, 'seat');
    });

    (roomState?.onlineMembers || []).forEach((m) => {
      if (!m) return;
      const uid = (m.userId ?? m.user_id ?? m.id ?? m.uid) != null ? String(m.userId ?? m.user_id ?? m.id ?? m.uid) : '';
      if (!uid || uid === meId) return;
      if (hostId && uid === hostId) return;
      const onStage = memberIsOnMic(m);
      if (onStage) push(m.name || 'Guest', uid, 'seat');
    });

    return list;
  }

  function getActiveGiftRecipients() {
    const meId = String(currentUser()?.id || '');
    const all = getGiftRecipients().filter(
      (r) => isValidGiftUserId(r.id) && String(r.id) !== meId
    );
    const sendAll = document.getElementById('giftSendAll')?.checked;
    if (sendAll) return all;
    const sheet = document.getElementById('giftSheet');
    const hostId = String(roomState?.hostId || activeFeedHostId || '');
    const toId = sheet?.dataset?.toUserId || '';
    if (isValidGiftUserId(toId) && toId !== meId) {
      const byId = all.find((r) => String(r.id) === String(toId));
      if (byId) return [byId];
      /* Selected id may briefly vanish on seat churn — keep gifting host */
      if (hostId && hostId !== meId) {
        const host = all.find((r) => String(r.id) === hostId);
        if (host) return [host];
      }
    }
    /* Prefer streamer for viewers; otherwise first guest with an id */
    if (hostId && hostId !== meId) {
      const host = all.find((r) => String(r.id) === hostId);
      if (host) return [host];
    }
    return all[0] ? [all[0]] : [];
  }

  function resolveGiftReceiverId(toName) {
    const meId = String(currentUser()?.id || '');
    const hostId = String(roomState?.hostId || activeFeedHostId || '');
    const sheet = document.getElementById('giftSheet');
    const fromSheet = sheet?.dataset?.toUserId ? String(sheet.dataset.toUserId).trim() : '';

    if (isValidGiftUserId(fromSheet) && fromSheet !== meId) {
      const stillThere = getGiftRecipients().some((r) => String(r.id) === fromSheet);
      if (stillThere) return fromSheet;
      /* Seat snapshot race — fall back to host rather than fail send */
      if (hostId && hostId !== meId) return hostId;
      return fromSheet;
    }

    const recipients = getGiftRecipients().filter(
      (r) => isValidGiftUserId(r.id) && String(r.id) !== meId
    );

    /* Prefer host when opened for stream (don't name-match a newly seated guest) */
    if (sheet?.dataset?.preferHost === '1' && hostId && hostId !== meId) return hostId;

    /* Name match only if unique among giftable people */
    if (toName) {
      const nameHits = recipients.filter((r) => r.name === toName);
      if (nameHits.length === 1 && nameHits[0].id !== meId) return String(nameHits[0].id);
    }

    if (hostId && hostId !== meId) return hostId;
    if (recipients[0]?.id && String(recipients[0].id) !== meId) return String(recipients[0].id);
    return '';
  }

  function refreshOpenGiftRecipients() {
    const sheet = document.getElementById('giftSheet');
    if (!sheet?.classList.contains('open')) return;
    /* Don't rebuild chips mid-send — seat joins were wiping the receiver mid-gift */
    if (window.__apGiftSending) return;
    const meId = String(currentUser()?.id || '');
    const hostId = String(roomState?.hostId || activeFeedHostId || '');
    const prevId = sheet.dataset.toUserId || '';
    const list = getGiftRecipients();
    let keepId = isValidGiftUserId(prevId) && prevId !== meId ? prevId : '';
    /* If previous target briefly missing from snapshot, prefer host — do not jump to newest guest */
    if (keepId && !list.some((r) => String(r.id) === keepId)) {
      keepId = '';
    }
    if (!keepId || sheet.dataset.preferHost === '1') {
      if (hostId && hostId !== meId && list.some((r) => String(r.id) === hostId)) {
        keepId = hostId;
      } else if (!keepId) {
        keepId = list[0]?.id || '';
      }
    }
    const activeName = list.find((r) => String(r.id) === keepId)?.name || list[0]?.name || '';
    if (keepId) sheet.dataset.toUserId = keepId;
    else delete sheet.dataset.toUserId;
    if (activeName) sheet.dataset.to = activeName;
    if (hostId && keepId === hostId) sheet.dataset.preferHost = '1';
    renderGiftRecipients(keepId, activeName);
  }

  async function shareRoomLink() {
    openInAppShareSheet();
  }

  function closeInAppShareSheet() {
    const sheet = document.getElementById('apInAppShareSheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.style.pointerEvents = 'none';
    sheet.style.display = 'none';
    sheet.style.removeProperty('visibility');
    syncLiveOverlayClass();
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
      if (e.target.id !== 'apInAppShareSheet') return;
      if (Date.now() < (Number(window.__apShareOpenGuardUntil) || 0)) return;
      closeInAppShareSheet();
    });
    document.getElementById('apShareCancel')?.addEventListener('click', () => {
      closeInAppShareSheet();
    });
  }

  async function openInAppShareSheet() {
    ensureInAppShareSheet();
    const sheet = document.getElementById('apInAppShareSheet');
    const list = document.getElementById('apShareUserList');
    if (!sheet || !list) return;
    unlockLiveChrome({ forceGift: true });
    closeLiveOverlays('share');
    window.__apShareOpenGuardUntil = Date.now() + 900;
    sheet.style.display = 'flex';
    sheet.style.pointerEvents = 'auto';
    sheet.style.visibility = 'visible';
    sheet.style.zIndex = '15000';
    sheet.classList.add('open');
    if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
    syncLiveOverlayClass();

    const hostName = roomState?.hostName || displayName(currentUser()) || 'Host';
    const page = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';
    let url = '';
    let path = '';
    try {
      url = viewerShareUrl();
      path = viewerSharePath();
    } catch (_e) {
      url = location.href;
      path = location.pathname + location.search;
    }
    const inviteText =
      `${hostName} invited you to a ${page} room on AP Services.\n` +
      `Tap Join to enter: ${path}\n${url}`;

    const isInviteUserId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '').trim());

    const normalizeInviteUsers = (rows) => {
      const seen = new Set();
      const me = String(currentUser()?.id || '');
      return (rows || [])
        .map((u) => ({
          id: String(u?.id || u?.key || u?.userId || '').trim(),
          name: String(u?.name || 'User').trim() || 'User',
          photo: u?.photo || u?.profilePic || u?.profile_pic || null,
        }))
        .filter((u) => {
          if (!isInviteUserId(u.id)) return false;
          if (seen.has(u.id)) return false;
          if (me && u.id === me) return false;
          seen.add(u.id);
          return true;
        });
    };

    const readCachedInviteFriends = () => {
      try {
        if (window.SocialInteractions?.getFollowEntries) {
          return SocialInteractions.getFollowEntries();
        }
      } catch (_e) { }
      return [];
    };

    const roomFallbackPeople = () => {
      try {
        return (getPartyMembersForList?.() || [])
          .filter((m) => m?.userId && !isRoomHostUserId?.(m.userId))
          .map((m) => ({
            id: String(m.userId),
            name: m.name || 'Guest',
            photo: m.profilePic || null,
          }));
      } catch (_e) {
        return [];
      }
    };

    const bindInviteRows = (users) => {
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
    };

    const paintInviteList = (rawUsers) => {
      if (!list.isConnected) return;
      let users = normalizeInviteUsers(rawUsers);
      if (!users.length) users = normalizeInviteUsers(roomFallbackPeople());
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
        <img src="${avatarUrl(u.name, u.photo)}" alt="">
        <span>${escapeHtml(u.name)}</span>
        <span class="ap-share-status"><i class="fas fa-paper-plane"></i> Invite</span>
      </button>`
        )
        .join('');
      bindInviteRows(users);
    };

    /* Instant: never leave the sheet on "Loading…" while network hangs */
    const cached = readCachedInviteFriends();
    const hasCache = normalizeInviteUsers(cached).length > 0;
    if (hasCache) paintInviteList(cached);
    else {
      list.innerHTML =
        '<p class="ap-share-loading"><span class="ap-share-skeleton" aria-hidden="true"></span> Loading friends…</p>';
    }

    const fetchFollowingDirect = async () => {
      const token =
        (window.Auth?.getToken?.() || localStorage.getItem('token') || '').trim();
      if (!token) return [];
      const endpoint =
        typeof window.joinApiUrl === 'function'
          ? joinApiUrl('/social/following?limit=80')
          : 'https://api.apservices.in/api/social/following?limit=80';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
        const rows = Array.isArray(data?.data) ? data.data : [];
        return rows.map((u) => ({
          id: String(u.id),
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
          photo: u.profile_pic || null,
        }));
      } finally {
        clearTimeout(timer);
      }
    };

    let settled = false;
    const failSafe = setTimeout(() => {
      if (settled) return;
      settled = true;
      /* Clear loading no matter what — show cache / empty / room people */
      if (list.querySelector('.ap-share-loading')) {
        paintInviteList(readCachedInviteFriends());
      }
    }, 4000);

    try {
      /* Soft refresh auth (never block invite UI long) */
      if (window.Auth?.ensureAccessToken) {
        await Promise.race([
          Promise.resolve(Auth.ensureAccessToken()).catch(() => null),
          new Promise((r) => setTimeout(r, 1200)),
        ]);
      }

      let users = [];
      try {
        users = await fetchFollowingDirect();
      } catch (_e) {
        users = [];
      }

      if (!users.length) {
        try {
          users = await Promise.race([
            loadInviteFriendTargets(),
            new Promise((r) => setTimeout(() => r([]), 2500)),
          ]);
        } catch (_e) {
          users = [];
        }
      }

      if (!settled) {
        settled = true;
        if (users?.length) {
          try {
            const entries = normalizeInviteUsers(users).map((u) => ({
              key: u.id,
              id: u.id,
              name: u.name,
              photo: u.photo,
            }));
            if (entries.length) {
              localStorage.setItem('social_follows', JSON.stringify(entries));
            }
          } catch (_e) { }
          paintInviteList(users);
        } else if (list.querySelector('.ap-share-loading') || !hasCache) {
          paintInviteList(readCachedInviteFriends());
        }
      }
    } catch (_e) {
      if (!settled) {
        settled = true;
        paintInviteList(readCachedInviteFriends());
      }
    } finally {
      clearTimeout(failSafe);
    }
  }

  async function loadInviteFriendTargets() {
    let users = [];
    try {
      if (window.SocialInteractions?.getFollowEntries) {
        users = SocialInteractions.getFollowEntries().map((e) => ({
          id: String(e.id || e.key || ''),
          name: e.name || 'User',
          photo: e.photo || null,
        }));
      }
    } catch (_e) { }

    try {
      if (window.SocialInteractions?.fetchFollowingList) {
        const rows = await Promise.race([
          SocialInteractions.fetchFollowingList(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        if (Array.isArray(rows) && rows.length) {
          users = rows.map((u) => ({
            id: String(u.id || u.key || u.userId || ''),
            name: u.name || 'User',
            photo: u.photo || null,
          }));
        }
      }
    } catch (_e) { }

    if (!users.filter((u) => /^[0-9a-f-]{36}$/i.test(String(u.id || ''))).length) {
      try {
        return getPartyMembersForList()
          .filter((m) => m?.userId && !isRoomHostUserId(m.userId))
          .map((m) => ({
            id: String(m.userId),
            name: m.name || 'Guest',
            photo: m.profilePic || null,
          }));
      } catch (_e) {
        return users;
      }
    }
    return users;
  }

  function renderGiftRecipients(activeUserId, activeName) {
    const row = document.getElementById('giftRecipients');
    if (!row) return;
    const meId = String(currentUser()?.id || '');
    const recipients = getGiftRecipients();
    const preferredId =
      (isValidGiftUserId(activeUserId) && activeUserId !== meId && recipients.some((r) => String(r.id) === String(activeUserId))
        ? String(activeUserId)
        : '') ||
      (recipients.find((r) => r.name === activeName && String(r.id) !== meId)?.id
        ? String(recipients.find((r) => r.name === activeName && String(r.id) !== meId).id)
        : '') ||
      String(recipients[0]?.id || '');

    row.innerHTML = recipients
      .map(
        (r) => `
      <button type="button" class="gift-recipient${String(r.id) === preferredId ? ' is-active' : ''}" data-to="${escapeHtml(r.name)}" data-user-id="${escapeHtml(String(r.id || ''))}">
        <img src="${avatarUrl(r.name)}" alt="">
        <span>${escapeHtml(r.name.slice(0, 8))}</span>
      </button>`
      )
      .join('');
    row.querySelectorAll('.gift-recipient').forEach((btn) => {
      btn.addEventListener('click', () => {
        const allCb = document.getElementById('giftSendAll');
        if (allCb?.checked) allCb.checked = false;
        row.querySelectorAll('.gift-recipient').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const sheet = document.getElementById('giftSheet');
        if (sheet) {
          sheet.dataset.to = btn.dataset.to || '';
          const uid = btn.dataset.userId || '';
          if (isValidGiftUserId(uid) && uid !== meId) sheet.dataset.toUserId = uid;
          else delete sheet.dataset.toUserId;
          const hostId = String(roomState?.hostId || activeFeedHostId || '');
          sheet.dataset.preferHost = hostId && uid === hostId ? '1' : '0';
        }
      });
    });
    const sheet = document.getElementById('giftSheet');
    if (sheet) {
      if (preferredId && preferredId !== meId) {
        sheet.dataset.toUserId = preferredId;
        const nm = recipients.find((r) => String(r.id) === preferredId)?.name;
        if (nm) sheet.dataset.to = nm;
        const hostId = String(roomState?.hostId || activeFeedHostId || '');
        if (!sheet.dataset.preferHost) {
          sheet.dataset.preferHost = hostId && preferredId === hostId ? '1' : '0';
        }
      } else {
        delete sheet.dataset.toUserId;
      }
    }
    if (document.getElementById('giftSendAll')?.checked) applyGiftSendAllMode(true);
  }

  function applyGiftSendAllMode(checked) {
    const row = document.getElementById('giftRecipients');
    const meId = String(currentUser()?.id || '');
    if (!row) return;
    if (checked) {
      row.querySelectorAll('.gift-recipient').forEach((b) => {
        b.classList.toggle('is-active', String(b.dataset.userId || '') !== meId);
      });
      return;
    }
    const sheet = document.getElementById('giftSheet');
    const preferred = String(sheet?.dataset?.toUserId || '');
    row.querySelectorAll('.gift-recipient').forEach((b, i) => {
      const uid = String(b.dataset.userId || '');
      b.classList.toggle('is-active', preferred ? uid === preferred : i === 0);
    });
  }

  function bindGiftGridClicks() {
    const grid = document.getElementById('giftGrid');
    if (!grid || grid.dataset.delegateBound === '1') return;
    grid.dataset.delegateBound = '1';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-gift-idx]');
      if (!btn || !grid.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      selectedGiftIdx = parseInt(btn.dataset.giftIdx, 10) || 0;
      grid.querySelectorAll('button.gift-card').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      updateGiftMeta();
    });
  }

  function renderGiftGrid() {
    const grid = document.getElementById('giftGrid');
    if (!grid) return;
    bindGiftGridClicks();
    let items = giftsForCategory(giftCategory);
    const q = String(giftSearchQuery || '')
      .trim()
      .toLowerCase();
    if (q) {
      items = items.filter(
        (g) =>
          String(g.name || '')
            .toLowerCase()
            .includes(q) ||
          String(g.tag || '')
            .toLowerCase()
            .includes(q) ||
          String(g.cost || '').includes(q)
      );
    }
    if (!items.length) {
      grid.innerHTML = `<div class="gift-grid-empty">No gifts in this collection yet</div>`;
      updateGiftMeta();
      return;
    }
    if (selectedGiftIdx >= items.length) selectedGiftIdx = 0;
    grid.innerHTML = items
      .map((g, i) => {
        const cost = Number(g.cost) || 0;
        const selected = i === selectedGiftIdx ? 'is-selected' : '';
        const slug = escapeAttr(g.slug || giftSlugFor(g));
        const thumbClass = giftThumbnailUrl(g) ? 'gift-card--has-thumb' : '';
        return `
      <button type="button" data-gift-idx="${i}" data-gift="${g.emoji}" data-cost="${cost}" data-slug="${slug}" class="gift-card gift-card--lite ${selected} ${thumbClass}">
        ${giftCardVisualHtml(g)}
        <span class="gift-name">${escapeHtml(g.name || 'Gift')}</span>
        ${g.tag ? `<span class="gift-tag">${escapeHtml(g.tag)}</span>` : ''}
        <span class="gift-coin-cost" aria-label="${formatGiftCoinPrice(cost)}">${formatGiftCoinPrice(cost)}</span>
      </button>`;
      })
      .join('');
    updateGiftMeta();
    window.SocialFX?.bindGiftGridScrollFix?.();
  }

  function isSheetReallyOpen(el) {
    if (!el?.classList?.contains('open')) return false;
    try {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (
        cs.visibility === 'hidden' ||
        cs.display === 'none' ||
        cs.opacity === '0' ||
        el.style.visibility === 'hidden' ||
        rect.height < 8
      ) {
        el.classList.remove('open', 'is-open', 'show');
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
        el.style.removeProperty('visibility');
        return false;
      }
    } catch (_e) { /* ignore */ }
    return true;
  }

  function openToolsSheetReliable(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof e?.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const now = Date.now();
    if (now < (Number(window.__apToolsOpenBusyUntil) || 0)) return;
    window.__apToolsOpenBusyUntil = now + 700;
    const sheet = document.getElementById('partyToolsSheet');
    if (isSheetReallyOpen(sheet)) return;
    /* Soft unlock only — forceGift used to close tools in the same tick we open them */
    hideMicRequestActionBar();
    document.body.classList.remove('party-requests-open', 'ap-sheet-open');
    const req = document.getElementById('partyRequestsSheet');
    if (req) {
      req.classList.remove('open');
      req.style.display = 'none';
      req.style.pointerEvents = 'none';
    }
    const gift = document.getElementById('giftSheet');
    if (gift) {
      gift.classList.remove('open');
      gift.style.display = 'none';
      gift.style.pointerEvents = 'none';
    }
    closeLiveOverlays('tools');
    window.__apToolsOpenGuardUntil = Date.now() + 1200;
    const openNow = () => {
      if (!sheet) return;
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      sheet.style.display = 'flex';
      sheet.style.pointerEvents = 'auto';
      sheet.style.visibility = 'visible';
      sheet.style.opacity = '1';
      sheet.style.zIndex = '15000';
      if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
      syncLiveOverlayClass();
      clearMessageBadge();
      /* Host tools is DOM-only — never rejoin Agora */
    };
    /* Defer so the opening tap cannot hit the backdrop and close instantly */
    requestAnimationFrame(() => requestAnimationFrame(openNow));
  }

  function closeToolsSheetOnly() {
    const sheet = document.getElementById('partyToolsSheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.style.pointerEvents = 'none';
    sheet.style.display = 'none';
    syncLiveOverlayClass();
  }

  async function openHostLiveDataSheet() {
    let sheet = document.getElementById('apHostDataSheet');
    if (!sheet) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-host-data-sheet" id="apHostDataSheet" aria-hidden="true">
          <div class="ap-host-data-panel" role="dialog" aria-label="Live data">
            <h3>Live Data</h3>
            <div class="ap-host-data-grid" id="apHostDataGrid">
              <div class="cell"><span>Viewers now</span><strong id="apHdViewers">—</strong></div>
              <div class="cell"><span>Likes</span><strong id="apHdLikes">—</strong></div>
              <div class="cell"><span>Live hours (today)</span><strong id="apHdLiveH">—</strong></div>
              <div class="cell"><span>Gift points (today)</span><strong id="apHdPts">—</strong></div>
              <div class="cell"><span>New followers</span><strong id="apHdFollowers">—</strong></div>
              <div class="cell"><span>Peak audiences (last)</span><strong id="apHdPeak">—</strong></div>
            </div>
            <p id="apHdNote" style="font-size:12px;opacity:.65;margin:12px 0 0"></p>
            <button type="button" class="ap-host-data-close" id="apHostDataClose">Close</button>
          </div>
        </div>`
      );
      sheet = document.getElementById('apHostDataSheet');
      document.getElementById('apHostDataClose')?.addEventListener('click', () => {
        sheet?.classList.remove('open');
        sheet?.setAttribute('aria-hidden', 'true');
      });
      sheet?.addEventListener('click', (ev) => {
        if (ev.target === sheet) {
          sheet.classList.remove('open');
          sheet.setAttribute('aria-hidden', 'true');
        }
      });
    }
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set(
      'apHdViewers',
      String(
        roomState?.viewerCount ??
          document.getElementById('liveViewerCount')?.textContent ??
          '0'
      )
    );
    set('apHdLikes', String(roomState?.likeCount ?? roomState?.likes ?? '—'));
    set('apHdNote', 'Loading host analytics…');
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken().catch(() => {});
      const res = await API.get('/live/streamer-stats?period=today');
      const data = res?.data || {};
      set(
        'apHdLiveH',
        data.liveHoursLabel ||
          (typeof formatHoursShort === 'function'
            ? formatHoursShort(data.liveSeconds)
            : String(data.liveSeconds || '0'))
      );
      set(
        'apHdPts',
        typeof formatPts === 'function'
          ? formatPts(data.giftCoins)
          : String(data.giftCoins ?? 0)
      );
      set('apHdFollowers', String(data.newFollowers ?? 0));
      set('apHdPeak', String(data.lastSession?.peakViewers ?? '—'));
      set('apHdNote', 'Today’s streamer stats. Room stays live — this is display only.');
    } catch (err) {
      set('apHdNote', 'Could not load host analytics. Check connection and try again.');
    }
  }

  function openHostLiveManagement() {
    closeToolsSheetOnly();
    openJoinedSheetReliable();
    toast('Manage viewers, admins, and seat requests here', 'info');
  }

  function bindHostToolsPanel() {
    if (window.__apHostToolsBound) return;
    window.__apHostToolsBound = true;
    const noiseBadge = document.getElementById('hostNoiseBadge');
    if (noiseBadge) {
      noiseBadge.textContent = noiseReductionUiOn ? 'On' : 'Off';
      noiseBadge.classList.toggle('ap-tool-badge--on', noiseReductionUiOn);
      noiseBadge.classList.toggle('ap-tool-badge--off', !noiseReductionUiOn);
    }

    const closeThen = (fn) => () => {
      closeToolsSheetOnly();
      try {
        fn();
      } catch (err) {
        console.warn('[host-tools]', err);
        toast(err?.message || 'Action failed', 'error');
      }
    };

    document.getElementById('hostToolAdmins')?.addEventListener(
      'click',
      closeThen(() => {
        openJoinedSheetReliable();
        toast('Tap a viewer profile → Make admin', 'info');
      })
    );
    document.getElementById('hostToolTextBubble')?.addEventListener(
      'click',
      closeThen(() => {
        focusChatCompose();
        toast('Text bubbles send with chat messages', 'info');
      })
    );
    document.getElementById('hostToolFanClub')?.addEventListener(
      'click',
      closeThen(() => {
        toast('Fan Club is not available yet for this room', 'info');
      })
    );
    document.getElementById('hostToolLiveData')?.addEventListener(
      'click',
      closeThen(() => {
        openHostLiveDataSheet();
      })
    );
    document.getElementById('hostToolLiveMgmt')?.addEventListener('click', () => openHostLiveManagement());
    document.getElementById('hostToolAmbient')?.addEventListener(
      'click',
      closeThen(() => {
        openPartyMusicSheet();
      })
    );
    document.getElementById('hostToolScreenRec')?.addEventListener(
      'click',
      closeThen(() => {
        /* Product policy + WebView: getDisplayMedia is unreliable/unavailable; live is capture-protected */
        const canDisplay =
          typeof navigator !== 'undefined' &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.getDisplayMedia === 'function';
        toast(
          canDisplay
            ? 'Screen recording is blocked during live for privacy. Captures stay off.'
            : 'Screen recording is not available in this app WebView.',
          'info'
        );
      })
    );
    document.getElementById('hostToolIntro')?.addEventListener(
      'click',
      closeThen(() => {
        openEditLivePresentation();
      })
    );
    document.getElementById('hostToolMyTheme')?.addEventListener(
      'click',
      closeThen(() => {
        openRoomBackgroundPicker();
      })
    );
    document.getElementById('hostToolRoomSettings')?.addEventListener(
      'click',
      closeThen(() => {
        openPartyRoomSettings();
      })
    );
    document.getElementById('partyToolsShareBtn')?.addEventListener(
      'click',
      closeThen(() => {
        document.getElementById('partyBtnShare')?.click();
      })
    );
    document.getElementById('partyToolsSoundBtn')?.addEventListener(
      'click',
      closeThen(() => {
        document.getElementById('partyBtnSound')?.click();
      })
    );
    document.getElementById('partyBtnToolsMessage')?.addEventListener(
      'click',
      closeThen(() => {
        focusChatCompose();
        toast('Type your message below', 'info');
      })
    );
    document.getElementById('hostToolMirror')?.addEventListener(
      'click',
      closeThen(() => {
        toggleHostMirrorPreview();
      })
    );
    document.getElementById('hostToolNoise')?.addEventListener(
      'click',
      closeThen(() => {
        noiseReductionUiOn = !noiseReductionUiOn;
        const badge = document.getElementById('hostNoiseBadge');
        if (badge) {
          badge.textContent = noiseReductionUiOn ? 'On' : 'Off';
          badge.classList.toggle('ap-tool-badge--on', noiseReductionUiOn);
          badge.classList.toggle('ap-tool-badge--off', !noiseReductionUiOn);
        }
        toast(
          noiseReductionUiOn
            ? 'Noise reduction (3A) on — recapturing mic. On Samsung this can make voice quieter or delayed.'
            : 'Noise reduction off — recapturing mic for clearer host voice.',
          'info'
        );
        republishLocalMicForNoisePolicy().catch(() => {});
      })
    );
    document.getElementById('partyBtnGiftCenter')?.addEventListener(
      'click',
      closeThen(() => {
        openGiftSheet();
      })
    );
    document.getElementById('partyBtnBackpack')?.addEventListener(
      'click',
      closeThen(() => {
        toast('Backpack is not available yet', 'info');
      })
    );
    document.getElementById('partyBtnLuckyBox')?.addEventListener(
      'click',
      closeThen(() => {
        openGiftSheet();
        const luckyTab = document.querySelector(
          '#giftSheet [data-cat="lucky"], #giftSheet [data-category="lucky"], .gift-cat[data-key="lucky"]'
        );
        if (luckyTab) luckyTab.click();
        else toast('Open the Lucky gift tab to send lucky gifts', 'info');
      })
    );
    document.getElementById('partyBtnCoinsTrading')?.addEventListener(
      'click',
      closeThen(() => {
        openTopupSheet();
        toast('Coin trading is not available — use Rewards to recharge', 'info');
      })
    );
  }

  function openGiftSheetReliable(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof e?.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const now = Date.now();
    if (now < (Number(window.__apGiftOpenBusyUntil) || 0)) return;
    window.__apGiftOpenBusyUntil = now + 500;
    unlockLiveChrome({ forceGift: true });
    hideMicRequestActionBar();
    document.body.classList.remove('party-requests-open', 'ap-sheet-open');
    document.getElementById('partyRequestsSheet')?.classList.remove('open');
    const sheet = document.getElementById('giftSheet');
    if (isSheetReallyOpen(sheet)) return;
    if (sheet) {
      sheet.classList.remove('open');
      sheet.style.display = 'none';
      sheet.style.pointerEvents = 'none';
    }
    window.__apGiftOpenGuardUntil = Date.now() + 900;
    openGiftSheet();
  }

  /**
   * Floating hit pad + coordinate hit-test so gift stays tappable even when
   * chat/FX/ghost sheets sit above the real button (busy rooms).
   */
  function installGiftHitPad() {
    if (window.__apGiftHitPadInstalled) return;
    window.__apGiftHitPadInstalled = true;
    let lastOpenAt = 0;

    function giftBtn() {
      return document.getElementById('liveBtnGift') || document.getElementById('partyBtnGift');
    }

    function ensurePad() {
      let pad = document.getElementById('apGiftHitPad');
      if (!pad) {
        pad = document.createElement('button');
        pad.type = 'button';
        pad.id = 'apGiftHitPad';
        pad.setAttribute('aria-label', 'Open gifts');
        pad.style.cssText =
          'position:fixed;z-index:14950;border:0;padding:0;margin:0;background:transparent;' +
          'pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        document.body.appendChild(pad);
        const fire = (ev) => {
          if (Date.now() - lastOpenAt < 450) return;
          lastOpenAt = Date.now();
          openGiftSheetReliable(ev);
        };
        pad.addEventListener('pointerup', fire, true);
        pad.addEventListener('click', fire, true);
      }
      return pad;
    }

    function syncPad() {
      const btn = giftBtn();
      const pad = ensurePad();
      if (isPartyRoomPage() || !btn || !document.body?.dataset?.livePage) {
        pad.style.display = 'none';
        return;
      }
      /* Hide pad while a real gift sheet is open so panel taps work */
      if (isSheetReallyOpen(document.getElementById('giftSheet'))) {
        pad.style.display = 'none';
        return;
      }
      if (isSheetReallyOpen(document.getElementById('partyToolsSheet'))) {
        pad.style.display = 'none';
        return;
      }
      if (isSheetReallyOpen(document.getElementById('partyRequestsSheet'))) {
        pad.style.display = 'none';
        return;
      }
      const r = btn.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) {
        pad.style.display = 'none';
        return;
      }
      const padSize = Math.max(r.width, r.height, 48) + 12;
      pad.style.display = 'block';
      pad.style.width = `${padSize}px`;
      pad.style.height = `${padSize}px`;
      pad.style.left = `${r.left + r.width / 2 - padSize / 2}px`;
      pad.style.top = `${r.top + r.height / 2 - padSize / 2}px`;
      pad.style.borderRadius = '50%';
    }

    function pointHitsGift(x, y) {
      const btn = giftBtn();
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const pad = 10;
      return (
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad
      );
    }

    document.addEventListener(
      'pointerup',
      (e) => {
        if (e.button != null && e.button !== 0) return;
        if (!document.body?.dataset?.livePage) return;
        if (isSheetReallyOpen(document.getElementById('giftSheet'))) return;
        const x = e.clientX;
        const y = e.clientY;
        if (x == null || y == null) return;
        const t = e.target;
        if (
          t?.closest?.(
            '#liveBtnGift, #partyBtnGift, .ap-btn-gift-hero, #apGiftHitPad, .party-btn-gift'
          ) ||
          pointHitsGift(x, y)
        ) {
          if (Date.now() - lastOpenAt < 450) return;
          lastOpenAt = Date.now();
          openGiftSheetReliable(e);
        }
      },
      true
    );

    syncPad();
    window.addEventListener('resize', syncPad);
    window.addEventListener('scroll', syncPad, true);
    window.addEventListener('orientationchange', syncPad);
    /* Keep chrome unlocked so pad stays useful */
    setInterval(() => {
      if (!document.body?.dataset?.livePage) return;
      if (isSheetReallyOpen(document.getElementById('giftSheet'))) return;
      const btn = giftBtn();
      if (btn) {
        btn.style.pointerEvents = 'auto';
        btn.style.zIndex = '14250';
      }
      syncPad();
    }, 4000);
  }

  function installJoinedHitPad() {
    if (window.__apJoinedHitPadInstalled) return;
    window.__apJoinedHitPadInstalled = true;
    let lastOpenAt = 0;

    function joinedBtn() {
      return document.getElementById('liveViewerCount');
    }

    function ensurePad() {
      let pad = document.getElementById('apJoinedHitPad');
      if (!pad) {
        pad = document.createElement('button');
        pad.type = 'button';
        pad.id = 'apJoinedHitPad';
        pad.setAttribute('aria-label', 'People joined');
        pad.style.cssText =
          'position:fixed;z-index:14950;border:0;padding:0;margin:0;background:transparent;' +
          'pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        document.body.appendChild(pad);
        const fire = (ev) => {
          if (Date.now() - lastOpenAt < 450) return;
          lastOpenAt = Date.now();
          openJoinedSheetReliable(ev);
        };
        pad.addEventListener('pointerup', fire, true);
        pad.addEventListener('click', fire, true);
      }
      return pad;
    }

    function syncPad() {
      const btn = joinedBtn();
      const pad = ensurePad();
      if (isPartyRoomPage() || !btn || !document.body?.dataset?.livePage) {
        pad.style.display = 'none';
        return;
      }
      if (isSheetReallyOpen(document.getElementById('partyRequestsSheet'))) {
        pad.style.display = 'none';
        return;
      }
      if (isSheetReallyOpen(document.getElementById('giftSheet'))) {
        pad.style.display = 'none';
        return;
      }
      if (isSheetReallyOpen(document.getElementById('partyToolsSheet'))) {
        pad.style.display = 'none';
        return;
      }
      const r = btn.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) {
        pad.style.display = 'none';
        return;
      }
      /* Cover the joined count pill generously — hosts need this for seat control */
      const w = Math.max(r.width + 20, 72);
      const h = Math.max(r.height + 16, 40);
      pad.style.display = 'block';
      pad.style.width = `${w}px`;
      pad.style.height = `${h}px`;
      pad.style.left = `${r.left + r.width / 2 - w / 2}px`;
      pad.style.top = `${r.top + r.height / 2 - h / 2}px`;
      pad.style.borderRadius = '999px';
    }

    function pointHitsJoined(x, y) {
      const btn = joinedBtn();
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const pad = 14;
      return (
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad
      );
    }

    document.addEventListener(
      'pointerup',
      (e) => {
        if (e.button != null && e.button !== 0) return;
        if (!document.body?.dataset?.livePage) return;
        if (isSheetReallyOpen(document.getElementById('partyRequestsSheet'))) return;
        const x = e.clientX;
        const y = e.clientY;
        if (x == null || y == null) return;
        const t = e.target;
        if (
          t?.closest?.(
            '#liveViewerCount, .live-joined-count, .party-viewer-count, #apJoinedHitPad, #partyBtnUsersAll'
          ) ||
          pointHitsJoined(x, y)
        ) {
          /* Don't steal taps meant for top gifter profile chips */
          if (t?.closest?.('.ap-top-gifter[data-audience-id]')) return;
          if (Date.now() - lastOpenAt < 450) return;
          lastOpenAt = Date.now();
          openJoinedSheetReliable(e);
        }
      },
      true
    );

    syncPad();
    window.addEventListener('resize', syncPad);
    window.addEventListener('scroll', syncPad, true);
    window.addEventListener('orientationchange', syncPad);
    setInterval(() => {
      if (!document.body?.dataset?.livePage) return;
      if (isSheetReallyOpen(document.getElementById('partyRequestsSheet'))) return;
      const btn = joinedBtn();
      if (btn) {
        btn.style.pointerEvents = 'auto';
        btn.style.zIndex = '14900';
      }
      const row = document.getElementById('partyViewerAvatars');
      if (row) {
        row.style.pointerEvents = 'auto';
        row.style.zIndex = '14900';
      }
      syncPad();
    }, 4000);
  }

  function openGiftSheet(targetName, targetUserId) {
    unlockLiveChrome({ forceGift: true });
    hideMicRequestActionBar();
    injectGiftSheet();
    bindGiftSheet();
    window.SocialFX?.bindGiftGridScrollFix?.();
    pinFixedOverlaysToBody();
    window.__apGiftSending = false;
    window.__apGiftSendingAt = 0;
    if (window.__apGiftSendWatchdog) {
      clearTimeout(window.__apGiftSendWatchdog);
      window.__apGiftSendWatchdog = null;
    }
    const sheet = document.getElementById('giftSheet');
    if (!sheet) {
      toast('Gift panel failed to load — refresh the room', 'error');
      return;
    }
    const sendBtnReset = document.getElementById('giftSendBtn');
    if (sendBtnReset) {
      sendBtnReset.disabled = false;
      sendBtnReset.removeAttribute('aria-busy');
      sendBtnReset.classList.remove('is-sending');
      sendBtnReset.textContent = 'Send';
    }
    closeLiveOverlays('gift');
    document.getElementById('apSurpriseShop')?.classList.remove('open');
    document.getElementById('apFilterSheet')?.classList.remove('open');
    document.getElementById('apInRoomWebPanel')?.classList.remove('open');
    document.getElementById('apInAppShareSheet')?.classList.remove('open');
    document.getElementById('apEmojiPopover')?.classList.remove('is-open');
    hideMicLinkModal();
    document.getElementById('apHostMicInviteModal')?.classList.remove('open');
    document.body.classList.remove('party-requests-open');
    document.getElementById('partyRequestsSheet')?.classList.remove('open');
    hideTapForSoundHint();
    setGiftSendError('');
    const meId = String(currentUser()?.id || '');
    const recipients = getGiftRecipients();
    let toId =
      targetUserId && isValidGiftUserId(targetUserId) && String(targetUserId) !== meId
        ? String(targetUserId)
        : '';
    let to = targetName || '';
    if (toId) {
      const hit = recipients.find((r) => String(r.id) === toId);
      if (hit) to = hit.name;
      else toId = '';
    }
    if (!toId) {
      const hostId = String(roomState?.hostId || activeFeedHostId || '');
      const preferred =
        (hostId && hostId !== meId ? recipients.find((r) => String(r.id) === hostId) : null) ||
        recipients[0];
      to = preferred?.name || to || roomState?.hostName || 'Host';
      toId = preferred?.id && preferred.id !== meId ? String(preferred.id) : '';
    }
    sheet.dataset.to = to;
    if (toId && toId !== meId && isValidGiftUserId(toId)) sheet.dataset.toUserId = toId;
    else delete sheet.dataset.toUserId;
    const hostIdForPrefer = String(roomState?.hostId || activeFeedHostId || '');
    sheet.dataset.preferHost =
      hostIdForPrefer && toId && toId === hostIdForPrefer ? '1' : toId ? '0' : '1';
    renderGiftRecipients(sheet.dataset.toUserId || toId, to);
    renderGiftGrid();
    refreshCoinDisplay().then(() => updateGiftMeta()).catch(() => updateGiftMeta());
    updateGiftMeta();
    sheet.style.zIndex = '32000';
    sheet.style.removeProperty('pointer-events');
    sheet.style.removeProperty('display');
    sheet.style.removeProperty('visibility');
    sheet.style.removeProperty('background');
    sheet.style.removeProperty('opacity');
    sheet.style.visibility = 'visible';
    sheet.style.pointerEvents = 'auto';
    sheet.classList.add('open', 'gift-sheet--lux', 'gift-sheet--send-safe');
    if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
    syncLiveOverlayClass();
    /* Block accidental backdrop-close / Send from the same finger tap that opened the sheet */
    window.__apGiftOpenGuardUntil = Date.now() + 750;
    if (!recipients.length && isHost()) {
      toast('Invite or accept a guest on stage, then pick them above Send', 'info');
    }
  }

  function setGiftSendError(msg) {
    const el = document.getElementById('giftSendError');
    if (!el) return;
    if (!msg) {
      el.textContent = '';
      el.classList.remove('is-visible');
      return;
    }
    el.textContent = String(msg);
    el.classList.add('is-visible');
  }

  async function sendGiftViaApi(receiverId, cost, emoji, toName, giftSlug, giftName) {
    if (!window.SocialWallet) throw new Error('Wallet unavailable');
    const giftEvt = {
      from: displayName(currentUser()),
      fromUserId: currentUser()?.id || null,
      to: toName,
      toUserId: receiverId || null,
      emoji,
      giftSlug: giftSlug || '',
      giftName: giftName || '',
      amount: cost,
      qty: giftQty,
    };
    presentGiftLocally(giftEvt);
    await SocialWallet.sendGift({
      receiver_id: receiverId,
      coin_amount: cost,
      gift_type: giftSlug || emoji || 'gift',
      live_room_id: roomState?.roomId || undefined,
      qty: giftQty,
    });
    pushRoomGift(giftEvt);
    setGiftSendError('');
    toast('Gift sent!', 'success');
    document.getElementById('giftSheet')?.classList.remove('open');
    syncLiveOverlayClass();
    Promise.resolve()
      .then(() => refreshCoinDisplay())
      .catch(() => { });
  }

  async function sendSelectedGift() {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    if (Date.now() < (Number(window.__apGiftOpenGuardUntil) || 0)) {
      return; /* ignore ghost tap from opening the gift panel */
    }

    const stuckFor = Date.now() - (Number(window.__apGiftSendingAt) || 0);
    if (window.__apGiftSending) {
      if (stuckFor < 8000) {
        toast('Gift still sending…', 'info');
        return;
      }
      /* Unlock after hang — don't fight an in-flight seat refresh */
      recoverStuckLiveUi({ forceGift: true });
    }

    setGiftSendError('');
    const items = giftsForCategory(giftCategory);
    const g = items[selectedGiftIdx] || items[0];
    if (!g) {
      toast('Pick a gift first', 'warning');
      return;
    }
    const unitCost = parseInt(g.cost, 10) || 10;
    if (unitCost > MAX_GIFT_COINS) {
      setGiftSendError('Maximum gift is 10,000,000 coins');
      toast('Maximum gift is 10,000,000 coins', 'warning');
      return;
    }
    const cost = unitCost * giftQty;
    if (cost > MAX_GIFT_COINS) {
      setGiftSendError('Reduce quantity — max 10,000,000 coins per send');
      toast('Max 10,000,000 coins per gift send', 'warning');
      return;
    }
    const sendAll = document.getElementById('giftSendAll')?.checked;
    const recipients = getActiveGiftRecipients();
    if (!recipients.length) {
      const msg = isHost()
        ? 'Pick a guest who joined the live to receive the gift'
        : 'Host is still connecting — wait a moment, then try again';
      setGiftSendError(msg);
      toast(msg, 'warning');
      return;
    }
    const totalCost = sendAll ? cost * recipients.length : cost;
    let balance = 0;
    let balanceFresh = false;
    try {
      const cached = SocialWallet?.getCachedBalance?.() || {};
      const cachedCoins = SocialWallet?.getGiftableCoins
        ? SocialWallet.getGiftableCoins(cached)
        : Number(cached.giftable_coins ?? cached.coin_balance ?? 0);
      if (cachedCoins >= totalCost) {
        balance = cachedCoins;
        balanceFresh = true;
        if (window.SocialWallet?.ensureGiftableCoins) {
          SocialWallet.ensureGiftableCoins(totalCost).catch(() => {});
        }
      } else {
        if (window.SocialWallet?.ensureGiftableCoins) {
          await Promise.race([
            SocialWallet.ensureGiftableCoins(totalCost),
            new Promise((_, rej) => setTimeout(() => rej(new Error('exchange timeout')), 4000)),
          ]).catch(() => null);
        }
        balance = await Promise.race([
          getCoins(true).then((n) => {
            balanceFresh = true;
            return n;
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('balance timeout')), 2500)),
        ]);
      }
    } catch (_e) {
      balance = 0;
      balanceFresh = false;
    }
    if (!balanceFresh) {
      /* Soft fallback — cached wallet so a slow API can't freeze gifts forever */
      try {
        const cached = SocialWallet?.getCachedBalance?.() || {};
        const soft = SocialWallet?.getGiftableCoins
          ? SocialWallet.getGiftableCoins(cached)
          : Number(cached.giftable_coins ?? cached.coin_balance ?? 0);
        if (soft > 0) {
          balance = soft;
          balanceFresh = true;
        }
      } catch (_e2) { }
    }
    if (!balanceFresh) {
      const msg = 'Could not verify gift balance — check connection and try again';
      setGiftSendError(msg);
      toast(msg, 'warning');
      recoverStuckLiveUi({ forceGift: true });
      return;
    }
    if (balance < totalCost) {
      const cached = SocialWallet?.getCachedBalance?.() || {};
      recoverStuckLiveUi({ forceGift: true });
      if (cached.is_coin_seller) {
        const sellable = SocialWallet?.getSellableCoins?.(cached) || 0;
        const msg =
          sellable > 0
            ? 'Not enough gift coins — convert sell coins in Seller Center, then try again'
            : 'Not enough gift coins — add stock or convert in Seller Center';
        setGiftSendError(msg);
        toast(msg, 'warning');
      } else {
        const msg = 'Not enough coins — recharge first';
        setGiftSendError(msg);
        toast(msg, 'warning');
        openTopupSheet();
      }
      return;
    }
    const to = sheet.dataset.to || recipients[0]?.name || roomState?.hostName || 'Host';
    const receiverId = resolveGiftReceiverId(to) || String(recipients[0]?.id || '');
    const meId = String(currentUser()?.id || '');
    if (!sendAll && (!receiverId || receiverId === meId)) {
      const msg = isHost()
        ? 'Pick a guest on stage or in the room to receive the gift'
        : 'Wait for the streamer to connect, then try again';
      setGiftSendError(msg);
      toast(msg, 'warning');
      return;
    }

    window.__apGiftSending = true;
    window.__apGiftSendingAt = Date.now();
    const sendBtn = document.getElementById('giftSendBtn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.setAttribute('aria-busy', 'true');
      sendBtn.classList.add('is-sending');
      sendBtn.textContent = 'Sending…';
    }

    let releaseDone = false;
    const releaseGiftSend = () => {
      if (releaseDone) return;
      releaseDone = true;
      window.__apGiftSending = false;
      window.__apGiftSendingAt = 0;
      if (window.__apGiftSendWatchdog) {
        clearTimeout(window.__apGiftSendWatchdog);
        window.__apGiftSendWatchdog = null;
      }
      const btn = document.getElementById('giftSendBtn');
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.classList.remove('is-sending');
        btn.textContent = 'Send';
      }
      updateGiftMeta();
    };

    /* Hard unlock — never leave Send dead after a hung network call */
    window.__apGiftSendWatchdog = setTimeout(() => {
      if (window.__apGiftSending) {
        releaseGiftSend();
        const msg = 'Gift took too long — tap Send to try again';
        setGiftSendError(msg);
        toast(msg, 'warning');
      }
    }, 7000);

    const finishOk = async (chargedAmount, ackBalance) => {
      /* Do not pushRoomGift / chat here — live:gift owns the single history + chat line. */
      void chargedAmount;
      setGiftSendError('');
      toast('Gift sent!', 'success');
      sheet.classList.remove('open');
      sheet.style.display = 'none';
      sheet.style.pointerEvents = 'none';
      sheet.style.visibility = 'hidden';
      sheet.style.background = 'transparent';
      sheet.style.opacity = '0';
      syncLiveOverlayClass();
      Promise.resolve()
        .then(() => {
          if (ackBalance && window.SocialWallet?.applyServerBalance) {
            SocialWallet.applyServerBalance(ackBalance);
            return;
          }
          return window.SocialWallet?.fetchBalance?.();
        })
        .then(() => refreshCoinDisplay())
        .then(() => renderRoomGiftPanels())
        .catch(() => { });
    };

    const closeGiftSheetNow = () => {
      sheet.classList.remove('open');
      sheet.style.display = 'none';
      sheet.style.pointerEvents = 'none';
      sheet.style.visibility = 'hidden';
      sheet.style.background = 'transparent';
      sheet.style.opacity = '0';
      syncLiveOverlayClass();
    };

    const handleGiftFail = (rawMsg) => {
      const msg = window.SocialUI?.friendlyMessage(rawMsg) || rawMsg || 'Gift failed';
      setGiftSendError(msg);
      toast(msg, /insufficient/i.test(msg) ? 'warning' : 'error');
      if (/insufficient/i.test(msg)) {
        const cached = SocialWallet?.getCachedBalance?.() || {};
        Promise.resolve()
          .then(() => window.SocialWallet?.fetchBalance?.(true))
          .then(() => refreshCoinDisplay())
          .catch(() => { });
        if (cached.is_coin_seller) {
          /* Keep user in live — Seller Center is opt-in via balance button */
          setGiftSendError('Not enough gift coins — tap Balance to open Seller Center');
        } else {
          openTopupSheet();
        }
      }
    };

    const tryApi = async (reason) => {
      try {
        await sendGiftViaApi(receiverId, cost, g.emoji, to, g.slug, g.name);
        rememberGiftUse(g);
        renderRoomGiftPanels();
      } catch (e) {
        handleGiftFail(e.message || reason || 'Gift failed');
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
        const timer = setTimeout(() => resolve({ ok: false, message: 'Gift timed out' }), 10000);
        liveSocket.emit(
          'live:gift',
          {
            channel: channelId(),
            to: target.name,
            toUserId: String(target.id || ''),
            emoji: g.emoji,
            giftSlug: g.slug,
            giftName: g.name,
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
      closeGiftSheetNow();
      (async () => {
        let sent = 0;
        let lastCharged = cost;
        let lastAckBalance = null;
        let lastError = '';
        try {
          for (const target of targets) {
            if (!target.id) {
              lastError = 'Receiver not found';
              continue;
            }
            presentGiftLocally({
              from: displayName(currentUser()),
              fromUserId: currentUser()?.id || null,
              to: target.name,
              toUserId: String(target.id || ''),
              emoji: g.emoji,
              giftSlug: g.slug,
              giftName: g.name,
              amount: cost,
              qty: giftQty,
            });
            const res = await emitOneGift(target);
            if (!res?.ok) {
              lastError = res?.message || 'Gift failed for ' + (target.name || 'user');
              break;
            }
            sent += 1;
            lastCharged = Number(res?.data?.gift?.amount || cost);
            lastAckBalance = res?.data?.balance || lastAckBalance;
          }
          if (sent > 0) {
            releaseGiftSend();
            await finishOk(lastCharged, lastAckBalance);
            return;
          }
          /* Only fall back to REST when socket is down — not on timeout (avoids double charge) */
          if (
            !sendAll &&
            receiverId &&
            receiverId !== meId &&
            /^not connected$/i.test(String(lastError || '').trim())
          ) {
            await tryApi(lastError);
            return;
          }
          handleGiftFail(lastError || 'Gift failed');
        } catch (e) {
          handleGiftFail(e?.message || 'Gift failed');
        } finally {
          releaseGiftSend();
        }
      })();
      return;
    }

    closeGiftSheetNow();
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
      if (e.target !== sheet) return;
      /* Same finger that opened gift often lands on the full-screen backdrop */
      if (Date.now() < (Number(window.__apGiftOpenGuardUntil) || 0)) return;
      sheet.classList.remove('open');
      closeLiveOverlays();
    });
    document.getElementById('giftSendBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      recoverStuckLiveUi({ forceGift: false });
      sendSelectedGift();
    });
    document.getElementById('giftSurpriseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      sheet.classList.remove('open');
      openSurpriseShop();
    });
    document.getElementById('giftBalanceBtn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cached = SocialWallet?.getCachedBalance?.() || {};
      if (cached.is_coin_seller) {
        /* Stay in live — convert sell→gift for a typical gift amount instead of navigating away */
        const unit =
          Number(giftsForCategory(giftCategory)?.[selectedGiftIdx]?.cost) || 10;
        const need = Math.max(unit * giftQty, 100);
        try {
          toast('Converting sell coins → gift coins…', 'info');
          await SocialWallet.ensureGiftableCoins?.(need);
          await refreshCoinDisplay();
          updateGiftMeta();
          toast('Gift coins ready — tap Send', 'success');
        } catch (err) {
          toast(err?.message || 'Could not convert coins — open Seller Center from Me', 'warning');
        }
        return;
      }
      openTopupSheet();
    });
    /* Gift tiles: pointer + touch so taps always select (sellers/viewers) */
    const grid = document.getElementById('giftGrid');
    grid?.addEventListener(
      'pointerup',
      (e) => {
        const btn = e.target.closest?.('button[data-gift-idx]');
        if (!btn || !grid.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        selectedGiftIdx = parseInt(btn.dataset.giftIdx, 10) || 0;
        grid.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        updateGiftMeta();
      },
      { passive: false }
    );
    document.querySelectorAll('.gift-sheet-tabs button[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gift-sheet-tabs button[data-cat]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        giftCategory = btn.dataset.cat || 'popular';
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
    const giftSendAll = document.getElementById('giftSendAll');
    if (giftSendAll && !giftSendAll.dataset.bound) {
      giftSendAll.dataset.bound = '1';
      giftSendAll.addEventListener('change', (e) => {
        applyGiftSendAllMode(!!e.target.checked);
        updateGiftMeta();
      });
    }
    window.SocialFX?.bindGiftGridScrollFix?.();
  }

  function ensureChatTabShowsMessages() {
    if (chatTab === 'room') {
      chatTab = 'all';
      document.querySelectorAll('.party-chat-tabs button').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === 'all');
      });
    }
  }

  /** Mirrors backend chatModerationService — block sex/abuse before emit (hosts included) */
  function clientChatLooksBlocked(raw) {
    const norm = String(raw || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's')
      .replace(/!/g, 'i')
      .replace(/\|/g, 'i')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/(.)\1{2,}/g, '$1$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) return false;
    const collapsed = norm.replace(/\s+/g, '');
    const must = [
      'sex',
      'sexy',
      'sexual',
      'sext',
      'porn',
      'porno',
      'xxx',
      'nude',
      'nudes',
      'nsfw',
      'onlyfans',
      'blowjob',
      'handjob',
      'fuck',
      'fucking',
      'shit',
      'bitch',
      'asshole',
      'cunt',
      'whore',
      'slut',
      'chutiya',
      'madarchod',
      'behenchod',
      'bhenchod',
      'bhosdi',
      'randi',
      'gaandu',
      'gandu',
      'lund',
      'choot',
      'bsdk',
    ];
    for (const term of must) {
      if (collapsed.includes(term)) return true;
      if (term.length <= 3) {
        if (new RegExp(`(?:^|\\s)${term}(?:$|\\s)`, 'i').test(norm)) return true;
      } else if (norm.includes(term)) {
        return true;
      }
    }
    if (/(?:^|\s)(?:bc|mc)(?:$|\s)/i.test(norm)) return true;
    return false;
  }

  function sendChat(text) {
    const t = String(text || '').trim();
    if (!t) return;
    sendChatMedia({ text: t });
  }

  async function uploadLiveChatImage(file) {
    const token = (window.Auth?.getToken?.() || localStorage.getItem('token') || '').trim();
    if (!token) throw new Error('Sign in to send photos');
    const fd = new FormData();
    fd.append('image', file);
    const endpoint =
      typeof window.joinApiUrl === 'function'
        ? joinApiUrl('/live/chat/media')
        : '/api/live/chat/media';
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.data?.url) {
      throw new Error(data.message || 'Could not upload photo');
    }
    return data.data.url;
  }

  async function sendChatPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/heic|heif/i.test(file.name || '')) {
      toast('Only photos can be sent in live chat', 'warning');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Photo must be under 5 MB', 'warning');
      return;
    }
    if (isLocallyChatMuted()) {
      toast('You are muted from chat by the host', 'warning');
      syncChatMuteUi();
      return;
    }
    try {
      toast('Uploading photo…', 'info');
      const imageUrl = await uploadLiveChatImage(file);
      sendChatMedia({ imageUrl });
    } catch (err) {
      toast(err?.message || 'Could not send photo', 'error');
    }
  }

  function sendChatMedia({ text, imageUrl } = {}) {
    const t = String(text || '').trim();
    const img = imageUrl ? String(imageUrl).trim() : '';
    if (!t && !img) return;
    if (isLocallyChatMuted()) {
      toast('You are muted from chat by the host', 'warning');
      syncChatMuteUi();
      return;
    }
    if (t && clientChatLooksBlocked(t)) {
      toast(
        'This message was blocked. Sexual / abusive language is not allowed in live chat.',
        'warning'
      );
      return;
    }
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
      imageUrl: img || null,
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
        imageUrl: img || undefined,
        lvl: lvlInfo.level,
        scope,
        broadcast: chatRegionFilter === 'broadcast',
      },
      (res) => {
        if (res?.ok === false) {
          chatMessages = chatMessages.filter((m) => m.id !== optimistic.id);
          renderChatFeed();
          const code = String(res?.code || '');
          if (code.startsWith('ABUSE_')) {
            toast(res?.message || 'Message blocked — abusive language not allowed', 'warning');
            if (res.action === 'mute') syncChatMuteUi?.();
            return;
          }
          toast(res?.message || 'Could not send comment', 'error');
        }
      }
    );
  }

  function bindLiveChatPhotoUpload() {
    const btn = document.getElementById('liveChatPhotoBtn');
    const input = document.getElementById('liveChatPhotoInput');
    if (!btn || !input || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.click();
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void sendChatPhoto(file);
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
          if (!chatInputFocused) {
            document.body.classList.remove('ap-chat-open');
            if (isPartyRoomPage()) window.setLiveChatHidden?.(true);
          }
        }, 150);
      });
    }
    document.getElementById('partyClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveClose')?.addEventListener('click', () => endRoomOrExit());
    document.getElementById('liveMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());
    document.getElementById('partyMinimizeBtn')?.addEventListener('click', () => minimizeLiveRoom());

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
      if (isPartyRoomPage()) {
        fab.style.zIndex = '80';
        fab.style.left = '12px';
        fab.style.right = 'auto';
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
      if (isPartyRoomPage()) {
        setLiveChatHidden(localStorage.getItem('ap_live_chat_hidden') === '1');
      } else if (localStorage.getItem('ap_live_chat_hidden') === '1') setLiveChatHidden(true);
      else setLiveChatHidden(false);
    } catch (_e) {
      setLiveChatHidden(isPartyRoomPage() ? true : false);
    }

    /* Click-only show/hide — do NOT hide chat on scroll/swipe (was closing while reading). */

    const openToolsFromBar = (e) => {
      openToolsSheetReliable(e);
    };
    const toolsBtn = document.getElementById('partyBtnTools');
    if (toolsBtn && toolsBtn.dataset.toolsOpenBound !== '1') {
      toolsBtn.dataset.toolsOpenBound = '1';
      toolsBtn.style.pointerEvents = 'auto';
      toolsBtn.style.zIndex = '14250';
      /* Click only — pointerup + click caused open-then-instant-close flicker */
      toolsBtn.addEventListener('click', openToolsFromBar, true);
    }
    document.getElementById('partyToolsClose')?.addEventListener('click', () => {
      const sheet = document.getElementById('partyToolsSheet');
      if (sheet) {
        sheet.classList.remove('open');
        sheet.style.pointerEvents = 'none';
        sheet.style.display = 'none';
      }
      syncLiveOverlayClass();
      closeLiveOverlays();
    });

    /* --- Game overlay (iframe inside live) --- */
    document.querySelectorAll('.ap-tool-game[data-game]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.game;
        if (!url) return;
        openGameOverlay(url);
        const sheet = document.getElementById('partyToolsSheet');
        if (sheet) {
          sheet.classList.remove('open');
          sheet.style.pointerEvents = 'none';
          sheet.style.display = 'none';
        }
        document.getElementById('apPartyRoomSettings')?.classList.remove('open');
        if (typeof closePartyGamePicker === 'function') closePartyGamePicker();
        syncLiveOverlayClass();
      });
    });

    async function sendWalletCoinsToGameFrame(frame, forceFresh = true, coinsOverride = null) {
      if (!frame?.contentWindow) return;
      try {
        let bal = coinsOverride != null ? Number(coinsOverride) : null;
        if (!Number.isFinite(bal)) {
          /* Games use the same spendable pool as gifts:
             coin sellers → gift inventory; others → simple wallet coins */
          bal = await getCoins(forceFresh);
        }
        frame.contentWindow.postMessage({ type: 'SET_COINS', coins: bal }, '*');
      } catch (_e) { }
    }

    function postGameFrameReply(type, requestId, success, data, message) {
      const frame = document.getElementById('apGameFrame');
      try {
        frame?.contentWindow?.postMessage({ type, requestId, success, data, message }, '*');
      } catch (_e) { }
    }

    async function proxyGamePlay(d) {
      if (!d?.requestId || !d?.game) {
        postGameFrameReply('GAME_PLAY_RESULT', d?.requestId, false, null, 'Invalid play request');
        return;
      }
      if (!window.API?.post) {
        postGameFrameReply('GAME_PLAY_RESULT', d.requestId, false, null, 'Please log in to play');
        return;
      }
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const res = await API.post(`/games/${encodeURIComponent(d.game)}/play`, {
          bet_amount: d.bet_amount,
          pick: d.pick || {},
        });
        const payload = res.data || res;
        const frame = document.getElementById('apGameFrame');
        const nextBal = payload?.balance != null ? Number(payload.balance) : null;
        if (nextBal != null && Number.isFinite(nextBal)) {
          window.SocialWallet?.applyGameBalance?.(nextBal, payload.play_source);
          lastCoinBalance = nextBal;
        } else {
          window.SocialWallet?.invalidateBalance?.();
        }
        await sendWalletCoinsToGameFrame(frame, false, nextBal);
        postGameFrameReply('GAME_PLAY_RESULT', d.requestId, true, payload);
        refreshCoinDisplay().catch(() => { });
      } catch (e) {
        const message = e?.message || e?.data?.message || 'Play failed';
        if (String(message).toLowerCase().includes('insufficient')) {
          toast('Not enough coins — recharge!', 'warning');
        } else {
          toast(message, 'warning');
        }
        postGameFrameReply('GAME_PLAY_RESULT', d.requestId, false, null, message);
      }
    }

    async function proxyGameRead(d, kind) {
      if (!d?.requestId || !d?.game) {
        postGameFrameReply(kind === 'history' ? 'GAME_HISTORY_RESULT' : 'GAME_LEADERBOARD_RESULT', d?.requestId, false, null, 'Invalid request');
        return;
      }
      if (!window.API?.get) {
        postGameFrameReply(kind === 'history' ? 'GAME_HISTORY_RESULT' : 'GAME_LEADERBOARD_RESULT', d.requestId, false, null, 'Please log in to play');
        return;
      }
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const query = [];
        if (d.limit) query.push(`limit=${encodeURIComponent(d.limit)}`);
        if (d.days) query.push(`days=${encodeURIComponent(d.days)}`);
        if (d.mode) query.push(`mode=${encodeURIComponent(d.mode)}`);
        if (d.scope) query.push(`scope=${encodeURIComponent(d.scope)}`);
        const endpoint = kind === 'history'
          ? `/games/${encodeURIComponent(d.game)}/history${query.length ? `?${query.join('&')}` : ''}`
          : `/games/${encodeURIComponent(d.game)}/leaderboard${query.length ? `?${query.join('&')}` : ''}`;
        const res = await API.get(endpoint);
        postGameFrameReply(kind === 'history' ? 'GAME_HISTORY_RESULT' : 'GAME_LEADERBOARD_RESULT', d.requestId, true, res.data || res);
      } catch (e) {
        const message = e?.message || 'Request failed';
        postGameFrameReply(kind === 'history' ? 'GAME_HISTORY_RESULT' : 'GAME_LEADERBOARD_RESULT', d.requestId, false, null, message);
      }
    }

    async function proxyGameRoomState(d) {
      if (!d?.requestId || !d?.game) {
        postGameFrameReply('GAME_ROOM_STATE_RESULT', d?.requestId, false, null, 'Invalid request');
        return;
      }
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const ch = encodeURIComponent(d.channel || channelId() || '');
        const res = await API.get(`/games/${encodeURIComponent(d.game)}/room?channel=${ch}`);
        postGameFrameReply('GAME_ROOM_STATE_RESULT', d.requestId, true, res.data || res);
      } catch (e) {
        postGameFrameReply('GAME_ROOM_STATE_RESULT', d.requestId, false, null, e?.message || 'Room state failed');
      }
    }

    async function proxyGameRoomBet(d) {
      if (!d?.requestId || !d?.game) {
        postGameFrameReply('GAME_ROOM_BET_RESULT', d?.requestId, false, null, 'Invalid request');
        return;
      }
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const res = await API.post(`/games/${encodeURIComponent(d.game)}/room/bet`, {
          channel: d.channel || channelId(),
          bets: d.bets || d.pick?.bets || [],
        });
        const payload = res.data || res;
        const nextBal = payload?.balance != null ? Number(payload.balance) : null;
        const frame = document.getElementById('apGameFrame');
        if (nextBal != null && Number.isFinite(nextBal)) {
          window.SocialWallet?.applyGameBalance?.(nextBal, payload.play_source);
          lastCoinBalance = nextBal;
          await sendWalletCoinsToGameFrame(frame, false, nextBal);
        }
        postGameFrameReply('GAME_ROOM_BET_RESULT', d.requestId, true, payload);
        refreshCoinDisplay().catch(() => { });
      } catch (e) {
        const message = e?.message || e?.data?.message || 'Bet failed';
        if (String(message).toLowerCase().includes('insufficient')) {
          toast('Not enough coins — recharge!', 'warning');
        }
        postGameFrameReply('GAME_ROOM_BET_RESULT', d.requestId, false, null, message);
      }
    }

    function sendRoomToGameFrame(frame) {
      if (!frame?.contentWindow) return;
      const me = currentUser();
      try {
        frame.contentWindow.postMessage({
          type: 'SET_ROOM',
          channel: channelId(),
          display_id: me?.display_id != null ? me.display_id : me?.displayId,
        }, '*');
      } catch (_e) { }
    }

    function forwardLiveGameToFrame(payload) {
      const frame = document.getElementById('apGameFrame');
      if (!frame?.contentWindow || !payload) return;
      try {
        frame.contentWindow.postMessage({
          type: 'GAME_ROOM_EVENT',
          game: payload.game || 'greedy',
          ...payload,
        }, '*');
      } catch (_e) { }
    }

    function openGameOverlay(url) {
      closeGameOverlay();
      const bust = (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
      const gameUrl = url + bust;
      const wrap = document.createElement('div');
      wrap.id = 'apGameOverlay';
      wrap.className = 'ap-game-overlay';
      wrap.innerHTML =
        `<div class="ap-game-header">
          <span class="ap-game-title">Game</span>
          <button type="button" class="ap-game-close" id="apGameClose" aria-label="Close game"><i class="fas fa-times"></i></button>
        </div>
        <iframe id="apGameFrame" class="ap-game-frame" src="${gameUrl}" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups" loading="eager"></iframe>`;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('is-open'));

      wrap.querySelector('#apGameClose')?.addEventListener('click', closeGameOverlay);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap) closeGameOverlay();
      });

      /* Send real wallet balance to game iframe (PostgreSQL via SocialWallet) */
      const frame = document.getElementById('apGameFrame');
      if (frame) {
        frame.addEventListener('load', () => {
          sendWalletCoinsToGameFrame(frame, true);
          sendRoomToGameFrame(frame);
        });
      }

      /* Listen for game events */
      window.__apGameMsgHandler = (ev) => {
        let d = ev.data;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (_e) { return; }
        }
        if (!d || !d.type) return;
        if (d.type === 'GAME_PLAY') {
          proxyGamePlay(d);
          return;
        }
        if (d.type === 'GAME_ROOM_STATE_REQUEST') {
          proxyGameRoomState(d);
          return;
        }
        if (d.type === 'GAME_ROOM_BET') {
          proxyGameRoomBet(d);
          return;
        }
        if (d.type === 'GAME_HISTORY_REQUEST') {
          proxyGameRead(d, 'history');
          return;
        }
        if (d.type === 'GAME_LEADERBOARD_REQUEST') {
          proxyGameRead(d, 'leaderboard');
          return;
        }
        if (d.type === 'REQUEST_COINS' || d.type === 'GAME_READY') {
          const frame = document.getElementById('apGameFrame');
          if (frame) {
            sendWalletCoinsToGameFrame(frame, true);
            sendRoomToGameFrame(frame);
          }
          return;
        }
        if (d.type === 'GAME_CLOSE') {
          closeGameOverlay();
          return;
        }
        if (d.type === 'GAME_RESULT') {
          const frame = document.getElementById('apGameFrame');
          if (d.coins != null && Number.isFinite(Number(d.coins))) {
            window.SocialWallet?.applyGameBalance?.(Number(d.coins), d.play_source);
            if (frame) sendWalletCoinsToGameFrame(frame, false, Number(d.coins));
          } else if (frame) {
            sendWalletCoinsToGameFrame(frame, true);
          }
          refreshCoinDisplay().catch(() => { });
        }
        if (d.type === 'GAME_NEED_COINS') {
          toast('Not enough coins - recharge!', 'warning');
        }
        if (d.type === 'GAME_BET') {
          const frame = document.getElementById('apGameFrame');
          if (frame) sendWalletCoinsToGameFrame(frame, true);
        }
      };
      window.addEventListener('message', window.__apGameMsgHandler);
    }

    function closeGameOverlay() {
      const el = document.getElementById('apGameOverlay');
      if (el) {
        el.classList.remove('is-open');
        setTimeout(() => el.remove(), 250);
      }
      if (window.__apGameMsgHandler) {
        window.removeEventListener('message', window.__apGameMsgHandler);
        window.__apGameMsgHandler = null;
      }
      window.SocialWallet?.invalidateBalance?.();
      refreshCoinDisplay().catch(() => { });
    }
    window.openGameOverlay = openGameOverlay;
    window.closeGameOverlay = closeGameOverlay;
    document.getElementById('partyToolsSheet')?.addEventListener('click', (e) => {
      if (e.target.id !== 'partyToolsSheet') return;
      /* Ignore the same tap that opened the sheet (lands on backdrop) */
      if (Date.now() < (Number(window.__apToolsOpenGuardUntil) || 0)) return;
      e.target.classList.remove('open');
      e.target.style.pointerEvents = 'none';
      e.target.style.display = 'none';
      syncLiveOverlayClass();
      closeLiveOverlays();
    });

    const openGiftFromBar = (e) => {
      openGiftSheetReliable(e);
    };
    ['partyBtnGift', 'liveBtnGift'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.giftOpenBound === '1') return;
      btn.dataset.giftOpenBound = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.zIndex = '14250';
      btn.addEventListener('click', openGiftFromBar, true);
      btn.addEventListener('pointerup', openGiftFromBar, true);
    });
    installGiftHitPad();

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
    document.getElementById('liveEditPresentationBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditLivePresentation();
    });

    document.getElementById('liveBtnMic')?.addEventListener('click', () => handleMicButton());

    document.querySelectorAll('.ap-tool-msg').forEach((link) => {
      link.addEventListener('click', clearMessageBadge);
    });

    document.getElementById('partyBtnSound')?.addEventListener('click', async () => {
      soundOn = !soundOn;
      audioUnlocked = soundOn;
      if (soundOn) {
        requestNativeSpeakerAudio();
        await unlockBrowserAudio();
        unmuteDomMediaElements();
        const eng = liveMedia();
        if (eng && agoraClient) {
          for (const user of agoraClient.remoteUsers || []) {
            if (user.audioTrack) {
              await eng.playRemoteAudio(user, { force: true }).catch(() => { });
            }
          }
          eng.boostAll(agoraClient);
        }
        await ensureRemoteAudioPlaying();
        hideTapForSoundHint();
      } else {
        remoteUsers.forEach((user) => {
          try {
            user.audioTrack?.stop();
          } catch (_e) { }
          removeRemoteAudioSink(user.uid);
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

    const openShareFromBar = (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (typeof e?.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const now = Date.now();
      if (now < (Number(window.__apShareOpenBusyUntil) || 0)) return;
      window.__apShareOpenBusyUntil = now + 500;
      openInAppShareSheet();
    };
    const shareBtn = document.getElementById('partyBtnShare');
    if (shareBtn && shareBtn.dataset.shareOpenBound !== '1') {
      shareBtn.dataset.shareOpenBound = '1';
      shareBtn.addEventListener('click', openShareFromBar, true);
    }
    document.getElementById('partyBtnJoinSeat')?.addEventListener('click', () => requestSeatJoin());
    const bindChromeTap = (id, action) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.chromeTapBound === '1') return;
      el.dataset.chromeTapBound = '1';
      el.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          unlockLiveChrome({ forceGift: true });
          action();
        },
        true
      );
    };
    bindChromeTap('partyInvitePill', () => openInAppShareSheet());
    bindChromeTap('partyBtnUsersAll', () => openJoinedSheetReliable());
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
    document.querySelector('.party-chat-zone')?.addEventListener('click', (e) => {
      if (e.target.closest('.party-chat-mod-btn, .ap-chat-mod-menu, .party-chat-avatar-btn, .party-chat-user-btn')) {
        return;
      }
      document.getElementById('liveChatInput')?.focus();
    });
    document.querySelector('.party-chat-feed')?.addEventListener('click', (e) => {
      if (e.target.closest('.party-chat-mod-btn, .ap-chat-mod-menu, .party-chat-avatar-btn, .party-chat-user-btn')) {
        return;
      }
      document.getElementById('liveChatInput')?.focus();
    });

    bindChatTabs();
    bindGiftSheet();
    window.SocialFX?.bindGiftGridScrollFix?.();
    bindLiveChatPhotoUpload();
    bindImmersiveToolLinks();
    bindEmojiPicker();
    bindHostToolsPanel();
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
    const staleProfileSheet = document.getElementById('apProfileSheet');
    if (staleProfileSheet && !staleProfileSheet.querySelector('.ap-profile-hero-row')) {
      staleProfileSheet.remove();
    }
    if (!document.getElementById('apProfileSheet')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay align-bottom" id="apProfileSheet">
          <div class="ap-profile-sheet-panel">
            <div class="ap-profile-hero-row">
              <div class="ap-profile-avatar-wrap" id="apProfileAvatarWrap">
                <img id="apProfileAvatar" src="" alt="">
                <span class="ap-admin-avatar-tag" id="apProfileAdminTag" hidden>ADMIN</span>
              </div>
              <div class="ap-profile-head-info">
                <h3 id="apProfileName">User</h3>
                <div class="ap-profile-badges">
                  <div class="ap-profile-status-badges profile-status-badges" id="apProfileStatusBadges" aria-label="Level and VIP badges"></div>
                  <div class="ap-profile-role-badges" id="apProfileRoleBadges" aria-label="Role badges"></div>
                  <span id="apProfileRoleBadge" hidden></span>
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
      const meId = String(currentUser()?.id || '');
      if (uid && String(uid) === meId && !isHost() && (memberIsOnStage(uid) || hasSpeakerSeat)) {
        openModerationMenu(name, uid);
        return;
      }
      /* Platform admins: More on host opens Kick host & end live */
      if (
        canModerateRoom() &&
        uid &&
        String(uid) !== meId &&
        (!isRoomHostUserId(uid) || isPlatformAdminSelf())
      ) {
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
      const blocked = Boolean(uid && window.SocialInteractions?.isBlocked?.(uid));
      menu.innerHTML = `
        <button type="button" data-act="report">Report user</button>
        ${uid && String(uid) !== String(currentUser()?.id || '') ? `<button type="button" data-act="block">${blocked ? 'Unblock user' : 'Block user'}</button>` : ''}
        <button type="button" data-act="copy">Copy nickname</button>
        ${uid ? '<button type="button" data-act="chat">Open chat</button>' : ''}`;
      panel.appendChild(menu);
      menu.querySelector('[data-act="report"]')?.addEventListener('click', () => {
        toast('Report submitted — our team will review', 'success');
        menu.remove();
      });
      menu.querySelector('[data-act="block"]')?.addEventListener('click', async () => {
        await blockProfileUser(uid, name);
        menu.remove();
        document.getElementById('apProfileSheet')?.classList.remove('open');
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
    if (screenCaptureEnabled === shouldBlock) {
      if (shouldBlock) postNativeMessage({ type: 'screen_capture', block: true, enable: true });
      return;
    }
    screenCaptureEnabled = shouldBlock;
    postNativeMessage({
      type: 'screen_capture',
      block: shouldBlock,
      enable: shouldBlock,
    });
  }

  function releaseScreenCaptureProtection() {
    screenCaptureEnabled = false;
    /* Native shell ignores unlock while still on live URL — safe to request */
    postNativeMessage({ type: 'screen_capture', block: false, enable: false });
  }

  function bindScreenCaptureProtection() {
    setScreenCaptureProtection(true);
  }

  function flashLiveCaptureShield() {
    let el = document.getElementById('apCaptureShield');
    if (!el) {
      el = document.createElement('div');
      el.id = 'apCaptureShield';
      el.className = 'ap-capture-shield';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    el.classList.add('is-on');
    clearTimeout(flashLiveCaptureShield._t);
    flashLiveCaptureShield._t = setTimeout(() => {
      el.classList.remove('is-on');
    }, 1200);
    try {
      toast('Screenshots & screen recording are blocked on live', 'warning');
    } catch (_e) { }
  }

  function onScreenshotAttempt() {
    setScreenCaptureProtection(true);
    flashLiveCaptureShield();
  }

  function bindScreenCaptureLifecycle() {
    if (bindScreenCaptureLifecycle.bound) return;
    bindScreenCaptureLifecycle.bound = true;
    setScreenCaptureProtection(true);
    document.documentElement.classList.add('ap-secure-live');
    document.body?.classList?.add?.('ap-secure-live');
    if (!window.__apScreenCapturePulse) {
      /* Once on enter + visibility/focus handlers below — avoid 800ms native spam */
      postNativeMessage({ type: 'screen_capture', block: true, enable: true });
    }
    window.addEventListener('pagehide', () => {
      if (window.__apLeavingRoom) releaseScreenCaptureProtection();
    });
    window.addEventListener('beforeunload', () => {
      if (window.__apLeavingRoom) releaseScreenCaptureProtection();
    });
    document.addEventListener('visibilitychange', () => {
      if (isLiveRoomPage() || isPartyRoomPage()) {
        screenCaptureEnabled = null;
        setScreenCaptureProtection(true);
      }
    });
    window.addEventListener('focus', () => {
      if (isLiveRoomPage() || isPartyRoomPage()) {
        screenCaptureEnabled = null;
        setScreenCaptureProtection(true);
      }
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

  function ensureProfileSheetBadgeLayout() {
    const wrap = document.querySelector('#apProfileSheet .ap-profile-badges');
    if (!wrap) return;
    if (document.getElementById('apProfileStatusBadges')) return;
    wrap.innerHTML =
      '<div class="ap-profile-status-badges profile-status-badges" id="apProfileStatusBadges" aria-label="Level and VIP badges"></div>' +
      '<div class="ap-profile-role-badges" id="apProfileRoleBadges" aria-label="Role badges"></div>';
  }

  function liveProfileIsPlatformAdmin(userId, meta, data) {
    const uid = String(userId || '');
    if (!uid) return false;
    if (isPlatformAdminUserId(uid)) return true;
    return window.isPlatformAdminUser?.({
      role: data?.role || meta?.userRole,
      isPlatformAdmin: meta?.isPlatformAdmin,
      is_admin: meta?.isPlatformAdmin,
    });
  }

  function buildLiveProfileRoleBadgesHtml(userId, meta, data) {
    const parts = [];
    const platformAdmin = liveProfileIsPlatformAdmin(userId, meta, data);
    const roomAdminOnly = Boolean(meta?.isRoomAdmin) && !platformAdmin;

    if (roomAdminOnly) {
      parts.push(
        `<span class="ap-role-badge ap-role-badge--mod" title="${roomAdminLabel()}">${roomAdminLabel().toUpperCase()}</span>`
      );
    }
    if (platformAdmin) {
      parts.push(
        window.formatRoleBadgeHtml?.('admin', { withEmoji: true }) ||
          '<span class="ap-role-badge ap-role-badge--admin">ADMIN</span>'
      );
    }

    const user = {
      id: userId,
      userId: userId,
      role: data?.role || meta?.userRole,
      is_coin_seller: Boolean(data?.is_coin_seller || data?.role === 'coin_seller' || meta?.is_coin_seller),
    };
    const roleChips =
      window.formatProfileRoleBadgesHtml?.(user, {
        withEmoji: true,
        skipAdmin: platformAdmin || roomAdminOnly,
      }) || '';
    if (roleChips) parts.push(roleChips);
    return parts.join(' ');
  }

  function clearLiveProfileSheetBadges() {
    const statusEl = document.getElementById('apProfileStatusBadges');
    const roleEl = document.getElementById('apProfileRoleBadges');
    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.hidden = true;
      delete statusEl.dataset.badgeHtml;
    }
    if (roleEl) {
      roleEl.innerHTML = '';
      roleEl.hidden = true;
      delete roleEl.dataset.badgeHtml;
    }
  }

  function paintLiveProfileSheetBadges(userId, meta, badgeSrc) {
    ensureProfileSheetBadgeLayout();
    const statusEl = document.getElementById('apProfileStatusBadges');
    const roleEl = document.getElementById('apProfileRoleBadges');
    const merged = {
      personalLevel: badgeSrc?.personalLevel ?? badgeSrc?.badges?.personalLevel,
      svipLevel: badgeSrc?.svipLevel ?? badgeSrc?.badges?.svipLevel,
      svipLabel: badgeSrc?.svipLabel ?? badgeSrc?.badges?.svipLabel,
      isSvip: badgeSrc?.isSvip ?? badgeSrc?.badges?.isSvip,
      vipLevel: badgeSrc?.vipLevel ?? badgeSrc?.badges?.vipLevel,
      vipLabel: badgeSrc?.vipLabel ?? badgeSrc?.badges?.vipLabel,
      role: badgeSrc?.role ?? meta?.userRole,
      is_coin_seller: badgeSrc?.is_coin_seller ?? badgeSrc?.badges?.is_coin_seller,
    };
    const statusHtml =
      window.ProfileBadges?.formatProfileStatusBadgesHtml?.(merged, { link: false }) || '';
    const roleHtml = buildLiveProfileRoleBadgesHtml(userId, meta, merged);
    if (statusEl) {
      if (window.ProfileBadges?.applyBadgeHtml) {
        window.ProfileBadges.applyBadgeHtml(statusEl, statusHtml);
      } else {
        if (statusEl.dataset.badgeHtml !== statusHtml) {
          statusEl.dataset.badgeHtml = statusHtml;
          statusEl.innerHTML = statusHtml;
          statusEl.hidden = !statusHtml;
          if (statusHtml) statusEl.style.display = 'flex';
        }
      }
    }
    if (roleEl) {
      const trimmed = roleHtml.trim();
      if (roleEl.dataset.badgeHtml !== roleHtml) {
        roleEl.dataset.badgeHtml = roleHtml;
        roleEl.innerHTML = roleHtml;
        roleEl.hidden = !trimmed;
        if (trimmed) roleEl.style.display = 'flex';
      }
    }
  }

  function applyProfileLevelFromData(data) {
    paintLiveProfileSheetBadges(activeProfileUser?.userId, activeProfileUser, data);
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
      if (activeProfileUser) {
        if (data.role) activeProfileUser.userRole = data.role;
        activeProfileUser.is_coin_seller = Boolean(data.is_coin_seller || data.role === 'coin_seller');
      }
      const roleBadgeEl = document.getElementById('apProfileRoleBadge');
      if (roleBadgeEl) {
        roleBadgeEl.innerHTML = '';
        roleBadgeEl.hidden = true;
      }
      applyProfileLevelFromData(data);
      const idEl = document.getElementById('apProfileId');
      if (idEl && String(activeProfileUser?.userId || '') === String(userId)) {
        const idDisplay =
          window.formatUserDisplayId?.(null, activeProfileUser.displayId) ||
          activeProfileUser.displayId ||
          '';
        const platformAdminProfile = liveProfileIsPlatformAdmin(userId, activeProfileUser, data);
        const idText = idEl.querySelector('.ap-profile-id-text');
        const idHtml =
          window.formatAdminIdHtml?.(idDisplay, { isAdmin: platformAdminProfile }) ||
          `ID: ${idDisplay || '—'}`;
        if (idText) idText.innerHTML = idHtml;
        idEl.classList.toggle('is-admin-id', platformAdminProfile);
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
      isRoomAdmin: Boolean(
        (seatHit?.role === 'admin' || seatHit?.isAdmin) &&
        !isPlatformAdminUserId(resolvedId)
      ),
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

    const img = document.getElementById('apProfileAvatar');
    const nm = document.getElementById('apProfileName');
    const idEl = document.getElementById('apProfileId');
    const initialPic = resolveLiveProfilePic(n, resolvedId);

    const avatarWrap = document.getElementById('apProfileAvatarWrap');
    const adminTag = document.getElementById('apProfileAdminTag');
    if (avatarWrap) avatarWrap.classList.remove('ap-admin-frame');
    if (adminTag) adminTag.hidden = true;

    const roleBadgeEl = document.getElementById('apProfileRoleBadge');
    if (roleBadgeEl) {
      roleBadgeEl.innerHTML = '';
      roleBadgeEl.hidden = true;
    }
    clearLiveProfileSheetBadges();
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
      const platformAdminProfile = liveProfileIsPlatformAdmin(
        resolvedId,
        activeProfileUser,
        { role: activeProfileUser.userRole }
      );
      const idHtml =
        window.formatAdminIdHtml?.(idDisplay, { isAdmin: platformAdminProfile }) ||
        `ID: ${idDisplay || '—'}`;
      idEl.innerHTML = `<span class="ap-profile-id-text">${idHtml}</span><button type="button" id="apProfileCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button>`;
      idEl.classList.toggle('is-admin-id', platformAdminProfile);
      document.getElementById('apProfileCopyId')?.addEventListener('click', () => {
        const full = idDisplay || activeProfileUser.displayId;
        if (!full) return;
        if (navigator.clipboard) navigator.clipboard.writeText(full).catch(() => { });
        toast('User ID copied', 'success');
      });
    }
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
    syncProfileAdminToggleBtn();
    syncProfileLeaveSeatBtn();
    syncHostKickAdminBar();
    const profileSheet = document.getElementById('apProfileSheet');
    if (profileSheet) {
      profileSheet.classList.add('open');
      profileSheet.style.pointerEvents = 'auto';
      profileSheet.style.removeProperty('display');
      profileSheet.style.removeProperty('visibility');
      profileSheet.style.zIndex = '14000';
      if (profileSheet.parentElement !== document.body) document.body.appendChild(profileSheet);
    }
    syncLiveOverlayClass();

    if (resolvedId) {
      const eng = await loadProfileEngagement(resolvedId, n, img, nm);
      if (!eng?.personalLevel && window.ProfileBadges?.fetchBadges) {
        try {
          const badges = await window.ProfileBadges.fetchBadges(resolvedId);
          if (String(activeProfileUser?.userId || '') === String(resolvedId)) {
            paintLiveProfileSheetBadges(resolvedId, activeProfileUser, badges);
          }
        } catch (_e) { /* ignore */ }
      }
    }
    const friendBtn = document.getElementById('apProfileAddFriend');
    if (friendBtn && resolvedId && window.SocialInteractions?.isFollowing) {
      const following = SocialInteractions.isFollowing(resolvedId, n);
      friendBtn.innerHTML = following
        ? '<i class="fas fa-user-check"></i><span>Following</span>'
        : '<i class="fas fa-user-plus"></i><span>Add friend</span>';
    }
    syncProfileAdminToggleBtn();
    syncProfileLeaveSeatBtn();
    syncHostKickAdminBar();
  }

  /** Visible Kick host · 2h / 24h for platform admins (not buried under More). */
  function syncHostKickAdminBar() {
    const panel = document.querySelector('#apProfileSheet .ap-profile-sheet-panel');
    if (!panel) return;
    panel.querySelector('.ap-host-kick-bar')?.remove();
    const uid = String(activeProfileUser?.userId || '');
    if (!uid || !isPlatformAdminSelf() || !isRoomHostUserId(uid)) return;
    if (String(currentUser()?.id || '') === uid) return;
    const bar = document.createElement('div');
    bar.className = 'ap-host-kick-bar';
    bar.innerHTML =
      '<p class="ap-host-kick-bar-label">Kick streaming host</p>' +
      '<div class="ap-host-kick-bar-actions">' +
      '<button type="button" class="ap-host-kick-btn" data-hkick="2"><i class="fas fa-ban"></i><span>2 hours</span></button>' +
      '<button type="button" class="ap-host-kick-btn" data-hkick="24"><i class="fas fa-ban"></i><span>24 hours</span></button>' +
      '</div>';
    const giftBtn = document.getElementById('apProfileGiftBtn');
    if (giftBtn) panel.insertBefore(bar, giftBtn);
    else panel.appendChild(bar);
    bar.querySelector('[data-hkick="2"]')?.addEventListener('click', () => {
      kickUserFromRoom(uid, 'admin_kicked_host', 2);
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
    bar.querySelector('[data-hkick="24"]')?.addEventListener('click', () => {
      kickUserFromRoom(uid, 'admin_kicked_host', 24);
      document.getElementById('apProfileSheet')?.classList.remove('open');
    });
  }

  function syncProfileLeaveSeatBtn() {
    const actions = document.querySelector('#apProfileSheet .ap-profile-actions');
    if (!actions) return;
    let btn = document.getElementById('apProfileLeaveSeat');
    const uid = String(activeProfileUser?.userId || '');
    const meId = String(currentUser()?.id || '');
    const canShow =
      uid &&
      meId &&
      uid === meId &&
      !isHost() &&
      (memberIsOnStage(uid) || hasSpeakerSeat);
    if (!canShow) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'apProfileLeaveSeat';
      btn.className = 'ap-profile-action-btn ap-profile-leave-seat';
      actions.appendChild(btn);
      btn.addEventListener('click', () => {
        leaveOwnSeat();
        document.getElementById('apProfileSheet')?.classList.remove('open');
      });
    }
    btn.innerHTML = '<i class="fas fa-user-minus"></i><span>Leave seat</span>';
  }

  function syncProfileAdminToggleBtn() {
    const actions = document.querySelector('#apProfileSheet .ap-profile-actions');
    if (!actions) return;
    let btn = document.getElementById('apProfileAdminToggle');
    const uid = String(activeProfileUser?.userId || '');
    const meId = String(currentUser()?.id || '');
    const canShow =
      uid &&
      meId &&
      uid !== meId &&
      !isRoomHostUserId(uid) &&
      (canGrantRoomAdmin() || canModerateRoom());
    if (!canShow) {
      btn?.remove();
      return;
    }
    const memberHit =
      (roomState?.seats || []).find((s) => String(s.userId) === uid) ||
      (roomState?.onlineMembers || []).find((m) => String(m.userId) === uid) ||
      null;
    const isAdminMember = isRoomAdminMember(memberHit);
    const canMake = canGrantRoomAdmin() && !isAdminMember;
    const canRemove = isAdminMember && (canGrantRoomAdmin() || canModerateRoom());
    if (!canMake && !canRemove) {
      btn?.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'apProfileAdminToggle';
      btn.className = 'ap-profile-action-btn ap-profile-admin-toggle';
      actions.appendChild(btn);
      btn.addEventListener('click', () => {
        const id = String(activeProfileUser?.userId || '');
        if (!id) return;
        const hit =
          (roomState?.seats || []).find((s) => String(s.userId) === id) ||
          (roomState?.onlineMembers || []).find((m) => String(m.userId) === id);
        const nowAdmin = isRoomAdminMember(hit);
        if (nowAdmin) {
          if (window.confirm(`Remove admin from ${activeProfileUser?.name || 'this user'}?`)) {
            grantRoomAdmin(id, false);
          }
        } else if (canGrantRoomAdmin()) {
          grantRoomAdmin(id, true);
        }
        setTimeout(() => syncProfileAdminToggleBtn(), 300);
      });
    }
    if (canMake) {
      btn.classList.remove('is-revoke');
      btn.innerHTML = '<i class="fas fa-user-shield"></i><span>Make admin</span>';
    } else {
      btn.classList.add('is-revoke');
      btn.innerHTML = '<i class="fas fa-user-slash"></i><span>Remove admin</span>';
    }
  }

  function injectGiftSheet() {
    if (document.getElementById('giftSheet')) {
      if (!document.getElementById('giftSheetClose')) {
        const panel = document.querySelector('#giftSheet .gift-sheet-panel');
        panel?.insertAdjacentHTML(
          'afterbegin',
          '<button type="button" class="gift-sheet-close" id="giftSheetClose" aria-label="Close gifts">&times;</button>'
        );
        delete document.getElementById('giftSheet')?.dataset.bound;
      }
      /* Remove search bar (not wanted) */
      document.querySelectorAll('.gift-search-row, #giftSearchInput').forEach((el) => el.remove());
      giftSearchQuery = '';
      /* Upgrade tabs for cheap-first gift sheet */
      const tabs = document.getElementById('giftSheetTabs');
      if (tabs && tabs.dataset.lux !== '5') {
        tabs.dataset.lux = '5';
        tabs.innerHTML = GIFT_TAB_HTML;
        giftCategory = 'popular';
        tabs.querySelectorAll('button[data-cat]').forEach((btn) => {
          btn.addEventListener('click', () => {
            tabs.querySelectorAll('button[data-cat]').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            giftCategory = btn.dataset.cat || 'popular';
            selectedGiftIdx = 0;
            renderGiftGrid();
          });
        });
      }
      const panel = document.querySelector('#giftSheet .gift-sheet-panel');
      if (panel && !document.getElementById('giftSendBtn')) {
        panel.insertAdjacentHTML(
          'beforeend',
          `<div class="gift-qty-row" id="giftQtyRow">
            <div class="gift-qty-btns">
              <button type="button" data-qty="1" class="active">1</button>
              <button type="button" data-qty="10">10</button>
              <button type="button" data-qty="50">50</button>
              <button type="button" data-qty="100">100</button>
            </div>
            <button type="button" class="gift-send-btn" id="giftSendBtn">Send</button>
          </div>
          <div class="gift-send-error" id="giftSendError" role="alert"></div>`
        );
        delete document.getElementById('giftSheet')?.dataset.bound;
      }
      const panelHdr = document.querySelector('#giftSheet .gift-sheet-panel');
      if (panelHdr && !document.getElementById('giftSendAll')) {
        const hdr = document.createElement('div');
        hdr.className = 'gift-send-header';
        hdr.innerHTML =
          '<span class="gift-send-label">Send Gift</span><label class="gift-all-toggle"><span>ALL</span><input type="checkbox" id="giftSendAll" aria-label="Send gift to everyone on stage"></label>';
        const recipientsRow = document.getElementById('giftRecipients');
        if (recipientsRow) panelHdr.insertBefore(hdr, recipientsRow);
        else panelHdr.insertBefore(hdr, panelHdr.firstChild?.nextSibling || null);
        delete document.getElementById('giftSheet')?.dataset.bound;
      }
      document.getElementById('giftSheet')?.classList.add('gift-sheet--lux', 'gift-sheet--send-safe');
      return;
    }
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="gift-sheet gift-sheet--lux gift-sheet--send-safe" id="giftSheet">
        <div class="gift-sheet-panel">
          <button type="button" class="gift-sheet-close" id="giftSheetClose" aria-label="Close gifts">&times;</button>
          <div class="gift-send-header">
            <span class="gift-send-label">Send Gift</span>
            <label class="gift-all-toggle"><span>ALL</span><input type="checkbox" id="giftSendAll" aria-label="Send gift to everyone on stage"></label>
          </div>
          <div class="gift-recipients" id="giftRecipients"></div>
          <div class="gift-rtp-banner" id="giftRtpBanner" hidden><span>Select a gift to see details</span></div>
          <div class="gift-sheet-tabs" id="giftSheetTabs" data-lux="5">
            <button type="button" data-cat="recent">Recent</button>
            <button type="button" data-cat="popular" class="active">Popular</button>
            <button type="button" data-cat="premium">Premium</button>
            <button type="button" data-cat="vip">VIP</button>
            <button type="button" data-cat="flowers">Flowers</button>
            <button type="button" data-cat="lucky">Lucky</button>
            <button type="button" data-cat="cars">Luxury</button>
          </div>
          <button type="button" class="gift-balance-btn" id="giftBalanceBtn">🎁 <span id="giftCoinsBal">0</span> gift &gt;</button>
          <div class="gift-grid" id="giftGrid"></div>
          <div class="gift-qty-row" id="giftQtyRow">
            <div class="gift-qty-btns">
              <button type="button" data-qty="1" class="active">1</button>
              <button type="button" data-qty="10">10</button>
              <button type="button" data-qty="50">50</button>
              <button type="button" data-qty="100">100</button>
            </div>
            <button type="button" class="gift-send-btn" id="giftSendBtn">Send</button>
          </div>
          <div class="gift-send-error" id="giftSendError" role="alert"></div>
        </div>
      </div>`
    );
    const balBtn = document.getElementById('giftBalanceBtn');
    if (balBtn) balBtn.innerHTML = `🎁 <span id="giftCoinsBal">0</span> gift &gt;`;
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

  function formatLiveRoomIdLine(ch) {
    const id = String(ch || channelId() || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(-10);
    return id ? 'ID ' + id : 'ID —';
  }

  /** Fill host name / room ID / avatar before socket join completes — avoids broken "Streamer" shell */
  function primeLiveRoomChrome() {
    if (!isLiveRoomPage() && !isPartyRoomPage()) return;
    const user = currentUser();
    const hosting = isHost() || clientClaimsHost();
    syncHostBarUi();
    const hostName = roomState?.hostName || (user ? displayName(user) : 'Streamer');
    document.querySelectorAll('#partyHostName, #liveHostName').forEach((el) => {
      const full = hostName || 'Host';
      el.textContent = full;
      el.title = full;
    });
    const ch = channelId();
    const rid = document.getElementById('liveRoomId');
    if (rid) rid.textContent = formatLiveRoomIdLine(ch);
    const partyRid = document.getElementById('partyRoomId') || document.getElementById('partyRoomIdLive');
    if (partyRid) partyRid.textContent = 'ID:' + String(ch).slice(-10);
    const sub = document.getElementById('liveSubLabel');
    if (sub) sub.textContent = hosting ? 'Hosting' : 'Live now';
    const hostLabel = document.getElementById('partyHostLabel');
    if (hostLabel && hosting) hostLabel.textContent = 'Hosting';
    const hostFollow = document.getElementById('partyHostFollow');
    if (hostFollow) hostFollow.style.display = hosting ? 'none' : '';
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostImg && user) {
      try {
        paintHostAvatarImg(hostImg, hostName, resolveHostProfilePic());
      } catch (_e) {
        try {
          hostImg.src = avatarUrl(hostName, null);
        } catch (_e2) { /* */ }
      }
    }
    const editLiveBtn = document.getElementById('liveEditPresentationBtn');
    if (editLiveBtn) {
      const showEdit = hosting;
      editLiveBtn.hidden = !showEdit;
      editLiveBtn.style.display = showEdit ? '' : 'none';
    }
    const vc = document.getElementById('liveViewerCount');
    if (vc && roomState?.viewers != null) {
      const n = roomState.viewers || (hosting ? 1 : 0);
      vc.textContent = isLiveRoomPage() ? `${n} joined` : String(n);
    } else if (vc && hosting && isLiveRoomPage()) {
      vc.textContent = '1 joined';
    }
  }

  function ensureHostChannelInUrl() {
    if ((!clientClaimsHost() && !isHost()) || qs('channel') || qs('room')) return;
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
    primeLiveRoomChrome();
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

  function openPartyRoomSettings() {
    closePartyRefModals('apPartyRoomSettings');
    const el = document.getElementById('apPartyRoomSettings');
    if (!el) return;
    el.classList.add('open');
    window.__apPartyModalOpenedAt = Date.now();
    window.__apToolsOpenGuardUntil = Date.now() + 900;
    syncLiveOverlayClass();
  }

  function closePartyRefModals(exceptId) {
    ['apPartyRoomSettings', 'apPartySettingModal', 'apPartyEditInfoModal', 'apPartyRoomProfile'].forEach(
      (id) => {
        if (exceptId && id === exceptId) return;
        document.getElementById(id)?.classList.remove('open');
      }
    );
    hidePartySeatMenu();
    cancelPartySeatMovePick();
  }

  function cancelPartySeatMovePick() {
    partySeatMoveUserId = null;
    partySeatMoveUserName = '';
    document.body.classList.remove('ap-seat-move-pick');
    document.getElementById('partySeats')?.querySelectorAll('.party-seat.is-move-target').forEach((el) => {
      el.classList.remove('is-move-target');
    });
    const banner = document.getElementById('partySeatMoveBanner');
    if (banner) banner.hidden = true;
  }

  function startPartySeatMovePick(userId, fromSeatNum, userName) {
    if (!canModerateRoom() || !userId) return;
    cancelPartySeatMovePick();
    partySeatMoveUserId = String(userId);
    partySeatMoveUserName = userName || 'Guest';
    document.body.classList.add('ap-seat-move-pick');
    const banner = document.getElementById('partySeatMoveBanner');
    const label = document.getElementById('partySeatMoveBannerText');
    if (label) {
      label.textContent = `Tap a seat to move ${partySeatMoveUserName}${fromSeatNum ? ` (from #${fromSeatNum})` : ''}`;
    }
    if (banner) banner.hidden = false;
    toast('Tap any seat to move them there', 'info');
  }

  function hidePartySeatMenu() {
    const menu = document.getElementById('apPartySeatMenu');
    if (menu) menu.hidden = true;
    partySeatMenuCtx = null;
  }

  function openPartySeatMenu(anchor, ctx) {
    if (!canModerateRoom()) return;
    const menu = document.getElementById('apPartySeatMenu');
    if (!menu) return;
    partySeatMenuCtx = ctx;
    const items = [];
    if (ctx.empty) {
      items.push({ id: 'invite', icon: 'fa-user-plus', label: 'Invite to mic' });
      items.push({ id: 'lock', icon: 'fa-lock', label: 'Lock seat' });
    } else if (ctx.uid && !ctx.isHost) {
      items.push({ id: 'mute', icon: 'fa-microphone-slash', label: 'Mute mic' });
      items.push({ id: 'unmute', icon: 'fa-microphone', label: 'Unmute mic' });
      items.push({ id: 'demote', icon: 'fa-user-minus', label: 'Remove from seat' });
      items.push({ id: 'move', icon: 'fa-exchange-alt', label: 'Move seat…' });
      items.push({ id: 'more', icon: 'fa-ellipsis-h', label: 'More actions' });
    }
    if (!items.length) return;
    menu.innerHTML = items
      .map(
        (it) =>
          `<button type="button" data-action="${it.id}"><i class="fas ${it.icon}"></i>${escapeHtml(it.label)}</button>`
      )
      .join('');
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - 196)}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - items.length * 46 - 16))}px`;
    menu.hidden = false;
    menu.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        const c = partySeatMenuCtx;
        hidePartySeatMenu();
        if (!c) return;
        if (action === 'invite') openAvailableUsersForSeat(c.seatNum);
        else if (action === 'lock') toast('Seat lock coming soon', 'info');
        else if (action === 'mute' && c.uid) muteRemoteUser(c.uid, true);
        else if (action === 'unmute' && c.uid) muteRemoteUser(c.uid, false);
        else if (action === 'demote' && c.uid) demoteUserFromSeat(c.uid);
        else if (action === 'move' && c.uid) startPartySeatMovePick(c.uid, c.seatNum, c.name);
        else if (action === 'more' && c.uid) openModerationMenu(c.name, c.uid, c.seatNum);
      };
    });
  }

  function handlePartySeatTap(btn) {
    if (!btn) return;
    const name = btn.dataset.user || btn.querySelector('.seat-name')?.textContent || '';
    const uid = btn.dataset.userId || '';
    const seatNum = Number(btn.dataset.seat || btn.dataset.seatNum) || 0;
    const isHostSeat = btn.classList.contains('is-host');

    if (partySeatMoveUserId && canModerateRoom()) {
      if (isHostSeat) {
        toast('Cannot move guest to the host seat', 'warning');
        return;
      }
      if (!seatNum) return;
      if (String(uid) === String(partySeatMoveUserId) && seatNum) {
        cancelPartySeatMovePick();
        return;
      }
      btn.classList.add('is-move-target');
      moveUserSeat(partySeatMoveUserId, seatNum);
      cancelPartySeatMovePick();
      return;
    }

    if (btn.hasAttribute('data-join-seat')) {
      if (isHost()) openSeatSheet(btn.dataset.seatNum);
      else requestSeatJoin();
      return;
    }
    if (isHostSeat && isHost()) {
      handleMicButton();
      return;
    }
    if (canModerateRoom() && btn.classList.contains('is-empty')) {
      openPartySeatMenu(btn, { name: '', uid: '', seatNum, empty: true });
      return;
    }
    if (canModerateRoom() && uid && !isHostSeat) {
      openPartySeatMenu(btn, { name, uid, seatNum, isHost: false });
      return;
    }
    openProfileSheet(name, uid);
  }

  function bindPartySeatDelegation() {
    const container = document.getElementById('partySeats');
    if (!container || container.dataset.delegateBound === '1') return;
    container.dataset.delegateBound = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.party-seat, [data-join-seat]');
      if (!btn || !container.contains(btn)) return;
      e.stopPropagation();
      handlePartySeatTap(btn);
    });
    container.addEventListener('contextmenu', (e) => {
      if (!canModerateRoom()) return;
      const btn = e.target.closest('.party-seat');
      if (!btn || !container.contains(btn)) return;
      e.preventDefault();
      const name = btn.dataset.user || '';
      const uid = btn.dataset.userId || '';
      const seatNum = Number(btn.dataset.seat || btn.dataset.seatNum) || 0;
      openPartySeatMenu(btn, {
        name,
        uid,
        seatNum,
        empty: btn.classList.contains('is-empty'),
        isHost: btn.classList.contains('is-host'),
      });
    });
  }

  function openPartyEditInfoModal() {
    closePartyRefModals('apPartyEditInfoModal');
    const name = roomState?.hostName || displayName(currentUser());
    const cover = getStreamCoverUrl(name) || '';
    document.getElementById('partyEditNameInput').value = name;
    document.getElementById('partyEditAnnouncementInput').value =
      roomState?.roomStyle?.announcement || '';
    const prev = document.getElementById('partyEditPhotoPreview');
    if (prev) prev.src = cover || avatarUrl(name, null);
    window.__apPartyModalOpenedAt = Date.now();
    window.__apPartyEditModalGuardUntil = Date.now() + 800;
    document.getElementById('apPartyEditInfoModal')?.classList.add('open');
    syncLiveOverlayClass();
  }

  function openPartyRoomProfile() {
    closePartyRefModals('apPartyRoomProfile');
    const name = roomState?.hostName || 'Room';
    const ch = channelId();
    document.getElementById('apPartyProfileName').textContent = name;
    document.getElementById('apPartyProfileId').textContent = 'ID: ' + ch.slice(-8);
    document.getElementById('apPartyProfileOwner').textContent = name;
    document.getElementById('apPartyProfileAnnouncement').textContent =
      roomState?.roomStyle?.announcement || 'No announcement yet';
    const cover = getStreamCoverUrl(name);
    const img = document.getElementById('apPartyProfileCover');
    if (img) img.src = cover || avatarUrl(name, roomState?.hostProfilePic);
    const memberTab = document.getElementById('apPartyProfileTabMember');
    if (memberTab) {
      const members = roomState?.onlineMembers || [];
      memberTab.innerHTML =
        members.length > 0
          ? members
              .map(
                (m) =>
                  `<div style="padding:8px 0;color:#fff;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.08)">${escapeHtml(m.displayName || m.name || 'User')}</div>`
              )
              .join('')
          : '<p style="color:rgba(255,255,255,0.5)">No members online</p>';
    }
    document.getElementById('apPartyRoomProfile')?.classList.add('open');
    syncLiveOverlayClass();
  }

  function emitPartyRoomStyle(partial, onDone) {
    if (!liveSocket?.connected) {
      toast('Not connected', 'warning');
      return;
    }
    liveSocket.emit(
      'live:room_style',
      { channel: channelId(), ...partial },
      (res) => {
        if (res?.ok) {
          if (res.data) roomState.roomStyle = { ...(roomState.roomStyle || {}), ...res.data };
          renderRoomState();
          onDone?.(res);
        } else toast(res?.message || 'Could not save settings', 'error');
      }
    );
  }

  function playablePartyGames() {
    return PARTY_GAME_TYPES.filter((g) => g.game);
  }

  function closePartyGamePicker() {
    document.getElementById('apPartyGamePicker')?.remove();
  }

  function openPartyGamePicker() {
    closePartyGamePicker();
    const selected = roomState?.roomStyle?.gameType || '';
    const wrap = document.createElement('div');
    wrap.id = 'apPartyGamePicker';
    wrap.className = 'ap-party-game-picker';
    wrap.innerHTML =
      `<div class="ap-party-game-picker-sheet" role="dialog" aria-label="Games">
        <div class="ap-party-game-picker-handle"></div>
        <h3>Games</h3>
        <div class="ap-party-game-picker-grid">
          ${playablePartyGames()
            .map(
              (g) =>
                `<button type="button" class="${g.id === selected ? 'is-selected' : ''}" data-game-id="${g.id}" data-game-url="${g.game}"><span class="game-ico">${g.emoji}</span><span>${escapeHtml(g.label)}</span></button>`
            )
            .join('')}
        </div>
        <button type="button" class="ap-party-game-picker-close" id="apPartyGamePickerClose">Close</button>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closePartyGamePicker();
    });
    wrap.querySelector('#apPartyGamePickerClose')?.addEventListener('click', closePartyGamePicker);
    wrap.querySelectorAll('[data-game-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-game-url');
        closePartyGamePicker();
        if (url && typeof window.openGameOverlay === 'function') window.openGameOverlay(url);
      });
    });
  }

  function paintPartyGameTypeGrid() {
    const grid = document.getElementById('partyGameTypeGrid');
    if (!grid) return;
    const selected = roomState?.roomStyle?.gameType || 'none';
    grid.innerHTML = PARTY_GAME_TYPES.map(
      (g) =>
        `<button type="button" data-game-id="${g.id}" class="${g.id === selected ? 'is-selected' : ''}"><span class="game-ico">${g.emoji}</span>${escapeHtml(g.label)}</button>`
    ).join('');
    grid.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
  }

  function syncPartyMicCountUi() {
    const n = Number(roomState?.roomStyle?.micCount) || 15;
    document.querySelectorAll('#partyMicCountOptions button').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.mics) === n);
    });
    const preview = document.getElementById('partySettingLayoutPreview');
    if (preview) preview.textContent = `${n} mic layout · ${n <= 10 ? 'compact' : 'grid'} mode`;
    const toggle = document.getElementById('partyApplyModeToggle');
    if (toggle) toggle.classList.toggle('is-on', roomState?.roomStyle?.applyMode !== false);
  }

  function bindPartyRefUi() {
    if (!isPartyRoomPage()) return;
    if (document.body.dataset.partyRefBound) return;
    document.body.dataset.partyRefBound = '1';

    applyRoomBackground(roomState?.roomStyle?.backgroundId || 'lakeside');
    bindPartySeatDelegation();
    hideMicLinkModal();
    cancelPartySeatMovePick();
    hideTapForSoundHint();

    document.getElementById('partySeatMoveCancel')?.addEventListener('click', cancelPartySeatMovePick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && partySeatMoveUserId) cancelPartySeatMovePick();
    });
    if (!window.__apPartySeatsResizeBound) {
      window.__apPartySeatsResizeBound = true;
      window.addEventListener('resize', scheduleFitPartySeatsToViewport);
      window.addEventListener('orientationchange', scheduleFitPartySeatsToViewport);
    }

    document.getElementById('partyRefComposeTap')?.addEventListener('click', () => {
      document.body.classList.add('ap-chat-compose-open');
      document.getElementById('partyRefChatBtn')?.classList.add('is-active');
      document.getElementById('liveChatInput')?.focus();
    });
    document.getElementById('partyRefGiftPill')?.addEventListener('click', () => openGiftSheet());
    document.getElementById('partyRefPromoBtn')?.addEventListener('click', () => {
      location.href = '/coins-recharge.html?app=1';
    });
    document.getElementById('partyRefGamesBtn')?.addEventListener('click', () => {
      openPartyGamePicker();
    });
    document.getElementById('partySettingGames')?.addEventListener('click', () => {
      closePartyRefModals();
      openPartyGamePicker();
    });

    document.getElementById('partyRefChatBtn')?.addEventListener('click', () => {
      focusChatCompose();
    });

    document.getElementById('partyRefHostTap')?.addEventListener('click', (e) => {
      if (e.target.closest('#liveEditPresentationBtn, .live-edit-presentation-btn')) return;
      openPartyRoomProfile();
    });
    document.getElementById('apPartySettingsClose')?.addEventListener('click', () => closePartyRefModals());

    document.getElementById('partySettingOpenModal')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      window.__apPartyModalOpenedAt = Date.now();
      paintPartyGameTypeGrid();
      syncPartyMicCountUi();
      window.__apPartyModalOpenedAt = Date.now();
      document.getElementById('apPartySettingModal')?.classList.add('open');
      syncLiveOverlayClass();
    });
    document.getElementById('partySettingEditInfo')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      setTimeout(() => openPartyEditInfoModal(), 0);
    });
    document.getElementById('partySettingTheme')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      openRoomBackgroundPicker();
    });
    document.getElementById('partySettingPassword')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      document.getElementById('partyBtnLock')?.click();
    });
    document.getElementById('partySettingRoomData')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      openHostLiveDataSheet();
    });
    document.getElementById('partySettingFanBadge')?.addEventListener('click', () => {
      toast('Fan Badge — coming soon', 'info');
    });
    document.getElementById('partySettingRoomAdmin')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      openPartyRequestsSheet();
    });
    document.getElementById('partySettingMusic')?.addEventListener('click', () => {
      document.getElementById('apPartyRoomSettings')?.classList.remove('open');
      document.getElementById('partyBtnMusic')?.click();
    });

    document.querySelectorAll('#partyMicCountOptions button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!isHost()) {
          toast('Only host can change mic count', 'warning');
          return;
        }
        document.querySelectorAll('#partyMicCountOptions button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
    document.getElementById('partyApplyModeToggle')?.addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('is-on');
    });
    document.getElementById('partySettingConvert')?.addEventListener('click', () => {
      if (!isHost()) {
        toast('Only host can apply settings', 'warning');
        return;
      }
      const micBtn = document.querySelector('#partyMicCountOptions button.is-selected');
      const micCount = Number(micBtn?.dataset.mics) || 15;
      const gameBtn = document.querySelector('#partyGameTypeGrid button.is-selected');
      const gameType = gameBtn?.dataset.gameId || 'none';
      const applyMode = document.getElementById('partyApplyModeToggle')?.classList.contains('is-on');
      emitPartyRoomStyle({ micCount, gameType, applyMode }, () => {
        toast('Room settings applied', 'success');
        document.getElementById('apPartySettingModal')?.classList.remove('open');
        renderPartySeats(roomState?.hostName);
      });
    });

    document.getElementById('partyEditPhotoInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await uploadLiveChatImage(file);
        document.getElementById('partyEditPhotoPreview').src = resolveMediaUrl(url);
        document.getElementById('partyEditPhotoPreview').dataset.uploadUrl = url;
      } catch (err) {
        toast(err?.message || 'Upload failed', 'error');
      }
      e.target.value = '';
    });
    document.getElementById('partyEditInfoClose')?.addEventListener('click', () => closePartyRefModals());
    document.getElementById('partyEditInfoSubmit')?.addEventListener('click', () => {
      const trimmed = String(document.getElementById('partyEditNameInput')?.value || '').trim().slice(0, 48);
      const announcement = String(document.getElementById('partyEditAnnouncementInput')?.value || '')
        .trim()
        .slice(0, 280);
      if (!trimmed) {
        toast('Room name cannot be empty', 'warning');
        return;
      }
      const coverUrl = document.getElementById('partyEditPhotoPreview')?.dataset.uploadUrl;
      const payload = { channel: channelId(), streamTitle: trimmed };
      if (coverUrl) payload.streamCoverUrl = coverUrl;
      liveSocket?.emit('live:update_presentation', payload, (res) => {
        if (!res?.ok) {
          toast(res?.message || 'Could not update room', 'error');
          return;
        }
        emitPartyRoomStyle({ announcement }, () => {
          toast('Room info updated', 'success');
          document.getElementById('apPartyEditInfoModal')?.classList.remove('open');
        });
      });
    });

    document.querySelectorAll('.ap-party-room-profile-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ap-party-room-profile-tabs button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const tab = btn.dataset.tab;
        document.getElementById('apPartyProfileTabProfile').hidden = tab !== 'profile';
        document.getElementById('apPartyProfileTabMember').hidden = tab !== 'member';
      });
    });

    ['apPartyRoomSettings', 'apPartySettingModal', 'apPartyRoomProfile'].forEach((id) => {
      const overlay = document.getElementById(id);
      overlay?.addEventListener('click', (e) => {
        if (e.target !== overlay) return;
        if (Date.now() - (Number(window.__apPartyModalOpenedAt) || 0) < 400) return;
        closePartyRefModals();
      });
      overlay?.querySelector(
        '.ap-party-settings-panel, .ap-party-setting-panel, .ap-party-room-profile-panel'
      )?.addEventListener('click', (e) => e.stopPropagation());
    });
    const editOverlay = document.getElementById('apPartyEditInfoModal');
    editOverlay?.querySelector('.ap-party-edit-panel')?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#apPartySeatMenu')) hidePartySeatMenu();
    });
  }

  async function initPartyRoom() {
    bindScreenCaptureLifecycle();
    if (!isNativeApApp() && !clientClaimsHost()) {
      showLiveAppOnlySafetyGate();
      return;
    }
    if (partyRoomInitStarted) return;
    partyRoomInitStarted = true;
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    window.SocialFX?.bindGiftGridScrollFix?.();
    bindPartyRefUi();
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
      new Promise((r) => setTimeout(r, isHost() || clientClaimsHost() ? 1500 : 350)),
    ]).catch(() => { });
    initForensicLog();
    restoreChannelFromDurableSession();
    ensureHostChannelInUrl();
    primeLiveRoomChrome();
    const restored = restoreJoinMeta();
    if (restored && !lastJoinMeta) lastJoinMeta = restored;

    bindCommonControls('party');
    bindHostControls('party');
    if (isHost()) forceRevealRoomShell();
    setApLoaderStep(1);
    const earlyAgora =
      !isHost() && !clientClaimsHost() ? startViewerAgoraEarly('party') : Promise.resolve();
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
    void Promise.resolve(earlyAgora)
      .catch(() => { })
      .then(() => startPartyVoiceAsync());
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
        if (document.hidden) return;
        if (!isPartyRoomPage() || !roomJoinCompleted || !isHost() || socketLeaveIntentional) return;
        requestFreshRoomState();
      }, 180000);
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
            if (res?.banned) {
              notifyBlockedFromRoom(res);
              reject(new Error(formatBanBlockMessage(res)));
              return;
            }
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
            mode: 'video',
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
        hostStreamCover: r.hostStreamCover || null,
        hostProfilePic: r.hostProfilePic || null,
        viewers: r.viewers || 0,
        mode: 'video',
      }));
      items = items.filter((it) => !it.hostId || !isLiveUserBlocked(it.hostId));
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
          mode: 'video',
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
    /* Only block on real open sheets — never on a stale body class alone */
    return Boolean(
      document.querySelector(
        '#apProfileSheet.open, #apGiftSheet.open, #giftSheet.open, #apTopupSheet.open, #apSeatSheet.open, .ap-gift-sheet.open, .gift-sheet.open, .party-tools-sheet.open, .party-requests-sheet.open, .party-music-sheet.open, #partyBgPickerSheet.open, #apInAppShareSheet.open, #apEmojiPopover.is-open, #apMicLinkModal.open, #apHostMicInviteModal.open, #apSurpriseShop.open, #apFilterSheet.open'
      )
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
    const feedCover =
      (item.hostStreamCover &&
        (resolveMediaUrl(item.hostStreamCover) || item.hostStreamCover)) ||
      (item.hostProfilePic && avatarUrl(item.hostName, item.hostProfilePic)) ||
      themeCover('live', item.hostName);
    if (backdrop) {
      backdrop.style.backgroundImage = `url('${feedCover}')`;
    }

    document.getElementById('liveHostName').textContent = item.hostName.slice(0, 18);
    document.getElementById('liveHostAvatar').src =
      (item.hostStreamCover &&
        (resolveMediaUrl(item.hostStreamCover) || item.hostStreamCover)) ||
      avatarUrl(item.hostName, item.hostProfilePic);
    document.getElementById('liveViewerCount').textContent = String(item.viewers || 0);
    updateModeBadge('video', false);

    roomState = {
      hostName: item.hostName,
      hostId: item.hostId || null,
      hostStreamCover: item.hostStreamCover || null,
      hostProfilePic: item.hostProfilePic || null,
      viewers: item.viewers || 0,
    };
    chatMessages = [];
    guestPublishAttempted = false;
    hasSpeakerSeat = false;
    seatPromoteAt = 0;
    lastViewerCount = 0;
    joinRequests = [];
    roomGiftHistory = [];
    try {
      stickyStageGuests.clear();
    } catch (_e) { /* ignore */ }
    try {
      window.__apAgoraUidMap = {};
    } catch (_e2) { /* ignore */ }
    try {
      remoteUsers.clear();
    } catch (_e3) { /* ignore */ }
    const guestRail = document.getElementById('liveGuestRail') || document.getElementById('partyGuestRail');
    if (guestRail) guestRail.innerHTML = '';
    const seatsEl = document.getElementById('partySeats');
    if (seatsEl) seatsEl.innerHTML = '';
    const chatFeed = document.getElementById('partyChatFeed') || document.getElementById('liveChatFeed');
    if (chatFeed) chatFeed.innerHTML = '';
    setLiveStreamVisible(false);
    setLiveStatus('Switching room…', null);

    if (liveSocket?.connected) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 800);
        try {
          liveSocket.emit('live:leave', {}, () => {
            clearTimeout(t);
            resolve();
          });
        } catch (_e) {
          clearTimeout(t);
          resolve();
        }
      });
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
    applyLiveBackground('live', item.hostName);
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
    window.SocialFX?.bindGiftGridScrollFix?.();
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
      .map((item, i) => {
        const cover =
          (item.hostStreamCover &&
            String(item.hostStreamCover).replace(/'/g, '%27')) ||
          (item.hostProfilePic &&
            String(avatarUrl(item.hostName, item.hostProfilePic) || '').replace(/'/g, '%27')) ||
          themeCover('live', item.hostName);
        return `
      <section class="live-feed-slide${i === 0 ? ' is-active' : ''}" data-index="${i}"
        style="background-image:url('${cover}')">
      </section>`;
      })
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
    if (!isNativeApApp() && !clientClaimsHost()) {
      showLiveAppOnlySafetyGate();
      return;
    }
    bindMediaResumeOnVisibility();
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    window.SocialFX?.bindGiftGridScrollFix?.();
    prepareLiveUiShell();
    const profileRefresh = refreshLiveUserProfile();
    const user = currentUser();
    if (!user) {
      toast('Please log in to watch or broadcast');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }
    /* Viewers: don't block on slow profile — stream first */
    await Promise.race([
      profileRefresh,
      new Promise((r) => setTimeout(r, isHost() || clientClaimsHost() ? 1500 : 350)),
    ]).catch(() => { });

    if (isFeedMode()) {
      await initLiveFeedViewer();
      return;
    }

    document.getElementById('liveSwipeHint')?.classList.add('is-hidden');

    initForensicLog();
    restoreChannelFromDurableSession();
    ensureHostChannelInUrl();
    primeLiveRoomChrome();
    const restored = restoreJoinMeta();
    if (restored && !lastJoinMeta) lastJoinMeta = restored;
    initBroadcastMode();
    bindCommonControls('live');
    bindHostControls('live');
    auditChannel('url', channelId());
    if (isHost()) forceRevealRoomShell();
    setApLoaderStep(1);

    /* Parallel: join Agora while socket live:join runs — cut TTFV */
    const earlyAgora =
      !isHost() && !clientClaimsHost() ? startViewerAgoraEarly('live') : Promise.resolve();
    const joinGuard = setTimeout(() => {
      forceRevealRoomShell();
      if (!roomJoinCompleted) {
        setLiveStatus('Connection timed out — tap mic or reload', false);
      } else if (!sessionEstablished) {
        finalizeRoomEntry();
        setLiveStatus('Stream still connecting…', null);
      }
    }, 8000);
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

    if (isHost()) {
      clearAudioModeUi();
      const bg = document.getElementById('liveBg');
      if (bg) bg.style.display = 'none';
    } else {
      applyLiveBackground('live', roomState?.hostName);
    }
    updateModeBadge('video', false);

    partyVoiceSkipped = false;
    /* Finish early Agora (or start if it failed), then ensure full media path */
    void Promise.resolve(earlyAgora)
      .catch(() => { })
      .then(() => startLiveVoiceAsync());
    applyRoleUiAfterJoin();
    postWelcomeMessage();
    bindScreenCaptureProtection();
    bindMediaResumeOnVisibility();
    bindPartyBackGuard();
  }

  let streamerStatsPeriod = 'today';
  let userAnalyticsPeriod = 'today';
  let streamerDailyAll = [];
  let activityGiftDailyAll = [];
  let streamerLivePage = 1;
  let streamerPartyPage = 1;
  let streamerPointsPage = 1;
  let streamerGiftsSentPage = 1;
  let streamerGiftsRecvPage = 1;
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

  function formatNum(n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    try {
      return v.toLocaleString();
    } catch (_e) {
      return String(v);
    }
  }

  function formatPts(n) {
    return `${formatNum(n)} pts`;
  }

  function formatCoinsLabel(n) {
    return `${formatNum(n)} coins`;
  }

  async function loadUserAnalytics(period = 'today') {
    userAnalyticsPeriod = period || 'today';
    streamerGiftsSentPage = 1;
    streamerGiftsRecvPage = 1;
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
      setText('activityGiftsSent', formatCoinsLabel(data.giftsSentCoins));
      setText('activityGiftsRecv', formatPts(data.giftsReceivedCoins));
      setText('activityRoomsJoined', formatNum(data.roomsJoined));
      setText('activityPartyWatch', formatActivityDuration(data.partyWatchSeconds));
      if (data.totalPoints != null) setText('streamerTotalPoints', formatPts(data.totalPoints));
      if (data.totalCoins != null) setText('streamerTotalCoins', formatCoinsLabel(data.totalCoins));
      if (data.lifetimePointsEarned != null) setText('streamerLifetimePoints', formatPts(data.lifetimePointsEarned));
      activityGiftDailyAll = data.daily || [];
      renderGiftDailyPaged();
    } catch (e) {
      console.warn('[analytics] load failed', e);
    }
  }

  async function loadStreamerStats(period = 'today') {
    streamerStatsPeriod = period || 'today';
    streamerLivePage = 1;
    streamerPartyPage = 1;
    streamerPointsPage = 1;
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
      setText('streamerWonPoints', formatPts(points));
      setText('streamerNewFollowers', formatNum(followers));
      setText('streamerTotalPoints', formatPts(data.totalPoints));
      setText('streamerTotalCoins', formatCoinsLabel(data.totalCoins));
      setText('streamerLifetimePoints', formatPts(data.lifetimePointsEarned));
      const last = data.lastSession;
      if (last) {
        setText('streamerLastHours', last.formatted || '00:00:00');
        setText('streamerLastAudiences', formatNum(last.peakViewers));
      } else {
        setText('streamerLastHours', '00:00:00');
        setText('streamerLastAudiences', '0');
      }
      setText('streamerLastPoints', formatPts(points));
      setText('streamerLastFollowers', formatNum(followers));
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

  function renderMetricDailyList(opts) {
    const {
      source,
      valueKey,
      countKey,
      listId,
      pagerId,
      labelId,
      emptyLabel,
      rowClass,
      formatValue,
    } = opts;
    const list = document.getElementById(listId);
    const pager = document.getElementById(pagerId);
    const label = document.getElementById(labelId);
    if (!list) return 1;

    const filtered = (source || []).filter((d) => Number(d[valueKey] || 0) > 0);
    if (!filtered.length) {
      list.innerHTML = `<p style="font-size:12px;color:#9ca3af">${emptyLabel}</p>`;
      if (pager) pager.hidden = true;
      return 1;
    }

    const sliced = pageSlice(filtered, opts.page);
    list.innerHTML = sliced.rows
      .map((d) => {
        const val = formatValue ? formatValue(d[valueKey]) : String(d[valueKey] || 0);
        const count = countKey ? Number(d[countKey] || 0) : 0;
        const countHtml = count > 0 ? `<span class="sub-count">· ${count} gift${count === 1 ? '' : 's'}</span>` : '';
        return `<div class="streamer-daily-row ${rowClass || ''}">
          <div><strong>${dailyDateLabel(d.date)}</strong></div>
          <div class="hrs">${val}${countHtml}</div>
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
    streamerPointsPage = renderMetricDailyList({
      source: streamerDailyAll,
      valueKey: 'pointsWon',
      countKey: 'giftsReceivedCount',
      listId: 'streamerDailyPointsList',
      pagerId: 'streamerPointsPager',
      labelId: 'streamerPointsPageLabel',
      emptyLabel: 'No points earned from gifts in this period',
      rowClass: 'streamer-daily-row--points',
      formatValue: formatPts,
      page: streamerPointsPage,
    });
  }

  function renderGiftDailyPaged() {
    streamerGiftsSentPage = renderMetricDailyList({
      source: activityGiftDailyAll,
      valueKey: 'giftsSentCoins',
      countKey: 'giftsSentCount',
      listId: 'streamerDailyGiftsSentList',
      pagerId: 'streamerGiftsSentPager',
      labelId: 'streamerGiftsSentPageLabel',
      emptyLabel: 'You did not send any gifts in this period',
      rowClass: 'streamer-daily-row--sent',
      formatValue: formatCoinsLabel,
      page: streamerGiftsSentPage,
    });
    streamerGiftsRecvPage = renderMetricDailyList({
      source: activityGiftDailyAll,
      valueKey: 'giftsReceivedCoins',
      countKey: 'giftsReceivedCount',
      listId: 'streamerDailyGiftsRecvList',
      pagerId: 'streamerGiftsRecvPager',
      labelId: 'streamerGiftsRecvPageLabel',
      emptyLabel: 'You did not receive any gifts in this period',
      rowClass: 'streamer-daily-row--recv',
      formatValue: formatPts,
      page: streamerGiftsRecvPage,
    });
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
    document.getElementById('streamerPointsPager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page-dir]');
      if (!btn) return;
      streamerPointsPage += Number(btn.dataset.pageDir) || 0;
      renderDailyHoursPaged();
    });
    document.getElementById('streamerGiftsSentPager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page-dir]');
      if (!btn) return;
      streamerGiftsSentPage += Number(btn.dataset.pageDir) || 0;
      renderGiftDailyPaged();
    });
    document.getElementById('streamerGiftsRecvPager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page-dir]');
      if (!btn) return;
      streamerGiftsRecvPage += Number(btn.dataset.pageDir) || 0;
      renderGiftDailyPaged();
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
    forceRemoteAudio,
    onScreenshotAttempt,
    notifyLiveAudioRoute,
    getForensicReport() {
      return window.__liveDebug || { events: [] };
    },
  };
  window.APLive = window.SocialLive;

  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (localStorage.getItem('ap_voice_route_debug') === '1') {
        notifyLiveAudioRoute('debug', { enabled: true, reason: 'localStorage' });
      }
    } catch (_e) { }
    const page = document.body?.dataset?.livePage;
    if (page === 'party-room' || page === 'live-room') {
      bindApLoaderDismiss();
      installLoaderEscapeHatch();
      initLiveBackGuard();
      primeApLoaderCover();
      bindScreenCaptureLifecycle();
      scheduleHideAppChrome();
      prepareLiveUiShell();
      startLiveChromeWatchdog();
      setTimeout(() => unlockLiveChrome({ forceGift: true }), 800);
      setTimeout(() => unlockLiveChrome({ forceGift: true }), 2500);
      /* Capture early taps so browser audio unlocks before Agora play(). */
      bindAudioUnlockGestures();
      window.addEventListener('ap-user-blocked', (ev) => {
        const uid = ev?.detail?.userId;
        if (uid) purgeBlockedUserFromLive(uid);
      });
      if (window.SocialInteractions?.refreshBlockCache) {
        SocialInteractions.refreshBlockCache()
          .then(() => purgeAllBlockedFromLiveUi())
          .catch(() => { });
      }
    }
    if (page === 'party-room') initPartyRoom();
    if (page === 'live-room') initLiveRoom();
    if (page === 'lucky-gifts') initLuckyGifts();
    if (page === 'streamer-center') initStreamerCenter();
    if (page === 'coins-recharge') initCoinsRecharge();
  });
})();


