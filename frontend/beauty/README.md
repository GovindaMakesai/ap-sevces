# Earn4U Beauty Engine

Production-oriented AI Beauty architecture for live streaming (Agora).

Comparable in **module layout** to Instagram / TikTok / Bigo / Tango / MICO / Likee stacks: one central engine, pluggable providers, GPU rendering, preset intensities, Agora custom track output.

---

## Data flow

```
Camera (Agora raw track)
    ↓
BeautyCameraController
    ↓
BeautyEngine
    ↓
BeautyPipeline
    ↓
BeautyProvider (active)  →  analyze (landmarks / masks)
    ↓
BeautyRenderer (WebGL / GPU shaders)   [or vendor SDK render]
    ↓
Output canvas → captureStream → Agora createCustomVideoTrack
    ↓
Live stream (viewers)
```

**Rule:** Screens and `social-live.js` must only call `window.APBeauty` / `BeautyCameraController`. Never import Banuba, BytePlus, FaceUnity, etc. from UI.

---

## Modules

| Module | Role |
|--------|------|
| `BeautyEngine` | Facade singleton — only public API for app code |
| `BeautyManager` | Settings persistence, presets, provider create/swap |
| `BeautyPipeline` | Frame loop, plugins, passthrough vs process |
| `BeautyRenderer` | WebGL shader passes (OpenGL ES via WebGL; Metal via ANGLE) |
| `BeautyPreset` | Named intensity stacks (Natural, Instagram, TikTok, …) |
| `BeautySettings` | Effect intensities 0–100, enabled, compare mode |
| `BeautyEffect` | Catalog of stackable effects |
| `BeautyPlugin` | Optional before/after render hooks |
| `BeautyProvider` | **Interface** all SDKs implement |
| `BeautyCameraController` | Agora custom track bridge |
| `config.js` | **Switch active provider here** |

---

## Providers

Active provider is chosen in `config.js` → `activeProvider`, or override:

```js
localStorage.setItem('ap_beauty_provider', 'mediapipe');
```

| Id | Status |
|----|--------|
| `mediapipe` | **Implemented** — Face Landmarker (478), selfie segmenter (best-effort), WebGL beauty |
| `agora` | Fallback — `setBeautyEffect` on camera track |
| `banuba` | Placeholder — integrate in `providers/stubs.js` `BanubaProvider.init/render` |
| `byteplus` | Placeholder |
| `faceunity` | Placeholder |
| `sensetime` | Placeholder |
| `tencent` | Placeholder |

### Where commercial SDK integration occurs

1. Implement `BeautyProvider` methods: `init`, `analyze`, `render`, `setIntensities`, `dispose`.
2. Register constructor in `BeautyManager` `PROVIDER_CTORS`.
3. Set `BeautyConfig.activeProvider` (or localStorage).
4. **Do not change** `BeautySheet` UI or live-room business logic.

Marked `PLACEHOLDER` / `MARK:` in source for unfinished hooks (Vulkan/WebGPU, hair segmentation, full mesh reshape).

---

## Effects (0–100, stackable)

Skin smoothing, whitening, tone · bright eyes · dark circles · teeth · eye enlarge · face/jaw/chin/nose/forehead reshape (SDK-quality via commercial providers) · lip · contrast · saturation · LUT · sharpen · soft light · glow · natural beauty.

---

## UI

Bottom sheet tabs: **Beauty · Filters · Face · Makeup · Advanced**

- Live intensity sliders  
- Presets  
- Before / After  
- Reset  
- FPS readout  

Open from live host Filters button (wired to `APBeauty.openSheet()`).

---

## Performance targets

- Target 30 FPS (config `targetFps`), up to 60  
- Landmark detection every N frames to reduce CPU  
- GPU shaders for grade/skin; avoid readback  
- Dispose tracks/canvases on stop to prevent leaks  

---

## Streaming contract

When beauty is **enabled** and has active effects:

- Publish **processed** Agora custom track only (`streamProcessedOnly: true`).
- Raw camera remains the pipeline **source** but is not the published video track.

When beauty is **off**:

- Publish raw Agora camera track.

---

## Quick start

```html
<link rel="stylesheet" href="/beauty/ui/beauty-sheet.css">
<script type="module" src="/beauty/index.js"></script>
```

```js
const { camera, openSheet } = window.APBeauty;
const custom = await camera.start(AgoraRTC, rawCameraTrack);
await agoraClient.publish(custom);
openSheet();
```
