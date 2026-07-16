(function () {
  'use strict';

  const API = () => window.API;
  const state = {
    dashboard: null,
    history: [],
    leaderboard: [],
    tab: 'rewards',
    showAllHistory: false,
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
    try {
      if (window.API?.get && window.API?.request) {
        const method = (opts.method || 'GET').toUpperCase();
        if (method === 'GET') return await API().get(clean);
        return await API().request(clean, {
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
      return await res.json();
    } catch (e) {
      return { success: false, message: e.message || 'Network error' };
    }
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
    return `https://ui-avatars.com/api/?name=${n}&background=ff7a3d&color=fff`;
  }

  function showBootError(msg) {
    const el = document.getElementById('refBootError');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fixInviteHost(url) {
    return String(url || '').replace(/https?:\/\/[^/\s]*apservices\.live/gi, 'https://api.apservices.in');
  }

  function currentDisplayId() {
    const user = window.Auth?.getUser?.() || (() => {
      try {
        return JSON.parse(localStorage.getItem('user') || 'null');
      } catch (_e) {
        return null;
      }
    })();
    if (window.formatUserDisplayId) return formatUserDisplayId(user) || '—';
    return String(user?.display_id || user?.displayId || '—');
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.ref-seg button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.ref-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'panel-' + tab);
    });
    if (tab === 'rank') loadLeaderboard();
  }

  function openGuide() {
    const ov = document.getElementById('refGuideOverlay');
    if (!ov) return;
    ov.hidden = false;
    document.body.classList.add('ref-guide-open');
  }

  function closeGuide() {
    const ov = document.getElementById('refGuideOverlay');
    if (!ov) return;
    ov.hidden = true;
    document.body.classList.remove('ref-guide-open');
  }

  function withinLastDays(iso, days) {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    return Date.now() - t <= days * 24 * 60 * 60 * 1000;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_e) {
      return '';
    }
  }

  function statusPillClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'valid' || s === 'rewarded') return 'ok';
    if (s === 'fraud_hold' || s === 'invalid') return 'warn';
    return '';
  }

  function renderMyInviter() {
    const inv = state.dashboard?.myInviter;
    const banner = document.getElementById('refInviterBanner');
    if (!banner) return;
    if (!inv) {
      banner.hidden = true;
      return;
    }
    const name = inv.name || 'Inviter';
    const img = document.getElementById('refInviterAvatar');
    const nameEl = document.getElementById('refInviterName');
    const statusEl = document.getElementById('refInviterStatus');
    if (img) img.src = avatar(name, inv.profile_pic);
    if (nameEl) {
      nameEl.textContent = `${name} · ID ${inv.display_id || '—'}`;
    }
    if (statusEl) {
      statusEl.textContent = inv.status_label || 'Connected';
      statusEl.className = `ref-pill ${statusPillClass(inv.status)}`;
    }
    banner.hidden = false;
  }

  function renderTicker() {
    const wrap = document.getElementById('refTicker');
    const text = document.getElementById('refTickerText');
    if (!wrap || !text) return;
    const history = state.history || [];
    const rewarded = history.find((r) => String(r.status) === 'rewarded' && (r.reward_coins_paid || 0) > 0);
    if (rewarded) {
      const name = `${rewarded.first_name || ''} ${rewarded.last_name || ''}`.trim() || 'A friend';
      text.textContent = `Congratulations! ${name} connected — you earned ${money(rewarded.reward_coins_paid)} points`;
      wrap.hidden = false;
      return;
    }
    const recent = history.find((r) => ['valid', 'rewarded'].includes(String(r.status)));
    if (recent) {
      const name = `${recent.first_name || ''} ${recent.last_name || ''}`.trim() || 'A friend';
      text.textContent = `${name} joined through your invite — rewards unlock after verification`;
      wrap.hidden = false;
      return;
    }
    wrap.hidden = true;
  }

  function renderDashboard() {
    const d = state.dashboard;
    if (!d) return;
    const inv = d.invitation || {};
    const myId = currentDisplayId();
    setText('refMyId', myId);

    const bundle = buildShareBundle(inv);
    if (bundle.link) {
      inv.code = bundle.code;
      inv.webLink = bundle.link;
      inv.universalLink = bundle.link;
      inv.qrPayload = bundle.link;
      inv.shareMessage = bundle.shareMessage;
      inv.shareText = bundle.shareText;
    }

    const t = d.totals || {};
    const r = d.rewards || {};
    setText('statClaimed', money(r.total || d.lifetimeEarnings || 0));
    setText('statInvitees', money(t.total || 0));
    setText('statAvailable', money(r.pending || 0));
    setText('statWeekCount', String(d.weekInviteCount ?? 0));

    const receive = document.getElementById('refReceiveBtn');
    if (receive) receive.disabled = !(Number(r.pending) > 0);

    renderMyInviter();
    renderTicker();
    renderWeekHistory();
  }

  function inviteLinkOrigin(inv) {
    const candidate = fixInviteHost(inv?.webLink || inv?.universalLink || '');
    if (candidate) {
      try {
        return new URL(candidate).origin;
      } catch (_e) {
        /* fall through */
      }
    }
    return location.origin;
  }

  function dedupeShareText(message, link) {
    const cleanLink = String(link || '').trim();
    let text = String(message || '').trim();
    if (!cleanLink) return text;
    const escaped = cleanLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
    return text ? `${text}: ${cleanLink}` : cleanLink;
  }

  function buildShareBundle(inv) {
    const code = String(currentDisplayId()).replace(/[^\d]/g, '');
    if (!code || code === '—') {
      return { code: '', link: '', shareMessage: '', shareText: '', targets: {} };
    }
    const origin = inviteLinkOrigin(inv);
    const link = `${origin}/register.html?ref=${encodeURIComponent(code)}&app=1`;
    const shareMessage = `Join me on AP Services! Use my ID ${code} when you register`;
    const shareText = dedupeShareText(shareMessage, link);
    return {
      code,
      link,
      shareMessage,
      shareText,
      targets: {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareMessage)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
        sms: `sms:?body=${encodeURIComponent(shareText)}`,
      },
    };
  }

  function isLikelyInAppWebView() {
    const ua = navigator.userAgent || '';
    return (
      Boolean(window.ReactNativeWebView) ||
      Boolean(window.Capacitor) ||
      Boolean(window.cordova) ||
      /; wv\)|WebView|Instagram|FBAN|FBAV|Line\//i.test(ua)
    );
  }

  async function copyInviteText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || 'Invite copied');
      return true;
    } catch (_e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast(okMsg || 'Invite copied');
        return true;
      } catch (_e2) {
        window.prompt('Copy and share this invite:', text);
        return false;
      }
    }
  }

  async function inviteNow() {
    const inv = state.dashboard?.invitation || {};
    const bundle = buildShareBundle(inv);
    if (!bundle.code || bundle.code === '—') return toast('Your invite ID is not ready yet');

    api('/referral/share', { method: 'POST', body: { target: 'invite_now' } }).catch(() => {});

    if (window.ReactNativeWebView?.postMessage) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'share',
            title: 'Join AP Services',
            text: bundle.shareText,
          })
        );
        return;
      } catch (_e) { /* fall through */ }
    }

    if (navigator.share) {
      try {
        await navigator.share({ text: bundle.shareText });
        return;
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      }
    }

    await copyInviteText(bundle.shareText, 'Invite copied — share it with friends');
  }

  async function copyMyId() {
    const id = document.getElementById('refMyId')?.textContent || currentDisplayId();
    const text = String(id).replace(/[^\d]/g, '') || String(id);
    try {
      await navigator.clipboard.writeText(text);
      toast('ID copied');
      api('/referral/share', { method: 'POST', body: { target: 'copy_id' } }).catch(() => {});
    } catch (_e) {
      await copyInviteText(text, 'ID copied');
    }
  }

  async function loadDashboard() {
    const res = await api('/referral/dashboard');
    if (!res?.success) throw new Error(res?.message || 'Failed to load dashboard');
    state.dashboard = res.data;
    state.history = res.data?.history || [];
    renderDashboard();
  }

  function renderWeekHistory() {
    const root = document.getElementById('historyList');
    if (!root) return;
    const all = state.history || [];
    const week = all.filter((r) => withinLastDays(r.applied_at || r.created_at, 7));
    const rows = state.showAllHistory ? all : week;
    if (state.dashboard?.weekInviteCount != null) {
      setText('statWeekCount', String(state.dashboard.weekInviteCount));
    } else {
      setText('statWeekCount', String(week.length));
    }

    if (!rows.length) {
      root.innerHTML =
        '<div class="ref-empty-illu" aria-hidden="true">📭</div><p class="ref-empty">No invites yet — tap Invite Now to share your link</p>';
      return;
    }

    root.innerHTML = rows
      .map((r) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Friend';
        const status = r.status || 'pending';
        const label = r.status_label || status;
        const paid = Number(r.reward_coins_paid || 0);
        const pending = Number(r.reward_coins_pending || 0);
        const rewardLine =
          paid > 0
            ? `+${money(paid)} points received`
            : pending > 0
              ? `+${money(pending)} points to receive`
              : '';
        const hostTag = r.is_host ? ' · Host' : '';
        const when = formatDate(r.applied_at || r.created_at);
        return `<div class="ref-list-item">
          <img src="${avatar(name, r.profile_pic)}" alt="">
          <div class="meta">
            <strong>${escapeHtml(name)}</strong>
            <span>ID ${escapeHtml(String(r.display_id || '—'))}${hostTag} · ${escapeHtml(r.invitee_type || 'new')}</span>
            ${rewardLine ? `<span class="ref-invitee-reward">${escapeHtml(rewardLine)}</span>` : ''}
            ${when ? `<span class="ref-invitee-date">Joined ${escapeHtml(when)}</span>` : ''}
          </div>
          <span class="ref-pill ${statusPillClass(status)}">${escapeHtml(label)}</span>
        </div>`;
      })
      .join('');
  }

  async function loadHistoryFull() {
    const res = await api('/referral/history');
    if (!res?.success) return;
    state.history = res.data || [];
    renderWeekHistory();
  }

  async function loadLeaderboard() {
    const root = document.getElementById('rankList');
    if (!root) return;
    root.innerHTML = '<div class="ref-empty">Loading…</div>';
    const res = await api('/leaderboard/income?period=weekly');
    if (!res?.success) {
      // fallback to referral rank
      const alt = await api('/leaderboard/referral?period=weekly');
      if (!alt?.success) {
        root.innerHTML = '<div class="ref-empty">Leaderboard is warming up</div>';
        return;
      }
      state.leaderboard = alt.data || [];
      root.innerHTML = (state.leaderboard.length
        ? state.leaderboard
            .map((r) => {
              const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Host';
              return `<div class="ref-list-item">
                <strong style="width:28px;text-align:center;color:#ff6a2b">#${r.rank}</strong>
                <img src="${avatar(name, r.profile_pic)}" alt="">
                <div class="meta"><strong>${escapeHtml(name)}</strong><span>${money(r.valid_invites)} valid · ${money(r.reward_coins)} points</span></div>
              </div>`;
            })
            .join('')
        : '<div class="ref-empty">Leaderboard is warming up</div>');
      return;
    }
    state.leaderboard = res.data || [];
    if (!state.leaderboard.length) {
      root.innerHTML = '<div class="ref-empty">Leaderboard is warming up</div>';
      return;
    }
    root.innerHTML = state.leaderboard
      .map((r, i) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Host';
        const income =
          Number(r.host_income_coins || 0) ||
          Number(r.gift_income_coins || 0) +
            Number(r.mission_reward_coins || 0) +
            Number(r.referral_reward_coins || 0);
        return `<div class="ref-list-item">
          <strong style="width:28px;text-align:center;color:#ff6a2b">#${r.rank || i + 1}</strong>
          <img src="${avatar(name, r.profile_pic)}" alt="">
          <div class="meta"><strong>${escapeHtml(name)}</strong><span>${money(income)} income coins</span></div>
        </div>`;
      })
      .join('');
  }

  async function generate() {
    const res = await api('/referral/generate', { method: 'POST', body: {} });
    if (!res?.success) throw new Error(res?.message || 'Could not generate code');
    state.dashboard = state.dashboard || {};
    state.dashboard.invitation = res.data;
    renderDashboard();
    toast('Invite ready');
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
    toast(res.data?.alreadyBound ? 'Already connected to your inviter' : 'Connected to your inviter!');
    localStorage.removeItem('ap_pending_ref');
    await loadDashboard();
    await loadHistoryFull();
  }

  async function claimRewards() {
    const btn = document.getElementById('refReceiveBtn');
    if (btn) btn.disabled = true;
    const res = await api('/reward/claim', { method: 'POST', body: {} });
    if (!res?.success) {
      toast(res?.message || 'Nothing to claim');
      if (btn) btn.disabled = !(Number(state.dashboard?.rewards?.pending) > 0);
      return;
    }
    const n = (res.data?.paid || []).length;
    toast(n ? `Claimed ${n} reward(s) as points` : 'No pending rewards');
    await loadDashboard();
  }

  function ensureDeviceFp() {
    if (localStorage.getItem('ap_device_fp')) return;
    const fp = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ap_device_fp', fp);
  }

  async function boot() {
    ensureDeviceFp();
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref') || params.get('code');
    if (ref) localStorage.setItem('ap_pending_ref', ref);

    document.querySelectorAll('.ref-seg button').forEach((b) => {
      b.addEventListener('click', () => setTab(b.dataset.tab));
    });
    document.getElementById('refInviteNow')?.addEventListener('click', () => {
      inviteNow().catch((e) => toast(e.message || 'Share failed'));
    });
    document.getElementById('refCopyIdBtn')?.addEventListener('click', () => {
      copyMyId().catch(() => toast('Could not copy'));
    });
    document.getElementById('refReceiveBtn')?.addEventListener('click', () => {
      claimRewards().catch((e) => toast(e.message || 'Claim failed'));
    });
    document.getElementById('refApplyBtn')?.addEventListener('click', applyCode);
    document.getElementById('refHelpBtn')?.addEventListener('click', openGuide);
    document.getElementById('refGuideClose')?.addEventListener('click', closeGuide);
    document.getElementById('refGuideOverlay')?.addEventListener('click', (e) => {
      if (e.target?.id === 'refGuideOverlay') closeGuide();
    });
    document.getElementById('refHistoryMore')?.addEventListener('click', async () => {
      state.showAllHistory = !state.showAllHistory;
      const btn = document.getElementById('refHistoryMore');
      if (btn) btn.textContent = state.showAllHistory ? 'Less <' : 'More >';
      if (state.showAllHistory) await loadHistoryFull();
      renderWeekHistory();
    });

    document.addEventListener('referral:connected', () => {
      loadDashboard().catch(() => {});
      loadHistoryFull().catch(() => {});
    });

    try {
      const hasSession =
        Boolean(window.Auth?.getUser?.()) ||
        Boolean(localStorage.getItem('token')) ||
        Boolean(localStorage.getItem('access_token')) ||
        Boolean(localStorage.getItem('user'));
      if (!hasSession) {
        location.href = '/login.html?redirect=' + encodeURIComponent('/referral.html?app=1');
        return;
      }
      setText('refMyId', currentDisplayId());
      await loadDashboard();
      if (!state.dashboard?.invitation?.code) {
        await generate();
      }
      await loadHistoryFull();
      const pending = localStorage.getItem('ap_pending_ref');
      if (pending) {
        const input = document.getElementById('refApplyInput');
        if (input) input.value = pending;
      }
    } catch (e) {
      showBootError(e.message || 'Could not load invites.');
      toast(e.message || 'Load failed');
      try {
        await generate();
      } catch (e2) {
        showBootError(e2.message || 'Invite API unavailable — restart the server if this continues.');
        setText('refMyId', '———');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
  window.ReferralUI = { setTab, loadDashboard, applyCode, openGuide, closeGuide };
})();
