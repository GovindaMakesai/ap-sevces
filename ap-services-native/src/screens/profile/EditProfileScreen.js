import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Field, GoldButton } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import { filePart, pickFromCamera, pickMedia } from '../../lib/pickMedia';

export default function EditProfileScreen({ navigation }) {
  const { user, updateProfile, api, refreshUser } = useAuth();
  const [first_name, setFirst] = useState(user?.first_name || user?.firstName || '');
  const [last_name, setLast] = useState(user?.last_name || user?.lastName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await updateProfile({ first_name, last_name });
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const photo = async () => {
    const asset = await pickMedia('image');
    if (!asset) return;
    const form = new FormData();
    form.append('photo', filePart(asset));
    try {
      await api.request('/auth/profile/photo', { method: 'POST', body: form });
      await refreshUser?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const snap = async () => {
    const asset = await pickFromCamera();
    if (!asset) return;
    const form = new FormData();
    form.append('photo', filePart(asset));
    try {
      await api.request('/auth/profile/photo', { method: 'POST', body: form });
      await refreshUser?.();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <CreamPage title="Edit Profile" navigation={navigation}>
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorBanner message={error} />
        <Field label="First name" value={first_name} onChangeText={setFirst} autoCapitalize="words" />
        <Field label="Last name" value={last_name} onChangeText={setLast} autoCapitalize="words" />
        <GoldButton title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        <View style={{ height: 12 }} />
        <GoldButton title="Change photo" onPress={photo} />
        <View style={{ height: 12 }} />
        <GoldButton title="Take photo" onPress={snap} />
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
});
