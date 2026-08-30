import React, { useCallback, useState } from 'react';
import { NativeModules, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CreamHeader, creamRoot } from '../../components/creamChrome';

/**
 * DEBUG/DEVELOPMENT only — opens Snap CameraActivity with lens carousel.
 * Not wired into Agora live output yet.
 */
export default function CameraKitTestScreen({ navigation }) {
  const [status, setStatus] = useState(
    Platform.OS === 'android'
      ? 'Ready to open Snap Camera Kit (Staging + lens carousel).'
      : 'Camera Kit Test is Android-only for this PoC.'
  );
  const [busy, setBusy] = useState(false);

  const openNative = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStatus('Camera Kit Test is Android-only for this PoC.');
      return;
    }
    if (!__DEV__) {
      setStatus('Camera Kit Test is available in development builds only.');
      return;
    }
    const mod = NativeModules.CameraKitTest;
    if (!mod?.openTest) {
      setStatus('Native module CameraKitTest is missing. Rebuild the Android app.');
      return;
    }
    setBusy(true);
    setStatus('Opening Snap lens carousel…');
    try {
      await mod.openTest();
      setStatus('Snap Camera Kit opened. Swipe the carousel — skip blank lenses.');
    } catch (e) {
      setStatus(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View style={creamRoot}>
      <CreamHeader title="Camera Kit Test" navigation={navigation} />
      <View style={styles.body}>
        <Text style={styles.badge}>DEBUG · STAGING ONLY</Text>
        <Text style={styles.copy}>
          Opens Snap’s official camera UI with a lens carousel (same style as Snapchat’s picker).
          Staging builds show a watermark.
        </Text>
        <Text style={styles.warn}>
          A white / blank lens is normal for some Demo Group samples — swipe to the next icon. Real
          beauty (skin smooth, makeup) only appears after you publish those lenses into your Lens
          Group in My Lenses / Lens Scheduler and use that group ID.
        </Text>
        <Text style={styles.warn}>
          This preview is separate from Go Live for now — Agora live still uses the in-app Beauty
          dock until Snap is wired into the stream pipeline.
        </Text>
        <Text style={styles.status}>{status}</Text>
        {Platform.OS === 'android' && __DEV__ ? (
          <Pressable
            onPress={openNative}
            disabled={busy}
            style={[styles.btn, busy && styles.btnDisabled]}
          >
            <Text style={styles.btnT}>{busy ? 'Opening…' : 'Open Snap lens carousel'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontWeight: '800',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  copy: { color: '#5D4037', lineHeight: 20, fontSize: 14 },
  warn: { color: '#92400E', lineHeight: 19, fontSize: 13, backgroundColor: '#FFF7ED', padding: 10, borderRadius: 10 },
  status: { color: '#6B4A1B', fontWeight: '600', marginTop: 8 },
  btn: {
    marginTop: 8,
    backgroundColor: '#E89020',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
