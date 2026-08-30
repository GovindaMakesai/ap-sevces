import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage } from '../../components/creamChrome';
import { EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { ServiceCard } from '../../components/ServiceVisuals';
import { categoryKey, categoryVisual } from '../../lib/servicesMarket';
import { isWorker, workerProfileFromDashboard } from '../../lib/roles';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [ms, value]);
  return v;
}

export default function ServicesHomeScreen({ navigation }) {
  const { api, user } = useAuth();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isProvider, setIsProvider] = useState(isWorker(user));
  const dq = useDebounced(q, 320);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const params = {};
      if (dq.trim().length >= 2) params.search = dq.trim();
      if (cat) params.category = cat;
      const [listRes, catRes, dash] = await Promise.all([
        api.get('/services', Object.keys(params).length ? params : null, { auth: false }),
        api.get('/services/categories/all', null, { auth: false }).catch(() => ({})),
        api.get('/workers/dashboard').catch(() => ({})),
      ]);
      setIsProvider(Boolean(workerProfileFromDashboard(api.unwrap(dash)) || isWorker(user)));
      setServices(api.extractList(listRes));
      const cats = api.extractList(catRes).map((c) => ({
        id: c.category || c.name || c.id,
        label: c.category || c.name || c.id,
        count: c.service_count,
      })).filter((c) => c.id);
      setCategories(cats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, cat, dq, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!cat) return services;
    const key = categoryKey(cat);
    return services.filter((s) => categoryKey(s.category) === key || String(s.category || '').toLowerCase() === String(cat).toLowerCase());
  }, [cat, services]);

  return (
    <CreamPage
      title="Services"
      navigation={navigation}
      right={(
        <Pressable onPress={() => navigation.navigate('MyServiceBookings')} style={styles.iconBtn}>
          <Ionicons name="calendar-outline" size={20} color="#5D4037" />
        </Pressable>
      )}
    >
      <View style={styles.root}>
        <Text style={styles.sub}>Find trusted professionals for everyday needs</Text>
        <View style={styles.roleRow}>
          <Pressable
            onPress={() => navigation.navigate(isProvider ? 'WorkerDashboard' : 'BecomePro')}
            style={styles.roleChip}
          >
            <Ionicons name={isProvider ? 'construct-outline' : 'hammer-outline'} size={14} color="#6B4A1B" />
            <Text style={styles.roleChipT}>{isProvider ? 'Manage my provider profile' : 'Become a provider'}</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color="#C4A574" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="What service do you need?"
            placeholderTextColor="#C4A574"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
        <ErrorBanner message={error} onRetry={load} />
        {loading && !services.length ? <Loading label="Loading services…" /> : (
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => String(item.id || i)}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#E89020" />}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            ListHeaderComponent={(
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
                  <Pressable onPress={() => setCat('')} style={[styles.catChip, !cat && styles.catOn]}>
                    <Text style={[styles.catT, !cat && styles.catTOn]}>All</Text>
                  </Pressable>
                  {categories.map((c) => {
                    const vis = categoryVisual(c.label);
                    const on = String(cat).toLowerCase() === String(c.id).toLowerCase();
                    return (
                      <Pressable key={c.id} onPress={() => setCat(on ? '' : c.id)} style={[styles.catChip, on && styles.catOn]}>
                        <LinearGradient colors={on ? vis.colors : ['#FFF8EC', '#FFF8EC']} style={styles.catGrad}>
                          <Ionicons name={vis.icon} size={14} color={on ? '#fff' : '#8B6D3B'} />
                          <Text style={[styles.catT, on && styles.catTOn]}>{c.label}</Text>
                        </LinearGradient>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            ListEmptyComponent={<EmptyState title="No services found" subtitle="Try another search or category." />}
            renderItem={({ item }) => (
              <ServiceCard
                service={item}
                onPress={() => navigation.navigate('ServiceDetails', { service: item, serviceId: item.id })}
              />
            )}
          />
        )}
      </View>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sub: { color: '#8B6D3B', paddingHorizontal: 16, marginBottom: 8, fontWeight: '600' },
  roleRow: { paddingHorizontal: 14, marginBottom: 8 },
  roleChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3D6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  roleChipT: { color: '#6B4A1B', fontWeight: '800', fontSize: 12 },
  search: {
    marginHorizontal: 14,
    marginBottom: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.22)',
  },
  searchInput: { flex: 1, color: '#5D4037', height: 44, fontSize: 15 },
  cats: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  catChip: { borderRadius: 999, overflow: 'hidden' },
  catOn: {},
  catGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(201,162,39,0.2)' },
  catT: { color: '#8B6D3B', fontWeight: '700', fontSize: 13 },
  catTOn: { color: '#fff' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
