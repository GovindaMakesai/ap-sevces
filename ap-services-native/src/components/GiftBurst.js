import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_DURATION_MS, resolveGiftAnim } from '../config/giftAnims';

let WebViewCmp = null;
try {
  WebViewCmp = require('react-native-webview').WebView;
} catch (_e) {
  WebViewCmp = null;
}

/**
 * Plays ONE gift animation to completion then calls onDone.
 * Never loops — matches web AnimStream (LOOP='').
 */
export default function GiftBurst({ gift, onDone }) {
  const scale = useRef(new Animated.Value(0.82)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bannerY = useRef(new Animated.Value(36)).current;
  const webOpacity = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const [showWeb, setShowWeb] = useState(true);
  const doneRef = useRef(false);
  const finishRef = useRef(null);
  const webRef = useRef(null);
  const anim = useMemo(() => resolveGiftAnim(gift), [gift]);
  const giftKey = String(gift?._playKey || gift?._key || '');
  const playMs = Math.min(
    Math.max(Number(anim?.durationMs || gift?.durationMs || DEFAULT_DURATION_MS) || DEFAULT_DURATION_MS, 6000),
    12000
  );

  useEffect(() => {
    if (!gift || !giftKey) return undefined;
    doneRef.current = false;
    setShowWeb(true);
    scale.setValue(0.82);
    opacity.setValue(0);
    bannerY.setValue(36);
    webOpacity.setValue(0);
    glow.setValue(0.35);

    let finished = false;
    const finish = () => {
      if (finished || doneRef.current) return;
      finished = true;
      doneRef.current = true;
      setShowWeb(false);
      try {
        webRef.current?.stopLoading?.();
      } catch (_e) {}
      try {
        onDone?.();
      } catch (_e) {}
    };
    finishRef.current = finish;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 520, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const intro = Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 86 }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(bannerY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 72 }),
    ]);
    const hold = Animated.delay(playMs);
    const outro = Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(webOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(bannerY, { toValue: -20, duration: 280, useNativeDriver: true }),
    ]);
    const seq = Animated.sequence([intro, hold, outro]);
    seq.start(({ finished: ok }) => {
      pulse.stop();
      if (ok) finish();
    });

    /* Hard cap — never leave animation on screen forever */
    const hardStop = setTimeout(finish, playMs + 700);

    return () => {
      clearTimeout(hardStop);
      pulse.stop();
      seq.stop();
      finishRef.current = null;
      finished = true;
      doneRef.current = true;
      setShowWeb(false);
    };
    // Intentionally only re-run when giftKey changes (stable play token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giftKey]);

  if (!gift) return null;

  const label = anim?.title || gift.name || 'a gift';
  const qty = Number(gift.qty || 1);
  const embed = anim?.embedUrl
    ? `${anim.embedUrl}${anim.embedUrl.includes('?') ? '&' : '?'}loop=&autoplay=1&once=1`
    : '';

  return (
    <View pointerEvents="none" style={styles.wrap} collapsable={false}>
      <Animated.View style={[styles.stage, { opacity: webOpacity }]}>
        {showWeb && WebViewCmp && embed ? (
          <WebViewCmp
            ref={webRef}
            key={giftKey}
            source={{ uri: embed }}
            style={styles.web}
            containerStyle={styles.webBox}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo={false}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            androidLayerType="hardware"
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            nestedScrollEnabled={false}
            cacheEnabled={false}
            opaque={false}
            pointerEvents="none"
            onMessage={(e) => {
              if (String(e?.nativeEvent?.data || '') === 'gift_ended') {
                finishRef.current?.();
              }
            }}
            onLoadEnd={() => {
              Animated.timing(webOpacity, {
                toValue: 1,
                duration: 200,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }).start();
            }}
            injectedJavaScript={`
              (function () {
                try {
                  var ended = false;
                  var s = document.createElement('style');
                  s.innerHTML = 'html,body,#embed-container,.embed-video-host,canvas,video{background:transparent!important;margin:0!important;padding:0!important;overflow:hidden!important;} video,canvas{object-fit:contain!important;width:100%!important;height:100%!important;}';
                  document.head.appendChild(s);
                  function killLoop(v) {
                    if (!v) return;
                    v.loop = false;
                    v.removeAttribute('loop');
                    v.onended = function () {
                      if (ended) return;
                      ended = true;
                      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage('gift_ended'); } catch (e) {}
                    };
                    v.addEventListener('ended', function () {
                      if (ended) return;
                      ended = true;
                      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage('gift_ended'); } catch (e) {}
                    }, { once: true });
                    var p = v.play();
                    if (p && p.catch) p.catch(function(){});
                  }
                  killLoop(document.querySelector('video'));
                  var obs = new MutationObserver(function () {
                    var v = document.querySelector('video');
                    if (v && !v.__apOnce) {
                      v.__apOnce = true;
                      killLoop(v);
                    }
                  });
                  obs.observe(document.documentElement, { childList: true, subtree: true });
                  setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 4000);
                } catch (e) {}
                true;
              })();
            `}
          />
        ) : (
          <Animated.Text style={[styles.emoji, { transform: [{ scale }] }]}>
            {gift.emoji || '🎁'}
          </Animated.Text>
        )}
      </Animated.View>

      <Animated.View style={[styles.banner, { opacity, transform: [{ translateY: bannerY }, { scale }] }]}>
        <Animated.View style={[styles.glow, { opacity: glow }]} />
        <Text style={styles.from} numberOfLines={1}>
          {gift.from || gift.user || 'Someone'} sent {label}
          {qty > 1 ? ` ×${qty}` : ''}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 80 },
  stage: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  web: { flex: 1, backgroundColor: 'transparent' },
  webBox: { flex: 1, backgroundColor: 'transparent' },
  emoji: { fontSize: 92, textAlign: 'center', marginTop: '42%' },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 118,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(10,6,22,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 176, 72, 0.18)',
  },
  from: { color: '#fde68a', fontWeight: '800', fontSize: 13, textAlign: 'center' },
});
