import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export default function LuckyResultOverlay({ result, onDone }) {
  const visible = Boolean(result);
  useEffect(() => {
    if (!visible) return undefined;
    const t = setTimeout(() => onDone?.(), 4200);
    return () => clearTimeout(t);
  }, [visible, onDone, result]);

  if (!result) return null;
  const prize = Number(result.prize || 0);
  const cost = Number(result.cost || 0);
  const qty = Number(result.qty || 1);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <Pressable style={styles.bg} onPress={onDone}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.kicker}>Lucky Gift</Text>
          <Text style={styles.emoji}>{result.emoji || '🍀'}</Text>
          <Text style={styles.title}>
            {result.gift_name || 'Lucky Clover'} ×{qty}
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Cost</Text>
            <Text style={styles.val}>🪙 {cost.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Lucky Return</Text>
            <Text style={[styles.val, prize > 0 ? styles.win : styles.miss]}>
              {prize > 0 ? `🎁 ${prize.toLocaleString()}` : '🪙 0'}
            </Text>
          </View>
          <Text style={styles.msg}>
            {prize > 0 ? 'Congratulations!' : 'Better luck next send'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1030',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,215,110,0.35)',
  },
  kicker: { color: '#5EEAD4', fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  emoji: { fontSize: 52, textAlign: 'center', marginVertical: 8 },
  title: { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { color: '#9CA3AF', fontWeight: '700' },
  val: { color: '#F5D76E', fontWeight: '800' },
  win: { color: '#34D399' },
  miss: { color: '#9CA3AF' },
  msg: { color: '#fff', fontWeight: '800', textAlign: 'center', marginTop: 12, fontSize: 16 },
});
