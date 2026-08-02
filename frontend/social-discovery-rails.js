/**
 * Discovery rails UI — Live Now, Trending, New Creators, Because You Follow.
 * Lightweight horizontal chips, AP Live cream/gold.
 */
(function () {
  const FALLBACK_CHAIN = new WeakMap();

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiHost() {
    try {
      const base = String(
        window.CONFIG?.BACKEND_URL ||
          String(window.CONFIG?.API_URL || '').replace(/\/api\/?$/, '') ||
          window.AP_CONFIG?.PRODUCTION_BACKEND_URL ||
          'https://api.apservices.in'
      ).replace(/\/$/, '');
      return base || 'https://api.apservices.in';
    } catch (_e) {
      return 'https://api.apservices.in';
    }
  }

  function isVideoPath(path) {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(path || ''));
  }

  function firstLetters(name) {
    const parts = String(name || 'U')
      .replace(/[^\w\s]|_/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const letters = parts
      .map((p) => {
        try {
          const ch = Array.from(p).find((c) => /[A-Za-z0-9]/.test(c));
          return ch || '';
        } catch (_e) {
          return '';
        }
      })
      .filter(Boolean);
    return (letters.join('') || 'U').slice(0, 2).toUpperCase();
  }

  function initialsSvg(name) {
    const label = firstLetters(name);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs>' +
      '<rect width="256" height="256" rx="24" fill="url(#g)"/>' +
      '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
      'font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="#fff">' +
      label +
      '</text></svg>';
    try {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    } catch (_e) {
      return (
        'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
            '<rect width="256" height="256" rx="24" fill="#c9a227"/>' +
            '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
            'font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="#fff">U</text></svg>'
        )
      );
    }
  }

  function mediaUrl(path) {
    if (!path) return '';
    let p = String(path).trim();
    if (!p || p === 'null' || p === 'undefined' || isVideoPath(p)) return '';
    if (/^(data:|blob:)/i.test(p)) return p;
    try {
      if (window.SocialShell?.getImageUrl) {
        const built = SocialShell.getImageUrl(p);
        if (built && !isVideoPath(built)) return built;
      }
    } catch (_e) { /* ignore */ }
    try {
      if (window.SocialInteractions?.resolveMediaUrl) {
        const built = SocialInteractions.resolveMediaUrl(p);
        if (built && !isVideoPath(built)) return built;
      }
    } catch (_e2) { /* ignore */ }
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('//')) return `https:${p}`;
    return `${apiHost()}${p.startsWith('/') ? p : `/${p}`}`;
  }

  function avatarFallback(name, photo) {
    const resolved = mediaUrl(photo);
    if (resolved) return resolved;
    try {
      if (window.SocialUI?.avatarUrl) {
        const u = SocialUI.avatarUrl(name || 'Creator', null);
        if (u) return u;
      }
    } catch (_e) { /* ignore */ }
    return initialsSvg(name || 'Creator');
  }

  function rankBadge(rank) {
    const n = Number(rank);
    if (!Number.isFinite(n) || n < 1 || n > 3) return '';
    return `<span class="ap-discover-rank ap-discover-rank--${n}" aria-label="Rank ${n}">#${n}</span>`;
  }

  function thumbImg(src, fallback, alt) {
    const name = alt || 'Creator';
    const primary = mediaUrl(src);
    const fb = mediaUrl(fallback);
    const init = initialsSvg(name);
    const first = primary || fb || init;
    const mid = fb && fb !== first ? fb : '';
    return `<span class="ap-discover-thumb-wrap" style="background-image:url('${init.replace(/'/g, '%27')}')">
      <img class="ap-discover-thumb" src="${esc(first)}" alt="${esc(name)}" decoding="async" data-ap-thumb="1"${
        mid ? ` data-fallback="${esc(mid)}"` : ''
      }>
    </span>`;
  }

  function itemCard(item, rank) {
    const badge = rankBadge(rank);
    const name = item.displayName || 'Creator';
    const profile = avatarFallback(name, item.profilePic);
    if (item.type === 'live') {
      return `<a class="ap-discover-card ap-discover-card--live" href="${esc(item.href)}">
        ${thumbImg(profile, null, name)}
        ${badge}
        <span class="social-live-pill"><i class="fas fa-circle"></i> LIVE</span>
        <span class="ap-discover-name">${esc(name)}</span>
        <span class="ap-discover-meta">${Number(item.viewers || 0)} watching</span>
      </a>`;
    }
    if (item.type === 'post') {
      const thumb = mediaUrl(item.thumb) || profile;
      return `<a class="ap-discover-card ap-discover-card--post" href="${esc(item.href)}">
        ${thumbImg(thumb, profile, name)}
        ${badge}
        <span class="ap-discover-name">${esc(name)}</span>
      </a>`;
    }
    return `<a class="ap-discover-card ap-discover-card--creator" href="${esc(item.profileHref || item.href || '#')}">
      ${thumbImg(profile, null, name)}
      ${badge}
      ${item.isLive && item.liveHref ? `<span class="social-live-pill" data-href="${esc(item.liveHref)}"><i class="fas fa-circle"></i> LIVE</span>` : ''}
      <span class="ap-discover-name">${esc(name)}</span>
    </a>`;
  }

  function sectionShowsRanks(sectionId) {
    return sectionId === 'trending' || sectionId === 'new_creators' || sectionId === 'live_now';
  }

  async function fetchRails() {
    if (!window.API?.get) return null;
    try {
      const res = await API.get('/social/discover/rails?limit=10');
      return res?.success ? res.data : null;
    } catch (_e) {
      return { _error: true };
    }
  }

  function bindThumbFallbacks(root) {
    root.querySelectorAll('img.ap-discover-thumb[data-ap-thumb]').forEach((img) => {
      const wrap = img.closest('.ap-discover-thumb-wrap');
      const name = img.getAttribute('alt') || 'Creator';
      const primary = img.getAttribute('src') || '';
      const profileGuess =
        wrap?.parentElement?.querySelector?.('.ap-discover-name')?.textContent || name;
      const chain = [];
      if (primary) chain.push(primary);
      const init = initialsSvg(profileGuess);
      if (!chain.includes(init)) chain.push(init);
      FALLBACK_CHAIN.set(img, { i: 0, chain });

      img.addEventListener('error', function onErr() {
        const state = FALLBACK_CHAIN.get(img);
        if (!state) {
          img.style.opacity = '0';
          return;
        }
        state.i += 1;
        if (state.i < state.chain.length) {
          img.src = state.chain[state.i];
          return;
        }
        img.removeEventListener('error', onErr);
        img.style.opacity = '0';
      });
    });
  }

  async function mount(containerId) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    el.hidden = false;
    el.innerHTML = '<div class="ap-discover-rails ap-discover-rails--loading"><div class="ap-discover-skel"></div></div>';
    const data = await fetchRails();
    if (data?._error) {
      el.innerHTML = window.SocialCreatorPolish
        ? SocialCreatorPolish.errorStateHtml({
            title: 'Discovery unavailable',
            body: 'We couldn’t load recommendations right now.',
            retryLabel: 'Retry',
          })
        : '';
      if (window.SocialCreatorPolish) {
        SocialCreatorPolish.bindRetry(el, () => mount(el));
      }
      return;
    }
    if (!data?.sections?.length) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="ap-discover-rails ap-fade-in">${data.sections
      .map((sec) => {
        if (!sec.items?.length) {
          if (sec.id !== 'live_now') return '';
          return `<section class="ap-discover-section">
            <h3 class="ap-discover-title">${esc(sec.title)}</h3>
            <p class="ap-discover-empty">No one is live right now — check back soon.</p>
          </section>`;
        }
        const withRanks = sectionShowsRanks(sec.id);
        const cards = sec.items
          .map((item, i) => itemCard(item, withRanks ? i + 1 : 0))
          .join('');
        return `<section class="ap-discover-section" data-section="${esc(sec.id)}">
          <h3 class="ap-discover-title">${esc(sec.title)}</h3>
          <div class="ap-discover-row">${cards}</div>
        </section>`;
      })
      .join('')}</div>`;

    el.querySelectorAll('.social-live-pill[data-href]').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        location.href = pill.getAttribute('data-href');
      });
    });
    bindThumbFallbacks(el);
  }

  window.SocialDiscoveryRails = { mount, fetchRails };
})();
