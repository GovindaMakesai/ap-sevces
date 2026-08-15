class SocialPost {
  const SocialPost({
    required this.id,
    required this.authorId,
    required this.authorName,
    this.authorPic,
    this.caption,
    this.mediaUrl,
    this.mediaType = 'video',
    this.likes = 0,
    this.comments = 0,
    this.liked = false,
    this.createdAt,
  });

  final String id;
  final String authorId;
  final String authorName;
  final String? authorPic;
  final String? caption;
  final String? mediaUrl;
  final String mediaType;
  final int likes;
  final int comments;
  final bool liked;
  final DateTime? createdAt;

  factory SocialPost.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>? ??
        json['user'] as Map<String, dynamic>? ??
        {};
    return SocialPost(
      id: json['id']?.toString() ?? '',
      authorId: author['id']?.toString() ?? json['userId']?.toString() ?? '',
      authorName: author['first_name']?.toString() ??
          author['name']?.toString() ??
          'Creator',
      authorPic: author['profile_pic']?.toString(),
      caption: json['caption']?.toString() ?? json['content']?.toString(),
      mediaUrl: json['media_url']?.toString() ?? json['mediaUrl']?.toString(),
      mediaType: json['media_type']?.toString() ?? 'video',
      likes: ((json['likes'] ?? json['like_count'] ?? 0) as num).toInt(),
      comments: ((json['comments'] ?? json['comment_count'] ?? 0) as num).toInt(),
      liked: json['liked'] == true || json['isLiked'] == true,
      createdAt: DateTime.tryParse('${json['createdAt'] ?? json['created_at'] ?? ''}'),
    );
  }
}

class GiftItem {
  const GiftItem({
    required this.id,
    required this.name,
    required this.cost,
    this.emoji = '🎁',
    this.slug,
    this.category,
  });

  final String id;
  final String name;
  final int cost;
  final String emoji;
  final String? slug;
  final String? category;

  factory GiftItem.fromJson(Map<String, dynamic> json) {
    return GiftItem(
      id: json['id']?.toString() ?? json['slug']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Gift',
      cost: ((json['cost'] ?? json['coins'] ?? json['price'] ?? 0) as num).toInt(),
      emoji: json['emoji']?.toString() ?? '🎁',
      slug: json['slug']?.toString(),
      category: json['category']?.toString(),
    );
  }
}

class CreatorStats {
  const CreatorStats({
    this.following = 0,
    this.followers = 0,
    this.posts = 0,
    this.isFollowing = false,
  });

  final int following;
  final int followers;
  final int posts;
  final bool isFollowing;

  factory CreatorStats.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? json['data'] as Map<String, dynamic> : json;
    return CreatorStats(
      following: ((data['following'] ?? data['followingCount'] ?? 0) as num).toInt(),
      followers: ((data['followers'] ?? data['followerCount'] ?? 0) as num).toInt(),
      posts: ((data['posts'] ?? data['postCount'] ?? 0) as num).toInt(),
      isFollowing: data['isFollowing'] == true || data['following'] == true,
    );
  }
}

class DiscoverCreator {
  const DiscoverCreator({
    required this.userId,
    required this.name,
    this.profilePic,
    this.isLive = false,
    this.channel,
  });

  final String userId;
  final String name;
  final String? profilePic;
  final bool isLive;
  final String? channel;

  factory DiscoverCreator.fromJson(Map<String, dynamic> json) {
    return DiscoverCreator(
      userId: json['userId']?.toString() ?? json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['first_name']?.toString() ?? 'Creator',
      profilePic: json['profile_pic']?.toString() ?? json['profilePic']?.toString(),
      isLive: json['isLive'] == true || json['live'] == true,
      channel: json['channel']?.toString(),
    );
  }
}
