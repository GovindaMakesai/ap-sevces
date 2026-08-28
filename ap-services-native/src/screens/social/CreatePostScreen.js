import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ErrorBanner, Field, GoldButton, OutlineButton } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import { filePart, pickFromCamera, pickMedia } from '../../lib/pickMedia';

export default function CreatePostScreen({ navigation }) {
  const { api } = useAuth();
  const [caption, setCaption] = useState('');
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async (kind) => {
    setError('');
    const picked = kind === 'camera' ? await pickFromCamera() : await pickMedia(kind);
    if (picked) setAsset(picked);
  };

  const submit = async () => {
    if (!asset && !caption.trim()) {
      setError('Add a photo, video, or caption');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let mediaUrl = null;
      let mediaType = 'text';
      if (asset) {
        const form = new FormData();
        const part = filePart(asset);
        form.append('media', part);
        form.append('file', part);
        const up = await api.request('/social/posts/media', { method: 'POST', body: form, timeoutMs: 120000 });
        const d = api.unwrap(up);
        mediaUrl = d.url || d.media_url || d.path;
        mediaType = String(part.type || '').startsWith('video') ? 'video' : 'image';
      }
      await api.post('/social/posts', { caption, visibility: 'public', media_url: mediaUrl, media_type: mediaType });
      Alert.alert('Posted', 'Your post is live on Square and Video.');
      navigation.goBack();
    } catch (e) {
      setError(e.message || 'Upload failed. Check photo permission and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CreamPage title="Share a post" navigation={navigation}>
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorBanner message={error} />
        <Field label="Caption" value={caption} onChangeText={setCaption} placeholder="What's on your mind?" />
        {asset ? <Image source={{ uri: asset.uri }} style={styles.prev} /> : null}
        <GoldButton title="Upload photo" onPress={() => choose('image')} />
        <View style={{ height: 10 }} />
        <OutlineButton title="Upload video" onPress={() => choose('video')} />
        <View style={{ height: 10 }} />
        <OutlineButton title="Photo or video" onPress={() => choose('all')} />
        <View style={{ height: 10 }} />
        <OutlineButton title="Take photo" onPress={() => choose('camera')} />
        <View style={{ height: 16 }} />
        <GoldButton title={busy ? 'Posting…' : 'Post'} onPress={submit} disabled={busy} />
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
  prev: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12, backgroundColor: '#111' },
});
