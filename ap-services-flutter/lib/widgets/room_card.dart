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
        borderRadius: GlowTheme.radiusMd,
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
                    Colors.black.withValues(alpha: 0.08),
                    Colors.black.withValues(alpha: 0.82),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 10,
              left: 10,
              child: _badge(
                room.isParty ? 'Party' : 'LIVE',
                gradient: room.isParty ? GlowTheme.brandGradient : GlowTheme.liveGradient,
              ),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: _badge('${room.viewers} watching', solid: true),
            ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    room.hostName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  if ((room.title ?? '').isNotEmpty)
                    Text(
                      room.title!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 12),
                    ),
                ],
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
        decoration: const BoxDecoration(gradient: GlowTheme.brandGradient),
        child: const Center(
          child: Icon(Icons.videocam_rounded, color: Colors.white54, size: 40),
        ),
      );
    }
    return CachedNetworkImage(
      imageUrl: room.coverImage,
      fit: BoxFit.cover,
      placeholder: (_, __) => Container(color: GlowTheme.surfaceMuted),
      errorWidget: (_, __, ___) => Container(
        decoration: const BoxDecoration(gradient: GlowTheme.brandGradient),
        child: const Icon(Icons.person_rounded, color: Colors.white54, size: 40),
      ),
    );
  }

  Widget _badge(String label, {LinearGradient? gradient, bool solid = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        gradient: gradient,
        color: solid ? Colors.black.withValues(alpha: 0.45) : null,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
      ),
    );
  }
}
