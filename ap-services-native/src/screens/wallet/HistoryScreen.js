import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { EmptyState, Loading } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import { indianGroup } from '../../lib/format.js';

export default function WalletHistoryScreen({ navigation }) {
  const { api } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await api.get('/wallet/transactions', { limit: 50 });
          setRows(api.extractList(res));
        } catch (_e) {
          setRows([]);
        } finally {
          setLoading(false);
        }
      })();
    }, [api])
  );

  if (loading) {
    return (
      <CreamPage title="Transaction history" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }

  return (
    <CreamPage title="Transaction history" navigation={navigation}>
      <FlatList
        style={{ flex: 1, backgroundColor: colors.creamBg }}
        data={rows}
        keyExtractor={(item, i) => String(item.id || i)}
        ListEmptyComponent={<EmptyState title="No transactions" />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.type}>{item.type || item.title || 'Transaction'}</Text>
              <Text style={styles.meta}>{item.created_at || item.createdAt || ''}</Text>
            </View>
            <Text style={styles.amt}>{indianGroup(item.amount || item.coins || item.coin_amount || 0)}</Text>
          </View>
        )}
      />
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.creamCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  type: { fontWeight: '700', color: colors.textPrimary },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  amt: { fontWeight: '800', color: colors.gold600 },
});
