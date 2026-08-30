import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage } from '../../components/creamChrome';
import { EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { bookingBucket, bookingStatusLabel, formatBookingWhen, formatInr, paymentStatusLabel } from '../../lib/servicesMarket';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function MyBookingsScreen({ navigation }) {
  const { api } = useAuth();
  const [tab, setTab] = useState('upcoming');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.get('/bookings/customer');
      setRows(api.extractList(res));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const data = useMemo(() => rows.filter((b) => bookingBucket(b) === tab), [rows, tab]);

  return (
    <CreamPage title="My bookings" navigation={navigation}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
            <Text style={[styles.tabT, tab === t.id && styles.tabTOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} onRetry={load} />
      {loading && !rows.length ? <Loading /> : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={<EmptyState title="No bookings here" subtitle="You haven't booked a service yet." />}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('ServiceBookingDetails', { bookingId: item.id, booking: item })} style={styles.card}>
              <Text style={styles.name}>{item.service_name || 'Service'}</Text>
              <Text style={styles.meta}>{formatBookingWhen(item)}</Text>
              <Text style={styles.meta}>
                {[item.worker_first_name, item.worker_last_name].filter(Boolean).join(' ') || 'Professional'}
              </Text>
              <View style={styles.row}>
                <Text style={styles.status}>{bookingStatusLabel(item.status)}</Text>
                <Text style={styles.pay}>{paymentStatusLabel(item.payment_status)}</Text>
              </View>
              <Text style={styles.amt}>{formatInr(item.final_amount)}</Text>
            </Pressable>
          )}
        />
      )}
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: 10, gap: 6, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff' },
  tabOn: { backgroundColor: '#E89020' },
  tabT: { color: '#8B6D3B', fontWeight: '700', fontSize: 12 },
  tabTOn: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(201,162,39,0.16)' },
  name: { color: '#5D4037', fontWeight: '800', fontSize: 16 },
  meta: { color: '#8B6D3B', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  status: { color: '#16A34A', fontWeight: '800', fontSize: 12 },
  pay: { color: '#A16207', fontWeight: '700', fontSize: 12 },
  amt: { color: '#C2410C', fontWeight: '900', marginTop: 8 },
});
