import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { EmptyState, Loading } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import { resolvePushRoute } from '../../lib/push';

export default function NotificationsScreen({ navigation }) {
  const { api } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await api.get('/notifications', { limit: 40 });
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
      <CreamPage title="Notifications" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }
  return (
    <CreamPage title="Notifications" navigation={navigation}>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.creamBg }}
      data={rows}
      keyExtractor={(item, i) => String(item.id || i)}
      ListEmptyComponent={<EmptyState title="No notifications" />}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => {
            api.put(`/notifications/${item.id}/read`).catch(() => {});
            const route = resolvePushRoute(item.data || item);
            if (route) navigation.navigate(route.name, route.params);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.title || item.type || 'Notification'}</Text>
            <Text style={styles.body}>{item.body || item.message || ''}</Text>
          </View>
        </Pressable>
      )}
    />
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.creamCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontWeight: '700', color: colors.textPrimary },
  body: { color: colors.textSecondary, marginTop: 4 },
});
