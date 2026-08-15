import 'dart:io';

import 'package:flutter/services.dart';

/// Matches ap-services-app screen capture block on live/party (FLAG_SECURE).
class SecureScreenService {
  static const _channel = MethodChannel('com.apservices.app/secure_screen');

  static Future<void> setSecure(bool enabled) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('setSecure', {'enabled': enabled});
    } catch (_) {
      /* optional on emulators */
    }
  }
}
