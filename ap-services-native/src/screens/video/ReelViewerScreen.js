import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import ContainMedia from '../../components/ContainMedia';
import ReelGestures from '../../components/ReelGestures';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst from '../../components/GiftBurst';
import CommentSheet from '../../components/CommentSheet';
import { resolveGiftAnim } from '../../config/giftAnims';
import { mapFeedPost } from '../../components/PostGrid';
import LikerLine, { canDeletePost, mapLiker } from '../../components/LikerLine';
import { listCacheGet, listCacheSet, prefetchReelPosts } from '../../lib/perf';
import { shouldRefresh } from '../../lib/queryCache';
import { newClientRequestId } from '../../lib/clientRequestId';
import { openCreatorProfile } from '../../lib/navStack';

const { height: H, width: W } = Dimensions.get('window');

/**
 * Instagram-style reel player (modal). Opens from profile / Square without
 * switching the bottom Video tab.
 */
export default function ReelViewerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { api, user } = useAuth();
  const params = route?.params || {};
  const filterUserId = params.userId || null;
  const mediaFilter = params.mediaType || 'video';
  const startId = params.startId ? String(params.startId) : null;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [sessionKey, setSessionKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [holdPause, setHoldPause] = useState(false);
  const [followingIds, setFollowingIds] = useState({});
  const [commentsPost, setCommentsPost] = useState(null);
  const [giftPost, setGiftPost] = useState(null);
  const [giftSending, setGiftSending] = useState(false);
  const giftLock = useRef(false);
  const [gifts, setGifts] = useState([]);
  const [balance, setBalance] = useState(0);
  const [burst, setBurst] = useState(null);
  const [likersPost, setLikersPost] = useState(null);
  const [likers, setLikers] = useState([]);
  const players = useRef(new Map());
  const listRef = useRef(null);
  const pendingStart = useRef(startId);
  const focusedRef = useRef(true);
  const lastFetch = useRef(0);

  const pauseAll = useCallback(async () => {
    const jobs = [];
    players.current.forEach((player) => {
      jobs.push(
        player.pauseAsync?.().catch(() => {}),
        player.setStatusAsync?.({ shouldPlay: false, isMuted: true, volume: 0 }).catch(() => {})
      );
    });
    await Promise.all(jobs);
  }, []);

  const stopAll = useCallback(async () => {
    const jobs = [];
    players.current.forEach((player) => {
      jobs.push(
        player.pauseAsync?.().catch(() => {}),
        player.setStatusAsync?.({ shouldPlay: false, isMuted: true, volume: 0 }).catch(() => {}),
        player.unloadAsync?.().catch(() => {})
      );
    });
    await Promise.all(jobs);
    players.current.clear();
  }, []);

  const load = useCallback(async (opts = {}) => {
    setError('');
    const cacheKey = `reel|${filterUserId || ''}|${mediaFilter}`;
    const cached = listCacheGet(cacheKey, 120000);
    if (cached?.length) {
      setPosts(cached);
      setLoading(false);
      const want = startId;
      const idx = want ? cached.findIndex((p) => String(p.id) === want) : 0;
      setActive(idx >= 0 ? idx : 0);
      prefetchReelPosts(cached, idx >= 0 ? idx : 0, 2);
    } else if (!opts.silent) {
      setLoading(true);
    }
    try {
      const query = { limit: filterUserId ? 100 : 40 };
      if (filterUserId) query.userId = filterUserId;
      if (mediaFilter && mediaFilter !== 'all') query.mediaType = mediaFilter;
      const res = await api.get('/social/posts', query, { auth: Boolean(user), cacheTtlMs: 30000 });
      let list = api.extractList(res).map(mapFeedPost);
      if (mediaFilter === 'video') list = list.filter((p) => p.isVideo);
      else if (mediaFilter === 'image' || mediaFilter === 'posts') list = list.filter((p) => !p.isVideo);
      listCacheSet(cacheKey, list);
      setPosts(list);
      const want = startId;
      const idx = want ? list.findIndex((p) => String(p.id) === want) : 0;
      setActive(idx >= 0 ? idx : 0);
      pendingStart.current = want;
      prefetchReelPosts(list, idx >= 0 ? idx : 0, 2);
      lastFetch.current = Date.now();
    } catch (e) {
      if (!cached?.length) setError(e.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [api, filterUserId, mediaFilter, startId, user]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setAppActive(AppState.currentState === 'active');
      setSessionKey((k) => k + 1);
      try {
        const LiveAudioRoute = require('../../lib/liveAudioRoute').default;
        LiveAudioRoute.leaveLive?.('reel_viewer');
      } catch (_e) {}
      if (!shouldRefresh(lastFetch, 25000)) {
        const cacheKey = `reel|${filterUserId || ''}|${mediaFilter}`;
        const cached = listCacheGet(cacheKey, 120000);
        if (cached?.length) {
          setPosts(cached);
          setLoading(false);
        }
      } else {
        load({ silent: Boolean(listCacheGet(`reel|${filterUserId || ''}|${mediaFilter}`, 120000)?.length) });
      }
      return () => {
        focusedRef.current = false;
        stopAll();
      };
    }, [filterUserId, load, mediaFilter, stopAll])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setAppActive(true);
        if (focusedRef.current) setSessionKey((k) => k + 1);
        return;
      }
      setAppActive(false);
      pauseAll();
    });
    return () => sub.remove();
  }, [pauseAll]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (commentsPost) {
        setCommentsPost(null);
        return true;
      }
      if (likersPost) {
        setLikersPost(null);
        return true;
      }
      if (giftPost) {
        setGiftPost(null);
        return true;
      }
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation, commentsPost, giftPost, likersPost]);

  useEffect(() => {
    if (loading || !posts.length || !pendingStart.current) return undefined;
    const id = pendingStart.current;
    const idx = posts.findIndex((p) => String(p.id) === id);
    pendingStart.current = null;
    if (idx < 0) return undefined;
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch (_e) {}
    }, 40);
    return () => clearTimeout(t);
  }, [loading, posts]);

  useEffect(() => {
    if (posts.length) prefetchReelPosts(posts, active, 2);
  }, [active, posts]);

  const like = async (post) => {
    try {
      await api.post(`/social/posts/${post.id}/like`);
      const me = mapLiker({
        userId: user?.id,
        displayName: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || 'You',
        profilePic: user?.profile_pic || user?.profilePic,
        displayId: user?.display_id,
      });
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== post.id) return p;
          const liked = !p.liked;
          const likes = Math.max(0, p.likes + (liked ? 1 : -1));
          const rest = (p.likers || []).filter((l) => String(l.userId) !== me.userId);
          return { ...p, liked, likes, likers: liked && me.userId ? [me, ...rest] : rest };
        })
      );
    } catch (_e) {}
  };

  const doubleLike = (post) => {
    if (post.liked) return;
    like(post);
  };

  const follow = async (post) => {
    if (!post.authorId || !user) return;
    try {
      await api.post(`/social/follow/${post.authorId}`);
      setFollowingIds((prev) => ({ ...prev, [post.authorId]: true }));
      setPosts((prev) => prev.map((p) => (p.authorId === post.authorId ? { ...p, following: true } : p)));
    } catch (_e) {}
  };

  const openComments = (post) => {
    setCommentsPost(post);
  };

  const sendGift = async (gift, qty, opts = {}) => {
    if (!giftPost || giftLock.current) return;
    giftLock.current = true;
    setGiftSending(true);
    try {
      const cost = Number(gift.coin_cost || gift.cost || 0) * qty;
      const anim = resolveGiftAnim(gift);
      const clientRequestId = opts.clientRequestId || newClientRequestId('gift');
      await api.post('/wallet/gifts', {
        receiverId: giftPost.authorId,
        giftType: gift.slug || gift.name || 'gift',
        coinAmount: cost,
        qty,
        clientRequestId,
        client_request_id: clientRequestId,
      });
      setBurst({
        ...gift,
        from: user?.first_name || 'You',
        qty,
        name: gift.name || anim.title,
        animToken: anim.token,
        animTitle: anim.title,
      });
      setGiftPost(null);
    } catch (e) {
      setError(e.message || 'Gift failed');
    } finally {
      giftLock.current = false;
      setGiftSending(false);
    }
  };

  const openLikers = async (post) => {
    const preview = (post.likers || []).map(mapLiker).filter((u) => u.userId);
    setLikersPost(post);
    setLikers(preview);
    try {
      const res = await api.get(`/social/posts/${post.id}/likes`, null, { auth: false });
      const mapped = api.extractList(res).map(mapLiker).filter((u) => u.userId);
      if (mapped.length) {
        setLikers(mapped);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, likers: mapped, likes: Math.max(p.likes, mapped.length) } : p
          )
        );
      }
    } catch (_e) {}
  };

  const removePost = (post) => {
    if (!canDeletePost(user, post)) return;
    Alert.alert('Delete post', 'Remove this post for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/social/posts/${post.id}`);
            setPosts((prev) => {
              const next = prev.filter((p) => p.id !== post.id);
              if (!next.length) {
                setTimeout(() => navigation.goBack(), 50);
                return next;
              }
              setActive((a) => Math.min(a, Math.max(0, next.length - 1)));
              return next;
            });
          } catch (e) {
            Alert.alert('Could not delete', e.message || 'Try again');
          }
        },
      },
    ]);
  };

  const openGift = (post) => {
    if (!user) return;
    setGiftPost(post);
    if (!gifts.length) {
      api.get('/social/gifts/catalog', null, { auth: false, cacheTtlMs: 120000 })
        .then((r) => setGifts(api.extractList(r)))
        .catch(() => {});
    }
    api.get('/wallet/balance', null, { cacheTtlMs: 20000 })
      .then((r) => {
        const d = api.unwrap(r);
        setBalance(Number(d.giftable_coins || d.coin_balance || d.coins || 0));
      })
      .catch(() => {});
  };

  const close = () => {
    stopAll();
    navigation.goBack();
  };

  const renderItem = ({ item, index }) => {
    const near = Math.abs(index - active) <= 1;
    const playing = appActive && index === active;
    const showVideo = Boolean(item.mediaUrl && item.isVideo && near && appActive);
    return (
      <View style={[styles.page, { height: H, width: W }]}>
        {showVideo ? (
          <ContainMedia
            uri={item.mediaUrl}
            isVideo
            playing={playing}
            muted={muted}
            paused={holdPause && playing}
            poster={item.thumb}
            itemId={item.id}
            players={players}
            sessionKey={sessionKey}
          />
        ) : item.mediaUrl ? (
          <ContainMedia uri={item.thumb || item.mediaUrl} isVideo={false} poster={item.thumb} />
        ) : (
          <View style={styles.blank} />
        )}

        <ReelGestures
          enabled={playing && !commentsPost && !giftPost && !likersPost}
          onSingleTap={() => setMuted((m) => !m)}
          onDoubleTap={() => doubleLike(item)}
          onHoldStart={() => setHoldPause(true)}
          onHoldEnd={() => setHoldPause(false)}
        />

        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable onPress={close} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          {muted ? (
            <View style={styles.mutePill}>
              <Ionicons name="volume-mute" size={16} color="#fff" />
            </View>
          ) : null}
        </View>

        <View style={[styles.overlay, { paddingBottom: 28 + insets.bottom }]} pointerEvents="box-none">
          <Pressable onPress={() => openCreatorProfile(navigation, { userId: item.authorId, name: item.authorName })}>
            <Text style={styles.author} numberOfLines={1}>
              @{item.authorName || 'Creator'}
            </Text>
          </Pressable>
          {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}
          <LikerLine post={item} onPress={() => openLikers(item)} />
        </View>

        <View style={[styles.actions, { bottom: 96 + insets.bottom }]} pointerEvents="box-none">
          {item.authorId ? (
            <View style={styles.followAvWrap}>
              <Pressable onPress={() => openCreatorProfile(navigation, { userId: item.authorId, name: item.authorName })}>
                <Avatar uri={item.authorPic} name={item.authorName} size={46} style={styles.followAv} />
              </Pressable>
              {item.authorId !== String(user?.id) ? (
                <Pressable
                  onPress={() => follow(item)}
                  hitSlop={8}
                  style={[styles.followPlus, (followingIds[item.authorId] || item.following) && styles.followPlusOn]}
                >
                  <Ionicons
                    name={(followingIds[item.authorId] || item.following) ? 'checkmark' : 'add'}
                    size={14}
                    color="#fff"
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <Pressable onPress={() => like(item)} onLongPress={() => openLikers(item)} style={styles.act}>
            <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={32} color={item.liked ? '#FF2D55' : '#fff'} />
            <Pressable onPress={() => openLikers(item)}>
              <Text style={styles.actN}>{item.likes}</Text>
            </Pressable>
          </Pressable>
          <Pressable onPress={() => openComments(item)} style={styles.act}>
            <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
            <Text style={styles.actN}>{item.comments}</Text>
          </Pressable>
          <Pressable onPress={() => openGift(item)} style={styles.act}>
            <Ionicons name="gift" size={28} color="#F5D76E" />
            <Text style={styles.actN}>Gift</Text>
          </Pressable>
          <Pressable
            onPress={() => Share.share({ message: `Watch ${item.authorName} on AP Live Service` })}
            style={styles.act}
          >
            <Ionicons name="share-social" size={26} color="#fff" />
            <Text style={styles.actN}>Share</Text>
          </Pressable>
          {canDeletePost(user, item) ? (
            <Pressable onPress={() => removePost(item)} style={styles.act}>
              <Ionicons name="trash-outline" size={26} color="#FF6B6B" />
              <Text style={styles.actN}>Delete</Text>
            </Pressable>
          ) : null}
        </View>

        {holdPause && playing ? (
          <View style={styles.pauseHint} pointerEvents="none">
            <Ionicons name="pause" size={42} color="#fff" />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ErrorBanner message={error} onRetry={load} />
      {loading && !posts.length ? (
        <Loading label="Loading…" />
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={H}
          decelerationRate="fast"
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({ length: H, offset: H * index, index })}
          initialScrollIndex={
            posts.length && startId
              ? Math.max(0, posts.findIndex((p) => String(p.id) === startId))
              : undefined
          }
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToOffset({ offset: info.index * H, animated: false });
            }, 80);
          }}
          onMomentumScrollEnd={(e) => {
            setHoldPause(false);
            setActive(Math.round(e.nativeEvent.contentOffset.y / H));
          }}
          ListEmptyComponent={<EmptyState title="Nothing here" subtitle="Try another post." />}
          renderItem={renderItem}
          extraData={active}
        />
      )}

      <GiftSheet
        visible={!!giftPost}
        gifts={gifts}
        balance={balance}
        sending={giftSending}
        onClose={() => setGiftPost(null)}
        onSend={sendGift}
        onRecharge={() => {
          setGiftPost(null);
          navigation.navigate('Recharge');
        }}
      />
      <GiftBurst gift={burst} onDone={() => setBurst(null)} />
      <CommentSheet
        visible={!!commentsPost}
        post={commentsPost}
        api={api}
        user={user}
        navigation={navigation}
        onClose={() => setCommentsPost(null)}
        onCountChange={(delta) => {
          if (!commentsPost?.id) return;
          setPosts((prev) =>
            prev.map((p) => (p.id === commentsPost.id ? { ...p, comments: Math.max(0, (p.comments || 0) + delta) } : p))
          );
        }}
      />

      <Modal visible={!!likersPost} transparent animationType="slide" onRequestClose={() => setLikersPost(null)}>
        <Pressable style={styles.sheetBg} onPress={() => setLikersPost(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]} onPress={() => {}}>
            <Text style={styles.sheetH}>Liked by</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {likers.map((u, i) => (
                <Pressable
                  key={u.userId || i}
                  style={styles.personRow}
                  onPress={() => {
                    setLikersPost(null);
                    if (u.userId) openCreatorProfile(navigation, { userId: u.userId, name: u.displayName });
                  }}
                >
                  <Avatar uri={u.profilePic} name={u.displayName} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetN}>{u.displayName}</Text>
                    {u.displayId ? <Text style={styles.sheetB}>ID {u.displayId}</Text> : null}
                  </View>
                </Pressable>
              ))}
              {!likers.length ? <Text style={styles.sheetB}>No likes yet. Tap the heart on this post.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { backgroundColor: '#000' },
  blank: { ...StyleSheet.absoluteFillObject, backgroundColor: '#111' },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutePill: {
    marginRight: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 80,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
  },
  author: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: {
    color: '#fff',
    opacity: 0.95,
    fontSize: 14,
    lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actions: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 14,
    zIndex: 30,
    elevation: 30,
  },
  followAvWrap: { alignItems: 'center', marginBottom: 6 },
  followAv: { borderWidth: 2, borderColor: '#fff' },
  followPlus: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF2D86',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  followPlusOn: { backgroundColor: '#22C55E' },
  act: { alignItems: 'center' },
  actN: { color: '#fff', fontSize: 11, marginTop: 2, fontWeight: '700' },
  pauseHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 15,
  },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '55%' },
  sheetH: { fontWeight: '800', fontSize: 16, marginBottom: 10, color: '#111' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sheetN: { fontWeight: '800', color: '#111' },
  sheetB: { color: '#6B7280', marginTop: 2 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: '#F3F4F6', paddingHorizontal: 14, color: '#111' },
  postBtn: { color: '#FF8C00', fontWeight: '800' },
});
