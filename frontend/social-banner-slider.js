/**
 * Auto-sliding promo banners + full host-policy posters (uncropped).
 */
(function () {
  const DEFAULT_BANNERS = [
    {
      href: '/rankings.html?app=1',
      image: '/assets/promos/ap-reality-show.jpg?v=20260903',
      alt: '1st Reality Show — Antakshari, Sep 1–7 2026',
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
      href: '/host-policies.html?policy=guidelines&app=1',
      image: '/assets/promos/host-earn.svg',
      alt: 'Host Policy & Guidelines',
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
    const slideExtra = b.className ? ` ${b.className}-slide` : '';
    if (b.image) {
      return `
      <div class="social-banner-slide social-banner-slide--image${slideExtra}" data-index="${i}"${hrefAttr}>
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
    const items = (banners && banners.length ? banners : DEFAULT_BANNERS).filter((b) => b && b.image);
    if (!items.length) {
      container.hidden = true;
      container.innerHTML = '';
      return null;
    }
    container.hidden = false;
    const ms = intervalMs || 4500;
    let index = 0;
    let timer = null;
    let interacting = false;
    let suppressClick = false;
    let pointerStartX = 0;

    container.classList.add('social-banner-slider');
    container.innerHTML = `
      <div class="social-banner-scroller">
        <div class="social-banner-track">
          ${items.map((b, i) => renderSlide(b, i)).join('')}
        </div>
      </div>
      <div class="social-banner-dots" role="tablist"></div>
    `;

    const scroller = container.querySelector('.social-banner-scroller');
    const dotsWrap = container.querySelector('.social-banner-dots');

    function slides() {
      return [...container.querySelectorAll('.social-banner-slide')];
    }

    function slideWidth() {
      return Math.max(1, scroller.clientWidth || container.clientWidth);
    }

    function sizeSlides() {
      const w = slideWidth();
      container.style.setProperty('--banner-slide-w', w + 'px');
      scroller.style.setProperty('--banner-slide-w', w + 'px');
      slides().forEach((s) => {
        s.style.flex = '0 0 ' + w + 'px';
        s.style.width = w + 'px';
        s.style.minWidth = w + 'px';
      });
    }

    function rebuildDots() {
      dotsWrap.innerHTML = '';
      slides().forEach((_, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Banner ' + (i + 1));
        if (i === index) btn.classList.add('active');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          go(i);
        });
        dotsWrap.appendChild(btn);
      });
    }

    function syncDots() {
      const n = slides().length;
      if (!n) return;
      const nextIndex = Math.round(scroller.scrollLeft / slideWidth());
      index = Math.max(0, Math.min(n - 1, nextIndex));
      dotsWrap.querySelectorAll('button').forEach((d, j) => {
        d.classList.toggle('active', j === index);
      });
    }

    function go(i, instant) {
      const n = slides().length;
      if (!n) return;
      index = ((i % n) + n) % n;
      sizeSlides();
      scroller.scrollTo({
        left: index * slideWidth(),
        behavior: instant ? 'auto' : 'smooth',
      });
      syncDots();
    }

    function next() {
      const n = slides().length;
      if (n < 2) return;
      go(index + 1);
    }

    function start() {
      stop();
      if (slides().length < 2 || interacting) return;
      timer = setInterval(next, ms);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    sizeSlides();
    rebuildDots();

    container.querySelectorAll('.social-banner-slide[data-href]').forEach((slide) => {
      slide.style.cursor = 'pointer';
      slide.addEventListener('click', (e) => {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const h = slide.dataset.href;
        if (h) window.location.href = h;
      });
    });

    container.querySelectorAll('.social-banner-img').forEach((img) => {
      img.addEventListener('error', () => {
        const slide = img.closest('.social-banner-slide');
        if (slide) slide.remove();
        if (!slides().length) {
          container.hidden = true;
          stop();
          return;
        }
        sizeSlides();
        rebuildDots();
        go(0, true);
      });
    });

    scroller.addEventListener(
      'scroll',
      () => {
        syncDots();
      },
      { passive: true }
    );

    scroller.addEventListener(
      'pointerdown',
      (e) => {
        interacting = true;
        suppressClick = false;
        pointerStartX = e.clientX;
        stop();
      },
      { passive: true }
    );
    const endPointer = (e) => {
      if (typeof e.clientX === 'number' && Math.abs(e.clientX - pointerStartX) > 14) {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 280);
      }
      interacting = false;
      syncDots();
      setTimeout(start, 2800);
    };
    scroller.addEventListener('pointerup', endPointer, { passive: true });
    scroller.addEventListener('pointercancel', endPointer, { passive: true });
    scroller.addEventListener('mouseenter', stop);
    scroller.addEventListener('mouseleave', () => {
      interacting = false;
      start();
    });

    window.addEventListener(
      'resize',
      () => {
        sizeSlides();
        go(index, true);
      },
      { passive: true }
    );

    /* Explore / Party keep the image slider only — no extra posters */
    const exploreOnlySlider = document.body.classList.contains('social-explore-page');
    if (!exploreOnlySlider) {
      mountPolicyPosters(container);
    }

    start();
    return { go, next, start, stop };
  }

  window.SocialBannerSlider = { mount, DEFAULT_BANNERS, POLICY_POSTERS };
})();
