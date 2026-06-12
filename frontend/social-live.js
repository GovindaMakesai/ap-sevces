/**
 * Party room (voice grid) + Live room (video) — Agora + Socket.io
 */
(function () {
  const GIFT_CATALOG = {
    gift: [
      { emoji: '🎺', name: 'Whistle', cost: 100 },
      { emoji: '📯', name: 'Soccer horn', cost: 2000, tag: 'Lucky' },
      { emoji: '🏆', name: 'Football trophy', cost: 50000, tag: 'Activity' },
      { emoji: '⚽', name: 'Last goal', cost: 500000, tag: 'Activity' },
      { emoji: '👋', name: 'Hi', cost: 500, tag: 'Hi~' },
      { emoji: '☕', name: 'Coffee', cost: 500 },
      { emoji: '🍦', name: 'Ice Cream', cost: 1000 },
      { emoji: '🎁', name: 'Lucky Box', cost: 2500, tag: 'Lucky' },
    ],
    lucky: [
      { emoji: '🍒', name: 'Cherry', cost: 50, tag: 'Lucky' },
      { emoji: '🌹', name: 'Rose', cost: 10 },
      { emoji: '💫', name: 'Pop pass', cost: 250, tag: 'Lucky' },
      { emoji: '🎲', name: 'Lucky dice', cost: 500, tag: 'Lucky' },
    ],
    new: [
      { emoji: '🌹', name: 'Rose', cost: 10 },
      { emoji: '💎', name: 'Diamond', cost: 500 },
      { emoji: '🚀', name: 'Rocket', cost: 1000 },
      { emoji: '🎆', name: 'Fireworks', cost: 5000, tag: 'New' },
    ],
  };
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
  let feedItems = [];
  let activeFeedIndex = 0;
  let activeChannelOverride = '';
  let feedSwitching = false;
  let feedObserver = null;

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
    return qs('host') === '1';
  }

  let broadcastMode = 'video';
  function initBroadcastMode() {
    broadcastMode = (qs('mode') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video';
  }

  function currentUser() {
    return window.Auth?.getUser?.() || window.AppState?.user || null;
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
      bg.style.backgroundImage = `url('${themeCover(mode === 'audio' ? 'audio' : 'live', name)}')`;
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
    }
    if (audioAvatar) audioAvatar.src = avatarUrl(name);
    if (audioLabel) audioLabel.textContent = mode === 'audio' ? 'Voice live' : 'Live';
    if (audioStage) audioStage.setAttribute('aria-hidden', mode === 'audio' ? 'false' : 'true');
    const backdrop = document.getElementById('liveFeedBackdrop');
    if (backdrop && document.body.classList.contains('live-feed-mode')) {
      backdrop.style.backgroundImage = `url('${themeCover(mode === 'audio' ? 'audio' : 'live', name)}')`;
    }
    updateModeBadge(mode, isHost());
  }

  function updateModeBadge(mode, hosting) {
    const el = document.getElementById('liveModeBadge');
    if (!el) return;
    el.classList.toggle('is-audio', mode === 'audio' && !hosting);
    el.classList.toggle('is-host', !!hosting);
    if (hosting) {
      el.innerHTML =
        mode === 'audio'
          ? '<i class="fas fa-microphone"></i> HOSTING · VOICE'
          : '<i class="fas fa-video"></i> HOSTING · VIDEO';
    } else if (mode === 'audio') {
      el.innerHTML = '<i class="fas fa-microphone"></i> VOICE LIVE';
    } else {
      el.innerHTML = '<i class="fas fa-video"></i> VIDEO LIVE';
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
    const el = document.getElementById('giftCoinsBal');
    if (el) el.textContent = String(bal);
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
    const api =
      (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) ||
      (window.CONFIG && CONFIG.API_URL) ||
      'https://ap-sevces.onrender.com/api';
    return api.replace(/\/api\/?$/, '');
  }

  function connectSocket(type) {
    const token = localStorage.getItem('token');
    if (!token || typeof io === 'undefined') return null;

    if (liveSocket?.connected) return liveSocket;

    liveSocket = io(socketBase(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    liveSocket.on('live:state', (state) => {
      roomState = state;
      renderRoomState();
    });

    liveSocket.on('live:chat', (msg) => {
      appendChatMessage(msg);
    });

    liveSocket.on('live:gift', (gift) => {
      showWinBanner(gift);
      if (roomState) renderRoomState();
    });

    liveSocket.on('live:viewer_count', ({ viewers }) => {
      const el = document.getElementById('liveViewerCount');
      if (el) el.textContent = String(viewers);
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

    liveSocket.on('live:seat_response', (res) => {
      if (!res || isHost()) return;
      const me = currentUser();
      if (String(res.userId) !== String(me?.id)) return;
      if (res.accepted) toast('You got a seat — tap mic to speak', 'success');
      else toast('Seat request declined');
    });

    liveSocket.on('live:ended', () => {
      toast('This live has ended');
      setTimeout(exitRoom, 1200);
    });

    const user = currentUser();
    const ch = channelId();
    liveSocket.emit(
      'live:join',
      {
        channel: ch,
        type: type === 'live' ? 'live' : 'party',
        displayName: displayName(user),
        isHost: isHost(),
      },
      (res) => {
        if (res?.ok && res.state) {
          roomState = res.state;
          renderRoomState();
        }
      }
    );

    return liveSocket;
  }

  function leaveSocket() {
    if (liveSocket) {
      liveSocket.emit('live:leave');
      liveSocket.disconnect();
      liveSocket = null;
    }
  }

  /* ---------- Agora ---------- */
  let agoraClient = null;
  let localTracks = [];
  let agoraMode = 'live';
  const remoteUsers = new Map();

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
    try {
      return await API.post('/live/agora/token', {
        channel,
        role: asHost ? 'host' : 'audience',
      });
    } catch (e) {
      console.warn('[live] token', e);
      try {
        const cfg = await API.get('/live/agora/config');
        return { mode: 'mock', appId: cfg?.appId, channel };
      } catch (_e2) {
        return { mode: 'mock', channel };
      }
    }
  }

  function showApLoader(text) {
    const loader = document.getElementById('apLiveLoader');
    const txt = document.getElementById('apLiveLoaderText');
    if (txt && text) txt.textContent = text;
    if (loader) loader.classList.remove('is-hidden');
  }

  function hideApLoader() {
    const loader = document.getElementById('apLiveLoader');
    if (loader) loader.classList.add('is-hidden');
  }

  function setLiveStatus(text, ok) {
    const el = document.getElementById('liveStatusBadge');
    if (el) {
      el.textContent = text;
      el.classList.toggle('is-ok', !!ok);
      el.classList.toggle('is-err', ok === false);
    }
    const loaderTxt = document.getElementById('apLiveLoaderText');
    if (loaderTxt && text) loaderTxt.textContent = text;
    if (ok === true) hideApLoader();
    else if (ok === false) {
      hideApLoader();
      toast(text, 'error');
    }
  }

  async function startAgora(mode) {
    agoraMode = mode || 'live';
    const ch = channelId();
    const host = isHost();
    showApLoader(host ? 'Starting your broadcast…' : 'Connecting to live…');
    setLiveStatus('Connecting…', null);

    let cred;
    try {
      cred = await fetchAgoraToken(ch, host);
    } catch (e) {
      setLiveStatus('Login required for live', false);
      return;
    }

    const appId = cred?.appId;
    if (!appId) {
      setLiveStatus('Add Agora keys on server', false);
      if (host && mode === 'live') {
        if (broadcastMode === 'audio') applyLiveBackground('audio', displayName(currentUser()));
        else await startLocalPreviewOnly();
      }
      return;
    }

    try {
      const AgoraRTC = await loadAgoraScript();
      if (agoraClient) {
        try {
          await agoraClient.leave();
        } catch (_e) {}
      }

      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      const uid = cred.uid != null ? cred.uid : null;
      const token = cred.token || null;

      await agoraClient.join(appId, cred.channel || ch, token, uid);

      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
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
        }
        if (mediaType === 'audio') {
          if (soundOn) user.audioTrack?.play();
          else user.audioTrack?.stop();
        }
        remoteUsers.set(user.uid, user);
      });

      agoraClient.on('user-unpublished', (user) => {
        remoteUsers.delete(user.uid);
        const container = document.getElementById('liveRemoteHost');
        if (container && remoteUsers.size === 0) {
          container.innerHTML = '';
          if (!isHost()) applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
        }
      });

      if (host) {
        if (mode === 'party') {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          localTracks = [audioTrack];
          await agoraClient.publish(audioTrack);
          setLiveStatus('Party voice live', true);
        } else if (broadcastMode === 'audio') {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          localTracks = [audioTrack];
          await agoraClient.publish(audioTrack);
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) localBox.style.display = 'none';
          const fallback = document.getElementById('liveLocalVideo');
          if (fallback) fallback.style.display = 'none';
          applyLiveBackground('audio', displayName(currentUser()));
          setLiveStatus('Audio live', true);
        } else {
          const root = document.getElementById('liveRoomRoot');
          if (root) root.classList.remove('is-audio-mode');
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          localTracks = [audioTrack, videoTrack];
          await agoraClient.publish([audioTrack, videoTrack]);
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) {
            localBox.style.display = '';
            videoTrack.play(localBox);
          }
          const fallback = document.getElementById('liveLocalVideo');
          if (fallback) fallback.style.display = 'none';
          const bg = document.getElementById('liveBg');
          if (bg) bg.style.display = 'none';
          setLiveStatus('Video live', true);
        }
      } else {
        setLiveStatus('Watching live', true);
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
      }
    } catch (err) {
      console.warn('[live] Agora', err);
      setLiveStatus('Camera/mic blocked or Agora error', false);
      if (host && mode === 'live') {
        if (broadcastMode === 'audio') applyLiveBackground('audio', displayName(currentUser()));
        else await startLocalPreviewOnly();
      } else {
        applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
      }
    }
  }

  async function restartAgoraForMode() {
    await stopAgora();
    const page = document.body.dataset.livePage;
    await startAgora(page === 'party-room' ? 'party' : 'live');
  }

  async function startLocalPreviewOnly(hostPreview) {
    const video = document.getElementById('liveLocalVideo');
    const box = document.getElementById('liveLocalHost');
    const bg = document.getElementById('liveBg');
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: hostPreview !== false,
        audio: true,
      });
      if (video) {
        video.srcObject = stream;
        video.style.display = 'block';
        video.muted = true;
        await video.play?.();
      }
      if (bg) bg.style.display = 'none';
      window.__apLocalStream = stream;
      if (!hostPreview && box) {
        /* audience: keep background stream image */
      }
    } catch (_e) {
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
    const btn = document.getElementById('liveBtnMic');
    if (btn) {
      btn.innerHTML = micMuted
        ? '<i class="fas fa-microphone-slash"></i>'
        : '<i class="fas fa-microphone"></i>';
      btn.classList.toggle('is-muted', micMuted);
    }
    toast(micMuted ? 'Microphone off' : 'Microphone on');
  }

  async function stopAgora() {
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
    if (window.__apLocalStream) {
      window.__apLocalStream.getTracks().forEach((t) => t.stop());
      window.__apLocalStream = null;
    }
  }

  /* ---------- UI: chat / seats / gifts ---------- */
  function shouldShowMsg(msg, tab) {
    if (tab === 'all') return true;
    if (tab === 'room') return msg.type === 'system';
    if (tab === 'chat') return msg.type !== 'system';
    return true;
  }

  function appendChatMessage(msg) {
    const feed = document.getElementById('partyChatFeed');
    if (!feed || !shouldShowMsg(msg, chatTab)) return;

    const div = document.createElement('div');
    if (msg.type === 'system') {
      div.className = 'party-chat-msg system';
      div.textContent = msg.text || msg.user + ' joined';
    } else {
      div.className = 'party-chat-msg';
      div.innerHTML = `<span class="lvl">${msg.lvl || 1}</span><span class="user">${escapeHtml(msg.user)}</span> ${escapeHtml(msg.text)}`;
    }
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    while (feed.children.length > 30) feed.removeChild(feed.firstChild);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderChatFromState() {
    const feed = document.getElementById('partyChatFeed');
    if (!feed || !roomState?.messages) return;
    feed.innerHTML = '';
    roomState.messages.forEach((m) => appendChatMessage(m));
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

    const totalSeats = 9;
    const centerIdx = 4;
    const slots = new Array(totalSeats).fill(null);
    slots[centerIdx] = host;
    let guestIdx = 0;
    for (let i = 0; i < totalSeats; i += 1) {
      if (i === centerIdx) continue;
      if (guestIdx < guests.length) {
        slots[i] = { ...guests[guestIdx], host: false };
        guestIdx += 1;
      } else {
        slots[i] = { empty: true, seatNum: i + 1 };
      }
    }

    container.innerHTML = slots
      .map((s, i) => {
        const seatNum = i + 1;
        if (!s || s.empty) {
          return `<button type="button" class="party-seat is-empty" data-join-seat data-seat-num="${seatNum}">
            <div class="seat-avatar seat-avatar--empty"><span class="seat-num">${seatNum}</span><span class="seat-plus">+</span></div>
            <span class="seat-name">Join</span></button>`;
        }
        const hostCls = s.host ? ' is-host' : '';
        const speaking = s.speaking ? ' is-speaking' : '';
        const mic = s.muted
          ? '<span class="mic-off"><i class="fas fa-microphone-slash"></i></span>'
          : s.host && hosting
            ? '<span class="mic-live"><i class="fas fa-microphone"></i></span>'
            : '';
        const crown = s.host ? '<span class="seat-crown">👑</span>' : '';
        return `
        <button type="button" class="party-seat${hostCls}${speaking}" data-seat="${seatNum}" data-user="${escapeHtml(s.name)}">
          <div class="seat-avatar">
            <span class="seat-num">${seatNum}</span>
            ${crown}
            <img src="${avatarUrl(s.name)}" alt="">
            ${mic}
          </div>
          <span class="seat-name">${escapeHtml(s.name)}</span>
          <span class="seat-gifts">🎁 ${formatGiftCount(s.gifts || 0)}</span>
        </button>`;
      })
      .join('');

    container.querySelectorAll('.party-seat[data-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.user || btn.querySelector('.seat-name')?.textContent;
        openProfileSheet(name);
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

  function syncFollowUI() {
    const hostName = roomState?.hostName || 'Host';
    const hostId = roomState?.hostId || hostName;
    if (window.SocialInteractions?.isFollowing) {
      followed = SocialInteractions.isFollowing(hostId, hostName);
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
  }

  function renderRoomState() {
    const user = currentUser();
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostEl) hostEl.textContent = hostName.slice(0, 14) + (hostName.length > 14 ? '…' : '');
    if (hostImg) hostImg.src = avatarUrl(hostName);

    const vc = document.getElementById('liveViewerCount');
    if (vc && roomState) vc.textContent = String(roomState.viewers || (isHost() ? 1 : 0));
    const hearts = document.getElementById('partyHearts');
    if (hearts) hearts.textContent = String(roomState?.gifts?.length || 0);

    if (document.getElementById('partySeats')) renderPartySeats(hostName);
    renderChatFromState();
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
    if (rid) rid.textContent = '· ID:' + ch.slice(0, 10);
    const partyRid = document.getElementById('partyRoomId');
    if (partyRid) partyRid.textContent = 'ID:' + ch.slice(0, 10);

    const viewers = roomState?.viewers || 0;
    const popEl = document.getElementById('partyPopScore');
    if (popEl) popEl.textContent = viewers >= 100 ? '100+' : String(Math.max(viewers, 1));
    const pctEl = document.getElementById('partyPopPct');
    if (pctEl) pctEl.textContent = (10 + (viewers % 20)).toFixed(2) + '%';

    const railAvatar = document.getElementById('liveRailAvatar');
    if (railAvatar) railAvatar.src = avatarUrl(hostName);
    const railLikes = document.getElementById('liveRailLikes');
    if (railLikes) railLikes.textContent = formatGiftCount((roomState?.gifts?.length || 0) * 120 + viewers * 3);
    const railComments = document.getElementById('liveRailComments');
    if (railComments) railComments.textContent = formatGiftCount((roomState?.messages?.length || 0) * 8 + 12);
    const railGifts = document.getElementById('liveRailGifts');
    if (railGifts) railGifts.textContent = formatGiftCount((roomState?.gifts?.length || 0) * 500 + 100);

    updateModeBadge(broadcastMode, isHost());
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
    if (liveSocket) {
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
    }
    toast('Request sent to host');
  }

  function bindHostControls(pageType) {
    const hostBar = document.getElementById(pageType === 'party' ? 'partyHostBar' : 'liveHostBar');
    if (hostBar && isHost()) hostBar.style.display = 'flex';

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
    const hostName = roomState?.hostName || 'Host';
    const page = document.body.dataset.livePage === 'party-room' ? 'party' : 'live';
    const shared = window.SocialUI?.shareLink
      ? await SocialUI.shareLink({
          title: `Join ${hostName} on AP Services`,
          text: `Join my ${page} room on AP Services`,
          url: location.href,
        })
      : false;
    if (!shared && !window.SocialUI) {
      try {
        await navigator.clipboard.writeText(location.href);
        toast('Link copied');
      } catch (_e) {
        toast('Could not share link');
      }
    }
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
      .map(
        (g, i) => `
      <button type="button" data-gift-idx="${i}" data-gift="${g.emoji}" data-cost="${g.cost}" class="${i === selectedGiftIdx ? 'is-selected' : ''}">
        <span class="g">${g.emoji}</span>
        <span>${g.name}</span>
        ${g.tag ? `<span class="gift-tag">${g.tag}</span>` : ''}
        <small>${g.cost} 🪙</small>
      </button>`
      )
      .join('');
    grid.querySelectorAll('[data-gift-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedGiftIdx = parseInt(btn.dataset.giftIdx, 10) || 0;
        grid.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
  }

  function openGiftSheet(targetName) {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    const to = targetName || roomState?.hostName || 'Host';
    sheet.dataset.to = to;
    delete sheet.dataset.toUserId;
    renderGiftRecipients(to);
    renderGiftGrid();
    refreshCoinDisplay();
    sheet.classList.add('open');
  }

  async function sendGiftViaApi(receiverId, cost, emoji, toName) {
    if (!window.SocialWallet) throw new Error('Wallet unavailable');
    await SocialWallet.sendGift({
      receiver_id: receiverId,
      coin_amount: cost,
      gift_type: emoji || 'gift',
      live_room_id: roomState?.roomId || undefined,
    });
    showWinBanner({ from: displayName(currentUser()), to: toName, emoji, amount: cost });
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
      showWinBanner({ from: displayName(currentUser()), to, emoji: g.emoji, amount: cost });
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
    document.getElementById('giftSheetClose')?.addEventListener('click', () => sheet.classList.remove('open'));
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) sheet.classList.remove('open');
    });
    document.getElementById('giftSendBtn')?.addEventListener('click', () => sendSelectedGift());
    document.querySelectorAll('.gift-sheet-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gift-sheet-tabs button').forEach((b) => b.classList.remove('active'));
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
      });
    });
  }

  function sendChat(text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (liveSocket) {
      liveSocket.emit('live:chat', { channel: channelId(), text: t, lvl: 2 });
    } else {
      appendChatMessage({
        type: 'chat',
        user: displayName(currentUser()),
        lvl: 2,
        text: t,
      });
    }
  }

  function bindChatTabs() {
    document.querySelectorAll('.party-chat-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.party-chat-tabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        chatTab = btn.dataset.tab || 'all';
        renderChatFromState();
        const compose = document.getElementById('liveChatCompose');
        if (compose) compose.classList.toggle('is-open', chatTab === 'chat' || chatTab === 'all');
      });
    });
  }

  function bindCommonControls(pageType) {
    document.getElementById('partyClose')?.addEventListener('click', exitRoom);
    document.getElementById('liveClose')?.addEventListener('click', exitRoom);

    document.getElementById('partyBtnTools')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.add('open');
    });
    document.getElementById('partyToolsClose')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
    });
    document.getElementById('partyToolsSheet')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyToolsSheet') e.target.classList.remove('open');
    });

    document.getElementById('partyBtnGift')?.addEventListener('click', () => openGiftSheet());
    document.getElementById('liveBtnGift')?.addEventListener('click', () => openGiftSheet());

    const toggleFollow = () => {
      const hostName = roomState?.hostName || 'Host';
      const hostId = roomState?.hostId || hostName;
      if (window.SocialInteractions?.toggleFollow) {
        followed = SocialInteractions.toggleFollow(hostId, hostName);
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
      toast(
        followed ? `You're now following ${hostName}` : `Unfollowed ${hostName}`,
        followed ? 'success' : 'info'
      );
    };
    document.getElementById('partyBtnFollow')?.addEventListener('click', toggleFollow);
    document.getElementById('partyHostFollow')?.addEventListener('click', toggleFollow);

    document.getElementById('liveBtnFollow')?.addEventListener('click', toggleFollow);

    document.getElementById('liveBtnMic')?.addEventListener('click', () => toggleMic());

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
      if (btn) btn.querySelector('i').className = soundOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    });

    document.getElementById('partyBtnShare')?.addEventListener('click', () => shareRoomLink());

    document.getElementById('partyBtnReport')?.addEventListener('click', () => {
      toast('Report submitted. Our team will review.');
    });

    document.getElementById('partyRuleBtn')?.addEventListener('click', openRulesModal);
    document.getElementById('partyBtnMinimize')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      toast('Room minimized — tap back to return');
    });
    document.getElementById('partyBtnGiftTools')?.addEventListener('click', () => {
      document.getElementById('partyToolsSheet')?.classList.remove('open');
      openGiftSheet();
    });

    document.getElementById('liveRailFollow')?.addEventListener('click', () => {
      document.getElementById('partyHostFollow')?.click() || document.getElementById('liveBtnFollow')?.click();
    });
    document.getElementById('liveRailGift')?.addEventListener('click', () => openGiftSheet());
    document.getElementById('liveRailLike')?.addEventListener('click', () => toast('❤️ Thanks for the like!'));
    document.getElementById('liveRailComment')?.addEventListener('click', () => {
      document.getElementById('liveChatInput')?.focus();
    });
    document.getElementById('liveRailShare')?.addEventListener('click', () => shareRoomLink());

    const chatSend = document.getElementById('liveChatSend');
    const chatInput = document.getElementById('liveChatInput');
    chatSend?.addEventListener('click', () => {
      sendChat(chatInput?.value);
      if (chatInput) chatInput.value = '';
    });
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChat(chatInput.value);
        chatInput.value = '';
      }
    });

    bindChatTabs();
    bindGiftSheet();

    setInterval(() => {
      chestSec = Math.max(0, chestSec - 1);
      const m = Math.floor(chestSec / 60);
      const s = chestSec % 60;
      const chestEl = document.getElementById('partyChestTimer');
      if (chestEl) chestEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }, 1000);

    setInterval(() => {
      if (Math.random() > 0.7 && teamProgress < 16) {
        teamProgress += 1;
        const teamEl = document.getElementById('partyTeamProgress');
        const bar = document.getElementById('partyTeamBar');
        if (teamEl) teamEl.textContent = teamProgress + '/16';
        if (bar) bar.style.width = Math.min(100, (teamProgress / 16) * 100) + '%';
      }
    }, 15000);
  }

  async function exitRoom() {
    await stopAgora();
    leaveSocket();
    if (history.length > 1) history.back();
    else {
      const back = document.body.dataset.livePage === 'party-room' ? '/party.html' : '/explore.html';
      location.href = back + '?app=1';
    }
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
        document.getElementById('apRulesModal')?.classList.remove('open');
        try { localStorage.setItem('ap_party_rules_seen', '1'); } catch (_e) {}
      });
      document.getElementById('apRulesModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'apRulesModal') e.target.classList.remove('open');
      });
    }
    if (!document.getElementById('apSeatSheet')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="ap-modal-overlay align-bottom" id="apSeatSheet">
          <div class="ap-seat-sheet-panel">
            <div class="ap-seat-badge">🪑</div>
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
            <div class="ap-profile-head">
              <img id="apProfileAvatar" src="" alt="">
              <div class="info">
                <h3 id="apProfileName">User</h3>
                <div class="ap-profile-badges">
                  <span>🇮🇳</span><span id="apProfileLvl">Lv.1</span><span>🎵 2</span><span>💎 4</span>
                </div>
                <p id="apProfileId" style="font-size:11px;color:#9ca3af;margin:4px 0 0">ID: —</p>
              </div>
            </div>
            <p style="font-size:12px;color:#6b7280;margin:0 0 8px"><strong>Gift Gallery</strong> · Lit: 0/12</p>
            <button type="button" class="ap-profile-gift-btn" id="apProfileGiftBtn">🎁 Give gifts</button>
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
    }
  }

  function openRulesModal() {
    document.getElementById('apRulesModal')?.classList.add('open');
  }

  function maybeShowPartyRules() {
    try {
      if (localStorage.getItem('ap_party_rules_seen') === '1') return;
    } catch (_e) {}
    setTimeout(openRulesModal, 1200);
  }

  function openSeatSheet(seatNum) {
    const title = document.getElementById('apSeatTitle');
    if (title) title.textContent = seatNum ? `Seat ${seatNum} · Empty` : 'Empty seat';
    document.getElementById('apSeatSheet')?.classList.add('open');
  }

  function openProfileSheet(name) {
    const n = name || 'User';
    const img = document.getElementById('apProfileAvatar');
    const nm = document.getElementById('apProfileName');
    const idEl = document.getElementById('apProfileId');
    if (img) img.src = avatarUrl(n);
    if (nm) nm.textContent = n;
    if (idEl) idEl.textContent = 'ID:' + String(n).split('').reduce((a, c) => a + c.charCodeAt(0), 0).toString().slice(0, 8);
    document.getElementById('apProfileSheet')?.classList.add('open');
  }

  function injectGiftSheet() {
    if (document.getElementById('giftSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="gift-sheet" id="giftSheet">
        <div class="gift-sheet-panel">
          <button type="button" class="gift-sheet-close" id="giftSheetClose"><i class="fas fa-times"></i></button>
          <div class="gift-recipients" id="giftRecipients"></div>
          <div class="gift-sheet-tabs">
            <button type="button" data-cat="new">New</button>
            <button type="button" data-cat="gift" class="active">Gift</button>
            <button type="button" data-cat="lucky">Lucky</button>
          </div>
          <p class="gift-balance">🪙 <span id="giftCoinsBal">0</span> &gt;</p>
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
          <a href="/coins-recharge.html?app=1" class="gift-recharge-link">Recharge coins</a>
        </div>
      </div>`
    );
    giftQty = 1;
    renderGiftGrid();
    refreshCoinDisplay();
  }

  function postWelcomeMessage() {
    const welcome = {
      type: 'system',
      text: 'Welcome to AP Services LIVE! Be respectful — admins monitor 24/7. Give a double-tap like to support the host!',
    };
    appendChatMessage(welcome);
  }

  async function initPartyRoom() {
    injectModals();
    injectGiftSheet();
    bindGiftSheet();
    const user = currentUser();
    if (!user) {
      toast('Please log in');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }

    bindCommonControls('party');
    bindHostControls('party');
    connectSocket('party');
    if (isHost()) {
      const followBtn = document.getElementById('partyBtnFollow');
      if (followBtn) followBtn.textContent = 'Your room';
      const hostFollow = document.getElementById('partyHostFollow');
      if (hostFollow) hostFollow.style.display = 'none';
      const hostLabel = document.getElementById('partyHostLabel');
      if (hostLabel) hostLabel.textContent = 'Hosting';
      const ticker = document.getElementById('partyTicker');
      if (ticker) ticker.textContent = 'You are hosting — share the link so friends can join';
    }
    await startAgora('party');
    postWelcomeMessage();
    maybeShowPartyRules();

    window.addEventListener('beforeunload', () => {
      stopAgora();
      leaveSocket();
    });
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
    if (items.length < 8 && window.SocialShell?.fetchPros) {
      const pros = await SocialShell.fetchPros(12);
      pros.forEach((p, i) => {
        const ch = String('live-' + (p.id || 'm' + i)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (!items.some((x) => x.channel === ch)) {
          items.push({
            channel: ch,
            hostName: p.name,
            hostId: p.userId || p.id,
            viewers: p.viewers || 80 + i * 41,
            mode: i % 4 === 0 ? 'audio' : 'video',
            mock: true,
          });
        }
      });
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
    if (index === activeFeedIndex && roomState && !feedItems[index].mock) return;
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
    const feed = document.getElementById('partyChatFeed');
    if (feed) feed.innerHTML = '';

    await stopAgora();
    leaveSocket();
    connectSocket('live');
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

    initBroadcastMode();
    bindCommonControls('live');
    bindHostControls('live');
    connectSocket('live');

    applyLiveBackground(broadcastMode === 'audio' ? 'audio' : 'live', roomState?.hostName);
    if (broadcastMode === 'audio') {
      document.getElementById('liveRoomRoot')?.classList.add('is-audio-mode');
    }
    updateModeBadge(broadcastMode, isHost());

    await startAgora('live');
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
      location.href = '/live-application.html?kind=live&mode=video&app=1';
    });

    document.getElementById('streamerStartParty')?.addEventListener('click', () => {
      location.href = '/live-application.html?kind=party&app=1';
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
    let selected = amounts[1];
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
        if (window.SocialUI) SocialUI.showSuccess('Recharge submitted', 'Coins will be added after admin verification — usually within a few hours.');
        else toast('Recharge submitted! Awaiting verification.', 'success');
        location.href = '/store.html?app=1';
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
  };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body?.dataset?.livePage;
    if (page === 'party-room') initPartyRoom();
    if (page === 'live-room') initLiveRoom();
    if (page === 'lucky-gifts') initLuckyGifts();
    if (page === 'streamer-center') initStreamerCenter();
    if (page === 'coins-recharge') initCoinsRecharge();
  });
})();
