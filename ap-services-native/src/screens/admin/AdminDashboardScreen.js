import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { Avatar, Card, EmptyState, ErrorBanner, GoldButton, Loading, OutlineButton } from '../../components/ui';
import { indianGroup, rupees } from '../../lib/format.js';
import { PressScale } from '../../components/motion';
import { mediaUrl } from '../../config/api';
import {
  ALL_ADMIN_CAPS,
  ADMIN_CAP_CATALOG,
  DEFAULT_OPS_CAPS,
  adminCapsOf,
  formatUserDisplayId,
  hasAdminCap,
  isSuperAdmin,
} from '../../lib/roles';

function RoleBadge({ role }) {
  const raw = String(role || 'user').toLowerCase();
  const label =
    raw === 'bdm' || raw === 'bd'
      ? 'BD'
      : raw === 'super_admin'
        ? 'Super Admin'
        : raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const tone =
    raw === 'bdm' || raw === 'bd'
      ? { bg: '#FF8C00', fg: '#fff' }
      : raw === 'agency'
        ? { bg: '#7C3AED', fg: '#fff' }
      : raw === 'host' || raw === 'streamer'
        ? { bg: '#EC4899', fg: '#fff' }
      : raw === 'coin_seller' || raw === 'seller'
        ? { bg: '#C9A227', fg: '#111' }
      : raw === 'admin' || raw === 'super_admin'
        ? { bg: '#E11D48', fg: '#fff' }
        : { bg: '#3F3F46', fg: '#E4E4E7' };
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: tone.fg, fontWeight: '800', fontSize: 10 }}>{label}</Text>
    </View>
  );
}

function StatusPill({ active }) {
  const on = active !== false;
  return (
    <View style={{ backgroundColor: on ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: on ? '#34D399' : '#FB7185', fontWeight: '800', fontSize: 10 }}>{on ? 'Active' : 'Inactive'}</Text>
    </View>
  );
}

function DeskCard({ children, style }) {
  return (
    <Card style={[{ backgroundColor: '#18181B', borderColor: 'rgba(255,255,255,0.1)' }, style]}>
      {children}
    </Card>
  );
}

function Kv({ k, v }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 }}>
      <Text style={{ color: '#A1A1AA', fontSize: 13, flex: 1 }}>{k}</Text>
      <Text style={{ color: '#FAFAFA', fontWeight: '700', fontSize: 13, flex: 1, textAlign: 'right' }}>
        {v == null || v === '' ? '—' : String(v)}
      </Text>
    </View>
  );
}

function SoftBtn({ title, onPress, tone = 'rose', compact }) {
  const bg =
    tone === 'emerald'
      ? ['#059669', '#10B981']
      : tone === 'slate'
        ? ['#3F3F46', '#52525B']
        : tone === 'amber'
          ? ['#D97706', '#F59E0B']
          : ['#E11D48', '#FB7185'];
  return (
    <PressScale onPress={onPress} style={{ flexGrow: 1, minWidth: compact ? 110 : 130 }} scaleTo={0.97}>
      <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{
        borderRadius: 12,
        paddingVertical: compact ? 10 : 12,
        paddingHorizontal: 14,
        alignItems: 'center',
      }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: compact ? 12 : 13 }}>{title}</Text>
      </LinearGradient>
    </PressScale>
  );
}

function MiniBars({ series = [], color = '#38BDF8' }) {
  const vals = series.map((r) => Number(r.revenue || r.bookings || r.value || 0));
  const max = Math.max(1, ...vals);
  if (!vals.length) {
    return <Text style={{ color: '#71717A', fontSize: 12 }}>No chart data for this period yet</Text>;
  }
  const palette = ['#38BDF8', '#A78BFA', '#34D399', '#FBBF24', '#FB7185', '#22D3EE'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96, marginTop: 10 }}>
      {vals.slice(-14).map((v, i) => (
        <View
          key={`b-${i}`}
          style={{
            flex: 1,
            height: Math.max(6, Math.round((v / max) * 88)),
            borderRadius: 6,
            backgroundColor: color || palette[i % palette.length],
            opacity: 0.55 + (i / Math.max(1, vals.length)) * 0.45,
          }}
        />
      ))}
    </View>
  );
}

function lastSeenOf(item) {
  const raw =
    item?.last_login ||
    item?.lastLogin ||
    item?.last_seen_at ||
    item?.last_seen ||
    item?.last_active ||
    item?.updated_at ||
    item?.created_at;
  if (!raw) return { text: 'Never', hint: '' };
  const text = fmtWhen(raw);
  const hasLogin = Boolean(item?.last_login || item?.lastLogin);
  return { text, hint: hasLogin ? '' : 'approx' };
}

function personTitle(item) {
  return (
    [item.first_name, item.last_name].filter(Boolean).join(' ') ||
    item.displayName ||
    item.name ||
    item.email ||
    item.user_name ||
    'User'
  );
}

