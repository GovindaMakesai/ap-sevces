import React, { useEffect, useMemo, useRef, useState } from 'react';
import { newClientRequestId } from '../lib/clientRequestId';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ANIMATED_GIFTS, resolveGiftAnim } from '../config/giftAnims';
import { AnimatedSheet } from './motion';
import GiftThumb from './GiftThumb';
import { Avatar } from './ui';

const FALLBACK = [
  { slug: 'heart', name: 'Heart', emoji: '❤️', coin_cost: 8, sheetTab: 'Popular' },
  { slug: 'ice-cream', name: 'Ice Cream', emoji: '🍦', coin_cost: 39, sheetTab: 'Popular' },
  { slug: 'strawberry', name: 'Strawberry', emoji: '🍓', coin_cost: 59, sheetTab: 'Popular' },
  { slug: 'kiss', name: 'Kiss', emoji: '💋', coin_cost: 79, sheetTab: 'Popular' },
  { slug: 'rose', name: 'Rose', emoji: '🌹', coin_cost: 99, sheetTab: 'Popular' },
];

const PRIVILEGE_GIFTS = [
  { slug: 'vip-crown', name: 'VIP Crown', emoji: '👑', coin_cost: 10000, sheetTab: 'VIP' },
  { slug: 'diamond-watch', name: 'Diamond Watch', emoji: '⌚', coin_cost: 100000, sheetTab: 'VIP' },
  { slug: 'supercar', name: 'Supercar', emoji: '🚗', coin_cost: 250000, sheetTab: 'Luxury' },
  { slug: 'lion-king', name: 'Lion King', emoji: '🦁', coin_cost: 500000, sheetTab: 'Luxury' },
  { slug: 'golden-dragon', name: 'Golden Dragon', emoji: '🐉', coin_cost: 1000000, sheetTab: 'Luxury' },
  { slug: 'yacht-voyage', name: 'Yacht Voyage', emoji: '🚢', coin_cost: 2500000, sheetTab: 'Luxury' },
  { slug: 'crystal-palace', name: 'Crystal Palace', emoji: '🏰', coin_cost: 10000000, sheetTab: 'Luxury' },
];

/** Match web gift sheet categories so Premium / VIP / etc. always show content */
const TABS = [
  { id: 'Recent', label: 'Recent' },
  { id: 'Popular', label: 'Popular' },
  { id: 'Premium', label: 'Premium' },
  { id: 'VIP', label: 'VIP' },
  { id: 'Flowers', label: 'Flowers' },
  { id: 'Lucky', label: 'Lucky' },
  { id: 'Luxury', label: 'Luxury' },
];
const QTY = [1, 10, 50, 100];
const RECENT_KEY = 'ap_gift_recent_slugs';

function costOf(g) {
  return Number(g?.coin_cost || g?.cost || g?.coins || g?.price || 0);
}

function giftKey(g) {
  return String(g?.slug || g?.id || g?.name || '');
}

function readRecent() {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    /* sync cache filled by loadRecent */
    return readRecent._cache || [];
  } catch (_e) {
    return readRecent._cache || [];
  }
}
readRecent._cache = [];

async function loadRecent() {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    readRecent._cache = Array.isArray(arr) ? arr : [];
  } catch (_e) {
    readRecent._cache = [];
  }
  return readRecent._cache;
}

async function pushRecent(slug) {
  if (!slug) return;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const prev = await loadRecent();
    const next = [slug, ...prev.filter((s) => s !== slug)].slice(0, 24);
    readRecent._cache = next;
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (_e) {}
}

