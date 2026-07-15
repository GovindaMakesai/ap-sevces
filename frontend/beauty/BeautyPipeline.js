/**
 * BeautyPipeline — Camera frame → analyze → plugins → provider.render → output canvas.
 * One place all frames flow through. Screens never call providers.
 *
 * @module beauty/BeautyPipeline
 */

import { BeautyPluginRegistry } from './BeautyPlugin.js';

export class BeautyPipeline {
  /**
   * @param {{ provider: import('./BeautyProvider.js').BeautyProvider, settings: import('./BeautySettings.js').BeautySettings }} opts
   */
  constructor(opts) {
    this.provider = opts.provider;
    this.settings = opts.settings;
    this.plugins = new BeautyPluginRegistry();
    /** @type {HTMLVideoElement|null} */
    this.sourceVideo = null;
    /** @type {HTMLCanvasElement} */
    this.outputCanvas = document.createElement('canvas');
    this._raf = 0;
    this._running = false;
    this._lastTs = 0;
    this._targetFrameMs = 1000 / 30;
    this._onFrame = null;
    this._stats = { fps: 0, frames: 0, lastFpsAt: 0 };
  }

  setTargetFps(fps) {
    this._targetFrameMs = 1000 / Math.max(15, Math.min(60, fps || 30));
  }

  /**
   * @param {MediaStreamTrack} mediaTrack
   */
  async attachCameraTrack(mediaTrack) {
    this.detachCamera();
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    video.srcObject = new MediaStream([mediaTrack]);
    document.body.appendChild(video);
    await video.play().catch(() => {});
    this.sourceVideo = video;

    await new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (video.readyState >= 2 && video.videoWidth) return resolve();
        if (Date.now() - t0 > 2500) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });

    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    this.outputCanvas.width = w;
    this.outputCanvas.height = h;
  }

  detachCamera() {
    this.stop();
    if (this.sourceVideo) {
      try {
        this.sourceVideo.srcObject = null;
        this.sourceVideo.remove();
      } catch (_e) {}
      this.sourceVideo = null;
    }
  }

  onFrame(cb) {
    this._onFrame = cb;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._stats.lastFpsAt = performance.now();
    this._stats.frames = 0;
    const loop = async (ts) => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(loop);
      if (ts - this._lastTs < this._targetFrameMs - 1) return;
      this._lastTs = ts;
      await this.processFrame(ts);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  async processFrame(timestampMs = performance.now()) {
    const video = this.sourceVideo;
    if (!video || video.readyState < 2) return;
    if (!this.settings.enabled || !this.settings.hasActiveEffects()) {
      // Passthrough when beauty off — caller may publish raw camera instead
      const g = this.outputCanvas.getContext('2d');
      if (g) {
        if (this.outputCanvas.width !== video.videoWidth && video.videoWidth) {
          this.outputCanvas.width = video.videoWidth;
          this.outputCanvas.height = video.videoHeight;
        }
        g.drawImage(video, 0, 0, this.outputCanvas.width, this.outputCanvas.height);
      }
      this._bumpFps();
      this._onFrame?.(this.outputCanvas, { passthrough: true });
      return;
    }

    /** @type {import('./BeautyProvider.js').BeautyFrameContext} */
    let ctx = {
      source: video,
      width: this.outputCanvas.width,
      height: this.outputCanvas.height,
      timestampMs,
      intensities: this.settings.toNormalizedMap(),
      landmarks: null,
      segmentationMask: null,
    };

    const analyzed = await this.provider.analyze(ctx);
    ctx = { ...ctx, ...analyzed };

    if (this.settings.compareMode) {
      // Left half raw, right half beauty
      await this.plugins.runBefore(ctx, this.outputCanvas);
      await this.provider.render(ctx, this.outputCanvas);
      await this.plugins.runAfter(ctx, this.outputCanvas);
      const g = this.outputCanvas.getContext('2d');
      if (g) {
        const w = this.outputCanvas.width;
        const h = this.outputCanvas.height;
        g.drawImage(video, 0, 0, w / 2, h, 0, 0, w / 2, h);
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.beginPath();
        g.moveTo(w / 2, 0);
        g.lineTo(w / 2, h);
        g.stroke();
      }
    } else {
      await this.plugins.runBefore(ctx, this.outputCanvas);
      await this.provider.render(ctx, this.outputCanvas);
      await this.plugins.runAfter(ctx, this.outputCanvas);
    }

    // Keep Agora provider intensities in sync if applicable
    await this.provider.setIntensities?.(ctx.intensities);

    this._bumpFps();
    this._onFrame?.(this.outputCanvas, { passthrough: false });
  }

  _bumpFps() {
    this._stats.frames += 1;
    const now = performance.now();
    if (now - this._stats.lastFpsAt >= 1000) {
      this._stats.fps = this._stats.frames;
      this._stats.frames = 0;
      this._stats.lastFpsAt = now;
    }
  }

  getFps() {
    return this._stats.fps;
  }

  dispose() {
    this.detachCamera();
  }
}
