import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage, OrangeCta } from '../../components/creamChrome';
import { EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { ProviderCard, ServiceHero } from '../../components/ServiceVisuals';
import { priceLabel } from '../../lib/servicesMarket';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { api } = useAuth();
  const seed = route.params?.service || {};
  const serviceId = route.params?.serviceId || seed.id;
  const [service, setService] = useState(seed);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!serviceId) {
      setLoading(false);
      setError('Service not found');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [svcRes, wrkRes] = await Promise.all([
        api.get(`/services/${serviceId}`, null, { auth: false }),
        api.get(`/services/${serviceId}/workers`, null, { auth: false }),
      ]);
      const detail = api.unwrap(svcRes);
      setService((prev) => ({ ...prev, ...(detail && !Array.isArray(detail) ? detail : {}) }));
      setProviders(api.extractList(wrkRes).length ? api.extractList(wrkRes) : (detail?.workers || []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, serviceId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const book = (provider) => {
    navigation.navigate('ServiceBooking', {
      service,
      serviceId,
      provider,
      providerId: provider?.id,
    });
  };

  return (
    <CreamPage title={service.name || 'Service'} navigation={navigation}>
      {loading && !service.name ? <Loading /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.body}>
          <ErrorBanner message={error} onRetry={load} />
          <ServiceHero service={service} height={200} />
          <Text style={styles.h}>{service.name || service.title}</Text>
          <Text style={styles.price}>{priceLabel(service)}</Text>
          <Text style={styles.cat}>{service.category || 'Home service'}</Text>
          <Text style={styles.bodyT}>{service.description || 'Professional help for your home, booked through AP.'}</Text>
          <OrangeCta title="Book a service" onPress={() => book(null)} style={{ marginTop: 8 }} />
          <Text style={styles.sec}>Available professionals</Text>
          {!providers.length ? (
            <EmptyState title="No professionals available" subtitle="No professionals are currently available for this service." />
          ) : providers.map((p) => (
            <ProviderCard key={p.id} provider={p} service={service} onPress={() => book(p)} />
          ))}
          {providers.length ? (
            <Pressable onPress={() => book(null)} style={styles.link}>
              <Text style={styles.linkT}>Choose later in booking</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  h: { color: '#5D4037', fontWeight: '900', fontSize: 24, marginTop: 14 },
  price: { color: '#C2410C', fontWeight: '800', fontSize: 16, marginTop: 6 },
  cat: { color: '#A89070', fontWeight: '700', marginTop: 4 },
  bodyT: { color: '#6B5344', marginTop: 10, lineHeight: 20, fontSize: 14 },
  sec: { color: '#5D4037', fontWeight: '800', fontSize: 16, marginTop: 22, marginBottom: 10 },
  link: { alignItems: 'center', paddingVertical: 8 },
  linkT: { color: '#E89020', fontWeight: '700' },
});
