/**
 * Level, SVIP, and VIP badge chips for profiles and live chrome.
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
    if (!src) return { personalLevel: 1, svipLevel: 0, isSvip: false, vipLevel: null, vipLabel: null, svipLabel: null };
    const personalLevel = Number(src.personalLevel ?? src.personal_level) || 0;
    const svipLevel = Number(src.svipLevel ?? src.svip_level) || 0;
    const vipLevel = src.vipLevel ?? src.vip_level;
    return {
      personalLevel: personalLevel > 0 ? personalLevel : 1,
      svipLevel,
      svipLabel: src.svipLabel || src.svip_label || (svipLevel > 0 ? `SVIP ${svipLevel}` : null),
      isSvip: Boolean(src.isSvip ?? src.is_svip ?? svipLevel > 0),
      vipLevel: vipLevel != null && Number(vipLevel) > 0 ? Number(vipLevel) : null,
      vipLabel: src.vipLabel || src.vip_label || null,
    };
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

    if (b.svipLevel > 0) {
      parts.push(
        chip('/svip.html?app=1', 'ap-profile-badge--svip', `SVIP ${b.svipLevel}`, b.svipLabel || `SVIP ${b.svipLevel}`)
      );
    } else {
      parts.push(chip('/svip.html?app=1', 'ap-profile-badge--svip ap-profile-badge--svip-muted', 'SVIP', 'Earn SVIP points by recharging'));
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

  async function fetchSvipHome() {
    if (!global.API?.get) return null;
    try {
      if (global.Auth?.ensureAccessToken) await global.Auth.ensureAccessToken();
      const json = await global.API.get('/svip/home');
      if (json?.success && json.data) {
        return {
          svipLevel: Number(json.data.level) || 0,
          svipLabel: json.data.levelLabel,
          isSvip: Boolean(json.data.isSvip),
        };
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  function mergeBadgeSources(base, svipHome) {
    const b = normalizeBadges(base || {});
    if (svipHome) {
      b.svipLevel = Number(svipHome.svipLevel ?? svipHome.level) || b.svipLevel;
      b.svipLabel = svipHome.svipLabel || svipHome.levelLabel || b.svipLabel;
      b.isSvip = Boolean(svipHome.isSvip ?? b.isSvip);
    }
    return b;
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
    const [badges, svipHome] = await Promise.all([fetchBadges(userId), fetchSvipHome()]);
    const merged = mergeBadgeSources(badges, svipHome);
    paintBadges(container, merged, opts);
    return merged;
  }

  global.ProfileBadges = {
    normalizeBadges,
    formatProfileStatusBadgesHtml,
    fetchBadges,
    fetchSvipHome,
    mergeBadgeSources,
    paintBadges,
    fetchAndPaint,
  };
})(typeof window !== 'undefined' ? window : global);
