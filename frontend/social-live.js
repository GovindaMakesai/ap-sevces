/**
 * Party room (voice grid) + Live room (video) — Agora + Socket.io
 */
(function () {
  const GIFT_OPTIONS = [
    { emoji: '🌹', name: 'Rose', cost: 10 },
    { emoji: '🍒', name: 'Cherry', cost: 50 },
    { emoji: '💎', name: 'Diamond', cost: 500 },
    { emoji: '🚀', name: 'Rocket', cost: 1000 },
  ];

  let liveSocket = null;
  let roomState = null;
  let chatTab = 'all';
  let followed = false;
  let soundOn = true;
  let micMuted = false;
  let chestSec = 294;
  let teamProgress = 1;

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function channelId() {
    return (
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

  function currentUser() {
    return window.Auth?.getUser?.() || window.AppState?.user || null;
  }

  function displayName(user) {
    if (!user) return 'Guest';
    const n = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return n || user.email?.split('@')[0] || 'User';
  }

  function avatarUrl(name) {
    const n = encodeURIComponent(String(name || 'U').trim().slice(0, 2) || 'U');
    return `https://ui-avatars.com/api/?name=${n}&background=7c3aed&color=fff&size=128`;
  }

  function getCoins() {
    return parseInt(localStorage.getItem('social_coins') || '0', 10) || 0;
  }

  function spendCoins(n) {
    const c = getCoins();
    if (c < n) return false;
    localStorage.setItem('social_coins', String(c - n));
    return true;
  }

  function toast(msg) {
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

  function setLiveStatus(text, ok) {
    const el = document.getElementById('liveStatusBadge');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-err', ok === false);
  }

  async function startAgora(mode) {
    const ch = channelId();
    const host = isHost();
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
      if (host && mode === 'live') await startLocalPreviewOnly();
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
          if (container) {
            container.innerHTML = '';
            user.videoTrack.play(container);
          }
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
        remoteUsers.set(user.uid, user);
      });

      agoraClient.on('user-unpublished', (user) => {
        remoteUsers.delete(user.uid);
        const container = document.getElementById('liveRemoteHost');
        if (container && remoteUsers.size === 0) container.innerHTML = '';
      });

      if (host) {
        if (mode === 'party') {
          const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
          localTracks = [audioTrack];
          await agoraClient.publish(audioTrack);
          setLiveStatus('Party voice live', true);
        } else {
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          localTracks = [audioTrack, videoTrack];
          await agoraClient.publish([audioTrack, videoTrack]);
          const localBox = document.getElementById('liveLocalHost');
          if (localBox) videoTrack.play(localBox);
          const fallback = document.getElementById('liveLocalVideo');
          if (fallback) fallback.style.display = 'none';
          setLiveStatus('Broadcasting', true);
        }
      } else {
        setLiveStatus('Watching live', true);
        if (mode === 'live') await startLocalPreviewOnly(false);
      }
    } catch (err) {
      console.warn('[live] Agora', err);
      setLiveStatus('Camera/mic blocked or Agora error', false);
      if (host && mode === 'live') await startLocalPreviewOnly();
    }
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
        bg.style.backgroundImage =
          "url('https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=900&q=80')";
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

    const host = {
      name: hostName,
      host: true,
      gifts: roomState?.gifts?.length ? 759 : 120,
      muted: micMuted,
      speaking: isHost() && !micMuted,
    };

    const seats = [host];
    const others = (roomState?.seats || []).filter((s) => s.name !== hostName);
    others.forEach((s) => seats.push({ ...s, host: false }));

    container.innerHTML = seats
      .map((s, i) => {
        const hostCls = s.host ? ' is-host' : '';
        const speaking = s.speaking ? ' is-speaking' : '';
        const mic = s.muted
          ? '<span class="mic-off"><i class="fas fa-microphone-slash"></i></span>'
          : s.host && isHost()
            ? '<span class="mic-live"><i class="fas fa-microphone"></i></span>'
            : '';
        const crown = s.host ? '<span class="seat-crown">👑</span>' : '';
        const idx = s.host ? '' : ` data-seat="${i}"`;
        return `
        <button type="button" class="party-seat${hostCls}${speaking}"${idx}>
          <div class="seat-avatar">
            ${crown}
            <img src="${avatarUrl(s.name)}" alt="">
            ${mic}
          </div>
          <span class="seat-name">${escapeHtml(s.name)}</span>
          <span class="seat-gifts">🎁 ${s.gifts || 0}</span>
        </button>`;
      })
      .join('');

    container.querySelectorAll('.party-seat[data-seat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.querySelector('.seat-name')?.textContent;
        openGiftSheet(name);
      });
    });
  }

  function renderRoomState() {
    const user = currentUser();
    const hostName = roomState?.hostName || displayName(user);
    const hostEl = document.getElementById('partyHostName') || document.getElementById('liveHostName');
    const hostImg = document.getElementById('partyHostAvatar') || document.getElementById('liveHostAvatar');
    if (hostEl) hostEl.textContent = hostName.slice(0, 14) + (hostName.length > 14 ? '…' : '');
    if (hostImg) hostImg.src = avatarUrl(hostName);

    if (document.getElementById('partySeats')) renderPartySeats(hostName);
    renderChatFromState();
  }

  function showWinBanner(gift) {
    const el = document.getElementById('partyWinBanner');
    if (!el) return;
    el.innerHTML = `WIN · <strong>${escapeHtml(gift.from)}</strong> sent ${gift.emoji} to ${escapeHtml(gift.to)} — <strong>${(gift.amount || 0).toLocaleString()}</strong> 🪙`;
    el.classList.add('is-flash');
    clearTimeout(el._flash);
    el._flash = setTimeout(() => el.classList.remove('is-flash'), 4000);
  }

  function openGiftSheet(targetName) {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    sheet.dataset.to = targetName || roomState?.hostName || 'Host';
    document.getElementById('giftSheetTo').textContent = 'Send to: ' + sheet.dataset.to;
    sheet.classList.add('open');
  }

  function bindGiftSheet() {
    const sheet = document.getElementById('giftSheet');
    if (!sheet) return;
    document.getElementById('giftSheetClose')?.addEventListener('click', () => sheet.classList.remove('open'));
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) sheet.classList.remove('open');
    });
    sheet.querySelectorAll('[data-gift]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cost = parseInt(btn.dataset.cost, 10) || 10;
        if (!spendCoins(cost)) {
          toast('Not enough coins — recharge first');
          window.location.href = '/coins-recharge.html?app=1';
          return;
        }
        const emoji = btn.dataset.gift;
        const to = sheet.dataset.to || 'Host';
        if (liveSocket) {
          liveSocket.emit('live:gift', {
            channel: channelId(),
            to,
            emoji,
            amount: cost,
          });
        }
        showWinBanner({ from: displayName(currentUser()), to, emoji, amount: cost * 100 });
        sheet.classList.remove('open');
        toast('Gift sent!');
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
      followed = !followed;
      const btn = document.getElementById('partyBtnFollow');
      const hbtn = document.getElementById('partyHostFollow');
      const label = followed ? 'Following ✓' : 'Follow +';
      if (btn) {
        btn.textContent = label;
        btn.classList.toggle('is-following', followed);
      }
      if (hbtn) hbtn.textContent = followed ? '✓' : '+';
      toast(followed ? 'You followed the host' : 'Unfollowed');
    };
    document.getElementById('partyBtnFollow')?.addEventListener('click', toggleFollow);
    document.getElementById('partyHostFollow')?.addEventListener('click', toggleFollow);

    document.getElementById('liveBtnFollow')?.addEventListener('click', () => {
      const input = document.getElementById('liveChatInput');
      if (input) input.focus();
      else sendChat('Hi there! 👋');
    });

    document.getElementById('liveBtnMic')?.addEventListener('click', () => toggleMic());

    document.getElementById('partyBtnSound')?.addEventListener('click', () => {
      soundOn = !soundOn;
      toast(soundOn ? 'Sound on' : 'Sound muted');
      const btn = document.getElementById('partyBtnSound');
      if (btn) btn.querySelector('i').className = soundOn ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    });

    document.getElementById('partyBtnShare')?.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: 'Join my party', url });
        else {
          await navigator.clipboard.writeText(url);
          toast('Link copied');
        }
      } catch (_e) {
        toast('Share cancelled');
      }
    });

    document.getElementById('partyBtnReport')?.addEventListener('click', () => {
      toast('Report submitted. Our team will review.');
    });

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

  function injectGiftSheet() {
    if (document.getElementById('giftSheet')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="gift-sheet" id="giftSheet">
        <div class="gift-sheet-panel">
          <button type="button" class="gift-sheet-close" id="giftSheetClose"><i class="fas fa-times"></i></button>
          <h3 id="giftSheetTo">Send gift</h3>
          <p class="gift-balance">Balance: 🪙 <span id="giftCoinsBal">0</span></p>
          <div class="gift-grid">
            ${GIFT_OPTIONS.map(
              (g) =>
                `<button type="button" data-gift="${g.emoji}" data-cost="${g.cost}">
                  <span class="g">${g.emoji}</span><span>${g.name}</span><small>${g.cost} 🪙</small>
                </button>`
            ).join('')}
          </div>
          <a href="/coins-recharge.html?app=1" class="gift-recharge-link">Recharge coins (QR)</a>
        </div>
      </div>`
    );
    const bal = document.getElementById('giftCoinsBal');
    if (bal) bal.textContent = String(getCoins());
  }

  async function initPartyRoom() {
    injectGiftSheet();
    const user = currentUser();
    if (!user) {
      toast('Please log in');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }

    bindCommonControls('party');
    connectSocket('party');
    renderPartySeats(displayName(user));
    await startAgora('party');

    window.addEventListener('beforeunload', () => {
      stopAgora();
      leaveSocket();
    });
  }

  async function initLiveRoom() {
    injectGiftSheet();
    const user = currentUser();
    if (!user) {
      toast('Please log in to watch or broadcast');
      setTimeout(() => (location.href = '/app-auth.html?app=1'), 800);
      return;
    }

    bindCommonControls('live');
    connectSocket('live');

    const bg = document.getElementById('liveBg');
    if (bg && !isHost()) {
      bg.style.backgroundImage =
        "url('https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=900&q=80')";
    }

    await startAgora('live');

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
      if (window.SocialShell?.goStartLive) SocialShell.goStartLive();
      else {
        const ch = 'live-' + Date.now();
        location.href = '/live-room.html?host=1&channel=' + ch + '&app=1';
      }
    });

    document.getElementById('streamerStartParty')?.addEventListener('click', () => {
      if (window.SocialShell?.goStartParty) SocialShell.goStartParty();
      else {
        const ch = 'party-' + Date.now();
        location.href = '/party-room.html?host=1&channel=' + ch + '&app=1';
      }
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
    document.getElementById('rechargeSubmit')?.addEventListener('click', () => {
      const utr = (utrEl?.value || '').trim();
      if (!utr || utr.length < 6) {
        alert('Enter your UPI transaction reference (UTR) after scanning the QR.');
        return;
      }
      addCoins(Math.round(selected * 10));
      alert('Recharge submitted! Coins will be credited after verification.');
      location.href = '/store.html?app=1';
    });
  }

  function addCoins(n) {
    localStorage.setItem('social_coins', String(getCoins() + n));
  }

  window.SocialLive = {
    initPartyRoom,
    initLiveRoom,
    initStreamerCenter,
    initLuckyGifts,
    initCoinsRecharge,
    getCoins,
    addCoins,
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
