import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar } from '../../components/ui';

const FILTERS = ['Prestige', 'Achievement', 'Event'];

export default function BadgeHubScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [tab, setTab] = useState(route.params?.tab || 'badge');
  const [filter, setFilter] = useState('Prestige');
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState({ collected: 0, honor: 0, rank: '999+' });

  const load = useCallback(async () => {
    try {
      const res = await api.get('/v1/leaderboards', { period: 'weekly', category: 'gifters' }, { auth: false });
      setRows(
        api.extractList(res).map((item, i) => ({
          rank: item.rank || i + 1,
          userId: String(item.entity_id || item.userId || item.id || ''),
          name: item.entity_label || item.name || item.displayName || 'User',
          pic: item.profile_pic || item.profilePic,
          score: item.score || item.total || 0,
        }))
      );
    } catch (_e) {
      setRows([]);
    }
    try {
      const w = await api.get('/wallet/balance');
      const d = api.unwrap(w);
      setMe({
        collected: Number(d.badge_count || 8),
        honor: Number(d.honor || d.points || 660),
        rank: d.rank || '999+',
      });
    } catch (_e) {}
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (row) => row.userId && navigation.navigate('CreatorProfile', { userId: row.userId, name: row.name });
  const top = rows.slice(0, 3);
  const rest = rows.slice(3, 20);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1c1408', '#000']} style={{ paddingTop: insets.top }}>
        <View style={styles.head}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}><Text style={styles.gold}>‹</Text></Pressable>
          <View style={styles.tabs}>
            {['badge', 'rank', 'mine'].map((t) => (
              <Pressable key={t} onPress={() => setTab(t)}>
                <Text style={[styles.tab, tab === t && styles.tabOn]}>{t[0].toUpperCase() + t.slice(1)}</Text>
                {tab === t ? <View style={styles.goldLine} /> : null}
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => navigation.navigate('Help')} style={styles.iconBtn}><Text style={styles.gold}>?</Text></Pressable>
        </View>
      </LinearGradient>

      {tab === 'badge' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
          <LinearGradient colors={['#3f2a0a', '#0a0a0a']} style={styles.hero}>
            <Text style={styles.statues}>🦅          🦅</Text>
            <Text style={styles.heroBadge}>🐲 TOP 1 RICH</Text>
            <Text style={styles.heroCost}>🪙 3000</Text>
            <Text style={styles.heroName}>Rich Master</Text>
            <Text style={styles.lock}>🔒 Not owned</Text>
            <Text style={styles.sub}>No one owns</Text>
          </LinearGradient>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterOn]}>
                <Text style={[styles.filterT, filter === f && styles.filterTOn]}>{f === 'Prestige' ? '★ Prestige ★' : f}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sec}>Rich (0/2)</Text>
          <View style={styles.badgeRow}>
            {['Rich Master', 'Rich Level'].map((n) => (
              <View key={n} style={styles.badgeCard}>
                <Text style={styles.lockCorner}>🔒</Text>
                <Text style={{ fontSize: 36, textAlign: 'center' }}>{n === 'Rich Master' ? '🐲' : '👑'}</Text>
                <Text style={styles.badgeN}>{n}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.sec}>Charm (0/4)</Text>
          <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
            {['Haya - Lvl 100', 'Lvl 100 MJ', 'Charm Master'].map((n) => (
              <View key={n} style={styles.charmCard}>
                <Text style={styles.lockCorner}>🔒</Text>
                <Text style={{ fontSize: 32, textAlign: 'center' }}>💜</Text>
                <Text style={styles.badgeN}>{n}</Text>
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      ) : null}

      {tab === 'rank' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
          <LinearGradient colors={['#3f2a0a', '#111']} style={styles.podiumBg}>
            <View style={styles.podium}>
              {[top[1], top[0], top[2]].map((row, i) => {
                const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                if (!row) return <View key={rank} style={styles.podiumSlot} />;
                return (
                  <Pressable key={row.userId || rank} onPress={() => open(row)} style={[styles.podiumSlot, rank === 1 && { marginTop: -12 }]}>
                    <View style={[styles.wreath, rank === 1 && styles.wreath1]}>
                      <Avatar uri={mediaUrl(row.pic)} name={row.name} size={rank === 1 ? 72 : 56} />
                    </View>
                    <Text style={styles.topLabel}>TOP {rank}</Text>
                    <Text style={styles.pName} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.pScore}>★ {row.score} ★</Text>
                  </Pressable>
                );
              })}
            </View>
          </LinearGradient>
          {rest.map((row) => (
            <Pressable key={row.userId} style={styles.listRow} onPress={() => open(row)}>
              <Text style={styles.listRank}>{row.rank}</Text>
              <Avatar uri={mediaUrl(row.pic)} name={row.name} size={40} />
              <Text style={styles.listName}>{row.name}</Text>
              <Text style={styles.listScore}>{row.score}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {tab === 'mine' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View style={styles.mineHead}>
            <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pName}>{displayName}</Text>
              <Text style={styles.sub}>{me.collected} Collected   {me.honor} Honor Value</Text>
            </View>
            <Pressable onPress={() => setTab('rank')} style={styles.rankBadge}>
              <Text style={styles.rankBadgeT}>RANK ›</Text>
              <Text style={styles.rankBadgeN}>{me.rank}</Text>
            </Pressable>
          </View>
          <View style={styles.wear}>
            <View style={styles.wearHead}>
              <Text style={styles.wearT}>Badge Wear (4/10)</Text>
              <Text style={styles.link}>Edit</Text>
            </View>
            <View style={styles.slots}>
              {Array.from({ length: 10 }).map((_, i) => (
                <View key={i} style={styles.slot}>
                  <Text>{i < 4 ? ['🐱', '🏆', '🎮', '⭐'][i] : '+'}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.micRow}>
            <Text style={styles.wearT}>Room MIC Badge</Text>
            <View style={styles.slot}><Text>+</Text></View>
          </View>
          <Text style={styles.myBadges}>⭐ My Badges ({me.collected}) ⭐</Text>
          <View style={styles.myGrid}>
            {['PK League', 'SVIP Badge', 'Rich Man', 'Weekly Star Gifter', 'Game King', 'Charm'].map((n, i) => (
              <View key={n} style={[styles.myCard, i === 0 && styles.myCardOn]}>
                <Text style={{ fontSize: 32, textAlign: 'center' }}>{['⚔️', '🐱', '💰', '🌟', '🎮', '💜'][i]}</Text>
                <Text style={styles.badgeN}>{n}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {tab === 'rank' && rows[0] ? (
        <View style={styles.meBar}>
          <Text style={styles.listRank}>{me.rank}</Text>
          <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={36} />
          <Text style={styles.listName}>{displayName}</Text>
          <Text style={styles.listScore}>{me.honor}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  gold: { color: '#fbbf24', fontSize: 22, fontWeight: '700' },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 20 },
  tab: { color: 'rgba(251,191,36,0.5)', fontSize: 16, fontWeight: '700' },
  tabOn: { color: '#fbbf24' },
  goldLine: { height: 2, backgroundColor: '#fbbf24', marginTop: 4 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  statues: { fontSize: 28, marginBottom: 8 },
  heroBadge: { color: '#fbbf24', fontSize: 22, fontWeight: '900' },
  heroCost: { color: '#fde68a', marginTop: 8, fontWeight: '700' },
  heroName: { color: '#fff', fontWeight: '800', marginTop: 4 },
  lock: { color: '#d1d5db', marginTop: 6 },
  sub: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 8 },
  filter: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#1f1f1f' },
  filterOn: { borderWidth: 1, borderColor: '#fbbf24' },
  filterT: { color: '#9ca3af', fontWeight: '700' },
  filterTOn: { color: '#fbbf24' },
  sec: { color: '#fbbf24', fontWeight: '800', marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 10 },
  badgeCard: { flex: 1, backgroundColor: '#1a1408', borderWidth: 1, borderColor: '#b45309', borderRadius: 12, padding: 12, minHeight: 120 },
  charmCard: { width: 120, backgroundColor: '#1a1408', borderWidth: 1, borderColor: '#b45309', borderRadius: 12, padding: 12 },
  lockCorner: { position: 'absolute', right: 8, top: 6 },
  badgeN: { color: '#fff', textAlign: 'center', marginTop: 8, fontWeight: '700', fontSize: 12 },
  podiumBg: { paddingTop: 20, paddingBottom: 12 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  podiumSlot: { alignItems: 'center', width: 110 },
  wreath: { borderWidth: 3, borderColor: '#ca8a04', borderRadius: 40, padding: 3 },
  wreath1: { borderColor: '#fbbf24', shadowColor: '#fbbf24', shadowOpacity: 0.8, shadowRadius: 12 },
  topLabel: { color: '#fbbf24', fontWeight: '800', fontSize: 11, marginTop: 4 },
  pName: { color: '#fff', fontWeight: '800', maxWidth: 100 },
  pScore: { color: '#fde68a', marginTop: 4, fontWeight: '700', fontSize: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222' },
  listRank: { width: 28, color: '#fff', fontWeight: '800' },
  listName: { flex: 1, color: '#fff', fontWeight: '700' },
  listScore: { color: '#fbbf24', fontWeight: '800' },
  meBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#1c1408', borderTopWidth: 1, borderTopColor: '#b45309' },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  rankBadge: { alignItems: 'center' },
  rankBadgeT: { color: '#fbbf24', fontWeight: '800', fontSize: 11 },
  rankBadgeN: { color: '#fbbf24', fontWeight: '900', fontSize: 22 },
  wear: { borderWidth: 1, borderColor: '#ca8a04', borderRadius: 14, padding: 12, marginBottom: 12 },
  wearHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  wearT: { color: '#fff', fontWeight: '800' },
  link: { color: '#fbbf24', fontWeight: '700' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: 44, height: 48, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  micRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ca8a04', borderRadius: 14, padding: 12, marginBottom: 16 },
  myBadges: { color: '#fbbf24', textAlign: 'center', fontWeight: '800', marginBottom: 12 },
  myGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  myCard: { width: '30%', margin: '1.5%', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 10, minHeight: 110 },
  myCardOn: { borderWidth: 2, borderColor: '#fbbf24' },
});
