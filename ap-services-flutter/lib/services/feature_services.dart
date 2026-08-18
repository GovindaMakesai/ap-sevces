import 'package:dio/dio.dart';

import '../models/store.dart';
import 'api_client.dart';

class StoreService {
  StoreService(this._api);

  final ApiClient _api;

  Future<List<StorePackage>> fetchPackages({String? category}) async {
    final res = await _api.getJson('/store/packages', query: {
      if (category != null) 'category': category,
    }, auth: false);
    return _api.extractList(res).map(StorePackage.fromJson).toList();
  }

  Future<void> purchase(String packageId) async {
    final res = await _api.postJson('/store/purchase', body: {'packageId': packageId});
    if (res['success'] == false) {
      throw Exception(res['message']?.toString() ?? 'Purchase failed');
    }
  }
}

class ReferralService {
  ReferralService(this._api);

  final ApiClient _api;

  Future<ReferralDashboard> getDashboard() async {
    final res = await _api.getJson('/referral/dashboard');
    return ReferralDashboard.fromJson(res);
  }

  Future<String> generateLink() async {
    final res = await _api.postJson('/referral/generate');
    final data = res['data'] as Map<String, dynamic>? ?? res;
    return data['link']?.toString() ?? data['code']?.toString() ?? '';
  }

  Future<void> applyCode(String code) async {
    final res = await _api.postJson('/referral/apply', body: {'code': code});
    if (res['success'] == false) {
      throw Exception(res['message']?.toString() ?? 'Invalid referral code');
    }
  }
}

class SearchService {
  SearchService(this._api);

  final ApiClient _api;

  Future<List<SearchResult>> search(String query, {String type = 'all'}) async {
    if (query.trim().length < 2) return [];
    final res = await _api.getJson('/search', query: {'q': query, 'type': type}, auth: false);
    return _api.extractList(res).map(SearchResult.fromJson).toList();
  }
}

class HostService {
  HostService(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> getAccessStatus() async {
    final res = await _api.getJson('/live/access-status');
    return _api.unwrapData(res, (d) => d);
  }

  Future<Map<String, dynamic>> getStreamerStats() async {
    final res = await _api.getJson('/live/streamer-stats');
    return _api.unwrapData(res, (d) => d);
  }

  Future<Map<String, dynamic>> getMyAnalytics({String period = 'week'}) async {
    final res = await _api.getJson('/live/my-analytics', query: {'period': period});
    return _api.unwrapData(res, (d) => d);
  }

  Future<Map<String, dynamic>> getHostDashboard() async {
    final res = await _api.getJson('/host/dashboard');
    return _api.unwrapData(res, (d) => d);
  }

  Future<void> verifyIdentity(Map<String, dynamic> payload) async {
    await _api.postJson('/live/verify/identity', body: payload);
  }

  Future<void> verifyFace(String filePath) async {
    final form = FormData.fromMap({
      'face': await MultipartFile.fromFile(filePath),
    });
    await _api.dio.post('/live/verify/face', data: form);
  }
}

class NotificationService {
  NotificationService(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> getSettings() async {
    final res = await _api.getJson('/push/settings');
    return _api.unwrapData(res, (d) => d);
  }

  Future<void> updateSettings(Map<String, dynamic> settings) async {
    await _api.dio.patch('/push/settings', data: settings);
  }
}
