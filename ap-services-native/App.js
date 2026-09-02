import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MatchCallBridge from './src/navigation/MatchCallBridge';
import PromoLaunchOverlay from './src/components/PromoLaunchOverlay';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { clearLiveSecure } from './src/lib/liveSecure';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { LiveMiniProvider } from './src/context/LiveMiniContext';
import LiveMiniPlayer from './src/components/LiveMiniPlayer';
import { colors } from './src/config/theme';
import { requireScreen } from './src/lib/deferScreen';
import MainTabs from './src/navigation/RootNavigator';
import WelcomeScreen from './src/screens/auth/WelcomeScreen';
import PhoneAuthScreen from './src/screens/auth/PhoneAuthScreen';
import { extractNotificationData, resolvePushRoute } from './src/lib/push';
import { navigationLinking, parseDeepLink } from './src/lib/deepLinks';
import * as Linking from 'expo-linking';

/* Clear leftover FLAG_SECURE from a prior live/PK session so party + rest of app stay screenshotable */
clearLiveSecure('app_boot');

/* Heavy screens load on first open — keeps cold start fast */
const LiveRoomScreen = requireScreen(() => require('./src/screens/live/LiveRoomScreen'));
const GoLiveScreen = requireScreen(() => require('./src/screens/live/GoLiveScreen'));
const CallScreen = requireScreen(() => require('./src/screens/live/CallScreen'));
const ChatThreadScreen = requireScreen(() => require('./src/screens/chat/ChatThreadScreen'));
const ChatSettingsScreen = requireScreen(() => require('./src/screens/chat/ChatSettingsScreen'));
const WalletScreen = requireScreen(() => require('./src/screens/wallet/WalletScreen'));
const RechargeScreen = requireScreen(() => require('./src/screens/wallet/RechargeScreen'));
const WithdrawScreen = requireScreen(() => require('./src/screens/wallet/WithdrawScreen'));
const WalletHistoryScreen = requireScreen(() => require('./src/screens/wallet/HistoryScreen'));
const StoreScreen = requireScreen(() => require('./src/screens/store/StoreScreen'));
const FamilyScreen = requireScreen(() => require('./src/screens/family/FamilyScreen'));
const BadgeHubScreen = requireScreen(() => require('./src/screens/badge/BadgeHubScreen'));
const VipScreen = requireScreen(() => require('./src/screens/vip/VipScreen'));
const RankingsScreen = requireScreen(() => require('./src/screens/rankings/RankingsScreen'));
const CreatorProfileScreen = requireScreen(() => require('./src/screens/creator/CreatorProfileScreen'));
const DiscoverCreatorsScreen = requireScreen(() => require('./src/screens/creator/DiscoverCreatorsScreen'));
const NotificationsScreen = requireScreen(() => require('./src/screens/notifications/NotificationsScreen'));
const SearchScreen = requireScreen(() => require('./src/screens/search/SearchScreen'));
const ReferralScreen = requireScreen(() => require('./src/screens/referral/ReferralScreen'));
const StreamerCenterScreen = requireScreen(() => require('./src/screens/profile/StreamerCenterScreen'));
const SettingsScreen = requireScreen(() => require('./src/screens/profile/SettingsScreen'));
const CameraKitTestScreen = requireScreen(() => require('./src/screens/dev/CameraKitTestScreen'));
const NotificationSettingsScreen = requireScreen(() => require('./src/screens/profile/NotificationSettingsScreen'));
const LiveVerifyScreen = requireScreen(() => require('./src/screens/profile/LiveVerifyScreen'));
const RoleApplyScreen = requireScreen(() => require('./src/screens/profile/RoleApplyScreen'));
const EditProfileScreen = requireScreen(() => require('./src/screens/profile/EditProfileScreen'));
const LegalScreen = requireScreen(() => require('./src/screens/profile/LegalScreen'));
const CreatePostScreen = requireScreen(() => require('./src/screens/social/CreatePostScreen'));
const FollowListScreen = requireScreen(() => require('./src/screens/social/FollowListScreen'));
const SupportersScreen = requireScreen(() => require('./src/screens/social/SupportersScreen'));

