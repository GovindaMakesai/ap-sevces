import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/live_room.dart';
import '../../services/feature_services.dart';
import '../../widgets/loading_view.dart';

class GoLiveScreen extends StatefulWidget {
  const GoLiveScreen({super.key});

  @override
  State<GoLiveScreen> createState() => _GoLiveScreenState();
}

class _GoLiveScreenState extends State<GoLiveScreen> {
  bool _loading = true;
  bool _verified = false;
  String? _title;
  _BroadcastMode _mode = _BroadcastMode.video;

  @override
  void initState() {
    super.initState();
    _checkAccess();
  }

  Future<void> _checkAccess() async {
    try {
      final status = await context.read<HostService>().getAccessStatus();
      if (mounted) {
        setState(() {
          _verified = status['verified'] == true || status['canGoLive'] == true;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _start() {
    if (_mode == _BroadcastMode.video && !_verified) {
      Navigator.pushNamed(context, '/live-verify');
      return;
    }
    final prefix = _mode == _BroadcastMode.party ? 'party' : 'live';
    final channel = '$prefix-${DateTime.now().millisecondsSinceEpoch}';
    final room = LiveRoom(
      channel: channel,
      hostName: 'You',
      isParty: _mode == _BroadcastMode.party,
      title: _title,
    );
    final route = _mode == _BroadcastMode.party ? '/party' : '/live';
    Navigator.pushReplacementNamed(context, route, arguments: room.copyAsHost());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Go Live')),
      body: _loading
          ? const LoadingView(message: 'Checking access…')
          : Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    decoration: const InputDecoration(labelText: 'Stream title (optional)'),
                    onChanged: (v) => _title = v,
                  ),
                  const SizedBox(height: 20),
                  _modeCard(
                    '📹 Video Live',
                    'Broadcast with camera',
                    _BroadcastMode.video,
                    !_verified ? 'Verification required' : null,
                  ),
                  const SizedBox(height: 12),
                  _modeCard('🎙️ Party Room', 'Voice party with seats', _BroadcastMode.party, null),
                  const SizedBox(height: 12),
                  _modeCard('🔊 Audio Live', 'Audio-only broadcast', _BroadcastMode.audio, null),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: _start,
                    child: Text(_mode == _BroadcastMode.party ? 'Start Party' : 'Go Live'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _modeCard(String title, String subtitle, _BroadcastMode mode, String? badge) {
    final selected = _mode == mode;
    return InkWell(
      onTap: () => setState(() => _mode = mode),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? GlowTheme.gold500.withValues(alpha: 0.12) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? GlowTheme.gold500 : Colors.black12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(subtitle, style: const TextStyle(color: GlowTheme.textSecondary)),
                  if (badge != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(badge, style: const TextStyle(color: GlowTheme.orangeCta, fontSize: 12)),
                    ),
                ],
              ),
            ),
            if (selected) const Icon(Icons.check_circle, color: GlowTheme.gold500),
          ],
        ),
      ),
    );
  }
}

enum _BroadcastMode { video, party, audio }

extension on LiveRoom {
  LiveRoom copyAsHost() => LiveRoom(
        channel: channel,
        hostName: hostName,
        hostId: hostId,
        isParty: isParty,
        title: title,
        viewers: viewers,
      );
}
