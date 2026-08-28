import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolveGiftAnim } from '../config/giftAnims';
import { Float } from './alive';

export function giftThumbUrl(gift) {
  const anim = resolveGiftAnim(gift) || {};
  return (
    gift?.thumbnailUrl ||
    gift?.thumb_url ||
    gift?.icon_url ||
    gift?.image ||
    gift?.icon ||
    anim.thumbnailUrl ||
    ''
  );
}

export default function GiftThumb({ gift, size = 44, float = true, delay = 0 }) {
  const uri = giftThumbUrl(gift);
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10 }} resizeMode="contain" />
  ) : (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 5 }]}>
      <Text style={{ fontSize: size * 0.48 }}>{gift?.emoji || '🎁'}</Text>
    </View>
  );
  if (!float) return inner;
  return <Float delay={delay}>{inner}</Float>;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
