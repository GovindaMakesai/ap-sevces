/**
 * Agora beauty presets — same IDs as webview VIDEO_FILTERS.
 */
export const BEAUTY_FILTERS = [
  { id: 'none', label: 'Original', swatch: ['#3f3f46', '#18181b'], beauty: null, cssTint: null },
  {
    id: 'natural',
    label: 'Natural',
    swatch: ['#f5d0c5', '#e8b4a0'],
    beauty: { lighteningLevel: 0.45, smoothnessLevel: 0.55, rednessLevel: 0.1, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,200,180,0.12)',
  },
  {
    id: 'glow',
    label: 'Glow',
    swatch: ['#fff7ed', '#fdba74'],
    beauty: { lighteningLevel: 0.7, smoothnessLevel: 0.7, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,220,180,0.18)',
  },
  {
    id: 'silk',
    label: 'Silk',
    swatch: ['#fce7f3', '#f9a8d4'],
    beauty: { lighteningLevel: 0.75, smoothnessLevel: 0.85, rednessLevel: 0.12, lighteningContrastLevel: 0 },
    cssTint: 'rgba(250,240,255,0.14)',
  },
  {
    id: 'velvet',
    label: 'Velvet',
    swatch: ['#e0e7ff', '#a5b4fc'],
    beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.9, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,120,140,0.12)',
  },
  {
    id: 'glam',
    label: 'Glam',
    swatch: ['#fdf2f8', '#fb7185'],
    beauty: { lighteningLevel: 0.65, smoothnessLevel: 0.65, rednessLevel: 0.15, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,140,160,0.16)',
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: ['#ffe4e6', '#fb7185'],
    beauty: { lighteningLevel: 0.6, smoothnessLevel: 0.55, rednessLevel: 0.18, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,150,170,0.15)',
  },
  {
    id: 'golden',
    label: 'Golden',
    swatch: ['#fef3c7', '#f59e0b'],
    beauty: { lighteningLevel: 0.68, smoothnessLevel: 0.5, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,200,100,0.14)',
  },
  {
    id: 'fresh',
    label: 'Fresh',
    swatch: ['#ecfdf5', '#34d399'],
    beauty: { lighteningLevel: 0.58, smoothnessLevel: 0.5, rednessLevel: 0.1, lighteningContrastLevel: 1 },
    cssTint: 'rgba(180,255,210,0.1)',
  },
  {
    id: 'dream',
    label: 'Dream',
    swatch: ['#ede9fe', '#a78bfa'],
    beauty: { lighteningLevel: 0.72, smoothnessLevel: 0.75, rednessLevel: 0.12, lighteningContrastLevel: 0 },
    cssTint: 'rgba(200,180,255,0.14)',
  },
];

export function applyAgoraBeauty(engine, filterId) {
  if (!engine) return;
  const preset = BEAUTY_FILTERS.find((f) => f.id === filterId) || BEAUTY_FILTERS[0];
  try {
    if (!preset.beauty) {
      engine.setBeautyEffectOptions?.(false, {
        lighteningLevel: 0,
        smoothnessLevel: 0,
        rednessLevel: 0,
        lighteningContrastLevel: 1,
      });
      return;
    }
    engine.setBeautyEffectOptions?.(true, {
      lighteningContrastLevel: preset.beauty.lighteningContrastLevel ?? 1,
      lighteningLevel: preset.beauty.lighteningLevel ?? 0.5,
      smoothnessLevel: preset.beauty.smoothnessLevel ?? 0.5,
      rednessLevel: preset.beauty.rednessLevel ?? 0.1,
      sharpnessLevel: 0.1,
    });
  } catch (_e) {}
}

export function beautyTint(filterId) {
  return (BEAUTY_FILTERS.find((f) => f.id === filterId) || BEAUTY_FILTERS[0]).cssTint;
}
