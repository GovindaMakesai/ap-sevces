import 'package:flutter/material.dart';

import '../config/theme.dart';

class SocialBottomNav extends StatelessWidget {
  const SocialBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const labels = ['Video', 'Rankings', 'Explore', 'Chat', 'Profile'];
  static const icons = [
    Icons.play_circle_outline_rounded,
    Icons.leaderboard_outlined,
    Icons.explore_outlined,
    Icons.chat_bubble_outline_rounded,
    Icons.person_outline_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: GlowTheme.creamSurface,
        border: const Border(top: BorderSide(color: GlowTheme.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: List.generate(5, (i) {
              final isCenter = i == 2;
              final selected = currentIndex == i;
              if (isCenter) {
                return Expanded(
                  child: GestureDetector(
                    onTap: () => onTap(i),
                    behavior: HitTestBehavior.opaque,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            gradient: selected ? GlowTheme.brandGradient : GlowTheme.brandGradient,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: GlowTheme.brand.withValues(alpha: 0.28),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.explore_rounded, color: Colors.white, size: 24),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Explore',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: selected ? GlowTheme.brand : GlowTheme.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }
              return Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        icons[i],
                        color: selected ? GlowTheme.brand : GlowTheme.textMuted,
                        size: 22,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        labels[i],
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                          color: selected ? GlowTheme.brand : GlowTheme.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
