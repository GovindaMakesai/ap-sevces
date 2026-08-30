import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage, OrangeCta } from '../../components/creamChrome';
import { EmptyState, ErrorBanner, Field, GoldButton, Loading, OutlineButton } from '../../components/ui';
import { ProviderCard } from '../../components/ServiceVisuals';
import {
  DURATIONS,
  TIME_SLOTS,
  estimateQuote,
  formatInr,
  upcomingDates,
} from '../../lib/servicesMarket';

const STEPS = ['Professional', 'When', 'Where', 'Pay'];

export default function ServiceBookingScreen({ route, navigation }) {
  const { api, user } = useAuth();
  const service = route.params?.service || {};
  const serviceId = route.params?.serviceId || service.id;
  const [step, setStep] = useState(route.params?.provider ? 1 : 0);
  const [providers, setProviders] = useState(route.params?.provider ? [route.params.provider] : []);
  const [provider, setProvider] = useState(route.params?.provider || null);
  const [date, setDate] = useState(upcomingDates()[0]?.iso);
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(1);
  const [address, setAddress] = useState(user?.address || '');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [paidConfirm, setPaidConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [loadingPros, setLoadingPros] = useState(!route.params?.provider);

  const dates = useMemo(() => upcomingDates(14), []);
  const quote = useMemo(() => estimateQuote(service, provider, duration), [duration, provider, service]);

  useFocusEffect(useCallback(() => {
    if (providers.length && route.params?.provider) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/services/${serviceId}/workers`, null, { auth: false });
        if (!alive) return;
        setProviders(api.extractList(res));
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoadingPros(false);
      }
    })();
    return () => { alive = false; };
  }, [api, providers.length, route.params?.provider, serviceId]));

  const next = () => {
    setError('');
    if (step === 0 && !provider) {
      setError('Select a professional to continue.');
      return;
    }
    if (step === 1 && (!date || !time || !duration)) {
      setError('Choose a date, time, and duration.');
      return;
    }
    if (step === 2 && !String(address).trim()) {
      setError('Add the service address.');
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const submit = async () => {
    if (busyRef.current) return;
    if (!paidConfirm || !String(reference).trim()) {
      setError('Enter your UTR/reference and confirm you paid.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/bookings', {
        worker_id: provider.id,
        service_id: serviceId,
        booking_date: date,
        start_time: time,
        duration_hours: duration,
        customer_address: String(address).trim(),
        customer_notes: String(notes).trim() || undefined,
        payment_method: 'qr_manual',
        payment_reference: String(reference).trim(),
      });
      const created = api.unwrap(res);
      setBooking(created);
    } catch (e) {
      const details = e.body?.errors?.map((x) => x.msg).filter(Boolean).join('\n');
      setError(details || e.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (booking) {
    const underReview = booking.status === 'payment_review' || booking.payment_status === 'under_review';
    return (
      <CreamPage title="Booking" navigation={navigation} hideRight>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.doneH}>{underReview ? 'Payment submitted' : 'Booking placed'}</Text>
            <Text style={styles.doneS}>
              {underReview
                ? 'Your payment is under review. The professional is notified after it is confirmed.'
                : 'Your request was sent to the professional.'}
            </Text>
            <Text style={styles.h}>{service.name}</Text>
            <Text style={styles.meta}>{date} · {time} · {duration} hr</Text>
            <Text style={styles.meta}>{provider?.first_name ? `${provider.first_name} ${provider.last_name || ''}`.trim() : 'Professional'}</Text>
            <Text style={styles.total}>Total {formatInr(booking.final_amount || quote.total)}</Text>
            <GoldButton title="View booking" onPress={() => navigation.replace('ServiceBookingDetails', { bookingId: booking.id, booking })} />
            <View style={{ height: 10 }} />
            {booking.worker_user_id || provider?.user_id ? (
              <OutlineButton
                title="Chat with professional"
                onPress={() => navigation.navigate('ChatThread', {
                  otherUserId: booking.worker_user_id || provider.user_id,
                  name: `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim() || 'Professional',
                })}
              />
            ) : null}
            <View style={{ height: 10 }} />
            <OutlineButton title="My bookings" onPress={() => navigation.replace('MyServiceBookings')} />
          </View>
        </ScrollView>
      </CreamPage>
    );
  }

  return (
    <CreamPage title="Book service" navigation={navigation}>
      <View style={styles.steps}>
        {STEPS.map((label, i) => (
          <Pressable key={label} onPress={() => i < step && setStep(i)} style={styles.step}>
            <View style={[styles.dot, i <= step && styles.dotOn]} />
            <Text style={[styles.stepT, i === step && styles.stepOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <Text style={styles.svc}>{service.name}</Text>

        {step === 0 ? (
          loadingPros ? <Loading label="Finding professionals…" /> : !providers.length ? (
            <EmptyState title="No professionals available" subtitle="No professionals are currently available for this service." />
          ) : providers.map((p) => (
            <ProviderCard key={p.id} provider={p} service={service} selected={provider?.id === p.id} onPress={() => setProvider(p)} />
          ))
        ) : null}

        {step === 1 ? (
          <View>
            <Text style={styles.label}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dates.map((d) => (
                <Pressable key={d.iso} onPress={() => setDate(d.iso)} style={[styles.dateChip, date === d.iso && styles.chipOn]}>
                  <Text style={[styles.dateD, date === d.iso && styles.onT]}>{d.day}</Text>
                  <Text style={[styles.dateN, date === d.iso && styles.onT]}>{d.date}</Text>
                  <Text style={[styles.dateM, date === d.iso && styles.onT]}>{d.month}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>Start time</Text>
            <View style={styles.wrap}>
              {TIME_SLOTS.map((t) => (
                <Pressable key={t} onPress={() => setTime(t)} style={[styles.pill, time === t && styles.chipOn]}>
                  <Text style={[styles.pillT, time === t && styles.onT]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Duration</Text>
            <View style={styles.wrap}>
              {DURATIONS.map((h) => (
                <Pressable key={h} onPress={() => setDuration(h)} style={[styles.pill, duration === h && styles.chipOn]}>
                  <Text style={[styles.pillT, duration === h && styles.onT]}>{h === 0.5 ? '30 min' : `${h} hr`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Field label="Address" value={address} onChangeText={setAddress} autoCapitalize="sentences" placeholder="House / street / area" />
            <Field label="Notes for the professional (optional)" value={notes} onChangeText={setNotes} autoCapitalize="sentences" multiline placeholder="Gate code, parking, extra details" />
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <View style={styles.quote}>
              <Row k="Service rate" v={`${formatInr(quote.rate)}/hr`} />
              <Row k="Duration" v={`${quote.hours} hr`} />
              <Row k="Subtotal" v={formatInr(quote.subtotal)} />
              <Row k="Platform fee (10%)" v={formatInr(quote.platformFee)} />
              <Row k="Total" v={formatInr(quote.total)} last />
            </View>
            <Text style={styles.payH}>Pay by UPI QR</Text>
            <Text style={styles.payS}>Scan, pay the total, then enter your UTR. Admin confirms before the professional is assigned.</Text>
            <Image source={require('../../../assets/payment-qr.png')} style={styles.qr} resizeMode="contain" />
            <Field label="UTR / payment reference" value={reference} onChangeText={setReference} autoCapitalize="characters" placeholder="12-digit UTR" />
            <Pressable onPress={() => setPaidConfirm((v) => !v)} style={styles.check}>
              <Ionicons name={paidConfirm ? 'checkbox' : 'square-outline'} size={22} color="#E89020" />
              <Text style={styles.checkT}>I have paid {formatInr(quote.total)}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.bar}>
        {step > 0 ? <OutlineButton title="Back" onPress={() => setStep((s) => s - 1)} compact style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
        {step < 3 ? (
          <OrangeCta title="Continue" onPress={next} style={{ flex: 1.4 }} />
        ) : (
          <GoldButton title={busy ? 'Submitting…' : 'Submit booking'} onPress={submit} disabled={busy} style={{ flex: 1.6 }} />
        )}
      </View>
    </CreamPage>
  );
}

function Row({ k, v, last }) {
  return (
    <View style={[styles.qRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.qk}>{k}</Text>
      <Text style={[styles.qv, last && { fontWeight: '900', color: '#C2410C' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 6, gap: 4 },
  step: { flex: 1, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8D4A8' },
  dotOn: { backgroundColor: '#E89020' },
  stepT: { color: '#C4A574', fontSize: 11, fontWeight: '700', marginTop: 4 },
  stepOn: { color: '#5D4037' },
  body: { padding: 16, paddingBottom: 24 },
  svc: { color: '#5D4037', fontWeight: '800', fontSize: 18, marginBottom: 12 },
  label: { color: '#8B6D3B', fontWeight: '700', marginTop: 14, marginBottom: 8 },
  dateChip: { width: 64, borderRadius: 12, backgroundColor: '#fff', paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,162,39,0.2)' },
  chipOn: { backgroundColor: '#E89020', borderColor: '#E89020' },
  dateD: { color: '#A89070', fontSize: 11, fontWeight: '700' },
  dateN: { color: '#5D4037', fontWeight: '900', fontSize: 18 },
  dateM: { color: '#A89070', fontSize: 11 },
  onT: { color: '#fff' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(201,162,39,0.2)' },
  pillT: { color: '#5D4037', fontWeight: '700' },
  quote: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(201,162,39,0.18)' },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(201,162,39,0.16)' },
  qk: { color: '#8B6D3B' },
  qv: { color: '#5D4037', fontWeight: '700' },
  payH: { fontWeight: '800', color: '#5D4037', marginTop: 16, fontSize: 16 },
  payS: { color: '#8B6D3B', marginTop: 6, lineHeight: 18 },
  qr: { width: 220, height: 220, alignSelf: 'center', marginVertical: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  checkT: { color: '#5D4037', fontWeight: '700' },
  bar: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 20, backgroundColor: '#FFF9E7' },
  done: { alignItems: 'center', paddingTop: 24 },
  doneH: { fontSize: 22, fontWeight: '900', color: '#5D4037', marginTop: 8 },
  doneS: { color: '#8B6D3B', textAlign: 'center', marginVertical: 10, lineHeight: 20 },
  h: { fontWeight: '800', color: '#5D4037', fontSize: 18, marginTop: 8 },
  meta: { color: '#8B6D3B', marginTop: 4 },
  total: { color: '#C2410C', fontWeight: '900', fontSize: 20, marginVertical: 16 },
});
