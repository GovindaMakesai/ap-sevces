import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/live_room.dart';
import '../../models/store.dart';
import '../../services/feature_services.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialQuery});

  final String? initialQuery;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late final TextEditingController _query;
  List<SearchResult> _results = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _query = TextEditingController(text: widget.initialQuery ?? '');
    if ((_query.text).length >= 2) _search();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() => _loading = true);
    try {
      final results = await context.read<SearchService>().search(_query.text);
      if (mounted) setState(() {
        _results = results;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(SearchResult r) {
    if (r.type == 'room' && r.channel != null) {
      Navigator.pushNamed(
        context,
        r.channel!.startsWith('party') ? '/party' : '/live',
        arguments: LiveRoom(channel: r.channel!, hostName: r.label),
      );
    } else {
      Navigator.pushNamed(context, '/creator', arguments: r.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _query,
          decoration: const InputDecoration(hintText: 'Nickname or ID number', border: InputBorder.none),
          onSubmitted: (_) => _search(),
        ),
        actions: [IconButton(icon: const Icon(Icons.search), onPressed: _search)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: GlowTheme.gold500))
          : _results.isEmpty
              ? const Center(child: Text('Search users and live rooms', style: TextStyle(color: GlowTheme.textSecondary)))
              : ListView.builder(
                  itemCount: _results.length,
                  itemBuilder: (_, i) {
                    final r = _results[i];
                    return ListTile(
                      leading: Icon(r.type == 'room' ? Icons.live_tv : Icons.person),
                      title: Text(r.label),
                      subtitle: Text(r.subtitle ?? r.type),
                      onTap: () => _open(r),
                    );
                  },
                ),
    );
  }
}
