/**
 * Level, SVIP, and VIP badge chips for profiles and live chrome.
 * SVIP badge only when level >= 1 (3M+ recharge points per product rules).
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeBadges(src) {
    if (!src) return { personalLevel: 1, svipLevel: 0, isSvip: false, vipLevel: null, vipLabel: null, svipLabel: null, role: null, is_coin_seller: false };
    const personalLevel = Number(src.personalLevel ?? src.personal_level) || 0;
    const svipLevel = Number(src.svipLevel ?? src.svip_level) || 0;
    const vipLevel = src.vipLevel ?? src.vip_level;
    const isSvip = svipLevel > 0 && Boolean(src.isSvip ?? src.is_svip ?? svipLevel > 0);
    const role = src.role || null;
    const isCoinSeller = Boolean(src.is_coin_seller || role === 'coin_seller');
    return {
      personalLevel: personalLevel > 0 ? personalLevel : 1,
      svipLevel: isSvip ? svipLevel : 0,
      svipLabel: isSvip ? src.svipLabel || src.svip_label || `SVIP ${svipLevel}` : null,
      isSvip,
      vipLevel: vipLevel != null && Number(vipLevel) > 0 ? Number(vipLevel) : null,
      vipLabel: src.vipLabel || src.vip_label || null,
      role,
      is_coin_seller: isCoinSeller,
    };
  }

  function formatProfileRoleBadgesFromBadges(badges, opts) {
    const b = normalizeBadges(badges);
    const withEmoji = opts?.withEmoji !== false;
    const user = {
      role: b.role,
      is_coin_seller: b.is_coin_seller,
    };
    return global.formatProfileRoleBadgesHtml?.(user, { withEmoji }) || '';
  }

  function formatLiveProfileBadgesHtml(badges, opts) {
    const status = formatProfileStatusBadgesHtml(badges, opts);
    const roles = formatProfileRoleBadgesFromBadges(badges, opts);
    return [status, roles].filter(Boolean).join('');
  }

  function svipTierClass(level) {
    const lv = Number(level) || 0;
    if (lv >= 13) return 'ap-profile-badge--svip-elite';
    if (lv >= 7) return 'ap-profile-badge--svip-mid';
    if (lv >= 1) return 'ap-profile-badge--svip-core';
    return '';
  }

  function formatProfileStatusBadgesHtml(badges, opts) {
    const b = normalizeBadges(badges);
    const o = opts || {};
    const link = o.link !== false;
    const parts = [];

    const chip = (href, cls, label, title) => {
      const t = esc(title || label);
      const inner = esc(label);
      if (link && href) {
        return `<a href="${esc(href)}" class="ap-profile-badge ${cls}" title="${t}">${inner}</a>`;
      }
      return `<span class="ap-profile-badge ${cls}" title="${t}">${inner}</span>`;
    };

    parts.push(chip('/levels.html?app=1', 'ap-profile-badge--level', `Lv.${b.personalLevel}`, `Level ${b.personalLevel}`));

    if (b.isSvip && b.svipLevel > 0) {
      const tierCls = svipTierClass(b.svipLevel);
      parts.push(
        chip(
          '/svip.html?app=1',
          `ap-profile-badge--svip ${tierCls}`,
          `SVIP ${b.svipLevel}`,
          b.svipLabel || `SVIP ${b.svipLevel}`
        )
      );
    }

    if (b.vipLevel) {
      const vipText = b.vipLabel && !/^vip/i.test(b.vipLabel) ? b.vipLabel : `VIP ${b.vipLevel}`;
      parts.push(chip('/vip.html?app=1', 'ap-profile-badge--vip', vipText, vipText));
    }
    return parts.join('');
  }

  async function fetchBadges(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return normalizeBadges(null);

    if (global.API?.get) {
      try {
        if (global.Auth?.ensureAccessToken) await global.Auth.ensureAccessToken();
        const json = await global.API.get(`/social/creators/${encodeURIComponent(uid)}/badges`);
        if (json?.success && json.data) return normalizeBadges(json.data);
      } catch (_e) { /* fall through */ }
    }

    const join = global.joinApiUrl || ((p) => '/api' + p);
    const headers = { Accept: 'application/json' };
    const token = global.localStorage?.getItem?.('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    try {
      const res = await fetch(join('/social/creators/' + encodeURIComponent(uid) + '/badges'), {
        credentials: 'include',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data) return normalizeBadges(json.data);
    } catch (_e) { /* ignore */ }

    return normalizeBadges(null);
  }

  function paintBadges(container, badges, opts) {
    if (!container) return;
    const html = formatProfileStatusBadgesHtml(badges, opts);
    container.innerHTML = html;
    if (html) {
      container.hidden = false;
      container.removeAttribute('hidden');
      container.style.display = 'flex';
    } else {
      container.hidden = true;
    }
  }

  async function fetchAndPaint(container, userId, opts) {
    if (!container || !userId) return normalizeBadges(null);
    const badges = await fetchBadges(userId);
    paintBadges(container, badges, opts);
    return badges;
  }

  global.ProfileBadges = {
    normalizeBadges,
    formatProfileStatusBadgesHtml,
    formatProfileRoleBadgesFromBadges,
    formatLiveProfileBadgesHtml,
    svipTierClass,
    fetchBadges,
    paintBadges,
    fetchAndPaint,
  };
})(typeof window !== 'undefined' ? window : global);
