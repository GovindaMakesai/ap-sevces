import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DURATION_MS = 5000;

export default function PromoLaunchOverlay({ onDone }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const [secs, setSecs] = useState(5);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecs((s) => Math.max(0, s - 1));
    }, 1000);
    const t = setTimeout(dismiss, DURATION_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(t);
    };
  }, [dismiss]);

  if (!visible) return null;

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Image
        source={require('../../assets/promos/reality-show-antakshari.jpg')}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel="1st Reality Show Antakshari promotion"
      />
      <Pressable
        style={[styles.skipBtn, { top: insets.top + 10, right: Math.max(12, insets.right + 8) }]}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Skip promotion"
      >
        <Text style={styles.skipText}>{secs > 0 ? `${secs}s skip` : 'skip'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    backgroundColor: '#120810',
    elevation: 99,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  skipBtn: {
    position: 'absolute',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  skipText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
