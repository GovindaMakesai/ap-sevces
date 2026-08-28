import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Loading } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function Stat({ label, value, color }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statV, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statK}>{label}</Text>
    </View>
  );
}

export default function StreamerCenterScreen({ navigation }) {
  const { api } = useAuth();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('week');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [access, stats, analytics] = await Promise.all([
        api.get('/live/access-status').catch(() => ({})),
        api.get('/live/streamer-stats').catch(() => ({})),
        api.get('/live/my-analytics', { period }).catch(() => ({})),
      ]);
      setData({
        access: api.unwrap(access),
        stats: api.unwrap(stats),
        analytics: api.unwrap(analytics),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !data && !error) return <Loading />;

  const s = data?.stats || {};
  const a = data?.analytics || {};
  const points = Number(s.points || s.point_balance || a.points || 0);
  const coins = Number(s.coins || s.earnings || s.diamond || a.coins || 0);
  const allTime = Number(s.all_time || s.total_points || s.lifetime || points);

  return (
    <View style={styles.root}>
      <CreamHeader title="Streamer Center" navigation={navigation} />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <ErrorBanner message={error} onRetry={load} />
        <View style={styles.balance}>
          <Text style={styles.sec}>Your balance</Text>
          <View style={styles.balRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balK}>Points</Text>
              <Text style={[styles.balV, { color: '#FF8C00' }]}>{indianGroup(points)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.balK}>Coins</Text>
              <Text style={[styles.balV, { color: '#2563EB' }]}>{indianGroup(coins)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.balK}>All-time</Text>
              <Text style={[styles.balV, { color: '#16A34A' }]}>{indianGroup(allTime)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sec}>Content analytics</Text>
          <View style={styles.periods}>
            {PERIODS.map((p) => (
              <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={[styles.period, period === p.id && styles.periodOn]}>
                <Text style={[styles.periodT, period === p.id && styles.periodTOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.grid}>
            <Stat label="Live minutes" value={indianGroup(a.liveMinutes || a.minutes || s.liveMinutes || 0)} />
            <Stat label="New followers" value={indianGroup(a.newFollowers || s.newFollowers || 0)} />
            <Stat label="Gifts received" value={indianGroup(a.gifts || a.gift_count || 0)} />
            <Stat label="Viewers" value={indianGroup(a.viewers || a.audience || 0)} />
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate('GoLive', { isParty: false })} style={{ marginHorizontal: 16, marginTop: 12 }}>
          <LinearGradient colors={['#FF9F4A', '#FF6B00']} style={styles.cta}>
            <Text style={styles.ctaT}>Go Live</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('LiveVerify')}>
          <Ionicons name="checkmark-circle" size={20} color="#8B6D3B" />
          <Text style={styles.rowT}>Verify identity</Text>
          <Ionicons name="chevron-forward" size={18} color="#C4B08A" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('LiveApplication')}>
          <Ionicons name="document-text" size={20} color="#8B6D3B" />
          <Text style={styles.rowT}>Live application</Text>
          <Ionicons name="chevron-forward" size={18} color="#C4B08A" />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('GoLive', { isParty: true })}>
          <Ionicons name="people" size={20} color="#8B6D3B" />
          <Text style={styles.rowT}>Start a party</Text>
          <Ionicons name="chevron-forward" size={18} color="#C4B08A" />
        </Pressable>
        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  balance: { marginHorizontal: 14, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(212,175,55,0.28)' },
  sec: { fontWeight: '800', color: '#5D4037', marginBottom: 10 },
  balRow: { flexDirection: 'row' },
  balK: { color: '#8B6D3B', fontSize: 12, fontWeight: '700' },
  balV: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  card: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(212,175,55,0.28)' },
  periods: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  period: { flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F5E6C8', alignItems: 'center' },
  periodOn: { backgroundColor: '#FF8C00' },
  periodT: { color: '#8B6D3B', fontWeight: '700' },
  periodTOn: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 10 },
  statV: { fontSize: 18, fontWeight: '800', color: '#5D4037' },
  statK: { color: '#8B6D3B', fontSize: 12, marginTop: 2 },
  cta: { borderRadius: 22, paddingVertical: 14, alignItems: 'center' },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,109,59,0.12)',
  },
  rowT: { flex: 1, fontWeight: '700', color: '#8B6D3B' },
});
