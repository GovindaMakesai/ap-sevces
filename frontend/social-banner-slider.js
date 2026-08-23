/**
 * Auto-sliding promo banners + full host-policy posters (uncropped).
 */
(function () {
  const DEFAULT_BANNERS = [
    {
      href: '/coin-seller-offer.html?app=1',
      image: '/assets/promos/mega-offer-coin-seller.png',
      alt: 'BIG MEGA OFFER — Coin Seller 75% off',
    },
    {
      href: '/lucky-gifts.html?app=1',
      image: '/assets/promos/lucky-gift-rank.svg',
      alt: 'Lucky Gift Ranking',
    },
    {
      href: '/rankings.html?app=1',
      image: '/assets/promos/pk-combat-rank.svg',
      alt: 'PK Combat Ranking',
    },
    {
      href: '/host-policies.html?app=1',
      image: '/assets/promos/host-earn.svg',
      alt: 'Host earning policies',
    },
    {
      href: '/host-policies.html?policy=star&app=1',
      image: '/assets/promos/star-host-policy.png',
      alt: 'Star Host Policy',
    },
  ];

  const POLICY_POSTERS = [
    {
      href: '/host-policies.html?policy=star&app=1',
      image: '/assets/promos/star-host-policy.png',
      alt: 'Star Host Policy — weekly rewards for top hosts',
      label: 'Star Host Policy',
    },
    {
      href: '/host-policies.html?policy=normal&app=1',
      image: '/assets/promos/normal-host-policy.png',
      alt: 'Normal Host Policy — bonuses for new live hosts',
      label: 'Normal Host Policy',
    },
  ];

  function renderSlide(b, i) {
    const hrefAttr = b.href ? ` data-href="${b.href}" role="link" tabindex="0"` : '';
    if (b.image) {
      return `
      <div class="social-banner-slide social-banner-slide--image" data-index="${i}"${hrefAttr}>
        <div class="social-banner social-banner--image ${b.className || ''}">
          <img class="social-banner-img" src="${b.image}" alt="${b.alt || b.title || 'Promo'}" loading="lazy">
        </div>
      </div>`;
    }
    const center = b.center ? ' social-banner-content--center' : '';
    const heading = b.title ? `<h2>${b.title}</h2>` : '';
    return `
      <div class="social-banner-slide" data-index="${i}"${hrefAttr}>
        <div class="social-banner ${b.className || ''}">
          <div class="social-banner-content${center}">
            ${heading}
            ${b.html || ''}
          </div>
        </div>
      </div>`;
  }

  function mountMegaOfferPoster(afterEl) {
    if (!afterEl || document.getElementById('socialMegaOfferPoster')) return;
    const wrap = document.createElement('section');
    wrap.id = 'socialMegaOfferPoster';
    wrap.className = 'social-mega-offer-poster';
    wrap.innerHTML = `
      <a href="/coin-seller-offer.html?app=1">
        <img src="/assets/promos/mega-offer-coin-seller.png" alt="BIG MEGA OFFER — Coin Seller Super, Senior and Diamond plans" loading="lazy">
        <span>Coin Seller · 75% OFF — tap to select a plan</span>
      </a>`;
    afterEl.insertAdjacentElement('afterend', wrap);
  }

  function mountPolicyPosters(afterEl) {
    if (!afterEl || document.getElementById('socialHostPolicyPosters')) return;
    const wrap = document.createElement('section');
    wrap.id = 'socialHostPolicyPosters';
    wrap.className = 'social-host-policy-posters';
    wrap.setAttribute('aria-label', 'Host earning policies');
    wrap.innerHTML = `
      <div class="social-host-policy-head">
        <h2>Host earning policies</h2>
        <p>Full posters — tap to open details</p>
      </div>
      <div class="social-host-policy-list">
        ${POLICY_POSTERS.map(
          (p) => `
          <a class="social-host-policy-card" href="${p.href}">
            <img src="${p.image}" alt="${p.alt}" loading="lazy">
            <span>${p.label}</span>
          </a>`
        ).join('')}
      </div>`;
    afterEl.insertAdjacentElement('afterend', wrap);
  }

  function mount(container, banners, intervalMs) {
    if (!container) return null;
    const items = banners && banners.length ? banners : DEFAULT_BANNERS;
    const ms = intervalMs || 4500;
    let index = 0;
    let timer = null;

    container.classList.add('social-banner-slider');
    container.innerHTML = `
      <div class="social-banner-track">
        ${items.map((b, i) => renderSlide(b, i)).join('')}
      </div>
      <div class="social-banner-dots" role="tablist"></div>
    `;

    const track = container.querySelector('.social-banner-track');
    const dotsWrap = container.querySelector('.social-banner-dots');

    items.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Banner ' + (i + 1));
      if (i === 0) btn.classList.add('active');
      btn.addEventListener('click', () => go(i));
      dotsWrap.appendChild(btn);
    });

    function go(i) {
      index = ((i % items.length) + items.length) % items.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dotsWrap.querySelectorAll('button').forEach((d, j) => {
        d.classList.toggle('active', j === index);
      });
    }

    function next() {
      go(index + 1);
    }

    function start() {
      stop();
      timer = setInterval(next, ms);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    container.querySelectorAll('.social-banner-slide[data-href]').forEach((slide) => {
      const open = () => {
        const h = slide.dataset.href;
        if (h) window.location.href = h;
      };
      slide.addEventListener('click', open);
      slide.style.cursor = 'pointer';
    });

    start();
    container.addEventListener('mouseenter', stop);
    container.addEventListener('mouseleave', start);
    container.addEventListener('touchstart', stop, { passive: true });
    container.addEventListener('touchend', () => setTimeout(start, 3000), { passive: true });

    /* Mega offer full poster stays on Me only — rooms and Explore use slider images */
    if (document.body.classList.contains('social-profile-page')) {
      mountMegaOfferPoster(container);
    }
    /* Full uncropped host-policy posters on non-explore pages */
    if (!document.body.classList.contains('social-explore-page')) {
      mountPolicyPosters(container);
    }

    return { go, next, start, stop };
  }

  window.SocialBannerSlider = { mount, DEFAULT_BANNERS, POLICY_POSTERS };
})();
