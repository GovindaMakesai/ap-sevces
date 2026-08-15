import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../services/feature_services.dart';
import '../../widgets/loading_view.dart';

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends State<NotificationSettingsScreen> {
  final Map<String, bool> _settings = {
    'pushEnabled': true,
    'liveParty': true,
    'posts': true,
    'comments': true,
    'messages': true,
    'gifts': true,
    'withdrawals': true,
    'marketing': false,
  };
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await context.read<NotificationService>().getSettings();
      if (mounted) {
        setState(() {
          raw.forEach((k, v) {
            if (_settings.containsKey(k) && v is bool) _settings[k] = v;
          });
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    await context.read<NotificationService>().updateSettings(_settings);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Settings saved')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: _loading
          ? const LoadingView()
          : ListView(
              children: [
                ..._settings.entries.map(
                  (e) => SwitchListTile(
                    title: Text(_label(e.key)),
                    value: e.value,
                    activeThumbColor: GlowTheme.gold500,
                    onChanged: (v) => setState(() => _settings[e.key] = v),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: ElevatedButton(onPressed: _save, child: const Text('Save')),
                ),
              ],
            ),
    );
  }

  String _label(String key) {
    const labels = {
      'pushEnabled': 'Push notifications',
      'liveParty': 'Live & Party',
      'posts': 'Posts',
      'comments': 'Comments',
      'messages': 'Messages',
      'gifts': 'Gifts',
      'withdrawals': 'Withdrawals',
      'marketing': 'Marketing',
    };
    return labels[key] ?? key;
  }
}
