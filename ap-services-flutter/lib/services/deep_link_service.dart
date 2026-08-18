import '../models/live_room.dart';

/// Flutter route target from ap-services-app pushNotifications.resolvePushDeepLink.
class DeepLinkTarget {
  const DeepLinkTarget({required this.route, this.arguments});

  final String route;
  final Object? arguments;
}

/// Maps `aplive://` / `apservices://` and FCM data payloads to native Flutter routes.
class DeepLinkService {
  static final _schemePattern = RegExp(r'^(?:glowcast|aplive|apservices)://(.+)$', caseSensitive: false);

  static DeepLinkTarget? resolve(Object? urlOrData) {
    final raw = _rawDeepLink(urlOrData);
    if (raw != null) {
      final target = _fromSchemeBody(raw);
      if (target != null) return target;
    }

    if (urlOrData is Map) {
      return _fromFcmData(Map<String, dynamic>.from(urlOrData));
    }
    return null;
  }

  static String? _rawDeepLink(Object? urlOrData) {
    if (urlOrData is String) return urlOrData;
    if (urlOrData is Map) {
      return urlOrData['deepLink']?.toString() ?? urlOrData['url']?.toString();
    }
    return null;
  }

  static DeepLinkTarget? _fromSchemeBody(String raw) {
    final match = _schemePattern.firstMatch(raw.trim());
    if (match == null) return null;
    return _mapKind(match.group(1)!);
  }

  static DeepLinkTarget? _mapKind(String body) {
    final parts = body.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return const DeepLinkTarget(route: '/home');
    final kind = parts[0].toLowerCase();
    final id = parts.length > 1 ? Uri.decodeComponent(parts[1]) : '';

    switch (kind) {
      case 'live':
        if (id.isEmpty) return const DeepLinkTarget(route: '/home');
        return DeepLinkTarget(
          route: '/live',
          arguments: LiveRoom(channel: id, hostName: 'Live host'),
        );
      case 'party':
        if (id.isEmpty) return const DeepLinkTarget(route: '/home');
        return DeepLinkTarget(
          route: '/party',
          arguments: LiveRoom(channel: id, hostName: 'Party host', isParty: true),
        );
      case 'profile':
        if (id.isEmpty) return null;
        return DeepLinkTarget(route: '/creator', arguments: id);
      case 'post':
        return DeepLinkTarget(route: '/home', arguments: {'postId': id});
      case 'chat':
        return DeepLinkTarget(
          route: '/chat-thread',
          arguments: {
            'conversationId': id,
            'otherUserName': 'Chat',
          },
        );
      case 'streamer':
        return const DeepLinkTarget(route: '/streamer-center');
      case 'wallet':
        return const DeepLinkTarget(route: '/recharge');
      case 'withdraw':
        return const DeepLinkTarget(route: '/withdraw');
      case 'explore':
        return const DeepLinkTarget(route: '/home');
      default:
        return null;
    }
  }

  static DeepLinkTarget? _fromFcmData(Map<String, dynamic> data) {
    final type = data['type']?.toString() ?? '';
    final roomId = data['roomId']?.toString() ?? data['channel']?.toString() ?? '';
    final conversationId = data['conversationId']?.toString() ?? '';

    if ((type == 'live_started' || type == 'host_live') && roomId.isNotEmpty) {
      return DeepLinkTarget(
        route: '/live',
        arguments: LiveRoom(channel: roomId, hostName: 'Live host'),
      );
    }
    if (type == 'party_started' && roomId.isNotEmpty) {
      return DeepLinkTarget(
        route: '/party',
        arguments: LiveRoom(channel: roomId, hostName: 'Party host', isParty: true),
      );
    }
    if (type == 'new_message' && conversationId.isNotEmpty) {
      return DeepLinkTarget(
        route: '/chat-thread',
        arguments: {
          'conversationId': conversationId,
          'otherUserName': data['senderName']?.toString() ?? 'Chat',
        },
      );
    }
    if (type == 'withdrawal_update') {
      return const DeepLinkTarget(route: '/withdraw');
    }
    if (type == 'wallet_update') {
      return const DeepLinkTarget(route: '/recharge');
    }
    return null;
  }
}
