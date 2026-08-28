import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar, EmptyState, ErrorBanner, Loading } from '../../components/ui';
import { loadChatPrefs, loadChatPrefsBatch } from './ChatSettingsScreen';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'official', label: 'Official' },
  { id: 'unread', label: 'Unread' },
  { id: 'group', label: 'Group chat' },
  { id: 'online', label: 'Online' },
];

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function mapConv(c) {
  const other = c.other_user || c.otherUser || {};
  const official = Boolean(
    c.is_official ||
      c.isOfficial ||
      c.official ||
      other.role === 'admin' ||
      other.role === 'super_admin' ||
      other.role === 'founder' ||
      other.role === 'ceo' ||
      /official|ap services|glowcast|security|income|system/i.test(
        String(other.displayName || other.first_name || c.name || '')
      )
  );
  const name = official
    ? 'AP Live'
    : [other.first_name, other.last_name].filter(Boolean).join(' ') ||
      other.displayName ||
      c.name ||
      c.title ||
      'Chat';
  return {
    id: String(c.id || c.conversationId),
    name,
    pic: other.profile_pic || other.profilePic || c.avatar,
    last: c.last_message_text || c.lastMessageText || c.last_message?.content || c.lastMessage || c.preview || '',
    unread: Number(c.unread_count || c.unreadCount || 0),
    otherId: other.id || c.otherUserId,
    at: c.last_message?.created_at || c.updated_at || c.lastMessageAt,
    official,
    host: Boolean(other.role === 'host' || other.is_host || c.host || c.is_host),
    group: Boolean(c.is_group || c.group || c.type === 'group'),
    online: Boolean(other.is_online || other.online || c.online),
    liveChannel: c.live_channel || c.channel || c.last_message?.channel,
    isParty: Boolean(c.is_party || /party/i.test(String(c.last_message?.content || c.lastMessage || ''))),
    lastKind: /cp invit/i.test(String(c.last_message?.content || c.lastMessage || ''))
      ? 'cp'
      : /live|party invite/i.test(String(c.last_message?.content || c.lastMessage || ''))
        ? 'live'
        : 'text',
  };
}

