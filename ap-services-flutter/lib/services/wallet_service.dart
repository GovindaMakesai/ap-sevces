import 'package:dio/dio.dart';

import '../models/wallet.dart';
import 'api_client.dart';

class WalletService {
  WalletService(this._api);

  final ApiClient _api;

  Future<WalletBalance> getBalance() async {
    final res = await _api.getJson('/wallet/balance');
    return WalletBalance.fromJson(res);
  }

  Future<Map<String, dynamic>> getBalanceRaw() async {
    final res = await _api.getJson('/wallet/balance');
    return _api.unwrapData(res, (d) => d);
  }

  Future<Map<String, dynamic>> getWalletSettings() async {
    final res = await _api.getJson('/wallet/settings');
    return _api.unwrapData(res, (d) => d);
  }

  Future<void> submitRecharge({required num amount, String? utr, String? proofPath}) async {
    final form = FormData.fromMap({
      'amount': amount,
      if (utr != null) 'utr': utr,
      if (proofPath != null) 'payment_proof': await MultipartFile.fromFile(proofPath),
    });
    await _api.dio.post('/wallet/recharge', data: form);
  }

  Future<void> submitWithdraw({required num amount, String? qrPath}) async {
    final form = FormData.fromMap({
      'amount': amount,
      if (qrPath != null) 'qr_image': await MultipartFile.fromFile(qrPath),
    });
    await _api.dio.post('/wallet/withdraw', data: form);
  }

  Future<void> exchangePoints(int points) async {
    await _api.postJson('/wallet/exchange-points', body: {'points': points});
  }

  Future<List<LeaderboardEntry>> fetchLeaderboard({
    String type = 'gifts',
    String period = 'weekly',
    String category = 'creators',
    String mode = '',
  }) async {
    final res = await _api.getJson(
      '/v1/leaderboards',
      query: {
        'period': period,
        'category': category,
        if (mode.isNotEmpty) 'mode': mode,
      },
    );
    final list = _api.extractList(res);
    return list.asMap().entries.map((e) {
      return LeaderboardEntry.fromJson(e.value, e.key);
    }).toList();
  }
}
