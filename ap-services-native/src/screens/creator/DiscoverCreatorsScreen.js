import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { mediaUrl } from '../../config/api';
import { Avatar, EmptyState, Loading } from '../../components/ui';
import SoftImage from '../../components/SoftImage';
import RegionPicker, { regionMeta } from '../../components/RegionPicker';
import {
  cancelMatch,
  fetchActiveMatch,
  fetchMatchAvailability,
  fetchMatchPricing,
  startMatch,
} from '../../lib/matchCall';
import { callParamsFromMatch, makeMatchRequestId } from '../../lib/matchCallNav';

function mapCreator(c) {
  const name = c.displayName || c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Creator';
  return {
    id: String(c.userId || c.id || ''),
    name,
    pic: c.profilePic || c.profile_pic,
    age: c.age || c.years || '',
    height: c.height || c.height_cm ? `${c.height || c.height_cm} cm` : '',
    country: c.country || c.country_code || '',
    bio: c.bio || c.about || c.tagline || 'Come and Join Me.',
    online: Boolean(c.is_online || c.online || c.isLive),
    live: Boolean(c.isLive || c.live),
    channel: c.channel || c.liveChannel,
    isParty: Boolean(c.isParty),
    album: c.album || c.photos || [],
    verified: Boolean(c.verified || c.is_verified),
  };
}

