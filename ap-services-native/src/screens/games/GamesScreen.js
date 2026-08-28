import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Loading } from '../../components/ui';
import { GAME_URLS, gamePageUrl, normalizeGameUrl } from '../../lib/gameUrls';
import { uniqueGames } from '../live/LiveOverlays';

let WebViewCmp = null;
try {
  WebViewCmp = require('react-native-webview').WebView;
} catch (_e) {
  WebViewCmp = null;
}

const CORE_GAMES = [
  { slug: 'crazy-fruit', name: 'Crazy Fruit', emoji: '🍒', url: GAME_URLS['crazy-fruit'] },
  { slug: 'greedy', name: 'Krazy Khazana', emoji: '💎', url: GAME_URLS.greedy },
  { slug: 'teen-patti', name: 'Teen Patti', emoji: '🂡', url: GAME_URLS['teen-patti'] },
];

export default function GamesScreen({ navigation }) {
  const { api } = useAuth();
  const [games, setGames] = useState(CORE_GAMES);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await api.get('/games/catalog', null, { auth: false });
          const list = api.extractList(res);
          setGames(uniqueGames([...CORE_GAMES, ...list]));
        } catch (_e) {
          setGames(CORE_GAMES);
        } finally {
          setLoading(false);
        }
      })();
    }, [api])
  );

  if (loading) return <Loading />;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#0b1230' }}
      contentContainerStyle={{ padding: 12 }}
      data={games}
      keyExtractor={(item, i) => item.slug || String(i)}
      ListHeaderComponent={
        <View>
          <Text style={styles.head}>Room Games</Text>
          <Text style={styles.sub}>
            Same playable tables as live web — Crazy Fruit, Krazy Khazana & Teen Patti with sound.
          </Text>
        </View>
      }
      ListEmptyComponent={<EmptyState title="No games" />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            navigation.navigate('GamePlay', {
              slug: item.slug,
              name: item.name || item.title,
              emoji: item.emoji,
              url: item.url,
            })
          }
        >
          <LinearGradient colors={['#312e81', '#1e1b4b']} style={styles.card}>
            <Text style={{ fontSize: 32 }}>{item.emoji || '🎮'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name || item.title || item.slug}</Text>
              <Text style={styles.meta}>Tap to play · synced sound on</Text>
            </View>
            <Text style={styles.play}>Play</Text>
          </LinearGradient>
        </Pressable>
      )}
    />
  );
}

export function GamePlayScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { slug, name, emoji, url } = route.params || {};
  const { api, user } = useAuth();
  const [muted, setMuted] = useState(false);
  const webRef = useRef(null);

  const gameUrl = useMemo(() => {
    if (url) return normalizeGameUrl(url, slug || 'greedy');
    return gamePageUrl(slug || 'greedy', 'app=1&native=1');
  }, [slug, url]);

  useFocusEffect(
    useCallback(() => {
      let sound;
      (async () => {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            allowsRecordingIOS: false,
            staysActiveInBackground: false,
            playThroughEarpieceAndroid: false,
          });
        } catch (_e) {}
      })();
      return () => {
        try {
          sound?.unloadAsync?.();
        } catch (_e) {}
      };
    }, [])
  );

  const injected = `
    (function(){
      try {
        window.__AP_NATIVE__ = true;
        window.__AP_MUTED__ = ${muted ? 'true' : 'false'};
        document.querySelectorAll('audio,video').forEach(function(el){
          el.muted = window.__AP_MUTED__;
          if (!window.__AP_MUTED__) { var p = el.play(); if (p && p.catch) p.catch(function(){}); }
        });
        var btn = document.querySelector('#btnSound, #btnMute, [data-sound]');
        if (btn && !btn.__apBound) {
          btn.__apBound = true;
        }
      } catch(e) {}
      true;
    })();
  `;

  if (!WebViewCmp) {
    return (
      <View style={[styles.fallback, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{name || slug}</Text>
        <Text style={{ color: '#fde68a', fontSize: 48 }}>{emoji || '🎮'}</Text>
        <Text style={styles.meta}>WebView unavailable on this build.</Text>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>Back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.table, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>{name || slug || 'Game'}</Text>
        <Pressable
          onPress={() => {
            setMuted((m) => !m);
            webRef.current?.injectJavaScript?.(
              `window.__AP_MUTED__=${!muted};document.querySelectorAll('audio,video').forEach(function(el){el.muted=window.__AP_MUTED__;});true;`
            );
          }}
          style={styles.iconBtn}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
        </Pressable>
      </View>
      <WebViewCmp
        ref={webRef}
        source={{ uri: gameUrl }}
        style={{ flex: 1, backgroundColor: '#0b1230' }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(req) => {
          const u = String(req?.url || '');
          if (/hostinger|parked-domain|domain.*for sale/i.test(u)) return false;
          if (/^https:\/\/(api\.)?apservices\.in/i.test(u)) return true;
          if (u.startsWith('about:blank')) return true;
          return false;
        }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        onLoadEnd={() => webRef.current?.injectJavaScript?.(injected)}
        onMessage={async (ev) => {
          try {
            const data = JSON.parse(ev.nativeEvent.data || '{}');
            if (data?.type === 'GAME_PLAY' && data.bet) {
              await api.post(`/games/${slug || 'greedy'}/play`, {
                bet_amount: data.bet,
                bet: data.bet,
                userId: user?.id,
              }).catch(() => {});
            }
          } catch (_e) {}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { color: '#fde68a', fontSize: 22, fontWeight: '800', marginBottom: 8, paddingHorizontal: 4, textAlign: 'center' },
  sub: { color: 'rgba(226,232,240,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 18, marginBottom: 12, minHeight: 110 },
  name: { fontWeight: '800', fontSize: 16, color: '#fff' },
  meta: { color: '#fde68a', marginTop: 3 },
  play: { color: '#fbbf24', fontWeight: '800' },
  table: { flex: 1, backgroundColor: '#0b1230' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, gap: 8 },
  barTitle: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  fallback: { flex: 1, backgroundColor: '#0b1230', alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  back: { color: '#fbbf24', fontWeight: '700', marginTop: 8 },
});
