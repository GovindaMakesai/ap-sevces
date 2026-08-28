import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner, Field, Loading } from '../../components/ui';
import { CreamCard, CreamHeader, OrangeCta } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';
import { filePart, pickMedia } from '../../lib/pickMedia';
import { formatUserDisplayId, isCoinSeller } from '../../lib/roles';

const PACKAGES = [
  { inr: 4150, stock: 480000, usd: 50 },
  { inr: 8300, stock: 960000, usd: 100 },
  { inr: 16600, stock: 1920000, usd: 200 },
  { inr: 24900, stock: 2880000, usd: 300 },
  { inr: 33200, stock: 3840000, usd: 400 },
];

export function CoinSellerScreen({ navigation }) {
  const { api, user, displayName } = useAuth();
  const [dash, setDash] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('recent');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [found, setFound] = useState(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeAmt, setExchangeAmt] = useState('');
  const seller = isCoinSeller(user);
  const publicId = formatUserDisplayId(user);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [d, t, w] = await Promise.all([
        api.get('/social/coin-seller/dashboard').catch(() => ({})),
        api.get('/social/coin-seller/transfers', { limit: 50 }).catch(() => ({})),
        api.get('/wallet/balance').catch(() => ({})),
      ]);
      const dd = api.unwrap(d);
      const wd = api.unwrap(w);
      setDash({
        ...dd,
        coins: Number(dd.coins || dd.wallet_coins || wd.coin_balance || wd.coins || 0),
        stock: Number(dd.stock || dd.seller_stock || wd.seller_stock || 0),
        giftCoins: Number(dd.gift_coins || dd.giftCoins || wd.gift_coins || wd.giftCoins || 0),
        sold: Number(dd.sold || dd.coins_sold || dd.transferred || 0),
        exchanged: Number(dd.exchanged || dd.exchange_total || 0),
        recharge: Number(dd.recharge_usd || dd.recharge || 0),
        pending: Boolean(dd.pending_topup || dd.pending),
        credited: Boolean(dd.credited),
        levelLabel: dd.level_label || dd.seller_level || 'Standard Seller',
      });
      setTransfers(api.extractList(t));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const lookup = async () => {
    try {
      const res = await api.get(`/social/coin-seller/lookup/${encodeURIComponent(target)}`);
      setFound(api.unwrap(res));
    } catch (e) {
      Alert.alert('Lookup failed', e.message);
    }
  };

  const transfer = async () => {
    try {
      await api.post('/social/coin-seller/transfer', {
        recipient_id: found?.id || found?.userId || target,
        accountId: found?.id || found?.userId || target,
        coins: Number(amount),
      });
      Alert.alert('Sent', 'Coins transferred');
      setAmount('');
      load();
    } catch (e) {
      Alert.alert('Transfer failed', e.message);
    }
  };

  const exchange = () => {
    setExchangeAmt(amount || '');
    setExchangeOpen(true);
  };

  const doExchange = async () => {
    const coins = Number(exchangeAmt);
    if (!coins || coins <= 0) {
      Alert.alert('Need amount', 'Enter how many coins to exchange into gift coins');
      return;
    }
    try {
      await api.post('/social/coin-seller/exchange', { coins });
      setExchangeOpen(false);
      setExchangeAmt('');
      Alert.alert('Exchanged', `${indianGroup(coins)} coins → gift coins`);
      load();
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  if (loading && !dash) return <Loading />;
  const d = dash || {};
  const pic = mediaUrl(user?.profile_pic || user?.profilePic);
  const low = Number(d.stock) <= 0;

  return (
    <View style={styles.root}>
      <CreamHeader title="Coin Seller Center" navigation={navigation} />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ paddingBottom: 40 }}>
        <ErrorBanner message={error} onRetry={load} />
        {low ? (
          <View style={[styles.alert, { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }]}>
            <Ionicons name="warning" size={18} color="#E65100" />
            <Text style={styles.alertT}>Low stock (~$0). Top-up to keep selling.</Text>
            <Pressable onPress={() => navigation.navigate('SellerStock')} style={styles.smallBtn}>
              <Text style={styles.smallBtnT}>Top-up</Text>
            </Pressable>
          </View>
        ) : null}
        {d.pending ? (
          <View style={[styles.alert, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}>
            <Ionicons name="time-outline" size={18} color="#1565C0" />
            <Text style={styles.alertT}>Top-up awaiting admin approval</Text>
          </View>
        ) : null}
        {d.credited ? (
          <View style={[styles.alert, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
            <Text style={styles.alertT}>Stock credited — pull down or reopen to refresh</Text>
          </View>
        ) : null}
        <View style={[styles.alert, { backgroundColor: '#FFF8E1', borderColor: '#FFE082' }]}>
          <Ionicons name="bulb-outline" size={18} color="#F9A825" />
          <Text style={styles.alertT}>Coins (seller stock + wallet) are normal coins for selling / transferring to users. Exchange coins into Gift coins to send live/chat gifts. Gift coins are never for sale.</Text>
        </View>

        <View style={styles.profileRow}>
          {pic ? <Image source={{ uri: pic }} style={styles.av} /> : <Avatar name={displayName} size={58} />}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={styles.sellerTag}><Text style={styles.sellerTagT}>Coins Seller</Text></View>
            <Text style={styles.pName}>{displayName}</Text>
            <Text style={styles.pBadge}>{d.levelLabel}</Text>
            <Text style={styles.pId}>ID: {publicId || '—'}</Text>
            <Pressable onPress={() => navigation.navigate('EditProfile')}><Text style={styles.edit}>Message Edit ›</Text></Pressable>
          </View>
          <Pressable onPress={() => navigation.navigate('Svip')} style={styles.levelUp}>
            <Text style={styles.levelUpT}>Level Up</Text>
          </Pressable>
        </View>

        <CreamCard>
          <View style={styles.balHead}>
            <Text style={styles.balK}>Coins (same as profile Coins)</Text>
            <Pressable onPress={() => navigation.navigate('Wallet')}><Text style={styles.detail}>Detail ›</Text></Pressable>
          </View>
          <View style={styles.balRow}>
            <Text style={styles.balN}>{indianGroup(d.coins)}</Text>
            <Ionicons name="logo-usd" size={22} color="#C9A227" />
          </View>
          <Text style={styles.balSub}>Stock {indianGroup(d.stock)} + wallet {indianGroup(Math.max(0, d.coins - d.stock))} (= profile Coins)</Text>
          <View style={styles.dash} />
          <Text style={styles.balK}>Gift coins (same as profile Gift coins)</Text>
          <View style={styles.balRow}>
            <Text style={[styles.balN, { color: '#9B1B4A' }]}>{indianGroup(d.giftCoins)}</Text>
            <Ionicons name="gift" size={20} color="#E91E63" />
          </View>
          <Text style={[styles.balSub, { color: '#9B1B4A' }]}>For live & chat gifts only — not for selling</Text>
          <Text style={styles.footNote}>Coins → sell/transfer users · Gift coins → gifts only · totals match your profile</Text>
        </CreamCard>

        <View style={styles.ban}>
          <Ionicons name="ban" size={20} color="#C62828" />
          <Text style={styles.banT}>
            <Text style={{ fontWeight: '800' }}>Coins cannot be used for gifts. </Text>
            To send gifts on live/chat, exchange coins into Gift coins first. Top-up adds seller stock (counts toward your Coins total).
          </Text>
        </View>

        <View style={styles.grid}>
          {[
            ['cash-outline', 'Sell Coins', () => setTab('client')],
            ['arrow-down-circle-outline', 'Top-up', () => navigation.navigate('SellerStock')],
            ['sync-outline', 'Exchange', exchange],
            ['settings-outline', 'Settings', () => navigation.navigate('Settings')],
          ].map(([icon, label, fn]) => (
            <Pressable key={label} onPress={fn} style={styles.cell}>
              <Ionicons name={icon} size={28} color="#FF8C00" />
              <Text style={styles.cellT}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => navigation.navigate('SellerStock')}>
          <LinearGradient colors={['#FF9F4A', '#FF6B00']} style={styles.promo}>
            <Text style={styles.promoT}>📢  Buy Coins at Affordable Prices</Text>
          </LinearGradient>
        </Pressable>

        <CreamCard>
          <Text style={styles.days}>Last 30 days</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statN}>{indianGroup(d.exchanged)}</Text><Text style={styles.statL}>Exchanged (sell → gift)</Text></View>
            <View style={styles.stat}><Text style={styles.statN}>${d.recharge}</Text><Text style={styles.statL}>Recharge</Text></View>
            <View style={styles.stat}><Text style={styles.statN}>{indianGroup(d.sold)}</Text><Text style={styles.statL}>Coins Sold</Text></View>
          </View>
        </CreamCard>

        <View style={styles.tabs}>
          {[['recent', 'Recent Transfer'], ['client', 'Client']].map(([id, label]) => (
            <Pressable key={id} onPress={() => setTab(id)} style={styles.tab}>
              <Text style={[styles.tabT, tab === id && styles.tabOn]}>{label}</Text>
              {tab === id ? <View style={styles.tabLine} /> : null}
            </Pressable>
          ))}
        </View>

        {tab === 'client' ? (
          <CreamCard>
            <Text style={styles.balK}>Transfer coins to a user</Text>
            <Field label="User ID / nickname" value={target} onChangeText={setTarget} />
            <OrangeCta title="Lookup user" onPress={lookup} />
            {found ? <Text style={styles.balSub}>Found: {found.first_name || found.name || found.id}</Text> : null}
            <View style={{ height: 8 }} />
            <Field label="Coins" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <OrangeCta title="Send coins" onPress={transfer} />
            {!seller ? <Text style={[styles.balSub, { marginTop: 8 }]}>Apply as a coin seller to transfer stock.</Text> : null}
          </CreamCard>
        ) : (
          (transfers || []).map((t, i) => (
            <Pressable key={String(t.id || i)} style={styles.tx}>
              <Avatar uri={t.profile_pic || t.avatar} name={t.to_name || t.receiver || 'U'} size={42} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.txN}>{t.to_name || t.receiver || t.toUserId || 'Transfer'}</Text>
                <Text style={styles.txD}>{t.created_at || t.status || ''}</Text>
              </View>
              <Text style={styles.txA}>{indianGroup(t.coins || t.amount || 0)}</Text>
            </Pressable>
          ))
        )}
        {tab === 'recent' && !transfers.length ? <Text style={styles.empty}>No recent transfers</Text> : null}
      </ScrollView>

      <Modal visible={exchangeOpen} transparent animationType="fade" onRequestClose={() => setExchangeOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setExchangeOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.selT}>Exchange coins → gift coins</Text>
            <Text style={styles.balSub}>Gift coins are for live/chat gifts only — never for sale.</Text>
            <Field label="Coins to exchange" value={exchangeAmt} onChangeText={setExchangeAmt} keyboardType="numeric" />
            <OrangeCta title="Exchange" onPress={doExchange} />
            <Pressable onPress={() => setExchangeOpen(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: '#9E9E9E', fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function SellerStockTopupScreen({ navigation }) {
  const { api } = useAuth();
  const [pkg, setPkg] = useState(PACKAGES[0]);
  const [step, setStep] = useState(0);
  const [utr, setUtr] = useState('');
  const [proof, setProof] = useState(null);
  const [stock, setStock] = useState(0);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        api.get('/social/coin-seller/dashboard').catch(() => api.get('/wallet/balance')),
        api.get('/social/coin-seller/recharges').catch(() => ({})),
      ]);
      const dd = api.unwrap(d) || {};
      setStock(Number(dd.stock || dd.seller_stock || 0));
      setHistory(api.extractList(h));
    } catch (_e) {
      /* keep prior */
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const utrClean = utr.trim().replace(/\s+/g, '');
  const utrOk = /^\d{10,22}$/.test(utrClean);

  const pickProof = async () => {
    const asset = await pickMedia('image');
    if (asset) setProof(asset);
  };

  const submit = async () => {
    if (!utrOk) {
      setError('Enter a valid 10–22 digit UTR');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('package_coins', String(pkg.stock));
      form.append('payment_channel', 'upi_qr');
      form.append('transaction_id', utrClean);
      if (proof) form.append('payment_proof', filePart(proof, 'proof.jpg'));
      await api.request('/social/coin-seller/recharge', { method: 'POST', body: form });
      Alert.alert('Submitted', 'Seller stock updates after admin approval.');
      setUtr('');
      setProof(null);
      setStep(0);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <CreamHeader title="Seller Stock Top-up" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.subHead}>Seller stock top-up</Text>
        <View style={styles.steps}>
          {[
            ['cube-outline', '1. Package', 0, '#E8F5E9', '#43A047'],
            ['qr-code-outline', '2. Pay UPI', 1, '#FFF8E1', '#8B6D3B'],
            ['document-text-outline', '3. Submit', 2, '#E3F2FD', '#1565C0'],
          ].map(([icon, label, i, bg, color]) => (
            <View key={label} style={[styles.step, { backgroundColor: step === i ? bg : '#fff', borderColor: step === i ? color : '#E0E0E0' }]}>
              <Ionicons name={icon} size={18} color={step === i ? color : '#9E9E9E'} />
              <Text style={[styles.stepT, step === i && { color }]}>{label}</Text>
            </View>
          ))}
        </View>
        <LinearGradient colors={['#FFB347', '#FF8C00']} style={styles.stockBanner}>
          <Text style={styles.stockK}>SELL STOCK (GIVE TO USERS)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Ionicons name="home-outline" size={28} color="#fff" />
            <Text style={styles.stockN}>{indianGroup(stock)}</Text>
            <Text style={styles.stockL}>in stock</Text>
          </View>
          <Text style={styles.stockF}>Approved top-ups add to sell stock — not gift stock</Text>
        </LinearGradient>

        <CreamCard>
          <Text style={styles.selT}>◆  Select stock package</Text>
          <View style={styles.pkgGrid}>
            {PACKAGES.map((p) => {
              const on = pkg.inr === p.inr;
              return (
                <Pressable key={p.inr} onPress={() => { setPkg(p); setStep(0); }} style={[styles.pkg, on && styles.pkgOn]}>
                  <Text style={styles.pkgP}>₹{p.inr.toLocaleString('en-IN')}</Text>
                  <Text style={styles.pkgS}>{indianGroup(p.stock)} stock</Text>
                  <Text style={styles.pkgB}>${p.usd} wholesale</Text>
                </Pressable>
              );
            })}
          </View>
          <OrangeCta title="Pay exact amount via UPI" onPress={() => setStep(1)} style={{ marginTop: 12 }} />
        </CreamCard>

        {step >= 1 ? (
          <CreamCard>
            <Text style={styles.selT}>Pay ₹{pkg.inr.toLocaleString('en-IN')} via UPI</Text>
            <Text style={styles.balSub}>Stock added: {indianGroup(pkg.stock)} coins</Text>
            <Image source={require('../../../assets/payment-qr.png')} style={styles.qr} resizeMode="contain" />
            <View style={styles.payApps}>
              {['GPay', 'PhonePe', 'Paytm'].map((a) => (
                <View key={a} style={styles.payApp}><Text style={styles.payAppT}>{a}</Text></View>
              ))}
            </View>
            <OrangeCta title="I have paid — enter UTR" onPress={() => setStep(2)} />
          </CreamCard>
        ) : null}

        {step >= 2 ? (
          <CreamCard>
            <ErrorBanner message={error} />
            <Field label="UPI transaction reference (UTR)" value={utr} onChangeText={setUtr} keyboardType="number-pad" placeholder="10–22 digit UTR" />
            <Text style={styles.balSub}>Required — admin verifies before stock is credited.</Text>
            <Text style={[styles.selT, { marginTop: 12 }]}>Payment screenshot</Text>
            <Pressable onPress={pickProof} style={styles.proofZone}>
              {proof?.uri ? (
                <Image source={{ uri: proof.uri }} style={styles.proofImg} resizeMode="cover" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={28} color="#FF8C00" />
                  <Text style={styles.balSub}>Tap to upload receipt · JPG or PNG</Text>
                </>
              )}
            </Pressable>
            {proof ? (
              <Pressable onPress={pickProof} style={{ marginBottom: 8 }}>
                <Text style={{ color: '#FF8C00', fontWeight: '700', textAlign: 'center' }}>Change image</Text>
              </Pressable>
            ) : null}
            <OrangeCta
              title={busy ? 'Submitting…' : utrOk ? 'Submit top-up for verification' : 'Enter UTR to submit'}
              onPress={submit}
            />
            <Text style={[styles.footNote, { textAlign: 'center' }]}>
              {utrOk ? 'Ready — admin will credit seller stock after verification' : 'Pick package → pay via QR → paste UTR'}
            </Text>
          </CreamCard>
        ) : null}

        <CreamCard>
          <Text style={styles.selT}>Top-up requests</Text>
          {!history.length ? <Text style={styles.empty}>No top-up requests yet</Text> : null}
          {history.map((r, i) => (
            <View key={String(r.id || i)} style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txN}>{indianGroup(r.coins || r.package_coins || r.stock || 0)} stock</Text>
                <Text style={styles.txD}>{r.transaction_id || r.utr || r.status || ''} · {r.created_at || r.createdAt || ''}</Text>
              </View>
              <Text style={[styles.txA, { fontSize: 12, color: String(r.status || '').includes('approv') || r.status === 'credited' ? '#2E7D32' : '#FF8C00' }]}>
                {r.status || 'pending'}
              </Text>
            </View>
          ))}
        </CreamCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  alert: { marginHorizontal: 14, marginTop: 8, borderRadius: 12, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertT: { flex: 1, color: '#5D4037', fontSize: 12, lineHeight: 17 },
  smallBtn: { backgroundColor: '#C9A227', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 12 },
  av: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#C9A227' },
  sellerTag: { alignSelf: 'flex-start', backgroundColor: '#C9A227', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 2 },
  sellerTagT: { color: '#fff', fontSize: 9, fontWeight: '800' },
  pName: { fontWeight: '800', color: '#5D4037', fontSize: 16 },
  pBadge: { alignSelf: 'flex-start', backgroundColor: '#F5D76E', color: '#fff', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800', marginTop: 3 },
  pId: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },
  edit: { color: '#FF8C00', fontWeight: '700', fontSize: 12, marginTop: 2 },
  levelUp: { backgroundColor: '#FF8C00', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  levelUpT: { color: '#fff', fontWeight: '800' },
  balHead: { flexDirection: 'row', justifyContent: 'space-between' },
  balK: { color: '#5D4037', fontWeight: '700', fontSize: 13 },
  detail: { color: '#FF8C00', fontWeight: '700' },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  balN: { fontSize: 26, fontWeight: '800', color: '#5D4037', flex: 1 },
  balSub: { color: '#8B8B3C', fontSize: 12, marginTop: 4 },
  dash: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#E6C35C', marginVertical: 10 },
  footNote: { color: '#9E9E9E', fontSize: 11, marginTop: 8 },
  ban: { marginHorizontal: 14, marginTop: 10, backgroundColor: '#FDECEC', borderColor: '#EF9A9A', borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8 },
  banT: { flex: 1, color: '#7B1C3A', fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, marginTop: 8 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 12 },
  cellT: { color: '#5D4037', fontWeight: '700', fontSize: 11, marginTop: 4, textAlign: 'center' },
  promo: { marginHorizontal: 14, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  promoT: { color: '#fff', fontWeight: '800' },
  days: { color: '#9E9E9E', fontSize: 12, marginBottom: 8 },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statN: { fontWeight: '800', color: '#5D4037', fontSize: 13 },
  statL: { color: '#9E9E9E', fontSize: 10, textAlign: 'center', marginTop: 4 },
  tabs: { flexDirection: 'row', marginHorizontal: 14, marginTop: 8, borderBottomWidth: 1, borderBottomColor: '#F0E6C8' },
  tab: { marginRight: 22, paddingVertical: 10 },
  tabT: { color: '#9E9E9E', fontWeight: '700' },
  tabOn: { color: '#FF8C00' },
  tabLine: { height: 3, backgroundColor: '#FF8C00', borderRadius: 2, marginTop: 6 },
  tx: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 14, marginTop: 8, borderRadius: 12, padding: 10 },
  txN: { fontWeight: '800', color: '#5D4037' },
  txD: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  txA: { color: '#FF8C00', fontWeight: '800', fontSize: 16 },
  empty: { textAlign: 'center', color: '#BDBDBD', marginTop: 16 },
  subHead: { fontWeight: '800', color: '#5D4037', marginHorizontal: 16, marginTop: 4 },
  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginTop: 10 },
  step: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  stepT: { fontSize: 10, fontWeight: '700', color: '#9E9E9E', marginTop: 2 },
  stockBanner: { margin: 14, borderRadius: 16, padding: 16 },
  stockK: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  stockN: { color: '#fff', fontSize: 36, fontWeight: '800' },
  stockL: { color: '#fff', fontWeight: '700' },
  stockF: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 8 },
  selT: { fontWeight: '800', color: '#5D4037', marginBottom: 10 },
  pkgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pkg: { width: '48%', borderWidth: 1, borderColor: '#E8DCC0', borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  pkgOn: { borderWidth: 2, borderColor: '#FFB347', backgroundColor: '#FFF8E1' },
  pkgP: { fontWeight: '800', fontSize: 18, color: '#5D4037' },
  pkgS: { color: '#5D4037', marginTop: 4, fontSize: 12 },
  pkgB: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#E8F5E9', color: '#2E7D32', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '700' },
  qr: { width: '100%', height: 220, marginVertical: 12 },
  payApps: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  payApp: { backgroundColor: '#FFF3E0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  payAppT: { color: '#E65100', fontWeight: '700', fontSize: 12 },
  proofZone: {
    borderWidth: 1,
    borderColor: '#FFCC80',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    marginVertical: 10,
    backgroundColor: '#FFF8E1',
  },
  proofImg: { width: '100%', height: 160, borderRadius: 10 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0E6C8' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
});
