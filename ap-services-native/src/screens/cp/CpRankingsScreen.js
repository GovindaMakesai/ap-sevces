import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { FadeIn, PressScale } from '../../components/motion';
import { cpRankPeriod, extractCpRankings, mapCpRankRow } from '../../lib/cpRank';

function fmtScore(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function CoupleAvatars({ a, b, size = 40 }) {
  return (
    <View style={styles.coupleAv}>
      <Avatar uri={a?.pic} name={a?.name} size={size} />
      <View style={styles.heartDot}>
        <Ionicons name="heart" size={Math.max(10, size * 0.28)} color="#fff" />
      </View>
      <Avatar uri={b?.pic} name={b?.name} size={size} />
    </View>
  );
}

function PodiumSlot({ item, rank, onPress }) {
  if (!item) return <View style={{ width: 108 }} />;
  const tall = rank === 1;
  return (
    <PressScale onPress={onPress} style={[styles.podiumSlot, tall && styles.podium1]} scaleTo={0.97}>
      <LinearGradient
        colors={
          rank === 1
            ? ['#FCD34D', '#F59E0B']
            : rank === 2
              ? ['#F9A8D4', '#EC4899']
              : ['#FBCFE8', '#DB2777']
        }
        style={styles.podiumBadge}
      >
        <Text style={styles.podiumBadgeT}>TOP {rank}</Text>
      </LinearGradient>
      <View style={styles.podiumScore}>
        <Ionicons name="heart" size={12} color="#BE185D" />
        <Text style={styles.podiumScoreT}>{fmtScore(item.score)}</Text>
      </View>
      <CoupleAvatars
        a={{ pic: item.pic, name: item.nameA }}
        b={{ pic: item.partnerPic, name: item.nameB }}
        size={tall ? 52 : 42}
      />
      <Text style={styles.podiumName} numberOfLines={1}>{item.nameA}</Text>
      <Text style={styles.podiumName} numberOfLines={1}>{item.nameB}</Text>
      <View style={[styles.pedestal, tall && styles.pedestal1, rank === 2 && styles.pedestal2]} />
    </PressScale>
  );
}

export default function CpRankingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [rows, setRows] = useState([]);
  const [myStatus, setMyStatus] = useState(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/cp/rankings', { period: cpRankPeriod(period), limit: 50 }, { auth: false });
      const data = api.unwrap(res) || {};
      setRows(extractCpRankings(api, res).map(mapCpRankRow));
      setMyStatus(data.myStatus || data.me || null);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Could not load CP rankings');
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const top = rows.slice(0, 3);
  const rest = rows.length > 3 ? rows.slice(3) : [];
  const meName = displayName || user?.first_name || 'You';

  const header = useMemo(
    () => (
      <View>
        <FadeIn from={12}>
          <LinearGradient colors={['rgba(236,72,153,0.55)', 'rgba(190,24,93,0.72)']} style={styles.hero}>
            <Text style={styles.heroEmblem}>💕</Text>
            <Text style={styles.heroTitle}>AP Couple</Text>
          </LinearGradient>
        </FadeIn>
        <LinearGradient colors={['#F472B6', '#DB2777']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <Text style={styles.bannerT}>Lovers Ranking</Text>
        </LinearGradient>
        <Text style={styles.rules}>
          CPs are ranked by intimacy from gifts after becoming a couple.{' '}
          <Text style={styles.rulesStrong}>1 💎 = 1 💖</Text>
        </Text>
        <View style={styles.tabs}>
          {[
            { id: 'week', label: 'Week Ranking' },
            { id: 'total', label: 'Total Ranking' },
          ].map((t) => {
            const on = period === t.id;
            return (
              <Pressable key={t.id} onPress={() => setPeriod(t.id)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabT, on && styles.tabTOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {top.length ? (
          <View style={styles.podiumRow}>
            <PodiumSlot
              item={top[1]}
              rank={2}
              onPress={() => top[1]?.userId && navigation.navigate('CreatorProfile', { userId: top[1].userId, name: top[1].nameA })}
            />
            <PodiumSlot
              item={top[0]}
              rank={1}
              onPress={() => top[0]?.userId && navigation.navigate('CreatorProfile', { userId: top[0].userId, name: top[0].nameA })}
            />
            <PodiumSlot
              item={top[2]}
              rank={3}
              onPress={() => top[2]?.userId && navigation.navigate('CreatorProfile', { userId: top[2].userId, name: top[2].nameA })}
            />
          </View>
        ) : null}
      </View>
    ),
    [navigation, period, top]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#FFE4F0', '#FFC8E8', '#FFB8DC']} style={StyleSheet.absoluteFill} />
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </Pressable>
        <Text style={styles.headTitle}>CP Ranking</Text>
        <Pressable onPress={() => navigation.navigate('Cp')} style={styles.headBtn}>
          <Ionicons name="heart" size={20} color="#DB2777" />
        </Pressable>
      </View>
      <ErrorBanner message={error} onRetry={load} />
      {loading && !rows.length ? (
        <Loading />
      ) : (
        <FlatList
          data={top.length ? rest : rows}
          keyExtractor={(item, i) => `${item.userId}-${item.partnerId}-${i}`}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#DB2777" />}
          ListEmptyComponent={
            rows.length || loading ? null : (
              <EmptyState title="No CP couples ranked yet" subtitle="Send gifts after becoming CP to climb the board." />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => item.userId && navigation.navigate('CreatorProfile', { userId: item.userId, name: item.nameA })}
            >
              <Text style={styles.rankNum}>{item.rank}</Text>
              <CoupleAvatars
                a={{ pic: item.pic, name: item.nameA }}
                b={{ pic: item.partnerPic, name: item.nameB }}
                size={36}
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.nameA}</Text>
                <Text style={styles.rowNameB} numberOfLines={1}>{item.nameB}</Text>
              </View>
              <View style={styles.rowScore}>
                <Ionicons name="heart" size={12} color="#DB2777" />
                <Text style={styles.rowScoreT}>{fmtScore(item.score)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <View style={[styles.meBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.meSlot}>
          <Avatar uri={user?.profile_pic} name={meName} size={40} />
          <Text style={styles.meName} numberOfLines={1}>{meName}</Text>
        </View>
        <View style={styles.meHeart}>
          <Ionicons name="heart" size={18} color="#fff" />
        </View>
        <View style={styles.meSlot}>
          {myStatus?.hasCp || myStatus?.partner ? (
            <>
              <Avatar
                uri={myStatus.partner?.profilePic || myStatus.partnerPic}
                name={myStatus.partner?.name || myStatus.partnerName || 'Partner'}
                size={40}
              />
              <Text style={styles.meName} numberOfLines={1}>
                {myStatus.partner?.name || myStatus.partnerName || 'Partner'}
              </Text>
              <Text style={styles.meRank}>
                {myStatus.rank ? `#${myStatus.rank}` : 'Unranked'} · {fmtScore(myStatus.intimacy || 0)}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.waiting}>
                <Ionicons name="person-outline" size={20} color="#9D174D" />
              </View>
              <Text style={styles.waitingT}>Waiting</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: '#1F2937' },
  hero: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroEmblem: { fontSize: 40 },
  heroTitle: {
    marginTop: 6,
    color: '#fff',
    fontSize: 26,
    fontStyle: 'italic',
    fontWeight: '700',
    fontFamily: 'serif',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowRadius: 8,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
  },
  bannerT: { color: '#fff', fontWeight: '800', fontStyle: 'italic', fontSize: 15 },
  rules: {
    marginHorizontal: 18,
    marginTop: 10,
    color: '#9D174D',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  rulesStrong: { fontWeight: '900', color: '#BE185D' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  tabOn: { backgroundColor: '#fff', shadowColor: '#DB2777', shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 },
  tabT: { color: '#9D174D', fontWeight: '700', fontSize: 13 },
  tabTOn: { color: '#BE185D', fontWeight: '900' },
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 18,
    paddingBottom: 8,
    minHeight: 210,
  },
  podiumSlot: { width: 112, alignItems: 'center' },
  podium1: { marginBottom: 18 },
  podiumBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  podiumBadgeT: { color: '#fff', fontWeight: '900', fontSize: 11 },
  podiumScore: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  podiumScoreT: { color: '#9D174D', fontWeight: '900', fontSize: 12 },
  podiumName: { color: '#4A1942', fontWeight: '700', fontSize: 11, marginTop: 2, maxWidth: 100, textAlign: 'center' },
  pedestal: {
    marginTop: 8,
    width: 88,
    height: 28,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: 'rgba(236,72,153,0.35)',
  },
  pedestal1: { height: 48, backgroundColor: 'rgba(251,191,36,0.55)' },
  pedestal2: { height: 36, backgroundColor: 'rgba(244,114,182,0.45)' },
  coupleAv: { flexDirection: 'row', alignItems: 'center' },
  heartDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -4,
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.35)',
  },
  rankNum: { width: 28, fontWeight: '900', color: '#DB2777', fontSize: 15 },
  rowName: { fontWeight: '800', color: '#4A1942', fontSize: 13 },
  rowNameB: { fontWeight: '600', color: '#9D174D', fontSize: 12, marginTop: 1 },
  rowScore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowScoreT: { color: '#DB2777', fontWeight: '900' },
  meBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(219,39,119,0.25)',
  },
  meSlot: { flex: 1, alignItems: 'center' },
  meName: { marginTop: 4, fontWeight: '700', color: '#9D174D', fontSize: 11, maxWidth: 110 },
  meRank: { marginTop: 2, color: '#DB2777', fontWeight: '800', fontSize: 10 },
  meHeart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  waiting: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#F9A8D4',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
  },
  waitingT: { marginTop: 4, color: '#9D174D', fontWeight: '700', fontSize: 11 },
});