const CpHouseScreen = requireScreen(() => require('./src/screens/social/SocialExtra'), (m) => m.CpHouseScreen);
const CpRankingsScreen = requireScreen(() => require('./src/screens/cp/CpRankingsScreen'));
const SvipIntroScreen = requireScreen(() => require('./src/screens/social/SocialExtra'), (m) => m.SvipIntroScreen);
const SvipScreen = requireScreen(() => require('./src/screens/social/SocialExtra'), (m) => m.SvipScreen);
const SvipSettingsScreen = requireScreen(() => require('./src/screens/social/SocialExtra'), (m) => m.SvipSettingsScreen);
const VisitorsScreen = requireScreen(() => require('./src/screens/social/SocialExtra'), (m) => m.VisitorsScreen);

const GamesScreen = requireScreen(() => require('./src/screens/games/GamesScreen'));
const GamePlayScreen = requireScreen(() => require('./src/screens/games/GamesScreen'), (m) => m.GamePlayScreen);

const AgencyScreen = requireScreen(() => require('./src/screens/agency/AgencyScreen'));
const LevelsScreen = requireScreen(() => require('./src/screens/profile/LevelsScreen'));
const CommentsScreen = requireScreen(() => require('./src/screens/agency/AgencyScreen'), (m) => m.CommentsScreen);

const AdminDashboardScreen = requireScreen(() => require('./src/screens/admin/AdminDashboardScreen'));
const AdminUserDetailsScreen = requireScreen(() => require('./src/screens/admin/AdminDashboardScreen'), (m) => m.AdminUserDetailsScreen);

const CoinSellerScreen = requireScreen(() => require('./src/screens/seller/CoinSellerCenter'), (m) => m.CoinSellerScreen);
const SellerStockTopupScreen = requireScreen(() => require('./src/screens/seller/CoinSellerCenter'), (m) => m.SellerStockTopupScreen);

const AgencyCenterScreen = requireScreen(() => require('./src/screens/agency/AgencyCenterScreen'));
const InviteHostScreen = requireScreen(() => require('./src/screens/agency/AgencyCenterScreen'), (m) => m.InviteHostScreen);
const InviteAgencyScreen = requireScreen(() => require('./src/screens/agency/AgencyCenterScreen'), (m) => m.InviteAgencyScreen);
const BdCenterScreen = requireScreen(() => require('./src/screens/bd/BdHub'), (m) => m.BdCenterScreen);
const BecomeProScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.BecomeProScreen);
const HelpScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.HelpScreen);
const HierarchyScreen = requireScreen(() => require('./src/screens/bd/BdHub'), (m) => m.HierarchyScreen);
const HostAgencyScreen = requireScreen(() => require('./src/screens/bd/BdHub'), (m) => m.HostAgencyScreen);
const HostPoliciesScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.HostPoliciesScreen);
const LiveApplicationScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.LiveApplicationScreen);
const LuckyGiftsScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.LuckyGiftsScreen);
const MyPostsScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.MyPostsScreen);
const PaymentScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.PaymentScreen);
const PointsScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.PointsScreen);
const PrivilegesScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.PrivilegesScreen);
const ServiceDetailsScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.ServiceDetailsScreen);
const ServicesScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.ServicesScreen);
const ServiceBookingScreen = requireScreen(() => require('./src/screens/services/ServiceBookingScreen'));
const MyBookingsScreen = requireScreen(() => require('./src/screens/services/MyBookingsScreen'));
const BookingDetailsScreen = requireScreen(() => require('./src/screens/services/BookingDetailsScreen'));
const ServicesCenterScreen = requireScreen(() => require('./src/screens/services/ServicesCenterScreen'));

const SquareScreen = requireScreen(() => require('./src/screens/square/SquareScreen'));
const ReelViewerScreen = requireScreen(() => require('./src/screens/video/ReelViewerScreen'));
const TopicsScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.TopicsScreen);
const WorkerDashboardScreen = requireScreen(() => require('./src/screens/hubs/Hubs'), (m) => m.WorkerDashboardScreen);

const Stack = createNativeStackNavigator();

function Splash() {
  return (
    <View style={styles.splash}>
      <Image source={require('./assets/logo-loading.png')} style={styles.logo} />
      <Text style={styles.splashText}>Loading AP Live Service…</Text>
      <ActivityIndicator color={colors.gold500} style={{ marginTop: 16 }} />
    </View>
  );
}

