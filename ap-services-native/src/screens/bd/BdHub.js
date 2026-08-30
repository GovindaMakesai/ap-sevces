import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
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
import { mediaUrl } from '../../config/api';
import { Avatar, EmptyState, ErrorBanner, Field, Loading } from '../../components/ui';
import { indianGroup } from '../../lib/format.js';
import { formatUserDisplayId } from '../../lib/roles';

function ownerLabel(owner, fallback = '—') {
  if (!owner) return fallback;
  if (typeof owner === 'string') return owner;
  if (typeof owner === 'object') {
    return owner.name || owner.displayName || formatUserDisplayId(owner) || fallback;
  }
  return String(owner);
}

function hostCountOf(a) {
  if (a?.hostCount != null) return Number(a.hostCount) || 0;
  if (Array.isArray(a?.children)) return a.children.length;
  const h = a?.hosts;
  if (Array.isArray(h)) return h.length;
  if (typeof h === 'number') return h;
  return Number(a?.host_count || 0) || 0;
}

export function BdCenterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName, refreshSession, logout, refreshUser } = useAuth();
  const [dash, setDash] = useState(null);
  const [codes, setCodes] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alertedAuthRef = React.useRef(false);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const fetchAll = () =>
        Promise.all([
          api.get('/bd/dashboard', null, { skipCache: true, cacheTtlMs: 0 }),
          api.get('/bd/promo-codes', null, { skipCache: true, cacheTtlMs: 0 }).catch(() => ({})),
          api.get('/bd/agencies', null, { skipCache: true, cacheTtlMs: 0 }).catch(() => ({})),
          api.get('/bd/applications', null, { skipCache: true, cacheTtlMs: 0 }).catch(() => ({})),
        ]);

      let results;
      try {
        results = await fetchAll();
      } catch (firstErr) {
        const st = firstErr?.status || firstErr?.response?.status;
        if (st === 401) {
          await refreshSession?.();
          results = await fetchAll();
        } else {
          throw firstErr;
        }
      }

      const [d, c, a, ap] = results;
      setDash(api.unwrap(d) || {});
      setCodes(api.extractList(c));
      setAgencies(api.extractList(a));
      setApps(api.extractList(ap));
      alertedAuthRef.current = false;
      try {
        await refreshUser?.();
      } catch (_e) {}
    } catch (e) {
      const status = e?.status || e?.response?.status;
      const msg = String(e.message || '');
      const authDead =
        status === 401 ||
        /authentication required|invalid token|token expired|not authorized/i.test(msg);
      const forbidden =
        status === 403 ||
        /access denied|forbidden|required role/i.test(msg);

      if (authDead) {
        setError('Could not verify your session for BD Center. Pull to refresh, or log out and sign in once.');
        if (!alertedAuthRef.current) {
          alertedAuthRef.current = true;
          Alert.alert(
            'Session issue',
            'BD Center could not load with your current session. Retry, or log out and sign in once — you will not be bounced to login automatically.',
            [
              { text: 'Retry', onPress: () => load() },
              {
                text: 'Log out',
                style: 'destructive',
                onPress: () => {
                  logout?.().catch(() => {});
                },
              },
              { text: 'Stay', style: 'cancel' },
            ]
          );
        }
      } else if (forbidden) {
        setError('BD access denied for this account. Ask admin to assign BD (bdm) role.');
      } else {
        setError(msg || 'Could not load BD Center');
      }
    } finally {
      setLoading(false);
    }
  }, [api, logout, refreshSession, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading && !dash) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Loading label="Loading BD…" />
      </View>
    );
  }

  const d = dash || {};
  const code = codes[0]?.code || d.promo_code || d.agency_code || '—';
  const agenciesN = Number(d.agencyCount || agencies.length || 0);
  const hostsN = Number(d.hostCount || d.hosts || 0);

  const review = async (id, decision) => {
    try {
      await api.post(`/bd/applications/${id}/review`, {
        decision,
        reason: decision === 'rejected' ? 'Not approved' : undefined,
      });
      load();
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}><Ionicons name="chevron-back" size={22} color="#5D4037" /></Pressable>
        <Text style={styles.headTitle}>BD Center</Text>
        <Pressable onPress={load} style={styles.headBtn}><Ionicons name="refresh" size={18} color="#FF8C00" /></Pressable>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#FF8C00" />} contentContainerStyle={{ paddingBottom: 40 }}>
        <ErrorBanner message={error} onRetry={load} />
        <View style={styles.profile}>
          <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={64} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.name}>{displayName}</Text>
            <View style={styles.bdBadge}><Text style={styles.bdBadgeT}>BD</Text></View>
            <Text style={styles.meta}>ID: {formatUserDisplayId(user)}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <LinearGradient colors={['#FFB347', '#FF8C00']} style={styles.stat}>
            <Text style={styles.statK}>Month revenue</Text>
            <Text style={styles.statV}>{indianGroup(d.monthRevenueCoins || d.month_revenue || d.revenue || 0)}</Text>
            <Text style={styles.statK}>coins</Text>
          </LinearGradient>
          <LinearGradient colors={['#F5D76E', '#E8B923']} style={styles.stat}>
            <Text style={styles.statK}>Month gifts</Text>
            <Text style={styles.statV}>{indianGroup(d.monthGifts || d.month_gifts || d.gifts || 0)}</Text>
            <Text style={styles.statK}>settled</Text>
          </LinearGradient>
          <View style={styles.white}>
            <Text style={styles.big}>{agenciesN}</Text>
            <Text style={styles.meta}>Agencies</Text>
            <Pressable onPress={() => navigation.navigate('Hierarchy')} style={styles.mini}><Text style={styles.miniT}>Tree</Text></Pressable>
          </View>
          <View style={styles.white}>
            <Text style={styles.big}>{hostsN}</Text>
            <Text style={styles.meta}>Hosts</Text>
            <Pressable onPress={() => navigation.navigate('Hierarchy')} style={styles.mini}><Text style={styles.miniT}>Requests</Text></Pressable>
          </View>
        </View>

        <LinearGradient colors={['#FFF6D6', '#FDE8C8']} style={styles.promo}>
          <Text style={styles.sec}>Your Agency promo code</Text>
          <View style={styles.codeBox}><Text style={styles.code}>{code}</Text></View>
          <Text style={styles.meta}>Share with people applying as Agency. Requests appear below.</Text>
          <View style={styles.row2}>
            <Pressable onPress={() => Share.share({ message: String(code) })} style={[styles.cta, { backgroundColor: '#FF8C00', flex: 1 }]}>
              <Text style={styles.ctaT}>Copy / Share</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Hierarchy')} style={[styles.cta, { backgroundColor: '#C9A227', flex: 1 }]}>
              <Text style={styles.ctaT}>Hierarchy</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Text style={styles.sec}>Network overview</Text>
        <View style={styles.netRow}>
          <View style={styles.netCell}><Text style={styles.big}>{indianGroup(d.monthGiftCoins || d.gift_coins || 0)}</Text><Text style={styles.meta}>Gift coins</Text></View>
          <View style={styles.netCell}><Text style={styles.big}>{apps.length}</Text><Text style={styles.meta}>Pending</Text></View>
          <View style={styles.netCell}><Text style={styles.big}>{agenciesN}</Text><Text style={styles.meta}>Agencies</Text></View>
        </View>

        <Text style={styles.sec}>Pending Agency applications</Text>
        {!apps.length ? <EmptyState title="No pending applications" /> : null}
        {apps.map((a) => (
          <View key={String(a.id)} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={mediaUrl(a.profile_pic || a.profilePic)} name={a.name || a.first_name || a.email || 'Applicant'} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{a.name || a.first_name || a.email || 'Applicant'}</Text>
                <Text style={styles.meta}>{a.email || a.phone || a.id}</Text>
              </View>
            </View>
            <View style={styles.row2}>
              <Pressable onPress={() => review(a.id, 'approved')} style={[styles.cta, { backgroundColor: '#10B981', flex: 1 }]}><Text style={styles.ctaT}>Approve</Text></Pressable>
              <Pressable onPress={() => review(a.id, 'rejected')} style={[styles.cta, { backgroundColor: '#64748B', flex: 1 }]}><Text style={styles.ctaT}>Reject</Text></Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.sec}>Top agencies</Text>
        {!agencies.length ? <Text style={[styles.meta, { marginHorizontal: 16 }]}>No agencies in your network yet.</Text> : null}
        {agencies.slice(0, 12).map((a, i) => (
          <View key={String(a.id || i)} style={styles.cardRow}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Avatar uri={mediaUrl(a.profile_pic || a.ownerPic)} name={a.name || a.owner_name || 'Agency'} size={40} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cardName}>{a.name || a.agency_name || 'Agency'}</Text>
              <Text style={styles.meta}>Hosts {hostCountOf(a)} · {ownerLabel(a.owner_name || a.owner, '')}</Text>
            </View>
            <Text style={styles.score}>{indianGroup(a.score || a.revenue || a.coins || 0)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function HierarchyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [tree, setTree] = useState([]);
  const [open, setOpen] = useState({});
  const [openAg, setOpenAg] = useState({});
  const [hostsByAg, setHostsByAg] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/hierarchy', { q: q || undefined, role: role === 'all' ? undefined : role });
      const data = api.unwrap(res);
      setTree(Array.isArray(data) ? data : data?.tree || data?.nodes || data?.bds || []);
    } catch (e) {
      setError(e.message);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [api, q, role]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadHosts = async (agencyId) => {
    if (!agencyId) return;
    if (hostsByAg[agencyId]) {
      setOpenAg((s) => ({ ...s, [agencyId]: !s[agencyId] }));
      return;
    }
    setOpenAg((s) => ({ ...s, [agencyId]: true }));
    try {
      const res = await api.get(`/hierarchy/agency/${agencyId}`);
      const node = api.unwrap(res);
      const list = Array.isArray(node) ? node : node.children || node.hosts || api.extractList(res);
      setHostsByAg((s) => ({ ...s, [agencyId]: list }));
    } catch (_e) {
      setHostsByAg((s) => ({ ...s, [agencyId]: [] }));
    }
  };

  const bdCount = tree.length;
  const agencyCount = tree.reduce((n, b) => n + (b.agencies || b.children || []).length, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: '#EFF6FF' }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}><Ionicons name="chevron-back" size={22} color="#1E3A8A" /></Pressable>
        <Text style={[styles.headTitle, { color: '#1E3A8A' }]}>Hierarchy</Text>
        <Pressable onPress={load} style={styles.headBtn}><Ionicons name="refresh" size={18} color="#1E3A8A" /></Pressable>
      </View>
      <Text style={styles.crumb}>Admin → BD → Agency → Host</Text>
      <View style={styles.statTiles}>
        <View style={[styles.tile, { backgroundColor: '#DBEAFE' }]}><Text style={styles.tileN}>{bdCount}</Text><Text style={styles.tileL}>BD</Text></View>
        <View style={[styles.tile, { backgroundColor: '#E0E7FF' }]}><Text style={styles.tileN}>{agencyCount}</Text><Text style={styles.tileL}>Agency</Text></View>
        <View style={[styles.tile, { backgroundColor: '#FCE7F3' }]}><Text style={styles.tileN}>{hostsNSafe(tree, hostsByAg)}</Text><Text style={styles.tileL}>Hosts</Text></View>
      </View>
      <View style={styles.searchRow}>
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={load} placeholder="Search BD, agency, host" placeholderTextColor="#93C5FD" style={styles.search} />
        <Pressable onPress={() => setRole(role === 'all' ? 'bd' : role === 'bd' ? 'agency' : 'all')} style={styles.roleBtn}>
          <Text style={{ color: '#1E3A8A', fontWeight: '800', fontSize: 12 }}>{role}</Text>
        </Pressable>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#1E3A8A" />}>
        <ErrorBanner message={error} onRetry={load} />
        {!tree.length && !loading ? <EmptyState title="No hierarchy nodes" /> : null}
        {tree.map((n, i) => {
          const id = String(n.id || i);
          const agencies = n.agencies || n.children || [];
          const expanded = open[id];
          return (
            <View key={id} style={styles.node}>
              <Pressable onPress={() => setOpen((s) => ({ ...s, [id]: !s[id] }))} style={styles.nodeRow}>
                <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#1E3A8A" />
                <Avatar uri={mediaUrl(n.profile_pic || n.profilePic)} name={n.name || n.first_name} size={38} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.cardName}>{n.name || n.first_name || 'BD'}</Text>
                    <View style={styles.tagBd}><Text style={styles.tagTxt}>BD</Text></View>
                  </View>
                  <Text style={styles.meta}>{agencies.length} agencies</Text>
                </View>
              </Pressable>
              {expanded ? agencies.map((a, ai) => {
                const agId = String(a.id || ai);
                const hosts = a.hosts || a.children || hostsByAg[agId] || [];
                return (
                  <Pressable key={agId} onPress={() => loadHosts(agId)} style={styles.agNode}>
                    <View style={styles.nodeRow}>
                      <Ionicons name={openAg[agId] ? 'chevron-down' : 'chevron-forward'} size={14} color="#4F46E5" />
                      <Text style={styles.cardName}>{a.name || 'Agency'}</Text>
                      <View style={styles.tagAg}><Text style={styles.tagTxt}>Agency</Text></View>
                    </View>
                    <Text style={styles.meta}>Owner {ownerLabel(a.owner_name || a.owner)} · tap for hosts</Text>
                    {openAg[agId] ? (
                      hosts.length ? hosts.map((h, hi) => (
                        <Text key={String(h.id || hi)} style={styles.hostLine}>· {h.name || h.first_name || h.email}</Text>
                      )) : <Text style={styles.meta}>No hosts</Text>
                    ) : null}
                  </Pressable>
                );
              }) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function hostsNSafe(tree, hostsByAg) {
  let n = 0;
  tree.forEach((b) => {
    (b.agencies || b.children || []).forEach((a) => {
      const id = String(a.id || '');
      n += (a.hosts || a.children || hostsByAg[id] || []).length || Number(a.hostCount || 0);
    });
  });
  return n;
}

export function HostAgencyScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [code, setCode] = useState('');
  const [dash, setDash] = useState(null);
  const [change, setChange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get('/host/dashboard'),
        api.get('/host/agency-change').catch(() => ({})),
      ]);
      setDash(api.unwrap(d) || {});
      setChange(api.unwrap(c) || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !dash) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Loading />
      </View>
    );
  }

  const agencyName = dash?.agency?.name || dash?.agency_name || 'None';

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: '#FFF8F0' }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}><Ionicons name="chevron-back" size={22} color="#9A3412" /></Pressable>
        <Text style={[styles.headTitle, { color: '#9A3412' }]}>My Agency</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ErrorBanner message={error} onRetry={load} />
        <LinearGradient colors={['#FB923C', '#F97316']} style={styles.congrats}>
          <Text style={styles.congratsT}>🎉 Welcome to your agency family</Text>
          <Text style={styles.congratsS}>You're linked with {agencyName}</Text>
        </LinearGradient>
        <View style={styles.letter}>
          <Text style={styles.letterTitle}>Agency letter</Text>
          <Text style={styles.letterBody}>
            Stay active on live, follow agency rules, and request a change only when needed. Your agency reviews every transfer.
          </Text>
          <Text style={styles.meta}>Status: {change?.status || dash?.status || 'active'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sec}>Change Agency</Text>
          <Text style={styles.meta}>1) Get the new agency code · 2) Submit below · 3) Wait for both agencies to confirm</Text>
          <Field label="Agency code" value={code} onChangeText={setCode} />
          <Pressable
            onPress={async () => {
              try {
                await api.post('/host/agency-change', { agency_code: code });
                Alert.alert('Requested', 'Your agency will review this.');
                load();
              } catch (e) {
                Alert.alert('Failed', e.message);
              }
            }}
            style={[styles.cta, { backgroundColor: '#F97316' }]}
          >
            <Text style={styles.ctaT}>Request agency change</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.menuRow}
          onPress={async () => {
            try {
              await api.post('/host/become-agency', {});
              Alert.alert('Submitted', 'Become-agency request sent.');
              load();
            } catch (e) {
              Alert.alert('Failed', e.message);
            }
          }}
        >
          <Ionicons name="business-outline" size={20} color="#F97316" />
          <Text style={[styles.cardName, { flex: 1, marginLeft: 10 }]}>Become an Agency</Text>
          <Ionicons name="chevron-forward" size={16} color="#C4B08A" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: '#5D4037' },
  profile: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 4 },
  name: { fontWeight: '900', fontSize: 18, color: '#5D4037' },
  bdBadge: { alignSelf: 'flex-start', backgroundColor: '#FF8C00', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  bdBadgeT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  meta: { color: '#8B6D3B', fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginTop: 12 },
  stat: { width: '47%', borderRadius: 16, padding: 14, flexGrow: 1 },
  statK: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12 },
  statV: { color: '#fff', fontWeight: '900', fontSize: 24, marginVertical: 4 },
  white: { width: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F0E6C8' },
  big: { fontWeight: '900', fontSize: 22, color: '#5D4037' },
  mini: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#FFF1D0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  miniT: { color: '#FF8C00', fontWeight: '800', fontSize: 11 },
  promo: { margin: 14, borderRadius: 16, padding: 14 },
  sec: { marginHorizontal: 16, marginTop: 12, marginBottom: 8, fontWeight: '800', color: '#5D4037', fontSize: 15 },
  codeBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#F0E6C8' },
  code: { fontWeight: '900', fontSize: 20, letterSpacing: 1, color: '#9A3412', textAlign: 'center' },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cta: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ctaT: { color: '#fff', fontWeight: '800' },
  netRow: { flexDirection: 'row', marginHorizontal: 14, gap: 8 },
  netCell: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F0E6C8' },
  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: '#F0E6C8' },
  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F0E6C8' },
  cardName: { fontWeight: '800', color: '#5D4037' },
  rank: { width: 22, fontWeight: '900', color: '#FF8C00' },
  score: { fontWeight: '900', color: '#FF8C00' },
  crumb: { textAlign: 'center', color: '#1E40AF', fontWeight: '700', fontSize: 12, marginBottom: 8 },
  statTiles: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  tile: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  tileN: { fontWeight: '900', fontSize: 20, color: '#1E3A8A' },
  tileL: { color: '#1E40AF', fontWeight: '700', fontSize: 11, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  search: { flex: 1, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, height: 42, color: '#1E3A8A', borderWidth: 1, borderColor: '#BFDBFE' },
  roleBtn: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  node: { backgroundColor: '#fff', marginHorizontal: 14, marginBottom: 8, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagBd: { backgroundColor: '#1E3A8A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tagAg: { backgroundColor: '#4F46E5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  tagTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  agNode: { marginLeft: 18, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DBEAFE' },
  hostLine: { color: '#1E40AF', marginLeft: 22, marginTop: 4, fontSize: 12 },
  congrats: { margin: 14, borderRadius: 18, padding: 18 },
  congratsT: { color: '#fff', fontWeight: '900', fontSize: 18 },
  congratsS: { color: 'rgba(255,255,255,0.92)', marginTop: 6 },
  letter: { marginHorizontal: 14, backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#FDBA74' },
  letterTitle: { fontWeight: '900', color: '#9A3412', fontSize: 16 },
  letterBody: { color: '#9A3412', marginTop: 8, lineHeight: 20 },
  menuRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FDBA74' },
});
