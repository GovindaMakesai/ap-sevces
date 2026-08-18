class WalletBalance {
  const WalletBalance({
    this.coins = 0,
    this.points = 0,
    this.giftCoins = 0,
  });

  final int coins;
  final int points;
  final int giftCoins;

  factory WalletBalance.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? json['data'] as Map<String, dynamic> : json;
    return WalletBalance(
      coins: (data['coins'] ?? data['balance'] ?? 0) as int,
      points: (data['points'] ?? 0) as int,
      giftCoins: (data['giftCoins'] ?? data['gift_coins'] ?? 0) as int,
    );
  }
}

class LeaderboardEntry {
  const LeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.displayName,
    this.profilePic,
    this.score = 0,
  });

  final int rank;
  final String userId;
  final String displayName;
  final String? profilePic;
  final num score;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json, int index) {
    final user = json['user'] as Map<String, dynamic>? ?? json;
    return LeaderboardEntry(
      rank: (json['rank'] ?? index + 1) as int,
      userId: user['id']?.toString() ?? json['userId']?.toString() ?? '',
      displayName: user['first_name']?.toString() ??
          user['name']?.toString() ??
          json['displayName']?.toString() ??
          'User',
      profilePic: user['profile_pic']?.toString(),
      score: json['score'] ?? json['total'] ?? json['coins'] ?? 0,
    );
  }
}
