import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Android gesture/3-button nav sits on top of edge-to-edge sheets. */
export function bottomSafe(insets) {
  const b = Number(insets?.bottom || 0);
  if (Platform.OS === 'android' && b < 24) return 48;
  return Math.max(b, 8);
}

export function PressScale({ children, onPress, style, disabled, scaleTo = 0.97, hitSlop }) {
  const scale = useRef(new Animated.Value(1)).current;
  const zoom = (to) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 240,
    }).start();

  const flat = StyleSheet.flatten(style) || {};
  return (
    <Pressable
      style={style}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => zoom(scaleTo)}
      onPressOut={() => zoom(1)}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: flat.flexDirection || 'column',
          alignItems: flat.alignItems,
          justifyContent: flat.justifyContent,
          gap: flat.gap,
          width: '100%',
          height: flat.height ? '100%' : undefined,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function FadeIn({ children, delay = 0, style, from = 18, ...rest }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(from)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        friction: 9,
        tension: 68,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]} {...rest}>
      {children}
    </Animated.View>
  );
}

function sheetPx(height) {
  const winH = Dimensions.get('window').height;
  if (typeof height === 'number') {
    if (height > 0 && height <= 1) return Math.round(winH * height);
    return height;
  }
  if (typeof height === 'string' && height.endsWith('%')) {
    return Math.round(winH * (parseFloat(height) / 100));
  }
  return Math.round(winH * 0.55);
}

export function AnimatedSheet({ visible, onClose, height, children }) {
  const insets = useSafeAreaInsets();
  const pad = bottomSafe(insets);
  const travel = sheetPx(height) + pad;
  const translateY = useRef(new Animated.Value(travel)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(Math.max(travel, 280) * 0.28);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
          tension: 76,
        }),
      ]).start();
      return undefined;
    }
    if (!mounted) return undefined;
    const outro = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: travel,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    outro.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => outro.stop();
  }, [mounted, opacity, translateY, travel, visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetRoot} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.panel, { height: travel, paddingBottom: pad }, { transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)' },
  panel: { overflow: 'hidden', backgroundColor: '#12081c' },
});
