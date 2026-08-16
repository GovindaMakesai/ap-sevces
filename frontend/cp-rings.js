/**
 * CSS 3D CP rings — finger-worn perspective (no spinner orbit).
 */
(function (global) {
  const RING_IDS = ['ruby', 'wings', 'cp', 'celeste', 'mystique', 'aura'];
  const RING_STYLE = {
    ruby: 'pearl',
    wings: 'gold',
    cp: 'diamond',
    celeste: 'diamond',
    mystique: 'gold',
    aura: 'diamond',
  };

  function normalizeRingId(ringId) {
    const id = String(ringId || 'ruby').trim().toLowerCase();
    return RING_IDS.includes(id) ? id : 'ruby';
  }

  function ringStyle(ringId) {
    return RING_STYLE[normalizeRingId(ringId)] || 'diamond';
  }

  function render(ringId, size, mode, cpLevel) {
    const id = normalizeRingId(ringId);
    const style = ringStyle(id);
    const sz = size || 'md';
    const worn = mode === 'worn';
    const modeClass = worn ? ' ap-cp-ring--worn' : ' ap-cp-ring--preview';
    const lv = Number(cpLevel) || 0;
    const levelBadge =
      lv > 0 ? `<span class="ap-cp-ring-level" aria-label="CP level ${lv}">${lv}</span>` : '';
    return (
      `<div class="ap-cp-ring ap-cp-ring--${id} ap-cp-ring--style-${style} ap-cp-ring--${sz}${modeClass}" role="img" aria-label="CP ring">` +
      levelBadge +
      `<div class="ap-cp-ring-stage">` +
      `<div class="ap-cp-ring-view">` +
      `<div class="ap-cp-ring-band-wrap">` +
      `<div class="ap-cp-ring-band"></div>` +
      `<div class="ap-cp-ring-band-edge"></div>` +
      `<div class="ap-cp-ring-band-hole"></div>` +
      `</div>` +
      `<div class="ap-cp-ring-crown">` +
      `<div class="ap-cp-ring-prongs"></div>` +
      `<div class="ap-cp-ring-gem"></div>` +
      `<div class="ap-cp-ring-shine"></div>` +
      `</div>` +
      `</div>` +
      `</div></div>`
    );
  }

  /** Store / buy sheet — subtle gem glint only */
  function mount(el, ringId, size, cpLevel) {
    if (!el) return;
    el.innerHTML = render(ringId, size, 'preview', cpLevel);
  }

  function mountWorn(el, ringId, size, cpLevel) {
    if (!el) return;
    el.innerHTML = render(ringId, size, 'worn', cpLevel);
  }

  global.CpRings = {
    render,
    mount,
    mountWorn,
    normalizeRingId,
    ringStyle,
    RING_IDS,
    RING_STYLE,
  };
})(typeof window !== 'undefined' ? window : global);
