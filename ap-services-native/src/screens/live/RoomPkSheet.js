import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '../../config/api';
import { Avatar } from '../../components/ui';

const TIMES = [
  { m: 5, label: '5mins' },
  { m: 15, label: '15mins' },
  { m: 30, label: '30mins' },
];

const MODES = [
  { id: 'friend', tag: '1V1', name: 'Friend PK', icon: 'people', colors: ['#FBBF24', '#D97706'] },
  { id: 'random', tag: '1V1', name: 'Random PK', icon: 'shuffle', colors: ['#FB7185', '#DB2777'] },
  { id: 'team', tag: '3V3', name: 'Team PK', icon: 'people-circle', colors: ['#60A5FA', '#2563EB'], badge: '6' },
];

/** Webview-parity Room PK sheet (design: room-pk-sheet.png + social-live.css). */
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
  matchSeconds = 0,
}) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState('home');
  const [minutes, setMinutes] = useState(5);
  const [mode, setMode] = useState('random');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!visible) {
      setView('home');
      setQuery('');
      setPicked(null);
      busy.current = false;
      return;
    }
    onRefreshRooms?.();
  }, [visible]);

  useEffect(() => {
    if (matching) setView('match');
  }, [matching]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(rooms) ? rooms : [];
    if (!q) return list;
    return list.filter((r) => {
      const name = String(r.hostName || r.host_name || r.title || '').toLowerCase();
      const ch = String(r.channel || '').toLowerCase();
      const id = String(r.hostId || r.host_id || '').toLowerCase();
      return name.includes(q) || ch.includes(q) || id.includes(q);
    });
  }, [rooms, query]);

  const challenge = async (rival, type, extra = {}) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await onChallenge?.({
        rival,
        type: type || mode,
        durationMinutes: minutes,
        durationSec: minutes * 60,
        ...extra,
      });
    } finally {
      busy.current = false;
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={view === 'match' ? undefined : onClose}>
        <Pressable style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) }]} onPress={() => {}}>
          {view === 'home' ? (
            <View>
              <View style={styles.head}>
                <View style={styles.titleRow}>
                  <Text style={styles.logoP}>P</Text>
                  <Text style={styles.logoK}>K</Text>
                  <Text style={styles.title}>Room PK</Text>
                </View>
                <View style={styles.headActions}>
                  <Pressable
                    onPress={() => {
                      setMode('friend');
                      setView('invite');
                      onRefreshRooms?.();
                    }}
                    style={styles.invitation}
                  >
                    <Text style={styles.swords}>⚔</Text>
                    <Text style={styles.invitationT}>Invitation</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {}}
                    style={styles.help}
                    hitSlop={8}
                  >
                    <Text style={styles.helpT}>?</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.timeBlock}>
                <Text style={styles.timeLabel}>Time</Text>
                <View style={styles.timeRow}>
                  {TIMES.map((t) => {
                    const on = minutes === t.m;
                    return (
                      <Pressable key={t.m} onPress={() => setMinutes(t.m)} style={{ flex: 1 }}>
                        {on ? (
                          <LinearGradient colors={['#FF4FA3', '#7B5CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.timeChipOn}>
                            <Text style={styles.timeChipTOn}>{t.label}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={styles.timeChip}>
                            <Text style={styles.timeChipT}>{t.label}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modeRow}>
                {MODES.map((m) => {
                  const on = mode === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        setMode(m.id);
                        setPicked(null);
                        if (m.id === 'friend' || m.id === 'team') {
                          setView('invite');
                          onRefreshRooms?.();
                        }
                      }}
                      style={[styles.modeCard, on && styles.modeCardOn]}
                    >
                      <Text style={styles.modeTag}>{m.tag}</Text>
                      {m.badge ? <Text style={styles.modeBadge}>{m.badge}</Text> : null}
                      <LinearGradient colors={m.colors} style={styles.modeArt}>
                        <Ionicons name={m.icon} size={22} color="#fff" />
                      </LinearGradient>
                      <Text style={styles.modeName}>{m.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.ctaRow}>
                <Pressable
                  onPress={() => {
                    setMode('random');
                    setView('match');
                    challenge(null, 'random', { random: true });
                  }}
                  style={styles.randomWrap}
                >
                  <LinearGradient
                    colors={['#FF4FA3', '#60A5FA']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.randomBtn}
                  >
                    <Text style={styles.randomTitle}>Random Match</Text>
                    <Text style={styles.randomSub}>{minutes}min</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMode('friend');
                    setView('invite');
                    onRefreshRooms?.();
                  }}
                  style={styles.inviteRoomBtn}
                >
                  <Text style={styles.inviteRoomT}>Invite a room</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {view === 'invite' ? (
            <View style={{ maxHeight: 520 }}>
              <View style={styles.inviteHead}>
                <Pressable onPress={() => setView('home')} hitSlop={10} style={styles.backBtn}>
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </Pressable>
                <Text style={styles.inviteTitle}>
                  {mode === 'team' ? 'Team PK · pick rooms' : 'Invite a room'}
                </Text>
                <View style={{ width: 36 }} />
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search Room ID/User ID"
                  placeholderTextColor="#6B7280"
                  style={styles.searchInput}
                />
              </View>
              {loadingRooms ? (
                <ActivityIndicator color="#FF4FA3" style={{ marginTop: 24 }} />
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {filtered.map((r) => {
                    const name = r.hostName || r.host_name || r.title || 'Host';
                    const pic = r.hostProfilePic || r.host_profile_pic || r.cover;
                    const on = picked?.channel === r.channel;
                    return (
                      <Pressable
                        key={r.channel}
                        onPress={() => {
                          const rival = {
                            userId: r.hostId || r.host_id,
                            name,
                            channel: r.channel,
                            profilePic: pic,
                          };
                          setPicked(rival);
                          setView('match');
                          challenge(rival, mode === 'team' ? 'friend' : 'friend');
                        }}
                        style={[styles.roomRow, on && styles.roomRowOn]}
                      >
                        <Avatar uri={mediaUrl(pic)} name={name} size={44} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
                          <Text style={styles.roomMeta}>
                            {Number(r.viewers || r.viewer_count || 0)} watching
                          </Text>
                        </View>
                        <LinearGradient colors={['#FF4FA3', '#7B5CFF']} style={styles.pkChip}>
                          <Text style={styles.pkChipT}>Invite</Text>
                        </LinearGradient>
                      </Pressable>
                    );
                  })}
                  {!filtered.length ? (
                    <Text style={styles.empty}>No other lives online to invite.</Text>
                  ) : null}
                </ScrollView>
              )}
            </View>
          ) : null}

          {view === 'match' ? (
            <View style={styles.matchBody}>
              <View style={styles.matchHead}>
                <View style={styles.titleRow}>
                  <Text style={styles.logoP}>P</Text>
                  <Text style={styles.logoK}>K</Text>
                  <Text style={styles.title}>PK Matching..</Text>
                </View>
                <Text style={styles.matchDur}>{minutes}mins</Text>
              </View>
              <LinearGradient colors={['#60A5FA', '#F472B6']} style={styles.matchRing}>
                <View style={styles.matchInner}>
                  <Text style={styles.matchSecs}>
                    {matchSeconds > 0 ? `${matchSeconds}s` : `${minutes * 60}s`}
                  </Text>
                </View>
              </LinearGradient>
              <Text style={styles.matchHint}>{matchLabel || 'Finding a host…'}</Text>
              <Pressable
                onPress={() => {
                  onCancelMatch?.();
                  setView('home');
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelT}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
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

  return (
    <View style={hud.wrap} pointerEvents="box-none">
      <View style={hud.banner}>
        <Text style={hud.bannerT}>{pk ? 'PK BATTLE' : 'PK CHALLENGE'}</Text>
      </View>
      <View style={hud.bar}>
        <LinearGradient colors={['#FF4FA3', '#DB2777']} style={[hud.left, { flex: leftPct }]}>
          <Text style={hud.score} numberOfLines={1}>{left}</Text>
        </LinearGradient>
        <View style={hud.vs}><Text style={hud.vsT}>PK</Text></View>
        <LinearGradient colors={['#60A5FA', '#2563EB']} style={[hud.right, { flex: 100 - leftPct }]}>
          <Text style={hud.score} numberOfLines={1}>{right}</Text>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#1A1C26',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '88%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  logoP: { color: '#FF5EA8', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  logoK: { color: '#6EC8FF', fontWeight: '900', fontSize: 22, letterSpacing: -1, marginRight: 8 },
  title: { color: '#fff', fontWeight: '700', fontSize: 18 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invitation: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  swords: { fontSize: 14 },
  invitationT: { color: 'rgba(255,255,255,0.92)', fontWeight: '600', fontSize: 13 },
  help: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpT: { color: '#fff', fontWeight: '700', fontSize: 13 },
  timeBlock: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  timeLabel: { color: 'rgba(255,255,255,0.88)', fontWeight: '600', fontSize: 15, minWidth: 36 },
  timeRow: { flex: 1, flexDirection: 'row', gap: 10 },
  timeChip: {
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeChipOn: { borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  timeChipT: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 13 },
  timeChipTOn: { color: '#fff', fontWeight: '800', fontSize: 13 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardOn: {
    borderColor: '#FF4FA3',
    backgroundColor: 'rgba(255,79,163,0.14)',
  },
  modeTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '800',
  },
  modeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '800',
  },
  modeArt: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  modeName: { color: '#fff', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  randomWrap: { flex: 1.15, borderRadius: 999, overflow: 'hidden' },
  randomBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 999 },
  randomTitle: { color: '#fff', fontWeight: '900', fontSize: 15 },
  randomSub: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12, marginTop: 1 },
  inviteRoomBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  inviteRoomT: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 14 },
  inviteHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800', fontSize: 16 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#fff', fontWeight: '600' },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  roomRowOn: { backgroundColor: 'rgba(255,79,163,0.1)' },
  roomName: { color: '#fff', fontWeight: '800' },
  roomMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  pkChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pkChipT: { color: '#fff', fontWeight: '900', fontSize: 12 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 28, fontWeight: '600' },
  matchBody: { alignItems: 'center', paddingVertical: 18 },
  matchHead: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  matchDur: { color: '#FF4FA3', fontWeight: '800' },
  matchRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    marginBottom: 14,
  },
  matchInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#12141C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchSecs: { color: '#fff', fontWeight: '900', fontSize: 28 },
  matchHint: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginBottom: 16 },
  cancelBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cancelT: { color: '#fff', fontWeight: '800' },
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
