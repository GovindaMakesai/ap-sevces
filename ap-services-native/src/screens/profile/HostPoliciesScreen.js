import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CreamHeader } from '../../components/creamChrome';

export default function HostPoliciesScreen({ navigation, route }) {
  const initial = String(route?.params?.policy || 'star').toLowerCase();
  const [tab, setTab] = useState(initial === 'normal' ? 'normal' : 'star');
  return (
    <View style={styles.root}>
      <CreamHeader title="Host earning policies" navigation={navigation} />
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('star')} style={{ flex: 1 }}>
          <LinearGradient
            colors={tab === 'star' ? ['#F472B6', '#7C3AED'] : ['#E8D5B5', '#D9C4A0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tab}
          >
            <Text style={[styles.tabT, tab !== 'star' && { color: '#fff' }]}>Star Host</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setTab('normal')} style={{ flex: 1 }}>
          <LinearGradient
            colors={tab === 'normal' ? ['#F472B6', '#7C3AED'] : ['#E8D5B5', '#D9C4A0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tab}
          >
            <Text style={styles.tabT}>Normal Host</Text>
          </LinearGradient>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {tab === 'star' ? (
          <LinearGradient colors={['#1A0533', '#3B0764', '#12002A']} style={styles.poster}>
            <View style={styles.brandRow}>
              <Ionicons name="diamond" size={16} color="#F5D76E" />
              <Text style={styles.brand}>AP LIVE</Text>
            </View>
            <Text style={styles.posterTitle}>STAR HOST{'\n'}POLICY</Text>
            <View style={styles.rewardBox}>
              <Text style={styles.reward}>7$ WEEKLY REWARDS = 70,000 POINTS</Text>
            </View>
            <View style={styles.rule}>
              <Ionicons name="calendar" size={16} color="#F5D76E" />
              <Text style={styles.ruleT}>WEEKLY 14 HR LIVE</Text>
            </View>
            <View style={styles.rule}>
              <Ionicons name="time" size={16} color="#F5D76E" />
              <Text style={styles.ruleT}>DAILY - 2 HOURS (MAXIMUM LIVE COUNT IN A DAY 3 HOURS)</Text>
            </View>
            <View style={styles.rule}>
              <Ionicons name="gift" size={16} color="#F5D76E" />
              <Text style={styles.ruleT}>AFTER 1 WEEK NEED MINIMUM TARGET 150K GIFT RECEIVED</Text>
            </View>
            <View style={styles.reqBox}>
              <Text style={styles.reqH}>REQUIREMENT</Text>
              {['GOOD LOOKING', 'GOOD DRESS UP', 'ACTIVE HOST', 'YOUNG'].map((r) => (
                <Text key={r} style={styles.req}>★  {r}</Text>
              ))}
              <Text style={styles.female}>(FEMALE HOST ONLY)</Text>
            </View>
            <Text style={styles.shine}>BE A STAR{'\n'}SHINE WITH AP LIVE</Text>
            <Text style={styles.footer}>SMART WORK  ·  MORE LIVE  ·  MORE EARNING</Text>
          </LinearGradient>
        ) : (
          <View style={styles.normalCard}>
            <Text style={styles.normalH}>Normal Host</Text>
            <Text style={styles.normalB}>Creator share: 90% · Platform share: 10% on gifts, bookings and live earnings.</Text>
            <Text style={styles.normalB}>Hosts must complete live verification (ID + selfie) before going live.</Text>
            <Text style={styles.normalB}>Agency hosts follow their agency commission rules on top of the platform share.</Text>
            <Text style={styles.normalB}>Violations of community rules can freeze earnings and live access.</Text>
          </View>
        )}
        <Pressable onPress={() => navigation.navigate('StreamerCenter')} style={{ marginHorizontal: 16, marginTop: 14 }}>
          <LinearGradient colors={['#E8C547', '#C9A227']} style={styles.cta}>
            <Text style={styles.ctaGold}>Open Streamer Center</Text>
          </LinearGradient>
        </Pressable>
        {tab === 'star' ? (
          <Pressable onPress={() => navigation.navigate('LiveApplication')} style={{ marginHorizontal: 16, marginTop: 10 }}>
            <LinearGradient colors={['#F472B6', '#EC4899']} style={styles.cta}>
              <Text style={styles.ctaWhite}>Apply to become a Host</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9E7' },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  tab: { borderRadius: 18, paddingVertical: 12, alignItems: 'center' },
  tabT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  poster: { marginHorizontal: 14, borderRadius: 20, padding: 18, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brand: { color: '#F5D76E', fontWeight: '800', letterSpacing: 1.4 },
  posterTitle: { color: '#F5D76E', fontSize: 28, fontWeight: '900', marginTop: 10, lineHeight: 32 },
  rewardBox: { backgroundColor: 'rgba(245,215,110,0.12)', borderRadius: 12, padding: 10, marginVertical: 12, borderWidth: 1, borderColor: '#F5D76E' },
  reward: { color: '#FFE566', fontWeight: '800', textAlign: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ruleT: { color: '#fff', fontWeight: '700', flex: 1, fontSize: 12 },
  reqBox: { marginTop: 14, backgroundColor: 'rgba(124,58,237,0.35)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F5D76E' },
  reqH: { color: '#F5D76E', fontWeight: '800', marginBottom: 6 },
  req: { color: '#fff', fontWeight: '700', marginTop: 3 },
  female: { color: '#F9A8D4', fontWeight: '800', marginTop: 8 },
  shine: { color: '#F5D76E', fontWeight: '900', textAlign: 'center', marginTop: 16, fontSize: 16 },
  footer: { color: '#E9D5FF', textAlign: 'center', marginTop: 10, fontSize: 11, fontWeight: '700' },
  normalCard: { marginHorizontal: 14, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(139,109,59,0.18)' },
  normalH: { fontWeight: '800', color: '#5D4037', fontSize: 18, marginBottom: 8 },
  normalB: { color: '#6B5344', lineHeight: 20, marginTop: 6 },
  cta: { borderRadius: 22, paddingVertical: 14, alignItems: 'center' },
  ctaGold: { color: '#3D2E08', fontWeight: '800', fontSize: 16 },
  ctaWhite: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
