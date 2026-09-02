import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
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
import { useLiveMini } from '../../context/LiveMiniContext';
import RoomCard from '../../components/RoomCard';
import { navigateToLiveRoom } from '../../lib/navigateToLiveRoom';
import { shouldRefresh } from '../../lib/queryCache';

const TABS = [
  { id: 'following', label: 'Following' },
  { id: 'explore', label: 'Explore' },
  { id: 'service', label: 'Service', screen: 'Services' },
  { id: 'party', label: 'Party' },
  { id: 'nearby', label: 'Nearby' },
];

const REGION_POPULAR = [
  { id: 'Popular', label: 'Popular' },
  { id: 'Philippines', label: '🇵🇭 Philippines' },
  { id: 'Nepal', label: '🇳🇵 Nepal' },
  { id: 'India', label: '🇮🇳 India' },
  { id: 'Pakistan', label: '🇵🇰 Pakistan' },
  { id: 'Bangladesh', label: '🇧🇩 Bangladesh' },
];

const REGION_MORE = [
  { id: 'Vietnam', label: '🇻🇳 Vietnam' },
  { id: 'Nigeria', label: '🇳🇬 Nigeria' },
  { id: 'Brazil', label: '🇧🇷 Brazil' },
  { id: 'Egypt', label: '🇪🇬 Egypt' },
  { id: 'Ghana', label: '🇬🇭 Ghana' },
];

const EXPLORE_TAB_INDEX = TABS.findIndex((t) => t.id === 'explore');

