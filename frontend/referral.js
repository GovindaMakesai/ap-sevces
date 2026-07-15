(function () {
  'use strict';

  const API = () => window.API;
  const state = {
    dashboard: null,
    missions: [],
    history: [],
    leaderboard: [],
    hostProgress: null,
    tab: 'invite',
  };

  function toast(msg) {
    let el = document.getElementById('refToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'refToast';
      el.className = 'ref-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function authHeaders() {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      (window.Auth?.getToken?.() || '');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api(path, opts = {}) {
    const clean = path.startsWith('/') ? path : '/' + path;
    if (window.API?.get && window.API?.request) {
      const method = (opts.method || 'GET').toUpperCase();
      if (method === 'GET') return API().get(clean);
      return API().request(clean, {
        method,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      });
    }
    const base = (window.CONFIG && window.CONFIG.API_URL) || window.AP_SERVICES_API_ROOT || '/api';
    const res = await fetch(String(base).replace(/\/$/, '') + clean, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
    return res.json();
  }

  function money(n) {
    const v = Number(n || 0);
    try {
      return v.toLocaleString();
    } catch (_e) {
      return String(v);
    }
  }

  function avatar(name, pic) {
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name || 'User', pic || null);
    if (pic) return pic;
    const n = encodeURIComponent(name || 'U');
    return `https://ui-avatars.com/api/?name=${n}&background=312e81&color=fff`;
  }

  function spawnParticles() {
    const root = document.getElementById('refParticles');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    for (let i = 0; i < 28; i += 1) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + '%';
      s.style.animationDuration = 8 + Math.random() * 12 + 's';
      s.style.animationDelay = Math.random() * 8 + 's';
      s.style.width = s.style.height = 2 + Math.random() * 4 + 'px';
      root.appendChild(s);
    }
  }

  function renderQr(text) {
    const host = document.getElementById('refQr');
    if (!host || !text) return;
    host.innerHTML = '';
    if (typeof window.QRCode === 'function') {
      try {
        // qrcodejs constructor API
        // eslint-disable-next-line no-new
        new window.QRCode(host, {
          text: String(text),
          width: 200,
          height: 200,
          colorDark: '#111827',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel?.M,
        });
        return;
      } catch (_e) {
        /* fall through */
      }
    }
    fallbackQr(host, text);
  }

  function fallbackQr(host, text) {
    const img = document.createElement('img');
    img.alt = 'Referral QR';
    img.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text);
    host.appendChild(img);
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.ref-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.ref-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'panel-' + tab);
    });
    if (tab === 'missions') loadMissions();
    if (tab === 'history') loadHistory();
    if (tab === 'rank') loadLeaderboard();
    if (tab === 'host') loadHostProgress();
  }

  function renderDashboard() {
    const d = state.dashboard;
    if (!d) return;
    const inv = d.invitation || {};
    const codeEl = document.getElementById('refCode');
    const linkEl = document.getElementById('refLink');
    if (codeEl) codeEl.textContent = inv.code || '—';
    if (linkEl) linkEl.textContent = inv.webLink || inv.universalLink || '';
    renderQr(inv.qrPayload || inv.webLink || inv.universalLink);

    const t = d.totals || {};
    const r = d.rewards || {};
    setText('statTotal', money(t.total));
    setText('statPending', money(t.pending));
    setText('statValid', money(t.valid));
    setText('statRewards', money(r.total));
    setText('statToday', money(r.today));
    setText('statLifetime', money(d.lifetimeEarnings));

    const share = inv.shareTargets || {};
    const map = {
      refShareWa: share.whatsapp,
      refShareTg: share.telegram,
      refShareFb: share.facebook,
      refShareSms: share.sms,
    };
    Object.entries(map).forEach(([id, href]) => {
      const a = document.getElementById(id);
      if (a && href) a.href = href;
    });
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  async function loadDashboard() {
    const res = await api('/referral/dashboard');
    if (!res?.success) throw new Error(res?.message || 'Failed to load dashboard');
    state.dashboard = res.data;
    renderDashboard();
  }

  async function loadMissions() {
    const res = await api('/referral/missions');
    if (!res?.success) return;
    state.missions = res.data || [];
    const root = document.getElementById('missionList');
    if (!root) return;
    if (!state.missions.length) {
      root.innerHTML = '<div class="ref-empty">No missions yet</div>';
      return;
    }
    root.innerHTML = state.missions
      .map((row) => {
        const m = row.mission || {};
        const p = row.progress || {};
        const locked = row.locked;
        const pct = row.percent || 0;
        const status = locked ? 'locked' : p.status || 'in_progress';
        const pill =
          status === 'claimed'
            ? '<span class="ref-pill ok">Claimed</span>'
            : status === 'completed'
              ? '<span class="ref-pill ok">Ready</span>'
              : locked
                ? '<span class="ref-pill lock">Locked</span>'
                : '<span class="ref-pill warn">In progress</span>';
        const claim =
          status === 'completed'
            ? `<button type="button" class="ref-btn" data-claim="${m.id}">Claim ${money(m.reward_coins)} coins</button>`
            : '';
        return `<div class="ref-mission">
          <div class="ref-mission-top">
            <div><strong>${escapeHtml(m.title)}</strong><div style="font-size:11px;color:var(--ref-muted);margin-top:2px">${escapeHtml(m.description || '')}</div></div>
            <em>+${money(m.reward_coins)}</em>
          </div>
          <div class="ref-bar"><i style="width:${pct}%"></i></div>
          <div class="ref-mission-meta"><span>${money(p.progress_value || 0)} / ${money(m.target_value)} ${escapeHtml(m.target_unit || '')}</span>${pill}</div>
          ${claim}
        </div>`;
      })
      .join('');
    root.querySelectorAll('[data-claim]').forEach((btn) => {
      btn.addEventListener('click', () => claimMission(btn.dataset.claim, btn));
    });
  }

  async function claimMission(id, btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Claiming…';
    }
    try {
      const res = await api(`/referral/missions/${id}/claim`, { method: 'POST', body: {} });
      if (!res?.success) throw new Error(res?.message || 'Claim failed');
      toast(`+${money(res.data?.coins)} coins claimed`);
      await loadMissions();
      await loadDashboard();
    } catch (e) {
      toast(e.message || 'Claim failed');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Claim';
      }
    }
  }

  async function loadHistory() {
    const res = await api('/referral/history');
    if (!res?.success) return;
    state.history = res.data || [];
    const root = document.getElementById('historyList');
    if (!root) return;
    if (!state.history.length) {
      root.innerHTML = '<div class="ref-empty">No invites yet — share your code!</div>';
      return;
    }
    root.innerHTML = state.history
      .map((r) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Friend';
        const status = r.status || 'pending';
        return `<div class="ref-list-item">
          <img src="${avatar(name, r.profile_pic)}" alt="">
          <div class="meta"><strong>${escapeHtml(name)}</strong><span>ID ${escapeHtml(String(r.display_id || '—'))} · ${escapeHtml(r.invitee_type || 'new')}</span></div>
          <span class="ref-pill ${status === 'valid' || status === 'rewarded' ? 'ok' : status === 'fraud_hold' ? 'warn' : ''}">${escapeHtml(status)}</span>
        </div>`;
      })
      .join('');
  }

  async function loadLeaderboard() {
    const res = await api('/leaderboard/referral?period=weekly');
    if (!res?.success) return;
    state.leaderboard = res.data || [];
    const root = document.getElementById('rankList');
    if (!root) return;
    if (!state.leaderboard.length) {
      root.innerHTML = '<div class="ref-empty">Leaderboard is warming up</div>';
      return;
    }
    root.innerHTML = state.leaderboard
      .map((r) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Host';
        return `<div class="ref-list-item">
          <strong style="width:28px;text-align:center;color:var(--ref-gold)">#${r.rank}</strong>
          <img src="${avatar(name, r.profile_pic)}" alt="">
          <div class="meta"><strong>${escapeHtml(name)}</strong><span>${money(r.valid_invites)} valid · ${money(r.reward_coins)} coins</span></div>
        </div>`;
      })
      .join('');
  }

  async function loadHostProgress() {
    const res = await api('/host/progress');
    if (!res?.success) return;
    state.hostProgress = res.data;
    const s = res.data?.stats || {};
    const today = s.today || {};
    setText('hostTodayMin', Math.floor(Number(today.counted_seconds || 0) / 60));
    setText('hostWeekHrs', (Number(s.weekly_counted_seconds || 0) / 3600).toFixed(1));
    setText('hostMonthHrs', (Number(s.monthly_counted_seconds || 0) / 3600).toFixed(1));
    setText('hostCap', s.dailyCapHours || 3);
    const host = s.host || {};
    setText('hostGift', money(host.gift_income_coins));
    setText('hostMission', money(host.mission_reward_coins));
    setText('hostReferral', money(host.referral_reward_coins));
  }

  async function generate() {
    const res = await api('/referral/generate', { method: 'POST', body: {} });
    if (!res?.success) throw new Error(res?.message || 'Could not generate code');
    state.dashboard = state.dashboard || {};
    state.dashboard.invitation = res.data;
    renderDashboard();
    toast('Invite ready');
  }

  async function copyCode() {
    const code = document.getElementById('refCode')?.textContent || '';
    const link = state.dashboard?.invitation?.webLink || '';
    const text = link || code;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied!');
      await api('/referral/share', { method: 'POST', body: { target: 'copy' } }).catch(() => {});
    } catch (_e) {
      toast(text);
    }
  }

  async function applyCode() {
    const input = document.getElementById('refApplyInput');
    const code = (input?.value || '').trim();
    if (!code) return toast('Enter a code');
    const res = await api('/referral/apply', {
      method: 'POST',
      body: {
        code,
        device_fingerprint: localStorage.getItem('ap_device_fp') || undefined,
        platform: /android|iphone|ipad/i.test(navigator.userAgent) ? 'mobile' : 'web',
      },
    });
    if (!res?.success) return toast(res?.message || 'Could not apply code');
    toast(res.data?.alreadyBound ? 'Already linked' : 'Invite applied!');
    localStorage.removeItem('ap_pending_ref');
    await loadDashboard();
  }

  async function claimRewards() {
    const res = await api('/reward/claim', { method: 'POST', body: {} });
    if (!res?.success) return toast(res?.message || 'Nothing to claim');
    const n = (res.data?.paid || []).length;
    toast(n ? `Claimed ${n} reward(s)` : 'No pending rewards');
    await loadDashboard();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureDeviceFp() {
    if (localStorage.getItem('ap_device_fp')) return;
    const fp = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ap_device_fp', fp);
  }

  async function boot() {
    spawnParticles();
    ensureDeviceFp();
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref') || params.get('code');
    if (ref) localStorage.setItem('ap_pending_ref', ref);

    document.querySelectorAll('.ref-tabs button').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab));
    });
    document.getElementById('refCopyBtn')?.addEventListener('click', copyCode);
    document.getElementById('refApplyBtn')?.addEventListener('click', applyCode);
    document.getElementById('refClaimBtn')?.addEventListener('click', claimRewards);
    document.getElementById('refRegenBtn')?.addEventListener('click', () => generate().catch((e) => toast(e.message)));

    try {
      if (!window.Auth?.getUser?.() && !localStorage.getItem('token') && !localStorage.getItem('user')) {
        location.href = '/login.html?redirect=' + encodeURIComponent('/referral.html?app=1');
        return;
      }
      await loadDashboard();
      const pending = localStorage.getItem('ap_pending_ref');
      if (pending) {
        const input = document.getElementById('refApplyInput');
        if (input) input.value = pending;
      }
    } catch (e) {
      toast(e.message || 'Load failed');
      try {
        await generate();
      } catch (_e2) {}
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.ReferralUI = { setTab, loadDashboard, applyCode };
})();
