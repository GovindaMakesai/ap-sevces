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
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst from '../../components/GiftBurst';
import CommentSheet from '../../components/CommentSheet';
import { resolveGiftAnim } from '../../config/giftAnims';
import VideoReelItem from '../../components/VideoReelItem';
import { mapFeedPost } from '../../components/PostGrid';
import LikerLine, { canDeletePost, mapLiker } from '../../components/LikerLine';
import { listCacheGet, listCacheSet, prefetchReelPosts } from '../../lib/perf';
import { newClientRequestId } from '../../lib/clientRequestId';
import { openCreatorProfile } from '../../lib/navStack';

const { height } = Dimensions.get('window');
const SCOPES = [
  { id: 'for_you', label: 'For You' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
  { id: 'mine', label: 'Mine' },
];

export default function VideoScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tabRoute = useRoute();
  const params = route?.params || tabRoute?.params || {};
  const { api, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [giftPost, setGiftPost] = useState(null);
  const [giftSending, setGiftSending] = useState(false);
  const giftLock = useRef(false);
  const [burst, setBurst] = useState(null);
  const [balance, setBalance] = useState(0);
  const [scope, setScope] = useState('for_you');
  const [active, setActive] = useState(0);
  const [navFocused, setNavFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [sessionKey, setSessionKey] = useState(0);
  const [fullMode, setFullMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [holdPause, setHoldPause] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [likersPost, setLikersPost] = useState(null);
  const [likers, setLikers] = useState([]);
  const [followingIds, setFollowingIds] = useState({});
  const players = useRef(new Map());
  const listRef = useRef(null);
  const pendingStart = useRef(null);
  const navFocusedRef = useRef(true);
  /* Scope owns the filter — never keep a stale profile userId on For You / Latest / Following */
  const filterUserId =
    scope === 'mine'
      ? String(params.userId || user?.id || '')
      : null;
  const mediaFilter = params.mediaType || 'video';
  /** Only true when opened as a viewer from Square/profile — back should leave Video. */
  const returnOnExit = useRef(false);
  const fullModeRef = useRef(false);
  const handledStartId = useRef(null);
  const loadKeyRef = useRef('');
  const isFocused = navFocused && appActive;

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
    const cacheKey = `${scope}|${filterUserId || ''}|${mediaFilter}`;
    const cached = listCacheGet(cacheKey, 120000);
    if (cached?.length && !opts.force) {
      setPosts(cached);
      setLoading(false);
    } else if (!cached?.length) {
      setLoading(true);
    }
    try {
      const query = { limit: scope === 'mine' || filterUserId ? 100 : 40 };
      if (filterUserId) {
        query.userId = filterUserId;
        if (mediaFilter && mediaFilter !== 'all') query.mediaType = mediaFilter;
      } else if (scope && scope !== 'mine') {
        query.scope = scope;
        if (mediaFilter === 'video' || mediaFilter === 'image') query.mediaType = mediaFilter;
      }
      const res = await api.get('/social/posts', query, { auth: Boolean(user), cacheTtlMs: 30000 });
      let list = api.extractList(res).map(mapFeedPost);
      if (mediaFilter === 'video') list = list.filter((p) => p.isVideo);
      else if (mediaFilter === 'image' || mediaFilter === 'posts') list = list.filter((p) => !p.isVideo);
      listCacheSet(cacheKey, list);
      setPosts(list);
      const want = params.startId ? String(params.startId) : null;
      const idx = want ? list.findIndex((p) => String(p.id) === want) : 0;
      setActive(idx >= 0 ? idx : 0);
      pendingStart.current = want;
      prefetchReelPosts(list, idx >= 0 ? idx : 0, 2);
    } catch (e) {
      if (!cached?.length) setError(e.message || 'Could not load feed');
    } finally {
      setLoading(false);
    }
  }, [api, filterUserId, mediaFilter, scope, params.startId, user]);

  useFocusEffect(
    useCallback(() => {
      navFocusedRef.current = true;
      setNavFocused(true);
      setAppActive(AppState.currentState === 'active');
      setSessionKey((k) => k + 1);
      try {
        const LiveAudioRoute = require('../../lib/liveAudioRoute').default;
        LiveAudioRoute.leaveLive?.('video_tab');
      } catch (_e) {}
      const sid = params.startId ? String(params.startId) : null;
      if (sid && handledStartId.current !== sid) {
        handledStartId.current = sid;
        returnOnExit.current = true;
        fullModeRef.current = true;
        setFullMode(true);
      }
      if (params.userId && scope !== 'mine') setScope('mine');
      const key = `${scope}|${filterUserId || ''}|${mediaFilter}`;
      const now = Date.now();
      const sameKey = loadKeyRef.current === key;
      const fresh = sameKey && now - (VideoScreen._lastLoad || 0) < 25000;
      if (!fresh) {
        loadKeyRef.current = key;
        VideoScreen._lastLoad = now;
        load();
      }
      return () => {
        navFocusedRef.current = false;
        setNavFocused(false);
        fullModeRef.current = false;
        setFullMode(false);
        stopAll();
      };
    }, [load, stopAll, params.userId, params.startId, scope, filterUserId, mediaFilter])
  );

  const exitFullMode = useCallback(() => {
    const shouldReturn = returnOnExit.current;
    returnOnExit.current = false;
    fullModeRef.current = false;
    setFullMode(false);
    setHoldPause(false);
    handledStartId.current = null;
    navigation.setParams?.({
      startId: undefined,
      userId: shouldReturn ? undefined : params.userId,
      mediaType: 'video',
    });
    if (!shouldReturn) return;
    if (navigation.canGoBack?.()) navigation.goBack();
  }, [navigation, params.userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setAppActive(true);
        if (navFocusedRef.current) {
          setSessionKey((k) => k + 1);
          try {
            const LiveAudioRoute = require('../../lib/liveAudioRoute').default;
            LiveAudioRoute.leaveLive?.('video_foreground');
          } catch (_e) {}
        }
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
      if (fullModeRef.current) {
        exitFullMode();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [commentsPost, likersPost, giftPost, exitFullMode]);

  useEffect(() => {
    const unsub = navigation.addListener?.('beforeRemove', (e) => {
      if (!fullModeRef.current) return;
      /* Immersive from Video feed: block leave, just exit fullscreen. Viewer return uses goBack after clearing flag. */
      if (!returnOnExit.current) {
        e.preventDefault();
        exitFullMode();
      }
    });
    return unsub;
  }, [navigation, exitFullMode]);

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

  const follow = async (post) => {
    if (!post?.authorId || post.authorId === String(user?.id)) return;
    try {
      const on = followingIds[post.authorId] || post.following;
      if (on) await api.delete(`/social/follow/${post.authorId}`);
      else await api.post(`/social/follow/${post.authorId}`);
      setFollowingIds((s) => ({ ...s, [post.authorId]: !on }));
      setPosts((prev) => prev.map((p) => (p.authorId === post.authorId ? { ...p, following: !on } : p)));
    } catch (_e) {}
  };

  const openComments = (post) => {
    setCommentsPost(post);
  };

  const openLikers = async (post) => {
    const preview = (post.likers || []).map(mapLiker).filter((u) => u.userId);
    setLikersPost(post);
    setLikers(preview);
    try {
      const res = await api.get(`/social/posts/${post.id}/likes`, null, { auth: false }).catch(() =>
        api.get(`/social/posts/${post.id}/likers`, null, { auth: false })
      );
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

  const openFull = (item, index) => {
    if (index != null) setActive(index);
    /* Fullscreen from this feed — back only removes immersive UI, stay on Video. */
    returnOnExit.current = false;
    handledStartId.current = null;
    if (params.startId) navigation.setParams?.({ startId: undefined });
    fullModeRef.current = true;
    setFullMode(true);
  };

  const [viewportH, setViewportH] = useState(0);
  const pageH = Math.max(320, viewportH || (fullMode ? height : Math.max(420, height - 120 - insets.top)));

  useEffect(() => {
    navigation.setOptions?.({
      tabBarStyle: fullMode ? { display: 'none', height: 0 } : undefined,
      tabBarVisible: !fullMode,
    });
    return () => {
      navigation.setOptions?.({ tabBarStyle: undefined, tabBarVisible: true });
    };
  }, [fullMode, navigation]);

  useEffect(() => {
    if (loading || !posts.length) return;
    const id = pendingStart.current;
    if (!id) return;
    const idx = posts.findIndex((p) => String(p.id) === id);
    if (idx < 0) {
      pendingStart.current = null;
      return;
    }
    pendingStart.current = null;
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch (_e) {}
    }, 50);
    return () => clearTimeout(t);
  }, [loading, posts, pageH]);

  const chooseScope = (id) => {
    setScope(id);
    const nextFilterUserId = id === 'mine' ? String(params.userId || user?.id || '') : null;
    const cacheKey = `${id}|${nextFilterUserId || ''}|${mediaFilter}`;
    const cached = listCacheGet(cacheKey, 120000);
    if (cached?.length) {
      setPosts(cached);
      setActive(0);
      setLoading(false);
    } else {
      setPosts([]);
      setActive(0);
      setLoading(true);
    }
    loadKeyRef.current = '';
    VideoScreen._lastLoad = 0;
    if (id === 'mine' && user?.id) {
      navigation.setParams?.({ userId: String(user.id), startId: undefined, mediaType: 'video' });
    } else {
      navigation.setParams?.({ userId: undefined, startId: undefined, mediaType: 'video' });
    }
  };

  const scopeBoot = useRef(true);
  useEffect(() => {
    if (scopeBoot.current) {
      scopeBoot.current = false;
      return;
    }
    load({ force: false });
  }, [scope, load]);

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

  const doubleLike = (post) => {
    if (post.liked) return;
    like(post);
  };

  useEffect(() => {
    if (posts.length) prefetchReelPosts(posts, active, 2);
  }, [active, posts]);

  const onOpenProfile = useCallback(
    (authorId, authorName) => openCreatorProfile(navigation, { userId: authorId, name: authorName }),
    [navigation]
  );
  const onToggleMute = useCallback(() => setMuted((m) => !m), []);
  const onHoldStart = useCallback(() => setHoldPause(true), []);
  const onHoldEnd = useCallback(() => setHoldPause(false), []);
  const onOpenGift = useCallback(
    (item) => {
      if (!user) return;
      setGiftPost(item);
      if (!gifts.length) {
        api.get('/social/gifts/catalog', null, { auth: false, cacheTtlMs: 120000 }).then((r) => setGifts(api.extractList(r))).catch(() => {});
      }
      api.get('/wallet/balance', null, { cacheTtlMs: 20000 }).then((r) => {
        const d = api.unwrap(r);
        setBalance(Number(d.giftable_coins || d.coin_balance || d.coins || 0));
      }).catch(() => {});
    },
    [api, gifts.length, user]
  );
  const onShareItem = useCallback(
    (item) => Share.share({ message: `Watch ${item.authorName} on AP Live Service` }),
    []
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <VideoReelItem
        item={item}
        index={index}
        pageH={pageH}
        active={active}
        isFocused={isFocused}
        fullMode={fullMode}
        muted={muted}
        holdPause={holdPause}
        sessionKey={sessionKey}
        players={players}
        following={followingIds[item.authorId]}
        insetsBottom={insets.bottom}
        insetsTop={insets.top}
        userId={user?.id}
        onOpenFull={openFull}
        onToggleMute={onToggleMute}
        onHoldStart={onHoldStart}
        onHoldEnd={onHoldEnd}
        onDoubleLike={doubleLike}
        onLike={like}
        onOpenComments={openComments}
        onOpenLikers={openLikers}
        onOpenGift={onOpenGift}
        onFollow={follow}
        onProfile={onOpenProfile}
        onShare={onShareItem}
        onDelete={removePost}
        canDelete={canDeletePost(user, item)}
      />
    ),
    [
      active,
      doubleLike,
      follow,
      fullMode,
      holdPause,
      insets.bottom,
      insets.top,
      isFocused,
      like,
      muted,
      onHoldEnd,
      onHoldStart,
      onOpenGift,
      onOpenProfile,
      onShareItem,
      onToggleMute,
      openComments,
      openFull,
      openLikers,
      pageH,
      removePost,
      sessionKey,
      user,
      followingIds,
    ]
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {fullMode ? (
        <Pressable
          onPress={exitFullMode}
          hitSlop={12}
          style={[styles.fsBack, { top: insets.top + 8 }]}
          accessibilityLabel="Exit fullscreen"
        >
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
      ) : (
      <View style={[styles.top, { paddingTop: insets.top }]}>
        <View style={styles.mainTabs}>
          <Pressable onPress={() => navigation.navigate('Explore')}>
            <Text style={styles.mainTab}>Following</Text>
          </Pressable>
          <View>
            <Text style={[styles.mainTab, styles.mainTabOn]}>Video</Text>
            <View style={styles.goldBar} />
          </View>
          <Pressable onPress={() => navigation.navigate('Square')}>
            <Text style={styles.mainTab}>Square</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CreatePost')} style={styles.camBtn}>
            <Ionicons name="cloud-upload-outline" size={18} color="#5D4037" />
          </Pressable>
        </View>
        <View style={styles.scopeRow}>
          {SCOPES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => chooseScope(s.id)}
              hitSlop={8}
              style={[styles.scopeChip, scope === s.id && styles.scopeChipOn]}
            >
              <Text style={[styles.scope, scope === s.id && styles.scopeOn]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      )}
      <ErrorBanner message={error} onRetry={load} />
      {loading && !posts.length ? (
        <Loading label={mediaFilter === 'image' ? 'Loading posts…' : 'Loading videos…'} />
      ) : (
        <View style={{ flex: 1 }} onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== viewportH) setViewportH(h);
        }}
        >
        <FlatList
          key={`feed-${filterUserId || scope}-${mediaFilter}-${fullMode ? 'fs' : 'tab'}`}
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageH}
          decelerationRate="fast"
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
          initialScrollIndex={
            posts.length
              ? Math.max(0, posts.findIndex((p) => params.startId && String(p.id) === String(params.startId)))
              : undefined
          }
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToOffset({ offset: info.index * pageH, animated: false });
            }, 80);
          }}
          onMomentumScrollEnd={(e) => {
            setHoldPause(false);
            setActive(Math.round(e.nativeEvent.contentOffset.y / pageH));
          }}
          ListEmptyComponent={
            <EmptyState
              title={mediaFilter === 'image' ? 'No posts yet' : 'No videos yet'}
              subtitle={mediaFilter === 'image' ? 'Share a photo to see it here.' : 'Tap upload to share a video.'}
            />
          }
          renderItem={renderItem}
          extraData={active}
        />
        </View>
      )}
      <GiftSheet visible={!!giftPost} gifts={gifts} balance={balance} sending={giftSending} onClose={() => setGiftPost(null)} onSend={sendGift} onRecharge={() => { setGiftPost(null); navigation.navigate('Recharge'); }} />
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
              {likers.map((u, i) => {
                const id = u.userId || u.id || u.user?.id;
                const name = u.displayName
                  || [u.first_name, u.last_name].filter(Boolean).join(' ')
                  || u.name || u.user?.name || 'User';
                const pic = u.profilePic || u.profile_pic || u.user?.profile_pic;
                return (
                  <Pressable key={id || `like-${i}`} style={styles.personRow} onPress={() => id && openCreatorProfile(navigation, { userId: id, name })}>
                    <Avatar uri={pic} name={name} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetN}>{name}</Text>
                      {u.displayId ? <Text style={styles.sheetB}>ID {u.displayId}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {!likers.length ? <Text style={styles.sheetB}>No likes yet. Tap the heart on this video.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { backgroundColor: colors.creamSurface, borderBottomWidth: 1, borderBottomColor: 'rgba(107, 79, 16, 0.08)' },
  mainTabs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6 },
  mainTab: { fontSize: 16, fontWeight: '600', color: '#c4a574', paddingVertical: 10, paddingHorizontal: 8 },
  mainTabOn: { color: colors.textPrimary, fontWeight: '800', fontSize: 17 },
  goldBar: { height: 3, width: 22, backgroundColor: colors.gold500, borderRadius: 3, alignSelf: 'center', marginTop: -4 },
  camBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201, 162, 39, 0.15)', alignItems: 'center', justifyContent: 'center' },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  scopeChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(201,162,39,0.12)',
    justifyContent: 'center',
  },
  scopeChipOn: { backgroundColor: colors.gold500 },
  scope: { color: colors.gold800, fontWeight: '700', fontSize: 13 },
  scopeOn: { color: '#fff', fontWeight: '800' },
  followAvWrap: { alignItems: 'center', marginBottom: 6, zIndex: 12 },
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
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  page: { backgroundColor: '#000' },
  fsBack: {
    position: 'absolute',
    left: 10,
    zIndex: 40,
    elevation: 40,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutePill: {
    position: 'absolute',
    right: 14,
    zIndex: 40,
    elevation: 40,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 20,
    elevation: 20,
  },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 84,
    zIndex: 30,
    elevation: 30,
    paddingVertical: 10,
    paddingHorizontal: 4,
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
    marginBottom: 8,
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
  act: { alignItems: 'center' },
  actIcon: { fontSize: 26, color: '#fff' },
  actN: { color: '#fff', fontSize: 11, marginTop: 2, fontWeight: '700' },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '55%' },
  sheetH: { fontWeight: '800', fontSize: 16, marginBottom: 10, color: '#111' },
  sheetRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  sheetN: { fontWeight: '800', color: '#111' },
  sheetB: { color: '#6B7280', marginTop: 2 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: '#F3F4F6', paddingHorizontal: 14, color: '#111' },
  postBtn: { color: '#FF8C00', fontWeight: '800' },
});
