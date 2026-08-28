import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import RoomCard from '../../components/RoomCard';
import { shouldRefresh } from '../../lib/queryCache';

const TABS = [
  { id: 'explore', label: 'Explore' },
  { id: 'party', label: 'Party' },
  { id: 'new', label: 'New' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'following', label: 'Following' },
];

const BANNERS = [
  {
    id: 'lucky',
    colors: ['#3B2412', '#1A0E08'],
    kicker: 'Lucky Gift Ranking',
    range: 'Daily Top1  ·  3-Day Top1',
    prize: '30,000,000  /  100,000,000',
  },
  {
    id: 'pk',
    colors: ['#7F1D4A', '#9A3412'],
    kicker: 'PK Combat Points Ranking',
    range: 'This week prize pool',
    prize: '112,770,000',
  },
];

const PAGE_W = Dimensions.get('window').width;
const BANNER_W = PAGE_W - 24;

function mapRoom(r, party = false) {
  return {
    channel: r.channel,
    hostName: r.hostName || r.host_display_name || 'Host',
    hostId: r.hostId || r.host_user_id,
    hostProfilePic: r.hostProfilePic || r.host_profile_pic,
    hostStreamCover: r.hostStreamCover || r.stream_cover_url,
    viewers: r.viewers || r.viewer_count || 0,
    type: r.type || r.room_type,
    category: r.category || r.tag || r.topic,
    isParty: party || r.type === 'party' || r.roomType === 'party',
    pk: Boolean(r.pk || r.in_pk || r.pkBattle),
    startedAt: r.startedAt || r.started_at,
    previewPics: r.previewPics || r.preview_pics || r.speakerPics || r.recentViewers || [],
    hourlyTop: Boolean(r.hourlyTop || r.topHourly || r.hourly_top),
  };
}

function BannerSlider({ navigation }) {
  const [banner, setBanner] = useState(0);

  return (
    <View style={{ marginBottom: 4 }}>
      <FlatList
        data={BANNERS}
        keyExtractor={(b) => b.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={BANNER_W}
        snapToAlignment="start"
        disableIntervalMomentum
        getItemLayout={(_, i) => ({ length: BANNER_W, offset: BANNER_W * i, index: i })}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, BANNER_W));
          setBanner(Math.max(0, Math.min(BANNERS.length - 1, i)));
        }}
        style={{ marginHorizontal: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('Rankings')} style={{ width: BANNER_W }}>
            <LinearGradient colors={item.colors} style={styles.banner}>
              <Text style={styles.bannerK}>{item.kicker}</Text>
              <Text style={styles.bannerR}>{item.range}</Text>
              <Text style={styles.bannerP}>{item.prize}</Text>
            </LinearGradient>
          </Pressable>
        )}
      />
      <View style={styles.dots}>
        {BANNERS.map((b, i) => (
          <View key={b.id} style={[styles.dot, i === banner && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

function RoomsGrid({ tabId, api, q, navigation }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastFetch = useRef(0);
  const hasData = useRef(false);
  const allRoomsRef = useRef([]);

  const load = useCallback(async (opts = {}) => {
    const showSpinner = opts.force || !hasData.current;
    if (showSpinner) setLoading(true);
    try {
      const isParty = tabId === 'party';
      const sort = tabId === 'new' ? 'new' : 'trending';
      const liveQuery = {
        type: isParty ? 'party' : tabId === 'explore' ? undefined : 'live',
        limit: 40,
        sort,
        following: tabId === 'following' ? 1 : undefined,
        nearby: tabId === 'nearby' ? 1 : undefined,
      };
      const livePromise = api.get('/live/rooms', liveQuery, { auth: false, cacheTtlMs: 20000 });
      const partyPromise =
        tabId === 'explore'
          ? api.get('/live/rooms', { type: 'party', limit: 20, sort }, { auth: false, cacheTtlMs: 20000 }).catch(() => ({}))
          : Promise.resolve(null);
      const [res, parties] = await Promise.all([livePromise, partyPromise]);
      let list = api.extractList(res).map((r) => mapRoom(r, isParty));
      if (parties) list = [...list, ...api.extractList(parties).map((r) => mapRoom(r, true))];
      const seen = new Set();
      const deduped = list.filter((r) => r.channel && !seen.has(r.channel) && seen.add(r.channel));
      allRoomsRef.current = deduped;
      hasData.current = true;
      lastFetch.current = Date.now();
      return deduped;
    } catch (_e) {
      if (!hasData.current) allRoomsRef.current = [];
      return allRoomsRef.current;
    } finally {
      setLoading(false);
    }
  }, [api, tabId]);

  const applyFilter = useCallback((list, query) => {
    const s = String(query || '').trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        String(r.hostName).toLowerCase().includes(s) ||
        String(r.channel).toLowerCase().includes(s)
    );
  }, []);

  const refreshRooms = useCallback(
    async (opts = {}) => {
      const list = await load(opts);
      setRooms(applyFilter(list, q));
    },
    [applyFilter, load, q]
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasData.current) {
        refreshRooms({ force: true });
        return undefined;
      }
      if (!shouldRefresh(lastFetch, 20000)) {
        setRooms(applyFilter(allRoomsRef.current, q));
        return undefined;
      }
      refreshRooms();
      return undefined;
    }, [applyFilter, q, refreshRooms])
  );

  React.useEffect(() => {
    hasData.current = false;
    refreshRooms({ force: true });
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setRooms(applyFilter(allRoomsRef.current, q));
  }, [applyFilter, q]);

  const openRoom = useCallback(
    (item) => navigation.navigate(item.isParty ? 'PartyRoom' : 'LiveRoom', item),
    [navigation]
  );

  return (
    <FlatList
      data={rooms}
      keyExtractor={(item, i) => item.channel || item.key || String(i)}
      numColumns={2}
      columnWrapperStyle={styles.cols}
      contentContainerStyle={styles.listPad}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={loading && hasData.current} onRefresh={() => refreshRooms({ force: true })} tintColor="#E89020" />}
      ListHeaderComponent={tabId === 'party' ? null : <BannerSlider navigation={navigation} />}
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyT}>{tabId === 'party' ? 'No party rooms right now' : 'No live broadcasts right now'}</Text>
            <Text style={styles.emptyS}>
              {tabId === 'party' ? 'Start a party and friends can take a seat.' : 'Go live and your room will appear here.'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => <RoomCard room={item} onPress={() => openRoom(item)} />}
    />
  );
}

