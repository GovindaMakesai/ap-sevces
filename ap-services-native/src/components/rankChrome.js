import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './ui';

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function fmtScore(n) {
  return Number(n || 0).toLocaleString();
}

export function useCountdown(period) {
  const [label, setLabel] = useState('00:00:00');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let end;
      if (period === 'weekly') {
        end = new Date(now);
        const add = (7 - end.getDay()) % 7 || 7;
        end.setDate(end.getDate() + add);
        end.setHours(0, 0, 0, 0);
      } else if (period === 'monthly') {
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      } else {
        end = new Date(now);
        end.setHours(24, 0, 0, 0);
      }
      const ms = Math.max(0, end.getTime() - now.getTime());
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(d > 0 ? `${pad2(d)}d ${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [period]);
  return label;
}

export function SparkleField() {
  const w = Dimensions.get('window').width;
  const dots = useRef(
    Array.from({ length: 14 }, (_, i) => ({
      left: ((8 + ((i * 17) % 84)) / 100) * w,
      top: 8 + ((i * 13) % 70),
      size: 3 + (i % 4),
      delay: i * 180,
    }))
  ).current;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <SparkleDot key={i} {...d} />
      ))}
    </View>
  );
}

function SparkleDot({ left, top, size, delay }) {
  const o = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.15, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, o]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#F5D76E',
        opacity: o,
      }}
    />
  );
}

export function Sheen({ width = 80, height = 80 }) {
  const x = useRef(new Animated.Value(-40)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: width + 20, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(x, { toValue: -40, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [width, x]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 22,
        transform: [{ translateX: x }, { rotate: '18deg' }],
        backgroundColor: 'rgba(255,255,255,0.28)',
      }}
    />
  );
}

const MEDAL = {
  1: { ring: ['#F6E27A', '#C99212'], fill: ['#FFF4C2', '#E8B84A'], badge: '#F5C542' },
  2: { ring: ['#D7E3F4', '#7B8BA4'], fill: ['#EEF3FA', '#A8B6C8'], badge: '#8EA4C8' },
  3: { ring: ['#E9B08A', '#A85A2A'], fill: ['#F7D3B0', '#C47A3A'], badge: '#C47A3A' },
};

export function RankMedal({ rank, size = 28 }) {
  const m = MEDAL[rank] || MEDAL[3];
  return (
    <LinearGradient colors={m.ring} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient colors={m.fill} style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontWeight: '900', fontSize: size * 0.42, color: '#4A2E08' }}>{rank}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

export function RankFrame({ uri, name, rank, size = 52 }) {
  const m = MEDAL[rank] || { ring: ['#C9A227', '#8B6D3B'], fill: ['#fff', '#fff'] };
  const borderW = rank <= 3 ? 2 : 1.5;
  const avSize = rank <= 3 ? size : Math.min(size, 40);
  return (
    <View style={{ alignItems: 'center', minWidth: avSize + 8 }}>
      {rank <= 3 ? (
        <View style={[styles.crown, { backgroundColor: m.ring[0] }]}>
          <View style={styles.crownPeak} />
          <View style={[styles.crownPeak, { height: 8 }]} />
          <View style={styles.crownPeak} />
        </View>
      ) : null}
      <View
        style={{
          padding: borderW,
          borderRadius: (avSize + borderW * 2) / 2,
          borderWidth: borderW,
          borderColor: m.ring[0],
          backgroundColor: '#fff',
        }}
      >
        <Avatar uri={uri} name={name} size={avSize} />
      </View>
      {rank <= 3 ? (
        <LinearGradient colors={m.ring} style={styles.noBanner}>
          <Text style={styles.noT}>NO.{rank}</Text>
        </LinearGradient>
      ) : null}
    </View>
  );
}

export function HexMedal({ rank, uri, name, prize, size = 86 }) {
  const m = MEDAL[rank] || MEDAL[1];
  return (
    <View style={{ alignItems: 'center', width: size + 24 }}>
      <LinearGradient
        colors={m.ring}
        style={{
          width: size,
          height: size,
          borderRadius: rank === 1 ? 22 : 18,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '0deg' }],
          shadowColor: m.ring[0],
          shadowOpacity: 0.55,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <LinearGradient colors={m.fill} style={{ width: size - 10, height: size - 10, borderRadius: rank === 1 ? 16 : 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Avatar uri={uri} name={name} size={Math.max(36, size - 32)} />
        </LinearGradient>
      </LinearGradient>
      {name ? (
        <Text numberOfLines={1} style={styles.hexName}>{name}</Text>
      ) : null}
      {prize != null ? (
        <View style={styles.prizePill}>
          <PinkCoin size={12} />
          <Text style={styles.prizeT}>{fmtScore(prize)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PinkCoin({ size = 14 }) {
  return (
    <LinearGradient colors={['#FF8AB5', '#E11D74']} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.62, fontWeight: '900', marginTop: -1 }}>$</Text>
    </LinearGradient>
  );
}

export function GoldCoin({ size = 14 }) {
  return (
    <LinearGradient colors={['#FFE08A', '#D4A017']} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#7C4A12', fontSize: size * 0.55, fontWeight: '900' }}>●</Text>
    </LinearGradient>
  );
}

export function GiftMark() {
  return (
    <View style={styles.giftMark}>
      <Ionicons name="gift" size={12} color="#fff" />
    </View>
  );
}

export function FlameMark() {
  return <Ionicons name="flame" size={12} color="#FF8A3D" />;
}

export function LevelBadge({ level }) {
  const n = Number(level || 1);
  return (
    <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.lvl}>
      <Ionicons name="star" size={8} color="#FDE68A" />
      <Text style={styles.lvlT}>{n}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  crown: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: -4, zIndex: 2, paddingHorizontal: 6, paddingTop: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  crownPeak: { width: 7, height: 6, backgroundColor: '#F8E38A', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  noBanner: { marginTop: -8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, zIndex: 3 },
  noT: { color: '#fff', fontWeight: '900', fontSize: 9 },
  hexName: { color: '#fff', fontWeight: '800', fontSize: 11, marginTop: 6, maxWidth: 96, textAlign: 'center' },
  prizePill: { marginTop: 6, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  prizeT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  giftMark: { width: 16, height: 16, borderRadius: 4, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  lvl: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  lvlT: { color: '#fff', fontWeight: '800', fontSize: 10 },
});
