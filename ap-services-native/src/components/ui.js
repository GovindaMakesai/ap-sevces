import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients, radius, shadow, spacing } from '../config/theme';
import { mediaUrl } from '../config/api';
import { PressScale } from './motion';

export function Screen({ children, style }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function GoldButton({ title, onPress, disabled, style, compact }) {
  return (
    <PressScale onPress={onPress} disabled={disabled} style={[styles.btnWrap, compact && styles.btnCompact, style, disabled && { opacity: 0.5 }]} scaleTo={0.97}>
      <LinearGradient colors={gradients.orange} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.goldBtn, compact && styles.goldBtnSm]}>
        <Text style={[styles.goldBtnText, compact && styles.goldBtnTextSm]}>{title}</Text>
      </LinearGradient>
    </PressScale>
  );
}

export function OutlineButton({ title, onPress, style, disabled, compact }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.outlineBtn, compact && styles.outlineBtnSm, compact && styles.btnCompact, style, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.outlineBtnText, compact && styles.outlineBtnTextSm]}>{title}</Text>
    </Pressable>
  );
}

export function OAuthButton({ title, onPress, disabled, icon, iconColor, ion }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.oauthBtn, disabled && { opacity: 0.55 }]}>
      {ion ? (
        <Ionicons name={ion} size={20} color={iconColor || '#111827'} />
      ) : icon ? (
        <Text style={[styles.oauthIcon, iconColor && { color: iconColor }]}>{icon}</Text>
      ) : null}
      <Text style={styles.oauthText}>{title}</Text>
    </Pressable>
  );
}

export function AuthCard({ children }) {
  return <View style={styles.authCard}>{children}</View>;
}

export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

export function Avatar({ uri, name, size = 40, style }) {
  const src = mediaUrl(uri);
  const letter = String(name || 'A').trim().charAt(0).toUpperCase();
  if (src) {
    const SoftImage = require('./SoftImage').default;
    return <SoftImage uri={src} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{letter}</Text>
    </View>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.gold500} />
      <Text style={[styles.emptySub, { marginTop: 10 }]}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <Pressable onPress={onRetry} style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Text style={styles.retry}>Tap to retry</Text> : null}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MenuRow({ icon, title, subtitle, onPress, danger }) {
  return (
    <PressScale onPress={onPress} style={styles.menuRow} scaleTo={0.985}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chev}>›</Text>
    </PressScale>
  );
}

export function PillTab({ label, active, onPress }) {
  if (active) {
    return (
      <Pressable onPress={onPress} style={styles.pillWrap}>
        <LinearGradient colors={gradients.goldTab} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillOn}>
          <Text style={styles.pillOnText}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={styles.pillOff}>
      <Text style={styles.pillOffText}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Kv({ k, v }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v == null || v === '' ? '—' : String(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.creamBg },
  btnWrap: { borderRadius: radius.pill, overflow: 'hidden', ...shadow.card },
  btnCompact: { alignSelf: 'flex-start', flexGrow: 0 },
  goldBtn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 16 },
  goldBtnSm: { minHeight: 34, paddingHorizontal: 12 },
  goldBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  goldBtnTextSm: { fontSize: 12 },
  outlineBtn: {
    minHeight: 50,
    borderWidth: 2,
    borderColor: 'rgba(201, 162, 39, 0.45)',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  outlineBtnSm: { minHeight: 34, paddingHorizontal: 12, borderWidth: 1 },
  outlineBtnText: { color: colors.gold600, fontWeight: '700', fontSize: 15 },
  outlineBtnTextSm: { fontSize: 12 },
  oauthBtn: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  oauthIcon: { fontSize: 18, fontWeight: '800', width: 22, textAlign: 'center' },
  oauthText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  authCard: {
    backgroundColor: colors.creamCard,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  label: { color: colors.textGold, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: colors.creamCard,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textGold, textAlign: 'center' },
  emptySub: { marginTop: 6, color: colors.textSecondary, textAlign: 'center' },
  error: { backgroundColor: '#fef2f2', padding: 10, borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  errorText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  retry: { color: '#7f1d1d', fontSize: 11, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  sectionAction: { color: colors.gold600, fontWeight: '600' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    ...shadow.card,
  },
  menuIcon: { width: 28, fontSize: 18, color: colors.gold600 },
  menuTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  menuSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chev: { fontSize: 22, color: '#ccc', marginLeft: 8 },
  pillWrap: { marginRight: 6, flexShrink: 0 },
  pillOn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  pillOnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pillOff: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    marginRight: 6,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.28)',
  },
  pillOffText: { color: colors.gold700, fontWeight: '700', fontSize: 12 },
  card: {
    backgroundColor: colors.creamCard,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  k: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  v: { color: colors.textPrimary, fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' },
});
