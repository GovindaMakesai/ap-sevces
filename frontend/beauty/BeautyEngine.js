/**
 * BeautyEngine — central facade. All UI / live code talks to this only.
 *
 * Camera → BeautyEngine → BeautyPipeline → BeautyRenderer/Provider → Agora track
 *
 * @module beauty/BeautyEngine
 */

import { BeautyConfig } from './config.js';
import { BeautyManager } from './BeautyManager.js';
import { BeautyPipeline } from './BeautyPipeline.js';
import { BEAUTY_EFFECT_CATALOG } from './BeautyEffect.js';

export class BeautyEngine {
  constructor() {
    this.manager = new BeautyManager();
    /** @type {BeautyPipeline|null} */
    this.pipeline = null;
    this._initPromise = null;
  }

  /** Singleton accessor used by live room */
  static get shared() {
    if (!BeautyEngine._shared) BeautyEngine._shared = new BeautyEngine();
    return BeautyEngine._shared;
  }

  get settings() {
    return this.manager.settings;
  }

  get effectCatalog() {
    return BEAUTY_EFFECT_CATALOG;
  }

  get config() {
    return BeautyConfig;
  }

  async init(providerId) {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const provider = await this.manager.ensureProvider(providerId);
      this.pipeline = new BeautyPipeline({
        provider,
        settings: this.manager.settings,
      });
      this.pipeline.setTargetFps(BeautyConfig.targetFps);
      return this;
    })();
    try {
      return await this._initPromise;
    } catch (e) {
      this._initPromise = null;
      throw e;
    }
  }

  /**
   * Attach raw camera MediaStreamTrack and start processing loop.
   * @param {MediaStreamTrack} mediaTrack
   * @param {(canvas: HTMLCanvasElement, meta: object) => void} [onFrame]
   */
  async startWithCameraTrack(mediaTrack, onFrame) {
    await this.init();
    if (!this.pipeline) throw new Error('BeautyEngine pipeline missing');
    await this.pipeline.attachCameraTrack(mediaTrack);
    if (onFrame) this.pipeline.onFrame(onFrame);
    this.pipeline.start();
    return this.pipeline.outputCanvas;
  }

  stop() {
    this.pipeline?.stop();
  }

  async dispose() {
    this.pipeline?.dispose();
    this.pipeline = null;
    await this.manager.provider?.dispose?.();
    this.manager.provider = null;
    this._initPromise = null;
  }

  isBeautyActive() {
    return Boolean(this.settings.enabled && this.settings.hasActiveEffects());
  }

  getOutputCanvas() {
    return this.pipeline?.outputCanvas || null;
  }

  getFps() {
    return this.pipeline?.getFps?.() || 0;
  }

  applyPreset(id) {
    return this.manager.applyPreset(id);
  }

  setIntensity(id, value) {
    this.manager.setIntensity(id, value);
  }

  setEnabled(on) {
    this.manager.setEnabled(on);
  }

  reset() {
    this.manager.reset();
  }

  setCompareMode(on) {
    this.manager.setCompareMode(on);
  }

  listPresets() {
    return this.manager.listPresets();
  }

  onChange(fn) {
    return this.manager.onChange(fn);
  }
}

BeautyEngine._shared = null;
