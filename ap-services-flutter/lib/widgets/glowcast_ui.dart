import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../config/theme.dart';

class GlowBrandMark extends StatelessWidget {
  const GlowBrandMark({super.key, this.size = 72, this.showLabel = false});

  final double size;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: GlowTheme.brandGradient,
            borderRadius: BorderRadius.circular(size * 0.28),
            boxShadow: [
              BoxShadow(
                color: GlowTheme.brand.withValues(alpha: 0.35),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Icon(
            Icons.bolt_rounded,
            color: Colors.white,
            size: size * 0.52,
          ),
        ),
        if (showLabel) ...[
          const SizedBox(height: 16),
          Text(
            AppConfig.appName,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
              color: Colors.white,
            ),
          ),
        ],
      ],
    );
  }
}

class GlowSectionTitle extends StatelessWidget {
  const GlowSectionTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          color: GlowTheme.textMuted,
          fontSize: 11,
          letterSpacing: 1.1,
        ),
      ),
    );
  }
}

class GlowPageHeader extends StatelessWidget {
  const GlowPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                    color: GlowTheme.textPrimary,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 13),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class GlowPromoBanner extends StatelessWidget {
  const GlowPromoBanner({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: GlowTheme.brandGradient,
        borderRadius: GlowTheme.radiusMd,
        boxShadow: [
          BoxShadow(
            color: GlowTheme.brand.withValues(alpha: 0.2),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
      ),
    );
  }
}

class GlowEmptyState extends StatelessWidget {
  const GlowEmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.18),
        Icon(icon, size: 56, color: GlowTheme.textMuted.withValues(alpha: 0.5)),
        const SizedBox(height: 16),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 15),
        ),
        if (actionLabel != null && onAction != null) ...[
          const SizedBox(height: 20),
          Center(
            child: OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
          ),
        ],
      ],
    );
  }
}

class GlowRankBadge extends StatelessWidget {
  const GlowRankBadge({super.key, required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg = Colors.white;
    if (rank == 1) {
      bg = const Color(0xFFF59E0B);
    } else if (rank == 2) {
      bg = const Color(0xFF94A3B8);
    } else if (rank == 3) {
      bg = const Color(0xFFCD7F32);
    } else {
      bg = GlowTheme.surfaceMuted;
      fg = GlowTheme.textSecondary;
    }

    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Text(
        '$rank',
        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: rank <= 3 ? 15 : 13),
      ),
    );
  }
}

class GlowChatTile extends StatelessWidget {
  const GlowChatTile({
    super.key,
    required this.name,
    required this.preview,
    required this.onTap,
    this.unread = 0,
  });

  final String name;
  final String preview;
  final VoidCallback onTap;
  final int unread;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Material(
        color: GlowTheme.creamSurface,
        borderRadius: GlowTheme.radiusMd,
        child: InkWell(
          onTap: onTap,
          borderRadius: GlowTheme.radiusMd,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: GlowTheme.radiusMd,
              border: Border.all(color: GlowTheme.border),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: GlowTheme.brandLight,
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: const TextStyle(
                      color: GlowTheme.brand,
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        preview,
                        style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 13),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (unread > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: GlowTheme.accentLive,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '$unread',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class GlowMenuTile extends StatelessWidget {
  const GlowMenuTile({
    super.key,
    required this.icon,
    required this.title,
    this.onTap,
    this.highlight = false,
  });

  final IconData icon;
  final String title;
  final VoidCallback? onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: highlight ? GlowTheme.brandLight : GlowTheme.creamSurface,
        borderRadius: GlowTheme.radiusMd,
        child: InkWell(
          onTap: onTap,
          borderRadius: GlowTheme.radiusMd,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: GlowTheme.radiusMd,
              border: Border.all(
                color: highlight ? GlowTheme.brand.withValues(alpha: 0.2) : GlowTheme.border,
              ),
            ),
            child: ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: GlowTheme.brand.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: GlowTheme.brand, size: 22),
              ),
              title: Text(
                title,
                style: TextStyle(
                  fontWeight: highlight ? FontWeight.w600 : FontWeight.w500,
                  color: GlowTheme.textPrimary,
                ),
              ),
              trailing: Icon(Icons.arrow_forward_ios_rounded, size: 14, color: GlowTheme.textMuted),
            ),
          ),
        ),
      ),
    );
  }
}
