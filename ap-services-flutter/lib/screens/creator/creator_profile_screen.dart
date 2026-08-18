import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/social.dart';
import '../../services/auth_service.dart';
import '../../services/social_service.dart';
import '../../widgets/loading_view.dart';

class CreatorProfileScreen extends StatefulWidget {
  const CreatorProfileScreen({super.key, required this.userId});

  final String userId;

  @override
  State<CreatorProfileScreen> createState() => _CreatorProfileScreenState();
}

class _CreatorProfileScreenState extends State<CreatorProfileScreen> {
  CreatorStats? _stats;
  List<SocialPost> _posts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final social = context.read<SocialService>();
      final stats = await social.getStats(widget.userId);
      final posts = await social.fetchPosts(scope: 'user', limit: 20);
      if (mounted) {
        setState(() {
          _stats = stats;
          _posts = posts.where((p) => p.authorId == widget.userId).toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleFollow() async {
    final social = context.read<SocialService>();
    final following = _stats?.isFollowing ?? false;
    if (following) {
      await social.unfollow(widget.userId);
    } else {
      await social.follow(widget.userId);
    }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthService>().user?.id;
    final isSelf = me == widget.userId;

    return Scaffold(
      appBar: AppBar(title: const Text('Creator Profile')),
      body: _loading
          ? const LoadingView()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: GlowTheme.gold100,
                  child: Text(widget.userId.isNotEmpty ? widget.userId[0] : '?'),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _stat('Following', '${_stats?.following ?? 0}'),
                    _stat('Followers', '${_stats?.followers ?? 0}'),
                    _stat('Posts', '${_stats?.posts ?? 0}'),
                  ],
                ),
                const SizedBox(height: 16),
                if (!isSelf)
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _toggleFollow,
                          child: Text((_stats?.isFollowing ?? false) ? 'Following' : 'Follow'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () {},
                        child: const Text('Message'),
                      ),
                    ],
                  ),
                const SizedBox(height: 24),
                const Text('Posts & Videos', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                if (_posts.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('No posts yet', style: TextStyle(color: GlowTheme.textSecondary)),
                  )
                else
                  ..._posts.map(
                    (p) => ListTile(
                      leading: const Icon(Icons.play_circle_outline),
                      title: Text(p.caption ?? 'Video'),
                      subtitle: Text('${p.likes} likes · ${p.comments} comments'),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        Text(label, style: const TextStyle(color: GlowTheme.textSecondary, fontSize: 12)),
      ],
    );
  }
}
