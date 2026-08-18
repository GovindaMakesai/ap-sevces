import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/wallet.dart';
import '../../services/wallet_service.dart';
import '../../widgets/glowcast_ui.dart';
import '../../widgets/loading_view.dart';

class RankingsScreen extends StatefulWidget {
  const RankingsScreen({super.key});

  @override
  State<RankingsScreen> createState() => _RankingsScreenState();
}

class _RankingsScreenState extends State<RankingsScreen> with TickerProviderStateMixin {
  late TabController _mainTabs;
  late TabController _periodTabs;
  List<LeaderboardEntry> _entries = [];
  bool _loading = true;
  String? _error;

  static const _tabs = [
    ('host', 'creators', ''),
    ('rich', 'gifters', ''),
    ('gift', 'gifters', 'count'),
    ('video', 'video', ''),
  ];

  @override
  void initState() {
    super.initState();
    _mainTabs = TabController(length: 4, vsync: this);
    _periodTabs = TabController(length: 3, vsync: this);
    _mainTabs.addListener(_reload);
    _periodTabs.addListener(_reload);
    _load();
  }

  @override
  void dispose() {
    _mainTabs.dispose();
    _periodTabs.dispose();
    super.dispose();
  }

  void _reload() {
    if (!_mainTabs.indexIsChanging && !_periodTabs.indexIsChanging) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final periods = ['daily', 'weekly', 'monthly'];
    final tab = _tabs[_mainTabs.index];
    try {
      final entries = await context.read<WalletService>().fetchLeaderboard(
            period: periods[_periodTabs.index],
            category: tab.$2,
            mode: tab.$3,
          );
      if (mounted) {
        setState(() {
          _entries = entries;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GlowTheme.creamBg,
      appBar: AppBar(
        title: const Text('Rankings'),
        bottom: TabBar(
          controller: _mainTabs,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Host'),
            Tab(text: 'Rich'),
            Tab(text: 'Gift'),
            Tab(text: 'Video'),
          ],
        ),
      ),
      body: Column(
        children: [
          TabBar(
            controller: _periodTabs,
            tabs: const [
              Tab(text: 'Daily'),
              Tab(text: 'Weekly'),
              Tab(text: 'Monthly'),
            ],
          ),
          _promoBanner(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              color: GlowTheme.brand,
              child: _buildList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _promoBanner() {
    final labels = ['Top hosts by gifts & live time', 'Top coin spenders', 'Most gifts sent', 'Top video creators'];
    return GlowPromoBanner(text: labels[_mainTabs.index]);
  }

  Widget _buildList() {
    if (_loading) return const LoadingView(message: 'Loading rankings…');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_entries.isEmpty) {
      return const GlowEmptyState(icon: Icons.leaderboard_outlined, message: 'No rankings yet');
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _entries.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _rankTile(_entries[i]),
    );
  }

  Widget _rankTile(LeaderboardEntry entry) {
    return Container(
      decoration: BoxDecoration(
        color: GlowTheme.creamSurface,
        borderRadius: GlowTheme.radiusMd,
        border: Border.all(color: GlowTheme.border),
        boxShadow: GlowTheme.cardShadow,
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: GlowRankBadge(rank: entry.rank),
        title: Text(entry.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('Score: ${entry.score}', style: const TextStyle(color: GlowTheme.textSecondary)),
        trailing: entry.profilePic != null
            ? CircleAvatar(backgroundImage: CachedNetworkImageProvider(entry.profilePic!))
            : CircleAvatar(
                backgroundColor: GlowTheme.brandLight,
                child: Text(
                  entry.displayName.isNotEmpty ? entry.displayName[0] : '?',
                  style: const TextStyle(color: GlowTheme.brand, fontWeight: FontWeight.w700),
                ),
              ),
      ),
    );
  }
}
