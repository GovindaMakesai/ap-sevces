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
    if (!src) return null;
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
    if (!b) return '';
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

    if (b.personalLevel) {
      parts.push(chip('/levels.html?app=1', 'ap-profile-badge--level', `Lv.${b.personalLevel}`, `Level ${b.personalLevel}`));
    }
    if (b.svipLevel > 0) {
      parts.push(
        chip('/svip.html?app=1', 'ap-profile-badge--svip', `SVIP ${b.svipLevel}`, b.svipLabel || `SVIP ${b.svipLevel}`)
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
    if (!uid) return null;
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
      if (!res.ok || !json.success) return null;
      return normalizeBadges(json.data);
    } catch (_e) {
      return null;
    }
  }

  function paintBadges(container, badges, opts) {
    if (!container) return;
    const html = formatProfileStatusBadgesHtml(badges, opts);
    container.innerHTML = html;
    container.hidden = !html;
    if (html) container.removeAttribute('hidden');
  }

  async function fetchAndPaint(container, userId, opts) {
    if (!container || !userId) return null;
    const badges = await fetchBadges(userId);
    if (badges) paintBadges(container, badges, opts);
    return badges;
  }

  global.ProfileBadges = {
    normalizeBadges,
    formatProfileStatusBadgesHtml,
    fetchBadges,
    paintBadges,
    fetchAndPaint,
  };
})(typeof window !== 'undefined' ? window : global);
