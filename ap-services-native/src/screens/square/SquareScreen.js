import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import SoftImage from '../../components/SoftImage';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { FadeIn, PressScale } from '../../components/motion';
import { mapFeedPost, openReelViewer } from '../../components/PostGrid';

const FEEDS = [
  { id: 'for_you', label: 'For You' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
];

const W = Dimensions.get('window').width;
const COL = (W - 36) / 2;

function postThumb(item) {
  return mediaUrl(
    item.thumb ||
      item.thumbnail_url ||
      item.mediaUrl ||
      item.media_url ||
      item.image_url ||
      item.cover_url
  );
}

function RailCard({ item, onPress, live }) {
  const pic = mediaUrl(item.profilePic || item.profile_pic || item.thumb || item.cover);
  const name = item.displayName || item.name || item.hostName || 'Creator';
  return (
    <PressScale onPress={onPress} style={styles.railCard} scaleTo={0.97}>
      {pic ? <SoftImage uri={pic} style={styles.railImg} /> : <LinearGradient colors={['#F5D76E', '#C9A227']} style={styles.railImg} />}
      <LinearGradient colors={['transparent', 'rgba(60,40,8,0.75)']} style={styles.railShade} />
      {live ? (
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveT}>LIVE</Text>
        </View>
      ) : null}
      {item.rank && item.rank <= 3 ? (
        <View style={[styles.rankPill, item.rank === 1 && styles.rank1]}>
          <Text style={styles.rankT}>#{item.rank}</Text>
        </View>
      ) : null}
      <Text style={styles.railName} numberOfLines={1}>{name}</Text>
    </PressScale>
  );
}

