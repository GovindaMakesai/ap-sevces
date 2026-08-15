import 'package:flutter/material.dart';

import '../../config/theme.dart';

class VipScreen extends StatelessWidget {
  const VipScreen({super.key});

  static const tiers = ['Normal', 'Super', 'Diamond', 'SVIP'];
  static const privileges = [
    'Exclusive badge', 'Entry effects', 'VIP gifts', 'Priority support',
    'Custom ride', 'Avatar frame', 'Chat bubble', 'Room background',
    'No ads', 'Higher gift limits', 'Party crown seat', 'Profile highlight',
  ];

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: GlowTheme.vipBg,
        appBar: AppBar(
          backgroundColor: GlowTheme.vipBg,
          foregroundColor: Colors.white,
          title: const Text('VIP Privileges'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Guardian'),
              Tab(text: 'VIP'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _tierList(context),
            _tierList(context),
          ],
        ),
      ),
    );
  }

  Widget _tierList(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: tiers
              .map(
                (t) => Chip(
                  label: Text(t),
                  backgroundColor: GlowTheme.vipCard,
                  side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
                  labelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 16),
        ...privileges.map(
          (p) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: GlowTheme.vipCard,
              borderRadius: GlowTheme.radiusMd,
              border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
            ),
            child: ListTile(
              leading: const Icon(Icons.check_circle_rounded, color: GlowTheme.brand),
              title: Text(p, style: const TextStyle(color: Colors.white)),
            ),
          ),
        ),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: () => Navigator.pushNamed(context, '/recharge'),
          child: const Text('Open SVIP'),
        ),
      ],
    );
  }
}
