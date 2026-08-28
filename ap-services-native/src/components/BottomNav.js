import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { mediaUrl } from '../config/api';

const TABS = [
  { key: 'Explore', icon: 'videocam', outline: 'videocam-outline' },
  { key: 'Video', icon: 'play-circle', outline: 'play-circle-outline' },
  { key: 'Match', icon: 'planet', outline: 'planet-outline' },
  { key: 'Chat', icon: 'chatbubble-ellipses', outline: 'chatbubble-ellipses-outline' },
  { key: 'Profile', icon: 'ellipse', outline: 'ellipse-outline' },
];

function TabItem({ tab, selected, badge, onPress, avatarUri, avatarName }) {
  const scale = useRef(new Animated.Value(1)).current;
  const letter = String(avatarName || 'Me').trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, friction: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start()}
      style={styles.item}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {tab.key === 'Explore' && selected ? (
          <Ionicons name="videocam" size={24} color="#E89020" />
        ) : tab.key === 'Profile' ? (
          <View style={[styles.me, selected && styles.meOn]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.mePic} />
            ) : (
              <View style={styles.meLetter}>
                <Text style={styles.meLetterT}>{letter}</Text>
              </View>
            )}
          </View>
        ) : (
          <Ionicons name={selected ? tab.icon : tab.outline} size={24} color={selected ? '#E89020' : '#B8B2A8'} />
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{Number(badge) > 99 ? '99+' : String(badge)}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function BottomNav({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { user, displayName } = useAuth();
  const focused = state.routes[state.index]?.name;
  const focusedKey = state.routes[state.index]?.key;
  const focusedOpts = (focusedKey && descriptors[focusedKey]?.options) || {};
  const hideBar =
    focusedOpts.tabBarVisible === false ||
    focusedOpts.tabBarStyle?.display === 'none' ||
    focusedOpts.tabBarStyle?.height === 0;
  const avatarUri = mediaUrl(user?.profile_pic || user?.profilePic);
  if (hideBar) return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS.map((tab) => {
        const selected = focused === tab.key;
        const route = state.routes.find((r) => r.name === tab.key);
        const badge = route ? descriptors[route.key]?.options?.tabBarBadge : null;
        return (
          <TabItem
            key={tab.key}
            tab={tab}
            selected={selected}
            badge={badge}
            avatarUri={avatarUri}
            avatarName={displayName || user?.first_name}
            onPress={() => navigation.navigate(tab.key)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEAE3',
    paddingTop: 8,
    minHeight: 52,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 },
  me: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.6,
    borderColor: '#B8B2A8',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4EDE0',
  },
  meOn: { borderColor: '#E89020', borderWidth: 2 },
  mePic: { width: 28, height: 28, borderRadius: 14 },
  meLetter: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E89020', alignItems: 'center', justifyContent: 'center' },
  meLetterT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  badge: {
    position: 'absolute',
    right: -12,
    top: -6,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
