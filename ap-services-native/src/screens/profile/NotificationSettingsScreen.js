import React, { useCallback, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Loading } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';

const KEYS = [
  { id: 'live', label: 'Live starts from people I follow' },
  { id: 'chat', label: 'Direct messages' },
  { id: 'gifts', label: 'Gifts & wallet' },
  { id: 'system', label: 'System announcements' },
];

export default function NotificationSettingsScreen({ navigation }) {
  const { api } = useAuth();
  const [settings, setSettings] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/push/settings');
      setSettings(api.unwrap(res) || {});
    } catch (_e) {
      setSettings({});
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (key) => {
    const next = { ...(settings || {}), [key]: !(settings || {})[key] };
    setSettings(next);
    try {
      await api.put('/push/settings', next);
    } catch (_e) {}
  };

  if (!settings) {
    return (
      <CreamPage title="Notification settings" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }

  return (
    <CreamPage title="Notification settings" navigation={navigation}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {KEYS.map((k) => (
          <View key={k.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ flex: 1, color: colors.textPrimary, paddingRight: 12 }}>{k.label}</Text>
            <Switch value={settings[k.id] !== false} onValueChange={() => toggle(k.id)} thumbColor={colors.gold500} />
          </View>
        ))}
      </ScrollView>
    </CreamPage>
  );
}
