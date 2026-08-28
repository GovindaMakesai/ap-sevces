import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DURATION_MS = 5000;

export default function PromoLaunchOverlay({ onDone }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      setVisible(false);
      onDone?.();
    });
  }, [onDone, opacity]);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: DURATION_MS, useNativeDriver: false }).start();
    const t = setTimeout(dismiss, DURATION_MS);
    return () => clearTimeout(t);
  }, [dismiss, progress]);

  if (!visible) return null;

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[styles.root, { opacity, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.imageWrap}>
        <Image
          source={require('../../assets/promos/reality-show-antakshari.jpg')}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel="1st Reality Show Antakshari promotion"
        />
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>
      <View style={styles.bar}>
        <Text style={styles.hint}>1st Reality Show · Sep 1–7</Text>
        <Pressable style={styles.skipBtn} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Skip promotion">
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    backgroundColor: '#1a0a14',
    elevation: 99,
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 0,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f5d77a',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  hint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  skipBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#e8b84a',
  },
  skipText: {
    color: '#3b1f12',
    fontWeight: '800',
    fontSize: 14,
  },
});
