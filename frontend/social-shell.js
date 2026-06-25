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
    { id: 'chat', href: '/chat.html', icon: 'fa-comment-dots', badge: true },
    { id: 'profile', href: '/profile-tab.html', icon: 'fa-user' },
  ];

  const CATEGORY_TAGS = [
    'Chatting', 'Make Friends', 'Singing', 'Esports', 'Beauty', 'Home Services',
  ];

  const CHIP_FILTERS = ['Popular', 'India', 'Nepal', 'Global'];

  function getImageUrl(path) {
    if (!path) return null;
    if (String(path).startsWith('http')) return path;
    const base = (window.CONFIG?.BACKEND_URL || '').replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
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
        html += `<a href="/creator-profile.html?id=${u.id}&app=1" class="social-search-user">
          <span class="social-search-user-name">${escapeHtml(name)}</span>
          <span class="social-search-user-id">ID ${u.id}</span>
        </a>`;
      });
      html += `</div>`;
    }
    if (rooms.length) {
      html += `<p class="social-search-section">Live rooms</p><div class="social-grid">`;
      rooms.forEach((r, i) => {
        const page = r.room_type === 'party' ? 'party-room' : 'live-room';
        html += `<a href="/${page}.html?channel=${encodeURIComponent(r.channel)}&app=1" class="social-live-card">
          <span class="social-card-name">${escapeHtml(r.host_display_name || r.channel)}</span>
          <span class="social-card-meta">${formatViewers(r.viewer_count || 0)} watching</span>
        </a>`;
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
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function avatarFallback(name) {
    if (window.SocialUI?.avatarUrl) return SocialUI.avatarUrl(name);
    const initials = String(name || 'U')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'U';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#fff" opacity="0.92">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function coverFallback(name, party) {
    if (window.SocialUI?.themeCover) {
      return SocialUI.themeCover(party ? 'party' : 'live', name);
    }
    return avatarFallback(name);
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

  async function syncChatUnreadFromApi() {
    if (!hasAppSession() || !window.API?.get) return getChatUnreadCount();
    try {
      const res = await API.get('/conversations');
      const total = Number(res?.data?.totalUnread);
      const count = Number.isFinite(total)
        ? total
        : (Array.isArray(res?.data?.conversations)
            ? res.data.conversations.reduce((s, c) => s + (Number(c.unreadCount) || 0), 0)
            : 0);
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

  function renderLiveCard(pro, index, opts) {
    const party = opts && opts.party;
    const channel = pro.channel || pro.id || '';
    if (!channel) return '';
    const name = pro.name || 'Host';
    const img = pro.image || coverFallback(name, party);
    const tag = party ? 'Party' : 'Live';
    const viewers = Math.max(0, Number(pro.viewers) || 0);
    const age = formatLiveAge(pro.startedAt || pro.updatedAt);
    const ch = encodeURIComponent(String(channel).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64));
    const href = party
      ? `/party-room.html?channel=${ch}&app=1`
      : `/live-room.html?channel=${ch}&feed=1&app=1`;
    const liveBadge = '<span class="tag hot"><span class="live-pulse-dot"></span> LIVE</span>';
    const inRoom = `<span class="in-room"><i class="fas fa-signal"></i> ${formatViewers(viewers)}</span>`;
    const ageLabel = age ? `<span class="live-age">${age}</span>` : '';

    return `
      <article class="social-live-card${party ? ' is-party' : ''}" data-href="${href}" role="button" tabindex="0">
        <img src="${img}" alt="" loading="lazy" onerror="this.src='${coverFallback(name, party).replace(/'/g, '&#39;')}'">
        ${liveBadge}
        <span class="tag">${tag}</span>
        ${ageLabel}
        <div class="bottom">
          <div class="bottom-row">
            <span class="name">🇮🇳 ${name}</span>
            ${inRoom}
          </div>
        </div>
      </article>`;
  }

  function renderEmptyLiveGrid(party) {
    const startFn = party ? 'SocialShell.goStartParty()' : 'SocialShell.goStartLive()';
    const label = party ? 'Start Party' : 'Go Live';
    const icon = party ? 'fa-users' : 'fa-video';
    return `
      <div class="social-empty-live-grid">
        <div class="social-empty-live-icon"><i class="fas ${icon}"></i></div>
        <h3>No one is ${party ? 'partying' : 'live'} right now</h3>
        <p>Only real active rooms appear here. Be the first to broadcast!</p>
        <button type="button" class="social-empty-live-btn" onclick="${startFn}">${label}</button>
      </div>`;
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
    syncChatUnreadFromApi();
  }

  let fastNavBound = false;
  function bindFastBottomNav() {
    if (fastNavBound) return;
    fastNavBound = true;
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target.closest?.('.social-bottom-nav a[data-nav]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#')) return;
        if (link.classList.contains('is-active')) {
          e.preventDefault();
          if (window.SocialNav?.refreshPage) SocialNav.refreshPage();
          else window.location.reload();
          return;
        }
        e.preventDefault();
        document.querySelectorAll('.social-bottom-nav .nav-item').forEach((el) => {
          el.classList.toggle('is-active', el === link);
        });
        document.documentElement.classList.add('ap-nav-switching');
        requestAnimationFrame(() => {
          window.location.href = href;
        });
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
    BOTTOM_NAV.forEach((item) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = withAppQuery(item.href);
      document.head.appendChild(link);
    });
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
      const go = (e) => {
        if (e?.target?.closest?.('a, button')) return;
        if (e) e.preventDefault();
        const href = withAppQuery(el.dataset.href);
        if (href) window.location.href = href;
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
    try {
      const res = await API.get(`/live/rooms?type=${roomType}&limit=${limit}&sort=${sort}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      return rows
        .filter((r) => r && r.channel && r.status !== 'ended')
        .filter((r) => !party || String(r.channel || '').startsWith('party-'))
        .filter((r) => party || !String(r.channel || '').startsWith('party-'))
        .map((r) => ({
          id: r.channel,
          channel: r.channel,
          userId: r.hostId,
          name: r.hostName || 'Host',
          image: coverFallback(r.hostName || 'Host', party),
          viewers: r.viewers || 0,
          startedAt: r.startedAt,
          updatedAt: r.updatedAt,
          tag: party ? 'Party' : 'Live',
          live: true,
        }));
    } catch (e) {
      console.warn('SocialShell: active rooms API', e);
      return [];
    }
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

  function bindGridInfiniteScroll(gridId, limit, opts) {
    const grid = document.getElementById(gridId);
    if (!grid || grid.dataset.infiniteBound === '1') return;
    grid.dataset.infiniteBound = '1';
    const sentinel = document.createElement('div');
    sentinel.className = 'social-grid-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    grid.after(sentinel);
    const key = `${gridId}:${opts.sort || 'trending'}`;
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
    const key = `${gridId}:${opts.sort || 'trending'}`;
    if (!gridScrollState[key]) gridScrollState[key] = { limit: limit || 12, loading: false };
    const st = gridScrollState[key];
    if (st.loading) return;
    st.loading = true;
    if (!opts.append) {
      grid.innerHTML =
        '<div class="social-grid-loading"><span class="social-spinner"></span></div>';
    }
    const rooms = await fetchActiveRooms(limit || st.limit, opts);
    st.loading = false;
    if (!rooms.length) {
      if (!opts.append) grid.innerHTML = renderEmptyLiveGrid(opts && opts.party);
      return;
    }
    grid.innerHTML = rooms.map((p, i) => renderLiveCard(p, i, opts)).filter(Boolean).join('');
    bindLiveCards(grid);
    bindGridInfiniteScroll(gridId, limit || 12, opts);
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
    let raw;
    try {
      raw = sessionStorage.getItem('ap_live_pip_session');
    } catch (_e) {}
    if (!raw) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_e) {
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
    if (chipsMount) {
      chipsMount.innerHTML = renderFilterChips(config.activeChip || 'Popular');
      bindFilterChips();
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
    if (bannerMount && window.SocialBannerSlider) {
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

  async function fillFollowingView(searchQuery) {
    const mount = document.getElementById('exploreEmpty');
    const content = document.getElementById('exploreContent');
    if (!mount) return;

    let pros = [];
    if (window.Auth?.hasSession?.() || localStorage.getItem('user')) {
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const res = await API.get('/social/following/live');
        const rows = Array.isArray(res?.data) ? res.data : [];
        pros = rows.map((r) => ({
          id: r.channel,
          channel: r.channel,
          userId: r.id,
          name: r.name || 'Host',
          image: coverFallback(r.name || 'Host', false),
          viewers: r.viewer_count || 0,
          tag: 'Live',
          live: true,
        }));
      } catch (e) {
        console.warn('SocialShell: following live API', e);
      }
    }

    if (!pros.length) {
      const follows = window.SocialInteractions?.getFollowingList
        ? SocialInteractions.getFollowingList().map((e) => e.name)
        : JSON.parse(localStorage.getItem('social_follows') || '[]').map((x) =>
            typeof x === 'string' ? x : x.name
          );
      pros = await fetchActiveRooms(24, { party: false });
      if (follows.length) {
        pros = pros.filter((p) =>
          follows.some(
            (f) =>
              p.name.toLowerCase().includes(String(f).toLowerCase()) ||
              String(f).toLowerCase().includes(p.name.toLowerCase())
          )
        );
      }
      if (!follows.length && !pros.length) {
        if (content) content.style.display = 'none';
        mount.style.display = 'block';
        mount.innerHTML = `<div class="social-empty-state"><p>You haven't followed anyone yet.</p><a href="/explore.html?app=1" class="btn-open">Discover live</a></div>`;
        return;
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      pros = pros.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || String(p.channel || '').toLowerCase().includes(q)
      );
    }
    if (!pros.length) {
      if (content) content.style.display = 'none';
      mount.style.display = 'block';
      mount.innerHTML = `<div class="social-empty-state"><p>${searchQuery ? `No live hosts match "${searchQuery}"` : 'None of the people you follow are live right now.'}</p><button type="button" class="btn-open" onclick="SocialShell.goStartLive()">Go Live</button></div>`;
      return;
    }
    mount.style.display = 'none';
    if (content) {
      content.style.display = 'block';
      let grid = document.getElementById('exploreGrid');
      if (!grid) {
        grid = document.createElement('div');
        grid.id = 'exploreGrid';
        grid.className = 'social-grid';
        content.appendChild(grid);
      }
      grid.innerHTML = pros.map((p, i) => renderLiveCard(p, i, { party: false })).join('');
      bindLiveCards(grid);
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
      grid.className = 'social-grid';
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
    goStartLiveBroadcast({ mode: 'video' });
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
      window.location.href =
        '/live-room.html?host=1&mode=' +
        encodeURIComponent(mode) +
        '&channel=' +
        encodeURIComponent(channel) +
        topic +
        '&app=1';
    };
    if (mode === 'video' && !isParty && !opts?.skipVerify) {
      const api = window.API || window.Auth?.api;
      if (api?.get) {
        api
          .get('/live/access-status')
          .then((res) => {
            const data = res?.data?.data || res?.data || {};
            if (!data.canStreamVideo) {
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

  function openBroadcastPicker(kind, opts) {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    const el = ensureBroadcastOverlay();
    if (kind === 'party') {
      goStartParty(opts);
      return;
    }
    if (kind === 'live') {
      el.innerHTML = `
        <div class="social-broadcast-sheet">
          <h3>Go live</h3>
          <p>Instagram-style — you broadcast solo, viewers join to watch, chat &amp; send gifts.</p>
          <div class="social-broadcast-options">
            <button type="button" class="social-broadcast-opt" data-go-live="video">
              <span class="ico video"><i class="fas fa-video"></i></span>
              <div><strong>Video + audio</strong><span>Camera livestream</span></div>
            </button>
            <button type="button" class="social-broadcast-opt" data-go-live="audio">
              <span class="ico audio"><i class="fas fa-microphone"></i></span>
              <div><strong>Audio only</strong><span>Voice live — no camera</span></div>
            </button>
          </div>
          <button type="button" class="social-broadcast-cancel" data-broadcast-cancel>Cancel</button>
        </div>`;
      el.querySelectorAll('[data-go-live]').forEach((btn) => {
        btn.addEventListener('click', () => {
          el.classList.remove('is-open');
          goStartLiveBroadcast({ ...(opts || {}), mode: btn.dataset.goLive });
        });
      });
      el.querySelector('[data-broadcast-cancel]')?.addEventListener('click', () => el.classList.remove('is-open'));
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('is-open');
      });
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
              <div><strong>Video live</strong><span>Camera + audio broadcast</span></div>
            </button>
            <button type="button" class="social-broadcast-opt" data-go-live="audio">
              <span class="ico audio"><i class="fas fa-microphone"></i></span>
              <div><strong>Audio live</strong><span>Voice only — no camera</span></div>
            </button>
          </div>
          <button type="button" class="social-broadcast-cancel" data-broadcast-cancel>Cancel</button>
        </div>`;
    el.querySelector('[data-go-party]')?.addEventListener('click', () => {
      el.classList.remove('is-open');
      goStartParty(opts);
    });
    el.querySelectorAll('[data-go-live]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.classList.remove('is-open');
        goStartLiveBroadcast({ ...(opts || {}), mode: btn.dataset.goLive });
      });
    });
    el.querySelector('[data-broadcast-cancel]')?.addEventListener('click', () => el.classList.remove('is-open'));
    el.addEventListener('click', (e) => {
      if (e.target === el) el.classList.remove('is-open');
    });
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
          <a href="/explore.html?app=1" class="btn-open">Explore live</a>
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
      await SocialInteractions.renderSquareFeed('squareFeed');
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
          <img src="${coverFallback(t.title, false)}" alt="">
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
    runGlobalSearch,
    renderSearchResults,
    fetchPros,
    fetchActiveRooms,
    getImageUrl,
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