export default function SquareScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user } = useAuth();
  const [feed, setFeed] = useState('for_you');
  const [posts, setPosts] = useState([]);
  const [rails, setRails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const scope = feed === 'latest' ? 'latest' : feed === 'following' ? 'following' : 'for_you';
      const needAuth = feed === 'following' && Boolean(user);
      const [postsRes, railsRes] = await Promise.all([
        api.get('/social/posts', { scope, limit: 40, mediaType: 'image' }, { auth: needAuth }).catch(() =>
          api.get('/social/posts', { limit: 40, mediaType: 'image' }, { auth: needAuth })
        ),
        api.get('/social/discover/rails', { limit: 10 }, { auth: false }).catch(() => ({})),
      ]);
      /* Moments = pictures only; videos live on the Video tab */
      const mapped = api.extractList(postsRes).map(mapFeedPost).filter((p) => !p.isVideo);
      setPosts(mapped);
      const data = api.unwrap(railsRes) || {};
      const sections = Array.isArray(data.sections) ? data.sections : [];
      setRails(
        sections
          .map((s) => ({
            id: s.id || s.key,
            title: s.title || s.label || s.id,
            items: (s.items || s.creators || []).map((it, i) => ({
              ...it,
              rank: it.rank || i + 1,
              userId: it.userId || it.id || it.hostId,
              displayName: it.displayName || it.name || it.hostName,
              profilePic: it.profilePic || it.profile_pic || it.thumb,
              isLive: Boolean(it.isLive || it.live || it.channel),
              channel: it.channel || it.liveChannel,
              isParty: Boolean(it.isParty || it.room_type === 'party'),
            })),
          }))
          .filter((s) => s.items.length)
      );
    } catch (e) {
      setError(e.message || 'Could not load Square');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [api, feed, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chooseFeed = (id) => {
    if (id === feed) return;
    setFeed(id);
    setPosts([]);
    setLoading(true);
  };

  const openPost = (item) => {
    openReelViewer(navigation, {
      userId: item.authorId,
      startId: item.id,
      mediaType: 'image',
    });
  };

  const header = useMemo(
    () => (
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
          {FEEDS.map((f) => {
            const on = feed === f.id;
            return (
              <Pressable key={f.id} onPress={() => chooseFeed(f.id)} style={[styles.scopeBtn, on && styles.scopeOn]}>
                <Text style={[styles.scopeT, on && styles.scopeTOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {rails.map((section) => (
          <FadeIn key={section.id} style={styles.railBlock} from={10}>
            <View style={styles.railHead}>
              <Text style={styles.railTitle}>{section.title}</Text>
              {section.id === 'trending' ? (
                <Pressable onPress={() => navigation.navigate('Rankings')}>
                  <Text style={styles.railMore}>More</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railScroll}>
              {section.items.slice(0, 12).map((item, i) => (
                <RailCard
                  key={`${section.id}-${item.userId || i}`}
                  item={item}
                  live={item.isLive}
                  onPress={() => {
                    if (item.isLive && item.channel) {
                      navigation.navigate(item.isParty ? 'PartyRoom' : 'LiveRoom', {
                        channel: item.channel,
                        hostId: item.userId,
                        hostName: item.displayName,
                        hostProfilePic: item.profilePic,
                        isParty: item.isParty,
                      });
                    } else if (item.userId) {
                      navigation.navigate('CreatorProfile', { userId: String(item.userId), name: item.displayName });
                    }
                  }}
                />
              ))}
            </ScrollView>
          </FadeIn>
        ))}

        <Text style={styles.feedTitle}>Moments</Text>
      </View>
    ),
    [feed, navigation, rails]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#FFF9EB', '#FFF3D6', '#FFEFC8']} style={StyleSheet.absoluteFill} />
      <View style={styles.top}>
        <Text style={styles.brand}>Square</Text>
        <View style={styles.topActions}>
          <Pressable onPress={() => navigation.navigate('Search')} style={styles.iconBtn}>
            <Ionicons name="search" size={20} color="#6B4F10" />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CreatePost')} style={styles.iconBtn}>
            <Ionicons name="camera" size={20} color="#6B4F10" />
          </Pressable>
        </View>
      </View>

      <ErrorBanner message={error} onRetry={load} />
      {loading && !posts.length ? (
        <Loading />
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(item, i) => String(item.id || i)}
          numColumns={2}
          columnWrapperStyle={styles.cols}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 10 }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#C9A227" />}
          ListEmptyComponent={<EmptyState title="Square is quiet" subtitle="Be first — share a photo." />}
          renderItem={({ item }) => {
            const url = postThumb(item);
            return (
              <PressScale onPress={() => openPost(item)} style={styles.card} scaleTo={0.98}>
                <View style={styles.cardMedia}>
                  {url ? (
                    <SoftImage uri={url} style={styles.cardImg} />
                  ) : (
                    <View style={styles.cardBlank}>
                      <Text style={styles.cardCap} numberOfLines={4}>{item.caption || 'Post'}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardMeta}>
                  <Avatar uri={mediaUrl(item.authorPic)} name={item.authorName} size={22} />
                  <Text style={styles.cardAuthor} numberOfLines={1}>{item.authorName || 'Creator'}</Text>
                </View>
              </PressScale>
            );
          }}
        />
      )}

      <Pressable onPress={() => navigation.navigate('CreatePost')} style={styles.fab}>
        <LinearGradient colors={['#F0C14B', '#C9A227']} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#3D2A08" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF6E4' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  brand: { flex: 1, fontSize: 26, fontWeight: '900', color: '#6B4F10', letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,253,248,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.22)',
  },
  scopeRow: { paddingHorizontal: 10, gap: 8, paddingVertical: 8 },
  scopeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,253,248,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.2)',
  },
  scopeOn: {
    backgroundColor: '#F0C14B',
    borderColor: '#C9A227',
  },
  scopeT: { color: '#8B6D3B', fontWeight: '700', fontSize: 13 },
  scopeTOn: { color: '#3D2A08', fontWeight: '800' },
  railBlock: { marginTop: 6, marginBottom: 4 },
  railHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8 },
  railTitle: { color: '#6B4F10', fontWeight: '800', fontSize: 16 },
  railMore: { color: '#C9A227', fontWeight: '700', fontSize: 12 },
  railScroll: { paddingHorizontal: 12, gap: 10 },
  railCard: {
    width: 108,
    height: 138,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF8E8',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  railImg: { ...StyleSheet.absoluteFillObject },
  railShade: { ...StyleSheet.absoluteFillObject },
  railName: { position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff', fontWeight: '800', fontSize: 12 },
  livePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E11D48',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveT: { color: '#fff', fontWeight: '900', fontSize: 9 },
  rankPill: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  rank1: { backgroundColor: '#C9A227' },
  rankT: { color: '#fff', fontWeight: '900', fontSize: 10 },
  feedTitle: { marginTop: 14, marginBottom: 8, marginHorizontal: 14, color: '#6B4F10', fontWeight: '800', fontSize: 16 },
  cols: { justifyContent: 'space-between' },
  card: { width: COL, marginBottom: 12 },
  cardMedia: {
    width: COL,
    height: COL * 1.25,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF8E8',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.2)',
  },
  cardImg: { width: '100%', height: '100%' },
  cardBlank: { flex: 1, padding: 12, justifyContent: 'center' },
  cardCap: { color: '#8B6D3B', fontWeight: '600', fontSize: 12, lineHeight: 17 },
  vidBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 2 },
  cardAuthor: { flex: 1, color: '#5D4037', fontWeight: '700', fontSize: 12 },
  fab: { position: 'absolute', right: 16, bottom: 24 },
  fabGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C9A227',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
