/**
 * BeautyProvider — abstract interface for all beauty SDKs.
 * Screens must NEVER import Banuba/BytePlus/etc. Call BeautyEngine only.
 *
 * Commercial SDK integration point: implement this class in providers/*.
 *
 * @module beauty/BeautyProvider
 */

/**
 * @typedef {Object} BeautyFrameContext
 * @property {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
 * @property {number} width
 * @property {number} height
 * @property {number} timestampMs
 * @property {Record<string, number>} intensities  effectId → 0..1
 * @property {Float32Array|null} [landmarks]  normalized xy pairs if available
 * @property {ImageData|HTMLCanvasElement|null} [segmentationMask]
 */

/**
 * @typedef {Object} BeautyProviderCapabilities
 * @property {boolean} faceMesh
 * @property {boolean} faceDetection
 * @property {boolean} selfieSegmentation
 * @property {boolean} hairSegmentation
 * @property {boolean} gpuShaders
 * @property {boolean} reshape
 * @property {string[]} supportedEffects
 */

export class BeautyProvider {
  /** @returns {string} */
  get id() {
    throw new Error('BeautyProvider.id not implemented');
  }

  /** @returns {string} */
  get displayName() {
    return this.id;
  }

  /** @returns {BeautyProviderCapabilities} */
  getCapabilities() {
    return {
      faceMesh: false,
      faceDetection: false,
      selfieSegmentation: false,
      hairSegmentation: false,
      gpuShaders: false,
      reshape: false,
      supportedEffects: [],
    };
  }

  /**
   * PLACEHOLDER HOOK — commercial SDKs initialize licenses/WASM here.
   * @param {import('./config.js').BeautyConfig} [_config]
   * @returns {Promise<void>}
   */
  async init(_config) {
    /* override */
  }

  /** @returns {Promise<void>} */
  async dispose() {
    /* override */
  }

  /**
   * Analyze frame (landmarks / masks). May be no-op for SDK-owned pipelines.
   * @param {BeautyFrameContext} _ctx
   * @returns {Promise<Partial<BeautyFrameContext>>}
   */
  async analyze(_ctx) {
    return {};
  }

  /**
   * Render beauty into destination canvas (GPU preferred).
   * @param {BeautyFrameContext} _ctx
   * @param {HTMLCanvasElement} _destCanvas
   * @returns {Promise<void>}
   */
  async render(_ctx, _destCanvas) {
    throw new Error(`${this.id}: render() not implemented`);
  }

  /** Optional: SDK-native intensity map push (Banuba/FU style). */
  async setIntensities(_map) {
    /* override */
  }

  isReady() {
    return false;
  }
}
