/**
 * Discovery rails UI — Live Now, Trending, New Creators, Because You Follow.
 * Lightweight horizontal chips, AP Live cream/gold.
 */
(function () {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mediaUrl(path) {
    if (!path) return '';
    if (window.SocialInteractions?.resolveMediaUrl) return SocialInteractions.resolveMediaUrl(path);
    if (window.SocialShell?.getImageUrl) return SocialShell.getImageUrl(path) || path;
    return path;
  }

  function rankBadge(rank) {
    const n = Number(rank);
    if (!Number.isFinite(n) || n < 1 || n > 3) return '';
    return `<span class="ap-discover-rank ap-discover-rank--${n}" aria-label="Rank ${n}">#${n}</span>`;
  }

  function itemCard(item, rank) {
    const badge = rankBadge(rank);
    if (item.type === 'live') {
      const pic = mediaUrl(item.profilePic) || window.SocialUI?.avatarUrl?.(item.displayName) || '';
      return `<a class="ap-discover-card ap-discover-card--live" href="${esc(item.href)}">
        <img src="${esc(pic)}" alt="">
        ${badge}
        <span class="social-live-pill"><i class="fas fa-circle"></i> LIVE</span>
        <span class="ap-discover-name">${esc(item.displayName)}</span>
        <span class="ap-discover-meta">${Number(item.viewers || 0)} watching</span>
      </a>`;
    }
    if (item.type === 'post') {
      const thumb = mediaUrl(item.thumb) || '';
      return `<a class="ap-discover-card ap-discover-card--post" href="${esc(item.href)}">
        ${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div class="ap-discover-fallback">▶</div>'}
        ${badge}
        <span class="ap-discover-name">${esc(item.displayName)}</span>
      </a>`;
    }
    const pic = mediaUrl(item.profilePic) || window.SocialUI?.avatarUrl?.(item.displayName) || '';
    return `<a class="ap-discover-card ap-discover-card--creator" href="${esc(item.profileHref || item.href || '#')}">
      <img src="${esc(pic)}" alt="">
      ${badge}
      ${item.isLive && item.liveHref ? `<span class="social-live-pill" data-href="${esc(item.liveHref)}"><i class="fas fa-circle"></i> LIVE</span>` : ''}
      <span class="ap-discover-name">${esc(item.displayName)}</span>
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
  }

  window.SocialDiscoveryRails = { mount, fetchRails };
})();
