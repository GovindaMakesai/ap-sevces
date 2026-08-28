import React, { memo, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { mediaUrl } from '../config/api';
import { PressScale } from './motion';
import { Equalizer, uniqueFaces, ViewerStack } from './alive';
import SoftImage from './SoftImage';

const CARD_W = Math.floor((Dimensions.get('window').width - 28) / 2);
const CARD_H = Math.round(CARD_W * 1.38);

function formatViewers(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

function categoryOf(room) {
  if (room.isParty || room.type === 'party') return 'Party';
  const t = String(room.category || room.tag || room.topic || '').toLowerCase();
  if (t.includes('music')) return 'Music';
  if (t.includes('friend')) return 'Make Friends';
  if (t.includes('game')) return 'Games';
  return 'Chatting';
}

function RoomCard({ room, onPress }) {
  const cover = mediaUrl(room?.hostStreamCover || room?.hostProfilePic);
  const isParty = Boolean(room?.isParty || room?.type === 'party');
  const name = room?.hostName || 'Host';
  const pk = Boolean(room?.pk || room?.inPk || room?.pkBattle);
  const hourly = Boolean(room?.hourlyTop || room?.topHourly);
  const faces = useMemo(
    () =>
      uniqueFaces([
        { pic: room?.hostProfilePic, name, id: room?.hostId },
        ...(room?.previewPics || room?.speakerPics || room?.seatPics || []).slice(0, 4).map((p, i) =>
          typeof p === 'object'
            ? { pic: p.profilePic || p.profile_pic || p.pic, name: p.name || p.displayName, id: p.id || p.userId }
            : { pic: p, name: '', id: `p-${i}` }
        ),
      ]),
    [room?.hostProfilePic, room?.hostId, room?.previewPics, room?.speakerPics, room?.seatPics, name]
  );

  return (
    <PressScale onPress={onPress} style={styles.wrap} scaleTo={0.98}>
      <View style={styles.card}>
        {cover ? (
          <SoftImage uri={cover} style={styles.cover} recyclingKey={room?.channel} />
        ) : (
          <LinearGradient colors={isParty ? ['#4C1D95', '#1E1B4B'] : ['#7C2D12', '#1C1917']} style={styles.cover} />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={styles.shade} />
        {hourly ? (
          <View style={styles.hourly}>
            <Text style={styles.hourlyT}>🔥 TOP10 Hourly</Text>
          </View>
        ) : null}
        <View style={styles.typeBadge}>
          <Text style={styles.badgeText}>{categoryOf(room)}</Text>
        </View>
        <View style={styles.bottom}>
          <View style={styles.bottomRow}>
            <ViewerStack people={faces} count={room.viewers} size={20} />
            <View style={styles.stats}>
              {pk ? (
                <LinearGradient colors={['#F59E0B', '#DC2626']} style={styles.pk}>
                  <Text style={styles.pkT}>PK</Text>
                </LinearGradient>
              ) : null}
              <Equalizer size={12} animated={false} />
              <Text style={styles.viewers}>{formatViewers(room.viewers)}</Text>
            </View>
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.flag}>🇮🇳</Text>
          </View>
        </View>
        {isParty ? <View style={styles.partyDot} /> : null}
      </View>
    </PressScale>
  );
}

export default memo(RoomCard, (a, b) => {
  const ra = a.room || {};
  const rb = b.room || {};
  return (
    ra.channel === rb.channel &&
    ra.viewers === rb.viewers &&
    ra.hostStreamCover === rb.hostStreamCover &&
    ra.hostProfilePic === rb.hostProfilePic &&
    ra.hostName === rb.hostName &&
    ra.pk === rb.pk &&
    a.onPress === b.onPress
  );
});

const styles = StyleSheet.create({
  wrap: { width: CARD_W, marginBottom: 8 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
  },
  cover: { ...StyleSheet.absoluteFillObject, width: CARD_W, height: CARD_H },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(20,20,20,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  hourly: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#F472B6',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  hourlyT: { color: '#fff', fontSize: 9, fontWeight: '800' },
  bottom: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  name: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  flag: { fontSize: 11 },
  stats: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  viewers: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pk: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  pkT: { color: '#fff', fontSize: 9, fontWeight: '900' },
  partyDot: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
});
