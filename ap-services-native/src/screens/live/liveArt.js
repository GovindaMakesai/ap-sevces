import React from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AnimatedSheet } from '../../components/motion';

export const art = {
  partyStage: require('../../../assets/design/party-stage.png'),
  gameCenter: require('../../../assets/design/game-center-sheet.png'),
  giftSheet: require('../../../assets/design/gift-sheet.png'),
  profilePanel: require('../../../assets/design/profile-panel.png'),
  contribution: require('../../../assets/design/contribution-sheet.png'),
  online: require('../../../assets/design/online-sheet.png'),
  roomPk: require('../../../assets/design/room-pk-sheet.png'),
  svip: require('../../../assets/design/svip-sheet.png'),
  tools: require('../../../assets/design/tools-sheet.png'),
  calculator: require('../../../assets/design/calculator-sheet.png'),
  tips: require('../../../assets/design/tips-card.png'),
  home: require('../../../assets/design/home-live.png'),
  golive: require('../../../assets/design/golive.png'),
  liveMain: require('../../../assets/design/live-main.png'),
  memberPanel: require('../../../assets/design/member-panel.png'),
};

export function PhotoSheet({ visible, source, height = 0.58, onClose, zones = [], children }) {
  const { height: H, width: W } = Dimensions.get('window');
  const h = Math.round(H * height);
  return (
    <AnimatedSheet visible={visible} onClose={onClose} height={h}>
      <View style={{ height: h, width: W, backgroundColor: '#12081c' }}>
        <Image source={source} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        {zones.map((z) => (
          <Pressable
            key={z.id}
            onPress={z.onPress}
            style={{
              position: 'absolute',
              left: `${z.l}%`,
              top: `${z.t}%`,
              width: `${z.w}%`,
              height: `${z.h}%`,
            }}
          />
        ))}
        {children}
      </View>
    </AnimatedSheet>
  );
}

export function PhotoCard({ visible, source, onClose, zones = [] }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.center} onPress={onClose}>
        <View style={styles.card}>
          <Image source={source} style={styles.cardImg} resizeMode="contain" />
          {zones.map((z) => (
            <Pressable
              key={z.id}
              onPress={z.onPress}
              style={{
                position: 'absolute',
                left: `${z.l}%`,
                top: `${z.t}%`,
                width: `${z.w}%`,
                height: `${z.h}%`,
              }}
            />
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  center: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '86%', height: 220, borderRadius: 16, overflow: 'hidden' },
  cardImg: { width: '100%', height: '100%' },
});
