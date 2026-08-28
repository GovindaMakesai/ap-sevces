import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner } from '../../components/ui';
import AvatarFrame from '../../components/AvatarFrame';
import CoupleRing from '../../components/CoupleRing';
import { CreamMenuRow } from '../../components/creamChrome';
import { compactM } from '../../lib/format.js';
import { parseCpBond } from '../../lib/cpBond';
import {
  formatUserDisplayId,
  hasAdminCap,
  hideRoleApply,
  hierarchyKeys,
  isAgency,
  isBd,
  isCoinSeller,
  isHost,
  isPlatformAdmin,
  isSuperAdmin,
  isWorker,
  ROLE_BADGE,
} from '../../lib/roles';

function MenuSec({ title }) {
  return <Text style={styles.sec}>{title}</Text>;
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { api, user, displayName, logout } = useAuth();
  const [stats, setStats] = useState({ following: 0, followers: 0, level: 1 });
  const [wallet, setWallet] = useState({ coins: 0, points: 0, giftCoins: 0 });
  const [svip, setSvip] = useState({ level: 0 });
  const [cp, setCp] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const admin = isPlatformAdmin(user);
  const seller = isCoinSeller(user);
  const host = isHost(user) || admin || isAgency(user);
  const agency = isAgency(user) || admin;
  const bd = isBd(user) || admin;
  const worker = isWorker(user);
  const publicId = formatUserDisplayId(user);
  const roles = hierarchyKeys(user);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, w, panel, sv, cpHome] = await Promise.all([
        api.get(`/social/stats/${user.id}`, null, { auth: false }).catch(() => ({})),
        api.get('/wallet/balance').catch(() => ({})),
        api.get(`/social/creators/${user.id}/profile-panel`, null, { auth: false }).catch(() => ({})),
        api.get('/svip/home').catch(() => ({})),
        api.get('/cp/home').catch(() => ({})),
      ]);
      const sd = api.unwrap(s);
      const wd = api.unwrap(w);
      const pd = api.unwrap(panel);
      const svd = api.unwrap(sv);
      const cpd = api.unwrap(cpHome);
      setStats({
        following: Number(sd.following || sd.followingCount || 0),
        followers: Number(sd.followers || sd.followerCount || 0),
        level: Number(pd.level || sd.level || user?.level || 1),
      });
      setWallet({
        coins: Number(wd.coin_balance || wd.coins || wd.diamonds || 0),
        points: Number(wd.points || wd.point_balance || wd.beans || 0),
        giftCoins: Number(wd.gift_coins || wd.giftCoins || wd.giftable_coins || 0),
      });
      setSvip({ level: Number(svd.level || svd.svipLevel || pd.badges?.svipLevel || 0) });
      setCp(cpd || {});
    } catch (e) {
      setError(e.message);
    }
  }, [api, user?.id, user?.level]);

  useFocusEffect(
    useCallback(() => {
      const fresh = Date.now() - (ProfileScreen._lastLoad || 0) < 30000;
      if (!fresh) {
        load();
        ProfileScreen._lastLoad = Date.now();
      }
    }, [load])
  );

  const copyId = () => Share.share({ message: String(publicId || '') }).catch(() => Alert.alert('ID', publicId || '—'));
  const pic = mediaUrl(user?.profile_pic || user?.profilePic);
  const bond = parseCpBond(cp);
  const partnerName = bond.hasCp ? bond.partnerName : 'Add';
  const together = bond.days;
  const cpLevel = bond.level;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 36 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <ErrorBanner message={error} onRetry={load} />
      <View style={[styles.meHead, { paddingTop: insets.top + 10 }]}>
        <View style={styles.meTop}>
          <Text style={styles.onlineLite}>● Online</Text>
          <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.editIco}>
            <Ionicons name="pencil" size={16} color="#8B6D3B" />
          </Pressable>
        </View>
        <View style={styles.meRow}>
          <Pressable onPress={() => navigation.navigate('CreatorProfile', { userId: user?.id, name: displayName })}>
            <AvatarFrame uri={pic} name={displayName} size={72} score={Number(stats.coins || stats.level * 8000 || 12000)} rank={svip.level >= 10 ? 1 : svip.level >= 4 ? 2 : 3} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.meName}>{displayName}</Text>
            <Pressable onPress={copyId} style={styles.idLine}>
              <Text style={styles.idLite}>ID:{publicId || '—'}</Text>
              <Ionicons name="copy-outline" size={14} color="#8B6D3B" />
            </Pressable>
            <View style={styles.pills}>
              {roles.map((k) => {
                const b = ROLE_BADGE[k];
                if (!b) return null;
                return (
                  <Text key={k} style={[styles.rolePill, { backgroundColor: b.bg[1], color: b.color }]}>
                    {b.label}
                  </Text>
                );
              })}
              <Text style={styles.pillB}>Lv.{stats.level}</Text>
              {svip.level ? <Text style={styles.pillC}>SVIP {svip.level}</Text> : null}
              <Text style={styles.flag}>🇮🇳</Text>
            </View>
          </View>
        </View>
      </View>

      {!bond.hasCp ? (
      <Pressable onPress={() => navigation.navigate('Cp')} style={styles.cpInvite}>
        <Text style={styles.cpInviteT}>Find your CP and show your ring on your profile</Text>
        <LinearGradient colors={['#F472B6', '#DB2777']} style={styles.cpInviteBtn}>
          <Ionicons name="heart" size={14} color="#fff" />
          <Text style={styles.cpInviteBtnT}>Open CP House</Text>
        </LinearGradient>
      </Pressable>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Cp')} style={styles.cpCard}>
        <LinearGradient colors={['#4A1A6B', '#7B2B8E', '#C2186A']} style={styles.cpGrad}>
          <View style={styles.cpTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="heart" size={14} color="#F9A8D4" />
              <Text style={styles.cpLabel}>{bond.hasCp ? 'My CP' : 'CP'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={() => navigation.navigate('Cp')}><Text style={styles.cpLink}>CP House ›</Text></Pressable>
              <Pressable onPress={() => navigation.navigate('CpRankings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="trophy" size={12} color="#F5D76E" />
                <Text style={styles.cpLink}>Rankings</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.cpPair}>
            <View style={styles.cpSlot}>
              {pic ? <Image source={{ uri: pic }} style={styles.cpAv} /> : <Avatar name={displayName} size={58} />}
              <Text style={styles.cpName} numberOfLines={1}>{displayName}</Text>
            </View>
            <View style={styles.cpMid}>
              <CoupleRing ringId={bond.ringId} ring={bond.ring} size={48} />
              <View style={styles.cpNum}><Text style={styles.cpNumT}>{cpLevel}</Text></View>
            </View>
            <Pressable
              style={styles.cpSlot}
              onPress={() => bond.partnerId && navigation.navigate('CreatorProfile', { userId: bond.partnerId, name: partnerName })}
            >
              {bond.hasCp ? (
                <Avatar uri={mediaUrl(bond.partnerPic)} name={partnerName} size={58} />
              ) : (
                <View style={styles.cpEmpty}><Ionicons name="person" size={28} color="#F9A8D4" /></View>
              )}
              <Text style={styles.cpName} numberOfLines={1}>{bond.hasCp ? partnerName : 'Add'}</Text>
            </Pressable>
          </View>
          <Text style={styles.together}>
            {bond.hasCp ? `Together ${together} day${together === 1 ? '' : 's'}` : 'Invite someone to be your CP'}
          </Text>
        </LinearGradient>
      </Pressable>

      <Pressable onPress={copyId} style={styles.idPill}>
        {admin ? <Text style={styles.idAdmin}>ADMIN</Text> : null}
        <Text style={styles.idNum}>{publicId || '—'}</Text>
        <Ionicons name="copy-outline" size={16} color="#8B6D3B" />
      </Pressable>

      <View style={styles.statRow}>
        <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'following', userId: user?.id })} style={styles.statBox}>
          <Text style={styles.statN}>{stats.following}</Text>
          <Text style={styles.statL}>Following</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'followers', userId: user?.id })} style={styles.statBox}>
          <Text style={styles.statN}>{stats.followers}</Text>
          <Text style={styles.statL}>Followers</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Rankings')} style={styles.rankBadge}>
          <Text style={styles.rankT}>AP</Text>
        </Pressable>
      </View>

      <View style={styles.duo}>
        <Pressable onPress={() => navigation.navigate('Supporters')} style={[styles.duoCard, { backgroundColor: '#EDE9FE' }]}>
          <Text style={styles.duoT}>Contribution List</Text>
          <Text style={{ fontSize: 18 }}>🏆</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Family', { userId: user?.id, name: displayName })} style={[styles.duoCard, { backgroundColor: '#FFEDD5' }]}>
          <Text style={styles.duoT}>Fan Club</Text>
          <Ionicons name="heart" size={18} color="#E11D48" />
        </Pressable>
      </View>

      <View style={styles.moneyRow}>
        <Pressable onPress={() => navigation.navigate('Wallet')} style={[styles.moneyBox, { backgroundColor: '#FFF4CC' }]}>
          <Text style={[styles.moneyN, { color: '#C9A227' }]}>{compactM(wallet.coins)}</Text>
          <Text style={styles.moneyL}>COINS</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Points')} style={[styles.moneyBox, { backgroundColor: '#FDE8F0' }]}>
          <Text style={[styles.moneyN, { color: '#5D4037' }]}>{compactM(wallet.points)}</Text>
          <Text style={styles.moneyL}>POINTS</Text>
        </Pressable>
        {seller || admin ? (
          <Pressable onPress={() => navigation.navigate('CoinSeller')} style={[styles.moneyBox, { backgroundColor: '#FDDDE4' }]}>
            <Text style={[styles.moneyN, { color: '#C2185B' }]}>{compactM(wallet.giftCoins)}</Text>
            <Text style={styles.moneyL}>GIFT COINS</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.ctaRow}>
        <Pressable onPress={() => navigation.navigate('Recharge')} style={{ flex: 1 }}>
          <LinearGradient colors={['#FFB347', '#FF8C00']} style={styles.cta}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.ctaT}>Top Up</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Withdraw')} style={{ flex: 1 }}>
          <LinearGradient colors={['#F472B6', '#DB2777']} style={styles.cta}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.ctaT}>Withdraw / Exchange</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {host ? (
        <View style={styles.hostCtas}>
          <Pressable onPress={() => navigation.navigate('GoLive', { isParty: false })} style={{ flex: 1 }}>
            <LinearGradient colors={['#FFB347', '#FF6B00']} style={styles.cta}>
              <Ionicons name="radio" size={16} color="#fff" />
              <Text style={styles.ctaT}>Go Live</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('GoLive', { isParty: true })} style={{ flex: 1 }}>
            <LinearGradient colors={['#A78BFA', '#7C3AED']} style={styles.cta}>
              <Ionicons name="people" size={16} color="#fff" />
              <Text style={styles.ctaT}>Start Party</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      {admin ? (
        <View>
          <MenuSec title={isSuperAdmin(user) ? 'Super Admin' : 'Admin'} />
          <CreamMenuRow
            icon="shield-checkmark-outline"
            title={isSuperAdmin(user) ? 'Control Center' : 'Admin Desk'}
            subtitle={isSuperAdmin(user) ? 'Full platform control' : 'Payments, withdrawals & Agora'}
            onPress={() => navigation.navigate('AdminDashboard')}
          />
          {hasAdminCap(user, 'payments') ? (
            <CreamMenuRow icon="card-outline" title="Payment approvals" subtitle="Approve coin top-ups" onPress={() => navigation.navigate('AdminDashboard', { section: 'recharges' })} />
          ) : null}
          {hasAdminCap(user, 'withdrawals') ? (
            <CreamMenuRow icon="cash-outline" title="Withdrawals" subtitle="Approve cash-outs" onPress={() => navigation.navigate('AdminDashboard', { section: 'withdrawals' })} />
          ) : null}
          {hasAdminCap(user, 'agora') ? (
            <CreamMenuRow icon="videocam-outline" title="Agora & live tools" subtitle="Live streaming credentials" onPress={() => navigation.navigate('AdminDashboard', { section: 'platform' })} />
          ) : null}
          {hasAdminCap(user, 'users') ? (
            <CreamMenuRow icon="people-outline" title="Users" subtitle="Profiles, ban, wallet" onPress={() => navigation.navigate('AdminDashboard', { section: 'users' })} />
          ) : null}
          {hasAdminCap(user, 'applications') ? (
            <CreamMenuRow icon="person-add-outline" title="Role applications" onPress={() => navigation.navigate('AdminDashboard', { section: 'role-applications' })} />
          ) : null}
          {hasAdminCap(user, 'network') ? (
            <CreamMenuRow icon="git-network-outline" title="BD & hierarchy" onPress={() => navigation.navigate('AdminDashboard', { section: 'bd-hierarchy' })} />
          ) : null}
          {hasAdminCap(user, 'analytics') ? (
            <CreamMenuRow icon="stats-chart-outline" title="Analytics" onPress={() => navigation.navigate('AdminDashboard', { section: 'analytics' })} />
          ) : null}
          {hasAdminCap(user, 'settings') ? (
            <CreamMenuRow icon="settings-outline" title="Platform settings" onPress={() => navigation.navigate('AdminDashboard', { section: 'settings' })} />
          ) : null}
          {isSuperAdmin(user) ? (
            <CreamMenuRow
              icon="key-outline"
              title="Staff powers"
              subtitle="Decide what each Admin can do"
              onPress={() => navigation.navigate('AdminDashboard', { section: 'staff' })}
            />
          ) : null}
        </View>
      ) : null}

      {host ? (
        <View>
          <MenuSec title="Host" />
          <CreamMenuRow icon="videocam-outline" title="Host / Streamer Center" subtitle="Earnings, hours, go live" onPress={() => navigation.navigate('StreamerCenter')} />
          <CreamMenuRow icon="id-card-outline" title="Live verification & selfie" onPress={() => navigation.navigate('LiveVerify')} />
          <CreamMenuRow icon="document-text-outline" title="Live application" onPress={() => navigation.navigate('LiveApplication')} />
          <CreamMenuRow icon="star-outline" title="Host earning policies" onPress={() => navigation.navigate('HostPolicies')} />
          {isHost(user) && !agency ? (
            <CreamMenuRow icon="handshake-outline" title="My Agency / Change Agency" onPress={() => navigation.navigate('HostAgency')} />
          ) : null}
        </View>
      ) : (
        <CreamMenuRow icon="star-outline" title="Host earning policies" onPress={() => navigation.navigate('HostPolicies')} />
      )}

      {seller || admin ? <CreamMenuRow icon="cash-outline" title="Coin Seller Center" onPress={() => navigation.navigate('CoinSeller')} /> : null}
      {bd ? <CreamMenuRow icon="git-network-outline" title="BD Center" onPress={() => navigation.navigate('BdCenter')} /> : null}
      {bd ? <CreamMenuRow icon="git-branch-outline" title="Hierarchy" onPress={() => navigation.navigate('Hierarchy')} /> : null}
      {agency ? <CreamMenuRow icon="business-outline" title="Agency Center" onPress={() => navigation.navigate('AgencyCenter')} /> : null}
      {worker ? <CreamMenuRow icon="grid-outline" title="My Dashboard" onPress={() => navigation.navigate('WorkerDashboard')} /> : null}

      <MenuSec title="Me" />
      <CreamMenuRow icon="mail-outline" title="Invite" subtitle="Reward: $14/person" accent="#E89020" onPress={() => navigation.navigate('Referral')} />
      <CreamMenuRow icon="film-outline" title="My posts & videos" onPress={() => navigation.navigate('CreatorProfile', { userId: user?.id, name: displayName })} />
      <CreamMenuRow icon="person-outline" title="Edit Profile" onPress={() => navigation.navigate('EditProfile')} />
      <CreamMenuRow icon="heart-outline" title="CP House" accent="#DB2777" onPress={() => navigation.navigate('Cp')} />
      <CreamMenuRow icon="trophy-outline" title="CP Rankings" accent="#DB2777" onPress={() => navigation.navigate('CpRankings')} />
      <CreamMenuRow icon="shield-outline" title="Level" accent="#2563EB" onPress={() => navigation.navigate('Levels')} />
      <CreamMenuRow icon="eye-outline" title="Visitors" accent="#2563EB" onPress={() => navigation.navigate('Visitors')} />
      <CreamMenuRow icon="diamond-outline" title="VIP Privileges" onPress={() => navigation.navigate('Vip')} />
      <CreamMenuRow icon="sparkles-outline" title="AP SVIP" accent="#7C3AED" onPress={() => navigation.navigate('Svip')} />
      <CreamMenuRow icon="podium-outline" title="Rankings" onPress={() => navigation.navigate('Rankings')} />
      <CreamMenuRow icon="storefront-outline" title="Store" onPress={() => navigation.navigate('Store')} />
      <CreamMenuRow icon="chatbubbles-outline" title="Messages" onPress={() => navigation.navigate('Main', { screen: 'Chat' })} />
      <CreamMenuRow icon="notifications-outline" title="Notification settings" onPress={() => navigation.navigate('NotificationSettings')} />
      {!hideRoleApply(user) ? <CreamMenuRow icon="person-add-outline" title="Apply for Host / Agency / Seller" onPress={() => navigation.navigate('RoleApply')} /> : null}
      <CreamMenuRow icon="briefcase-outline" title="Become a Pro" onPress={() => navigation.navigate('BecomePro')} />
      <CreamMenuRow icon="help-circle-outline" title="Help" onPress={() => navigation.navigate('Help')} />
      <CreamMenuRow icon="settings-outline" title="Settings" onPress={() => navigation.navigate('Settings')} />
      <CreamMenuRow icon="log-out-outline" title="Logout" accent="#B91C1C" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F8' },
  meHead: { backgroundColor: '#FDF8EE', paddingHorizontal: 16, paddingBottom: 16 },
  meTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  editIco: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(201,162,39,0.16)', alignItems: 'center', justifyContent: 'center' },
  onlineLite: { color: '#16A34A', fontWeight: '700', fontSize: 12 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meAv: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#fff' },
  meName: { color: '#111', fontWeight: '800', fontSize: 18 },
  idLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  idLite: { color: '#8B6D3B', fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  rolePill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  pillB: { backgroundColor: '#60A5FA', color: '#fff', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  pillC: { backgroundColor: '#22C55E', color: '#fff', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  flag: { fontSize: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statN: { fontWeight: '800', fontSize: 20, color: '#111' },
  statL: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  rankBadge: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F5D76E', alignItems: 'center', justifyContent: 'center' },
  rankT: { fontWeight: '900', color: '#7C4A12' },
  duo: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginTop: 10 },
  duoCard: { flex: 1, borderRadius: 14, padding: 14, minHeight: 72, justifyContent: 'space-between' },
  duoT: { fontWeight: '800', color: '#111' },
  cpCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 20, overflow: 'hidden' },
  cpGrad: { padding: 14, minHeight: 168 },
  cpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cpLabel: { color: '#FDE68A', fontWeight: '800' },
  cpLink: { color: '#F5D76E', fontWeight: '700', fontSize: 12 },
  cpPair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 10 },
  cpSlot: { alignItems: 'center', width: 110 },
  cpAv: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#F5D76E' },
  cpEmpty: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  cpName: { color: '#FDE68A', fontWeight: '700', marginTop: 6, fontSize: 12 },
  cpMid: { alignItems: 'center' },
  cpNum: { marginTop: 4, backgroundColor: '#F5D76E', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cpNumT: { fontWeight: '800', color: '#5D4037', fontSize: 12 },
  together: { textAlign: 'center', color: '#FDE68A', fontWeight: '700', marginTop: 10 },
  idPill: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#FFF4CC',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  idAdmin: { backgroundColor: '#FF8C00', color: '#fff', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  idNum: { flex: 1, fontWeight: '800', color: '#5D4037', fontSize: 16 },
  followRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10 },
  followBox: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  followN: { fontWeight: '800', fontSize: 18, color: '#5D4037' },
  followL: { color: '#8B6D3B', fontSize: 11, fontWeight: '700', marginTop: 2 },
  moneyRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 8 },
  moneyBox: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  moneyN: { fontWeight: '800', fontSize: 13 },
  moneyL: { color: '#8B6D3B', fontSize: 10, fontWeight: '800', marginTop: 2 },
  ctaRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10, marginBottom: 6 },
  hostCtas: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 8, marginBottom: 4 },
  sec: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, color: '#8B6D3B', fontWeight: '800', fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  cta: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cpInvite: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#FDE8F0',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#F9A8D4',
    borderRadius: 16,
    padding: 14,
  },
  cpInviteT: { color: '#9D174D', fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  cpInviteBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  cpInviteBtnT: { color: '#fff', fontWeight: '800' },
});
