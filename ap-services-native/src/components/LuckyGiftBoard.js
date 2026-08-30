import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui';

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function PodiumSlot({ place, item, size }) {
  if (!item) return <View style={{ width: size + 8 }} />;
  const ring = place === 1 ? '#F5D76E' : place === 2 ? '#E5E7EB' : '#D97706';
  return (
    <View style={[styles.podiumSlot, place === 1 && { marginTop: -18 }]}>
      <View style={[styles.crownWrap, place !== 1 && { opacity: 0.85 }]}>
        <Text style={styles.crown}>{place === 1 ? '👑' : place === 2 ? '🥈' : '🥉'}</Text>
      </View>
      <View style={[styles.podiumRing, { borderColor: ring, width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]}>
        <Avatar uri={item.profilePic || item.profile_pic} name={item.name} size={size} />
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.podiumLv}>Lv.{item.level || 1}</Text>
      <Text style={styles.podiumWin}>Win 🪙 {fmt(item.win)}</Text>
    </View>
  );
}

export default function LuckyGiftBoard({ visible, api, onClose }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('rank');
  const [rank, setRank] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !visible) return;
    setLoading(true);
    setError('');
    try {
      const [rRes, hRes] = await Promise.all([
        api.get('/social/gifts/lucky/rank', { limit: 50 }, { auth: false, cacheTtlMs: 0 }).catch(() => ({})),
        api.get('/social/gifts/lucky/history', { limit: 60 }, { cacheTtlMs: 0 }).catch(() => ({})),
      ]);
      setRank(api.extractList(rRes));
      setHistory(api.extractList(hRes));
    } catch (e) {
      setError(e.message || 'Could not load lucky board');
    } finally {
      setLoading(false);
    }
  }, [api, visible]);

  useEffect(() => {
    if (visible) {
      setTab('rank');
      load();
    }
  }, [visible, load]);

  const top = [rank[1], rank[0], rank[2]];
  const rest = rank.slice(3);

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom }]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setTab('rank')} style={styles.tabBtn}>
            <Text style={[styles.tabT, tab === 'rank' && styles.tabOn]}>Rank</Text>
            {tab === 'rank' ? <View style={styles.tabLine} /> : null}
          </Pressable>
          <Pressable onPress={() => setTab('history')} style={styles.tabBtn}>
            <Text style={[styles.tabT, tab === 'history' && styles.tabOn]}>History</Text>
            {tab === 'history' ? <View style={styles.tabLine} /> : null}
          </Pressable>
          <View style={{ width: 36 }} />
        </View>

        {loading ? <ActivityIndicator color="#F5D76E" style={{ marginTop: 28 }} /> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}

        {tab === 'rank' ? (
          <FlatList
            data={rest}
            keyExtractor={(item, i) => String(item.userId || item.rank || i)}
            ListHeaderComponent={
              <View style={styles.podium}>
                <PodiumSlot place={2} item={top[0]} size={64} />
                <PodiumSlot place={1} item={top[1]} size={86} />
                <PodiumSlot place={3} item={top[2]} size={64} />
              </View>
            }
            ListEmptyComponent={!loading ? <Text style={styles.empty}>No lucky wins yet. Send a Lucky Gift to appear here.</Text> : null}
            renderItem={({ item }) => (
              <View style={styles.rankRow}>
                <Text style={styles.rankN}>{item.rank}</Text>
                <Avatar uri={item.profilePic || item.profile_pic} name={item.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rankLv}>Lv.{item.level || 1}</Text>
                </View>
                <Text style={styles.rankWin}>Win 🪙 {fmt(item.win)}</Text>
              </View>
            )}
          />
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item, i) => String(item.id || i)}
            ListHeaderComponent={
              <View style={styles.histHead}>
                <Text style={[styles.histH, { flex: 1.1 }]}>Gift</Text>
                <Text style={[styles.histH, { flex: 1, textAlign: 'center' }]}>Cost</Text>
                <Text style={[styles.histH, { flex: 1, textAlign: 'right' }]}>Prize</Text>
              </View>
            }
            ListEmptyComponent={!loading ? <Text style={styles.empty}>Your lucky gift history will show here.</Text> : null}
            renderItem={({ item, index }) => (
              <View style={[styles.histRow, index % 2 === 1 && styles.histAlt]}>
                <View style={styles.histGift}>
                  <Text style={styles.histEmoji}>{item.emoji || '🍀'}</Text>
                  <Text style={styles.histQty}>{item.qty || 1}</Text>
                </View>
                <Text style={styles.histCost}>🪙 {fmt(item.cost)}</Text>
                <Text style={[styles.histPrize, Number(item.prize) > 0 && styles.histPrizeWin]}>
                  🪙 {fmt(item.prize)}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12141C' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabT: { color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 16 },
  tabOn: { color: '#5EEAD4' },
  tabLine: { marginTop: 4, height: 3, width: 36, borderRadius: 2, backgroundColor: '#5EEAD4' },
  err: { color: '#FCA5A5', textAlign: 'center', marginBottom: 8 },
  empty: { color: '#9CA3AF', textAlign: 'center', padding: 28 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 18, paddingBottom: 16 },
  podiumSlot: { alignItems: 'center', flex: 1 },
  crownWrap: { marginBottom: 4 },
  crown: { fontSize: 18 },
  podiumRing: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  podiumName: { color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 8, maxWidth: 100 },
  podiumLv: { color: '#FBBF24', fontWeight: '700', fontSize: 11, marginTop: 2 },
  podiumWin: { color: '#F5D76E', fontWeight: '800', fontSize: 11, marginTop: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  rankN: { width: 28, color: '#9CA3AF', fontWeight: '800', fontSize: 15 },
  rankName: { color: '#fff', fontWeight: '800' },
  rankLv: { color: '#FBBF24', fontWeight: '700', fontSize: 11, marginTop: 2 },
  rankWin: { color: '#F5D76E', fontWeight: '800', fontSize: 13 },
  histHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  histH: { color: '#9CA3AF', fontWeight: '800', fontSize: 12 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  histAlt: { backgroundColor: 'rgba(255,255,255,0.04)' },
  histGift: { flex: 1.1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  histEmoji: { fontSize: 18 },
  histQty: { color: '#fff', fontWeight: '800' },
  histCost: { flex: 1, textAlign: 'center', color: '#F5D76E', fontWeight: '700' },
  histPrize: { flex: 1, textAlign: 'right', color: '#9CA3AF', fontWeight: '700' },
  histPrizeWin: { color: '#34D399' },
});
