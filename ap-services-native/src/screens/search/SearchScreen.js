import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { Avatar, EmptyState } from '../../components/ui';
import { CreamPage } from '../../components/creamChrome';
import { debounce } from '../../lib/perf';

const SearchRow = React.memo(function SearchRow({ item, onPress }) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(item)}>
      <Avatar uri={item.profile_pic} name={item.name || item.first_name} />
      <Text style={styles.name}>{item.name || item.first_name || item.title || 'Result'}</Text>
    </Pressable>
  );
});

export default function SearchScreen({ navigation, route }) {
  const { api } = useAuth();
  const [q, setQ] = useState(route.params?.q || '');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const runSearch = useCallback(
    async (term) => {
      const query = String(term || '').trim();
      if (query.length < 2) {
        setRows([]);
        setLoading(false);
        return;
      }
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await api.get('/search', { q: query, type: 'all' }, { cacheTtlMs: 20000 });
        if (id !== reqId.current) return;
        setRows(api.extractList(res));
      } catch (_e) {
        if (id === reqId.current) setRows([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [api]
  );

  const debouncedSearch = useRef(debounce((term) => runSearch(term), 350)).current;

  useEffect(() => {
    debouncedSearch(q);
    return () => debouncedSearch.cancel();
  }, [q, debouncedSearch]);

  const openResult = useCallback(
    (item) => {
      if (item.channel) navigation.navigate(item.type === 'party' ? 'PartyRoom' : 'LiveRoom', item);
      else navigation.navigate('CreatorProfile', { userId: item.id || item.userId });
    },
    [navigation]
  );

  const renderItem = useCallback(({ item }) => <SearchRow item={item} onPress={openResult} />, [openResult]);

  return (
    <CreamPage title="Search" navigation={navigation}>
    <View style={{ flex: 1, backgroundColor: colors.creamBg }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Nickname or ID"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        returnKeyType="search"
        onSubmitEditing={() => runSearch(q)}
        autoFocus
      />
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.gold500} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item, i) => String(item.id || item.userId || item.channel || i)}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<EmptyState title="Search people, rooms, and posts" />}
        renderItem={renderItem}
      />
    </View>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  input: {
    margin: 12,
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(232, 212, 168, 0.9)',
    paddingHorizontal: 16,
    height: 46,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    backgroundColor: colors.creamCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontWeight: '700', color: colors.textPrimary },
});
