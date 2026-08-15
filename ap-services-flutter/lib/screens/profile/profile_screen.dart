import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../config/app_config.dart';
import '../../config/app_scope.dart';
import '../../config/theme.dart';
import '../../models/user.dart';
import '../../models/wallet.dart';
import '../../services/auth_service.dart';
import '../../services/wallet_service.dart';
import '../../widgets/loading_view.dart';

/// Profile tab — social/live menu only. No workers or services marketplace links.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  WalletBalance? _balance;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final balance = await context.read<WalletService>().getBalance();
      if (mounted) {
        setState(() {
          _balance = balance;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await context.read<AuthService>().logout();
    if (mounted) Navigator.of(context).pushNamedAndRemoveUntil('/welcome', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user;

    return Scaffold(
      backgroundColor: GlowTheme.creamBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: GlowTheme.gold500,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _hero(user),
              const SizedBox(height: 16),
              if (_loading) const LoadingView(message: 'Loading wallet…') else _walletRow(_balance ?? const WalletBalance()),
              const SizedBox(height: 20),
              _section('Live & Social'),
              _menu(Icons.card_giftcard, 'Invite — Earn \$14/person', '/referral', highlight: true),
              _menu(Icons.video_camera_front, 'Host / Streamer Center', '/streamer-center'),
              _menu(Icons.photo_library, 'My posts & videos', '/creator', args: user?.id),
              _menu(Icons.verified_user, 'Live verification & selfie', '/live-verify'),
              _menu(Icons.star, 'Host earning policies', '/streamer-center'),
              _menu(Icons.person_add, 'Apply for Host / Agency', '/role-apply'),
              const SizedBox(height: 12),
              _section('Wallet & Store'),
              _menu(Icons.account_balance_wallet, 'Wallet & Recharge', '/recharge'),
              _menu(Icons.stars, 'Points', '/points'),
              _menu(Icons.payments, 'Withdraw / Exchange', '/withdraw'),
              _menu(Icons.storefront, 'Store', '/store'),
              _menu(Icons.workspace_premium, 'VIP Privileges', '/vip'),
              const SizedBox(height: 12),
              _section('Community'),
              _menu(Icons.emoji_events, 'Rankings', null, onTap: () {}),
              _menu(Icons.people, 'Discover Creators', '/discover'),
              _menu(Icons.chat, 'Messages', null, onTap: () {}),
              _menu(Icons.notifications, 'Notification settings', '/notifications'),
              _menu(Icons.edit, 'Edit profile', '/edit-profile'),
              if (AppConfig.showScreenExplorer)
                _menu(Icons.developer_mode, 'Screen explorer (test all pages)', '/screen-explorer'),
              _menu(Icons.help_outline, 'Help', null, onTap: () {}),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: _logout, child: const Text('Sign out')),
              const SizedBox(height: 8),
              Text(
                'Native Flutter · ${AppScope.excludedModules.length} legacy modules removed',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, color: GlowTheme.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _hero(AppUser? user) {
    return Column(
      children: [
        GestureDetector(
          onTap: () => Navigator.pushNamed(context, '/edit-profile'),
          child: CircleAvatar(
            radius: 44,
            backgroundColor: GlowTheme.gold500.withValues(alpha: 0.2),
            child: Text(
              (user?.displayName.isNotEmpty ?? false) ? user!.displayName[0].toUpperCase() : '?',
              style: const TextStyle(fontSize: 32, color: GlowTheme.gold600, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(user?.displayName ?? 'Guest', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        Text(user?.email ?? '', style: const TextStyle(color: GlowTheme.textSecondary)),
        if (user != null)
          TextButton(
            onPressed: () => Clipboard.setData(ClipboardData(text: user.id)),
            child: Text('ID: ${user.id}', style: const TextStyle(fontSize: 12)),
          ),
      ],
    );
  }

  Widget _walletRow(WalletBalance balance) {
    return Row(
      children: [
        Expanded(child: _pill('Coins', '${balance.coins}', () => Navigator.pushNamed(context, '/recharge'))),
        const SizedBox(width: 8),
        Expanded(child: _pill('Points', '${balance.points}', () => Navigator.pushNamed(context, '/points'))),
      ],
    );
  }

  Widget _pill(String label, String value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
        ),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
            Text(label, style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: GlowTheme.textSecondary, fontSize: 13)),
    );
  }

  Widget _menu(IconData icon, String title, String? route, {Object? args, VoidCallback? onTap, bool highlight = false}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      elevation: 0,
      color: highlight ? GlowTheme.gold500.withValues(alpha: 0.08) : Colors.white,
      child: ListTile(
        leading: Icon(icon, color: GlowTheme.gold500),
        title: Text(title, style: TextStyle(fontWeight: highlight ? FontWeight.w600 : FontWeight.normal)),
        trailing: const Icon(Icons.chevron_right, size: 20),
        onTap: onTap ?? () {
          if (route != null) Navigator.pushNamed(context, route, arguments: args);
        },
      ),
    );
  }
}
