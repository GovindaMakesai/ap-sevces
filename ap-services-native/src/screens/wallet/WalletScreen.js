import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { ErrorBanner } from '../../components/ui';
import { CreamCard, CreamHeader, CreamMenuRow, OrangeCta, creamRoot } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';
import { normalizeWalletBalance, walletCoins, walletGiftCoins, walletPoints, walletWalletCoins } from '../../lib/walletFields';

export default function WalletScreen({ navigation }) {
  const { api } = useAuth();
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.get('/wallet/balance', null, { skipCache: true });
      setData(normalizeWalletBalance(api.unwrap(res)));
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const coins = walletCoins(data);
  const walletOnly = walletWalletCoins(data);
  const points = walletPoints(data);
  const gifts = walletGiftCoins(data);
  const seller = data.is_coin_seller;

  return (
    <View style={creamRoot}>
      <CreamHeader title="Wallet" navigation={navigation} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.gold500} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ErrorBanner message={error} onRetry={load} />
        <CreamCard>
          <Text style={styles.k}>{seller ? 'Coins (sellable pool)' : 'Coins (wallet)'}</Text>
          <View style={styles.balRow}>
            <Text style={styles.n}>{indianGroup(coins)}</Text>
            <Ionicons name="logo-bitcoin" size={22} color="#C9A227" />
          </View>
          <Text style={styles.sub}>
            Points {indianGroup(points)}
            {seller ? `  ·  Wallet ${indianGroup(walletOnly)}  ·  Gift stock ${indianGroup(gifts)}` : `  ·  Gift coins ${indianGroup(gifts)}`}
          </Text>
        </CreamCard>
        <OrangeCta title="Top up / Recharge" onPress={() => navigation.navigate('Recharge')} style={{ marginHorizontal: 14, marginTop: 12 }} />
        <CreamMenuRow icon="swap-horizontal-outline" title="Withdraw / Exchange points" onPress={() => navigation.navigate('Withdraw')} />
        <CreamMenuRow icon="time-outline" title="Transaction history" onPress={() => navigation.navigate('WalletHistory')} />
        <CreamMenuRow icon="storefront-outline" title="Store" onPress={() => navigation.navigate('Store')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  k: { color: '#5D4037', fontWeight: '700', fontSize: 13 },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  n: { fontSize: 32, fontWeight: '800', color: '#5D4037', flex: 1 },
  sub: { color: '#8B8B3C', fontSize: 12, marginTop: 6 },
});
