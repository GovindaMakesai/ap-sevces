import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui';
import { openCreatorProfile } from '../lib/navStack';

function commentName(c) {
  return (
    [c.first_name || c.author?.first_name, c.last_name || c.author?.last_name].filter(Boolean).join(' ') ||
    c.displayName ||
    c.user?.name ||
    c.name ||
    'User'
  );
}

function commentPic(c) {
  return c.profile_pic || c.profilePic || c.author?.profile_pic || c.user?.profile_pic;
}

function commentUserId(c) {
  return String(c.user_id || c.userId || c.author?.id || c.user?.id || '');
}

function likedOf(c) {
  return Boolean(c.liked || c.is_liked || c.hasLiked);
}

function likeCountOf(c) {
  return Number(c.like_count ?? c.likeCount ?? c.likes ?? 0);
}

export function nestComments(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  list.forEach((r) => {
    if (r?.id == null) return;
    byId.set(String(r.id), { ...r, replies: [] });
  });
  const roots = [];
  list.forEach((r) => {
    if (r?.id == null) return;
    const node = byId.get(String(r.id));
    const pid = r.parent_id || r.parentId;
    if (!pid) {
      roots.push(node);
      return;
    }
    let ancestor = byId.get(String(pid));
    let guard = 0;
    while (ancestor && (ancestor.parent_id || ancestor.parentId) && guard < 8) {
      const next = byId.get(String(ancestor.parent_id || ancestor.parentId));
      if (!next) break;
      ancestor = next;
      guard += 1;
    }
    if (ancestor) ancestor.replies.push(node);
    else roots.push(node);
  });
  return roots;
}

function CommentRow({
  item,
  depth,
  expanded,
  onToggleReplies,
  onLike,
  onReply,
  onDelete,
  onReport,
  onProfile,
  likeBusy,
  meId,
}) {
  const name = commentName(item);
  const replies = item.replies || [];
  const replyCount = Number(item.reply_count ?? item.replyCount ?? replies.length);
  const liked = likedOf(item);
  const likes = likeCountOf(item);
  const mine = meId && commentUserId(item) === String(meId);

  return (
    <View style={[styles.row, depth > 0 && styles.replyRow]}>
      <Pressable onPress={() => onProfile(item)}>
        <Avatar uri={commentPic(item)} name={name} size={depth ? 28 : 36} />
      </Pressable>
      <View style={styles.bodyCol}>
        <Pressable onPress={() => onProfile(item)}>
          <Text style={styles.name}>{name}</Text>
        </Pressable>
        <Text style={styles.body}>{item.body || item.text || item.content || ''}</Text>
        <View style={styles.metaRow}>
          <Pressable onPress={() => onLike(item)} disabled={likeBusy} hitSlop={8} style={styles.metaBtn}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={14} color={liked ? '#FF4FA0' : '#9CA3AF'} />
            <Text style={[styles.metaT, liked && styles.metaLiked]}>{likes ? likes : ''}</Text>
          </Pressable>
          <Pressable onPress={() => onReply(item)} hitSlop={8} style={styles.metaBtn}>
            <Text style={styles.metaT}>Reply</Text>
          </Pressable>
          {mine ? (
            <Pressable onPress={() => onDelete(item)} hitSlop={8} style={styles.metaBtn}>
              <Text style={styles.metaT}>Delete</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => onReport(item)} hitSlop={8} style={styles.metaBtn}>
              <Text style={styles.metaT}>Report</Text>
            </Pressable>
          )}
        </View>
        {replyCount > 0 && depth === 0 ? (
          <Pressable onPress={() => onToggleReplies(item)} style={styles.viewReplies}>
            <Text style={styles.viewRepliesT}>
              {expanded ? 'Hide replies' : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </Text>
          </Pressable>
        ) : null}
        {expanded && depth === 0
          ? replies.map((r) => (
              <CommentRow
                key={String(r.id)}
                item={r}
                depth={1}
                expanded={false}
                onToggleReplies={onToggleReplies}
                onLike={onLike}
                onReply={() => onReply(item, r)}
                onDelete={onDelete}
                onReport={onReport}
                onProfile={onProfile}
                likeBusy={likeBusy}
                meId={meId}
              />
            ))
          : null}
      </View>
    </View>
  );
}

