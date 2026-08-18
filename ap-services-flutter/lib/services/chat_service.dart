import '../models/conversation.dart';
import 'api_client.dart';

class ChatService {
  ChatService(this._api);

  final ApiClient _api;

  Future<List<Conversation>> fetchConversations() async {
    final res = await _api.getJson('/messages/conversations');
    return _api.extractList(res).map(Conversation.fromJson).toList();
  }

  Future<List<ChatMessage>> fetchMessages(String conversationId, {String? myUserId}) async {
    final res = await _api.getJson('/messages/$conversationId');
    final list = _api.extractList(res);
    if (list.isEmpty && res['data'] is Map) {
      final messages = (res['data'] as Map)['messages'];
      if (messages is List) {
        return messages
            .cast<Map<String, dynamic>>()
            .map((m) => ChatMessage.fromJson(m, myUserId: myUserId))
            .toList();
      }
    }
    return list.map((m) => ChatMessage.fromJson(m, myUserId: myUserId)).toList();
  }

  Future<Conversation> createConversation(String receiverId) async {
    final res = await _api.postJson('/messages/conversations', body: {
      'receiverId': receiverId,
    });
    final data = res['data'] as Map<String, dynamic>? ?? res;
    return Conversation.fromJson(data);
  }

  Future<ChatMessage> sendMessage({
    required String conversationId,
    required String content,
    String? myUserId,
  }) async {
    final res = await _api.postJson('/messages/send', body: {
      'conversationId': conversationId,
      'content': content,
    });
    final data = res['data'] as Map<String, dynamic>? ?? res;
    return ChatMessage.fromJson(data, myUserId: myUserId);
  }

  Future<int> unreadCount() async {
    final res = await _api.getJson('/messages/unread-count');
    final data = res['data'];
    if (data is Map) return (data['count'] ?? data['unreadCount'] ?? 0) as int;
    return (res['count'] ?? 0) as int;
  }
}
