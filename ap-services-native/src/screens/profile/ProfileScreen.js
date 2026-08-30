import React, { useCallback, useState } from 'react';
import { Alert, Image, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../config/api';
import { Avatar, ErrorBanner } from '../../components/ui';
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
  workerProfileFromDashboard,
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
  const [hasWorkerProfile, setHasWorkerProfile] = useState(isWorker(user));
  const admin = isPlatformAdmin(user);
  /* Role menus: only show centers the account can use. Platform admin sees all. */
  const seller = admin || isCoinSeller(user);
  const host = admin || isHost(user) || isAgency(user);
  const agency = admin || isAgency(user);
  const bd = admin || isBd(user);
  const worker = isWorker(user) || hasWorkerProfile;
  const publicId = formatUserDisplayId(user);
  const roles = hierarchyKeys(user);
  if (worker && !roles.includes('pro')) roles.push('pro');

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, w, panel, sv, cpHome, workerDash] = await Promise.all([
        api.get(`/social/stats/${user.id}`, null, { auth: false }).catch(() => ({})),
        api.get('/wallet/balance').catch(() => ({})),
        api.get(`/social/creators/${user.id}/profile-panel`, null, { auth: false }).catch(() => ({})),
        api.get('/svip/home').catch(() => ({})),
        api.get('/cp/home').catch(() => ({})),
        api.get('/workers/dashboard').catch(() => ({})),
      ]);
      const sd = api.unwrap(s);
      const wd = api.unwrap(w);
      const pd = api.unwrap(panel);
      const svd = api.unwrap(sv);
      const cpd = api.unwrap(cpHome);
      setHasWorkerProfile(Boolean(workerProfileFromDashboard(api.unwrap(workerDash)) || isWorker(user)));
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
  }, [api, user, user?.id, user?.level]);

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

      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <View style={styles.avWrap}>
          <Pressable onPress={() => navigation.navigate('CreatorProfile', { userId: user?.id, name: displayName })}>
            {pic ? (
              <Image source={{ uri: pic }} style={styles.av} />
            ) : (
              <Avatar name={displayName} size={96} style={styles.avFallback} />
            )}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.camBtn} hitSlop={6}>
            <Ionicons name="camera" size={14} color="#fff" />
          </Pressable>
        </View>

        <Text style={styles.meName}>{displayName}</Text>

        <View style={styles.pills}>
          {roles.map((k) => {
            const b = ROLE_BADGE[k];
            if (!b) return null;
            const isAdmin = k === 'admin';
            const isSeller = k === 'seller';
            return (
              <Text
                key={k}
                style={[
                  styles.rolePill,
                  {
                    backgroundColor: isAdmin ? '#FF8C00' : isSeller ? '#F5D76E' : b.bg[1],
                    color: isAdmin ? '#fff' : b.color,
                  },
                ]}
              >
                {b.label}
              </Text>
            );
          })}
          <Text style={styles.pillLv}>Lv.{stats.level}</Text>
          {svip.level ? <Text style={styles.pillSvip}>SVIP {svip.level}</Text> : null}
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
        <LinearGradient colors={['#3B0764', '#5B21B6', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cpGrad}>
          <View style={styles.cpTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.cpLabel}>CP</Text>
              <Ionicons name="heart" size={12} color="#F9A8D4" />
            </View>
            <Pressable onPress={() => navigation.navigate('Cp')} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={styles.cpLink}>Settings</Text>
              <Ionicons name="chevron-down" size={12} color="#E9D5FF" />
            </Pressable>
          </View>
          <View style={styles.cpPair}>
            <View style={styles.cpSlot}>
              {pic ? <Image source={{ uri: pic }} style={styles.cpAv} /> : <Avatar name={displayName} size={58} />}
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
                <View style={styles.cpEmpty}><Ionicons name="person" size={28} color="#E9D5FF" /></View>
              )}
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

      <View style={styles.followRow}>
        <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'following', userId: user?.id })} style={styles.followBox}>
          <Text style={styles.followN}>{stats.following}</Text>
          <Text style={styles.followL}>FOLLOWING</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('FollowList', { kind: 'followers', userId: user?.id })} style={styles.followBox}>
          <Text style={styles.followN}>{stats.followers}</Text>
          <Text style={styles.followL}>FOLLOWERS</Text>
        </Pressable>
      </View>

      <View style={styles.moneyRow}>
        <Pressable onPress={() => navigation.navigate('Wallet')} style={[styles.moneyBox, { backgroundColor: '#FFF4CC' }]}>
          <Text style={[styles.moneyN, { color: '#C9A227' }]}>{compactM(wallet.coins)}</Text>
          <Text style={styles.moneyL}>COINS</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Points')} style={[styles.moneyBox, { backgroundColor: '#FDE8F0' }]}>
          <Text style={[styles.moneyN, { color: '#9D174D' }]}>{compactM(wallet.points)}</Text>
          <Text style={styles.moneyL}>POINTS</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate(seller || admin ? 'CoinSeller' : 'Wallet')}
          style={[styles.moneyBox, { backgroundColor: '#FDDDE4' }]}
        >
          <Text style={[styles.moneyN, { color: '#C2185B' }]}>{compactM(wallet.giftCoins)}</Text>
          <Text style={styles.moneyL}>GIFT COINS</Text>
        </Pressable>
      </View>

      <View style={styles.ctaRow}>
        <Pressable onPress={() => navigation.navigate('Recharge')} style={{ flex: 1 }}>
          <LinearGradient colors={['#FFB347', '#FF8C00']} style={styles.cta}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.ctaT}>Top Up</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Withdraw')} style={{ flex: 1 }}>
          <LinearGradient colors={['#C084FC', '#DB2777']} style={styles.cta}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.ctaT}>Withdraw / Recharge</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate('EditProfile')} style={styles.editRow}>
        <Ionicons name="person-outline" size={18} color="#8B6D3B" />
        <Text style={styles.editRowT}>Edit profile</Text>
        <Ionicons name="chevron-forward" size={18} color="#C4B08A" />
      </Pressable>

      <View style={styles.duo}>
        <Pressable onPress={() => navigation.navigate('Supporters', { userId: user?.id, view: 'main', period: 'monthly' })} style={[styles.duoCard, { backgroundColor: '#EDE9FE' }]}>
          <Text style={styles.duoT}>Contribution List</Text>
          <Text style={{ fontSize: 18 }}>🏆</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Family', { userId: user?.id, name: displayName })} style={[styles.duoCard, { backgroundColor: '#FFEDD5' }]}>
          <Text style={styles.duoT}>Fan Club</Text>
          <Ionicons name="heart" size={18} color="#E11D48" />
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
          {(admin || isHost(user)) ? (
            <CreamMenuRow icon="document-text-outline" title="Live application" onPress={() => navigation.navigate('LiveApplication')} />
          ) : null}
          <CreamMenuRow icon="star-outline" title="Host earning policies" onPress={() => navigation.navigate('HostPolicies')} />
          {isHost(user) && !agency ? (
            <CreamMenuRow icon="handshake-outline" title="My Agency / Change Agency" onPress={() => navigation.navigate('HostAgency')} />
          ) : null}
        </View>
      ) : (
        <CreamMenuRow icon="star-outline" title="Host earning policies" onPress={() => navigation.navigate('HostPolicies')} />
      )}

      {seller ? <CreamMenuRow icon="cash-outline" title="Coin Seller Center" onPress={() => navigation.navigate('CoinSeller')} /> : null}
      {bd ? <CreamMenuRow icon="git-network-outline" title="BD Center" onPress={() => navigation.navigate('BdCenter')} /> : null}
      {bd ? <CreamMenuRow icon="git-branch-outline" title="Hierarchy" onPress={() => navigation.navigate('Hierarchy')} /> : null}
      {agency ? <CreamMenuRow icon="business-outline" title="Agency Center" onPress={() => navigation.navigate('AgencyCenter')} /> : null}

      <MenuSec title="Services" />
      <CreamMenuRow icon="storefront-outline" title="Browse / book services" subtitle="Act as a customer" onPress={() => navigation.navigate('Services')} />
      <CreamMenuRow icon="calendar-outline" title="My bookings" subtitle="Jobs you booked" onPress={() => navigation.navigate('MyServiceBookings')} />
      {worker ? (
        <CreamMenuRow
          icon="grid-outline"
          title="Services Center"
          subtitle="Offerings, jobs, availability"
          onPress={() => navigation.navigate('ServicesCenter')}
        />
      ) : (
        <CreamMenuRow
          icon="hammer-outline"
          title="Become a service provider"
          subtitle="Same account · offer services too"
          onPress={() => navigation.navigate('BecomePro')}
        />
      )}

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
      <CreamMenuRow icon="help-circle-outline" title="Help" onPress={() => navigation.navigate('Help')} />
      <CreamMenuRow icon="settings-outline" title="Settings" onPress={() => navigation.navigate('Settings')} />
      <CreamMenuRow icon="log-out-outline" title="Logout" accent="#B91C1C" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  hero: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  avWrap: { position: 'relative', marginBottom: 12 },
  av: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: '#E8B923',
    backgroundColor: '#F3E6C8',
  },
  avFallback: { borderWidth: 3, borderColor: '#E8B923' },
  camBtn: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF9E7',
  },
  meName: {
    color: '#5D4037',
    fontWeight: '800',
    fontSize: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  rolePill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
  pillLv: { backgroundColor: '#60A5FA', color: '#fff', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
  pillSvip: { backgroundColor: '#7C3AED', color: '#fff', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
  duo: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginTop: 10 },
  duoCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 72,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  duoT: { fontWeight: '800', color: '#111' },
  cpCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 18, overflow: 'hidden' },
  cpGrad: { padding: 14, minHeight: 150 },
  cpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cpLabel: { color: '#FDE68A', fontWeight: '800', fontSize: 13 },
  cpLink: { color: '#E9D5FF', fontWeight: '700', fontSize: 12 },
  cpPair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 12 },
  cpSlot: { alignItems: 'center', width: 90 },
  cpAv: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#F5D76E' },
  cpEmpty: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  cpMid: { alignItems: 'center' },
  cpNum: { marginTop: -10, backgroundColor: '#E5E7EB', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  cpNumT: { fontWeight: '800', color: '#374151', fontSize: 12 },
  together: { textAlign: 'center', color: '#FDE68A', fontWeight: '700', marginTop: 10 },
  idPill: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#FFF4CC',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  idAdmin: { backgroundColor: '#FF8C00', color: '#fff', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
  idNum: { fontWeight: '800', color: '#5D4037', fontSize: 16 },
  followRow: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 12 },
  followBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  followN: { fontWeight: '800', fontSize: 20, color: '#1c1917' },
  followL: { color: '#8B6D3B', fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.4 },
  moneyRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10 },
  moneyBox: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  moneyN: { fontWeight: '800', fontSize: 14 },
  moneyL: { color: '#8B6D3B', fontSize: 10, fontWeight: '800', marginTop: 2 },
  ctaRow: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10 },
  hostCtas: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10 },
  editRow: {
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  editRowT: { flex: 1, fontWeight: '700', color: '#5D4037', fontSize: 15 },
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
