import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner } from '../../components/ui';
import { filePart, pickFromCamera, pickMedia } from '../../lib/pickMedia';

const MAX_ALBUM = 6;

export default function EditProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, api, refreshUser } = useAuth();
  const [first_name, setFirst] = useState(user?.first_name || user?.firstName || '');
  const [last_name, setLast] = useState(user?.last_name || user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [album, setAlbum] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [nameQuota, setNameQuota] = useState(null);

  useEffect(() => {
    setPhone(user?.phone || '');
  }, [user?.phone]);

  const loadQuota = useCallback(async () => {
    try {
      const res = await api.get('/auth/me', null, { skipCache: true });
      const nc = res.data?.name_change || api.unwrap(res)?.name_change;
      if (nc) setNameQuota(nc);
    } catch (_e) {}
  }, [api]);

  const loadAlbum = useCallback(async () => {
    try {
      const res = await api.get('/auth/profile/album');
      const list = api.extractList(res);
      setAlbum(Array.isArray(list) ? list : api.unwrap(res)?.album || []);
    } catch (_e) {
      setAlbum([]);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      loadAlbum();
      loadQuota();
    }, [loadAlbum, loadQuota])
  );

  const uploadProfilePhoto = async (asset) => {
    if (!asset) return;
    setPhotoPreview(asset.uri);
    setPhotoBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', filePart(asset, 'avatar.jpg'));
      const res = await api.post('/auth/profile/photo', form);
      const updated = api.unwrap(res)?.user || res.data?.user;
      if (updated) await refreshUser?.();
      else await refreshUser?.();
    } catch (e) {
      setPhotoPreview(null);
      setError(e.message || 'Could not update profile photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePhoto = () => {
    Alert.alert('Profile photo', 'Choose a source', [
      {
        text: 'Take photo',
        onPress: async () => uploadProfilePhoto(await pickFromCamera('image')),
      },
      {
        text: 'Choose from gallery',
        onPress: async () => uploadProfilePhoto(await pickMedia('image')),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const save = async () => {
    if (!first_name.trim()) {
      setError('First name is required');
      return;
    }
    const prevName = `${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`
      .trim()
      .replace(/\s+/g, ' ');
    const nextName = `${first_name} ${last_name}`.trim().replace(/\s+/g, ' ');
    const nameChanging = prevName !== nextName;
    if (nameChanging) {
      const freeLeft = Number(nameQuota?.free_left ?? 2);
      const fee = Number(nameQuota?.fee_coins || 10000);
      if (freeLeft <= 0) {
        const ok = await new Promise((resolve) => {
          Alert.alert(
            'Name change fee',
            `You've used 2 free name changes this month.\n\nChange name for ${fee.toLocaleString()} coins?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ]
          );
        });
        if (!ok) return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.patch('/auth/profile', { first_name: first_name.trim(), last_name: last_name.trim(), phone });
      const charged = Number(api.unwrap(res)?.name_change_charged || res.data?.name_change_charged || 0);
      if (res.data?.name_change) setNameQuota(res.data.name_change);
      await refreshUser?.();
      if (charged > 0) {
        Alert.alert('Saved', `Profile updated. ${charged.toLocaleString()} coins charged for name change.`);
      }
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addAlbum = async () => {
    if (album.length >= MAX_ALBUM) {
      Alert.alert('Album full', `Maximum ${MAX_ALBUM} background photos`);
      return;
    }
    const asset = await pickMedia('image');
    if (!asset) return;
    const form = new FormData();
    form.append('photo', filePart(asset));
    try {
      await api.post('/auth/profile/album', form);
      await loadAlbum();
    } catch (e) {
      setError(e.message);
    }
  };

  const removeAlbum = async (photoId) => {
    try {
      await api.delete(`/auth/profile/album/${photoId}`);
      await loadAlbum();
    } catch (e) {
      Alert.alert('Remove failed', e.message);
    }
  };

  const avatarUri = photoPreview || mediaUrl(user?.profile_pic || user?.profilePic || user?.avatar);
  const freeLeft = nameQuota?.free_left;
  const slots = [...album];
  while (slots.length < MAX_ALBUM) slots.push(null);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={styles.grab} />
      <View style={styles.head}>
        <Text style={styles.title}>Edit profile</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.close} hitSlop={8}>
          <Ionicons name="close" size={20} color="#5D4037" />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <View style={styles.avatarWrap}>
          <Pressable onPress={changePhoto} disabled={photoBusy} style={styles.avatarBtn}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <Avatar name={first_name || user?.email} size={96} />
            )}
            <View style={styles.avatarCam}>
              <Ionicons name={photoBusy ? 'hourglass-outline' : 'camera'} size={18} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>{photoBusy ? 'Uploading photo…' : 'Tap to change profile picture'}</Text>
        </View>

        <Text style={styles.label}>FIRST NAME</Text>
        <TextInput value={first_name} onChangeText={setFirst} style={styles.input} autoCapitalize="words" />
        <Text style={styles.label}>LAST NAME</Text>
        <TextInput value={last_name} onChangeText={setLast} style={styles.input} autoCapitalize="words" placeholder="Optional" placeholderTextColor="#C4A574" />
        <Text style={styles.hint}>
          {freeLeft != null
            ? `${freeLeft} free name change${freeLeft === 1 ? '' : 's'} left this month. 3rd+ costs 10,000 coins.`
            : '2 free name changes per month. 3rd+ costs 10,000 coins.'}
        </Text>
        <Text style={styles.label}>PHONE</Text>
        <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" placeholder="Your mobile number" placeholderTextColor="#C4A574" />

        <View style={styles.albumHead}>
          <Text style={styles.albumTitle}>Album <Text style={styles.albumCount}>{album.length}/{MAX_ALBUM}</Text></Text>
          <Text style={styles.albumHint}>Background photos for your profile</Text>
        </View>
        <View style={styles.albumGrid}>
          {slots.map((item, i) => (
            <View key={item?.id || `slot-${i}`} style={styles.albumSlot}>
              {item?.url || item?.photo_url ? (
                <>
                  <Image source={{ uri: mediaUrl(item.url || item.photo_url) }} style={styles.albumImg} />
                  <Pressable style={styles.albumRemove} onPress={() => removeAlbum(item.id)}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.albumAdd} onPress={addAlbum}>
                  <Ionicons name="add" size={28} color="#C4A574" />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
          <Text style={styles.saveBtnT}>{busy ? 'Saving…' : 'Save changes'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFBF0' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E8DCC4', marginTop: 8 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#5D4037' },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3EBDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  avatarWrap: { alignItems: 'center', marginBottom: 8 },
  avatarBtn: { position: 'relative' },
  avatarImg: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E8DCC4' },
  avatarCam: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFBF0',
  },
  avatarHint: { marginTop: 8, fontSize: 12, color: '#A1887F' },
  label: { fontSize: 11, fontWeight: '800', color: '#8B6D3B', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8DCC4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#5D4037',
  },
  hint: { fontSize: 12, color: '#A1887F', marginTop: 8, lineHeight: 18 },
  albumHead: { marginTop: 20, marginBottom: 10 },
  albumTitle: { fontSize: 16, fontWeight: '800', color: '#5D4037' },
  albumCount: { color: '#FF6B00' },
  albumHint: { fontSize: 12, color: '#A1887F', marginTop: 4 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  albumSlot: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  albumImg: { width: '100%', height: '100%' },
  albumRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumAdd: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#D4C4A8',
    borderRadius: 12,
    margin: 4,
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#FF6B00',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnT: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
