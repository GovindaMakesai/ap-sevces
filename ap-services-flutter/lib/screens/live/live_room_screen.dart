import 'dart:async';

import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../config/theme.dart';
import '../../models/live_room.dart';
import '../../services/auth_service.dart';
import '../../services/live_service.dart';
import '../../services/live_audio_route.dart';
import '../../services/secure_screen_service.dart';
import '../../services/socket_service.dart';
import '../../models/social.dart';
import '../../services/social_service.dart';
import '../../services/wallet_service.dart';
import '../../widgets/gift_sheet.dart';
import '../../widgets/loading_view.dart';

class LiveRoomScreen extends StatefulWidget {
  const LiveRoomScreen({super.key, required this.room});

  final LiveRoom room;

  @override
  State<LiveRoomScreen> createState() => _LiveRoomScreenState();
}

class _LiveRoomScreenState extends State<LiveRoomScreen> {
  RtcEngine? _engine;
  bool _joined = false;
  bool _loading = true;
  String? _error;
  int _viewerCount = 0;
  int? _remoteUid;
  final _chatController = TextEditingController();
  final _chatMessages = <_LiveChatMessage>[];
  StreamSubscription? _chatSub;

  @override
  void initState() {
    super.initState();
    SecureScreenService.setSecure(true);
    LiveAudioRoute.enterPlayback('nav_enter');
    _viewerCount = widget.room.viewers;
    _initRoom();
  }

  @override
  void dispose() {
    SecureScreenService.setSecure(false);
    LiveAudioRoute.leaveLive('leaveLive');
    _chatSub?.cancel();
    _chatController.dispose();
    _leaveRoom();
    super.dispose();
  }

  Future<void> _initRoom() async {
    final auth = context.read<AuthService>();
    final live = context.read<LiveService>();
    final socket = context.read<SocketService>();

    try {
      final token = await auth.ensureAccessToken();
      if (token == null) throw Exception('Session expired — sign in again');

      await socket.connect(token);
      socket.joinLiveRoom(widget.room.channel, isParty: widget.room.isParty);

      socket.on('live:chat', (data) {
        if (data is Map) _appendChat(data);
      });
      socket.on('live:viewer_count', (data) {
        if (data is Map && mounted) {
          setState(() => _viewerCount = (data['count'] ?? data['viewers'] ?? _viewerCount) as int);
        }
      });
      socket.on('live:ended', (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Live stream ended')),
          );
          Navigator.of(context).pop();
        }
      });

      final config = await live.getAgoraConfig();
      final appId = config['appId']?.toString() ?? '';
      if (appId.isEmpty) {
        setState(() {
          _loading = false;
          _joined = true;
        });
        return;
      }

      await [
        Permission.microphone,
        Permission.camera,
        Permission.bluetoothConnect,
      ].request();

      final agoraToken = await live.getAgoraToken(channel: widget.room.channel);
      final rtcToken = agoraToken['token']?.toString() ?? '';
      final uid = agoraToken['uid'] as int? ?? 0;

      final engine = createAgoraRtcEngine();
      await engine.initialize(RtcEngineContext(appId: appId));
      engine.registerEventHandler(
        RtcEngineEventHandler(
          onJoinChannelSuccess: (_, __) {
            if (mounted) setState(() => _joined = true);
          },
          onUserJoined: (_, remoteUid, __) {
            if (mounted) setState(() => _remoteUid = remoteUid);
          },
          onUserOffline: (_, remoteUid, __) {
            if (mounted && _remoteUid == remoteUid) setState(() => _remoteUid = null);
          },
        ),
      );
      await engine.enableVideo();
      await engine.setClientRole(role: ClientRoleType.clientRoleAudience);
      await engine.joinChannel(
        token: rtcToken,
        channelId: widget.room.channel,
        uid: uid,
        options: const ChannelMediaOptions(
          channelProfile: ChannelProfileType.channelProfileLiveBroadcasting,
          clientRoleType: ClientRoleType.clientRoleAudience,
        ),
      );

      _engine = engine;
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  void _appendChat(Map data) {
    final msg = _LiveChatMessage(
      user: _sanitizePublicText(data['displayName']?.toString() ?? data['user']?.toString() ?? 'User', 32),
      text: _sanitizePublicText(data['message']?.toString() ?? data['text']?.toString() ?? '', 280),
    );
    if (mounted) setState(() => _chatMessages.add(msg));
  }

