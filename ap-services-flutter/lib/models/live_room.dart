class LiveRoom {
  const LiveRoom({
    required this.channel,
    required this.hostName,
    this.hostId,
    this.hostProfilePic,
    this.hostStreamCover,
    this.viewers = 0,
    this.isParty = false,
    this.startedAt,
    this.title,
  });

  final String channel;
  final String hostName;
  final String? hostId;
  final String? hostProfilePic;
  final String? hostStreamCover;
  final int viewers;
  final bool isParty;
  final DateTime? startedAt;
  final String? title;

  String get coverImage {
    if (hostStreamCover != null && hostStreamCover!.isNotEmpty) {
      return hostStreamCover!;
    }
    if (hostProfilePic != null && hostProfilePic!.isNotEmpty) {
      return hostProfilePic!;
    }
    return '';
  }

  factory LiveRoom.fromJson(Map<String, dynamic> json, {bool party = false}) {
    DateTime? started;
    final rawStarted = json['startedAt'] ?? json['started_at'];
    if (rawStarted != null) {
      started = DateTime.tryParse(rawStarted.toString());
    }

    return LiveRoom(
      channel: json['channel']?.toString() ?? '',
      hostName: json['hostName']?.toString() ??
          json['host_display_name']?.toString() ??
          'Host',
      hostId: json['hostId']?.toString() ?? json['host_user_id']?.toString(),
      hostProfilePic:
          json['hostProfilePic']?.toString() ?? json['host_profile_pic']?.toString(),
      hostStreamCover:
          json['hostStreamCover']?.toString() ?? json['stream_cover_url']?.toString(),
      viewers: ((json['viewers'] ?? json['viewer_count'] ?? 0) as num).toInt(),
      isParty: party ||
          json['party'] == true ||
          json['roomType']?.toString() == 'party',
      startedAt: started,
      title: json['title']?.toString(),
    );
  }
}
