import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { API_URL } from '../config/api';

async function shouldSuppressPush(data) {
  try {
    const cid = String(data?.conversationId || data?.conversation_id || '').trim();
    if (cid) {
      const raw = await AsyncStorage.getItem(`ap_chat_prefs_${cid}`);
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs?.mute) return true;
      }
    }
    const hostId = String(data?.hostId || data?.userId || data?.fromUserId || '').trim();
    const type = String(data?.type || data?.kind || '');
    if (hostId && /live|party|broadcast|host_live/i.test(type)) {
      const livePref = await AsyncStorage.getItem(`ap_live_reminder_${hostId}`);
      if (livePref === '0') return true;
    }
  } catch (_e) {}
  return false;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data || {};
    const muted = await shouldSuppressPush(data);
    if (muted) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C9A227',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('ap_live_default', {
    name: 'AP Live Service',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C9A227',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

export async function registerForPushNotificationsAsync() {
  try {
    await ensureAndroidChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    let deviceToken = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data) deviceToken = String(device.data);
    } catch (_e) {}

    let expoToken = null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (projectId) {
      try {
        const expo = await Notifications.getExpoPushTokenAsync({ projectId });
        expoToken = typeof expo === 'string' ? expo : expo?.data || expo?.token || null;
      } catch (_e) {}
    }

    const token = deviceToken || (expoToken ? String(expoToken) : null);
    if (!token) return null;
    return { token: String(token), expoToken: expoToken ? String(expoToken) : null, platform: Platform.OS };
  } catch (_e) {
    return null;
  }
}

export async function uploadPushToken(accessToken, tokenInfo) {
  if (!accessToken || !tokenInfo?.token) return false;
  try {
    const res = await fetch(`${API_URL}/push/register-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: tokenInfo.token,
        platform: tokenInfo.platform || Platform.OS,
      }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

export function resolvePushRoute(urlOrData) {
  const raw =
    typeof urlOrData === 'string'
      ? urlOrData
      : urlOrData?.deepLink || urlOrData?.url || '';
  const s = String(raw || '');
  const aplive = s.match(/^aplive:\/\/(.+)$/i);
  const apservices = s.match(/^apservices:\/\/(.+)$/i);
  const body = (aplive || apservices)?.[1] || '';
  if (body) {
    const [kind, id] = body.split('/').filter(Boolean);
    const roomId = id ? decodeURIComponent(id) : '';
    if (kind === 'live' && roomId) return { name: 'LiveRoom', params: { channel: roomId, isParty: false } };
    if (kind === 'party' && roomId) return { name: 'PartyRoom', params: { channel: roomId, isParty: true } };
    if (kind === 'profile' && roomId) return { name: 'CreatorProfile', params: { userId: roomId } };
    if (kind === 'chat') return { name: 'ChatThread', params: { conversationId: roomId } };
    if (kind === 'wallet' || kind === 'withdraw') return { name: 'Wallet' };
    if (kind === 'streamer') return { name: 'StreamerCenter' };
    if (kind === 'explore') return { name: 'Main' };
  }
  if (urlOrData && typeof urlOrData === 'object') {
    const type = String(urlOrData.type || '');
    const roomId = urlOrData.roomId || urlOrData.channel || '';
    if ((type === 'live_started' || type === 'host_live') && roomId) {
      return { name: 'LiveRoom', params: { channel: roomId } };
    }
    if (type === 'party_started' && roomId) {
      return { name: 'PartyRoom', params: { channel: roomId, isParty: true } };
    }
    if (type === 'new_message' && urlOrData.conversationId) {
      return { name: 'ChatThread', params: { conversationId: urlOrData.conversationId } };
    }
  }
  return null;
}

export function extractNotificationData(response) {
  return response?.notification?.request?.content?.data || {};
}
