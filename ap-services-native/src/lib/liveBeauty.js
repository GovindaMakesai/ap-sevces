/**
 * Agora beauty presets — same IDs as webview VIDEO_FILTERS.
 * Native applies setBeautyEffectOptions (+ clear_vision extension when present).
 * cssTint is a visible preview fallback when the SDK beauty library is weak/missing.
 */
export const BEAUTY_FILTERS = [
  { id: 'none', label: 'Original', swatch: ['#3f3f46', '#18181b'], beauty: null, cssTint: null },
  {
    id: 'natural',
    label: 'Natural',
    swatch: ['#f5d0c5', '#e8b4a0'],
    beauty: { lighteningLevel: 0.55, smoothnessLevel: 0.65, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,200,180,0.22)',
  },
  {
    id: 'glow',
    label: 'Glow',
    swatch: ['#fff7ed', '#fdba74'],
    beauty: { lighteningLevel: 0.78, smoothnessLevel: 0.75, rednessLevel: 0.14, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,220,180,0.28)',
  },
  {
    id: 'silk',
    label: 'Silk',
    swatch: ['#fce7f3', '#f9a8d4'],
    beauty: { lighteningLevel: 0.8, smoothnessLevel: 0.88, rednessLevel: 0.14, lighteningContrastLevel: 0 },
    cssTint: 'rgba(250,240,255,0.24)',
  },
  {
    id: 'velvet',
    label: 'Velvet',
    swatch: ['#e0e7ff', '#a5b4fc'],
    beauty: { lighteningLevel: 0.62, smoothnessLevel: 0.92, rednessLevel: 0.14, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,120,140,0.2)',
  },
  {
    id: 'glam',
    label: 'Glam',
    swatch: ['#fdf2f8', '#fb7185'],
    beauty: { lighteningLevel: 0.72, smoothnessLevel: 0.72, rednessLevel: 0.18, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,140,160,0.26)',
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: ['#ffe4e6', '#fb7185'],
    beauty: { lighteningLevel: 0.68, smoothnessLevel: 0.62, rednessLevel: 0.22, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,150,170,0.25)',
  },
  {
    id: 'golden',
    label: 'Golden',
    swatch: ['#fef3c7', '#f59e0b'],
    beauty: { lighteningLevel: 0.74, smoothnessLevel: 0.58, rednessLevel: 0.14, lighteningContrastLevel: 1 },
    cssTint: 'rgba(255,200,100,0.24)',
  },
  {
    id: 'fresh',
    label: 'Fresh',
    swatch: ['#ecfdf5', '#34d399'],
    beauty: { lighteningLevel: 0.64, smoothnessLevel: 0.58, rednessLevel: 0.12, lighteningContrastLevel: 1 },
    cssTint: 'rgba(180,255,210,0.18)',
  },
  {
    id: 'dream',
    label: 'Dream',
    swatch: ['#ede9fe', '#a78bfa'],
    beauty: { lighteningLevel: 0.78, smoothnessLevel: 0.8, rednessLevel: 0.14, lighteningContrastLevel: 0 },
    cssTint: 'rgba(200,180,255,0.24)',
  },
];

function ensureClearVision(engine) {
  try {
    engine.enableExtension?.('agora_video_filters_clear_vision', 'clear_vision', true);
  } catch (_e) {}
}

/**
 * Apply beauty to local camera. Safe to call before/after startPreview.
 * Returns the SDK result code when available (0 = ok).
 */
export function applyAgoraBeauty(engine, filterId) {
  if (!engine) return -1;
  const preset = BEAUTY_FILTERS.find((f) => f.id === filterId) || BEAUTY_FILTERS[0];
  ensureClearVision(engine);
  let MediaSourceType = null;
  try {
    MediaSourceType = require('react-native-agora')?.MediaSourceType;
  } catch (_e) {}
  const source = MediaSourceType?.PrimaryCameraSource ?? MediaSourceType?.MediaSourceCameraPrimary;
  const optsOff = {
    lighteningLevel: 0,
    smoothnessLevel: 0,
    rednessLevel: 0,
    sharpnessLevel: 0,
    lighteningContrastLevel: 1,
  };
  try {
    if (!preset.beauty) {
      if (typeof engine.setBeautyEffectOptions === 'function') {
        return source != null
          ? engine.setBeautyEffectOptions(false, optsOff, source)
          : engine.setBeautyEffectOptions(false, optsOff);
      }
      return -1;
    }
    const opts = {
      lighteningContrastLevel: preset.beauty.lighteningContrastLevel ?? 1,
      lighteningLevel: preset.beauty.lighteningLevel ?? 0.5,
      smoothnessLevel: preset.beauty.smoothnessLevel ?? 0.5,
      rednessLevel: preset.beauty.rednessLevel ?? 0.1,
      sharpnessLevel: 0.15,
    };
    if (typeof engine.setBeautyEffectOptions === 'function') {
      return source != null
        ? engine.setBeautyEffectOptions(true, opts, source)
        : engine.setBeautyEffectOptions(true, opts);
    }
  } catch (_e) {}
  return -1;
}

export function beautyTint(filterId) {
  return (BEAUTY_FILTERS.find((f) => f.id === filterId) || BEAUTY_FILTERS[0]).cssTint;
}
