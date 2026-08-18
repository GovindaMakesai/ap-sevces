import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../models/user.dart';
import '../../models/wallet.dart';
import '../../services/auth_service.dart';
import '../../services/wallet_service.dart';
import '../../widgets/glowcast_ui.dart';
import '../../widgets/loading_view.dart';

/// Profile hub — live social only. Workers, marketplace & booking are not included.
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
      body: RefreshIndicator(
        onRefresh: _load,
        color: GlowTheme.brand,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _hero(user)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_loading)
                    const LoadingView(message: 'Loading wallet…')
                  else
                    _walletRow(_balance ?? const WalletBalance()),
                  const SizedBox(height: 20),
                  const GlowSectionTitle('Live & Social'),
                  GlowMenuTile(
                    icon: Icons.card_giftcard_outlined,
                    title: 'Invite friends — earn rewards',
                    highlight: true,
                    onTap: () => Navigator.pushNamed(context, '/referral'),
                  ),
                  GlowMenuTile(
                    icon: Icons.videocam_outlined,
                    title: 'Streamer center',
                    onTap: () => Navigator.pushNamed(context, '/streamer-center'),
                  ),
                  GlowMenuTile(
                    icon: Icons.photo_library_outlined,
                    title: 'My posts & videos',
                    onTap: () => Navigator.pushNamed(context, '/creator', arguments: user?.id),
                  ),
                  GlowMenuTile(
                    icon: Icons.verified_outlined,
                    title: 'Live verification',
                    onTap: () => Navigator.pushNamed(context, '/live-verify'),
                  ),
                  GlowMenuTile(
                    icon: Icons.person_add_alt_1_outlined,
                    title: 'Apply for host / agency',
                    onTap: () => Navigator.pushNamed(context, '/role-apply'),
                  ),
                  const SizedBox(height: 8),
                  const GlowSectionTitle('Wallet & Store'),
                  GlowMenuTile(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Wallet & recharge',
                    onTap: () => Navigator.pushNamed(context, '/recharge'),
                  ),
                  GlowMenuTile(
                    icon: Icons.stars_rounded,
                    title: 'Points',
                    onTap: () => Navigator.pushNamed(context, '/points'),
                  ),
                  GlowMenuTile(
                    icon: Icons.payments_outlined,
                    title: 'Withdraw',
                    onTap: () => Navigator.pushNamed(context, '/withdraw'),
                  ),
                  GlowMenuTile(
                    icon: Icons.storefront_outlined,
                    title: 'Store',
                    onTap: () => Navigator.pushNamed(context, '/store'),
                  ),
                  GlowMenuTile(
                    icon: Icons.workspace_premium_outlined,
                    title: 'VIP privileges',
                    onTap: () => Navigator.pushNamed(context, '/vip'),
                  ),
                  const SizedBox(height: 8),
                  const GlowSectionTitle('Community'),
                  GlowMenuTile(
                    icon: Icons.people_outline_rounded,
                    title: 'Discover creators',
                    onTap: () => Navigator.pushNamed(context, '/discover'),
                  ),
                  GlowMenuTile(
                    icon: Icons.notifications_outlined,
                    title: 'Notification settings',
                    onTap: () => Navigator.pushNamed(context, '/notifications'),
                  ),
                  GlowMenuTile(
                    icon: Icons.edit_outlined,
                    title: 'Edit profile',
                    onTap: () => Navigator.pushNamed(context, '/edit-profile'),
                  ),
                  if (AppConfig.showScreenExplorer)
                    GlowMenuTile(
                      icon: Icons.developer_mode_outlined,
                      title: 'Screen explorer',
                      onTap: () => Navigator.pushNamed(context, '/screen-explorer'),
                    ),
                  const SizedBox(height: 16),
                  OutlinedButton(onPressed: _logout, child: const Text('Sign out')),
                  const SizedBox(height: 12),
                  Center(
                    child: Text(
                      AppConfig.appName,
                      style: const TextStyle(fontSize: 12, color: GlowTheme.textMuted),
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hero(AppUser? user) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 24),
      decoration: BoxDecoration(
        gradient: GlowTheme.brandGradient,
        borderRadius: GlowTheme.radiusLg,
        boxShadow: [
          BoxShadow(
            color: GlowTheme.brand.withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/edit-profile'),
            child: CircleAvatar(
              radius: 42,
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              child: Text(
                (user?.displayName.isNotEmpty ?? false) ? user!.displayName[0].toUpperCase() : '?',
                style: const TextStyle(fontSize: 30, color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            user?.displayName ?? 'Guest',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
          ),
          const SizedBox(height: 4),
          Text(
            user?.email ?? '',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
          ),
          if (user != null)
            TextButton(
              onPressed: () => Clipboard.setData(ClipboardData(text: user.id)),
              child: Text(
                'Tap to copy ID',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Widget _walletRow(WalletBalance balance) {
    return Row(
      children: [
        Expanded(child: _statCard('Coins', '${balance.coins}', () => Navigator.pushNamed(context, '/recharge'))),
        const SizedBox(width: 10),
        Expanded(child: _statCard('Points', '${balance.points}', () => Navigator.pushNamed(context, '/points'))),
      ],
    );
  }

  Widget _statCard(String label, String value, VoidCallback onTap) {
    return Material(
      color: GlowTheme.creamSurface,
      borderRadius: GlowTheme.radiusMd,
      child: InkWell(
        onTap: onTap,
        borderRadius: GlowTheme.radiusMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            borderRadius: GlowTheme.radiusMd,
            border: Border.all(color: GlowTheme.border),
          ),
          child: Column(
            children: [
              Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: GlowTheme.textPrimary)),
              const SizedBox(height: 4),
              Text(label, style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}
