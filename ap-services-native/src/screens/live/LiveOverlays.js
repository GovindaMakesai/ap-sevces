import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../components/ui';
import { GAME_URLS, normalizeGameUrl } from '../../lib/gameUrls';
import AvatarFrame from '../../components/AvatarFrame';
import { AnimatedSheet } from '../../components/motion';
import { sanitizePublicText } from '../../lib/safeText';
import { Equalizer, ViewerStack } from '../../components/alive';
import GiftThumb from '../../components/GiftThumb';
import { pickQuickGifts } from '../../components/GiftSheet';
import { mediaUrl } from '../../config/api';
import { ROLE_BADGE } from '../../lib/roles';

export const LIVE_PINK = '#D116D1';
export const SHEET = '#1B1D26';

export const SVIP_EMOJIS = [
  { id: 'angry', label: 'Angry', glyph: '😠', tint: '#ef4444' },
  { id: 'comeon', label: 'Come on', glyph: '😉', tint: '#38bdf8' },
  { id: 'cool', label: 'Cool', glyph: '😎', tint: '#94a3b8' },
  { id: 'cry', label: 'Cry', glyph: '😢', tint: '#60a5fa' },
  { id: 'happy', label: 'Happy', glyph: '🤩', tint: '#facc15' },
  { id: 'like', label: 'Like', glyph: '😍', tint: '#fb7185' },
  { id: 'question', label: 'Question', glyph: '🤔', tint: '#a78bfa' },
  { id: 'rich', label: 'Rich', glyph: '🤑', tint: '#22c55e' },
];

export const BASIC_EMOJIS = ['😀', '😂', '😍', '🔥', '👏', '🎉', '❤️', '👍', '😭', '🤩', '🥰', '😈'];

export const GAME_CENTER = [
  { slug: 'crazy-fruit', name: 'Crazy Fruit', emoji: '🍒', url: GAME_URLS['crazy-fruit'] },
  { slug: 'greedy', name: 'Krazy Khazana', emoji: '💎', url: GAME_URLS.greedy },
  { slug: 'teen-patti', name: 'Teen Patti', emoji: '🂡', url: GAME_URLS['teen-patti'] },
];

export function uniqueGames(list = []) {
  const ALIAS = {
    'krazy-jungle': 'crazy-fruit',
    jungle: 'crazy-fruit',
    panda: 'crazy-fruit',
    'krazy-circus': 'greedy',
    'ocean-slot': 'greedy',
    khazana: 'greedy',
    'candy-slot': 'greedy',
    'football-slot': 'greedy',
    'scratch-card': 'greedy',
    'shark-tank': 'greedy',
    ludo: 'greedy',
    'lucky-wheel': 'greedy',
    'krazy-kards': 'teen-patti',
    'royal-battle': 'teen-patti',
    'krazy-khazana': 'greedy',
  };
  const META = {
    'crazy-fruit': { name: 'Crazy Fruit', emoji: '🍒', url: GAME_URLS['crazy-fruit'] },
    greedy: { name: 'Krazy Khazana', emoji: '💎', url: GAME_URLS.greedy },
    'teen-patti': { name: 'Teen Patti', emoji: '🂡', url: GAME_URLS['teen-patti'] },
  };
  const seen = new Set();
  const out = [];
  for (const g of list.length ? list : GAME_CENTER) {
    let slug = String(g.slug || g.id || '').toLowerCase();
    if (ALIAS[slug]) slug = ALIAS[slug];
    if (!META[slug]) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name: META[slug].name,
      emoji: META[slug].emoji,
      url: normalizeGameUrl(g.url || META[slug].url, slug),
    });
  }
  if (!out.length) return GAME_CENTER.slice();
  return out;
}

function toast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
}

function LevelBadge({ n, color, vip, fan }) {
  const bg = vip ? '#F59E0B' : fan ? '#EC4899' : (color || '#22c55e');
  return (
    <View style={[styles.lv, { backgroundColor: bg }]}>
      <Text style={styles.lvT}>Lv.{n || 1}</Text>
    </View>
  );
}

function SvipBadge({ n = 2 }) {
  return (
    <View style={styles.svip}>
      <Text style={styles.svipT}>SVIP {n}</Text>
    </View>
  );
}

export function LiveHeader({
  hostName,
  hostPic,
  hostId,
  roomId,
  viewers,
  people,
  following,
  isHost,
  onHost,
  onFollow,
  onPeople,
  onShare,
  onClose,
  onExpand,
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onHost} style={styles.hostChip}>
        <Avatar uri={hostPic} name={hostName} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.hostName} numberOfLines={1}>{hostName || 'Host'}</Text>
          <Text style={styles.hostId} numberOfLines={1}>
            {roomId || (isHost ? 'You are hosting' : `ID:${hostId || '—'}`)}
          </Text>
        </View>
        {!isHost ? (
          <Pressable onPress={onFollow} style={styles.follow}>
            <Text style={styles.followT}>{following ? 'Following' : 'Follow'}</Text>
          </Pressable>
        ) : null}
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable onPress={onPeople} style={styles.viewerBtn}>
          <ViewerStack people={people} count={viewers} size={22} />
          <Equalizer size={11} />
          <Text style={styles.viewerN}>{viewers || 0} joined</Text>
        </Pressable>
        <Pressable onPress={onExpand} style={styles.round} accessibilityLabel="Expand">
          <Ionicons name="expand-outline" size={16} color="#fff" />
        </Pressable>
        <Pressable onPress={onShare} style={styles.round} accessibilityLabel="Share">
          <Ionicons name="share-social-outline" size={17} color="#fff" />
        </Pressable>
        <Pressable onPress={onClose} style={styles.round} accessibilityLabel="Close">
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/** Premium party header — room ID, room follow heart, viewers */
export function PartyHeader({
  hostName,
  hostPic,
  roomId,
  viewers,
  roomFollowing,
  roomFollowers,
  isHost,
  onHost,
  onRoomFollow,
  onRoomInfo,
  onClose,
}) {
  return (
    <View style={styles.partyHead}>
      <View style={styles.partyHeadRow}>
        <Pressable onPress={onHost} style={styles.partyHostChip}>
          <Avatar uri={hostPic} name={hostName} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.partyHostName} numberOfLines={1}>{hostName || 'Party'}</Text>
            <Pressable onPress={onRoomFollow} style={styles.partyHeartRow} hitSlop={6}>
              <Ionicons
                name={roomFollowing ? 'heart' : 'heart-outline'}
                size={13}
                color={roomFollowing ? '#FF4D6D' : '#fff'}
              />
              <Text style={styles.partyHeartN}>{Number(roomFollowers || 0)}</Text>
              {!isHost && !roomFollowing ? <Text style={styles.partyFollowPlus}>+</Text> : null}
            </Pressable>
          </View>
        </Pressable>
        <View style={styles.partyHeadRight}>
          <Pressable onPress={onRoomInfo} hitSlop={8}>
            <Text style={styles.partyRoomId}>{roomId || 'ID —'}</Text>
          </Pressable>
          <Pressable onPress={onRoomInfo} style={styles.partyViewerPill}>
            <Ionicons name="people" size={12} color="#fff" />
            <Text style={styles.partyViewerN}>{viewers || 0}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.partyClose} accessibilityLabel="Leave">
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
      <View style={styles.partyMetaRow}>
        <View style={styles.partyMetaPill}>
          <Ionicons name="flame" size={12} color="#FBBF24" />
          <Text style={styles.partyMetaT}>Pop 100+</Text>
        </View>
        <View style={[styles.partyMetaPill, { flex: 1 }]}>
          <Ionicons name="musical-notes" size={12} color="#60A5FA" />
          <View style={styles.partyProgTrack}>
            <View style={[styles.partyProgFill, { width: '46%' }]} />
          </View>
          <Text style={styles.partyMetaT}>45%</Text>
        </View>
        <Pressable onPress={onRoomInfo} style={styles.partyMetaPill}>
          <Ionicons name="document-text-outline" size={12} color="#E9D5FF" />
          <Text style={styles.partyMetaT}>Rule</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PartyStageBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#12081F', '#1A0B2E', '#0B1220', '#05070F']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(124,58,237,0.18)', 'rgba(37,99,235,0.22)', 'transparent']}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.partyBeam}
      />
      <View style={styles.partyMicMark}>
        <Ionicons name="mic" size={120} color="rgba(226,232,240,0.08)" />
      </View>
      <View style={styles.partyFloor}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.partyFloorLine, { top: i * 18, opacity: 0.12 + i * 0.04 }]} />
        ))}
      </View>
    </View>
  );
}

