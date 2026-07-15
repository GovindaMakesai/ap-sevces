/**
 * Earn4U Beauty Engine — public entry.
 * Loads as ES module; exposes window.APBeauty for social-live.js.
 *
 * @module beauty/index
 */

import { BeautyConfig, resolveActiveProviderId } from './config.js';
import { BeautyEngine } from './BeautyEngine.js';
import { BeautyManager } from './BeautyManager.js';
import { BeautyPipeline } from './BeautyPipeline.js';
import { BeautyRenderer } from './BeautyRenderer.js';
import { BeautyPreset, BUILTIN_PRESETS } from './BeautyPreset.js';
import { BeautySettings } from './BeautySettings.js';
import { BeautyEffect, BEAUTY_EFFECT_CATALOG } from './BeautyEffect.js';
import { BeautyPlugin, BeautyPluginRegistry } from './BeautyPlugin.js';
import { BeautyProvider } from './BeautyProvider.js';
import { BeautyCameraController } from './BeautyCameraController.js';
import { BeautySheet } from './ui/BeautySheet.js';
import { MediaPipeProvider } from './providers/mediapipe/MediaPipeProvider.js';
import {
  AgoraBeautyProvider,
  BanubaProvider,
  BytePlusProvider,
  FaceUnityProvider,
  SenseTimeProvider,
  TencentBeautyProvider,
} from './providers/stubs.js';

const APBeauty = {
  version: '1.0.0',
  config: BeautyConfig,
  resolveActiveProviderId,
  BeautyEngine,
  BeautyManager,
  BeautyPipeline,
  BeautyRenderer,
  BeautyPreset,
  BeautySettings,
  BeautyEffect,
  BeautyPlugin,
  BeautyPluginRegistry,
  BeautyProvider,
  BeautyCameraController,
  BeautySheet,
  BEAUTY_EFFECT_CATALOG,
  BUILTIN_PRESETS,
  providers: {
    MediaPipeProvider,
    AgoraBeautyProvider,
    BanubaProvider,
    BytePlusProvider,
    FaceUnityProvider,
    SenseTimeProvider,
    TencentBeautyProvider,
  },
  engine: BeautyEngine.shared,
  camera: BeautyCameraController.shared,
  openSheet() {
    BeautySheet.shared().open();
  },
  closeSheet() {
    BeautySheet.shared().close();
  },
};

window.APBeauty = APBeauty;
document.dispatchEvent(new CustomEvent('ap-beauty-ready', { detail: APBeauty }));

export default APBeauty;
export {
  BeautyConfig,
  BeautyEngine,
  BeautyManager,
  BeautyPipeline,
  BeautyRenderer,
  BeautyPreset,
  BeautySettings,
  BeautyEffect,
  BeautyPlugin,
  BeautyProvider,
  BeautyCameraController,
  BeautySheet,
};
