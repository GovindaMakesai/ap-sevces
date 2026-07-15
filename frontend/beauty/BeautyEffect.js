/**
 * BeautyEffect — single adjustable effect (intensity 0–100).
 * Effects are independent and stackable; providers interpret what they support.
 *
 * @module beauty/BeautyEffect
 */

/** @typedef {string} BeautyEffectId */

/**
 * @typedef {Object} BeautyEffectDef
 * @property {BeautyEffectId} id
 * @property {string} label
 * @property {'skin'|'face'|'makeup'|'color'|'advanced'} category
 * @property {number} [defaultIntensity]
 * @property {boolean} [reshape]  Face geometry warp (requires landmarks)
 * @property {string} [description]
 */

/** Catalog of all Earn4U beauty effects (provider-agnostic). */
export const BEAUTY_EFFECT_CATALOG = Object.freeze([
  { id: 'skinSmoothing', label: 'Skin smoothing', category: 'skin', defaultIntensity: 0, description: 'Bilateral-style skin refine' },
  { id: 'skinWhitening', label: 'Skin whitening', category: 'skin', defaultIntensity: 0 },
  { id: 'skinTone', label: 'Skin tone', category: 'skin', defaultIntensity: 0, description: 'Tone correction' },
  { id: 'brightEyes', label: 'Bright eyes', category: 'makeup', defaultIntensity: 0 },
  { id: 'darkCircles', label: 'Dark circles', category: 'makeup', defaultIntensity: 0 },
  { id: 'teethWhitening', label: 'Teeth whitening', category: 'makeup', defaultIntensity: 0 },
  { id: 'eyeEnlargement', label: 'Eye enlargement', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'faceSlimming', label: 'Face slimming', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'jawSlimming', label: 'Jaw slimming', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'chinAdjustment', label: 'Chin', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'noseAdjustment', label: 'Nose', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'lipEnhancement', label: 'Lips', category: 'makeup', defaultIntensity: 0 },
  { id: 'foreheadAdjustment', label: 'Forehead', category: 'face', defaultIntensity: 0, reshape: true },
  { id: 'contrast', label: 'Contrast', category: 'color', defaultIntensity: 0 },
  { id: 'saturation', label: 'Saturation', category: 'color', defaultIntensity: 0 },
  { id: 'colorLut', label: 'Color LUT', category: 'color', defaultIntensity: 0 },
  { id: 'sharpen', label: 'Sharpen', category: 'advanced', defaultIntensity: 0 },
  { id: 'softLight', label: 'Soft light', category: 'advanced', defaultIntensity: 0 },
  { id: 'glow', label: 'Glow', category: 'advanced', defaultIntensity: 0 },
  { id: 'naturalBeauty', label: 'Natural beauty', category: 'skin', defaultIntensity: 0, description: 'Balanced stack helper' },
]);

export class BeautyEffect {
  /**
   * @param {BeautyEffectId} id
   * @param {number} [intensity=0] 0–100
   */
  constructor(id, intensity = 0) {
    const def = BEAUTY_EFFECT_CATALOG.find((e) => e.id === id);
    if (!def) throw new Error(`Unknown beauty effect: ${id}`);
    this.id = id;
    this.label = def.label;
    this.category = def.category;
    this.reshape = Boolean(def.reshape);
    this.description = def.description || '';
    this.intensity = BeautyEffect.clamp(intensity);
  }

  static clamp(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /** Normalized 0..1 for shaders / SDKs */
  get amount() {
    return this.intensity / 100;
  }

  setIntensity(value) {
    this.intensity = BeautyEffect.clamp(value);
    return this;
  }

  toJSON() {
    return { id: this.id, intensity: this.intensity };
  }
}

export function createDefaultEffectsMap() {
  /** @type {Record<string, BeautyEffect>} */
  const map = {};
  BEAUTY_EFFECT_CATALOG.forEach((def) => {
    map[def.id] = new BeautyEffect(def.id, def.defaultIntensity ?? 0);
  });
  return map;
}
