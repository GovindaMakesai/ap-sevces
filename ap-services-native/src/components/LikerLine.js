import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './ui';

export function mapLiker(u) {
  return {
    userId: String(u?.userId || u?.id || u?.user?.id || ''),
    displayName:
      u?.displayName
      || [u?.first_name, u?.last_name].filter(Boolean).join(' ')
      || u?.name
      || u?.user?.name
      || 'User',
    profilePic: u?.profilePic || u?.profile_pic || u?.user?.profile_pic || null,
    displayId: u?.displayId || u?.display_id || null,
  };
}

export function canDeletePost(user, post) {
  if (!user || !post) return false;
  if (String(user.id) === String(post.authorId || post.user_id || post.userId)) return true;
  const role = String(user.role || user.user_role || user.userRole || '').toLowerCase();
  return ['admin', 'super_admin', 'founder', 'ceo'].includes(role);
}

/** Instagram-style “Liked by …” row with avatar stack. */
export default function LikerLine({ post, onPress, light = false }) {
  const likers = post?.likers || [];
  const total = Number(post?.likes || 0);
  if (!total && !likers.length) return null;
  const names = likers.map((l) => l.displayName).filter(Boolean);
  const first = names[0];
  let label;
  if (!first) {
    label = `${total} like${total === 1 ? '' : 's'}`;
  } else if (total <= 1) {
    label = (
      <>
        Liked by <Text style={[styles.likerName, light && styles.likerNameLight]}>{first}</Text>
      </>
    );
  } else if (total === 2 && names[1]) {
    label = (
      <>
        Liked by <Text style={[styles.likerName, light && styles.likerNameLight]}>{first}</Text>
        {' and '}
        <Text style={[styles.likerName, light && styles.likerNameLight]}>{names[1]}</Text>
      </>
    );
  } else {
    const others = Math.max(1, total - 1);
    label = (
      <>
        Liked by <Text style={[styles.likerName, light && styles.likerNameLight]}>{first}</Text>
        {` and ${others} other${others === 1 ? '' : 's'}`}
      </>
    );
  }
  return (
    <Pressable onPress={onPress} style={styles.likerRow}>
      {likers.length ? (
        <View style={styles.likerStack}>
          {likers.slice(0, 3).map((l, i) => (
            <Avatar
              key={l.userId || i}
              uri={l.profilePic}
              name={l.displayName}
              size={18}
              style={[styles.likerAv, i ? { marginLeft: -8 } : null, { zIndex: 3 - i }]}
            />
          ))}
        </View>
      ) : null}
      <Text style={[styles.likerLabel, light && styles.likerLabelLight]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, maxWidth: '100%' },
  likerStack: { flexDirection: 'row', alignItems: 'center' },
  likerAv: { borderWidth: 1, borderColor: '#000' },
  likerLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  likerLabelLight: { color: '#374151' },
  likerName: { fontWeight: '800', color: '#fff' },
  likerNameLight: { color: '#111' },
});
