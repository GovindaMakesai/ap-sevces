/**
 * MediaPipeProvider — open-source BeautyProvider.
 * Face Mesh (478 landmarks), Face Detection, Selfie Segmentation (optional).
 *
 * Commercial swap: replace activeProvider in config — no UI changes.
 *
 * @module beauty/providers/mediapipe/MediaPipeProvider
 */

import { BeautyProvider } from '../../BeautyProvider.js';
import { BeautyRenderer } from '../../BeautyRenderer.js';
import { BeautyConfig } from '../../config.js';
import { BEAUTY_EFFECT_CATALOG } from '../../BeautyEffect.js';

export class MediaPipeProvider extends BeautyProvider {
  constructor() {
    super();
    this._ready = false;
    this._landmarker = null;
    this._segmenter = null;
    this._renderer = new BeautyRenderer();
    this._lastLandmarks = null;
    this._detectEvery = 2; // run landmarker every N frames for FPS
    this._frame = 0;
    this._vision = null;
  }

  get id() {
    return 'mediapipe';
  }

  get displayName() {
    return 'MediaPipe Face Mesh';
  }

  getCapabilities() {
    return {
      faceMesh: true,
      faceDetection: true,
      selfieSegmentation: Boolean(this._segmenter),
      hairSegmentation: false, // MARK: enable with dedicated hair model when bundled
      gpuShaders: true,
      reshape: false, // MARK: mesh warp TBD; commercial SDKs provide this
      supportedEffects: BEAUTY_EFFECT_CATALOG.map((e) => e.id),
    };
  }

  isReady() {
    return this._ready;
  }

  async init(config = BeautyConfig) {
    const width = config.processWidth || 720;
    const height = config.processHeight || 1280;
    this._renderer.init(width, height);

    // Dynamic import from CDN (no bundler required)
    const mod = await import(
      /* webpackIgnore: true */
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'
    );
    this._vision = mod;
    const { FaceLandmarker, FilesetResolver } = mod;
    const wasm = await FilesetResolver.forVisionTasks(config.mediapipe.wasmBase);

    this._landmarker = await FaceLandmarker.createFromOptions(wasm, {
      baseOptions: {
        modelAssetPath: config.mediapipe.faceLandmarkerModel,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });

    // Selfie segmentation — optional; model may be unavailable on some CDNs/WebViews
    try {
      // PLACEHOLDER path: swap for self-hosted selfie_segmenter.task when ready
      this._segmenter = null;
      /* Example when model hosted:
      this._segmenter = await ImageSegmenter.createFromOptions(wasm, {
        baseOptions: {
          modelAssetPath: config.mediapipe.selfieSegmenterModel,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
      });
      */
    } catch (_e) {
      this._segmenter = null;
    }

    this._ready = true;
  }

  async dispose() {
    try {
      this._landmarker?.close?.();
    } catch (_e) {}
    try {
      this._segmenter?.close?.();
    } catch (_e) {}
    this._renderer.dispose();
    this._ready = false;
  }

  /**
   * @param {import('../../BeautyProvider.js').BeautyFrameContext} ctx
   */
  async analyze(ctx) {
    this._frame += 1;
    if (!this._landmarker || !ctx.source) return { landmarks: this._lastLandmarks };

    if (this._frame % this._detectEvery === 0) {
      try {
        const ts = ctx.timestampMs || performance.now();
        const result = this._landmarker.detectForVideo(ctx.source, ts);
        const face = result?.faceLandmarks?.[0];
        if (face && face.length) {
          const arr = new Float32Array(face.length * 2);
          for (let i = 0; i < face.length; i += 1) {
            arr[i * 2] = face[i].x;
            arr[i * 2 + 1] = face[i].y;
          }
          this._lastLandmarks = arr;
        }
      } catch (_e) {
        /* keep last landmarks */
      }
    }
    return { landmarks: this._lastLandmarks };
  }

  /**
   * @param {import('../../BeautyProvider.js').BeautyFrameContext} ctx
   * @param {HTMLCanvasElement} destCanvas
   */
  async render(ctx, destCanvas) {
    if (!this._ready) return;
    const intensities = ctx.intensities || {};
    const ok = this._renderer.uploadSource(ctx.source);
    if (!ok) return;
    this._renderer.render(intensities, ctx.landmarks || this._lastLandmarks);
    this._renderer.applyReshapePlaceholder(intensities, ctx.landmarks || this._lastLandmarks);

    const src = this._renderer.canvas;
    if (!src || !destCanvas) return;
    if (destCanvas.width !== src.width) destCanvas.width = src.width;
    if (destCanvas.height !== src.height) destCanvas.height = src.height;
    const g = destCanvas.getContext('2d');
    if (g) g.drawImage(src, 0, 0);
  }

  getOutputCanvas() {
    return this._renderer.canvas;
  }
}
