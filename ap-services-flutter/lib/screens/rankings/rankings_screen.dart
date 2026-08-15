import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/wallet.dart';
import '../../services/wallet_service.dart';
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
          labelColor: GlowTheme.gold500,
          indicatorColor: GlowTheme.gold500,
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
            labelColor: GlowTheme.gold600,
            indicatorColor: GlowTheme.gold500,
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
              color: GlowTheme.gold500,
              child: _buildList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _promoBanner() {
    final labels = ['Top hosts by gifts & live time', 'Top coin spenders', 'Most gifts sent', 'Top video creators'];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [GlowTheme.gold500, GlowTheme.orangeCta]),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        labels[_mainTabs.index],
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const LoadingView(message: 'Loading rankings…');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_entries.isEmpty) {
      return ListView(children: const [
        SizedBox(height: 60),
        Center(child: Text('No rankings yet', style: TextStyle(color: GlowTheme.textSecondary))),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _entries.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _rankTile(_entries[i]),
    );
  }

  Widget _rankTile(LeaderboardEntry entry) {
    final medal = entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : '#${entry.rank}';
    return Card(
      elevation: 0,
      color: Colors.white,
      child: ListTile(
        leading: SizedBox(
          width: 48,
          child: Text(medal, style: const TextStyle(fontSize: 20), textAlign: TextAlign.center),
        ),
        title: Text(entry.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('Score: ${entry.score}'),
        trailing: entry.profilePic != null
            ? CircleAvatar(backgroundImage: CachedNetworkImageProvider(entry.profilePic!))
            : CircleAvatar(
                backgroundColor: GlowTheme.gold100,
                child: Text(entry.displayName.isNotEmpty ? entry.displayName[0] : '?'),
              ),
      ),
    );
  }
}
