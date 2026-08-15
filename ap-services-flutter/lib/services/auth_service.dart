import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../models/user.dart';
import 'api_client.dart';

class AuthService extends ChangeNotifier {
  AuthService() {
    _api = ApiClient(tokenProvider: () async => _accessToken);
  }

  static const _tokenKey = 'token';
  static const _refreshKey = 'ap_refresh_token';
  static const _userKey = 'user';

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
  );
  late final ApiClient _api;

  AppUser? _user;
  String? _accessToken;
  String? _refreshToken;
  bool _initialized = false;

  AppUser? get user => _user;
  String? get accessToken => _accessToken;
  bool get isLoggedIn => _user != null && (_accessToken?.isNotEmpty ?? false);
  bool get isInitialized => _initialized;
  ApiClient get api => _api;

  Future<void> initialize() async {
    try {
      _accessToken = await _secure
          .read(key: _tokenKey)
          .timeout(const Duration(seconds: 2), onTimeout: () => null);
      _refreshToken = await _secure
          .read(key: _refreshKey)
          .timeout(const Duration(seconds: 2), onTimeout: () => null);
    } catch (_) {
      _accessToken = null;
      _refreshToken = null;
    }

    try {
      final prefs = await SharedPreferences.getInstance()
          .timeout(const Duration(seconds: 2));
      final userJson = prefs.getString(_userKey);
      if (userJson != null) {
        _user = AppUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      }
    } catch (_) {
      _user = null;
    }

    // Session refresh hits the network — never block cold start (iQOO/Vivo hang fix).
    _initialized = true;
    notifyListeners();
  }

  /// Call after the first screen is visible.
  Future<void> warmSessionInBackground() async {
    if (_accessToken == null && _refreshToken == null) return;
    try {
      await refreshSession(silent: true).timeout(const Duration(seconds: 8));
    } catch (_) {
      /* keep cached credentials */
    }
  }

  Future<void> _persistSession({
    required AppUser user,
    required String accessToken,
    String? refreshToken,
  }) async {
    _user = user;
    _accessToken = accessToken;
    if (refreshToken != null) _refreshToken = refreshToken;

    await _secure.write(key: _tokenKey, value: accessToken);
    if (refreshToken != null) {
      await _secure.write(key: _refreshKey, value: refreshToken);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, jsonEncode(user.toJson()));
    notifyListeners();
  }

  Future<AppUser> loginAsGuest() => login(
        AppConfig.guestTestEmail,
        AppConfig.guestTestPassword,
      );

  Future<AppUser> login(String email, String password) async {
    final res = await _api.postJson('/auth/login', body: {
      'email': email.trim(),
      'password': password,
    }, auth: false);

    if (res['success'] != true) {
      throw Exception(res['message']?.toString() ?? 'Login failed');
    }

    final data = res['data'] as Map<String, dynamic>;
    final user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
    await _persistSession(
      user: user,
      accessToken: data['accessToken']?.toString() ?? '',
      refreshToken: data['refreshToken']?.toString(),
    );
    return user;
  }

  Future<AppUser> exchangeOAuthCode(String code) async {
    final res = await _api.postJson('/auth/exchange-code', body: {'code': code}, auth: false);
    if (res['success'] != true) {
      throw Exception(res['message']?.toString() ?? 'OAuth exchange failed');
    }
    final data = res['data'] as Map<String, dynamic>;
    final user = AppUser.fromJson(data['user'] as Map<String, dynamic>);
    await _persistSession(
      user: user,
      accessToken: data['accessToken']?.toString() ?? '',
      refreshToken: data['refreshToken']?.toString(),
    );
    return user;
  }

  Future<void> refreshSession({bool silent = false}) async {
    if (_refreshToken == null && _accessToken == null) return;

    try {
      final res = await _api.postJson(
        '/auth/refresh',
        body: _refreshToken != null ? {'refreshToken': _refreshToken} : null,
        auth: false,
      );
      if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>? ?? res;
        final token = data['accessToken']?.toString();
        if (token != null && token.isNotEmpty) {
          _accessToken = token;
          await _secure.write(key: _tokenKey, value: token);
          final rt = data['refreshToken']?.toString();
          if (rt != null) {
            _refreshToken = rt;
            await _secure.write(key: _refreshKey, value: rt);
          }
          if (!silent) notifyListeners();
          return;
        }
      }
    } catch (_) {
      /* try /auth/me with existing token */
    }

    if (_accessToken != null) {
      final res = await _api.getJson('/auth/me');
      if (res['success'] == true) {
        final data = res['data'] as Map<String, dynamic>;
        _user = AppUser.fromJson(data['user'] as Map<String, dynamic>? ?? data);
        if (!silent) notifyListeners();
        return;
      }
    }

    if (!silent) await logout();
  }

  Future<String?> ensureAccessToken() async {
    if (_accessToken != null && _accessToken!.isNotEmpty) return _accessToken;
    await refreshSession(silent: true);
    return _accessToken;
  }

  Future<void> updateProfile({String? firstName, String? lastName}) async {
    final res = await _api.dio.patch<Map<String, dynamic>>(
      '/auth/profile',
      data: {
        if (firstName != null) 'first_name': firstName,
        if (lastName != null) 'last_name': lastName,
      },
    );
    final body = res.data ?? {};
    if (body['success'] == true) {
      final data = body['data'] as Map<String, dynamic>? ?? body;
      final userData = data['user'] as Map<String, dynamic>? ?? data;
      _user = AppUser.fromJson(userData);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_userKey, jsonEncode(_user!.toJson()));
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await _api.postJson('/auth/logout');
    } catch (_) {
      /* ignore */
    }
    _user = null;
    _accessToken = null;
    _refreshToken = null;
    await _secure.delete(key: _tokenKey);
    await _secure.delete(key: _refreshKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userKey);
    notifyListeners();
  }

  String oauthUrl(String provider) => AppConfig.oauthUrl(provider);
}
