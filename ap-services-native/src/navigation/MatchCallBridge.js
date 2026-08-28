import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSocket } from '../context/SocketContext';
import { callParamsFromMatch } from '../lib/matchCallNav';

/** Routes incoming match:found events to the Call screen from anywhere in the app. */
export default function MatchCallBridge() {
  const navigation = useNavigation();
  const socket = useSocket();
  const inCallRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const unsubs = [];

    (async () => {
      try {
        await socket.connect?.();
      } catch (_e) {}

      if (!alive) return;

      unsubs.push(
        socket.on('match:found', (payload) => {
          const params = callParamsFromMatch(payload);
          if (!params) return;
          const route = navigation.getCurrentRoute?.();
          if (route?.name === 'Call') return;
          inCallRef.current = true;
          navigation.navigate('Call', params);
        })
      );

      unsubs.push(
        socket.on('match:ended', () => {
          inCallRef.current = false;
        })
      );
    })();

    const unsubNav = navigation.addListener('state', () => {
      const route = navigation.getCurrentRoute?.();
      inCallRef.current = route?.name === 'Call';
    });

    return () => {
      alive = false;
      unsubNav?.();
      unsubs.forEach((u) => {
        try {
          u?.();
        } catch (_e) {}
      });
    };
  }, [navigation, socket]);

  return null;
}
