import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CreamPage } from '../../components/creamChrome';
import { ErrorBanner, Field, GoldButton, Loading, OutlineButton } from '../../components/ui';
import { isWorker, workerProfileFromDashboard } from '../../lib/roles';

export default function ProviderOnboardingScreen({ navigation }) {
  const { api, user, refreshUser } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState([]);
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('1');
  const [rate, setRate] = useState('399');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [already, setAlready] = useState(isWorker(user));
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [photos, setPhotos] = useState([]);
  const [customBusy, setCustomBusy] = useState(false);

  const reloadProfile = useCallback(async () => {
    const me = await api.get('/workers/dashboard').catch(() => ({}));
    const profile = workerProfileFromDashboard(api.unwrap(me));
    const isPro = Boolean(profile || isWorker(user));
    setAlready(isPro);
    if (profile) {
      setBio(profile.bio || '');
      setYears(String(profile.experience_years || '1'));
      setRate(String(profile.hourly_rate || '399'));
      const wr = await api.get(`/workers/${profile.id}`, null, { auth: false }).catch(() => ({}));
      setSelected((api.unwrap(wr)?.services || []).map((s) => s.id));
    }
    return profile;
  }, [api, user]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/services', null, { auth: false });
        if (alive) setCatalog(api.extractList(res));
        if (alive) await reloadProfile();
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [api, reloadProfile]));

  const toggleSafe = (id) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Allow photo library access to add service pictures.');
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (pick.canceled) return;
    const next = [...photos, ...(pick.assets || [])].slice(0, 6);
    setPhotos(next);
  };

  const submit = async () => {
    setError('');
    if (!bio.trim()) {
      setError('Tell customers about your work.');
      return;
    }
    if (!selected.length && !(customName.trim() && customCategory.trim())) {
      setError('Pick at least one catalog service, or add your own category below.');
      return;
    }
    const hourly = Number(rate);
    if (!Number.isFinite(hourly) || hourly < 50) {
      setError('Hourly rate must be at least ₹50.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        bio: bio.trim(),
        experience_years: parseInt(years, 10) || 0,
        hourly_rate: hourly,
        services: selected.map((id) => ({ serviceId: id })),
      };
      if (already) {
        await api.put('/workers/profile', payload);
      } else {
        await api.post('/workers/register', payload);
        await refreshUser?.();
        setAlready(true);
      }

      if (customName.trim() && customCategory.trim()) {
        await saveCustom(false);
      }

      Alert.alert(
        already ? 'Updated' : 'Submitted',
        already
          ? 'Your offerings were saved.'
          : 'Your application is waiting for admin approval. You will not receive jobs until approved.'
      );
      navigation.replace('WorkerDashboard');
    } catch (e) {
      const msg = String(e.message || '');
      if (/already have a worker profile/i.test(msg)) {
        setAlready(true);
        try {
          await reloadProfile();
          setError('You already have a provider profile. Update and save below, or add your own category.');
        } catch (_e) {
          setError('You already have a provider profile. Open Services Center to manage it.');
        }
      } else {
        const details = e.body?.errors?.map((x) => x.msg).filter(Boolean).join('\n');
        setError(details || e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveCustom = async (showAlert = true) => {
    if (!customName.trim() || !customCategory.trim()) {
      if (showAlert) setError('Enter a service name and your own category.');
      return;
    }
    setCustomBusy(true);
    setError('');
    try {
      if (!already) {
        // Ensure worker row exists first
        await api.post('/workers/register', {
          bio: bio.trim() || 'Service provider',
          experience_years: parseInt(years, 10) || 0,
          hourly_rate: Number(rate) || 399,
          services: selected.map((id) => ({ serviceId: id })),
        }).catch(async (e) => {
          if (!/already have a worker profile/i.test(String(e.message || ''))) throw e;
          setAlready(true);
        });
        setAlready(true);
        await refreshUser?.();
      }

      const form = new FormData();
      form.append('name', customName.trim());
      form.append('category', customCategory.trim());
      form.append('description', customDesc.trim());
      form.append('base_price', String(Number(rate) || 399));
      form.append('price_type', 'hourly');
      photos.forEach((p, i) => {
        form.append('photos', {
          uri: p.uri,
          name: `service-${i}.jpg`,
          type: p.mimeType || 'image/jpeg',
        });
      });
      const res = await api.request('/workers/custom-service', { method: 'POST', body: form });
      const data = api.unwrap(res);
      const svcId = data?.service?.id;
      if (svcId) setSelected((cur) => (cur.includes(svcId) ? cur : [...cur, svcId]));
      setCustomName('');
      setCustomCategory('');
      setCustomDesc('');
      setPhotos([]);
      const catalogRes = await api.get('/services', null, { auth: false });
      setCatalog(api.extractList(catalogRes));
      if (showAlert) Alert.alert('Added', 'Your custom category and pictures were saved.');
    } catch (e) {
      if (showAlert) setError(e.message || 'Could not save custom service');
      else throw e;
    } finally {
      setCustomBusy(false);
    }
  };

  return (
    <CreamPage title={already ? 'Manage offerings' : 'Become a provider'} navigation={navigation}>
      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          <Text style={styles.h}>{already ? 'Your service offerings' : 'Offer services on AP'}</Text>
          <Text style={styles.p}>
            Same AP account. Customers book you after admin approval. Chat stays inside AP — we never show your phone number on listings.
          </Text>
          <Field label="About your work" value={bio} onChangeText={setBio} multiline autoCapitalize="sentences" />
          <Field label="Years of experience" value={years} onChangeText={setYears} keyboardType="number-pad" />
          <Field label="Hourly rate (₹)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <Text style={styles.sec}>Catalog services</Text>
          <View style={styles.wrap}>
            {catalog.map((s) => {
              const on = selected.includes(s.id);
              return (
                <Pressable key={s.id} onPress={() => toggleSafe(s.id)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipT, on && styles.chipTOn]}>{s.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customBox}>
            <Text style={styles.sec}>Add your own category</Text>
            <Text style={styles.p}>
              Prefer something not in the list? Name your service, pick a category label, and add pictures so customers know what you offer.
            </Text>
            <Field label="Service name" value={customName} onChangeText={setCustomName} autoCapitalize="words" />
            <Field label="Your category" value={customCategory} onChangeText={setCustomCategory} autoCapitalize="words" placeholder="e.g. Home salon, AC repair" />
            <Field label="Short description" value={customDesc} onChangeText={setCustomDesc} multiline autoCapitalize="sentences" />
            <Text style={styles.sec}>Service pictures</Text>
            <View style={styles.photoRow}>
              {photos.map((p) => (
                <View key={p.uri} style={styles.photoWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photo} />
                  <Pressable
                    style={styles.photoX}
                    onPress={() => setPhotos((cur) => cur.filter((x) => x.uri !== p.uri))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < 6 ? (
                <Pressable onPress={pickPhotos} style={styles.addPhoto}>
                  <Ionicons name="camera-outline" size={22} color="#8B6D3B" />
                  <Text style={styles.addPhotoT}>Add</Text>
                </Pressable>
              ) : null}
            </View>
            {already ? (
              <OutlineButton
                title={customBusy ? 'Saving custom…' : 'Save custom category'}
                onPress={() => saveCustom(true)}
                disabled={customBusy}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </View>

          <GoldButton
            title={busy ? 'Saving…' : already ? 'Save offerings' : 'Submit for approval'}
            onPress={submit}
            disabled={busy || customBusy}
          />
          {already ? (
            <OutlineButton title="Open Services Center" onPress={() => navigation.navigate('WorkerDashboard')} style={{ marginTop: 10 }} />
          ) : null}
        </ScrollView>
      )}
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  h: { fontSize: 22, fontWeight: '900', color: '#5D4037', marginBottom: 8 },
  p: { color: '#8B6D3B', lineHeight: 20, marginBottom: 14 },
  sec: { fontWeight: '800', color: '#5D4037', marginBottom: 8, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(201,162,39,0.2)' },
  chipOn: { backgroundColor: '#C9A227', borderColor: '#C9A227' },
  chipT: { color: '#5D4037', fontWeight: '700', fontSize: 13 },
  chipTOn: { color: '#fff' },
  customBox: {
    backgroundColor: '#FFF9E7',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.28)',
    marginBottom: 16,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  photoWrap: { position: 'relative' },
  photo: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#E7E5E4' },
  photoX: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,109,59,0.35)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  addPhotoT: { fontSize: 11, color: '#8B6D3B', fontWeight: '700', marginTop: 2 },
});
