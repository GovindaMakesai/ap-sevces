/**
 * Social app shell — native-style nav, live grids, booking flows preserved.
 */
(function () {
  const BOTTOM_NAV = [
    { id: 'video', href: '/video.html', icon: 'fa-video' },
    { id: 'party', href: '/party.html', icon: 'hex', altId: 'rankings', altHref: '/rankings.html', altIcon: 'fa-chart-bar' },
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

  function avatarFallback(name) {
    const initials = String(name || 'U')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'U';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#fff" opacity="0.92">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function renderNavIcon(item, activeId) {
    const active = item.id === activeId || item.altId === activeId;
    if (item.icon === 'planet') {
      return `<span class="nav-planet" aria-hidden="true"><span class="nav-planet-glow"></span><span class="nav-planet-body"></span><span class="nav-planet-ring"></span></span>`;
    }
    if (item.icon === 'hex') {
      const useAlt = activeId === 'rankings';
      if (useAlt) return `<i class="fas ${item.altIcon}"></i>`;
      return `<span class="nav-hex" aria-hidden="true"><span class="nav-hex-inner"></span></span>`;
    }
    const icon = activeId === 'rankings' && item.altId === 'rankings' ? item.altIcon : `fas ${item.icon}`;
    return `<i class="${icon}"></i>`;
  }

  function renderBottomNav(activeId) {
    const unread = parseInt(localStorage.getItem('chat_unread') || '2', 10) || 0;
    return `
      <nav class="social-bottom-nav" aria-label="Main">
        ${BOTTOM_NAV.map((item) => {
          const active = item.id === activeId || item.altId === activeId;
          let href = item.href;
          if (item.id === 'party' && activeId === 'rankings') href = item.altHref;
          const center = item.center ? ' nav-center' : '';
          const badge =
            item.badge && unread > 0
              ? `<span class="nav-badge">${unread > 9 ? '9+' : unread}</span>`
              : '';
          return `<a href="${href}" class="nav-item${active ? ' is-active' : ''}${center}" data-nav="${item.id}">
            ${renderNavIcon(item, activeId)}
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

  function renderLiveCard(pro, index, opts) {
    const party = opts && opts.party;
    const id = pro.id || '';
    const name = pro.name || 'Professional';
    const img = pro.image || avatarFallback(name);
    const tag = pro.tag || pickTag(index);
    const viewers = pro.viewers != null ? pro.viewers : 200 + Math.floor(Math.random() * 3800);
    const ch = encodeURIComponent(id || (party ? 'party-' : 'live-') + index);
    const href = party
      ? `/party-room.html?channel=${ch}&app=1`
      : `/live-room.html?channel=${ch}&app=1`;
    const hot = index === 0 ? ' hot' : '';
    const top10 = index === 1 ? '<span class="tag tag-top10">TOP10 Hourly</span>' : '';
    const pk = index % 3 === 0 ? '<span class="pk-badge" aria-hidden="true">PK</span>' : '';
    const stack = party ? renderAvatarStack(6 + (index % 20)) : '';
    const inRoom = party ? `<span class="in-room"><i class="fas fa-signal"></i> ${formatViewers(viewers)}</span>` : '';

    return `
      <article class="social-live-card${party ? ' is-party' : ''}" data-href="${href}" role="button" tabindex="0">
        <img src="${img}" alt="" loading="lazy" onerror="this.src='${avatarFallback(name).replace(/'/g, '&#39;')}'">
        ${top10}
        <span class="tag${hot}">${tag}</span>
        ${pk}
        <div class="bottom">
          ${stack}
          <div class="bottom-row">
            <span class="name">🇮🇳 ${name}</span>
            ${party ? inRoom : `<span class="viewers"><i class="fas fa-signal"></i> ${formatViewers(viewers)}</span>`}
          </div>
        </div>
      </article>`;
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
    if (window.__AP_NATIVE_APP__ || window.ReactNativeWebView) {
      const sep = href.includes('?') ? '&' : '?';
      if (!href.includes('app=1')) return href + sep + 'app=1';
    }
    return href;
  }

  function bindLiveCards(root) {
    (root || document).querySelectorAll('.social-live-card[data-href]').forEach((el) => {
      const go = (e) => {
        if (e) e.preventDefault();
        const href = withAppQuery(el.dataset.href);
        if (href) window.location.href = href;
      };
      el.addEventListener('click', go);
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        go(e);
      });
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
        if (btn.dataset.chip === 'Global') window.location.href = '/services.html';
      });
    });
  }

  async function fetchPros(limit = 12) {
    try {
      const res = await API.get(`/workers?limit=${limit}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (rows.length) {
        return rows.map((w, i) => ({
          id: w.id,
          name: `${w.first_name || ''} ${w.last_name || ''}`.trim() || 'Professional',
          category: w.category || 'Home services',
          image:
            getImageUrl(w.profile_pic) ||
            `https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80`,
          viewers: 100 + Math.floor(Math.random() * 4000),
          tag: pickTag(i),
        }));
      }
    } catch (e) {
      console.warn('SocialShell: workers API', e);
    }
    return mockPros(limit);
  }

  function mockPros(limit) {
    const names = [
      'Har Har Mahadev', 'AngelRiya6927', 'SENSEI', 'Priya Beauty', 'Rahul Electric',
      'Anita Home', 'Zin Min', 'AapRohie', 'Lolita Daimary', 'SAM YARA',
    ];
    const imgs = [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    ];
    return Array.from({ length: limit }, (_, i) => ({
      id: '',
      name: names[i % names.length],
      image: imgs[i % imgs.length],
      viewers: 96 + Math.floor(Math.random() * 4100),
      tag: pickTag(i),
    }));
  }

  async function fillGrid(gridId, limit, opts) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML =
      '<div class="social-grid-loading"><span class="social-spinner"></span></div>';
    const pros = await fetchPros(limit);
    grid.innerHTML = pros.map((p, i) => renderLiveCard(p, i, opts)).join('');
    bindLiveCards(grid);
  }

  function markNativeApp() {
    document.documentElement.classList.add('social-app', 'social-native');
    if (window.ReactNativeWebView || window.Capacitor) {
      document.documentElement.classList.add('ap-expo-app');
    }
  }

  function initPage(config) {
    markNativeApp();
    const active = config.activeNav || 'explore';
    const mount = document.getElementById('social-bottom-nav-mount');
    if (mount && localStorage.getItem('token')) {
      mount.innerHTML = renderBottomNav(active);
      mount.style.display = '';
    }

    const chipsMount = document.getElementById('social-filter-chips-mount');
    if (chipsMount) {
      chipsMount.innerHTML = renderFilterChips(config.activeChip || 'Popular');
      bindFilterChips();
    }

    if (config.gridId) {
      fillGrid(config.gridId, config.gridLimit || 12, { party: config.partyGrid });
    }

    document.querySelectorAll('[data-social-search]').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = input.value.trim();
          window.location.href = q
            ? `/services.html?search=${encodeURIComponent(q)}`
            : '/services.html';
        }
      });
    });

    const startLive = document.getElementById('social-start-live');
    if (startLive) {
      startLive.addEventListener('click', (e) => {
        e.preventDefault();
        goStartLive();
      });
    }

    const bannerMount = document.getElementById('social-banner-slider');
    if (bannerMount && window.SocialBannerSlider) {
      SocialBannerSlider.mount(bannerMount);
    }

    if (config.squareFeed) fillSquareFeed();
    if (config.reelsId) initReels(config.reelsId);
    if (config.emptyState) renderEmptyState(config.emptyState);
    if (window.SocialCreatePost) SocialCreatePost.bindCameraButtons();

    bindLiveCards(document);
  }

  function goStartLive() {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    window.location.href = '/streamer-center.html?app=1';
  }

  function goStartParty() {
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/app-auth.html?app=1';
      return;
    }
    const channel = 'party-' + (user.id || Date.now()).toString().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    window.location.href =
      '/party-room.html?host=1&channel=' + encodeURIComponent(channel) + '&app=1';
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
      { title: '#Holi Video Collection Event', heat: 529819, ended: false, img: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200' },
      { title: '#Jayfol Dance Challenge', heat: 412200, ended: false, img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200' },
      { title: '#Home Pro Tips', heat: 210440, ended: true, img: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=200' },
    ];
    list.innerHTML = items
      .map(
        (t) => `
      <section class="social-topic-block">
        <div class="social-topic-head">
          <img src="${t.img}" alt="">
          <div style="flex:1">
            <h3 style="font-size:15px;color:var(--gold-800);margin-bottom:6px">${t.title}</h3>
            <span class="social-flame"><i class="fas fa-fire"></i> ${t.heat}</span>
          </div>
          ${t.ended ? '<span style="color:#9ca3af;font-size:13px">ended</span>' : '<button type="button" class="social-join-btn" data-join-topic>join &gt;</button>'}
        </div>
        <div class="social-topic-videos">
          ${[1, 2, 3, 4]
            .map(
              (n) =>
                `<div class="thumb" data-go-video><img src="https://images.unsplash.com/photo-161${n}1685778255-406106cdc4ce?w=200" alt=""><i class="fas fa-play" style="position:absolute;top:6px;right:6px;color:#fff;font-size:12px"></i></div>`
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
    const user = window.Auth?.getUser?.();
    if (!user) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/profile-tab.html');
      return;
    }
    if (user.role === 'admin') window.location.href = '/admin-dashboard.html';
    else if (user.role === 'worker') window.location.href = '/worker-dashboard.html';
    else window.location.href = '/customer-dashboard.html';
  }

  window.SocialShell = {
    initPage,
    renderBottomNav,
    renderLiveCard,
    renderFilterChips,
    fillGrid,
    fillSquareFeed,
    initReels,
    renderTopicsList,
    renderEmptyState,
    goStartLive,
    goStartParty,
    fetchPros,
    getImageUrl,
    avatarFallback,
    redirectToDashboard,
    bindLiveCards,
    markNativeApp,
    BOTTOM_NAV,
  };
})();
