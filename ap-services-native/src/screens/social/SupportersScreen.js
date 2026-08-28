import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner, Loading } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';

const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString();
}

export default function SupportersScreen({ navigation, route }) {
  const { userId } = route.params || {};
  const { api } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [top, setTop] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/social/creators/${userId}/supporters`, { period }, { auth: false });
      const d = api.unwrap(res);
      setTop(d.top || d.supporters || api.extractList(res));
      setRecent(d.recent || d.gifts || []);
    } catch (e) {
      setError(e.message || 'Could not load supporters');
    } finally {
      setLoading(false);
    }
  }, [api, period, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openUser = (row) => {
    const id = row.userId || row.user_id || row.id || row.sender_id;
    if (!id) return;
    const n = row.displayName || row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'User';
    navigation.navigate('CreatorProfile', { userId: String(id), name: n });
  };

  return (
    <View style={styles.root}>
      <CreamHeader title="Supporter" navigation={navigation} />
      <Text style={styles.sub}>Supporter List</Text>
      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={styles.period}>
            <Text style={[styles.periodT, period === p.id && styles.periodTOn]}>{p.label}</Text>
            {period === p.id ? <View style={styles.underline} /> : <View style={{ height: 3 }} />}
          </Pressable>
        ))}
      </View>
      {loading && !top.length && !recent.length ? (
        <Loading />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
          <ErrorBanner message={error} onRetry={load} />
          {!top.length ? <Text style={styles.empty}>No supporters in this period.</Text> : null}
          {top.map((row, i) => {
            const n = row.displayName || row.name || 'User';
            return (
              <Pressable key={String(row.userId || i)} style={styles.row} onPress={() => openUser(row)}>
                <Text style={styles.rowRank}>{row.rank || i + 1}</Text>
                <Avatar uri={mediaUrl(row.profilePic || row.profile_pic)} name={n} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{n}</Text>
                  <Text style={styles.meta}>{fmtTime(row.createdAt || row.created_at)}</Text>
                </View>
                <Text style={styles.coins}>{indianGroup(row.giftCoins || row.coins || row.score || 0)}</Text>
              </Pressable>
            );
          })}
          {(recent || []).map((g, i) => {
            const n = g.displayName || g.senderName || g.name || 'User';
            return (
              <Pressable key={`g-${g.id || i}`} style={styles.row} onPress={() => openUser(g)}>
                {g.image ? <Image source={{ uri: mediaUrl(g.image) }} style={styles.gImg} /> : <Avatar uri={mediaUrl(g.profilePic)} name={n} size={40} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{n}</Text>
                  <Text style={styles.meta}>{g.giftName || g.gift_type || 'Gift'} · {fmtTime(g.createdAt || g.created_at)}</Text>
                </View>
                <Text style={styles.coins}>{indianGroup(g.coin_amount || g.coins || 0)}</Text>
              </Pressable>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  sub: { textAlign: 'center', fontWeight: '800', color: '#8B6D3B', fontSize: 16, marginBottom: 4 },
  periods: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#E8DCC4' },
  period: { flex: 1, alignItems: 'center', paddingTop: 10 },
  periodT: { color: '#A8A29E', fontWeight: '700', fontSize: 15 },
  periodTOn: { color: '#1F2937', fontWeight: '800' },
  underline: { marginTop: 8, height: 3, width: 46, backgroundColor: '#222', borderRadius: 2 },
  empty: { textAlign: 'center', color: '#A8A29E', marginTop: 48, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
  },
  rowRank: { width: 22, fontWeight: '800', color: '#8B6D3B' },
  rowName: { fontWeight: '700', color: '#5D4037' },
  coins: { color: '#FF8C00', fontWeight: '800' },
  meta: { color: '#A8A29E', fontSize: 11, marginTop: 2 },
  gImg: { width: 36, height: 36, borderRadius: 8 },
});
