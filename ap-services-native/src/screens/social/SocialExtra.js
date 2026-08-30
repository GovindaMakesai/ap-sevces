import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { mediaUrl } from '../../config/api';
import { Avatar, Card, EmptyState, ErrorBanner, Field, GoldButton, Loading, OutlineButton, PillTab } from '../../components/ui';
import CoupleRing from '../../components/CoupleRing';
import { CreamPage } from '../../components/creamChrome';
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
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [data, setData] = useState(null);
  const [activeGroup, setActiveGroup] = useState('1-2');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const r = await api.get('/svip/home');
      const d = api.unwrap(r) || {};
      setData(d);
      const lv = Number(d.level) || 0;
      const g = (d.tierGroups || []).find((x) => (x.levels || []).includes(lv));
      if (g?.id) setActiveGroup(g.id);
      else if (d.tierGroups?.[0]?.id) setActiveGroup(d.tierGroups[0].id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const level = Number(data?.level) || 0;
  const points = Number(data?.points) || 0;
  const tierGroups = data?.tierGroups || [];
  const viewGroup = tierGroups.find((g) => g.id === activeGroup) || tierGroups[0];
  const viewLevel = viewGroup ? Math.max(...(viewGroup.levels || [2])) : 2;
  const identification = (data?.identification || []).filter(
    (x) => Number(x.minLevel) <= viewLevel + 1 || Number(x.minLevel) <= viewLevel
  );
  const privileges = data?.privileges || [];
  const idUnlocked = identification.filter((x) => level >= Number(x.minLevel)).length;
  const privUnlocked = privileges.filter((x) => level >= Number(x.minLevel)).length;
  const up = data?.upgradeProgress || data?.progress || {};
  const maint = data?.maintenance;
  const emblemLabel = level > 0 ? `SVIP ${level}` : 'SVIP';

  const iconOf = (fa) => {
    const map = {
      'fa-tag': 'pricetag',
      'fa-award': 'ribbon',
      'fa-door-open': 'log-in',
      'fa-id-card': 'card',
      'fa-circle-notch': 'ellipse',
      'fa-comment-dots': 'chatbubble-ellipses',
      'fa-medal': 'trophy',
      'fa-car-side': 'car',
      'fa-palette': 'color-palette',
      'fa-users': 'people',
      'fa-gift': 'gift',
      'fa-clock': 'time',
      'fa-smile': 'happy',
      'fa-shield-alt': 'shield',
      'fa-rocket': 'rocket',
      'fa-user-secret': 'eye-off',
      'fa-eye-slash': 'eye-off',
      'fa-user-ninja': 'flash',
      'fa-user-plus': 'person-add',
      'fa-bullhorn': 'megaphone',
      'fa-headset': 'headset',
      'fa-star': 'star',
      'fa-ban': 'ban',
      'fa-home': 'home',
      'fa-hashtag': 'text',
      'fa-comment-slash': 'chatbubbles',
    };
    return map[fa] || 'sparkles';
  };

  return (
    <View style={[svipStyles.root, { paddingTop: insets.top }]}>
      <View style={svipStyles.header}>
        <Pressable onPress={() => navigation.goBack()} style={svipStyles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#FBBF24" />
        </Pressable>
        <Text style={svipStyles.title}>AP SVIP</Text>
        <Pressable onPress={() => navigation.navigate('SvipSettings')} style={svipStyles.iconBtn} hitSlop={8}>
          <Ionicons name="diamond" size={18} color="#FBBF24" />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('SvipIntro')} style={svipStyles.iconBtn} hitSlop={8}>
          <Ionicons name="help-circle-outline" size={20} color="#FBBF24" />
        </Pressable>
      </View>

      {loading && !data ? <Loading /> : null}
      <ErrorBanner message={error} onRetry={load} />

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={svipStyles.tierTabs}>
          {tierGroups.map((g) => {
            const on = g.id === activeGroup;
            return (
              <Pressable key={g.id} onPress={() => setActiveGroup(g.id)} style={svipStyles.tierTab}>
                <Text style={[svipStyles.tierTabT, on && svipStyles.tierTabTOn]}>{g.label}</Text>
                {on ? <View style={svipStyles.tierUnderline} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <LinearGradient colors={['#2E1065', '#1A0A24', '#120818']} style={svipStyles.hero}>
          <LinearGradient colors={['#6D28D9', '#4C1D95', '#312E81']} style={svipStyles.emblem}>
            <Ionicons name="diamond" size={28} color="#FBBF24" />
            <Text style={svipStyles.emblemLabel}>{emblemLabel}</Text>
          </LinearGradient>
          {data?.pointsFormatted ? (
            <Text style={svipStyles.heroPts}>{data.pointsFormatted} SVIP points</Text>
          ) : null}
        </LinearGradient>

        {maint && data?.isSvip ? (
          <View style={[svipStyles.maintCard, maint.isMet && svipStyles.maintMet]}>
            <View style={svipStyles.maintHead}>
              <Ionicons name="hourglass-outline" size={16} color="#FBBF24" />
              <Text style={svipStyles.maintDays}>{maint.daysLabel || `${maint.daysRemaining} days left`}</Text>
            </View>
            <Text style={svipStyles.maintSummary}>{maint.summary}</Text>
            <View style={svipStyles.progressTrack}>
              <View style={[svipStyles.progressFill, { width: `${Math.min(100, Number(maint.progressPercent) || 0)}%` }]} />
            </View>
            <Text style={svipStyles.maintProgress}>
              {maint.pointsEarnedFormatted || 0} / {maint.pointsRequiredFormatted || 0}
            </Text>
            <Text style={svipStyles.maintDrop}>{maint.dropLabel}</Text>
          </View>
        ) : null}

        <View style={svipStyles.sectionHead}>
          <Text style={svipStyles.wing}>✦</Text>
          <Text style={svipStyles.sectionTitle}>SVIP Identification</Text>
          <Text style={svipStyles.wing}>✦</Text>
        </View>
        <Text style={svipStyles.sectionCount}>{idUnlocked}/{identification.length || 0}</Text>
        <View style={svipStyles.grid}>
          {identification.map((item) => {
            const locked = level < Number(item.minLevel);
            return (
              <View key={item.id} style={[svipStyles.card, locked && svipStyles.cardLocked]}>
                {item.animated ? (
                  <View style={svipStyles.playBadge}><Ionicons name="play" size={10} color="#120818" /></View>
                ) : null}
                <Ionicons name={iconOf(item.icon)} size={26} color={locked ? '#6B7280' : '#FBBF24'} />
                <Text style={[svipStyles.cardName, locked && { color: '#9CA3AF' }]} numberOfLines={2}>{item.name}</Text>
              </View>
            );
          })}
        </View>

        <View style={svipStyles.sectionHead}>
          <Text style={svipStyles.wing}>✦</Text>
          <Text style={svipStyles.sectionTitle}>Exclusive Privileges</Text>
          <Text style={svipStyles.wing}>✦</Text>
        </View>
        <Text style={svipStyles.sectionCount}>{privUnlocked}/{privileges.length || 0}</Text>
        <View style={svipStyles.privGrid}>
          {privileges.map((item) => {
            const locked = level < Number(item.minLevel);
            return (
              <Pressable
                key={item.id}
                disabled={locked}
                onPress={() => {
                  if (item.id === 'visitors') navigation.navigate('Visitors');
                  else if (item.id === 'svip_gifts') navigation.navigate('Store');
                }}
                style={[svipStyles.privItem, locked && svipStyles.cardLocked]}
              >
                <Text style={svipStyles.privBadge}>SVIP {item.minLevel}</Text>
                <Ionicons name={iconOf(item.icon)} size={22} color={locked ? '#6B7280' : '#FBBF24'} />
                <Text style={[svipStyles.privName, locked && { color: '#9CA3AF' }]} numberOfLines={2}>{item.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable style={[svipStyles.fab, { bottom: 88 + insets.bottom }]} onPress={() => navigation.navigate('Recharge')}>
        <Text style={svipStyles.fabT}>Task</Text>
      </Pressable>

      <View style={[svipStyles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Avatar uri={mediaUrl(data?.user?.profilePic || user?.profile_pic)} name={data?.user?.name || displayName} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={svipStyles.footerStatus}>
            {data?.isSvip ? `You are ${data.levelLabel}` : 'You are not an SVIP yet'}
          </Text>
          {data?.upgradeHint ? <Text style={svipStyles.footerHint} numberOfLines={2}>{data.upgradeHint}</Text> : null}
        </View>
        <View style={svipStyles.footerUpgrade}>
          <Text style={svipStyles.progressText}>
            {up.currentFormatted || formatCompactLocal(points)} / {up.maxFormatted || '3.0M'}
          </Text>
          <View style={svipStyles.progressTrackSm}>
            <View style={[svipStyles.progressFill, { width: `${Math.min(100, Number(up.percent) || 0)}%` }]} />
          </View>
          <Pressable onPress={() => navigation.navigate('Recharge')} style={svipStyles.levelUp}>
            <Text style={svipStyles.levelUpT}>Level Up</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatCompactLocal(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(v));
}

export function SvipSettingsScreen({ navigation }) {
  const { api } = useAuth();
  const [settings, setSettings] = useState({});
  const [toggles, setToggles] = useState([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api.get('/svip/settings').then((r) => {
        const d = api.unwrap(r) || {};
        setSettings(d.settings || {});
        setToggles(Array.isArray(d.privileges) ? d.privileges : []);
        setLevel(Number(d.level) || 0);
      }).catch((e) => setError(e.message));
    }, [api])
  );

  const toggle = async (key) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try {
      await api.post('/svip/settings', { settings: next });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <CreamPage title="Privilege settings" navigation={navigation}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ErrorBanner message={error} />
        <Text style={{ color: '#8B6D3B', marginBottom: 12, lineHeight: 20 }}>
          Toggle privileges unlocked by your SVIP level ({level || 0}).
        </Text>
        {(toggles.length ? toggles : [
          { id: 'anon_visitor', name: 'Anonymous Visitor', minLevel: 5 },
          { id: 'block_strangers', name: 'Block messages from strangers', minLevel: 1 },
        ]).map((p) => {
          const locked = level < Number(p.minLevel || 0);
          const on = Boolean(settings[p.id]);
          return (
            <Pressable
              key={p.id}
              disabled={locked}
              onPress={() => toggle(p.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                opacity: locked ? 0.55 : 1,
                borderWidth: 1,
                borderColor: 'rgba(201,162,39,0.2)',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#5D4037' }}>{p.name}</Text>
                <Text style={{ color: '#8B6D3B', fontSize: 12, marginTop: 2 }}>SVIP {p.minLevel}+</Text>
              </View>
              <Text style={{ fontWeight: '900', color: on ? '#7C3AED' : '#A8A29E' }}>{locked ? 'Locked' : on ? 'On' : 'Off'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </CreamPage>
  );
}

export function SvipIntroScreen({ navigation }) {
  const { api } = useAuth();
  const [data, setData] = useState(null);
  useFocusEffect(useCallback(() => {
    api.get('/svip/intro', null, { auth: false }).then((r) => setData(api.unwrap(r))).catch(() => setData({}));
  }, [api]));

  return (
    <CreamPage title="SVIP introduction" navigation={navigation}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card>
          <Text style={styles.h}>How SVIP points work</Text>
          <Text style={styles.body}>
            {data?.pointRule ||
              '1 purchased diamond (coin) = 1 SVIP point from approved recharges and coin-seller purchases.'}
          </Text>
        </Card>
        <Card>
          <Text style={styles.h}>Validity</Text>
          {(data?.validityRules || [
            'Each SVIP level has a maintenance period. Recharge the required amount during this period to keep your level.',
            'If maintenance fails, your level drops by one.',
          ]).map((line) => (
            <Text key={line} style={[styles.body, { marginBottom: 8 }]}>• {line}</Text>
          ))}
        </Card>
        <GoldButton title="Open AP SVIP" onPress={() => navigation.navigate('Svip')} />
      </ScrollView>
    </CreamPage>
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

const svipStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#120818' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(251,191,36,0.15)',
    backgroundColor: '#1A0A24',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#FBBF24',
  },
  tierTabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  tierTab: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 4 },
  tierTabT: { color: '#A78BFA', fontWeight: '600', fontSize: 13 },
  tierTabTOn: { color: '#FBBF24', fontWeight: '800' },
  tierUnderline: { height: 2, backgroundColor: '#FBBF24', marginTop: 6, borderRadius: 2 },
  hero: { marginHorizontal: 16, marginTop: 8, borderRadius: 20, paddingVertical: 28, alignItems: 'center' },
  emblem: {
    width: 110,
    height: 110,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.45)',
  },
  emblemLabel: { color: '#FDE68A', fontWeight: '900', marginTop: 6, fontSize: 16 },
  heroPts: { color: '#C4B5FD', marginTop: 12, fontWeight: '700' },
  maintCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#1A1028',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  maintMet: { borderColor: 'rgba(34,197,94,0.45)' },
  maintHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  maintDays: { color: '#FBBF24', fontWeight: '800' },
  maintSummary: { color: '#DDD6FE', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  maintProgress: { color: '#FDE68A', fontSize: 12, marginTop: 6, fontWeight: '700' },
  maintDrop: { color: '#A78BFA', fontSize: 11, marginTop: 6 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressTrackSm: { height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', backgroundColor: '#FBBF24', borderRadius: 999 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  wing: { color: '#FBBF24', fontWeight: '800' },
  sectionTitle: { color: '#F5F3FF', fontWeight: '800', fontSize: 14 },
  sectionCount: { textAlign: 'center', color: '#A78BFA', marginTop: 4, marginBottom: 8, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 },
  card: {
    width: '30%',
    margin: '1.5%',
    minHeight: 104,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E1065',
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
  },
  cardLocked: { opacity: 0.45 },
  playBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { color: '#fff', textAlign: 'center', marginTop: 8, fontWeight: '700', fontSize: 11 },
  privGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingBottom: 20 },
  privItem: {
    width: '30%',
    margin: '1.5%',
    minHeight: 100,
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1B4B',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  privBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
  },
  privName: { color: '#EDE9FE', textAlign: 'center', marginTop: 8, fontWeight: '700', fontSize: 11 },
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#FBBF24',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    zIndex: 20,
  },
  fabT: { color: '#1C1917', fontWeight: '900' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#1A1028',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251,191,36,0.2)',
  },
  footerStatus: { color: '#fff', fontWeight: '800', fontSize: 13 },
  footerHint: { color: '#C4B5FD', fontSize: 11, marginTop: 2 },
  footerUpgrade: { alignItems: 'flex-end', minWidth: 110 },
  progressText: { color: '#FDE68A', fontSize: 11, fontWeight: '700' },
  levelUp: { backgroundColor: '#FBBF24', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  levelUpT: { color: '#1C1917', fontWeight: '900', fontSize: 12 },
});
