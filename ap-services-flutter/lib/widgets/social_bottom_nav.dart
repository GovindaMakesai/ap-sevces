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
    Icons.play_circle_outline,
    Icons.emoji_events_outlined,
    Icons.explore,
    Icons.chat_bubble_outline,
    Icons.person_outline,
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 62 + MediaQuery.paddingOf(context).bottom,
      decoration: BoxDecoration(
        color: GlowTheme.creamSurface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: List.generate(5, (i) {
            final isCenter = i == 2;
            final selected = currentIndex == i;
            if (isCenter) {
              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: selected
                                ? [GlowTheme.orangeCta, GlowTheme.gold500]
                                : [GlowTheme.gold500, GlowTheme.gold600],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: GlowTheme.gold500.withValues(alpha: 0.4),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Icon(Icons.explore, color: Colors.white, size: 28),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Explore',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                          color: selected ? GlowTheme.gold500 : GlowTheme.textSecondary,
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
                      color: selected ? GlowTheme.gold500 : GlowTheme.textSecondary,
                      size: 24,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: selected ? GlowTheme.gold500 : GlowTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
