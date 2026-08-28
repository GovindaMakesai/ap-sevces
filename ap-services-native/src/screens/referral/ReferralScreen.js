import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Avatar, ErrorBanner, Field, Loading } from '../../components/ui';
import { CreamCard, CreamHeader, OrangeCta } from '../../components/creamChrome';
import { formatUserDisplayId } from '../../lib/roles';

export default function ReferralScreen({ navigation }) {
  const { api, user } = useAuth();
  const [dash, setDash] = useState(null);
  const [tab, setTab] = useState('rewards');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const publicId = formatUserDisplayId(user);

  const load = useCallback(() => {
    api.get('/referral/dashboard')
      .then((r) => setDash(api.unwrap(r) || r.data || r || {}))
      .catch((e) => { setError(e.message); setDash({}); });
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!dash) return <Loading />;
  const link = dash.link || dash.code || '';
  const inviteMsg = `Join me on AP Live Service! Use my ID ${publicId || link} ${link || ''}`.trim();
  const ranks = dash.leaderboard || dash.rankings || dash.incomeRank || [];
  const claimed = dash.claimed || dash.claimed_rewards || 0;
  const invitees = dash.invitees || dash.invite_count || dash.count || 0;
  const pending = dash.pending_points || dash.pending || 0;
  const inviter = dash.inviter || dash.invited_by;

  const copyId = () => Share.share({ message: String(publicId || link || '') });

  return (
    <View style={styles.root}>
      <CreamHeader title="Invite" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ErrorBanner message={error} onRetry={load} />
        {inviter ? (
          <CreamCard style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={inviter.profile_pic} name={inviter.name || inviter.first_name || 'U'} size={44} />
            <View>
              <Text style={styles.meta}>You were invited by</Text>
              <Text style={styles.name}>{inviter.name || inviter.first_name || '—'}</Text>
              <Text style={styles.connected}>Connected</Text>
            </View>
          </CreamCard>
        ) : null}

        <CreamCard>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28 }}>🎁🪙📦</Text>
            <Text style={styles.inviteSomeone}>Invite someone</Text>
            <Text style={styles.earn}>🌿 Can earn up to <Text style={styles.earnN}>$14</Text> 🌿</Text>
            <Text style={styles.meta}>The more you invite, the more rewards you will get</Text>
          </View>
          <OrangeCta title="Invite Now" onPress={() => Share.share({ message: inviteMsg })} style={{ marginTop: 12 }} />
          <Pressable onPress={copyId} style={styles.idChip}>
            <Text style={styles.idChipT}>My ID: {publicId || '—'}</Text>
            <Ionicons name="copy-outline" size={14} color="#E91E63" />
          </Pressable>
          <Text style={[styles.meta, { textAlign: 'center' }]}>Friends can use this ID or your shared link when signing up</Text>
        </CreamCard>

        <LinearGradient colors={['#FF4D8D', '#FF8C00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
          <View>
            <Text style={styles.bannerT}>Invite Friends</Text>
            <Text style={styles.bannerS}>Up to 🪙 10,500 /invite</Text>
          </View>
          <Ionicons name="diamond" size={42} color="#90CAF9" />
        </LinearGradient>

        <View style={styles.seg}>
          {[['rewards', 'My rewards'], ['rank', 'Income Rank']].map(([id, label]) => (
            <Pressable key={id} onPress={() => setTab(id)} style={[styles.segBtn, tab === id && styles.segOn]}>
              <Text style={[styles.segT, tab === id && styles.segTOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'rewards' ? (
          <CreamCard>
            <View style={styles.two}>
              <View style={styles.col}><Text style={styles.big}>{claimed}</Text><Text style={styles.meta}>Claimed Rewards</Text></View>
              <View style={styles.col}><Text style={styles.big}>{invitees}</Text><Text style={styles.meta}>Number of invitees</Text></View>
            </View>
            <View style={styles.pending}>
              <Text style={styles.meta}>Pending points 🌸 {pending}</Text>
              <View style={[styles.recv, pending ? { backgroundColor: '#FF8C00' } : null]}>
                <Text style={styles.recvT}>Receive to Points</Text>
              </View>
            </View>
            <View style={{ height: 10 }} />
            <Field label="Apply a friend's ID / code" value={code} onChangeText={setCode} />
            <OrangeCta title="Apply" onPress={() => code && api.post('/referral/apply', { code }).then(load)} />
            <Text style={[styles.meta, { marginTop: 12 }]}>Invitations from the last 7 days ({dash.recent_count || 0})</Text>
          </CreamCard>
        ) : (
          <CreamCard>
            <Text style={styles.name}>Income Rank</Text>
            <Text style={styles.meta}>Based on invite reward points</Text>
            {(ranks.length ? ranks : []).map((r, i) => (
              <View key={String(r.id || i)} style={styles.rankRow}>
                <Text style={styles.rankN}>#{r.rank || i + 1}</Text>
                <Avatar uri={r.profile_pic || r.avatar} name={r.name || r.first_name || 'U'} size={40} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.name} numberOfLines={1}>{r.name || r.first_name || 'User'}</Text>
                  <Text style={styles.meta}>{r.points || 0} points · {r.invites || r.valid_invites || 0} valid invites</Text>
                </View>
              </View>
            ))}
            {!ranks.length ? <Text style={[styles.meta, { marginTop: 8 }]}>No rankings yet</Text> : null}
          </CreamCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  inviteSomeone: { color: '#5D4037', fontWeight: '700', marginTop: 6 },
  earn: { fontSize: 16, fontWeight: '700', color: '#5D4037', marginTop: 4 },
  earnN: { color: '#FF4D8D', fontSize: 28, fontWeight: '800' },
  meta: { color: '#9E9E9E', fontSize: 12, marginTop: 6 },
  name: { fontWeight: '800', color: '#5D4037' },
  connected: { alignSelf: 'flex-start', backgroundColor: '#C8E6C9', color: '#2E7D32', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '700', marginTop: 4 },
  idChip: { alignSelf: 'center', marginTop: 12, backgroundColor: '#FCE4EC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  idChipT: { color: '#C2185B', fontWeight: '800', fontSize: 12 },
  banner: { marginHorizontal: 14, marginTop: 10, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerT: { color: '#fff', fontSize: 22, fontWeight: '800' },
  bannerS: { color: '#fff', marginTop: 4, fontWeight: '700' },
  seg: { flexDirection: 'row', marginHorizontal: 14, marginTop: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#FF8C00' },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F8C9A0' },
  segOn: { backgroundColor: '#fff' },
  segT: { color: '#fff', fontWeight: '800' },
  segTOn: { color: '#FF8C00' },
  two: { flexDirection: 'row' },
  col: { flex: 1, alignItems: 'center' },
  big: { fontSize: 28, fontWeight: '800', color: '#5D4037' },
  pending: { marginTop: 12, backgroundColor: '#F5E6C8', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recv: { backgroundColor: '#C4B08A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  recvT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE' },
  rankN: { width: 28, fontWeight: '800', color: '#C9A227' },
});
