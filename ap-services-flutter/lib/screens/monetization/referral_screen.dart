import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../services/feature_services.dart';
import '../../widgets/loading_view.dart';

class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key});

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  bool _loading = true;
  String _code = '';
  int _invites = 0;
  num _earnings = 0;
  final _applyCode = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _applyCode.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final dash = await context.read<ReferralService>().getDashboard();
      if (mounted) {
        setState(() {
          _code = dash.myCode;
          _invites = dash.totalInvites;
          _earnings = dash.totalEarnings;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _invite() async {
    try {
      final link = await context.read<ReferralService>().generateLink();
      await Clipboard.setData(ClipboardData(text: link.isNotEmpty ? link : _code));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invite link copied!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Invite Friends')),
      body: _loading
          ? const LoadingView()
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [GlowTheme.gold500, GlowTheme.orangeCta]),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Earn \$14 per friend', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                      SizedBox(height: 8),
                      Text('Invite friends to join GlowCast', style: TextStyle(color: Colors.white70)),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                ListTile(
                  title: const Text('My referral ID'),
                  subtitle: Text(_code.isEmpty ? 'Generate by inviting' : _code),
                  trailing: IconButton(
                    icon: const Icon(Icons.copy),
                    onPressed: _code.isEmpty ? null : () => Clipboard.setData(ClipboardData(text: _code)),
                  ),
                ),
                Row(
                  children: [
                    Expanded(child: _StatCard('Invites', '$_invites')),
                    const SizedBox(width: 12),
                    Expanded(child: _StatCard('Earnings', '\$$_earnings')),
                  ],
                ),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: _invite,
                  icon: const Icon(Icons.share),
                  label: const Text('Invite Now'),
                ),
                const SizedBox(height: 24),
                const Text('Have a friend\'s ID?', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                TextField(
                  controller: _applyCode,
                  decoration: const InputDecoration(hintText: 'Enter referral code'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () async {
                    try {
                      await context.read<ReferralService>().applyCode(_applyCode.text.trim());
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Referral applied!')),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                  child: const Text('Apply Code'),
                ),
              ],
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          Text(label, style: const TextStyle(color: GlowTheme.textSecondary)),
        ],
      ),
    );
  }
}
