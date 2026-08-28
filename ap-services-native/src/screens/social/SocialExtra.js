import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { mediaUrl } from '../../config/api';
import { Avatar, Card, EmptyState, ErrorBanner, Field, GoldButton, Loading, OutlineButton, PillTab } from '../../components/ui';
import CoupleRing from '../../components/CoupleRing';
import { CreamPage } from '../../components/creamChrome';
import { SVIP_PERKS, SVIP_TIERS } from '../../config/storeCatalog';
import { RING_SKINS } from '../../config/rings';
import { parseCpBond } from '../../lib/cpBond';

export function VisitorsScreen({ navigation }) {
  const { api } = useAuth();
  const [tab, setTab] = useState('mine');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.get(tab === 'mine' ? '/social/visitors' : '/social/visitors/visited');
      setRows(api.extractList(list));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fmtVisit = (item) => {
    const raw = item.visited_at || item.created_at || item.at;
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  };

  const message = async (id, name) => {
    try {
      const res = await api.post('/messages/conversations', { receiverId: id });
      const c = res.data || res;
      navigation.navigate('ChatThread', { conversationId: c.id || c.conversationId, name, otherUserId: id });
    } catch (e) {
      Alert.alert('Chat failed', e.message);
    }
  };

  return (
    <CreamPage title="Visitors" navigation={navigation}>
    <View style={styles.root}>
      <View style={styles.vTabs}>
        <Pressable onPress={() => setTab('mine')} style={styles.vTab}>
          <Text style={[styles.vTabT, tab === 'mine' && styles.vTabOn]}>My visitors</Text>
          {tab === 'mine' ? <View style={styles.vLine} /> : null}
        </Pressable>
        <Pressable onPress={() => setTab('visited')} style={styles.vTab}>
          <Text style={[styles.vTabT, tab === 'visited' && styles.vTabOn]}>Who I have visited</Text>
          {tab === 'visited' ? <View style={styles.vLine} /> : null}
        </Pressable>
      </View>
      <Pressable style={styles.anonBar} onPress={() => navigation.navigate('SvipSettings')}>
        <Text style={{ flex: 1 }}>🕵️  Visit profiles anonymously.</Text>
        <View style={styles.use}><Text style={styles.useT}>Setting</Text></View>
      </Pressable>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? <Loading /> : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => String(item.userId || item.id || i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<EmptyState title={tab === 'mine' ? 'No visitors yet' : 'You have not visited anyone'} />}
          renderItem={({ item }) => {
            const u = item.user || item.visitor || item.visited || item;
            const id = u.id || item.userId || item.visitorId || item.visited_user_id;
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || u.displayName || 'User';
            const gender = String(u.gender || '').toLowerCase();
            const female = gender === 'female' || gender === 'f';
            const views = item.view_count || item.visits || item.times || 1;
            return (
              <Pressable style={styles.vRow} onPress={() => id && navigation.navigate('CreatorProfile', { userId: id, name })}>
                <View>
                  <Avatar uri={mediaUrl(u.profile_pic || u.profilePic)} name={name} size={48} />
                  <View style={[styles.online, { backgroundColor: u.is_online || u.online ? '#22c55e' : '#9ca3af' }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.name}>{name}</Text>
                    <View style={[styles.gBadge, { backgroundColor: female ? '#fb7185' : '#38bdf8' }]}>
                      <Text style={{ color: '#fff', fontSize: 10 }}>{female ? '♀' : '♂'}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{fmtVisit(item)}  |  View {views} times</Text>
                </View>
                <Pressable onPress={() => message(id, name)} style={styles.chatBtn}>
                  <Text style={{ color: '#fff', fontSize: 16 }}>💬</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
    </CreamPage>
  );
}

export function SvipScreen({ navigation }) {
  const { api, user, displayName } = useAuth();
  const [data, setData] = useState(null);
  const [tier, setTier] = useState(0);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      api.get('/svip/home').then((r) => setData(api.unwrap(r))).catch((e) => setError(e.message));
    }, [api])
  );
  const points = Number(data?.points || data?.svipPoints || 0);
  const need = Number(data?.pointsToNext || Math.max(0, 3000000 - points) || 1360000);
  const level = Number(data?.level || data?.svipLevel || 0);
  const perks = Array.isArray(data?.privileges || data?.perks) && (data.privileges || data.perks).length
    ? (data.privileges || data.perks)
    : SVIP_PERKS;

  return (
    <View style={{ flex: 1, backgroundColor: '#2a0536' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <ErrorBanner message={error} />
        <LinearGradient colors={['#4a044e', '#2a0536']} style={styles.svipStage}>
          <Text style={styles.svipBrand}>AP LIVE SVIP</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 12 }}>
            {SVIP_TIERS.map((t, i) => (
              <Pressable key={t} onPress={() => setTier(i)}>
                <Text style={[styles.svipTier, tier === i && styles.svipTierOn]}>{t}</Text>
                {tier === i ? <View style={styles.svipTierLine} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.svipCat}>🐱</Text>
          <Text style={styles.svipPlate}>SVIP</Text>
        </LinearGradient>
        <View style={styles.ident}>
          <Text style={styles.identT}>✦  SVIP Identification  ✦</Text>
          <Text style={styles.identN}>{Math.min(perks.length, 9)}/9</Text>
        </View>
        <View style={styles.perkGrid2}>
          {(perks.slice ? perks.slice(0, 9) : []).map((p, i) => {
            const title = typeof p === 'string' ? p : p.title || p.name;
            const emoji = p.emoji || ['🏷️', '🐱', '🚪'][i] || '✨';
            return (
              <View key={title + i} style={styles.svipCard}>
                {p.play ? <Text style={styles.play}>▶</Text> : null}
                <Text style={{ fontSize: 28, textAlign: 'center' }}>{emoji}</Text>
                <Text style={styles.svipCardT}>{title}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.svipBar}>
        <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.svipBarT}>{level ? `You are SVIP ${level}` : 'You are not an SVIP yet'}</Text>
          <Text style={styles.svipBarS}>{points.toLocaleString()} / 3.0M</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Recharge')} style={styles.levelUp}>
          <Text style={styles.levelUpT}>Level Up</Text>
        </Pressable>
      </View>
      <Text style={styles.need}>Need {need.toLocaleString()} points to upgrade the SVIP {Math.max(1, level + 1)}.</Text>
    </View>
  );
}

export function SvipSettingsScreen() {
  const { api } = useAuth();
  const [settings, setSettings] = useState({});
  useFocusEffect(
    useCallback(() => {
      api.get('/svip/settings').then((r) => setSettings(api.unwrap(r)?.settings || api.unwrap(r) || {})).catch(() => {});
    }, [api])
  );
  const toggle = async (key) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try { await api.post('/svip/settings', next); } catch (_e) {}
  };
  return (
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>Visit anonymously</Text>
        <GoldButton title={settings.anonymous_visit || settings.invisible ? 'On' : 'Off'} onPress={() => toggle('anonymous_visit')} />
      </Card>
    </ScrollView>
  );
}

export function SvipIntroScreen() {
  const { api } = useAuth();
  const [data, setData] = useState(null);
  useFocusEffect(useCallback(() => { api.get('/svip/intro', null, { auth: false }).then((r) => setData(api.unwrap(r))).catch(() => setData({})); }, [api]));
  return (
    <ScrollView style={styles.root}>
      <Card>
        <Text style={styles.h}>SVIP Introduction</Text>
        <Text style={styles.body}>{data?.body || data?.html || 'SVIP unlocks anonymous visits, extra gifts, and profile privileges as you recharge.'}</Text>
      </Card>
    </ScrollView>
  );
}

export function CpHouseScreen({ navigation }) {
  const { api, user, displayName, refreshUser } = useAuth();
  const [home, setHome] = useState(null);
  const [target, setTarget] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const raw = api.unwrap(await api.get('/cp/home'));
      setHome(raw || {});
    } catch (e) { setError(e.message); setHome({}); }
  }, [api]);
  useFocusEffect(useCallback(() => { refreshUser?.(); load(); }, [load, refreshUser]));
  if (!home) {
    return (
      <CreamPage title="CP House" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }
  const bond = parseCpBond(home);
  const partnerName = bond.partnerName;
  const partnerPic = mediaUrl(bond.partnerPic);
  const partnerId = bond.partnerId;
  const sendInvite = (uid) => {
    if (!uid) return;
    api.post('/cp/invite', { toUserId: uid, targetUserId: uid })
      .then(() => Alert.alert('Invite sent'))
      .catch((e) => Alert.alert('Invite failed', e.message));
  };
  const wearRing = (ringId) => {
    api.post('/cp/change-ring', { ringId })
      .then(() => load())
      .catch((e) => Alert.alert('Could not change ring', e.message));
  };
  const openRingActions = () => {
    if (!bond.hasCp) {
      navigation.navigate('Store', { cat: 'ring' });
      return;
    }
    Alert.alert(bond.ring?.name || 'Your CP ring', 'What would you like to do?', [
      { text: 'Change the ring', onPress: () => {
        const owned = (bond.ownedRings || []).map((r) => r.ringId || r.id);
        const next = RING_SKINS.find((r) => owned.includes(r.id) && r.id !== bond.ringId) || RING_SKINS.find((r) => owned.includes(r.id));
        if (!owned.length) {
          navigation.navigate('Store', { cat: 'ring' });
          return;
        }
        if (next) wearRing(next.id);
        else Alert.alert('Wear ring', 'Pick a ring you own from the strip below.');
      } },
      {
        text: 'Take off the ring',
        style: 'destructive',
        onPress: () => {
          const fee = home?.breakFees?.instant || home?.instantBreakFee || 75000;
          Alert.alert('Remove CP ring', 'Ending a CP bond removes the worn ring.', [
            {
              text: 'Request break (partner consent)',
              onPress: () =>
                api
                  .post('/cp/break', { mode: 'request' })
                  .then(() => {
                    Alert.alert('Request sent', 'Your partner has 48 hours to respond.');
                    load();
                  })
                  .catch((e) => Alert.alert('Failed', e.message)),
            },
            {
              text: `Instant break (~${Number(fee).toLocaleString()} coins)`,
              style: 'destructive',
              onPress: () =>
                api
                  .post('/cp/break', { mode: 'instant' })
                  .then(() => {
                    Alert.alert('Ring removed', 'Your CP bond has ended.');
                    load();
                    refreshUser?.();
                  })
                  .catch((e) => Alert.alert('Failed', e.message)),
            },
            {
              text: 'Penalty break (inactive partner)',
              onPress: () =>
                api
                  .post('/cp/break', { mode: 'penalty' })
                  .then(() => {
                    Alert.alert('Ring removed', 'Penalty break completed.');
                    load();
                    refreshUser?.();
                  })
                  .catch((e) => Alert.alert('Failed', e.message)),
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  return (
    <CreamPage title="CP House" navigation={navigation}>
    <ScrollView style={[styles.root, { backgroundColor: '#fff1f2' }]}>
      <ErrorBanner message={error} onRetry={load} />
      <View style={styles.lhHead}>
        <Text style={styles.lhTitle}>CP House</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => navigation.navigate('Levels')}><Text style={styles.lhIco}>🛡</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('CpRankings')}><Text style={styles.lhIco}>🏆</Text></Pressable>
        </View>
      </View>
      <Text style={styles.hero}>{bond.hasCp ? 'Your CP House' : 'Go Find True Love.'}</Text>
      {!bond.hasCp ? (
        <GoldButton title="Send CP Invitation" onPress={() => sendInvite(found?.userId || target)} style={{ marginHorizontal: 16 }} />
      ) : null}
      <View style={styles.couple}>
        <View style={styles.slot}>
          <Avatar uri={user?.profile_pic} name={displayName} size={72} />
          <Text style={styles.slotN}>{displayName}</Text>
        </View>
        <Pressable onPress={openRingActions} style={{ alignItems: 'center' }}>
          <CoupleRing ringId={bond.ringId} ring={bond.ring} size={64} />
          {bond.hasCp ? <Text style={{ marginTop: 4, color: '#db2777', fontWeight: '800', fontSize: 11 }}>Tap ring</Text> : null}
        </Pressable>
        <View style={styles.slot}>
          {bond.hasCp ? (
            <Pressable onPress={() => partnerId && navigation.navigate('CreatorProfile', { userId: partnerId, name: partnerName })}>
              <Avatar uri={partnerPic} name={partnerName || 'Partner'} size={72} />
              <Text style={styles.slotN}>{partnerName || 'Partner'}</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.add}><Text style={{ fontSize: 28, color: '#db2777' }}>+</Text></View>
              <Text style={styles.slotN}>Partner</Text>
            </>
          )}
        </View>
      </View>
      {bond.hasCp ? (
        <Text style={{ textAlign: 'center', color: '#9d174d', fontWeight: '800', marginBottom: 8 }}>
          Together {bond.days} day{bond.days === 1 ? '' : 's'} · CP Lv.{bond.level}
        </Text>
      ) : null}
      {bond.hasCp ? (
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <OutlineButton title="Change ring" onPress={openRingActions} />
          </View>
          <View style={{ flex: 1 }}>
            <OutlineButton title="Take off ring" onPress={openRingActions} />
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <GoldButton title="Shop rings" onPress={() => navigation.navigate('Store', { cat: 'ring' })} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: 8 }}>
        {RING_SKINS.map((r) => {
          const owned = (bond.ownedRings || []).some((o) => (o.ringId || o.id) === r.id);
          const on = bond.ringId === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => {
                if (!bond.hasCp) {
                  navigation.navigate('Store', { cat: 'ring' });
                  return;
                }
                if (owned || on) wearRing(r.id);
                else navigation.navigate('Store', { cat: 'ring' });
              }}
              style={{ alignItems: 'center', width: 88, backgroundColor: on ? '#fce7f3' : '#fff', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: on ? '#db2777' : '#fecdd3' }}
            >
              <CoupleRing ringId={r.id} size={46} />
              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', color: '#9d174d', marginTop: 4 }}>{r.name}</Text>
              <Text style={{ fontSize: 10, color: '#db2777', fontWeight: '700' }}>{owned || on ? (on ? 'Wearing' : 'Wear') : `${Number(r.price).toLocaleString()} 🪙`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={styles.rankCard} onPress={() => navigation.navigate('CpRankings')}>
        <Text style={styles.name}>🏆 CP Rankings</Text>
        <Text style={styles.meta}>Week & total lovers leaderboard</Text>
      </Pressable>
      <Card>
        <Text style={styles.h}>🌹 CP Privilege 🌹</Text>
        <View style={styles.perkGrid}>
          {['🎖️ CP Medal', '💳 CP Card', '🏠 CP House', '👥 Together profile', '👕 House Theme', '💕 Online Effect'].map((p) => (
            <View key={p} style={styles.perk}><Text style={styles.perkT}>{p}</Text></View>
          ))}
        </View>
      </Card>
      {(home.pendingInvites || []).map((inv) => (
        <Card key={inv.id}>
          <Text style={styles.name}>{inv.fromName} sent a CP invite ({inv.ring?.name || 'Ring'})</Text>
          <GoldButton title="Accept" onPress={() => api.post(`/cp/invite/${inv.id}/respond`, { accept: true }).then(load)} />
          <View style={{ height: 8 }} />
          <OutlineButton title="Decline" onPress={() => api.post(`/cp/invite/${inv.id}/respond`, { accept: false }).then(load)} />
        </Card>
      ))}
      {!bond.hasCp ? (
      <Card>
        <Text style={styles.h}>Invite by ID</Text>
        <Field label="User ID" value={target} onChangeText={setTarget} />
        <GoldButton
          title="Check user"
          onPress={async () => {
            try { setFound(api.unwrap(await api.get(`/cp/lookup/${encodeURIComponent(target)}`))); }
            catch (e) { Alert.alert('Lookup failed', e.message); }
          }}
        />
        {found ? (
          <>
            <Text style={styles.meta}>{found.name} · intimacy {found.intimacyValue || 0}</Text>
            <GoldButton
              title={found.canInvite ? 'Apply' : 'Need intimacy'}
              onPress={() => found.canInvite && sendInvite(found.userId)}
            />
          </>
        ) : null}
      </Card>
      ) : null}
    </ScrollView>
    </CreamPage>
  );
}

export { default as CpRankingsScreen } from '../cp/CpRankingsScreen';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', gap: 4 },
  anon: { marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: '#111827', flexDirection: 'row', justifyContent: 'space-between' },
  anonT: { color: '#fff', fontWeight: '700' },
  anonA: { color: '#fbbf24', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, padding: 12, backgroundColor: colors.creamCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  name: { fontWeight: '800', color: colors.textPrimary },
  meta: { color: colors.textSecondary, marginTop: 3, fontSize: 12 },
  h: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  body: { color: colors.textSecondary, lineHeight: 20 },
  svipHero: { margin: 16, borderRadius: 18, padding: 24 },
  svipK: { color: '#e9d5ff', fontWeight: '700' },
  svipN: { color: '#fff', fontSize: 32, fontWeight: '800' },
  svipS: { color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  lhHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, alignItems: 'center' },
  lhTitle: { fontSize: 22, fontWeight: '800', color: '#9d174d' },
  lhIco: { fontSize: 20 },
  hero: { textAlign: 'center', fontSize: 22, fontWeight: '800', color: '#9d174d', marginVertical: 12 },
  couple: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginVertical: 16 },
  slot: { alignItems: 'center' },
  slotN: { marginTop: 6, fontWeight: '700', color: '#9d174d' },
  add: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#f9a8d4', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rankCard: { margin: 16, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#fecdd3' },
  perkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  perk: { width: '30%', backgroundColor: '#fff1f2', borderRadius: 12, padding: 8, alignItems: 'center' },
  perkT: { fontSize: 11, textAlign: 'center', color: '#9d174d', fontWeight: '700' },
  rank: { width: 28, fontWeight: '800', color: '#db2777' },
  vTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  vTab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  vTabT: { color: '#9ca3af', fontWeight: '600' },
  vTabOn: { color: '#111', fontWeight: '800' },
  vLine: { height: 3, backgroundColor: '#111', width: 48, marginTop: 8, borderRadius: 2 },
  anonBar: { flexDirection: 'row', alignItems: 'center', margin: 12, padding: 12, backgroundColor: '#fef3c7', borderRadius: 12 },
  use: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  useT: { fontWeight: '800', color: '#111' },
  vRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  online: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  gBadge: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center' },
  svipStage: { paddingBottom: 24, alignItems: 'center' },
  svipBrand: { color: '#fbbf24', fontWeight: '900', fontStyle: 'italic', fontSize: 22, marginVertical: 10 },
  svipTier: { color: 'rgba(253,230,138,0.5)', fontWeight: '700' },
  svipTierOn: { color: '#fde68a' },
  svipTierLine: { height: 2, backgroundColor: '#fbbf24', marginTop: 4 },
  svipCat: { fontSize: 72, marginTop: 16 },
  svipPlate: { color: '#fbbf24', fontWeight: '900', fontSize: 18 },
  ident: { alignItems: 'center', marginTop: 8 },
  identT: { color: '#fbbf24', fontWeight: '800' },
  identN: { color: '#e9d5ff', marginTop: 4 },
  perkGrid2: { flexDirection: 'row', flexWrap: 'wrap', padding: 12 },
  svipCard: { width: '30%', margin: '1.5%', backgroundColor: '#3b0764', borderWidth: 2, borderColor: '#fbbf24', borderRadius: 12, padding: 10, minHeight: 100 },
  play: { position: 'absolute', right: 6, top: 4, color: '#fff' },
  svipCardT: { color: '#fff', textAlign: 'center', marginTop: 8, fontWeight: '700', fontSize: 11 },
  svipBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#1e0430' },
  svipBarT: { color: '#fff', fontWeight: '700' },
  svipBarS: { color: '#fde68a', fontSize: 12 },
  levelUp: { backgroundColor: '#fbbf24', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  levelUpT: { color: '#1c1917', fontWeight: '800' },
  need: { color: '#fde68a', textAlign: 'center', paddingBottom: 10, backgroundColor: '#1e0430', fontSize: 12 },
});
