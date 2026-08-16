/**
 * Shared CP couple strip — profile, Love House mini, creator profile.
 */
(function (global) {
  const RING_STYLE = {
    ruby: 'pearl',
    wings: 'gold',
    cp: 'diamond',
    celeste: 'diamond',
    mystique: 'gold',
    aura: 'diamond',
  };

  function avatarUrl(name, pic) {
    if (pic && global.SocialShell?.getImageUrl) return SocialShell.getImageUrl(pic);
    if (pic && global.SocialUI?.getImageUrl) return SocialUI.getImageUrl(pic);
    const n = encodeURIComponent(name || 'U');
    return `https://ui-avatars.com/api/?name=${n}&background=ec4899&color=fff`;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function render(data, opts) {
    const o = opts || {};
    if (!data?.user || !data?.partner) return '';
    const ringId = data.ringId || data.ring?.id || 'cp';
    const style = RING_STYLE[ringId] || 'diamond';
    const meLink = o.meLink !== false
      ? `/creator-profile.html?userId=${encodeURIComponent(data.user.userId)}&app=1`
      : '/profile-tab.html?app=1';
    const partnerLink = `/creator-profile.html?userId=${encodeURIComponent(data.partner.userId)}&app=1`;
    const days = Number(data.daysTogether || 0);
    const daysHtml = days > 0 ? `<p class="cp-profile-days">Together ${days} day${days === 1 ? '' : 's'}</p>` : '';
    const headLink = o.showLoveHouseLink !== false
      ? `<div class="cp-profile-head-links">` +
        `<a href="/cp-home.html?app=1" class="cp-profile-head-link">CP House <i class="fas fa-chevron-right"></i></a>` +
        `<a href="/cp-rankings.html?app=1" class="cp-profile-head-link cp-profile-head-link--rank">Rankings <i class="fas fa-trophy"></i></a>` +
        `</div>`
      : '';

    return (
      `<section class="cp-profile-card${o.clickable !== false ? ' cp-profile-card--clickable' : ''}" aria-label="CP couple">` +
      `<div class="cp-profile-head"><a href="/cp-home.html?app=1" class="cp-profile-label cp-profile-label-link"><i class="fas fa-heart"></i> CP</a>${headLink}</div>` +
      `<div class="cp-profile-couple">` +
      `<a class="cp-profile-slot" href="${meLink}">` +
      `<img src="${avatarUrl(data.user.name, data.user.profilePic)}" alt="" loading="lazy">` +
      `<span>${esc(data.user.name)}</span></a>` +
      `<div class="cp-profile-ring ap-cp-ring-slot cp-profile-ring-link" data-ring-id="${esc(ringId)}" data-ring-style="${style}" role="button" tabindex="0" aria-label="Open CP House"></div>` +
      `<a class="cp-profile-slot" href="${partnerLink}">` +
      `<img src="${avatarUrl(data.partner.name, data.partner.profilePic)}" alt="" loading="lazy">` +
      `<span>${esc(data.partner.name)}</span></a>` +
      `</div>${daysHtml}</section>`
    );
  }

  function mount(container, data, opts) {
    if (!container) return;
    if (!data?.user || !data?.partner) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = render(data, opts);
    const ringEl = container.querySelector('.cp-profile-ring');
    if (ringEl && global.CpRings) {
      const fn = CpRings.mountWorn || CpRings.mount;
      fn(ringEl, ringEl.dataset.ringId, opts?.ringSize || 'md');
    }
    if (opts?.ringLink !== false) {
      const goCp = () => { location.href = '/cp-home.html?app=1'; };
      ringEl?.addEventListener('click', goCp);
      ringEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goCp();
        }
      });
    }
    container.querySelector('.cp-profile-card')?.addEventListener('click', (e) => {
      if (opts?.clickable === false) return;
      if (e.target.closest('a, .cp-profile-ring-link, button')) return;
      location.href = '/cp-home.html?app=1';
    });
    global.SocialUI?.bindAvatarFallbacks?.(container);
  }

  async function fetchAndMount(container, userId, opts) {
    if (!container || !userId) return null;
    const load = async () => {
      if (global.API?.get) {
        try {
          if (global.Auth?.ensureAccessToken) await global.Auth.ensureAccessToken();
          const json = await global.API.get('/cp/profile/' + encodeURIComponent(userId));
          if (json?.success && json.data?.partner) return json.data;
        } catch (_e) { /* fallback */ }
      }
      const token = localStorage.getItem('token');
      const res = await fetch((global.joinApiUrl || ((p) => '/api' + p))('/cp/profile/' + encodeURIComponent(userId)), {
        credentials: 'include',
        headers: token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (json.success && json.data?.partner) return json.data;
      return null;
    };
    try {
      const data = await load();
      if (!data) {
        container.innerHTML = '';
        container.hidden = true;
        return null;
      }
      mount(container, data, opts);
      return data;
    } catch (_e) {
      container.hidden = true;
      return null;
    }
  }

  global.CpProfileCard = { render, mount, fetchAndMount, avatarUrl };
})(typeof window !== 'undefined' ? window : global);
