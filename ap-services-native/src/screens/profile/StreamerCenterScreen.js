import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Loading } from '../../components/ui';
import { indianGroup } from '../../lib/format.js';
import { formatUserDisplayId } from '../../lib/roles';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function Metric({ label, value, tone }) {
  const color =
    tone === 'points' ? '#C2410C' : tone === 'coins' ? '#1D4ED8' : tone === 'ok' ? '#15803D' : '#374151';
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricV, { color }]}>{value}</Text>
      <Text style={styles.metricL}>{label}</Text>
    </View>
  );
}

function PillRow({ value, onChange, options = PERIODS }) {
  return (
    <View style={styles.pills}>
      {options.map((p) => (
        <Pressable key={p.id} onPress={() => onChange(p.id)} style={[styles.pill, value === p.id && styles.pillOn]}>
          <Text style={[styles.pillT, value === p.id && styles.pillTOn]}>{p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LinkRow({ icon, title, onPress, color = '#9A3412', bg = '#FFF7ED' }) {
  return (
    <Pressable onPress={onPress} style={[styles.linkRow, { backgroundColor: bg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={[styles.linkT, { color }]}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color} />
    </Pressable>
  );
}

function fmtHours(mins) {
  const m = Math.max(0, Number(mins) || 0);
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return `${h}h ${r}m`;
}

export default function StreamerCenterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [data, setData] = useState(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('week');
  const [hostPeriod, setHostPeriod] = useState('today');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [access, stats, analytics, hostStats] = await Promise.all([
        api.get('/live/access-status').catch(() => ({})),
        api.get('/live/streamer-stats').catch(() => ({})),
        api.get('/live/my-analytics', { period: analyticsPeriod }).catch(() => ({})),
        api.get('/live/streamer-stats', { period: hostPeriod }).catch(() => ({})),
      ]);
      setData({
        access: api.unwrap(access) || {},
        stats: api.unwrap(stats) || {},
        analytics: api.unwrap(analytics) || {},
        hostStats: api.unwrap(hostStats) || {},
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, analyticsPeriod, hostPeriod]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !data && !error) return <Loading />;

  const s = data?.stats || {};
  const a = data?.analytics || {};
  const h = data?.hostStats || {};
  const access = data?.access || {};
  const points = Number(s.points || s.point_balance || a.points || 0);
  const coins = Number(s.coins || s.earnings || s.diamond || a.coins || 0);
  const allTime = Number(s.all_time || s.total_points || s.lifetime || points);
  const verified = Boolean(
    access.canGoLive ||
      access.can_go_live ||
      (access.identityVerified && access.faceVerified) ||
      (access.identity_verified && access.face_verified)
  );
  const agencyName = s.agency_name || s.agencyName || access.agency_name || null;
  const uid = formatUserDisplayId(user) || '—';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={18} color="#5D4037" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Streamer Center</Text>
          <Text style={styles.uid}>ID:{uid}</Text>
          {agencyName ? <Text style={styles.agencyLine}>{agencyName}</Text> : null}
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#C9A227" />}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
        <ErrorBanner message={error} onRetry={load} />

        <View style={styles.card}>
          <Text style={styles.h2}>Host Policy & Guidelines</Text>
          <Text style={styles.hint}>Read the official live-streaming rules, then see Star Host and Normal Host rewards.</Text>
          <LinkRow
            icon="document-text-outline"
            title="Open Host Policy & Guidelines"
            onPress={() => navigation.navigate('HostPolicies', { policy: 'guidelines' })}
          />
          <Text style={[styles.h2, { marginTop: 14 }]}>Host earning policies</Text>
          <Text style={styles.hint}>Tap a card to open full details.</Text>
          <View style={styles.policyGrid}>
            <Pressable style={styles.policyCard} onPress={() => navigation.navigate('HostPolicies', { policy: 'star' })}>
              <View style={[styles.policyArt, { backgroundColor: '#1A0533' }]}>
                <Ionicons name="star" size={28} color="#F5D76E" />
              </View>
              <Text style={styles.policyLabel}>Star Host Policy</Text>
            </Pressable>
            <Pressable style={styles.policyCard} onPress={() => navigation.navigate('HostPolicies', { policy: 'normal' })}>
              <View style={[styles.policyArt, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="ribbon-outline" size={28} color="#C2410C" />
              </View>
              <Text style={styles.policyLabel}>Normal Host Policy</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>My Agency</Text>
          <Text style={styles.hint}>View your agency, change agency, or become an agency.</Text>
          <LinkRow icon="handshake-outline" title="My Agency" onPress={() => navigation.navigate('HostAgency')} />
          <View style={{ height: 10 }} />
          <LinkRow
            icon="swap-horizontal-outline"
            title="Change Agency"
            color="#1D4ED8"
            bg="#EFF6FF"
            onPress={() => navigation.navigate('HostAgency', { change: true })}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Your balance</Text>
          <Text style={styles.hint}>Points = gifts earned. Coins = wallet spend for gifting.</Text>
          <View style={styles.metrics}>
            <Metric label="Total points (available now)" value={`${indianGroup(points)} pts`} tone="points" />
            <Metric label="Total coins (wallet)" value={`${indianGroup(coins)} coins`} tone="coins" />
            <Metric label="All-time points earned" value={`${indianGroup(allTime)} pts`} tone="ok" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Content analytics</Text>
          <Text style={styles.hint}>From your posts, gifts, follows and lives</Text>
          <PillRow value={analyticsPeriod} onChange={setAnalyticsPeriod} />
          <View style={styles.metrics}>
            <Metric label="Likes" value={indianGroup(a.likes || a.like_count || 0)} />
            <Metric label="Comments" value={indianGroup(a.comments || a.comment_count || 0)} />
            <Metric label="Shares" value={indianGroup(a.shares || 0)} />
            <Metric label="Followers gained" value={indianGroup(a.newFollowers || a.followers || 0)} />
            <Metric label="Posts" value={indianGroup(a.posts || 0)} />
            <Metric label="Videos" value={indianGroup(a.videos || 0)} />
            <Metric label="Gifts received" value={indianGroup(a.gifts || a.gift_count || 0)} />
            <Metric label="Live hours" value={fmtHours(a.liveMinutes || a.minutes || 0)} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Hosting time</Text>
          <Text style={styles.hint}>Live and Party tracked separately</Text>
          <PillRow value={hostPeriod} onChange={setHostPeriod} />
          <View style={styles.metrics}>
            <Metric label="Live hours" value={fmtHours(h.liveMinutes || h.live_minutes || a.liveMinutes || 0)} tone="points" />
            <Metric label="Party hours" value={fmtHours(h.partyMinutes || h.party_minutes || 0)} tone="coins" />
            <Metric label="Points earned (this period)" value={`${indianGroup(h.points || a.points || 0)} pts`} tone="points" />
            <Metric label="New followers" value={indianGroup(h.newFollowers || a.newFollowers || 0)} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Your earnings split</Text>
          <Text style={styles.body}>
            You keep <Text style={styles.strong}>90%</Text> of gifts and live earnings.{' '}
            <Text style={styles.strong}>Platform share is 10%</Text> — shown transparently on every gift and booking.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>How Host works</Text>
          <Text style={styles.body}>
            Admin assigns Creator / Host role → open Explore → Go Live or Party. Earn points from gifts. Agency managers invite hosts from Agency Center.
          </Text>
        </View>

        <View style={[styles.card, styles.verifyCard]}>
          <Text style={styles.h2}>
            <Ionicons name="shield-checkmark" size={16} color="#C9A227" /> Live verification & selfie
          </Text>
          <Text style={styles.body}>
            Required once before video live. Step 1: confirm identity. Step 2: take a selfie in the app.
          </Text>
          <Text style={[styles.hint, { marginBottom: 12 }]}>
            {verified ? 'Verified — you can go live on video.' : 'Not fully verified yet.'}
          </Text>
          <Pressable onPress={() => navigation.navigate('LiveVerify')} style={styles.verifyBtnWrap}>
            <LinearGradient colors={['#FF8C42', '#C9A227']} style={styles.verifyBtn}>
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.verifyBtnT}>{verified ? 'Review verification' : 'Start verification'}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Go live now</Text>
          <Text style={styles.hint}>Start a video broadcast or a party room with seats.</Text>
          <View style={styles.dual}>
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('GoLive', { isParty: true })}>
              <LinearGradient colors={['#7C3AED', '#4F46E5']} style={styles.modeBtn}>
                <Ionicons name="people" size={18} color="#fff" />
                <Text style={styles.modeT}>Start Party</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('GoLive', { isParty: false })}>
              <LinearGradient colors={['#FF9F4A', '#FF6B00']} style={styles.modeBtn}>
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.modeT}>Go Live</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <LinkRow
            icon="document-text"
            title="Live application"
            color="#8B6D3B"
            bg="#FFF9E7"
            onPress={() => navigation.navigate('LiveApplication')}
          />
        </View>

        <Text style={styles.footerNote}>{displayName || 'Host'} · Streamer tools</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF6EE' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '900', color: '#5D4037' },
  uid: { fontSize: 12, color: '#8B6D3B', marginTop: 2, fontWeight: '700' },
  agencyLine: { fontSize: 12, color: '#C2410C', marginTop: 2, fontWeight: '700' },
  card: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.22)',
  },
  h2: { fontSize: 16, fontWeight: '900', color: '#5D4037', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginBottom: 10 },
  body: { fontSize: 13, color: '#374151', lineHeight: 20 },
  strong: { fontWeight: '900', color: '#111827' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  linkT: { fontWeight: '700', fontSize: 14 },
  policyGrid: { flexDirection: 'row', gap: 10 },
  policyCard: { flex: 1 },
  policyArt: { height: 88, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  policyLabel: { fontWeight: '800', color: '#5D4037', fontSize: 12, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: { flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F5E6C8', alignItems: 'center' },
  pillOn: { backgroundColor: '#FF8C00' },
  pillT: { color: '#8B6D3B', fontWeight: '700', fontSize: 12 },
  pillTOn: { color: '#fff' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', paddingVertical: 10, paddingRight: 8 },
  metricV: { fontSize: 16, fontWeight: '800' },
  metricL: { color: '#6B7280', fontSize: 11, marginTop: 2, lineHeight: 15 },
  verifyCard: { borderColor: 'rgba(201,162,39,0.4)' },
  verifyBtnWrap: { borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  verifyBtnT: { color: '#fff', fontWeight: '800' },
  dual: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modeT: { color: '#fff', fontWeight: '800' },
  footerNote: { textAlign: 'center', color: '#A8A29E', fontSize: 11, marginTop: 16 },
});
