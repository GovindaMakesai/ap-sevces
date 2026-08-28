import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Card } from '../../components/ui';
import { colors } from '../../config/theme';
import { CreamPage } from '../../components/creamChrome';

const PRIVACY = `AP Live Service privacy policy

We store account, profile, live, chat, gift, wallet, and payment records needed to operate the service. Profile visits, follow lists, and gift history are used to show supporters, rankings, and visitors.

Push tokens are used for notifications. Agora tokens are used only to join live and party rooms.

You can request account deletion from Settings → Request account deletion. Contact support for data access questions.`;

const TERMS = `AP Live Service terms of use

By using this app you agree to follow community rules, not abuse live or party rooms, and use coins, gifts, and CP features as purchased.

Hosts and agencies must complete verification where required. Coin sellers and withdrawals follow the original platform review process.

Illegal content, harassment, and payment fraud are prohibited and may result in bans. Contact support for billing or account help.`;

export default function LegalScreen({ navigation, route }) {
  const kind = route.params?.kind || 'privacy';
  return (
    <CreamPage title={kind === 'terms' ? 'Terms' : 'Privacy'} navigation={navigation}>
      <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card>
          <Text style={styles.body}>{kind === 'terms' ? TERMS : PRIVACY}</Text>
        </Card>
      </ScrollView>
    </CreamPage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  body: { color: colors.textPrimary, lineHeight: 22, fontSize: 14 },
});
