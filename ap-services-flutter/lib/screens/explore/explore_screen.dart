import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/live_room.dart';
import '../../services/live_service.dart';
import '../../widgets/loading_view.dart';
import '../../widgets/room_card.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<LiveRoom> _rooms = [];
  bool _loading = true;
  String? _error;
  final _search = TextEditingController();

  static const _tabKeys = ['following', 'live', 'party', 'new', 'nearby'];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabKeys.length, vsync: this, initialIndex: 1);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) _loadRooms();
    });
    _loadRooms();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _loadRooms() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final live = context.read<LiveService>();
    final tab = _tabKeys[_tabs.index];
    try {
      List<LiveRoom> rooms;
      if (tab == 'following') {
        rooms = await live.fetchFollowingLive();
      } else if (tab == 'party') {
        rooms = await live.fetchRooms(party: true);
      } else {
        final sort = tab == 'new' ? 'new' : 'trending';
        rooms = await live.fetchRooms(party: false, sort: sort);
      }

      final query = _search.text.trim().toLowerCase();
      if (query.isNotEmpty) {
        rooms = rooms.where((r) {
          return r.hostName.toLowerCase().contains(query) ||
              r.channel.toLowerCase().contains(query);
        }).toList();
      }

      if (mounted) {
        setState(() {
          _rooms = rooms;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  void _openRoom(LiveRoom room) {
    final route = room.isParty ? '/party' : '/live';
    Navigator.of(context).pushNamed(route, arguments: room);
  }

  void _openSearch() {
    Navigator.pushNamed(context, '/search', arguments: _search.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.extended(
            heroTag: 'party',
            backgroundColor: GlowTheme.purple500,
            onPressed: () => Navigator.pushNamed(context, '/go-live'),
            icon: const Icon(Icons.groups),
            label: const Text('Party'),
          ),
          const SizedBox(height: 10),
          FloatingActionButton.extended(
            heroTag: 'live',
            onPressed: () => Navigator.pushNamed(context, '/go-live'),
            icon: const Icon(Icons.videocam),
            label: const Text('Go Live'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: TextField(
                controller: _search,
                decoration: InputDecoration(
                  hintText: 'Nickname or ID number',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.refresh),
                    onPressed: _loadRooms,
                  ),
                ),
                onSubmitted: (_) => _openSearch(),
                onTap: () => Navigator.pushNamed(context, '/search', arguments: _search.text.trim()),
              ),
            ),
            TabBar(
              controller: _tabs,
              isScrollable: true,
              labelColor: GlowTheme.gold500,
              unselectedLabelColor: GlowTheme.textSecondary,
              indicatorColor: GlowTheme.gold500,
              tabs: const [
                Tab(text: 'Following'),
                Tab(text: 'Live'),
                Tab(text: 'Party'),
                Tab(text: 'New'),
                Tab(text: 'Nearby'),
              ],
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _loadRooms,
                color: GlowTheme.gold500,
                child: _buildBody(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const LoadingView(message: 'Loading rooms…');
    if (_error != null) {
      return ErrorView(message: _error!, onRetry: _loadRooms);
    }
    if (_rooms.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No live rooms right now', style: TextStyle(color: GlowTheme.textSecondary))),
        ],
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.72,
      ),
      itemCount: _rooms.length,
      itemBuilder: (_, i) => RoomCard(room: _rooms[i], onTap: () => _openRoom(_rooms[i])),
    );
  }
}
