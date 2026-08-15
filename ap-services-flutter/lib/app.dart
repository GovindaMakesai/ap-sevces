import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/app_config.dart';
import 'config/app_nav.dart';
import 'config/theme.dart';
import 'widgets/glowcast_ui.dart';
import 'models/live_room.dart';
import 'screens/dev/screen_explorer_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/welcome_screen.dart';
import 'screens/chat/chat_thread_screen.dart';
import 'screens/creator/creator_profile_screen.dart';
import 'screens/creator/discover_creators_screen.dart';
import 'screens/home/main_shell.dart';
import 'screens/live/go_live_screen.dart';
import 'screens/live/live_room_screen.dart';
import 'screens/live/party_room_screen.dart';
import 'screens/monetization/recharge_screen.dart' show RechargeScreen, PointsScreen;
import 'screens/monetization/referral_screen.dart';
import 'screens/monetization/store_screen.dart';
import 'screens/monetization/vip_screen.dart';
import 'screens/monetization/withdraw_screen.dart';
import 'screens/profile/edit_profile_screen.dart';
import 'screens/profile/live_verify_screen.dart';
import 'screens/profile/notification_settings_screen.dart';
import 'screens/profile/role_apply_screen.dart';
import 'screens/profile/streamer_center_screen.dart';
import 'screens/search/search_screen.dart';
import 'services/auth_service.dart';
import 'services/chat_service.dart';
import 'services/deep_link_service.dart';
import 'services/feature_services.dart';
import 'services/live_service.dart';
import 'services/live_audio_route.dart';
import 'services/push_service.dart';
import 'services/social_service.dart';
import 'services/socket_service.dart';
import 'services/wallet_service.dart';

class AppState {
  AppState(this.auth) {
    live = LiveService(auth.api);
    chat = ChatService(auth.api);
    wallet = WalletService(auth.api);
    social = SocialService(auth.api);
    store = StoreService(auth.api);
    referral = ReferralService(auth.api);
    search = SearchService(auth.api);
    host = HostService(auth.api);
    notifications = NotificationService(auth.api);
    socket = SocketService();
    push = PushService(auth.api);
  }

  final AuthService auth;
  late final LiveService live;
  late final ChatService chat;
  late final WalletService wallet;
  late final SocialService social;
  late final StoreService store;
  late final ReferralService referral;
  late final SearchService search;
  late final HostService host;
  late final NotificationService notifications;
  late final SocketService socket;
  late final PushService push;

  Future<void> syncPushToken() async {
    final token = auth.accessToken;
    if (token != null && token.isNotEmpty) {
      await push.uploadToken(token);
    }
  }
}

class GlowCastApp extends StatefulWidget {
  const GlowCastApp({super.key, required this.appState});

  final AppState appState;

  @override
  State<GlowCastApp> createState() => _GlowCastAppState();
}

class _GlowCastAppState extends State<GlowCastApp> with WidgetsBindingObserver {
  final _appLinks = AppLinks();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _listenDeepLinks();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      LiveAudioRoute.onAppForeground();
    }
  }

  Future<void> _listenDeepLinks() async {
    widget.appState.push.setDeepLinkHandler(navigateDeepLink);
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handleUri(initial);
    } catch (_) {}
    _appLinks.uriLinkStream.listen((uri) => _handleUri(uri));
  }

  void _handleUri(Uri uri) {
    final target = DeepLinkService.resolve(uri.toString());
    if (target != null) navigateDeepLink(target);
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: widget.appState.auth),
        Provider.value(value: widget.appState),
        Provider.value(value: widget.appState.live),
        Provider.value(value: widget.appState.chat),
        Provider.value(value: widget.appState.wallet),
        Provider.value(value: widget.appState.social),
        Provider.value(value: widget.appState.store),
        Provider.value(value: widget.appState.referral),
        Provider.value(value: widget.appState.search),
        Provider.value(value: widget.appState.host),
        Provider.value(value: widget.appState.notifications),
        Provider.value(value: widget.appState.socket),
        Provider.value(value: widget.appState.push),
      ],
      child: MaterialApp(
        navigatorKey: rootNavigatorKey,
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: GlowTheme.light(),
        onGenerateRoute: _onGenerateRoute,
        home: const _SplashGate(),
      ),
    );
  }

  Route<dynamic>? _onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case '/welcome':
        return _page(const WelcomeScreen());
      case '/login':
        return _page(const LoginScreen());
      case '/home':
        return _page(const MainShell());
      case '/live':
        return _page(LiveRoomScreen(room: settings.arguments as LiveRoom), fullscreen: true);
      case '/party':
        return _page(PartyRoomScreen(room: settings.arguments as LiveRoom), fullscreen: true);
      case '/go-live':
        return _page(const GoLiveScreen());
      case '/chat-thread':
        final args = settings.arguments as Map<String, dynamic>;
        return _page(ChatThreadScreen(
          conversationId: args['conversationId'] as String,
          otherUserName: args['otherUserName'] as String,
        ));
      case '/store':
        return _page(const StoreScreen());
      case '/vip':
        return _page(const VipScreen());
      case '/referral':
        return _page(const ReferralScreen());
      case '/withdraw':
        return _page(const WithdrawScreen());
      case '/recharge':
        return _page(const RechargeScreen());
      case '/points':
        return _page(const PointsScreen());
      case '/streamer-center':
        return _page(const StreamerCenterScreen());
      case '/live-verify':
        return _page(const LiveVerifyScreen());
      case '/creator':
        return _page(CreatorProfileScreen(userId: settings.arguments as String));
      case '/discover':
        return _page(const DiscoverCreatorsScreen());
      case '/notifications':
        return _page(const NotificationSettingsScreen());
      case '/role-apply':
        return _page(const RoleApplyScreen());
      case '/edit-profile':
        return _page(const EditProfileScreen());
      case '/search':
        return _page(SearchScreen(initialQuery: settings.arguments as String?));
      case '/screen-explorer':
        return _page(const ScreenExplorerScreen());
    }
    return null;
  }

  MaterialPageRoute<void> _page(Widget child, {bool fullscreen = false}) {
    return MaterialPageRoute(
      builder: (_) => child,
      fullscreenDialog: fullscreen,
    );
  }
}

class _SplashGate extends StatefulWidget {
  const _SplashGate();

  @override
  State<_SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<_SplashGate> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final auth = context.read<AuthService>();
    final app = context.read<AppState>();

    // Push/FCM can hang on devices without Google Play Services — never block launch.
    unawaited(
      app.push.initialize().timeout(
        const Duration(seconds: 6),
        onTimeout: () {},
      ),
    );

    try {
      await auth.initialize().timeout(const Duration(seconds: 12));
      if (auth.isLoggedIn) {
        unawaited(app.syncPushToken());
      }
    } catch (_) {
      /* proceed with cached or fresh session */
    }

    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(auth.isLoggedIn ? '/home' : '/welcome');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: GlowTheme.splashGradient),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const GlowBrandMark(size: 96, showLabel: true),
              const SizedBox(height: 12),
              Text(
                'Loading your experience…',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.65), fontSize: 14),
              ),
              const SizedBox(height: 28),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
