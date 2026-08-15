import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/conversation.dart';
import '../../services/chat_service.dart';
import '../../widgets/glowcast_ui.dart';
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
      backgroundColor: GlowTheme.creamBg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const GlowPageHeader(
              title: 'Messages',
              subtitle: 'Chat with creators and friends',
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                color: GlowTheme.brand,
                child: _loading
                    ? const LoadingView(message: 'Loading conversations…')
                    : _error != null
                        ? ErrorView(message: _error!, onRetry: _load)
                        : _conversations.isEmpty
                            ? const GlowEmptyState(
                                icon: Icons.chat_bubble_outline_rounded,
                                message: 'No messages yet',
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.only(bottom: 16),
                                itemCount: _conversations.length,
                                itemBuilder: (_, i) {
                                  final c = _conversations[i];
                                  return GlowChatTile(
                                    name: c.otherUserName,
                                    preview: c.lastMessage ?? 'Start chatting',
                                    unread: c.unreadCount,
                                    onTap: () => _open(c),
                                  );
                                },
                              ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
