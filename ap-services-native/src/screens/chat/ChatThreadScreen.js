import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { ErrorBanner } from '../../components/ui';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst from '../../components/GiftBurst';
import { loadChatPrefs } from './ChatSettingsScreen';
import GiftThumb from '../../components/GiftThumb';
import { resolveGiftAnim } from '../../config/giftAnims';
import { STICKER_TABS } from '../../config/stickers';
import { mediaUrl } from '../../config/api';
import { filePart, pickMedia } from '../../lib/pickMedia';

const PAGE = 80;
const VOICE_RECORDING = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  web: { mimeType: 'audio/webm' },
};

const QUICK = [
  { id: 'hi', label: 'Hi', glyph: '👋' },
  { id: 'love', label: 'Love', glyph: '💗' },
  { id: 'foryou', label: 'For you', glyph: '🎁' },
];
const EMOJIS = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨'];

function kindOf(text, extra) {
  const blob = `${text || ''} ${extra?.type || ''}`.toLowerCase();
  if (blob.includes('cp invitation') || blob.includes('cp invite')) return 'cp';
  if (blob.includes('party invite') || extra?.isParty) return 'party';
  if (blob.includes('live invite') || blob.includes('is live') || extra?.channel) return 'live';
  if (blob.includes('starlink') || blob.includes('chat 3 days') || blob.includes('link lost')) return 'system';
  return 'text';
}

function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function looksLikePath(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^__(IMG|VID|AUD|STK)__:/.test(t)) return true;
  if (/^(file:\/\/|content:\/\/)/i.test(t)) return true;
  if (/^\/(?:storage|data|uploads)\//i.test(t)) return true;
  if (/\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|webm|m4v|m4a|aac|mp3|wav)(\?|$)/i.test(t)) return true;
  return false;
}

function isVideoPath(s) {
  return /\.(mp4|mov|webm|m4v|3gp)(\?|$)/i.test(String(s || '')) || String(s || '').startsWith('__VID__:');
}

function isAudioPath(s) {
  return /\.(m4a|aac|mp3|wav|caf|ogg)(\?|$)/i.test(String(s || '')) || String(s || '').startsWith('__AUD__:');
}

function stripPrefix(raw) {
  const t = String(raw || '');
  if (t.startsWith('__IMG__:') || t.startsWith('__VID__:') || t.startsWith('__AUD__:') || t.startsWith('__STK__:')) {
    return t.slice(8);
  }
  return t;
}

function mapMsg(m, myId) {
  const extra = m.extra || m.meta || {};
  const rawBody = String(m.body || m.content || '');
  const prefixed = rawBody.match(/^__(IMG|VID|AUD|STK)__:(.+)$/);
  let image = m.image_url || m.imageUrl || m.media_url || null;
  let video = m.video_url || m.videoUrl || null;
  let audio = m.audio_url || m.audioUrl || null;
  let sticker = m.sticker_url || m.stickerUrl || null;
  let text = m.mediaType ? String(m.text || '') : String(m.text || m.content || m.body || '');

  if (prefixed) {
    const kind = prefixed[1];
    const rest = prefixed[2];
    if (kind === 'IMG') image = rest;
    if (kind === 'VID') video = rest;
    if (kind === 'AUD') audio = rest;
    if (kind === 'STK') sticker = rest;
    text = '';
  } else if (looksLikePath(text) && !image && !video && !audio && !sticker) {
    if (isVideoPath(text)) video = stripPrefix(text);
    else if (isAudioPath(text)) audio = stripPrefix(text);
    else image = stripPrefix(text);
    text = '';
  } else if (looksLikePath(text)) {
    text = '';
  }

  if (m.mediaType === 'image' && m.imageUrl) image = m.imageUrl;
  if (m.mediaType === 'video' && m.videoUrl) video = m.videoUrl;
  if (m.mediaType === 'audio' && m.audioUrl) audio = m.audioUrl;
  if (m.mediaType === 'sticker' && m.stickerUrl) sticker = m.stickerUrl;

  const id = String(m.id || `${m.createdAt || m.created_at || Date.now()}-${m.senderId || m.sender_id || 'x'}`);
  return {
    id,
    text: text && !looksLikePath(text) ? text : '',
    image: mediaUrl(image),
    video: mediaUrl(video),
    audio: mediaUrl(audio),
    sticker: sticker ? (mediaUrl(sticker) || sticker) : null,
    mine: String(m.sender_id || m.senderId) === String(myId),
    at: m.created_at || m.createdAt,
    kind: kindOf(text, extra),
    channel: extra.channel || m.channel,
    isParty: Boolean(extra.isParty || m.isParty),
  };
}