function maskSecret(value) {
  const t = String(value || '').trim();
  if (!t) return '';
  if (t.length < 8) return '••••';
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

function fmtWhen(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

/** Friendly modules + required capability (null = always for staff) */
const MODULES = [
  { id: 'overview', label: 'Home', icon: 'home-outline', hint: 'Your daily tasks', how: null, caps: null },
  { id: 'recharges', label: 'Payment approvals', icon: 'card-outline', hint: 'Approve coin top-ups', how: 'Tap Approve when the payment looks correct. Tap Reject if something looks wrong.', caps: ['payments'] },
  { id: 'payments', label: 'Payment history', icon: 'receipt-outline', hint: 'Recent money movements', how: null, caps: ['payments'] },
  { id: 'withdrawals', label: 'Withdrawals', icon: 'cash-outline', hint: 'Approve cash-outs', how: 'Check the amount, then Approve to pay or Reject to send it back.', caps: ['withdrawals'] },
  { id: 'platform', label: 'Agora & live', icon: 'radio-outline', hint: 'Live App ID & certificate', how: 'Paste App ID and certificate from Agora, then Save.', caps: ['agora'] },
  { id: 'users', label: 'Users', icon: 'people-outline', hint: 'Profiles & moderation', how: 'Only Super Admin (or assigned power) can open user details.', caps: ['users'] },
  { id: 'role-applications', label: 'Applications', icon: 'person-add-outline', hint: 'Host / agency / seller requests', how: null, caps: ['applications'] },
  { id: 'workers', label: 'Workers', icon: 'construct-outline', hint: 'Approve professionals', how: null, caps: ['operations'] },
  { id: 'services', label: 'Services', icon: 'grid-outline', hint: 'Service catalog', how: null, caps: ['operations'] },
  { id: 'bookings', label: 'Bookings', icon: 'calendar-outline', hint: 'Service bookings', how: null, caps: ['operations'] },
  { id: 'reviews', label: 'Reviews', icon: 'star-outline', hint: 'Moderate reviews', how: null, caps: ['operations'] },
  { id: 'bd-hierarchy', label: 'BD & network', icon: 'git-network-outline', hint: 'Business development', how: null, caps: ['network'] },
  { id: 'referrals', label: 'Referrals', icon: 'gift-outline', hint: 'Invite program', how: null, caps: ['network'] },
  { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline', hint: 'Platform numbers', how: null, caps: ['analytics'] },
  { id: 'reports', label: 'Reports', icon: 'document-text-outline', hint: 'Generate summaries', how: null, caps: ['analytics'] },
  { id: 'notifications', label: 'Alerts', icon: 'notifications-outline', hint: 'Platform alerts', how: null, caps: ['payments', 'withdrawals', 'applications'] },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', hint: 'Announcements', how: null, caps: ['settings'] },
  { id: 'staff', label: 'Staff powers', icon: 'key-outline', hint: 'Decide Admin responsibilities', how: 'Turn powers on/off for each Admin. User details stay off unless you allow them.', caps: ['__super__'] },
];

const SECTIONS = MODULES.map(({ id, label }) => ({ id, label }));

function nameOf(item) {
  return (
    item?.first_name ||
    item?.name ||
    item?.title ||
    item?.email ||
    [item?.user?.first_name, item?.user?.last_name].filter(Boolean).join(' ') ||
    item?.id ||
    'Item'
  );
}

function friendlyKey(k) {
  return String(k || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCompact(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return indianGroup(v);
}

export default function AdminDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api, user, logout } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [caps, setCaps] = useState(() => adminCapsOf(user));
  const [catalog, setCatalog] = useState([]);
  const [staff, setStaff] = useState([]);
  const allowed = useMemo(() => {
    return MODULES.filter((m) => {
      if (!m.caps) return true;
      if (m.caps.includes('__super__')) return superAdmin;
      return m.caps.some((c) => caps.includes(c));
    });
  }, [caps, superAdmin]);

  const start = route.params?.section || 'overview';
  const [section, setSection] = useState(start);
  const [stats, setStats] = useState({});
  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [walletUser, setWalletUser] = useState('');
  const [walletCoins, setWalletCoins] = useState('');
  const [announce, setAnnounce] = useState('');
  const [reportType, setReportType] = useState('financial');
  const [reportPeriod, setReportPeriod] = useState('month');
  const [platformName, setPlatformName] = useState('AP Live Service');
  const [contactEmail, setContactEmail] = useState('support@apservices.com');
  const [platformFee, setPlatformFee] = useState('15');
  const [minWithdrawal, setMinWithdrawal] = useState('10');
  const [agoraAppId, setAgoraAppId] = useState('');
  const [agoraCert, setAgoraCert] = useState('');
  const [agoraBusy, setAgoraBusy] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('month');
  const [refreshing, setRefreshing] = useState(false);
  const [bdAssignRef, setBdAssignRef] = useState('');
  const pendingSection = useRef(route.params?.section || null);
  const accessOnceRef = useRef(false);
  const loadSeqRef = useRef(0);
  const capsKeyRef = useRef('');
  const hasDataRef = useRef(false);
  const sectionRef = useRef(section);
  const qRef = useRef(q);
  const analyticsPeriodRef = useRef(analyticsPeriod);
  const reportPeriodRef = useRef(reportPeriod);
  const capsRef = useRef(caps);
  const superAdminRef = useRef(superAdmin);
  sectionRef.current = section;
  qRef.current = q;
  analyticsPeriodRef.current = analyticsPeriod;
  reportPeriodRef.current = reportPeriod;
  capsRef.current = caps;
  superAdminRef.current = superAdmin;

  const can = useCallback((...need) => {
    if (superAdminRef.current) return true;
    return need.some((c) => capsRef.current.includes(c));
  }, []);

  const goSection = useCallback(
    (id) => {
      const mod = MODULES.find((m) => m.id === id);
      if (!mod) return;
      if (mod.caps?.includes('__super__') && !superAdminRef.current) {
        Alert.alert('Super Admin only', 'Only Super Admin can manage staff powers.');
        return;
      }
      if (mod.caps && !mod.caps.includes('__super__') && !can(...mod.caps)) {
        Alert.alert('No access', 'Ask a Super Admin to give you this responsibility.');
        return;
      }
      setSection(id);
    },
    [can]
  );

  const loadAccess = useCallback(async () => {
    try {
      const res = await api.get('/admin/me-access');
      const d = api.unwrap(res) || {};
      if (Array.isArray(d.caps) && d.caps.length) {
        const key = d.caps.slice().sort().join(',');
        if (key !== capsKeyRef.current) {
          capsKeyRef.current = key;
          setCaps(d.caps);
        }
      }
      if (Array.isArray(d.catalog)) setCatalog(d.catalog);
    } catch (_e) {
      const fallback = adminCapsOf(user);
      const key = fallback.slice().sort().join(',');
      if (key !== capsKeyRef.current) {
        capsKeyRef.current = key;
        setCaps(fallback);
      }
    } finally {
      setAccessReady(true);
    }
  }, [api, user]);

  const load = useCallback(async (opts = {}) => {
    const soft = Boolean(opts.soft) && hasDataRef.current;
    const seq = ++loadSeqRef.current;
    setError('');
    if (!soft) setLoading(true);
    try {
      const sectionNow = sectionRef.current;
      const qNow = qRef.current;
      const analyticsPeriodNow = analyticsPeriodRef.current;
      const reportPeriodNow = reportPeriodRef.current;
      const isSuper = superAdminRef.current;
      if (sectionNow === 'overview') {
        const tasks = [
          can('payments', 'withdrawals', 'analytics') ? api.get('/admin/dashboard/stats').catch(() => ({})) : Promise.resolve({}),
          can('payments') ? api.get('/admin/payments/summary').catch(() => ({})) : Promise.resolve({}),
          can('withdrawals') ? api.get('/admin/withdrawals/pending').catch(() => ({})) : Promise.resolve({}),
          can('payments') ? api.get('/admin/payments/pending').catch(() => ({})) : Promise.resolve({}),
        ];
        const [dash, pay, wds, pendingPay] = await Promise.all(tasks);
        if (seq !== loadSeqRef.current) return;
        const dashData = api.unwrap(dash) || {};
        const payData = api.unwrap(pay) || {};
        const nested = dashData.stats && typeof dashData.stats === 'object' ? dashData.stats : {};
        setStats({
          ...nested,
          ...dashData,
          ...payData,
          totalCollected: payData.total_collected ?? payData.totalCollected ?? nested.total_revenue,
          platformFees: payData.platform_fees ?? payData.platformFees ?? nested.platform_fees,
        });
        setExtra({
          pendingWithdrawals: api.extractList(wds),
          pendingPayments: api.extractList(pendingPay),
        });
        setRows([]);
      } else if (sectionNow === 'staff') {
        if (!isSuper) throw new Error('Super Admin only');
        const res = await api.get('/admin/staff');
        if (seq !== loadSeqRef.current) return;
        const d = api.unwrap(res) || {};
        setStaff(d.staff || api.extractList(res));
        if (Array.isArray(d.catalog)) setCatalog(d.catalog);
      } else if (sectionNow === 'platform') {
        const [agora, live] = await Promise.all([
          api.get('/admin/platform/agora').catch(() => ({})),
          api.get('/admin/live-dashboard').catch(() => ({})),
        ]);
        if (seq !== loadSeqRef.current) return;
        const a = api.unwrap(agora) || {};
        setExtra({ agora: a, live: api.unwrap(live) });
        setAgoraAppId(a.app_id || a.appId || a.appID || '');
        setAgoraCert('');
      } else if (sectionNow === 'users') {
        const res = await api.get('/admin/users', { page: 1, limit: 40, search: qNow });
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'workers') {
        const res = await api.get('/admin/workers', { page: 1, limit: 40, search: qNow });
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'services') {
        const res = await api.get('/admin/services', { limit: 50 });
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'bookings') {
        const res = await api.get('/admin/bookings', { page: 1, limit: 40, search: qNow });
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'payments') {
        const [sum, list] = await Promise.all([
          api.get('/admin/payments/summary'),
          api.get('/admin/payments', { limit: 40 }),
        ]);
        if (seq !== loadSeqRef.current) return;
        setStats(api.unwrap(sum));
        setRows(api.extractList(list));
      } else if (sectionNow === 'recharges') {
        const res = await api.get('/admin/payments/pending');
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'withdrawals') {
        const res = await api.get('/admin/withdrawals/pending');
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'notifications') {
        const res = await api.get('/notifications', { limit: 50, page: 1 }).catch(() =>
          api.get('/admin/notifications', { limit: 50 }).catch(() => ({}))
        );
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'role-applications') {
        const res = await api.get('/admin/role-applications/pending');
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'bd-hierarchy') {
        const [bds, agencies, rules] = await Promise.all([
          api.get('/admin/bd').catch(() => ({})),
          api.get('/admin/agencies').catch(() => ({})),
          api.get('/admin/commission-rules').catch(() => ({})),
        ]);
        if (seq !== loadSeqRef.current) return;
        setExtra({
          bds: api.extractList(bds),
          agencies: api.extractList(agencies),
          rules: api.extractList(rules),
        });
        setRows(api.extractList(bds));
      } else if (sectionNow === 'referrals') {
        const [ov, set] = await Promise.all([
          api.get('/referral/admin/overview').catch(() => ({})),
          api.get('/referral/admin/settings').catch(() => ({})),
        ]);
        if (seq !== loadSeqRef.current) return;
        setStats(api.unwrap(ov));
        setExtra({ settings: api.unwrap(set) });
      } else if (sectionNow === 'reviews') {
        const res = await api.get('/admin/reviews', { limit: 40 }).catch(() => ({}));
        if (seq !== loadSeqRef.current) return;
        setRows(api.extractList(res));
      } else if (sectionNow === 'analytics') {
        const [res, dash] = await Promise.all([
          api.get('/admin/analytics', { period: analyticsPeriodNow }),
          api.get('/admin/dashboard/stats').catch(() => ({})),
        ]);
        if (seq !== loadSeqRef.current) return;
        const a = api.unwrap(res) || {};
        const d = api.unwrap(dash) || {};
        const nested = d.stats || {};
        setStats({
          ...nested,
          ...a,
          users: a.users ?? a.totalUsers ?? nested.total_users,
          liveRooms: a.liveRooms ?? 0,
          giftsToday: a.giftsToday ?? 0,
          coinsMoved: a.coinsMoved ?? 0,
          newUsersToday: a.newUsersToday ?? 0,
          activeUsersDay: a.activeUsersDay ?? 0,
          agencies: a.agencies ?? 0,
          bds: a.bds ?? 0,
          sellers: a.sellers ?? 0,
          giftsPeriod: a.giftsPeriod ?? 0,
          coinsPeriod: a.coinsPeriod ?? 0,
          pendingBookings: a.pendingBookings ?? 0,
          pendingRecharges: a.pendingRecharges ?? 0,
          pendingWithdrawals: a.pendingWithdrawals ?? 0,
        });
        setExtra({ chart: a.revenueOverTime || [], popular: a.popularServices || [] });
      } else if (sectionNow === 'reports') {
        const res = await api.get('/admin/analytics', { period: reportPeriodNow }).catch(() => ({}));
        if (seq !== loadSeqRef.current) return;
        setStats(api.unwrap(res) || {});
        setRows([]);
      } else if (sectionNow === 'settings') {
        const res = await api.get('/admin/settings').catch(() => ({}));
        if (seq !== loadSeqRef.current) return;
        const s = api.unwrap(res) || {};
        if (s.platformName) setPlatformName(String(s.platformName));
        if (s.contactEmail) setContactEmail(String(s.contactEmail));
        if (s.platformFee != null) setPlatformFee(String(s.platformFee));
        if (s.minWithdrawal != null) setMinWithdrawal(String(s.minWithdrawal));
      }
      hasDataRef.current = true;
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const msg = e.message || 'Could not load admin data';
      if (!/route not found/i.test(msg)) setError(msg);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [api, can]);

  const loadRef = useRef(load);
  loadRef.current = load;
  const loadAccessRef = useRef(loadAccess);
  loadAccessRef.current = loadAccess;

  useEffect(() => {
    if (route.params?.section) {
      pendingSection.current = route.params.section;
      setSection(route.params.section);
    }
  }, [route.params?.section]);

  useEffect(() => {
    if (!accessReady) return;
    const want = pendingSection.current || section;
    if (want && allowed.some((m) => m.id === want) && want !== section) setSection(want);
    else if (!allowed.some((m) => m.id === section) && section !== 'overview') setSection('overview');
    pendingSection.current = null;
  }, [accessReady, allowed, section]);

  useEffect(() => {
    if (!accessReady) return;
    loadRef.current({ soft: false });
  }, [accessReady, section, analyticsPeriod]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        if (!accessOnceRef.current) {
          await loadAccessRef.current();
          accessOnceRef.current = true;
          return;
        }
        if (alive) await loadRef.current({ soft: true });
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const pullRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAccessRef.current();
      await loadRef.current({ soft: true });
    } finally {
      setRefreshing(false);
    }
  };

  const act = async (fn, ok) => {
    try {
      await fn();
      if (ok) Alert.alert('Done', ok);
      loadRef.current({ soft: true });
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  const toggleStaffCap = async (member, capId) => {
    if (member.isSuper) {
      Alert.alert('Full access', 'Super Admin always has every power.');
      return;
    }
    const current = Array.isArray(member.caps) ? member.caps : [];
    const next = current.includes(capId) ? current.filter((c) => c !== capId) : [...current, capId];
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, caps: next } : m)));
    try {
      await api.put(`/admin/staff/${member.id}/caps`, { caps: next });
    } catch (e) {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, caps: current } : m)));
      Alert.alert('Failed', e.message);
    }
  };

  const setStaffCaps = async (member, nextCaps) => {
    if (member.isSuper) return;
    const current = Array.isArray(member.caps) ? member.caps : [];
    const next = nextCaps.filter((c) => ALL_ADMIN_CAPS.includes(c));
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, caps: next } : m)));
    try {
      await api.put(`/admin/staff/${member.id}/caps`, { caps: next });
    } catch (e) {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, caps: current } : m)));
      Alert.alert('Failed', e.message);
    }
  };

  const resetStaffDefault = async (member) => {
    await setStaffCaps(member, DEFAULT_OPS_CAPS);
  };

  const saveAgora = async () => {
    setAgoraBusy(true);
    try {
      const body = { appId: agoraAppId, app_id: agoraAppId };
      if (agoraCert.trim()) {
        body.primaryCertificate = agoraCert.trim();
        body.certificate = agoraCert.trim();
      }
      await api.put('/admin/platform/agora', body).catch(() => api.post('/admin/platform/agora', body));
      Alert.alert('Saved', 'Agora credentials updated');
      setAgoraCert('');
      loadRef.current({ soft: true });
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setAgoraBusy(false);
    }
  };

  const assignBd = async () => {
    const q = bdAssignRef.trim();
    if (!q) return Alert.alert('Need user', 'Enter email or User ID');
    try {
      let userId = q;
      if (!/^[0-9a-f-]{36}$/i.test(q)) {
        const found = await api.get('/admin/users', { search: q, limit: 10 });
        const list = api.extractList(found);
        const lower = q.toLowerCase();
        const hit =
          list.find((u) => String(u.email || '').toLowerCase() === lower) ||
          list.find((u) => String(u.display_id) === q) ||
          list[0];
        if (!hit?.id) throw new Error('User not found');
        userId = hit.id;
      }
      const res = await api.post('/admin/bd/assign', { user_id: userId });
      const d = api.unwrap(res) || {};
      Alert.alert('BD assigned', d.promo_code ? `Promo code: ${d.promo_code}` : 'BD created');
      setBdAssignRef('');
      loadRef.current({ soft: true });
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  const collected = stats.totalCollected || stats.total_collected || stats.revenue || stats.payments_total || stats.collected || 0;
  const pendingPay =
    stats.pendingPayouts ||
    stats.pending_payouts ||
    stats.pendingWithdrawals ||
    extra.pendingWithdrawals?.reduce?.((s, w) => s + Number(w.amount || w.points || 0), 0) ||
    0;
  const fees = stats.platformFees || stats.platform_fees || stats.fees || 0;
  const pendingRev = extra.pendingReviews?.length || stats.pendingReviews || stats.reviews_pending || 0;
  const agora = extra.agora || {};
  const certHint = maskSecret(agora.certificate || agora.primaryCertificate || agora.cert);
  const currentMod = MODULES.find((m) => m.id === section) || MODULES[0];
  const pendingWdCount = extra.pendingWithdrawals?.length || 0;
  const pendingPayCount = extra.pendingPayments?.length || 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Ionicons name="chevron-back" size={22} color="#F4F4F5" />
              </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>{superAdmin ? 'Control Center' : 'Admin Desk'}</Text>
          <Text style={styles.topSub}>{currentMod.label}</Text>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.menuBtn}>
          <Ionicons name="menu" size={20} color="#fff" />
          <Text style={styles.menuBtnT}>Menu</Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBg} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuTitle}>Admin menu</Text>
            <Text style={styles.menuHint}>Pick a tool — no crowded tabs</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {allowed.map((m) => {
                const on = section === m.id;
                    return (
                      <Pressable
                    key={m.id}
                    onPress={() => {
                      setMenuOpen(false);
                      goSection(m.id);
                    }}
                    style={[styles.menuRow, on && styles.menuRowOn]}
                  >
                    <View style={[styles.menuIcon, on && styles.menuIconOn]}>
                      <Ionicons name={m.icon} size={18} color={on ? '#fff' : '#FBBF24'} />
                </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuLabel, on && styles.menuLabelOn]}>{m.label}</Text>
                      <Text style={styles.menuDesc}>{m.hint}</Text>
            </View>
                    {on ? <Ionicons name="checkmark-circle" size={18} color="#FBBF24" /> : null}
                  </Pressable>
          );
        })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {section !== 'overview' ? (
        <View style={styles.sectionHead}>
          <Pressable onPress={() => setSection('overview')} style={styles.backHome}>
            <Ionicons name="arrow-back" size={16} color="#FBBF24" />
            <Text style={styles.backHomeT}>Home</Text>
          </Pressable>
          {currentMod.how ? <Text style={styles.how}>{currentMod.how}</Text> : null}
      </View>
      ) : null}
      <ErrorBanner message={error} onRetry={() => loadRef.current()} />
      {loading && !hasDataRef.current ? <Text style={styles.loadingHint}>Loading…</Text> : null}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor="#FBBF24" />}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
          {section === 'overview' ? (
            <View>
              <LinearGradient colors={['#1F2937', '#111827']} style={styles.hero}>
                <Text style={styles.heroEyebrow}>{superAdmin ? 'SUPER ADMIN' : 'ADMIN DESK'}</Text>
                <Text style={styles.heroTitle}>{superAdmin ? 'You run the whole platform' : 'Payments, withdrawals & live tools'}</Text>
                <Text style={styles.heroSub}>
                  {superAdmin
                    ? 'Open Menu for any module, or assign powers to each Admin.'
                    : 'Open Menu for tools you are allowed to use.'}
                </Text>
              </LinearGradient>
              <View style={styles.quickRow}>
                {can('payments') ? (
                  <Pressable onPress={() => goSection('recharges')} style={styles.quickCard}>
                    <Text style={styles.quickK}>Waiting payments</Text>
                    <Text style={styles.quickV}>{pendingPayCount}</Text>
                    <Text style={styles.quickHint}>Tap to review</Text>
                  </Pressable>
                ) : null}
                {can('withdrawals') ? (
                  <Pressable onPress={() => goSection('withdrawals')} style={styles.quickCard}>
                    <Text style={styles.quickK}>Waiting withdrawals</Text>
                    <Text style={styles.quickV}>{pendingWdCount}</Text>
                    <Text style={styles.quickHint}>Tap to review</Text>
                  </Pressable>
                ) : null}
              </View>
              {can('payments', 'withdrawals', 'analytics') ? (
              <View style={styles.statGrid}>
                {[
                    ['Collected', rupees(collected)],
                    ['Pending payouts', rupees(pendingPay)],
                    ...(superAdmin
                      ? [
                          ['Platform fees', rupees(fees)],
                          ['Pending reviews', String(pendingRev)],
                        ]
                      : []),
                ].map(([k, v]) => (
                  <View key={k} style={styles.statCard}>
                    <Text style={styles.statK}>{k}</Text>
                    <Text style={styles.statV}>{v}</Text>
                  </View>
                ))}
              </View>
              ) : null}
              <Text style={styles.homeSec}>Your tools</Text>
              <View style={styles.tileGrid}>
                {allowed
                  .filter((m) => m.id !== 'overview')
                  .map((m, idx) => {
                    const palettes = [
                      ['#312E81', '#4F46E5'],
                      ['#9F1239', '#E11D48'],
                      ['#065F46', '#10B981'],
                      ['#92400E', '#F59E0B'],
                      ['#1E3A8A', '#3B82F6'],
                      ['#701A75', '#D946EF'],
                      ['#164E63', '#06B6D4'],
                      ['#3F3F46', '#A1A1AA'],
                    ];
                    const colors = palettes[idx % palettes.length];
                    return (
                      <PressScale key={m.id} onPress={() => goSection(m.id)} style={styles.tile} scaleTo={0.97}>
                        <LinearGradient colors={colors} style={styles.tileGrad}>
                          <View style={[styles.tileIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                            <Ionicons name={m.icon} size={22} color="#fff" />
                            {(m.id === 'recharges' && pendingPayCount > 0) || (m.id === 'withdrawals' && pendingWdCount > 0) ? (
                              <View style={styles.tileBadge}>
                                <Text style={styles.tileBadgeT}>
                                  {(m.id === 'recharges' ? pendingPayCount : pendingWdCount) > 99
                                    ? '99+'
                                    : m.id === 'recharges'
                                      ? pendingPayCount
                                      : pendingWdCount}
                                </Text>
                </View>
                            ) : null}
                          </View>
                          <Text style={[styles.tileTitle, { color: '#fff' }]}>{m.label}</Text>
                          <Text style={[styles.tileHint, { color: 'rgba(255,255,255,0.82)' }]} numberOfLines={2}>
                            {m.hint}
                          </Text>
                          <View style={styles.tileGo}>
                            <Text style={[styles.tileGoT, { color: '#fff' }]}>Open</Text>
                            <Ionicons name="chevron-forward" size={14} color="#fff" />
                          </View>
                        </LinearGradient>
                      </PressScale>
                    );
                  })}
              </View>
            </View>
          ) : null}

          {section === 'staff' && superAdmin ? (
            <View style={{ paddingHorizontal: 12 }}>
              <DeskCard style={{ padding: 14, marginBottom: 12 }}>
                <Text style={styles.h}>Staff powers</Text>
                <Text style={styles.meta}>
                  Ops Admins start with Payments, Withdrawals & Agora. Tap a permission to toggle. Use Grant all / Clear / Defaults for bulk changes.
                </Text>
              </DeskCard>
              {!staff.length ? <EmptyState title="No staff accounts yet" /> : null}
              {staff.map((member) => {
                const caps = Array.isArray(member.caps) ? member.caps : [];
                const capList = catalog.length ? catalog : ADMIN_CAP_CATALOG;
                return (
                  <DeskCard key={member.id} style={{ padding: 14, marginBottom: 12 }}>
                    <View style={styles.staffHead}>
                      <Avatar uri={member.profilePic || member.profile_pic} name={member.name} size={44} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.rowTitle}>{member.name}</Text>
                        <View style={styles.badgeRow}>
                          <RoleBadge role={member.role} />
                          <StatusPill active={member.isActive !== false} />
                        </View>
                        <Text style={styles.meta}>
                          ID {member.displayId || '—'}{member.email ? ` · ${member.email}` : ''}
                        </Text>
                        <Text style={styles.meta}>{caps.length} / {capList.length} powers on</Text>
                      </View>
                      {member.isSuper ? (
                        <View style={styles.superPill}>
                          <Text style={styles.superPillT}>Full access</Text>
                        </View>
                      ) : null}
                    </View>
                    {!member.isSuper ? (
                      <>
                        <View style={styles.staffBulk}>
                          <Pressable onPress={() => setStaffCaps(member, ALL_ADMIN_CAPS)} style={styles.staffBulkBtn}>
                            <Text style={styles.staffBulkT}>Grant all</Text>
              </Pressable>
                          <Pressable onPress={() => setStaffCaps(member, DEFAULT_OPS_CAPS)} style={styles.staffBulkBtn}>
                            <Text style={styles.staffBulkT}>Defaults</Text>
                </Pressable>
                          <Pressable onPress={() => setStaffCaps(member, [])} style={[styles.staffBulkBtn, { backgroundColor: '#3F3F46' }]}>
                            <Text style={styles.staffBulkT}>Clear</Text>
                </Pressable>
              </View>
                        <View style={styles.capGrid}>
                          {capList.map((cap) => {
                            const on = caps.includes(cap.id);
                            return (
                              <Pressable key={cap.id} onPress={() => toggleStaffCap(member, cap.id)} style={[styles.capChip, on && styles.capChipOn]}>
                                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={on ? '#fff' : '#FBBF24'} />
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.capChipT, on && styles.capChipTOn]}>{cap.label || cap.id}</Text>
                                  {cap.desc ? (
                                    <Text style={[styles.capChipD, on && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>
                                      {cap.desc}
                                    </Text>
                                  ) : null}
                </View>
                    </Pressable>
                            );
                          })}
                </View>
                      </>
                    ) : (
                      <Text style={[styles.meta, { marginTop: 8 }]}>Cannot be limited — Super Admin always has every power.</Text>
                    )}
                  </DeskCard>
                );
              })}
            </View>
          ) : null}

          {section === 'platform' ? (
            <View>
              <DeskCard style={styles.agoraCard}>
                <View style={styles.agoraTitleRow}>
                  <Ionicons name="radio-outline" size={20} color="#111" />
                  <Text style={styles.agoraTitle}>Agora Live Credentials</Text>
                </View>
                <Text style={styles.agoraHelp}>Update App ID and Primary Certificate without SSH. Changes apply immediately to live/party voice.</Text>
                <Text style={styles.fieldL}>App ID</Text>
                <TextInput
                  value={agoraAppId}
                  onChangeText={setAgoraAppId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Text style={styles.fieldL}>Primary Certificate</Text>
                <TextInput
                  value={agoraCert}
                  onChangeText={setAgoraCert}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={certHint ? `Current: ${certHint} — paste new to replace` : 'Paste new certificate to replace'}
                  placeholderTextColor={"#71717A"}
                  style={styles.input}
                />
                <Text style={styles.note}>Current certificate is hidden. Paste a new one to replace.</Text>
                <View style={styles.readyBox}>
                  <Ionicons name="information-circle" size={20} color="#FBBF24" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readyT}>Ready · App ID</Text>
                    <Text style={styles.readyId}>{agoraAppId || 'Not set'}</Text>
                  </View>
                </View>
                <Pressable onPress={saveAgora} disabled={agoraBusy} style={styles.saveAgora}>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.saveAgoraT}>{agoraBusy ? 'Saving…' : 'Save Agora credentials'}</Text>
                </Pressable>
              </DeskCard>
              <DeskCard>
                <Kv k="Live rooms" v={extra.live?.rooms || extra.live?.activeRooms || extra.live?.count} />
              </DeskCard>
            </View>
          ) : null}

          {section === 'notifications' ? (
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={styles.disclaimer}>Platform alerts only (withdrawals, recharges, role apps, seller top-ups). Personal chat messages are not shown.</Text>
              {!rows.length ? <EmptyState title="No platform alerts" /> : null}
              {rows.map((item, i) => (
                <Pressable
                  key={String(item.id || i)}
                  onPress={() => act(() => api.put(`/notifications/${item.id}/read`), '')}
                  style={styles.alertCard}
                >
                  <View style={styles.alertTop}>
                    <Text style={styles.alertTitle}>{item.title || item.type || 'Alert'}</Text>
                    <Text style={styles.alertWhen}>{fmtWhen(item.created_at || item.createdAt || item.time)}</Text>
                  </View>
                  <Text style={styles.alertBody}>{item.message || item.body || item.description || ''}</Text>
                  <Text style={styles.alertTag}>{String(item.type || item.kind || 'ALERT').toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {['users', 'workers', 'services', 'bookings', 'payments', 'recharges', 'withdrawals', 'role-applications', 'reviews'].includes(section) ? (
            <View>
              {['users', 'workers', 'bookings'].includes(section) ? (
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  onSubmitEditing={() => loadRef.current()}
                  placeholder={section === 'users' ? 'Search name, email, ID' : 'Search'}
                  placeholderTextColor={"#71717A"}
                  style={styles.search}
                />
              ) : null}
              {!rows.length && !loading ? (
                <EmptyState
                  title={section === 'recharges' ? 'No pending payments' : section === 'withdrawals' ? 'No pending withdrawals' : section === 'role-applications' ? 'No applications waiting' : section === 'users' ? 'No users found' : 'Nothing here yet'}
                  subtitle={section === 'recharges' ? 'Approved requests leave this queue automatically.' : undefined}
                />
              ) : null}
              {rows.map((item, i) => {
                const id = item.id || item.userId || item.bookingId || item.booking_id || i;
                const title = personTitle(item) || nameOf(item);
                const pic = item.profile_pic || item.profilePic || item.avatar || item.photo;
                const paySource = item.source === 'coin_seller_recharges' ? 'coin_seller_recharges' : 'recharges';
                const amountLabel =
                  item.amount_display ||
                  (item.amount_inr != null ? rupees(item.amount_inr) : null) ||
                  (item.amount != null ? String(item.amount) : null) ||
                  (item.points != null ? `${indianGroup(item.points)} pts` : null);
                const displayId = formatUserDisplayId(item) || item.display_id || '';
                const roleVal = item.request_type_label || item.role_requested || item.role || item.type || 'user';

                if (section === 'users') {
                return (
                    <DeskCard key={String(id)} style={styles.userCard}>
                      <View style={styles.userHead}>
                        <Avatar uri={pic} name={title} size={54} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={styles.userTitleRow}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                            <StatusPill active={item.is_active !== false} />
                          </View>
                          <View style={styles.badgeRow}>
                            <RoleBadge role={roleVal} />
                            {item.is_verified ? (
                              <View style={styles.verifyChip}><Text style={styles.verifyChipT}>Verified</Text></View>
                            ) : null}
                          </View>
                          <Text style={styles.meta}>ID {displayId || '—'}{item.email ? ` · ${item.email}` : ''}</Text>
                          {item.phone ? <Text style={styles.meta}>📞 {item.phone}</Text> : null}
                        </View>
                      </View>
                      <View style={styles.userKv}>
                        <View style={styles.userKvCell}>
                          <Text style={styles.userKvK}>Joined</Text>
                          <Text style={styles.userKvV}>
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                    </Text>
                        </View>
                        <View style={styles.userKvCell}>
                          <Text style={styles.userKvK}>Last seen</Text>
                          <Text style={styles.userKvV} numberOfLines={1}>
                            {lastSeenOf(item).text}
                          </Text>
                        </View>
                        <View style={styles.userKvCell}>
                          <Text style={styles.userKvK}>Roles</Text>
                          <Text style={styles.userKvV} numberOfLines={1}>
                            {(Array.isArray(item.roles) && item.roles.length ? item.roles : [roleVal]).slice(0, 2).join(', ')}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rowBtns}>
                        <SoftBtn
                          compact
                          tone="slate"
                          title={item.is_active === false ? 'Activate' : 'Deactivate'}
                          onPress={() =>
                            act(() => api.put(`/admin/users/${id}/status`, { is_active: item.is_active === false }), 'User updated')
                          }
                        />
                        <SoftBtn
                          compact
                          title="Open details"
                          onPress={() => navigation.navigate('AdminUserDetails', { userId: id })}
                        />
                      </View>
                    </DeskCard>
                  );
                }

                return (
                  <DeskCard key={String(id) + String(i)}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Avatar uri={pic} name={title} size={46} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{title}</Text>
                        <View style={[styles.badgeRow, { marginTop: 4 }]}>
                          <RoleBadge role={roleVal} />
                      </View>
                        <Text style={styles.meta} numberOfLines={2}>
                          {[
                            item.email,
                            amountLabel,
                            item.estimated_coins != null ? `${indianGroup(item.estimated_coins)} coins` : null,
                            item.package_label,
                            item.status,
                          ]
                            .filter((v) => v != null && v !== '')
                            .slice(0, 4)
                            .join(' · ')}
                        </Text>
                      </View>
                    </View>
                    {section === 'workers' ? (
                      <View style={styles.rowBtns}>
                        <SoftBtn tone="emerald" title="Approve" onPress={() => act(() => api.put(`/admin/workers/${id}/approve`, { status: 'approved' }), 'Approved')} />
                        <SoftBtn tone="slate" title="Reject" onPress={() => act(() => api.put(`/admin/workers/${id}/approve`, { status: 'rejected' }), 'Rejected')} />
                      </View>
                    ) : null}
                    {section === 'recharges' ? (
                      <View style={styles.rowBtns}>
                        <SoftBtn
                          tone="emerald"
                          title="Approve"
                          onPress={() =>
                            act(() => api.post(`/admin/payments/${paySource}/${id}/approve`, {}), 'Payment approved')
                          }
                        />
                        <SoftBtn
                          tone="slate"
                          title="Reject"
                          onPress={() =>
                            act(
                              () => api.post(`/admin/payments/${paySource}/${id}/reject`, { notes: 'Rejected by admin' }),
                              'Rejected'
                            )
                          }
                        />
                      </View>
                    ) : null}
                    {section === 'withdrawals' ? (
                      <View style={styles.rowBtns}>
                        <SoftBtn tone="emerald" title="Approve payout" onPress={() => act(() => api.post(`/admin/withdrawals/${id}/approve`, {}), 'Withdrawal approved')} />
                        <SoftBtn tone="slate" title="Reject" onPress={() => act(() => api.post(`/admin/withdrawals/${id}/reject`, { notes: 'Rejected by admin' }), 'Rejected')} />
                      </View>
                    ) : null}
                    {section === 'role-applications' ? (
                      <View style={styles.rowBtns}>
                        <SoftBtn tone="emerald" title="Approve" onPress={() => act(() => api.post(`/admin/role-applications/${id}/review`, { decision: 'approved' }), 'Approved')} />
                        <SoftBtn tone="slate" title="Reject" onPress={() => act(() => api.post(`/admin/role-applications/${id}/review`, { decision: 'rejected', reason: 'Not approved at this time' }), 'Rejected')} />
                      </View>
                    ) : null}
                    {section === 'payments' && (item.bookingId || item.booking_id || item.id) ? (
                      <View style={styles.rowBtns}>
                        <SoftBtn
                          tone="emerald"
                          title="Approve"
                          onPress={() =>
                            act(() => api.put(`/admin/payments/${item.bookingId || item.booking_id || id}/approve`, {}), 'Approved')
                          }
                        />
                      </View>
                    ) : null}
                  </DeskCard>
                );
              })}
            </View>
          ) : null}

          {section === 'bd-hierarchy' ? (
            <View style={{ paddingHorizontal: 4 }}>
              <LinearGradient colors={['#9A3412', '#FF8C00']} style={styles.bdHero}>
                <View style={styles.bdHeroBadge}><Text style={styles.bdHeroBadgeT}>BD NETWORK</Text></View>
                <Text style={styles.bdHeroTitle}>Business Development</Text>
                <Text style={styles.bdHeroSub}>Assign BD accounts, share promo codes, and track agencies under each BD.</Text>
                <View style={styles.bdHeroStats}>
                  <View style={styles.bdHeroStat}>
                    <Text style={styles.bdHeroStatV}>{extra.bds?.length || 0}</Text>
                    <Text style={styles.bdHeroStatK}>BDs</Text>
                  </View>
                  <View style={styles.bdHeroStat}>
                    <Text style={styles.bdHeroStatV}>{extra.agencies?.length || 0}</Text>
                    <Text style={styles.bdHeroStatK}>Agencies</Text>
                  </View>
                </View>
              </LinearGradient>

              <DeskCard style={{ padding: 14 }}>
                <Text style={styles.h}>Make a user BD</Text>
                <Text style={styles.meta}>Enter email or public User ID — they get a promo code for Agency/Host apps.</Text>
                <TextInput
                  value={bdAssignRef}
                  onChangeText={setBdAssignRef}
                  placeholder="Email or User ID"
                  placeholderTextColor="#71717A"
                  style={styles.input}
                  autoCapitalize="none"
                />
                <SoftBtn title="Assign as BD" tone="amber" onPress={assignBd} />
              </DeskCard>

              <Text style={styles.homeSec}>BD accounts</Text>
              {!extra.bds?.length ? <EmptyState title="No BDs yet" subtitle="Assign a user above to create the first BD." /> : null}
              {(extra.bds || []).map((b, i) => {
                const name = b.display_name || personTitle(b) || nameOf(b);
                const pic = b.profile_pic || b.profilePic;
                const code = b.promo_code || b.code || '—';
                const uid = b.user_id || b.id;
                return (
                  <DeskCard key={String(uid || i)} style={styles.bdCard}>
                    <View style={styles.userHead}>
                      <Avatar uri={pic} name={name} size={50} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.userTitleRow}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
                          <RoleBadge role="bd" />
                        </View>
                        <Text style={styles.meta}>ID {formatUserDisplayId(b) || b.display_id || '—'}{b.email ? ` · ${b.email}` : ''}</Text>
                      </View>
                    </View>
                    <View style={styles.bdCodeBox}>
                      <Text style={styles.bdCodeK}>Agency promo code</Text>
                      <Text style={styles.bdCodeV}>{code}</Text>
                    </View>
                    <View style={styles.userKv}>
                      <View style={styles.userKvCell}>
                        <Text style={styles.userKvK}>Agencies</Text>
                        <Text style={styles.userKvV}>{indianGroup(b.agency_count ?? b.agencies ?? 0)}</Text>
                      </View>
                      <View style={styles.userKvCell}>
                        <Text style={styles.userKvK}>Hosts</Text>
                        <Text style={styles.userKvV}>{indianGroup(b.host_count ?? b.hosts ?? 0)}</Text>
                      </View>
                    </View>
                    <View style={styles.rowBtns}>
                      {uid ? (
                        <SoftBtn
                          compact
                          title="Open user"
                          onPress={() => navigation.navigate('AdminUserDetails', { userId: uid })}
                        />
                      ) : null}
                      {uid ? (
                        <SoftBtn
                          compact
                          tone="slate"
                          title="Remove BD"
                          onPress={() =>
                            act(() => api.delete(`/admin/bd/${uid}`), 'BD removed')
                          }
                        />
                      ) : null}
                    </View>
                  </DeskCard>
                );
              })}

              {(extra.agencies || []).length ? (
                <>
                  <Text style={styles.homeSec}>Agencies</Text>
                  {(extra.agencies || []).slice(0, 20).map((a, i) => (
                    <DeskCard key={String(a.id || i)} style={{ padding: 12, marginBottom: 8 }}>
                      <View style={styles.userHead}>
                        <Avatar uri={a.profile_pic || a.ownerPic} name={a.name || a.agency_name || 'Agency'} size={42} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.rowTitle}>{a.name || a.agency_name || 'Agency'}</Text>
                          <Text style={styles.meta}>Owner {a.owner_name || a.owner || '—'} · Hosts {a.host_count ?? a.hosts ?? 0}</Text>
                        </View>
                        <RoleBadge role="agency" />
                      </View>
                    </DeskCard>
                  ))}
                </>
              ) : null}

              <DeskCard style={{ padding: 14, marginTop: 8 }}>
                <Text style={styles.h}>Commission rules</Text>
                {(extra.rules || []).length ? (extra.rules || []).map((r, i) => (
                  <View key={String(i)} style={styles.ruleRow}>
                    <RoleBadge role={r.role || r.name} />
                    <Text style={[styles.rowTitle, { flex: 1, marginLeft: 10 }]}>{friendlyKey(r.role || r.name)}</Text>
                    <Text style={styles.rulePct}>{r.percentage || r.percent || 0}%</Text>
                  </View>
                )) : <Text style={styles.meta}>No commission rules configured.</Text>}
              </DeskCard>
            </View>
          ) : null}

          {section === 'referrals' ? (
            <DeskCard>
              <Text style={styles.h}>Referrals</Text>
              <Kv k="Invites" v={stats.invites || stats.total || stats.count} />
              <Kv k="Converted" v={stats.converted || stats.joins} />
            </DeskCard>
          ) : null}

          {section === 'analytics' ? (
            <View style={{ paddingHorizontal: 12 }}>
              <View style={styles.periodRow}>
                {['week', 'month', 'year'].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setAnalyticsPeriod(p)}
                    style={[styles.periodChip, analyticsPeriod === p && styles.periodChipOn]}
                  >
                    <Text style={[styles.periodT, analyticsPeriod === p && styles.periodTOn]}>
                      {p === 'week' ? '7 days' : p === 'month' ? '30 days' : 'Year'}
                    </Text>
                    </Pressable>
                  ))}
                </View>
              <Text style={styles.h}>People</Text>
              <View style={styles.statGrid}>
                {[
                  ['Users', indianGroup(stats.users || stats.total_users || 0), ['#1E3A8A', '#3B82F6']],
                  ['New today', indianGroup(stats.newUsersToday || 0), ['#065F46', '#10B981']],
                  ['New (7d)', indianGroup(stats.newUsersWeek || 0), ['#064E3B', '#34D399']],
                  ['Active (24h)', indianGroup(stats.activeUsersDay || 0), ['#4C1D95', '#A78BFA']],
                  ['Hosts', indianGroup(stats.hosts || stats.total_workers || 0), ['#9F1239', '#FB7185']],
                  ['Agencies', indianGroup(stats.agencies || 0), ['#5B21B6', '#C084FC']],
                  ['BDs', indianGroup(stats.bds || 0), ['#9A3412', '#FB923C']],
                  ['Sellers', indianGroup(stats.sellers || 0), ['#854D0E', '#FBBF24']],
                ].map(([k, v, colors]) => (
                  <LinearGradient key={k} colors={colors} style={styles.metricGrad}>
                    <Text style={styles.metricGradK}>{k}</Text>
                    <Text style={styles.metricGradV}>{String(v)}</Text>
                  </LinearGradient>
                  ))}
                </View>
              <Text style={styles.h}>Live & gifts</Text>
              <View style={styles.statGrid}>
                {[
                  ['Live now', indianGroup(stats.liveRooms || 0), ['#164E63', '#06B6D4']],
                  ['Gifts today', indianGroup(stats.giftsToday || 0), ['#9F1239', '#E11D48']],
                  ['Coins today', indianGroup(stats.coinsMoved || 0), ['#92400E', '#F59E0B']],
                  ['Gifts period', indianGroup(stats.giftsPeriod || 0), ['#701A75', '#D946EF']],
                  ['Coins period', indianGroup(stats.coinsPeriod || 0), ['#7C2D12', '#F97316']],
                  ['Pending top-ups', indianGroup(stats.pendingRecharges || 0), ['#1E3A8A', '#60A5FA']],
                ].map(([k, v, colors]) => (
                  <LinearGradient key={k} colors={colors} style={styles.metricGrad}>
                    <Text style={styles.metricGradK}>{k}</Text>
                    <Text style={styles.metricGradV}>{String(v)}</Text>
                  </LinearGradient>
                ))}
              </View>
              <DeskCard>
                <Text style={styles.h}>Revenue trend</Text>
                <Text style={styles.meta}>Bookings revenue · {analyticsPeriod}</Text>
                <MiniBars series={extra.chart || stats.revenueOverTime || []} color="#38BDF8" />
              </DeskCard>
              <DeskCard>
                <Text style={styles.h}>Bookings bars</Text>
                <MiniBars
                  series={(extra.chart || stats.revenueOverTime || []).map((r) => ({ value: r.bookings || r.count || 0 }))}
                  color="#A78BFA"
                />
              </DeskCard>
              <DeskCard>
                <Text style={styles.h}>Popular services</Text>
                {(extra.popular || stats.popularServices || []).length ? (
                  (extra.popular || stats.popularServices || []).map((s, i) => {
                    const colors = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#FB7185'];
                    return (
                      <View key={String(s.name || i)} style={styles.popRow}>
                        <Text style={styles.popName}>{s.name || 'Service'}</Text>
                        <View style={styles.popTrack}>
                          <View
                            style={[
                              styles.popFill,
                              {
                                backgroundColor: colors[i % colors.length],
                                width: `${Math.min(
                                  100,
                                  (Number(s.booking_count || 0) /
                                    Math.max(
                                      1,
                                      ...(extra.popular || stats.popularServices || []).map((x) => Number(x.booking_count || 0))
                                    )) *
                                    100
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.popN}>{indianGroup(s.booking_count || 0)}</Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.meta}>No service bookings in this window.</Text>
                )}
              </DeskCard>
              <DeskCard>
                <Text style={styles.h}>Money & ops</Text>
                <Kv k="Total revenue" v={rupees(stats.totalRevenue || stats.total_revenue || collected)} />
                <Kv k="Platform fees" v={rupees(stats.platformFees || stats.platform_fees || fees)} />
                <Kv k="Completed bookings" v={indianGroup(stats.completedBookings || stats.completed_bookings || 0)} />
                <Kv k="Pending bookings" v={indianGroup(stats.pendingBookings || 0)} />
                <Kv k="Pending withdrawals" v={indianGroup(stats.pendingWithdrawals || 0)} />
                <Kv k="Pending recharges" v={indianGroup(stats.pendingRecharges || 0)} />
              </DeskCard>
            </View>
          ) : null}

          {section === 'reports' ? (
            <View style={{ paddingHorizontal: 12 }}>
              <DeskCard>
                <Text style={styles.h}>Quick report</Text>
                <Text style={styles.meta}>Pick a window — charts use live analytics (no dead report tabs).</Text>
                <View style={styles.periodRow}>
                  {['week', 'month', 'year'].map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => {
                        setReportPeriod(p);
                        setAnalyticsPeriod(p);
                        goSection('analytics');
                      }}
                      style={[styles.periodChip, reportPeriod === p && styles.periodChipOn]}
                    >
                      <Text style={[styles.periodT, reportPeriod === p && styles.periodTOn]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <SoftBtn title="Open analytics charts" onPress={() => goSection('analytics')} />
              </DeskCard>
            </View>
          ) : null}

          {section === 'settings' && can('settings') ? (
            <View>
              <DeskCard>
                <Text style={styles.h}>Platform Settings</Text>
                <Text style={styles.meta}>Platform Name</Text>
                <TextInput value={platformName} onChangeText={setPlatformName} style={styles.input} />
                <Text style={styles.meta}>Contact Email</Text>
                <TextInput value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" style={styles.input} />
                <Text style={styles.meta}>Platform Fee (%)</Text>
                <TextInput value={platformFee} onChangeText={setPlatformFee} keyboardType="numeric" style={styles.input} />
                <Text style={styles.meta}>Minimum Withdrawal</Text>
                <TextInput value={minWithdrawal} onChangeText={setMinWithdrawal} keyboardType="numeric" style={styles.input} />
                <GoldButton
                  title="Save settings"
                  onPress={() =>
                    act(
                      () =>
                        api.put('/admin/settings', {
                          platformName,
                          contactEmail,
                          platformFee: Number(platformFee),
                          minWithdrawal: Number(minWithdrawal),
                        }).catch(() => api.post('/admin/announcements', { title: 'Settings', message: `Platform: ${platformName}` })),
                      'Settings saved'
                    )
                  }
                />
              </DeskCard>
              {superAdmin ? (
                <DeskCard>
                <Text style={styles.h}>Set user wallet</Text>
                  <Text style={styles.meta}>Super Admin only</Text>
                  <TextInput value={walletUser} onChangeText={setWalletUser} placeholder="User ID" placeholderTextColor={"#71717A"} style={styles.input} />
                  <TextInput value={walletCoins} onChangeText={setWalletCoins} placeholder="Coins" keyboardType="numeric" placeholderTextColor={"#71717A"} style={styles.input} />
                <GoldButton
                  title="Update wallet"
                  onPress={() =>
                    act(() => api.put(`/admin/users/${walletUser}/wallet`, { coins: Number(walletCoins) }), 'Wallet updated')
                  }
                />
                </DeskCard>
              ) : null}
              <DeskCard>
                <Text style={styles.h}>Announcement</Text>
                <TextInput value={announce} onChangeText={setAnnounce} placeholder="Message to all users" placeholderTextColor={"#71717A"} style={styles.input} multiline />
                <GoldButton title="Send announcement" onPress={() => act(() => api.post('/admin/announcements', { message: announce, title: 'Announcement' }), 'Sent')} />
              </DeskCard>
              <GoldButton title="Log out" onPress={logout} style={styles.btn} />
            </View>
          ) : null}

          <Text style={styles.who}>
            Signed in as {user?.email || user?.first_name || 'admin'}
            {superAdmin ? ' · Super Admin' : ' · Admin'}
          </Text>
        </ScrollView>
    </View>
  );
}

export function AdminUserDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { userId } = route.params || {};
  const { api, user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const allowed = hasAdminCap(user, 'users') || superAdmin;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [coins, setCoins] = useState('');
  const [points, setPoints] = useState('');
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const reload = useCallback(() => {
    if (!allowed) {
      setError('Only Super Admin (or users capability) can open user details.');
      return;
    }
    api
      .get(`/admin/users/${userId}`)
      .then((r) => {
        const d = api.unwrap(r);
        setData(d);
        setRole(d?.role || '');
        setCoins(String(d?.coin_balance ?? d?.wallet?.coins ?? d?.wallet?.coin_balance ?? 0));
        setPoints(String(d?.star_balance ?? d?.stars ?? d?.wallet?.stars ?? d?.wallet?.star_balance ?? d?.points ?? 0));
      })
      .catch((e) => setError(e.message));
  }, [allowed, api, userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const act = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      if (ok) Alert.alert('Done', ok);
      reload();
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setBusy('');
    }
  };

  const saveWallet = () => {
    if (!superAdmin) {
      Alert.alert('Super Admin only', 'Only Super Admin can edit coins and points.');
      return;
    }
    const coinN = Number(coins);
    const pointN = Number(points);
    if (!Number.isFinite(coinN) || coinN < 0 || !Number.isFinite(pointN) || pointN < 0) {
      Alert.alert('Invalid', 'Enter valid non-negative coins and points.');
      return;
    }
    act(
      'wallet',
      () =>
        api.put(`/admin/users/${userId}/wallet`, {
          coins: coinN,
          points: pointN,
          coin_balance: coinN,
          star_balance: pointN,
        }),
      'Wallet updated'
    );
  };

  if (!allowed) {
  return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
            <Ionicons name="chevron-back" size={22} color="#F4F4F5" />
          </Pressable>
          <Text style={styles.topTitle}>User details</Text>
          </View>
        <EmptyState title="Access denied" subtitle="Ask Super Admin for the Users capability." />
          </View>
    );
  }

  if (!data && !error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Loading label="Loading user…" />
        </View>
    );
  }

  const title = nameOf(data || {});
  const pic = data?.profile_pic || data?.profilePic;
  const displayId = formatUserDisplayId(data) || data?.display_id || '—';
  const walletCoins = Number(data?.coin_balance ?? data?.wallet?.coins ?? 0);
  const walletPoints = Number(data?.star_balance ?? data?.stars ?? data?.points ?? 0);
  const roles = Array.isArray(data?.roles) && data.roles.length ? data.roles : [data?.role || 'user'];
  const active = data?.is_active !== false;

  const Chip = ({ icon, label, onPress, tone = 'slate', disabled }) => {
    const bg =
      tone === 'rose'
        ? '#E11D48'
        : tone === 'emerald'
          ? '#059669'
          : tone === 'amber'
            ? '#D97706'
            : '#27272A';
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || !!busy}
        style={[styles.detailChip, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }]}
      >
        {icon ? <Ionicons name={icon} size={14} color="#fff" /> : null}
        <Text style={styles.detailChipT}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Ionicons name="chevron-back" size={22} color="#F4F4F5" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>User dossier</Text>
          <Text style={styles.topSub}>ID {displayId}</Text>
        </View>
        <Pressable onPress={reload} style={styles.topBtn}>
          <Ionicons name="refresh" size={18} color="#FBBF24" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <ErrorBanner message={error} onRetry={reload} />

        <LinearGradient colors={['#1F2937', '#111827', '#0B0B10']} style={styles.detailHero}>
          <View style={styles.detailHeroRow}>
            <View style={styles.detailAvRing}>
              <Avatar uri={pic} name={title} size={72} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName} numberOfLines={1}>{title}</Text>
              <View style={styles.badgeRow}>
                {roles.slice(0, 3).map((r) => (
                  <RoleBadge key={String(r)} role={r} />
                ))}
                <StatusPill active={active} />
              </View>
              <Text style={styles.meta}>@{displayId}{data?.email ? ` · ${data.email}` : ''}</Text>
              {data?.phone ? <Text style={styles.meta}>📞 {data.phone}</Text> : null}
            </View>
          </View>
          <View style={styles.detailQuick}>
            <View style={styles.detailQuickCell}>
              <Text style={styles.detailQuickK}>Coins</Text>
              <Text style={styles.detailQuickV}>{indianGroup(walletCoins)}</Text>
            </View>
            <View style={styles.detailQuickCell}>
              <Text style={styles.detailQuickK}>Points</Text>
              <Text style={styles.detailQuickV}>{indianGroup(walletPoints)}</Text>
            </View>
            <View style={styles.detailQuickCell}>
              <Text style={styles.detailQuickK}>Joined</Text>
              <Text style={styles.detailQuickV}>
                {data?.created_at ? new Date(data.created_at).toLocaleDateString() : '—'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.detailActions}>
          <Chip
            icon={active ? 'ban' : 'checkmark-circle'}
            label={active ? 'Deactivate' : 'Activate'}
            tone="slate"
              onPress={() =>
              act('status', () => api.put(`/admin/users/${userId}/status`, { is_active: !active }), 'Status updated')
            }
          />
          <Chip
            icon="chatbubble-ellipses"
            label="Message"
            tone="amber"
              onPress={async () => {
                try {
                  const res = await api.post('/messages/conversations', { receiverId: userId });
                  const c = api.unwrap(res);
                  navigation.navigate('ChatThread', {
                    conversationId: c.id || c.conversationId,
                  name: title,
                    otherUserId: userId,
                  });
                } catch (e) {
                  Alert.alert('Chat failed', e.message);
                }
              }}
            />
          <Chip
            icon="person"
            label="Profile"
            tone="emerald"
            onPress={() => navigation.navigate('CreatorProfile', { userId, name: title })}
            />
          </View>

        <DeskCard style={styles.detailCard}>
          <View style={styles.detailSecHead}>
            <Ionicons name="wallet-outline" size={16} color="#FBBF24" />
            <Text style={styles.detailSec}>Wallet</Text>
            {superAdmin ? <Text style={styles.detailSecHint}>Super Admin edit</Text> : null}
          </View>
          <View style={styles.walletEditRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldL}>Coins</Text>
              <TextInput
                value={coins}
                onChangeText={setCoins}
                keyboardType="number-pad"
                editable={superAdmin}
                placeholder="0"
                placeholderTextColor="#71717A"
                style={[styles.input, !superAdmin && { opacity: 0.55 }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldL}>Points</Text>
              <TextInput
                value={points}
                onChangeText={setPoints}
                keyboardType="number-pad"
                editable={superAdmin}
                placeholder="0"
                placeholderTextColor="#71717A"
                style={[styles.input, !superAdmin && { opacity: 0.55 }]}
              />
            </View>
          </View>
          {superAdmin ? (
            <Pressable onPress={saveWallet} disabled={busy === 'wallet'} style={styles.saveWalletBtn}>
              <Ionicons name="save-outline" size={16} color="#111" />
              <Text style={styles.saveWalletT}>{busy === 'wallet' ? 'Saving…' : 'Save coins & points'}</Text>
            </Pressable>
          ) : (
            <Text style={styles.meta}>Only Super Admin can change balances.</Text>
          )}
        </DeskCard>

        <DeskCard style={styles.detailCard}>
          <View style={styles.detailSecHead}>
            <Ionicons name="id-card-outline" size={16} color="#FBBF24" />
            <Text style={styles.detailSec}>Account</Text>
          </View>
          <Kv k="Email" v={data?.email} />
          <Kv k="Phone" v={data?.phone} />
          <Kv k="Gender" v={data?.gender} />
          <Kv k="Verified" v={data?.is_verified ? 'Yes' : 'No'} />
          <Kv k="Last login" v={lastSeenOf(data).text} />
          {lastSeenOf(data).hint ? <Kv k="Note" v="No login stamp — showing last profile activity" /> : null}
          <Kv k="Joined" v={data?.created_at ? fmtWhen(data.created_at) : '—'} />
          <Kv k="Internal ID" v={data?.id || userId} />
        </DeskCard>

        <DeskCard style={styles.detailCard}>
          <View style={styles.detailSecHead}>
            <Ionicons name="shield-outline" size={16} color="#FBBF24" />
            <Text style={styles.detailSec}>Role</Text>
          </View>
          <Text style={styles.fieldL}>Primary role</Text>
          <TextInput
            value={role}
            onChangeText={setRole}
            autoCapitalize="none"
            placeholder="user / host / agency / bdm / coin_seller / admin"
            placeholderTextColor="#71717A"
            style={styles.input}
          />
          <View style={styles.roleQuick}>
            {['user', 'host', 'agency', 'bdm', 'coin_seller'].map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} style={[styles.rolePick, role === r && styles.rolePickOn]}>
                <Text style={[styles.rolePickT, role === r && styles.rolePickTOn]}>{r === 'bdm' ? 'BD' : r}</Text>
              </Pressable>
            ))}
          </View>
          <Chip
            icon="checkmark"
            label={busy === 'role' ? 'Saving…' : 'Save role'}
            tone="rose"
            onPress={() =>
              act(
                'role',
                () => api.put(`/admin/users/${userId}/role`, { role }).catch(() => api.put(`/admin/users/${userId}`, { role })),
                'Role updated'
              )
            }
          />
        </DeskCard>

        <DeskCard style={styles.detailCard}>
          <View style={styles.detailSecHead}>
            <Ionicons name="warning-outline" size={16} color="#FB7185" />
            <Text style={styles.detailSec}>Moderation</Text>
          </View>
          <Text style={styles.fieldL}>Reason / note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional reason"
            placeholderTextColor="#71717A"
            style={styles.input}
          />
          <View style={styles.detailActions}>
            <Chip
              icon="ban"
              label="Ban"
              tone="rose"
              onPress={() =>
                act('ban', () => api.post(`/admin/users/${userId}/ban`, { reason: note || 'Banned by admin' }), 'User banned')
              }
            />
            <Chip
              icon="checkmark-circle"
              label="Unban"
              tone="emerald"
              onPress={() =>
                act(
                  'unban',
                  () =>
                    api.post(`/admin/users/${userId}/unban`, {}).catch(() =>
                      api.put(`/admin/users/${userId}/status`, { is_active: true })
                    ),
                  'User unbanned'
                )
              }
            />
            <Chip
              icon="exit-outline"
              label="Kick live"
              tone="slate"
              onPress={() => act('kick', () => api.post(`/admin/live/kick`, { userId }), 'Kicked from live')}
            />
          </View>
        </DeskCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B10' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#FAFAFA', fontWeight: '900', fontSize: 18 },
  topSub: { color: '#A1A1AA', fontSize: 12, fontWeight: '600', marginTop: 1 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E11D48', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  menuBtnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  menuBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#18181B', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, maxHeight: '80%' },
  menuTitle: { color: '#FAFAFA', fontWeight: '900', fontSize: 18 },
  menuHint: { color: '#A1A1AA', marginTop: 4, marginBottom: 12, fontSize: 12 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  menuRowOn: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, paddingHorizontal: 8 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.12)', alignItems: 'center', justifyContent: 'center' },
  menuIconOn: { backgroundColor: '#E11D48' },
  menuLabel: { color: '#F4F4F5', fontWeight: '700', fontSize: 14 },
  menuLabelOn: { color: '#FBBF24' },
  menuDesc: { color: '#71717A', fontSize: 11, marginTop: 2 },
  metricCard: { width: '47%', backgroundColor: '#18181B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 8 },
  metricK: { color: '#A1A1AA', fontWeight: '700', fontSize: 11 },
  metricV: { color: '#FAFAFA', fontWeight: '900', fontSize: 22, marginTop: 6 },
  metricGrad: { width: '47%', flexGrow: 1, borderRadius: 14, padding: 14, marginBottom: 8, minHeight: 78 },
  metricGradK: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 11 },
  metricGradV: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 6 },
  chipScroll: { flexGrow: 0 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center', minHeight: 48 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#18181B', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexShrink: 0 },
  chipOn: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  chipT: { color: '#A1A1AA', fontWeight: '700', fontSize: 13 },
  chipTOn: { color: '#fff' },
  sectionHead: { paddingHorizontal: 16, paddingBottom: 8 },
  backHome: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  backHomeT: { color: '#FBBF24', fontWeight: '700', fontSize: 13 },
  sectionNow: { fontWeight: '800', color: '#FAFAFA', fontSize: 20 },
  how: { color: '#A1A1AA', fontSize: 13, marginTop: 4, lineHeight: 18 },
  loadingHint: { color: '#A1A1AA', fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 },
  hero: { marginHorizontal: 12, marginTop: 4, borderRadius: 20, padding: 18 },
  heroEyebrow: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.92)', marginTop: 8, fontSize: 13, lineHeight: 19 },
  quickRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, marginTop: 12 },
  quickCard: { flex: 1, backgroundColor: '#18181B', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  quickK: { color: '#A1A1AA', fontWeight: '700', fontSize: 12 },
  quickV: { color: '#FAFAFA', fontWeight: '900', fontSize: 28, marginTop: 4 },
  quickHint: { color: '#FBBF24', fontWeight: '700', fontSize: 12, marginTop: 6 },
  homeSec: { marginHorizontal: 16, marginTop: 18, marginBottom: 8, fontWeight: '800', color: '#FAFAFA', fontSize: 16 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 8 },
  tile: { width: '47%', flexGrow: 1 },
  tileGrad: { borderRadius: 18, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', minHeight: 128, backgroundColor: '#18181B' },
  tileIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.12)', alignItems: 'center', justifyContent: 'center' },
  tileBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tileBadgeT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileTitle: { marginTop: 10, fontWeight: '800', color: '#FAFAFA', fontSize: 14 },
  tileHint: { marginTop: 4, color: '#A1A1AA', fontSize: 11, lineHeight: 15, flex: 1 },
  tileGo: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  tileGoT: { color: '#E89020', fontWeight: '800', fontSize: 12 },
  staffHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staffBulk: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },
  staffBulkBtn: { backgroundColor: '#E11D48', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  staffBulkT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  superPill: { backgroundColor: '#FF8C00', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  superPillT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  capGrid: { marginTop: 12, gap: 8 },
  capChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  capChipOn: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  capChipT: { fontWeight: '800', color: '#E4E4E7', fontSize: 13 },
  capChipTOn: { color: '#fff' },
  capChipD: { color: '#A1A1AA', fontSize: 11, marginTop: 2, lineHeight: 15 },
  h: { fontSize: 16, fontWeight: '800', color: '#FAFAFA', marginBottom: 8 },
  rowTitle: { fontWeight: '800', color: '#FAFAFA', fontSize: 15 },
  meta: { color: '#A1A1AA', marginTop: 4, fontSize: 12, lineHeight: 17 },
  note: { color: '#A1A1AA', marginTop: 10, fontSize: 12 },
  fieldL: { color: '#E4E4E7', fontWeight: '700', marginBottom: 6, marginTop: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginTop: 10 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#18181B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  statK: { color: '#A1A1AA', fontWeight: '800', fontSize: 13 },
  statV: { color: '#FAFAFA', fontWeight: '800', fontSize: 18, marginTop: 6 },
  disclaimer: { color: '#71717A', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  alertCard: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  alertTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  alertTitle: { flex: 1, fontWeight: '800', color: '#FAFAFA' },
  alertWhen: { color: '#71717A', fontSize: 11 },
  alertBody: { color: '#A1A1AA', marginTop: 8, fontSize: 13, lineHeight: 18 },
  agoraCard: { margin: 12, padding: 16, backgroundColor: '#18181B', borderColor: 'rgba(255,255,255,0.06)' },
  agoraTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  agoraTitle: { fontWeight: '800', fontSize: 16, color: '#FAFAFA' },
  agoraHelp: { color: '#A1A1AA', fontSize: 12, marginBottom: 8, lineHeight: 18 },
  readyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  readyT: { fontWeight: '800', color: '#FBBF24' },
  readyId: { color: '#A1A1AA', fontSize: 12, marginTop: 2 },
  saveAgora: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E11D48',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveAgoraT: { color: '#fff', fontWeight: '800' },
  search: {
    margin: 12,
    backgroundColor: '#18181B',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    height: 44,
    color: '#F4F4F5',
  },
  input: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: '#F4F4F5',
  },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { marginHorizontal: 12, marginBottom: 10 },
  who: { textAlign: 'center', color: '#71717A', padding: 16, fontSize: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#27272A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pillOn: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  pillT: { fontSize: 12, fontWeight: '700', color: '#E4E4E7' },
  pillTOn: { color: '#fff' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  periodChipOn: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  periodT: { color: '#A1A1AA', fontWeight: '700', fontSize: 12 },
  periodTOn: { color: '#fff' },
  popRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  popName: { width: 88, color: '#E4E4E7', fontSize: 12, fontWeight: '700' },
  popTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  popFill: { height: 8, borderRadius: 999, backgroundColor: '#22D3EE' },
  popN: { width: 36, textAlign: 'right', color: '#A1A1AA', fontWeight: '800', fontSize: 11 },
  userCard: { padding: 14, marginHorizontal: 12, marginBottom: 10 },
  userHead: { flexDirection: 'row', alignItems: 'center' },
  userTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  verifyChip: { backgroundColor: 'rgba(56,189,248,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  verifyChipT: { color: '#38BDF8', fontWeight: '800', fontSize: 10 },
  userKv: { flexDirection: 'row', gap: 8, marginTop: 12 },
  userKvCell: { flex: 1, backgroundColor: '#27272A', borderRadius: 12, padding: 10 },
  userKvK: { color: '#A1A1AA', fontWeight: '700', fontSize: 10 },
  userKvV: { color: '#FAFAFA', fontWeight: '900', fontSize: 14, marginTop: 4 },
  bdHero: { marginHorizontal: 12, marginTop: 4, marginBottom: 10, borderRadius: 20, padding: 18 },
  bdHeroBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bdHeroBadgeT: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },
  bdHeroTitle: { color: '#fff', fontWeight: '900', fontSize: 22, marginTop: 10 },
  bdHeroSub: { color: 'rgba(255,255,255,0.9)', marginTop: 6, fontSize: 13, lineHeight: 18 },
  bdHeroStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  bdHeroStat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 12 },
  bdHeroStatV: { color: '#fff', fontWeight: '900', fontSize: 22 },
  bdHeroStatK: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 11, marginTop: 2 },
  bdCard: { padding: 14, marginHorizontal: 12, marginBottom: 10 },
  bdCodeBox: { marginTop: 12, backgroundColor: '#27272A', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)' },
  bdCodeK: { color: '#A1A1AA', fontWeight: '700', fontSize: 11 },
  bdCodeV: { color: '#FBBF24', fontWeight: '900', fontSize: 20, letterSpacing: 1, marginTop: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rulePct: { color: '#FBBF24', fontWeight: '900', fontSize: 14 },
  detailHero: { marginHorizontal: 12, marginTop: 4, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  detailHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailAvRing: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: '#FBBF24' },
  detailName: { color: '#FAFAFA', fontWeight: '900', fontSize: 20 },
  detailQuick: { flexDirection: 'row', gap: 8, marginTop: 14 },
  detailQuickCell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 10 },
  detailQuickK: { color: '#A1A1AA', fontWeight: '700', fontSize: 10 },
  detailQuickV: { color: '#FAFAFA', fontWeight: '900', fontSize: 15, marginTop: 4 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginTop: 12 },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailChipT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  detailCard: { marginHorizontal: 12, marginTop: 12, padding: 14 },
  detailSecHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  detailSec: { color: '#FAFAFA', fontWeight: '900', fontSize: 15, flex: 1 },
  detailSecHint: { color: '#FBBF24', fontWeight: '700', fontSize: 11 },
  walletEditRow: { flexDirection: 'row', gap: 10 },
  saveWalletBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveWalletT: { color: '#111', fontWeight: '900', fontSize: 13 },
  roleQuick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  rolePick: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rolePickOn: { backgroundColor: '#E11D48', borderColor: '#E11D48' },
  rolePickT: { color: '#A1A1AA', fontWeight: '700', fontSize: 11 },
  rolePickTOn: { color: '#fff' },
});
