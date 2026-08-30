import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

export default function LiveVerifyScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [status, setStatus] = useState(null);
  const [identityDone, setIdentityDone] = useState(false);
  const [faceDone, setFaceDone] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/live/access-status');
      const d = api.unwrap(res) || {};
      setStatus(d);
      const idOk = Boolean(d.identityVerified || d.identity_verified || d.kycOk || d.verified);
      const faceOk = Boolean(d.faceVerified || d.face_verified || d.selfieOk || d.liveVerified);
      const allOk = Boolean(d.canGoLive || d.can_go_live || (idOk && faceOk));
      setIdentityDone(idOk || allOk);
      setFaceDone(faceOk || allOk);
      if (allOk) {
        setMsg('You are fully verified for video live.');
        setMsgOk(true);
      }
    } catch (e) {
      setMsg(e.message || 'Could not load verification status');
      setMsgOk(false);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const confirmIdentity = async () => {
    setBusy('identity');
    setMsg('');
    try {
      await api.post('/live/verify/identity', {});
      setIdentityDone(true);
      setMsg('Identity confirmed.');
      setMsgOk(true);
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Identity step failed');
      setMsgOk(false);
    } finally {
      setBusy('');
    }
  };

  const uploadFace = async (asset) => {
    if (!asset?.uri) return;
    setPreview(asset.uri);
    setBusy('face');
    setMsg('');
    try {
      const form = new FormData();
      form.append('photo', {
        uri: asset.uri,
        name: 'face.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      await api.request('/live/verify/face', { method: 'POST', body: form });
      setFaceDone(true);
      setMsg('Face verification saved.');
      setMsgOk(true);
      await refresh();
    } catch (e) {
      setMsg(e.message || 'Face upload failed');
      setMsgOk(false);
    } finally {
      setBusy('');
    }
  };

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setMsg('Camera permission is required for selfie verification.');
      setMsgOk(false);
      return;
    }
    const pick = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      cameraType: ImagePicker.CameraType?.front || 'front',
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!pick.canceled) await uploadFace(pick.assets[0]);
  };

  const openGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setMsg('Gallery permission is required.');
      setMsgOk(false);
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!pick.canceled) await uploadFace(pick.assets[0]);
  };

  const continueNext = () => {
    const redirect = route?.params?.redirect;
    if (redirect && typeof redirect === 'string') {
      navigation.replace(redirect);
      return;
    }
    navigation.navigate('StreamerCenter');
  };

  const allDone = identityDone && faceDone;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={18} color="#6B4F10" />
        <Text style={styles.backT}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Verify before going live</Text>
        <Text style={styles.sub}>
          Video live streaming requires identity confirmation and a face photo. This protects creators and viewers.
        </Text>

        {loading ? (
          <ActivityIndicator color="#C9A227" style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.steps}>
            <View style={[styles.step, identityDone && styles.stepDone]}>
              <Text style={styles.stepH}>
                <Text style={styles.stepN}>1 </Text>Identity
                {identityDone ? <Text style={styles.check}> ✓</Text> : null}
              </Text>
              <Text style={styles.stepP}>
                Confirm that your account details are accurate. Professionals with completed KYC are auto-verified.
              </Text>
              {!identityDone ? (
                <Pressable onPress={confirmIdentity} disabled={busy === 'identity'} style={styles.btnWrap}>
                  <LinearGradient colors={['#FF8C42', '#C9A227']} style={styles.btn}>
                    <Text style={styles.btnT}>{busy === 'identity' ? 'Confirming…' : 'Confirm identity'}</Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.step, faceDone && styles.stepDone]}>
              <Text style={styles.stepH}>
                <Text style={styles.stepN}>2 </Text>Face verification
                {faceDone ? <Text style={styles.check}> ✓</Text> : null}
              </Text>
              <Text style={styles.stepP}>
                Open your front camera, center your face, then capture. If the camera fails, use gallery — that also completes verification.
              </Text>
              {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : null}
              {!faceDone ? (
                <View style={styles.camActions}>
                  <Pressable onPress={openCamera} disabled={!!busy} style={styles.btnWrap}>
                    <LinearGradient colors={['#FF8C42', '#C9A227']} style={styles.btn}>
                      <Ionicons name="camera" size={16} color="#fff" />
                      <Text style={styles.btnT}>{busy === 'face' ? 'Uploading…' : 'Take selfie'}</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable onPress={openGallery} disabled={!!busy} style={styles.btnSecondary}>
                    <Text style={styles.btnSecondaryT}>Use gallery</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={[styles.step, allDone && styles.stepDone]}>
              <Text style={styles.stepH}>
                <Text style={styles.stepN}>3 </Text>Live access
                {allDone ? <Text style={styles.check}> ✓</Text> : null}
              </Text>
              <Text style={styles.stepP}>
                Once both steps are complete, you can start video live streams from Streamer Center.
              </Text>
              <Pressable onPress={continueNext} disabled={!allDone} style={[styles.btnWrap, !allDone && { opacity: 0.45 }]}>
                <LinearGradient colors={['#FF8C42', '#C9A227']} style={styles.btn}>
                  <Text style={styles.btnT}>Continue to Streamer Center</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}

        {msg ? (
          <View style={[styles.status, msgOk ? styles.statusOk : styles.statusErr]}>
            <Text style={[styles.statusT, msgOk ? styles.statusOkT : styles.statusErrT]}>{msg}</Text>
          </View>
        ) : null}
        {status?.reason ? <Text style={styles.hint}>{String(status.reason)}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF9F0' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  backT: { color: '#6B4F10', fontWeight: '700' },
  wrap: { paddingHorizontal: 16, paddingBottom: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 22, fontWeight: '800', color: '#6B4F10', marginBottom: 8 },
  sub: { fontSize: 14, color: '#78350F', lineHeight: 21, marginBottom: 20 },
  steps: { gap: 12 },
  step: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.25)',
  },
  stepDone: { borderColor: 'rgba(22,163,74,0.35)' },
  stepH: { fontSize: 15, fontWeight: '800', color: '#6B4F10', marginBottom: 6 },
  stepN: { color: '#C9A227' },
  check: { color: '#16A34A', fontWeight: '900' },
  stepP: { fontSize: 13, color: '#78350F', lineHeight: 19, marginBottom: 12 },
  btnWrap: { borderRadius: 999, overflow: 'hidden' },
  btn: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.45)',
  },
  btnSecondaryT: { color: '#92400E', fontWeight: '800', fontSize: 14 },
  camActions: { gap: 0 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12, backgroundColor: '#111' },
  status: { marginTop: 16, padding: 12, borderRadius: 12 },
  statusOk: { backgroundColor: 'rgba(34,197,94,0.12)' },
  statusErr: { backgroundColor: 'rgba(239,68,68,0.12)' },
  statusT: { fontSize: 13 },
  statusOkT: { color: '#166534' },
  statusErrT: { color: '#991B1B' },
  hint: { marginTop: 10, fontSize: 12, color: '#92400E' },
});
