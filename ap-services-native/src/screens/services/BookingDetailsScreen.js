import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage, OrangeCta } from '../../components/creamChrome';
import { Avatar, ErrorBanner, GoldButton, Loading, OutlineButton } from '../../components/ui';
import {
  bookingStatusLabel,
  formatBookingWhen,
  formatInr,
  paymentStatusLabel,
  providerName,
} from '../../lib/servicesMarket';

const FLOW = [
  { id: 'placed', match: ['payment_review', 'pending', 'accepted', 'in_progress', 'completed'] },
  { id: 'accepted', match: ['accepted', 'in_progress', 'completed'] },
  { id: 'progress', match: ['in_progress', 'completed'] },
  { id: 'done', match: ['completed'] },
];

export default function BookingDetailsScreen({ route, navigation }) {
  const { api, user } = useAuth();
  const bookingId = route.params?.bookingId || route.params?.booking?.id;
  const [booking, setBooking] = useState(route.params?.booking || null);
  const [canReview, setCanReview] = useState(false);
  const [review, setReview] = useState(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!booking);

  const isCustomer = String(booking?.customer_id) === String(user?.id);
  const isProvider = String(booking?.worker_user_id) === String(user?.id);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/bookings/${bookingId}`);
      const b = api.unwrap(res);
      setBooking(b);
      const [can, existing] = await Promise.all([
        api.get(`/reviews/can-review/${bookingId}`).catch(() => ({})),
        api.get(`/reviews/booking/${bookingId}`).catch(() => ({})),
      ]);
      const canData = api.unwrap(can);
      setCanReview(Boolean(canData?.canReview || canData?.can_review));
      const existingData = api.unwrap(existing);
      if (existingData?.id || existingData?.rating) setReview(existingData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, bookingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (status, reason) => {
    setBusy(true);
    try {
      await api.put(`/bookings/${bookingId}/status`, { status, reason });
      await load();
    } catch (e) {
      Alert.alert('Update failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    setBusy(true);
    try {
      await api.post('/reviews', { booking_id: bookingId, rating: stars, comment });
      Alert.alert('Thanks', 'Your review was submitted.');
      await load();
    } catch (e) {
      Alert.alert('Review failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const chatPeer = isCustomer ? booking?.worker_user_id : booking?.customer_id;
  const chatName = isCustomer
    ? [booking?.worker_first_name, booking?.worker_last_name].filter(Boolean).join(' ')
    : [booking?.customer_first_name, booking?.customer_last_name].filter(Boolean).join(' ');

  if (loading && !booking) {
    return <CreamPage title="Booking" navigation={navigation}><Loading /></CreamPage>;
  }

  const st = String(booking?.status || '');
  const doneIds = FLOW.filter((f) => f.match.includes(st)).map((f) => f.id);

  return (
    <CreamPage title={booking?.booking_number || 'Booking'} navigation={navigation}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.body}>
        <ErrorBanner message={error} onRetry={load} />
        <Text style={styles.h}>{booking?.service_name || 'Service'}</Text>
        <Text style={styles.meta}>{formatBookingWhen(booking)}</Text>
        <Text style={styles.badge}>{bookingStatusLabel(booking?.status)}</Text>
        <Text style={styles.pay}>{paymentStatusLabel(booking?.payment_status)}</Text>

        <View style={styles.timeline}>
          {[
            ['placed', 'Booking placed'],
            ['accepted', 'Professional accepted'],
            ['progress', 'Service in progress'],
            ['done', 'Completed'],
          ].map(([id, label]) => (
            <View key={id} style={styles.tlRow}>
              <Ionicons name={doneIds.includes(id) ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={doneIds.includes(id) ? '#16A34A' : '#D6C4A8'} />
              <Text style={[styles.tlT, doneIds.includes(id) && { color: '#15803D', fontWeight: '800' }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sec}>Professional</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={booking?.worker_profile_pic} name={providerName({ first_name: booking?.worker_first_name, last_name: booking?.worker_last_name })} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{providerName({ first_name: booking?.worker_first_name, last_name: booking?.worker_last_name })}</Text>
              {booking?.worker_user_id ? (
                <Pressable onPress={() => navigation.navigate('CreatorProfile', { userId: booking.worker_user_id, name: chatName })}>
                  <Text style={styles.link}>View profile</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Line k="Duration" v={`${booking?.duration_hours || 1} hr`} />
          <Line k="Address" v={booking?.customer_address} />
          {booking?.customer_notes ? <Line k="Notes" v={booking.customer_notes} /> : null}
          <Line k="Service" v={formatInr(booking?.total_amount)} />
          <Line k="Platform fee" v={formatInr(booking?.platform_fee)} />
          <Line k="Total" v={formatInr(booking?.final_amount)} />
        </View>

        {chatPeer ? (
          <OrangeCta
            title="Chat"
            onPress={() => navigation.navigate('ChatThread', { otherUserId: chatPeer, name: chatName || 'Chat' })}
          />
        ) : null}

        {isCustomer && ['pending', 'accepted'].includes(st) ? (
          <OutlineButton title="Cancel booking" onPress={() => setStatus('cancelled', 'Cancelled by customer')} disabled={busy} style={{ marginTop: 10 }} />
        ) : null}

        {isProvider && st === 'pending' ? (
          <View style={{ gap: 10, marginTop: 10 }}>
            <GoldButton title="Accept" onPress={() => setStatus('accepted')} disabled={busy} />
            <OutlineButton title="Decline" onPress={() => setStatus('rejected', 'Declined by professional')} disabled={busy} />
          </View>
        ) : null}
        {isProvider && st === 'accepted' ? (
          <GoldButton title="Start job" onPress={() => setStatus('in_progress')} disabled={busy} style={{ marginTop: 10 }} />
        ) : null}
        {isProvider && st === 'in_progress' ? (
          <GoldButton title="Mark completed" onPress={() => setStatus('completed')} disabled={busy} style={{ marginTop: 10 }} />
        ) : null}

        {chatPeer ? (
          <OutlineButton
            title="Report"
            onPress={() => api.post('/social/report', { userId: chatPeer, reason: 'service_booking' }).then(() => Alert.alert('Reported')).catch((e) => Alert.alert('Report failed', e.message))}
            style={{ marginTop: 10 }}
          />
        ) : null}

        {review ? (
          <View style={styles.card}>
            <Text style={styles.sec}>Your review</Text>
            <Text style={styles.name}>{'★'.repeat(Number(review.rating || 0))}</Text>
            <Text style={styles.meta}>{review.comment || review.title}</Text>
          </View>
        ) : null}

        {canReview && isCustomer && !review ? (
          <View style={styles.card}>
            <Text style={styles.sec}>Leave a review</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setStars(n)}>
                  <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={26} color="#E89020" />
                </Pressable>
              ))}
            </View>
            <TextInput value={comment} onChangeText={setComment} placeholder="How was the service?" placeholderTextColor="#C4A574" style={styles.input} multiline />
            <GoldButton title={busy ? 'Sending…' : 'Submit review'} onPress={submitReview} disabled={busy} />
          </View>
        ) : null}
      </ScrollView>
    </CreamPage>
  );
}

function Line({ k, v }) {
  return (
    <View style={styles.line}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  h: { fontSize: 22, fontWeight: '900', color: '#5D4037' },
  meta: { color: '#8B6D3B', marginTop: 6 },
  badge: { marginTop: 10, color: '#15803D', fontWeight: '800' },
  pay: { color: '#A16207', fontWeight: '700', marginTop: 2 },
  timeline: { marginTop: 16, gap: 8 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tlT: { color: '#A89070' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: 'rgba(201,162,39,0.16)' },
  sec: { fontWeight: '800', color: '#5D4037', marginBottom: 8 },
  name: { fontWeight: '800', color: '#5D4037' },
  link: { color: '#E89020', fontWeight: '700', marginTop: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  k: { color: '#8B6D3B', flex: 1 },
  v: { color: '#5D4037', fontWeight: '700', flex: 1.4, textAlign: 'right' },
  input: { minHeight: 80, borderWidth: 1, borderColor: 'rgba(201,162,39,0.22)', borderRadius: 12, padding: 10, color: '#5D4037', marginBottom: 10, textAlignVertical: 'top' },
});
