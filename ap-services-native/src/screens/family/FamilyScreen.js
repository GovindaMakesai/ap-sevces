import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner, Loading } from '../../components/ui';
import SoftImage from '../../components/SoftImage';
import { FadeIn, PressScale } from '../../components/motion';
import { Equalizer } from '../../components/alive';
import { indianGroup } from '../../lib/format.js';

const PERIODS = [
  { id: 'daily', label: 'Today' },
  { id: 'weekly', label: 'Week' },
  { id: 'monthly', label: 'Month' },
];

const TIERS = [
  { id: 'rising', label: 'Rising', min: 0, next: 10000, colors: ['#3F3F46', '#27272A'], accent: '#A1A1AA' },
  { id: 'bronze', label: 'Bronze', min: 10000, next: 50000, colors: ['#7C4A1A', '#3F230D'], accent: '#D97706' },
  { id: 'silver', label: 'Silver', min: 50000, next: 200000, colors: ['#64748B', '#334155'], accent: '#CBD5E1' },
  { id: 'gold', label: 'Gold', min: 200000, next: 800000, colors: ['#B45309', '#78350F'], accent: '#FBBF24' },
  { id: 'platinum', label: 'Platinum', min: 800000, next: 2500000, colors: ['#3F3F46', '#18181B'], accent: '#E4E4E7' },
  { id: 'diamond', label: 'Diamond', min: 2500000, next: 10000000, colors: ['#0E7490', '#164E63'], accent: '#67E8F9' },
];

function tierFor(score) {
  const n = Number(score || 0);
  let t = TIERS[0];
  for (const row of TIERS) {
    if (n >= row.min) t = row;
  }
  return t;
}

function fmtCompact(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return indianGroup(v);
}

function timeAgo(raw) {
  if (!raw) return '';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function LivePulse() {
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, { opacity: o }]} />
      <Text style={styles.livePillT}>LIVE</Text>
    </View>
  );
}

function ProgressFill({ pct }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.max(0.04, Math.min(1, pct || 0)),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, w]);
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width }]} />
    </View>
  );
}

function FanRow({ rank, name, pic, coins, gifts, onPress, highlight }) {
  return (
    <PressScale onPress={onPress} style={[styles.fanRow, highlight && styles.fanRowHi]} scaleTo={0.98}>
      <Text style={[styles.fanRank, rank <= 3 && styles.fanRankTop]}>{rank}</Text>
      <View style={styles.fanAvWrap}>
        {rank <= 3 ? <View style={[styles.fanRing, rank === 1 && styles.fanRing1, rank === 2 && styles.fanRing2, rank === 3 && styles.fanRing3]} /> : null}
        <Avatar uri={mediaUrl(pic)} name={name} size={44} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.fanName} numberOfLines={1}>{name}</Text>
        <Text style={styles.fanMeta}>{fmtCompact(gifts || 0)} gifts</Text>
      </View>
      <View style={styles.coinBox}>
        <Ionicons name="diamond" size={12} color="#FBBF24" />
        <Text style={styles.coinT}>{fmtCompact(coins)}</Text>
      </View>
    </PressScale>
  );
}

