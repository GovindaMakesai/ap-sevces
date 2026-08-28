import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { mediaUrl } from '../../config/api';
import { Avatar, Loading } from '../../components/ui';
import AvatarFrame from '../../components/AvatarFrame';
import CoupleRing from '../../components/CoupleRing';
import ActionSheet from '../../components/ActionSheet';
import GiftSheet from '../../components/GiftSheet';
import GiftThumb from '../../components/GiftThumb';
import { resolveGiftAnim } from '../../config/giftAnims';
import { ProfileMediaSection } from '../../components/PostGrid';
import { formatUserDisplayId } from '../../lib/roles';
import { profileCacheGet, profileCacheSet } from '../../lib/perf';
import { shouldRefresh } from '../../lib/queryCache';

function genderLabel(g) {
  const v = String(g || '').toLowerCase();
  if (v === 'female' || v === 'f' || v === 'woman') return '♀';
  if (v === 'male' || v === 'm' || v === 'man') return '♂';
  return '';
}

function fmt(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

export default function CreatorProfileScreen({ route, navigation }) {
  const { userId, name: passedName } = route.params || {};
  const insets = useSafeAreaInsets();
  const { api, user } = useAuth();
  const mine = String(user?.id) === String(userId);
  const bootCache = userId ? profileCacheGet(userId) : null;
  const [panel, setPanel] = useState(bootCache?.panel || null);
  const [engagement, setEngagement] = useState(bootCache?.engagement || null);
  const [posts, setPosts] = useState(bootCache?.posts || []);
  const [following, setFollowing] = useState(Boolean(bootCache?.following));
  const [tab, setTab] = useState('data');
  const [showGifts, setShowGifts] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [gifts, setGifts] = useState([]);
  const [balance, setBalance] = useState(0);
  const [coverIdx, setCoverIdx] = useState(0);
  const lastFetch = useRef(0);

  const load = useCallback(async (opts = {}) => {
    if (!userId) return;
    const cached = profileCacheGet(userId);
    if (cached?.panel && !opts.force) {
      setPanel(cached.panel);
      setEngagement(cached.engagement || null);
      setFollowing(Boolean(cached.following));
      if (cached.posts) setPosts(cached.posts);
    }
    try {
      const [panelRes, engRes] = await Promise.all([
        api.get(`/social/creators/${userId}/profile-panel`, null, { auth: false, cacheTtlMs: 45000 }),
        api.get(`/social/creators/${userId}/engagement`, null, { auth: false, cacheTtlMs: 30000 }).catch(() => ({})),
      ]);
      const p = api.unwrap(panelRes);
      const e = api.unwrap(engRes);
      const fol = Boolean(e.isFollowing || e.following || e.is_following);
      setPanel(p);
      setEngagement(e);
      setFollowing(fol);
      profileCacheSet(userId, { panel: p, engagement: e, following: fol, posts: cached?.posts });
      lastFetch.current = Date.now();
    } catch (_e) {
      if (!cached?.panel) setPanel({ userId, displayName: passedName || 'Creator' });
    }
    Promise.all([
      api.get('/social/posts', { userId, mediaType: 'image', limit: 100 }, { auth: false, cacheTtlMs: 60000 }).catch(() => ({})),
      api.get('/social/posts', { userId, mediaType: 'video', limit: 100 }, { auth: false, cacheTtlMs: 60000 }).catch(() => ({})),
    ]).then(([imgRes, vidRes]) => {
      const byId = new Map();
      [...api.extractList(imgRes), ...api.extractList(vidRes)].forEach((p) => {
        if (p?.id != null) byId.set(String(p.id), p);
      });
      const merged = [...byId.values()].sort((a, b) => {
        const ta = new Date(a.created_at || a.createdAt || 0).getTime();
        const tb = new Date(b.created_at || b.createdAt || 0).getTime();
        return tb - ta;
      });
      setPosts(merged);
      const cur = profileCacheGet(userId) || {};
      profileCacheSet(userId, { ...cur, posts: merged });
    }).catch(() => {});
    api.get('/social/gifts/catalog', null, { auth: false, cacheTtlMs: 120000 }).then((r) => setGifts(api.extractList(r))).catch(() => {});
    if (mine) {
      api.get('/wallet/balance', null, { cacheTtlMs: 20000 }).then((r) => {
        const d = api.unwrap(r);
        setBalance(Number(d.giftable_coins || d.coin_balance || d.coins || 0));
      }).catch(() => {});
    }
    if (!mine) api.post(`/social/profile/${userId}/visit`).catch(() => {});
  }, [api, mine, passedName, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return undefined;
      const cached = profileCacheGet(userId);
      if (cached?.panel) {
        setPanel(cached.panel);
        setEngagement(cached.engagement || null);
        setFollowing(Boolean(cached.following));
        if (cached.posts) setPosts(cached.posts);
      }
      if (!shouldRefresh(lastFetch, 30000)) return undefined;
      load({ force: false });
      return undefined;
    }, [load, userId])
  );

  if (!panel) return <Loading />;

  const display = panel.displayName || engagement?.displayName || passedName || 'Creator';
  const pic = mediaUrl(panel.profilePic || engagement?.profilePic);
  const album = panel.album || [];
  const cover = mediaUrl(album[coverIdx]?.url || album[0]?.url || panel.profilePic);
  const displayId = formatUserDisplayId(engagement || panel) || panel.displayId || '—';
  const friends = panel.friendsCount || 0;
  const followingN = engagement?.following ?? panel.following ?? 0;
  const followersN = engagement?.followers ?? panel.followers ?? 0;
  const visitors = panel.visitorCount || 0;
  const giftTotal = panel.giftCount ?? engagement?.giftCount ?? 0;
  const postsN = (engagement?.postsCount || 0) + (engagement?.videosCount || 0) || posts.length;
  const stats = panel.giftStats || {};
  const recv = stats.received || { giftCount: 0, giftCoins: 0 };
  const sent = stats.sent || { giftCount: 0, giftCoins: 0 };
  const top = stats.topSenders || [];
  const wall = panel.giftWall || [];
  const badges = panel.badges || engagement?.badges || {};
  const isLive = Boolean(engagement?.isLive || engagement?.liveChannel);

  const toggle = async () => {
    try {
      if (following) await api.delete(`/social/follow/${userId}`);
      else await api.post(`/social/follow/${userId}`);
      setFollowing(!following);
    } catch (e) {
      Alert.alert('Follow failed', e.message);
    }
  };

  const message = async () => {
    try {
      const res = await api.post('/messages/conversations', { receiverId: userId });
      const c = res.data || res;
      navigation.navigate('ChatThread', { conversationId: c.id || c.conversationId, name: display, otherUserId: userId });
    } catch (e) {
      Alert.alert('Chat failed', e.message);
    }
  };

  const sendGift = async (gift, qty) => {
    try {
      const cost = Number(gift.coin_cost || gift.cost || 0) * qty;
      await api.post('/wallet/gifts', {
        receiverId: userId,
        giftType: gift.slug || gift.name || 'gift',
        coinAmount: cost,
        qty,
      });
      setShowGifts(false);
      load();
    } catch (e) {
      Alert.alert('Gift failed', e.message);
    }
  };

  const addCover = async () => {
    if ((album.length || 0) >= 6) {
      Alert.alert('Album full', 'Maximum 6 background photos');
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (pick.canceled) return;
    const asset = pick.assets[0];
    const form = new FormData();
    form.append('photo', { uri: asset.uri, name: 'cover.jpg', type: asset.mimeType || 'image/jpeg' });
    try {
      await api.post('/auth/profile/album', form);
      load();
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    }
  };

  const more = () => setShowMore(true);

  const joinLive = () => {
    const channel = engagement?.liveChannel;
    if (!channel) return;
    const party = engagement.liveRoomType === 'party';
    navigation.navigate(party ? 'PartyRoom' : 'LiveRoom', {
      channel,
      hostId: userId,
      hostName: display,
      isParty: party,
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView>
        <View style={styles.cover}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : (
            <LinearGradient colors={['#0d4f4a', '#061a1a']} style={StyleSheet.absoluteFill} />
          )}
          {album.length > 1 ? (
            <View style={styles.dots}>
              {album.map((_, i) => (
                <Pressable key={i} onPress={() => setCoverIdx(i)} style={[styles.dot, coverIdx === i && styles.dotOn]} />
              ))}
            </View>
          ) : null}
          <View style={[styles.coverBtns, { top: insets.top + 8 }]}>
            <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}><Text style={styles.iconT}>‹</Text></Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>{display}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!mine ? (
                <Pressable onPress={() => navigation.navigate('Store')} style={styles.iconBtn}><Text>🎁</Text></Pressable>
              ) : (
                <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.editPill}>
                  <Text style={styles.editT}>✎ {panel.profileCompletion != null ? `${panel.profileCompletion}%` : 'Edit'}</Text>
                </Pressable>
              )}
              <Pressable onPress={more} style={styles.iconBtn}><Text style={styles.iconT}>⋯</Text></Pressable>
            </View>
          </View>
          {mine ? (
            <Pressable onPress={addCover} style={styles.coverAdd}><Text style={{ color: '#fff', fontWeight: '800' }}>+</Text></Pressable>
          ) : null}
        </View>
        <View style={styles.avatarStage}>
          <AvatarFrame
            uri={pic}
            name={display}
            size={92}
            score={Number(engagement?.giftCoins || engagement?.coins || badges.svipLevel * 20000 || 25000)}
            rank={badges.svipLevel >= 10 ? 1 : badges.svipLevel >= 6 ? 2 : 3}
          />
        </View>
        <View style={styles.hero}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{display}</Text>
            {panel.isVerified || engagement?.isVerified ? <Text style={styles.verified}>✓</Text> : null}
          </View>
          <View style={styles.idRow}>
            {isLive ? <Text style={styles.liveDot}>● Live</Text> : null}
            <Text style={styles.id}>ID:<Text style={{ fontWeight: '800' }}>{displayId}</Text></Text>
            <Pressable onPress={() => Share.share({ message: String(displayId) })}>
              <Text style={styles.copy}>Copy</Text>
            </Pressable>
          </View>
          <View style={styles.metaRow}>
            {genderLabel(panel.gender) ? (
              <Text style={styles.pill}>{genderLabel(panel.gender)}{panel.age ? ` ${panel.age}` : ''}</Text>
            ) : null}
            {panel.role === 'agency' || engagement?.agencyName ? <Text style={styles.pill}>Agency</Text> : null}
            {panel.role === 'creator' || panel.role === 'host' ? <Text style={styles.pill}>Host</Text> : null}
            {panel.role === 'coin_seller' ? <Text style={styles.pill}>Seller</Text> : null}
            {badges.isSvip && badges.svipLevel > 0 ? <Text style={styles.medal}>SVIP {badges.svipLevel}</Text> : null}
            {(badges.personalLevel || panel.personalLevel) ? <Text style={styles.pill}>Lv.{badges.personalLevel || panel.personalLevel}</Text> : null}
            {badges.vipLevel ? <Text style={styles.pill}>VIP {badges.vipLevel}</Text> : null}
          </View>
          {!mine ? (
            <View style={styles.actions}>
              <Pressable onPress={toggle} style={[styles.follow, following && styles.followOn]}>
                <Text style={styles.followT}>{following ? 'Following' : 'Follow'}</Text>
              </Pressable>
              <Pressable onPress={message} style={styles.msg}>
                <Text style={styles.msgT}>💬 Message</Text>
              </Pressable>
            </View>
          ) : null}
          {isLive ? (
            <Pressable onPress={joinLive} style={styles.liveBanner}>
              <Text style={styles.liveBannerT}>● LIVE now · {fmt(engagement?.liveViewers)} watching — Tap to join</Text>
            </Pressable>
          ) : null}
          <View style={styles.stats}>
            <Stat n={friends} l="Friends" />
            <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'following', userId })}>
              <Stat n={followingN} l="Following" />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'followers', userId })}>
              <Stat n={followersN} l="Followers" />
            </Pressable>
            {mine ? (
              <Pressable onPress={() => navigation.navigate('Visitors')}>
                <Stat n={visitors} l="Visitor" />
              </Pressable>
            ) : (
              <Stat n={visitors} l="Visitor" />
            )}
          </View>
          <Pressable
            style={styles.supporters}
            onPress={() => navigation.navigate('Family', { userId, name: display })}
          >
            <Text style={styles.supI}>♥</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supT}>Fan Club</Text>
              <Text style={styles.supS}>Top fans, club tier & live activity</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <View style={styles.tabs}>
            {[
              ['data', 'Data'],
              ['relationship', 'Relationship'],
              ['gift', `Gift·${fmt(giftTotal)}`],
              ['posts', `Posts·${fmt(postsN)}`],
            ].map(([id, label]) => (
              <Pressable key={id} onPress={() => setTab(id)}>
                <Text style={[styles.tab, tab === id && styles.tabOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {tab === 'data' ? (
            <View style={styles.panel}>
              <Text style={styles.panelH}>Gift stats</Text>
              <Text style={styles.meta}>{stats.periodLabel || 'This month'}</Text>
              <View style={styles.dataRow}>
                <View style={styles.dataCard}>
                  <Text style={styles.meta}>Received</Text>
                  <Text style={styles.statN}>{fmt(recv.giftCount)} gifts</Text>
                  <Text style={styles.supS}>{fmt(recv.giftCoins)} coins</Text>
                </View>
                <View style={styles.dataCard}>
                  <Text style={styles.meta}>Sent</Text>
                  <Text style={styles.statN}>{fmt(sent.giftCount)} gifts</Text>
                  <Text style={styles.supS}>{fmt(sent.giftCoins)} coins</Text>
                </View>
              </View>
              <Text style={styles.panelH}>Top supporters this month</Text>
              {!top.length ? <Text style={styles.body}>No gifts received this month yet.</Text> : null}
              {top.map((s) => (
                <Pressable
                  key={s.userId}
                  style={styles.sender}
                  onPress={() => navigation.navigate('CreatorProfile', { userId: s.userId, name: s.displayName })}
                >
                  <Text style={styles.rowRank}>#{s.rank}</Text>
                  <Avatar uri={mediaUrl(s.profilePic)} name={s.displayName} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.senderN}>{s.displayName}</Text>
                    <Text style={styles.supS}>{fmt(s.giftCount)} gifts · {fmt(s.giftCoins)} coins</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tab === 'relationship' ? (
            <View style={styles.panel}>
              {panel.cp?.hasCp ? (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar uri={pic} name={display} size={56} />
                    <CoupleRing ringId={panel.cp.ringId} ring={panel.cp.ring} size={48} />
                    <Avatar uri={mediaUrl(panel.cp.partnerPic)} name={panel.cp.partnerName || 'Partner'} size={56} />
                  </View>
                  <Text style={styles.body}>
                    {display}  ×  {panel.cp.partnerName || 'Partner'}
                  </Text>
                  <Text style={styles.meta}>
                    CP Lv.{panel.cp.cpLevel} · Together {panel.cp.daysTogether || 0} days
                  </Text>
                </View>
              ) : (
                <Text style={styles.body}>{mine ? 'No CP partner yet.' : 'No CP couple yet.'}</Text>
              )}
              {mine ? (
                <Pressable onPress={() => navigation.navigate('Cp')} style={styles.giftCta}>
                  <Text style={styles.giftCtaT}>❤ Open CP House</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {tab === 'gift' ? (
            <View style={styles.panel}>
              <Text style={styles.panelH}>Gift collection</Text>
              <Text style={styles.meta}>{fmt(giftTotal)} received</Text>
              {!wall.length ? <Text style={styles.body}>No gifts received yet.</Text> : (
                <View style={styles.giftGrid}>
                  {wall.map((item, i) => {
                    const gift = resolveGiftAnim({
                      slug: item.giftType || item.slug || item.giftSlug,
                      name: item.name || item.giftName,
                      thumbnailUrl: item.thumbnailUrl || item.icon,
                      emoji: item.emoji,
                    }) || item;
                    return (
                      <View key={String(item.giftType || item.slug || i)} style={styles.giftCell}>
                        <GiftThumb gift={{ ...item, ...gift }} size={44} delay={(i % 6) * 80} />
                        <Text style={styles.giftName} numberOfLines={1}>{gift.title || gift.name || item.giftType || 'Gift'}</Text>
                        <Text style={styles.giftQty}>×{fmt(item.count)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {!mine ? (
                <Pressable onPress={() => setShowGifts(true)} style={styles.giftCta}>
                  <Text style={styles.giftCtaT}>Send a gift</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {tab === 'posts' ? (
            <View style={styles.mediaPanel}>
              <ProfileMediaSection posts={posts} navigation={navigation} userId={userId} dark initialTab="posts" />
            </View>
          ) : null}
          {mine ? (
            <>
              <Text style={styles.mood}>What's your mood now? 🫘</Text>
              <Pressable onPress={() => navigation.navigate('CreatePost')} style={styles.share}>
                <Text style={styles.shareT}>✈ Share a Post</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
      <ActionSheet
        visible={showMore}
        title={display}
        subtitle="Profile actions"
        onClose={() => setShowMore(false)}
        options={[
          { label: 'Share profile', onPress: () => Share.share({ message: `See ${display} on AP Live Service` }) },
          { label: 'Send gift', onPress: () => setShowGifts(true) },
          !mine && {
            label: 'Report',
            onPress: () => api.post('/social/report', { userId, reason: 'profile' }).then(() => Alert.alert('Reported')).catch((e) => Alert.alert('Report failed', e.message)),
          },
          !mine && {
            label: 'Block',
            destructive: true,
            onPress: () =>
              Alert.alert('Block user', `Block ${display}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: () => api.post(`/social/block/${userId}`).then(() => navigation.goBack()).catch((e) => Alert.alert('Block failed', e.message)),
                },
              ]),
          },
        ]}
      />
      <GiftSheet visible={showGifts} gifts={gifts} balance={balance} onClose={() => setShowGifts(false)} onSend={sendGift} onRecharge={() => { setShowGifts(false); navigation.navigate('Recharge'); }} />
    </View>
  );
}

function Stat({ n, l }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{fmt(n)}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.profileBg },
  cover: { height: 220, backgroundColor: colors.profileCover },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#fff' },
  coverBtns: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, color: '#fff', fontWeight: '800', marginHorizontal: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  iconT: { color: '#fff', fontSize: 22, fontWeight: '700' },
  editPill: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center' },
  editT: { color: '#fff', fontWeight: '700' },
  coverAdd: { position: 'absolute', right: 12, bottom: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarStage: { marginTop: -52, alignItems: 'center', zIndex: 4 },
  av: { borderWidth: 3, borderColor: colors.profileTeal },
  hero: { padding: 16, paddingTop: 8 },
  nameRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  name: { color: colors.profileText, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  verified: { color: '#38bdf8', fontSize: 18, fontWeight: '800' },
  idRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6, alignItems: 'center' },
  liveDot: { color: '#f87171', fontWeight: '800' },
  id: { color: 'rgba(248,250,252,0.55)' },
  copy: { color: colors.profileTeal, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  pill: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  medal: { color: '#fbbf24', fontWeight: '800', backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  follow: { flex: 1, backgroundColor: colors.profileFollow, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  followOn: { backgroundColor: 'rgba(255,77,157,0.45)' },
  followT: { color: '#fff', fontWeight: '800' },
  msg: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  msgT: { color: '#fff', fontWeight: '700' },
  liveBanner: { marginTop: 12, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12 },
  liveBannerT: { color: '#fecaca', fontWeight: '700', textAlign: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18 },
  stat: { alignItems: 'center' },
  statN: { color: '#fff', fontWeight: '800', fontSize: 18 },
  statL: { color: 'rgba(248,250,252,0.55)', fontSize: 12, marginTop: 2 },
  supporters: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14 },
  supI: { fontSize: 22 },
  supT: { color: '#fff', fontWeight: '800' },
  supS: { color: 'rgba(248,250,252,0.55)', fontSize: 12 },
  chev: { color: '#fff', fontSize: 22 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 8 },
  tab: { color: 'rgba(248,250,252,0.55)', fontWeight: '700' },
  tabOn: { color: '#fbbf24' },
  panel: { marginTop: 14 },
  mediaPanel: { marginTop: 8, marginHorizontal: -16 },
  panelH: { color: '#fff', fontWeight: '800', marginBottom: 8, marginTop: 8 },
  body: { color: 'rgba(248,250,252,0.7)', marginTop: 8, textAlign: 'center' },
  meta: { color: 'rgba(248,250,252,0.55)', fontSize: 12 },
  dataRow: { flexDirection: 'row', gap: 10 },
  dataCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 },
  sender: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  senderN: { color: '#fff', fontWeight: '700' },
  rowRank: { width: 28, color: '#fbbf24', fontWeight: '800' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  giftName: { color: 'rgba(248,250,252,0.8)', fontSize: 10, fontWeight: '700', marginTop: 6, textAlign: 'center', maxWidth: 72 },
  giftQty: { color: '#fbbf24', fontWeight: '800', fontSize: 11, marginTop: 2 },
  giftCta: { marginTop: 16, backgroundColor: '#f59e0b', borderRadius: 999, padding: 14, alignItems: 'center' },
  giftCtaT: { color: '#fff', fontWeight: '800' },
  postCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, marginBottom: 8 },
  postImg: { width: '100%', height: 160, borderRadius: 10, marginBottom: 8 },
  mood: { color: 'rgba(248,250,252,0.7)', textAlign: 'center', marginTop: 20 },
  share: { marginTop: 12, alignItems: 'center', marginBottom: 24 },
  shareT: { color: colors.profileTeal, fontWeight: '700' },
});
