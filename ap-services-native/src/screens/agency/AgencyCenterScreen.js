import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
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

function SoftCta({ title, onPress, color = '#EC4899', style }) {
  return (
    <Pressable onPress={onPress} style={[{ backgroundColor: color, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '800' }}>{title}</Text>
    </Pressable>
  );
}

function PanelShell({ title, onBack, children, refreshing, onRefresh }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={onBack} style={styles.headBtn}><Ionicons name="chevron-back" size={22} color="#111" /></Pressable>
        <Text style={styles.headTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />} contentContainerStyle={{ paddingBottom: 40 }}>
        {children}
      </ScrollView>
    </View>
  );
}

export function InviteHostScreen({ navigation }) {
  const { api } = useAuth();
  const [code, setCode] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/agency/invite-code');
      const d = api.unwrap(res) || {};
      setCode(d.code || d.invite_code || '');
    } catch (e) {
      setError(e.message);
    }
  }, [api]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (!ref.trim()) return Alert.alert('Need ID', 'Enter host User ID or email');
    setBusy(true);
    try {
      await api.post('/agency/invite-host', { user_ref: ref.trim(), userId: ref.trim() });
      Alert.alert('Invite sent', 'They will get a chat invite to join as Host.');
      setRef('');
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title="Invite Host" onBack={() => navigation.goBack()}>
      <ErrorBanner message={error} onRetry={load} />
      <View style={styles.pad}>
        <View style={styles.row2}>
          <SoftCta title="Share invite" color="#EC4899" style={{ flex: 1 }} onPress={() => Share.share({ message: `Join my AP Live agency as Host. Code: ${code}` })} />
          <SoftCta title="Copy code" color="#7C3AED" style={{ flex: 1 }} onPress={() => Share.share({ message: String(code || '') })} />
        </View>
        <Text style={styles.hint}>Agency code: <Text style={{ fontWeight: '900' }}>{code || '—'}</Text></Text>
        <Field label="User ID or email" value={ref} onChangeText={setRef} />
        <SoftCta title={busy ? 'Sending…' : 'Send invite message'} onPress={send} color="#EC4899" />
        <Text style={[styles.hint, { marginTop: 14 }]}>Sends a chat so they can Accept or Reject joining your agency.</Text>
        <Text style={styles.sec}>Invite Host Task</Text>
        {[
          ['2 hours', '$0.05'],
          ['5 hours', '$0.10'],
          ['10 hours', '$0.30'],
          ['15 hours', '$0.35'],
        ].map(([a, b]) => (
          <View key={a} style={styles.tableRow}>
            <Text style={styles.tableCell}>{a} on mic</Text>
            <Text style={[styles.tableCell, { fontWeight: '800', color: '#7C3AED' }]}>{b}</Text>
          </View>
        ))}
      </View>
    </PanelShell>
  );
}

export function InviteAgencyScreen({ navigation }) {
  const { api } = useAuth();
  const [code, setCode] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.get('/agency/invite-code').then((r) => {
        const d = api.unwrap(r) || {};
        setCode(d.code || d.invite_code || '');
      }).catch(() => {});
    }, [api])
  );

  const send = async () => {
    if (!ref.trim()) return Alert.alert('Need ID', 'Enter agency owner User ID or email');
    setBusy(true);
    try {
      await api.post('/agency/invite-agency', { user_ref: ref.trim(), userId: ref.trim() });
      Alert.alert('Invite sent', 'They can accept joining under your network.');
      setRef('');
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title="Invite Agency" onBack={() => navigation.goBack()}>
      <View style={styles.pad}>
        <LinearGradient colors={['#2563EB', '#7C3AED']} style={styles.inviteHero}>
          <Text style={styles.inviteHeroT}>Grow your network</Text>
          <Text style={styles.inviteHeroS}>Invite another agency under you · Code {code || '—'}</Text>
        </LinearGradient>
        <View style={styles.row2}>
          <SoftCta title="Share" color="#2563EB" style={{ flex: 1 }} onPress={() => Share.share({ message: `Join under my AP Live agency network. Code: ${code}` })} />
          <SoftCta title="Copy code" color="#7C3AED" style={{ flex: 1 }} onPress={() => Share.share({ message: String(code || '') })} />
        </View>
        <Field label="User ID or email" value={ref} onChangeText={setRef} />
        <SoftCta title={busy ? 'Sending…' : 'Send agency invite'} onPress={send} color="#2563EB" />
      </View>
    </PanelShell>
  );
}

