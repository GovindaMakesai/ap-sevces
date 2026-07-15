/**
 * BeautyManager — settings persistence, presets, provider lifecycle.
 *
 * @module beauty/BeautyManager
 */

import { BeautyConfig, resolveActiveProviderId } from './config.js';
import { BeautySettings } from './BeautySettings.js';
import { BeautyPreset } from './BeautyPreset.js';
import { MediaPipeProvider } from './providers/mediapipe/MediaPipeProvider.js';
import {
  AgoraBeautyProvider,
  BanubaProvider,
  BytePlusProvider,
  FaceUnityProvider,
  SenseTimeProvider,
  TencentBeautyProvider,
} from './providers/stubs.js';

const PROVIDER_CTORS = {
  mediapipe: MediaPipeProvider,
  agora: AgoraBeautyProvider,
  banuba: BanubaProvider,
  byteplus: BytePlusProvider,
  faceunity: FaceUnityProvider,
  sensetime: SenseTimeProvider,
  tencent: TencentBeautyProvider,
};

export class BeautyManager {
  constructor() {
    this.settings = BeautySettings.fromJSON(this._load());
    /** @type {import('./BeautyProvider.js').BeautyProvider|null} */
    this.provider = null;
    this._providerId = null;
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => {
      try {
        fn(this.settings);
      } catch (_e) {}
    });
    this.persist();
  }

  _load() {
    try {
      const raw = localStorage.getItem(BeautyConfig.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  persist() {
    try {
      localStorage.setItem(BeautyConfig.storageKey, JSON.stringify(this.settings.toJSON()));
    } catch (_e) {}
  }

  listPresets() {
    return BeautyPreset.list();
  }

  applyPreset(presetId) {
    const preset = BeautyPreset.get(presetId);
    if (!preset) return this.settings;
    preset.applyTo(this.settings);
    this._emit();
    return this.settings;
  }

  setEnabled(on) {
    this.settings.enabled = Boolean(on);
    this._emit();
  }

  setIntensity(effectId, value) {
    this.settings.setIntensity(effectId, value);
    this.settings.activePresetId = null;
    if (this.settings.hasActiveEffects()) this.settings.enabled = true;
    this._emit();
  }

  reset() {
    this.settings.resetAll();
    this.settings.enabled = false;
    this._emit();
  }

  setCompareMode(on) {
    this.settings.compareMode = Boolean(on);
    this._emit();
  }

  /**
   * Create / swap provider from config. Only configuration changes required.
   * @param {string} [providerId]
   */
  async ensureProvider(providerId) {
    const id = providerId || resolveActiveProviderId();
    if (this.provider && this._providerId === id && this.provider.isReady()) {
      return this.provider;
    }
    if (this.provider) {
      await this.provider.dispose().catch(() => {});
      this.provider = null;
    }
    const Ctor = PROVIDER_CTORS[id] || MediaPipeProvider;
    this.provider = new Ctor();
    this._providerId = id;
    try {
      await this.provider.init(BeautyConfig);
    } catch (e) {
      console.warn(`[APBeauty] provider ${id} failed, falling back to agora`, e);
      if (id !== 'agora') {
        this.provider = new AgoraBeautyProvider();
        this._providerId = 'agora';
        await this.provider.init(BeautyConfig);
      } else {
        throw e;
      }
    }
    return this.provider;
  }

  getActiveProviderId() {
    return this._providerId || resolveActiveProviderId();
  }
}
