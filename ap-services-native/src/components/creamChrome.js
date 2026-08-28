import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, PressScale } from './motion';

export function CreamHeader({ title, navigation, right, onBack, hideRight }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + 4 }]}>
      <PressScale onPress={onBack || (() => navigation?.goBack?.())} style={styles.roundBtn} hitSlop={8} scaleTo={0.9}>
        <Ionicons name="chevron-back" size={22} color="#5D4037" />
      </PressScale>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {hideRight ? (
        <View style={styles.roundBtn} />
      ) : (
        right || (
          <PressScale
            onPress={() => navigation?.navigate?.('Main', { screen: 'Profile' })}
            style={styles.roundBtn}
            scaleTo={0.9}
          >
            <Ionicons name="person" size={18} color="#5D4037" />
          </PressScale>
        )
      )}
    </View>
  );
}

export function CreamMenuRow({ icon, title, subtitle, onPress, accent }) {
  return (
    <PressScale onPress={onPress} style={styles.menu} scaleTo={0.985}>
      <Ionicons name={icon} size={20} color={accent || '#8B6D3B'} style={{ width: 28 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.menuT}>
          {title}
          {subtitle ? <Text style={styles.menuAccent}>  {subtitle}</Text> : null}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#C4B08A" />
    </PressScale>
  );
}

export function CreamCard({ children, style }) {
  return <FadeIn style={[styles.card, style]} from={10}>{children}</FadeIn>;
}

export function OrangeCta({ title, onPress, style }) {
  return (
    <PressScale onPress={onPress} style={style} scaleTo={0.97}>
      <LinearGradient colors={['#FF9F4A', '#FF6B00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
        <Text style={styles.ctaT}>{title}</Text>
      </LinearGradient>
    </PressScale>
  );
}

export const creamRoot = { flex: 1, backgroundColor: '#FFF9E7' };

export function CreamPage({ title, navigation, children, hideRight, right }) {
  return (
    <View style={creamRoot}>
      <CreamHeader title={title} navigation={navigation} hideRight={hideRight} right={right} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#FFF9E7',
  },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E6C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#5D4037',
    marginHorizontal: 8,
  },
  menu: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(139, 109, 59, 0.12)',
  },
  menuT: { fontWeight: '700', color: '#8B6D3B', fontSize: 15 },
  menuAccent: { color: '#E89020', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
  },
  cta: {
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
