import React, { memo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './ui';
import ContainMedia from './ContainMedia';
import ReelGestures from './ReelGestures';
import LikerLine from './LikerLine';

/**
 * Memoized reel page — isolates video surface from parent list re-renders.
 */
function VideoReelItem({
  item,
  index,
  pageH,
  active,
  isFocused,
  fullMode,
  muted,
  holdPause,
  sessionKey,
  players,
  following,
  insetsBottom,
  insetsTop,
  userId,
  onOpenFull,
  onToggleMute,
  onHoldStart,
  onHoldEnd,
  onDoubleLike,
  onLike,
  onOpenComments,
  onOpenLikers,
  onOpenGift,
  onFollow,
  onProfile,
  onShare,
  onDelete,
  canDelete,
}) {
  const near = Math.abs(index - active) <= 1;
  const playing = isFocused && index === active;
  const showVideo = Boolean(item.mediaUrl && item.isVideo && near && isFocused);
  const isFollowing = following || item.following;

  return (
    <View style={[styles.page, { height: pageH }]}>
      {showVideo ? (
        <ContainMedia
          uri={item.mediaUrl}
          isVideo
          playing={playing}
          muted={muted}
          paused={holdPause && playing && fullMode}
          poster={item.thumb}
          itemId={item.id}
          players={players}
          sessionKey={sessionKey}
        />
      ) : item.mediaUrl ? (
        <ContainMedia uri={item.thumb || item.mediaUrl} isVideo={false} poster={item.thumb} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      )}
      {fullMode ? (
        <ReelGestures
          enabled={playing}
          onSingleTap={onToggleMute}
          onDoubleTap={() => onDoubleLike(item)}
          onHoldStart={onHoldStart}
          onHoldEnd={onHoldEnd}
        />
      ) : (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onOpenFull(item, index)}
          onLongPress={onToggleMute}
        />
      )}
      <View
        style={[styles.overlay, { bottom: 18 + (fullMode ? Math.max(insetsBottom, 8) : 12) }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={() => onProfile(item.authorId, item.authorName)}>
          <Text style={styles.author} numberOfLines={1}>
            @{item.authorName || 'Creator'}
          </Text>
        </Pressable>
        {item.caption ? <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text> : null}
        <LikerLine post={item} onPress={() => onOpenLikers(item)} />
      </View>
      <View
        style={[styles.actions, { bottom: 72 + (fullMode ? Math.max(insetsBottom, 8) : 20) }]}
        pointerEvents="box-none"
      >
        {item.authorId ? (
          <View style={styles.followAvWrap}>
            <Pressable onPress={() => onProfile(item.authorId, item.authorName)}>
              <Avatar uri={item.authorPic} name={item.authorName} size={46} style={styles.followAv} />
            </Pressable>
            {item.authorId !== String(userId) ? (
              <Pressable
                onPress={() => onFollow(item)}
                hitSlop={8}
                style={[styles.followPlus, isFollowing && styles.followPlusOn]}
              >
                <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={14} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable onPress={() => onLike(item)} onLongPress={() => onOpenLikers(item)} style={styles.act}>
          <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={32} color={item.liked ? '#FF2D55' : '#fff'} />
          <Pressable onPress={() => onOpenLikers(item)}>
            <Text style={styles.actN}>{item.likes}</Text>
          </Pressable>
        </Pressable>
        <Pressable onPress={() => onOpenComments(item)} style={styles.act}>
          <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
          <Text style={styles.actN}>{item.comments}</Text>
        </Pressable>
        <Pressable onPress={() => onOpenGift(item)} style={styles.act}>
          <Ionicons name="gift" size={28} color="#F5D76E" />
          <Text style={styles.actN}>Gift</Text>
        </Pressable>
        <Pressable onPress={() => onShare(item)} style={styles.act}>
          <Ionicons name="share-social" size={26} color="#fff" />
          <Text style={styles.actN}>Share</Text>
        </Pressable>
        {canDelete ? (
          <Pressable onPress={() => onDelete(item)} style={styles.act}>
            <Ionicons name="trash-outline" size={26} color="#FF6B6B" />
            <Text style={styles.actN}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
      {muted ? (
        <View style={[styles.mutePill, { top: insetsTop + 12 }]} pointerEvents="none">
          <Ionicons name="volume-mute" size={16} color="#fff" />
        </View>
      ) : null}
      {fullMode && holdPause && playing ? (
        <View style={styles.pauseHint} pointerEvents="none">
          <Ionicons name="pause" size={42} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

function propsEqual(prev, next) {
  if (prev.index !== next.index) return false;
  if (prev.pageH !== next.pageH) return false;
  if (prev.active !== next.active) return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.fullMode !== next.fullMode) return false;
  if (prev.muted !== next.muted) return false;
  if (prev.holdPause !== next.holdPause) return false;
  if (prev.sessionKey !== next.sessionKey) return false;
  if (prev.following !== next.following) return false;
  if (prev.canDelete !== next.canDelete) return false;
  if (prev.insetsBottom !== next.insetsBottom) return false;
  if (prev.insetsTop !== next.insetsTop) return false;
  const a = prev.item;
  const b = next.item;
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.liked === b.liked &&
    a.likes === b.likes &&
    a.comments === b.comments &&
    a.following === b.following &&
    a.mediaUrl === b.mediaUrl &&
    a.thumb === b.thumb
  );
}

export default memo(VideoReelItem, propsEqual);

const styles = StyleSheet.create({
  page: { backgroundColor: '#000' },
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
  actN: { color: '#fff', fontSize: 11, marginTop: 2, fontWeight: '700' },
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
});
