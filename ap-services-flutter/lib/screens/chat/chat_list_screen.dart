import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/conversation.dart';
import '../../services/chat_service.dart';
import '../../widgets/loading_view.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Conversation> _conversations = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await context.read<ChatService>().fetchConversations();
      if (mounted) setState(() {
        _conversations = list;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _open(Conversation c) {
    Navigator.of(context).pushNamed('/chat-thread', arguments: {
      'conversationId': c.id,
      'otherUserName': c.otherUserName,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: GlowTheme.gold500,
        child: _loading
            ? const LoadingView(message: 'Loading conversations…')
            : _error != null
                ? ErrorView(message: _error!, onRetry: _load)
                : _conversations.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 80),
                          Center(child: Text('No messages yet', style: TextStyle(color: GlowTheme.textSecondary))),
                        ],
                      )
                    : ListView.separated(
                        itemCount: _conversations.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final c = _conversations[i];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: GlowTheme.gold500.withValues(alpha: 0.2),
                              child: Text(c.otherUserName.isNotEmpty ? c.otherUserName[0].toUpperCase() : '?'),
                            ),
                            title: Text(c.otherUserName, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text(c.lastMessage ?? 'Start chatting'),
                            trailing: c.unreadCount > 0
                                ? CircleAvatar(
                                    radius: 12,
                                    backgroundColor: GlowTheme.orangeCta,
                                    child: Text('${c.unreadCount}', style: const TextStyle(fontSize: 11, color: Colors.white)),
                                  )
                                : null,
                            onTap: () => _open(c),
                          );
                        },
                      ),
      ),
    );
  }
}