export default function DiscoverCreatorsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user } = useAuth();
  const socket = useSocket();
  const [tab, setTab] = useState('nearby');
  const [region, setRegion] = useState('all');
  const [regionOpen, setRegionOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState({ voiceCost: 50, videoCost: 100 });
  const [searching, setSearching] = useState(null);
  const busyRef = useRef(false);
  const requestIdRef = useRef(null);

  const load = useCallback(async () => {
    if (!rows.length) setLoading(true);
    try {
      const [creators, rooms] = await Promise.all([
        api.get('/social/discover/creators', { period: tab === 'new' ? 'daily' : 'weekly', country: region === 'all' ? undefined : region }, { auth: false, cacheTtlMs: 25000 }).catch(() => ({})),
        api.get('/live/rooms', { limit: 40 }, { auth: false, cacheTtlMs: 20000 }).catch(() => ({})),
      ]);
      const live = api.extractList(rooms);
      const byHost = new Map();
      for (const r of live) {
        const hid = String(r.hostId || r.host_user_id || '');
        if (hid) byHost.set(hid, r);
      }
      const list = api.extractList(creators).map(mapCreator).filter((c) => c.id);
      const merged = list.map((c) => {
        const room = byHost.get(c.id);
        return room ? { ...c, live: true, channel: room.channel, isParty: room.type === 'party' } : c;
      });
      setRows(merged);
      DiscoverCreatorsScreen._lastLoad = Date.now();
    } catch (_e) {
      if (!rows.length) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, region, tab, rows.length]);

  useEffect(() => {
    fetchMatchPricing(api)
      .then((p) => {
        if (p) setPricing(p);
      })
      .catch(() => {});
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const active = await fetchActiveMatch(api);
          if (!alive || !active?.matchId) return;
          const params = callParamsFromMatch(active);
          if (params) navigation.navigate('Call', params);
        } catch (_e) {}
      })();
      if (!rows.length) return;
      const fresh = Date.now() - (DiscoverCreatorsScreen._lastLoad || 0) < 25000;
      if (!fresh) load();
      return () => {
        alive = false;
      };
    }, [api, load, navigation, rows.length])
  );

  React.useEffect(() => {
    DiscoverCreatorsScreen._lastLoad = 0;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, region]);

  useEffect(() => {
    let unsubFound = () => {};
    let unsubEnded = () => {};
    (async () => {
      try {
        await socket.connect?.();
      } catch (_e) {}
      unsubFound = socket.on('match:found', () => {
        setSearching(null);
        busyRef.current = false;
      });
      unsubEnded = socket.on('match:ended', (payload) => {
        if (payload?.reason === 'busy') {
          setSearching(null);
          busyRef.current = false;
          Alert.alert('Match cancelled', payload?.message || 'You became busy and were removed from the match queue.');
          return;
        }
        if (!payload?.matchId && payload?.reason === 'no_match') {
          setSearching(null);
          busyRef.current = false;
          Alert.alert('No match found', 'Nobody was available. Try again in a moment.');
        }
      });
    })();
    return () => {
      unsubFound();
      unsubEnded();
    };
  }, [socket]);

  const openChat = async (item) => {
    try {
      const res = await api.post('/messages/conversations', { receiverId: item.id });
      const c = api.unwrap(res);
      navigation.navigate('ChatThread', { conversationId: c.id || c.conversationId, name: item.name, otherUserId: item.id, pic: item.pic });
    } catch (e) {
      Alert.alert('Chat failed', e.message);
    }
  };

  const goToCall = useCallback(
    (payload) => {
      const params = callParamsFromMatch(payload);
      if (!params) return;
      if (navigation.getCurrentRoute?.()?.name === 'Call') return;
      setSearching(null);
      busyRef.current = false;
      navigation.navigate('Call', params);
    },
    [navigation]
  );

  const matchNow = async (voice) => {
    if (busyRef.current) return;
    const mode = voice ? 'voice' : 'video';
    const cost = voice ? pricing.voiceCost : pricing.videoCost;
    busyRef.current = true;
    const clientRequestId = makeMatchRequestId(user?.id);
    requestIdRef.current = clientRequestId;

    try {
      await socket.connect?.();
      const availability = await fetchMatchAvailability(api).catch(() => null);
      if (availability?.busy && availability?.reason !== 'match_queue') {
        busyRef.current = false;
        Alert.alert('You are busy', availability.message || 'Leave your live, party, or call before starting a match.');
        return;
      }

      const data = await startMatch(api, { mode, clientRequestId });

      if (data?.matchId || data?.status === 'matched' || data?.alreadyActive) {
        goToCall(data);
        return;
      }

      if (data?.status === 'searching') {
        setSearching({
          mode,
          cost: data.cost || cost,
          balance: data.balance,
        });
        return;
      }

      busyRef.current = false;
      Alert.alert('Match unavailable', data?.message || 'Try again shortly.');
    } catch (e) {
      busyRef.current = false;
      setSearching(null);
      if (e?.status === 409 || e?.body?.code === 'USER_BUSY') {
        const msg = e?.body?.message || e?.message || 'You are busy and cannot start a match right now.';
        Alert.alert('You are busy', msg);
        return;
      }
      if (e?.status === 402 || e?.body?.code === 'INSUFFICIENT_BALANCE') {
        const need = e?.body?.data?.cost || cost;
        Alert.alert('Not enough coins', `You need ${need} coins per minute to start ${mode} match.`, [
          { text: 'Recharge', onPress: () => navigation.navigate('Recharge') },
          { text: 'OK' },
        ]);
        return;
      }
      Alert.alert('Match failed', e.message || 'Could not start match');
    }
  };

  const cancelSearch = async () => {
    try {
      await cancelMatch(api);
      await socket.cancelMatch?.().catch(() => {});
    } catch (_e) {}
    setSearching(null);
    busyRef.current = false;
  };

  const voiceCost = pricing.voiceCost || 50;
  const videoCost = pricing.videoCost || 100;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.matchRow}>
        <Pressable onPress={() => matchNow(false)} disabled={Boolean(searching)} style={{ flex: 1, opacity: searching ? 0.6 : 1 }}>
          <LinearGradient colors={['#F472B6', '#A855F7']} style={styles.matchBtn}>
            <Ionicons name="videocam" size={18} color="#fff" />
            <Text style={styles.matchT}>Video Match</Text>
            <Text style={styles.matchCost}>{videoCost} coins/min</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => matchNow(true)} disabled={Boolean(searching)} style={{ flex: 1, opacity: searching ? 0.6 : 1 }}>
          <LinearGradient colors={['#38BDF8', '#2563EB']} style={styles.matchBtn}>
            <Ionicons name="volume-high" size={18} color="#fff" />
            <Text style={styles.matchT}>Voice Match</Text>
            <Text style={styles.matchCost}>{voiceCost} coins/min</Text>
          </LinearGradient>
        </Pressable>
      </View>
      <View style={styles.sub}>
        <Pressable onPress={() => setTab('nearby')} style={styles.subTab}>
          <Text style={[styles.subT, tab === 'nearby' && styles.subOn]}>NearBy</Text>
          {tab === 'nearby' ? <View style={styles.line} /> : null}
        </Pressable>
        <Pressable onPress={() => setTab('new')} style={styles.subTab}>
          <Text style={[styles.subT, tab === 'new' && styles.subOn]}>New</Text>
          {tab === 'new' ? <View style={styles.line} /> : null}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setRegionOpen(true)} style={styles.flags}>
          <Text>{regionMeta(region).flag}</Text>
          <Ionicons name="chevron-down" size={12} color="#6B7280" />
        </Pressable>
      </View>
      {loading && !rows.length ? (
        <Loading label="Finding people…" />
      ) : (
        <FlatList
          data={
            region === 'all' || !rows.some((r) => r.country)
              ? rows
              : rows.filter((r) => String(r.country || '').toUpperCase() === region)
          }
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={<EmptyState title="No matches nearby" subtitle="Try Video Match or open Home to go live." />}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('CreatorProfile', { userId: item.id, name: item.name })}>
              <View>
                {item.pic ? <SoftImage uri={mediaUrl(item.pic)} style={styles.thumb} /> : <Avatar name={item.name} size={72} />}
                {item.online ? <View style={styles.dot} /> : null}
                {item.live ? <View style={styles.live}><Text style={styles.liveT}>LIVE</Text></View> : (
                  <View style={styles.chatTag}><Text style={styles.chatTagT}>Chat</Text></View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {item.verified ? <Ionicons name="checkmark-circle" size={14} color="#3B82F6" /> : null}
                </View>
                <Text style={styles.meta}>
                  {[item.age, item.height, item.country].filter(Boolean).join(' · ') || 'Creator'}
                </Text>
                <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>
              </View>
              <Pressable onPress={() => openChat(item)} style={styles.chat}>
                <Ionicons name="chatbubble" size={16} color="#fff" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
      <RegionPicker visible={regionOpen} value={region} onSelect={setRegion} onClose={() => setRegionOpen(false)} />

      <Modal visible={Boolean(searching)} transparent animationType="fade">
        <View style={styles.searchOverlay}>
          <View style={styles.searchCard}>
            <ActivityIndicator size="large" color="#A855F7" />
            <Text style={styles.searchTitle}>
              {searching?.mode === 'voice' ? 'Voice Match' : 'Video Match'}
            </Text>
            <Text style={styles.searchSub}>Looking for someone available…</Text>
            <Text style={styles.searchCost}>
              {searching?.cost || '—'} coins/min · Balance {searching?.balance ?? '—'}
            </Text>
            <Pressable onPress={cancelSearch} style={styles.cancelBtn}>
              <Text style={styles.cancelT}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  matchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 8 },
  matchBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 12, gap: 2 },
  matchT: { color: '#fff', fontWeight: '800', marginTop: 2 },
  matchCost: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },
  sub: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, marginBottom: 8 },
  subTab: { marginRight: 18, alignItems: 'center' },
  subT: { color: '#9CA3AF', fontWeight: '700', fontSize: 16 },
  subOn: { color: '#111', fontWeight: '800' },
  line: { height: 3, width: 28, backgroundColor: '#111', borderRadius: 2, marginTop: 6 },
  flags: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#F3F4F6' },
  dot: { position: 'absolute', right: 4, bottom: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#fff' },
  live: { position: 'absolute', left: 4, bottom: 4, backgroundColor: '#EF4444', borderRadius: 4, paddingHorizontal: 4 },
  liveT: { color: '#fff', fontSize: 8, fontWeight: '800' },
  chatTag: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(59,130,246,0.78)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, alignItems: 'center', paddingVertical: 3 },
  chatTagT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  name: { fontWeight: '800', color: '#111', fontSize: 15, maxWidth: 180 },
  meta: { color: '#9CA3AF', fontSize: 12, marginTop: 3 },
  bio: { color: '#6B7280', marginTop: 4, fontSize: 13 },
  chat: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  searchOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  searchCard: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center' },
  searchTitle: { fontWeight: '800', fontSize: 18, marginTop: 16, color: '#111' },
  searchSub: { color: '#6B7280', marginTop: 8, textAlign: 'center' },
  searchCost: { color: '#A855F7', fontWeight: '700', marginTop: 12, fontSize: 13 },
  cancelBtn: { marginTop: 20, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: '#F3F4F6' },
  cancelT: { fontWeight: '800', color: '#111' },
});
