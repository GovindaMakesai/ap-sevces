import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Port of ap-services-app/liveAudioRoute.js + modules/ap-live-audio.
enum LiveAudioState { idle, livePlay, liveTalk, teardown }

class LiveAudioRoute {
  LiveAudioRoute._();

  static const _channel = MethodChannel('com.apservices.app/ap_live_audio');

  static LiveAudioState _state = LiveAudioState.idle;
  static Future<void> _chain = Future.value();
  static DateTime? _lastAppliedAt;
  static String? _lastAppliedMode;
  static const _cooldownMs = 2000;

  static LiveAudioState get state => _state;

  static Future<T> _run<T>(Future<T> Function() fn) {
    final next = _chain.then((_) => fn());
    _chain = next.then((_) {}, onError: (_) {});
    return next;
  }

  static bool _recentlyApplied(String mode) {
    if (_lastAppliedMode != mode || _lastAppliedAt == null) return false;
    return DateTime.now().difference(_lastAppliedAt!).inMilliseconds < _cooldownMs;
  }

  static Future<void> _ensureBluetoothPermission() async {
    if (!Platform.isAndroid) return;
    try {
      final status = await Permission.bluetoothConnect.status;
      if (!status.isGranted) {
        await Permission.bluetoothConnect.request();
      }
    } catch (_) {}
  }

  static Future<void> enterPlayback([String reason = 'enterPlayback']) {
    return _run(() async {
      await _ensureBluetoothPermission();
      final force = RegExp(r'force|foreground|nav_enter|bluetooth|device', caseSensitive: false)
          .hasMatch(reason);
      if (_state == LiveAudioState.livePlay && !force && _recentlyApplied('livePlay')) {
        await _applyBluetoothRoute('playback');
        return;
      }
      _state = LiveAudioState.livePlay;
      await _applyLivePlay(force: force || _state == LiveAudioState.livePlay);
    });
  }

  static Future<void> enterTalk({bool bluetoothSafe = true, String reason = 'enterTalk'}) {
    return _run(() async {
      await _ensureBluetoothPermission();
      if (_state == LiveAudioState.liveTalk && _recentlyApplied('liveTalk')) {
        if (bluetoothSafe) await _applyBluetoothRoute('talk');
        return;
      }
      _state = LiveAudioState.liveTalk;
      await _applyLiveTalk(bluetoothSafe: bluetoothSafe);
    });
  }

  static Future<void> exitTalk([String reason = 'exitTalk']) {
    return _run(() async {
      if (_state != LiveAudioState.liveTalk && _state != LiveAudioState.livePlay) return;
      _state = LiveAudioState.livePlay;
      await _applyLivePlay(force: true);
    });
  }

  static Future<void> leaveLive([String reason = 'leaveLive']) {
    return _run(() async {
      if (_state == LiveAudioState.idle) return;
      _state = LiveAudioState.teardown;
      await _applyIdle();
      _state = LiveAudioState.idle;
    });
  }

  static Future<void> onAppForeground() {
    if (_state == LiveAudioState.livePlay || _state == LiveAudioState.liveTalk) {
      return reevaluate('app_foreground');
    }
    return Future.value();
  }

  static Future<void> reevaluate([String reason = 'reevaluate']) {
    return _run(() async {
      final force = RegExp(r'bluetooth|device|headset|bt_', caseSensitive: false).hasMatch(reason);
      if (_state == LiveAudioState.liveTalk) {
        await _applyLiveTalk(bluetoothSafe: true, force: force);
      } else if (_state == LiveAudioState.livePlay) {
        await _applyLivePlay(force: force);
      }
    });
  }

  static Future<void> _applyLivePlay({bool force = false}) async {
    if (!force && _recentlyApplied('livePlay')) {
      await _applyBluetoothRoute('playback');
      return;
    }
    _lastAppliedAt = DateTime.now();
    _lastAppliedMode = 'livePlay';
    await _applyBluetoothRoute('playback');
  }

  static Future<void> _applyLiveTalk({bool bluetoothSafe = true, bool force = false}) async {
    if (!force && _recentlyApplied('liveTalk')) {
      if (bluetoothSafe) await _applyBluetoothRoute('talk');
      return;
    }
    _lastAppliedAt = DateTime.now();
    _lastAppliedMode = 'liveTalk';
    if (bluetoothSafe) await _applyBluetoothRoute('talk');
  }

  static Future<void> _applyIdle() async {
    if (Platform.isAndroid) {
      try {
        await _channel.invokeMethod<void>('clearRouteOverrides');
      } catch (_) {}
    }
    _lastAppliedAt = DateTime.now();
    _lastAppliedMode = 'idle';
  }

  static Future<void> _applyBluetoothRoute(String kind) async {
    if (!Platform.isAndroid) return;
    try {
      if (kind == 'talk') {
        await _channel.invokeMethod<void>('preferBluetoothTalk');
      } else {
        await _channel.invokeMethod<void>('preferBluetoothPlayback');
      }
    } catch (_) {}
  }
}
