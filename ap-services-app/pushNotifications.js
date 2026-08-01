/**
 * Expo push / FCM token registration + deep-link routing into the WebView.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const API_CONFIG = require('./config/production-api');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function apiBase() {
  return String(API_CONFIG.API_URL || '').replace(/\/$/, '');
}

/** Create Android channels used by FCM / expo-notifications plugin. */
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

  /* Keep legacy channel id for older builds / server payloads */
  await Notifications.setNotificationChannelAsync('ap_live_default', {
    name: 'AP Live',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C9A227',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

/**
 * Request notification permission (if needed) and resolve the native FCM device token.
 */
export async function registerForPushNotificationsAsync() {
  try {
    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('[push] permission not granted');
      return null;
    }

    /* Native FCM token (required for Firebase Admin / FCM HTTP sends) */
    let deviceToken = null;
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data) deviceToken = String(device.data);
    } catch (err) {
      console.warn('[push] getDevicePushTokenAsync failed', err?.message || err);
    }

    /* Optional Expo push token (only when EAS projectId is configured) */
    let expoToken = null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId ||
      undefined;
    if (projectId) {
      try {
        const expo = await Notifications.getExpoPushTokenAsync({ projectId });
        expoToken =
          typeof expo === 'string' ? expo : expo?.data || expo?.token || null;
      } catch (_e) {
        /* Expo token optional when sending via FCM directly */
      }
    }

    const token = deviceToken || (expoToken ? String(expoToken) : null);
    if (!token) {
      console.warn('[push] no device token available');
      return null;
    }

    return {
      token: String(token),
      expoToken: expoToken ? String(expoToken) : null,
      platform: Platform.OS,
    };
  } catch (err) {
    console.warn('[push] register failed', err?.message || err);
    return null;
  }
}

export async function uploadPushToken(accessToken, tokenInfo) {
  if (!accessToken || !tokenInfo?.token) return false;
  try {
    const res = await fetch(`${apiBase()}/push/register-token`, {
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
    if (!res.ok) {
      console.warn('[push] register-token HTTP', res.status);
    }
    return res.ok;
  } catch (err) {
    console.warn('[push] upload failed', err?.message || err);
    return false;
  }
}

export async function removePushToken(accessToken, token) {
  if (!accessToken || !token) return false;
  try {
    const res = await fetch(`${apiBase()}/push/remove-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

/**
 * Map aplive:// / apservices:// notification deep links to frontend paths.
 */
export function resolvePushDeepLink(urlOrData, frontendBase) {
  const base = String(frontendBase || '').replace(/\/$/, '');
  const raw =
    typeof urlOrData === 'string'
      ? urlOrData
      : urlOrData?.deepLink || urlOrData?.url || '';

  let path = '';
  const s = String(raw || '');

  const aplive = s.match(/^aplive:\/\/(.+)$/i);
  const apservices = s.match(/^apservices:\/\/(.+)$/i);
  const body = (aplive || apservices)?.[1] || '';

  if (body) {
    const [kind, id] = body.split('/').filter(Boolean);
    const roomId = id ? decodeURIComponent(id) : '';
    if (kind === 'live' && roomId) {
      path = `/live-room.html?channel=${encodeURIComponent(roomId)}&app=1`;
    } else if (kind === 'party' && roomId) {
      path = `/party-room.html?channel=${encodeURIComponent(roomId)}&app=1`;
    } else if (kind === 'profile' && roomId) {
      path = `/creator-profile.html?userId=${encodeURIComponent(roomId)}&app=1`;
    } else if (kind === 'post' && roomId) {
      path = `/explore.html?app=1&post=${encodeURIComponent(roomId)}`;
    } else if (kind === 'chat') {
      path = roomId
        ? `/chat.html?app=1&conversation=${encodeURIComponent(roomId)}`
        : `/chat.html?app=1`;
    } else if (kind === 'agency') {
      path = `/agency-center.html?app=1`;
    } else if (kind === 'streamer') {
      path = `/streamer-center.html?app=1`;
    } else if (kind === 'wallet') {
      path = `/wallet.html?app=1`;
    } else if (kind === 'withdraw') {
      path = `/withdraw.html?app=1`;
    } else if (kind === 'admin') {
      const section = roomId || 'notifications';
      path = `/admin-dashboard.html?app=1#${encodeURIComponent(section)}`;
    } else if (kind === 'explore') {
      path = `/explore.html?app=1`;
    }
  }

  /* Fallback from FCM data payload without deepLink */
  if (!path && urlOrData && typeof urlOrData === 'object') {
    const type = String(urlOrData.type || '');
    const roomId = urlOrData.roomId || urlOrData.channel || '';
    const conversationId = urlOrData.conversationId || '';
    if ((type === 'live_started' || type === 'host_live') && roomId) {
      path = `/live-room.html?channel=${encodeURIComponent(roomId)}&app=1`;
    } else if (type === 'party_started' && roomId) {
      path = `/party-room.html?channel=${encodeURIComponent(roomId)}&app=1`;
    } else if (type === 'new_message' && conversationId) {
      path = `/chat.html?app=1&conversation=${encodeURIComponent(conversationId)}`;
    } else if (type === 'withdrawal_update') {
      path = `/withdraw.html?app=1`;
    } else if (type === 'wallet_update') {
      path = `/wallet.html?app=1`;
    } else if (type === 'admin_alert') {
      path = `/admin-dashboard.html?app=1`;
    }
  }

  if (!path || !base) return null;
  return `${base}${path}`;
}

export function extractNotificationData(response) {
  const content = response?.notification?.request?.content || {};
  const data = content.data || {};
  return data;
}
