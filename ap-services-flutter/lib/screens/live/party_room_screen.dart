import 'package:flutter/material.dart';

import '../../models/live_room.dart';
import 'live_room_screen.dart';

/// Voice party room — reuses live room with party flag; seat UI simplified for v1.
class PartyRoomScreen extends StatelessWidget {
  const PartyRoomScreen({super.key, required this.room});

  final LiveRoom room;

  @override
  Widget build(BuildContext context) {
    return LiveRoomScreen(room: room.copyWithParty(true));
  }
}

extension on LiveRoom {
  LiveRoom copyWithParty(bool party) => LiveRoom(
        channel: channel,
        hostName: hostName,
        hostId: hostId,
        hostProfilePic: hostProfilePic,
        hostStreamCover: hostStreamCover,
        viewers: viewers,
        isParty: party,
        startedAt: startedAt,
        title: title,
      );
}