function sheetTabOf(g) {
  if (isLuckyGift(g)) return 'Lucky';
  if (g?.sheetTab) return g.sheetTab;
  const s = `${g?.slug || ''} ${g?.name || ''} ${g?.tag || ''} ${g?.category || ''}`.toLowerCase();
  const p = costOf(g);
  const hasAnim = Boolean(g?.token || g?.embedUrl || g?.animToken);
  if (hasAnim || /imperial|crystal rose|golden rose|firework|royal crown|jackpot|heart me|anim/.test(s)) {
    return 'Premium';
  }
  if (/lucky|jackpot|dice|booster|firework/.test(s)) return 'Lucky';
  if (/flower|rose|bloom|tulip|lily|bouquet/.test(s)) return 'Flowers';
  if (/privi|privilege|\bvip\b|crown|diamond watch/.test(s)) return 'VIP';
  if (/car|luxury|yacht|palace|lion|dragon|ferrari|lambo|koi/.test(s) || p >= 15000) return 'Luxury';
  if (/hot|kiss|gift|cream|straw/.test(s) || p <= 8000) return 'Popular';
  return 'Popular';
}

function mergeGiftList(gifts) {
  const map = new Map();
  const put = (g) => {
    const anim = resolveGiftAnim(g) || {};
    const merged = { ...g, ...anim, coin_cost: costOf(g) || anim.price };
    if (anim.token || anim.embedUrl) merged.sheetTab = merged.sheetTab || 'Premium';
    else merged.sheetTab = g.sheetTab || sheetTabOf(merged);
    const key = giftKey(merged) || merged.name;
    if (!key) return;
    map.set(key, { ...(map.get(key) || {}), ...merged });
  };
  (gifts?.length ? gifts : FALLBACK).forEach(put);
  ANIMATED_GIFTS.forEach((g) => put({ ...g, sheetTab: 'Premium' }));
  PRIVILEGE_GIFTS.forEach(put);
  return Array.from(map.values());
}

export function isLuckyGift(g) {
  if (!g) return false;
  if (g.is_lucky || g.lucky) return true;
  return String(g.category || '').toLowerCase() === 'lucky';
}

export function pickQuickGifts(gifts, n = 5) {
  const list = mergeGiftList(gifts)
    .slice()
    .sort((a, b) => costOf(a) - costOf(b));
  const cheap = list.filter((g) => costOf(g) > 0 && costOf(g) <= 200);
  return (cheap.length >= n ? cheap : list).slice(0, n);
}

