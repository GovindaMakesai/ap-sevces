import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './ui';
import { beautyTint } from '../lib/liveBeauty';

let Agora = null;
try {
  Agora = require('react-native-agora');
} catch (_e) {
  Agora = null;
}

const RtcView = (Platform.OS === 'android' && Agora?.RtcTextureView) || Agora?.RtcSurfaceView;
const VideoSourceType = Agora?.VideoSourceType;

/**
 * Stable Agora video surface — must stay mounted across chat/UI state updates.
 */
function LiveVideoLayerInner({
  agoraReady,
  isHost,
  remoteUid,
  camOff,
  beautyFilter,
  mirrored,
  hostProfilePic,
  hostName,
  style,
  uid,
}) {
  if (!RtcView || !agoraReady) {
    return (
      <View style={[styles.fallback, style]}>
        <Avatar uri={hostProfilePic} name={hostName} size={72} />
        <Text style={styles.fallbackName}>{hostName || 'Live'}</Text>
        <Text style={styles.fallbackHint}>Connecting video…</Text>
      </View>
    );
  }

  if (isHost && !camOff) {
    const tint = beautyTint(beautyFilter);
    return (
      <View style={[StyleSheet.absoluteFill, style]} collapsable={false}>
        <RtcView
          style={[StyleSheet.absoluteFill, mirrored ? { transform: [{ scaleX: -1 }] } : null]}
          canvas={{ uid: 0, sourceType: VideoSourceType?.VideoSourceCamera }}
          zOrderMediaOverlay={Platform.OS === 'android'}
          collapsable={false}
        />
        {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      </View>
    );
  }

  const playUid = uid != null ? uid : remoteUid;
  if (playUid != null && playUid !== 0) {
    return (
      <RtcView
        style={[StyleSheet.absoluteFill, style]}
        canvas={{ uid: playUid, sourceType: VideoSourceType?.VideoSourceRemote }}
        zOrderMediaOverlay={Platform.OS === 'android'}
        collapsable={false}
      />
    );
  }

  return (
    <View style={[styles.fallback, style]}>
      <Avatar uri={hostProfilePic} name={hostName} size={72} />
      <Text style={styles.fallbackName}>{hostName || 'Live'}</Text>
    </View>
  );
}

function propsEqual(a, b) {
  return (
    a.agoraReady === b.agoraReady &&
    a.isHost === b.isHost &&
    a.remoteUid === b.remoteUid &&
    a.camOff === b.camOff &&
    a.beautyFilter === b.beautyFilter &&
    a.mirrored === b.mirrored &&
    a.hostProfilePic === b.hostProfilePic &&
    a.hostName === b.hostName &&
    a.uid === b.uid
  );
}

const LiveVideoLayer = memo(LiveVideoLayerInner, propsEqual);

export default LiveVideoLayer;

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#120c24',
  },
  fallbackName: { color: '#fff', fontWeight: '800', marginTop: 12, fontSize: 18 },
  fallbackHint: { color: 'rgba(255,255,255,0.6)', marginTop: 6 },
});
