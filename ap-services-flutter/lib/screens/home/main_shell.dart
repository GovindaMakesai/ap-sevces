import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../widgets/read_only_banner.dart';
import '../../widgets/social_bottom_nav.dart';
import '../chat/chat_list_screen.dart';
import '../explore/explore_screen.dart';
import '../profile/profile_screen.dart';
import '../rankings/rankings_screen.dart';
import '../video/video_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 2;

  static const _pages = [
    VideoScreen(),
    RankingsScreen(),
    ExploreScreen(),
    ChatListScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GlowTheme.creamBg,
      body: Column(
        children: [
          const ReadOnlyBanner(),
          Expanded(child: IndexedStack(index: _index, children: _pages)),
        ],
      ),
      bottomNavigationBar: SocialBottomNav(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}
