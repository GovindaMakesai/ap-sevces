class StorePackage {
  const StorePackage({
    required this.id,
    required this.name,
    required this.coins,
    this.priceInr,
    this.bonusCoins = 0,
    this.category = 'popular',
    this.emoji = '🪙',
  });

  final String id;
  final String name;
  final int coins;
  final num? priceInr;
  final int bonusCoins;
  final String category;
  final String emoji;

  int get totalCoins => coins + bonusCoins;

  factory StorePackage.fromJson(Map<String, dynamic> json) {
    return StorePackage(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Package',
      coins: ((json['coins'] ?? 0) as num).toInt(),
      priceInr: json['price_inr'] ?? json['priceInr'],
      bonusCoins: ((json['bonus_coins'] ?? json['bonusCoins'] ?? 0) as num).toInt(),
      category: json['category']?.toString() ?? 'popular',
      emoji: json['emoji']?.toString() ?? '🪙',
    );
  }
}

class ReferralDashboard {
  const ReferralDashboard({
    this.myCode = '',
    this.totalInvites = 0,
    this.totalEarnings = 0,
    this.claimablePoints = 0,
  });

  final String myCode;
  final int totalInvites;
  final num totalEarnings;
  final int claimablePoints;

  factory ReferralDashboard.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? json['data'] as Map<String, dynamic> : json;
    return ReferralDashboard(
      myCode: data['code']?.toString() ?? data['referralCode']?.toString() ?? '',
      totalInvites: ((data['totalInvites'] ?? data['invite_count'] ?? 0) as num).toInt(),
      totalEarnings: data['totalEarnings'] ?? data['earnings'] ?? 0,
      claimablePoints: ((data['claimablePoints'] ?? data['claimable'] ?? 0) as num).toInt(),
    );
  }
}

class SearchResult {
  const SearchResult({
    required this.id,
    required this.label,
    required this.type,
    this.subtitle,
    this.imageUrl,
    this.channel,
  });

  final String id;
  final String label;
  final String type;
  final String? subtitle;
  final String? imageUrl;
  final String? channel;

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    return SearchResult(
      id: json['id']?.toString() ?? json['userId']?.toString() ?? '',
      label: json['name']?.toString() ?? json['first_name']?.toString() ?? 'Result',
      type: json['type']?.toString() ?? 'user',
      subtitle: json['subtitle']?.toString(),
      imageUrl: json['profile_pic']?.toString() ?? json['image']?.toString(),
      channel: json['channel']?.toString(),
    );
  }
}
