import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/store.dart';
import '../../services/feature_services.dart';
import '../../services/wallet_service.dart';
import '../../widgets/loading_view.dart';

class RechargeScreen extends StatefulWidget {
  const RechargeScreen({super.key});

  @override
  State<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends State<RechargeScreen> {
  List<StorePackage> _packages = [];
  bool _loading = true;
  final _amount = TextEditingController();
  final _utr = TextEditingController();
  String? _proofPath;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    _utr.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final packages = await context.read<StoreService>().fetchPackages();
      if (mounted) setState(() {
        _packages = packages;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await context.read<WalletService>().submitRecharge(
            amount: num.tryParse(_amount.text) ?? 0,
            utr: _utr.text.trim().isEmpty ? null : _utr.text.trim(),
            proofPath: _proofPath,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Recharge submitted for review')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recharge Coins')),
      body: _loading
          ? const LoadingView()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Select package or enter custom amount', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ..._packages.take(6).map(
                      (p) => ListTile(
                        leading: Text(p.emoji, style: const TextStyle(fontSize: 24)),
                        title: Text(p.name),
                        subtitle: Text('${p.totalCoins} coins · ₹${p.priceInr ?? '-'}'),
                        trailing: ElevatedButton(
                          onPressed: () {
                            _amount.text = '${p.priceInr ?? p.totalCoins}';
                            _submit();
                          },
                          child: const Text('Buy'),
                        ),
                      ),
                    ),
                const Divider(height: 32),
                TextField(
                  controller: _amount,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount paid (INR)'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _utr,
                  decoration: const InputDecoration(labelText: 'UTR / Transaction ID'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final f = await ImagePicker().pickImage(source: ImageSource.gallery);
                    if (f != null) setState(() => _proofPath = f.path);
                  },
                  icon: const Icon(Icons.upload),
                  label: Text(_proofPath == null ? 'Upload payment screenshot' : 'Screenshot attached'),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Submit Recharge'),
                ),
              ],
            ),
    );
  }
}

class PointsScreen extends StatelessWidget {
  const PointsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: context.read<WalletService>().getBalance(),
      builder: (context, snap) {
        final points = snap.data?.points ?? 0;
        return Scaffold(
          appBar: AppBar(title: const Text('Points')),
          body: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [GlowTheme.purple500, GlowTheme.purple600]),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Your Points', style: TextStyle(color: Colors.white70)),
                      Text('$points', style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/withdraw'),
                  child: const Text('Withdraw / Exchange'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