export default function GiftSheet({
  visible,
  gifts,
  balance,
  onClose,
  onSend,
  onRecharge,
  recipients = [],
  toUserId,
  onSelectRecipient,
  sending,
  error,
  onOpenLuckyBoard,
}) {
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState('Popular');
  const [selected, setSelected] = useState(null);
  const [sendAll, setSendAll] = useState(false);
  const [localErr, setLocalErr] = useState('');
  const [recent, setRecent] = useState([]);
  const [localSending, setLocalSending] = useState(false);
  const sendingLock = useRef(false);
  const pendingReq = useRef(null);
  const list = useMemo(() => mergeGiftList(gifts), [gifts]);
  const busy = Boolean(sending || localSending);

  useEffect(() => {
    if (visible) {
      setQty(1);
      setTab('Popular');
      setSendAll(false);
      setLocalErr('');
      loadRecent().then(setRecent);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    if (tab === 'Recent') {
      const order = recent.length ? recent : readRecent();
      const bySlug = new Map(list.map((g) => [giftKey(g), g]));
      const picked = order.map((s) => bySlug.get(s)).filter(Boolean);
      return picked.length ? picked : list.filter((g) => sheetTabOf(g) === 'Popular').slice(0, 8);
    }
    return list.filter((g) => sheetTabOf(g) === tab);
  }, [list, tab, recent]);

  useEffect(() => {
    if (!visible) return;
    if (selected && filtered.some((g) => giftKey(g) === giftKey(selected))) return;
    const next = filtered[0] || null;
    if (!next && !selected) return;
    setSelected(next);
  }, [visible, tab, filtered, selected]);

  const current = selected && filtered.some((g) => giftKey(g) === giftKey(selected)) ? selected : filtered[0] || null;
  const luckyMode = isLuckyGift(current);
  const qtyOptions = useMemo(() => {
    if (!luckyMode) return QTY;
    const fromCatalog = current?.lucky_quantities;
    return Array.isArray(fromCatalog) && fromCatalog.length ? fromCatalog : [1, 19, 49, 99, 299];
  }, [luckyMode, current?.lucky_quantities]);
  const err = error || localErr;

  useEffect(() => {
    if (!luckyMode) return;
    if (!qtyOptions.includes(qty)) setQty(qtyOptions[0] || 1);
  }, [luckyMode, qty, qtyOptions]);

  const send = async () => {
    if (sendingLock.current || busy) return;
    const g = current || filtered[0];
    if (!g) {
      setLocalErr('Pick a gift first');
      return;
    }
    const amount = costOf(g) * qty;
    if (amount <= 0) {
      setLocalErr('This gift has no price');
      return;
    }
    if (amount > Number(balance || 0)) {
      setLocalErr(`Need ${amount.toLocaleString()} coins (you have ${Number(balance || 0).toLocaleString()}). Tap coins to recharge.`);
      return;
    }
    sendingLock.current = true;
    setLocalSending(true);
    setLocalErr('');
    pushRecent(giftKey(g));
    try {
      const intentKey = `${giftKey(g)}:${qty}:${sendAll ? 'all' : toUserId || ''}`;
      if (!pendingReq.current || pendingReq.current.key !== intentKey) {
        pendingReq.current = { key: intentKey, clientRequestId: newClientRequestId('gift') };
      }
      const clientRequestId = pendingReq.current.clientRequestId;
      if (!sendAll && recipients.length && !toUserId) {
        const first = recipients[0];
        onSelectRecipient?.(first);
        await Promise.resolve(onSend(g, qty, { sendAll: false, toUserId: first.id, clientRequestId }));
        pendingReq.current = null;
        return;
      }
      await Promise.resolve(onSend(g, qty, { sendAll, toUserId, clientRequestId }));
      pendingReq.current = null;
    } catch (e) {
      setLocalErr(e?.message || 'Gift failed');
    } finally {
      sendingLock.current = false;
      setLocalSending(false);
    }
  };

  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={luckyMode ? '82%' : '72%'}>
      <View style={styles.sheet}>
        <View style={styles.sendHead}>
          <Text style={styles.sendLabel}>{luckyMode ? 'Lucky Gift' : 'Send gift'}</Text>
          {recipients.length > 1 ? (
            <Pressable onPress={() => setSendAll((v) => !v)} style={[styles.allToggle, sendAll && styles.allToggleOn]}>
              <Text style={[styles.allT, sendAll && styles.allTOn]}>ALL seats</Text>
            </Pressable>
          ) : null}
        </View>
        {recipients.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seats}>
            {recipients.map((r) => {
              const on = !sendAll && String(toUserId) === String(r.id);
              return (
                <Pressable key={r.id} onPress={() => { setSendAll(false); onSelectRecipient?.(r); }} style={[styles.seatChip, on && styles.seatChipOn]}>
                  <Avatar uri={r.pic} name={r.name} size={36} />
                  <Text style={styles.seatName} numberOfLines={1}>{r.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {luckyMode ? (
          <View style={styles.luckyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.luckyBannerH}>Lucky Gift</Text>
              <Text style={styles.luckyBannerS}>Send it to get up to 1000 times coins back</Text>
            </View>
            {onOpenLuckyBoard ? (
              <Pressable onPress={onOpenLuckyBoard} style={styles.rankBtn} hitSlop={8}>
                <Text style={styles.rankBtnT}>🏆 Ranking</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.tabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.tabs}
          >
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => { setTab(t.id); setSelected(null); }}
                  style={[styles.tab, on && styles.tabOn]}
                  hitSlop={6}
                >
                  <Text style={[styles.tabT, on && styles.tabTOn]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
          {filtered.map((g) => {
            const on = Boolean(current) && giftKey(current) === giftKey(g) && giftKey(g) !== '';
            return (
              <Pressable key={giftKey(g) || g.name} onPress={() => !busy && setSelected(g)} disabled={busy} style={[styles.cell, on && styles.cellOn, luckyMode && on && styles.cellLuckyOn, busy && { opacity: 0.55 }]}>
                {isLuckyGift(g) ? <Text style={styles.luckyBadge}>🍀</Text> : null}
                <GiftThumb gift={g} size={64} float={false} />
                <Text style={styles.gName} numberOfLines={1}>{g.name || g.title || 'Gift'}</Text>
                <Text style={styles.gCost}>💎 {costOf(g).toLocaleString()}</Text>
              </Pressable>
            );
          })}
          {!filtered.length ? (
            <Text style={styles.empty}>{`No ${tab} gifts yet.`}</Text>
          ) : null}
        </ScrollView>
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <View style={styles.foot}>
          <Pressable onPress={onRecharge} style={styles.bal}>
            <Text style={styles.balT}>💎 {Number(balance || 0).toLocaleString()}</Text>
            {luckyMode && current ? (
              <Text style={styles.totalHint}>Need {(costOf(current) * qty).toLocaleString()}</Text>
            ) : null}
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qtyRow}>
            {qtyOptions.map((n) => (
              <Pressable key={n} onPress={() => !busy && setQty(n)} style={[styles.qty, qty === n && styles.qtyOn]}>
                <Text style={[styles.qtyT, qty === n && styles.qtyTOn]}>{n}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={send} disabled={busy} style={styles.sendWrap} hitSlop={8}>
            <LinearGradient colors={['#FF4FA0', '#FF2D86']} style={[styles.send, busy && { opacity: 0.6 }]}>
              <Text style={styles.sendT} numberOfLines={1}>{busy ? 'Sending…' : 'Send'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </AnimatedSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: 'rgba(28, 18, 48, 0.96)', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10 },
  sendLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
  allToggle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  allToggleOn: { backgroundColor: '#FF4FA0', borderColor: '#FF4FA0' },
  allT: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 11 },
  allTOn: { color: '#fff' },
  seats: { paddingHorizontal: 12, gap: 10, paddingVertical: 8 },
  seatChip: { alignItems: 'center', width: 56, opacity: 0.55 },
  seatChipOn: { opacity: 1 },
  seatName: { color: '#E5E7EB', fontSize: 10, fontWeight: '700', marginTop: 4, maxWidth: 56, textAlign: 'center' },
  tabsWrap: {
    minHeight: 52,
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'rgba(28, 18, 48, 1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.14)',
    marginBottom: 2,
  },
  tabs: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingRight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tab: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  tabOn: {
    backgroundColor: '#FBBF24',
  },
  tabT: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    includeFontPadding: false,
    textAlign: 'center',
  },
  tabTOn: {
    color: '#1A1000',
    fontWeight: '900',
  },
  bal: { paddingHorizontal: 6, paddingVertical: 6, flexShrink: 0 },
  balT: { color: '#F9A8D4', fontWeight: '800', fontSize: 12 },
  gridScroll: { flex: 1, minHeight: 160 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 12 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 10, borderRadius: 12, position: 'relative' },
  cellOn: { backgroundColor: 'rgba(255,79,160,0.18)', borderWidth: 1, borderColor: '#FF4FA0' },
  cellLuckyOn: { borderColor: '#5EEAD4', backgroundColor: 'rgba(45,212,191,0.12)' },
  luckyBadge: { position: 'absolute', top: 4, right: 10, zIndex: 2, fontSize: 11 },
  luckyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.35)',
  },
  luckyBannerH: { color: '#fff', fontWeight: '800', fontSize: 14 },
  luckyBannerS: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  rankBtn: { backgroundColor: 'rgba(245,215,110,0.2)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  rankBtnT: { color: '#F5D76E', fontWeight: '800', fontSize: 11 },
  totalHint: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', marginTop: 2 },
  qty: { minWidth: 40, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  gName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    maxWidth: 78,
    textAlign: 'center',
  },
  gCost: { fontSize: 10, color: '#F9A8D4', fontWeight: '800' },
  empty: { width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.55)', paddingVertical: 28, fontWeight: '600' },
  err: { color: '#FCA5A5', textAlign: 'center', fontWeight: '700', fontSize: 12, paddingHorizontal: 12, paddingBottom: 4 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  qtyOn: { backgroundColor: '#fff' },
  qtyT: { fontWeight: '800', color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  qtyTOn: { color: '#111' },
  sendWrap: { width: 88, flexShrink: 0 },
  send: { height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
