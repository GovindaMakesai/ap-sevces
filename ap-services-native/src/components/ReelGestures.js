import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DOUBLE_MS = 280;

/**
 * Instagram-style surface gestures for fullscreen reels:
 * - single tap → mute toggle
 * - double tap → like (+ heart burst)
 * - hold → pause while pressed
 */
export default function ReelGestures({
  enabled = true,
  onSingleTap,
  onDoubleTap,
  onHoldStart,
  onHoldEnd,
  children,
}) {
  const lastTap = useRef(0);
  const singleTimer = useRef(null);
  const holding = useRef(false);
  const heart = useRef(new Animated.Value(0)).current;
  const [heartKey, setHeartKey] = useState(0);

  const burstHeart = () => {
    setHeartKey((k) => k + 1);
    heart.setValue(0);
    Animated.sequence([
      Animated.timing(heart, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(heart, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  };

  const clearSingle = () => {
    if (singleTimer.current) {
      clearTimeout(singleTimer.current);
      singleTimer.current = null;
    }
  };

  if (!enabled) return children || null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={styles.hit}
        delayLongPress={160}
        onLongPress={() => {
          holding.current = true;
          clearSingle();
          onHoldStart?.();
        }}
        onPressOut={() => {
          if (holding.current) {
            holding.current = false;
            onHoldEnd?.();
          }
        }}
        onPress={() => {
          if (holding.current) return;
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_MS) {
            clearSingle();
            lastTap.current = 0;
            burstHeart();
            onDoubleTap?.();
            return;
          }
          lastTap.current = now;
          clearSingle();
          singleTimer.current = setTimeout(() => {
            singleTimer.current = null;
            onSingleTap?.();
          }, DOUBLE_MS);
        }}
      />
      {children}
      <Animated.View
        key={heartKey}
        pointerEvents="none"
        style={[
          styles.heartWrap,
          {
            opacity: heart,
            transform: [
              {
                scale: heart.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1.15],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="heart" size={88} color="#FF2D55" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  heartWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
