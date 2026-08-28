import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';

function person(item) {
  const id = String(item.userId || item.user_id || item.id || item.follower_id || item.following_id || '');
  const name =
    item.displayName ||
    item.name ||
    [item.first_name, item.last_name].filter(Boolean).join(' ') ||
    item.user?.first_name ||
    'User';
  const pic = item.profilePic || item.profile_pic || item.user?.profile_pic;
  return { id, name, pic, following: Boolean(item.isFollowing || item.following) };
}

export default function FollowListScreen({ navigation, route }) {
  const { kind = 'followers', userId } = route.params || {};
  const { api, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const title = kind === 'followers' ? 'Followers' : kind === 'likers' ? 'Likes' : 'Following';
  const empty =
    kind === 'followers'
      ? 'No followers yet. Go live and share your profile!'
      : kind === 'likers'
        ? 'No likes yet.'
        : 'You are not following anyone yet.';

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const path =
        kind === 'followers'
          ? userId
            ? `/social/followers/${userId}`
            : '/social/followers'
          : kind === 'likers' && route.params?.postId
            ? `/social/posts/${route.params.postId}/likes`
            : userId
              ? `/social/following/${userId}`
              : '/social/following';
      const res = await api.get(path);
      let list = api.extractList(res);
      const d = api.unwrap(res);
      if (!list.length) list = d.followers || d.following || d.likes || d.users || [];
      setRows((Array.isArray(list) ? list : []).map(person).filter((p) => p.id));
    } catch (e) {
      setError(e.message || 'Could not load list');
    } finally {
      setLoading(false);
    }
  }, [api, kind, route.params?.postId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (item) => {
    try {
      if (item.following) await api.delete(`/social/follow/${item.id}`);
      else await api.post(`/social/follow/${item.id}`);
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, following: !r.following } : r)));
    } catch (e) {
      Alert.alert('Follow failed', e.message);
    }
  };

  if (loading && !rows.length) {
    return (
      <CreamPage title={title} navigation={navigation}>
        <Loading />
      </CreamPage>
    );
  }

  return (
    <CreamPage title={title} navigation={navigation}>
    <View style={styles.root}>
      <ErrorBanner message={error} onRetry={load} />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold500} />}
        ListEmptyComponent={
          <View>
            <EmptyState title={empty} />
            {kind !== 'likers' ? (
              <Pressable onPress={() => navigation.navigate('DiscoverCreators')} style={{ alignItems: 'center', padding: 12 }}>
                <Text style={{ color: colors.gold600, fontWeight: '800' }}>Discover creators</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('CreatorProfile', { userId: item.id, name: item.name })}
          >
            <Avatar uri={item.pic} name={item.name} size={48} />
            <Text style={styles.name}>{item.name}</Text>
            {item.id !== String(user?.id) ? (
              <Pressable onPress={() => toggle(item)} style={[styles.followChip, item.following && styles.followChipOn]}>
                <Text style={[styles.followChipT, item.following && styles.followChipTOn]}>{item.following ? 'Following' : 'Follow'}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
    </View>
    </CreamPage>
  );
}

FollowListScreen.titleFromKind = (kind) =>
  kind === 'followers' ? 'Followers' : kind === 'likers' ? 'Likes' : 'Following';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,162,39,0.12)',
    backgroundColor: colors.creamCard,
  },
  name: { flex: 1, fontWeight: '700', color: colors.textPrimary, fontSize: 15 },
  followChip: { backgroundColor: '#FF8C00', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minWidth: 88, alignItems: 'center' },
  followChipOn: { backgroundColor: '#F3E6C8' },
  followChipT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  followChipTOn: { color: '#8B6D3B' },
});
