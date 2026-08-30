import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveMini } from '../context/LiveMiniContext';
import { peekHold, subscribeHold } from '../lib/liveMiniHold';
import { mediaUrl } from '../config/api';
import { Avatar } from './ui';
import LiveVideoLayer from './LiveVideoLayer';

const MINI_W = 118;
const MINI_H = 168;
const PARTY_H = 132;

export default function LiveMiniPlayer({ navigationRef }) {
  const insets = useSafeAreaInsets();
  const { session, expand, dismiss } = useLiveMini();
  const [routeName, setRouteName] = useState('');
  const [holdSnap, setHoldSnap] = useState(() => peekHold());
  const pos = useRef(new Animated.ValueXY()).current;

  useEffect(() => subscribeHold((h) => setHoldSnap(h ? { ...h } : null)), []);

  useEffect(() => {
    const nav = navigationRef?.current;
    if (!nav) return undefined;
    const update = () => {
      try {
        setRouteName(String(nav.getCurrentRoute?.()?.name || ''));
      } catch (_e) {}
    };
    update();
    const unsub = nav.addListener?.('state', update);
    return () => {
      try {
        unsub?.();
      } catch (_e) {}
    };
  }, [navigationRef]);

  const inFullRoom = routeName === 'LiveRoom' || routeName === 'PartyRoom' || routeName === 'GoLive' || routeName === 'Call';
  const show = Boolean(session?.minimized) && !inFullRoom;
  const isParty = Boolean(session?.isParty);
  const boxH = isParty ? PARTY_H : MINI_H;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          pos.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          pos.flattenOffset();
        },
      }),
    [pos]
  );

  if (!show || !session) return null;

  const pic = mediaUrl(session.hostPic || session.coverUrl);
  const remoteUid = holdSnap?.remoteUid ?? session.remoteUid;
  const isHost = Boolean(session.isHost);
  const agoraReady = Boolean(holdSnap?.engine);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.wrap,
          {
            width: MINI_W,
            height: boxH,
            right: 12,
            bottom: insets.bottom + 64,
            transform: pos.getTranslateTransform(),
          },
        ]}
        {...pan.panHandlers}
      >
        <Pressable onPress={expand} style={styles.card}>
          {isParty ? (
            <LinearGradient colors={['#3B0764', '#5B21B6', '#1E1B4B']} style={StyleSheet.absoluteFill}>
              <View style={styles.partyInner}>
                <Avatar uri={pic} name={session.hostName} size={56} />
                <Text style={styles.hostT} numberOfLines={1}>{session.hostName || 'Party'}</Text>
              </View>
            </LinearGradient>
          ) : agoraReady && !isHost && remoteUid ? (
            <LiveVideoLayer
              agoraReady
              isHost={false}
              remoteUid={remoteUid}
              uid={remoteUid}
              camOff={false}
              hostProfilePic={pic}
              hostName={session.hostName}
              overlay
            />
          ) : agoraReady && isHost && !session.camOff ? (
            <LiveVideoLayer
              agoraReady
              isHost
              remoteUid={null}
              camOff={false}
              hostProfilePic={pic}
              hostName={session.hostName}
              overlay
            />
          ) : (
            <LinearGradient colors={['#1c1917', '#44403c']} style={StyleSheet.absoluteFill}>
              <View style={styles.partyInner}>
                <Avatar uri={pic} name={session.hostName} size={56} />
                <Text style={styles.hostT} numberOfLines={1}>{session.hostName || 'Live'}</Text>
              </View>
            </LinearGradient>
          )}
          <View style={[styles.badge, isParty && styles.badgeParty]}>
            <Text style={styles.badgeT}>{isParty ? 'PARTY' : 'LIVE'}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => dismiss({ end: isHost && !session.isParty })}
          style={styles.x}
          hitSlop={8}
          accessibilityLabel="Leave live"
        >
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 80,
    elevation: 24,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 16 },
    }),
  },
  partyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8 },
  hostT: { color: '#fff', fontWeight: '800', fontSize: 12, maxWidth: 100, textAlign: 'center' },
  badge: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: '#EF4444',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeParty: { backgroundColor: '#7C3AED' },
  badgeT: { color: '#fff', fontWeight: '900', fontSize: 9, letterSpacing: 0.4 },
  x: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
