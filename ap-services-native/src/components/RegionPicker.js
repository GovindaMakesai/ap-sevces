import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export const REGIONS = [
  { id: 'all', flag: '🌏', label: 'Global' },
  { id: 'IN', flag: '🇮🇳', label: 'India' },
  { id: 'NP', flag: '🇳🇵', label: 'Nepal' },
  { id: 'BD', flag: '🇧🇩', label: 'Bangladesh' },
  { id: 'PK', flag: '🇵🇰', label: 'Pakistan' },
  { id: 'PH', flag: '🇵🇭', label: 'Philippines' },
  { id: 'ID', flag: '🇮🇩', label: 'Indonesia' },
  { id: 'MY', flag: '🇲🇾', label: 'Malaysia' },
  { id: 'VN', flag: '🇻🇳', label: 'Vietnam' },
  { id: 'NG', flag: '🇳🇬', label: 'Nigeria' },
  { id: 'BR', flag: '🇧🇷', label: 'Brazil' },
  { id: 'EG', flag: '🇪🇬', label: 'Egypt' },
];

export function regionMeta(id) {
  return REGIONS.find((r) => r.id === id) || REGIONS[0];
}

export default function RegionPicker({ visible, value, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Country / Region</Text>
          <View style={styles.grid}>
            {REGIONS.map((r) => {
              const on = value === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => { onSelect?.(r.id); onClose?.(); }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={styles.flag}>{r.flag}</Text>
                  <Text style={[styles.label, on && styles.labelOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  title: { fontWeight: '800', fontSize: 16, color: '#111', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '31%',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F4F4F6',
  },
  chipOn: { backgroundColor: '#111', },
  flag: { fontSize: 18 },
  label: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#444', textAlign: 'center' },
  labelOn: { color: '#fff' },
});
