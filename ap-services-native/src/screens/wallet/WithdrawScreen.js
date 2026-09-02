import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner, Field } from '../../components/ui';
import { CreamCard, CreamHeader, OrangeCta } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format';
import { filePart, pickMedia } from '../../lib/pickMedia';
import {
  DEFAULT_WALLET_SETTINGS,
  estimateExchange,
  estimatePayout,
  estimateTransferFee,
  estimateTransferNet,
  mergeWalletSettings,
  normalizeWalletBalance,
  walletPoints,
} from '../../lib/walletFields';

export default function WithdrawScreen({ navigation }) {
  const { api } = useAuth();
  const [mode, setMode] = useState('cash');
  const [amount, setAmount] = useState('');
  const [qrAsset, setQrAsset] = useState(null);
  const [sellerInput, setSellerInput] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState({});
  const [settings, setSettings] = useState(DEFAULT_WALLET_SETTINGS);
  const [transfersLeft, setTransfersLeft] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [balRes, setRes, histRes] = await Promise.all([
        api.get('/wallet/balance', null, { skipCache: true }),
        api.get('/wallet/settings', null, { skipCache: true }).catch(() => ({})),
        api.get('/wallet/transfer-points/history', { limit: 1 }, { skipCache: true }).catch(() => ({})),
      ]);
      const wd = normalizeWalletBalance(api.unwrap(balRes));
      setBalance(wd);
      const merged = mergeWalletSettings(api.unwrap(setRes) || wd.settings);
      setSettings(merged);
      const meta = histRes?.meta || histRes?.data?.meta;
      if (meta?.remaining_today != null) setTransfersLeft(Number(meta.remaining_today));
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const points = walletPoints(balance);
  const amt = Number(amount) || 0;
  const minCash = Number(settings.min_withdrawal_coins) || 100000;
  const exchangeBlock = Number(settings.exchange_points_block) || 100000;
  const transferBlock = Number(settings.points_transfer_block) || 100000;
  const feePct = Number(settings.points_transfer_service_fee_pct) || 3;

  const payoutEst = useMemo(() => (mode === 'cash' ? estimatePayout(amt, settings) : null), [mode, amt, settings]);
  const exchangeCoins = useMemo(() => (mode === 'exchange' ? estimateExchange(amt, settings) : 0), [mode, amt, settings]);
  const transferFee = useMemo(() => (mode === 'transfer' ? estimateTransferFee(amt, settings) : 0), [mode, amt, settings]);
  const transferNet = useMemo(() => (mode === 'transfer' ? estimateTransferNet(amt, settings) : 0), [mode, amt, settings]);

  const pickQr = async () => {
    const asset = await pickMedia('image');
    if (asset) setQrAsset(asset);
  };

  const lookupSeller = async () => {
    const id = sellerInput.trim();
    if (!id) {
      setError('Enter a coin seller display ID');
      return;
    }
    setLookupBusy(true);
    setError('');
    setRecipient(null);
    try {
      const res = await api.get(`/wallet/transfer-points/lookup/${encodeURIComponent(id)}`);
      const user = api.unwrap(res);
      if (!user?.id) throw new Error('Seller not found');
      setRecipient(user);
    } catch (e) {
      setError(e.message || 'Could not find seller');
    } finally {
      setLookupBusy(false);
    }
  };

  const clearRecipient = () => {
    setRecipient(null);
    setSellerInput('');
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'exchange') {
        if (amt < exchangeBlock || amt % exchangeBlock !== 0) {
          throw new Error(`Amount must be a multiple of ${indianGroup(exchangeBlock)}`);
        }
        if (amt > points) throw new Error('Insufficient balance');
        const res = await api.post('/wallet/exchange-points', { points: amt });
        const out = api.unwrap(res);
        const coinsOut = out.coinsOut ?? out.coins_out ?? estimateExchange(amt, settings);
        Alert.alert('Exchange complete', `You received ${indianGroup(coinsOut)} NR coins.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      if (mode === 'transfer') {
        if (!recipient?.id) throw new Error('Look up and confirm the coin seller first');
        if (amt < transferBlock || amt % transferBlock !== 0) {
          throw new Error(`Transfer amount must be a multiple of ${indianGroup(transferBlock)}`);
        }
        if (amt > points) throw new Error('Insufficient balance');
        const res = await api.post('/wallet/transfer-points', { recipientId: recipient.id, points: amt });
        const left = res.data?.transfersRemainingToday ?? res.data?.balance?.transfersRemainingToday;
        Alert.alert('Transfer sent', left != null ? `${left} transfer(s) left today.` : 'Points transferred.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      if (amt < minCash) throw new Error(`Minimum withdrawal is ${indianGroup(minCash)} points`);
      if (amt > points) throw new Error('Insufficient balance');
      if (!qrAsset) throw new Error('Upload your UPI or bank QR photo');
      const form = new FormData();
      form.append('amount', String(amt));
      form.append('qr_image', filePart(qrAsset, 'qr.jpg'));
      await api.request('/wallet/withdraw', { method: 'POST', body: form });
      Alert.alert('Request sent', 'Admin will review and pay you.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const helpText =
    mode === 'cash'
      ? `3 steps to send your cash request\n1. Enter points to withdraw (min ${indianGroup(minCash)})\n2. Upload your UPI/bank QR photo\n3. Tap Submit withdrawal request`
      : mode === 'exchange'
        ? `Exchange points → NR coins. Multiples of ${indianGroup(exchangeBlock)}. ${Math.round((Number(settings.exchange_coins_per_10k_points) / exchangeBlock) * 10000).toLocaleString()} coins per ${indianGroup(exchangeBlock)} pts. Instant.`
        : `Transfer points to an active Coin Seller only. Service charge ${feePct}%. Multiples of ${indianGroup(transferBlock)}.`;

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
            <Pressable key={t.id} onPress={() => { setMode(t.id); setError(''); }} style={[styles.tab, mode === t.id && styles.tabOn]}>
              <Text style={[styles.tabT, mode === t.id && styles.tabTOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.help}>{helpText}</Text>
        <CreamCard style={styles.bal}>
          <Text style={styles.k}>Available points</Text>
          <Text style={styles.v}>{indianGroup(points)}</Text>
          {points <= 0 ? <Text style={styles.zero}>Earn points from gifts, live & bookings to withdraw</Text> : null}
        </CreamCard>
        <ErrorBanner message={error} onRetry={load} />
        <View style={{ paddingHorizontal: 16 }}>
          <Field
            label={mode === 'cash' ? 'Points to withdraw' : 'Points'}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder={mode === 'exchange' ? `Multiple of ${indianGroup(exchangeBlock)}` : undefined}
          />

          {mode === 'cash' && payoutEst && amt > 0 ? (
            <Text style={styles.estimate}>
              Gross ${payoutEst.grossUsd.toFixed(2)} · {payoutEst.feePct}% fee · You receive ≈₹{Math.round(payoutEst.netInr).toLocaleString()}
            </Text>
          ) : null}
          {mode === 'exchange' && amt > 0 ? (
            <Text style={styles.estimate}>
              {amt % exchangeBlock !== 0
                ? `Must be a multiple of ${indianGroup(exchangeBlock)}`
                : `You receive: ${indianGroup(exchangeCoins)} NR coins instantly`}
            </Text>
          ) : null}
          {mode === 'transfer' && amt > 0 ? (
            <Text style={styles.estimate}>
              Fee {indianGroup(transferFee)} ({feePct}%) · Seller receives {indianGroup(transferNet)} points
              {transfersLeft != null ? ` · ${transfersLeft} transfer(s) left today` : ''}
            </Text>
          ) : null}

          {mode === 'cash' ? (
            <>
              <Pressable onPress={pickQr} style={styles.qrBtn}>
                <Ionicons name="qr-code-outline" size={18} color="#5D4037" />
                <Text style={styles.qrT}>{qrAsset ? 'QR selected · change' : 'Upload your UPI / bank QR'}</Text>
              </Pressable>
              {qrAsset ? <Image source={{ uri: qrAsset.uri }} style={styles.qrPrev} /> : null}
            </>
          ) : null}

          {mode === 'transfer' ? (
            <>
              <Field label="Coin seller display ID" value={sellerInput} onChangeText={setSellerInput} placeholder="e.g. 2002819" />
              <Pressable onPress={lookupSeller} style={styles.lookupBtn} disabled={lookupBusy}>
                <Text style={styles.lookupT}>{lookupBusy ? 'Looking up…' : 'Look up seller'}</Text>
              </Pressable>
              {recipient ? (
                <View style={styles.recipient}>
                  <Avatar uri={mediaUrl(recipient.profile_pic)} name={recipient.first_name} size={44} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.recipientName}>
                      {[recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || 'Seller'}
                    </Text>
                    <Text style={styles.recipientId}>ID {recipient.display_id || sellerInput}</Text>
                  </View>
                  <Pressable onPress={clearRecipient} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color="#A1887F" />
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}

          <View style={{ height: 12 }} />
          {mode === 'cash' ? (
            <Pressable onPress={submit} disabled={busy} style={styles.lavender}>
              <Text style={styles.lavenderT}>{busy ? 'Submitting…' : 'Submit withdrawal request'}</Text>
            </Pressable>
          ) : (
            <OrangeCta
              title={
                busy
                  ? 'Submitting…'
                  : mode === 'exchange'
                    ? 'Exchange now'
                    : 'Transfer to seller'
              }
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
  zero: { color: '#A1887F', fontSize: 12, marginTop: 6 },
  estimate: { color: '#78350f', fontSize: 13, marginBottom: 10, lineHeight: 18, backgroundColor: 'rgba(251,191,36,0.15)', padding: 10, borderRadius: 10 },
  qrBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8D9B5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  qrT: { color: '#5D4037', fontWeight: '800' },
  qrPrev: { width: '100%', height: 160, borderRadius: 12, marginTop: 10, backgroundColor: '#fff' },
  lookupBtn: {
    backgroundColor: '#F3EBDD',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  lookupT: { color: '#5D4037', fontWeight: '800' },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8D9B5',
    marginBottom: 8,
  },
  recipientName: { fontWeight: '800', color: '#5D4037' },
  recipientId: { color: '#8B6D3B', fontSize: 12, marginTop: 2 },
  lavender: {
    backgroundColor: '#C4B5FD',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  lavenderT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hist: { textAlign: 'center', color: '#E89020', fontWeight: '800' },
});
