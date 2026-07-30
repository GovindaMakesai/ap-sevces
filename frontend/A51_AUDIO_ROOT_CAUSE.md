# P0 — Samsung Galaxy A51 Low Host / Seat Voice

**Date:** 2026-07-30  
**Branch:** `main`  
**Scope:** Evidence from production code + git history. No speculation beyond cited lines.

---

## Symptoms (as reported)

| # | Symptom | Role |
|---|---------|------|
| 1 | Device-specific: Samsung Galaxy A51 only | — |
| 2 | Others hear host normally | Host **uplink** OK |
| 3 | Host hears guests very quietly | Host **downlink** quiet |
| 4 | Same user joins another room → her mic still very quiet | As **seat guest**, **uplink** quiet |
| 5 | Other participants normal | Non-A51 OK |

---

## Exact root cause (two related bugs)

### Bug A — Host hears guests quietly on A51

**Evidence:**

1. Commit `fdb921c` (“Calm live audio”) **removed host remote boost**:
   - Before: host/seat remote `setVolume(400)` / WebAudio gain `3.0`
   - After: flat **`100`** for everyone (`social-live.js` boost path + `live-media-engine.js` `VOL = 100`)
2. Code still documents that **software AEC ducks seat audio once host mic is live**:
   - `social-live.js` ~6055: `/* AEC ducks seat mics once host mic is live */`
   - Host mic created with `AEC: true` (`createRoomMicrophoneTrack` host opts)
3. `live-media-engine.js` set `isPublisher` but **never used it** to raise playback volume after the calm-audio change — AEC compensation was removed, ducking remained.

**Causal chain:** Host stays in `enterPlayback` (good for uplink) + local `AEC: true` → far-end is attenuated on A51 OEM/WebRTC → remote volume left at 100 → guests sound quiet **to the host**. Others still hear the host (uplink not ducked the same way).

### Bug B — Same A51 user joins another room with quiet mic

**Evidence:**

1. Commit `0e9b40c` fixed Samsung host uplink by **forbidding `enterTalk` / recording mode** for hosts (HW AEC in `MODE_IN_COMMUNICATION` cancels host voice). Comments at `onRoomReady` / `App.js` `request_media_permissions` state this explicitly.
2. **Seat guest path still called `enterTalk`:**
   - `onRoomReady`: `hasSpeakerSeat` → `enterTalk`
   - `guest_publish_ok` → `enterTalk`
   - `requestNativeSpeakerAudio`: seats → `enterTalk` + `force_speaker_audio` `recording: true`
3. `LiveAudioRoute.enterTalk` → `allowsRecordingIOS: true` → Android communication/recording session (expo-av) → **Samsung HW AEC on**.
4. `createRoomMicrophoneTrack` called `leaveHostCommunicationAudioMode()` **only when `hostLike`** — seats never left communication mode before getUserMedia.
5. Seat send volume was flat **100** with **no** Samsung boost (`localMicSendVolume`).

**Causal chain:** On A51, sitting as guest re-enables the same HW AEC path that `0e9b40c` removed for hosts → **her uplink is suppressed** in the other room. Hosting her own room still sounds fine to others (playback mode).

---

## Audit checklist (what exists / what does not)

| # | Area | Finding |
|---|------|---------|
| 1 | AudioManager mode | **No** `AudioManager` in app — only `expo-av` `setAudioModeAsync` (`liveAudioRoute.js`) |
| 2 | Audio focus | `DuckOthers` / `MixWithOthers`; host uses `enterPlayback`, seats used `enterTalk` |
| 3 | AudioAttributes | Not set directly — expo-av maps modes |
| 4 | Communication device | Not selected in native code |
| 5 | Speakerphone | `playThroughEarpieceAndroid: false` (speaker preference) |
| 6 | Bluetooth | Separate thrash issue; not the A51 quiet-host-hearing path |
| 7 | SCO | **Not implemented** |
| 8 | Routing after publish | Host → `enterPlayback`; seat → was `enterTalk` (**bug**) |
| 9 | Agora local volume | Host Samsung 130; seat was 100 |
| 10 | Agora playback volume | Flat 100 after `fdb921c` (**bug for A51 host downlink**) |
| 11 | WebView audio | `<audio>` sinks volume 1; no Android `setSinkId` |
| 12 | AudioTrack volume | Via Agora `RemoteAudioTrack.setVolume` only |
| 13 | Samsung-specific | `isSamsungHostMicRisk()` matches `SM-A51` / Samsung UA |
| 14 | OEM enhancements | HW AEC via communication mode — documented in-repo |

---

## Fix applied (this change)

1. **Samsung seats** use `enterPlayback` (not `enterTalk`), same as host A51 policy.
2. Leave communication mode **before** mic create for Samsung seats.
3. **Samsung host remote volume** restored to **280** (seat publisher **180**) via `volumeFor` in LiveMediaEngine — non-Samsung stays 100.
4. Samsung seat send volume **160**.
5. **Transition logging:** `[AP-AUDIO-TX]` in WebView + `[LiveAudioRoute:TX]` in native logcat on every route/volume/mic transition.

---

## Verification on A51

1. Host room with 2+ seats → host should hear guests clearly; others still hear host.  
2. Same A51 user takes a seat in another room → others should hear her at normal level.  
3. Logcat / remote debug: look for `native_enterPlayback` (not `native_enterTalk`) when `samsung:true`, and `boost_remote_volumes` with `vol:280` as host.

**Web deploy** picks up JS fixes immediately. **Native TX logs** need next app build for logcat lines from `liveAudioRoute.js`.
