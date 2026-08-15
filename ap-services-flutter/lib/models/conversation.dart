class Conversation {
  const Conversation({
    required this.id,
    required this.otherUserId,
    required this.otherUserName,
    this.otherUserPic,
    this.lastMessage,
    this.lastMessageAt,
    this.unreadCount = 0,
  });

  final String id;
  final String otherUserId;
  final String otherUserName;
  final String? otherUserPic;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final other = json['otherUser'] as Map<String, dynamic>? ??
        json['other_user'] as Map<String, dynamic>? ??
        {};
    final lastAt = json['lastMessageAt'] ?? json['last_message_at'] ?? json['updatedAt'];

    return Conversation(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      otherUserId: other['id']?.toString() ?? json['otherUserId']?.toString() ?? '',
      otherUserName: other['first_name']?.toString() ??
          other['name']?.toString() ??
          json['otherUserName']?.toString() ??
          'User',
      otherUserPic: other['profile_pic']?.toString() ?? other['profilePic']?.toString(),
      lastMessage: json['lastMessage']?.toString() ?? json['last_message']?.toString(),
      lastMessageAt: lastAt != null ? DateTime.tryParse(lastAt.toString()) : null,
      unreadCount: (json['unreadCount'] ?? json['unread_count'] ?? 0) as int,
    );
  }
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.content,
    required this.createdAt,
    this.isMine = false,
  });

  final String id;
  final String senderId;
  final String content;
  final DateTime createdAt;
  final bool isMine;

  factory ChatMessage.fromJson(Map<String, dynamic> json, {String? myUserId}) {
    final senderId = json['senderId']?.toString() ??
        json['sender_id']?.toString() ??
        json['sender']?['id']?.toString() ??
        '';
    final created = json['createdAt'] ?? json['created_at'] ?? DateTime.now().toIso8601String();

    return ChatMessage(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      senderId: senderId,
      content: json['content']?.toString() ?? json['message']?.toString() ?? '',
      createdAt: DateTime.tryParse(created.toString()) ?? DateTime.now(),
      isMine: myUserId != null && senderId == myUserId,
    );
  }
}
