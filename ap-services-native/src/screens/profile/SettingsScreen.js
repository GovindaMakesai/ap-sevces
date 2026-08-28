import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { CreamHeader, CreamMenuRow, creamRoot } from '../../components/creamChrome';

export default function SettingsScreen({ navigation }) {
  const { logout, api } = useAuth();
  return (
    <View style={creamRoot}>
      <CreamHeader title="Settings" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <CreamMenuRow icon="notifications-outline" title="Notification settings" onPress={() => navigation.navigate('NotificationSettings')} />
        <CreamMenuRow icon="storefront-outline" title="Store" onPress={() => navigation.navigate('Store')} />
        <CreamMenuRow icon="heart" title="CP House" accent="#DB2777" onPress={() => navigation.navigate('Cp')} />
        <CreamMenuRow icon="trophy" title="CP Rankings" accent="#DB2777" onPress={() => navigation.navigate('CpRankings')} />
        <CreamMenuRow icon="shield" title="Level" accent="#2563EB" onPress={() => navigation.navigate('Levels')} />
        <CreamMenuRow icon="eye" title="Visitors" accent="#2563EB" onPress={() => navigation.navigate('Visitors')} />
        <CreamMenuRow icon="diamond-outline" title="VIP Privileges" onPress={() => navigation.navigate('Vip')} />
        <CreamMenuRow icon="sparkles" title="SVIP" accent="#7C3AED" onPress={() => navigation.navigate('Svip')} />
        <CreamMenuRow icon="chatbubbles-outline" title="Messages" onPress={() => navigation.navigate('Main', { screen: 'Chat' })} />
        <CreamMenuRow icon="help-circle-outline" title="Help" onPress={() => navigation.navigate('Help')} />
        <CreamMenuRow
          icon="document-text-outline"
          title="Privacy policy"
          onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}
        />
        <CreamMenuRow icon="reader-outline" title="Terms" onPress={() => navigation.navigate('Legal', { kind: 'terms' })} />
        <CreamMenuRow
          icon="trash-outline"
          title="Request account deletion"
          accent="#B91C1C"
          onPress={() =>
            Alert.alert('Delete account', 'Submit a deletion request?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Request', style: 'destructive', onPress: () => api.post('/trust/deletion-request').catch(() => {}) },
            ])
          }
        />
        <CreamMenuRow icon="log-out-outline" title="Logout" accent="#B91C1C" onPress={logout} />
      </ScrollView>
    </View>
  );
}
