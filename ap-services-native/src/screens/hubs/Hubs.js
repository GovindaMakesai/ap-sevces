import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { mediaUrl } from '../../config/api';
import { walletPoints, normalizeWalletBalance } from '../../lib/walletFields';
import { indianGroup } from '../../lib/format';
import { Card, EmptyState, ErrorBanner, GoldButton, Kv, Loading, OutlineButton } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import LuckyGiftBoard from '../../components/LuckyGiftBoard';
import { openReelViewer } from '../../components/PostGrid';

function useApiLoad(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      setData(await loader());
    } catch (e) {
      setError(e.message);
      setData((prev) => prev ?? {});
    } finally {
      setLoading(false);
    }
  }, deps);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { data, error, loading, load, setData };
}

export { CoinSellerScreen } from '../seller/CoinSellerCenter';
export { default as HostPoliciesScreen } from '../profile/HostPoliciesScreen';
export { default as AgencyCenterScreen, InviteHostScreen, InviteAgencyScreen } from '../agency/AgencyCenterScreen';
export { BdCenterScreen, HierarchyScreen, HostAgencyScreen } from '../bd/BdHub';

export function PointsScreen({ navigation }) {
  const { api } = useAuth();
  const { data, error, loading, load } = useApiLoad(async () => {
    const [balRes, wdRes] = await Promise.all([
      api.get('/wallet/balance', null, { skipCache: true }),
      api.get('/wallet/withdrawals', null, { skipCache: true }).catch(() => ({})),
    ]);
    const bal = normalizeWalletBalance(api.unwrap(balRes));
    const withdrawals = api.extractList(wdRes);
    const unconfirmed = withdrawals.filter((w) => w.status === 'paid').length;
    return { ...bal, unconfirmed };
  }, [api]);
  const pts = walletPoints(data || {});
  if (loading && !data) return <CreamPage title="Points" navigation={navigation}><Loading /></CreamPage>;
  return (
    <CreamPage title="Points" navigation={navigation}>
    <ScrollView style={styles.root} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <ErrorBanner message={error} onRetry={load} />
      <Card>
        <Text style={styles.big}>{indianGroup(pts)}</Text>
        <Text style={styles.meta}>Available points</Text>
        <Kv k="Total" v={indianGroup(pts)} />
        <Kv k="Unconfirmed" v={String(data?.unconfirmed ?? 0)} />
      </Card>
      <Card>
        <Text style={styles.h}>Income</Text>
        <Text style={styles.body}>Creator share: 90% · Platform share: 10% on gifts, bookings & live earnings</Text>
        <Kv k="Livestream" v={data?.live_points != null ? indianGroup(data.live_points) : '—'} />
        <Kv k="Gifts" v={data?.gift_points != null ? indianGroup(data.gift_points) : '—'} />
        <Kv k="Bookings" v={data?.booking_points != null ? indianGroup(data.booking_points) : '—'} />
      </Card>
      <Text style={styles.flowHelp}>
        How to withdraw or exchange:{'\n'}
        1. Tap Withdraw / Exchange below{'\n'}
        2. Choose Cash withdraw or Exchange to coins{'\n'}
        3. Enter amount · for cash upload QR · submit
      </Text>
      <GoldButton title="Withdraw / Exchange" onPress={() => navigation.navigate('Withdraw')} style={{ margin: 12 }} />
      <GoldButton title="Top up coins" onPress={() => navigation.navigate('Recharge')} style={{ marginHorizontal: 12 }} />
      <OutlineButton title="History" onPress={() => navigation.navigate('WalletHistory')} style={{ marginHorizontal: 12, marginTop: 8 }} />
    </ScrollView>
    </CreamPage>
  );
}

export { default as BecomeProScreen } from '../services/ProviderOnboardingScreen';
export { default as ServicesScreen } from '../services/ServicesHomeScreen';
export { default as ServiceDetailsScreen } from '../services/ServiceDetailsScreen';
export { default as WorkerDashboardScreen } from '../services/ServicesCenterScreen';