export default function AgencyCenterScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName, refreshUser } = useAuth();
  const [panel, setPanel] = useState(route.params?.panel || 'home');
  const [dash, setDash] = useState(null);
  const [apps, setApps] = useState([]);
  const [changes, setChanges] = useState([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [agencyNameEdit, setAgencyNameEdit] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [d, a, c, inv, lvl] = await Promise.all([
        api.get('/agency/dashboard'),
        api.get('/agency/host-applications').catch(() => ({})),
        api.get('/agency/host-change-requests').catch(() => ({})),
        api.get('/agency/invite-code').catch(() => ({})),
        api.get('/agency/agent-level').catch(() => ({})),
      ]);
      const dd = api.unwrap(d) || {};
      const lvlD = api.unwrap(lvl) || {};
      const tiers = lvlD.table || lvlD.tiers || lvlD.rows || lvlD.levels || null;
      const letter =
        lvlD.current?.code ||
        lvlD.agency?.tier_code ||
        lvlD.letter ||
        dd.levelLetter ||
        dd.grade ||
        'D';
      setDash({
        ...dd,
        agentLevel: tiers || dd.agentLevel || dd.levelTable,
        levelLetter: letter,
      });
      setApps(api.extractList(a));
      setChanges(api.extractList(c));
      const invD = api.unwrap(inv) || {};
      setCode(invD.code || invD.invite_code || dd.invite_code || '');
      setAgencyNameEdit(dd.agency?.name || dd.agency_name || dd.agencyName || '');
    } catch (e) {
      setError(e.message || 'Could not load agency');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const d = dash || {};
  const agency = d.agency || {};
  const hosts = useMemo(() => (Array.isArray(d.hosts) ? d.hosts : []), [d.hosts]);
  const childAgencies = useMemo(
    () => (Array.isArray(d.childAgencies) ? d.childAgencies : Array.isArray(d.inviteAgencies) ? d.inviteAgencies : []),
    [d.childAgencies, d.inviteAgencies]
  );
  const agentLevel = d.agentLevel || d.levelTable || [];
  const hostsN = Number(d.hostCount || hosts.length || 0);
  const inviteAgN = Number(d.inviteAgencyCount || childAgencies.length || 0);
  const points = Number(d.monthPoints || d.agencyIncomePoints || d.points || 0);
  const coins = Number(d.monthRevenueCoins || d.inviteAgencyIncome || d.earnings || 0);
  const total = Number(d.totalIncome || coins + points);
  const levelLetter = String(d.levelLetter || d.grade || d.agentLevelLetter || 'D').slice(0, 1).toUpperCase();
  const agencyName = agency.name || d.agency_name || d.agencyName || `${displayName || 'My'} Agency`;

  const saveName = async () => {
    const name = agencyNameEdit.trim();
    if (!name) return;
    try {
      await api.patch('/agency/name', { name });
      setRenameOpen(false);
      load();
      refreshUser?.();
    } catch (e) {
      Alert.alert('Rename failed', e.message);
    }
  };

  const reviewApp = async (id, decision) => {
    try {
      await api.post(`/agency/host-applications/${id}/review`, { decision, reason: decision === 'rejected' ? 'Not approved' : undefined });
      load();
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  const respondChange = async (id, decision) => {
    try {
      await api.post(`/agency/host-change-requests/${id}/respond`, { decision, reason: decision === 'reject' || decision === 'rejected' ? 'Declined' : undefined });
      load();
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  if (loading && !dash) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Loading label="Loading agency…" />
      </View>
    );
  }

  if (panel === 'hosts') {
    return (
      <PanelShell title="Host List" onBack={() => setPanel('home')} refreshing={loading} onRefresh={load}>
        {!hosts.length ? <EmptyState title="No hosts yet" subtitle="Invite hosts with your agency code." /> : null}
        {hosts.map((h, i) => (
          <Pressable
            key={String(h.id || i)}
            style={styles.listCard}
            onPress={() => h.id && navigation.navigate('CreatorProfile', { userId: String(h.id), name: h.name || h.first_name })}
          >
            <Avatar uri={mediaUrl(h.profile_pic || h.profilePic)} name={h.name || h.first_name || 'Host'} size={44} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.listName}>{h.name || h.first_name || h.email || 'Host'}</Text>
              <Text style={styles.meta}>ID {formatUserDisplayId(h) || h.display_id || h.id} · {h.status || 'active'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C4B08A" />
          </Pressable>
        ))}
      </PanelShell>
    );
  }

  if (panel === 'agencies') {
    return (
      <PanelShell title="Invite Agency List" onBack={() => setPanel('home')} refreshing={loading} onRefresh={load}>
        <SoftCta title="Invite agency" color="#2563EB" style={{ marginHorizontal: 14, marginBottom: 10 }} onPress={() => navigation.navigate('InviteAgency')} />
        {!childAgencies.length ? <EmptyState title="No child agencies" subtitle="Invite agencies into your network." /> : null}
        {childAgencies.map((a, i) => (
          <View key={String(a.id || i)} style={styles.listCard}>
            <Avatar uri={mediaUrl(a.profile_pic || a.ownerPic)} name={a.name || a.owner_name || 'Agency'} size={44} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.listName}>{a.name || a.agency_name || 'Agency'}</Text>
              <Text style={styles.meta}>
                Owner {(typeof a.owner === 'object' ? a.owner?.name : a.owner) || a.owner_name || '—'}
                {' · Hosts '}
                {Array.isArray(a.children) ? a.children.length : (a.hostCount ?? a.hosts ?? 0)}
              </Text>
            </View>
          </View>
        ))}
      </PanelShell>
    );
  }

  if (panel === 'applications') {
    return (
      <PanelShell title="Host Application" onBack={() => setPanel('home')} refreshing={loading} onRefresh={load}>
        {!apps.length ? <EmptyState title="No pending applications" /> : null}
        {apps.map((a) => (
          <View key={String(a.id)} style={styles.listCardCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={mediaUrl(a.profile_pic || a.profilePic)} name={a.host_name || a.first_name || a.name || 'Host'} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>{a.host_name || a.first_name || a.name || a.email || 'Applicant'}</Text>
                <Text style={styles.meta}>{a.email || a.user_id || a.id}</Text>
              </View>
            </View>
            <View style={styles.row2}>
              <SoftCta title="Approve" color="#10B981" style={{ flex: 1 }} onPress={() => reviewApp(a.id, 'approved')} />
              <SoftCta title="Reject" color="#64748B" style={{ flex: 1 }} onPress={() => reviewApp(a.id, 'rejected')} />
            </View>
          </View>
        ))}
      </PanelShell>
    );
  }

  if (panel === 'transfers') {
    const release = changes.filter((c) => String(c.direction || c.type || c.kind || '').includes('release') || c.action === 'release' || c.fromAgency);
    const accept = changes.filter((c) => !release.includes(c));
    return (
      <PanelShell title="Host Transfers" onBack={() => setPanel('home')} refreshing={loading} onRefresh={load}>
        <Text style={styles.sec}>Release requests</Text>
        {!release.length ? <Text style={styles.hintPad}>None waiting</Text> : null}
        {(release.length ? release : changes).map((r) => (
          <View key={String(r.id)} style={styles.listCardCol}>
            <Text style={styles.listName}>{r.host_name || r.name || r.user_name || 'Host'}</Text>
            <Text style={styles.meta}>{r.status || r.type || 'pending'} · {r.agency_name || r.toAgencyName || ''}</Text>
            <View style={styles.row2}>
              <SoftCta title="Release / Accept" color="#7C3AED" style={{ flex: 1 }} onPress={() => respondChange(r.id, r.action === 'release' ? 'release' : 'accept')} />
              <SoftCta title="Reject" color="#64748B" style={{ flex: 1 }} onPress={() => respondChange(r.id, 'reject')} />
            </View>
          </View>
        ))}
        {accept.length && release.length ? (
          <>
            <Text style={styles.sec}>Incoming accept</Text>
            {accept.map((r) => (
              <View key={`a-${r.id}`} style={styles.listCardCol}>
                <Text style={styles.listName}>{r.host_name || r.name || 'Host'}</Text>
                <View style={styles.row2}>
                  <SoftCta title="Accept" color="#10B981" style={{ flex: 1 }} onPress={() => respondChange(r.id, 'accept')} />
                  <SoftCta title="Reject" color="#64748B" style={{ flex: 1 }} onPress={() => respondChange(r.id, 'reject')} />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </PanelShell>
    );
  }

  if (panel === 'level') {
    const rows = Array.isArray(agentLevel) ? agentLevel : agentLevel?.tiers || agentLevel?.rows || agentLevel?.table || [];
    return (
      <PanelShell title="Agent level" onBack={() => setPanel('home')} refreshing={loading} onRefresh={load}>
        <View style={styles.levelBadgeWrap}>
          <LinearGradient colors={['#7C3AED', '#EC4899']} style={styles.levelBadge}>
            <Text style={styles.levelBadgeT}>Current · {levelLetter}</Text>
          </LinearGradient>
        </View>
        <View style={styles.tableHead}>
          <Text style={[styles.tableCell, { fontWeight: '900' }]}>Level</Text>
          <Text style={[styles.tableCell, { fontWeight: '900' }]}>Requirement</Text>
          <Text style={[styles.tableCell, { fontWeight: '900' }]}>Reward</Text>
        </View>
        {(rows.length ? rows : [
          { code: 'D', min_earnings: 0, live_pct: 4 },
          { code: 'C', min_earnings: 10000, live_pct: 5 },
          { code: 'B', min_earnings: 50000, live_pct: 6 },
          { code: 'A', min_earnings: 200000, live_pct: 7 },
        ]).map((r, i) => (
          <View key={String(r.code || r.level || i)} style={styles.tableRow}>
            <Text style={styles.tableCell}>{r.code || r.level || r.name || r.tier}</Text>
            <Text style={styles.tableCell}>{r.min_earnings != null ? indianGroup(r.min_earnings) : (r.requirement || r.req || r.target || '—')}</Text>
            <Text style={styles.tableCell}>{r.live_pct != null ? `${r.live_pct}% live` : (r.reward || r.bonus || r.rate || '—')}</Text>
          </View>
        ))}
      </PanelShell>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}><Ionicons name="chevron-back" size={22} color="#111" /></Pressable>
        <Text style={styles.headTitle}>Agency Center</Text>
        <Pressable onPress={load} style={styles.headBtn}><Ionicons name="refresh" size={18} color="#7C3AED" /></Pressable>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#7C3AED" />} contentContainerStyle={{ paddingBottom: 48 }}>
        <ErrorBanner message={error} onRetry={load} />
        {d.staffPreview || !agency?.id ? (
          <View style={{ marginHorizontal: 14, marginBottom: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#3730A3', fontWeight: '700', fontSize: 13 }}>
              {d.staffPreview
                ? 'Admin preview — no agency is linked to this account yet. Assign yourself Agency role or open a specific agency owner.'
                : 'Agency profile is loading or not linked yet. Pull to refresh after your role is set to Agency.'}
            </Text>
          </View>
        ) : null}
        <View style={styles.hero}>
          <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={64} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.heroName}>{displayName}</Text>
              <View style={styles.agBadge}><Text style={styles.agBadgeT}>Agency</Text></View>
            </View>
            <Pressable onPress={() => Share.share({ message: String(formatUserDisplayId(user) || '') })} style={styles.idRow}>
              <Text style={styles.meta}>ID: {formatUserDisplayId(user)}</Text>
              <Ionicons name="copy-outline" size={14} color="#8B6D3B" />
            </Pressable>
            <Pressable onPress={() => setRenameOpen(true)} style={styles.idRow}>
              <Text style={styles.meta}>Agency: {agencyName}</Text>
              <Ionicons name="pencil" size={14} color="#7C3AED" />
            </Pressable>
          </View>
        </View>

        <LinearGradient colors={['#7C3AED', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.income}>
          <Text style={styles.incomeK}>Total Income</Text>
          <Text style={styles.incomeV}>🪙  {indianGroup(total)}</Text>
          <Text style={styles.incomeRange}>This month</Text>
          <View style={styles.incomeSub}>
            <Text style={styles.incomeSubT}>🏢  My Agency Income (Points)</Text>
            <Text style={styles.incomeSubV}>{indianGroup(points)} ›</Text>
          </View>
          <View style={styles.incomeSub}>
            <Text style={styles.incomeSubT}>🤝  Invite Agency Income (Coins)</Text>
            <Text style={styles.incomeSubV}>{indianGroup(coins)} ›</Text>
          </View>
        </LinearGradient>

        <Text style={styles.sec}>Invitation</Text>
        <View style={styles.inviteRow}>
          <View style={[styles.inviteCard, { backgroundColor: '#FCE7F3' }]}>
            <Text style={styles.meta}>Number of Hosts</Text>
            <Text style={styles.inviteN}>{hostsN}</Text>
            <SoftCta title="Invite Host" color="#EC4899" onPress={() => navigation.navigate('InviteHost')} />
          </View>
          <View style={[styles.inviteCard, { backgroundColor: '#DBEAFE' }]}>
            <Text style={styles.meta}>Invite Agency</Text>
            <Text style={styles.inviteN}>{inviteAgN}</Text>
            <SoftCta title="Invite Agency" color="#2563EB" onPress={() => navigation.navigate('InviteAgency')} />
          </View>
        </View>

        {[
          ['medal-outline', 'Agent level', '#7C3AED', () => setPanel('level'), levelLetter],
          ['videocam', 'Streamer Center', '#EC4899', () => navigation.navigate('StreamerCenter')],
          ['mic', 'Host List', '#DB2777', () => setPanel('hosts'), hostsN],
          ['git-network-outline', 'Invite Agency List', '#2563EB', () => setPanel('agencies'), inviteAgN],
          ['ribbon-outline', 'Host Application', '#7C3AED', () => setPanel('applications'), apps.length],
          ['swap-horizontal', 'Host Transfers', '#A78BFA', () => setPanel('transfers'), changes.length],
        ].map(([icon, label, color, onPress, badge]) => (
          <Pressable key={label} onPress={onPress} style={styles.menuRow}>
            <View style={[styles.menuIco, { backgroundColor: color }]}><Ionicons name={icon} size={18} color="#fff" /></View>
            <Text style={styles.menuLabel}>{label}</Text>
            {label === 'Agent level' ? (
              <View style={styles.lvlDot}><Text style={styles.lvlDotT}>{badge}</Text></View>
            ) : badge ? (
              <View style={styles.redDot}><Text style={styles.redDotT}>{badge > 99 ? '99+' : badge}</Text></View>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color="#C4B08A" />
          </Pressable>
        ))}
        <Text style={[styles.hint, { textAlign: 'center', marginTop: 16 }]}>Invite code · {code || '—'}</Text>
      </ScrollView>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setRenameOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.listName}>Rename agency</Text>
            <TextInput value={agencyNameEdit} onChangeText={setAgencyNameEdit} style={styles.input} placeholder="Agency name" placeholderTextColor="#A1A1AA" />
            <SoftCta title="Save" color="#7C3AED" onPress={saveName} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7FB' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: '#111' },
  pad: { padding: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 4 },
  heroName: { fontWeight: '900', fontSize: 18, color: '#111' },
  agBadge: { backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  agBadgeT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { color: '#6B7280', fontSize: 12 },
  income: { margin: 14, borderRadius: 18, padding: 16 },
  incomeK: { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  incomeV: { color: '#fff', fontWeight: '900', fontSize: 28, marginTop: 6 },
  incomeRange: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 12 },
  incomeSub: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' },
  incomeSubT: { color: '#fff', fontWeight: '700', fontSize: 12, flex: 1 },
  incomeSubV: { color: '#fff', fontWeight: '900' },
  sec: { marginHorizontal: 16, marginTop: 14, marginBottom: 8, fontWeight: '800', color: '#111', fontSize: 15 },
  inviteRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  inviteCard: { flex: 1, borderRadius: 16, padding: 12 },
  inviteN: { fontSize: 28, fontWeight: '900', color: '#111', marginVertical: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12, gap: 10 },
  menuIco: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontWeight: '700', color: '#111' },
  lvlDot: { backgroundColor: '#7C3AED', borderRadius: 999, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  lvlDotT: { color: '#fff', fontWeight: '900', fontSize: 12 },
  redDot: { backgroundColor: '#EF4444', borderRadius: 999, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  redDotT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12 },
  listCardCol: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 14, padding: 12, gap: 10 },
  listName: { fontWeight: '800', color: '#111', fontSize: 15 },
  row2: { flexDirection: 'row', gap: 8 },
  hint: { color: '#6B7280', fontSize: 12, marginBottom: 10 },
  hintPad: { color: '#6B7280', marginHorizontal: 16, marginBottom: 8 },
  inviteHero: { borderRadius: 16, padding: 16, marginBottom: 12 },
  inviteHeroT: { color: '#fff', fontWeight: '900', fontSize: 18 },
  inviteHeroS: { color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  tableHead: { flexDirection: 'row', marginHorizontal: 14, backgroundColor: '#EDE9FE', borderRadius: 10, padding: 10 },
  tableRow: { flexDirection: 'row', marginHorizontal: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6', padding: 12 },
  tableCell: { flex: 1, color: '#374151', fontSize: 12 },
  levelBadgeWrap: { alignItems: 'center', marginVertical: 12 },
  levelBadge: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  levelBadgeT: { color: '#fff', fontWeight: '900' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#111' },
});
