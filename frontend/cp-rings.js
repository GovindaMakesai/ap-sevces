/**
 * CSS 3D animated CP rings — replaces flat emoji diamonds in Love House / Store / Party.
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

  function render(ringId, size) {
    const id = normalizeRingId(ringId);
    const style = ringStyle(id);
    const sz = size || 'md';
    return (
      `<div class="ap-cp-ring ap-cp-ring--${id} ap-cp-ring--style-${style} ap-cp-ring--${sz}" role="img" aria-label="CP ring">` +
      `<div class="ap-cp-ring-stage">` +
      `<div class="ap-cp-ring-orbit"></div>` +
      `<div class="ap-cp-ring-band"></div>` +
      `<div class="ap-cp-ring-prongs"></div>` +
      `<div class="ap-cp-ring-gem"></div>` +
      `<div class="ap-cp-ring-shine"></div>` +
      `<div class="ap-cp-ring-spark ap-cp-ring-spark--1"></div>` +
      `<div class="ap-cp-ring-spark ap-cp-ring-spark--2"></div>` +
      `</div></div>`
    );
  }

  function mount(el, ringId, size) {
    if (!el) return;
    el.innerHTML = render(ringId, size);
  }

  global.CpRings = { render, mount, normalizeRingId, ringStyle, RING_IDS, RING_STYLE };
})(typeof window !== 'undefined' ? window : global);