export function PrivilegesScreen({ navigation }) {
  return (
    <CreamPage title="Privileges" navigation={navigation}>
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>Privileges</Text>
        <Text style={styles.body}>VIP, CP, host, agency, and seller privileges unlock extra rooms, gifts, rankings, and earning tools.</Text>
        <Kv k="VIP" v="Entry effects, badge, exclusive gifts" />
        <Kv k="Host" v="Go live, party rooms, streamer center" />
        <Kv k="Agency" v="Invite hosts, commission, applications" />
        <Kv k="Coin seller" v="Transfer gift coins to users" />
        <Kv k="BD" v="Promo codes, agency network, hierarchy" />
      </Card>
    </ScrollView>
    </CreamPage>
  );
}

export function LuckyGiftsScreen({ navigation }) {
  const { api } = useAuth();
  return <LuckyGiftBoard visible api={api} onClose={() => navigation.goBack()} />;
}

function postMedia(item) {
  const media = item.media || item.files || item.attachments || item.images || [];
  const first = Array.isArray(media) ? media[0] : media;
  return mediaUrl(
    item.thumbnail_url ||
      item.thumb_url ||
      item.cover_url ||
      item.image_url ||
      item.photo_url ||
      item.media_url ||
      item.mediaUrl ||
      item.video_url ||
      first?.thumbnail_url ||
      first?.url ||
      first?.media_url ||
      item.photo
  );
}

export function SquareScreen({ navigation }) {
  const { api } = useAuth();
  const { data, loading, load } = useApiLoad(async () => {
    const res = await api.get('/social/posts', { scope: 'square', limit: 40 }, { auth: false }).catch(() =>
      api.get('/social/posts', { scope: 'latest', limit: 40 }, { auth: false }).catch(() =>
        api.get('/social/posts', { limit: 40 }, { auth: false })
      )
    );
    return api.extractList(res);
  }, [api]);
  if (loading && !data) return <CreamPage title="Square" navigation={navigation}><Loading /></CreamPage>;
  return (
    <CreamPage title="Square" navigation={navigation}>
    <View style={{ flex: 1 }}>
      <FlatList
        style={[styles.root, { backgroundColor: '#fff6e4' }]}
        data={data || []}
        numColumns={2}
        keyExtractor={(item, i) => String(item.id || i)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<EmptyState title="Square is empty" subtitle="Tap + to upload a photo or video." />}
        columnWrapperStyle={{ paddingHorizontal: 8 }}
        renderItem={({ item }) => {
          const author = item.author || item.user || {};
          const url = postMedia(item);
          const isVideo = String(item.media_type || item.mediaType || item.type || url || '').includes('video') || /\.(mp4|mov|webm)(\?|$)/i.test(String(item.media_url || item.mediaUrl || url || ''));
          return (
            <Pressable
              style={{ width: '48%', margin: '1%' }}
              onPress={() =>
                openReelViewer(navigation, {
                  userId: author.id || item.userId || item.user_id,
                  startId: item.id,
                  mediaType: isVideo ? 'video' : 'image',
                })
              }
            >
              <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#F3E6C8', height: 180 }}>
                {url ? (
                  <Image source={{ uri: url }} style={{ width: '100%', height: 180 }} />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 }}>
                    <Text style={styles.meta} numberOfLines={4}>{item.caption || item.content || 'Post'}</Text>
                  </View>
                )}
                {isVideo ? (
                  <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>▶ Video</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontWeight: '700', color: '#5D4037', marginTop: 6, marginBottom: 10 }} numberOfLines={1}>
                {author.first_name || author.name || 'Creator'}
              </Text>
            </Pressable>
          );
        }}
      />
      <Pressable style={styles.fab} onPress={() => navigation.navigate('CreatePost')}>
        <Text style={styles.fabT}>＋</Text>
      </Pressable>
    </View>
    </CreamPage>
  );
}

