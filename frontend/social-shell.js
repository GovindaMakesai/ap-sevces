/**
 * Social app shell — native-style nav, live grids, booking flows preserved.
 */
(function () {
  if (window.__AP_SOCIAL_SHELL__) return;
  window.__AP_SOCIAL_SHELL__ = true;
  const BOTTOM_NAV = [
    { id: 'video', href: '/video.html', icon: 'fa-video' },
    { id: 'rankings', href: '/rankings.html', icon: 'fa-trophy' },
    { id: 'explore', href: '/explore.html', icon: 'planet', center: true },
    { id: 'chat', href: '/chat.html?_cb=20260713d', icon: 'fa-comment-dots', badge: true },
    { id: 'profile', href: '/profile-tab.html', icon: 'fa-user' },
  ];

  const CATEGORY_TAGS = [
    'Chatting', 'Make Friends', 'Singing', 'Esports', 'Beauty', 'Home Services',
  ];

  const CHIP_FILTERS = ['Popular', 'India', 'Nepal', 'Global'];

  function normalizeMediaPath(path) {
    if (!path) return null;
    let p = String(path).trim();
    if (!p) return null;
    if (p.startsWith('data:') || p.startsWith('blob:')) return p;
    if (p.startsWith('//')) return `https:${p}`;
    const embedded = p.match(/https?:\/\/[^\s"'<>]+/i);
    if (embedded) return embedded[0];
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(p) && !p.startsWith('/')) {
      return `https://${p.replace(/^\/+/, '')}`;
    }
    return p;
  }

  function getImageUrl(path, cacheKey) {
    const p = normalizeMediaPath(path);
    if (!p) return null;
    if (p.startsWith('data:') || p.startsWith('blob:')) return p;
    if (p.startsWith('http://') || p.startsWith('https://')) {
      if (!cacheKey) return p;
      return p + (p.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
    }
    const base = (window.CONFIG?.BACKEND_URL || String(window.CONFIG?.API_URL || '').replace(/\/api\/?$/, '') || '').replace(/\/$/, '');
    if (!base) return p.startsWith('/') ? p : `/${p}`;
    let url = `${base}${p.startsWith('/') ? '' : '/'}${p}`;
    if (cacheKey) url += (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(cacheKey));
    return url;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function pickTag(index) {
    return CATEGORY_TAGS[index % CATEGORY_TAGS.length];
  }

  function formatViewers(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  async function runGlobalSearch(q, opts = {}) {
    const query = String(q || '').trim();
    if (!query || query.length < 2 || !window.API?.get) return null;
    const type = opts.type || 'all';
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
      const res = await API.get(
        `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`
      );
      return res?.data || null;
    } catch (e) {
      console.warn('Global search failed', e);
      return null;
    }
  }

  function renderSearchResults(mount, data, q) {
    if (!mount) return;
    const users = data?.users || [];
    const rooms = data?.live_rooms || [];
    const sellers = data?.coin_sellers || [];
    if (!users.length && !rooms.length && !sellers.length) {
      mount.innerHTML = `<div class="social-empty-state"><p>No results for "${escapeHtml(q)}".</p></div>`;
      return;
    }
    let html = '';
    if (users.length) {
      html += `<p class="social-search-section">Users</p><div class="social-search-users">`;
      users.forEach((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'User';
        const profileHref = `/creator-profile.html?userId=${encodeURIComponent(u.id)}&name=${encodeURIComponent(name)}&app=1`;
        if (window.SocialCreatorIdentity?.renderIdentityHtml) {
          html += `<div class="social-search-user social-search-user--identity">${SocialCreatorIdentity.renderIdentityHtml(
            {
              id: u.id,
              displayName: name,
              profilePic: u.profile_pic || u.profilePic,
              role: u.role,
              isVerified: u.is_verified || u.isVerified,
              agencyName: u.agency_name || u.agencyName,
              creatorLevel: u.creator_level || u.vip_level || u.creatorLevel,
              isLive: !!(u.is_live || u.isLive || u.live_channel),
              liveChannel: u.live_channel || u.liveChannel,
              liveRoomType: u.live_room_type || u.liveRoomType,
            },
            {
              variant: 'compact',
              href: profileHref,
              subtitle: u.display_id ? `ID ${u.display_id}` : `ID ${u.id}`,
            }
          )}</div>`;
        } else {
          html += `<a href="${profileHref}" class="social-search-user">
          <span class="social-search-user-name">${escapeHtml(name)} ${
            window.formatRoleBadgeHtml?.(u.role || u, { withEmoji: true }) || ''
          }</span>
          <span class="social-search-user-id">ID ${u.display_id || u.id}</span>
        </a>`;
        }
      });
      html += `</div>`;
    }
    if (rooms.length) {
      html += `<p class="social-search-section">Live &amp; party</p><div class="social-grid">`;
      rooms.forEach((r, i) => {
        const isParty =
          String(r.room_type || r.type || '').toLowerCase() === 'party' ||
          String(r.channel || '').startsWith('party-');
        html += renderLiveCard(
          {
            channel: r.channel,
            name: r.host_display_name || r.hostName || r.channel,
            hostProfilePic: r.host_profile_pic || r.hostProfilePic,
            viewers: r.viewer_count || r.viewers || 0,
            party: isParty,
            roomType: isParty ? 'party' : 'live',
          },
          i,
          { party: isParty }
        );
      });
      html += `</div>`;
    }
    if (sellers.length) {
      html += `<p class="social-search-section">Coin sellers</p>`;
      sellers.forEach((s) => {
        html += `<a href="/coin-seller-center.html?app=1" class="social-search-user">
          <span>${escapeHtml(s.display_name || s.first_name || 'Seller')}</span>
          <span class="social-search-user-id">ID ${s.user_id}</span>
        </a>`;
      });
    }
    mount.innerHTML = html;
    bindLiveCards(mount);
    if (window.SocialUI?.bindAvatarFallbacks) SocialUI.bindAvatarFallbacks(mount);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function avatarFallback(name) {
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name);
    const initials =
      (window.SocialUI?.initials && SocialUI.initials(name)) ||
      String(name || 'U')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[^A-Za-z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join('') ||
      'U';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#fff" opacity="0.92">${initials}</text></svg>`;
    try {
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    } catch (_e) {
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="100%" height="100%" fill="#c9a227"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#fff">U</text></svg>')}`;
    }
  }

  function coverFallback(name, party) {
    if (window.SocialUI?.themeCover) {
      return SocialUI.themeCover(party ? 'party' : 'live', name);
    }
    return avatarFallback(name);
  }

  function hostCardImage(name, profilePic, updatedAt, party) {
    const label = String(name || 'Host').trim() || 'Host';
    const built = profilePic ? getImageUrl(profilePic, updatedAt) : null;
    if (window.SocialUI?.avatarUrl) {
      return SocialUI.avatarUrl(label, built);
    }
    if (built) return built;
    return coverFallback(label, party);
  }

  function roomCardImage(room, party) {
    const name =
      room.hostName ||
      room.name ||
      `${room.first_name || ''} ${room.last_name || ''}`.trim() ||
      'Host';
    const cover =
      room.hostStreamCover ||
      room.stream_cover_url ||
      room.host_stream_cover ||
      null;
    const pic =
      cover ||
      room.hostProfilePic ||
      room.host_profile_pic ||
      room.profile_pic ||
      room.profilePic;
    const cacheKey = room.hostUpdatedAt || room.updatedAt || room.updated_at;
    return hostCardImage(name, pic, cacheKey, party);
  }

  let _enrichPhotosCacheAt = 0;
  let _enrichPhotosCache = null;

  async function enrichRoomsWithHostPhotos(rooms) {
    if (!Array.isArray(rooms) || !rooms.length) return rooms;
    const picByHost = new Map();

    const remember = (id, pic, updatedAt) => {
      if (!id || !pic) return;
      picByHost.set(String(id), { pic, updatedAt });
    };

    rooms.forEach((r) => {
      const id = r.hostId || r.host_user_id;
      const pic = r.hostProfilePic || r.host_profile_pic;
      if (id && pic) remember(id, pic, r.hostUpdatedAt || r.updatedAt);
    });

    const missingIds = [
      ...new Set(
        rooms
          .filter((r) => {
            const id = r.hostId || r.host_user_id;
            return id && !picByHost.has(String(id));
          })
          .map((r) => String(r.hostId || r.host_user_id))
      ),
    ];
    if (!missingIds.length) return rooms;

    const now = Date.now();
    if (_enrichPhotosCache && now - _enrichPhotosCacheAt < 120000) {
      _enrichPhotosCache.forEach((v, k) => picByHost.set(k, v));
    } else if (window.API?.get) {
      try {
        const res = await API.get('/social/discover/creators?period=weekly&limit=50');
        const rows = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.creators)
            ? res.data.creators
            : [];
        const cache = new Map();
        rows.forEach((c) => {
          const id = String(c.id || c.userId || '');
          const pic = c.profilePic || c.profile_pic;
          if (id && pic) {
            remember(id, pic, c.updatedAt);
            cache.set(id, { pic, updatedAt: c.updatedAt });
          }
        });
        _enrichPhotosCache = cache;
        _enrichPhotosCacheAt = now;
      } catch (e) {
        console.warn('SocialShell: enrich host photos', e);
      }
    }

    return rooms.map((r) => {
      const id = String(r.hostId || r.host_user_id || '');
      const hit = picByHost.get(id);
      if (!hit) return r;
      return {
        ...r,
        hostProfilePic: r.hostProfilePic || r.host_profile_pic || hit.pic,
        hostUpdatedAt: r.hostUpdatedAt || hit.updatedAt || r.updatedAt,
      };
    });
  }

  function renderNavIcon(item) {
    if (item.icon === 'planet') {
      return `<span class="nav-planet" aria-hidden="true"><span class="nav-planet-glow"></span><span class="nav-planet-body"></span><span class="nav-planet-ring"></span></span>`;
    }
    return `<i class="fas ${item.icon}"></i>`;
  }

  function hasAppSession() {
    try {
      return Boolean(localStorage.getItem('user') || localStorage.getItem('token'));
    } catch (_e) {
      return false;
    }
  }

  function getChatUnreadCount() {
    try {
      return Math.max(0, parseInt(localStorage.getItem('chat_unread') || '0', 10) || 0);
    } catch (_e) {
      return 0;
    }
  }

  function paintChatNavBadge(unread) {
    const count = Math.max(0, parseInt(unread, 10) || 0);
    try {
      localStorage.setItem('chat_unread', String(count));
    } catch (_e) {}
    document.querySelectorAll('.social-bottom-nav .nav-item[data-nav="chat"]').forEach((el) => {
      let badge = el.querySelector('.nav-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          el.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = false;
      } else if (badge) {
        badge.remove();
      }
    });
  }

  let _chatUnreadSyncAt = 0;

  async function syncChatUnreadFromApi() {
    if (!hasAppSession() || !window.API?.get) return getChatUnreadCount();
    const now = Date.now();
    let last = _chatUnreadSyncAt;
    try {
      last = Math.max(last, Number(sessionStorage.getItem('ap_chat_unread_sync_at') || 0));
    } catch (_e) { /* ignore */ }
    if (now - last < 120000) return getChatUnreadCount();
    _chatUnreadSyncAt = now;
    try {
      sessionStorage.setItem('ap_chat_unread_sync_at', String(now));
    } catch (_e) { /* ignore */ }
    try {
      const res = await API.get('/messages/unread-count');
      const total = Number(res?.data?.totalUnread);
      const count = Number.isFinite(total) ? total : 0;
      paintChatNavBadge(count);
      return count;
    } catch (e) {
      console.warn('SocialShell: chat unread sync', e);
      return getChatUnreadCount();
    }
  }

  function renderBottomNav(activeId) {
    const unread = getChatUnreadCount();
    return `
      <nav class="social-bottom-nav" aria-label="Main">
        ${BOTTOM_NAV.map((item) => {
          const active = item.id === activeId;
          const href = withAppQuery(item.href);
          const center = item.center ? ' nav-center' : '';
          const badge =
            item.badge && unread > 0
              ? `<span class="nav-badge">${unread > 9 ? '9+' : unread}</span>`
              : '';
          return `<a href="${href}" class="nav-item${active ? ' is-active' : ''}${center}" data-nav="${item.id}">
            ${renderNavIcon(item)}
            ${badge}
          </a>`;
        }).join('')}
      </nav>`;
  }

  function renderAvatarStack(count) {
    const n = Math.min(count, 4);
    const colors = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'];
    let html = '<div class="card-avatars">';
    for (let i = 0; i < n; i++) {
      html += `<span class="card-av" style="background:${colors[i % colors.length]}"></span>`;
    }
    if (count > n) html += `<span class="card-av-more">+${count - n}</span>`;
    html += '</div>';
    return html;
  }

  function formatLiveAge(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'Just started';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  function hostInitials(name) {
    if (window.SocialUI?.initials) return SocialUI.initials(name) || 'H';
    return (
      String(name || 'H')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[^A-Za-z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join('') || 'H'
    );
  }

  function isPartyRoomRow(r) {
    const roomType = String(r?.type || r?.room_type || '').toLowerCase();
    return roomType === 'party' || String(r?.channel || '').startsWith('party-');
  }

  function normalizeRoomRows(rows, partyFilter) {
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.channel)
      .filter((r) => (partyFilter ? isPartyRoomRow(r) : !isPartyRoomRow(r)));
  }

  function mapRoomToCard(r, isParty) {
    const name = r.hostName || r.host_display_name || 'Host';
    const hostProfilePic = r.hostProfilePic || r.host_profile_pic || null;
    const hostStreamCover = r.hostStreamCover || r.stream_cover_url || null;
    const hostUpdatedAt = r.hostUpdatedAt || r.updated_at || r.updatedAt;
    return {
      id: r.channel,
      channel: r.channel,
      userId: r.hostId || r.host_user_id,
      name,
      hostProfilePic,
      hostStreamCover,
      hostUpdatedAt,
      roomType: isParty ? 'party' : 'live',
      party: isParty,
      image: roomCardImage(
        { ...r, hostProfilePic, hostStreamCover, hostUpdatedAt, hostName: name },
        isParty
      ),
      viewers: r.viewers || r.viewer_count || 0,
      startedAt: r.startedAt || r.started_at,
      updatedAt: r.updatedAt || r.updated_at,
      tag: isParty ? 'Party' : 'Live',
      live: true,
    };
  }

  function syncExploreFloatingActions(hasRooms, opts = {}) {
    if (!document.body.classList.contains('social-explore-page')) return;
    const liveBtn = document.getElementById('social-start-live');
    const partyBtn = document.getElementById('social-start-party');
    const party = Boolean(opts.party);
    document.body.classList.toggle('explore-has-rooms', Boolean(hasRooms));
    document.body.classList.toggle('explore-empty-state', !hasRooms);
    document.body.classList.toggle('explore-tab-party', party);
    document.body.classList.toggle('explore-tab-live', !party);
    if (!liveBtn || !partyBtn) return;
    /* Always keep Go Live / Party FAB available — empty feed must not block starting a stream */
    liveBtn.hidden = party;
    partyBtn.hidden = !party;
    liveBtn.style.display = party ? 'none' : 'flex';
    partyBtn.style.display = party ? 'flex' : 'none';
  }

  function renderExploreFeedHead(party, count) {
    const isParty = Boolean(party);
    const icon = isParty ? 'fa-microphone-lines' : 'fa-video';
    const label = isParty ? 'Party rooms live now' : 'Live broadcasts now';
    const n = Math.max(0, Number(count) || 0);
    const countHtml = n > 0 ? `<span class="social-explore-feed-count">${n}</span>` : '';
    return `<div class="social-explore-feed-head"><h2 class="social-explore-feed-title"><i class="fas ${icon}"></i><span>${label}</span>${countHtml}</h2></div>`;
  }

  function renderExploreCardsHtml(rooms, opts) {
    return `<div class="social-grid social-grid-cards">${rooms
      .map((p, i) => renderLiveCard(p, i, opts))
      .filter(Boolean)
      .join('')}</div>`;
  }

  function renderLiveCard(pro, index, opts) {
    const hostUid = String(pro.hostId || pro.host_user_id || pro.userId || '').trim();
    if (hostUid && window.SocialInteractions?.isBlocked?.(hostUid)) return '';
    const party =
      Boolean(opts && opts.party) ||
      Boolean(pro.party) ||
      pro.roomType === 'party' ||
      pro.tag === 'Party';
    const channel = pro.channel || pro.id || '';
    if (!channel) return '';
    const name = pro.name || pro.hostName || 'Host';
    const img = pro.image || hostCardImage(name, pro.hostProfilePic, pro.hostUpdatedAt || pro.updatedAt, party);
    const imgAttr = escapeAttr(img);
    const nameAttr = escapeAttr(name);
    const fallbackAttr = escapeAttr(hostCardImage(name, null, null, party));
    const viewers = Math.max(0, Number(pro.viewers) || 0);
    const age = formatLiveAge(pro.startedAt || pro.updatedAt);
    const ch = encodeURIComponent(String(channel).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64));
    const hostQs = [];
    if (name) {
      const enc = window.SocialUI?.safeEncodeURIComponent || encodeURIComponent;
      try {
        hostQs.push('hostName=' + enc(name));
      } catch (_e) {
        hostQs.push('hostName=Host');
      }
    }
    if (pro.hostProfilePic) hostQs.push('profilePic=' + encodeURIComponent(String(pro.hostProfilePic)));
    const extra = hostQs.length ? '&' + hostQs.join('&') : '';
    const href = party
      ? `/party-room.html?channel=${ch}${extra}&app=1`
      : `/live-room.html?channel=${ch}&feed=1${extra}&app=1`;
    const typeBadge = party
      ? '<span class="live-type-badge live-type-badge--party"><i class="fas fa-microphone-lines"></i> PARTY</span>'
      : '<span class="live-type-badge live-type-badge--live"><i class="fas fa-video"></i> LIVE</span>';
    const viewerBadge = `<span class="live-viewer-badge"><i class="fas fa-users"></i> ${formatViewers(viewers)}</span>`;
    const initials = escapeHtml(hostInitials(name));
    const ageLabel = age ? `<span class="live-age">${escapeHtml(age)}</span>` : '';

    return `
      <article class="social-live-card${party ? ' is-party' : ' is-live'}" data-href="${href}" data-room-type="${party ? 'party' : 'live'}" role="button" tabindex="0">
        <img src="${imgAttr}" alt="${nameAttr}" data-name="${nameAttr}" loading="${index < 4 ? 'eager' : 'lazy'}"${index < 2 ? ' fetchpriority="high"' : ''} decoding="async" onerror="this.onerror=null;this.src='${fallbackAttr}'">
        ${typeBadge}
        ${viewerBadge}
        <div class="bottom">
          <div class="live-host-row">
            <span class="live-host-avatar" aria-hidden="true">${initials}</span>
            <div class="live-host-meta">
              <span class="name social-card-name">${escapeHtml(name)}</span>
              <span class="live-host-sub">${party ? 'Voice party · Tap to join' : 'Broadcasting · Tap to watch'}</span>
            </div>
          </div>
          ${ageLabel}
        </div>
      </article>`;
  }

  function renderEmptyLiveGrid(party, opts = {}) {
    const isError = opts.error;
    const icon = party ? 'fa-microphone-lines' : 'fa-tower-broadcast';
    const title = isError
      ? 'Could not load rooms'
      : party
        ? 'No party rooms right now'
        : 'No live broadcasts right now';
    const subtitle = isError
      ? 'Check your connection and try again.'
      : party
        ? 'Start a voice party or check back when someone goes live.'
        : 'When creators go live, their rooms show up here as cards you can tap to watch.';
    const primaryLabel = party ? 'Start a Party' : 'Go Live';
    const primaryAction = party ? 'start-party' : 'start-live';
    const secondaryHref = withAppQuery('/discover-creators.html');
    const altHint = opts.altHint || '';

    return `
      <div class="social-explore-empty-shell">
        <div class="social-empty-live-grid${isError ? ' is-error' : ''}${party ? ' is-party' : ' is-live'}" data-empty-live>
          <p class="social-empty-live-badge"><i class="fas ${icon}"></i> ${party ? 'Party' : 'Live'}</p>
          <div class="social-empty-live-visual" aria-hidden="true">
            <span class="social-empty-live-ring social-empty-live-ring--1"></span>
            <span class="social-empty-live-ring social-empty-live-ring--2"></span>
            <div class="social-empty-live-icon"><i class="fas ${icon}"></i></div>
          </div>
          <h3>${escapeHtml(title)}</h3>
          <p class="social-empty-live-desc">${escapeHtml(subtitle)}</p>
          ${altHint}
          <div class="social-empty-live-actions">
            ${
              isError
                ? `<button type="button" class="social-empty-live-btn" data-empty-action="retry">Try again</button>`
                : `<button type="button" class="social-empty-live-btn" data-empty-action="${primaryAction}">${escapeHtml(primaryLabel)}</button>`
            }
            <a href="${escapeAttr(secondaryHref)}" class="social-empty-live-link">Discover creators</a>
          </div>
          <p class="social-empty-live-hint"><i class="fas fa-arrows-rotate"></i> Pull down to refresh</p>
        </div>
      </div>`;
  }

  async function emptyStateAltHint(party) {
    try {
      const otherParty = !party;
      const res = await API.get(`/live/rooms?type=${otherParty ? 'party' : 'live'}&limit=5&sort=trending`);
      const rows = normalizeRoomRows(res?.data, otherParty);
      if (!rows.length) return '';
      const tab = otherParty ? 'party' : 'explore';
      const label = otherParty ? 'party' : 'live';
      return `<p class="social-empty-live-alt"><button type="button" class="social-empty-live-alt-btn" data-switch-tab="${tab}"><i class="fas fa-arrow-right"></i> ${rows.length} ${label} room${rows.length === 1 ? '' : 's'} active — view now</button></p>`;
    } catch (_e) {
      return '';
    }
  }

  function bindEmptyLiveGrid(root, opts = {}) {
    const el = (root || document).querySelector('[data-empty-live]');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    el.querySelector('[data-empty-action="start-live"]')?.addEventListener('click', () => goStartLive());
    el.querySelector('[data-empty-action="start-party"]')?.addEventListener('click', () => goStartParty());
    el.querySelector('[data-empty-action="retry"]')?.addEventListener('click', () => {
      const mount = el.closest('.social-explore-mount') || el.closest('.social-grid');
      const gridId = mount?.id || 'exploreGrid';
      fillGrid(gridId, 12, { ...(opts || {}), append: false });
    });
    el.querySelector('[data-switch-tab]')?.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.switchTab;
      if (!tab) return;
      document.querySelector(`#exploreTabs button[data-tab="${tab}"]`)?.click();
    });
  }

  function renderFilterChips(activeLabel) {
    return `
      <div class="social-filter-chips" role="tablist">
        ${CHIP_FILTERS.map((label) => {
          const active = label === (activeLabel || 'Popular') ? ' is-active' : '';
          return `<button type="button" class="chip${active}" data-chip="${label}">${label === 'Global' ? '<i class="fas fa-globe-asia"></i>' : label}</button>`;
        }).join('')}
      </div>`;
  }

  function withAppQuery(href) {
    if (!href || href.startsWith('http')) return href;
    const native =
      window.__AP_NATIVE_APP__ ||
      window.ReactNativeWebView ||
      window.Capacitor ||
      new URLSearchParams(window.location.search).get('app') === '1' ||
      new URLSearchParams(window.location.search).get('source') === 'expo-app';
    if (native) {
      const sep = href.includes('?') ? '&' : '?';
      if (!href.includes('app=1')) return href + sep + 'app=1';
    }
    return href;
  }

  function isImmersiveLivePage() {
    const path = (window.location.pathname || '').toLowerCase();
    return path.endsWith('/live-room.html') || path.endsWith('/party-room.html');
  }

  function ensureBottomNav(activeId) {
    if (isImmersiveLivePage()) return;
    if (!hasAppSession()) return;
    const mount = document.getElementById('social-bottom-nav-mount');
    if (!mount) return;
    mount.innerHTML = renderBottomNav(activeId || 'explore');
    mount.style.display = '';
    document.documentElement.classList.remove('auth-guest', 'auth-locked');
    patchAppLinks();
    bindFastBottomNav();
    prefetchNavTargets();
    setTimeout(() => syncChatUnreadFromApi(), 3500);
  }

  let fastNavBound = false;
  let navSwitching = false;

  function paintNavSwitchOverlay(href) {
    let el = document.getElementById('ap-nav-switch-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ap-nav-switch-overlay';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<span class="ap-nav-switch-bar"></span>';
      (document.body || document.documentElement).appendChild(el);
    }
    el.classList.add('is-on');
    try {
      const path = new URL(href, location.origin).pathname.toLowerCase();
      el.dataset.to = path;
    } catch (_e) {}
  }

  function navigateInApp(href, { markActive } = {}) {
    if (!href || href.startsWith('http') || href.startsWith('#')) return false;
    try {
      const next = new URL(href, location.origin);
      const cur = new URL(location.href);
      if (next.pathname === cur.pathname && next.search === cur.search) {
        if (window.SocialNav?.refreshPage) SocialNav.refreshPage();
        return true;
      }
    } catch (_e) { /* fall through */ }
    if (navSwitching) return true;

    /* Soft-nav disabled — it stacked timers/listeners and made the whole app lag */
    navSwitching = true;
    if (typeof markActive === 'function') markActive();
    document.documentElement.classList.add('ap-nav-switching');
    paintNavSwitchOverlay(href);
    window.location.assign(href);
    return true;
  }

  function bindFastBottomNav() {
    if (fastNavBound) return;
    fastNavBound = true;

    function goBottomNav(link, e) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return false;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      return navigateInApp(href, {
        markActive: () => {
          document.querySelectorAll('.social-bottom-nav .nav-item').forEach((el) => {
            el.classList.toggle('is-active', el === link);
          });
        },
      });
    }

    function goMainTab(link, e) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return false;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      return navigateInApp(href, {
        markActive: () => {
          document.querySelectorAll('.social-main-tabs a').forEach((el) => {
            el.classList.toggle('active', el === link);
          });
        },
      });
    }

    /* pointerdown fires before main-thread load work eats the click */
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const bottom = e.target.closest?.('.social-bottom-nav a[data-nav]');
        if (bottom) {
          goBottomNav(bottom, e);
          return;
        }
        const tab = e.target.closest?.('.social-main-tabs a[href]');
        if (tab) goMainTab(tab, e);
      },
      true
    );
    document.addEventListener(
      'click',
      (e) => {
        const bottom = e.target.closest?.('.social-bottom-nav a[data-nav]');
        if (bottom) {
          if (navSwitching) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          goBottomNav(bottom, e);
          return;
        }
        const tab = e.target.closest?.('.social-main-tabs a[href]');
        if (tab) {
          if (navSwitching) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          goMainTab(tab, e);
        }
      },
      true
    );
  }

  function prefetchNavTargets() {
    if (document.getElementById('ap-nav-prefetch')) return;
    const marker = document.createElement('meta');
    marker.id = 'ap-nav-prefetch';
    marker.name = 'ap-nav-prefetch';
    document.head.appendChild(marker);
    const pages = [
      ...BOTTOM_NAV.map((item) => item.href),
      '/video.html',
      '/square.html',
      '/topics.html',
      '/explore.html',
      '/rankings.html',
      '/chat.html',
      '/profile-tab.html',
    ];
    const seen = new Set();
    const warm = (href) => {
      if (seen.has(href)) return;
      seen.add(href);
      /* Single light prefetch — do not double-fetch / Cache API hammer */
      try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'document';
        link.href = href;
        document.head.appendChild(link);
      } catch (_e) {}
    };
    const run = () => {
      pages.forEach((path) => warm(withAppQuery(path)));
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 1500);
    }
  }

  function patchAppLinks() {
    document.querySelectorAll('a[href^="/"]:not([data-auth-nav])').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.includes('app=1')) return;
      const next = withAppQuery(href);
      if (next !== href) a.setAttribute('href', next);
    });
  }

  function bindLiveCards(root) {
    (root || document).querySelectorAll('.social-live-card[data-href]').forEach((el) => {
      if (el.dataset.liveBound === '1') return;
      el.dataset.liveBound = '1';
      const go = (e) => {
        if (e?.target?.closest?.('a, button')) return;
        if (e) e.preventDefault();
        const href = withAppQuery(el.dataset.href);
        if (href) {
          try {
            const u = new URL(href, location.origin);
            const channel = u.searchParams.get('channel') || '';
            const name =
              el.querySelector('.name')?.textContent?.replace(/^\s*🇮🇳\s*/, '').trim() ||
              el.querySelector('img')?.alt ||
              'Host';
            const image = el.querySelector('img')?.src || '';
            if (channel && image) {
              sessionStorage.setItem(
                'ap_live_launch_cover',
                JSON.stringify({ channel, name, image, ts: Date.now() })
              );
            }
            /* Capture the tap gesture so live room can unmute without "Tap for sound" */
            sessionStorage.setItem('ap_audio_gesture', String(Date.now()));
            try {
              const Ctx = window.AudioContext || window.webkitAudioContext;
              if (Ctx) {
                const ctx = window.__apLiveAudioCtx || (window.__apLiveAudioCtx = new Ctx());
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
              }
            } catch (_audioE) {}
          } catch (_e) {}
          window.location.href = href;
        }
      };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go(e);
      });
    });
  }

  function bindFilterChips() {
    document.querySelectorAll('.social-filter-chips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.social-filter-chips .chip').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        if (btn.dataset.chip === 'Global') window.location.href = withAppQuery('/services.html');
      });
    });
  }

  /** Active live/party rooms only — never fake workers or mock cards */
  async function fetchActiveRooms(limit = 12, opts = {}) {
    const party = opts && opts.party;
    const roomType = party ? 'party' : 'live';
    const sort = opts.sort || 'trending';
    const path = `/live/rooms?type=${roomType}&limit=${limit}&sort=${sort}`;
    let lastError = null;

    function parseRoomsPayload(res) {
      if (Array.isArray(res?.data)) return res.data;
      if (Array.isArray(res?.data?.data)) return res.data.data;
      if (Array.isArray(res?.rooms)) return res.rooms;
      if (Array.isArray(res)) return res;
      return [];
    }

    async function publicRoomsFetch() {
      const bases = [
        window.AP_SERVICES_API_ROOT,
        window.AP_CONFIG?.PRODUCTION_API_URL,
        'https://api.apservices.in/api',
      ].filter(Boolean);
      let lastFail = null;
      for (const base of bases) {
        try {
          const url = `${String(base).replace(/\/+$/, '')}${path}`;
          const r = await fetch(url, {
            credentials: 'omit',
            cache: 'default',
            mode: 'cors',
            headers: { Accept: 'application/json' },
          });
          const text = await r.text();
          let res = null;
          try {
            res = text ? JSON.parse(text) : null;
          } catch (_e) {
            lastFail = new Error(`Invalid rooms response (${r.status})`);
            continue;
          }
          if (!r.ok) {
            lastFail = new Error(res?.message || `HTTP ${r.status}`);
            continue;
          }
          return parseRoomsPayload(res);
        } catch (e) {
          lastFail = e;
        }
      }
      if (lastFail) throw lastFail;
      return [];
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let rows = [];
        /* Prefer public fetch first — skips Auth.ensureAccessToken on Live open */
        try {
          rows = await publicRoomsFetch();
        } catch (pubErr) {
          lastError = pubErr;
          if (window.API?.get) {
            const res = await Promise.race([
              API.get(path),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Rooms request timed out')), 8000)
              ),
            ]);
            rows = parseRoomsPayload(res);
          } else {
            throw pubErr;
          }
        }
        /* Do not await photo enrich — Live grid must paint immediately */
        const filtered = normalizeRoomRows(rows, party);
        const rooms = filtered.map((r) => mapRoomToCard(r, party));
        enrichRoomsWithHostPhotos(rows)
          .then((enriched) => {
            try {
              const nicer = normalizeRoomRows(enriched, party).map((r) => mapRoomToCard(r, party));
              if (nicer.length) writeRoomsCache(roomsCacheKey({ party, sort }, limit || 12), nicer);
            } catch (_e) { /* ignore */ }
          })
          .catch(() => {});
        return { rooms, error: null };
      } catch (e) {
        lastError = e;
        console.warn(`SocialShell: active rooms API attempt ${attempt + 1}`, e);
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }

    try {
      const rows = await publicRoomsFetch();
      const filtered = normalizeRoomRows(rows, party);
      return { rooms: filtered.map((row) => mapRoomToCard(row, party)), error: null };
    } catch (e2) {
      lastError = e2;
    }

    console.warn('SocialShell: active rooms API failed', lastError);
    return { rooms: [], error: lastError || new Error('Could not load rooms') };
  }

  async function fetchPros(limit = 12) {
    try {
      const res = await API.get(`/workers?limit=${limit}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (rows.length) {
        return rows.map((w, i) => ({
          id: w.user_id || w.id,
          userId: w.user_id || w.id,
          workerId: w.id,
          name: `${w.first_name || ''} ${w.last_name || ''}`.trim() || 'Professional',
          category: w.category || 'Home services',
          image:
            getImageUrl(w.profile_pic) ||
            coverFallback(`${w.first_name || ''} ${w.last_name || ''}`.trim() || 'Pro', false),
          viewers: 0,
          tag: pickTag(i),
        }));
      }
    } catch (e) {
      console.warn('SocialShell: workers API', e);
    }
    return [];
  }

  const gridScrollState = {};
  const ROOMS_CACHE_MS = 120000; /* fresh window */
  const ROOMS_STALE_MS = 15 * 60 * 1000; /* still paint instantly up to 15m */
  let exploreCountsTimer = null;

  function roomsCacheKey(opts, limit) {
    const party = opts && opts.party ? 'party' : 'live';
    const sort = (opts && opts.sort) || 'trending';
    return `ap_rooms_v1_${party}_${sort}_${limit || 12}`;
  }

  function readRoomsCache(key, { allowStale = false } = {}) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      const age = Date.now() - Number(parsed.at || 0);
      if (age > ROOMS_STALE_MS) return null;
      if (!allowStale && age > ROOMS_CACHE_MS) return null;
      return parsed;
    } catch (_e) {
      return null;
    }
  }

  function writeRoomsCache(key, rooms) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), rooms: rooms || [] }));
    } catch (_e) { /* ignore */ }
  }

  function renderExploreSkeletonGrid(count = 8) {
    const cards = Array.from({ length: count }, () => `
      <article class="social-live-card social-live-card--skeleton" aria-hidden="true">
        <div class="social-skeleton-cover"></div>
        <div class="social-skeleton-line social-skeleton-line--short"></div>
        <div class="social-skeleton-line"></div>
      </article>`).join('');
    return `<div class="social-grid social-grid-cards social-grid--skeleton">${cards}</div>`;
  }

  function dedupeRoomCards(rooms) {
    const seen = new Set();
    return (rooms || []).filter((r) => {
      const key = String(r.channel || r.id || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function paintExploreRooms(grid, rooms, opts, limit) {
    if (!grid) return;
    const unique = dedupeRoomCards(rooms);
    grid.classList.remove('is-loading', 'is-empty');
    grid.classList.add('has-rooms');
    grid.innerHTML =
      renderExploreFeedHead(opts && opts.party, unique.length) +
      renderExploreCardsHtml(unique, opts);
    bindLiveCards(grid);
    if (window.SocialUI?.bindAvatarFallbacks) SocialUI.bindAvatarFallbacks(grid);
    if (!grid.dataset.infiniteBound) {
      bindGridInfiniteScroll(grid.id, limit || 12, opts);
    }
    syncExploreFloatingActions(true, opts);
    if (!opts.party) setExploreTabCount('explore', unique.length);
    else setExploreTabCount('party', unique.length);
  }


  function gridStateKey(gridId, opts = {}) {
    return `${gridId}:${opts.sort || 'trending'}:${opts.party ? 'party' : 'live'}`;
  }

  function bindGridInfiniteScroll(gridId, limit, opts) {
    const grid = document.getElementById(gridId);
    if (!grid || grid.dataset.infiniteBound === '1') return;
    grid.dataset.infiniteBound = '1';
    const sentinel = document.createElement('div');
    sentinel.className = 'social-grid-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    grid.after(sentinel);
    const key = gridStateKey(gridId, opts);
    if (!gridScrollState[key]) gridScrollState[key] = { limit: limit || 12, loading: false };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const st = gridScrollState[key];
        if (st.loading) return;
        st.limit += limit || 12;
        fillGrid(gridId, st.limit, { ...opts, append: true });
      },
      { rootMargin: '240px' }
    );
    observer.observe(sentinel);
  }

  async function fillGrid(gridId, limit, opts = {}) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const key = gridStateKey(gridId, opts);
    const cacheKey = roomsCacheKey(opts, limit || 12);
    if (!gridScrollState[key]) gridScrollState[key] = { limit: limit || 12, loading: false, gen: 0 };
    const st = gridScrollState[key];
    if (st.loading && opts.append) return;
    const myGen = (st.gen = (st.gen || 0) + 1);
    st.loading = true;
    /* Instagram-style: paint last rooms instantly, refresh in background */
    let paintedFromCache = false;
    if (!opts.append) {
      const warm = readRoomsCache(cacheKey, { allowStale: true });
      if (warm?.rooms?.length) {
        paintExploreRooms(grid, warm.rooms, opts, limit || st.limit);
        paintedFromCache = true;
      } else {
        grid.classList.remove('is-empty', 'has-rooms');
        grid.classList.add('is-loading');
        grid.innerHTML = renderExploreSkeletonGrid(6);
        syncExploreFloatingActions(false, opts);
      }
    }
    try {
      const { rooms, error } = await fetchActiveRooms(limit || st.limit, opts);
      if (myGen !== st.gen) return;
      if (opts.loadToken != null && opts.loadToken !== window.__exploreGridToken) {
        return;
      }
      const liveGrid = document.getElementById(gridId) || grid;
      liveGrid.classList.remove('is-loading');
      const unique = dedupeRoomCards(rooms);
      if (!unique.length) {
        if (!opts.append && !paintedFromCache) {
          liveGrid.classList.add('is-empty');
          liveGrid.classList.remove('has-rooms');
          const altHint = error ? '' : await emptyStateAltHint(Boolean(opts.party));
          if (myGen !== st.gen) return;
          liveGrid.innerHTML = renderEmptyLiveGrid(opts && opts.party, {
            error: Boolean(error),
            altHint,
          });
          bindEmptyLiveGrid(liveGrid, opts);
          syncExploreFloatingActions(false, opts);
        }
        return;
      }
      writeRoomsCache(cacheKey, unique);
      paintExploreRooms(liveGrid, unique, opts, limit || st.limit);
    } catch (e) {
      console.warn('SocialShell: fillGrid', e);
      if (myGen !== st.gen) return;
      const liveGrid = document.getElementById(gridId) || grid;
      liveGrid.classList.remove('is-loading');
      if (paintedFromCache) return;
      const cached = readRoomsCache(cacheKey, { allowStale: true });
      if (!opts.append && cached?.rooms?.length) {
        paintExploreRooms(liveGrid, cached.rooms, opts, limit || st.limit);
        return;
      }
      if (!opts.append && !liveGrid.querySelector('.social-live-card:not(.social-live-card--skeleton)')) {
        liveGrid.classList.add('is-empty');
        liveGrid.classList.remove('has-rooms');
        liveGrid.innerHTML = renderEmptyLiveGrid(opts && opts.party, { error: true });
        bindEmptyLiveGrid(liveGrid, opts);
        syncExploreFloatingActions(false, opts);
      }
    } finally {
      if (myGen === st.gen) st.loading = false;
    }
  }

  function setExploreTabCount(tab, count) {
    const btn = document.querySelector(`#exploreTabs button[data-tab="${tab}"]`);
    if (!btn) return;
    let badge = btn.querySelector('.explore-tab-count');
    const n = Math.max(0, Number(count) || 0);
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'explore-tab-count';
        btn.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
    } else if (badge) {
      badge.hidden = true;
    }
  }

  function scheduleExploreTabCounts() {
    if (!document.body.classList.contains('social-explore-page')) return;
    clearTimeout(exploreCountsTimer);
    exploreCountsTimer = setTimeout(() => updateExploreTabCounts(), 3000);
  }

  async function updateExploreTabCounts() {
    if (!document.body.classList.contains('social-explore-page')) return;
    try {
      const [liveRes, partyRes] = await Promise.all([
        API.get('/live/rooms?type=live&limit=20&sort=trending'),
        API.get('/live/rooms?type=party&limit=20&sort=trending'),
      ]);
      const liveRows = Array.isArray(liveRes?.data) ? liveRes.data : [];
      const partyRows = Array.isArray(partyRes?.data) ? partyRes.data : [];
      const liveCount = normalizeRoomRows(liveRows, false).length;
      const partyCount = normalizeRoomRows(partyRows, true).length;
      setExploreTabCount('explore', liveCount);
      setExploreTabCount('party', partyCount);
    } catch (_e) {}
  }

  function markNativeApp() {
    if (isImmersiveLivePage()) return;
    document.documentElement.classList.add('social-app', 'social-native');
    if (window.ReactNativeWebView || window.Capacitor) {
      document.documentElement.classList.add('ap-expo-app');
    }
  }

  function mountLivePipBar() {
    if (document.body?.dataset?.livePage) return;
    if (document.getElementById('apLiveMiniPlayer')) return;
    try {
      if (window.parent !== window && window.parent.LiveSession?.isMinimized?.()) return;
      if (window.parent !== window && window.parent.document?.getElementById('apLiveMiniPlayer')) return;
    } catch (_e) {}
    if (window.LiveSession?.isMinimized?.()) return;
    if (window.LiveSession?.mountLegacyPipBar) {
      window.LiveSession.mountLegacyPipBar();
      return;
    }
    let raw;
    try {
      raw = localStorage.getItem('ap_live_active_session') || sessionStorage.getItem('ap_live_pip_session');
    } catch (_e) {}
    if (!raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_e) {
      return;
    }
    if (data?.expiresAt && Date.now() > data.expiresAt) {
      try {
        localStorage.removeItem('ap_live_active_session');
        sessionStorage.removeItem('ap_live_pip_session');
      } catch (_e) {}
      return;
    }
    if (!data?.url || document.getElementById('apLivePipBar')) return;
    const label = data.host || (data.type === 'party-room' ? 'Party' : 'Live');
    const bar = document.createElement('div');
    bar.id = 'apLivePipBar';
    bar.className = 'ap-live-pip-bar';
    bar.innerHTML =
      '<button type="button" class="ap-live-pip-expand" id="apLivePipExpand">' +
      '<span class="ap-live-pip-pulse" aria-hidden="true"></span>' +
      '<span class="ap-live-pip-text"><strong>' +
      escapeHtml(label) +
      '</strong><small>Tap to return to ' +
      (data.type === 'party-room' ? 'party' : 'live') +
      '</small></span></button>' +
      '<button type="button" class="ap-live-pip-close" id="apLivePipClose" aria-label="Dismiss"><i class="fas fa-times"></i></button>';
    document.body.appendChild(bar);
    document.getElementById('apLivePipExpand')?.addEventListener('click', () => {
      location.href = data.url;
    });
    document.getElementById('apLivePipClose')?.addEventListener('click', () => {
      try {
        sessionStorage.removeItem('ap_live_pip_session');
        localStorage.removeItem('ap_live_active_session');
      } catch (_e) {}
      bar.remove();
    });
  }

  function initPage(config) {
    markNativeApp();
    mountLivePipBar();
    const active = config.activeNav || 'explore';
    ensureBottomNav(active);

    const chipsMount = document.getElementById('social-filter-chips-mount');
    if (chipsMount && !document.body.classList.contains('social-explore-page')) {
      chipsMount.innerHTML = renderFilterChips(config.activeChip || 'Popular');
      bindFilterChips();
    } else if (chipsMount) {
      chipsMount.innerHTML = '';
      chipsMount.hidden = true;
    }

    if (config.gridId) {
      fillGrid(config.gridId, config.gridLimit || 12, {
        party: config.partyGrid,
        sort: config.sort || 'trending',
      });
    }

    document.querySelectorAll('[data-social-search]').forEach((input) => {
      let searchTimer;
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          const q = input.value.trim();
          const activeTab =
            document.querySelector('#exploreTabs button.active')?.dataset?.tab ||
            document.querySelector('#exploreTabs a.active')?.dataset?.tab ||
            new URLSearchParams(location.search).get('tab');
          if (activeTab === 'following') {
            await fillFollowingView(q);
            return;
          }
          if (q.length >= 2) {
            const mount = document.getElementById('exploreContent') || document.getElementById('exploreEmpty');
            if (mount) {
              mount.style.display = 'block';
              mount.innerHTML = '<div class="social-search-loading">Searching…</div>';
              const data = await runGlobalSearch(q, { type: activeTab === 'party' ? 'party' : 'all' });
              renderSearchResults(mount, data, q);
              return;
            }
          }
          if (activeTab) await fillDiscoveryTab(activeTab, q);
        }, 300);
      });
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const q = input.value.trim();
        const activeTab = document.querySelector('#exploreTabs a.active')?.dataset?.tab;
        if (activeTab === 'following' || new URLSearchParams(location.search).get('tab') === 'following') {
          e.preventDefault();
          await fillFollowingView(q);
          return;
        }
        window.location.href = q
          ? `/services.html?search=${encodeURIComponent(q)}&app=1`
          : '/services.html?app=1';
      });
    });

    const startLive = document.getElementById('social-start-live');
    if (startLive) {
      startLive.addEventListener('click', (e) => {
        e.preventDefault();
        openBroadcastPicker();
      });
    }
    const startParty = document.getElementById('social-start-party');
    if (startParty) {
      startParty.addEventListener('click', (e) => {
        e.preventDefault();
        goStartParty();
      });
    }

    const bannerMount = document.getElementById('social-banner-slider');
    if (bannerMount && window.SocialBannerSlider && !document.body.classList.contains('social-explore-page')) {
      SocialBannerSlider.mount(bannerMount);
    }

    if (config.squareFeed) fillSquareFeed();

    if (window.SocialNav) {
      SocialNav.registerRefresh(async () => {
        if (config.gridId) {
          await fillGrid(config.gridId, config.gridLimit || 12, {
            party: config.partyGrid,
            sort: config.sort || 'trending',
          });
        }
        if (config.squareFeed) await fillSquareFeed();
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'following') await fillFollowingView();
        if (tab === 'party') {
          await fillGrid(config.gridId || 'exploreGrid', config.gridLimit || 12, { party: true });
        }
      });
    }
    if (config.reelsId) initReels(config.reelsId);
    if (config.emptyState) renderEmptyState(config.emptyState);
    if (window.SocialCreatePost) SocialCreatePost.bindCameraButtons();
    if (window.SocialUI) SocialUI.bindAvatarFallbacks(document);

    bindLiveCards(document);
  }

  const FOLLOWING_CACHE_KEY = 'ap_following_tab_v1';
  const FOLLOWING_CACHE_FRESH_MS = 60_000;
  const FOLLOWING_CACHE_PAINT_MS = 15 * 60_000;

  function readFollowingCache() {
    try {
      const raw = sessionStorage.getItem(FOLLOWING_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.following)) return null;
      return parsed;
    } catch (_e) {
      return null;
    }
  }

  function writeFollowingCache(following, liveRows) {
    try {
      sessionStorage.setItem(
        FOLLOWING_CACHE_KEY,
        JSON.stringify({
          t: Date.now(),
          following: following || [],
          live: liveRows || [],
        })
      );
    } catch (_e) { /* ignore */ }
  }

  async function fillFollowingView(searchQuery) {
    const mount = document.getElementById('exploreEmpty');
    const content = document.getElementById('exploreContent');
    if (!mount) return;

    if (content) {
      content.style.display = 'none';
      content.innerHTML = '<div class="social-explore-mount" id="exploreGrid"></div>';
    }
    mount.style.display = 'block';

    const loggedIn = window.Auth?.hasSession?.() || localStorage.getItem('user');
    if (!loggedIn) {
      mount.innerHTML =
        '<div class="social-empty-state"><p>Sign in to see people you follow.</p><a href="/app-auth.html?app=1" class="btn-open">Sign in</a></div>';
      return;
    }

    const cached = readFollowingCache();
    const cacheAge = cached ? Date.now() - Number(cached.t || 0) : Infinity;
    if (!(cached?.following?.length) || cacheAge >= FOLLOWING_CACHE_PAINT_MS) {
      mount.innerHTML =
        '<div class="social-empty-state"><p><i class="fas fa-spinner fa-spin"></i> Loading following…</p></div>';
    }

    try {
      if (window.Auth?.ensureAccessToken) {
        await Promise.race([
          Auth.ensureAccessToken(),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      }
    } catch (_e) {}

    let following = Array.isArray(cached?.following) ? cached.following.slice() : [];
    let followLoadError = '';
    let liveRows = Array.isArray(cached?.live) ? cached.live.slice() : [];

    /* Reuse cached list while network refresh runs (or skip network if fresh) */
    if (following.length && cacheAge < FOLLOWING_CACHE_PAINT_MS) {
      /* keep spinner off — previous paint or empty until render below */
    }

    const skipNetwork = cached && cacheAge < FOLLOWING_CACHE_FRESH_MS && !searchQuery;
    if (!skipNetwork) {
      try {
        const [followRes, liveRes] = await Promise.all([
          API.get('/social/following?limit=200').catch((e) => {
            followLoadError = String(e?.message || 'Could not load following');
            return null;
          }),
          API.get('/social/following/live').catch(() => null),
        ]);
        if (Array.isArray(followRes?.data)) following = followRes.data;
        if (Array.isArray(liveRes?.data)) liveRows = liveRes.data;
      } catch (e) {
        console.warn('SocialShell: following APIs', e);
        followLoadError = String(e?.message || 'Could not load following');
      }
    }

    if (!following.length && window.SocialInteractions?.getFollowingList) {
      following = SocialInteractions.getFollowingList().map((e) => ({
        id: e.id || e.key,
        first_name: e.name,
        last_name: '',
      }));
    }

    const liveMap = new Map();
    liveRows.forEach((r) => {
      if (r?.id) liveMap.set(String(r.id), r);
    });

    if (!followLoadError && !skipNetwork) writeFollowingCache(following, liveRows);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      following = following.filter((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
        return name.includes(q) || String(u.id || '').toLowerCase().includes(q);
      });
    }

    if (!following.length) {
      if (followLoadError && /auth|sign in|token|401/i.test(followLoadError)) {
        mount.innerHTML =
          '<div class="social-empty-state"><p>Session expired.</p><a href="/app-auth.html?app=1&redirect=' +
          encodeURIComponent(location.pathname + location.search) +
          '" class="btn-open">Sign in again</a></div>';
        return;
      }
      if (followLoadError) {
        mount.innerHTML =
          '<div class="social-empty-state"><p>' +
          escapeHtml(followLoadError) +
          '</p><button type="button" class="btn-open" id="followingRetry">Retry</button></div>';
        document.getElementById('followingRetry')?.addEventListener('click', () => fillFollowingView());
        return;
      }
      mount.innerHTML = searchQuery
        ? `<div class="social-empty-state"><p>No following match "${escapeHtml(searchQuery)}".</p></div>`
        : `<div class="social-empty-state"><p>You haven't followed anyone yet.</p><a href="/discover-creators.html?app=1" class="btn-open">Discover creators</a></div>`;
      return;
    }

    following.sort((a, b) => {
      const aLive = liveMap.has(String(a.id)) ? 1 : 0;
      const bLive = liveMap.has(String(b.id)) ? 1 : 0;
      return bLive - aLive;
    });

    const liveCards = [];
    const offlineRows = [];

    following.forEach((u) => {
      const uid = String(u.id);
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User';
      const live = liveMap.get(uid);
      const photo = hostCardImage(name, u.profile_pic, u.updated_at, false);
      if (live?.channel) {
        const isParty =
          String(live.channel).startsWith('party-') || String(live.room_type || '').toLowerCase() === 'party';
        liveCards.push({
          id: live.channel,
          channel: live.channel,
          userId: uid,
          name,
          hostProfilePic: u.profile_pic || null,
          image: photo,
          viewers: live.viewer_count || 0,
          tag: isParty ? 'Party' : 'Live',
          party: isParty,
          live: true,
        });
        return;
      }
      offlineRows.push({ uid, name, photo });
    });

    const partyLive = liveCards.filter((p) => p.party);
    const videoLive = liveCards.filter((p) => !p.party);

    const renderSection = (title, cards, party) => {
      if (!cards.length) return '';
      const html = cards.map((p, i) => renderLiveCard(p, i, { party })).join('');
      return `<p class="social-following-section-title">${title}</p><div class="social-grid social-following-live-grid">${html}</div>`;
    };

    const liveHtml =
      renderSection('<i class="fas fa-video"></i> Live now', videoLive, false) +
      renderSection('<i class="fas fa-microphone-lines"></i> In party', partyLive, true);
    const offlineHtml = offlineRows.length
      ? `<div class="social-following-offline-section">
          <p class="social-following-section-title">${liveCards.length ? 'Offline' : 'People you follow'}</p>
          <div class="social-following-offline-list">
            ${offlineRows
              .map((row) => {
                const profileHref = withAppQuery(
                  `/creator-profile.html?userId=${encodeURIComponent(row.uid)}&name=${encodeURIComponent(row.name)}`
                );
                return `<a href="${profileHref}" class="social-following-offline-row">
                  <img src="${row.photo.replace(/"/g, '&quot;')}" alt="">
                  <span class="social-following-offline-name">${escapeHtml(row.name)}</span>
                  <small>View profile</small>
                  <i class="fas fa-chevron-right"></i>
                </a>`;
              })
              .join('')}
          </div>
        </div>`
      : '';

    const liveSection = liveCards.length ? liveHtml : '';

    if (!liveCards.length && offlineRows.length) {
      mount.innerHTML = `<div class="social-following-wrap">
        <p class="social-following-section-title social-following-none-live">No one you follow is live right now</p>
        ${offlineHtml}
      </div>`;
    } else {
      mount.innerHTML = `<div class="social-following-wrap">${liveSection}${offlineHtml}</div>`;
    }
    mount.querySelectorAll('.social-following-live-grid').forEach((g) => {
      bindLiveCards(g);
      if (window.SocialUI?.bindAvatarFallbacks) SocialUI.bindAvatarFallbacks(g);
    });
    if (!mount.querySelector('.social-following-live-grid')) {
      bindLiveCards(mount);
      if (window.SocialUI?.bindAvatarFallbacks) SocialUI.bindAvatarFallbacks(mount);
    }
  }

  async function fillDiscoveryTab(tab, searchQuery) {
    const mount = document.getElementById('exploreEmpty');
    const content = document.getElementById('exploreContent');
    const sort = tab === 'new' ? 'new' : tab === 'nearby' ? 'nearby' : 'trending';
    if (content) content.style.display = 'block';
    if (mount) mount.style.display = 'none';
    if (searchQuery && searchQuery.length >= 2) {
      const target = content || mount;
      if (target) {
        target.style.display = 'block';
        target.innerHTML = '<div class="social-search-loading">Searching…</div>';
        const data = await runGlobalSearch(searchQuery, {
          type: tab === 'party' ? 'party' : tab === 'live' ? 'live' : 'all',
        });
        renderSearchResults(target, data, searchQuery);
        return;
      }
    }
    let grid = document.getElementById('exploreGrid');
    if (!grid && content) {
      grid = document.createElement('div');
      grid.id = 'exploreGrid';
      grid.className = 'social-explore-mount';
      content.appendChild(grid);
    }
    if (!grid) return;
    await fillGrid('exploreGrid', 12, { sort, party: false });
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      [...grid.querySelectorAll('.social-live-card')].forEach((card) => {
        const name = (card.querySelector('.social-card-name')?.textContent || '').toLowerCase();
        card.style.display = name.includes(q) ? '' : 'none';
      });
    }
  }

  function goToStreamerCenter() {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    window.location.href = '/streamer-center.html?app=1';
  }

  function goStartLive() {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    openBroadcastPicker('live');
  }

  function savePendingStreamMeta({ streamTitle, streamCoverUrl } = {}) {
    try {
      const payload = {
        streamTitle: String(streamTitle || '').trim().slice(0, 48) || null,
        streamCoverUrl: String(streamCoverUrl || '').trim().slice(0, 700) || null,
        ts: Date.now(),
      };
      if (!payload.streamTitle && !payload.streamCoverUrl) {
        sessionStorage.removeItem('ap_live_stream_meta');
        return;
      }
      sessionStorage.setItem('ap_live_stream_meta', JSON.stringify(payload));
    } catch (_e) { /* ignore */ }
  }

  function collectStreamMetaFromSheet(el) {
    const title = el?.querySelector('[data-live-title]')?.value;
    const cover = el?.querySelector('[data-live-cover]')?.value;
    savePendingStreamMeta({ streamTitle: title, streamCoverUrl: cover });
  }

  function goStartLiveBroadcast(opts) {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    const mode = opts?.mode || 'video';
    const isParty = Boolean(opts?.party);
    if (!opts?.confirmed) {
      const label = isParty ? 'Start a voice party as host?' : 'Start a live broadcast as host?';
      const detail = isParty
        ? 'You will be the party host. Guests join as listeners unless you approve their mic requests.'
        : 'You will be the host. Viewers can watch, chat, and send gifts.';
      if (!window.confirm(label + '\n\n' + detail)) return;
      opts = { ...(opts || {}), confirmed: true };
    }
    const proceed = () => {
      const topic = opts?.topic != null ? '&topic=' + encodeURIComponent(opts.topic) : '';
      const base = String(user.id || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
      if (isParty) {
        const channel = opts?.channel || 'party-' + base + '-' + Date.now().toString(36).slice(-6);
        window.location.href =
          '/party-room.html?host=1&channel=' + encodeURIComponent(channel) + topic + '&app=1';
        return;
      }
      const channel = 'live-' + base + '-' + Date.now().toString(36).slice(-6);
      const filterId = opts?.filter || readSavedBeautyFilter();
      const filterQ =
        mode === 'video' && filterId && filterId !== 'none'
          ? '&filter=' + encodeURIComponent(filterId)
          : '';
      window.location.href =
        '/live-room.html?host=1&mode=' +
        encodeURIComponent(mode) +
        '&channel=' +
        encodeURIComponent(channel) +
        topic +
        filterQ +
        '&app=1';
    };
    if (mode === 'video' && !isParty && !opts?.skipVerify) {
      const api = window.API || window.Auth?.api;
      const fetchStatus = api?.getFresh || api?.get;
      if (typeof fetchStatus === 'function') {
        fetchStatus
          .call(api, '/live/access-status')
          .then((res) => {
            const data = res?.data?.data || res?.data || res || {};
            const ok =
              data.canStreamVideo === true ||
              (data.faceVerified === true && data.identityVerified === true);
            if (!ok) {
              const ret = encodeURIComponent(
                '/streamer-center.html?app=1&goLive=video'
              );
              window.location.href = '/live-verify.html?redirect=' + ret + '&app=1';
              return;
            }
            proceed();
          })
          .catch(() => proceed());
        return;
      }
    }
    proceed();
  }

  /** Voice party room — multi-seat audio grid */
  function goStartParty(opts) {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    goStartLiveBroadcast({ ...(opts || {}), party: true, mode: 'audio' });
  }

  function ensureBroadcastOverlay() {
    let el = document.getElementById('social-broadcast-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'social-broadcast-overlay';
    el.className = 'social-broadcast-overlay';
    document.body.appendChild(el);
    return el;
  }

  const PRELIVE_FILTERS = [
    { id: 'none', label: 'Original', swatch: 'linear-gradient(145deg,#3f3f46,#18181b)' },
    { id: 'natural', label: 'Natural', swatch: 'linear-gradient(145deg,#f5d0c5,#e8b4a0)' },
    { id: 'glow', label: 'Glow', swatch: 'linear-gradient(145deg,#fff7ed,#fdba74)' },
    { id: 'silk', label: 'Silk', swatch: 'linear-gradient(145deg,#fce7f3,#f9a8d4)' },
    { id: 'velvet', label: 'Velvet', swatch: 'linear-gradient(145deg,#e0e7ff,#a5b4fc)' },
    { id: 'glam', label: 'Glam', swatch: 'linear-gradient(145deg,#fdf2f8,#fb7185)' },
    { id: 'rose', label: 'Rose', swatch: 'linear-gradient(145deg,#ffe4e6,#fb7185)' },
    { id: 'golden', label: 'Golden', swatch: 'linear-gradient(145deg,#fef3c7,#f59e0b)' },
    { id: 'fresh', label: 'Fresh', swatch: 'linear-gradient(145deg,#ecfdf5,#34d399)' },
    { id: 'dream', label: 'Dream', swatch: 'linear-gradient(145deg,#ede9fe,#a78bfa)' },
  ];

  const PRELIVE_FILTER_CSS = {
    none: '',
    natural: 'brightness(1.06) contrast(0.96) saturate(1.08)',
    glow: 'brightness(1.12) contrast(0.92) saturate(1.12)',
    silk: 'brightness(1.1) contrast(0.94) saturate(1.05)',
    velvet: 'brightness(1.08) contrast(0.97) saturate(1.1)',
    glam: 'brightness(1.1) contrast(1.02) saturate(1.18)',
    rose: 'brightness(1.08) contrast(0.98) saturate(1.15) hue-rotate(-6deg)',
    golden: 'brightness(1.1) contrast(0.95) saturate(1.2) sepia(0.12)',
    fresh: 'brightness(1.08) contrast(0.98) saturate(1.12) hue-rotate(8deg)',
    dream: 'brightness(1.06) contrast(0.9) saturate(1.08) blur(0.2px)',
  };

  function readSavedBeautyFilter() {
    try {
      const raw = localStorage.getItem('ap_live_beauty_filter');
      if (raw === 'natural' && !localStorage.getItem('ap_live_beauty_filter_picked')) {
        localStorage.setItem('ap_live_beauty_filter', 'none');
        return 'none';
      }
      return raw || 'none';
    } catch (_e) {
      return 'none';
    }
  }

  function saveBeautyFilter(id) {
    try {
      localStorage.setItem('ap_live_beauty_filter', id);
      localStorage.setItem('ap_live_beauty_filter_picked', '1');
    } catch (_e) {}
  }

  function stopPrelivePreview(el) {
    const video = el?.querySelector?.('#prelivePreviewVideo');
    const stream = video?.srcObject;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }

  async function openPreliveFilterStep(opts, el) {
    let selected = readSavedBeautyFilter();
    if (!PRELIVE_FILTERS.some((f) => f.id === selected)) selected = 'none';

    el.classList.add('is-prelive');
    el.innerHTML = `
      <div class="social-broadcast-sheet social-prelive-sheet">
        <div class="social-prelive-stage">
          <video id="prelivePreviewVideo" playsinline muted autoplay></video>
          <div class="social-prelive-scrim social-prelive-scrim-top" aria-hidden="true"></div>
          <div class="social-prelive-scrim social-prelive-scrim-bottom" aria-hidden="true"></div>
          <header class="social-prelive-top">
            <button type="button" class="social-prelive-icon-btn" data-prelive-back aria-label="Back">
              <i class="fas fa-chevron-left"></i>
            </button>
            <div class="social-prelive-title">
              <strong>Ready to go live</strong>
              <span>Pick a look for your camera</span>
            </div>
            <span class="social-prelive-live-pill"><i class="fas fa-circle"></i> Preview</span>
          </header>
          <div class="social-prelive-bottom">
            <div class="social-prelive-filters" id="preliveFilterRail"></div>
            <button type="button" class="social-prelive-go" data-prelive-go>
              <i class="fas fa-video"></i>
              <span>Go live</span>
            </button>
          </div>
        </div>
      </div>`;

    const rail = el.querySelector('#preliveFilterRail');
    const video = el.querySelector('#prelivePreviewVideo');

    function paintRail() {
      rail.innerHTML = PRELIVE_FILTERS.map(
        (f) => `<button type="button" class="social-prelive-chip${f.id === selected ? ' is-active' : ''}" data-filter="${f.id}">
          <span class="social-prelive-swatch" style="background:${f.swatch}"></span>
          <span>${f.label}</span>
        </button>`
      ).join('');
      if (video) video.style.filter = PRELIVE_FILTER_CSS[selected] || '';
    }
    paintRail();
    rail.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      selected = btn.dataset.filter || 'none';
      saveBeautyFilter(selected);
      paintRail();
    });

    try {
      // Match live-room Agora/fallback constraints — forced 720x1280 crops/zooms too hard on phones.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.play?.().catch(() => {});
        video.style.filter = PRELIVE_FILTER_CSS[selected] || '';
      }
    } catch (_e) {
      const stage = el.querySelector('.social-prelive-stage');
      if (stage && !stage.querySelector('.social-prelive-fallback')) {
        const fb = document.createElement('div');
        fb.className = 'social-prelive-fallback';
        fb.textContent = 'Camera preview unavailable — filter still saves for live.';
        stage.appendChild(fb);
      }
    }

    el.querySelector('[data-prelive-back]')?.addEventListener('click', () => {
      stopPrelivePreview(el);
      el.classList.remove('is-prelive');
      openBroadcastPicker('live', opts);
    });
    el.querySelector('[data-prelive-go]')?.addEventListener('click', () => {
      saveBeautyFilter(selected);
      stopPrelivePreview(el);
      el.classList.remove('is-open', 'is-prelive');
      goStartLiveBroadcast({
        ...(opts || {}),
        mode: 'video',
        filter: selected,
        confirmed: true,
      });
    });
    el.onclick = (e) => {
      if (e.target === el) {
        stopPrelivePreview(el);
        el.classList.remove('is-open', 'is-prelive');
      }
    };
  }

  function openBroadcastPicker(kind, opts) {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    const el = ensureBroadcastOverlay();
    stopPrelivePreview(el);
    el.classList.remove('is-prelive');
    if (kind === 'party') {
      const defaultName = String(
        window.Auth?.getUser?.()?.display_name ||
          `${window.Auth?.getUser?.()?.first_name || ''} ${window.Auth?.getUser?.()?.last_name || ''}`.trim() ||
          window.Auth?.getUser?.()?.name ||
          ''
      ).trim();
      el.innerHTML = `
        <div class="social-broadcast-sheet">
          <h3>Start party</h3>
          <p>Set a party-only name &amp; cover (optional). Your profile name and photo stay unchanged.</p>
          <label class="social-broadcast-field">
            <span>Party name</span>
            <input type="text" data-live-title maxlength="48" placeholder="Name shown in this party" value="${defaultName.replace(/"/g, '&quot;')}">
          </label>
          <label class="social-broadcast-field">
            <span>Party cover URL (optional)</span>
            <input type="url" data-live-cover maxlength="700" placeholder="https://… image for this party only">
          </label>
          <div class="social-broadcast-options">
            <button type="button" class="social-broadcast-opt" data-go-party-start>
              <span class="ico party"><i class="fas fa-users"></i></span>
              <div><strong>Start voice party</strong><span>Multi-seat audio room</span></div>
            </button>
          </div>
          <button type="button" class="social-broadcast-cancel" data-broadcast-cancel>Cancel</button>
        </div>`;
      el.querySelector('[data-go-party-start]')?.addEventListener('click', () => {
        collectStreamMetaFromSheet(el);
        stopPrelivePreview(el);
        el.classList.remove('is-open');
        goStartParty({ ...(opts || {}), confirmed: true });
      });
      el.querySelector('[data-broadcast-cancel]')?.addEventListener('click', () => {
        stopPrelivePreview(el);
        el.classList.remove('is-open');
      });
      el.onclick = (e) => {
        if (e.target === el) {
          stopPrelivePreview(el);
          el.classList.remove('is-open');
        }
      };
      el.classList.add('is-open');
      return;
    }
    if (kind === 'live') {
      const defaultName = String(window.Auth?.getUser?.()?.display_name || window.Auth?.getUser?.()?.name || '').trim();
      el.innerHTML = `
        <div class="social-broadcast-sheet">
          <h3>Go live</h3>
          <p>Set a live-only name &amp; cover (optional). Your profile name and photo stay unchanged.</p>
          <label class="social-broadcast-field">
            <span>Live name</span>
            <input type="text" data-live-title maxlength="48" placeholder="Name shown on this live" value="${defaultName.replace(/"/g, '&quot;')}">
          </label>
          <label class="social-broadcast-field">
            <span>Live cover URL (optional)</span>
            <input type="url" data-live-cover maxlength="700" placeholder="https://… image for this stream only">
          </label>
          <div class="social-broadcast-options">
            <button type="button" class="social-broadcast-opt" data-go-live="video">
              <span class="ico video"><i class="fas fa-video"></i></span>
              <div><strong>Video + audio</strong><span>Choose beauty filter, then go live</span></div>
            </button>
            <button type="button" class="social-broadcast-opt" data-go-live="audio">
              <span class="ico audio"><i class="fas fa-microphone"></i></span>
              <div><strong>Audio only</strong><span>Voice live — no camera</span></div>
            </button>
          </div>
          <button type="button" class="social-broadcast-cancel" data-broadcast-cancel>Cancel</button>
        </div>`;
      el.querySelector('[data-go-live="video"]')?.addEventListener('click', () => {
        collectStreamMetaFromSheet(el);
        openPreliveFilterStep(opts, el);
      });
      el.querySelector('[data-go-live="audio"]')?.addEventListener('click', () => {
        collectStreamMetaFromSheet(el);
        stopPrelivePreview(el);
        el.classList.remove('is-open');
        goStartLiveBroadcast({ ...(opts || {}), mode: 'audio' });
      });
      el.querySelector('[data-broadcast-cancel]')?.addEventListener('click', () => {
        stopPrelivePreview(el);
        el.classList.remove('is-open');
      });
      el.onclick = (e) => {
        if (e.target === el) {
          stopPrelivePreview(el);
          el.classList.remove('is-open');
        }
      };
      el.classList.add('is-open');
      return;
    }
    el.innerHTML = `
        <div class="social-broadcast-sheet">
          <h3>Start broadcasting</h3>
          <p>Choose solo live video or a voice party room with seats.</p>
          <div class="social-broadcast-options">
            <button type="button" class="social-broadcast-opt" data-go-party>
              <span class="ico party"><i class="fas fa-users"></i></span>
              <div><strong>Party room</strong><span>Voice seats — invite guests on mic</span></div>
            </button>
            <button type="button" class="social-broadcast-opt" data-go-live="video">
              <span class="ico video"><i class="fas fa-video"></i></span>
              <div><strong>Video live</strong><span>Beauty filter → camera broadcast</span></div>
            </button>
            <button type="button" class="social-broadcast-opt" data-go-live="audio">
              <span class="ico audio"><i class="fas fa-microphone"></i></span>
              <div><strong>Audio live</strong><span>Voice only — no camera</span></div>
            </button>
          </div>
          <button type="button" class="social-broadcast-cancel" data-broadcast-cancel>Cancel</button>
        </div>`;
    el.querySelector('[data-go-party]')?.addEventListener('click', () => {
      stopPrelivePreview(el);
      el.classList.remove('is-open');
      goStartParty(opts);
    });
    el.querySelector('[data-go-live="video"]')?.addEventListener('click', () => {
      openPreliveFilterStep(opts, el);
    });
    el.querySelector('[data-go-live="audio"]')?.addEventListener('click', () => {
      stopPrelivePreview(el);
      el.classList.remove('is-open');
      goStartLiveBroadcast({ ...(opts || {}), mode: 'audio' });
    });
    el.querySelector('[data-broadcast-cancel]')?.addEventListener('click', () => {
      stopPrelivePreview(el);
      el.classList.remove('is-open');
    });
    el.onclick = (e) => {
      if (e.target === el) {
        stopPrelivePreview(el);
        el.classList.remove('is-open');
      }
    };
    el.classList.add('is-open');
  }

  function renderEmptyState(cfg) {
    const el = document.getElementById(cfg.mountId);
    if (!el) return;
    const type = cfg.type || 'following';
    if (type === 'following') {
      el.innerHTML = `
        <div class="social-empty-state">
          <div class="illus" style="font-size:64px">📺</div>
          <p>You haven't followed yet,<br>come to follow</p>
          <a href="/discover-creators.html?app=1" class="btn-open">Discover creators</a>
        </div>`;
    } else if (type === 'nearby') {
      el.innerHTML = `
        <div class="social-empty-state">
          <div class="illus" style="font-size:64px">📍</div>
          <p>Turn on the GPS service and meet nearby friends</p>
          <button type="button" class="btn-open" id="socialGpsOpen">Open</button>
        </div>`;
      document.getElementById('socialGpsOpen')?.addEventListener('click', () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(() => {
            window.location.reload();
          });
        }
      });
    } else {
      el.innerHTML = `
        <div class="social-empty-state">
          <div class="illus" style="font-size:64px">📦</div>
          <p>no more content</p>
        </div>`;
    }
  }

  async function fillSquareFeed() {
    if (window.SocialInteractions?.renderSquareFeed) {
      await SocialInteractions.renderSquareFeed('squareFeed', {
        feed: window.SocialInteractions.currentFeedScope?.() || 'for_you',
      });
      return;
    }
    const feed = document.getElementById('squareFeed');
    if (!feed) return;
    let posts = [];
    try {
      posts = JSON.parse(localStorage.getItem('social_posts') || '[]');
    } catch (_e) {}
    const pros = await fetchPros(6);
    if (!posts.length) {
      posts = pros.map((p, i) => ({
        id: 'm' + i,
        caption: i % 2 ? '😭😭😭😭' : 'Great service today! #APServices #home',
        userName: p.name,
        minsAgo: 1 + i * 3,
        likes: Math.floor(Math.random() * 50),
        comments: Math.floor(Math.random() * 10),
        image: p.image,
        isVideo: i % 2 === 0,
      }));
    }
    feed.innerHTML = posts
      .map(
        (p) => `
      <article class="social-post-card">
        <div class="social-post-media">
          <img src="${p.image || avatarFallback(p.userName)}" alt="">
          ${p.isVideo ? '<span class="play-badge"><i class="fas fa-play"></i></span>' : ''}
        </div>
        <div class="social-post-meta">${p.minsAgo || 1} mins ago</div>
        <div class="social-post-actions">
          <span><i class="far fa-heart"></i> ${p.likes || 0}</span>
          <span><i class="far fa-comment"></i> ${p.comments || 0}</span>
          <span><i class="fas fa-gift"></i></span>
          <span><i class="far fa-paper-plane"></i></span>
        </div>
        <div class="social-post-user">
          <img src="${p.image || avatarFallback(p.userName)}" alt="">
          <div>
            <div style="font-weight:700;font-size:14px">${p.userName} 🇮🇳 <span style="font-size:11px;background:#3b82f6;color:#fff;padding:2px 6px;border-radius:8px">18+</span></div>
            <div class="social-post-caption">${p.caption || ''}</div>
            <div class="social-post-translation">Translation</div>
          </div>
        </div>
      </article>`
      )
      .join('');
  }

  async function initReels(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const pros = await fetchPros(8);
    wrap.innerHTML = `
      <div class="social-reels-scroll">
        ${pros
          .map(
            (p, i) => `
          <section class="social-reel-slide" data-index="${i}" data-href="${p.id ? '/worker-profile.html?id=' + p.id : '/party.html'}">
            <img src="${p.image}" alt="">
          </section>`
          )
          .join('')}
      </div>`;
    wrap.querySelectorAll('.social-reel-slide').forEach((slide) => {
      slide.addEventListener('click', () => {
        const href = slide.dataset.href;
        if (href) window.location.href = withAppQuery(href);
      });
    });
  }

  function renderTopicsList(containerId) {
    if (window.SocialInteractions?.renderTopics) {
      SocialInteractions.renderTopics(containerId);
      return;
    }
    const list = document.getElementById(containerId);
    if (!list) return;
    const items = topics || [
      { title: '#Holi Video Collection Event', heat: 529819, ended: false, kind: 'topic' },
      { title: '#Jayfol Dance Challenge', heat: 412200, ended: false, kind: 'video' },
      { title: '#Home Pro Tips', heat: 210440, ended: true, kind: 'services' },
    ];
    list.innerHTML = items
      .map(
        (t, ti) => `
      <section class="social-topic-block">
        <div class="social-topic-head">
          <img src="${window.SocialInteractions?.topicPlaceholder ? SocialInteractions.topicPlaceholder(ti, t.title) : coverFallback(t.title, false)}" alt="">
          <div style="flex:1">
            <h3 style="font-size:15px;color:var(--gold-800);margin-bottom:6px">${t.title}</h3>
            <span class="social-flame"><i class="fas fa-fire"></i> ${t.heat}</span>
          </div>
          ${t.ended ? '<span style="color:#9ca3af;font-size:13px">ended</span>' : '<button type="button" class="social-join-btn" data-join-topic>join &gt;</button>'}
        </div>
        <div class="social-topic-videos">
          ${[0, 1, 2, 3]
            .map(
              (n) =>
                `<div class="thumb" data-go-video><img src="${coverFallback('Clip ' + (n + 1), false)}" alt=""><i class="fas fa-play" style="position:absolute;top:6px;right:6px;color:#fff;font-size:12px"></i></div>`
            )
            .join('')}
        </div>
      </section>`
      )
      .join('');
    list.querySelectorAll('[data-join-topic]').forEach((b) => {
      b.addEventListener('click', () => {
        window.location.href = withAppQuery('/video.html');
      });
    });
    list.querySelectorAll('[data-go-video]').forEach((b) => {
      b.addEventListener('click', () => {
        window.location.href = withAppQuery('/video.html');
      });
    });
  }

  function redirectToDashboard() {
    const user = window.Auth?.getUser?.() || (() => {
      try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
      } catch (_e) {
        return null;
      }
    })();
    if (!user) {
      window.location.href = withAppQuery('/app-auth.html');
      return;
    }
    const role = user.role || 'customer';
    const routes = {
      admin: '/admin-dashboard.html',
      super_admin: '/admin-dashboard.html',
      founder: '/admin-dashboard.html',
      ceo: '/admin-dashboard.html',
      worker: '/worker-dashboard.html',
      coin_seller: '/coin-seller-center.html',
      creator: '/streamer-center.html',
      agency: '/agency-center.html',
      bdm: '/bd-center.html',
    };
    window.location.href = withAppQuery(routes[role] || '/customer-dashboard.html');
  }

  window.SocialShell = {
    initPage,
    renderBottomNav,
    ensureBottomNav,
    hasAppSession,
    patchAppLinks,
    renderLiveCard,
    renderFilterChips,
    fillGrid,
    bindFilterChips,
    fillSquareFeed,
    initReels,
    renderTopicsList,
    renderEmptyState,
    goStartLive,
    goStartLiveBroadcast,
    goToStreamerCenter,
    goStartParty,
    openBroadcastPicker,
    fillFollowingView,
    fillDiscoveryTab,
    updateExploreTabCounts,
    syncExploreFloatingActions,
    runGlobalSearch,
    renderSearchResults,
    fetchPros,
    fetchActiveRooms,
    getImageUrl,
    hostCardImage,
    enrichRoomsWithHostPhotos,
    avatarFallback,
    coverFallback,
    redirectToDashboard,
    bindLiveCards,
    markNativeApp,
    BOTTOM_NAV,
    syncChatUnreadFromApi,
    paintChatNavBadge,
    getChatUnreadCount,
  };
})();
