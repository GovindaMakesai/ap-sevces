import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Field, GoldButton, Loading } from '../../components/ui';

export default function CpScreen() {
  const { api } = useAuth();
  const [home, setHome] = useState(null);
  const [rings, setRings] = useState([]);
  const [target, setTarget] = useState('');

  useFocusEffect(
    useCallback(() => {
      api.get('/cp/home').then((r) => setHome(api.unwrap(r))).catch(() => setHome({}));
      api.get('/cp/rings', null, { auth: false }).then((r) => setRings(api.extractList(r))).catch(() => {});
    }, [api])
  );

  if (!home) return <Loading />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.creamBg }} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>CP</Text>
      <View style={styles.card}>
        <Text style={styles.k}>Partner</Text>
        <Text style={styles.v}>{home.partner?.first_name || home.partnerName || 'Single'}</Text>
        <Text style={styles.k}>Intimacy</Text>
        <Text style={styles.v}>{home.intimacy || home.score || 0}</Text>
      </View>
      <Field label="Invite user ID" value={target} onChangeText={setTarget} />
      <GoldButton title="Send CP invite" onPress={() => target && api.post('/cp/invite', { targetUserId: target })} />
      <Text style={[styles.k, { marginTop: 18 }]}>Rings</Text>
      {rings.map((r) => (
        <Text key={r.id || r.slug} style={{ marginTop: 6 }}>{r.emoji || '💍'} {r.name} · {r.coin_cost || r.cost} coins</Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  card: { backgroundColor: colors.creamCard, borderRadius: 16, padding: 16, marginVertical: 16, borderWidth: 1, borderColor: colors.border },
  k: { color: colors.textSecondary },
  v: { fontSize: 20, fontWeight: '800', color: colors.gold700, marginBottom: 8 },
});
