import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mediaUrl } from '../config/api';
import SoftImage from './SoftImage';
import { prefetchImage } from '../lib/perf';

export function openReelViewer(navigation, { userId, startId, mediaType } = {}) {
  const params = {
    userId: userId ? String(userId) : undefined,
    startId: startId ? String(startId) : undefined,
    mediaType: mediaType || 'video',
  };
  /* Modal player — stays on profile / Square; does not jump to Video tab */
  navigation.navigate('ReelViewer', params);
}

export function isVideoPost(p) {
  const type = String(p?.media_type || p?.mediaType || p?.type || '').toLowerCase();
  const url = String(p?.media_url || p?.mediaUrl || p?.video_url || '');
  return type.includes('video') || /\.(mp4|mov|webm|m3u8|m4v)(\?|$)/i.test(url);
}

export function mapFeedPost(p) {
  const author = p.author || p.user || {};
  const url = mediaUrl(p.media_url || p.mediaUrl || p.video_url || p.thumbnail_url || p.thumb_url);
  const thumb = mediaUrl(p.thumb_url || p.thumbnail_url || p.cover_url || url);
  const isVideo = isVideoPost(p);
  return {
    id: String(p.id),
    authorId: String(author.id || p.userId || p.user_id || ''),
    authorName: author.first_name || author.name || p.displayName || 'Creator',
    authorPic: author.profile_pic || author.profilePic || p.profile_pic || p.profilePic,
    caption: p.caption || p.content || p.body || '',
    mediaUrl: url,
    thumb,
    isVideo,
    createdAt: p.created_at || p.createdAt || p.posted_at || null,
    likes: Number(p.likes || p.like_count || 0),
    comments: Number(p.comments || p.comment_count || 0),
    liked: Boolean(p.liked || p.isLiked),
    following: Boolean(author.following || p.following || p.isFollowing),
    likers: Array.isArray(p.likers) ? p.likers.map((l) => ({
      userId: String(l.userId || l.user_id || l.id || ''),
      displayName: l.displayName || l.display_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.name || 'User',
      profilePic: l.profilePic || l.profile_pic || null,
      displayId: l.displayId || l.display_id || null,
    })) : [],
  };
}

const GridCell = memo(function GridCell({ item, onPress }) {
  const thumb = item.thumb || item.mediaUrl;
  React.useEffect(() => {
    if (thumb) prefetchImage(thumb);
  }, [thumb]);
  return (
    <Pressable style={styles.cell} onPress={() => onPress?.(item)}>
      {thumb ? (
        <SoftImage uri={thumb} style={styles.img} contentFit="cover" recyclingKey={thumb} />
      ) : (
        <View style={[styles.img, styles.blank]} />
      )}
      {item.isVideo ? (
        <View style={styles.play}>
          <Ionicons name="play" size={14} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
});

export function PostGrid({ items, onPress, empty = 'Nothing here yet' }) {
  if (!items?.length) {
    return <Text style={styles.empty}>{empty}</Text>;
  }
  return (
    <View style={styles.grid}>
      {items.map((p, i) => (
        <GridCell key={p.id || i} item={p} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', aspectRatio: 0.75, padding: 0.5, backgroundColor: '#111' },
  img: { width: '100%', height: '100%', backgroundColor: '#1F2937' },
  blank: { backgroundColor: '#E5E7EB' },
  play: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 28, fontWeight: '600' },
  mediaTabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    marginTop: 8,
  },
  mediaTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  mediaTabOn: { borderBottomWidth: 2, borderBottomColor: '#111' },
  mediaTabT: { fontWeight: '700', color: '#9CA3AF', fontSize: 13 },
  mediaTabTOn: { color: '#111', fontWeight: '800' },
  mediaTabsDark: { borderBottomColor: 'rgba(255,255,255,0.12)' },
  mediaTabOnDark: { borderBottomColor: '#fbbf24' },
  mediaTabTDark: { color: 'rgba(248,250,252,0.45)' },
  mediaTabTOnDark: { color: '#fbbf24' },
});

export function ProfileMediaSection({ posts, navigation, userId, dark = false, initialTab = 'posts' }) {
  const [tab, setTab] = useState(initialTab);
  const mapped = (posts || []).map(mapFeedPost);
  const photos = mapped.filter((p) => !p.isVideo);
  const videos = mapped.filter((p) => p.isVideo);
  const items = tab === 'video' ? videos : photos;
  return (
    <View>
      <View style={[styles.mediaTabs, dark && styles.mediaTabsDark]}>
        {[
          ['posts', 'grid-outline', 'Posts'],
          ['video', 'play-circle-outline', 'Video'],
        ].map(([id, icon, label]) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              style={[styles.mediaTab, on && (dark ? styles.mediaTabOnDark : styles.mediaTabOn)]}
            >
              <Ionicons name={icon} size={16} color={on ? (dark ? '#fbbf24' : '#111') : (dark ? 'rgba(248,250,252,0.45)' : '#9CA3AF')} />
              <Text style={[styles.mediaTabT, dark && styles.mediaTabTDark, on && (dark ? styles.mediaTabTOnDark : styles.mediaTabTOn)]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <PostGrid
        items={items}
        empty={tab === 'video' ? 'No videos yet. Upload a video to see it here.' : 'No posts yet. Share a photo to see it here.'}
        onPress={(p) =>
          openReelViewer(navigation, {
            userId: userId || p.authorId,
            startId: p.id,
            mediaType: p.isVideo ? 'video' : 'image',
          })
        }
      />
    </View>
  );
}
