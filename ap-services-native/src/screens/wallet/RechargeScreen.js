import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { ErrorBanner, Field, GoldButton } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';

const PACKAGES = [
  { inr: 99, coins: 990, bonus: 0 },
  { inr: 199, coins: 1990, bonus: 0 },
  { inr: 499, coins: 4990, bonus: 5 },
  { inr: 999, coins: 9990, bonus: 5 },
  { inr: 1999, coins: 19990, bonus: 10 },
  { inr: 4999, coins: 49990, bonus: 15 },
];

export default function RechargeScreen({ navigation }) {
  const { api } = useAuth();
  const [pkg, setPkg] = useState(PACKAGES[1]);
  const [utr, setUtr] = useState('');
  const [proof, setProof] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);

  useFocusEffect(
    useCallback(() => {
      api.get('/wallet/balance').then((r) => {
        const d = api.unwrap(r);
        setBalance(Number(d.coin_balance || d.coins || 0));
      }).catch(() => {});
      api.get('/wallet/recharges').then((r) => setHistory(api.extractList(r))).catch(() => {});
    }, [api])
  );

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) setProof(res.assets[0].uri);
  };

  const bonusCoins = Math.round(pkg.coins * (pkg.bonus / 100));
  const total = pkg.coins + bonusCoins;

  const submit = async () => {
    if (!utr.trim()) {
      setError('Enter UTR to submit');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('amount', String(pkg.inr));
      form.append('coins', String(total));
      form.append('utr', utr);
      if (proof) form.append('payment_proof', { uri: proof, name: 'proof.jpg', type: 'image/jpeg' });
      await api.request('/wallet/recharge', { method: 'POST', body: form });
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const step = utr.trim() ? 2 : 0;

  return (
    <View style={styles.root}>
      <CreamHeader title="Recharge" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.wallet}>
          <Text style={styles.wl}>Your wallet</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Ionicons name="logo-bitcoin" size={22} color="#C9A227" />
            <Text style={styles.wv}>{indianGroup(balance)}</Text>
          </View>
          <Text style={styles.ws}>Coins are used for gifts, live features & more</Text>
        </View>
        <View style={styles.steps}>
          {[
            ['cube-outline', '1. Package', 0, '#E8F5E9', '#43A047'],
            ['qr-code-outline', '2. Pay UPI', 1, '#FFF8E1', '#8B6D3B'],
            ['document-text-outline', '3. Submit', 2, '#fff', '#BDBDBD'],
          ].map(([icon, label, i, bg, color]) => (
            <View key={label} style={[styles.step, { backgroundColor: step === i ? bg : '#fff', borderColor: step === i ? color : '#E0E0E0' }]}>
              <Ionicons name={icon} size={18} color={step === i ? color : '#9E9E9E'} />
              <Text style={[styles.stepT, step === i && { color }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.h}>Choose a package</Text>
        <View style={styles.grid}>
          {PACKAGES.map((p) => (
            <Pressable key={p.inr} onPress={() => setPkg(p)} style={[styles.pkg, pkg.inr === p.inr && styles.pkgOn]}>
              <Text style={styles.amt}>₹{p.inr}</Text>
              <Text style={styles.coins}>{indianGroup(p.coins)} coins</Text>
              {p.bonus ? <Text style={styles.bonus}>+{p.bonus}% bonus</Text> : null}
            </Pressable>
          ))}
        </View>
        <View style={styles.qrCard}>
          <Text style={styles.payPill}>Scan & pay exact amount</Text>
          <Image source={require('../../../assets/payment-qr.png')} style={styles.qr} resizeMode="contain" />
          <Text style={styles.payAmt}>₹{pkg.inr}</Text>
          <Text style={styles.get}>You get <Text style={{ fontWeight: '800' }}>{indianGroup(total)} coins</Text></Text>
          <Text style={styles.break}>Base {indianGroup(pkg.coins)} · Bonus {indianGroup(bonusCoins)} · Total {indianGroup(total)}</Text>
          <View style={styles.apps}>
            <Text style={styles.app}>GPay</Text>
            <Text style={styles.app}>PhonePe</Text>
            <Text style={styles.app}>Paytm</Text>
          </View>
        </View>
        <ErrorBanner message={error} />
        <View style={{ paddingHorizontal: 16 }}>
          <Field label="Payment reference (UTR)" value={utr} onChangeText={setUtr} placeholder="10–22 digit UTR from receipt" />
          <Text style={styles.hint}>Open your payment app → transaction details → copy UTR / reference number</Text>
          <GoldButton title={proof ? 'Proof selected · change' : 'Tap to upload receipt'} onPress={pick} />
          <Text style={styles.chip}>Coins credited after admin verifies your payment</Text>
        </View>
        <Text style={[styles.h, { marginTop: 16 }]}>Recent requests</Text>
        {history.length ? history.slice(0, 8).map((h, i) => (
          <Text key={i} style={styles.hist}>{h.amount || h.coins} · {h.status || 'pending'} · {h.utr || ''}</Text>
        )) : <Text style={styles.hist}>No requests yet</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <GoldButton title={busy ? 'Submitting…' : utr.trim() ? 'Submit recharge' : 'Enter UTR to submit'} onPress={submit} disabled={busy} />
        <Text style={styles.hint}>Step 1: pick package · Step 2: pay via QR · Step 3: paste UTR above</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  wallet: { margin: 16, backgroundColor: colors.creamCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  wl: { color: colors.textSecondary, fontWeight: '700' },
  wv: { fontSize: 28, fontWeight: '800', color: colors.gold800 },
  ws: { color: colors.textMuted, marginTop: 4 },
  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  step: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  stepT: { fontSize: 10, fontWeight: '700', color: '#9E9E9E', marginTop: 2 },
  h: { fontWeight: '800', color: colors.textPrimary, marginHorizontal: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  pkg: { width: '31%', backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pkgOn: { borderColor: colors.gold500, backgroundColor: colors.gold100 },
  amt: { fontWeight: '800', color: colors.gold800 },
  coins: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  bonus: { fontSize: 10, color: colors.orangeCta, fontWeight: '700' },
  qrCard: { margin: 16, backgroundColor: colors.creamCard, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  payPill: { backgroundColor: colors.gold100, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, fontWeight: '700', color: colors.gold800, overflow: 'hidden' },
  qr: { width: 220, height: 220, marginVertical: 12 },
  payAmt: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  get: { color: colors.textSecondary, marginTop: 4 },
  break: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  apps: { flexDirection: 'row', gap: 12, marginTop: 10 },
  app: { color: colors.gold700, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },
  chip: { textAlign: 'center', color: colors.gold700, marginTop: 10, fontWeight: '600' },
  hist: { marginHorizontal: 16, color: colors.textSecondary, marginBottom: 6 },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.creamCard },
});
