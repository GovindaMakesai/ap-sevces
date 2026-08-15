import '../models/live_room.dart';
import 'api_client.dart';

class LiveService {
  LiveService(this._api);

  final ApiClient _api;

  Future<List<LiveRoom>> fetchRooms({
    required bool party,
    int limit = 20,
    String sort = 'trending',
  }) async {
    final type = party ? 'party' : 'live';
    final res = await _api.getJson(
      '/live/rooms',
      query: {'type': type, 'limit': limit, 'sort': sort},
      auth: false,
    );
    return _api
        .extractList(res)
        .where((r) => r['channel'] != null)
        .map((r) => LiveRoom.fromJson(r, party: party))
        .toList();
  }

  Future<Map<String, dynamic>> getAgoraConfig() async {
    final res = await _api.getJson('/live/agora/config', auth: false);
    return _api.unwrapData(res, (d) => d);
  }

  Future<Map<String, dynamic>> getAgoraToken({
    required String channel,
    String role = 'audience',
  }) async {
    final res = await _api.postJson('/live/agora/token', body: {
      'channel': channel,
      'role': role,
    });
    if (res['success'] != true) {
      throw Exception(res['message']?.toString() ?? 'Could not get Agora token');
    }
    return _api.unwrapData(res, (d) => d);
  }

  Future<List<LiveRoom>> fetchFollowingLive() async {
    final res = await _api.getJson('/social/following/live');
    return _api
        .extractList(res)
        .where((r) => r['channel'] != null)
        .map((r) => LiveRoom.fromJson(r))
        .toList();
  }
}
