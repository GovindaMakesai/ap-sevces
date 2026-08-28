import React, { memo, useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomNav from '../components/BottomNav';
import VideoScreen from '../screens/video/VideoScreen';
import ExploreScreen from '../screens/explore/ExploreScreen';
import DiscoverCreatorsScreen from '../screens/creator/DiscoverCreatorsScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();
const MemoBottomNav = memo(BottomNav);

export default function MainTabs() {
  const { api } = useAuth();
  const [chatBadge, setChatBadge] = useState(0);

  useEffect(() => {
    let t;
    let alive = true;
    const tick = async () => {
      try {
        const res = await api.get('/messages/unread-count', null, { cacheTtlMs: 10000 });
        const d = res.data || res;
        if (alive) setChatBadge(Number(d.count || d.unreadCount || 0));
      } catch (_e) {}
    };
    tick();
    t = setInterval(tick, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api]);

  return (
    <Tab.Navigator
      tabBar={(props) => <MemoBottomNav {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        freezeOnBlur: true,
        lazy: true,
      }}
      initialRouteName="Explore"
    >
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Video" component={VideoScreen} />
      <Tab.Screen name="Match" component={DiscoverCreatorsScreen} />
      <Tab.Screen name="Chat" component={ChatListScreen} options={{ tabBarBadge: chatBadge || undefined }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export const AppStack = createNativeStackNavigator();
