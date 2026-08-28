import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { ErrorBanner, Field, GoldButton } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';

const ROLES = ['host', 'agency', 'coin_seller'];

export default function RoleApplyScreen({ navigation }) {
  const { api } = useAuth();
  const [roleType, setRoleType] = useState('host');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/social/role-applications', { roleType, note });
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CreamPage title="Apply for a role" navigation={navigation}>
      <ScrollView contentContainerStyle={styles.body}>
        <ErrorBanner message={error} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => setRoleType(r)} style={[styles.chip, roleType === r && styles.chipOn]}>
              <Text style={{ color: roleType === r ? '#fff' : colors.gold700, fontWeight: '700', textTransform: 'capitalize' }}>{r.replace('_', ' ')}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Why you?" value={note} onChangeText={setNote} multiline />
        <GoldButton title={busy ? 'Submitting…' : 'Submit application'} onPress={submit} disabled={busy} />
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(201, 162, 39, 0.28)', backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
});
