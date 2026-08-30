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

  const goCenter = () => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('ServicesCenter');
  };

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
    setPhotos([...photos, ...(pick.assets || [])].slice(0, 6));
  };

  const friendlyErr = (e) => {
    const msg = String(e?.message || e || '');
    if (/route not found/i.test(msg)) {
      return 'Could not reach the offerings API. Pull to refresh the app, or try again in a moment.';
    }
    if (/worker profile not found/i.test(msg)) {
      return 'Save your provider profile first, then add a custom category.';
    }
    const details = e?.body?.errors?.map((x) => x.msg).filter(Boolean).join('\n');
    return details || msg || 'Something went wrong';
  };

  const ensureWorker = async () => {
    if (already) return;
    try {
      await api.post('/workers/register', {
        bio: bio.trim() || 'Service provider',
        experience_years: parseInt(years, 10) || 0,
        hourly_rate: Number(rate) || 399,
        services: selected.map((id) => ({ serviceId: id })),
      });
    } catch (e) {
      if (!/already have a worker profile/i.test(String(e.message || ''))) throw e;
    }
    setAlready(true);
    await refreshUser?.();
  };

  const saveCustom = async (showAlert = true) => {
    if (!customName.trim() || !customCategory.trim()) {
      if (showAlert) setError('Enter a service name and your own category.');
      return;
    }
    setCustomBusy(true);
    setError('');
    try {
      await ensureWorker();

      let res;
      if (photos.length) {
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
        res = await api.request('/workers/custom-service', { method: 'POST', body: form });
      } else {
        /* JSON path is more reliable on native than empty multipart */
        res = await api.post('/workers/custom-service', {
          name: customName.trim(),
          category: customCategory.trim(),
          description: customDesc.trim(),
          base_price: Number(rate) || 399,
          price_type: 'hourly',
        });
      }

      const data = api.unwrap(res);
      const svcId = data?.service?.id;
      if (svcId) setSelected((cur) => (cur.includes(svcId) ? cur : [...cur, svcId]));
      setCustomName('');
      setCustomCategory('');
      setCustomDesc('');
      setPhotos([]);
      const catalogRes = await api.get('/services', null, { auth: false });
      setCatalog(api.extractList(catalogRes));
      if (showAlert) Alert.alert('Added', 'Your category was saved and linked to your profile.');
    } catch (e) {
      if (showAlert) setError(friendlyErr(e));
      else throw e;
    } finally {
      setCustomBusy(false);
    }
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
        already ? 'Saved' : 'Submitted',
        already
          ? 'Your offerings were updated.'
          : 'Submitted for admin approval. You will not get jobs until approved.'
      );
      navigation.navigate('ServicesCenter');
    } catch (e) {
      const msg = String(e.message || '');
      if (/already have a worker profile/i.test(msg)) {
        setAlready(true);
        try {
          await reloadProfile();
          setError('You already have a provider profile — update below, then save.');
        } catch (_e) {
          setError('You already have a provider profile. Open Services Center.');
        }
      } else {
        setError(friendlyErr(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <CreamPage title={already ? 'My offerings' : 'Become a provider'} navigation={navigation}>
      {loading ? <Loading /> : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          <Text style={styles.h}>{already ? 'Edit what you offer' : 'Offer services on AP'}</Text>
          <Text style={styles.p}>
            1) Fill bio + rate · 2) Tick catalog services and/or add your own category · 3) Save.
            Customers book you after admin approval. Your phone number stays private.
          </Text>
          <Field label="About your work" value={bio} onChangeText={setBio} multiline autoCapitalize="sentences" />
          <Field label="Years of experience" value={years} onChangeText={setYears} keyboardType="number-pad" />
          <Field label="Hourly rate (₹)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />

          <Text style={styles.sec}>Pick from catalog</Text>
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
            <Text style={styles.sec}>Or add your own category</Text>
            <Text style={styles.p}>
              Name the service and a category label (e.g. Home salon). Pictures are optional.
            </Text>
            <Field label="Service name" value={customName} onChangeText={setCustomName} autoCapitalize="words" />
            <Field
              label="Category label"
              value={customCategory}
              onChangeText={setCustomCategory}
              autoCapitalize="words"
              placeholder="e.g. Home salon, AC repair"
            />
            <Field label="Short description" value={customDesc} onChangeText={setCustomDesc} multiline autoCapitalize="sentences" />
            <Text style={styles.sec}>Pictures (optional)</Text>
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
            <OutlineButton
              title={customBusy ? 'Saving…' : 'Save this category only'}
              onPress={() => saveCustom(true)}
              disabled={customBusy || busy}
              style={{ marginTop: 8 }}
            />
          </View>

          <GoldButton
            title={busy ? 'Saving…' : already ? 'Save all offerings' : 'Submit for approval'}
            onPress={submit}
            disabled={busy || customBusy}
          />
          <OutlineButton title="Back to Services Center" onPress={goCenter} style={{ marginTop: 10 }} />
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