export default function ExploreScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [tabIndex, setTabIndex] = useState(0);
  const [q, setQ] = useState('');
  const tabsRef = useRef(null);
  const tab = TABS[tabIndex]?.id || 'explore';

  const changeTab = useCallback((index) => {
    const i = Math.max(0, Math.min(TABS.length - 1, index));
    setTabIndex(i);
    tabsRef.current?.scrollTo({ x: Math.max(0, i * 72 - 40), animated: true });
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.patternHead}>
        <View style={styles.tabRow}>
          <ScrollView
            ref={tabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {TABS.map((t, i) => (
              <Pressable key={t.id} onPress={() => changeTab(i)} style={styles.tab}>
                <Text style={[styles.tabT, tabIndex === i && styles.tabTOn]}>{t.label}</Text>
                {tabIndex === i ? <View style={styles.tabLine} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => navigation.navigate('Rankings')} style={styles.trophy}>
            <Ionicons name="trophy" size={20} color="#C9A227" />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color="#C4A574" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Nickname or ID number"
            placeholderTextColor="#C4A574"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <RoomsGrid tabId={tab} api={api} q={q} navigation={navigation} />
      </View>

      <Pressable onPress={() => navigation.navigate('GoLive', { isParty: tab === 'party' })} style={styles.fabWrap}>
        <LinearGradient colors={['#F5C542', '#E89020']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <Ionicons name="videocam" size={18} color="#fff" />
          <Text style={styles.fabT}>Start Live</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EE' },
  patternHead: {
    backgroundColor: '#FBF7F0',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(201,162,39,0.18)',
  },
  tabRow: { flexDirection: 'row', alignItems: 'flex-end', paddingRight: 8 },
  tabs: { paddingHorizontal: 10, gap: 18, alignItems: 'flex-end', minHeight: 40 },
  tab: { paddingBottom: 8, alignItems: 'center', flexShrink: 0 },
  tabT: { color: '#C4A574', fontSize: 16, fontWeight: '600' },
  tabTOn: { color: '#6B4A1B', fontWeight: '800', fontSize: 18 },
  tabLine: { marginTop: 4, width: 18, height: 3, borderRadius: 2, backgroundColor: '#6B4A1B' },
  trophy: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  search: {
    marginHorizontal: 12,
    marginTop: 6,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3EBDD',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: { flex: 1, color: '#5D4037', height: 40, fontSize: 14 },
  banner: {
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 14,
    padding: 16,
    minHeight: 92,
    justifyContent: 'center',
  },
  bannerK: { color: '#F5D76E', fontSize: 20, fontWeight: '800' },
  bannerR: { color: 'rgba(255,255,255,0.72)', marginTop: 4, fontSize: 12 },
  bannerP: { color: '#fff', marginTop: 6, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(107,74,27,0.25)' },
  dotOn: { backgroundColor: '#6B4A1B' },
  cols: { justifyContent: 'space-between', paddingHorizontal: 8 },
  listPad: { paddingBottom: 100, paddingHorizontal: 4 },
  fabWrap: { position: 'absolute', right: 14, bottom: 22, zIndex: 20 },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 48,
    shadowColor: '#E89020',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { paddingTop: 48, paddingHorizontal: 28, alignItems: 'center' },
  emptyT: { color: '#5D4037', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  emptyS: { color: '#A89070', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
