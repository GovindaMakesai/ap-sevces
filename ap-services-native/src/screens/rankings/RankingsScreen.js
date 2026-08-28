import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar, ErrorBanner, Loading } from '../../components/ui';
import { mediaUrl } from '../../config/api';
import { mapFeedPost, openReelViewer } from '../../components/PostGrid';
import {
  FlameMark,
  GiftMark,
  GoldCoin,
  HexMedal,
  LevelBadge,
  PinkCoin,
  RankFrame,
  RankMedal,
  fmtScore,
  useCountdown,
} from '../../components/rankChrome';
import RegionPicker, { regionMeta } from '../../components/RegionPicker';
import { cpRankPeriod, extractCpRankings, mapCpRankRow } from '../../lib/cpRank';

const TABS = [
  { id: 'host', label: 'Host', category: 'creators' },
  { id: 'rich', label: 'Rich', category: 'gifters' },
  { id: 'gift', label: 'Gift', category: 'gifters', mode: 'count' },
  { id: 'pk', label: 'PK', category: 'pk' },
  { id: 'video', label: 'Video', category: 'video' },
  { id: 'game', label: 'Game', category: 'games' },
  { id: 'cp', label: 'CP', category: 'cp' },
];

const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

function todayStamp() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

function mapLb(item, i) {
  const pic = item.profile_pic || item.profilePic || item.user?.profile_pic;
  const thumb = item.thumb_url || item.thumbnail_url || item.media_url || null;
  return {
    rank: item.rank || i + 1,
    userId: String(item.entity_id || item.userId || item.user?.id || item.id || ''),
    name: item.entity_label || item.user?.first_name || item.name || 'User',
    pic: mediaUrl(pic),
    score: Number(item.score || item.total || item.coins || item.likes || 0),
    thumb: mediaUrl(thumb || pic),
    caption: item.caption || item.title || '',
    postId: item.postId || item.post_id || null,
    country: item.country || item.country_code || '',
    flag: item.flag || '',
  };
}

function inPeriod(createdAt, period) {
  if (!createdAt) return true;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return true;
  const now = Date.now();
  const day = 86400000;
  if (period === 'weekly') return now - t <= 7 * day;
  if (period === 'monthly') return now - t <= 31 * day;
  return now - t <= day;
}

function rankVideoPosts(mapped, period) {
  const pool = mapped.filter((x) => x.isVideo || x.thumb || x.mediaUrl);
  const videos = pool.filter((x) => x.isVideo);
  const source = (videos.length ? videos : pool)
    .filter((x) => inPeriod(x.createdAt, period))
    .sort((a, b) => ((b.likes || 0) + (b.comments || 0)) - ((a.likes || 0) + (a.comments || 0)));
  const ranked = (source.length ? source : (videos.length ? videos : pool).sort((a, b) => ((b.likes || 0) + (b.comments || 0)) - ((a.likes || 0) + (a.comments || 0))));
  return ranked.map((x, i) => ({
    rank: i + 1,
    userId: x.authorId,
    name: x.authorName,
    pic: mediaUrl(x.authorPic),
    score: (x.likes || 0) + (x.comments || 0),
    thumb: mediaUrl(x.thumb || x.mediaUrl || x.authorPic),
    caption: x.caption,
    postId: x.id,
    country: x.country || '',
  }));
}

function levelOf(score) {
  return Math.min(199, 12 + Math.floor(Number(score || 0) / 500000));
}

function flagFor(code) {
  return regionMeta(code)?.flag || '🌏';
}

