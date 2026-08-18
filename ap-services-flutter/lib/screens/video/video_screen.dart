import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/social.dart';
import '../../services/social_service.dart';
import '../../widgets/loading_view.dart';

class VideoScreen extends StatefulWidget {
  const VideoScreen({super.key});

  @override
  State<VideoScreen> createState() => _VideoScreenState();
}

class _VideoScreenState extends State<VideoScreen> with TickerProviderStateMixin {
  late TabController _scopeTabs;
  late TabController _topTabs;
  List<SocialPost> _posts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _topTabs = TabController(length: 3, vsync: this);
    _scopeTabs = TabController(length: 3, vsync: this);
    _topTabs.addListener(_reload);
    _scopeTabs.addListener(_reload);
    _load();
  }

  @override
  void dispose() {
    _topTabs.dispose();
    _scopeTabs.dispose();
    super.dispose();
  }

  void _reload() {
    if (!_topTabs.indexIsChanging && !_scopeTabs.indexIsChanging) _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final scopes = ['for_you', 'following', 'latest'];
    try {
      final posts = await context.read<SocialService>().fetchPosts(
            scope: scopes[_scopeTabs.index],
          );
      if (mounted) setState(() {
        _posts = posts;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            TabBar(
              controller: _topTabs,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white54,
              indicatorColor: GlowTheme.gold500,
              tabs: const [
                Tab(text: 'Following'),
                Tab(text: 'Video'),
                Tab(text: 'Square'),
              ],
            ),
            TabBar(
              controller: _scopeTabs,
              isScrollable: true,
              labelColor: GlowTheme.gold500,
              unselectedLabelColor: Colors.white70,
              indicatorColor: GlowTheme.gold500,
              tabs: const [
                Tab(text: 'For You'),
                Tab(text: 'Following'),
                Tab(text: 'Latest'),
              ],
            ),
            Expanded(child: _buildFeed()),
          ],
        ),
      ),
    );
  }

  Widget _buildFeed() {
    if (_loading) return const LoadingView(message: 'Loading reels…');
    if (_posts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.play_circle_outline, size: 64, color: Colors.white38),
            const SizedBox(height: 12),
            Text(
              _topTabs.index == 2 ? 'Square feed' : 'No videos yet',
              style: const TextStyle(color: Colors.white70),
            ),
          ],
        ),
      );
    }

    return PageView.builder(
      scrollDirection: Axis.vertical,
      itemCount: _posts.length,
      itemBuilder: (_, i) => _ReelPage(post: _posts[i], onLike: _load),
    );
  }
}

class _ReelPage extends StatelessWidget {
  const _ReelPage({required this.post, required this.onLike});

  final SocialPost post;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    final social = context.read<SocialService>();
    return Stack(
      fit: StackFit.expand,
      children: [
        if (post.mediaUrl != null && post.mediaUrl!.isNotEmpty)
          CachedNetworkImage(imageUrl: post.mediaUrl!, fit: BoxFit.cover)
        else
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [GlowTheme.purple500.withValues(alpha: 0.5), GlowTheme.liveDark],
              ),
            ),
          ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black.withValues(alpha: 0.65)],
            ),
          ),
        ),
        Positioned(
          right: 12,
          bottom: 100,
          child: Column(
            children: [
              _ActionIcon(
                icon: post.liked ? Icons.favorite : Icons.favorite_border,
                label: '${post.likes}',
                onTap: () async {
                  await social.likePost(post.id);
                  onLike();
                },
              ),
              _ActionIcon(icon: Icons.comment, label: '${post.comments}', onTap: () {}),
              _ActionIcon(icon: Icons.card_giftcard, label: 'Gift', onTap: () {}),
              _ActionIcon(icon: Icons.share, label: 'Share', onTap: () {}),
            ],
          ),
        ),
        Positioned(
          left: 16,
          right: 80,
          bottom: 24,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/creator', arguments: post.authorId),
                child: Text(
                  '@${post.authorName}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
              if (post.caption != null && post.caption!.isNotEmpty)
                Text(post.caption!, style: const TextStyle(color: Colors.white70)),
            ],
          ),
        ),
      ],
    );
  }
}

class _ActionIcon extends StatelessWidget {
  const _ActionIcon({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: onTap,
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 30),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
