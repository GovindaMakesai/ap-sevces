import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Field } from '../../components/ui';
import { CreamCard, CreamHeader, OrangeCta } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';

export default function WithdrawScreen({ navigation }) {
  const { api } = useAuth();
  const [mode, setMode] = useState('cash');
  const [amount, setAmount] = useState('');
  const [qr, setQr] = useState(null);
  const [sellerId, setSellerId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState(0);

  useFocusEffect(
    useCallback(() => {
      api.get('/wallet/balance').then((r) => {
        const d = api.unwrap(r);
        setPoints(Number(d.points || d.point_balance || 0));
      }).catch(() => {});
    }, [api])
  );

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled) setQr(res.assets[0].uri);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'exchange') {
        await api.post('/wallet/exchange', { points: Number(amount) });
      } else if (mode === 'transfer') {
        await api.post('/wallet/transfer-points', { points: Number(amount), sellerId });
      } else {
        const form = new FormData();
        form.append('amount', String(amount));
        if (qr) form.append('qr_image', { uri: qr, name: 'qr.jpg', type: 'image/jpeg' });
        await api.request('/wallet/withdraw', { method: 'POST', body: form });
      }
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <CreamHeader title="Withdraw / Exchange" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.tabs}>
          {[
            { id: 'cash', label: 'Cash out' },
            { id: 'exchange', label: 'Exchange' },
            { id: 'transfer', label: 'Transfer' },
          ].map((t) => (
            <Pressable key={t.id} onPress={() => setMode(t.id)} style={[styles.tab, mode === t.id && styles.tabOn]}>
              <Text style={[styles.tabT, mode === t.id && styles.tabTOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        {mode === 'cash' ? (
          <Text style={styles.help}>3 steps to send your cash request{'\n'}1. Enter how many points to withdraw (min 100,000 = $10){'\n'}2. Upload your UPI/bank QR photo{'\n'}3. Tap Submit withdrawal request</Text>
        ) : null}
        {mode === 'exchange' ? (
          <Text style={styles.help}>Exchange points → NR coins. Multiples of 100,000. 70% rate. Instant. SVIP points are not added.</Text>
        ) : null}
        {mode === 'transfer' ? (
          <Text style={styles.help}>Transfer points to an active Coin Seller only. Service charge 3%. Confirm details before transacting.</Text>
        ) : null}
        <CreamCard style={styles.bal}>
          <Text style={styles.k}>Available points</Text>
          <Text style={styles.v}>{indianGroup(points)}</Text>
        </CreamCard>
        <ErrorBanner message={error} />
        <View style={{ paddingHorizontal: 16 }}>
          <Field label={mode === 'cash' ? 'Points to withdraw' : 'Points'} value={amount} onChangeText={setAmount} keyboardType="numeric" />
          {mode === 'cash' ? (
            <>
              <Pressable onPress={pick} style={styles.qrBtn}>
                <Text style={styles.qrT}>{qr ? 'QR selected · change' : 'Upload your UPI / bank QR'}</Text>
              </Pressable>
              {qr ? <Image source={{ uri: qr }} style={styles.qrPrev} /> : null}
            </>
          ) : null}
          {mode === 'transfer' ? <Field label="Coin seller ID" value={sellerId} onChangeText={setSellerId} /> : null}
          <View style={{ height: 12 }} />
          {mode === 'cash' ? (
            <Pressable onPress={submit} disabled={busy} style={styles.lavender}>
              <Text style={styles.lavenderT}>{busy ? 'Submitting…' : 'Submit withdrawal request'}</Text>
            </Pressable>
          ) : (
            <OrangeCta
              title={busy ? 'Submitting…' : mode === 'exchange' ? 'Exchange now' : 'Transfer to seller'}
              onPress={submit}
            />
          )}
        </View>
        <Pressable onPress={() => navigation.navigate('WalletHistory')} style={{ marginTop: 16 }}>
          <Text style={styles.hist}>History</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  tabs: { flexDirection: 'row', margin: 12, backgroundColor: '#fff', borderRadius: 14, padding: 4, borderWidth: 1, borderColor: '#E8D9B5' },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabOn: { backgroundColor: '#FF8C00' },
  tabT: { fontWeight: '700', color: '#8B6D3B', fontSize: 12 },
  tabTOn: { color: '#fff' },
  help: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, color: '#5D4037', lineHeight: 20, marginBottom: 12, borderWidth: 1, borderColor: '#E8D9B5' },
  bal: { marginHorizontal: 16, marginBottom: 12, padding: 18 },
  k: { color: '#8B6D3B', fontWeight: '700' },
  v: { color: '#5D4037', fontSize: 32, fontWeight: '800' },
  qrBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8D9B5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  qrT: { color: '#5D4037', fontWeight: '800' },
  qrPrev: { width: '100%', height: 160, borderRadius: 12, marginTop: 10, backgroundColor: '#fff' },
  lavender: {
    backgroundColor: '#C4B5FD',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  lavenderT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hist: { textAlign: 'center', color: '#E89020', fontWeight: '800' },
});