  String _sanitizePublicText(String? raw, [int max = 80]) {
    final stripped = (raw ?? '')
        .replaceAll(
          RegExp(
            r'[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]',
          ),
          '',
        )
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (stripped.isEmpty) return max >= 32 ? 'User' : '';
    return stripped.length <= max ? stripped : stripped.substring(0, max);
  }

  Future<void> _leaveRoom() async {
    final socket = context.read<SocketService>();
    socket.leaveLiveRoom(widget.room.channel);
    socket.off('live:chat');
    socket.off('live:viewer_count');
    socket.off('live:ended');

    if (_engine != null) {
      await _engine!.leaveChannel();
      await _engine!.release();
      _engine = null;
    }
  }

  void _sendChat() {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    context.read<SocketService>().sendLiveChat(widget.room.channel, text);
    _chatController.clear();
  }

  Future<void> _openGifts() async {
    try {
      final gifts = await context.read<SocialService>().fetchGiftCatalog();
      final balance = await context.read<WalletService>().getBalance();
      if (!mounted) return;
      await GiftSheet.show(
        context,
        gifts: gifts,
        balance: balance.coins,
        onSend: (gift) async {
          if (widget.room.hostId == null) return;
          await context.read<SocialService>().sendGift(
                receiverId: widget.room.hostId!,
                giftSlug: gift.slug ?? gift.id,
                cost: gift.cost,
                channel: widget.room.channel,
              );
          context.read<SocketService>().sendGift(
                widget.room.channel,
                giftId: gift.slug ?? gift.id,
              );
        },
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = GlowTheme.liveRoom();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        Navigator.of(context).maybePop();
      },
      child: Theme(
        data: theme,
        child: Scaffold(
          backgroundColor: GlowTheme.liveDark,
          body: SafeArea(
            child: _loading
                ? const LoadingView(message: 'Joining live room…')
                : _error != null
                    ? ErrorView(message: _error!, onRetry: _initRoom)
                    : Stack(
                        children: [
                          _videoLayer(),
                          _topBar(),
                          _chatOverlay(),
                          _bottomInput(),
                        ],
                      ),
          ),
        ),
      ),
    );
  }

  Widget _videoLayer() {
    if (_engine != null && _remoteUid != null) {
      return AgoraVideoView(
        controller: VideoViewController.remote(
          rtcEngine: _engine!,
          canvas: VideoCanvas(uid: _remoteUid),
          connection: RtcConnection(channelId: widget.room.channel),
        ),
      );
    }
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.live_tv, color: GlowTheme.gold500, size: 64),
          const SizedBox(height: 12),
          Text(
            widget.room.hostName,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          Text(
            _joined ? 'Connected via realtime' : 'Connecting…',
            style: const TextStyle(color: Colors.white70),
          ),
        ],
      ),
    );
  }

  Widget _topBar() {
    return Positioned(
      top: 8,
      left: 8,
      right: 8,
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.room.hostName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text('$_viewerCount watching', style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.red,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(widget.room.isParty ? 'PARTY' : 'LIVE', style: const TextStyle(color: Colors.white, fontSize: 11)),
          ),
        ],
      ),
    );
  }

  Widget _chatOverlay() {
    return Positioned(
      left: 12,
      bottom: 80,
      width: MediaQuery.of(context).size.width * 0.7,
      height: 180,
      child: ListView.builder(
        itemCount: _chatMessages.length,
        itemBuilder: (_, i) {
          final m = _chatMessages[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: RichText(
              textDirection: TextDirection.ltr,
              text: TextSpan(
                children: [
                  TextSpan(
                    text: '${m.user}: ',
                    style: const TextStyle(color: GlowTheme.gold500, fontWeight: FontWeight.w600),
                  ),
                  TextSpan(text: m.text, style: const TextStyle(color: Colors.white)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _bottomInput() {
    return Positioned(
      left: 12,
      right: 12,
      bottom: 12,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _chatController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Say something…',
                hintStyle: const TextStyle(color: Colors.white54),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              onSubmitted: (_) => _sendChat(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _openGifts,
            icon: const Icon(Icons.card_giftcard),
            style: IconButton.styleFrom(backgroundColor: GlowTheme.orangeCta),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _sendChat,
            icon: const Icon(Icons.send),
            style: IconButton.styleFrom(backgroundColor: GlowTheme.gold500),
          ),
        ],
      ),
    );
  }
}

class _LiveChatMessage {
  _LiveChatMessage({required this.user, required this.text});
  final String user;
  final String text;
}