function samePayload(a, b) {
  if (!a || !b) return false;
  if (String(a.id) === String(b.id) && !String(a.id).startsWith('local-')) return true;
  const close = Math.abs(new Date(a.at || 0).getTime() - new Date(b.at || Date.now()).getTime()) < 8000
    || String(a.id).startsWith('local-')
    || String(b.id).startsWith('local-');
  if (!close) return false;
  if (Boolean(a.mine) !== Boolean(b.mine)) return false;
  if (a.text && b.text && a.text === b.text) return true;
  if (a.image && b.image) return true;
  if (a.video && b.video) return true;
  if (a.audio && b.audio) return true;
  if (a.sticker && b.sticker && a.sticker === b.sticker) return true;
  return false;
}

function upsertMessage(prev, next) {
  const hit = prev.findIndex((m) => samePayload(m, next));
  if (hit >= 0) {
    const copy = [...prev];
    copy[hit] = { ...copy[hit], ...next, id: String(next.id).startsWith('local-') ? copy[hit].id : next.id };
    return copy.filter((m, i) => i === hit || String(m.id) !== String(copy[hit].id));
  }
  if (prev.some((m) => String(m.id) === String(next.id))) return prev;
  return [...prev, next];
}

function fmtDur(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ChatThreadScreen({ navigation, route }) {
  const {
    conversationId,
    name: routeName,
    otherUserId: routeOtherId,
    pic,
    unread,
    official: routeOfficial,
    clearedAt: clearedAtParam,
  } = route.params || {};
  const [headName, setHeadName] = useState(
    routeOfficial || /^(ap live|glowcast)$/i.test(String(routeName || '')) ? 'AP Live' : routeName || 'Chat'
  );
  const insets = useSafeAreaInsets();
  const { api, user, accessToken } = useAuth();
  const socket = useSocket();
  const [peerId, setPeerId] = useState(routeOtherId || '');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [stickerTab, setStickerTab] = useState('emoji');
  const [showPlus, setShowPlus] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [gifts, setGifts] = useState([]);
  const [balance, setBalance] = useState(0);
  const [burst, setBurst] = useState(null);
  const [focused, setFocused] = useState(true);
  const [viewer, setViewer] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const players = useRef(new Map());
  const listRef = useRef(null);
  const recRef = useRef(null);
  const recTick = useRef(null);
  const recMsRef = useRef(0);
  const soundRef = useRef(null);
  const olderReady = useRef(false);
  const myId = String(user?.id || '');
  const thread = useMemo(() => [...messages].reverse(), [messages]);

  const stopPlayers = useCallback(() => {
    players.current.forEach((p) => {
      p.pauseAsync?.().catch(() => {});
      p.stopAsync?.().catch(() => {});
      p.setStatusAsync?.({ shouldPlay: false, isMuted: true }).catch(() => {});
      p.unloadAsync?.().catch(() => {});
    });
    players.current.clear();
    soundRef.current?.unloadAsync?.().catch(() => {});
    soundRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        stopPlayers();
      };
    }, [stopPlayers])
  );

  const more = () => {
    navigation.navigate('ChatSettings', {
      conversationId,
      name: headName || 'Chat',
      otherUserId: peerId || routeOtherId,
      pic,
    });
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/messages/${conversationId}`, { limit: PAGE });
      const payload = res.data || res;
      const other = payload.otherUser || payload.other_user;
      if (other?.id) setPeerId(String(other.id));
      const role = String(other?.role || '').toLowerCase();
      const isOfficial =
        routeOfficial ||
        ['admin', 'super_admin', 'founder', 'ceo'].includes(role) ||
        /^(ap live|glowcast)$/i.test(String(other?.displayName || ''));
      if (isOfficial) setHeadName('AP Live');
      else if (other?.displayName || other?.first_name) {
        setHeadName(
          other.displayName ||
            [other.first_name, other.last_name].filter(Boolean).join(' ') ||
            routeName ||
            'Chat'
        );
      }
      let list = api.extractList(res);
      if (!list.length && payload.messages) list = payload.messages;
      if (!other?.id && list.length) {
        const sample = list[0];
        const sid = String(sample.sender_id || sample.senderId || '');
        const rid = String(sample.receiver_id || sample.receiverId || '');
        const next = sid && sid !== myId ? sid : rid;
        if (next && next !== myId) setPeerId(next);
      }
      const prefs = await loadChatPrefs(conversationId).catch(() => ({ clearedAt: 0, star: true }));
      const cut = Number(clearedAtParam || prefs.clearedAt || 0);
      const showLinks = prefs.star !== false;
      const seen = new Set();
      const mapped = list.map((m) => mapMsg(m, myId)).filter((m) => {
        if (cut && m.at && new Date(m.at).getTime() <= cut) return false;
        if (!showLinks && m.kind === 'system' && /starlink|ap link|link content/i.test(String(m.text || ''))) {
          return false;
        }
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      setHasMore(mapped.length >= PAGE);
      setMessages(mapped);
      olderReady.current = false;
      setTimeout(() => { olderReady.current = true; }, 450);
    } catch (e) {
      setError(e.message || 'Could not load messages');
    }
  }, [api, clearedAtParam, conversationId, myId, routeName, routeOfficial]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    const oldest = messages[0];
    if (!oldest?.at) return;
    setLoadingOlder(true);
    try {
      const res = await api.get(`/messages/${conversationId}`, { before: oldest.at, limit: PAGE });
      const payload = res.data || res;
      let list = api.extractList(res);
      if (!list.length && payload.messages) list = payload.messages;
      const seen = new Set(messages.map((m) => m.id));
      const older = list.map((m) => mapMsg(m, myId)).filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      setHasMore(older.length >= PAGE);
      if (older.length) setMessages((prev) => [...older, ...prev]);
    } catch (_e) {
      setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [api, conversationId, hasMore, loadingOlder, messages, myId]);

  useEffect(() => {
    load();
    api.get('/social/gifts/catalog', null, { auth: false }).then((r) => setGifts(api.extractList(r))).catch(() => {});
    api.get('/wallet/balance').then((r) => {
      const d = api.unwrap(r);
      setBalance(Number(d.giftable_coins || d.coin_balance || d.coins || 0));
    }).catch(() => {});
    let offA = () => {};
    let offB = () => {};
    (async () => {
      try {
        await socket.connect(accessToken);
        socket.emit('join_conversation', { conversationId }).catch(() => {});
        const onIncoming = (msg) => {
          if (!msg) return;
          const cid = String(msg.conversationId || msg.conversation_id || '');
          if (cid && cid !== String(conversationId)) return;
          const next = mapMsg(msg, myId);
          setMessages((prev) => upsertMessage(prev, next));
        };
        offA = socket.on('new_message', onIncoming);
        offB = socket.on('receive_message', onIncoming);
      } catch (_e) {}
    })();
    return () => {
      try { offA?.(); } catch (_e) {}
      try { offB?.(); } catch (_e) {}
    };
  }, [accessToken, conversationId, load, myId, socket]);

  const send = async (override) => {
    const content = String(override ?? text).trim();
    if (!content) return;
    if (!peerId) {
      setError('Cannot send this chat right now. Open the conversation again.');
      return;
    }
    setText('');
    setShowEmoji(false);
    setError('');
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = mapMsg({
      id: localId,
      text: content,
      body: content,
      senderId: myId,
      createdAt: new Date().toISOString(),
    }, myId);
    optimistic.mine = true;
    setMessages((prev) => upsertMessage(prev, optimistic));
    try {
      const res = await api.post('/messages/send', {
        receiverId: peerId,
        text: content,
        conversationId,
      });
      const payload = res.data?.message || res.message || res.data || res;
      const mapped = mapMsg({ ...payload, senderId: payload.senderId || payload.sender_id || myId }, myId);
      mapped.mine = true;
      setMessages((prev) => {
        const withoutLocal = prev.filter((m) => m.id !== localId);
        return upsertMessage(withoutLocal, mapped.id ? mapped : { ...optimistic, id: mapped.id || localId });
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== localId));
      setError(e.message || 'Send failed');
      setText(content);
    }
  };

  const sendMedia = async (kind) => {
    if (!peerId) return;
    const asset = await pickMedia(kind);
    if (!asset) return;
    const part = filePart(asset, kind === 'video' ? 'clip.mp4' : 'photo.jpg');
    if (!part) {
      Alert.alert('Send failed', 'Could not read that file.');
      return;
    }
    const form = new FormData();
    form.append('receiverId', String(peerId));
    if (conversationId) form.append('conversationId', String(conversationId));
    form.append(kind === 'video' ? 'video' : 'image', part);
    try {
      const res = await api.request('/messages/send', { method: 'POST', body: form, timeoutMs: 120000 });
      const payload = res.data?.message || res.message || res.data || res;
      if (payload?.id) setMessages((prev) => upsertMessage(prev, mapMsg({ ...payload, senderId: myId }, myId)));
      else await load();
    } catch (e) {
      Alert.alert('Send failed', e.message || 'Could not upload. Allow photos/videos and try again.');
    }
  };

  const sendVoice = async (uri) => {
    if (!peerId || !uri) {
      Alert.alert('Voice note failed', 'Missing chat or recording file.');
      return;
    }
    const part = filePart({ uri, mimeType: 'audio/mp4', fileName: 'voice.m4a' }, 'voice.m4a');
    if (!part) {
      Alert.alert('Voice note failed', 'Could not read the recording.');
      return;
    }
    const form = new FormData();
    form.append('receiverId', String(peerId));
    if (conversationId) form.append('conversationId', String(conversationId));
    form.append('audio', part);
    try {
      const res = await api.request('/messages/send', { method: 'POST', body: form, timeoutMs: 120000 });
      const payload = res.data?.message || res.message || res.data || res;
      if (payload?.id) setMessages((prev) => upsertMessage(prev, mapMsg({ ...payload, senderId: myId }, myId)));
      else await load();
    } catch (e) {
      Alert.alert('Voice note failed', e.message || 'Could not send audio. Allow microphone access.');
    }
  };

  const startRecording = async () => {
    try {
      if (Platform.OS === 'android') {
        const android = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (android !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Microphone needed', 'Allow microphone access to send a voice note.');
          return;
        }
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access to send a voice note.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      let rec;
      try {
        const created = await Audio.Recording.createAsync(VOICE_RECORDING);
        rec = created.recording;
      } catch (_e) {
        const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        rec = created.recording;
      }
      recRef.current = rec;
      recMsRef.current = 0;
      setRecording(true);
      setRecMs(0);
      recTick.current = setInterval(() => {
        recMsRef.current += 250;
        setRecMs(recMsRef.current);
      }, 250);
    } catch (e) {
      Alert.alert('Recording failed', e.message || 'Could not start the microphone.');
    }
  };

  const stopRecording = async (sendIt) => {
    clearInterval(recTick.current);
    recTick.current = null;
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec) return;
    try {
      const status = await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const duration = Number(status?.durationMillis || recMsRef.current || 0);
      recMsRef.current = 0;
      setRecMs(0);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
      });
      if (!sendIt) return;
      if (!uri) {
        Alert.alert('Recording failed', 'No audio file was saved. Try again.');
        return;
      }
      if (duration < 400) {
        Alert.alert('Too short', 'Hold a little longer, then tap Send.');
        return;
      }
      await sendVoice(uri);
    } catch (e) {
      Alert.alert('Recording failed', e.message || 'Could not finish the voice note.');
      setRecMs(0);
      recMsRef.current = 0;
    }
  };

  const playAudio = async (item) => {
    try {
      if (playingId === item.id) {
        await soundRef.current?.stopAsync?.();
        await soundRef.current?.unloadAsync?.();
        soundRef.current = null;
        setPlayingId(null);
        return;
      }
      await soundRef.current?.unloadAsync?.();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: item.audio }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(item.id);
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      Alert.alert('Playback failed', e.message || 'Could not play this voice note.');
    }
  };

  const sendGift = async (gift, qty) => {
    try {
      const cost = Number(gift.coin_cost || gift.cost || 0) * qty;
      const anim = resolveGiftAnim(gift);
      await api.post('/wallet/gifts', {
        receiverId: peerId,
        giftType: gift.slug || gift.name || 'gift',
        coinAmount: cost,
        qty,
      });
      await send(`${gift.emoji || '🎁'} sent ${gift.name || anim.title || 'gift'} x${qty}`);
      setBurst({
        ...gift,
        from: user?.first_name || 'You',
        qty,
        name: gift.name || anim.title,
        animToken: anim.token,
        animTitle: anim.title,
      });
      setShowGifts(false);
    } catch (e) {
      Alert.alert('Gift failed', e.message);
    }
  };

  const openInvite = (item) => {
    if (item.channel) {
      navigation.navigate(item.isParty || item.kind === 'party' ? 'PartyRoom' : 'LiveRoom', {
        channel: item.channel,
        hostName: headName,
        hostId: peerId,
        isParty: item.isParty || item.kind === 'party',
      });
    }
  };

  const peerPic = pic ? mediaUrl(pic) : null;
  const myPic = mediaUrl(user?.profile_pic || user?.profilePic);

  const renderMsg = ({ item, index }) => {
    const older = thread[index + 1];
    const showClock = !older || clock(item.at) !== clock(older.at);
    if (item.kind === 'system') {
      return (
        <View>
          {showClock ? <Text style={styles.clock}>{clock(item.at)}</Text> : null}
          <View style={styles.sysPill}>
            <Text style={styles.sysT}>
              {String(item.text || '').split(/(Starlink|AP Link)/i).map((part, i) => (
                <Text key={`${item.id}-sys-${i}`} style={/starlink|ap link/i.test(part) ? styles.sysHi : null}>{part}</Text>
              ))}
            </Text>
          </View>
        </View>
      );
    }
    const av = item.mine ? myPic : peerPic;
    const liveCard = item.kind === 'live' || item.kind === 'party';
    return (
      <View>
        {showClock ? <Text style={styles.clock}>{clock(item.at)}</Text> : null}
        <View style={[styles.row, item.mine && styles.rowMine]}>
          {!item.mine ? (
            <Pressable onPress={() => peerId && navigation.navigate('CreatorProfile', { userId: peerId, name: headName })}>
              {av ? <Image source={{ uri: av }} style={styles.av} /> : <View style={styles.av} />}
            </Pressable>
          ) : null}
          {liveCard ? (
            <Pressable onPress={() => openInvite(item)} style={styles.liveCard}>
              <View style={styles.liveTop}>
                {peerPic ? <Image source={{ uri: peerPic }} style={styles.liveThumb} /> : <View style={styles.liveThumb} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveName} numberOfLines={1}>{headName || 'Host'}</Text>
                  <Text style={styles.liveSub}>{item.kind === 'party' ? 'is in a party' : 'is live streaming'}</Text>
                </View>
              </View>
              <View style={styles.liveLine} />
              <Text style={styles.liveCta}>Click to watch the live stream</Text>
            </Pressable>
          ) : item.kind === 'cp' ? (
            <LinearGradient colors={['#C9A227', '#8B6D3B']} style={styles.cpCard}>
              <Text style={styles.cpHead}>CP invitation</Text>
              <Text style={styles.cpBody}>{item.text || `${headName} sent you a CP invitation.`}</Text>
            </LinearGradient>
          ) : (
      <Pressable
              onLongPress={() => item.text && Share.share({ message: item.text })}
              style={[
                styles.bubble,
                item.mine ? styles.mine : styles.theirs,
                (item.image || item.video || item.sticker) && styles.mediaBubble,
              ]}
            >
              {item.sticker ? (
                <Pressable onPress={() => setViewer({ type: 'image', uri: item.sticker })}>
                  <Image source={{ uri: item.sticker }} style={styles.sticker} />
                </Pressable>
              ) : null}
              {item.image ? (
                <Pressable onPress={() => setViewer({ type: 'image', uri: item.image })}>
                  <Image source={{ uri: item.image }} style={styles.media} />
                </Pressable>
              ) : null}
              {/sent .*(gift|x\d)/i.test(String(item.text || '')) ? (
                <View style={{ alignItems: 'center', marginBottom: 6 }}>
                  <GiftThumb gift={{ name: item.text, emoji: '🎁' }} size={64} />
                </View>
              ) : null}
        {item.video && focused ? (
                <Pressable onPress={() => setViewer({ type: 'video', uri: item.video })}>
          <Video
            ref={(r) => { if (r) players.current.set(item.id, r); else players.current.delete(item.id); }}
            source={{ uri: item.video }}
            style={styles.media}
                    resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            useNativeControls
                  />
                </Pressable>
              ) : null}
              {item.audio ? (
                <Pressable onPress={() => playAudio(item)} style={styles.voice}>
                  <Ionicons name={playingId === item.id ? 'pause' : 'play'} size={18} color="#111" />
                  <View style={styles.voiceBars}>
                    {[6, 14, 9, 16, 8, 12, 7].map((h, i) => (
                      <View key={`${item.id}-bar-${i}`} style={[styles.voiceBar, { height: h }]} />
                    ))}
          </View>
                  <Text style={styles.voiceT}>{playingId === item.id ? 'Playing' : 'Voice'}</Text>
                </Pressable>
        ) : null}
              {item.text ? <Text style={styles.msg}>{item.text}</Text> : null}
      </Pressable>
          )}
          {item.mine ? (
            av ? <Image source={{ uri: av }} style={styles.av} /> : <View style={styles.av} />
          ) : null}
        </View>
      </View>
    );
  };

  const pack = STICKER_TABS.find((t) => t.id === stickerTab);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <View style={[styles.head, { paddingTop: insets.top + 2 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        {unread ? (
          <View style={styles.unreadChip}><Text style={styles.unreadT}>{unread > 99 ? '99+' : unread}</Text></View>
        ) : null}
        <Pressable onPress={() => peerId && navigation.navigate('CreatorProfile', { userId: peerId, name: headName })} style={styles.headMid}>
          {peerPic ? <Image source={{ uri: peerPic }} style={styles.headAv} /> : <View style={styles.headAv} />}
          <View>
        <Text style={styles.headName} numberOfLines={1}>{headName || 'Chat'}</Text>
            <View style={styles.onlineDot} />
          </View>
        </Pressable>
        <Pressable onPress={more} style={styles.headBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color="#111" />
        </Pressable>
      </View>
      <ErrorBanner message={error} />
      <FlatList
        ref={listRef}
        inverted
        data={thread}
        keyExtractor={(item) => String(item.id || item.clientId || item._localId || item.created_at || item.ts)}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        style={{ flex: 1, backgroundColor: '#F4F4F4' }}
        contentContainerStyle={{ padding: 12, paddingTop: 16, flexGrow: 1 }}
        renderItem={renderMsg}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => { if (olderReady.current) loadOlder(); }}
        onEndReachedThreshold={0.35}
        maintainVisibleContentPosition={Platform.OS === 'ios' ? { minIndexForVisible: 1, autoscrollToTopThreshold: 40 } : undefined}
      />
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <Pressable key={q.id} onPress={() => send(q.label)} style={styles.quickBtn}>
            <Text style={styles.quickG}>{q.glyph}</Text>
            <Text style={styles.quickT}>{q.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setShowGifts(true)} style={styles.giftQuick}>
          <Ionicons name="gift" size={16} color="#fff" />
          <Text style={styles.giftQuickT}>Gift</Text>
        </Pressable>
      </View>
      <View style={[styles.composer, { paddingBottom: showEmoji || showPlus ? 6 : Math.max(insets.bottom, 8) }]}>
        {recording ? (
          <>
            <Pressable onPress={() => stopRecording(false)} style={styles.roundIco}>
              <Ionicons name="close" size={22} color="#EF4444" />
            </Pressable>
            <View style={styles.recPill}>
              <View style={styles.recDot} />
              <Text style={styles.recT}>Recording {fmtDur(recMs)}</Text>
            </View>
            <Pressable onPress={() => stopRecording(true)} style={[styles.roundIco, styles.roundIcoOn]}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={styles.roundIco}
              onPress={startRecording}
              onLongPress={startRecording}
              delayLongPress={180}
            >
              <Ionicons name="mic-outline" size={20} color="#666" />
            </Pressable>
            <View style={styles.inputPill}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a message"
                placeholderTextColor="#B0B0B0"
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => send()}
              />
              {text.trim() ? (
                <Pressable onPress={() => send()}><Ionicons name="send" size={20} color="#E89020" /></Pressable>
              ) : (
                <Pressable onPress={startRecording}><Ionicons name="mic-outline" size={20} color="#888" /></Pressable>
              )}
            </View>
            <Pressable onPress={() => { setShowPlus(false); setShowEmoji((v) => !v); }} style={styles.roundIco}>
              <Ionicons name={showEmoji ? 'apps-outline' : 'happy-outline'} size={22} color="#555" />
            </Pressable>
            <Pressable onPress={() => { setShowEmoji(false); setShowPlus((v) => !v); }} style={styles.roundIco}>
              <Ionicons name="add" size={24} color="#555" />
            </Pressable>
          </>
        )}
      </View>
      {showPlus ? (
        <View style={[styles.plusGrid, { paddingBottom: insets.bottom + 8 }]}>
          {[
            { label: 'Photo', icon: 'image-outline', fn: () => sendMedia('image') },
            { label: 'Video', icon: 'videocam-outline', fn: () => sendMedia('video') },
            { label: 'Voice', icon: 'mic-outline', fn: () => { setShowPlus(false); startRecording(); } },
            { label: 'Gift', icon: 'gift-outline', fn: () => setShowGifts(true) },
            { label: 'Wallet', icon: 'wallet-outline', fn: () => navigation.navigate('Wallet') },
          ].map((a) => (
            <Pressable key={a.label} onPress={a.fn} style={styles.plusItem}>
              <View style={styles.plusIco}><Ionicons name={a.icon} size={22} color="#444" /></View>
              <Text style={styles.plusT}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {showEmoji ? (
        <View style={[styles.emojiPanel, { paddingBottom: insets.bottom + 6 }]}>
          <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={styles.emojiGrid}>
            {pack?.kind === 'stickers'
              ? pack.pack.map((s) => (
                <Pressable key={s.id} onPress={() => send(`__STK__:${s.uri}`)} style={styles.stickerCell}>
                  <Image source={{ uri: s.uri }} style={styles.stickerThumb} />
                </Pressable>
              ))
              : EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setText((t) => t + e)} style={styles.emojiCell}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </Pressable>
              ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerBar}>
            {STICKER_TABS.map((t) => (
              <Pressable key={t.id} onPress={() => setStickerTab(t.id)} style={[styles.stickerTab, stickerTab === t.id && styles.stickerOn]}>
                <Text style={{ fontSize: 20 }}>{t.glyph}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setText((t) => t.slice(0, -1))} style={styles.backspace}>
              <Ionicons name="backspace-outline" size={20} color="#555" />
            </Pressable>
          </ScrollView>
        </View>
      ) : null}
      <GiftSheet visible={showGifts} gifts={gifts} balance={balance} onClose={() => setShowGifts(false)} onSend={sendGift} onRecharge={() => { setShowGifts(false); navigation.navigate('Recharge'); }} />
      <GiftBurst gift={burst} onDone={() => setBurst(null)} />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerBg} onPress={() => setViewer(null)}>
          {viewer?.type === 'video' ? (
            <Video source={{ uri: viewer.uri }} style={styles.viewerMedia} resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
          ) : viewer?.uri ? (
            <Image source={{ uri: viewer.uri }} style={styles.viewerMedia} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 8, backgroundColor: '#fff' },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  unreadChip: { backgroundColor: '#EFEFEF', minWidth: 28, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 4 },
  unreadT: { fontSize: 12, fontWeight: '700', color: '#333' },
  headMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E5E5' },
  headName: { fontSize: 16, fontWeight: '700', color: '#111', maxWidth: 180 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C8C8C8', marginTop: 4 },
  clock: { textAlign: 'center', color: '#B0B0B0', fontSize: 11, marginVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  rowMine: { justifyContent: 'flex-end' },
  av: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DDD' },
  bubble: { maxWidth: '72%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  mediaBubble: { paddingHorizontal: 6, paddingVertical: 6 },
  mine: { backgroundColor: '#FFF6C8' },
  theirs: { backgroundColor: '#FFFFFF' },
  msg: { color: '#111', fontSize: 15, lineHeight: 21 },
  media: { width: 210, height: 210, borderRadius: 12, backgroundColor: '#111' },
  sticker: { width: 140, height: 140 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160, paddingVertical: 4 },
  voiceBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  voiceBar: { width: 3, backgroundColor: '#E89020', borderRadius: 2 },
  voiceT: { fontWeight: '700', color: '#333', fontSize: 12 },
  liveCard: { width: 240, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  liveTop: { flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center' },
  liveThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#EEE' },
  liveName: { fontWeight: '700', color: '#111' },
  liveSub: { color: '#888', marginTop: 2, fontSize: 13 },
  liveLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#EEE' },
  liveCta: { color: '#9A9A9A', fontSize: 13, paddingHorizontal: 12, paddingVertical: 8 },
  sysPill: { alignSelf: 'center', backgroundColor: '#E8E8E8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, maxWidth: '88%' },
  sysT: { color: '#777', fontSize: 12, textAlign: 'center' },
  sysHi: { color: '#E89020', fontWeight: '800' },
  cpCard: { width: 230, borderRadius: 14, padding: 12 },
  cpHead: { color: '#fff', fontWeight: '800', marginBottom: 6 },
  cpBody: { color: '#FFF8E7', lineHeight: 20 },
  quick: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 8, alignItems: 'center' },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#E6E6E6' },
  quickG: { fontSize: 13 },
  quickT: { fontWeight: '600', color: '#333', fontSize: 13 },
  giftQuick: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F43F5E', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  giftQuickT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  composer: { flexDirection: 'row', paddingHorizontal: 8, gap: 6, alignItems: 'center', backgroundColor: '#F4F4F4' },
  roundIco: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roundIcoOn: { backgroundColor: '#EF4444' },
  recPill: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 12, height: 42, gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recT: { flex: 1, color: '#111', fontWeight: '700', fontSize: 13 },
  recCancel: { color: '#EF4444', fontWeight: '800', fontSize: 12 },
  inputPill: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 12, height: 42, gap: 6 },
  input: { flex: 1, color: '#111', height: 42, fontSize: 15 },
  plusGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, backgroundColor: '#F4F4F4', gap: 18 },
  plusItem: { width: 72, alignItems: 'center', marginBottom: 10 },
  plusIco: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  plusT: { marginTop: 6, fontSize: 12, color: '#555' },
  emojiPanel: { backgroundColor: '#F4F4F4', maxHeight: 340 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8 },
  emojiCell: { width: '14.28%', height: 42, alignItems: 'center', justifyContent: 'center' },
  stickerCell: { width: '25%', height: 96, alignItems: 'center', justifyContent: 'center' },
  stickerThumb: { width: 76, height: 76 },
  stickerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, gap: 4 },
  stickerTab: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  stickerOn: { backgroundColor: '#E8E8E8' },
  backspace: { marginLeft: 'auto', width: 40, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 8 },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerMedia: { width: '100%', height: '80%' },
});