export function RankBadges({ rank = 'No.0' }) {
  return (
    <View style={styles.badgeRow}>
      <View style={styles.goldBadge}><Text style={styles.goldBadgeT}>{rank}</Text></View>
      <View style={styles.goldBadge}><Text style={styles.goldBadgeT}>Game</Text></View>
    </View>
  );
}

export function WishWidgets({ onWish, banner = 'ROOM PK LEAGUE' }) {
  return (
    <View style={styles.wishCol}>
      <Pressable onPress={onWish} style={styles.wishBtn}>
        <Text style={styles.wishT}>Wish</Text>
        <Text style={{ fontSize: 14 }}>🎁</Text>
      </Pressable>
      <View style={styles.eventBan}>
        <Text style={styles.eventT} numberOfLines={1}>{banner}</Text>
      </View>
    </View>
  );
}

export function GifterRail({ seats, host, onPress, speakingKeys, meId, hideMic }) {
  const hostId = String(host?.id || '');
  const list = [];
  const seen = new Set();
  (Array.isArray(seats) ? seats : []).forEach((s) => {
    const u = seatUser(s);
    if (!u) return;
    if (u.isHost || u.role === 'host') return;
    const uid = String(u.id || u.userId || '').trim();
    if (!uid || (hostId && uid === hostId) || seen.has(uid)) return;
    seen.add(uid);
    list.push({
      id: uid,
      name: u.name || u.displayName || 'Guest',
      pic: u.profilePic || u.profile_pic || u.pic,
      muted: Boolean(u.muted || s.muted),
      agoraUid: u.agoraUid || s.agoraUid,
      speaking: isSeatSpeaking(u, speakingKeys, meId),
    });
  });
  if (!list.length) return null;
  return (
    <View style={styles.gifterRail} pointerEvents="box-none">
      {list.map((u) => (
        <Pressable key={u.id} onPress={() => onPress?.(u)} style={[styles.gifter, u.speaking && styles.gifterTalk, u.muted && styles.gifterMuted]}>
          <Avatar uri={u.pic} name={u.name} size={40} />
          {u.speaking && !u.muted ? (
            <View style={styles.seatWave}><Equalizer size={10} color="#fbbf24" /></View>
          ) : null}
          {u.muted && !hideMic ? (
            <View style={styles.seatMuteBadge}><Ionicons name="mic-off" size={12} color="#fff" /></View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function PartySeatGrid({ seats, host, onSeat, speakingKeys, meId, hostPresent = true }) {
  const hostId = String(host?.id || '');
  const incoming = Array.isArray(seats) ? seats : [];
  const byIndex = new Map();
  incoming.forEach((s) => {
    const raw = Number(s?.index);
    if (!Number.isFinite(raw)) return;
    const u = seatUser(s);
    if (u && (u.isHost || u.role === 'host')) return;
    byIndex.set(raw, s);
  });
  const list = Array.from({ length: 9 }, (_, i) => {
    if (i === 0 && hostId && hostPresent) {
      const hostUser = {
        id: hostId,
        userId: hostId,
        name: host?.name || 'Host',
        displayName: host?.name || 'Host',
        profilePic: host?.pic || host?.profilePic,
        pic: host?.pic || host?.profilePic,
        isHost: true,
        role: 'host',
        muted: false,
      };
      return { index: 0, user: hostUser };
    }
    const s = byIndex.get(i) || { index: i, user: null };
    return { ...s, index: i };
  });
  return (
    <View style={styles.seatWrap}>
      <View style={styles.seatGrid3}>
        {list.map((s) => (
          <SeatBubble
            key={`seat-${s.index}`}
            seat={s}
            host={host}
            onPress={() => onSeat?.(s)}
            speakingKeys={speakingKeys}
            meId={meId}
            premium
          />
        ))}
      </View>
    </View>
  );
}

function seatUser(seat) {
  const u = seat?.user;
  if (!u || typeof u !== 'object') return null;
  if (u.id || u.userId || u.name || u.displayName || u.profilePic || u.profile_pic || u.pic) return u;
  return null;
}

function isSeatSpeaking(user, speakingKeys, meId) {
  if (!user || user.muted) return false;
  const keys = speakingKeys instanceof Set ? speakingKeys : new Set();
  const uid = String(user.id || user.userId || '');
  const agora = String(user.agoraUid || '');
  if (agora && keys.has(agora)) return true;
  if (meId && uid === String(meId) && keys.has('local')) return true;
  if (uid && keys.has(uid)) return true;
  return false;
}

function SeatPulse({ active, color, children, empty }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (!active && !empty) {
      scale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: empty ? 1.06 : 1.05, duration: empty ? 900 : 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: empty ? 900 : 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, empty, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }], borderRadius: 32, shadowColor: color, shadowOpacity: active || empty ? 0.7 : 0, shadowRadius: active ? 12 : 8, elevation: active ? 8 : 0 }}>
      {children}
    </Animated.View>
  );
}

function SeatBubble({ seat, host, onPress, speakingKeys, meId, premium }) {
  const user = seatUser(seat);
  const isHostSeat = Boolean(
    user && (String(user.id || user.userId) === String(host?.id) || user?.isHost || user?.role === 'host')
  );
  const seatNum = Number(seat?.index) + 1;
  const vipEmpty = !user && seatNum >= 2 && seatNum <= 4;
  const pic = user?.profilePic || user?.profile_pic || user?.pic || user?.avatar;
  const muted = Boolean(user?.muted);
  const speaking = isSeatSpeaking(user, speakingKeys, meId);
  const giftN = Number(user?.giftScore || user?.gifts || user?.score || seat?.score || 0);
  const name = String(user?.name || user?.displayName || '').trim();
  return (
    <Pressable onPress={onPress} style={[styles.seatCell, premium && styles.seatCellPremium]}>
      <Text style={[styles.seatNum, premium && styles.seatNumPremium]}>{seatNum}</Text>
      {isHostSeat ? (
        <View style={styles.seatHostCrown}>
          <Ionicons name="ribbon" size={14} color="#F5D76E" />
        </View>
      ) : null}
      {user && giftN >= 0 ? (
        <View style={styles.seatGiftBadge}>
          <Ionicons name="gift" size={9} color="#fff" />
          <Text style={styles.seatGiftT}>{giftN > 99 ? '99+' : giftN}</Text>
        </View>
      ) : null}
      <SeatPulse active={speaking && !muted} empty={!user} color={speaking ? '#fbbf24' : vipEmpty ? '#fbbf24' : '#7C3AED'}>
        {user ? (
          <View style={styles.seatOcc}>
            <View style={[styles.seatAvRing, speaking && !muted && styles.seatAvRingTalk]}>
              <Avatar uri={mediaUrl(pic)} name={name || 'Guest'} size={premium ? 52 : 48} />
            </View>
            {speaking && !muted ? (
              <View style={styles.seatWave}><Equalizer size={11} color="#fbbf24" /></View>
            ) : null}
            {muted ? (
              <View style={styles.seatMuteBadge}><Ionicons name="mic-off" size={13} color="#fff" /></View>
            ) : (
              <View style={styles.seatMicBadge}><Ionicons name="mic" size={10} color="#fff" /></View>
            )}
          </View>
        ) : vipEmpty ? (
          <View style={[styles.seatVipEmpty, premium && styles.seatVipEmptyPremium]}>
            <Ionicons name="trophy" size={28} color="rgba(251,191,36,0.85)" />
          </View>
        ) : (
          <View style={[styles.seatChairEmpty, premium && styles.seatChairEmptyPremium]}>
            <Ionicons name="person" size={22} color="rgba(196,181,253,0.55)" />
            <View style={styles.seatPlus}><Text style={styles.seatPlusT}>+</Text></View>
          </View>
        )}
      </SeatPulse>
      {user ? (
        <Text style={[styles.seatName, premium && styles.seatNamePremium]} numberOfLines={1}>{name || 'Guest'}</Text>
      ) : (
        <View style={{ height: 16 }} />
      )}
    </Pressable>
  );
}

export function LiveChatFeed({
  chat,
  announcement,
  pinned,
  hideChat,
  onToggleChat,
  onUser,
  onImage,
}) {
  const chatScrollRef = useRef(null);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -48) onToggleChat?.(true);
        else if (g.dx > 48) onToggleChat?.(false);
      },
    })
  ).current;

  if (hideChat) {
    return (
      <View style={styles.chatSwipeHint} {...pan.panHandlers} pointerEvents="box-only">
        <View style={styles.chatEdge} />
      </View>
    );
  }

  return (
    <View style={styles.chatCol} {...pan.panHandlers}>
      {pinned ? (
        <View style={styles.pinBubble}>
          <Text style={styles.pinT} numberOfLines={1}>{pinned}</Text>
        </View>
      ) : null}
      {announcement ? (
        <Text style={styles.announce} numberOfLines={1}>
          <Text style={styles.announceH}>Announcement  </Text>
          {announcement}
        </Text>
      ) : null}
      <ScrollView
        ref={chatScrollRef}
        style={styles.chat}
        contentContainerStyle={{ paddingBottom: 6 }}
        nestedScrollEnabled
        onContentSizeChange={() => {
          try {
            chatScrollRef.current?.scrollToEnd?.({ animated: false });
          } catch (_e) {}
        }}
      >
        {chat.slice(-40).map((m) => (
          <View key={m.id} style={[styles.chatLine, m.system && styles.sysLine, m.type === 'gift' && styles.giftLine]}>
            {m.system ? (
              <Text style={styles.sysDot}>System</Text>
            ) : (
              <Pressable onPress={() => onUser?.({ id: m.userId, name: m.user, pic: m.pic })}>
                <Avatar uri={m.pic} name={m.user} size={18} />
              </Pressable>
            )}
            {m.system ? (
              <Text style={styles.chatMsg}>{sanitizePublicText(m.text, 280)}</Text>
            ) : m.type === 'gift' ? (
              <Text style={styles.chatMsg}>
                <Text style={styles.chatUser}>{sanitizePublicText(m.user, 32) || 'User'} </Text>
                <Text style={styles.giftMsg}>sent {sanitizePublicText(m.text, 80)}</Text>
              </Text>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={styles.chatMsg}>
                  <Text style={styles.chatUser}>{sanitizePublicText(m.user, 32) || 'User'}: </Text>
                  {m.text ? sanitizePublicText(m.text, 280) : ''}
                </Text>
                {m.imageUrl ? (
                  <Pressable onPress={() => onImage?.(m.imageUrl)} style={styles.chatImgWrap}>
                    <Image source={{ uri: mediaUrl(m.imageUrl) }} style={styles.chatImg} resizeMode="cover" />
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function SendGiftPill({ onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.giftPillWrap}>
      <LinearGradient colors={['#a855f7', '#ec4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.giftPill}>
        <Text style={styles.giftPillT}>Send a gift!</Text>
        <Text style={{ fontSize: 14 }}>🎁</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function QuickGiftStrip({ gifts, onPick, onOpen }) {
  const quick = pickQuickGifts(gifts, 5);
  return (
    <View style={styles.quickRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
        {quick.map((g, i) => (
          <Pressable key={g.slug || i} onPress={() => onPick?.(g, 1)} style={styles.quickItem}>
            <GiftThumb gift={g} size={40} delay={i * 120} />
            <View style={styles.quickPrice}>
              <Text style={styles.quickCoin}>●</Text>
              <Text style={styles.quickN}>{Number(g.coin_cost || g.price || 0)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={onOpen} style={styles.quickFab}>
        <Text style={{ fontSize: 22 }}>🎁</Text>
      </Pressable>
    </View>
  );
}

export function LiveGuestRail({ rooms, onSwitch }) {
  const list = (rooms || []).slice(0, 3);
  if (!list.length) return null;
  return (
    <View style={styles.guestRail} pointerEvents="box-none">
      {list.map((r) => {
        const cover = mediaUrl(r.hostStreamCover || r.hostProfilePic || r.cover);
        return (
          <Pressable key={r.channel} onPress={() => onSwitch?.(r)} style={styles.guestTile}>
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1F2937' }]} />
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.guestShade} />
            <View style={styles.guestEq}><Equalizer size={10} /></View>
            <Text style={styles.guestName} numberOfLines={1}>{r.hostName || 'Live'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LiveBottomBar({
  muted,
  speakerOn,
  onMic,
  onSpeaker,
  onEmoji,
  onMore,
  onGames,
  onGifts,
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.barLeft}>
        <Pressable onPress={onMic} style={styles.barIco} accessibilityLabel={muted ? 'Unmute' : 'Mute'}>
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={onSpeaker} style={styles.barIco} accessibilityLabel={speakerOn ? 'Turn speaker off' : 'Turn speaker on'}>
          <Ionicons name={speakerOn ? 'volume-high' : 'volume-mute'} size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={onEmoji} style={styles.barIco} accessibilityLabel="Emoji">
          <Ionicons name="happy-outline" size={18} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.barRight}>
        <Pressable onPress={onMore} style={styles.barIco} accessibilityLabel="More">
          <Ionicons name="apps" size={17} color="#fff" />
        </Pressable>
        <Pressable onPress={onGames} style={styles.barIco} accessibilityLabel="Games">
          <Ionicons name="game-controller" size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={onGifts} style={styles.giftHero} accessibilityLabel="Send gift">
          <Ionicons name="gift" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export function EmojiSheet({ visible, onClose, onPick }) {
  const all = [...SVIP_EMOJIS.map((e) => e.glyph), ...BASIC_EMOJIS, '😘', '🤗', '🙌', '💯', '⭐', '🌹', '🎁', '👑'];
  const unique = [...new Set(all)];
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={0.42}>
      <View style={{ backgroundColor: '#1B1D26', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 12 }}>Emojis</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {unique.map((glyph) => (
            <Pressable key={glyph} onPress={() => { onPick?.(glyph); onClose?.(); }} style={{ width: '16.6%', paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 28 }}>{glyph}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </AnimatedSheet>
  );
}

export function GameCenterSheet({ visible, onClose, onPlus, onRefresh, onPlay, games }) {
  const list = uniqueGames(games?.length ? games : GAME_CENTER);
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={0.72}>
      <View style={{ backgroundColor: '#12081c', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Game center</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onPlus}><Text style={{ color: '#FDE68A', fontWeight: '800' }}>+ Coins</Text></Pressable>
            <Pressable onPress={onRefresh}><Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Refresh</Text></Pressable>
            <Pressable onPress={onClose}><Text style={{ color: '#9CA3AF' }}>Close</Text></Pressable>
          </View>
        </View>
        <ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {list.map((g) => (
              <Pressable
                key={g.slug}
                onPress={() => onPlay?.(g)}
                style={{ width: '25%', alignItems: 'center', marginBottom: 16 }}
              >
                <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                </View>
                <Text style={{ color: '#E5E7EB', fontSize: 11, marginTop: 6, fontWeight: '700', textAlign: 'center' }}>{g.name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </AnimatedSheet>
  );
}

export function AudienceSheet({
  visible,
  onClose,
  tab,
  setTab,
  period,
  setPeriod,
  online,
  onUser,
  canModerate,
  chatLocked,
  onMuteAllChat,
  onClearChat,
  giftTotals = [],
  giftHistory = [],
  applicants = [],
  onAcceptApplicant,
  onDeclineApplicant,
}) {
  const rows = online || [];
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={0.72}>
      <View style={[styles.peopleSheet, { flex: 1, maxHeight: '100%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17, flex: 1 }}>People in live</Text>
          <Pressable onPress={onClose}><Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Close</Text></Pressable>
        </View>
        {canModerate ? (
          <View style={styles.joinedModBar}>
            <Pressable onPress={onMuteAllChat} style={styles.joinedModBtn}>
              <Text style={styles.joinedModT}>{chatLocked ? 'Unmute all chat' : 'Mute all chat'}</Text>
            </Pressable>
            <Pressable onPress={onClearChat} style={[styles.joinedModBtn, styles.joinedModDanger]}>
              <Text style={styles.joinedModT}>Clear all chat</Text>
            </Pressable>
          </View>
        ) : null}
        {canModerate && applicants.length ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.joinedSub}>Seat requests · {applicants.length}</Text>
            {applicants.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <Avatar uri={u.pic} name={u.name} size={36} />
                <Text style={[styles.userName, { flex: 1 }]}>{u.name}</Text>
                <Pressable onPress={() => onAcceptApplicant?.(u)} style={styles.followOutline}>
                  <Text style={styles.followOutlineT}>Agree</Text>
                </Pressable>
                <Pressable onPress={() => onDeclineApplicant?.(u)}>
                  <Text style={{ color: '#F87171', fontWeight: '700', marginLeft: 8 }}>Disagree</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 8 }}>
          {['online', 'contribution'].map((t) => (
            <Pressable key={t} onPress={() => setTab(t)}>
              <Text style={{ color: tab === t ? '#fff' : '#9CA3AF', fontWeight: '800' }}>
                {t === 'online' ? `Online · ${rows.length}` : 'Contribution'}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'contribution' ? (
          <View style={styles.periodRow}>
            {['daily', 'weekly'].map((p) => (
              <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.period, period === p && styles.periodOn]}>
                <Text style={[styles.periodT, period === p && styles.periodTOn]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ScrollView>
          <Text style={styles.joinedSub}>In room (online)</Text>
          {rows.map((u) => (
            <Pressable key={u.id || u.name} onPress={() => onUser?.(u)} style={styles.userRow}>
              <View>
                <Avatar uri={u.pic} name={u.name} size={40} />
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.metaMuted}>
                  {u.role || (u.isAdmin ? 'Live admin' : u.level ? `Lv.${u.level}` : 'In room')}
                </Text>
              </View>
              {u.isAdmin ? (
                <View style={{ backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#111', fontWeight: '800', fontSize: 10 }}>ADMIN</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
          {!rows.length ? <Text style={styles.metaMuted}>Nobody else is here yet.</Text> : null}

          <Text style={[styles.joinedSub, { marginTop: 14 }]}>Room gift totals</Text>
          {(giftTotals || []).length ? (
            giftTotals.map((g, i) => (
              <View key={g.name || i} style={styles.giftStatRow}>
                <Text style={styles.giftStatName}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</Text>
                <Text style={styles.giftStatN}>×{g.count} · {Number(g.coins || 0).toLocaleString()} coins</Text>
              </View>
            ))
          ) : (
            <Text style={styles.metaMuted}>No gifts in this room yet.</Text>
          )}

          <Text style={[styles.joinedSub, { marginTop: 14 }]}>Gift history</Text>
          {(giftHistory || []).length ? (
            giftHistory.map((h, i) => (
              <View key={h.id || i} style={styles.giftHistRow}>
                <Avatar uri={h.pic} name={h.from} size={28} />
                <Text style={styles.giftHistT} numberOfLines={1}>
                  <Text style={{ fontWeight: '800' }}>{h.from}</Text>
                  {` sent ${h.text}`}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.metaMuted}>Gift history is empty.</Text>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </AnimatedSheet>
  );
}

export function ApplyingUserSheet({ visible, onClose, applicants, onCancel, onAccept, onDecline, canModerate }) {
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height="52%">
      <View style={[styles.applySheet, { maxHeight: '100%', flex: 1 }]}>
          <View style={styles.applyHead}>
            <Text style={styles.applyTitle}>Applying User: {applicants.length}</Text>
            <Pressable onPress={onClose}><Text style={{ color: '#9ca3af', fontSize: 18 }}>✕</Text></Pressable>
          </View>
          <ScrollView>
            {applicants.map((u, i) => (
              <View key={u.id || i} style={styles.applyRow}>
                <Text style={styles.applyIdx}>{i + 1}</Text>
                <Avatar uri={u.pic} name={u.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.applyName}>{u.name}</Text>
                  <View style={styles.badgeLine}>
                    <LevelBadge n={u.level || 22} />
                    <LevelBadge n={u.charm || 29} color="#22c55e" />
                  </View>
                </View>
                {canModerate ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => onAccept?.(u)} style={styles.followOutline}>
                      <Text style={styles.followOutlineT}>Agree</Text>
                    </Pressable>
                    <Pressable onPress={() => onDecline?.(u)}>
                      <Text style={{ color: '#F87171', fontWeight: '700' }}>Disagree</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
          {!canModerate ? (
            <Pressable onPress={onCancel} style={styles.cancelApply}>
              <Text style={styles.cancelApplyT}>Click to cancel the application</Text>
            </Pressable>
          ) : null}
      </View>
    </AnimatedSheet>
  );
}

export function SeatInviteModal({ visible, seconds, onAgree, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.centerWrap}>
        <View style={styles.inviteCard}>
          <Text style={styles.inviteMsg}>You have invitation to mic .{seconds != null ? `(${seconds}s)` : ''}</Text>
          <View style={styles.inviteBtns}>
            <Pressable onPress={onCancel} style={styles.inviteRefuse}>
              <Text style={styles.inviteRefuseT}>Refuse</Text>
            </Pressable>
            <Pressable onPress={onAgree} style={styles.inviteAccept}>
              <Text style={styles.inviteAcceptT}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function HostProfileSheet({
  visible,
  onClose,
  person,
  hostId,
  isLiveHost,
  isRoomAdmin,
  isAdmin,
  following,
  loading,
  followers,
  followingCount,
  level,
  vipLevel,
  svipLevel,
  roleKeys,
  supporters,
  giftWall,
  giftLit,
  medalCount,
  onFollow,
  onGift,
  onMessage,
  onMention,
  onMore,
  onViewFull,
  onCopyId,
  mine,
}) {
  const name = person?.name || 'User';
  const pic = person?.pic;
  const idLabel = hostId || person?.displayId || person?.id || '—';
  const wall = Array.isArray(giftWall) ? giftWall.slice(0, 6) : [];
  const tops = Array.isArray(supporters) ? supporters.slice(0, 4) : [];
  const slots = [0, 1, 2];
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={0.86}>
      <ScrollView style={styles.lpSheet} contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
        <View style={styles.lpHero}>
          <View style={styles.lpAvatarWrap}>
            <Avatar uri={pic} name={name} size={88} />
            {isAdmin ? <Text style={styles.lpAdminTag}>ADMIN</Text> : null}
          </View>
          <View style={styles.lpHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.lpName} numberOfLines={1}>{name}</Text>
              {isLiveHost ? <Text style={styles.lpLive}>Live</Text> : null}
              <Pressable onPress={onClose} style={{ marginLeft: 'auto', padding: 4 }}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </Pressable>
            </View>
            <View style={styles.lpBadges}>
              {level ? <Text style={styles.lpLv}>Lv.{level}</Text> : null}
              {vipLevel ? <Text style={styles.lpVip}>VIP {vipLevel}</Text> : null}
              {svipLevel ? <Text style={styles.lpSvip}>SVIP {svipLevel}</Text> : null}
              {isRoomAdmin ? <Text style={styles.lpMod}>ADMIN</Text> : null}
              {(roleKeys || []).map((k) => {
                const b = ROLE_BADGE[k];
                if (!b) return null;
                return (
                  <LinearGradient key={k} colors={b.bg} style={styles.lpRole}>
                    <Text style={[styles.lpRoleT, { color: b.color }]}>{b.label}</Text>
                  </LinearGradient>
                );
              })}
            </View>
            <Pressable onPress={onCopyId} style={styles.lpIdRow}>
              <Text style={styles.lpId}>ID: {idLabel}</Text>
              <Ionicons name="copy-outline" size={14} color="#9CA3AF" />
            </Pressable>
            <View style={styles.lpStats}>
              <View>
                <Text style={styles.lpStatN}>{fmtCount(followers)}</Text>
                <Text style={styles.lpStatL}>Followers</Text>
              </View>
              <View>
                <Text style={styles.lpStatN}>{fmtCount(followingCount)}</Text>
                <Text style={styles.lpStatL}>Following</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.lpCard}>
          <View style={styles.lpCardH}>
            <Text style={styles.lpCardT}>Top supporters</Text>
            <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
          </View>
          <View style={styles.lpRow}>
            {tops.length ? tops.map((u) => (
              <Avatar key={u.id || u.name} uri={u.pic} name={u.name} size={32} />
            )) : (
              <Text style={styles.lpMuted}>{loading ? 'Loading…' : 'No gifts yet'}</Text>
            )}
          </View>
        </View>

        <View style={styles.lpSection}>
          <View style={styles.lpCardH}>
            <Text style={styles.lpSecT}>Gift Gallery</Text>
            <Text style={styles.lpMuted}>Lit: {giftLit || wall.length}/12</Text>
          </View>
          <View style={styles.lpRow}>
            {wall.length ? wall.map((g, i) => (
              <GiftThumb key={g.giftType || g.slug || i} gift={g} size={44} float={false} />
            )) : slots.map((i) => (
              <View key={i} style={styles.lpDash}><Text style={styles.lpPlus}>+</Text></View>
            ))}
          </View>
        </View>

        <View style={styles.lpSection}>
          <View style={styles.lpCardH}>
            <Text style={styles.lpSecT}>Medal</Text>
            <Text style={styles.lpMuted}>Number of medals: {medalCount || 0}</Text>
          </View>
          <View style={styles.lpRow}>
            {slots.map((i) => (
              <View key={i} style={styles.lpHex}><Text style={styles.lpPlus}>+</Text></View>
            ))}
          </View>
        </View>

        {!mine ? (
          <Pressable onPress={onGift} style={{ marginTop: 8 }}>
            <LinearGradient colors={['#f59e0b', '#ea580c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.lpGiftBtn}>
              <Ionicons name="gift" size={18} color="#fff" />
              <Text style={styles.lpGiftT}>Send gift</Text>
            </LinearGradient>
          </Pressable>
        ) : null}

        <View style={styles.lpActions}>
          <Pressable onPress={onViewFull} style={styles.lpAct}>
            <Ionicons name="person-outline" size={20} color="#111827" />
            <Text style={styles.lpActT}>Profile</Text>
          </Pressable>
          {!mine ? (
            <Pressable onPress={onFollow} style={[styles.lpAct, styles.lpActPrimary]}>
              <Ionicons name={following ? 'person' : 'person-add-outline'} size={20} color="#fff" />
              <Text style={[styles.lpActT, { color: '#fff' }]}>{following ? 'Following' : 'Add friend'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onMention} style={styles.lpAct}>
            <Ionicons name="at" size={20} color="#111827" />
            <Text style={styles.lpActT}>Mention</Text>
          </Pressable>
          <Pressable onPress={onMessage} style={styles.lpAct}>
            <Ionicons name="mail-outline" size={20} color="#111827" />
            <Text style={styles.lpActT}>Message</Text>
          </Pressable>
          <Pressable onPress={onMore} style={styles.lpAct}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#111827" />
            <Text style={styles.lpActT}>More</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AnimatedSheet>
  );
}

function fmtCount(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

export function MemberActionMenu({ visible, onClose, target, items = [], light }) {
  if (!visible) return null;
  const rows = items.filter((it) => it && it.show !== false);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modWrap} onPress={onClose}>
        <Pressable style={[styles.modMenu, light && styles.modMenuLight]} onPress={() => {}}>
          <Text style={[styles.modName, light && styles.modNameLight]} numberOfLines={1}>{target?.name || 'User'}</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {rows.map((it) => (
              <Pressable
                key={it.id || it.label}
                onPress={() => { it.onPress?.(); if (!it.keepOpen) onClose?.(); }}
                style={[styles.modRow, light && styles.modRowLight]}
              >
                <Text style={[styles.modT, light && styles.modTLight, it.danger && { color: '#F87171' }]}>{it.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} style={[styles.modCancel, light && styles.modCancelLight]}>
            <Text style={[styles.modCancelT, light && { color: '#6B7280' }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ToolsMenuSheet({
  visible,
  onClose,
  isHost,
  canModerate,
  chatLocked,
  onLucky,
  onLuckyBox,
  onEntry,
  onGiftFx,
  onPhoto,
  onCall,
  onShare,
  onPk,
  onMuteAllChat,
  onClearChat,
  onAdmins,
  onRankings,
  onStore,
  onFanClub,
  onMusic,
  onBackground,
  onSettings,
  onReport,
  onLiveData,
  onMessages,
  onVip,
  onGames,
  onWallet,
  onBackpack,
  onGiftWish,
  onStreamerCenter,
  onNoise,
  onIntro,
  onTheme,
  onBubble,
  onEffects,
  onBeauty,
  onFlipCam,
  onMirror,
  onMinimize,
  onSound,
  onScreenRec,
  isParty,
}) {
  const go = (fn) => {
    onClose?.();
    requestAnimationFrame(() => fn?.());
  };
  const host = isHost || canModerate;

  const ICO = {
    admins: ['#60A5FA', '#1D4ED8'],
    bubble: ['#F472B6', '#BE185D'],
    fan: ['#FB7185', '#E11D48'],
    data: ['#22D3EE', '#0891B2'],
    mgmt: ['#A8A29E', '#57534E'],
    ambient: ['#A78BFA', '#6D28D9'],
    record: ['#F87171', '#B91C1C'],
    intro: ['#34D399', '#047857'],
    pk: ['#FBBF24', '#EC4899'],
    lucky: ['#FBBF24', '#D97706'],
    luckybox: ['#EF4444', '#B45309'],
    collection: ['#FB7185', '#BE185D'],
    gamepk: ['#A78BFA', '#7C3AED'],
    gifts: ['#FB7185', '#DB2777'],
    msg: ['#60A5FA', '#2563EB'],
    flip: ['#94A3B8', '#475569'],
    beauty: ['#F9A8D4', '#DB2777'],
    mirror: ['#C4B5FD', '#7C3AED'],
    share: ['#4ADE80', '#15803D'],
    effects: ['#FCD34D', '#B45309'],
    noise: ['#67E8F9', '#0E7490'],
    sound: ['#818CF8', '#4338CA'],
    music: ['#C084FC', '#7E22CE'],
    minimize: ['#94A3B8', '#334155'],
    bg: ['#FDBA74', '#C2410C'],
    muteall: ['#FCA5A5', '#B91C1C'],
    clear: ['#FDBA74', '#9A3412'],
    photo: ['#93C5FD', '#1D4ED8'],
    report: ['#F87171', '#991B1B'],
    rank: ['#FBBF24', '#B45309'],
    wallet: ['#FDE68A', '#CA8A04'],
    store: ['#F9A8D4', '#BE185D'],
    vip: ['#C4B5FD', '#6D28D9'],
    backpack: ['#FDA4AF', '#E11D48'],
    gallery: ['#F9A8D4', '#DB2777'],
    wish: ['#FDE047', '#CA8A04'],
    trade: ['#86EFAC', '#15803D'],
    center: ['#7DD3FC', '#0369A1'],
    games: ['#C4B5FD', '#6D28D9'],
  };

  const sections = [
    host
      ? {
          title: 'Host Tools',
          outline: true,
          items: [
            { id: 'admins', label: 'Admins', icon: 'person-add-outline', onPress: onAdmins },
            { id: 'bubble', label: 'Text Bubble', icon: 'chatbubble-outline', onPress: onBubble || onEntry },
            { id: 'fan', label: 'Fan Club', icon: 'heart-outline', onPress: onFanClub },
            { id: 'data', label: 'Live Data', icon: 'stats-chart-outline', onPress: onLiveData },
            { id: 'mgmt', label: 'Live Management', icon: 'settings-outline', onPress: onSettings },
            { id: 'ambient', label: 'Ambient Sound', icon: 'musical-notes-outline', onPress: onMusic },
            { id: 'record', label: 'Screen Recording', icon: 'radio-button-on-outline', onPress: onScreenRec },
            { id: 'intro', label: 'Live Stream Introduction', icon: 'document-text-outline', onPress: onIntro || onSettings },
          ],
        }
      : null,
    {
      title: 'Basic Tools',
      outline: true,
      items: host
        ? [
            { id: 'msg', label: 'Message', icon: 'mail-outline', onPress: onMessages },
            { id: 'flip', label: 'Switch Camera', icon: 'camera-reverse-outline', onPress: onFlipCam || onCall },
            { id: 'beauty', label: 'Beauty', icon: 'sparkles-outline', onPress: onBeauty || onEffects },
            { id: 'mirror', label: 'Mirror', icon: 'copy-outline', onPress: onMirror },
            { id: 'share', label: 'Share', icon: 'share-outline', onPress: onShare },
            { id: 'effects', label: 'Effect & Msg', icon: 'options-outline', onPress: onEffects || onBeauty },
            { id: 'noise', label: 'Noise Reduction (3A)', icon: 'pulse-outline', onPress: onNoise, badge: 'On' },
          ]
        : [
            { id: 'msg', label: 'Message', icon: 'mail-outline', onPress: onMessages },
            { id: 'sound', label: 'Sound', icon: 'volume-high-outline', onPress: onSound || onMusic },
            { id: 'share', label: 'Share', icon: 'share-outline', onPress: onShare },
            { id: 'report', label: 'Report', icon: 'alert-circle-outline', onPress: onReport },
            { id: 'effects', label: 'Effect & Msg', icon: 'options-outline', onPress: onEffects },
            { id: 'minimize', label: 'Minimize', icon: 'contract-outline', onPress: onMinimize },
          ],
    },
    {
      title: 'Features Center',
      items: [
        { id: 'rank', label: 'Rank', icon: 'trophy', onPress: onRankings },
        ...(host ? [{ id: 'pk', label: 'PK', icon: 'flash', onPress: onPk, pkMark: true }] : []),
        { id: 'wallet', label: 'Rewards', icon: 'cash', onPress: onWallet },
        { id: 'store', label: 'Store', icon: 'bag', onPress: onStore },
        { id: 'vip', label: 'VIP', icon: 'diamond', onPress: onVip },
        { id: 'gifts', label: 'Gift Center', icon: 'gift', onPress: onGiftFx },
        { id: 'backpack', label: 'Backpack', icon: 'briefcase', onPress: onBackpack || onStore },
        { id: 'gallery', label: 'Gift Gallery', icon: 'storefront', onPress: onGiftFx },
        { id: 'luckybox', label: 'Lucky Box', icon: 'cube', onPress: onLuckyBox || onLucky },
        { id: 'collection', label: 'Gift Collection', icon: 'albums', onPress: onLucky },
        { id: 'trade', label: 'Coins Trading', icon: 'swap-horizontal', onPress: onWallet },
        { id: 'wish', label: 'Gift Wish', icon: 'star', onPress: onGiftWish || onLucky },
      ],
    },
  ].filter(Boolean);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modWrap} onPress={onClose}>
        <Pressable style={[styles.modMenu, styles.toolsSheet]} onPress={() => {}}>
          <View style={styles.toolsHead}>
            <Text style={styles.toolsHeadT}>{host ? 'Host tools' : 'Room tools'}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.toolsClose}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            {sections.map((sec) => (
              <View key={sec.title}>
                <Text style={styles.toolsH}>{sec.title}</Text>
                <View style={styles.toolsGrid}>
                  {sec.items.map((it) => {
                    const colors = ICO[it.id] || ['#64748B', '#334155'];
                    return (
                      <Pressable key={it.id} onPress={() => go(it.onPress)} style={styles.toolCell}>
                        {sec.outline ? (
                          <View style={styles.toolOutline}>
                            <Ionicons name={it.icon} size={22} color="#fff" />
                            {it.badge ? (
                              <View style={styles.toolOnBadge}><Text style={styles.toolOnBadgeT}>{it.badge}</Text></View>
                            ) : null}
                          </View>
                        ) : (
                        <LinearGradient colors={colors} style={styles.toolIco}>
                          {it.pkMark ? (
                            <View style={styles.pkMark}>
                              <Text style={styles.pkMarkP}>P</Text>
                              <Text style={styles.pkMarkK}>K</Text>
                            </View>
                          ) : (
                            <Ionicons name={it.icon} size={20} color="#fff" />
                          )}
                        </LinearGradient>
                        )}
                        <Text style={styles.toolL} numberOfLines={2}>{it.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function copyId(id) {
  Share.share({ message: String(id || '') }).catch(() => {});
  toast('ID copied');
}

export function nowUpdateLabel() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}(GMT+5:30)`;
}

export function activeRoomPeople({ host, members = [], seats = [], user } = {}) {
  const map = new Map();
  const add = (id, name, pic, extra = {}) => {
    const uid = String(id || '').trim();
    const nm = String(name || '').trim();
    const photo = pic || extra.pic;
    if (!uid) return;
    if (map.has(uid)) {
      const v = map.get(uid);
      map.set(uid, { ...v, name: v.name || nm, pic: v.pic || photo, ...extra });
      return;
    }
    map.set(uid, { id: uid, name: nm || 'User', pic: photo, ...extra });
  };
  (Array.isArray(members) ? members : []).forEach((m) => {
    const id = m?.userId || m?.id || m?.user?.id;
    if (!id) return;
    add(id, m?.displayName || m?.name || m?.user?.name, m?.profilePic || m?.profile_pic || m?.user?.profilePic, {
      level: m?.level || 1,
      role: m?.isAdmin || m?.role === 'admin' ? 'Live admin' : m?.onSeat ? 'On seat' : 'In room',
      isAdmin: Boolean(m?.isAdmin || m?.role === 'admin'),
    });
  });
  (Array.isArray(seats) ? seats : []).forEach((s) => {
    const u = s?.user;
    if (!u) return;
    const id = u.id || u.userId;
    if (!id) return;
    add(id, u.name || u.displayName, u.profilePic || u.profile_pic || u.pic, {
      level: u.level || 22,
      role: 'On seat',
      isAdmin: false,
    });
  });
  if (user?.id && map.has(String(user.id))) {
    const nm = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || user.first_name;
    add(user.id, nm, user.profile_pic || user.profilePic, { level: 1 });
  }
  if (host?.id && map.has(String(host.id))) {
    add(host.id, host.name, host.pic, { level: 1, svip: 0, crown: true });
  }
  return Array.from(map.values());
}

/** @deprecated chat-derived lists accumulate leavers — use activeRoomPeople */
export function uniquePeople(chat, host, user) {
  return activeRoomPeople({ host, members: [], seats: [], user });
}

export function RoomFollowSheet({
  visible,
  onClose,
  hostName,
  hostPic,
  roomId,
  live,
  following,
  onFollow,
  onShare,
  onReport,
  onCopyId,
  onOpenProfile,
  members = [],
  tab = 'member',
  setTab,
}) {
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={0.62}>
      <View style={styles.roomSheet}>
        <View style={styles.roomSheetHead}>
          <Pressable onPress={onOpenProfile}>
            <Avatar uri={hostPic} name={hostName} size={56} style={styles.roomSheetAv} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.roomSheetName} numberOfLines={1}>{hostName || 'Party'}</Text>
              {live ? (
                <View style={styles.roomLiveBadge}>
                  <Ionicons name="videocam" size={10} color="#fff" />
                  <Text style={styles.roomLiveT}>Party</Text>
                </View>
              ) : null}
            </View>
            <Pressable onPress={onCopyId} style={styles.roomIdRow}>
              <Text style={styles.roomSheetId}>{roomId || 'ID —'}</Text>
              <Ionicons name="copy-outline" size={13} color="#9CA3AF" />
            </Pressable>
          </View>
          <Pressable onPress={onFollow} style={[styles.roomFollowBtn, following && styles.roomFollowBtnOn]}>
            <Text style={styles.roomFollowT}>{following ? 'Following' : '+ Follow'}</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.roomIcoBtn}>
            <Ionicons name="share-outline" size={16} color="#E5E7EB" />
          </Pressable>
          <Pressable onPress={onReport} style={styles.roomIcoBtn}>
            <Ionicons name="warning-outline" size={16} color="#E5E7EB" />
          </Pressable>
        </View>
        <View style={styles.roomTabs}>
          <Pressable onPress={() => setTab?.('profile')} style={styles.roomTab}>
            <Text style={[styles.roomTabT, tab === 'profile' && styles.roomTabOn]}>Profile</Text>
            {tab === 'profile' ? <View style={styles.roomTabLine} /> : null}
          </Pressable>
          <Pressable onPress={() => setTab?.('member')} style={styles.roomTab}>
            <Text style={[styles.roomTabT, tab === 'member' && styles.roomTabOn]}>Member</Text>
            {tab === 'member' ? <View style={styles.roomTabLine} /> : null}
          </Pressable>
        </View>
        {tab === 'profile' ? (
          <Text style={styles.roomProfileHint}>Follow this party room to see it in your list and get notified when it is live.</Text>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {(members || []).length ? members.map((m) => (
              <View key={m.id || m.userId} style={styles.roomMemRow}>
                <Avatar uri={mediaUrl(m.profilePic || m.pic)} name={m.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomMemName} numberOfLines={1}>{m.name}</Text>
                  <View style={styles.roomMemBadges}>
                    <View style={styles.roomLv}><Text style={styles.roomLvT}>Lv.{m.level || 1}</Text></View>
                  </View>
                </View>
              </View>
            )) : (
              <Text style={styles.roomEmpty}>No room followers yet. Be the first.</Text>
            )}
          </ScrollView>
        )}
      </View>
    </AnimatedSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  hostChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 22,
  },
  hostName: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hostId: { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  follow: { backgroundColor: LIVE_PINK, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  followT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  partyHead: { paddingHorizontal: 10, gap: 8 },
  partyHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyHostChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,6,18,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  partyHostName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  partyHeartRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  partyHeartN: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '700' },
  partyFollowPlus: { color: '#FF4D6D', fontWeight: '800', fontSize: 11 },
  partyHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyRoomId: { color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },
  partyViewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(8,6,18,0.5)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  partyViewerN: { color: '#fff', fontWeight: '800', fontSize: 12 },
  partyClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(8,6,18,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  partyMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(8,6,18,0.42)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  partyMetaT: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 10 },
  partyProgTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  partyProgFill: { height: 4, borderRadius: 2, backgroundColor: '#60A5FA' },
  partyBeam: { position: 'absolute', left: '18%', right: '18%', top: '22%', bottom: 80, borderRadius: 80 },
  partyMicMark: { position: 'absolute', alignSelf: 'center', top: '28%', opacity: 1 },
  partyFloor: { position: 'absolute', left: 0, right: 0, bottom: 120, height: 110 },
  partyFloorLine: { position: 'absolute', left: 24, right: 24, height: 1, backgroundColor: '#60A5FA' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  crown: { color: '#fbbf24', fontSize: 13 },
  viewerN: { color: '#fff', fontWeight: '800', fontSize: 12 },
  round: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  roundT: { color: '#fff', fontWeight: '800' },
  badgeRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginTop: 6 },
  goldBadge: { backgroundColor: 'rgba(251,191,36,0.9)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  goldBadgeT: { color: '#3d2e08', fontWeight: '800', fontSize: 10 },
  wishCol: { position: 'absolute', right: 10, top: 86, alignItems: 'flex-end', gap: 8 },
  wishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wishT: { color: '#fff', fontWeight: '700', fontSize: 11 },
  eventBan: { backgroundColor: '#6d28d9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 120 },
  eventT: { color: '#fde68a', fontWeight: '800', fontSize: 10 },
  gifterRail: { position: 'absolute', right: 12, bottom: 228, alignItems: 'center', gap: 10 },
  gifter: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 28, padding: 2 },
  gifterTalk: { borderColor: '#fbbf24', borderWidth: 3, shadowColor: '#fbbf24', shadowOpacity: 0.8, shadowRadius: 10, elevation: 8 },
  gifterMuted: { borderColor: '#F87171', opacity: 0.78 },
  gifterGold: { borderColor: '#fbbf24', borderWidth: 3, borderRadius: 32 },
  seatWrap: { flex: 1, paddingTop: 0, paddingHorizontal: 10, paddingBottom: 108, justifyContent: 'flex-start' },
  seatGrid3: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  seatCell: {
    width: '32%',
    aspectRatio: 0.92,
    marginBottom: '2%',
    borderRadius: 14,
    backgroundColor: 'rgba(40, 16, 72, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  seatCellPremium: {
    backgroundColor: 'rgba(12, 10, 28, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.18)',
    borderRadius: 16,
  },
  seatNum: {
    position: 'absolute',
    left: 8,
    top: 6,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    fontSize: 12,
    zIndex: 2,
  },
  seatNumPremium: { color: 'rgba(226,232,240,0.7)', fontSize: 11 },
  seatGiftBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
    flexDirection: 'row',
    gap: 2,
  },
  seatGiftT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  seatOcc: { alignItems: 'center', justifyContent: 'center' },
  seatVipEmpty: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  seatCrown: { fontSize: 30 },
  seatHostCrown: { position: 'absolute', top: 2, right: 8, zIndex: 4 },
  seatChairEmpty: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(124,58,237,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatChairEmoji: { fontSize: 28 },
  seatPlus: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatPlusT: { color: '#6d28d9', fontWeight: '900', fontSize: 16, marginTop: -1 },
  seatName: { color: '#fff', fontSize: 11, marginTop: 4, fontWeight: '700', maxWidth: '92%', textAlign: 'center' },
  seatNamePremium: { color: 'rgba(248,250,252,0.92)', fontSize: 10, letterSpacing: 0.2 },
  seatAvRing: {
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 1.5,
  },
  seatAvRingTalk: { borderColor: '#FBBF24', shadowColor: '#FBBF24', shadowOpacity: 0.7, shadowRadius: 8 },
  seatMicBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatVipEmptyPremium: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderColor: 'rgba(251,191,36,0.28)',
    borderRadius: 32,
    width: 56,
    height: 56,
  },
  seatChairEmptyPremium: {
    backgroundColor: 'rgba(76,29,149,0.28)',
    borderRadius: 32,
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.22)',
  },
  roomSheet: { backgroundColor: '#141628', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, flex: 1 },
  roomSheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  roomSheetAv: { borderRadius: 12 },
  roomSheetName: { color: '#fff', fontWeight: '800', fontSize: 16, maxWidth: 140 },
  roomLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EC4899',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roomLiveT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  roomIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  roomSheetId: { color: '#9CA3AF', fontWeight: '600', fontSize: 12 },
  roomFollowBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roomFollowBtnOn: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'transparent' },
  roomFollowT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  roomIcoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTabs: { flexDirection: 'row', gap: 22, marginTop: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  roomTab: { paddingBottom: 8 },
  roomTabT: { color: '#6B7280', fontWeight: '700', fontSize: 14 },
  roomTabOn: { color: '#fff' },
  roomTabLine: { height: 2, backgroundColor: '#fff', marginTop: 6, borderRadius: 1 },
  roomProfileHint: { color: '#9CA3AF', marginTop: 16, lineHeight: 20 },
  roomMemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  roomMemName: { color: '#fff', fontWeight: '700' },
  roomMemBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  roomLv: { backgroundColor: '#2563EB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  roomLvT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  roomEmpty: { color: '#6B7280', textAlign: 'center', marginTop: 28 },
  seatRowCenter: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 10 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  seatItem: { width: 72, alignItems: 'center' },
  seatRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  seatOnMic: { borderColor: '#22d3ee', borderWidth: 2 },
  seatSpeaking: { borderColor: '#fbbf24', borderWidth: 3, backgroundColor: 'rgba(251,191,36,0.16)' },
  seatMuted: { borderColor: '#F87171', borderWidth: 2, opacity: 0.78 },
  seatEmpty: { borderStyle: 'dashed', borderColor: 'rgba(168,85,247,0.7)', borderWidth: 2 },
  seatWave: { position: 'absolute', bottom: -6, alignSelf: 'center' },
  seatMuteBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatHost: { borderColor: '#fbbf24', borderWidth: 2, backgroundColor: 'rgba(251,191,36,0.15)' },
  seatGlow: { shadowColor: '#fbbf24', shadowOpacity: 0.8, shadowRadius: 10, elevation: 8 },
  seatPhoto: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.28)' },
  seatLabel: { color: '#fff', fontSize: 10, marginTop: 4, fontWeight: '600' },
  chair: { color: 'rgba(255,255,255,0.75)', fontSize: 22, fontWeight: '300' },
  chatCol: { paddingLeft: 10, paddingRight: 96, maxHeight: 280 },
  chatSwipeHint: { position: 'absolute', left: 0, top: 40, bottom: 40, width: 28, justifyContent: 'center' },
  chatEdge: { width: 4, height: 56, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', marginLeft: 6 },
  pinBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,85,247,0.55)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  pinT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  joinBan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: LIVE_PINK,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  joinT: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 12 },
  joinBtn: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  joinBtnT: { color: LIVE_PINK, fontWeight: '800', fontSize: 12 },
  announce: { color: '#fff', fontSize: 12, marginBottom: 6 },
  announceH: { color: '#fbbf24', fontWeight: '800' },
  chat: { maxHeight: 200 },
  chatLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5, maxWidth: '92%' },
  sysLine: { backgroundColor: 'rgba(0,0,0,0.35)', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  sysDot: { color: '#c084fc', fontWeight: '800', fontSize: 11, marginRight: 4 },
  chatUser: { color: '#fbbf24', fontWeight: '700' },
  chatMsg: { color: '#fff', flex: 1, flexWrap: 'wrap' },
  chatImgWrap: { marginTop: 6, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  chatImg: { width: 120, height: 120, backgroundColor: '#111' },
  showChat: { alignSelf: 'flex-start', marginLeft: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  hideBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 },
  hideT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  giftPillWrap: { alignSelf: 'flex-start', marginLeft: 12, marginBottom: 8 },
  giftPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  giftPillT: { color: '#fff', fontWeight: '800' },
  guestRail: { position: 'absolute', right: 8, top: '22%', gap: 8, zIndex: 20 },
  guestTile: {
    width: 78,
    height: 118,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  guestShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36 },
  guestEq: { position: 'absolute', top: 6, right: 5 },
  guestName: { position: 'absolute', left: 4, right: 4, bottom: 4, color: '#fff', fontSize: 10, fontWeight: '800' },
  quickRow: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 8, paddingRight: 6, marginBottom: 4 },
  quickScroll: { alignItems: 'flex-end', gap: 10, paddingVertical: 4, paddingRight: 8 },
  quickItem: { alignItems: 'center', width: 52 },
  quickPrice: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  quickCoin: { color: '#F5D76E', fontSize: 8 },
  quickN: { color: '#fff', fontWeight: '800', fontSize: 11 },
  quickFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginBottom: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 6 },
  barLeft: { flexDirection: 'row', gap: 8 },
  barRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  barIco: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  barGlyph: { fontSize: 16, color: '#fff' },
  giftHero: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#a855f7', alignItems: 'center', justifyContent: 'center' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  emojiSheet: { backgroundColor: SHEET, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, minHeight: 280 },
  tabRow: { flexDirection: 'row', gap: 18, marginBottom: 12 },
  tabBtn: { paddingBottom: 6 },
  tabT: { color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
  tabOn: { color: '#fff' },
  tabLine: { height: 3, backgroundColor: '#fff', borderRadius: 2, marginTop: 6, width: 28 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiCell: { width: '16.6%', alignItems: 'center', paddingVertical: 10 },
  svipGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  svipCell: { width: '25%', alignItems: 'center', marginBottom: 12 },
  svipFace: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  svipFaceE: { position: 'absolute', bottom: 2, right: 4, fontSize: 14 },
  svipL: { color: '#fff', fontSize: 11, marginTop: 4 },
  gameSheet: { backgroundColor: '#2e1064', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '78%', paddingBottom: 16 },
  gameBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  gameTitle: { color: '#fde68a', fontWeight: '900', fontSize: 22, letterSpacing: 1 },
  gameSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  gemPile: { height: 18, backgroundColor: '#c084fc', opacity: 0.55 },
  curBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  curPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e1b4b', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  plus: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#38bdf8', alignItems: 'center', justifyContent: 'center' },
  plusT: { color: '#fff', fontWeight: '900' },
  gameGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 20 },
  gameCell: { width: '25%', alignItems: 'center', marginBottom: 14 },
  gameIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#4c1d95',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,181,253,0.4)',
  },
  newTag: { position: 'absolute', top: 0, right: 0, backgroundColor: '#22c55e', borderRadius: 6, paddingHorizontal: 4, zIndex: 1 },
  newT: { color: '#fff', fontSize: 8, fontWeight: '800' },
  gameName: { color: '#fff', fontSize: 10, marginTop: 4, textAlign: 'center' },
  peopleSheet: { backgroundColor: SHEET, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, maxHeight: '78%' },
  joinedModBar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  joinedModBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  joinedModDanger: { backgroundColor: 'rgba(248,113,113,0.15)' },
  joinedModT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  joinedSub: { color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 12, marginBottom: 8, marginTop: 4 },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: SHEET,
  },
  giftStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  giftStatName: { color: '#E5E7EB', fontWeight: '700', flex: 1 },
  giftStatN: { color: '#F5D76E', fontWeight: '800', fontSize: 12 },
  giftHistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  giftHistT: { color: '#D1D5DB', flex: 1, fontSize: 13 },
  metaLine: { color: '#fff', marginBottom: 8, fontWeight: '600' },
  metaMuted: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  userName: { color: '#fff', fontWeight: '700' },
  badgeLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  lv: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  lvT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  svip: { backgroundColor: '#7c3aed', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  svipT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  periodRow: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 999, alignSelf: 'flex-start', marginBottom: 8 },
  period: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  periodOn: { backgroundColor: '#e5e7eb' },
  periodT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  periodTOn: { color: '#111827' },
  metaSplit: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  topCard: { backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: 'rgba(251,191,36,0.45)', flexWrap: 'wrap' },
  topTag: { position: 'absolute', top: 0, left: 12, backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, zIndex: 1 },
  topTagT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  rankN: { width: 22, color: '#d1d5db', fontWeight: '800' },
  score: { color: '#fb7185', fontWeight: '800' },
  applySheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '48%' },
  applyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  applyTitle: { color: LIVE_PINK, fontWeight: '800', fontSize: 16 },
  applyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  applyIdx: { width: 18, color: '#6b7280', fontWeight: '800' },
  applyName: { color: '#111827', fontWeight: '700' },
  cancelApply: { backgroundColor: LIVE_PINK, borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelApplyT: { color: '#fff', fontWeight: '800' },
  centerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  modWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modMenu: { width: '100%', backgroundColor: '#1B1D26', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 18, paddingTop: 8 },
  modName: { color: '#fff', fontWeight: '800', textAlign: 'center', paddingVertical: 10, fontSize: 16 },
  modRow: { paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  modT: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  modCancel: { marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modCancelT: { color: '#9CA3AF', fontWeight: '800' },
  tipsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, width: '82%' },
  tipsH: { fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 10 },
  tipsB: { color: '#374151', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  tipsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  agree: { color: LIVE_PINK, fontWeight: '800' },
  cancel: { color: '#9ca3af', fontWeight: '700' },
  profileSheet: { backgroundColor: SHEET, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '62%' },
  profTop: { flexDirection: 'row', justifyContent: 'space-between' },
  profActs: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  followOutline: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  followOutlineT: { color: '#fff', fontWeight: '700' },
  profIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  profName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  liveTag: { backgroundColor: LIVE_PINK, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  liveTagT: { color: '#fff', fontWeight: '800', fontSize: 10 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  fabY: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#facc15', alignItems: 'center', justifyContent: 'center' },
  fabP: { width: 42, height: 42, borderRadius: 21, backgroundColor: LIVE_PINK, alignItems: 'center', justifyContent: 'center' },
  announceBody: { color: '#fff', marginTop: 6, lineHeight: 20 },
  lpSheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16 },
  lpHero: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 14 },
  lpAvatarWrap: { position: 'relative', width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#a855f7', backgroundColor: '#f3e8ff', overflow: 'visible' },
  lpAdminTag: { position: 'absolute', top: 0, right: -6, backgroundColor: '#f59e0b', color: '#422006', fontSize: 9, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  lpHead: { flex: 1, minWidth: 0, paddingTop: 4 },
  lpName: { color: '#111', fontWeight: '800', fontSize: 17, flexShrink: 1 },
  lpLive: { backgroundColor: LIVE_PINK, color: '#fff', fontWeight: '800', fontSize: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  lpBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  lpLv: { backgroundColor: '#dbeafe', color: '#1e3a8a', fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  lpVip: { backgroundColor: '#fce7f3', color: '#9d174d', fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  lpSvip: { backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  lpMod: { backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: '800', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  lpRole: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  lpRoleT: { fontWeight: '800', fontSize: 10 },
  lpIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  lpId: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  lpStats: { flexDirection: 'row', gap: 18, marginTop: 10 },
  lpStatN: { color: '#111', fontWeight: '800', fontSize: 16 },
  lpStatL: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  lpCard: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 12, marginBottom: 12 },
  lpCardH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lpCardT: { color: '#374151', fontWeight: '800', fontSize: 12 },
  lpSection: { marginBottom: 12 },
  lpSecT: { color: '#111', fontWeight: '800', fontSize: 13 },
  lpMuted: { color: '#9ca3af', fontWeight: '600', fontSize: 11 },
  lpRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  lpDash: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#d1d5db', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  lpHex: { width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: '#d1d5db', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  lpPlus: { color: '#d1d5db', fontSize: 18, fontWeight: '700' },
  lpGiftBtn: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  lpGiftT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  lpActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  lpAct: { width: '31%', minHeight: 64, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  lpActPrimary: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  lpActT: { color: '#111827', fontSize: 11, fontWeight: '700' },
  whiteMenu: { backgroundColor: '#fff', borderRadius: 14, minWidth: 180, overflow: 'hidden' },
  menuItem: { paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  menuT: { color: '#111827', fontSize: 15 },
  toolsSheet: {
    backgroundColor: 'rgba(14,14,18,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    paddingBottom: 22,
  },
  toolsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  toolsHeadT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  toolsClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsH: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 10,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  toolCell: { width: '25%', alignItems: 'center', marginBottom: 14, paddingHorizontal: 2 },
  toolIco: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolL: {
    color: '#fff',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  pkMark: { flexDirection: 'row', overflow: 'hidden', borderRadius: 4 },
  pkMarkP: { backgroundColor: '#3B82F6', color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 4, paddingVertical: 1 },
  pkMarkK: { backgroundColor: '#EC4899', color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 4, paddingVertical: 1 },
  giftLine: { backgroundColor: 'rgba(232,144,32,0.14)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4 },
  giftMsg: { color: '#FDE68A', fontWeight: '700' },
  toolOutline: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOnBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  toolOnBadgeT: { color: '#fff', fontWeight: '800', fontSize: 8 },
  inviteCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '84%' },
  inviteMsg: { color: '#111827', fontWeight: '700', fontSize: 16, textAlign: 'center', marginBottom: 18 },
  inviteBtns: { flexDirection: 'row', gap: 12 },
  inviteRefuse: { flex: 1, backgroundColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  inviteRefuseT: { color: '#374151', fontWeight: '800' },
  inviteAccept: { flex: 1, backgroundColor: '#F97316', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  inviteAcceptT: { color: '#fff', fontWeight: '800' },
  modMenuLight: { backgroundColor: '#fff' },
  modNameLight: { color: '#22D3EE', fontWeight: '800' },
  modRowLight: { borderTopColor: '#E5E7EB' },
  modTLight: { color: '#111827' },
  modCancelLight: { backgroundColor: '#F3F4F6' },
});