export default function CommentSheet({ visible, post, api, user, navigation, onClose, onCountChange }) {
  const insets = useSafeAreaInsets();
  const postId = post?.id;
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sendingRef = useRef(false);
  const likeLocks = useRef(new Set());

  const nested = useMemo(() => nestComments(rows), [rows]);

  const load = useCallback(async () => {
    if (!postId || !api) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/social/posts/${postId}/comments`, { limit: 100 });
      setRows(api.extractList(res));
    } catch (e) {
      setError(e.message || 'Could not load comments');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, postId]);

  useEffect(() => {
    if (visible && postId) {
      setText('');
      setReplyTo(null);
      load();
    }
  }, [visible, postId, load]);

  const patchRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)));
  };

  const onLike = async (item) => {
    const id = String(item.id);
    if (!id || likeLocks.current.has(id)) return;
    likeLocks.current.add(id);
    const prevLiked = likedOf(item);
    const prevCount = likeCountOf(item);
    patchRow(id, { liked: !prevLiked, like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)) });
    try {
      const res = await api.post(`/social/comments/${id}/like`);
      const data = api.unwrap(res) || {};
      patchRow(id, {
        liked: Boolean(data.liked),
        like_count: Number(data.like_count ?? data.likeCount ?? (prevLiked ? prevCount - 1 : prevCount + 1)),
      });
    } catch (_e) {
      patchRow(id, { liked: prevLiked, like_count: prevCount });
    } finally {
      likeLocks.current.delete(id);
    }
  };

  const onReply = (root, maybeReply) => {
    const target = maybeReply || root;
    setReplyTo({
      id: root.id,
      name: commentName(target),
    });
  };

  const onDelete = (item) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/social/comments/${item.id}`);
            setRows((prev) => prev.filter((r) => String(r.id) !== String(item.id) && String(r.parent_id || r.parentId) !== String(item.id)));
            onCountChange?.(-1);
          } catch (e) {
            Alert.alert('Could not delete', e.message || 'Try again');
          }
        },
      },
    ]);
  };

  const onReport = (item) => {
    Alert.alert('Report comment', 'Send this comment to moderation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        onPress: async () => {
          try {
            await api.post('/social/report', {
              reported_user_id: commentUserId(item) || undefined,
              reason: `comment:${item.id}`,
            });
            Alert.alert('Reported', 'Thanks — we will review this comment.');
          } catch (e) {
            Alert.alert('Report failed', e.message || 'Try again');
          }
        },
      },
    ]);
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || !postId || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      await api.post(`/social/posts/${postId}/comments`, {
        body,
        text: body,
        content: body,
        parent_id: replyTo?.id || undefined,
        parentId: replyTo?.id || undefined,
      });
      setText('');
      if (replyTo?.id) {
        setExpanded((s) => ({ ...s, [String(replyTo.id)]: true }));
      }
      setReplyTo(null);
      onCountChange?.(1);
      await load();
    } catch (e) {
      setError(e.message || 'Could not post');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Pressable style={styles.sheetBg} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: 10 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.head}>
              <Text style={styles.sheetH}>Comments</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#111" />
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator color="#C9A227" style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {nested.map((c) => (
                  <CommentRow
                    key={String(c.id)}
                    item={c}
                    depth={0}
                    expanded={Boolean(expanded[String(c.id)])}
                    onToggleReplies={(item) =>
                      setExpanded((s) => ({ ...s, [String(item.id)]: !s[String(item.id)] }))
                    }
                    onLike={onLike}
                    onReply={onReply}
                    onDelete={onDelete}
                    onReport={onReport}
                    onProfile={(item) => {
                      const id = commentUserId(item);
                      if (id) openCreatorProfile(navigation, { userId: id, name: commentName(item) });
                    }}
                    likeBusy={false}
                    meId={user?.id}
                  />
                ))}
                {!nested.length ? <Text style={styles.empty}>No comments yet. Say something.</Text> : null}
              </ScrollView>
            )}
            {error ? <Text style={styles.err}>{error}</Text> : null}
            {replyTo ? (
              <View style={styles.replyBar}>
                <Text style={styles.replyBarT} numberOfLines={1}>
                  Replying to {replyTo.name}
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Text style={styles.replyBarX}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={replyTo ? `Reply to ${replyTo.name}` : 'Add a comment...'}
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                editable={!sending}
              />
              <Pressable onPress={submit} disabled={sending || !text.trim()} hitSlop={8}>
                <Text style={[styles.postBtn, (sending || !text.trim()) && { opacity: 0.45 }]}>
                  {sending ? '…' : 'Post'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF8EC',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '82%',
    paddingTop: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetH: { fontWeight: '800', fontSize: 16, color: '#111' },
  list: { maxHeight: 420, paddingHorizontal: 14 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  replyRow: { marginLeft: 18, paddingTop: 8 },
  bodyCol: { flex: 1 },
  name: { fontWeight: '800', color: '#111', fontSize: 13 },
  body: { color: '#1F2937', fontSize: 14, lineHeight: 19, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  metaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaT: { color: '#6B7280', fontWeight: '700', fontSize: 12 },
  metaLiked: { color: '#FF4FA0' },
  viewReplies: { marginTop: 6 },
  viewRepliesT: { color: '#C9A227', fontWeight: '800', fontSize: 12 },
  empty: { color: '#6B7280', paddingVertical: 20 },
  err: { color: '#B91C1C', paddingHorizontal: 16, paddingBottom: 6, fontSize: 12 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F3E6C8',
  },
  replyBarT: { color: '#5D4037', fontWeight: '700', flex: 1, marginRight: 10 },
  replyBarX: { color: '#9A3412', fontWeight: '800' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8D7B0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#111',
  },
  postBtn: { color: '#C2410C', fontWeight: '800', fontSize: 15 },
});
