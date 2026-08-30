import React, { useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui';
import { newClientRequestId } from '../lib/clientRequestId';

const UNITS = [10, 50, 100, 500, 1000];
const COUNTS = [5, 10, 50, 100, 200];
const DURS = [
  { s: 180, label: '3min' },
  { s: 300, label: '5min' },
  { s: 600, label: '10min' },
];
const ORANGE = '#F97316';

function Chip({ label, on, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      {icon ? <Text style={styles.chipIcon}>{icon}</Text> : null}
      <Text style={[styles.chipT, on && styles.chipTOn]}>{label}</Text>
      {on ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={10} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

export const LUCKY_BOX_RULES = [
  {
    title: 'Claiming',
    lines: [
      'Meet the participation condition (everyone, follow host, or fan club).',
      'Grab: after the countdown, tap Open the box. First come, first served until rewards run out.',
      'Random: after the countdown the server picks winners from people still in the room. Leave early and you are out.',
    ],
  },
  {
    title: 'Distribution',
    lines: [
      'Even Split: every winner gets the same coin amount.',
      'Lucky Draw: winners share the pool with random amounts that add up to the total you paid.',
      'Host and viewers can both send a Lucky Box from Features Center.',
    ],
  },
  {
    title: 'Returns',
    lines: [
      'A sent box cannot be cancelled.',
      'Grab: coins not claimed within 30 minutes return to the sender.',
      'Random: leftover coins after the draw return immediately.',
    ],
  },
];

export function LuckyBoxRules({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose}>
        <Pressable style={[styles.whiteSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Rule Description</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#111" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 520 }}>
            {LUCKY_BOX_RULES.map((sec) => (
              <View key={sec.title} style={{ marginBottom: 16 }}>
                <Text style={styles.ruleH}>[{sec.title}]</Text>
                {sec.lines.map((line) => (
                  <Text key={line} style={styles.ruleP}>• {line}</Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function LuckyBoxComposer({
  visible,
  onClose,
  balance,
  sending,
  error,
  onSend,
  onOpenRules,
  onOpenHistory,
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('even');
  const [unit, setUnit] = useState(10);
  const [count, setCount] = useState(5);
  const [custom, setCustom] = useState('');
  const [who, setWho] = useState('all');
  const [method, setMethod] = useState('grab');
  const [dur, setDur] = useState(180);
  const pending = useRef(null);
  const winnerCount = custom.trim() ? Math.max(1, Math.min(200, parseInt(custom, 10) || count)) : count;
  const total = unit * winnerCount;
  const whoLabel = who === 'follow' ? 'Follow the host' : who === 'fanclub' ? 'Join Fan Club' : 'All audiences';

  useEffect(() => {
    if (visible) {
      setTab('even');
      setUnit(10);
      setCount(5);
      setCustom('');
      setWho('all');
      setMethod('grab');
      setDur(180);
      pending.current = null;
    }
  }, [visible]);

  if (!visible) return null;

  const send = () => {
    if (sending) return;
    if (total > Number(balance || 0)) return;
    if (!pending.current) pending.current = newClientRequestId('lbox');
    onSend?.({
      mode: tab,
      claimMethod: method,
      participate: who,
      unitCoins: unit,
      winnerCount,
      durationSec: dur,
      clientRequestId: pending.current,
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose}>
        <Pressable style={[styles.whiteSheet, { paddingBottom: insets.bottom + 10 }]} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <View style={styles.tabs}>
              <Pressable onPress={() => setTab('even')} style={styles.tabBtn}>
                <Text style={[styles.tabT, tab === 'even' && styles.tabOn]}>Even Split</Text>
                {tab === 'even' ? <View style={styles.tabLine} /> : null}
              </Pressable>
              <Pressable onPress={() => setTab('lucky')} style={styles.tabBtn}>
                <Text style={[styles.tabT, tab === 'lucky' && styles.tabOn]}>Lucky Draw</Text>
                {tab === 'lucky' ? <View style={styles.tabLine} /> : null}
              </Pressable>
            </View>
            <View style={styles.headIcons}>
              <Pressable onPress={onOpenHistory} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="time-outline" size={20} color="#111" />
              </Pressable>
              <Pressable onPress={onOpenRules} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="help-circle-outline" size={22} color="#111" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.sec}>Per capita coins</Text>
          <View style={styles.rowWrap}>
            {UNITS.map((n) => (
              <Chip key={n} label={String(n)} icon="🪙" on={unit === n} onPress={() => setUnit(n)} />
            ))}
          </View>

          <Text style={styles.sec}>Distribution amount</Text>
          <View style={styles.rowWrap}>
            {COUNTS.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                on={count === n && !custom.trim()}
                onPress={() => { setCount(n); setCustom(''); }}
              />
            ))}
            <Pressable
              onPress={() => setCustom(custom ? custom : String(count))}
              style={[styles.chip, custom.trim() ? styles.chipOn : null]}
            >
              <Text style={[styles.chipT, custom.trim() && styles.chipTOn]}>custom</Text>
            </Pressable>
          </View>
          {custom !== '' ? (
            <TextInput
              value={custom}
              onChangeText={setCustom}
              keyboardType="number-pad"
              placeholder="Winners (1–200)"
              placeholderTextColor="#9CA3AF"
              style={styles.customIn}
            />
          ) : null}

          <Pressable
            onPress={() => setWho(who === 'all' ? 'follow' : who === 'follow' ? 'fanclub' : 'all')}
            style={styles.condRow}
          >
            <Text style={styles.condL}>Participation conditions</Text>
            <Text style={styles.condV}>{whoLabel}  ›</Text>
          </Pressable>

          <Text style={styles.sec}>Claim method</Text>
          <View style={styles.methodRow}>
            <Pressable onPress={() => setMethod('grab')} style={[styles.method, method === 'grab' && styles.methodOn]}>
              <Text style={[styles.methodT, method === 'grab' && styles.methodTOn]}>Grab</Text>
            </Pressable>
            <Pressable onPress={() => setMethod('random')} style={[styles.method, method === 'random' && styles.methodOn]}>
              <Text style={[styles.methodT, method === 'random' && styles.methodTOn]}>Random</Text>
            </Pressable>
          </View>

          <Text style={styles.sec}>Countdown</Text>
          <View style={styles.rowWrap}>
            {DURS.map((d) => (
              <Chip key={d.s} label={d.label} on={dur === d.s} onPress={() => setDur(d.s)} />
            ))}
          </View>

          {error ? <Text style={styles.err}>{error}</Text> : null}
          {total > Number(balance || 0) ? (
            <Text style={styles.err}>Need {total.toLocaleString()} coins (you have {Number(balance || 0).toLocaleString()})</Text>
          ) : null}

          <Pressable onPress={send} disabled={sending || total > Number(balance || 0)} style={styles.okWrap}>
            <View style={[styles.ok, (sending || total > Number(balance || 0)) && { opacity: 0.55 }]}>
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.okT}>OK  🪙 {total.toLocaleString()}</Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function remainingLabel(box) {
  const t = new Date(box.opensAt || box.opens_at).getTime() - Date.now();
  if (t <= 0) return box.status === 'open' ? 'Open' : '00:00';
  const s = Math.max(0, Math.ceil(t / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function LuckyBoxFloat({ box, onPress }) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!box) return undefined;
    const t = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [box?.id]);
  if (!box) return null;
  return (
    <Pressable onPress={onPress} style={styles.float}>
      <Text style={styles.floatChest}>🎁</Text>
      <Text style={styles.floatTime}>{remainingLabel(box)}</Text>
    </Pressable>
  );
}

export function LuckyBoxClaim({ box, visible, onClose, onClaim, claiming, result, meId }) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!visible) return undefined;
    const t = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [visible, box?.id]);
  if (!visible || !box) return null;
  const open = new Date(box.opensAt || box.opens_at).getTime() <= Date.now();
  const isRandom = (box.claimMethod || box.claim_method) === 'random';
  const mine = String(box.senderId || box.sender_id) === String(meId || '');
  const cond = box.participate === 'follow' ? 'Follow the host' : box.participate === 'fanclub' ? 'Join Fan Club' : 'All audiences';
  const canGrab = open && !isRandom && !mine && box.status === 'open' && !result;
  const btn = result
    ? `Won 🪙 ${Number(result.prize || 0).toLocaleString()}`
    : !open
      ? remainingLabel(box)
      : isRandom
        ? 'Awaiting draw result'
        : canGrab
          ? 'Open the box'
          : box.status === 'settled'
            ? 'All claimed'
            : 'Closed';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerDim} onPress={onClose}>
        <Pressable style={styles.claimCard} onPress={() => {}}>
          <Text style={styles.claimTime}>{remainingLabel(box)}</Text>
          <Avatar uri={box.senderPic} name={box.senderName} size={56} />
          <Text style={styles.claimName}>{box.senderName || 'Lucky Box'}</Text>
          <Text style={styles.claimCond}>Participation: {cond}</Text>
          <Text style={styles.claimMeta}>
            {box.mode === 'lucky' ? 'Lucky Draw' : 'Even Split'} · {box.winnerCount || box.winner_count} winners
          </Text>
          <Pressable
            onPress={() => canGrab && onClaim?.(box)}
            disabled={!canGrab || claiming}
            style={[styles.claimBtn, (!canGrab || claiming) && { opacity: 0.7 }]}
          >
            <Text style={styles.claimBtnT}>{claiming ? 'Opening…' : btn}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function LuckyBoxWinBanner({ event }) {
  if (!event) return null;
  return (
    <View style={styles.winBanner} pointerEvents="none">
      <Text style={styles.winT} numberOfLines={1}>
        {event.name || 'Someone'}  WIN  🪙 {Number(event.prize || 0).toLocaleString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  centerDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  whiteSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontWeight: '800', fontSize: 17, color: '#111' },
  tabs: { flexDirection: 'row', gap: 18 },
  tabBtn: { alignItems: 'center', paddingVertical: 6 },
  tabT: { fontWeight: '800', fontSize: 16, color: '#9CA3AF' },
  tabOn: { color: '#111' },
  tabLine: { marginTop: 4, height: 2, width: 36, backgroundColor: '#111', borderRadius: 2 },
  headIcons: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  sec: { fontWeight: '700', color: '#111', marginTop: 12, marginBottom: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    position: 'relative',
  },
  chipOn: { borderColor: ORANGE, backgroundColor: '#FFF7ED' },
  chipT: { fontWeight: '800', color: '#374151' },
  chipTOn: { color: '#9A3412' },
  chipIcon: { fontSize: 11, marginBottom: 2 },
  check: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customIn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: '700',
  },
  condRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    marginTop: 8,
  },
  condL: { fontWeight: '700', color: '#111' },
  condV: { color: '#6B7280', fontWeight: '600' },
  methodRow: { flexDirection: 'row', gap: 10 },
  method: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  methodOn: { borderColor: ORANGE, backgroundColor: '#FFF7ED' },
  methodT: { fontWeight: '800', color: '#6B7280' },
  methodTOn: { color: '#9A3412' },
  err: { color: '#DC2626', fontWeight: '700', marginTop: 8, textAlign: 'center' },
  okWrap: { marginTop: 16 },
  ok: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  okT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  ruleH: { fontWeight: '800', fontSize: 15, marginBottom: 6, color: '#111' },
  ruleP: { color: '#374151', lineHeight: 20, marginBottom: 4 },
  float: { alignItems: 'center', width: 54 },
  floatChest: { fontSize: 28 },
  floatTime: { color: '#F5D76E', fontWeight: '800', fontSize: 11, marginTop: 2 },
  claimCard: {
    width: '82%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },
  claimTime: { fontWeight: '800', fontSize: 18, marginBottom: 10 },
  claimName: { fontWeight: '800', marginTop: 8, fontSize: 16 },
  claimCond: { color: '#6B7280', marginTop: 6, fontWeight: '600' },
  claimMeta: { color: '#9CA3AF', marginTop: 4, marginBottom: 14 },
  claimBtn: { backgroundColor: ORANGE, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 },
  claimBtnT: { color: '#fff', fontWeight: '800' },
  winBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: '42%',
    backgroundColor: 'rgba(251,191,36,0.95)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 30,
  },
  winT: { color: '#7C2D12', fontWeight: '900', textAlign: 'center' },
});
