/**
 * BeautySettings — runtime intensities for all effects + metadata.
 * Persisted via BeautyManager; never hardcodes provider-specific values.
 *
 * @module beauty/BeautySettings
 */

import { BeautyEffect, createDefaultEffectsMap, BEAUTY_EFFECT_CATALOG } from './BeautyEffect.js';

export class BeautySettings {
  constructor() {
    /** @type {Record<string, BeautyEffect>} */
    this.effects = createDefaultEffectsMap();
    /** @type {string|null} */
    this.activePresetId = null;
    /** @type {boolean} */
    this.enabled = false;
    /** @type {boolean} before/after compare */
    this.compareMode = false;
  }

  getIntensity(effectId) {
    return this.effects[effectId]?.intensity ?? 0;
  }

  setIntensity(effectId, value) {
    if (!this.effects[effectId]) return this;
    this.effects[effectId].setIntensity(value);
    return this;
  }

  /**
   * Apply many intensities at once (preset load).
   * @param {Record<string, number>} map
   */
  applyIntensities(map) {
    Object.entries(map || {}).forEach(([id, v]) => this.setIntensity(id, v));
    return this;
  }

  /** True if any effect > 0 */
  hasActiveEffects() {
    return Object.values(this.effects).some((e) => e.intensity > 0);
  }

  resetAll() {
    BEAUTY_EFFECT_CATALOG.forEach((def) => {
      this.effects[def.id]?.setIntensity(def.defaultIntensity ?? 0);
    });
    this.activePresetId = null;
    return this;
  }

  /** Shader / provider payload: { effectId: 0..1 } */
  toNormalizedMap() {
    /** @type {Record<string, number>} */
    const out = {};
    Object.values(this.effects).forEach((e) => {
      out[e.id] = e.amount;
    });
    return out;
  }

  toJSON() {
    return {
      enabled: this.enabled,
      activePresetId: this.activePresetId,
      compareMode: this.compareMode,
      effects: Object.fromEntries(
        Object.values(this.effects).map((e) => [e.id, e.intensity])
      ),
    };
  }

  static fromJSON(data) {
    const s = new BeautySettings();
    if (!data || typeof data !== 'object') return s;
    s.enabled = Boolean(data.enabled);
    s.activePresetId = data.activePresetId || null;
    s.compareMode = Boolean(data.compareMode);
    if (data.effects) s.applyIntensities(data.effects);
    return s;
  }
}
