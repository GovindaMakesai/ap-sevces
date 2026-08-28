import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS, ResizeMode, Video } from 'expo-av';
import SoftImage from './SoftImage';
import { prefetchImage } from '../lib/perf';

function normalizeNat(ns) {
  let w = Number(ns?.width) || 0;
  let h = Number(ns?.height) || 0;
  if (!w || !h) return null;
  if (ns.orientation === 'portrait' && w > h) {
    const t = w;
    w = h;
    h = t;
  } else if (ns.orientation === 'landscape' && h > w) {
    const t = w;
    w = h;
    h = t;
  }
  return { w, h };
}

function fitBox(nat, box) {
  if (!box?.w || !box?.h) return null;
  if (!nat?.w || !nat?.h) return { width: box.w, height: box.h };
  const ratio = nat.w / nat.h;
  const boxRatio = box.w / box.h;
  if (ratio > boxRatio) {
    return { width: box.w, height: box.w / ratio };
  }
  return { width: box.h * ratio, height: box.h };
}

/** Always re-apply — Live / voice notes leave recording mode that silences reels. */
async function ensurePlaybackAudio() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
  } catch (_e) {}
}

/** Letterbox media to its real ratio — never stretch to fill the screen. */
export default function ContainMedia({
  uri,
  isVideo,
  playing,
  muted = false,
  paused = false,
  poster,
  itemId,
  players,
  sessionKey = 0,
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState(null);
  const [showLoader, setShowLoader] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef(null);
  const stallTimer = useRef(null);
  const loaderDelay = useRef(null);
  const started = useRef(false);
  const frame = useMemo(() => fitBox(nat, box), [nat, box]);
  const shouldPlay = Boolean(playing && !paused && !failed);
  const mountKey = `${itemId || uri}-${sessionKey}-${reloadKey}`;

  const hideLoader = () => {
    if (loaderDelay.current) {
      clearTimeout(loaderDelay.current);
      loaderDelay.current = null;
    }
    setShowLoader(false);
  };

  const scheduleLoader = () => {
    if (started.current || loaderDelay.current) return;
    loaderDelay.current = setTimeout(() => {
      loaderDelay.current = null;
      if (!started.current && shouldPlay) setShowLoader(true);
    }, 450);
  };

  const markStarted = () => {
    if (!started.current) {
      started.current = true;
      setHasStarted(true);
    }
    hideLoader();
  };

  useEffect(() => {
    if (poster) prefetchImage(poster);
  }, [poster]);

  useEffect(() => {
    if (isVideo && shouldPlay) ensurePlaybackAudio();
  }, [isVideo, shouldPlay]);

  useEffect(() => {
    setFailed(false);
    started.current = false;
    setHasStarted(false);
    hideLoader();
    if (isVideo && playing) scheduleLoader();
    return () => {
      if (loaderDelay.current) clearTimeout(loaderDelay.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, mountKey]);

  useEffect(() => {
    if (!playing) {
      hideLoader();
      return;
    }
    if (!started.current) scheduleLoader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    const ref = videoRef.current;
    if (!ref || !isVideo) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (shouldPlay) {
          await ensurePlaybackAudio();
          if (cancelled) return;
          await ref
            .setStatusAsync({
              shouldPlay: true,
              isMuted: Boolean(muted),
              volume: muted ? 0 : 1,
              isLooping: true,
              progressUpdateIntervalMillis: 500,
            })
            .catch(() => {});
          if (!cancelled) await ref.playAsync?.().catch(() => {});
        } else {
          await ref.pauseAsync?.().catch(() => {});
          if (!playing) {
            await ref.setStatusAsync({ shouldPlay: false, positionMillis: 0, isMuted: true, volume: 0 }).catch(() => {});
          }
        }
      } catch (_e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldPlay, muted, playing, isVideo, mountKey]);

  useEffect(() => () => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    if (loaderDelay.current) clearTimeout(loaderDelay.current);
  }, []);

  const register = (r) => {
    videoRef.current = r;
    if (!players || !itemId) return;
    if (r) players.current.set(itemId, r);
    else players.current.delete(itemId);
  };

  const onStatus = (status) => {
    if (!status?.isLoaded) {
      if (status?.error) {
        setFailed(true);
        hideLoader();
      }
      return;
    }

    /* Playing frames = never show loader, even if isBuffering flickers true on Android */
    if (status.isPlaying || Number(status.positionMillis || 0) > 80) {
      markStarted();
      if (stallTimer.current) {
        clearTimeout(stallTimer.current);
        stallTimer.current = null;
      }
      return;
    }

    if (!shouldPlay || paused) {
      hideLoader();
      return;
    }

    /* Stuck before first frame */
    if (!started.current && (status.isBuffering || !status.isPlaying)) {
      scheduleLoader();
      if (!stallTimer.current) {
        stallTimer.current = setTimeout(async () => {
          stallTimer.current = null;
          const ref = videoRef.current;
          if (!ref || started.current) return;
          try {
            const st = await ref.getStatusAsync();
            if (!st?.isLoaded || st.isPlaying) return;
            await ensurePlaybackAudio();
            await ref.setStatusAsync({ shouldPlay: true, isMuted: Boolean(muted), volume: muted ? 0 : 1 }).catch(() => {});
            await ref.playAsync?.().catch(() => setReloadKey((k) => k + 1));
          } catch (_e) {
            setReloadKey((k) => k + 1);
          }
        }, 2200);
      }
    }
  };

  return (
    <View
      style={styles.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width && height) setBox({ w: width, h: height });
      }}
    >
      {uri && isVideo ? (
        <View style={[frame || styles.fill, styles.clip]}>
          {poster && !hasStarted ? (
            <SoftImage uri={poster} style={StyleSheet.absoluteFill} contentFit="contain" recyclingKey={poster} />
          ) : null}
          {!failed ? (
            <Video
              key={mountKey}
              ref={register}
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={shouldPlay}
              isLooping
              isMuted={Boolean(muted) || !shouldPlay}
              useNativeControls={false}
              progressUpdateIntervalMillis={500}
              onPlaybackStatusUpdate={onStatus}
              onError={() => {
                setFailed(true);
                hideLoader();
              }}
              onReadyForDisplay={(ev) => {
                const next = normalizeNat(ev?.naturalSize);
                if (next) setNat(next);
                markStarted();
              }}
            />
          ) : (
            <SoftImage uri={poster || uri} style={StyleSheet.absoluteFill} contentFit="contain" recyclingKey={poster || uri} />
          )}
          {showLoader && shouldPlay && !hasStarted ? (
            <View style={styles.buf} pointerEvents="none">
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>
      ) : uri ? (
        <View style={[frame || styles.fill, styles.clip]}>
          <SoftImage
            uri={uri}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            recyclingKey={uri}
          />
        </View>
      ) : (
        <View style={styles.fill} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { width: '100%', height: '100%' },
  clip: { overflow: 'hidden', backgroundColor: '#000' },
  buf: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
