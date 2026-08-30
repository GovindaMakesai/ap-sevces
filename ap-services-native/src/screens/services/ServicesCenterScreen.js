import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage } from '../../components/creamChrome';
import { EmptyState, ErrorBanner, GoldButton, Loading, OutlineButton } from '../../components/ui';
import { bookingStatusLabel, formatBookingWhen, formatInr } from '../../lib/servicesMarket';
import { isWorker, workerProfileFromDashboard } from '../../lib/roles';

export default function ServicesCenterScreen({ navigation }) {
  const { api, user } = useAuth();
  const [data, setData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [mine, setMine] = useState([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasProfile, setHasProfile] = useState(isWorker(user));

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [dash, bookings, earnings] = await Promise.all([
        api.get('/workers/dashboard').catch(() => ({})),
        api.get('/bookings/worker').catch(() => ({})),
        api.get('/workers/earnings').catch(() => ({})),
      ]);
      const d = api.unwrap(dash);
      const profile = workerProfileFromDashboard(d);
      setHasProfile(Boolean(profile || isWorker(user)));
      setData({ ...d, earnings: api.unwrap(earnings) });
      setJobs(api.extractList(bookings));
      setAvailable(d?.profile?.is_available !== false);
      const wid = d?.profile?.id;
      if (wid) {
        const wr = await api.get(`/workers/${wid}`, null, { auth: false }).catch(() => ({}));
        setMine(api.unwrap(wr)?.services || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleAvail = async (val) => {
    setAvailable(val);
    try {
      await api.put('/workers/availability', { is_available: val });
    } catch (e) {
      setAvailable(!val);
      Alert.alert('Could not update', e.message);
    }
  };

  if (!hasProfile && !data?.profile) {
    return (
      <CreamPage title="Services Center" navigation={navigation}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.h}>Offer services on AP</Text>
          <Text style={styles.intro}>Use your existing AP account. Apply as a professional — admin approval is required before you receive jobs. You can still book services as a customer anytime.</Text>
          <GoldButton title="Become a service provider" onPress={() => navigation.navigate('BecomePro')} />
          <OutlineButton title="Browse services as customer" onPress={() => navigation.navigate('Services')} style={{ marginTop: 10 }} />
        </ScrollView>
      </CreamPage>
    );
  }

  const stats = data?.stats || {};
  const pending = jobs.filter((j) => j.status === 'pending');

  return (
    <CreamPage title="Services Center" navigation={navigation}>
      {loading && !data ? <Loading /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.body}>
          <ErrorBanner message={error} onRetry={load} />
          <View style={styles.hero}>
            <Text style={styles.kicker}>Your service business</Text>
            <View style={styles.avail}>
              <Text style={styles.availT}>Available for jobs</Text>
              <Switch value={available} onValueChange={toggleAvail} trackColor={{ true: '#E89020' }} />
            </View>
            <View style={styles.metrics}>
              <Metric n={stats.completed_jobs || stats.completed_bookings || 0} l="Jobs" />
              <Metric n={formatInr(stats.total_earnings || data?.earnings?.total || 0)} l="Earnings" />
              <Metric n={stats.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'} l="Rating" />
            </View>
            <Text style={styles.pending}>{stats.pending_jobs || pending.length || 0} pending requests</Text>
          </View>

          <Text style={styles.sec}>My services</Text>
          {mine.length ? mine.map((s) => (
            <Text key={s.id} style={styles.svcLine}>{s.name} · {s.category}</Text>
          )) : <Text style={styles.intro}>No offerings listed yet.</Text>}
          <OutlineButton title="Manage offerings" onPress={() => navigation.navigate('BecomePro')} style={{ marginTop: 8 }} />

          <Text style={styles.sec}>Requests</Text>
          {!jobs.length ? (
            <EmptyState title="No jobs yet" subtitle="New service requests will appear here." />
          ) : jobs.map((b) => (
            <Pressable key={b.id} onPress={() => navigation.navigate('ServiceBookingDetails', { bookingId: b.id, booking: b })} style={styles.job}>
              <Text style={styles.jobT}>{b.service_name || 'Job'}</Text>
              <Text style={styles.meta}>{formatBookingWhen(b)} · {bookingStatusLabel(b.status)}</Text>
              <Text style={styles.meta}>{[b.customer_first_name, b.customer_last_name].filter(Boolean).join(' ')}</Text>
              {b.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <GoldButton title="Accept" compact onPress={() => api.put(`/bookings/${b.id}/status`, { status: 'accepted' }).then(load)} />
                  <OutlineButton title="Decline" compact onPress={() => api.put(`/bookings/${b.id}/status`, { status: 'rejected', reason: 'Declined' }).then(load)} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </CreamPage>
  );
}

function Metric({ n, l }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.n}>{n}</Text>
      <Text style={styles.l}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  intro: { color: '#8B6D3B', lineHeight: 20, marginBottom: 12 },
  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(201,162,39,0.16)' },
  kicker: { color: '#8B6D3B', fontWeight: '700' },
  avail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  availT: { color: '#5D4037', fontWeight: '800' },
  metrics: { flexDirection: 'row', marginTop: 16 },
  n: { color: '#5D4037', fontWeight: '900', fontSize: 18 },
  l: { color: '#A89070', fontSize: 12, marginTop: 2 },
  pending: { color: '#C2410C', fontWeight: '700', marginTop: 12 },
  sec: { marginTop: 20, marginBottom: 8, fontWeight: '800', color: '#5D4037', fontSize: 16 },
  svcLine: { color: '#6B5344', paddingVertical: 4 },
  h: { fontSize: 22, fontWeight: '900', color: '#5D4037', marginBottom: 8 },
  job: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(201,162,39,0.16)' },
  jobT: { fontWeight: '800', color: '#5D4037' },
  meta: { color: '#8B6D3B', marginTop: 4, fontSize: 13 },
});
