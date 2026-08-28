import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Field, GoldButton } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';

export default function LiveVerifyScreen({ navigation }) {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitIdentity = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/live/verify/identity', { legalName: name, idNumber });
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitFace = async () => {
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (pick.canceled) return;
    const form = new FormData();
    form.append('photo', { uri: pick.assets[0].uri, name: 'face.jpg', type: 'image/jpeg' });
    try {
      await api.request('/live/verify/face', { method: 'POST', body: form });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <CreamPage title="Live verification" navigation={navigation}>
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorBanner message={error} />
        <Field label="Legal name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="ID number" value={idNumber} onChangeText={setIdNumber} />
        <GoldButton title={busy ? 'Submitting…' : 'Submit identity'} onPress={submitIdentity} disabled={busy} />
        <View style={{ height: 12 }} />
        <GoldButton title="Upload face photo" onPress={submitFace} />
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
});
