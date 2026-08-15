import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_client.dart';
import 'deep_link_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

/// Port of ap-services-app/pushNotifications.js — FCM token + deep link routing.
class PushService {
  PushService(this._api);

  final ApiClient _api;
  final _messaging = FirebaseMessaging.instance;
  final _local = FlutterLocalNotificationsPlugin();

  String? _deviceToken;
  void Function(DeepLinkTarget)? _onDeepLink;

  String? get deviceToken => _deviceToken;

  void setDeepLinkHandler(void Function(DeepLinkTarget) handler) {
    _onDeepLink = handler;
  }

  Future<void> initialize() async {
    if (kIsWeb) return;
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[push] Firebase init skipped: $e');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    if (Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        'default',
        'Default',
        importance: Importance.max,
      );
      const legacy = AndroidNotificationChannel(
        'ap_live_default',
        'Glowcast',
        importance: Importance.max,
      );
      final android = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(channel);
      await android?.createNotificationChannel(legacy);
    }

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (response) {
        _handlePayload(response.payload);
      },
    );

    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      ).timeout(const Duration(seconds: 5));
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[push] permission not granted');
        return;
      }
    } catch (e) {
      debugPrint('[push] permission skipped: $e');
      return;
    }

    try {
      _deviceToken = await _messaging.getToken().timeout(const Duration(seconds: 5));
    } catch (e) {
      debugPrint('[push] token skipped: $e');
    }
    _messaging.onTokenRefresh.listen((token) {
      _deviceToken = token;
    });

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleRemoteMessage);

    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      _handleRemoteMessage(initial);
    }
  }

  Future<bool> uploadToken(String accessToken) async {
    final token = _deviceToken;
    if (token == null || token.isEmpty || accessToken.isEmpty) return false;
    try {
      final res = await _api.dio.post(
        '/push/register-token',
        data: {
          'token': token,
          'platform': Platform.isIOS ? 'ios' : 'android',
        },
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      return res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 300;
    } catch (e) {
      debugPrint('[push] upload failed: $e');
      return false;
    }
  }

  Future<bool> removeToken(String accessToken) async {
    final token = _deviceToken;
    if (token == null || accessToken.isEmpty) return false;
    try {
      final res = await _api.dio.post(
        '/push/remove-token',
        data: {'token': token},
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
      return res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 300;
    } catch (_) {
      return false;
    }
  }

  void _handleRemoteMessage(RemoteMessage message) {
    final target = DeepLinkService.resolve(message.data);
    if (target != null) _onDeepLink?.call(target);
  }

  void _handlePayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    final target = DeepLinkService.resolve(payload);
    if (target != null) _onDeepLink?.call(target);
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    const androidDetails = AndroidNotificationDetails(
      'default',
      'Default',
      importance: Importance.max,
      priority: Priority.high,
    );
    await _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(android: androidDetails),
      payload: message.data['deepLink']?.toString(),
    );
  }
}
