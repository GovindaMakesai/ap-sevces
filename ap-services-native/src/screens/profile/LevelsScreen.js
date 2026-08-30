import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Loading } from '../../components/ui';
import { mediaUrl } from '../../config/api';
import {
  LOCKED_MILESTONES,
  LIVESTREAM_THRESHOLDS,
  WEALTH_THRESHOLDS,
  fmtNum,
  levelFromPoints,
  livestreamBadgeColors,
  lockedBenefitRows,
  myBenefits,
  tableRows,
  wealthBadgeColors,
} from '../../data/levelDesign';

function LevelBadge({ level, kind }) {
  const colors = kind === 'wealth' ? wealthBadgeColors(level) : livestreamBadgeColors(level);
  return (
    <LinearGradient colors={colors} style={styles.lvBadge}>
      <Text style={styles.lvBadgeT}>{level}</Text>
    </LinearGradient>
  );
}

function HelpModal({ visible, kind, onClose }) {
  const rows = useMemo(() => tableRows(kind), [kind]);
  const title = kind === 'wealth' ? 'Upgrade Coin Cost' : 'Points Required to Upgrade';
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.helpOverlay}>
        <View style={styles.helpSheet}>
          <View style={styles.helpHead}>
            <Text style={styles.helpTitle}>{kind === 'wealth' ? 'Wealth Level' : 'Livestream Level'}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#fff" /></Pressable>
          </View>
          <View style={styles.helpCols}>
            <Text style={styles.helpColH}>Level</Text>
            <Text style={[styles.helpColH, { textAlign: 'right', flex: 1 }]}>{title}</Text>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.level)}
            style={{ flex: 1 }}
            initialNumToRender={24}
            maxToRenderPerBatch={32}
            windowSize={8}
            renderItem={({ item }) => (
              <View style={styles.helpRow}>
                <LevelBadge level={item.level} kind={kind} />
                <Text style={styles.helpCost}>{fmtNum(item.cost)}</Text>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function LevelsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [tab, setTab] = useState('wealth');
  const [data, setData] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        api.get('/cp/levels/personal').catch(() => ({})),
        api.get('/cp/levels/room').catch(() => ({})),
      ]).then(([p, r]) => setData({ personal: api.unwrap(p), room: api.unwrap(r) }));
    }, [api])
  );

  const wealthCoins = useMemo(() => {
    const exp = Number(data?.personal?.exp || 0);
    return Math.max(0, Math.floor(exp * 25));
  }, [data]);

  const livePoints = useMemo(() => {
    const exp = Number(data?.room?.exp || 0);
    return Math.max(0, Math.floor(exp * 10));
  }, [data]);

  const wealth = useMemo(() => levelFromPoints(wealthCoins, WEALTH_THRESHOLDS), [wealthCoins]);
  const live = useMemo(() => levelFromPoints(livePoints, LIVESTREAM_THRESHOLDS), [livePoints]);
  const active = tab === 'wealth' ? wealth : live;
  const kind = tab;

  if (!data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Loading label="Loading levels…" />
      </View>
    );
  }

  const benefits = myBenefits(active.level, kind);
  const heroColors = kind === 'wealth' ? ['#4C0519', '#831843', '#500724'] : ['#312E81', '#4338CA', '#1E1B4B'];
  const ways = kind === 'wealth'
    ? [
        { label: 'Send gifts (coins spent)', value: fmtNum(wealthCoins) },
        { label: 'Recharge & spend coins', value: 'Boost wealth level' },
        { label: 'Buy store items', value: 'Adds wealth EXP' },
      ]
    : [
        { label: 'Go live & host rooms', value: fmtNum(livePoints) },
        { label: 'Receive gifts on live', value: 'Adds livestream EXP' },
        { label: 'Stay on mic in party', value: 'Daily EXP' },
      ];

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2E0A1F', '#1A0A14']} style={StyleSheet.absoluteFill} />
      <View style={[styles.head, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.tabs}>
          <Pressable onPress={() => setTab('wealth')} style={styles.tabBtn}>
            <Text style={[styles.tabT, tab === 'wealth' && styles.tabOn]}>Wealth Level</Text>
            {tab === 'wealth' ? <View style={styles.tabLine} /> : null}
          </Pressable>
          <Pressable onPress={() => setTab('livestream')} style={styles.tabBtn}>
            <Text style={[styles.tabT, tab === 'livestream' && styles.tabOn]}>Livestream Level</Text>
            {tab === 'livestream' ? <View style={styles.tabLine} /> : null}
          </Pressable>
        </View>
        <Pressable onPress={() => setHelpOpen(true)} style={styles.iconBtn}>
          <Ionicons name="help-circle-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <LinearGradient colors={heroColors} style={styles.hero}>
          <View style={styles.heroAvatarWrap}>
            <Avatar uri={mediaUrl(user?.profile_pic)} name={displayName} size={64} />
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeT}>Lv.{active.level}</Text>
            </View>
          </View>
          <Text style={styles.heroName} numberOfLines={1}>{displayName || 'You'}</Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLv}>Lv.{active.level}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${active.pct}%` }]} />
              </View>
              <Text style={styles.heroPts}>{fmtNum(active.points)}</Text>
              <Text style={styles.heroRem}>Remaining progress to upgrade: {fmtNum(active.remaining)}</Text>
            </View>
            <View style={styles.heroMedal}>
              <LinearGradient
                colors={kind === 'wealth' ? wealthBadgeColors(active.level) : livestreamBadgeColors(active.level)}
                style={styles.heroMedalInner}
              >
                <Ionicons name={kind === 'wealth' ? 'diamond' : 'mic'} size={34} color="#fff" />
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>

        <Text style={styles.sectionH}>My Benefits</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benefitRail}>
          {benefits.map((b) => (
            <View key={b.level} style={styles.benefitCard}>
              <Text style={styles.benefitIco}>{b.icon}</Text>
              <Text style={styles.benefitT}>{b.title}</Text>
              <Text style={styles.benefitLink}>{b.subtitle}</Text>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.sectionH}>Ways to level up</Text>
        <View style={styles.waysCard}>
          {ways.map((row) => (
            <View key={row.label} style={styles.wayRow}>
              <Text style={styles.wayLabel}>{row.label}</Text>
              <Text style={styles.wayVal}>{row.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionH}>Locked Benefits</Text>
        {LOCKED_MILESTONES.map((milestone) => {
          const locked = active.level < milestone;
          return (
            <View key={milestone} style={styles.lockBlock}>
              <View style={styles.lockHead}>
                <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={14} color="#F9A8D4" />
                <Text style={styles.lockLv}>Lv.{milestone}</Text>
              </View>
              {lockedBenefitRows(milestone, kind).map((row) => (
                <View key={row.title} style={styles.lockRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lockTitle}>{row.title}</Text>
                    <Text style={styles.lockSub}>{row.sub}</Text>
                  </View>
                  <View style={styles.lockIco}><Text>{row.icon}</Text></View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <HelpModal visible={helpOpen} kind={kind} onClose={() => setHelpOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#140810' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 18 },
  tabBtn: { alignItems: 'center', paddingVertical: 6 },
  tabT: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 15 },
  tabOn: { color: '#fff' },
  tabLine: { marginTop: 6, width: 28, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  hero: { margin: 14, borderRadius: 18, padding: 16 },
  heroAvatarWrap: { alignSelf: 'center', marginBottom: 8 },
  heroBadge: {
    position: 'absolute',
    right: -8,
    bottom: -4,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    transform: [{ rotate: '-8deg' }],
  },
  heroBadgeT: { color: '#fff', fontWeight: '900', fontSize: 12 },
  heroName: { color: '#fff', textAlign: 'center', fontWeight: '800', fontSize: 15, marginBottom: 10 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroLv: { color: '#fff', fontSize: 34, fontWeight: '900' },
  barTrack: { height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 6, backgroundColor: '#F472B6' },
  heroPts: { color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13 },
  heroRem: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  heroMedal: { width: 88, height: 88, borderRadius: 20, overflow: 'hidden' },
  heroMedalInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionH: { color: '#fff', fontWeight: '800', fontSize: 16, marginHorizontal: 16, marginTop: 8, marginBottom: 10 },
  benefitRail: { paddingHorizontal: 14, gap: 10 },
  benefitCard: {
    width: 132,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  benefitIco: { fontSize: 28 },
  benefitT: { color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13 },
  benefitLink: { color: '#FDE68A', fontSize: 11, marginTop: 6, fontWeight: '700' },
  waysCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  wayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  wayLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1, paddingRight: 8 },
  wayVal: { color: '#FDE68A', fontWeight: '800', fontSize: 12 },
  lockBlock: { marginHorizontal: 14, marginBottom: 14 },
  lockHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  lockLv: { color: '#F9A8D4', fontWeight: '800', fontSize: 14 },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  lockTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  lockSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 },
  lockIco: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lvBadge: { minWidth: 42, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  lvBadgeT: { color: '#fff', fontWeight: '900', fontSize: 12 },
  helpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  helpSheet: {
    height: '88%',
    backgroundColor: '#1A1028',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
  },
  helpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  helpTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  helpCols: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8 },
  helpColH: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 12, width: 72 },
  helpRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  helpCost: { flex: 1, textAlign: 'right', color: '#fff', fontWeight: '700', fontSize: 13 },
});