export default function ChatListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifBanner, setNotifBanner] = useState(true);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    if (!items.length) setLoading(true);
    try {
      const res = await api.get('/messages/conversations', null, { cacheTtlMs: 15000 });
      const mapped = api.extractList(res).map(mapConv);
      const prefMap = await loadChatPrefsBatch(mapped.map((row) => row.id));
      const withPrefs = mapped.map((row) => {
        const p = prefMap.get(String(row.id)) || {};
        return { ...row, pinned: Boolean(p.top), muted: Boolean(p.mute) };
      });
      withPrefs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
      setItems(withPrefs);
      ChatListScreen._lastLoad = Date.now();
    } catch (e) {
      setError(e.message || 'Could not load chats');
    } finally {
      setLoading(false);
    }
  }, [api, items.length]);

  useFocusEffect(
    useCallback(() => {
      const fresh = items.length && Date.now() - (ChatListScreen._lastLoad || 0) < 15000;
      if (!fresh) load();
    }, [load, items.length])
  );

  const officialCount = items.filter((i) => i.official && i.unread).length;
  const unreadCount = items.reduce((n, i) => n + (i.unread > 0 ? 1 : 0), 0);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'official') list = list.filter((i) => i.official);
    if (filter === 'unread') list = list.filter((i) => i.unread > 0);
    if (filter === 'group') list = list.filter((i) => i.group);
    if (filter === 'online') list = list.filter((i) => i.online);
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((i) => i.name.toLowerCase().includes(s) || String(i.otherId || '').includes(s));
  }, [filter, items, q]);

  const openChat = (item) => {
    navigation.navigate('ChatThread', {
      conversationId: item.id,
      name: item.name,
      otherUserId: item.otherId,
      pic: item.pic,
      official: item.official,
      unread: unreadCount,
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topRow}>
          <Text style={styles.title}>Message</Text>
          <View style={styles.topActions}>
            <Pressable onPress={() => navigation.navigate('DiscoverCreators')} style={styles.topIco}>
              <Ionicons name="add" size={24} color="#C9A227" />
            </Pressable>
            <Pressable onPress={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus?.(), 50); }} style={styles.topIco}>
              <Ionicons name="search" size={22} color="#C9A227" />
            </Pressable>
          </View>
        </View>
        {notifBanner ? (
          <View style={styles.banner}>
            <Ionicons name="volume-medium" size={16} color="#8B6D3B" />
            <Text style={styles.bannerT}>Enable system notification permissions</Text>
            <Pressable onPress={() => navigation.navigate('NotificationSettings')} style={styles.openBtn}>
              <Text style={styles.openT}>Open</Text>
            </Pressable>
            <Pressable onPress={() => setNotifBanner(false)}><Ionicons name="close" size={16} color="#A89070" /></Pressable>
          </View>
        ) : null}
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const badge = f.id === 'official' ? officialCount : f.id === 'unread' ? unreadCount : 0;
            return (
              <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.filter, filter === f.id && styles.filterOn]}>
                <Text style={[styles.filterT, filter === f.id && styles.filterTOn]}>{f.label}</Text>
                {badge > 0 ? (
                  <View style={styles.pill}><Text style={styles.pillT}>{badge}</Text></View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {searchOpen ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#C4A574" />
            <TextInput
              ref={searchRef}
              value={q}
              onChangeText={setQ}
              placeholder="Search name or user ID…"
              placeholderTextColor="#C4A574"
              style={styles.search}
            />
            <Pressable onPress={() => { setSearchOpen(false); setQ(''); }}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        ) : null}
      </View>
      <ErrorBanner message={error} onRetry={load} />
      {loading && !items.length ? (
        <Loading label="Loading messages…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ backgroundColor: '#fff' }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#C9A227" />}
          ListEmptyComponent={<EmptyState title="No conversations" subtitle="Message a creator from their profile." />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => openChat(item)}
              onLongPress={() =>
                Alert.alert(item.name, undefined, [
                  { text: 'Open profile', onPress: () => item.otherId && navigation.navigate('CreatorProfile', { userId: item.otherId, name: item.name }) },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
            >
              <View>
                <Avatar uri={item.pic} name={item.name} size={50} />
                {item.online ? <View style={styles.online} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {item.official ? <Text style={styles.tagOfficial}>Official</Text> : null}
                  {item.muted ? <Ionicons name="notifications-off-outline" size={14} color="#A89070" /> : null}
                  {item.pinned ? <Ionicons name="pin" size={12} color="#E89020" /> : null}
                  <Text style={styles.time}>{relTime(item.at)}</Text>
                </View>
                <Text style={[styles.last, item.unread > 0 && styles.lastUnread]} numberOfLines={1}>
                  {item.lastKind === 'cp' ? 'CP invitation' : item.lastKind === 'live' ? (item.isParty ? 'Party invite' : 'is live streaming') : item.last}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread}</Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F0' },
  head: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#FBF7F0' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#1A1A1A' },
  topActions: { flexDirection: 'row', gap: 4 },
  topIco: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  banner: {
    marginTop: 10,
    backgroundColor: '#F3E4C8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerT: { flex: 1, color: '#6B4A1B', fontSize: 12, fontWeight: '600' },
  openBtn: { backgroundColor: '#C9A06A', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  openT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F3EBDD',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterOn: { backgroundColor: '#E8B84A' },
  filterT: { color: '#8B6D3B', fontWeight: '700', fontSize: 13 },
  filterTOn: { color: '#fff' },
  pill: { backgroundColor: '#FF3B30', minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pillT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  searchWrap: { marginTop: 10, flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: '#fff', paddingHorizontal: 12, gap: 8 },
  search: { flex: 1, color: '#1A1A1A', height: 40 },
  cancel: { color: '#C9A227', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0EEEA',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontWeight: '700', color: '#1A1A1A', fontSize: 15, flexShrink: 1, maxWidth: '58%' },
  tagOfficial: { backgroundColor: '#E8F1FF', color: '#3B82F6', overflow: 'hidden', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontSize: 10, fontWeight: '700' },
  time: { marginLeft: 'auto', color: '#B0A99C', fontSize: 11 },
  last: { color: '#9A9388', marginTop: 4, fontSize: 13 },
  lastUnread: { color: '#444', fontWeight: '600' },
  badge: { backgroundColor: '#FF3B30', minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  online: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
});
