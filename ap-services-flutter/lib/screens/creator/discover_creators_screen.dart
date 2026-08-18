import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/social.dart';
import '../../services/social_service.dart';
import '../../widgets/loading_view.dart';

class DiscoverCreatorsScreen extends StatefulWidget {
  const DiscoverCreatorsScreen({super.key});

  @override
  State<DiscoverCreatorsScreen> createState() => _DiscoverCreatorsScreenState();
}

class _DiscoverCreatorsScreenState extends State<DiscoverCreatorsScreen> {
  List<DiscoverCreator> _creators = [];
  bool _loading = true;
  String _period = 'weekly';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await context.read<SocialService>().discoverCreators(period: _period);
      if (mounted) setState(() {
        _creators = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover Creators'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              _period = v;
              _load();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'weekly', child: Text('Weekly')),
              PopupMenuItem(value: 'monthly', child: Text('Monthly')),
            ],
          ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : ListView.separated(
              itemCount: _creators.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final c = _creators[i];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: GlowTheme.gold100,
                    child: Text(c.name.isNotEmpty ? c.name[0] : '?'),
                  ),
                  title: Row(
                    children: [
                      Text(c.name),
                      if (c.isLive) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(8)),
                          child: const Text('LIVE', style: TextStyle(color: Colors.white, fontSize: 10)),
                        ),
                      ],
                    ],
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.pushNamed(context, '/creator', arguments: c.userId),
                );
              },
            ),
    );
  }
}
