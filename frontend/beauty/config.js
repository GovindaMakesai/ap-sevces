/**
 * Beauty Engine configuration.
 * Switch active commercial/open-source provider here only — UI & live room stay unchanged.
 *
 * @module beauty/config
 */

/** @typedef {'mediapipe'|'agora'|'banuba'|'byteplus'|'faceunity'|'sensetime'|'tencent'} BeautyProviderId */

export const BeautyConfig = Object.freeze({
  /** Active BeautyProvider. Change this (or set localStorage ap_beauty_provider) to swap SDKs. */
  activeProvider: /** @type {BeautyProviderId} */ ('mediapipe'),

  /** Prefer 480p processing for live latency; renderer may downscale. */
  processWidth: 480,
  processHeight: 854,
  targetFps: 18,
  maxFps: 24,

  /** When true, Agora receives processed frames only (never raw camera) while beauty is on. */
  streamProcessedOnly: true,

  /** MediaPipe model assets (CDN). Override in production if self-hosting. */
  mediapipe: {
    wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    faceLandmarkerModel:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    faceDetectorModel:
      'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.task',
    selfieSegmenterModel:
      'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },

  /** Placeholder endpoints / license keys for commercial SDKs (never hardcode secrets in UI). */
  commercial: {
    banuba: { tokenEnv: 'BANUBA_TOKEN', enabled: false },
    byteplus: { licenseEnv: 'BYTEPLUS_LICENSE', enabled: false },
    faceunity: { authpackEnv: 'FACEUNITY_AUTHPACK', enabled: false },
    sensetime: { licenseEnv: 'SENSETIME_LICENSE', enabled: false },
    tencent: { licenseEnv: 'TENCENT_BEAUTY_LICENSE', enabled: false },
    agora: { useExtension: false },
  },

  storageKey: 'ap_beauty_settings_v1',
  providerOverrideKey: 'ap_beauty_provider',
});

export function resolveActiveProviderId() {
  try {
    const override = localStorage.getItem(BeautyConfig.providerOverrideKey);
    if (override) return /** @type {BeautyProviderId} */ (override);
  } catch (_e) {}
  return BeautyConfig.activeProvider;
}
