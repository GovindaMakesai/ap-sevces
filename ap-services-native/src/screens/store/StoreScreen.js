import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
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
import { STORE_CATS, STORE_ITEMS } from '../../config/storeCatalog';
import { Float } from '../../components/alive';
import GiftThumb from '../../components/GiftThumb';
import AvatarFrame, { FRAME_SKINS } from '../../components/AvatarFrame';
import CoupleRing from '../../components/CoupleRing';

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

const PRIMARY = STORE_CATS.slice(0, 8);

export default function StoreScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const startCat = route.params?.cat || 'popular';
  const [cat, setCat] = useState(startCat);
  const [sub, setSub] = useState('hot');
  const [coins, setCoins] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [more, setMore] = useState(false);
  const [owned, setOwned] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.cat) setCat(route.params.cat);
      api.get('/wallet/balance').then((r) => {
        const d = api.unwrap(r);
        setCoins(Number(d.coin_balance || d.coins || d.diamonds || 0));
        setTickets(Number(d.tickets || d.ticket_balance || 0));
      }).catch(() => {});
      api.get('/store/packages', null, { auth: false }).then((r) => {
        const extra = api.extractList(r).map((p) => ({
          cat: p.category || 'popular',
          name: p.name || p.title,
          emoji: p.emoji || '✨',
          price: Number(p.coin_cost || p.price || 0) || undefined,
          event: Boolean(p.event_limited || p.event),
          packageId: p.id || p.packageId,
          thumbnailUrl: p.thumbnailUrl || p.thumb_url || p.icon_url || p.image || p.poster,
        }));
        if (extra.length) setOwned(extra);
      }).catch(() => {});
    }, [api, route.params?.cat])
  );

  const items = useMemo(() => {
    const base = STORE_ITEMS.filter((i) => (cat === 'popular' ? i.cat === 'popular' || i.neu : i.cat === cat));
    const extra = owned.filter((i) => i.cat === cat && !base.some((b) => b.name === i.name));
    const list = [...base, ...extra];
    if (sub === 'latest') return [...list].reverse();
    return list;
  }, [cat, owned, sub]);

  const buy = async (item) => {
    if (item.event) {
      Alert.alert(item.name, 'Event limited — unlock via SVIP / event tasks.');
      setSheet(null);
      return;
    }
    if (item.ringId) {
      if (item.price && item.price > coins) {
        setSheet(null);
        navigation.navigate('Recharge');
        return;
      }
      try {
        await api.post('/cp/rings/purchase', { ringId: item.ringId });
        Alert.alert('Purchased', `${item.name} is in your CP House. Equip it to shine between you.`);
        setSheet(null);
        api.get('/wallet/balance').then((r) => {
          const d = api.unwrap(r);
          setCoins(Number(d.coin_balance || d.coins || d.diamonds || 0));
        }).catch(() => {});
      } catch (e) {
        Alert.alert('Purchase failed', e.message);
      }
      return;
    }
    if (item.packageId) {
      try {
        await api.post('/store/purchase', { packageId: item.packageId });
        Alert.alert('Purchased', item.name);
        setSheet(null);
      } catch (e) {
        Alert.alert('Purchase failed', e.message);
      }
      return;
    }
    if (item.price && item.price > coins) {
      setSheet(null);
      navigation.navigate('Recharge');
      return;
    }
    Alert.alert(item.name, `${fmt(item.price)} ${item.ticket ? 'tickets' : 'coins'}`, [
      { text: 'Recharge', onPress: () => navigation.navigate('Recharge') },
      { text: 'Close', style: 'cancel' },
    ]);
    setSheet(null);
  };

  const honor = cat === 'honor';

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}><Ionicons name="chevron-back" size={24} color="#111" /></Pressable>
        <Text style={styles.title}>Store</Text>
        <Pressable onPress={() => navigation.navigate('Rankings')} style={styles.headBtn}><Ionicons name="trophy" size={22} color="#E8B84A" /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {PRIMARY.map((c) => (
          <Pressable key={c.id} onPress={() => setCat(c.id)} style={styles.cat}>
            <View style={[styles.catIco, cat === c.id && { backgroundColor: `${c.tint}22` }]}>
              <Text style={{ fontSize: 22 }}>{c.icon}</Text>
            </View>
            <Text style={[styles.catT, cat === c.id && styles.catTOn]}>{c.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setMore(true)} style={styles.cat}>
          <View style={styles.catIco}><Ionicons name="list" size={18} color="#888" /></View>
          <Text style={styles.catT}>More</Text>
        </Pressable>
      </ScrollView>

      {honor ? (
        <View style={styles.honorBar}>
          <View style={styles.honorAv} />
          <Text style={styles.honorT}>Honor Level: 0</Text>
          <Ionicons name="chevron-forward" size={16} color="#8B6D3B" />
        </View>
      ) : cat !== 'popular' ? (
        <View style={styles.subs}>
          <Pressable onPress={() => setSub('hot')} style={[styles.sub, sub === 'hot' && styles.subOn]}>
            <Text style={[styles.subT, sub === 'hot' && styles.subTOn]}>{cat === 'special' ? 'Latest' : 'Hot Picks'}</Text>
          </Pressable>
          <Pressable onPress={() => setSub('latest')} style={styles.sub}>
            <Text style={[styles.subT, sub === 'latest' && styles.subTOn]}>{cat === 'special' ? 'Level' : 'Latest'}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 88 }}>
        {cat === 'popular' ? (
          <>
            <LinearGradient colors={['#3B2412', '#7C4A12']} style={styles.hero}>
              <Text style={styles.heroT}>Create Your Exclusive Ride</Text>
            </LinearGradient>
            <View style={styles.miniRow}>
              <View style={[styles.mini, { backgroundColor: '#FFE4EC' }]}><Text style={styles.miniT}>Bestsellers in the Dress-Up Mall</Text></View>
              <View style={[styles.mini, { backgroundColor: '#E0F2FE' }]}><Text style={styles.miniT}>Recommended Sets</Text></View>
            </View>
            <View style={styles.secRow}><Text style={styles.sec}>New This Month</Text><Text style={styles.all}>All ›</Text></View>
          </>
        ) : null}
        <View style={honor ? styles.honorList : styles.grid}>
          {items.map((it) => honor ? (
            <Pressable key={`${it.cat}-${it.name}`} style={styles.honorCard} onPress={() => setSheet(it)}>
              {it.neu ? <View style={styles.newTag}><Text style={styles.newT}>NEW</Text></View> : null}
              <GiftThumb gift={it} size={52} delay={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.honorName}>{it.name}</Text>
                <Text style={styles.price}>🎫 {fmt(it.price)}</Text>
              </View>
              <Text style={styles.limit}>{it.limit || (it.honor ? `Honor ${it.honor}+` : '')}</Text>
            </Pressable>
          ) : (
            <Pressable key={`${it.cat}-${it.name}`} style={styles.card} onPress={() => setSheet(it)}>
              {it.neu ? <View style={styles.newSash}><Text style={styles.newT}>NEW</Text></View> : null}
              {it.ssr || it.sr ? <Text style={[styles.tier, it.ssr && styles.ssr]}>{it.ssr ? 'SSR' : 'SR'}</Text> : null}
              <LinearGradient colors={it.preview || ['#F3F0FF', '#EEE']} style={styles.preview}>
                <Float delay={(it.name?.length || 0) % 5 * 120}>
                  {it.skinId ? (
                    <AvatarFrame name="You" size={52} skin={FRAME_SKINS.find((s) => s.id === it.skinId)} />
                  ) : it.ringId ? (
                    <CoupleRing ringId={it.ringId} size={52} />
                  ) : it.sample ? (
                    <View style={styles.bubble}><Text style={styles.bubbleT}>{it.sample}</Text></View>
                  ) : (
                    <GiftThumb gift={it} size={64} delay={0} />
                  )}
                </Float>
              </LinearGradient>
              <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
              {it.event ? <Text style={styles.event}>Event</Text> : (
                <Text style={styles.price}>{it.ticket ? '🎫' : '🪙'} {fmt(it.price)}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.wallet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.pill}><Text>🪙</Text><Text style={styles.pillN}>{fmt(coins)}</Text><Pressable onPress={() => navigation.navigate('Recharge')} style={styles.plus}><Text style={styles.plusT}>+</Text></Pressable></View>
        <View style={styles.pill}><Text>🎫</Text><Text style={styles.pillN}>{fmt(tickets)}</Text><Pressable onPress={() => navigation.navigate('Recharge')} style={styles.plus}><Text style={styles.plusT}>+</Text></Pressable></View>
        <Pressable onPress={() => Alert.alert('Backpack', 'Owned frames, rides, and bubbles appear here after purchase.')} style={styles.bag}>
          <Ionicons name="bag-handle-outline" size={20} color="#333" />
        </Pressable>
      </View>

      <Modal visible={more} transparent animationType="fade" onRequestClose={() => setMore(false)}>
        <Pressable style={styles.sheetBg} onPress={() => setMore(false)}>
          <View style={styles.moreSheet}>
            <Text style={styles.moreTitle}>All categories</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {STORE_CATS.map((c) => (
                <Pressable key={c.id} onPress={() => { setCat(c.id); setMore(false); }} style={styles.moreItem}>
                  <Text style={{ fontSize: 22 }}>{c.icon}</Text>
                  <Text style={styles.moreT}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(sheet)} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetBg} onPress={() => setSheet(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetName}>{sheet?.name}</Text>
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              {sheet?.skinId ? (
                <AvatarFrame name="You" size={88} skin={FRAME_SKINS.find((s) => s.id === sheet.skinId)} />
              ) : sheet?.ringId ? (
                <CoupleRing ringId={sheet.ringId} size={88} />
              ) : (
                <GiftThumb gift={sheet || {}} size={96} delay={0} />
              )}
            </View>
            <Text style={styles.sheetMeta}>{sheet?.event ? 'Event limited' : `${sheet?.ticket ? '🎫' : '🪙'} ${fmt(sheet?.price)}`}</Text>
            <Pressable onPress={() => buy(sheet)} style={styles.buy}>
              <Text style={styles.buyT}>{sheet?.event ? 'How to unlock' : coins < (sheet?.price || 0) ? 'Recharge' : 'Buy'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFB' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 6, backgroundColor: '#fff' },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111' },
  cats: { paddingHorizontal: 10, gap: 12, paddingVertical: 8, backgroundColor: '#fff' },
  cat: { alignItems: 'center', width: 64 },
  catIco: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F4F4F6', alignItems: 'center', justifyContent: 'center' },
  catT: { color: '#9CA3AF', fontSize: 11, marginTop: 4, textAlign: 'center' },
  catTOn: { color: '#111', fontWeight: '800' },
  subs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  sub: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  subOn: { backgroundColor: '#EDE9FE' },
  subT: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  subTOn: { color: '#6D28D9' },
  honorBar: { margin: 12, backgroundColor: '#F3E8FF', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  honorAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DDD6FE' },
  honorT: { flex: 1, fontWeight: '700', color: '#4C1D95' },
  hero: { marginHorizontal: 12, marginTop: 8, borderRadius: 14, padding: 18, minHeight: 88, justifyContent: 'center' },
  heroT: { color: '#FDE68A', fontSize: 20, fontWeight: '800' },
  miniRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 8 },
  mini: { flex: 1, borderRadius: 12, padding: 12, minHeight: 64, justifyContent: 'center' },
  miniT: { fontWeight: '700', color: '#111', fontSize: 13 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, marginTop: 14, marginBottom: 6 },
  sec: { fontWeight: '800', color: '#111', fontSize: 16 },
  all: { color: '#9CA3AF', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  card: { width: '31%', margin: '1.16%', backgroundColor: '#F7F6FB', borderRadius: 12, padding: 8, paddingBottom: 10 },
  preview: { height: 88, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewE: { fontSize: 32 },
  bubble: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  bubbleT: { color: '#111', fontWeight: '700', fontSize: 12 },
  name: { color: '#111', fontWeight: '700', marginTop: 6, fontSize: 12 },
  event: { color: '#E8B84A', marginTop: 2, fontSize: 11, fontWeight: '700' },
  price: { color: '#6B7280', marginTop: 2, fontSize: 12, fontWeight: '600' },
  newSash: { position: 'absolute', left: 0, top: 8, zIndex: 2, backgroundColor: '#F97316', paddingHorizontal: 6, paddingVertical: 2, borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  newTag: { position: 'absolute', left: 8, top: 8, backgroundColor: '#EF4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  newT: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tier: { position: 'absolute', right: 8, top: 8, zIndex: 2, backgroundColor: '#FBBF24', color: '#fff', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, fontSize: 10, fontWeight: '800' },
  ssr: { backgroundColor: '#F97316' },
  honorList: { paddingHorizontal: 12, gap: 10 },
  honorCard: { backgroundColor: '#FFF7D6', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  honorEmoji: { fontSize: 36, width: 48, textAlign: 'center' },
  honorName: { fontWeight: '800', color: '#7C4A12' },
  limit: { color: '#A16207', fontSize: 11, fontWeight: '700' },
  wallet: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, backgroundColor: 'rgba(255,255,255,0.96)', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F4F4F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillN: { fontWeight: '800', color: '#111' },
  plus: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  plusT: { color: '#fff', fontWeight: '800', fontSize: 13, marginTop: -1 },
  bag: { marginLeft: 'auto', width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  moreSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  moreTitle: { fontWeight: '800', fontSize: 16, marginBottom: 12 },
  moreItem: { width: '25%', alignItems: 'center', marginBottom: 16 },
  moreT: { fontSize: 11, marginTop: 4, color: '#444', textAlign: 'center' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetName: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: '#111' },
  sheetMeta: { color: '#E8B84A', textAlign: 'center', marginVertical: 12, fontWeight: '700' },
  buy: { backgroundColor: '#E8B84A', borderRadius: 999, padding: 14, alignItems: 'center' },
  buyT: { color: '#111', fontWeight: '800' },
});
