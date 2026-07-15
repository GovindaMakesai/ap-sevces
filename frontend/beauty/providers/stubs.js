/**
 * Commercial / alternate BeautyProvider stubs.
 * MARK: PLACEHOLDER — wire real SDK init in each file's init()/render().
 * UI and BeautyEngine do not change when these become active.
 *
 * @module beauty/providers/stubs
 */

import { BeautyProvider } from '../BeautyProvider.js';

function stubCaps(extra = {}) {
  return {
    faceMesh: false,
    faceDetection: false,
    selfieSegmentation: false,
    hairSegmentation: false,
    gpuShaders: true,
    reshape: true,
    supportedEffects: [],
    ...extra,
  };
}

/** Wraps AgoraRTC track.setBeautyEffect — lightweight fallback. */
export class AgoraBeautyProvider extends BeautyProvider {
  constructor() {
    super();
    this._track = null;
    this._ready = false;
  }
  get id() {
    return 'agora';
  }
  get displayName() {
    return 'Agora Beauty Effect';
  }
  getCapabilities() {
    return stubCaps({ reshape: false, supportedEffects: ['skinSmoothing', 'skinWhitening', 'naturalBeauty'] });
  }
  async init() {
    this._ready = true;
  }
  isReady() {
    return this._ready;
  }
  /** PLACEHOLDER HOOK — bind local Agora video track from BeautyCameraController */
  bindTrack(track) {
    this._track = track;
  }
  async setIntensities(map) {
    const t = this._track;
    if (!t || typeof t.setBeautyEffect !== 'function') return;
    const smooth = map.skinSmoothing || 0;
    const white = map.skinWhitening || map.naturalBeauty || 0;
    if (smooth <= 0 && white <= 0) {
      await t.setBeautyEffect(false);
      return;
    }
    await t.setBeautyEffect(true, {
      lighteningLevel: Math.min(1, white * 0.9),
      smoothnessLevel: Math.min(1, smooth * 0.95),
      rednessLevel: 0.15,
      lighteningContrastLevel: 1,
    });
  }
  async render(ctx, destCanvas) {
    // Agora processes on the track; copy source for preview consistency
    const g = destCanvas.getContext('2d');
    if (g && ctx.source) {
      if (destCanvas.width !== (ctx.width || destCanvas.width)) destCanvas.width = ctx.width;
      if (destCanvas.height !== (ctx.height || destCanvas.height)) destCanvas.height = ctx.height;
      g.drawImage(ctx.source, 0, 0, destCanvas.width, destCanvas.height);
    }
  }
  async dispose() {
    this._track = null;
    this._ready = false;
  }
}

function makeCommercialStub(id, displayName) {
  return class extends BeautyProvider {
    get id() {
      return id;
    }
    get displayName() {
      return displayName;
    }
    getCapabilities() {
      return stubCaps({ faceMesh: true, reshape: true });
    }
    /**
     * PLACEHOLDER — commercial SDK integration occurs HERE.
     * Load vendor script, apply license from BeautyConfig.commercial, create effect player.
     */
    async init(_config) {
      console.info(`[APBeauty] ${id} provider is a placeholder. Set BeautyConfig.activeProvider after SDK wiring.`);
      this._ready = false;
    }
    isReady() {
      return false;
    }
    async render(_ctx, _dest) {
      throw new Error(`${id} BeautyProvider not integrated yet — see beauty/README.md`);
    }
    async dispose() {}
  };
}

export const BanubaProvider = makeCommercialStub('banuba', 'Banuba');
export const BytePlusProvider = makeCommercialStub('byteplus', 'BytePlus Effects');
export const FaceUnityProvider = makeCommercialStub('faceunity', 'FaceUnity');
export const SenseTimeProvider = makeCommercialStub('sensetime', 'SenseTime');
export const TencentBeautyProvider = makeCommercialStub('tencent', 'Tencent Beauty');
