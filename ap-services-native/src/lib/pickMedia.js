import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

function mediaTypesFor(kind) {
  const images = ImagePicker.MediaType?.Images || 'images';
  const videos = ImagePicker.MediaType?.Videos || 'videos';
  if (kind === 'video') return [videos];
  if (kind === 'all' || kind === 'mixed') return [images, videos];
  return [images];
}

export async function pickMedia(kind = 'image') {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && !perm.accessPrivileges) {
      Alert.alert('Permission needed', 'Allow photos and videos so you can upload from this phone.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaTypesFor(kind),
      quality: 0.85,
      videoMaxDuration: 90,
      allowsMultipleSelection: false,
      preferredAssetRepresentationMode: 'compatible',
    });
    if (res.canceled) return null;
    return res.assets?.[0] || null;
  } catch (e) {
    Alert.alert('Picker failed', e.message || 'Could not open gallery.');
    return null;
  }
}

export async function pickFromCamera(kind = 'image') {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera to take a photo or video.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: mediaTypesFor(kind === 'video' ? 'video' : 'image'),
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (res.canceled) return null;
    return res.assets?.[0] || null;
  } catch (e) {
    Alert.alert('Camera failed', e.message || 'Could not open camera.');
    return null;
  }
}

export function filePart(asset, fallbackName = 'photo.jpg') {
  const uri = asset?.uri;
  if (!uri) return null;
  const mime = String(asset.mimeType || asset.type || '').toLowerCase();
  const nameHint = String(asset.fileName || fallbackName || uri);
  const isAudio =
    mime.startsWith('audio') ||
    /\.(m4a|aac|mp3|wav|caf|ogg)(\?|$)/i.test(uri) ||
    /\.(m4a|aac|mp3|wav|caf|ogg)$/i.test(nameHint);
  const isVideo =
    !isAudio &&
    (mime.startsWith('video') || /\.(mp4|mov|webm|m4v|3gp)(\?|$)/i.test(uri));
  const name = isAudio ? 'voice.m4a' : isVideo ? (asset.fileName || 'clip.mp4') : (asset.fileName || fallbackName);
  const type = isAudio
    ? 'audio/mp4'
    : isVideo
      ? (mime.startsWith('video') ? mime : 'video/mp4')
      : (mime.startsWith('image') ? mime : 'image/jpeg');
  let normalized = uri;
  if (Platform.OS === 'android') {
    if (uri.startsWith('/')) normalized = `file://${uri}`;
    else if (!/^(file|content|http|https):/i.test(uri)) normalized = `file://${uri}`;
  }
  return { uri: normalized, name, type };
}
