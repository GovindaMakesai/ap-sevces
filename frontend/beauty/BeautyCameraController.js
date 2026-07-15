/**
 * BeautyCameraController — bridges BeautyEngine ↔ Agora custom video track.
 * Live screens call this instead of providers or canvas beauty directly.
 *
 * @module beauty/BeautyCameraController
 */

import { BeautyEngine } from './BeautyEngine.js';
import { BeautyConfig } from './config.js';

export class BeautyCameraController {
  constructor() {
    this.engine = BeautyEngine.shared;
    /** @type {import('agora-rtc-sdk-ng').ILocalVideoTrack|null} */
    this.customTrack = null;
    /** @type {MediaStream|null} */
    this._captureStream = null;
    this._AgoraRTC = null;
    this._rawTrack = null;
    this._running = false;
  }

  static get shared() {
    if (!BeautyCameraController._shared) {
      BeautyCameraController._shared = new BeautyCameraController();
    }
    return BeautyCameraController._shared;
  }

  /**
   * @param {object} AgoraRTC window.AgoraRTC
   * @param {object} rawCameraTrack Agora camera track (source of truth)
   */
  async start(AgoraRTC, rawCameraTrack) {
    this._AgoraRTC = AgoraRTC;
    this._rawTrack = rawCameraTrack;
    const mediaTrack =
      rawCameraTrack?.getMediaStreamTrack?.() || rawCameraTrack?.mediaStreamTrack || null;
    if (!mediaTrack) throw new Error('No camera MediaStreamTrack for beauty');

    await this.engine.init();

    // Bind Agora provider if active
    if (this.engine.manager.getActiveProviderId() === 'agora') {
      this.engine.manager.provider?.bindTrack?.(rawCameraTrack);
    }

    const canvas = await this.engine.startWithCameraTrack(mediaTrack);
    // Wait for first painted frames
    await new Promise((r) => setTimeout(r, 120));

    if (this.customTrack) {
      try {
        this.customTrack.stop?.();
        this.customTrack.close?.();
      } catch (_e) {}
      this.customTrack = null;
    }
    try {
      this._captureStream?.getTracks?.().forEach((t) => t.stop());
    } catch (_e) {}

    const fps = BeautyConfig.targetFps || 30;
    this._captureStream = canvas.captureStream(fps);
    const mst = this._captureStream.getVideoTracks()[0];
    if (!mst) throw new Error('Beauty captureStream produced no video track');

    this.customTrack = await AgoraRTC.createCustomVideoTrack({
      mediaStreamTrack: mst,
      optimizationMode: 'detail',
    });
    this._running = true;
    return this.customTrack;
  }

  /**
   * Whether live should publish custom processed track.
   */
  shouldPublishProcessed() {
    return (
      BeautyConfig.streamProcessedOnly &&
      this._running &&
      this.engine.isBeautyActive() &&
      Boolean(this.customTrack)
    );
  }

  getCustomTrack() {
    return this.customTrack;
  }

  getPreviewCanvas() {
    return this.engine.getOutputCanvas();
  }

  async stop() {
    this._running = false;
    this.engine.stop();
    try {
      this.customTrack?.stop?.();
      this.customTrack?.close?.();
    } catch (_e) {}
    this.customTrack = null;
    try {
      this._captureStream?.getTracks?.().forEach((t) => t.stop());
    } catch (_e) {}
    this._captureStream = null;
    this.engine.pipeline?.detachCamera?.();
  }

  async dispose() {
    await this.stop();
    await this.engine.dispose();
  }
}

BeautyCameraController._shared = null;