const BANNERS = [
  {
    id: 'reality',
    image: require('../../../assets/promos/ap-reality-show.jpg'),
    screen: 'Rankings',
  },
  {
    id: 'lucky',
    colors: ['#3B2412', '#1A0E08'],
    kicker: 'Lucky Gift Ranking',
    range: 'Daily Top1  ·  3-Day Top1',
    prize: '30,000,000  /  100,000,000',
    screen: 'Rankings',
  },
  {
    id: 'pk',
    colors: ['#7F1D4A', '#9A3412'],
    kicker: 'PK Combat Points Ranking',
    range: 'This week prize pool',
    prize: '112,770,000',
    screen: 'Rankings',
  },
  {
    id: 'services',
    colors: ['#0F766E', '#115E59'],
    kicker: 'Home services',
    range: 'Plumbing · Beauty · Repair',
    prize: 'Book a trusted pro',
    screen: 'Services',
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
          <Pressable
            onPress={() => navigation.navigate(item.screen || 'Rankings')}
            style={{ width: BANNER_W }}
          >
            {item.image ? (
              <Image
                source={item.image}
                style={styles.bannerImg}
                resizeMode="cover"
                accessibilityLabel="1st Reality Show Antakshari"
              />
            ) : (
              <LinearGradient colors={item.colors} style={styles.banner}>
                <Text style={styles.bannerK}>{item.kicker}</Text>
                <Text style={styles.bannerR}>{item.range}</Text>
                <Text style={styles.bannerP}>{item.prize}</Text>
              </LinearGradient>
            )}
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
  const liveMini = useLiveMini();
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
      const sort = 'trending';
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
    (item) => {
      navigateToLiveRoom(navigation, liveMini, item).catch(() => {
        navigation.navigate(item.isParty ? 'PartyRoom' : 'LiveRoom', item);
      });
    },
    [liveMini, navigation]
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
  const [tabIndex, setTabIndex] = useState(Math.max(0, EXPLORE_TAB_INDEX));
  const [q, setQ] = useState('');
  const [regionOpen, setRegionOpen] = useState(false);
  const [region, setRegion] = useState('Global');
  const tabsRef = useRef(null);
  const tab = TABS[tabIndex]?.id || 'explore';

  const changeTab = useCallback(
    (index) => {
      const t = TABS[index];
      if (!t) return;
      if (t.screen) {
        navigation.navigate(t.screen);
        return;
      }
      setTabIndex(index);
      tabsRef.current?.scrollTo({ x: Math.max(0, index * 72 - 40), animated: true });
    },
    [navigation]
  );

  const pickRegion = useCallback((id) => {
    setRegion(id === 'Popular' ? 'Global' : id);
    setRegionOpen(false);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['rgba(232,197,120,0.28)', 'rgba(253,248,238,0)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.patternHead}>
        <View style={styles.tabRow}>
          <ScrollView
            ref={tabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {TABS.map((t, i) => {
              const active = tabIndex === i && !t.screen;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => changeTab(i)}
                  style={[styles.tabPill, active && styles.tabPillOn]}
                >
                  {active ? (
                    <LinearGradient
                      colors={['#E8C578', '#C9A227']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tabPillGrad}
                    >
                      <Text style={[styles.tabT, styles.tabTOn]}>{t.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.tabPillInner}>
                      <Text style={styles.tabT}>{t.label}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.topIcons}>
            <Pressable
              onPress={() => navigation.navigate('Rankings')}
              style={styles.trophy}
              accessibilityRole="button"
              accessibilityLabel="Rankings"
            >
              <Ionicons name="trophy" size={20} color="#C9A227" />
            </Pressable>
            <Pressable
              onPress={() => setRegionOpen(true)}
              style={styles.globalPill}
              accessibilityRole="button"
              accessibilityLabel="Global region"
            >
              <Ionicons name="globe-outline" size={16} color="#6B4A1B" />
              <Text style={styles.globalT} numberOfLines={1}>
                {region}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#8B6D3B" />
            </Pressable>
          </View>
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
        <RoomsGrid tabId={tab === 'service' ? 'explore' : tab} api={api} q={q} navigation={navigation} />
      </View>

      <Pressable onPress={() => navigation.navigate('GoLive', { isParty: tab === 'party' })} style={styles.fabWrap}>
        <LinearGradient colors={['#F5C542', '#E89020']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <Ionicons name="videocam" size={18} color="#fff" />
          <Text style={styles.fabT}>{tab === 'party' ? 'PARTY' : 'Start Live'}</Text>
        </LinearGradient>
      </Pressable>

      <Modal visible={regionOpen} transparent animationType="slide" onRequestClose={() => setRegionOpen(false)}>
        <View style={styles.sheetScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRegionOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetHot}>HOT</Text>
              <Pressable onPress={() => setRegionOpen(false)} style={styles.sheetClose}>
                <Ionicons name="globe-outline" size={16} color="#6B4A1B" />
                <Text style={styles.sheetCloseT}>{region}</Text>
                <Ionicons name="chevron-up" size={14} color="#8B6D3B" />
              </Pressable>
            </View>
            <Text style={styles.sheetLabel}>Popular</Text>
            <View style={styles.pillWrap}>
              {REGION_POPULAR.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => pickRegion(r.id)}
                  style={[styles.regionPill, (region === r.id || (r.id === 'Popular' && region === 'Global')) && styles.regionPillOn]}
                >
                  <Text
                    style={[
                      styles.regionPillT,
                      (region === r.id || (r.id === 'Popular' && region === 'Global')) && styles.regionPillTOn,
                    ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetLabel}>Country/Region</Text>
            <View style={styles.pillWrap}>
              {REGION_MORE.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => pickRegion(r.id)}
                  style={[styles.regionPill, region === r.id && styles.regionPillOn]}
                >
                  <Text style={[styles.regionPillT, region === r.id && styles.regionPillTOn]}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => {
                setRegionOpen(false);
                navigation.navigate('Services');
              }}
              style={styles.marketBtn}
            >
              <Text style={styles.marketBtnT}>Open marketplace</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF6EE' },
  patternHead: {
    backgroundColor: '#FDF8EE',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(201,162,39,0.18)',
  },
  tabRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  tabs: { paddingHorizontal: 10, gap: 6, alignItems: 'center', paddingVertical: 6 },
  tabPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.28)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    shadowColor: '#6B4F10',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  tabPillOn: {
    borderColor: 'transparent',
    shadowColor: '#A67C1A',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  tabPillGrad: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabPillInner: {
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  tabT: { color: '#8A5A12', fontSize: 12, fontWeight: '700' },
  tabTOn: { color: '#fff', fontWeight: '800', fontSize: 13 },
  topIcons: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 2 },
  trophy: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  globalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#F3EBDD',
    maxWidth: 118,
    marginRight: 4,
  },
  globalT: { color: '#6B4A1B', fontWeight: '700', fontSize: 12, maxWidth: 64 },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '72%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetHot: { fontWeight: '900', color: '#6B4A1B', fontSize: 18, letterSpacing: 0.5 },
  sheetClose: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetCloseT: { color: '#6B4A1B', fontWeight: '700' },
  sheetLabel: { color: '#8B6D3B', fontWeight: '700', marginBottom: 8, marginTop: 6 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  regionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F7F4EE',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.2)',
  },
  regionPillOn: { backgroundColor: '#6B4A1B', borderColor: '#6B4A1B' },
  regionPillT: { color: '#5D4037', fontWeight: '700', fontSize: 13 },
  regionPillTOn: { color: '#fff' },
  marketBtn: {
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: '#E89020',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  marketBtnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
  bannerImg: {
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 14,
    width: '100%',
    height: 92,
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
