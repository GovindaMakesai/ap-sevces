import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/ui';

const GOLD = '#F59E0B';
const ORANGE = '#F97316';

const MODES = [
  { id: 'friend', tag: '1V1', name: 'Friend PK', icon: 'people', art: '👥' },
  { id: 'random', tag: '1V1', name: 'Random PK', icon: 'gift', art: '🎁', gift: true },
  { id: 'team', tag: 'Team', name: 'Team PK', icon: 'extension-puzzle', art: '🧩', badge: 'New' },
];

function personFromRoom(r) {
  return {
    userId: r.hostId || r.host_id || r.userId || r.id,
    name: r.hostName || r.host_name || r.first_name || r.name || r.displayName || 'Host',
    channel: r.channel,
    profilePic: r.hostProfilePic || r.host_profile_pic || r.profile_pic || r.profilePic || r.cover,
    live: Boolean(r.channel),
  };
}

function personFromUser(u) {
  return {
    userId: u.id || u.userId || u.user_id,
    name: u.displayName || u.first_name || u.name || 'User',
    channel: u.channel || u.liveChannel,
    profilePic: u.profilePic || u.profile_pic,
    live: Boolean(u.isLive || u.channel),
  };
}

export default function RoomPkSheet({
  visible,
  onClose,
  rooms = [],
  loadingRooms = false,
  onRefreshRooms,
  onChallenge,
  onCancelMatch,
  matching = false,
  matchLabel = '',
}) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [mode, setMode] = useState('friend');
  const [listTab, setListTab] = useState('friends');
  const [randomTab, setRandomTab] = useState('activity');
  const [allowParty, setAllowParty] = useState(false);
  const [friends, setFriends] = useState([]);
  const [fans, setFans] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!visible) {
      busy.current = false;
      return;
    }
    onRefreshRooms?.();
    setMode('friend');
    setListTab('friends');
    (async () => {
      try {
        const [f, fa] = await Promise.all([
          api.get('/social/following/live').catch(() => api.get('/social/following')),
          api.get('/social/followers'),
        ]);
        setFriends(api.extractList(f).map(personFromUser));
        setFans(api.extractList(fa).map(personFromUser));
      } catch (_e) {
        setFriends([]);
        setFans([]);
      }
    })();
  }, [visible]);

  useEffect(() => {
    if (mode === 'team') setListTab((t) => (t === 'friends' || t === 'fans' ? t : 'friends'));
  }, [mode]);

  const roomPeople = useMemo(() => (Array.isArray(rooms) ? rooms.map(personFromRoom) : []), [rooms]);

  const list = useMemo(() => {
    if (listTab === 'fans') return fans;
    if (listTab === 'recommend' || listTab === 'recent') return roomPeople;
    if (friends.length) return friends;
    return roomPeople;
  }, [listTab, fans, friends, roomPeople]);

  const challenge = async (rival, extra = {}) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await onChallenge?.({
        rival,
        type: mode,
        durationMinutes: 5,
        durationSec: 300,
        format: mode === 'team' ? '3v3' : '1v1',
        allowParty,
        ...extra,
      });
    } finally {
      busy.current = false;
    }
  };

  if (!visible) return null;

  const tabs = mode === 'team'
    ? ['friends', 'fans', 'recommend', 'recent']
    : ['friends', 'fans'];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={matching ? undefined : onClose}>
        <Pressable style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) }]} onPress={() => {}}>
          <View style={styles.head}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>PK Types</Text>
              <Pressable onPress={() => setShowHelp((v) => !v)} hitSlop={8} style={styles.q}>
                <Text style={styles.qT}>?</Text>
              </Pressable>
            </View>
            <View style={styles.headIcons}>
              <Ionicons name="settings-outline" size={20} color="#6B7280" />
              <Ionicons name="time-outline" size={20} color="#6B7280" />
            </View>
          </View>

          <LinearGradient colors={['#F59E0B', '#F97316']} style={styles.banner}>
            <Text style={styles.bannerT}>PK Combat Points Ranking</Text>
            <Text style={styles.bannerS}>25/08/2026 – 31/08/2026</Text>
            <Text style={styles.bannerP}>🪙 112,770,000</Text>
          </LinearGradient>
          <View style={styles.rankBar}>
            <Text style={styles.rankBarT}>🥈  No Rank</Text>
          </View>
          {showHelp ? (
            <Text style={styles.help}>
              Friend PK invites a live host. Random PK matches another room. Team PK supports up to 6 people (3v3). Tap a fighter on stage to switch to their stream and gift them.
            </Text>
          ) : null}

          <View style={styles.modeRow}>
            {MODES.map((m) => {
              const on = mode === m.id;
              return (
                <Pressable key={m.id} onPress={() => setMode(m.id)} style={[styles.modeCard, on && styles.modeCardOn]}>
                  <Text style={styles.modeTag}>{m.tag}</Text>
                  {m.badge ? <Text style={styles.newBadge}>{m.badge}</Text> : null}
                  <Text style={styles.modeArt}>{m.art}</Text>
                  <Text style={styles.modeName}>{m.name}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'random' ? (
            <View>
              <View style={styles.pillRow}>
                <Pressable onPress={() => setRandomTab('activity')} style={[styles.pill, randomTab === 'activity' && styles.pillOn]}>
                  <Text style={[styles.pillT, randomTab === 'activity' && styles.pillTOn]}>Activity 🎁</Text>
                </Pressable>
                <Pressable onPress={() => setRandomTab('fun')} style={[styles.pill, randomTab === 'fun' && styles.pillOn]}>
                  <Text style={[styles.pillT, randomTab === 'fun' && styles.pillTOn]}>Fun</Text>
                </Pressable>
              </View>
              <View style={styles.radar}>
                <View style={styles.radarRing} />
                <View style={[styles.radarRing, { width: 90, height: 90, borderRadius: 45 }]} />
                <View style={styles.radarDot} />
              </View>
              <Pressable onPress={() => setAllowParty((v) => !v)} style={styles.checkRow}>
                <View style={[styles.box, allowParty && styles.boxOn]}>
                  {allowParty ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.checkT}>Allow Matching with Party</Text>
              </Pressable>
              <Pressable
                onPress={() => challenge(null, { random: true })}
                style={styles.pkCta}
                disabled={matching}
              >
                <Text style={styles.pkCtaT}>{matching ? (matchLabel || 'Matching…') : 'PK'}</Text>
              </Pressable>
              {matching ? (
                <Pressable onPress={() => onCancelMatch?.()} style={styles.cancelMatch}>
                  <Text style={styles.cancelMatchT}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ maxHeight: 340 }}>
              <View style={styles.pillRow}>
                {tabs.map((t) => (
                  <Pressable key={t} onPress={() => setListTab(t)} style={[styles.pill, listTab === t && styles.pillOn]}>
                    <Text style={[styles.pillT, listTab === t && styles.pillTOn]}>
                      {t === 'friends' ? 'Friends' : t === 'fans' ? 'Fans' : t === 'recommend' ? 'Recommend' : 'Recent'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {loadingRooms ? <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} /> : null}
              <ScrollView style={{ maxHeight: 280 }}>
                {list.map((p, i) => (
                  <View key={String(p.userId || p.channel || i)} style={styles.userRow}>
                    <Avatar uri={mediaUrl(p.profilePic)} name={p.name} size={44} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.userName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.userMeta}>{p.live ? 'Connecting' : 'Invite to PK'}</Text>
                    </View>
                    <Pressable
                      onPress={() => challenge(p, { random: false })}
                      style={p.live && mode === 'team' ? styles.joinBtn : styles.inviteBtn}
                    >
                      <Text style={p.live && mode === 'team' ? styles.joinT : styles.inviteT}>
                        {p.live && mode === 'team' ? 'Join' : 'Invite'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
                {!list.length ? <Text style={styles.empty}>No one to invite yet. Open live rooms will show here.</Text> : null}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PkBattleHud({
  pk,
  challenge,
  hostName,
  rivalName,
  onAccept,
  onDecline,
  onEnd,
  canRespond,
  isHost,
}) {
  if (!pk && !challenge) return null;
  const left = Number(pk?.leftScore || pk?.hostScore || pk?.scoreA || 0);
  const right = Number(pk?.rightScore || pk?.guestScore || pk?.scoreB || 0);
  const total = Math.max(left + right, 1);
  const leftPct = Math.max(8, Math.round((left / total) * 100));
  const aName = pk?.leftName || hostName || 'You';
  const bName = pk?.rightName || challenge?.fromName || challenge?.targetName || rivalName || 'Rival';
  const remain = pk?.endsAt || pk?.ends_at;
  let clock = '';
  if (remain) {
    const s = Math.max(0, Math.floor((new Date(remain).getTime() - Date.now()) / 1000));
    clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <View style={hud.wrap} pointerEvents="box-none">
      <View style={hud.banner}>
        <Text style={hud.bannerT}>{pk ? (clock ? `PK ${clock}` : 'PK BATTLE') : 'PK CHALLENGE'}</Text>
      </View>
      <View style={hud.bar}>
        <LinearGradient colors={['#FF4FA3', '#DB2777']} style={[hud.left, { flex: leftPct }]}>
          <Text style={hud.score} numberOfLines={1}>{left.toLocaleString()}</Text>
        </LinearGradient>
        <View style={hud.vs}><Text style={hud.vsT}>PK</Text></View>
        <LinearGradient colors={['#60A5FA', '#2563EB']} style={[hud.right, { flex: 100 - leftPct }]}>
          <Text style={hud.score} numberOfLines={1}>{right.toLocaleString()}</Text>
        </LinearGradient>
      </View>
      <View style={hud.names}>
        <Text style={hud.nameL} numberOfLines={1}>{aName}</Text>
        <Text style={hud.nameR} numberOfLines={1}>{bName}</Text>
      </View>
      {canRespond ? (
        <View style={hud.actions}>
          <Pressable onPress={onAccept} style={hud.yes}><Text style={hud.btnT}>Accept</Text></Pressable>
          <Pressable onPress={onDecline} style={hud.no}><Text style={hud.btnT}>Decline</Text></Pressable>
        </View>
      ) : null}
      {pk && isHost ? (
        <Pressable onPress={onEnd} style={hud.end}><Text style={hud.endT}>End PK</Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '88%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#111', fontWeight: '800', fontSize: 20 },
  q: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qT: { fontWeight: '800', color: '#6B7280', fontSize: 12 },
  headIcons: { flexDirection: 'row', gap: 12 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 8 },
  bannerT: { color: '#fff', fontWeight: '900' },
  bannerS: { color: 'rgba(255,255,255,0.9)', fontWeight: '600', fontSize: 12, marginTop: 2 },
  bannerP: { color: '#fff', fontWeight: '900', marginTop: 4 },
  rankBar: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 12 },
  rankBarT: { color: '#6B7280', fontWeight: '700' },
  help: { color: '#4B5563', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modeCardOn: { borderColor: GOLD, backgroundColor: '#FFFBEB' },
  modeTag: { position: 'absolute', top: 6, left: 6, color: '#7C3AED', fontSize: 9, fontWeight: '800' },
  newBadge: { position: 'absolute', top: 6, right: 6, color: '#EF4444', fontSize: 9, fontWeight: '800' },
  modeArt: { fontSize: 28, marginVertical: 6 },
  modeName: { color: '#111', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 7 },
  pillOn: { borderColor: GOLD, backgroundColor: '#FFFBEB' },
  pillT: { color: '#6B7280', fontWeight: '700', fontSize: 13, textTransform: 'capitalize' },
  pillTOn: { color: '#92400E' },
  radar: { height: 140, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  radarRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.25)',
  },
  radarDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FB7185' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'center' },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: GOLD },
  checkT: { color: '#374151', fontWeight: '700' },
  pkCta: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  pkCtaT: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  cancelMatch: { alignItems: 'center', paddingVertical: 10 },
  cancelMatchT: { color: '#6B7280', fontWeight: '700' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#F3F4F6' },
  userName: { color: '#111', fontWeight: '800' },
  userMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  inviteBtn: { borderWidth: 1, borderColor: ORANGE, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  inviteT: { color: ORANGE, fontWeight: '800' },
  joinBtn: { backgroundColor: ORANGE, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  joinT: { color: '#fff', fontWeight: '800' },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 24, fontWeight: '600' },
});

const hud = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 6, marginHorizontal: 10 },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  bannerT: { color: '#FF4FA3', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  bar: {
    flexDirection: 'row',
    width: '100%',
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
  },
  left: { height: '100%', justifyContent: 'center', paddingLeft: 12 },
  right: { height: '100%', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 12 },
  vs: {
    position: 'absolute',
    left: '50%',
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#FF4FA3',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  vsT: { color: '#FF4FA3', fontWeight: '900', fontSize: 10 },
  score: { color: '#fff', fontWeight: '900', fontSize: 15 },
  names: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 4 },
  nameL: { color: '#F9A8D4', fontWeight: '800', fontSize: 11, maxWidth: '46%' },
  nameR: { color: '#93C5FD', fontWeight: '800', fontSize: 11, maxWidth: '46%', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  yes: { backgroundColor: '#22C55E', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  no: { backgroundColor: '#EF4444', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  btnT: { color: '#fff', fontWeight: '800' },
  end: { marginTop: 8, backgroundColor: 'rgba(239,68,68,0.9)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  endT: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
