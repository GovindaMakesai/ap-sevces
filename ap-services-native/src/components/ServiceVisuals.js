import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SoftImage from './SoftImage';
import { Avatar } from './ui';
import { mediaUrl } from '../config/api';
import {
  categoryVisual,
  formatInr,
  priceLabel,
  providerName,
  providerRate,
} from '../lib/servicesMarket';

export function ServiceHero({ service, height = 168, style }) {
  const uri = mediaUrl(service?.image_url || service?.image || service?.icon_url || service?.cover);
  const vis = categoryVisual(service?.category);
  if (uri && !String(uri).includes('undefined')) {
    return <SoftImage uri={uri} style={[{ height, width: '100%', borderRadius: 16 }, style]} />;
  }
  return (
    <LinearGradient colors={vis.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ height, borderRadius: 16, padding: 16, justifyContent: 'flex-end' }, style]}>
      <Ionicons name={vis.icon} size={36} color="rgba(255,255,255,0.9)" />
      <Text style={styles.heroCat}>{service?.category || 'Service'}</Text>
    </LinearGradient>
  );
}

export function ServiceCard({ service, onPress, cta = 'Find professionals' }) {
  const count = Number(service?.worker_count || service?.provider_count || 0);
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <ServiceHero service={service} height={118} style={{ borderRadius: 14 }} />
      <Text style={styles.name} numberOfLines={1}>{service?.name || service?.title}</Text>
      <Text style={styles.desc} numberOfLines={2}>{service?.description || 'Trusted help at your door.'}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.price}>{priceLabel(service)}</Text>
        {count > 0 ? <Text style={styles.count}>{count} pro{count === 1 ? '' : 's'}</Text> : null}
      </View>
      <Text style={styles.cta}>{cta}</Text>
    </Pressable>
  );
}

export function ProviderCard({ provider, service, selected, onPress }) {
  const name = providerName(provider);
  const rate = providerRate(provider, service);
  const rating = Number(provider?.rating || 0);
  const jobs = Number(provider?.total_reviews || provider?.total_bookings || 0);
  const verified = Boolean(provider?.is_approved);
  return (
    <Pressable onPress={onPress} style={[styles.pro, selected && styles.proOn]}>
      <Avatar uri={provider?.profile_pic || provider?.profile_photo_url} name={name} size={48} />
      <View style={{ flex: 1 }}>
        <View style={styles.proNameRow}>
          <Text style={styles.proName} numberOfLines={1}>{name}</Text>
          {verified ? <Text style={styles.verified}>Verified</Text> : null}
        </View>
        <Text style={styles.proMeta}>
          {rating ? `★ ${rating.toFixed(1)}` : 'New'}
          {jobs ? `  ·  ${jobs} jobs` : ''}
          {rate ? `  ·  ${formatInr(rate)}/hr` : ''}
        </Text>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={20} color={selected ? '#16A34A' : '#C4B08A'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.18)',
  },
  name: { color: '#5D4037', fontWeight: '800', fontSize: 16, marginTop: 10 },
  desc: { color: '#8B6D3B', fontSize: 13, marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  price: { color: '#C2410C', fontWeight: '800' },
  count: { color: '#A89070', fontWeight: '600', fontSize: 12 },
  cta: { color: '#E89020', fontWeight: '800', marginTop: 8 },
  heroCat: { color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 16 },
  pro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.16)',
  },
  proOn: { borderColor: '#E89020', backgroundColor: '#FFF8EC' },
  proNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proName: { color: '#5D4037', fontWeight: '800', fontSize: 15, flexShrink: 1 },
  verified: { color: '#15803D', fontWeight: '800', fontSize: 11 },
  proMeta: { color: '#8B6D3B', marginTop: 4, fontSize: 12 },
});
