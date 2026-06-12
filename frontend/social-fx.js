/**
 * AP Live FX Engine — gifts, combos, PK, engagement animations
 * Web stack: CSS + Canvas + optional lottie-web (CDN)
 */
(function () {
  const PREMIUM_KEYWORDS = /yacht|lion|dragon|palace|rocket|car|crown|voyage|nebula|isle|elf|fireworks/i;
  const PREMIUM_EMOJI = new Set(['🛥️', '🦁', '🐉', '🏝️', '🚀', '🏎️', '👑', '🎆', '🌌', '🧚', '🔥', '🏆']);
  const SMALL_EMOJI = new Set(['🌹', '❤️', '👋', '☕', '🍒', '⭐', '👍', '💐', '🍋', '🥝']);

  const COMBO_WINDOW_MS = 3000;
  const COMBO_MULTIPLIERS = [1, 5, 10, 20, 50, 100];

  let fxRoot = null;
  let activityRail = null;
  let comboState = { key: '', count: 0, timer: null, multiplier: 1 };
  let comboBadgeEl = null;
  let lastViewerCount = 0;
  let speakingUsers = new Set();
  let lottieLoaded = false;
  let sessionGiftTotal = 0;

  const LOTTIE_URLS = {
    rocket: 'https://lottie.host/6e5c0b3e-8c8a-4e0e-9f3a-1b2c3d4e5f6a/7xK9mNpQr.json',
    confetti: 'https://assets2.lottiefiles.com/packages/lf20_u4yrau.json',
  };

  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || 12);
    } catch (_e) {}
  }

  function playSound(kind) {
    try {
      const ctx = window.__apAudioCtx || (window.__apAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (kind === 'gift-small') {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (kind === 'gift-premium') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (kind === 'combo') {
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(990, now + 0.06);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (kind === 'pk') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (_e) {}
  }

  function loadLottie() {
    if (lottieLoaded || window.lottie) {
      lottieLoaded = true;
      return Promise.resolve(window.lottie);
    }
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
      s.onload = () => {
        lottieLoaded = true;
        resolve(window.lottie);
      };
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  function ensureRoot() {
    if (fxRoot) return fxRoot;
    fxRoot = document.createElement('div');
    fxRoot.id = 'apFxRoot';
    document.body.appendChild(fxRoot);

    activityRail = document.createElement('div');
    activityRail.className = 'ap-activity-rail';
    activityRail.id = 'apActivityRail';
    document.body.appendChild(activityRail);

    document.querySelectorAll(
      '.party-bottom-bar button, .party-follow-btn, .gift-send-btn, .party-close, .party-seat, .gift-grid button, .ap-topup-pack'
    ).forEach((el) => el.classList.add('ap-pressable'));

    return fxRoot;
  }

  function getGiftTier(gift) {
    const cost = Number(gift?.amount || gift?.cost) || 0;
    const emoji = gift?.emoji || '';
    const name = gift?.name || gift?.gift_type || '';
    if (cost >= 50000 || PREMIUM_EMOJI.has(emoji) || PREMIUM_KEYWORDS.test(name)) return 'premium';
    if (cost >= 500 || (!SMALL_EMOJI.has(emoji) && cost >= 100)) return 'medium';
    return 'small';
  }

  function getUserLevel(userId, giftSpend) {
    const spend = giftSpend || sessionGiftTotal || 0;
    const base = userId ? String(userId).length : 1;
    const lvl = Math.min(99, Math.max(1, Math.floor(spend / 5000) + base % 5 + 1));
    const isVip = spend >= 50000 || lvl >= 20;
    const isFan = spend >= 10000;
    return { level: lvl, isVip, isFan };
  }

  function levelBadgeHtml(lvl, opts) {
    const o = opts || {};
    let cls = 'lvl';
    if (o.isVip) cls += ' vip';
    else if (o.isFan) cls += ' fan';
    return `<span class="${cls}">${lvl}</span>`;
  }

  function confetti(opts) {
    const canvas = document.getElementById('apFxConfetti') || (() => {
      const c = document.createElement('canvas');
      c.id = 'apFxConfetti';
      document.body.appendChild(c);
      return c;
    })();
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = opts?.colors || ['#fbbf24', '#f472b6', '#22d3ee', '#a855f7', '#ef4444'];
    const count = opts?.count || 60;
    const particles = Array.from({ length: count }, () => ({
      x: canvas.width * (opts?.originX ?? 0.5),
      y: canvas.height * (opts?.originY ?? 0.4),
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -12 - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 3,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12,
    }));
    let frame = 0;
    const maxFrames = 90;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      frame += 1;
      if (frame < maxFrames) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(tick);
  }

  function screenShake() {
    document.body.classList.add('ap-screen-shake');
    setTimeout(() => document.body.classList.remove('ap-screen-shake'), 450);
  }

  function spawnFloaters(emoji, count, tier) {
    ensureRoot();
    const n = count || (tier === 'small' ? 6 : 10);
    for (let i = 0; i < n; i += 1) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'ap-float-gift';
        el.textContent = emoji || '❤️';
        const x = 20 + Math.random() * (window.innerWidth - 60);
        const y = window.innerHeight * (0.45 + Math.random() * 0.25);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.setProperty('--dx', (Math.random() - 0.5) * 60 + 'px');
        el.style.setProperty('--dx2', (Math.random() - 0.5) * 100 + 'px');
        if (tier === 'premium') el.style.fontSize = '48px';
        fxRoot.appendChild(el);
        setTimeout(() => el.remove(), 1900);
      }, i * 80);
    }
  }

  async function playPremiumOverlay(gift) {
    ensureRoot();
    const overlay = document.createElement('div');
    overlay.className = 'ap-premium-gift';
    const emoji = gift.emoji || '🎁';
    const from = gift.from || 'Someone';
    const amount = gift.amount || gift.cost || 0;

    overlay.innerHTML = `
      <div class="ap-lottie-wrap" id="apPremiumLottie"></div>
      <div class="ap-premium-emoji" style="display:none">${emoji}</div>
      <div class="ap-premium-meta">
        <div class="ap-premium-from">${escapeHtml(from)}</div>
        <div class="ap-premium-cost">sent ${emoji} · ${Number(amount).toLocaleString()} coins</div>
      </div>`;
    fxRoot.appendChild(overlay);

    const lottie = await loadLottie();
    const wrap = overlay.querySelector('#apPremiumLottie');
    const emojiEl = overlay.querySelector('.ap-premium-emoji');
    let usedLottie = false;
    if (lottie && wrap) {
      try {
        const anim = lottie.loadAnimation({
          container: wrap,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: LOTTIE_URLS.confetti,
        });
        anim.addEventListener('data_failed', () => {
          wrap.style.display = 'none';
          if (emojiEl) emojiEl.style.display = '';
        });
        usedLottie = true;
      } catch (_e) {
        wrap.style.display = 'none';
        if (emojiEl) emojiEl.style.display = '';
      }
    } else {
      wrap.style.display = 'none';
      if (emojiEl) emojiEl.style.display = '';
    }

    if (!usedLottie && emojiEl) emojiEl.style.display = '';

    screenShake();
    haptic([20, 40, 20]);
    playSound('gift-premium');
    confetti({ count: 80, originY: 0.5 });

    setTimeout(() => overlay.remove(), 3500);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function playGift(gift, opts) {
    if (!gift) return;
    ensureRoot();
    const tier = getGiftTier(gift);
    const emoji = gift.emoji || '🎁';
    const amount = Number(gift.amount || gift.cost) || 0;
    sessionGiftTotal += amount;

    pushActivity({
      type: 'gift',
      html: `<strong>${escapeHtml(gift.from || 'User')}</strong> sent ${emoji} ${amount ? `· ${amount.toLocaleString()}🪙` : ''}`,
    });

    if (tier === 'premium') {
      playPremiumOverlay(gift);
      spawnFloaters(emoji, 12, 'premium');
    } else if (tier === 'medium') {
      playSound('gift-small');
      haptic(10);
      spawnFloaters(emoji, 8, 'medium');
    } else {
      playSound('gift-small');
      spawnFloaters(emoji, 5, 'small');
    }

    if (opts?.combo && opts.combo >= 10) {
      const burst = document.createElement('div');
      burst.className = 'ap-combo-explosion';
      fxRoot.appendChild(burst);
      setTimeout(() => burst.remove(), 600);
      confetti({ count: 40, originX: 0.5, originY: 0.75 });
    }
  }

  function showComboBadge(multiplier, secondsLeft) {
    ensureRoot();
    if (comboBadgeEl) comboBadgeEl.remove();
    comboBadgeEl = document.createElement('div');
    comboBadgeEl.className = 'ap-combo-badge';
    comboBadgeEl.innerHTML = `COMBO x${multiplier}<span class="ap-combo-timer">${secondsLeft}s</span>`;
    document.body.appendChild(comboBadgeEl);
  }

  function hideComboBadge() {
    if (comboBadgeEl) {
      comboBadgeEl.remove();
      comboBadgeEl = null;
    }
  }

  function trackCombo(giftKey, qty) {
    const key = giftKey || 'gift';
    const now = Date.now();
    if (comboState.key === key && comboState.lastAt && now - comboState.lastAt < COMBO_WINDOW_MS) {
      comboState.count += qty || 1;
    } else {
      comboState.count = qty || 1;
      comboState.key = key;
    }
    comboState.lastAt = now;
    clearTimeout(comboState.timer);

    let multiplier = 1;
    for (let i = COMBO_MULTIPLIERS.length - 1; i >= 0; i -= 1) {
      if (comboState.count >= COMBO_MULTIPLIERS[i]) {
        multiplier = COMBO_MULTIPLIERS[i];
        break;
      }
    }
    comboState.multiplier = multiplier;

    const tick = () => {
      const left = Math.max(0, Math.ceil((COMBO_WINDOW_MS - (Date.now() - comboState.lastAt)) / 1000));
      if (left <= 0) {
        hideComboBadge();
        return;
      }
      showComboBadge(multiplier, left);
      comboState.timer = setTimeout(tick, 200);
    };
    tick();

    if (multiplier >= 10) {
      playSound('combo');
      haptic([8, 8, 8]);
    }

    return multiplier;
  }

  function pushActivity(event) {
    if (!activityRail) ensureRoot();
    if (!activityRail) return;
    const el = document.createElement('div');
    el.className = 'ap-activity-item' + (event.type ? ' is-' + event.type : '');
    el.innerHTML = event.html || event.text || '';
    activityRail.appendChild(el);
    while (activityRail.children.length > 4) activityRail.firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }

  function showJoinBanner(user) {
    ensureRoot();
    const name = user?.name || user?.displayName || 'Viewer';
    const isVip = user?.vip || user?.level >= 20;
    const banner = document.createElement('div');
    banner.className = 'ap-entry-banner' + (isVip ? ' vip' : '');
    const imgSrc =
      user?.avatar ||
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="#7c3aed" width="64" height="64"/><text x="50%" y="54%" text-anchor="middle" fill="#fff" font-size="24">${name[0] || 'U'}</text></svg>`)}`;
    banner.innerHTML = `<img src="${imgSrc}" alt=""><span class="ap-entry-text">${isVip ? '⭐ VIP ' : ''}${escapeHtml(name)} joined</span>`;
    fxRoot.appendChild(banner);
    pushActivity({ type: 'join', html: `<strong>${escapeHtml(name)}</strong> joined the room` });
    setTimeout(() => banner.remove(), 2400);
  }

  function showFollowBurst(anchorEl) {
    ensureRoot();
    const rect = anchorEl?.getBoundingClientRect?.();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    for (let i = 0; i < 12; i += 1) {
      const h = document.createElement('div');
      h.className = 'ap-follow-heart';
      h.textContent = '❤️';
      h.style.left = cx + 'px';
      h.style.top = cy + 'px';
      const angle = (i / 12) * Math.PI * 2;
      h.style.setProperty('--fx', Math.cos(angle) * 50 + 'px');
      h.style.setProperty('--fy', Math.sin(angle) * 50 - 20 + 'px');
      fxRoot.appendChild(h);
      setTimeout(() => h.remove(), 700);
    }
    if (anchorEl) {
      anchorEl.classList.add('ap-follow-pop');
      setTimeout(() => anchorEl.classList.remove('ap-follow-pop'), 450);
    }
    haptic([6, 12, 6]);
    confetti({ count: 30, originX: cx / window.innerWidth, originY: cy / window.innerHeight });
    pushActivity({ type: 'follow', html: '<strong>+1 Follower</strong> 🎉' });
  }

  function spawnLike(x, y) {
    ensureRoot();
    const hearts = ['❤️', '💖', '💕', '🩷', '💗'];
    for (let i = 0; i < 5; i += 1) {
      const el = document.createElement('div');
      el.className = 'ap-like-heart';
      el.textContent = hearts[i % hearts.length];
      el.style.left = x + (Math.random() - 0.5) * 40 + 'px';
      el.style.top = y + 'px';
      el.style.setProperty('--lx', (Math.random() - 0.5) * 30 + 'px');
      fxRoot.appendChild(el);
      setTimeout(() => el.remove(), 1400);
    }
    haptic(4);
  }

  function animateBalance(el, fromVal, toVal) {
    if (!el) return;
    const from = Number(fromVal) || 0;
    const to = Number(toVal) || 0;
    if (from === to) return;
    el.classList.add(to < from ? 'ap-balance-shake' : 'ap-balance-bump');
    const duration = 400;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      el.textContent = String(v);
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = String(to);
        setTimeout(() => el.classList.remove('ap-balance-bump', 'ap-balance-shake'), 300);
      }
    }
    requestAnimationFrame(step);
  }

  function coinFly(fromEl, toEl, amount) {
    ensureRoot();
    const from = fromEl?.getBoundingClientRect?.();
    const to = toEl?.getBoundingClientRect?.();
    if (!from || !to) return;
    const n = Math.min(8, Math.max(3, Math.floor((amount || 100) / 500)));
    for (let i = 0; i < n; i += 1) {
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'ap-coin-particle';
        c.textContent = '🪙';
        c.style.left = from.left + from.width / 2 + 'px';
        c.style.top = from.top + 'px';
        c.style.setProperty('--tx', to.left - from.left + (Math.random() - 0.5) * 20 + 'px');
        c.style.setProperty('--ty', to.top - from.top + 'px');
        fxRoot.appendChild(c);
        setTimeout(() => c.remove(), 900);
      }, i * 50);
    }
  }

  function coinRain(count) {
    confetti({ count: count || 50, originY: 0.1, colors: ['#fbbf24', '#f59e0b', '#fcd34d'] });
    haptic([10, 20, 10, 20]);
    playSound('gift-premium');
  }

  function onViewerCountChange(newCount, prevCount) {
    const el = document.getElementById('liveViewerCount');
    if (el) {
      el.classList.add('ap-count-pop');
      setTimeout(() => el.classList.remove('ap-count-pop'), 350);
    }
    lastViewerCount = newCount;
  }

  function pkCountdown(seconds, onDone) {
    ensureRoot();
    playSound('pk');
    let n = seconds || 5;
    const overlay = document.createElement('div');
    overlay.className = 'ap-pk-countdown';
    fxRoot.appendChild(overlay);

    function tick() {
      if (n <= 0) {
        overlay.remove();
        if (onDone) onDone();
        return;
      }
      overlay.innerHTML = `<div class="ap-pk-countdown-num">${n}</div>`;
      haptic(15);
      playSound('pk');
      n -= 1;
      setTimeout(tick, 900);
    }
    tick();
  }

  let pkAnimLeft = 0;
  let pkAnimRight = 0;

  function pkScoreUpdate(left, right) {
    pkAnimLeft = Number(left) || 0;
    pkAnimRight = Number(right) || 0;
    const total = pkAnimLeft + pkAnimRight || 1;
    const leftPct = Math.round((pkAnimLeft / total) * 100);
    const bar = document.getElementById('apPkBarLeft');
    const scoreL = document.getElementById('apPkScoreLeft');
    const scoreR = document.getElementById('apPkScoreRight');
    if (bar) {
      bar.classList.add('ap-pk-bar-fill');
      bar.style.width = leftPct + '%';
    }
    if (scoreL) scoreL.textContent = String(pkAnimLeft);
    if (scoreR) scoreR.textContent = String(pkAnimRight);

    if (pkAnimLeft + pkAnimRight > 0) {
      const burst = document.createElement('div');
      burst.className = 'ap-combo-explosion';
      burst.style.bottom = '45%';
      burst.style.width = '80px';
      burst.style.height = '80px';
      burst.style.marginLeft = '-40px';
      ensureRoot().appendChild(burst);
      setTimeout(() => burst.remove(), 500);
    }
  }

  function pkWinner(winnerSide, winnerName) {
    ensureRoot();
    const overlay = document.createElement('div');
    overlay.className = 'ap-pk-winner-overlay' + (winnerSide === 'loser' ? ' loser' : '');
    overlay.innerHTML = `
      <div class="ap-pk-winner-crown">${winnerSide === 'loser' ? '😢' : '👑'}</div>
      <div class="ap-pk-winner-text">${winnerSide === 'loser' ? 'Defeat' : 'WINNER'}${winnerName ? ' · ' + escapeHtml(winnerName) : ''}</div>`;
    fxRoot.appendChild(overlay);
    if (winnerSide !== 'loser') {
      confetti({ count: 100 });
      haptic([30, 20, 40]);
      playSound('gift-premium');
    }
    setTimeout(() => overlay.remove(), 4000);
  }

  function setSpeaking(userId, active) {
    if (active) speakingUsers.add(String(userId));
    else speakingUsers.delete(String(userId));
    document.querySelectorAll('.party-seat[data-user]').forEach((seat) => {
      const name = seat.dataset.user || '';
      const uid = seat.dataset.userId || name;
      const isActive = speakingUsers.has(String(uid)) || speakingUsers.has(name);
      seat.classList.toggle('is-speaking', isActive);
      let waves = seat.querySelector('.seat-wave-bars');
      if (isActive && !waves) {
        const av = seat.querySelector('.seat-avatar');
        if (av) {
          waves = document.createElement('div');
          waves.className = 'seat-wave-bars';
          waves.innerHTML = '<span></span><span></span><span></span><span></span>';
          av.appendChild(waves);
        }
      }
      if (!isActive && waves) waves.remove();
    });
  }

  function bindDoubleTapLike(target) {
    if (!target || target.dataset.likeBound) return;
    target.dataset.likeBound = '1';
    let lastTap = 0;
    target.addEventListener(
      'touchend',
      (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
          const t = e.changedTouches[0];
          spawnLike(t.clientX, t.clientY);
          pushActivity({ type: 'join', html: '<strong>❤️</strong> sent likes' });
        }
        lastTap = now;
      },
      { passive: true }
    );
    target.addEventListener('dblclick', (e) => {
      spawnLike(e.clientX, e.clientY);
    });
  }

  function initAgoraVolumeIndicator(client, uid) {
    if (!client?.on) return;
    try {
      client.on('volume-indicator', (volumes) => {
        volumes.forEach((v) => {
          const id = v.uid === 0 ? uid : String(v.uid);
          setSpeaking(id, v.level > 8);
        });
      });
      client.enableAudioVolumeIndicator?.();
    } catch (_e) {}
  }

  function chestReward() {
    const chest = document.querySelector('.party-widget-chest');
    if (chest) {
      chest.classList.add('ap-chest-reward');
      setTimeout(() => chest.classList.remove('ap-chest-reward'), 600);
    }
    coinRain(35);
    pushActivity({ type: 'gift', html: '<strong>Treasure opened!</strong> +coins 🎁' });
  }

  function enrichGiftCatalogItem(item) {
    const tier = getGiftTier(item);
    return { ...item, tier };
  }

  window.SocialFX = {
    init: ensureRoot,
    playGift,
    trackCombo,
    getGiftTier,
    getUserLevel,
    levelBadgeHtml,
    pushActivity,
    showJoinBanner,
    showFollowBurst,
    spawnLike,
    animateBalance,
    coinFly,
    coinRain,
    onViewerCountChange,
    pkCountdown,
    pkScoreUpdate,
    pkWinner,
    setSpeaking,
    bindDoubleTapLike,
    initAgoraVolumeIndicator,
    chestReward,
    enrichGiftCatalogItem,
    confetti,
    screenShake,
    haptic,
    getComboMultiplier: () => comboState.multiplier,
  };
})();
