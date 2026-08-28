import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from './ui';

export const FRAME_SKINS = [
  {
    id: 'aurora',
    name: 'Aurora Veil',
    price: 2999,
    colors: ['#67e8f9', '#a78bfa', '#f0abfc', '#67e8f9'],
    glow: 'rgba(167,139,250,0.55)',
  },
  {
    id: 'inferno',
    name: 'Inferno Crown',
    price: 8999,
    colors: ['#fb923c', '#ef4444', '#facc15', '#fb923c'],
    glow: 'rgba(239,68,68,0.55)',
  },
  {
    id: 'diamond',
    name: 'Diamond Orbit',
    price: 18999,
    colors: ['#e0f2fe', '#38bdf8', '#f8fafc', '#7dd3fc'],
    glow: 'rgba(56,189,248,0.5)',
  },
  {
    id: 'royal',
    name: 'Royal Gold',
    price: 45999,
    colors: ['#fde68a', '#f59e0b', '#fff7ed', '#d97706'],
    glow: 'rgba(245,158,11,0.55)',
  },
  {
    id: 'nebula',
    name: 'Nebula Pulse',
    price: 79999,
    colors: ['#c084fc', '#22d3ee', '#f472b6', '#818cf8'],
    glow: 'rgba(192,132,252,0.6)',
  },
  {
    id: 'legend',
    name: 'Legend Halo',
    price: 149999,
    colors: ['#fbbf24', '#f472b6', '#38bdf8', '#fde68a'],
    glow: 'rgba(251,191,36,0.65)',
  },
];

export function frameSkinById(id) {
  return FRAME_SKINS.find((s) => s.id === id) || FRAME_SKINS[0];
}

export function frameForScore(score, rank) {
  const n = Number(score || 0);
  if (rank === 1 || n >= 2000000) return FRAME_SKINS[5];
  if (rank === 2 || n >= 800000) return FRAME_SKINS[4];
  if (rank === 3 || n >= 250000) return FRAME_SKINS[3];
  if (n >= 80000) return FRAME_SKINS[2];
  if (n >= 20000) return FRAME_SKINS[1];
  return FRAME_SKINS[0];
}

function AvatarFrame({
  uri,
  name,
  size = 52,
  skin,
  score,
  rank,
  style,
  light = false,
}) {
  const spec = skin || frameForScore(score, rank);
  const ring = light ? 2 : 3;
  const outer = size + ring * 2 + (light ? 2 : 4);

  if (light) {
    const borderColor = spec.colors[1] || spec.colors[0];
    return (
      <View style={[{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }, style]}>
        <View style={[styles.avatarRing, { width: outer, height: outer, borderRadius: outer / 2, borderColor, borderWidth: ring }]}>
          <Avatar uri={uri} name={name} size={size} />
        </View>
      </View>
    );
  }

  return (
    <View style={[{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }, style]}>
      <LinearGradient
        colors={spec.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', width: outer, height: outer, borderRadius: outer / 2 }}
      />
      <View style={[styles.avatarRing, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: '#fff' }]}>
        <Avatar uri={uri} name={name} size={size} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRing: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

export default memo(AvatarFrame);