function Root() {
  const { booting, isLoggedIn } = useAuth();
  const navRef = useRef(null);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = resolvePushRoute(extractNotificationData(response));
      if (route && navRef.current) navRef.current.navigate(route.name, route.params);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const open = (url) => {
      const route = parseDeepLink(url);
      if (route && navRef.current?.isReady?.()) {
        navRef.current.navigate(route.name, route.params);
      }
    };
    Linking.getInitialURL().then((url) => { if (url) open(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, [isLoggedIn]);

  if (booting) return <Splash />;

  return (
    <NavigationContainer ref={navRef} linking={navigationLinking}>
      <LiveMiniProvider navigationRef={navRef}>
      <StatusBar style="dark" />
      {isLoggedIn ? <MatchCallBridge /> : null}
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          headerTintColor: colors.gold800,
          headerStyle: { backgroundColor: colors.creamSurface },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '800', color: colors.textPrimary },
          contentStyle: { backgroundColor: colors.creamBg },
          animation: 'slide_from_right',
          animationDuration: 220,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="LiveRoom" component={LiveRoomScreen} options={{ headerShown: false, animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="PartyRoom" component={LiveRoomScreen} options={{ headerShown: false, animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="GoLive" component={GoLiveScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Call" component={CallScreen} options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="Rankings" component={RankingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ChatSettings" component={ChatSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Recharge" component={RechargeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} options={{ headerShown: false }} />
            <Stack.Screen name="WalletHistory" component={WalletHistoryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Store" component={StoreScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Vip" component={VipScreen} options={{ title: 'VIP', headerStyle: { backgroundColor: colors.vipBg }, headerTintColor: '#fbbf24' }} />
            <Stack.Screen name="Cp" component={CpHouseScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CpRankings" component={CpRankingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Visitors" component={VisitorsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Svip" component={SvipScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Family" component={FamilyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="BadgeHub" component={BadgeHubScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SvipSettings" component={SvipSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SvipIntro" component={SvipIntroScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Games" component={GamesScreen} />
            <Stack.Screen name="GamePlay" component={GamePlayScreen} options={({ route }) => ({ title: route.params?.name || 'Game' })} />
            <Stack.Screen name="CreatorProfile" component={CreatorProfileScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Supporters" component={SupportersScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DiscoverCreators" component={DiscoverCreatorsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Referral" component={ReferralScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Agency" component={AgencyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Levels" component={LevelsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Comments" component={CommentsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="StreamerCenter" component={StreamerCenterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CameraKitTest" component={CameraKitTestScreen} options={{ headerShown: false }} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LiveVerify" component={LiveVerifyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="RoleApply" component={RoleApplyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AdminUserDetails" component={AdminUserDetailsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CoinSeller" component={CoinSellerScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SellerStock" component={SellerStockTopupScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AgencyCenter" component={AgencyCenterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="InviteHost" component={InviteHostScreen} options={{ headerShown: false }} />
            <Stack.Screen name="InviteAgency" component={InviteAgencyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="BdCenter" component={BdCenterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Hierarchy" component={HierarchyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="HostAgency" component={HostAgencyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="HostPolicies" component={HostPoliciesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Points" component={PointsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="BecomePro" component={BecomeProScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Privileges" component={PrivilegesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LuckyGifts" component={LuckyGiftsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Services" component={ServicesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ServiceDetails" component={ServiceDetailsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ServiceBooking" component={ServiceBookingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyServiceBookings" component={MyBookingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ServiceBookingDetails" component={BookingDetailsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ServicesCenter" component={ServicesCenterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="WorkerDashboard" component={WorkerDashboardScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Square" component={SquareScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="ReelViewer"
              component={ReelViewerScreen}
              options={{ headerShown: false, animation: 'fade', animationDuration: 180, gestureEnabled: true }}
            />
            <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Topics" component={TopicsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Legal" component={LegalScreen} options={{ headerShown: false }} />
            <Stack.Screen name="LiveApplication" component={LiveApplicationScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MyPosts" component={MyPostsScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
      {isLoggedIn ? <LiveMiniPlayer navigationRef={navRef} /> : null}
      </LiveMiniProvider>
    </NavigationContainer>
  );
}

export default function App() {
  const [promoDone, setPromoDone] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SocketProvider>
            <Root />
            {!promoDone ? <PromoLaunchOverlay onDone={() => setPromoDone(true)} /> : null}
          </SocketProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  logo: { width: 120, height: 120, resizeMode: 'contain' },
  splashText: { color: '#f5e6c8', marginTop: 12, fontWeight: '700' },
});