export function TopicsScreen({ navigation }) {
  const { api } = useAuth();
  const { data, loading, load } = useApiLoad(async () => {
    const res = await api.get('/social/topics', null, { auth: false }).catch(() => api.get('/social/posts', { scope: 'topics' }, { auth: false }));
    return api.extractList(res);
  }, [api]);
  if (loading && !data) return <CreamPage title="Topics" navigation={navigation}><Loading /></CreamPage>;
  return (
    <CreamPage title="Topics" navigation={navigation}>
    <FlatList
      style={styles.root}
      data={data || []}
      keyExtractor={(item, i) => String(item.id || i)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={<EmptyState title="No topics yet" />}
      ListHeaderComponent={<Card><Text style={styles.h}>Topics</Text></Card>}
      renderItem={({ item }) => (
        <Pressable onPress={() => item.userId && navigation.navigate('CreatorProfile', { userId: item.userId })}>
          <Card>
            <Text style={styles.row}>{item.title || item.name || item.caption || 'Topic'}</Text>
            <Text style={styles.meta}>{item.posts || item.count || ''} posts</Text>
          </Card>
        </Pressable>
      )}
    />
    </CreamPage>
  );
}

export function HelpScreen({ navigation }) {
  return (
    <CreamPage title="Help" navigation={navigation}>
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>Help Center</Text>
        <Text style={styles.body}>Go live from Explore → Go Live. Party rooms use guest seats, chat, and gifts.</Text>
        <Text style={styles.body}>Recharge coins from Me → Top up. Withdraw points from Me → Withdraw.</Text>
        <Text style={styles.body}>Apply for Host / Agency / Seller from Me → Apply for a role.</Text>
        <Text style={styles.body}>Hosts must complete Live verification before streaming.</Text>
      </Card>
      <Card>
        <Text style={styles.h}>Frequently Asked Questions</Text>
        <Text style={styles.row}>How do I book a service?</Text>
        <Text style={styles.body}>Open Explore → Services, pick a professional, choose a time, pay by UPI, then track the job in Me → My bookings.</Text>
        <Text style={styles.row}>How do I cancel a booking?</Text>
        <Text style={styles.body}>Open the booking and cancel while it is still waiting or confirmed, if the professional has not started.</Text>
        <Text style={styles.row}>How do I become a professional?</Text>
        <Text style={styles.body}>Me → Offer services. Admin approval is required before you receive jobs.</Text>
      </Card>
      <GoldButton title="Privacy policy" onPress={() => navigation.navigate('Legal', { kind: 'privacy' })} />
      <View style={{ height: 8 }} />
      <OutlineButton title="Terms of use" onPress={() => navigation.navigate('Legal', { kind: 'terms' })} />
    </ScrollView>
    </CreamPage>
  );
}

export function LiveApplicationScreen({ navigation }) {
  return (
    <CreamPage title="Live application" navigation={navigation}>
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>Live application</Text>
        <Text style={styles.body}>Complete identity verification, then start hosting from Streamer Center.</Text>
        <GoldButton title="Live verification & selfie" onPress={() => navigation.navigate('LiveVerify')} />
        <View style={{ height: 10 }} />
        <OutlineButton title="Streamer Center" onPress={() => navigation.navigate('StreamerCenter')} />
      </Card>
    </ScrollView>
    </CreamPage>
  );
}

export function PaymentScreen({ navigation }) {
  return (
    <CreamPage title="Payment" navigation={navigation}>
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>Payment</Text>
        <Text style={styles.body}>Pay for coins via UPI QR, then submit UTR and payment proof.</Text>
        <GoldButton title="Recharge coins" onPress={() => navigation.navigate('Recharge')} />
        <View style={{ height: 10 }} />
        <OutlineButton title="Wallet history" onPress={() => navigation.navigate('WalletHistory')} />
      </Card>
    </ScrollView>
    </CreamPage>
  );
}

export function MyPostsScreen({ navigation }) {
  const { user, displayName } = useAuth();
  useFocusEffect(
    useCallback(() => {
      navigation.navigate('CreatorProfile', { userId: user?.id, name: displayName });
    }, [displayName, navigation, user?.id])
  );
  return (
    <CreamPage title="My posts" navigation={navigation}>
      <Loading label="Opening your posts…" />
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  h: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  big: { fontSize: 40, fontWeight: '800', color: '#be185d', textAlign: 'center' },
  fab: { position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.orangeCta, alignItems: 'center', justifyContent: 'center' },
  fabT: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: -2 },
  row: { fontWeight: '800', color: colors.textPrimary },
  meta: { color: colors.textSecondary, marginTop: 4, fontSize: 12 },
  body: { color: colors.textSecondary, lineHeight: 20, marginBottom: 10 },
  flowHelp: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 12,
    color: '#78350f',
    fontSize: 13,
    lineHeight: 20,
  },
  sec: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, fontWeight: '800', color: colors.gold700 },
  rowBtns: { flexDirection: 'column', gap: 8, marginTop: 10 },
  search: {
    margin: 12,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    color: colors.textPrimary,
  },
  bdProfile: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 14, backgroundColor: '#fff', borderRadius: 16, padding: 12 },
  bdName: { fontWeight: '800', color: '#5D4037', fontSize: 18 },
  bdBadge: { alignSelf: 'flex-start', backgroundColor: '#FF8C00', color: '#fff', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '800', marginTop: 4 },
  bdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14 },
  bdStat: { width: '48%', flexGrow: 1, borderRadius: 16, padding: 14, minHeight: 90 },
  bdStatK: { color: '#fff', fontWeight: '700', fontSize: 12 },
  bdStatV: { color: '#fff', fontWeight: '800', fontSize: 26, marginVertical: 4 },
  bdWhite: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E8D9B5' },
  bdBig: { fontWeight: '800', fontSize: 22, color: '#5D4037' },
  mini: { alignSelf: 'flex-start', backgroundColor: '#FF8C00', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  miniT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  promoCard: { margin: 14, borderRadius: 18, padding: 14 },
  codeBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginVertical: 8 },
  code: { textAlign: 'center', fontWeight: '800', fontSize: 22, color: '#5D4037' },
  rowBtnsH: { flexDirection: 'column', gap: 8, marginTop: 10 },
  bdActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  bdAction: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', gap: 6 },
  netRow: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 14, borderRadius: 16, padding: 12 },
  netCell: { flex: 1, alignItems: 'center' },
  roleBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#E8D9B5' },
  tagBd: { backgroundColor: '#3B82F6', color: '#fff', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  tagAg: { backgroundColor: '#F5D76E', color: '#5D4037', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  agHero: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 14, backgroundColor: '#fff', borderRadius: 16, padding: 12 },
  agBadge: { backgroundColor: '#7C3AED', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  agBadgeT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  agIncome: { marginHorizontal: 14, borderRadius: 18, padding: 16 },
  agIncomeK: { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  agIncomeV: { color: '#fff', fontWeight: '800', fontSize: 32 },
  agDate: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 10 },
  agDateT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  agSub: { backgroundColor: 'rgba(88,28,135,0.35)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  agSubT: { flex: 1, color: '#fff', fontWeight: '700' },
  agSubV: { color: '#fff', fontWeight: '800' },
  agInviteRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  agInvite: { flex: 1, borderRadius: 16, padding: 12, minHeight: 140 },
  agInviteN: { fontSize: 32, fontWeight: '800', color: '#111', marginVertical: 8, textAlign: 'center' },
  agInviteBtn: { borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  agInviteBtnT: { color: '#fff', fontWeight: '800' },
  agRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12 },
  agIco: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lvlDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  lvlDotT: { color: '#fff', fontWeight: '800' },
  redDot: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  redDotT: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
