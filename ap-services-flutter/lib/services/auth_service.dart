import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../models/user.dart';
import 'api_client.dart';

/// Session storage uses SharedPreferences only — flutter_secure_storage hangs on iQOO/Vivo.
class AuthService extends ChangeNotifier {
  AuthService() {
    _api = ApiClient(tokenProvider: () async => _accessToken);
  }

  static const _tokenKey = 'glowcast_access_token';
  static const _refreshKey = 'glowcast_refresh_token';
  static const _userKey = 'glowcast_user';

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
      final prefs = await SharedPreferences.getInstance();
      _accessToken = prefs.getString(_tokenKey);
      _refreshToken = prefs.getString(_refreshKey);
      final userJson = prefs.getString(_userKey);
      if (userJson != null) {
        _user = AppUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[auth] init error: $e');
      _user = null;
      _accessToken = null;
      _refreshToken = null;
    }
    _initialized = true;
    notifyListeners();
  }

  Future<void> warmSessionInBackground() async {
    if (_accessToken == null && _refreshToken == null) return;
    try {
      await refreshSession(silent: true).timeout(const Duration(seconds: 8));
    } catch (e) {
      debugPrint('[auth] warm session skipped: $e');
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

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, accessToken);
    if (refreshToken != null) {
      await prefs.setString(_refreshKey, refreshToken);
    }
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
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_tokenKey, token);
          final rt = data['refreshToken']?.toString();
          if (rt != null) {
            _refreshToken = rt;
            await prefs.setString(_refreshKey, rt);
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
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }

  String oauthUrl(String provider) => AppConfig.oauthUrl(provider);
}
