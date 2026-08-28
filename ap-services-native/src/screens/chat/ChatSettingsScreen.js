import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/ui';

function Row({ label, value, onValueChange, last }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowT}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E5E5E5', true: '#E89020' }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function prefsKey(id) {
  return `ap_chat_prefs_${id || 'none'}`;
}

export async function loadChatPrefs(conversationId) {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(conversationId));
    if (!raw) return { top: false, live: false, mute: false, star: true, clearedAt: 0 };
    return { top: false, live: false, mute: false, star: true, clearedAt: 0, ...JSON.parse(raw) };
  } catch (_e) {
    return { top: false, live: false, mute: false, star: true, clearedAt: 0 };
  }
}

const DEFAULT_PREFS = { top: false, live: false, mute: false, star: true, clearedAt: 0 };

/** Batch-read chat prefs — one AsyncStorage round-trip instead of N. */
export async function loadChatPrefsBatch(conversationIds = []) {
  const ids = conversationIds.map(String).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  try {
    const keys = ids.map(prefsKey);
    const pairs = await AsyncStorage.multiGet(keys);
    pairs.forEach(([key, raw], i) => {
      const id = ids[i];
      if (!id) return;
      try {
        map.set(id, raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS });
      } catch (_e) {
        map.set(id, { ...DEFAULT_PREFS });
      }
    });
  } catch (_e) {
    ids.forEach((id) => map.set(id, { ...DEFAULT_PREFS }));
  }
  return map;
}

export default function ChatSettingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const { conversationId, name, otherUserId, pic } = route.params || {};
  const [top, setTop] = useState(false);
  const [live, setLive] = useState(false);
  const [mute, setMute] = useState(false);
  const [star, setStar] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    loadChatPrefs(conversationId).then((p) => {
      setTop(Boolean(p.top));
      setLive(Boolean(p.live));
      setMute(Boolean(p.mute));
      setStar(p.star !== false);
    });
  }, [conversationId]);

  const persist = useCallback(
    async (next) => {
      const merged = { top, live, mute, star, ...next };
      setTop(Boolean(merged.top));
      setLive(Boolean(merged.live));
      setMute(Boolean(merged.mute));
      setStar(merged.star !== false);
      await AsyncStorage.setItem(prefsKey(conversationId), JSON.stringify(merged)).catch(() => {});
      if (otherUserId && Object.prototype.hasOwnProperty.call(next, 'live')) {
        await AsyncStorage.setItem(
          `ap_live_reminder_${otherUserId}`,
          merged.live ? '1' : '0'
        ).catch(() => {});
      }
      return merged;
    },
    [conversationId, live, mute, otherUserId, star, top]
  );

  const clearHistory = () => {
    Alert.alert('Clear chat history', 'Remove messages from this chat on your device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setBusy('clear');
          try {
            await persist({ clearedAt: Date.now() });
            await api.delete?.(`/messages/${conversationId}`).catch(() => null);
            await api.post('/messages/clear', { conversationId }).catch(() => null);
            Alert.alert('Cleared', 'Chat history cleared on this device.');
            navigation.navigate({
              name: 'ChatThread',
              params: { conversationId, name, otherUserId, pic, clearedAt: Date.now() },
              merge: true,
            });
          } finally {
            setBusy('');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.title}>Chat Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => otherUserId && navigation.navigate('CreatorProfile', { userId: otherUserId, name })}
          style={styles.user}
        >
          <Avatar uri={pic} name={name} size={48} />
          <Text style={styles.userName}>{name || 'User'}</Text>
          <Ionicons name="chevron-forward" size={18} color="#C8C8C8" />
        </Pressable>
        <View style={styles.card}>
          <Row label="Set To Top" value={top} onValueChange={(v) => persist({ top: v })} />
          <Row label="Live Broadcast Reminder" value={live} onValueChange={(v) => persist({ live: v })} />
          <Row label="Mute Notifications" value={mute} onValueChange={(v) => persist({ mute: v })} />
          <Row label="Show Friend's Link Content" value={star} onValueChange={(v) => persist({ star: v })} last />
        </View>
        <Pressable style={styles.action} onPress={clearHistory} disabled={busy === 'clear'}>
          <Text style={styles.actionT}>{busy === 'clear' ? 'Clearing…' : 'Clear Chat History'}</Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => {
            if (!otherUserId) {
              Alert.alert('Report failed', 'Could not find this user.');
              return;
            }
            Alert.alert('Report', 'Report this chat for review?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Report',
                onPress: () =>
                  api
                    .post('/social/report', { userId: otherUserId, reason: 'chat' })
                    .then(() => Alert.alert('Reported', 'Thanks, we will review this chat.'))
                    .catch((e) => Alert.alert('Report failed', e.message)),
              },
            ]);
          }}
        >
          <Text style={styles.actionT}>Report</Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => {
            if (!otherUserId) {
              Alert.alert('Failed', 'Could not find this user.');
              return;
            }
            Alert.alert('Block user', `Add ${name || 'this user'} to blacklist?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: () =>
                  api
                    .post(`/social/block/${otherUserId}`)
                    .then(() => {
                      Alert.alert('Blocked', `${name || 'User'} was added to your blacklist.`);
                      navigation.popToTop();
                    })
                    .catch((e) => Alert.alert('Failed', e.message)),
              },
            ]);
          }}
        >
          <Text style={styles.danger}>Add Into Blacklist</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, backgroundColor: '#F4F5F7' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#111' },
  user: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  card: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowT: { fontSize: 15, color: '#111' },
  action: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  actionT: { fontSize: 15, color: '#111', fontWeight: '600' },
  danger: { fontSize: 15, color: '#E11D48', fontWeight: '700' },
});
