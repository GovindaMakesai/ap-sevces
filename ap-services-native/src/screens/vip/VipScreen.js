import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Loading } from '../../components/ui';

export default function VipScreen() {
  const { api } = useAuth();
  const [data, setData] = useState(null);

  useFocusEffect(
    useCallback(() => {
      api.get('/v1/vip').then((r) => setData(api.unwrap(r))).catch(() => setData({}));
    }, [api])
  );

  if (!data) return <Loading />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.vipBg }} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>VIP</Text>
      <View style={styles.card}>
        <Text style={styles.k}>Level</Text>
        <Text style={styles.v}>{data.level || data.vipLevel || data.tier || 'Free'}</Text>
        <Text style={styles.k}>Expires</Text>
        <Text style={styles.v}>{data.expiresAt || data.expires || '—'}</Text>
      </View>
      {(data.privileges || data.perks || []).map((p, i) => (
        <Text key={i} style={styles.perk}>★ {typeof p === 'string' ? p : p.name || p.title}</Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { color: '#fbbf24', fontSize: 28, fontWeight: '800' },
  card: { backgroundColor: colors.vipCard, borderRadius: 16, padding: 16, marginTop: 16 },
  k: { color: 'rgba(255,255,255,0.6)', marginTop: 8 },
  v: { color: '#fff', fontSize: 22, fontWeight: '800' },
  perk: { color: '#e8d4a8', marginTop: 10 },
});
