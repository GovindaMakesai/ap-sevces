import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/store.dart';
import '../../services/feature_services.dart';
import '../../services/wallet_service.dart';
import '../../widgets/loading_view.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  List<StorePackage> _packages = [];
  int _coins = 0;
  bool _loading = true;
  String _category = 'popular';

  static const categories = [
    ('popular', 'Popular'),
    ('honor', 'Honor'),
    ('ride', 'Ride'),
    ('frame', 'Frame'),
    ('bubble', 'Bubble'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final packages = await context.read<StoreService>().fetchPackages(category: _category);
      final balance = await context.read<WalletService>().getBalance();
      if (mounted) {
        setState(() {
          _packages = packages;
          _coins = balance.coins;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GlowTheme.creamBg,
      appBar: AppBar(
        title: const Text('Store'),
        actions: [
          IconButton(
            icon: const Icon(Icons.emoji_events_outlined),
            tooltip: 'Home',
            onPressed: () => Navigator.pushNamed(context, '/home'),
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: categories.map((c) {
                final selected = _category == c.$1;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(c.$2),
                    selected: selected,
                    selectedColor: GlowTheme.brandLight,
                    labelStyle: TextStyle(
                      color: selected ? GlowTheme.brand : GlowTheme.textSecondary,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    ),
                    side: BorderSide(color: selected ? GlowTheme.brand : GlowTheme.border),
                    onSelected: (_) {
                      setState(() => _category = c.$1);
                      _load();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: _loading
                ? const LoadingView()
                : GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.85,
                    ),
                    itemCount: _packages.length,
                    itemBuilder: (_, i) {
                      final pkg = _packages[i];
                      return _StoreItem(
                        pkg: pkg,
                        onBuy: () async {
                          try {
                            await context.read<StoreService>().purchase(pkg.id);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Purchased!')),
                              );
                              _load();
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('$e')),
                              );
                            }
                          }
                        },
                      );
                    },
                  ),
          ),
          _WalletBar(coins: _coins),
        ],
      ),
    );
  }
}

class _StoreItem extends StatelessWidget {
  const _StoreItem({required this.pkg, required this.onBuy});

  final StorePackage pkg;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: GlowTheme.creamSurface,
        borderRadius: GlowTheme.radiusMd,
        border: Border.all(color: GlowTheme.border),
        boxShadow: GlowTheme.cardShadow,
      ),
      child: InkWell(
        onTap: () => showModalBottomSheet(
          context: context,
          builder: (_) => Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(pkg.emoji, style: const TextStyle(fontSize: 64)),
                Text(pkg.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                Text('${pkg.totalCoins} 🪙', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                ElevatedButton(onPressed: onBuy, child: const Text('Purchase')),
                TextButton(
                  onPressed: () => Navigator.pushNamed(context, '/recharge'),
                  child: const Text('Recharge instead'),
                ),
              ],
            ),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(pkg.emoji, style: const TextStyle(fontSize: 36)),
            Text(pkg.name, textAlign: TextAlign.center, maxLines: 2),
            Text('${pkg.totalCoins} coins', style: const TextStyle(fontWeight: FontWeight.bold, color: GlowTheme.brand)),
          ],
        ),
      ),
    );
  }
}

class _WalletBar extends StatelessWidget {
  const _WalletBar({required this.coins});

  final int coins;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: GlowTheme.creamSurface,
        border: Border(top: BorderSide(color: GlowTheme.border)),
      ),
      child: Row(
        children: [
          Text('$coins coins', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const Spacer(),
          IconButton(
            onPressed: () => Navigator.pushNamed(context, '/recharge'),
            icon: const Icon(Icons.add_circle_rounded, color: GlowTheme.brand),
          ),
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/withdraw'),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
  }
}
