import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { GoldButton, Loading } from '../../components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { CreamCard, CreamPage } from '../../components/creamChrome';
import CommentSheet from '../../components/CommentSheet';

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

export function CommentsScreen({ route, navigation }) {
  const { postId } = route.params || {};
  const { api, user } = useAuth();
  const post = postId ? { id: postId } : null;
  return (
    <CreamPage title="Comments" navigation={navigation}>
      <CommentSheet
        visible={Boolean(postId)}
        post={post}
        api={api}
        user={user}
        navigation={navigation}
        onClose={() => navigation.goBack()}
      />
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
