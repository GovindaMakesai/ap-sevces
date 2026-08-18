import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/feature_services.dart';
import '../../widgets/loading_view.dart';

class StreamerCenterScreen extends StatefulWidget {
  const StreamerCenterScreen({super.key});

  @override
  State<StreamerCenterScreen> createState() => _StreamerCenterScreenState();
}

class _StreamerCenterScreenState extends State<StreamerCenterScreen> {
  bool _loading = true;
  Map<String, dynamic> _stats = {};
  Map<String, dynamic> _access = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final host = context.read<HostService>();
      final stats = await host.getStreamerStats();
      final access = await host.getAccessStatus();
      if (mounted) {
        setState(() {
          _stats = stats;
          _access = access;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verified = _access['verified'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Streamer Center')),
      body: _loading
          ? const LoadingView()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _card('Verification', verified ? 'Verified ✓' : 'Not verified — complete selfie check'),
                _card('Live hours', '${_stats['liveHours'] ?? _stats['hours'] ?? 0}'),
                _card('Party hours', '${_stats['partyHours'] ?? 0}'),
                _card('Gifts received', '${_stats['giftsReceived'] ?? _stats['gifts'] ?? 0}'),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: () => Navigator.pushNamed(context, '/go-live'),
                  icon: const Icon(Icons.videocam),
                  label: const Text('Go Live'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pushNamed(context, '/go-live'),
                  icon: const Icon(Icons.groups),
                  label: const Text('Start Party'),
                ),
                if (!verified)
                  TextButton(
                    onPressed: () => Navigator.pushNamed(context, '/live-verify'),
                    child: const Text('Complete live verification'),
                  ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(label: const Text('Store'), onPressed: () => Navigator.pushNamed(context, '/store')),
                    ActionChip(label: const Text('Recharge'), onPressed: () => Navigator.pushNamed(context, '/recharge')),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _card(String title, String value) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(title: Text(title), subtitle: Text(value)),
    );
  }
}
