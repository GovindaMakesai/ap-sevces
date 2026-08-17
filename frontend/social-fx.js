/**
 * AP Live FX Engine — premium cinematic gifts, combos, PK, engagement
 * Web stack: CSS transforms + Canvas particles + optional lottie-web (CDN)
 * Presentation only — does not touch wallet / gift APIs / sockets.
 */
(function () {
  const LEGENDARY_KEYWORDS =
    /yacht|lion|dragon|phoenix|palace|castle|jet|bugatti|ferrari|lamborghini|rolls|throne|kingdom|nebula|galaxy|universe|meteor|whale|mansion|penthouse|empire/i;
  const VIP_KEYWORDS = /crown|watch|diamond|sapphire|supercar|fireworks|necklace|bracelet|panther|tiger|horse/i;

  const COMBO_WINDOW_MS = 3200;
  const COMBO_MULTIPLIERS = [1, 5, 10, 20, 50, 100];

  let fxRoot = null;
  let activityRail = null;
  let comboState = { key: '', count: 0, timer: null, multiplier: 1, lastAt: 0 };
  let comboBadgeEl = null;
  let lastViewerCount = 0;
  let speakingUsers = new Set();
  let lottieLoaded = false;
  let sessionGiftTotal = 0;
  let activeGiftAnim = { key: '', combo: 0, el: null, tier: '' };
  let lastCinematicAt = 0;

  const LOTTIE_URLS = {
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
    const name = gift?.name || gift?.gift_type || '';
    if (cost >= 5000000 || LEGENDARY_KEYWORDS.test(name)) return 'legendary';
    if (cost >= 250000 || VIP_KEYWORDS.test(name)) return 'vip';
    if (cost >= 25000) return 'premium';
    if (cost >= 3000) return 'medium';
    return 'small';
  }

  function isCinematicTier(tier, cost) {
    return tier === 'legendary' || tier === 'vip' || Number(cost) >= 100000;
  }

  function hostTargetEl() {
    return (
      document.querySelector('.party-host .party-host-av, .party-host img, #partyHostAvatar, .live-host-avatar, .seat-avatar--host img') ||
      document.querySelector('.party-seat.is-host .seat-avatar, .party-seat[data-slot="1"] .seat-avatar')
    );
  }

  function pulseHostCelebration(intensity) {
    const host = hostTargetEl();
    if (!host) return;
    const wrap = host.closest('.party-host, .party-seat, .seat-avatar') || host;
    wrap.classList.remove('ap-host-gift-glow');
    void wrap.offsetWidth;
    wrap.classList.add('ap-host-gift-glow');
    if (intensity >= 20) wrap.classList.add('ap-host-gift-glow--vip');
    if (intensity >= 50) wrap.classList.add('ap-host-gift-glow--legend');
    setTimeout(() => {
      wrap.classList.remove('ap-host-gift-glow', 'ap-host-gift-glow--vip', 'ap-host-gift-glow--legend');
    }, intensity >= 50 ? 4200 : 2400);
  }

  function spawnSparkBurst(x, y, count, palette) {
    ensureRoot();
    const colors = palette || ['#fbbf24', '#fde68a', '#fff7ed', '#f59e0b'];
    const n = Math.min(36, Math.max(6, count || 12));
    for (let i = 0; i < n; i += 1) {
      const p = document.createElement('div');
      p.className = 'ap-lux-spark';
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dist = 40 + Math.random() * 90;
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
      fxRoot.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  function spawnCoinRainLuxury(opts) {
    ensureRoot();
    const o = opts || {};
    const count = Math.min(80, Math.max(12, o.count || 40));
    const kind = o.kind || 'gold';
    for (let i = 0; i < count; i += 1) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'ap-lux-rain ' + (kind === 'diamond' ? 'is-diamond' : kind === 'gem' ? 'is-gem' : 'is-gold');
        el.textContent = kind === 'diamond' ? '💎' : kind === 'gem' ? '💍' : '🪙';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.setProperty('--fall', 1.6 + Math.random() * 1.8 + 's');
        el.style.setProperty('--drift', (Math.random() - 0.5) * 80 + 'px');
        el.style.fontSize = 12 + Math.random() * 14 + 'px';
        fxRoot.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      }, i * 28);
    }
  }

  function cinematicTravel(gift, combo) {
    ensureRoot();
    const emoji = gift.emoji || '🎁';
    const amount = Number(gift.amount || gift.cost) || 0;
    const el = document.createElement('div');
    el.className = 'ap-cinematic-gift';
    if (combo >= 20) el.classList.add('is-zoom');
    if (combo >= 50) el.classList.add('is-lightning');
    if (combo >= 100) el.classList.add('is-legendary');
    el.innerHTML = `
      <div class="ap-cinematic-trail"></div>
      <div class="ap-cinematic-glow-ring"></div>
      <div class="ap-cinematic-orb">${emoji}</div>
      <div class="ap-cinematic-bloom"></div>`;
    fxRoot.appendChild(el);

    const host = hostTargetEl();
    const rect = host?.getBoundingClientRect?.();
    const tx = rect ? rect.left + rect.width / 2 : window.innerWidth * 0.5;
    const ty = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.28;
    el.style.setProperty('--land-x', tx + 'px');
    el.style.setProperty('--land-y', ty + 'px');

    setTimeout(() => {
      spawnSparkBurst(tx, ty, 10 + Math.min(24, Math.floor(amount / 5000)), ['#fbbf24', '#fde68a', '#fff']);
      pulseHostCelebration(combo || 1);
      if (amount >= 10000) spawnCoinRainLuxury({ count: 18, kind: 'gold' });
    }, 720);

    setTimeout(() => el.remove(), 1600);
    return el;
  }

  function upgradeComboFx(combo) {
    ensureRoot();
    if (comboBadgeEl) {
      comboBadgeEl.classList.remove('ap-combo-bump');
      void comboBadgeEl.offsetWidth;
      comboBadgeEl.classList.add('ap-combo-bump');
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.72;
    if (combo >= 5) spawnSparkBurst(cx, cy, 10 + combo / 2);
    if (combo >= 10) {
      document.body.classList.add('ap-combo-aura');
      setTimeout(() => document.body.classList.remove('ap-combo-aura'), 900);
    }
    if (combo >= 20) {
      document.body.classList.add('ap-combo-zoom');
      setTimeout(() => document.body.classList.remove('ap-combo-zoom'), 700);
    }
    if (combo >= 50) {
      const bolt = document.createElement('div');
      bolt.className = 'ap-combo-lightning';
      fxRoot.appendChild(bolt);
      setTimeout(() => bolt.remove(), 700);
      screenShake();
    }
    if (combo >= 100) {
      confetti({ count: 90, originY: 0.35, colors: ['#fbbf24', '#f59e0b', '#fff7ed', '#f472b6'] });
      spawnCoinRainLuxury({ count: 50, kind: 'diamond' });
      playSound('gift-premium');
    }
    pulseHostCelebration(combo);
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
        el.className = 'ap-float-gift' + (tier && tier !== 'small' ? ' is-tier-' + tier : '');
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

  async function playPremiumOverlay(gift, opts) {
    ensureRoot();
    const now = Date.now();
    /* Throttle overlapping full-screen cinematics */
    if (now - lastCinematicAt < 1800 && !opts?.force) return;
    lastCinematicAt = now;

    const emoji = gift.emoji || '🎁';
    const from = gift.from || 'Someone';
    const amount = Number(gift.amount || gift.cost) || 0;
    const tier = getGiftTier(gift);
    const duration = tier === 'legendary' ? 7200 : amount >= 1000000 ? 6000 : 4800;
    const motif = LEGENDARY_KEYWORDS.test(gift.name || gift.gift_type || '')
      ? String(gift.name || gift.gift_type || '').toLowerCase()
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'ap-premium-gift ap-cinematic-overlay';
    if (tier === 'legendary') overlay.classList.add('is-legendary');
    else if (tier === 'vip') overlay.classList.add('is-vip');

    let sceneClass = 'ap-scene-default';
    if (/dragon|phoenix/.test(motif)) sceneClass = 'ap-scene-dragon';
    else if (/yacht|jet|ferrari|lamborghini|bugatti|rolls|car/.test(motif)) sceneClass = 'ap-scene-vehicle';
    else if (/galaxy|universe|meteor|nebula|whale|portal/.test(motif)) sceneClass = 'ap-scene-cosmos';
    else if (/lion|tiger|panther|horse/.test(motif)) sceneClass = 'ap-scene-beast';
    else if (/firework|diwali|eid|valentine|christmas/.test(motif)) sceneClass = 'ap-scene-festive';
    else if (/castle|throne|palace|kingdom|mansion|penthouse/.test(motif)) sceneClass = 'ap-scene-royal';

    overlay.innerHTML = `
      <div class="ap-cinematic-bg ${sceneClass}"></div>
      <div class="ap-cinematic-particles" aria-hidden="true"></div>
      <div class="ap-lottie-wrap" id="apPremiumLottie"></div>
      <div class="ap-premium-emoji ap-cinematic-hero">${emoji}</div>
      <div class="ap-premium-meta">
        <div class="ap-premium-from">${escapeHtml(from)}</div>
        <div class="ap-premium-cost">sent ${emoji} · ${amount.toLocaleString()} coins</div>
      </div>`;
    fxRoot.appendChild(overlay);
    activeGiftAnim = { key: String(emoji), combo: opts?.combo || 1, el: overlay, tier };

    const particles = overlay.querySelector('.ap-cinematic-particles');
    if (particles) {
      for (let i = 0; i < 18; i += 1) {
        const d = document.createElement('i');
        d.style.left = Math.random() * 100 + '%';
        d.style.animationDelay = Math.random() * 2 + 's';
        d.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
        particles.appendChild(d);
      }
    }

    const lottie = await loadLottie();
    const wrap = overlay.querySelector('#apPremiumLottie');
    if (lottie && wrap && amount >= 500000) {
      try {
        lottie.loadAnimation({
          container: wrap,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: LOTTIE_URLS.confetti,
        });
      } catch (_e) {
        wrap.style.display = 'none';
      }
    } else if (wrap) {
      wrap.style.display = 'none';
    }

    screenShake();
    haptic([20, 40, 20, 40, 30]);
    playSound('gift-premium');
    confetti({
      count: tier === 'legendary' ? 120 : 70,
      originY: 0.45,
      colors: ['#fbbf24', '#f59e0b', '#fde68a', '#f472b6', '#22d3ee'],
    });
    spawnCoinRainLuxury({
      count: tier === 'legendary' ? 60 : 32,
      kind: amount >= 1000000 ? 'diamond' : 'gold',
    });
    pulseHostCelebration(tier === 'legendary' ? 100 : 50);
    audienceFlash(tier);

    setTimeout(() => {
      overlay.classList.add('is-out');
      setTimeout(() => {
        overlay.remove();
        if (activeGiftAnim.el === overlay) activeGiftAnim = { key: '', combo: 0, el: null, tier: '' };
      }, 420);
    }, duration);
  }

  function audienceFlash(tier) {
    ensureRoot();
    const flash = document.createElement('div');
    flash.className = 'ap-audience-flash' + (tier === 'legendary' ? ' is-legend' : '');
    fxRoot.appendChild(flash);
    setTimeout(() => flash.remove(), 900);
    if (tier === 'vip' || tier === 'legendary') {
      for (let i = 0; i < 8; i += 1) {
        setTimeout(() => {
          const h = document.createElement('div');
          h.className = 'ap-audience-heart';
          h.textContent = i % 2 ? '💖' : '✨';
          h.style.left = 10 + Math.random() * 80 + 'vw';
          h.style.bottom = '8%';
          fxRoot.appendChild(h);
          setTimeout(() => h.remove(), 1800);
        }, i * 90);
      }
    }
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
    const combo = Number(opts?.combo) || 1;
    const key = String(emoji);
    sessionGiftTotal += amount;

    if (!opts?.skipActivity) {
      pushActivity({
        type: 'gift',
        html: `<strong>${escapeHtml(gift.from || 'User')}</strong> sent ${emoji} ${amount ? `· ${amount.toLocaleString()} coins` : ''}`,
      });
    }

    /* Progressive combo upgrade — do not replay full cinematic */
    if (activeGiftAnim.key === key && combo > activeGiftAnim.combo && combo > 1) {
      activeGiftAnim.combo = combo;
      upgradeComboFx(combo);
      playSound('combo');
      return;
    }

    /* Mapped AnimStream gifts use GiftAnimationOverlay — skip competing full-screen cinematic */
    if (opts?.skipCinematic) {
      activeGiftAnim = { key, combo, el: null, tier: 'small' };
      spawnFloaters(emoji, 4, 'small');
      playSound('gift-small');
      return;
    }

    if (isCinematicTier(tier, amount)) {
      playPremiumOverlay(gift, { combo });
      if (combo < 5) cinematicTravel(gift, combo);
    } else if (tier === 'premium') {
      activeGiftAnim = { key, combo, el: null, tier };
      cinematicTravel(gift, combo);
      spawnFloaters(emoji, 10, 'premium');
      playSound('gift-premium');
      haptic(14);
      if (amount >= 25000) spawnCoinRainLuxury({ count: 20, kind: 'gold' });
      pulseHostCelebration(combo);
    } else if (tier === 'medium') {
      activeGiftAnim = { key, combo, el: null, tier };
      cinematicTravel(gift, combo);
      playSound('gift-small');
      haptic(10);
      spawnFloaters(emoji, 8, 'medium');
      pulseHostCelebration(combo);
    } else {
      activeGiftAnim = { key, combo, el: null, tier };
      cinematicTravel(gift, Math.max(1, combo));
      playSound('gift-small');
      spawnFloaters(emoji, 5, 'small');
    }

    if (combo >= 5 && combo < 100) upgradeComboFx(combo);

    if (combo >= 10) {
      const burst = document.createElement('div');
      burst.className = 'ap-combo-explosion';
      fxRoot.appendChild(burst);
      setTimeout(() => burst.remove(), 600);
      confetti({ count: 28 + Math.min(40, combo), originX: 0.5, originY: 0.75 });
    }
  }

  function showComboBadge(multiplier, secondsLeft, count) {
    ensureRoot();
    if (!comboBadgeEl) {
      comboBadgeEl = document.createElement('div');
      comboBadgeEl.className = 'ap-combo-badge ap-combo-lux';
      document.body.appendChild(comboBadgeEl);
    }
    const fire = multiplier >= 50 ? '⚡' : multiplier >= 10 ? '🔥' : '✨';
    comboBadgeEl.innerHTML = `
      <span class="ap-combo-fire">${fire}</span>
      <span class="ap-combo-x">x${count || multiplier}</span>
      <span class="ap-combo-label">Combo</span>
      <span class="ap-combo-timer">${secondsLeft}s</span>`;
    comboBadgeEl.classList.remove('ap-combo-bump');
    void comboBadgeEl.offsetWidth;
    comboBadgeEl.classList.add('ap-combo-bump');
    if (multiplier >= 20) comboBadgeEl.classList.add('is-gold');
    else comboBadgeEl.classList.remove('is-gold');
    if (multiplier >= 100) comboBadgeEl.classList.add('is-mythic');
    else comboBadgeEl.classList.remove('is-mythic');
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
      showComboBadge(multiplier, left, comboState.count);
      comboState.timer = setTimeout(tick, 200);
    };
    tick();

    if (multiplier >= 5) {
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

  function showJoinBanner(_user) {
    /* Join toasts disabled — they blocked the live view */
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
    spawnCoinRainLuxury({ count: count || 50, kind: 'gold' });
    confetti({ count: Math.min(60, count || 50), originY: 0.1, colors: ['#fbbf24', '#f59e0b', '#fcd34d'] });
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
    const isLoser = winnerSide === 'loser';
    const isDraw = winnerSide === 'draw';
    overlay.className =
      'ap-pk-winner-overlay' + (isLoser ? ' loser' : '') + (isDraw ? ' draw' : '');
    const title = isDraw ? 'DRAW' : isLoser ? 'Defeat' : 'WINNER';
    overlay.innerHTML = `
      <div class="ap-pk-winner-crown">${isDraw ? '🤝' : isLoser ? '😢' : '👑'}</div>
      <div class="ap-pk-winner-text">${title}${winnerName ? ' · ' + escapeHtml(winnerName) : ''}</div>`;
    fxRoot.appendChild(overlay);
    if (!isLoser && !isDraw) {
      confetti({ count: 100 });
      haptic([30, 20, 40]);
      playSound('gift-premium');
    }
    setTimeout(() => overlay.remove(), 4000);
  }

  function agoraUidToUserId(uid) {
    const map = window.__apAgoraUidMap || {};
    return map[String(uid)] || String(uid);
  }

  function setSpeaking(userId, active) {
    const id = agoraUidToUserId(userId);
    if (active) speakingUsers.add(String(id));
    else speakingUsers.delete(String(id));
    const applySpeaking = (seat, uid, name) => {
      const isActive = speakingUsers.has(String(uid)) || speakingUsers.has(name);
      seat.classList.toggle('is-speaking', isActive);
      let waves = seat.querySelector('.seat-wave-bars');
      if (isActive && !waves) {
        const av = seat.querySelector('.seat-avatar, .ap-guest-avatar');
        if (av) {
          waves = document.createElement('div');
          waves.className = 'seat-wave-bars';
          waves.innerHTML = '<span></span><span></span><span></span><span></span>';
          av.appendChild(waves);
        }
      }
      if (!isActive && waves) waves.remove();
    };
    document.querySelectorAll('.party-seat[data-user]').forEach((seat) => {
      applySpeaking(seat, seat.dataset.userId || '', seat.dataset.user || '');
    });
    document.querySelectorAll('.ap-guest-seat[data-guest-id]').forEach((seat) => {
      applySpeaking(seat, seat.dataset.guestId || '', seat.dataset.guest || '');
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
          const id = agoraUidToUserId(v.uid === 0 ? uid : v.uid);
          setSpeaking(id, v.level > 6);
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

  function resumeGiftCardAnimations(root) {
    const scope = root || document.getElementById('giftGrid');
    if (!scope) return;
    scope.querySelectorAll('.gift-card--alive').forEach((card) => {
      card
        .querySelectorAll('.gift-card-glow, .gift-card-shine, .g, .gift-card-sparkles i')
        .forEach((el) => {
          el.style.animation = 'none';
          void el.offsetHeight;
          el.style.removeProperty('animation');
        });
    });
  }

  function resumeLayerAnimations() {
    if (fxRoot) {
      fxRoot.querySelectorAll('.ap-cinematic-gift, .ap-float-gift, .ap-lux-rain, .ap-premium-gift').forEach((el) => {
        [el, ...el.querySelectorAll('*')].forEach((node) => {
          node.getAnimations?.().forEach((anim) => {
            if (anim.playState === 'paused') {
              try {
                anim.play();
              } catch (_e) {}
            }
          });
        });
      });
    }
    resumeGiftCardAnimations();
  }

  function bindGiftGridScrollFix() {
    const grid = document.getElementById('giftGrid');
    if (!grid || grid.dataset.scrollFxBound === '1') return;
    grid.dataset.scrollFxBound = '1';
    let scrollEndTimer;
    const onScrollEnd = () => {
      /* Removing is-scrolling resumes CSS animations — no forced reflow on every card */
      grid.classList.remove('is-scrolling');
    };
    grid.addEventListener(
      'scroll',
      () => {
        grid.classList.add('is-scrolling');
        clearTimeout(scrollEndTimer);
        scrollEndTimer = setTimeout(onScrollEnd, 120);
      },
      { passive: true }
    );
    grid.addEventListener(
      'touchend',
      () => {
        clearTimeout(scrollEndTimer);
        scrollEndTimer = setTimeout(onScrollEnd, 160);
      },
      { passive: true }
    );
  }

  function bindScrollAnimationResume() {
    if (document.body.dataset.fxScrollResumeBound === '1') return;
    document.body.dataset.fxScrollResumeBound = '1';
    let timer;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => resumeLayerAnimations(), 140);
    };
    document.getElementById('partyChatFeed')?.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('scroll', bump, { passive: true, capture: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindGiftGridScrollFix();
    bindScrollAnimationResume();
  });

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
    bindGiftGridScrollFix,
    resumeGiftCardAnimations,
    resumeLayerAnimations,
  };
})();
