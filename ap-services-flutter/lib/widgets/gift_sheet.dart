import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../models/social.dart';

class GiftSheet extends StatelessWidget {
  const GiftSheet({
    super.key,
    required this.gifts,
    required this.onSend,
    required this.balance,
  });

  final List<GiftItem> gifts;
  final void Function(GiftItem gift) onSend;
  final int balance;

  static Future<void> show(
    BuildContext context, {
    required List<GiftItem> gifts,
    required int balance,
    required void Function(GiftItem gift) onSend,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: GlowTheme.creamSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => GiftSheet(gifts: gifts, balance: balance, onSend: onSend),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      maxChildSize: 0.85,
      builder: (_, controller) => Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.black26,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Text('Send Gift', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text('🪙 $balance', style: const TextStyle(fontWeight: FontWeight.w700, color: GlowTheme.gold600)),
              ],
            ),
          ),
          Expanded(
            child: GridView.builder(
              controller: controller,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 0.85,
              ),
              itemCount: gifts.length,
              itemBuilder: (_, i) {
                final gift = gifts[i];
                final canAfford = balance >= gift.cost;
                return InkWell(
                  onTap: canAfford
                      ? () {
                          onSend(gift);
                          Navigator.pop(context);
                        }
                      : null,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: GlowTheme.gold100),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(gift.emoji, style: const TextStyle(fontSize: 28)),
                        const SizedBox(height: 4),
                        Text(gift.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10)),
                        Text('${gift.cost}', style: TextStyle(fontSize: 11, color: canAfford ? GlowTheme.gold600 : Colors.red)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