export default function RankingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [tab, setTab] = useState('host');
  const [region, setRegion] = useState('all');
  const [regionOpen, setRegionOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const clock = useCountdown(period);
  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const regionChip = regionMeta(region);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const country = region === 'all' ? undefined : region;
      let list = [];
      if (tab === 'video') {
        const queries = [
          { limit: 50, scope: 'for_you', mediaType: 'video' },
          { limit: 50, scope: 'latest', mediaType: 'video' },
          { limit: 50, scope: 'for_you' },
          { limit: 50, scope: 'latest' },
        ];
        for (const q of queries) {
          const res = await api.get('/social/posts', q, { auth: false }).catch(() => null);
          const ranked = rankVideoPosts(api.extractList(res).map(mapFeedPost), period);
          if (ranked.length) {
            list = ranked;
            break;
          }
        }
        if (!list.length) {
          const res = await api.get('/v1/leaderboards', { period, category: 'video', country }, { auth: false }).catch(() => null);
          list = api.extractList(res).map(mapLb);
        }
      } else if (tab === 'cp') {
        const res = await api.get('/cp/rankings', { period: cpRankPeriod(period) }, { auth: false }).catch(() => ({}));
        list = extractCpRankings(api, res).map(mapCpRankRow);
      } else {
        const res = await api.get('/v1/leaderboards', {
          period,
          category: current.category,
          mode: current.mode,
          country,
        }, { auth: false });
        list = api.extractList(res).map(mapLb);
      }
      if (country && tab !== 'cp') {
        const filtered = list.filter((r) => !r.country || String(r.country).toUpperCase() === String(country).toUpperCase());
        if (filtered.length) list = filtered.map((r, i) => ({ ...r, rank: i + 1 }));
      }
      setRows(list);
    } catch (e) {
      setError(e.message || 'Could not load rankings');
    } finally {
      setLoading(false);
    }
  }, [api, current.category, current.mode, period, region, tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const skins = {
    host: { bg: ['#FF4DA6', '#FF2D86'] },
    rich: { bg: ['#111111', '#000000'] },
    gift: { bg: ['#4C8DFF', '#2F6BFF'] },
    pk: { bg: ['#7F1D4A', '#9A3412'] },
    video: { bg: ['#3A1028', '#1A0812'] },
    game: { bg: ['#0F172A', '#1E3A8A'] },
    cp: { bg: ['#9D174D', '#BE185D'] },
  };
  const skin = skins[tab] || skins.host;
  const listBg = tab === 'video' || tab === 'host' || tab === 'cp' || tab === 'game' || tab === 'pk' ? 'transparent' : '#fff';

  const periodBar = (
    <View style={styles.periodRow}>
      {PERIODS.map((p) => (
        <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={[styles.darkPill, period === p.id && styles.darkPillOn]}>
          <Text style={[styles.darkPillT, period === p.id && styles.darkPillTOn]}>{p.label}</Text>
            </Pressable>
          ))}
    </View>
  );

  const regionBar = (
    <View style={styles.metaRow}>
      <View style={styles.metaLeft}><Ionicons name="stopwatch-outline" size={14} color="#fff" /><Text style={styles.metaT}>{clock}</Text></View>
      <Pressable onPress={() => setRegionOpen(true)} style={styles.todayChip}>
        <Text style={{ fontSize: 13 }}>{regionChip.flag}</Text>
        <Ionicons name="globe-outline" size={13} color="#fff" />
        <Ionicons name="chevron-down" size={12} color="#fff" />
      </Pressable>
      <View style={styles.metaRight}>
        <Ionicons name="swap-horizontal" size={14} color="#fff" />
        <Text style={styles.metaT}>{period === 'weekly' ? 'This Week' : period === 'monthly' ? 'This Month' : 'Today'}</Text>
      </View>
    </View>
  );

  const header = (
    <LinearGradient colors={skin.bg} style={[styles.head, { paddingTop: insets.top + 2 }]}>
      {tab === 'host' ? <View pointerEvents="none" style={styles.heartBox}><View style={styles.heartBow} /><View style={styles.heartBody} /></View> : null}
      {tab === 'gift' ? (
        <View pointerEvents="none" style={styles.giftBg}>
          <Ionicons name="gift" size={88} color="rgba(255,255,255,0.12)" />
          <Ionicons name="gift" size={54} color="rgba(255,255,255,0.1)" style={{ marginLeft: 120, marginTop: -30 }} />
        </View>
      ) : null}
      <View style={styles.topNav}>
        <Pressable onPress={() => navigation.goBack()} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.mainTabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mainTabs}>
            {TABS.map((t) => (
              <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.tabHit}>
                <Text style={[styles.mainTab, tab === t.id && styles.mainTabOn]}>{t.label}</Text>
                {tab === t.id ? <View style={styles.under} /> : null}
            </Pressable>
          ))}
          </ScrollView>
        </View>
        <Pressable onPress={() => navigation.navigate('Help')} style={styles.navBtn}>
          <Ionicons name="help-circle-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      {tab === 'host' ? (
        <>
          {periodBar}
          {regionBar}
          <LinearGradient colors={['#FFB020', '#FF7A00']} style={styles.linkBanner}>
            <Text style={styles.linkTitle}>Host Rank</Text>
            <Text style={styles.linkBody}>
              {rows[0]
                ? `${rows[0].name}  ·  ${fmtScore(rows[0].score)}`
                : 'Go live to appear on this board'}
            </Text>
            <Text style={styles.linkDates}>
              {rows.length ? `${rows.length} hosts  ·  ${todayStamp()}` : `Updated ${todayStamp()}`}
            </Text>
          </LinearGradient>
          <View style={styles.ruleBar}>
            <Text style={styles.ruleT}>Live Duration ≥ 1 hour, no violations</Text>
          </View>
        </>
      ) : null}

      {tab === 'rich' || tab === 'gift' || tab === 'game' || tab === 'cp' ? (
        <>
          {periodBar}
          {regionBar}
        </>
      ) : null}

      {tab === 'video' ? (
        <>
          {periodBar}
          <LinearGradient colors={['#5A1A38', '#3A1028']} style={styles.rewardCard}>
            <View style={styles.miniPodiums}>
              {[rows[1] || null, rows[0] || null, rows[2] || null].map((item, i) => {
                const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                return (
                  <Pressable
                    key={`vr-${rank}`}
                    style={styles.miniCol}
                    onPress={() => {
                      if (!item) return;
                      if (item.postId) openReelViewer(navigation, { userId: item.userId, startId: item.postId, mediaType: 'video' });
                      else if (item.userId) navigation.navigate('CreatorProfile', { userId: item.userId, name: item.name });
                    }}
                  >
                    <View style={[styles.miniRibbon, rank === 1 ? styles.goldRibbon : rank === 2 ? styles.pinkRibbon : styles.blueRibbon]}>
                      <Text style={styles.miniRibbonT}>{rank}</Text>
                    </View>
                    {item?.thumb ? <Image source={{ uri: item.thumb }} style={styles.miniThumb} /> : (
                      <Avatar uri={item?.pic} name={item?.name || '?'} size={28} />
                    )}
                    <Text style={styles.miniPrize} numberOfLines={1}>{item ? item.name : '—'}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View>
              <Text style={styles.rewardsH}>Rewards</Text>
              <Pressable style={styles.detailsBtn} onPress={() => setRewardsOpen(true)}>
                <Text style={styles.detailsT}>Details ›</Text>
              </Pressable>
            </View>
          </LinearGradient>
          {regionBar}
        </>
      ) : null}
    </LinearGradient>
  );

  const hostHeader = (
    <View>
      {rows[0] ? (
        <LinearGradient colors={tab === 'cp' ? ['#BE185D', '#9D174D'] : ['#FF9A2F', '#FF6A00']} style={styles.hostCard}>
          <View style={styles.ribbon}>
            {tab === 'cp' ? <Text style={{ fontSize: 14 }}>💖</Text> : <PinkCoin size={14} />}
            <Text style={styles.ribbonT}>{fmtScore(rows.reduce((s, r) => s + Number(r.score || 0), 0))}</Text>
            <Text style={styles.ribbonDate}>{todayStamp()}</Text>
          </View>
          <View style={styles.hexRow}>
            {tab === 'cp' ? (
              <>
                {rows[1] ? (
                  <Pressable style={{ alignItems: 'center', width: 96 }} onPress={() => rows[1].userId && navigation.navigate('CreatorProfile', { userId: rows[1].userId, name: rows[1].nameA })}>
                    <Text style={{ color: '#fff', fontWeight: '900', marginBottom: 4 }}>#2</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Avatar uri={rows[1].pic} name={rows[1].nameA} size={36} />
                      <Text style={{ color: '#fff', marginHorizontal: 2 }}>♥</Text>
                      <Avatar uri={rows[1].partnerPic} name={rows[1].nameB} size={36} />
                    </View>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11, marginTop: 4 }} numberOfLines={1}>{rows[1].nameA}</Text>
                  </Pressable>
                ) : <View style={{ width: 96 }} />}
                <Pressable style={{ alignItems: 'center', width: 120 }} onPress={() => rows[0].userId && navigation.navigate('CreatorProfile', { userId: rows[0].userId, name: rows[0].nameA })}>
                  <Text style={{ color: '#FDE68A', fontWeight: '900', marginBottom: 4 }}>#1</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Avatar uri={rows[0].pic} name={rows[0].nameA} size={48} />
                    <Text style={{ color: '#FDE68A', marginHorizontal: 3, fontWeight: '900' }}>♥</Text>
                    <Avatar uri={rows[0].partnerPic} name={rows[0].nameB} size={48} />
                  </View>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, marginTop: 6 }} numberOfLines={1}>{rows[0].nameA}</Text>
                  <Text style={{ color: '#FDE68A', fontWeight: '800', fontSize: 12 }}>{fmtScore(rows[0].score)}</Text>
                </Pressable>
                {rows[2] ? (
                  <Pressable style={{ alignItems: 'center', width: 96 }} onPress={() => rows[2].userId && navigation.navigate('CreatorProfile', { userId: rows[2].userId, name: rows[2].nameA })}>
                    <Text style={{ color: '#fff', fontWeight: '900', marginBottom: 4 }}>#3</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Avatar uri={rows[2].pic} name={rows[2].nameA} size={36} />
                      <Text style={{ color: '#fff', marginHorizontal: 2 }}>♥</Text>
                      <Avatar uri={rows[2].partnerPic} name={rows[2].nameB} size={36} />
                    </View>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11, marginTop: 4 }} numberOfLines={1}>{rows[2].nameA}</Text>
                  </Pressable>
                ) : <View style={{ width: 96 }} />}
              </>
            ) : (
              <>
                {rows[1] ? <HexMedal rank={2} uri={rows[1].pic} name={rows[1].name} prize={rows[1].score} size={72} /> : <View style={{ width: 96 }} />}
                <HexMedal rank={1} uri={rows[0].pic} name={rows[0].name} prize={rows[0].score} size={96} />
                {rows[2] ? <HexMedal rank={3} uri={rows[2].pic} name={rows[2].name} prize={rows[2].score} size={72} /> : <View style={{ width: 96 }} />}
              </>
            )}
          </View>
        </LinearGradient>
      ) : (
        <Text style={styles.hostEmpty}>{tab === 'cp' ? 'No CP couples ranked yet. Gift your partner to climb.' : 'No hosts ranked yet. Go live to take a medal.'}</Text>
      )}
    </View>
  );

  const videoHeader = (
    <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
      {rows[0] ? (
        <View style={styles.vidPodium}>
          {[rows[1] || null, rows[0], rows[2] || null].map((item, i) => {
            const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
            if (!item) return <View key={`empty-${rank}`} style={{ flex: 1 }} />;
            return (
              <Pressable
                key={item.postId || item.userId || rank}
                style={[styles.vidCard, rank === 1 && styles.vidCard1, rank === 2 && styles.vidCard2, rank === 3 && styles.vidCard3]}
                onPress={() => {
                  if (item.postId) openReelViewer(navigation, { userId: item.userId, startId: item.postId, mediaType: 'video' });
                  else navigation.navigate('CreatorProfile', { userId: item.userId, name: item.name });
                }}
              >
                <LinearGradient colors={rank === 1 ? ['#E8B84A', '#C99212'] : rank === 2 ? ['#5B8DEF', '#3B6BD6'] : ['#C47A3A', '#8B4A22']} style={styles.topRibbon}>
                  <Text style={styles.topRibbonT}>TOP {rank}</Text>
      </LinearGradient>
                {item.thumb ? <Image source={{ uri: item.thumb }} style={styles.vidThumb} /> : (
                  <View style={[styles.vidThumb, { backgroundColor: '#2A1520', alignItems: 'center', justifyContent: 'center' }]}>
                    <Avatar uri={item.pic} name={item.name} size={44} />
                  </View>
                )}
                <View style={styles.playDot}><Ionicons name="play" size={10} color="#333" /></View>
                <View style={styles.vidMeta}>
                  <Avatar uri={item.pic} name={item.name} size={22} />
                  <Text style={styles.vidName} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={styles.vidStats}>
                  <View style={styles.statPair}><FlameMark /><Text style={styles.vidStat}>{fmtScore(item.score)}</Text></View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const listData = tab === 'cp'
    ? rows.slice(3)
    : (tab === 'host' || tab === 'video' || tab === 'game') && rows.length > 3
      ? rows.slice(3)
      : rows;
  const myPic = mediaUrl(user?.profile_pic || user?.profilePic);

  const renderRow = ({ item }) => {
    if (tab === 'video') {
      return (
        <Pressable
          style={styles.vidRow}
          onPress={() => {
            if (item.postId) openReelViewer(navigation, { userId: item.userId, startId: item.postId, mediaType: 'video' });
            else if (item.userId) navigation.navigate('CreatorProfile', { userId: item.userId, name: item.name });
          }}
        >
          <Text style={styles.vidRank}>{item.rank}</Text>
          <View>
            {item.thumb ? <Image source={{ uri: item.thumb }} style={styles.vidSq} /> : <View style={[styles.vidSq, { backgroundColor: '#2A1520' }]} />}
            <View style={styles.playDotSm}><Ionicons name="play" size={8} color="#333" /></View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vidCap} numberOfLines={1}>{item.caption || item.name}</Text>
            <View style={styles.vidWho}>
              <Avatar uri={item.pic} name={item.name} size={22} />
              <Text style={styles.vidWhoT} numberOfLines={1}>{item.name}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={styles.statPair}><FlameMark /><Text style={styles.vidStat}>{fmtScore(item.score)}</Text></View>
          </View>
        </Pressable>
      );
    }
    if (tab === 'cp') {
      return (
        <Pressable style={styles.row} onPress={() => item.userId && navigation.navigate('CreatorProfile', { userId: item.userId, name: item.nameA })}>
          {item.rank <= 3 ? <RankMedal rank={item.rank} size={30} /> : <Text style={styles.rankN}>{item.rank}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
            <Avatar uri={item.pic} name={item.nameA} size={36} />
            <Text style={{ color: '#BE185D', marginHorizontal: 3, fontWeight: '900' }}>♥</Text>
            <Avatar uri={item.partnerPic} name={item.nameB} size={36} />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.name} numberOfLines={1}>{item.nameA}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{item.nameB}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={{ fontSize: 12 }}>💖</Text>
            <Text style={[styles.score, { color: '#BE185D' }]}>{fmtScore(item.score)}</Text>
          </View>
        </Pressable>
      );
    }
    const scoreColor = tab === 'gift' ? '#E11D48' : '#111';
    return (
      <Pressable style={styles.row} onPress={() => item.userId && navigation.navigate('CreatorProfile', { userId: item.userId, name: item.name })}>
        {item.rank <= 3 ? <RankMedal rank={item.rank} size={30} /> : <Text style={styles.rankN}>{item.rank}</Text>}
        <RankFrame uri={item.pic} name={item.name} rank={item.rank} size={item.rank <= 3 ? 48 : 36} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}  {flagFor(item.country || region)}</Text>
          <LevelBadge level={levelOf(item.score)} />
        </View>
        <View style={styles.scoreBox}>
          {tab === 'gift' ? <GiftMark /> : <GoldCoin size={14} />}
          <Text style={[styles.score, { color: scoreColor }]}>{fmtScore(item.score)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: skin.bg[0] }]}>
      {header}
      <ErrorBanner message={error} onRetry={load} />
      {loading && !rows.length ? (
        <Loading />
      ) : (
        <FlatList
          style={[styles.list, { backgroundColor: listBg, borderTopLeftRadius: tab === 'rich' || tab === 'gift' ? 22 : 0, borderTopRightRadius: tab === 'rich' || tab === 'gift' ? 22 : 0 }]}
          ListHeaderComponent={tab === 'host' || tab === 'game' || tab === 'cp' ? hostHeader : tab === 'video' ? videoHeader : <View style={{ height: 8 }} />}
          extraData={`${period}-${region}-${tab}`}
          data={listData}
          keyExtractor={(item, i) => String(item.postId || item.userId || i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
          ListEmptyComponent={
            rows.length ? null : (
              <Text style={[styles.hostEmpty, tab === 'video' && { color: 'rgba(255,255,255,0.8)' }]}>
                {tab === 'video'
                  ? 'No videos ranked yet. Post a clip to appear here.'
                  : tab === 'pk'
                    ? 'No PK combat scores yet. Win battles to climb the PK ranking.'
                    : 'No rankings yet'}
              </Text>
            )
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: tab === 'video' ? 88 : 28 }}
          ListFooterComponent={
            rows.length && tab !== 'video' && tab !== 'host' ? (
              <Text style={styles.gap}>
                Distance from rank is:  {tab === 'gift' ? '🎁' : '🪙'} {fmtScore(Math.max(0, (rows[0]?.score || 0) - (rows[1]?.score || 0)))}
              </Text>
            ) : null
          }
          renderItem={renderRow}
        />
      )}
      {tab === 'video' ? (
        <View style={[styles.goBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {myPic ? <Image source={{ uri: myPic }} style={styles.goAv} /> : <Avatar name={user?.first_name} size={32} />}
          <Text style={styles.goT}>Post now, trend now!</Text>
          <Pressable onPress={() => navigation.navigate('CreatePost')} style={styles.goBtn}>
            <Text style={styles.goBtnT}>Go Now</Text>
          </Pressable>
        </View>
      ) : null}
      <RegionPicker visible={regionOpen} value={region} onSelect={setRegion} onClose={() => setRegionOpen(false)} />
      <Modal visible={rewardsOpen} transparent animationType="fade" onRequestClose={() => setRewardsOpen(false)}>
        <Pressable style={styles.rewardBg} onPress={() => setRewardsOpen(false)}>
          <Pressable style={styles.rewardSheet} onPress={() => {}}>
            <Text style={styles.rewardTitle}>Video Rank Rewards</Text>
            <Text style={styles.rewardSub}>Top clips this {period} — tap a rank to watch that creator’s video</Text>
            {[1, 2, 3].map((rank) => {
              const item = rows[rank - 1];
              const prize = rank === 1 ? '50,000 coins + Legend Halo' : rank === 2 ? '20,000 coins + Royal Gold' : '8,000 coins + Diamond Orbit';
              return (
                <Pressable
                  key={rank}
                  style={styles.rewardRow}
                  onPress={() => {
                    setRewardsOpen(false);
                    if (!item) return;
                    if (item.postId) openReelViewer(navigation, { userId: item.userId, startId: item.postId, mediaType: 'video' });
                    else if (item.userId) navigation.navigate('CreatorProfile', { userId: item.userId, name: item.name });
                  }}
                >
                  <Avatar uri={item?.pic} name={item?.name || 'Open'} size={rank === 1 ? 44 : 36} />
                  {item?.thumb ? <Image source={{ uri: item.thumb }} style={styles.rewardThumb} /> : <View style={styles.rewardThumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rewardName}>#{rank}  {item?.name || 'Waiting for a clip'}</Text>
                    <Text style={styles.rewardPrize}>{prize}</Text>
                  </View>
                  <Ionicons name="play-circle" size={22} color="#FDE68A" />
                </Pressable>
              );
            })}
            <Pressable onPress={() => setRewardsOpen(false)} style={styles.rewardClose}>
              <Text style={styles.rewardCloseT}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 8, paddingBottom: 12 },
  heartBox: { position: 'absolute', right: -10, top: 8, opacity: 0.95 },
  heartBody: { width: 120, height: 88, borderRadius: 28, backgroundColor: '#FF6BB5' },
  heartBow: { width: 36, height: 22, borderRadius: 8, backgroundColor: '#fff', alignSelf: 'center', marginBottom: -8, zIndex: 2 },
  giftBg: { position: 'absolute', right: 16, top: 36, flexDirection: 'row' },
  topNav: { flexDirection: 'row', alignItems: 'center', zIndex: 2, minHeight: 44 },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mainTabsWrap: { flex: 1, minWidth: 0 },
  mainTabs: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 6, paddingVertical: 6, paddingRight: 20 },
  tabHit: { alignItems: 'center', flexShrink: 0, paddingHorizontal: 2, minHeight: 36, justifyContent: 'center' },
  mainTab: { color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 15, paddingBottom: 4 },
  mainTabOn: { color: '#fff', fontWeight: '800', fontSize: 16 },
  under: { height: 3, width: 22, backgroundColor: '#fff', borderRadius: 2 },
  pillRow: { gap: 8, paddingHorizontal: 6, paddingTop: 10, alignItems: 'center' },
  glassPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', flexShrink: 0 },
  glassPillOn: { borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.28)' },
  glassT: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 12 },
  glassTOn: { color: '#fff' },
  flagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  linkBanner: { marginHorizontal: 8, marginTop: 10, borderRadius: 12, padding: 12 },
  linkTitle: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  linkBody: { color: '#fff', fontWeight: '700', textAlign: 'center', marginTop: 4, fontSize: 13 },
  linkDates: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4, fontSize: 11 },
  ruleBar: { marginHorizontal: 24, marginTop: 8, backgroundColor: '#FF8A1F', borderRadius: 999, paddingVertical: 6, alignItems: 'center' },
  ruleT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  periodRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 10, flexWrap: 'wrap' },
  darkPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', flexShrink: 0 },
  darkPillOn: { borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.12)' },
  darkPillT: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 13 },
  darkPillTOn: { color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 10 },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  todayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rewardCard: { marginHorizontal: 10, marginTop: 10, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniPodiums: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  miniCol: { alignItems: 'center' },
  miniRibbon: { width: 28, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  goldRibbon: { backgroundColor: '#E8B84A' },
  pinkRibbon: { backgroundColor: '#EC4899' },
  blueRibbon: { backgroundColor: '#3B82F6' },
  miniRibbonT: { color: '#fff', fontWeight: '900' },
  miniPrize: { color: '#fff', fontSize: 9, fontWeight: '700', marginTop: 4, maxWidth: 64, textAlign: 'center' },
  miniThumb: { width: 36, height: 36, borderRadius: 8, marginTop: 4, backgroundColor: '#2A1520' },
  rewardsH: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'right' },
  detailsBtn: { marginTop: 6, backgroundColor: '#E11D74', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-end' },
  detailsT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  list: { flex: 1 },
  hostCard: { marginHorizontal: 12, marginTop: 10, borderRadius: 16, paddingBottom: 12, overflow: 'hidden' },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,140,0,0.95)', paddingHorizontal: 14, paddingVertical: 8 },
  ribbonT: { color: '#fff', fontWeight: '900', flex: 1 },
  ribbonDate: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hexRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingTop: 16, paddingBottom: 8, minHeight: 168 },
  hostEmpty: { textAlign: 'center', color: 'rgba(255,255,255,0.9)', fontWeight: '700', paddingVertical: 28, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', gap: 6 },
  rankN: { width: 28, textAlign: 'center', fontWeight: '800', fontSize: 18, color: '#9CA3AF' },
  name: { fontWeight: '800', color: '#111', fontSize: 14 },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score: { fontWeight: '800', fontSize: 13 },
  gap: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 14, fontSize: 12 },
  vidPodium: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  vidCard: { flex: 1, backgroundColor: '#2A1520', borderRadius: 12, overflow: 'hidden', paddingBottom: 8 },
  vidCard1: { height: 210, borderWidth: 1, borderColor: '#E8B84A' },
  vidCard2: { height: 186 },
  vidCard3: { height: 170 },
  topRibbon: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderBottomRightRadius: 8 },
  topRibbonT: { color: '#fff', fontWeight: '900', fontSize: 10 },
  vidThumb: { width: '100%', height: 92, backgroundColor: '#111' },
  playDot: { position: 'absolute', right: 8, top: 28, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playDotSm: { position: 'absolute', right: 4, top: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  vidMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, marginTop: 6 },
  vidName: { color: '#fff', fontWeight: '700', fontSize: 11, flex: 1 },
  vidStats: { paddingHorizontal: 6, marginTop: 4, gap: 2 },
  statPair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vidStat: { color: '#fff', fontWeight: '700', fontSize: 10 },
  vidRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  vidRank: { width: 22, color: 'rgba(255,255,255,0.45)', fontWeight: '800', fontSize: 18 },
  vidSq: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#2A1520' },
  vidCap: { color: '#fff', fontWeight: '700' },
  vidWho: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  vidWhoT: { color: 'rgba(255,255,255,0.75)', fontSize: 12, flex: 1 },
  goBar: { position: 'absolute', left: 12, right: 12, bottom: 0, backgroundColor: '#1A0812', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  goAv: { width: 32, height: 32, borderRadius: 16 },
  goT: { flex: 1, color: '#fff', fontWeight: '700' },
  goBtn: { backgroundColor: '#9D174D', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  goBtnT: { color: '#fff', fontWeight: '800' },
  rewardBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  rewardSheet: { backgroundColor: '#1A0812', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, overflow: 'hidden' },
  rewardTitle: { color: '#fff', fontWeight: '900', fontSize: 20, textAlign: 'center' },
  rewardSub: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 6, marginBottom: 14, fontSize: 12 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 10, marginBottom: 8 },
  rewardThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#2A1520' },
  rewardName: { color: '#fff', fontWeight: '800' },
  rewardPrize: { color: '#FDE68A', fontWeight: '700', marginTop: 3, fontSize: 12 },
  rewardClose: { marginTop: 8, backgroundColor: '#E11D74', borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  rewardCloseT: { color: '#fff', fontWeight: '800' },
});
