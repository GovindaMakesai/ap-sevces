import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/conversation.dart';
import '../../services/auth_service.dart';
import '../../services/chat_service.dart';
import '../../services/socket_service.dart';
import '../../widgets/loading_view.dart';

class ChatThreadScreen extends StatefulWidget {
  const ChatThreadScreen({
    super.key,
    required this.conversationId,
    required this.otherUserName,
  });

  final String conversationId;
  final String otherUserName;

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessage> _messages = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    context.read<SocketService>().off('receive_message');
    super.dispose();
  }

  Future<void> _boot() async {
    final auth = context.read<AuthService>();
    final chat = context.read<ChatService>();
    final socket = context.read<SocketService>();
    final myId = auth.user?.id;

    try {
      final token = await auth.ensureAccessToken();
      if (token != null) {
        await socket.connect(token);
        socket.joinConversation(widget.conversationId);
        socket.on('receive_message', (data) {
          if (data is Map && data['conversationId']?.toString() == widget.conversationId) {
            final msg = ChatMessage.fromJson(Map<String, dynamic>.from(data), myUserId: myId);
            if (mounted) setState(() => _messages.add(msg));
            _scrollToBottom();
          }
        });
      }

      final messages = await chat.fetchMessages(widget.conversationId, myUserId: myId);
      if (mounted) {
        setState(() {
          _messages = messages;
          _loading = false;
        });
        _scrollToBottom();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();

    final chat = context.read<ChatService>();
    final socket = context.read<SocketService>();
    final myId = context.read<AuthService>().user?.id;

    socket.sendSocketMessage(widget.conversationId, text);
    try {
      final msg = await chat.sendMessage(
        conversationId: widget.conversationId,
        content: text,
        myUserId: myId,
      );
      if (mounted) setState(() => _messages.add(msg));
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Send failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.otherUserName)),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const LoadingView()
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      return Align(
                        alignment: m.isMine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: m.isMine
                                ? GlowTheme.gold500
                                : Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.05),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: Text(
                            m.content,
                            style: TextStyle(
                              color: m.isMine ? Colors.white : GlowTheme.textPrimary,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: const InputDecoration(hintText: 'Type a message…'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    onPressed: _send,
                    icon: const Icon(Icons.send_rounded, color: GlowTheme.gold500),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
