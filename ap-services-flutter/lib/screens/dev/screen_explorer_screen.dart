import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/live_room.dart';
import '../../services/auth_service.dart';

/// Quick jump list so testers can open every route without hunting menus.
class ScreenExplorerScreen extends StatelessWidget {
  const ScreenExplorerScreen({super.key});

  static const _demoRoom = LiveRoom(
    channel: 'demo-channel',
    hostName: 'Demo Host',
    hostId: 'demo-host-id',
    viewers: 42,
    title: 'Demo live room',
  );

  static const _demoParty = LiveRoom(
    channel: 'demo-party',
    hostName: 'Party Host',
    hostId: 'demo-party-id',
    viewers: 18,
    isParty: true,
    title: 'Demo party room',
  );

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthService>().user?.id ?? 'demo-user';

    final routes = <_RouteEntry>[
      const _RouteEntry('Welcome', '/welcome'),
      const _RouteEntry('Email login', '/login'),
      const _RouteEntry('Home (tabs)', '/home'),
      _RouteEntry('Live room', '/live', args: _demoRoom),
      _RouteEntry('Party room', '/party', args: _demoParty),
      const _RouteEntry('Go live', '/go-live'),
      const _RouteEntry('Chat thread', '/chat-thread', args: {
        'conversationId': 'demo-conversation',
        'otherUserName': 'Demo User',
      }),
      const _RouteEntry('Store', '/store'),
      const _RouteEntry('VIP', '/vip'),
      const _RouteEntry('Referral', '/referral'),
      const _RouteEntry('Withdraw', '/withdraw'),
      const _RouteEntry('Recharge', '/recharge'),
      const _RouteEntry('Points', '/points'),
      const _RouteEntry('Streamer center', '/streamer-center'),
      const _RouteEntry('Live verify', '/live-verify'),
      _RouteEntry('Creator profile', '/creator', args: userId),
      const _RouteEntry('Discover creators', '/discover'),
      const _RouteEntry('Notifications', '/notifications'),
      const _RouteEntry('Role apply', '/role-apply'),
      const _RouteEntry('Edit profile', '/edit-profile'),
      const _RouteEntry('Search', '/search', args: 'live'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Screen explorer')),
      body: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: routes.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final entry = routes[index];
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: GlowTheme.gold500.withValues(alpha: 0.2),
              child: Text('${index + 1}', style: const TextStyle(color: GlowTheme.gold600)),
            ),
            title: Text(entry.label),
            subtitle: Text(entry.route),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).pushNamed(entry.route, arguments: entry.args),
          );
        },
      ),
    );
  }
}

class _RouteEntry {
  const _RouteEntry(this.label, this.route, {this.args});

  final String label;
  final String route;
  final Object? args;
}