export default function FamilyScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const targetId = String(route?.params?.userId || user?.id || '');
  const mine = Boolean(user?.id) && String(user.id) === targetId;

  const [period, setPeriod] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [top, setTop] = useState([]);
  const [recent, setRecent] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!targetId) return;
    setError('');
    setLoading(true);
    try {
      const [panelRes, engRes, supRes, liveRes] = await Promise.all([
        api.get(`/social/creators/${targetId}/profile-panel`, null, { auth: false }).catch(() => ({})),
        api.get(`/social/creators/${targetId}/engagement`, null, { auth: false }).catch(() => ({})),
        api.get(`/social/creators/${targetId}/supporters`, { period, limit: 20 }, { auth: false }).catch(() => ({})),
        api.get('/live/rooms', { limit: 12 }, { auth: false }).catch(() => ({})),
      ]);
      const panel = api.unwrap(panelRes) || {};
      const eng = api.unwrap(engRes) || {};
      const sup = api.unwrap(supRes) || {};
      setProfile(panel.user || panel.creator || panel || {});
      setEngagement(eng);
      setFollowing(Boolean(eng.following || eng.isFollowing || panel.following));
      setTop(Array.isArray(sup.top) ? sup.top : api.extractList(supRes));
      setRecent(Array.isArray(sup.recent) ? sup.recent : []);
      const liveList = api.extractList(liveRes)
        .map((r) => ({
          channel: r.channel,
          hostId: r.hostId || r.host_user_id,
          hostName: r.hostName || r.host_display_name || r.name,
          hostProfilePic: r.hostProfilePic || r.host_profile_pic || r.profile_pic,
          hostStreamCover: r.hostStreamCover || r.stream_cover_url || r.cover,
          viewers: Number(r.viewers || r.viewer_count || 0),
          isParty: r.room_type === 'party' || r.type === 'party' || r.isParty,
          room_type: r.room_type || r.type,
        }))
        .filter((r) => r.channel);
      const ownLive = liveList.filter((r) => String(r.hostId) === targetId);
      setRooms((ownLive.length ? ownLive : liveList).slice(0, 4));
    } catch (e) {
      setError(e.message || 'Could not load fan club');
    } finally {
      setLoading(false);
    }
  }, [api, period, targetId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const clubName = useMemo(() => {
    const n =
      profile?.display_name ||
      profile?.first_name ||
      route?.params?.name ||
      (mine ? displayName : 'Creator');
    return `${String(n || 'Creator').trim()}'s Fan Club`;
  }, [displayName, mine, profile, route?.params?.name]);

  const pic = mediaUrl(profile?.profile_pic || profile?.profilePic || user?.profile_pic);
  const fanCount = Number(engagement?.followers ?? profile?.followers ?? top.length ?? 0);
  const giftCoins = top.reduce((s, r) => s + Number(r.coins || r.giftCoins || 0), 0);
  const giftCount = top.reduce((s, r) => s + Number(r.giftCount || r.gifts || 0), 0);
  const tier = tierFor(giftCoins);
  const progress = Math.min(1, Math.max(0, (giftCoins - tier.min) / Math.max(1, tier.next - tier.min)));
  const cover = mediaUrl(rooms[0]?.hostStreamCover || pic);

  const toggleFollow = async () => {
    if (!targetId || mine || followBusy) return;
    setFollowBusy(true);
    try {
      if (following) await api.delete(`/social/follow/${targetId}`);
      else await api.post(`/social/follow/${targetId}`);
      setFollowing((v) => !v);
    } catch (_e) {
      /* keep prior */
    } finally {
      setFollowBusy(false);
    }
  };

  const openUser = (row) => {
    const id = row?.userId || row?.user_id || row?.sender_id || row?.id;
    if (!id) return;
    navigation.navigate('CreatorProfile', {
      userId: String(id),
      name: row.displayName || row.name || row.senderName || 'User',
    });
  };

  const openRoom = (r) => {
    if (!r?.channel) return;
    navigation.navigate(r.isParty || r.room_type === 'party' ? 'PartyRoom' : 'LiveRoom', {
      ...r,
      isParty: r.isParty || r.room_type === 'party',
    });
  };

  const podium = [top[1], top[0], top[2]];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <Pressable onPress={() => navigation.goBack()} style={styles.navBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#F4F4F5" />
        </Pressable>
        <Text style={styles.navTitle}>Fan Club</Text>
        <Pressable
          onPress={() => navigation.navigate('Supporters', { userId: targetId, name: clubName })}
          style={styles.navBtn}
          hitSlop={8}
        >
          <Ionicons name="trophy-outline" size={20} color="#F4F4F5" />
        </Pressable>
      </View>

      {loading && !top.length && !profile ? (
        <Loading />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#F43F5E" />}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 88 }}
          showsVerticalScrollIndicator={false}
        >
          <ErrorBanner message={error} onRetry={load} />

          <FadeIn style={styles.heroWrap} from={14}>
            <View style={styles.heroMedia}>
              {cover ? <SoftImage uri={cover} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1C1917' }]} />}
              <LinearGradient colors={['rgba(11,11,16,0.15)', 'rgba(11,11,16,0.92)', '#0B0B10']} style={StyleSheet.absoluteFill} />
            </View>
            <View style={styles.heroBody}>
              <View style={styles.heroAv}>
                <Avatar uri={pic} name={clubName} size={72} />
              </View>
              <Text style={styles.heroName}>{clubName}</Text>
              <Text style={styles.heroId}>ID {profile?.display_id || user?.display_id || String(targetId).slice(0, 8)}</Text>
              <View style={styles.statStrip}>
                <View style={styles.statCell}>
                  <Text style={styles.statN}>{fmtCompact(fanCount)}</Text>
                  <Text style={styles.statL}>Fans</Text>
                </View>
                <View style={styles.statDiv} />
                <View style={styles.statCell}>
                  <Text style={styles.statN}>{fmtCompact(giftCoins)}</Text>
                  <Text style={styles.statL}>Club coins</Text>
                </View>
                <View style={styles.statDiv} />
                <View style={styles.statCell}>
                  <Text style={styles.statN}>{fmtCompact(giftCount)}</Text>
                  <Text style={styles.statL}>Gifts</Text>
                </View>
              </View>
              {!mine ? (
                <PressScale onPress={toggleFollow} style={styles.joinBtn} scaleTo={0.97}>
                  <LinearGradient colors={following ? ['#27272A', '#18181B'] : ['#E11D48', '#BE123C']} style={styles.joinGrad}>
                    <Ionicons name={following ? 'checkmark' : 'heart'} size={16} color="#fff" />
                    <Text style={styles.joinT}>{followBusy ? '…' : following ? 'Joined' : 'Join Fan Club'}</Text>
                  </LinearGradient>
                </PressScale>
              ) : (
                <PressScale onPress={() => navigation.navigate('GoLive', { isParty: false })} style={styles.joinBtn} scaleTo={0.97}>
                  <LinearGradient colors={['#E11D48', '#9F1239']} style={styles.joinGrad}>
                    <Ionicons name="radio" size={16} color="#fff" />
                    <Text style={styles.joinT}>Go live for your fans</Text>
                  </LinearGradient>
                </PressScale>
              )}
            </View>
          </FadeIn>

          <FadeIn delay={80} style={styles.tierCard} from={12}>
            <LinearGradient colors={tier.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tierGrad}>
              <View style={styles.tierTop}>
                <View>
                  <Text style={styles.tierK}>CLUB TIER</Text>
                  <Text style={[styles.tierName, { color: tier.accent }]}>{tier.label}</Text>
                </View>
                <Ionicons name="shield-checkmark" size={36} color={tier.accent} />
              </View>
              <Text style={styles.tierProg}>
                {fmtCompact(giftCoins)} / {fmtCompact(tier.next)}
              </Text>
              <ProgressFill pct={progress} />
              <Text style={styles.tierHint}>
                Next: {TIERS[Math.min(TIERS.length - 1, TIERS.findIndex((t) => t.id === tier.id) + 1)]?.label || tier.label}
                {' · '}Based on gifts this {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
              </Text>
            </LinearGradient>
          </FadeIn>

          <View style={styles.periodRow}>
            {PERIODS.map((p) => {
              const on = period === p.id;
              return (
                <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={[styles.periodChip, on && styles.periodChipOn]}>
                  <Text style={[styles.periodT, on && styles.periodTOn]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Top fans</Text>
            <Pressable onPress={() => navigation.navigate('Supporters', { userId: targetId })}>
              <Text style={styles.secLink}>Full ranking</Text>
            </Pressable>
          </View>

          {top.length ? (
            <FadeIn delay={120} style={styles.podium} from={10}>
              {podium.map((row, i) => {
                const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                if (!row) return <View key={`empty-${rank}`} style={styles.podSlot} />;
                const name = row.displayName || row.name || 'Fan';
                const size = rank === 1 ? 64 : 48;
                return (
                  <Pressable key={row.userId || rank} style={[styles.podSlot, rank === 1 && styles.podSlot1]} onPress={() => openUser(row)}>
                    <Text style={[styles.podRank, rank === 1 && styles.podRank1]}>#{rank}</Text>
                    <View style={[styles.podAv, rank === 1 && styles.podAv1, rank === 2 && styles.podAv2, rank === 3 && styles.podAv3]}>
                      <Avatar uri={mediaUrl(row.profilePic || row.profile_pic)} name={name} size={size} />
                    </View>
                    <Text style={styles.podName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.podCoins}>{fmtCompact(row.coins || row.giftCoins || 0)}</Text>
                  </Pressable>
                );
              })}
            </FadeIn>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={28} color="#52525B" />
              <Text style={styles.emptyT}>No fan gifts in this period yet</Text>
              <Text style={styles.emptyS}>When supporters send gifts, they climb the club board.</Text>
            </View>
          )}

          {top.length > 3 ? (
            <View style={{ marginTop: 8 }}>
              {top.slice(3).map((row, i) => (
                <FanRow
                  key={row.userId || i}
                  rank={row.rank || i + 4}
                  name={row.displayName || row.name || 'Fan'}
                  pic={row.profilePic || row.profile_pic}
                  coins={row.coins || row.giftCoins || 0}
                  gifts={row.giftCount}
                  onPress={() => openUser(row)}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Live now</Text>
            <Pressable onPress={() => navigation.navigate('Main', { screen: 'Explore' })}>
              <Text style={styles.secLink}>Discover</Text>
            </Pressable>
          </View>
          {rooms.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRail}>
              {rooms.map((r) => (
                <PressScale key={r.channel} onPress={() => openRoom(r)} style={styles.liveCard} scaleTo={0.97}>
                  {mediaUrl(r.hostStreamCover || r.hostProfilePic) ? (
                    <SoftImage uri={mediaUrl(r.hostStreamCover || r.hostProfilePic)} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F1F23' }]} />
                  )}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.liveShade} />
                  <View style={styles.liveTop}>
                    <LivePulse />
                    <View style={styles.viewerChip}>
                      <Equalizer size={10} color="#fff" animated={false} />
                      <Text style={styles.viewerT}>{fmtCompact(r.viewers)}</Text>
                    </View>
                  </View>
                  <Text style={styles.liveName} numberOfLines={1}>{r.hostName || 'Host'}</Text>
                </PressScale>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="radio-outline" size={26} color="#52525B" />
              <Text style={styles.emptyT}>No live rooms right now</Text>
            </View>
          )}

          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Recent activity</Text>
          </View>
          {(recent || []).length ? (
            recent.slice(0, 12).map((g, i) => {
              const name = g.displayName || g.senderName || g.name || 'Fan';
              return (
                <Pressable key={String(g.id || i)} style={styles.actRow} onPress={() => openUser(g)}>
                  <Avatar uri={mediaUrl(g.profilePic || g.profile_pic || g.image)} name={name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.actName} numberOfLines={1}>
                      <Text style={{ fontWeight: '800' }}>{name}</Text>
                      {' sent '}
                      {g.giftName || g.gift_type || 'a gift'}
                    </Text>
                    <Text style={styles.actMeta}>{timeAgo(g.createdAt || g.created_at)}</Text>
                  </View>
                  <Text style={styles.actCoins}>+{fmtCompact(g.coin_amount || g.coins || 0)}</Text>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyS}>Gift activity will appear here in real time.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <PressScale
          onPress={() => (mine ? navigation.navigate('StreamerCenter') : navigation.navigate('Store'))}
          style={{ flex: 1 }}
          scaleTo={0.97}
        >
          <LinearGradient colors={['#27272A', '#18181B']} style={styles.bottomBtn}>
            <Ionicons name={mine ? 'list' : 'gift-outline'} size={18} color="#F4F4F5" />
            <Text style={styles.bottomBtnT}>{mine ? 'Host tasks' : 'Send gift'}</Text>
          </LinearGradient>
        </PressScale>
        <PressScale
          onPress={() => navigation.navigate('ChatList')}
          style={{ flex: 1 }}
          scaleTo={0.97}
        >
          <LinearGradient colors={['#E11D48', '#BE123C']} style={styles.bottomBtn}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.bottomBtnT}>Message</Text>
          </LinearGradient>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B10' },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6, zIndex: 2 },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', color: '#FAFAFA', fontWeight: '800', fontSize: 17 },
  heroWrap: { marginBottom: 8 },
  heroMedia: { height: 168, marginHorizontal: 0, overflow: 'hidden' },
  heroBody: { marginTop: -56, alignItems: 'center', paddingHorizontal: 16 },
  heroAv: {
    padding: 3,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: '#E11D48',
    backgroundColor: '#0B0B10',
  },
  heroName: { color: '#FAFAFA', fontWeight: '800', fontSize: 20, marginTop: 10, textAlign: 'center' },
  heroId: { color: '#A1A1AA', fontSize: 12, marginTop: 4, fontWeight: '600' },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    width: '100%',
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },
  statN: { color: '#FAFAFA', fontWeight: '800', fontSize: 16 },
  statL: { color: '#71717A', fontSize: 11, marginTop: 2, fontWeight: '600' },
  joinBtn: { width: '100%', marginTop: 14 },
  joinGrad: {
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  joinT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  tierCard: { marginHorizontal: 14, marginTop: 8, borderRadius: 16, overflow: 'hidden' },
  tierGrad: { padding: 16 },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierK: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  tierName: { fontWeight: '900', fontSize: 24, marginTop: 2 },
  tierProg: { color: '#fff', fontWeight: '700', marginTop: 14, fontSize: 13 },
  barTrack: { height: 6, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#F43F5E', borderRadius: 999 },
  tierHint: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 8, fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginTop: 16 },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  periodChipOn: { backgroundColor: 'rgba(225,29,72,0.18)', borderColor: '#E11D48' },
  periodT: { color: '#A1A1AA', fontWeight: '700', fontSize: 13 },
  periodTOn: { color: '#FDA4AF' },
  secHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
  secTitle: { color: '#FAFAFA', fontWeight: '800', fontSize: 16 },
  secLink: { color: '#A1A1AA', fontWeight: '700', fontSize: 12 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 10, minHeight: 150 },
  podSlot: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  podSlot1: { marginBottom: 10 },
  podRank: { color: '#A1A1AA', fontWeight: '800', marginBottom: 6 },
  podRank1: { color: '#FBBF24' },
  podAv: { borderRadius: 999, padding: 2, borderWidth: 2, borderColor: '#3F3F46' },
  podAv1: { borderColor: '#FBBF24' },
  podAv2: { borderColor: '#94A3B8' },
  podAv3: { borderColor: '#B45309' },
  podName: { color: '#E4E4E7', fontWeight: '700', fontSize: 12, marginTop: 8, maxWidth: 96, textAlign: 'center' },
  podCoins: { color: '#FBBF24', fontWeight: '800', fontSize: 11, marginTop: 2 },
  fanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  fanRowHi: { borderColor: 'rgba(251,191,36,0.35)' },
  fanRank: { width: 22, color: '#71717A', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  fanRankTop: { color: '#FBBF24' },
  fanAvWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fanRing: { ...StyleSheet.absoluteFillObject, borderRadius: 24, borderWidth: 1.5 },
  fanRing1: { borderColor: '#FBBF24' },
  fanRing2: { borderColor: '#94A3B8' },
  fanRing3: { borderColor: '#B45309' },
  fanName: { color: '#FAFAFA', fontWeight: '700', fontSize: 14 },
  fanMeta: { color: '#71717A', fontSize: 11, marginTop: 2, fontWeight: '600' },
  coinBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinT: { color: '#FDE68A', fontWeight: '800', fontSize: 13 },
  liveRail: { paddingHorizontal: 12, gap: 10 },
  liveCard: {
    width: 148,
    height: 196,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#18181B',
  },
  liveShade: { ...StyleSheet.absoluteFillObject },
  liveTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E11D48',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  livePillT: { color: '#fff', fontWeight: '900', fontSize: 10 },
  viewerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  viewerT: { color: '#fff', fontWeight: '700', fontSize: 10 },
  liveName: { position: 'absolute', left: 10, right: 10, bottom: 10, color: '#fff', fontWeight: '800', fontSize: 13 },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  actName: { color: '#D4D4D8', fontSize: 13, lineHeight: 18 },
  actMeta: { color: '#71717A', fontSize: 11, marginTop: 2 },
  actCoins: { color: '#F43F5E', fontWeight: '800', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, gap: 6 },
  emptyT: { color: '#A1A1AA', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  emptyS: { color: '#52525B', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: 'rgba(11,11,16,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomBtnT: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
