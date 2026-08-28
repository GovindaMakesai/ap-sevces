/**
 * Screenshot / screen-recording lock for Live (and Live PK).
 * Party rooms stay unlocked unless a live PK overlay is active.
 * Uses a depth counter so switching live rooms during PK never
 * briefly clears FLAG_SECURE (that was allowing PK screenshots).
 */
import * as ScreenCapture from 'expo-screen-capture';

export const LIVE_SECURE_KEY = 'ap-live-secure';

let depth = 0;
let applying = Promise.resolve();

function run(fn) {
  applying = applying.then(fn, fn).catch(() => {});
  return applying;
}

export function liveSecureDepth() {
  return depth;
}

/** Call when entering a live video room or when Live PK is active. */
export function enterLiveSecure(reason = 'enter') {
  return run(async () => {
    depth += 1;
    try {
      await ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY);
    } catch (_e) {}
    if (__DEV__) {
      try {
        console.warn('[LiveSecure] enter', reason, 'depth=', depth);
      } catch (_e2) {}
    }
  });
}

/** Call when leaving live / ending PK. Only unlocks when last session ends. */
export function leaveLiveSecure(reason = 'leave') {
  return run(async () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      /* Delay unlock so live→live replace during PK never flashes an open window */
      await new Promise((r) => setTimeout(r, 450));
      if (depth === 0) {
        try {
          await ScreenCapture.allowScreenCaptureAsync(LIVE_SECURE_KEY);
        } catch (_e) {}
      } else {
        try {
          await ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY);
        } catch (_e) {}
      }
    } else {
      try {
        await ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY);
      } catch (_e) {}
    }
    if (__DEV__) {
      try {
        console.warn('[LiveSecure] leave', reason, 'depth=', depth);
      } catch (_e2) {}
    }
  });
}

/** Force re-apply lock (foreground resume, PK start). */
export function assertLiveSecure(reason = 'assert') {
  return run(async () => {
    if (depth <= 0) return;
    try {
      await ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY);
    } catch (_e) {}
    if (__DEV__) {
      try {
        console.warn('[LiveSecure] assert', reason, 'depth=', depth);
      } catch (_e2) {}
    }
  });
}

/** App cold start / leave all live — wipe leftover FLAG_SECURE. */
export function clearLiveSecure(reason = 'clear') {
  return run(async () => {
    depth = 0;
    try {
      await ScreenCapture.allowScreenCaptureAsync(LIVE_SECURE_KEY);
    } catch (_e) {}
    if (__DEV__) {
      try {
        console.warn('[LiveSecure] clear', reason);
      } catch (_e2) {}
    }
  });
}

export default {
  LIVE_SECURE_KEY,
  enterLiveSecure,
  leaveLiveSecure,
  assertLiveSecure,
  clearLiveSecure,
  liveSecureDepth,
};
