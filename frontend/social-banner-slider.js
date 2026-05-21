/**
 * Auto-sliding promo banners (Lucky Gifts, Invite Friends, etc.)
 */
(function () {
  const DEFAULT_BANNERS = [
    {
      className: 'social-banner--party',
      title: 'Lucky Gifts Party',
      html: '<p>Enjoy the Event and win <span class="coin">🪙</span> 268,710,000</p><p class="social-banner-date">16/05/2026 - 22/05/2026 (UTC+8)</p>',
    },
    {
      className: 'social-banner--invite',
      title: 'Invite Friends',
      html: '<p>Up to <span class="coin">🪙</span> 10k / invite</p>',
      center: true,
    },
    {
      className: 'social-banner--party',
      title: 'Live Party Tonight',
      html: '<p>Join rooms, send gifts &amp; climb rankings</p>',
    },
  ];

  function renderSlide(b, i) {
    const center = b.center ? ' social-banner-content--center' : '';
    return `
      <div class="social-banner-slide" data-index="${i}">
        <div class="social-banner ${b.className || ''}">
          <div class="social-banner-content${center}">
            <h2>${b.title || ''}</h2>
            ${b.html || ''}
          </div>
        </div>
      </div>`;
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

    start();
    container.addEventListener('mouseenter', stop);
    container.addEventListener('mouseleave', start);
    container.addEventListener('touchstart', stop, { passive: true });
    container.addEventListener('touchend', () => setTimeout(start, 3000), { passive: true });

    return { go, next, start, stop };
  }

  window.SocialBannerSlider = { mount, DEFAULT_BANNERS };
})();
