/**
 * Consistent creator identity chips across Square / Video / Profiles / Discover.
 * Same creator must look identical everywhere.
 */
(function () {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolvePic(url, cacheKey) {
    if (!url) return '';
    if (window.SocialShell?.getImageUrl) return SocialShell.getImageUrl(url, cacheKey) || url;
    if (window.SocialInteractions?.resolveMediaUrl) return SocialInteractions.resolveMediaUrl(url);
    return url;
  }

  function avatarUrl(creator) {
    const name = creator.displayName || creator.userName || creator.name || 'Creator';
    const pic = creator.profilePic || creator.profile_pic || null;
    if (pic) {
      const resolved = resolvePic(pic, creator.profileUpdatedAt || creator.id || creator.userId);
      if (resolved) return resolved;
    }
    return window.SocialUI?.avatarUrl?.(name, pic) || '';
  }

  function normalize(creator) {
    if (!creator) return null;
    return {
      id: creator.id || creator.userId || creator.user_id || null,
      displayName: creator.displayName || creator.userName || creator.name || 'Creator',
      profilePic: creator.profilePic || creator.profile_pic || null,
      profileUpdatedAt: creator.profileUpdatedAt || null,
      role: creator.role || null,
      isVerified: !!(creator.isVerified || creator.is_verified),
      agencyName: creator.agencyName || creator.agency_name || null,
      creatorLevel: creator.creatorLevel || creator.vipLevel || creator.vip_level || null,
      vipLevel: creator.vipLevel || creator.vip_level_name || null,
      isLive: !!(creator.isLive || creator.authorLive || creator.liveChannel),
      liveHref:
        creator.liveHref ||
        creator.authorLive?.href ||
        (creator.liveChannel
          ? `/${(creator.liveRoomType || creator.live_room_type) === 'party' ? 'party-room' : 'live-room'}.html?channel=${encodeURIComponent(creator.liveChannel)}&app=1`
          : null),
      isFollowing: !!creator.isFollowing,
    };
  }

  /**
   * @param {object} creator
   * @param {'card'|'reel'|'profile'|'compact'} variant
   */
  function renderBadgesHtml(creator, variant) {
    const c = normalize(creator);
    if (!c) return '';
    const parts = [];
    if (c.isVerified) {
      parts.push('<span class="ap-creator-verified" title="Verified"><i class="fas fa-check-circle"></i></span>');
    }
    const roleHtml = window.formatRoleBadgeHtml?.(c.role || c, { withEmoji: variant !== 'compact' }) || '';
    if (roleHtml) parts.push(roleHtml);
    if (c.agencyName) {
      parts.push(
        `<span class="ap-creator-agency" title="${esc(c.agencyName)}"><i class="fas fa-building"></i>${
          variant === 'compact' ? '' : ' ' + esc(c.agencyName)
        }</span>`
      );
    }
    if (c.creatorLevel || c.vipLevel) {
      parts.push(
        `<span class="ap-creator-level" title="Level">${esc(c.creatorLevel || c.vipLevel)}</span>`
      );
    }
    const personalLevel = creator.personalLevel || creator.personal_level;
    const svipLevel = creator.svipLevel || creator.svip_level;
    const badgeSrc = creator.badges || creator;
    const statusHtml = window.ProfileBadges?.formatProfileStatusBadgesHtml?.(
      badgeSrc.personalLevel || badgeSrc.svipLevel || badgeSrc.vipLevel
        ? badgeSrc
        : { personalLevel, svipLevel, vipLevel: creator.vipLevel || creator.vip_level },
      { link: variant !== 'compact' }
    );
    if (statusHtml) parts.push(statusHtml);
    if (c.isLive && c.liveHref) {
      parts.push(
        `<a class="social-live-pill" href="${esc(c.liveHref)}" onclick="event.stopPropagation()"><i class="fas fa-circle"></i> LIVE</a>`
      );
    }
    return parts.join(' ');
  }

  function renderIdentityHtml(creator, opts) {
    const o = opts || {};
    const c = normalize(creator);
    if (!c) return '';
    const variant = o.variant || 'card';
    const href =
      o.href ||
      (c.id
        ? `/creator-profile.html?userId=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.displayName)}&app=1`
        : '#');
    const av = avatarUrl(c);
    const badges = renderBadgesHtml(c, variant);
    const follow =
      o.showFollow && c.id
        ? `<button type="button" class="ap-creator-follow-btn${c.isFollowing ? ' is-on' : ''}" data-creator-follow="${esc(
            c.id
          )}" data-creator-name="${esc(c.displayName)}">${c.isFollowing ? 'Following' : 'Follow'}</button>`
        : '';

    if (variant === 'reel') {
      return `
        <div class="ap-creator-identity ap-creator-identity--reel">
          <a class="ap-creator-avatar-link" href="${esc(href)}">
            <img class="ap-creator-avatar" src="${esc(av)}" alt="">
          </a>
          <div class="ap-creator-meta">
            <a class="ap-creator-name" href="${esc(href)}">${esc(c.displayName)}</a>
            <div class="ap-creator-badges">${badges}</div>
          </div>
          ${follow}
        </div>`;
    }

    return `
      <a class="ap-creator-identity ap-creator-identity--${esc(variant)}" href="${esc(href)}">
        <img class="ap-creator-avatar" src="${esc(av)}" alt="">
        <div class="ap-creator-meta">
          <div class="ap-creator-name">${esc(c.displayName)} ${badges}</div>
          ${o.subtitle ? `<div class="ap-creator-sub">${esc(o.subtitle)}</div>` : ''}
        </div>
      </a>`;
  }

  function bindFollowButtons(root) {
    (root || document).querySelectorAll('[data-creator-follow]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.creatorFollow;
        const name = btn.dataset.creatorName || 'Creator';
        if (!window.SocialInteractions?.toggleFollow) return;
        const was = btn.classList.contains('is-on');
        btn.classList.toggle('is-on', !was);
        btn.classList.add('ap-follow-pop');
        btn.textContent = !was ? 'Following' : 'Follow';
        try {
          const now = await SocialInteractions.toggleFollow(id, name);
          btn.classList.toggle('is-on', !!now);
          btn.textContent = now ? 'Following' : 'Follow';
        } catch (_err) {
          btn.classList.toggle('is-on', was);
          btn.textContent = was ? 'Following' : 'Follow';
        } finally {
          setTimeout(() => btn.classList.remove('ap-follow-pop'), 400);
        }
      });
    });
  }

  window.SocialCreatorIdentity = {
    normalize,
    avatarUrl,
    renderBadgesHtml,
    renderIdentityHtml,
    bindFollowButtons,
  };
})();
