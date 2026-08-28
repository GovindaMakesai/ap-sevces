import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Android Alert.alert only supports 3 buttons and often drops onPress.
 * Use this sheet for overflow / 3-dot menus.
 */
export default function ActionSheet({ visible, title, subtitle, options = [], onClose }) {
  const insets = useSafeAreaInsets();
  const rows = options.filter((o) => o && o.hidden !== true);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
          {rows.map((opt) => (
            <Pressable
              key={opt.id || opt.label}
              onPress={() => {
                const run = opt.onPress;
                onClose?.();
                requestAnimationFrame(() => run?.());
              }}
              style={styles.row}
            >
              <Text
                style={[
                  styles.rowT,
                  opt.destructive && styles.danger,
                  opt.primary && styles.primary,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={[styles.row, styles.cancel]}>
            <Text style={styles.cancelT}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    paddingTop: 6,
  },
  sub: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  row: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EFEFEF',
  },
  rowT: { fontSize: 16, fontWeight: '600', color: '#111' },
  danger: { color: '#E11D48' },
  primary: { color: '#C2410C' },
  cancel: { marginTop: 6, backgroundColor: '#F4F4F4', borderRadius: 12, borderTopWidth: 0 },
  cancelT: { fontSize: 16, fontWeight: '700', color: '#555' },
});
