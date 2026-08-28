import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { mediaUrl } from '../config/api';
import SoftImage from './SoftImage';

export function Equalizer({ size = 12, color = '#fff', animated = true }) {
  const a = useRef(new Animated.Value(0.45)).current;
  const b = useRef(new Animated.Value(1)).current;
  const c = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (!animated) return undefined;
    const loop = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.35, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
    const x = loop(a, 0);
    const y = loop(b, 120);
    const z = loop(c, 220);
    x.start();
    y.start();
    z.start();
    return () => {
      x.stop();
      y.stop();
      z.stop();
    };
  }, [a, b, c, animated]);

  if (!animated) {
    return (
      <View style={[styles.eq, { height: size, width: size + 2 }]}>
        <View style={[styles.eqBar, { backgroundColor: color, height: size * 0.45 }]} />
        <View style={[styles.eqBar, { backgroundColor: color, height: size }]} />
        <View style={[styles.eqBar, { backgroundColor: color, height: size * 0.62 }]} />
      </View>
    );
  }

  const bar = (val, h) => (
    <Animated.View
      style={[
        styles.eqBar,
        { backgroundColor: color, height: h, transform: [{ scaleY: val }] },
      ]}
    />
  );

  return (
    <View style={[styles.eq, { height: size, width: size + 2 }]}>
      {bar(a, size * 0.45)}
      {bar(b, size)}
      {bar(c, size * 0.62)}
    </View>
  );
}

export function uniqueFaces(people) {
  const out = [];
  const seenId = new Set();
  const seenPic = new Set();
  const seenName = new Set();
  for (const p of people || []) {
    if (!p) continue;
    const id = String(p.id || p.userId || '').trim();
    const pic = String(p.pic || p.profilePic || p.uri || p.profile_pic || p.avatar || '').trim();
    const name = String(p.name || p.displayName || '').trim().toLowerCase();
    if (id && seenId.has(id)) continue;
    if (pic && seenPic.has(pic)) continue;
    if (name && seenName.has(name)) continue;
    if (id) seenId.add(id);
    if (pic) seenPic.add(pic);
    if (name) seenName.add(name);
    out.push(p);
  }
  return out;
}

export function ViewerStack({ people, count, size = 18 }) {
  const list = uniqueFaces((people || []).filter((p) => p && (p.pic || p.profilePic || p.uri || p.name))).slice(0, 3);
  const extra = Math.max(0, Number(count || 0) - list.length);
  if (!list.length && !count) return null;
  return (
    <View style={styles.stack}>
      {list.map((p, i) => {
        const uri = mediaUrl(p.pic || p.profilePic || p.uri || p.profile_pic);
        return uri ? (
          <SoftImage
            key={p.id || i}
            uri={uri}
            style={[styles.face, { width: size, height: size, borderRadius: size / 2, marginLeft: i ? -6 : 0, zIndex: 4 - i }]}
          />
        ) : (
          <View key={p.id || i} style={[styles.face, styles.faceBlank, { width: size, height: size, borderRadius: size / 2, marginLeft: i ? -6 : 0, zIndex: 4 - i }]} />
        );
      })}
      {extra > 0 ? (
        <View style={[styles.faceCount, { height: size, minWidth: size, borderRadius: size / 2, marginLeft: list.length ? -6 : 0 }]}>
          <Text style={styles.faceCountT}>{extra > 99 ? '99+' : extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Float({ children, delay = 0, style }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -5, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, y]);
  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

export function Pulse({ children, delay = 0, style }) {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(s, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(s, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

export function Breathe({ children, delay = 0, style }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(o, { toValue: 0.82, duration: 1100, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, o]);
  return <Animated.View style={[style, { opacity: o }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  eq: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  eqBar: { width: 2.5, borderRadius: 2, transformOrigin: 'bottom' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 1.5, borderColor: '#fff', backgroundColor: '#333' },
  faceBlank: { backgroundColor: '#6B7280' },
  faceCount: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  faceCountT: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
