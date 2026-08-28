import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { GoldButton, Loading } from '../../components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { CreamCard, CreamPage } from '../../components/creamChrome';

export default function AgencyScreen({ navigation }) {
  const { api } = useAuth();
  const [data, setData] = useState(null);

  useFocusEffect(
    useCallback(() => {
      api.get('/host/dashboard').then((r) => setData(api.unwrap(r))).catch(() => setData({}));
    }, [api])
  );

  if (!data) {
    return (
      <CreamPage title="Agency / Host" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }
  const agency = data.agency || data.summary || {};
  return (
    <CreamPage title="Agency / Host" navigation={navigation}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <CreamCard>
          <Text style={styles.k}>Agency</Text>
          <Text style={styles.v}>{agency.name || agency.agency_name || 'None yet'}</Text>
          <Text style={styles.k}>Hosts</Text>
          <Text style={styles.v}>{agency.hosts || agency.host_count || 0}</Text>
        </CreamCard>
        <View style={{ margin: 14 }}>
          <GoldButton title="Request agency" onPress={() => api.post('/agency/request', {})} />
        </View>
      </ScrollView>
    </CreamPage>
  );
}

export function LevelsScreen({ navigation }) {
  const { api, user } = useAuth();
  const [data, setData] = useState(null);
  useFocusEffect(
    useCallback(() => {
      Promise.all([
        api.get('/cp/levels/personal').catch(() => ({})),
        api.get('/cp/levels/room').catch(() => ({})),
        api.get(`/social/creators/${user?.id}/profile-panel`, null, { auth: false }).catch(() => ({})),
      ]).then(([p, r, panel]) => setData({ personal: api.unwrap(p), room: api.unwrap(r), panel: api.unwrap(panel) }));
    }, [api, user?.id])
  );
  if (!data) {
    return (
      <CreamPage title="Levels" navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }
  const personal = Number(data.personal?.level || data.personal?.lvl || data.panel?.level || user?.level || 1);
  const room = Number(data.room?.level || data.room?.lvl || 1);
  const xp = Math.min(100, Number(data.personal?.xp_pct || data.personal?.progress || (personal % 10) * 10));
  const rxp = Math.min(100, Number(data.room?.xp_pct || data.room?.progress || (room % 10) * 10));
  return (
    <CreamPage title="Levels" navigation={navigation}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={['#1E3A8A', '#2563EB']} style={{ margin: 14, borderRadius: 22, padding: 20, alignItems: 'center' }}>
          <Text style={{ color: '#BFDBFE', fontWeight: '700' }}>Personal level</Text>
          <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 8, borderColor: '#FBBF24', alignItems: 'center', justifyContent: 'center', marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>{personal}</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Lv.{personal}</Text>
          <View style={{ width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, marginTop: 12, overflow: 'hidden' }}>
            <View style={{ width: `${xp}%`, height: 8, backgroundColor: '#FBBF24' }} />
          </View>
          <Text style={{ color: '#DBEAFE', marginTop: 8, fontSize: 12 }}>Send gifts and stay live to level up.</Text>
        </LinearGradient>
        <LinearGradient colors={['#4C1D95', '#7C3AED']} style={{ marginHorizontal: 14, borderRadius: 22, padding: 20, alignItems: 'center' }}>
          <Text style={{ color: '#DDD6FE', fontWeight: '700' }}>Room level</Text>
          <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 8, borderColor: '#C4B5FD', alignItems: 'center', justifyContent: 'center', marginVertical: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{room}</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Lv.{room}</Text>
          <View style={{ width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, marginTop: 12, overflow: 'hidden' }}>
            <View style={{ width: `${rxp}%`, height: 8, backgroundColor: '#C4B5FD' }} />
          </View>
          <Text style={{ color: '#EDE9FE', marginTop: 8, fontSize: 12 }}>Gifts in your live room raise this level.</Text>
        </LinearGradient>
        <View style={{ margin: 14 }}>
          <GoldButton title="Open CP House" onPress={() => navigation.navigate('Cp')} />
        </View>
      </ScrollView>
    </CreamPage>
  );
}

export function CommentsScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const { api } = useAuth();
  const [rows, setRows] = useState([]);
  useFocusEffect(
    useCallback(() => {
      api.get(`/social/posts/${postId}/comments`, null, { auth: false }).then((r) => setRows(api.extractList(r))).catch(() => {});
    }, [api, postId])
  );
  return (
    <CreamPage title="Comments" navigation={navigation}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {rows.map((c, i) => (
          <Text key={c.id || i} style={{ marginBottom: 10, color: colors.textPrimary }}>
            <Text style={{ fontWeight: '700', color: colors.gold700 }}>{c.author?.first_name || c.user?.name || 'User'}: </Text>
            {c.text || c.body || c.content}
          </Text>
        ))}
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  k: { color: colors.textSecondary, marginTop: 8, fontWeight: '700' },
  v: { fontSize: 28, fontWeight: '800', color: colors.gold700 },
  hint: { color: '#8B6D3B', marginTop: 8, fontSize: 12 },
  bar: { height: 8, backgroundColor: '#F3E6C8', borderRadius: 8, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#FF8C00' },
});
