import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  access: 'ap_access_token',
  refresh: 'ap_refresh_token',
  user: 'ap_user',
};

export async function loadSession() {
  const [accessToken, refreshToken, userJson] = await Promise.all([
    AsyncStorage.getItem(KEYS.access),
    AsyncStorage.getItem(KEYS.refresh),
    AsyncStorage.getItem(KEYS.user),
  ]);
  let user = null;
  try {
    user = userJson ? JSON.parse(userJson) : null;
  } catch (_e) {
    user = null;
  }
  return { accessToken, refreshToken, user };
}

export async function saveSession({ user, accessToken, refreshToken }) {
  const ops = [];
  if (accessToken) ops.push(AsyncStorage.setItem(KEYS.access, String(accessToken)));
  if (refreshToken) ops.push(AsyncStorage.setItem(KEYS.refresh, String(refreshToken)));
  if (user) ops.push(AsyncStorage.setItem(KEYS.user, JSON.stringify(user)));
  await Promise.all(ops);
}

export async function clearSession() {
  await Promise.all([
    AsyncStorage.removeItem(KEYS.access),
    AsyncStorage.removeItem(KEYS.refresh),
    AsyncStorage.removeItem(KEYS.user),
  ]);
}
