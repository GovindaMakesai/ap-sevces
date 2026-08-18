import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';

class SocketService {
  io.Socket? _socket;

  io.Socket? get socket => _socket;
  bool get isConnected => _socket?.connected ?? false;

  /// Socket events allowed in read-only preview (watch/listen only).
  static const _readOnlyAllowedEmits = {
    'live:join',
    'live:leave',
    'live:heartbeat',
    'live:request_state',
    'join_conversation',
  };

  void _emit(String event, [dynamic data]) {
    if (AppConfig.readOnlyMode && !_readOnlyAllowedEmits.contains(event)) {
      return;
    }
    _socket?.emit(event, data);
  }

  Future<io.Socket> connect(String token) async {
    if (_socket?.connected == true) return _socket!;

    _socket?.dispose();
    _socket = io.io(
      AppConfig.backendUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionAttempts(25)
          .setAuth({'token': token})
          .build(),
    );
    _socket!.connect();
    return _socket!;
  }

  void joinLiveRoom(String channel, {bool isParty = false}) {
    _emit('live:join', {
      'channel': channel,
      'roomType': isParty ? 'party' : 'live',
    });
  }

  void leaveLiveRoom(String channel) {
    _emit('live:leave', {'channel': channel});
  }

  void sendLiveChat(String channel, String message) {
    _emit('live:chat', {'channel': channel, 'message': message});
  }

  void sendGift(String channel, {required String giftId, int quantity = 1}) {
    _emit('live:gift', {
      'channel': channel,
      'giftId': giftId,
      'quantity': quantity,
    });
  }

  void joinConversation(String conversationId) {
    _emit('join_conversation', {'conversationId': conversationId});
  }

  void sendTyping(String conversationId) {
    _emit('typing', {'conversationId': conversationId});
  }

  void sendSocketMessage(String conversationId, String content) {
    _emit('send_message', {
      'conversationId': conversationId,
      'content': content,
    });
  }

  void on(String event, void Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
