import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner, Loading } from '../../components/ui';
import { indianGroup } from '../../lib/format.js';

const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const PODIUM_ORDER = [2, 1, 3];
const PODIUM_BG = {
  1: ['#FDE68A', '#FFF7ED'],
  2: ['#DBEAFE', '#EFF6FF'],
  3: ['#FECDD3', '#FFF1F2'],
};
const CROWN_COLOR = { 1: '#F59E0B', 2: '#94A3B8', 3: '#D97706' };

function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function rowName(row) {
  return row.displayName || row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'User';
}

function rowCoins(row) {
  return indianGroup(row.giftCoins || row.coins || row.score || row.coin_amount || 0);
}

function PodiumCard({ row, rank, onPress }) {
  if (!row) return <View style={{ flex: rank === 1 ? 1.15 : 1 }} />;
  const name = rowName(row);
  const colors = PODIUM_BG[rank] || PODIUM_BG[3];
  return (
    <Pressable onPress={onPress} style={[styles.podiumCard, rank === 1 && styles.podiumCard1, rank === 2 && styles.podiumCard2, rank === 3 && styles.podiumCard3]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0], borderRadius: 14 }]} />
      <Text style={styles.podiumWatermark}>TOP {rank}</Text>
      <Text style={[styles.crown, { color: CROWN_COLOR[rank] }]}>👑</Text>
      <Avatar uri={mediaUrl(row.profilePic || row.profile_pic)} name={name} size={rank === 1 ? 58 : 52} />
      <Text style={styles.podiumName} numberOfLines={1}>{name}</Text>
      <Text style={styles.podiumScore}>★ {rowCoins(row)}</Text>
    </Pressable>
  );
}

export default function SupportersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { userId, view: initialView = 'main', period: initialPeriod } = route.params || {};
  const { api } = useAuth();
  const [view, setView] = useState(initialView === 'list' ? 'list' : 'main');
  const [period, setPeriod] = useState(initialPeriod || (initialView === 'list' ? 'monthly' : 'monthly'));
  const [top, setTop] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) {
      setError('Missing user id');
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    const qPeriod = view === 'main' ? 'monthly' : period;
    try {
      const res = await api.get(`/social/creators/${userId}/supporters`, { period: qPeriod }, { auth: false });
      const d = api.unwrap(res);
      setTop(d.top || d.supporters || api.extractList(res));
      setRecent(d.recent || d.gifts || []);
    } catch (e) {
      setError(e.message || 'Could not load supporters');
    } finally {
      setLoading(false);
    }
  }, [api, period, userId, view]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openUser = (row) => {
    const id = row.userId || row.user_id || row.id || row.sender_id;
    if (!id) return;
    navigation.navigate('CreatorProfile', { userId: String(id), name: rowName(row) });
  };

  const onBack = () => {
    if (view === 'list') {
      setView('main');
      return;
    }
    navigation.goBack();
  };

  const title = view === 'list' ? 'Supporter List' : 'Supporter';
  const podiumRows = PODIUM_ORDER.map((rank) => top.find((r, i) => Number(r.rank || i + 1) === rank) || top[rank - 1]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.back} />
      </View>

      {view === 'list' ? (
        <View style={styles.periods}>
          {PERIODS.map((p) => (
            <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={styles.period}>
              <Text style={[styles.periodT, period === p.id && styles.periodTOn]}>{p.label}</Text>
              {period === p.id ? <View style={styles.underline} /> : <View style={{ height: 3 }} />}
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading && !top.length && !recent.length ? (
        <Loading />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
          <ErrorBanner message={error} onRetry={load} />

          {view === 'main' ? (
            <>
              <View style={styles.podium}>
                {podiumRows.map((row, i) => (
                  <PodiumCard key={PODIUM_ORDER[i]} row={row} rank={PODIUM_ORDER[i]} onPress={() => row && openUser(row)} />
                ))}
              </View>
              {!top.length ? <Text style={styles.empty}>No supporters yet this period.</Text> : null}
              <Pressable
                style={styles.listBtn}
                onPress={() => {
                  setView('list');
                  setPeriod('monthly');
                }}
              >
                <Text style={styles.listBtnT}>Supporter List ›</Text>
              </Pressable>

              <Text style={styles.sectionTitle}>Recently Received Gifts</Text>
              {!recent.length ? <Text style={styles.empty}>No gifts received yet.</Text> : null}
              {recent.map((g, i) => {
                const n = g.senderName || g.displayName || rowName(g);
                return (
                  <Pressable key={`g-${g.id || i}`} style={styles.recentRow} onPress={() => openUser(g)}>
                    <Avatar uri={mediaUrl(g.profilePic || g.profile_pic)} name={n} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentName}>{n}</Text>
                      <Text style={styles.recentTime}>{fmtTime(g.createdAt || g.created_at)}</Text>
                    </View>
                    <Text style={styles.giftEmoji}>{g.emoji || '🎁'}</Text>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <>
              {!top.length ? <Text style={styles.empty}>No supporters in this period.</Text> : null}
              {top.map((row, i) => {
                const rank = Number(row.rank || i + 1);
                const n = rowName(row);
                return (
                  <Pressable key={String(row.userId || row.user_id || i)} style={styles.rankRow} onPress={() => openUser(row)}>
                    <View style={styles.rankNum}>
                      {rank <= 3 ? (
                        <Text style={{ color: CROWN_COLOR[rank], fontSize: 16 }}>👑</Text>
                      ) : (
                        <Text style={styles.rankNumT}>{rank}</Text>
                      )}
                    </View>
                    <Avatar uri={mediaUrl(row.profilePic || row.profile_pic)} name={n} size={44} />
                    <Text style={styles.rankName} numberOfLines={1}>{n}</Text>
                    <Text style={styles.rankScore}>★ {rowCoins(row)}</Text>
                  </Pressable>
                );
              })}
            </>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#111827' },
  periods: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  period: { alignItems: 'center', paddingBottom: 4 },
  periodT: { color: '#9ca3af', fontWeight: '700', fontSize: 15, paddingBottom: 8 },
  periodTOn: { color: '#111827', fontWeight: '800' },
  underline: { height: 3, width: 46, backgroundColor: '#111827', borderRadius: 2 },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  podiumCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 14,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  podiumCard1: { flex: 1.15, minHeight: 138 },
  podiumCard2: { minHeight: 118 },
  podiumCard3: { minHeight: 108 },
  podiumWatermark: {
    position: 'absolute',
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(0,0,0,0.06)',
    top: '30%',
  },
  crown: { fontSize: 14, marginBottom: 4 },
  podiumName: { fontSize: 12, fontWeight: '800', color: '#111827', marginTop: 6, maxWidth: '100%' },
  podiumScore: { fontSize: 13, fontWeight: '800', color: '#ea580c', marginTop: 4 },
  listBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#ff4d9d',
    backgroundColor: '#fff',
  },
  listBtnT: { color: '#ff4d9d', fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  recentName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  recentTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  giftEmoji: { fontSize: 28, width: 48, textAlign: 'center' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rankNum: { width: 36, alignItems: 'center' },
  rankNumT: { fontSize: 16, fontWeight: '800', color: '#111827' },
  rankName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  rankScore: { fontSize: 14, fontWeight: '800', color: '#d97706' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 24, fontSize: 13, paddingHorizontal: 16 },
});
