import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../models/live_room.dart';

class RoomCard extends StatelessWidget {
  const RoomCard({
    super.key,
    required this.room,
    required this.onTap,
  });

  final LiveRoom room;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _coverImage(),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.75),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 10,
              left: 10,
              child: _badge(room.isParty ? 'Party' : 'Live'),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: _badge('${room.viewers}'),
            ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Text(
                room.hostName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _coverImage() {
    if (room.coverImage.isEmpty) {
      return Container(
        color: GlowTheme.purple500.withValues(alpha: 0.35),
        child: const Center(
          child: Icon(Icons.videocam_rounded, color: Colors.white54, size: 40),
        ),
      );
    }
    return CachedNetworkImage(
      imageUrl: room.coverImage,
      fit: BoxFit.cover,
      placeholder: (_, __) => Container(color: GlowTheme.gold500.withValues(alpha: 0.2)),
      errorWidget: (_, __, ___) => Container(
        color: GlowTheme.purple500.withValues(alpha: 0.35),
        child: const Icon(Icons.person, color: Colors.white54, size: 40),
      ),
    );
  }

  Widget _badge(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}
