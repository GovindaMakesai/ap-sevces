import '../models/social.dart';
import 'api_client.dart';

class SocialService {
  SocialService(this._api);

  final ApiClient _api;

  Future<List<SocialPost>> fetchPosts({String scope = 'for_you', int limit = 20}) async {
    final res = await _api.getJson('/social/posts', query: {
      'scope': scope,
      'limit': limit,
    }, auth: false);
    return _api.extractList(res).map(SocialPost.fromJson).toList();
  }

  Future<List<GiftItem>> fetchGiftCatalog() async {
    final res = await _api.getJson('/social/gifts/catalog', auth: false);
    return _api.extractList(res).map(GiftItem.fromJson).toList();
  }

  Future<List<DiscoverCreator>> discoverCreators({String period = 'weekly'}) async {
    final res = await _api.getJson('/social/discover/creators', query: {'period': period}, auth: false);
    return _api.extractList(res).map(DiscoverCreator.fromJson).toList();
  }

  Future<CreatorStats> getStats(String userId) async {
    final res = await _api.getJson('/social/stats/$userId', auth: false);
    return CreatorStats.fromJson(res);
  }

  Future<void> follow(String userId) async {
    await _api.postJson('/social/follow/$userId');
  }

  Future<void> unfollow(String userId) async {
    await _api.dio.delete('/social/follow/$userId');
  }

  Future<void> likePost(String postId) async {
    await _api.postJson('/social/posts/$postId/like');
  }

  Future<void> sendGift({
    required String receiverId,
    required String giftSlug,
    required int cost,
    String? channel,
  }) async {
    await _api.postJson('/wallet/gifts', body: {
      'receiverId': receiverId,
      'giftSlug': giftSlug,
      'cost': cost,
      if (channel != null) 'channel': channel,
    });
  }

  Future<Map<String, dynamic>> submitRoleApplication({
    required String roleType,
    required Map<String, dynamic> payload,
  }) async {
    return _api.postJson('/social/role-applications', body: {
      'roleType': roleType,
      ...payload,
    });
  }

  Future<Map<String, dynamic>> getRoleApplicationStatus(String roleType) async {
    return _api.getJson('/social/role-applications/status/$roleType');
  }
}
