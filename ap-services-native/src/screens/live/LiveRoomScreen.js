import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { filePart, pickMedia } from '../../lib/pickMedia';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useLiveMini } from '../../context/LiveMiniContext';
import { claimHold, peekHold, releaseHoldIfDifferent } from '../../lib/liveMiniHold';
import { colors } from '../../config/theme';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst from '../../components/GiftBurst';
import LuckyGiftBoard from '../../components/LuckyGiftBoard';
import LuckyResultOverlay from '../../components/LuckyResultOverlay';
import {
  LuckyBoxComposer,
  LuckyBoxRules,
  LuckyBoxFloat,
  LuckyBoxClaim,
  LuckyBoxWinBanner,
} from '../../components/LuckyBoxSheet';
import { resolveGiftAnim } from '../../config/giftAnims';
import { FadeIn, bottomSafe } from '../../components/motion';
import { Avatar } from '../../components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LiveAudioRoute from '../../lib/liveAudioRoute';
import { assertLiveSecure, enterLiveSecure, leaveLiveSecure } from '../../lib/liveSecure';
import { applyAgoraBeauty, beautyTint, BEAUTY_FILTERS } from '../../lib/liveBeauty';
import {
  configureAgoraVoice,
  demoteToAudience,
  enterAudienceAudioRoute,
  enterPublisherAudioRoute,
  ensureRemoteAudioOpen,
  ensureRemoteVideoOpen,
  muteRemoteVideoForAudioOnly,
  publisherMediaOptions,
  audienceMediaOptions,
  promoteToPublisher,
  requestBluetoothConnect,
  requestMicPermission,
  syncAgoraAudioRoute,
} from '../../lib/liveVoice';
import { formatUserDisplayId, isPlatformAdmin, hierarchyKeys } from '../../lib/roles';
import { displayName as formatDisplayName } from '../../lib/apiClient';
import { sanitizePublicText } from '../../lib/safeText';
import { mediaUrl } from '../../config/api';
import { newClientRequestId } from '../../lib/clientRequestId';
import {
  ApplyingUserSheet,
  AudienceSheet,
  EmojiSheet,
  GameCenterSheet,
  HostProfileSheet,
  LiveBottomBar,
  LiveChatFeed,
  LiveHeader,
  PartyHeader,
  PartyStageBackdrop,
  RoomFollowSheet,
  MemberActionMenu,
  PartySeatGrid,
  RankBadges,
  SeatInviteModal,
  LiveGuestRail,
  ToolsMenuSheet,
  WishWidgets,
  GifterRail,
  copyId,
  nowUpdateLabel,
  activeRoomPeople,
  uniqueGames,
  GAME_CENTER,
} from './LiveOverlays';
import RoomPkSheet, { PkBattleHud } from './RoomPkSheet';
import LiveVideoLayer from '../../components/LiveVideoLayer';
import { resolvePkRivalChannel, startPkRivalEngine, stopPkRivalEngine } from '../../lib/livePkRival';

let Agora = null;
try {
  Agora = require('react-native-agora');
} catch (_e) {
  Agora = null;
}

async function requestMedia(asHost, { party = false } = {}) {
  if (Platform.OS !== 'android') return true;
  await requestBluetoothConnect();
  if (party) {
    if (!asHost) return true;
    return requestMicPermission();
  }
  if (!asHost) return true;
  const micOk = await requestMicPermission();
  if (!micOk) return false;
  try {
    const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    return cam === PermissionsAndroid.RESULTS.GRANTED || cam === PermissionsAndroid.RESULTS.LIMITED;
  } catch (_e) {
    return false;
  }
}

