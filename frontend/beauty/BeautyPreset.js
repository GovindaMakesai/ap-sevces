/**
 * BeautyPreset — named intensity stacks (Natural, Instagram, TikTok, …).
 * Presets only change effect intensities; they never call SDKs directly.
 *
 * @module beauty/BeautyPreset
 */

/** @typedef {{ id: string, label: string, swatch: string, intensities: Record<string, number> }} BeautyPresetDef */

/** @type {BeautyPresetDef[]} */
export const BUILTIN_PRESETS = Object.freeze([
  {
    id: 'none',
    label: 'Original',
    swatch: 'linear-gradient(145deg,#3f3f46,#18181b)',
    intensities: {},
  },
  {
    id: 'natural',
    label: 'Natural',
    swatch: 'linear-gradient(145deg,#f5d0c5,#e8b4a0)',
    intensities: {
      skinSmoothing: 35,
      skinWhitening: 12,
      skinTone: 10,
      brightEyes: 18,
      darkCircles: 20,
      naturalBeauty: 40,
      softLight: 15,
      sharpen: 8,
    },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    swatch: 'linear-gradient(145deg,#fce7f3,#fb7185)',
    intensities: {
      skinSmoothing: 48,
      skinWhitening: 22,
      skinTone: 18,
      brightEyes: 28,
      darkCircles: 30,
      glow: 22,
      softLight: 28,
      saturation: 18,
      contrast: 12,
      sharpen: 15,
      naturalBeauty: 35,
    },
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    swatch: 'linear-gradient(145deg,#a5f3fc,#f472b6)',
    intensities: {
      skinSmoothing: 55,
      skinWhitening: 30,
      eyeEnlargement: 22,
      faceSlimming: 18,
      jawSlimming: 15,
      brightEyes: 35,
      glow: 30,
      saturation: 28,
      contrast: 16,
      sharpen: 20,
    },
  },
  {
    id: 'bigo',
    label: 'Bigo',
    swatch: 'linear-gradient(145deg,#fde68a,#f59e0b)',
    intensities: {
      skinSmoothing: 60,
      skinWhitening: 40,
      skinTone: 25,
      faceSlimming: 28,
      jawSlimming: 22,
      eyeEnlargement: 18,
      noseAdjustment: 12,
      brightEyes: 30,
      teethWhitening: 25,
      glow: 25,
      softLight: 20,
    },
  },
  {
    id: 'professional',
    label: 'Professional',
    swatch: 'linear-gradient(145deg,#e2e8f0,#64748b)',
    intensities: {
      skinSmoothing: 28,
      skinTone: 15,
      darkCircles: 25,
      brightEyes: 15,
      contrast: 20,
      saturation: 8,
      sharpen: 25,
      softLight: 10,
      naturalBeauty: 30,
    },
  },
  {
    id: 'soft',
    label: 'Soft',
    swatch: 'linear-gradient(145deg,#fdf2f8,#fbcfe8)',
    intensities: {
      skinSmoothing: 42,
      skinWhitening: 18,
      glow: 35,
      softLight: 40,
      darkCircles: 22,
      colorLut: 20,
      sharpen: 5,
    },
  },
  {
    id: 'glamour',
    label: 'Glamour',
    swatch: 'linear-gradient(145deg,#fb7185,#9f1239)',
    intensities: {
      skinSmoothing: 50,
      skinWhitening: 28,
      faceSlimming: 20,
      eyeEnlargement: 15,
      brightEyes: 32,
      glow: 40,
      softLight: 30,
      saturation: 22,
      contrast: 18,
      sharpen: 18,
    },
  },
  {
    id: 'cute',
    label: 'Cute',
    swatch: 'linear-gradient(145deg,#fef3c7,#f9a8d4)',
    intensities: {
      skinSmoothing: 45,
      skinWhitening: 25,
      eyeEnlargement: 35,
      faceSlimming: 25,
      chinAdjustment: 15,
      foreheadAdjustment: 10,
      brightEyes: 40,
      glow: 28,
      softLight: 25,
    },
  },
]);

export class BeautyPreset {
  /** @param {BeautyPresetDef} def */
  constructor(def) {
    this.id = def.id;
    this.label = def.label;
    this.swatch = def.swatch;
    this.intensities = { ...(def.intensities || {}) };
  }

  /** Apply onto BeautySettings (resets others to 0 first). */
  applyTo(settings) {
    settings.resetAll();
    settings.applyIntensities(this.intensities);
    settings.activePresetId = this.id;
    settings.enabled = this.id !== 'none' && settings.hasActiveEffects();
    return settings;
  }

  static list() {
    return BUILTIN_PRESETS.map((d) => new BeautyPreset(d));
  }

  static get(id) {
    const def = BUILTIN_PRESETS.find((p) => p.id === id);
    return def ? new BeautyPreset(def) : null;
  }
}