export default function LiveRoomScreen({ navigation, route }) {
  const room = route.params || {};
  const isParty = Boolean(room.isParty || route.name === 'PartyRoom');
  const insets = useSafeAreaInsets();
  const { api, user, accessToken } = useAuth();
  const socket = useSocket();
  const liveMini = useLiveMini();

  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const softError = useCallback((msg) => {
    const m = String(msg || '').trim();
    if (!m) return;
    if (/timeout|timed out|network request failed|aborted|econn|enotfound|socket hang|could not join live|join failed/i.test(m)) {
      if (Platform.OS === 'android') ToastAndroid.show('Connection hiccup — still in room', ToastAndroid.SHORT);
      return;
    }
    setError(m);
    setTimeout(() => setError((cur) => (cur === m ? '' : cur)), 3500);
  }, []);
  const [viewers, setViewers] = useState(room.viewers || 0);
  const [chat, setChat] = useState([]);
  const [text, setText] = useState('');
  const [gifts, setGifts] = useState([]);
  const [games, setGames] = useState(GAME_CENTER);
  const [balance, setBalance] = useState(0);
  const [showGifts, setShowGifts] = useState(false);
  const [seats, setSeats] = useState(Array.from({ length: 9 }, (_, i) => ({ index: i, user: null })));
  const [pk, setPk] = useState(null);
  const [pkChallenge, setPkChallenge] = useState(null);
  const [pkPick, setPkPick] = useState(false);
  const [pkRooms, setPkRooms] = useState([]);
  const [pkRoomsLoading, setPkRoomsLoading] = useState(false);
  const [pkMatching, setPkMatching] = useState(false);
  const [pkMatchLabel, setPkMatchLabel] = useState('');
  const [pkMinutes, setPkMinutes] = useState(5);
  const [pkRoomQuery, setPkRoomQuery] = useState('');
  const pkMatchCancelRef = useRef(false);
  const [remoteUid, setRemoteUid] = useState(null);
  const [rivalRemoteUid, setRivalRemoteUid] = useState(null);
  const rivalEngineRef = useRef(null);
  const hostVideoUidRef = useRef(null);
  const [localUid, setLocalUid] = useState(0);
  const localUidRef = useRef(0);
  localUidRef.current = localUid;
  const [agoraReady, setAgoraReady] = useState(false);
  const [muted, setMuted] = useState(Boolean(room.startMuted));
  const [camOff, setCamOff] = useState(false);
  const [stateSnap, setStateSnap] = useState(null);
  const [hideChat, setHideChat] = useState(false);
  const [hideMicStatus, setHideMicStatus] = useState(false);
  const [hideChrome, setHideChrome] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showGameCenter, setShowGameCenter] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [audienceTab, setAudienceTab] = useState('online');
  const [period, setPeriod] = useState('daily');
  const [showApplying, setShowApplying] = useState(false);
  const [applying, setApplying] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSeconds, setInviteSeconds] = useState(10);
  const [feedRooms, setFeedRooms] = useState([]);
  const [giftTarget, setGiftTarget] = useState(null);
  const [following, setFollowing] = useState(false);
  const [memberMenu, setMemberMenu] = useState(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [giftSending, setGiftSending] = useState(false);
  const [giftError, setGiftError] = useState('');
  const [luckyBoard, setLuckyBoard] = useState(false);
  const [luckyResult, setLuckyResult] = useState(null);
  const [luckyBoxOpen, setLuckyBoxOpen] = useState(false);
  const [luckyBoxRules, setLuckyBoxRules] = useState(false);
  const [luckyBoxClaim, setLuckyBoxClaim] = useState(false);
  const [activeLuckyBox, setActiveLuckyBox] = useState(null);
  const [luckyBoxSending, setLuckyBoxSending] = useState(false);
  const [luckyBoxError, setLuckyBoxError] = useState('');
  const [luckyBoxWin, setLuckyBoxWin] = useState(null);
  const [luckyClaimResult, setLuckyClaimResult] = useState(null);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [roomInfoTab, setRoomInfoTab] = useState('member');
  const [roomFollow, setRoomFollow] = useState({ following: false, followers: 0 });
  const [roomMembers, setRoomMembers] = useState([]);
  const [focusUser, setFocusUser] = useState(null);
  const giftSendingRef = useRef(false);
  const lastLocalGiftRef = useRef({ at: 0, key: '' });
  const showGiftsRef = useRef(false);
  const luckyBoardRef = useRef(false);
  const luckyResultRef = useRef(null);
  const luckyBoxOpenRef = useRef(false);
  const luckyBoxClaimRef = useRef(false);
  showGiftsRef.current = showGifts;
  luckyBoardRef.current = luckyBoard;
  luckyResultRef.current = luckyResult;
  luckyBoxOpenRef.current = luckyBoxOpen;
  luckyBoxClaimRef.current = luckyBoxClaim;
  const [seatMoveUser, setSeatMoveUser] = useState(null);
  const [inviteSeatIndex, setInviteSeatIndex] = useState(null);
  const [speakingKeys, setSpeakingKeys] = useState(() => new Set());
  const [profileUser, setProfileUser] = useState(null);
  const [profileDetail, setProfileDetail] = useState(null);
  const [profileFollowing, setProfileFollowing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [chatImage, setChatImage] = useState(null);
  const [chatImageMini, setChatImageMini] = useState(false);
  const [beautyFilter, setBeautyFilter] = useState(room.beautyFilter || 'none');
  const [showBeauty, setShowBeauty] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [giftQueue, setGiftQueue] = useState([]);
  const giftPlayingRef = useRef(false);
  const burst = giftQueue[0] || null;
  const enqueueGift = useCallback((payload) => {
    if (!payload) return;
    const key = String(payload._playKey || payload._key || `${payload.animToken || payload.name}:${payload.from}:${Date.now()}`);
    setGiftQueue((q) => {
      if (q.some((g) => String(g._playKey || g._key) === key)) return q;
      const next = { ...payload, _key: key, _playKey: key };
      return q.length >= 3 ? [...q.slice(-2), next] : [...q, next];
    });
  }, []);
  const finishGift = useCallback(() => {
    giftPlayingRef.current = false;
    setGiftQueue((q) => q.slice(1));
  }, []);
  const enqueueGiftRef = useRef(enqueueGift);
  enqueueGiftRef.current = enqueueGift;
  const speakerOnRef = useRef(true);
  speakerOnRef.current = speakerOn;
  const wasOnSeatRef = useRef(false);

  const engineRef = useRef(null);
  const minimizingRef = useRef(false);
  const leavingRef = useRef(false);
  const switchingRef = useRef(false);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const camOffRef = useRef(camOff);
  camOffRef.current = camOff;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const beautyFilterRef = useRef(beautyFilter);
  beautyFilterRef.current = beautyFilter;
  const isHost = Boolean(room.isHost) || String(room.hostId) === String(user?.id);
  const channel = String(room.channel || '');
  const meId = String(user?.id || '');
  const hostUid = String(room.hostId || (isHost ? user?.id : '') || '');
  const platformAdmin = isPlatformAdmin(user);

  useEffect(() => {
    liveMini.prepareForRoom(channel);
  }, [channel, liveMini]);

  const toast = (msg) => {
    if (Platform.OS === 'android') ToastAndroid.show(String(msg || ''), ToastAndroid.SHORT);
  };
  const isValidId = (id) => {
    const s = String(id || '').trim();
    return Boolean(s) && s !== 'null' && s !== 'undefined' && s.length >= 8;
  };
  const personId = (p) => String(p?.id || p?.userId || p?.user_id || '').trim();

  const giftRecipients = useMemo(() => {
    const list = [];
    const push = (name, id, pic, kind) => {
      const uid = isValidId(id) ? String(id).trim() : '';
      if (!uid || uid === meId) return;
      if (list.some((x) => String(x.id) === uid)) return;
      list.push({
        id: uid,
        name: String(name || (kind === 'host' ? 'Host' : 'Guest')).slice(0, 32),
        pic,
        kind: kind || 'guest',
      });
    };
    if (hostUid && hostUid !== meId) {
      push(room.hostName || 'Host', hostUid, room.hostProfilePic, 'host');
    }
    const pkOpp = pk?.targetUserId || pk?.rightUserId || pk?.guestUserId;
    if (pkOpp) push(pk?.rightName || pk?.guestName || 'Rival', pkOpp, pk?.rightPic || pk?.guestProfilePic, 'pk');
    if (focusUser?.id) push(focusUser.name, focusUser.id, focusUser.pic, 'focus');
    seats.forEach((s) => {
      const u = s?.user;
      if (!u) return;
      const uid = u.id || u.userId;
      if (hostUid && String(uid) === hostUid) return;
      push(u.name || u.displayName || 'Guest', uid, u.profilePic || u.profile_pic || u.pic, 'seat');
    });
    return list;
  }, [hostUid, meId, pk, room.hostName, room.hostProfilePic, seats, focusUser]);

  const isRoomAdminSelf = useMemo(() => {
    if (platformAdmin) return true;
    const members = [...(stateSnap?.onlineMembers || []), ...(stateSnap?.seats || [])];
    return members.some((m) => {
      const uid = String(m.userId || m.user_id || m.id || '');
      return (
        uid === meId &&
        (m.isAdmin || m.role === 'admin' || m.isPlatformAdmin)
      );
    });
  }, [meId, stateSnap, platformAdmin]);
  const canModerate = isHost || isRoomAdminSelf || platformAdmin;
  const chatLocked = Boolean(stateSnap?.chatLocked);
  const liveRoomId = stateSnap?.roomId || stateSnap?.id || room.roomId || room.id || null;

  const memberIsAdmin = (uid) => {
    const id = String(uid || '');
    const members = [...(stateSnap?.onlineMembers || []), ...(stateSnap?.seats || [])];
    return members.some((m) => {
      const mid = String(m.userId || m.user_id || m.id || '');
      return mid === id && (m.isAdmin || m.role === 'admin') && !m.isPlatformAdmin;
    });
  };
  const memberOnStage = (uid) => {
    const id = String(uid || '');
    if (hostUid && id === hostUid) return true;
    return seats.some((s) => {
      const u = s?.user;
      return u && String(u.id || u.userId) === id;
    });
  };

  const chatSeededRef = useRef(false);

  const mapChatMsg = useCallback((msg) => {
    if (!msg) return null;
    const text = sanitizePublicText(msg.text || msg.message || '', 280);
    const imageUrl = msg.imageUrl || msg.image_url || msg.mediaUrl || null;
    if (!text && !imageUrl) return null;
    if (/don'?t say me love you|join my room|applied for seat/i.test(text) && (msg.system || msg.type === 'system')) {
      return null;
    }
    const userId = String(msg.userId || msg.user_id || '');
    const userName = sanitizePublicText(msg.user || msg.from || 'User', 32) || 'User';
    const pic = msg.pic || msg.profilePic || msg.profile_pic;
    return {
      id: String(msg.id || `${Date.now()}-${userId || userName}`),
      user: userName,
      text,
      imageUrl,
      type: msg.type || 'chat',
      system: Boolean(msg.system || msg.type === 'system' || msg.user === 'System'),
      userId,
      pic,
    };
  }, []);

  const appendChat = useCallback((msg) => {
    if (!msg) return;
    const mapped = mapChatMsg(msg);
    if (!mapped) return;
    const text = mapped.text;
    const imageUrl = mapped.imageUrl;
    const userId = mapped.userId;
    const userName = mapped.user;
    const pic = mapped.pic;
    const now = Date.now();
    setChat((prev) => {
      const dupIdx = prev.findIndex((m) => {
        if (msg.id && m.id && String(m.id) === String(msg.id) && !String(msg.id).startsWith('local-')) return true;
        const samePerson = String(m.userId || '') === userId
          || (!userId && String(m.user) === String(userName));
        const sameText = String(m.text || '') === String(text);
        const sameImg = String(m.imageUrl || '') === String(imageUrl || '');
        const age = now - (Number(String(m.id).replace(/\D/g, '').slice(0, 13)) || 0);
        const recent = age >= 0 && age < 12000;
        const localPair = String(m.id || '').startsWith('local-') || String(msg.id || '').startsWith('local-');
        return samePerson && sameText && sameImg && !m.system && (msg.type || 'chat') === (m.type || 'chat') && (recent || localPair);
      });
      if (dupIdx >= 0) {
        const next = [...prev];
        next[dupIdx] = {
          ...next[dupIdx],
          id: String(msg.id || next[dupIdx].id).startsWith('local-') && msg.id && !String(msg.id).startsWith('local-')
            ? String(msg.id)
            : next[dupIdx].id,
          pic: next[dupIdx].pic || pic,
          userId: next[dupIdx].userId || userId,
          imageUrl: next[dupIdx].imageUrl || imageUrl,
          user: next[dupIdx].user || userName,
        };
        return next;
      }
      return [...prev.slice(-80), mapped];
    });
  }, [mapChatMsg]);

  /** Seed / merge prior room chat from join snapshot or live:state (webview parity). */
  const hydrateChatFromState = useCallback((state) => {
    const msgs = state?.messages;
    if (!Array.isArray(msgs) || !msgs.length) return;
    const mapped = msgs.map(mapChatMsg).filter(Boolean);
    if (!mapped.length) return;
    if (!chatSeededRef.current) {
      chatSeededRef.current = true;
      setChat(mapped.slice(-80));
      return;
    }
    setChat((prev) => {
      const byId = new Map(prev.map((m) => [String(m.id), m]));
      for (const m of mapped) {
        if (!byId.has(String(m.id))) byId.set(String(m.id), m);
        else {
          const cur = byId.get(String(m.id));
          byId.set(String(m.id), {
            ...cur,
            pic: cur.pic || m.pic,
            userId: cur.userId || m.userId,
            imageUrl: cur.imageUrl || m.imageUrl,
            user: cur.user || m.user,
          });
        }
      }
      /* Keep snapshot chronological order, then any local-only tails */
      const order = [];
      const seen = new Set();
      for (const m of mapped) {
        const id = String(m.id);
        if (seen.has(id)) continue;
        seen.add(id);
        order.push(byId.get(id));
      }
      for (const m of prev) {
        const id = String(m.id);
        if (seen.has(id)) continue;
        seen.add(id);
        order.push(m);
      }
      return order.slice(-80);
    });
  }, [mapChatMsg]);

  const loadWalletAndGifts = useCallback(async () => {
    try {
      const [g, w, catalog] = await Promise.all([
        api.get('/social/gifts/catalog', null, { auth: false }),
        api.get('/wallet/balance'),
        api.get('/games/catalog', null, { auth: false }).catch(() => null),
      ]);
      setGifts(api.extractList(g));
      setGames(uniqueGames([...GAME_CENTER, ...api.extractList(catalog)]));
      const d = api.unwrap(w) || {};
      /* Match web SocialWallet.getGiftableCoins — never treat missing giftable as 0 when wallet has coins */
      const coin = Number(d.coin_balance ?? d.coins ?? 0) || 0;
      const sell = Number(d.sell_inventory_coins ?? d.inventory_coins ?? 0) || 0;
      const gift =
        d.giftable_coins != null
          ? Number(d.giftable_coins) || 0
          : sell > 0
            ? sell + coin
            : coin;
      const bal = Math.max(gift, coin, sell + coin, 0);
      setBalance(bal);
      return bal;
    } catch (_e) {
      return 0;
    }
  }, [api]);

  const chatSendingRef = useRef(false);
  const sendChat = async (override) => {
    const message = String(override ?? text).trim();
    if (!message) return;
    if (chatSendingRef.current) return;
    if (!channel) {
      setError('Room channel missing — leave and open the live again');
      return;
    }
    if (chatLocked && !canModerate) {
      setError('Host muted all chat');
      return;
    }
    chatSendingRef.current = true;
    setText('');
    setShowEmoji(false);
    const myName = sanitizePublicText(formatDisplayName(user) || user?.first_name || 'You', 32);
    appendChat({
      id: `local-${Date.now()}`,
      user: myName,
      text: message,
      type: 'chat',
      userId: user?.id,
      pic: user?.profile_pic || user?.profilePic,
    });
    try {
      await socket.connect(accessToken);
      await socket.sendChat(channel, message);
    } catch (e) {
      setError(e.message || 'Chat failed');
      setText(message);
    } finally {
      setTimeout(() => { chatSendingRef.current = false; }, 400);
    }
  };

  const sendPhoto = async () => {
    const asset = await pickMedia('image');
    if (!asset) return;
    const part = filePart(asset, 'photo.jpg');
    if (!part) {
      setError('Could not read that photo');
      return;
    }
    const mime = String(part.type || '').toLowerCase();
    if (!mime.startsWith('image/') && !/heic|heif/i.test(mime) && !/heic|heif/i.test(part.name || '')) {
      setError('Only photos can be sent in live chat');
      return;
    }
    try {
      const form = new FormData();
      /* Backend: POST /api/live/chat/media uses chatImageUpload.single('image') — same as webview */
      form.append('image', part);
      const up = await api.request('/live/chat/media', { method: 'POST', body: form, timeoutMs: 120000 });
      const d = api.unwrap(up) || {};
      const url = d.url || d.media_url || d.imageUrl;
      if (!url) throw new Error('Upload failed');
      const myName = sanitizePublicText(formatDisplayName(user) || user?.first_name || 'You', 32);
      appendChat({
        id: `local-${Date.now()}`,
        user: myName,
        text: '',
        imageUrl: url,
        type: 'chat',
        userId: user?.id,
        pic: user?.profile_pic || user?.profilePic,
      });
      await socket.connect(accessToken);
      await socket.sendChat(channel, '[photo]', { imageUrl: url });
    } catch (e) {
      setError(e.message || 'Photo failed');
    }
  };

  const setupAgora = useCallback(async () => {
    if (!channel) {
      setAgoraReady(true);
      return;
    }
    releaseHoldIfDifferent(channel);

    const bindHandlers = (engine, uid) => {
      engine.registerEventHandler({
        onJoinChannelSuccess: () => {
          setJoined(true);
          syncAgoraAudioRoute(engine, { speakerWanted: speakerOnRef.current }).catch(() => {});
          const hostUid = hostVideoUidRef.current;
          if (hostUid) {
            ensureRemoteAudioOpen(engine, hostUid);
            if (!isParty) ensureRemoteVideoOpen(engine, hostUid);
            else muteRemoteVideoForAudioOnly(engine);
          }
        },
        onUserJoined: (_conn, remote) => {
          hostVideoUidRef.current = remote;
          setRemoteUid(remote);
          ensureRemoteAudioOpen(engine, remote);
          if (!isParty) ensureRemoteVideoOpen(engine, remote);
          else muteRemoteVideoForAudioOnly(engine);
        },
        onUserOffline: (_conn, remote) => {
          if (hostVideoUidRef.current === remote) {
            hostVideoUidRef.current = null;
          }
          setRemoteUid((cur) => (cur === remote ? null : cur));
        },
        onRemoteVideoStateChanged: (_conn, remote, state) => {
          if (isParty) {
            muteRemoteVideoForAudioOnly(engine);
            return;
          }
          if (state === 1 || state === 2) {
            hostVideoUidRef.current = remote;
            setRemoteUid((cur) => (cur === remote ? cur : remote));
            ensureRemoteVideoOpen(engine, remote);
          }
        },
        onAudioVolumeIndication: (...args) => {
          const speakers = Array.isArray(args[0]) ? args[0] : Array.isArray(args[1]) ? args[1] : [];
          const next = new Set();
          speakers.forEach((sp) => {
            if (Number(sp?.volume || 0) < 10) return;
            const spUid = Number(sp.uid);
            if (spUid === 0 || spUid === uid) next.add('local');
            else next.add(String(spUid));
          });
          setSpeakingKeys((prev) => {
            if (prev.size === next.size && [...next].every((k) => prev.has(k))) return prev;
            return next;
          });
        },
        onAudioRoutingChanged: () => {
          syncAgoraAudioRoute(engine, { speakerWanted: speakerOnRef.current }).catch(() => {});
        },
        onError: (_engine, err) => {
          if (err) softError(`Live engine error ${err}`);
        },
      });
    };

    const held = claimHold(channel);
    if (held?.engine) {
      const engine = held.engine;
      engineRef.current = engine;
      if (held.remoteUid) {
        hostVideoUidRef.current = held.remoteUid;
        setRemoteUid(held.remoteUid);
      }
      if (held.localUid) setLocalUid(held.localUid);
      bindHandlers(engine, held.localUid || 0);
      try {
        if (isParty) muteRemoteVideoForAudioOnly(engine);
        else if (held.remoteUid) ensureRemoteVideoOpen(engine, held.remoteUid);
        ensureRemoteAudioOpen(engine, held.remoteUid);
        syncAgoraAudioRoute(engine, { speakerWanted: speakerOnRef.current }).catch(() => {});
      } catch (_e) {}
      setAgoraReady(true);
      setJoined(true);
      return;
    }
    if (!Agora) {
      setAgoraReady(true);
      setError('Live video is unavailable on this install. Chat still works.');
      return;
    }
    if (engineRef.current) return;
    try {
      await requestMedia(isHost, { party: isParty });
    const tokenRes = await api.post('/live/agora/token', {
        channel: String(channel).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      role: isHost ? 'host' : 'audience',
    });
    const appId = tokenRes.appId || tokenRes.data?.appId;
    const token = tokenRes.token || tokenRes.data?.token || null;
    const uid = Number(tokenRes.uid || tokenRes.data?.uid || 0);
    setLocalUid(uid);
    if (!appId) {
      setAgoraReady(true);
        setError('Could not start video for this room. Chat still works.');
      return;
    }

    const {
      createAgoraRtcEngine,
      ChannelProfileType,
      ClientRoleType,
    } = Agora;
    const engine = createAgoraRtcEngine();
    engineRef.current = engine;
    engine.initialize({ appId });
      configureAgoraVoice(engine, { publishing: isHost, party: isParty });
      try {
        engine.enableAudioVolumeIndication?.(200, 3, true);
      } catch (_e) {}
    bindHandlers(engine, uid);
      /* Always enable audio — video lives also need clear host voice */
      try {
        engine.enableAudio?.();
        if (isParty) {
          muteRemoteVideoForAudioOnly(engine);
          if (isHost) {
            engine.muteLocalAudioStream?.(Boolean(mutedRef.current));
          }
        } else {
          engine.enableVideo?.();
          if (isHost) {
            engine.enableLocalVideo?.(true);
            engine.startPreview?.();
            engine.muteLocalAudioStream?.(Boolean(mutedRef.current));
          }
        }
      } catch (_e) {}
    await engine.joinChannel(token, channel, uid, {
      clientRoleType: isHost
        ? ClientRoleType.ClientRoleBroadcaster
        : ClientRoleType.ClientRoleAudience,
      channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      publishMicrophoneTrack: isHost && !mutedRef.current,
      publishCameraTrack: isHost && !isParty && !camOffRef.current,
      autoSubscribeAudio: true,
      autoSubscribeVideo: !isParty,
    });
      await syncAgoraAudioRoute(engine, { speakerWanted: true });
      if (isHost && !isParty) {
        const applyBeauty = () => applyAgoraBeauty(engine, beautyFilterRef.current || room.beautyFilter || 'none');
        applyBeauty();
        setTimeout(applyBeauty, 400);
      }
      if (isParty) muteRemoteVideoForAudioOnly(engine);
    setAgoraReady(true);
    setJoined(true);
    } catch (e) {
      setAgoraReady(true);
      softError(e?.message || 'Could not start live video. Chat still works.');
    }
  }, [api, channel, isHost, isParty, softError]);

  /* Agora RTC — isolated from socket/chat/gifts. Token refresh must NOT tear down video. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isHost) await enterPublisherAudioRoute('host_join');
        else await enterAudienceAudioRoute('audience_join');
      } catch (_e) {}
      if (!cancelled) await setupAgora();
    })();
    return () => {
      cancelled = true;
      if (minimizingRef.current || peekHold()?.channel === channel) {
        engineRef.current = null;
        return;
      }
      try {
        engineRef.current?.leaveChannel?.();
        engineRef.current?.release?.();
      } catch (_e) {}
      engineRef.current = null;
      hostVideoUidRef.current = null;
      setRemoteUid(null);
      setJoined(false);
      setAgoraReady(false);
    };
  }, [channel, isHost, isParty, setupAgora]);

  useEffect(() => {
    if (!isHost || !engineRef.current) return;
    applyAgoraBeauty(engineRef.current, beautyFilter);
  }, [beautyFilter, isHost]);

  useEffect(() => {
    if (!joined || isHost) return undefined;
    const heal = () => {
      const uid = hostVideoUidRef.current;
      ensureRemoteAudioOpen(engineRef.current, uid);
      if (isParty) muteRemoteVideoForAudioOnly(engineRef.current);
      else ensureRemoteVideoOpen(engineRef.current, uid);
    };
    const t = setInterval(heal, 12000);
    return () => clearInterval(t);
  }, [joined, isHost, isParty]);

  useEffect(() => {
    let unsubs = [];
    let cancelled = false;
    (async () => {
      try {
        /*
         * Live video + Live PK: block screenshots.
         * Party (no PK): allow screenshots.
         * Depth counter keeps lock across live room switches during PK.
         */
        if (!isParty) {
          await enterLiveSecure('live_join');
        } else {
          await leaveLiveSecure('party_join');
        }
      } catch (_e) {}
      try {
        await socket.connect(accessTokenRef.current);
        const ack = await socket.joinLive(channel, {
          isParty,
          isHost,
          displayName: sanitizePublicText(formatDisplayName(user), 32),
          streamTitle: isHost
            ? sanitizePublicText(room.hostName || formatDisplayName(user), 48)
            : undefined,
        }).catch((e) => {
          softError(e.message || 'Join failed');
          return null;
        });
        const joinSnap = ack?.state || ack?.data;
        if (joinSnap) {
          setStateSnap(joinSnap);
          hydrateChatFromState(joinSnap);
        }
        if (cancelled) return;

        unsubs.push(socket.on('live:chat', (m) => appendChat(m)));
        unsubs.push(socket.on('live:lucky_gift', (ev) => {
          const prize = Number(ev?.prize || 0);
          if (prize <= 0) return;
          const mine = String(ev?.fromUserId || '') === String(user?.id || '');
          if (mine) return;
          appendChat({
            user: ev.from || 'Lucky Gift',
            text: `Lucky return 🪙 ${prize.toLocaleString()}`,
            type: 'system',
          });
        }));
        unsubs.push(socket.on('live:lucky_box', (box) => {
          if (box) {
            setActiveLuckyBox(box);
            appendChat({
              user: box.senderName || 'Lucky Box',
              text: 'sent a lucky box 🎁',
              type: 'system',
            });
          }
        }));
        unsubs.push(socket.on('live:lucky_box_update', (box) => {
          if (!box?.id) return;
          setActiveLuckyBox((prev) => (prev && String(prev.id) === String(box.id) ? { ...prev, ...box } : prev || box));
        }));
        unsubs.push(socket.on('live:lucky_box_win', (ev) => {
          setLuckyBoxWin(ev);
          setTimeout(() => setLuckyBoxWin(null), 4200);
          appendChat({
            user: ev.name || 'Lucky Box',
            text: `won 🪙 ${Number(ev.prize || 0).toLocaleString()}`,
            type: 'gift',
          });
        }));
        unsubs.push(socket.on('live:lucky_box_result', (ev) => {
          setActiveLuckyBox((prev) => (prev ? { ...prev, status: 'settled', remainingCount: 0 } : prev));
          if (ev?.winners?.length) {
            const mine = ev.winners.find((w) => String(w.userId) === String(user?.id));
            if (mine) setLuckyClaimResult(mine);
            setLuckyBoxWin({ name: 'Lucky Draw', prize: mine?.prize || ev.winners[0]?.prize });
            setTimeout(() => setLuckyBoxWin(null), 4200);
          }
        }));
        unsubs.push(socket.on('live:gift', (g) => {
          const anim = resolveGiftAnim(g);
          const giftLabel = [g.emoji, g.name || g.giftName || anim.title || 'Gift'].filter(Boolean).join(' ');
          const qty = Number(g.qty || g.quantity || 1);
          const dedupeKey = `${g.fromUserId || g.userId || g.from || g.user || ''}:${anim.token || giftLabel}:${qty}`;
          const eventId = String(g.id || g.giftId || g._id || g.ts || g.at || '');
          const playKey = eventId ? `gift:${eventId}` : `gift:${dedupeKey}:${Date.now()}`;
          const recentLocal = Date.now() - lastLocalGiftRef.current.at < 2500 && lastLocalGiftRef.current.key === dedupeKey;
          if (!recentLocal) {
            enqueueGiftRef.current({
            ...g,
            from: g.from || g.user || g.senderName,
            name: g.name || g.giftName || anim.title,
            animToken: anim.token,
            animTitle: anim.title,
              qty,
              _playKey: playKey,
              _key: playKey,
            });
          }
          appendChat({
            user: g.from || g.user,
            text: qty > 1 ? `${giftLabel} ×${qty}` : giftLabel,
            type: 'gift',
            userId: g.fromUserId || g.userId,
          });
        }));
        unsubs.push(socket.on('live:viewer_count', (d) => {
          setViewers(Number(d?.viewers || d?.count || 0));
        }));
        unsubs.push(socket.on('live:ended', () => {
          if (!isHost) {
            if (Platform.OS === 'android') ToastAndroid.show('Live ended', ToastAndroid.SHORT);
            leavingRef.current = true;
            liveMini.clearIfChannel(channel);
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Main');
          }
        }));
        unsubs.push(socket.on('live:kicked', () => {
          if (Platform.OS === 'android') ToastAndroid.show('You were removed', ToastAndroid.SHORT);
          leavingRef.current = true;
          liveMini.clearIfChannel(channel);
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.navigate('Main');
        }));
        unsubs.push(socket.on('live:member_left', (d) => {
          const leftId = String(d?.userId || d?.user_id || d?.id || '');
          if (!leftId) return;
          setStateSnap((prev) => {
            const members = (prev?.onlineMembers || []).filter(
              (m) => String(m?.userId || m?.id || m?.user?.id || '') !== leftId
            );
            return { ...(prev || {}), onlineMembers: members };
          });
          setSeats((prev) =>
            prev.map((s) => {
              const uid = String(s?.user?.id || s?.user?.userId || '');
              return uid && uid === leftId ? { ...s, user: null } : s;
            })
          );
        }));
        unsubs.push(socket.on('live:state', (s) => {
          setStateSnap(s);
          hydrateChatFromState(s);
          if (Array.isArray(s?.seats)) {
            setSeats(
              Array.from({ length: 9 }, (_, i) => {
                const found = s.seats.find((x) => {
                  if (!x || x.isHost || x.role === 'host') return false;
                  const rawIdx = x.seatIndex ?? x.seat_index ?? x.index;
                  if (rawIdx == null || rawIdx === '') return false;
                  const n = Number(rawIdx);
                  if (!Number.isFinite(n)) return false;
                  const idx = n >= 1 && n <= 9 ? n - 1 : n;
                  return idx === i;
                });
                const raw = found?.user && typeof found.user === 'object' ? found.user : found;
                const uid = String(raw?.id || raw?.userId || found?.userId || '');
                const hostUid = String(room.hostId || (isHost ? user?.id : '') || '');
                const isHostSeat =
                  Boolean(found?.isHost || raw?.isHost || raw?.role === 'host' || found?.role === 'host') ||
                  (hostUid && uid && uid === hostUid);
                const hasUser = Boolean(
                  uid &&
                  !isHostSeat &&
                  raw &&
                  typeof raw === 'object' &&
                  (raw.id || raw.userId || found?.userId)
                );
                const user = hasUser
                  ? {
                      id: uid,
                      userId: uid,
                      name: raw.name || raw.displayName || found?.name,
                      displayName: raw.displayName || raw.name || found?.name,
                      profilePic: raw.profilePic || raw.profile_pic || raw.pic || found?.profilePic,
                      pic: raw.pic || raw.profilePic || found?.profilePic,
                      muted: Boolean(raw.muted || found?.muted),
                      agoraUid: raw.agoraUid || found?.agoraUid || (uid === String(user?.id) ? localUidRef.current : undefined),
                      giftScore: Number(raw.giftScore || raw.gifts || found?.giftScore || 0),
                    }
                  : null;
                return { index: i, user };
              })
            );
            const me = String(user?.id || '');
            const stillSeated =
              Boolean(isHost) ||
              (me &&
                Array.isArray(s.seats) &&
                s.seats.some((x) => {
                  const id = String(x?.userId || x?.user?.id || x?.id || '');
                  return id && id === me && !x?.isHost && x?.role !== 'host';
                }));
            /* Promote when newly seated (seat_response may have been missed) */
            if (me && !isHost && stillSeated && !wasOnSeatRef.current) {
              promoteToPublisher({
                api,
                engine: engineRef.current,
                channel,
                muted: false,
                audioOnly: isParty,
              })
                .then(() => {
                  ensureRemoteAudioOpen(engineRef.current);
                  if (isParty) muteRemoteVideoForAudioOnly(engineRef.current);
                  else ensureRemoteVideoOpen(engineRef.current, hostVideoUidRef.current);
                  try {
                    socket.emit('live:guest_mic_ready', {
                      channel,
                      userId: me,
                      agoraUid: localUidRef.current,
                      name: sanitizePublicText(formatDisplayName(user), 32),
                    }).catch(() => {});
                  } catch (_e) {}
                })
                .catch(() => {});
              setMuted(false);
            }
            /* If we were publishing on a seat and got removed, drop publisher role */
            if (me && !isHost && wasOnSeatRef.current && !stillSeated) {
              demoteToAudience({ api, engine: engineRef.current, channel, audioOnly: isParty }).catch(() => {});
            }
            wasOnSeatRef.current = stillSeated;
            /* Keep local mute UI in sync with seat state (host + guests) */
            if (me) {
              const mySeat = Array.isArray(s.seats)
                ? s.seats.find((x) => {
                    const id = String(x?.userId || x?.user?.id || x?.id || '');
                    return id && id === me;
                  })
                : null;
              if (mySeat && typeof mySeat.muted === 'boolean') {
                setMuted(Boolean(mySeat.muted));
              } else if (mySeat?.user && typeof mySeat.user.muted === 'boolean') {
                setMuted(Boolean(mySeat.user.muted));
              }
            }
          }
          if (s?.viewers != null) setViewers(Number(s.viewers));
        }));
        unsubs.push(socket.on('live:seat_request', (p) => {
          const name = p?.name || p?.user?.name || p?.displayName || 'User';
          const pic = p?.profilePic || p?.user?.profilePic || p?.profile_pic;
          const id = p?.userId || p?.user?.id || name;
          const seatIndex = p?.seatIndex ?? p?.seat_index ?? null;
          setApplying((prev) => {
            if (prev.some((x) => String(x.id) === String(id))) return prev;
            return [...prev, { id, name, pic, level: p?.level || 1, charm: p?.charm || 1, seatIndex }];
          });
          if (isHost || canModerate) {
            setShowApplying(true);
          }
          /* Web drops these system lines — host uses Applying sheet Agree/Decline */
        }));
        unsubs.push(socket.on('live:chat_cleared', () => {
          chatSeededRef.current = false;
          setChat([]);
        }));
        unsubs.push(socket.on('live:chat_lock', (d) => {
          setStateSnap((s) => ({ ...(s || {}), chatLocked: Boolean(d?.locked) }));
        }));
        unsubs.push(socket.on('live:member_mute', (p) => {
          const uid = String(p?.userId || '');
          const muted = p?.muted !== false;
          if (!uid) return;
          setSeats((prev) => prev.map((s) => {
            const id = String(s.user?.id || s.user?.userId || '');
            if (id !== uid) return s;
            return { ...s, user: { ...s.user, muted } };
          }));
          if (uid === meId) {
            setMuted(muted);
            try {
              engineRef.current?.muteLocalAudioStream?.(muted);
              engineRef.current?.enableLocalAudio?.(!muted);
            } catch (_e) {}
          }
        }));
        unsubs.push(socket.on('live:seat_invite', (p) => {
          const target = p?.toUserId || p?.userId;
          if (target && String(target) === String(user?.id)) {
            const idx = p?.seatIndex ?? p?.seat_index;
            if (idx != null) setInviteSeatIndex(Number(idx));
            setInviteSeconds(10);
            setInviteOpen(true);
          }
        }));
        unsubs.push(socket.on('live:seat_response', (p) => {
          const uid = String(p?.userId || '');
          /* Backend emits { userId, accepted } — native used to check `accept` and never promoted */
          const ok = p?.accepted === true || p?.accept === true;
          const denied = p?.accepted === false || p?.accept === false;
          if (p?.invite && uid === String(user?.id)) {
            const idx = p?.seatIndex ?? p?.seat_index;
            if (idx != null) setInviteSeatIndex(Number(idx));
            setInviteSeconds(10);
            setInviteOpen(true);
            return;
          }
          if (denied && uid) {
            setApplying((prev) => prev.filter((x) => String(x.id) !== uid));
            if (uid === String(user?.id)) {
              setInviteOpen(false);
              toast('Seat request declined');
            }
            return;
          }
          if (ok && uid === String(user?.id)) {
            promoteToPublisher({
              api,
              engine: engineRef.current,
              channel,
              muted: false,
              audioOnly: isParty,
            })
              .then(() => {
                wasOnSeatRef.current = true;
                ensureRemoteAudioOpen(engineRef.current);
                if (isParty) muteRemoteVideoForAudioOnly(engineRef.current);
                else ensureRemoteVideoOpen(engineRef.current, hostVideoUidRef.current);
                try {
                  socket.emit('live:guest_mic_ready', {
                    channel,
                    userId: user?.id,
                    agoraUid: localUidRef.current,
                    name: sanitizePublicText(formatDisplayName(user), 32),
                  }).catch(() => {});
                } catch (_e) {}
              })
              .catch(() => {});
            setMuted(false);
            setShowApplying(false);
            setInviteOpen(false);
            setApplying((prev) => prev.filter((x) => String(x.id) !== uid));
            toast('You are on the seat — mic is live');
          } else if (ok && uid) {
            setApplying((prev) => prev.filter((x) => String(x.id) !== uid));
          }
        }));
        unsubs.push(socket.on('pk:challenge', (p) => {
          setPkChallenge(p);
          /* Challenged host should always see Accept/Decline */
          if (isHost || String(p?.targetUserId || p?.toUserId) === String(user?.id)) {
            toast('PK challenge incoming');
          }
        }));
        unsubs.push(socket.on('pk:challenge:accepted', (p) => {
          setPk(p);
          setPkChallenge(null);
          setPkMatching(false);
          setPkPick(false);
          toast('PK started');
        }));
        unsubs.push(socket.on('pk:challenge:declined', () => {
          setPkChallenge(null);
          setPkMatching(false);
          toast('PK declined');
        }));
        unsubs.push(socket.on('pk:start', (p) => {
          setPk(p);
          setPkChallenge(null);
          setPkMatching(false);
          setPkPick(false);
        }));
        unsubs.push(socket.on('pk:score', (p) => setPk((prev) => ({ ...(prev || {}), ...(p || {}) }))));
        unsubs.push(socket.on('pk:end', () => {
          setPk(null);
          setPkChallenge(null);
          setPkMatching(false);
          setRivalRemoteUid(null);
          setFeedRooms([]);
          stopPkRivalEngine(rivalEngineRef).catch(() => {});
        }));

        await loadWalletAndGifts();
        api.get('/live/lucky-box/active', { channel }, { auth: false, cacheTtlMs: 0 })
          .then((r) => {
            const list = api.extractList(r);
            if (list[0]) setActiveLuckyBox(list[0]);
          })
          .catch(() => {});
        if (!isHost && room.hostId) {
          api.get(`/social/creators/${room.hostId}/engagement`, null, { auth: false })
            .then((r) => {
              const eng = api.unwrap(r) || {};
              setFollowing(Boolean(eng.isFollowing || eng.following || eng.is_following));
            })
            .catch(() => {});
        }
        if (isParty && channel) {
          api.get(`/live/rooms/${encodeURIComponent(channel)}/follow`)
            .then((r) => {
              const d = api.unwrap(r) || {};
              setRoomFollow({
                following: Boolean(d.following),
                followers: Number(d.followers || 0),
              });
            })
            .catch(() => {});
          api.get(`/live/rooms/${encodeURIComponent(channel)}/followers`)
            .then((r) => setRoomMembers(api.extractList(r)))
            .catch(() => {});
        }
      } catch (e) {
        if (!cancelled) softError(e.message || 'Could not join live');
      }
    })();

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        LiveAudioRoute.onAppForeground().catch(() => {});
        syncAgoraAudioRoute(engineRef.current, { speakerWanted: speakerOnRef.current }).catch(() => {});
        const uid = hostVideoUidRef.current;
        ensureRemoteAudioOpen(engineRef.current, uid);
        if (isParty) muteRemoteVideoForAudioOnly(engineRef.current);
        else ensureRemoteVideoOpen(engineRef.current, uid);
        if (!isParty) assertLiveSecure('app_foreground').catch(() => {});
      }
    });

    const btPoll = setInterval(() => {
      syncAgoraAudioRoute(engineRef.current, { speakerWanted: speakerOnRef.current }).catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      chatSeededRef.current = false;
      try {
        appSub?.remove?.();
      } catch (_e) {}
      clearInterval(btPoll);
      stopPkRivalEngine(rivalEngineRef).catch(() => {});
      unsubs.forEach((u) => {
        try {
          u?.();
        } catch (_e) {}
      });
      if (minimizingRef.current) return;
      liveMini.clearIfChannel(channel);
      try {
        socket.leaveLive(channel);
      } catch (_e) {}
      LiveAudioRoute.leaveLive('leave_room').catch(() => {});
      leaveLiveSecure(isParty ? 'party_leave' : 'live_leave').catch(() => {});
    };
  }, [appendChat, channel, hydrateChatFromState, isHost, isParty, loadWalletAndGifts, navigation, room.hostId, socket, user?.id, liveMini, softError]);

  /* Live PK must stay screenshot-locked even if capture was briefly cleared */
  useEffect(() => {
    if (isParty) return undefined;
    if (pk || pkChallenge) {
      enterLiveSecure('live_pk').catch(() => {});
      return () => {
        leaveLiveSecure('live_pk_end').catch(() => {});
      };
    }
    assertLiveSecure('live_idle').catch(() => {});
    return undefined;
  }, [isParty, pk, pkChallenge]);

  useEffect(() => {
    if (!pk) {
      setFeedRooms([]);
      return undefined;
    }
    const opponentChannel = pk.targetChannel || pk.opponentChannel || pk.rightChannel || pk.guestChannel || pk.rivalChannel;
    const opponentName = pk.rightName || pk.guestName || pk.targetName || pk.opponentName || 'Rival';
    const opponentPic = pk.rightPic || pk.guestProfilePic || pk.targetProfilePic || pk.opponentPic;
    const opponentId = pk.targetUserId || pk.rightUserId || pk.guestUserId;
    if (opponentChannel && opponentChannel !== channel) {
      setFeedRooms([{
        channel: opponentChannel,
        hostName: opponentName,
        hostId: opponentId,
        hostProfilePic: opponentPic,
        hostStreamCover: opponentPic,
        viewers: pk.rightViewers || 0,
        isParty: false,
      }]);
      return undefined;
    }
    let cancelled = false;
    api.get('/live/rooms', { type: 'live', limit: 20 }, { auth: false }).then((r) => {
      if (cancelled) return;
      const list = api.extractList(r)
        .filter((x) => x.channel && x.channel !== channel)
        .filter((x) => !opponentId || String(x.hostId || x.host_user_id) === String(opponentId))
        .slice(0, 1)
        .map((x) => ({
          channel: x.channel,
          hostName: x.hostName || x.host_display_name || opponentName,
          hostId: x.hostId || x.host_user_id,
          hostProfilePic: x.hostProfilePic || x.host_profile_pic,
          hostStreamCover: x.hostStreamCover || x.stream_cover_url,
          viewers: x.viewers || x.viewer_count || 0,
          isParty: x.type === 'party',
        }));
      setFeedRooms(list);
    }).catch(() => {
      if (!cancelled) setFeedRooms([]);
    });
    return () => { cancelled = true; };
  }, [api, channel, pk]);

  /* PK rival host video — second Agora channel (webview pkRivalAgoraClient) */
  useEffect(() => {
    if (!pk || isParty || !Agora) {
      setRivalRemoteUid(null);
      stopPkRivalEngine(rivalEngineRef).catch(() => {});
      return undefined;
    }
    const rivalCh = resolvePkRivalChannel(pk, channel);
    if (!rivalCh) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await startPkRivalEngine({
          Agora,
          api,
          rivalChannel: rivalCh,
          myChannel: channel,
          pkSnapshot: pk,
          engineRef: rivalEngineRef,
          onHostUid: (uid, offline) => {
            if (cancelled) return;
            if (uid == null) {
              setRivalRemoteUid((cur) => (offline && cur === offline ? null : cur));
            } else {
              setRivalRemoteUid(uid);
            }
          },
        });
      } catch (_e) {}
    })();
    return () => {
      cancelled = true;
      setRivalRemoteUid(null);
      stopPkRivalEngine(rivalEngineRef).catch(() => {});
    };
  }, [api, channel, isParty, pk]);

  const shareRoom = () => {
    Share.share({
      title: 'AP Live',
      message: `Watch ${room.hostName || 'this live'} on AP Live Service\naplive://live/${encodeURIComponent(channel || '')}`,
    }).catch(() => {});
  };

  const resolveGiftTargets = (opts = {}) => {
    const sendAll = Boolean(opts.sendAll);
    if (sendAll) return giftRecipients.filter((r) => isValidId(r.id) && String(r.id) !== meId);
    const picked = String(opts.toUserId || giftTarget?.id || '').trim();
    if (isValidId(picked) && picked !== meId) {
      const hit = giftRecipients.find((r) => String(r.id) === picked);
      return [hit || { id: picked, name: giftTarget?.name || 'Guest', pic: giftTarget?.pic }];
    }
    if (hostUid && hostUid !== meId) {
      const host = giftRecipients.find((r) => String(r.id) === hostUid);
      if (host) return [host];
    }
    return giftRecipients[0] ? [giftRecipients[0]] : [];
  };

  const sendGiftHttp = async (receiverId, gift, amount, qty, clientRequestId) => {
    const res = await api.post('/wallet/gifts', {
      receiverId,
      receiver_id: receiverId,
      giftType: gift.slug || gift.emoji || 'gift',
      gift_type: gift.slug || gift.emoji || 'gift',
      coinAmount: amount,
      coin_amount: amount,
      qty,
      liveRoomId: liveRoomId || undefined,
      live_room_id: liveRoomId || undefined,
      clientRequestId,
      client_request_id: clientRequestId,
    });
    return api.unwrap(res);
  };

  const sendGift = async (gift, qty, opts = {}) => {
    const unit = Number(gift?.coin_cost || gift?.cost || gift?.coins || gift?.price || 0);
    const amount = unit * Number(qty || 1);
    if (!gift || amount <= 0) {
      setGiftError('Pick a gift first');
      return;
    }
    if (amount > 10000000) {
      setGiftError('Maximum gift is 10,000,000 coins');
      return;
    }
    const targets = resolveGiftTargets(opts);
    if (!targets.length) {
      const msg = isHost
        ? 'Pick a guest who joined the live to receive the gift'
        : 'Host is still connecting — wait a moment, then try again';
      setGiftError(msg);
      toast(msg);
      return;
    }
    const total = amount * targets.length;
    let spendable = Number(balance || 0);
    if (total > spendable) {
      spendable = Number((await loadWalletAndGifts().catch(() => spendable)) || spendable);
    }
    if (total > spendable) {
      setGiftError(`Need ${total.toLocaleString()} coins (you have ${spendable.toLocaleString()})`);
      toast('Not enough coins for this gift');
      return;
    }
    if (giftSendingRef.current) {
      toast('Gift still sending…');
      throw new Error('Gift still sending…');
    }
    giftSendingRef.current = true;
    setGiftSending(true);
    setGiftError('');
      const anim = resolveGiftAnim(gift);
    let sent = 0;
    let lastError = '';
    let lastLucky = null;
    try {
      try {
        await socket.connect(accessToken);
      } catch (e) {
        lastError = e.message || 'Not connected';
      }
      for (const target of targets) {
        const toUserId = String(target.id || '');
        if (!isValidId(toUserId) || toUserId === meId) {
          lastError = 'Pick someone else — you cannot gift yourself';
          continue;
        }
        const payload = {
        giftSlug: gift.slug,
          giftType: gift.slug,
          giftName: gift.name || anim.title,
        amount,
        qty,
          to: target.name,
          toUserId,
        emoji: gift.emoji,
        name: gift.name || anim.title,
        animToken: anim.token,
        animTitle: anim.title,
          clientRequestId: `${opts.clientRequestId || newClientRequestId('gift')}-${toUserId.slice(0, 12)}`,
        };
        try {
          let ack = null;
          if (socket.socket?.connected) {
            ack = await socket.sendGift(channel, payload);
          } else {
            ack = await sendGiftHttp(toUserId, gift, amount, qty, payload.clientRequestId);
          }
          sent += 1;
          const payloadData = ack?.data || ack || {};
          const lucky = payloadData.lucky || ack?.lucky;
          const bal = payloadData.balance || payloadData.sender_balance;
          if (bal?.giftable_coins != null) {
            setBalance(Number(bal.giftable_coins));
          } else if (bal?.coin_balance != null) {
            setBalance(Number(bal.coin_balance));
          }
          if (lucky) lastLucky = lucky;
        } catch (e) {
          const msg = e.message || 'Gift failed';
          lastError = msg;
          if (/not connected/i.test(msg)) {
            try {
              const httpAck = await sendGiftHttp(toUserId, gift, amount, qty, payload.clientRequestId);
              sent += 1;
              lastError = '';
              const lucky = httpAck?.lucky;
              const bal = httpAck?.balance || httpAck?.sender_balance;
              if (bal?.giftable_coins != null) setBalance(Number(bal.giftable_coins));
              else if (bal?.coin_balance != null) setBalance(Number(bal.coin_balance));
              if (lucky) lastLucky = lucky;
            } catch (httpErr) {
              lastError = httpErr.message || msg;
              break;
            }
          } else {
            break;
          }
        }
      }
      if (sent > 0) {
      setShowGifts(false);
        if (!lastLucky) {
          setBalance((b) => Math.max(0, b - amount * sent));
        }
        const giftLabel = [gift.emoji, gift.name || anim.title || 'Gift'].filter(Boolean).join(' ');
        const dedupeKey = `${user?.id || user?.first_name || 'You'}:${anim.token || giftLabel}:${qty}`;
        const playKey = `local:${dedupeKey}:${Date.now()}`;
        lastLocalGiftRef.current = { at: Date.now(), key: dedupeKey };
        enqueueGift({
        emoji: gift.emoji,
        name: gift.name || anim.title,
        from: user?.first_name || 'You',
        qty,
        amount,
        animToken: anim.token,
        animTitle: anim.title,
          _playKey: playKey,
          _key: playKey,
        });
        appendChat({
          user: user?.first_name || 'You',
          text: qty > 1 ? `${giftLabel} ×${qty}` : giftLabel,
          type: 'gift',
          userId: meId,
        });
        toast(sent > 1 ? `Gifts sent to ${sent} seats` : 'Gift sent');
        if (lastLucky) setLuckyResult(lastLucky);
        loadWalletAndGifts().catch(() => {});
      } else {
        const msg = lastError || 'Gift failed';
        setGiftError(msg);
        toast(msg);
        if (/insufficient/i.test(msg)) {
          setGiftError(`${msg} — check balance or tap coins to recharge`);
        }
        throw new Error(msg);
      }
    } finally {
      giftSendingRef.current = false;
      setGiftSending(false);
    }
  };

  const openGiftsFor = (person) => {
    const uid = personId(person);
    if (isValidId(uid) && uid !== meId) {
      setGiftTarget({
        id: uid,
        name: person?.name || person?.displayName,
        pic: person?.pic || person?.profilePic || person?.profile_pic,
      });
    } else if (giftRecipients[0]) {
      setGiftTarget(giftRecipients[0]);
    } else {
      setGiftTarget(null);
    }
    setGiftError('');
    setShowGifts(true);
  };

  const focusAndGift = (person) => {
    if (!person) return;
    const target = {
      id: person.id || person.userId,
      name: person.name || person.displayName,
      pic: person.pic || person.profilePic || person.profile_pic,
      agoraUid: person.agoraUid,
    };
    if (String(target.id) === meId) {
      openMember(target);
      return;
    }
    setFocusUser(target);
    openGiftsFor(target);
  };

  useEffect(() => {
    if (!showGifts) return;
    const cur = String(giftTarget?.id || '');
    if (isValidId(cur) && cur !== meId) return;
    if (giftRecipients[0]) setGiftTarget(giftRecipients[0]);
  }, [showGifts, giftRecipients, giftTarget?.id, meId]);

  const runLive = async (event, payload, okMsg) => {
    try {
      await socket.connect(accessToken);
      await socket.emit(event, { channel, ...payload });
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e.message || 'Failed');
      throw e;
    }
  };

  const fireLive = async (event, payload, okMsg) => {
    try {
      await socket.connect(accessToken);
      const s = socket.socket;
      if (!s?.connected) throw new Error('Not connected to live server');
      s.emit(event, { channel, ...payload });
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e.message || 'Failed');
    }
  };

  const endOrLeave = async () => {
    leavingRef.current = true;
    liveMini.clearIfChannel(channel);
    try {
      if (isHost && !isParty) await socket.endLive(channel);
      else await socket.leaveLive(channel);
    } catch (_e) {}
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const doMinimize = useCallback(() => {
    if (minimizingRef.current || leavingRef.current) return;
    minimizingRef.current = true;
    const eng = engineRef.current;
    const uid = hostVideoUidRef.current || remoteUid;
    liveMini.minimize({
      engine: eng,
      channel,
      isParty,
      isHost,
      remoteUid: uid,
      localUid,
      camOff,
      routeName: isParty ? 'PartyRoom' : 'LiveRoom',
      params: { ...room, channel, isParty, isHost },
      hostName: room.hostName || formatDisplayName(user) || 'Live',
      hostPic: room.hostProfilePic || user?.profile_pic || user?.profilePic,
      coverUrl: room.coverUrl || room.streamCoverUrl || room.hostProfilePic,
    });
    engineRef.current = null;
    leaveLiveSecure(isParty ? 'party_minimize' : 'live_minimize').catch(() => {});
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [camOff, channel, isHost, isParty, liveMini, localUid, navigation, remoteUid, room, user]);

  useEffect(() => {
    const closeSheet = () => {
      if (luckyResult) {
        setLuckyResult(null);
        return true;
      }
      if (luckyBoxClaim) {
        setLuckyBoxClaim(false);
        return true;
      }
      if (luckyBoxOpen) {
        setLuckyBoxOpen(false);
        return true;
      }
      if (luckyBoxRules) {
        setLuckyBoxRules(false);
        return true;
      }
      if (luckyBoard) {
        setLuckyBoard(false);
        return true;
      }
      if (showGifts) {
        setShowGifts(false);
        setGiftError('');
        return true;
      }
      if (showBeauty) {
        setShowBeauty(false);
        return true;
      }
      if (showTools) {
        setShowTools(false);
        return true;
      }
      if (showEmoji) {
        setShowEmoji(false);
        return true;
      }
      if (showPeople) {
        setShowPeople(false);
        return true;
      }
      if (showProfile) {
        setShowProfile(false);
        return true;
      }
      if (showGameCenter) {
        setShowGameCenter(false);
        return true;
      }
      if (showApplying) {
        setShowApplying(false);
        return true;
      }
      if (pkPick) {
        setPkPick(false);
        return true;
      }
      if (memberMenu) {
        setMemberMenu(null);
        return true;
      }
      if (showRoomInfo) {
        setShowRoomInfo(false);
        return true;
      }
      if (inviteOpen) {
        setInviteOpen(false);
        return true;
      }
      if (chatImage && !chatImageMini) {
        setChatImage(null);
        return true;
      }
      return false;
    };

    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (closeSheet()) return true;
      return false;
    });

    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || switchingRef.current || minimizingRef.current) return;
      if (closeSheet()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      doMinimize();
    });

    return () => {
      back.remove();
      unsub();
    };
  }, [
    chatImage,
    chatImageMini,
    doMinimize,
    inviteOpen,
    luckyBoard,
    luckyBoxClaim,
    luckyBoxOpen,
    luckyBoxRules,
    luckyResult,
    memberMenu,
    navigation,
    pkPick,
    showApplying,
    showBeauty,
    showEmoji,
    showGameCenter,
    showGifts,
    showPeople,
    showProfile,
    showRoomInfo,
    showTools,
  ]);

  const toggleMute = () => {
    if (!isHost && !memberOnStage(meId)) {
      toast('Join a seat first to use your mic');
      requestSeat(0);
      return;
    }
    const next = !muted;
    setMuted(next);
    try {
      engineRef.current?.muteLocalAudioStream?.(next);
      engineRef.current?.enableLocalAudio?.(!next);
    } catch (_e) {}
    setSeats((prev) => prev.map((s) => {
      const id = String(s.user?.id || s.user?.userId || '');
      if (id !== meId) return s;
      return { ...s, user: { ...s.user, muted: next } };
    }));
    fireLive('live:mute', { userId: meId, muted: next });
    toast(next ? 'Microphone off' : 'Microphone on');
  };

  const onMicPress = () => {
    if (isHost || memberOnStage(meId)) {
      toggleMute();
      return;
    }
    requestSeat(0);
    toast('Request a seat to speak — then tap mic to mute');
  };

  const toggleCam = async () => {
    if (isParty) return;
    const next = !camOff;
    setCamOff(next);
    const eng = engineRef.current;
    try {
      if (!next && isHost) {
        eng?.enableLocalVideo?.(true);
        eng?.startPreview?.();
        eng?.muteLocalVideoStream?.(false);
        eng?.updateChannelMediaOptions?.(
          publisherMediaOptions({
            publishCameraTrack: true,
            publishMicrophoneTrack: !mutedRef.current,
          })
        );
      } else if (isHost) {
        eng?.muteLocalVideoStream?.(true);
        eng?.updateChannelMediaOptions?.(
          publisherMediaOptions({
            publishCameraTrack: false,
            publishMicrophoneTrack: !mutedRef.current,
          })
        );
      }
    } catch (_e) {}
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    speakerOnRef.current = next;
    const eng = engineRef.current;
    syncAgoraAudioRoute(eng, { speakerWanted: next }).catch(() => {
    try {
        eng?.setEnableSpeakerphone?.(next);
        eng?.adjustPlaybackSignalVolume?.(next ? 100 : 0);
    } catch (_e) {}
    });
  };

  useEffect(() => {
    if (!inviteOpen) return undefined;
    const t = setInterval(() => {
      setInviteSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          setInviteOpen(false);
          setInviteSeatIndex(null);
          return 10;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [inviteOpen]);

  const hostIdLabel = formatUserDisplayId({ display_id: room.hostDisplayId, id: room.hostId }) || room.hostId || '—';
  const roomIdLine = (() => {
    const raw = String(liveRoomId || channel || '');
    const alnum = raw.replace(/[^a-zA-Z0-9]/g, '');
    const slice = (alnum || raw).slice(-10);
    return slice ? `ID ${slice}` : '';
  })();
  const hostInfo = { id: room.hostId, name: room.hostName, pic: room.hostProfilePic };
  const hasPresenceSnap = Boolean(stateSnap && Array.isArray(stateSnap.onlineMembers));
  const people = activeRoomPeople({
    host: hostInfo,
    members: hasPresenceSnap
      ? stateSnap.onlineMembers
      : [
          hostInfo.id
            ? { userId: hostInfo.id, displayName: hostInfo.name, profilePic: hostInfo.pic }
            : null,
          user?.id
            ? {
                userId: user.id,
                displayName: formatDisplayName(user) || user.first_name,
                profilePic: user.profile_pic || user.profilePic,
              }
            : null,
        ].filter(Boolean),
    seats,
    user,
  });
  const announcement = stateSnap?.announcement || room.announcement || '🌸🧿 Radhey radhey 🧿🌸';
  const pinned = chat.find((m) => m.pinned)?.text || '';

  const toggleFollow = async () => {
    if (!room.hostId || isHost) return;
    try {
      if (following) await api.delete(`/social/follow/${room.hostId}`);
      else await api.post(`/social/follow/${room.hostId}`);
      setFollowing(!following);
    } catch (e) {
      setError(e.message || 'Follow failed');
    }
  };

  const toggleRoomFollow = async () => {
    if (!channel) return;
    try {
      const path = `/live/rooms/${encodeURIComponent(channel)}/follow`;
      const r = roomFollow.following ? await api.delete(path) : await api.post(path);
      const d = api.unwrap(r) || {};
      setRoomFollow({
        following: Boolean(d.following),
        followers: Number(d.followers || 0),
      });
      const list = await api.get(path.replace(/\/follow$/, '/followers')).catch(() => ({}));
      setRoomMembers(api.extractList(list));
    } catch (e) {
      toast(e.message || 'Could not follow room');
    }
  };

  const requestSeat = (index) => {
    const zero = Number(index);
    const seatIndex = Number.isFinite(zero) && zero >= 0 && zero <= 8 ? zero + 1 : Math.max(1, zero || 1);
    const me = {
      id: user?.id,
      name: formatDisplayName(user) || user?.first_name || 'You',
      pic: user?.profile_pic || user?.profilePic,
      level: 1,
      charm: 1,
      seatIndex,
    };
    setApplying((prev) => (prev.some((x) => String(x.id) === String(me.id)) ? prev : [...prev, me]));
    setShowApplying(true);
    socket.requestSeat(channel, seatIndex).catch((e) => softError(e.message));
    toast('Seat request sent — wait for host');
  };

  const acceptInvite = () => {
    /* Host already promoted via live:seat_response — guest only enables mic */
    setInviteOpen(false);
    promoteToPublisher({
      api,
      engine: engineRef.current,
      channel,
      muted: false,
      audioOnly: isParty,
    })
      .then(() => {
        wasOnSeatRef.current = true;
        ensureRemoteAudioOpen(engineRef.current);
        if (isParty) muteRemoteVideoForAudioOnly(engineRef.current);
        else ensureRemoteVideoOpen(engineRef.current, hostVideoUidRef.current);
        try {
          socket.emit('live:guest_mic_ready', {
            channel,
            userId: user?.id,
            agoraUid: localUidRef.current,
            name: sanitizePublicText(formatDisplayName(user), 32),
          }).catch(() => {});
        } catch (_e) {}
      })
      .catch(() => {});
      setMuted(false);
    setInviteSeatIndex(null);
  };

  const declineInvite = () => {
    setInviteOpen(false);
    setInviteSeatIndex(null);
    socket.respondSeat(channel, { userId: user?.id, accept: false }).catch(() => {});
  };

  const inviteToSeat = async (target, seatIndex) => {
    const uid = personId(target);
    if (!isValidId(uid)) {
      toast('User ID missing');
      return;
    }
    let idx = seatIndex != null ? Number(seatIndex) : (inviteSeatIndex != null ? Number(inviteSeatIndex) : null);
    const fromApply = Number(target?.seatIndex);
    if (Number.isFinite(fromApply) && fromApply >= 1 && fromApply <= 9) {
      idx = fromApply;
    } else if (idx != null && idx >= 0 && idx <= 8) {
      idx = idx + 1; /* grid 0-based → backend 1-based */
    }
    try {
      await runLive('live:seat_response', {
        userId: uid,
        name: target?.name || 'Guest',
        accepted: true,
        accept: true,
        seatIndex: idx || undefined,
      }, isParty ? 'Added to seat' : 'Added to live');
      setInviteSeatIndex(null);
      setApplying((prev) => prev.filter((x) => String(x.id) !== String(uid)));
      setShowApplying(false);
    } catch (_e) {}
  };

  const kickUser = (target, hours, reason) => {
    const uid = personId(target);
    const isTargetHost = hostUid && String(uid) === hostUid;
    const go = () => {
      runLive(
        'live:kick',
        { userId: uid, durationHours: hours, reason: reason || (isTargetHost ? 'admin_kicked_host' : 'kicked_by_host') },
        isTargetHost
          ? hours >= 2
            ? `Host removed — blocked for ${hours} hours`
            : 'Host removed — live ended'
          : `Kicked out · ${hours} hours`
      ).catch(() => {});
    };
    if (isTargetHost) {
      Alert.alert(
        'Kick host',
        hours >= 2
          ? `Kick the host for ${hours} hours and end this live?`
          : 'Kick the host and end this live? All viewers will be disconnected.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Kick', style: 'destructive', onPress: go },
        ]
      );
      return;
    }
    go();
  };

  const openMember = (person, extra = {}) => {
    if (!person) return;
    setMemberMenu({
      id: person.id || person.userId,
      name: person.name || person.displayName,
      pic: person.pic || person.profilePic || person.profile_pic,
      ...extra,
    });
  };

  const openProfile = (person) => {
    if (!person || person.empty) return;
    const target = {
      id: person.id || person.userId,
      name: person.name || person.displayName || person.user,
      pic: person.pic || person.profilePic || person.profile_pic,
      displayId: person.displayId || person.display_id,
    };
    setProfileUser(target);
    setProfileDetail(null);
    setProfileFollowing(false);
    setShowProfile(true);
    const uid = String(target.id || '').trim();
    if (!isValidId(uid)) return;
    setProfileLoading(true);
    Promise.all([
      api.get(`/social/creators/${uid}/engagement`, null, { auth: false }).catch(() => ({})),
      api.get(`/social/creators/${uid}/profile-panel`, null, { auth: false }).catch(() => ({})),
    ])
      .then(([engRes, panelRes]) => {
        const eng = api.unwrap(engRes) || {};
        const panel = api.unwrap(panelRes) || {};
        setProfileDetail({ eng, panel });
        const isFollow = Boolean(eng.isFollowing || eng.following || eng.is_following);
        setProfileFollowing(isFollow);
        if (hostUid && uid === hostUid) setFollowing(isFollow);
        setProfileUser((prev) => ({
          ...(prev || target),
          name: eng.displayName || panel.displayName || prev?.name,
          pic: mediaUrl(eng.profilePic || panel.profilePic) || prev?.pic,
          displayId:
            formatUserDisplayId(eng) ||
            formatUserDisplayId(panel) ||
            prev?.displayId,
        }));
      })
      .finally(() => setProfileLoading(false));
  };

  const followProfileUser = async () => {
    const uid = personId(profileUser);
    if (!uid || uid === meId) return;
    const on = hostUid && uid === hostUid ? following : profileFollowing;
    try {
      if (on) await api.delete(`/social/follow/${uid}`);
      else await api.post(`/social/follow/${uid}`);
      setProfileFollowing(!on);
      if (hostUid && uid === hostUid) setFollowing(!on);
    } catch (e) {
      toast(e.message || 'Follow failed');
    }
  };

  const messageProfileUser = async () => {
    const uid = personId(profileUser);
    const name = profileUser?.name || 'User';
    setShowProfile(false);
    if (!uid) {
      navigation.navigate('Main', { screen: 'Chat' });
      return;
    }
    try {
      const res = await api.post('/messages/conversations', { receiverId: uid });
      const c = api.unwrap(res);
      navigation.navigate('ChatThread', {
        conversationId: c.id || c.conversationId,
        name,
        otherUserId: uid,
      });
    } catch (e) {
      toast(e.message || 'Chat failed');
    }
  };

  const onSeatPress = (s) => {
    if (seatMoveUser && canModerate) {
      const dest = Number(s.index);
      if (s.user && String(personId(s.user)) === String(personId(seatMoveUser))) {
        setSeatMoveUser(null);
        return;
      }
      runLive('live:seat_move', { userId: personId(seatMoveUser), seatIndex: dest + 1 }, 'Moved seat')
        .then(() => setSeatMoveUser(null))
        .catch(() => {});
      return;
    }
    if (s.user?.id || s.user?.userId) {
      const target = {
        id: s.user.id || s.user.userId,
        name: s.user.name || s.user.displayName,
        pic: s.user.profilePic || s.user.profile_pic || s.user.pic,
        seatIndex: s.index,
        agoraUid: s.user.agoraUid || s.agoraUid,
      };
      if (String(target.id) === meId) {
        openMember(target);
        return;
      }
      focusAndGift(target);
      return;
    }
    if (isHost || canModerate) {
      Alert.alert(
        `Seat ${(s.index || 0) + 1}`,
        'Invite someone online, or sit here yourself.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sit here',
            onPress: () => {
              inviteToSeat(
                { id: user?.id, name: formatDisplayName(user) || user?.first_name || 'Host', pic: user?.profile_pic },
                s.index
              );
            },
          },
          {
            text: 'Add user',
            onPress: () => {
              setInviteSeatIndex(s.index);
              setShowPeople(true);
              setAudienceTab('online');
              toast('Tap someone online to add them');
            },
          },
        ]
      );
      return;
    }
    requestSeat(s.index);
  };

  const memberMenuItems = () => {
    const target = memberMenu;
    if (!target) return [];
    if (target.empty) {
      return [
        {
          id: 'invite',
          label: 'Invite to mic',
          show: canModerate,
          onPress: () => {
            setInviteSeatIndex(target.index);
            setShowPeople(true);
            setAudienceTab('online');
            toast('Tap someone online to add them');
          },
        },
        {
          id: 'lock',
          label: 'Lock seat',
          show: canModerate,
          onPress: () => toast('Seat lock coming soon'),
        },
      ];
    }
    const uid = personId(target);
    const self = uid && uid === meId;
    const isTargetHost = hostUid && uid === hostUid;
    const onStage = memberOnStage(uid);
    const adminMember = memberIsAdmin(uid);
    const items = [];
    if (self && (onStage || isTargetHost)) {
      if (!isParty) {
        items.push({
          id: 'open-video',
          label: camOff ? 'Open video' : 'Close video',
          onPress: () => toggleCam(),
        });
      }
      if (onStage && !isTargetHost) {
        items.push({
          id: 'leave',
          label: 'Leave the seat',
          onPress: () => {
            demoteToAudience({ api, engine: engineRef.current, channel, audioOnly: isParty }).catch(() => {});
            runLive('live:demote_speaker', { userId: uid }, 'Left the seat').catch(() => {});
          },
        });
      }
      items.push({
        id: 'hide-mic',
        label: hideMicStatus ? 'Show Microphone Status' : 'Hide Microphone Status',
        onPress: () => {
          setHideMicStatus((v) => !v);
          toast(hideMicStatus ? 'Mic status shown' : 'Mic status hidden');
        },
      });
    }
    if (!self) {
      items.push({
        id: 'gift',
        label: 'Send gift',
        onPress: () => focusAndGift(target),
      });
      items.push({
        id: 'follow',
        label: 'Follow',
        onPress: () => {
          if (isTargetHost) toggleFollow();
          else {
            api.post(`/social/follow/${uid}`).then(() => toast('Followed')).catch((e) => toast(e.message));
          }
        },
      });
    }
    if (canModerate && !self) {
      if ((isHost || platformAdmin) && !isTargetHost && !adminMember) {
        items.push({
          id: 'admin-grant',
          label: 'Make admin',
          onPress: () => runLive('live:admin_grant', { userId: uid }, 'Admin granted').catch(() => {}),
        });
      }
      if (!isTargetHost && adminMember && uid !== meId) {
        items.push({
          id: 'admin-revoke',
          label: 'Remove admin',
          danger: true,
          onPress: () => {
            Alert.alert('Remove admin', `Remove admin from ${target.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => runLive('live:admin_revoke', { userId: uid }, 'Admin removed').catch(() => {}),
              },
            ]);
          },
        });
      }
      if (!isTargetHost) {
        items.push({
          id: 'mute',
          label: 'Mute mic',
          onPress: () => fireLive('live:mute', { userId: uid, muted: true }, 'Mic muted'),
        });
        items.push({
          id: 'unmute',
          label: 'Unmute mic',
          onPress: () => fireLive('live:mute', { userId: uid, muted: false }, 'Mic unmuted'),
        });
        items.push({
          id: 'chatmute',
          label: 'Mute chat',
          onPress: () => runLive('live:chat_mute', { userId: uid, muted: true }, 'Chat muted').catch(() => {}),
        });
      }
      if (!onStage && !isTargetHost) {
        items.push({
          id: 'addseat',
          label: isParty ? 'Add to seat' : 'Add to live',
          onPress: () => inviteToSeat(target),
        });
      }
      if (isParty && onStage && !isTargetHost) {
        items.push({
          id: 'move',
          label: 'Move to seat…',
          onPress: () => {
            setSeatMoveUser(target);
            toast(`Tap a seat to move ${target.name}`);
          },
        });
      }
      if (onStage && !isTargetHost) {
        items.push({
          id: 'demote',
          label: adminMember ? 'Remove from the seat (keep admin)' : 'Remove from the seat',
          danger: true,
          onPress: () => runLive('live:demote_speaker', { userId: uid }, 'Removed from the seat').catch(() => {}),
        });
      }
      if (isTargetHost && platformAdmin) {
        items.push({
          id: 'kick-host-2',
          label: 'Kick host · 2 hours',
          danger: true,
          onPress: () => kickUser(target, 2, 'admin_kicked_host'),
        });
        items.push({
          id: 'kick-host-24',
          label: 'Kick host · 24 hours',
          danger: true,
          onPress: () => kickUser(target, 24, 'admin_kicked_host'),
        });
        items.push({
          id: 'kick-host',
          label: 'Kick host & end live',
          danger: true,
          onPress: () => kickUser(target, 0, 'admin_kicked_host'),
        });
      }
      if (!isTargetHost) {
        items.push({
          id: 'kick2',
          label: 'Kick out · 2 hours',
          danger: true,
          onPress: () => kickUser(target, 2),
        });
        items.push({
          id: 'kick24',
          label: 'Kick out · 24 hours',
          danger: true,
          onPress: () => kickUser(target, 24),
        });
        items.push({
          id: 'block',
          label: 'Block user',
          danger: true,
          onPress: () => {
            api.post(`/social/block/${uid}`).then(() => {
              toast('Blocked');
              runLive('live:kick', { userId: uid, durationHours: 24, reason: 'blocked_by_host' }).catch(() => {});
            }).catch((e) => toast(e.message));
          },
        });
      }
      items.push({
        id: 'mute-all',
        label: chatLocked ? 'Unmute all chat' : 'Mute all chat',
        onPress: () => runLive('live:chat_lock', { locked: !chatLocked }, chatLocked ? 'Chat unmuted' : 'All chat muted').catch(() => {}),
      });
      items.push({
        id: 'clear',
        label: 'Clear all chat',
        danger: true,
        onPress: () => {
          runLive('live:chat_clear', {}, 'Chat cleared').then(() => {
            chatSeededRef.current = false;
            setChat([]);
          }).catch(() => {});
        },
      });
    }
    if (!self) {
      items.push({
        id: 'report',
        label: 'Report',
        danger: true,
        onPress: () => {
          api.post('/social/report', { userId: uid, reason: 'live' }).then(() => toast('Reported')).catch((e) => toast(e.message));
        },
      });
    }
    return items;
  };

  const partySeats = seats;
  const viewed = profileUser || hostInfo;
  const viewedId = String(viewed?.id || '');
  const eng = profileDetail?.eng || {};
  const panel = profileDetail?.panel || {};
  const badges = panel.badges || eng.badges || {};
  const viewedIsHost = Boolean(hostUid && viewedId && viewedId === hostUid);
  const viewedIsRoomAdmin = memberIsAdmin(viewedId);
  const viewedIsAdmin = isPlatformAdmin({ role: eng.role || panel.role }) || Boolean(eng.is_admin || panel.is_admin);
  const viewedRoleKeys = hierarchyKeys({
    role: eng.role || panel.role,
    is_coin_seller: eng.is_coin_seller || panel.is_coin_seller,
  });
  const supporters = (panel.giftStats?.topSenders || []).map((s) => ({
    id: s.userId,
    name: s.displayName,
    pic: mediaUrl(s.profilePic),
  }));
  const giftWall = panel.giftWall || [];
  const viewedIdLabel =
    viewed?.displayId ||
    formatUserDisplayId(eng) ||
    formatUserDisplayId(panel) ||
    (viewedIsHost ? hostIdLabel : '') ||
    '—';
  const viewedMine = Boolean(viewedId && viewedId === meId);
  const chatSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 22 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -50) setHideChat(true);
        else if (g.dx > 50) setHideChat(false);
      },
    })
  ).current;

  const videoHostName = room.hostName || formatDisplayName(user) || 'Live';
  const pkActive = Boolean(pk && !isParty);
  const mainRemoteUid = (!pkActive && !isParty && focusUser?.agoraUid && String(focusUser.id) !== String(hostUid))
    ? focusUser.agoraUid
    : remoteUid;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={pkActive ? styles.videoKeepAlive : StyleSheet.absoluteFill}>
        {isParty ? (
          <LinearGradient colors={['#2E1065', '#1E1B4B', '#0F0A1A']} style={StyleSheet.absoluteFill} />
        ) : (
        <LiveVideoLayer
          key="main-video"
          agoraReady={agoraReady}
          isHost={isHost && !(focusUser?.agoraUid && String(focusUser.id) !== String(hostUid))}
          remoteUid={mainRemoteUid}
          uid={focusUser?.agoraUid && String(focusUser.id) !== String(hostUid) ? Number(focusUser.agoraUid) : undefined}
          camOff={camOff}
          beautyFilter={beautyFilter}
          mirrored={mirrored}
          hostProfilePic={focusUser?.pic || room.hostProfilePic}
          hostName={focusUser?.name || videoHostName}
        />
        )}
      </View>
      {pkActive ? (
        <View style={[styles.pkStage, { top: insets.top + 72 }]}>
          <Pressable
            style={[styles.pkHalf, focusUser && String(focusUser.id) === String(hostUid) && styles.pkHalfOn]}
            onPress={() => focusAndGift(hostInfo)}
          >
            <LiveVideoLayer
              key="pk-left-video"
              agoraReady={agoraReady}
              isHost={isHost}
              remoteUid={remoteUid}
              camOff={camOff}
              beautyFilter={beautyFilter}
              mirrored={mirrored}
              hostProfilePic={room.hostProfilePic}
              hostName={videoHostName}
            />
            <Text style={styles.pkSideLabel} numberOfLines={1}>{room.hostName || 'You'}</Text>
          </Pressable>
          <View style={styles.pkBolt}><Text style={styles.pkBoltT}>⚡</Text></View>
          <Pressable
            style={[styles.pkHalf, focusUser && String(focusUser.id) === String(pk?.targetUserId || pk?.rightUserId || pk?.guestUserId) && styles.pkHalfOn]}
            onPress={() => focusAndGift({
              id: pk?.targetUserId || pk?.rightUserId || pk?.guestUserId,
              name: pk?.rightName || pk?.guestName || 'Rival',
              pic: pk?.rightPic || pk?.guestProfilePic,
              agoraUid: rivalRemoteUid,
            })}
          >
            <LiveVideoLayer
              key="pk-right-video"
              agoraReady={agoraReady}
              isHost={false}
              remoteUid={rivalRemoteUid}
              camOff={false}
              hostProfilePic={pk?.rightPic || pk?.guestProfilePic}
              hostName={pk?.rightName || pk?.guestName || 'Rival'}
              uid={rivalRemoteUid}
            />
            <Text style={styles.pkSideLabel} numberOfLines={1}>{pk?.rightName || pk?.guestName || 'Rival'}</Text>
          </Pressable>
        </View>
      ) : isParty ? (
        <PartyStageBackdrop />
      ) : null}

      <FadeIn style={styles.overlay} from={0} pointerEvents="box-none">
      {hideChrome ? (
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Pressable onPress={() => setHideChrome(false)} style={styles.roundChrome}>
            <Text style={styles.roundChromeT}>Show</Text>
          </Pressable>
          <Pressable onPress={endOrLeave} style={styles.roundChrome}>
            <Text style={styles.roundChromeT}>✕</Text>
          </Pressable>
        </View>
      ) : (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={{ paddingTop: insets.top + 4 }}>
          {isParty ? (
            <PartyHeader
              hostName={room.hostName}
              hostPic={room.hostProfilePic}
              roomId={roomIdLine || `ID:${hostIdLabel}`}
              viewers={viewers}
              roomFollowing={roomFollow.following}
              roomFollowers={roomFollow.followers}
              isHost={isHost}
              onHost={() => setShowRoomInfo(true)}
              onRoomFollow={toggleRoomFollow}
              onRoomInfo={() => { setRoomInfoTab('member'); setShowRoomInfo(true); }}
              onClose={endOrLeave}
            />
          ) : (
            <>
          <LiveHeader
            hostName={room.hostName}
            hostPic={room.hostProfilePic}
            hostId={hostIdLabel}
            roomId={roomIdLine}
            viewers={viewers}
            people={people}
            following={following}
            isHost={isHost}
            onHost={() => (pkActive ? focusAndGift(hostInfo) : openProfile(hostInfo))}
            onFollow={toggleFollow}
            onPeople={() => { setAudienceTab('online'); setShowPeople(true); }}
            onShare={shareRoom}
            onClose={endOrLeave}
            onExpand={() => setHideChrome((v) => !v)}
          />
          <RankBadges rank="No.0" />
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingRight: 10 }} pointerEvents="box-none">
          {isParty ? (
            <View style={{ width: 8 }} />
          ) : (
          <WishWidgets
            onWish={() => setLuckyBoard(true)}
            banner={pk ? 'PK BATTLE' : 'Weekly Star'}
          />
          )}
          <LuckyBoxFloat box={activeLuckyBox} onPress={() => { setLuckyClaimResult(null); setLuckyBoxClaim(true); }} />
        </View>
        <LuckyBoxWinBanner event={luckyBoxWin} />
        {pk ? (
          <LiveGuestRail
            rooms={feedRooms}
            onSwitch={(next) => {
              switchingRef.current = true;
              navigation.replace(next.isParty ? 'PartyRoom' : 'LiveRoom', next);
            }}
          />
        ) : null}
        {!isParty ? (
          <GifterRail
            seats={seats}
            host={hostInfo}
            speakingKeys={speakingKeys}
            meId={meId}
            onPress={(u) => focusAndGift(u)}
            hideMic={hideMicStatus}
          />
        ) : null}

        {pk || pkChallenge ? (
          <PkBattleHud
            pk={pk}
            challenge={pkChallenge}
            hostName={room.hostName || formatDisplayName(user) || 'You'}
            rivalName={pk?.rightName || pkChallenge?.fromName}
            canRespond={Boolean(
              pkChallenge && (isHost || String(pkChallenge.targetUserId || pkChallenge.toUserId) === String(user?.id))
            )}
            isHost={isHost}
            onAccept={() => {
              socket.respondPk(pkChallenge.challengeId || pkChallenge.id, true).catch((e) => toast(e.message));
            }}
            onDecline={() => {
              socket.respondPk(pkChallenge.challengeId || pkChallenge.id, false).catch(() => {});
              setPkChallenge(null);
            }}
            onEnd={() => socket.endPk(channel)}
          />
        ) : null}

        <View style={styles.mid} pointerEvents="box-none" {...chatSwipe.panHandlers}>
          {isParty ? (
            <PartySeatGrid
              seats={partySeats}
              host={hostInfo}
              onSeat={onSeatPress}
              speakingKeys={speakingKeys}
              meId={meId}
              hostPresent={
                isHost ||
                !hasPresenceSnap ||
                (stateSnap?.onlineMembers || []).some(
                  (m) => String(m?.userId || m?.id || m?.user?.id || '') === String(hostUid)
                )
              }
            />
          ) : (
            <View style={{ flex: 1 }} pointerEvents="none" />
          )}
          <LiveChatFeed
            chat={chat}
            announcement={announcement}
            pinned={pinned}
            hideChat={hideChat}
            onToggleChat={(force) => {
              if (typeof force === 'boolean') setHideChat(force);
              else setHideChat((v) => !v);
            }}
            onUser={(u) => openProfile(u)}
            onImage={(url) => { setChatImage(url); setChatImageMini(false); }}
          />
        </View>

        {chatImage ? (
          chatImageMini ? (
            <Pressable
              onPress={() => setChatImageMini(false)}
              style={{ position: 'absolute', right: 12, bottom: 120, width: 72, height: 72, borderRadius: 10, overflow: 'hidden', zIndex: 40, borderWidth: 2, borderColor: '#fff' }}
            >
              <Image source={{ uri: mediaUrl(chatImage) }} style={{ width: 72, height: 72 }} />
            </Pressable>
          ) : (
            <Modal visible transparent animationType="fade" onRequestClose={() => setChatImage(null)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ position: 'absolute', top: 48, right: 16, flexDirection: 'row', gap: 12, zIndex: 2 }}>
                  <Pressable onPress={() => setChatImageMini(true)} style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Minimize</Text>
                  </Pressable>
                  <Pressable onPress={() => { setChatImage(null); setChatImageMini(false); }} style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                  </Pressable>
                </View>
                <Image source={{ uri: mediaUrl(chatImage) }} style={{ width: '92%', height: '70%' }} resizeMode="contain" />
              </View>
            </Modal>
          )
        ) : null}

        {error ? <View style={styles.err}><Text style={styles.errText}>{error}</Text></View> : null}

          <View style={styles.compose}>
            <Pressable onPress={sendPhoto} style={styles.composeIco}><Text>🖼</Text></Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
            placeholder={chatLocked && !canModerate ? 'Host muted all chat…' : 'Say something…'}
            editable={!(chatLocked && !canModerate)}
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.input}
              maxLength={280}
            returnKeyType="send"
              onSubmitEditing={() => sendChat()}
            />
            <Pressable onPress={() => sendChat()} style={styles.sendBtn}><Text style={{ color: '#fff' }}>➤</Text></Pressable>
          </View>

        <View style={{ paddingBottom: bottomSafe(insets) }}>
          <LiveBottomBar
            muted={muted}
            speakerOn={speakerOn}
            onMic={onMicPress}
            onSpeaker={toggleSpeaker}
            onEmoji={() => setShowEmoji(true)}
            onMore={() => setShowTools(true)}
            onGames={() => setShowGameCenter(true)}
            onGifts={() => openGiftsFor(giftRecipients[0] || hostInfo)}
          />
        </View>
      </KeyboardAvoidingView>
      )}
      </FadeIn>

      <EmojiSheet
        visible={showEmoji}
        onClose={() => setShowEmoji(false)}
        onPick={(e) => sendChat(e)}
      />
      <GameCenterSheet
        visible={showGameCenter}
        games={games}
        onClose={() => setShowGameCenter(false)}
        diamonds={Math.min(balance, 999)}
        gems={balance}
        onPlus={() => { setShowGameCenter(false); navigation.navigate('Recharge'); }}
        onRefresh={loadWalletAndGifts}
        onPlay={(g) => {
          setShowGameCenter(false);
          navigation.navigate('GamePlay', { slug: g.slug, name: g.name, emoji: g.emoji, url: g.url });
        }}
      />
      <AudienceSheet
        visible={showPeople}
        onClose={() => setShowPeople(false)}
        tab={audienceTab}
        setTab={setAudienceTab}
        period={period}
        setPeriod={setPeriod}
        online={people}
        canModerate={canModerate}
        chatLocked={chatLocked}
        applicants={applying}
        onAcceptApplicant={(u) => {
          inviteToSeat(u, u.seatIndex ?? inviteSeatIndex);
        }}
        onDeclineApplicant={(u) => {
          setApplying((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
          socket.respondSeat(channel, { userId: u.id, accept: false }).catch(() => {});
        }}
        onMuteAllChat={() => {
          runLive('live:chat_lock', { locked: !chatLocked }, chatLocked ? 'Chat unmuted' : 'All chat muted').catch(() => {});
        }}
        onClearChat={() => {
          runLive('live:chat_clear', {}, 'Chat cleared').then(() => {
            chatSeededRef.current = false;
            setChat([]);
          }).catch(() => {});
        }}
        giftTotals={(() => {
          const map = new Map();
          chat.filter((m) => m.type === 'gift').forEach((m) => {
            const name = String(m.text || 'Gift');
            const cur = map.get(name) || { name, count: 0, coins: 0, emoji: '' };
            cur.count += 1;
            map.set(name, cur);
          });
          return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
        })()}
        giftHistory={chat
          .filter((m) => m.type === 'gift')
          .slice(-30)
          .reverse()
          .map((m, i) => ({
            id: m.id || i,
            from: m.user,
            text: m.text,
            pic: m.pic,
          }))}
        onUser={(u) => {
          setShowPeople(false);
          if (inviteSeatIndex != null && canModerate) {
            inviteToSeat(u, inviteSeatIndex);
            return;
          }
          openProfile(u);
        }}
      />
      <ApplyingUserSheet
        visible={showApplying}
        onClose={() => setShowApplying(false)}
        applicants={applying}
        canModerate={canModerate}
        onAccept={(u) => {
          inviteToSeat(u, u.seatIndex ?? inviteSeatIndex);
          setShowApplying(false);
        }}
        onDecline={(u) => {
          setApplying((prev) => prev.filter((x) => String(x.id) !== String(u.id)));
          socket.respondSeat(channel, { userId: u.id, accept: false }).catch(() => {});
        }}
        onCancel={() => {
          setApplying((prev) => prev.filter((x) => String(x.id) !== String(user?.id)));
          setShowApplying(false);
          socket.respondSeat(channel, { userId: user?.id, accept: false }).catch(() => {});
        }}
      />
      <SeatInviteModal
        visible={inviteOpen}
        seconds={inviteSeconds}
        onAgree={acceptInvite}
        onCancel={declineInvite}
      />
      <RoomFollowSheet
        visible={showRoomInfo}
        onClose={() => setShowRoomInfo(false)}
        hostName={room.hostName}
        hostPic={room.hostProfilePic}
        roomId={roomIdLine || `ID ${hostIdLabel}`}
        live
        following={roomFollow.following}
        onFollow={toggleRoomFollow}
        onShare={shareRoom}
        onReport={() => {
          if (!hostUid) return;
          api.post('/social/report', { userId: hostUid, reason: 'party_room' })
            .then(() => toast('Reported'))
            .catch((e) => Alert.alert('Report failed', e.message));
        }}
        onCopyId={() => copyId(roomIdLine || hostIdLabel)}
        onOpenProfile={() => {
          setShowRoomInfo(false);
          openProfile(hostInfo);
        }}
        members={roomMembers}
        tab={roomInfoTab}
        setTab={setRoomInfoTab}
      />
      <HostProfileSheet
        visible={showProfile}
        onClose={() => { setShowProfile(false); setProfileUser(null); setProfileDetail(null); }}
        person={viewed}
        hostId={viewedIdLabel}
        isLiveHost={viewedIsHost}
        isRoomAdmin={viewedIsRoomAdmin}
        isAdmin={viewedIsAdmin}
        following={viewedIsHost ? following : profileFollowing}
        loading={profileLoading}
        followers={eng.followers ?? panel.followers ?? 0}
        followingCount={eng.following ?? panel.following ?? 0}
        level={badges.personalLevel || panel.personalLevel || eng.personalLevel}
        vipLevel={badges.vipLevel || panel.vipLevel}
        svipLevel={badges.svipLevel || panel.svipLevel}
        roleKeys={viewedRoleKeys}
        supporters={supporters}
        giftWall={giftWall}
        giftLit={giftWall.length || panel.giftCount || 0}
        medalCount={badges.medalCount || panel.medalCount || 0}
        mine={viewedMine}
        onFollow={followProfileUser}
        onGift={() => { setShowProfile(false); openGiftsFor(viewed); }}
        onMessage={messageProfileUser}
        onMention={() => {
          setShowProfile(false);
          setHideChat(false);
          const tag = `@${String(viewed?.name || 'User').replace(/\s+/g, '')}`;
          setText((t) => `${t ? `${t} ` : ''}${tag} `);
        }}
        onMore={() => {
          const person = viewed;
          setShowProfile(false);
          setTimeout(() => openMember(person), 60);
        }}
        onViewFull={() => {
          setShowProfile(false);
          if (viewedId) navigation.navigate('CreatorProfile', { userId: viewedId, name: viewed?.name });
        }}
        onCopyId={() => copyId(viewedIdLabel)}
      />
      <MemberActionMenu
        visible={Boolean(memberMenu)}
        target={memberMenu}
        items={memberMenuItems()}
        light={Boolean(memberMenu && String(memberMenu.id || memberMenu.userId) === meId)}
        onClose={() => setMemberMenu(null)}
      />
      <ToolsMenuSheet
        visible={showTools}
        onClose={() => setShowTools(false)}
        isHost={isHost}
        canModerate={canModerate}
        chatLocked={chatLocked}
        onLucky={() => { setShowTools(false); setLuckyBoard(true); }}
        onLuckyBox={() => { setShowTools(false); setLuckyBoxError(''); setLuckyBoxOpen(true); }}
        onEntry={() => { setShowTools(false); navigation.navigate('Store'); }}
        onGiftFx={() => { setShowTools(false); openGiftsFor(giftRecipients[0] || hostInfo); }}
        onPhoto={() => { setShowTools(false); sendPhoto(); }}
        onCall={() => { setShowTools(false); toggleCam(); }}
        onShare={() => { setShowTools(false); shareRoom(); }}
        onPk={() => {
          setShowTools(false);
          pkMatchCancelRef.current = false;
          setPkMatching(false);
          setPkMatchLabel('');
          setPkPick(true);
        }}
        onMuteAllChat={() => {
          runLive('live:chat_lock', { locked: !chatLocked }, chatLocked ? 'Chat unmuted' : 'All chat muted').catch(() => {});
        }}
        onClearChat={() => {
          runLive('live:chat_clear', {}, 'Chat cleared').then(() => {
            chatSeededRef.current = false;
            setChat([]);
          }).catch(() => {});
        }}
        onAdmins={() => {
          setShowTools(false);
          setAudienceTab('online');
          setShowPeople(true);
          if (applying.length) setShowApplying(true);
          toast(applying.length ? `${applying.length} seat request(s)` : 'Joined list · ADMIN badge on room admins');
        }}
        onRankings={() => navigation.navigate('Rankings')}
        onStore={() => navigation.navigate('Store')}
        onFanClub={() => navigation.navigate('Family', { userId: room.hostId || hostUid, name: room.hostName })}
        onMusic={() => toast('Ambient sound uses your device speaker settings')}
        onBackground={() => toast('Room theme uses the live stage background')}
        onSettings={() => navigation.navigate('StreamerCenter')}
        onReport={() => {
          if (!hostUid) return;
          api.post('/social/report', { userId: hostUid, reason: 'live_room' })
            .then(() => toast('Reported'))
            .catch((e) => Alert.alert('Report failed', e.message));
        }}
        onLiveData={() => {
          Alert.alert('Live data', `Viewers ${viewers}\nSeats ${seats.filter((s) => s.user).length}/9\nChat ${chatLocked ? 'muted' : 'open'}`);
        }}
        onMessages={() => navigation.navigate('Main', { screen: 'Chat' })}
        onVip={() => navigation.navigate('Vip')}
        onGames={() => { setShowTools(false); setShowGameCenter(true); }}
        onWallet={() => navigation.navigate('Wallet')}
        onBackpack={() => navigation.navigate('Store')}
        onGiftWish={() => setLuckyBoard(true)}
        onStreamerCenter={() => navigation.navigate('StreamerCenter')}
        onNoise={() => toast(speakerOn ? 'Noise reduction on with device AEC' : 'Turn speaker on for clearer voice')}
        onIntro={() => navigation.navigate('StreamerCenter')}
        onTheme={() => toast('Theme follows your room cover & stage')}
        onBubble={() => navigation.navigate('Store')}
        onEffects={() => { setShowTools(false); setShowBeauty(true); }}
        onBeauty={() => { setShowTools(false); setShowBeauty(true); }}
        onFlipCam={() => {
          try {
            engineRef.current?.switchCamera?.();
            toast('Camera switched');
          } catch (_e) {
            toast('Could not switch camera');
          }
        }}
        onMirror={() => {
          setMirrored((m) => !m);
          toast(mirrored ? 'Mirror off' : 'Mirror on');
        }}
        onMinimize={() => {
          setShowTools(false);
          doMinimize();
        }}
        onSound={() => toggleSpeaker()}
        onScreenRec={() => toast('Screen recording is not available on this build')}
        isParty={isParty}
      />

      <Modal visible={showBeauty} transparent animationType="slide" onRequestClose={() => setShowBeauty(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowBeauty(false)} />
          <View style={{ backgroundColor: 'rgba(12,14,22,0.92)', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 28 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, marginLeft: 16, marginBottom: 4 }}>Beauty · look live on camera</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 16, marginBottom: 10 }}>Filters apply to your face right now</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingRight: 20 }}>
              {BEAUTY_FILTERS.map((f) => {
                const on = beautyFilter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => {
                      setBeautyFilter(f.id);
                      applyAgoraBeauty(engineRef.current, f.id);
                      toast(f.label);
                    }}
                    style={{ alignItems: 'center', width: 72 }}
                  >
                    <LinearGradient
                      colors={f.swatch}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        borderWidth: on ? 3 : 0,
                        borderColor: '#F5D76E',
                      }}
                    />
                    <Text style={{ color: on ? '#F5D76E' : '#9CA3AF', fontWeight: '700', fontSize: 11, marginTop: 6 }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GiftBurst gift={burst} onDone={finishGift} />
      <GiftSheet
        visible={showGifts}
        gifts={gifts}
        balance={balance}
        onClose={() => { setShowGifts(false); setGiftError(''); }}
        onSend={sendGift}
        onRecharge={() => { setShowGifts(false); navigation.navigate('Recharge'); }}
        recipients={giftRecipients}
        toUserId={giftTarget?.id}
        onSelectRecipient={(r) => setGiftTarget(r)}
        sending={giftSending}
        error={giftError}
        onOpenLuckyBoard={() => { setShowGifts(false); setLuckyBoard(true); }}
      />
      <LuckyGiftBoard visible={luckyBoard} api={api} onClose={() => setLuckyBoard(false)} />
      <LuckyResultOverlay result={luckyResult} onDone={() => setLuckyResult(null)} />
      <LuckyBoxComposer
        visible={luckyBoxOpen}
        onClose={() => setLuckyBoxOpen(false)}
        balance={balance}
        sending={luckyBoxSending}
        error={luckyBoxError}
        onOpenRules={() => setLuckyBoxRules(true)}
        onOpenHistory={() => { setLuckyBoxOpen(false); setLuckyBoard(true); }}
        onSend={async (opts) => {
          if (luckyBoxSending) return;
          setLuckyBoxSending(true);
          setLuckyBoxError('');
          try {
            await socket.connect(accessToken);
            const ack = await socket.emit('live:lucky_box_send', {
              channel,
              ...opts,
              senderPic: user?.profile_pic || user?.profilePic,
            }, 20000);
            const box = ack?.data || ack;
            if (box?.id) setActiveLuckyBox(box);
            setLuckyBoxOpen(false);
            toast('Lucky box sent');
            loadWalletAndGifts().catch(() => {});
          } catch (e) {
            setLuckyBoxError(e.message || 'Could not send lucky box');
          } finally {
            setLuckyBoxSending(false);
          }
        }}
      />
      <LuckyBoxRules visible={luckyBoxRules} onClose={() => setLuckyBoxRules(false)} />
      <LuckyBoxClaim
        visible={luckyBoxClaim}
        box={activeLuckyBox}
        meId={meId}
        claiming={luckyBoxSending}
        result={luckyClaimResult}
        onClose={() => setLuckyBoxClaim(false)}
        onClaim={async (box) => {
          if (luckyBoxSending) return;
          setLuckyBoxSending(true);
          try {
            await socket.connect(accessToken);
            const ack = await socket.emit('live:lucky_box_claim', { channel, boxId: box.id }, 20000);
            const data = ack?.data || ack;
            setLuckyClaimResult(data);
            if (data?.prize != null) toast(`Won 🪙 ${Number(data.prize).toLocaleString()}`);
            loadWalletAndGifts().catch(() => {});
          } catch (e) {
            toast(e.message || 'Could not open box');
          } finally {
            setLuckyBoxSending(false);
          }
        }}
      />
      <RoomPkSheet
        visible={pkPick}
        onClose={() => {
          if (pkMatching) return;
                  setPkPick(false);
        }}
        rooms={pkRooms}
        loadingRooms={pkRoomsLoading}
        matching={pkMatching}
        matchLabel={pkMatchLabel}
        onCancelMatch={() => {
          pkMatchCancelRef.current = true;
          setPkMatching(false);
          setPkMatchLabel('');
        }}
        onRefreshRooms={async () => {
          setPkRoomsLoading(true);
          try {
            const res = await api.get('/live/rooms', { type: 'live', limit: 40 }, { auth: false });
            setPkRooms(
              api.extractList(res).filter((r) => r.channel && r.channel !== channel && (r.hostId || r.host_id))
            );
          } catch (_e) {
            setPkRooms([]);
          } finally {
            setPkRoomsLoading(false);
          }
        }}
        onChallenge={async ({ rival, type, durationMinutes, durationSec, random, format, allowParty }) => {
          pkMatchCancelRef.current = false;
          setPkMatching(true);
          setPkMinutes(durationMinutes || 5);
          let target = rival;
          if (random || !target?.userId) {
            setPkMatchLabel('Searching live streams…');
            setPkRoomsLoading(true);
            let list = [];
            try {
              const res = await api.get('/live/rooms', { type: allowParty ? undefined : 'live', limit: 40 }, { auth: false });
              list = api.extractList(res).filter((r) => r.channel && r.channel !== channel && (r.hostId || r.host_id));
              setPkRooms(list);
            } catch (_e) {
              list = [];
            } finally {
              setPkRoomsLoading(false);
            }
            if (pkMatchCancelRef.current) return;
            if (!list.length) {
              setPkMatching(false);
              setPkMatchLabel('');
              toast('No other live hosts online to challenge');
              return;
            }
            const pick = list[Math.floor(Math.random() * list.length)];
            target = {
              userId: pick.hostId || pick.host_id,
              name: pick.hostName || pick.host_name || 'Rival',
              channel: pick.channel,
              profilePic: pick.hostProfilePic || pick.host_profile_pic || pick.cover,
            };
          }
          if (!target?.userId && !target?.channel) {
            toast('No rival found');
            setPkMatching(false);
            return;
          }
          setPkMatchLabel(`Waiting for ${target.name || 'rival'}…`);
          try {
            await socket.startPk(channel, {
              targetChannel: target.channel,
              targetUserId: target.userId,
              userId: target.userId,
              opponentUserId: target.userId,
              opponentName: target.name || 'Rival',
              hostName: room.hostName || formatDisplayName(user),
              durationMinutes: durationMinutes || 5,
              durationSec: durationSec || (durationMinutes || 5) * 60,
              durationSeconds: durationSec || (durationMinutes || 5) * 60,
              type: type || 'friend',
              mode: type || 'friend',
              format: format || (type === 'team' ? '3v3' : '1v1'),
              allowParty: Boolean(allowParty),
            });
            if (pkMatchCancelRef.current) return;
            setPkMatchLabel(`Waiting for ${target.name || 'rival'} to accept…`);
            toast(`PK challenge sent to ${target.name || 'host'}`);
          } catch (e) {
            setPkMatching(false);
            setPkMatchLabel('');
            toast(e.message || 'Could not start PK');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.liveDark },
  videoKeepAlive: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120c24' },
  fallbackName: { color: '#fff', fontWeight: '800', marginTop: 12, fontSize: 18 },
  fallbackHint: { color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  overlay: { ...StyleSheet.absoluteFillObject },
  pkStage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 78,
    height: '40%',
    maxHeight: 340,
    flexDirection: 'row',
    zIndex: 2,
    backgroundColor: '#0f172a',
  },
  pkHalf: { flex: 1, overflow: 'hidden', position: 'relative' },
  pkHalfOn: { borderWidth: 3, borderColor: '#F59E0B' },
  pkBolt: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    marginLeft: -18,
    zIndex: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.85)',
  },
  pkBoltT: { fontSize: 18 },
  pkSideLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  pk: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.72)', padding: 12, borderRadius: 14, marginTop: 8, minWidth: 220, alignItems: 'center' },
  pkTitle: { color: '#fbbf24', fontWeight: '800', textAlign: 'center' },
  pkScore: { color: '#fff', fontWeight: '800', fontSize: 22, textAlign: 'center', marginTop: 4 },
  pkNames: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 12 },
  pkYes: { backgroundColor: '#22C55E', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  pkNo: { backgroundColor: '#EF4444', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 },
  pkBtnT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  partyGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,8,48,0.28)' },
  mid: { flex: 1 },
  err: { marginHorizontal: 12, backgroundColor: 'rgba(185,28,28,0.9)', padding: 8, borderRadius: 8 },
  errText: { color: '#fff', fontSize: 12 },
  compose: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 22, paddingHorizontal: 6, height: 44, marginHorizontal: 10, marginBottom: 6 },
  composeIco: { width: 32, alignItems: 'center' },
  input: { flex: 1, color: '#fff', paddingHorizontal: 6, height: 42 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orangeCta, alignItems: 'center', justifyContent: 'center' },
  roundChrome: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  roundChromeT: { color: '#fff', fontWeight: '800' },
});
