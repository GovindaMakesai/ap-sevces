import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import LiveAudioRoute from '../lib/liveAudioRoute';
import { discardHold, parkEngine, peekHold, releaseHoldIfDifferent } from '../lib/liveMiniHold';
import { useSocket } from './SocketContext';

const LiveMiniContext = createContext(null);

export function LiveMiniProvider({ children, navigationRef }) {
  const socket = useSocket();
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const dismiss = useCallback(async ({ end = false } = {}) => {
    const cur = sessionRef.current;
    discardHold();
    if (cur?.channel) {
      try {
        if (end && cur.isHost) await socket.endLive(cur.channel);
        else await socket.leaveLive(cur.channel);
      } catch (_e) {}
    }
    LiveAudioRoute.leaveLive('mini_dismiss').catch(() => {});
    setSession(null);
  }, [socket]);

  const minimize = useCallback((payload) => {
    if (!payload?.channel) return;
    const prev = sessionRef.current;
    if (prev && String(prev.channel) !== String(payload.channel)) {
      discardHold();
      try {
        socket.leaveLive(prev.channel);
      } catch (_e) {}
    }
    if (payload.engine) {
      parkEngine({
        engine: payload.engine,
        channel: String(payload.channel),
        isParty: Boolean(payload.isParty),
        isHost: Boolean(payload.isHost),
        remoteUid: payload.remoteUid ?? null,
        localUid: payload.localUid ?? 0,
        camOff: Boolean(payload.camOff),
      });
    }
    setSession({
      channel: String(payload.channel),
      routeName: payload.routeName || (payload.isParty ? 'PartyRoom' : 'LiveRoom'),
      params: payload.params || {},
      isParty: Boolean(payload.isParty),
      isHost: Boolean(payload.isHost),
      remoteUid: payload.remoteUid ?? null,
      localUid: payload.localUid ?? 0,
      camOff: Boolean(payload.camOff),
      hostName: payload.hostName || payload.params?.hostName || 'Live',
      hostPic: payload.hostPic || payload.params?.hostProfilePic || null,
      coverUrl: payload.coverUrl || payload.params?.coverUrl || payload.params?.streamCoverUrl || null,
      minimized: true,
    });
  }, [socket]);

  const expand = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    setSession((s) => (s ? { ...s, minimized: false } : s));
    const nav = navigationRef?.current;
    const go = () => nav?.navigate?.(cur.routeName, cur.params);
    requestAnimationFrame(go);
  }, [navigationRef]);

  const prepareForRoom = useCallback((channel) => {
    releaseHoldIfDifferent(channel);
    const cur = sessionRef.current;
    if (!cur) return;
    if (String(cur.channel) === String(channel)) {
      setSession((s) => (s ? { ...s, minimized: false } : s));
      return;
    }
    discardHold();
    try {
      socket.leaveLive(cur.channel);
    } catch (_e) {}
    LiveAudioRoute.leaveLive('mini_switch').catch(() => {});
    setSession(null);
  }, [socket]);

  const clearIfChannel = useCallback((channel) => {
    setSession((cur) => {
      if (!cur || String(cur.channel) !== String(channel)) return cur;
      return null;
    });
  }, []);

  useEffect(() => {
    const offEnded = socket.on('live:ended', (ev) => {
      const ch = String(ev?.channel || '');
      const cur = sessionRef.current;
      if (!cur) return;
      if (ch && ch !== String(cur.channel)) return;
      discardHold();
      LiveAudioRoute.leaveLive('mini_ended').catch(() => {});
      setSession(null);
    });
    const offKicked = socket.on('live:kicked', (ev) => {
      const ch = String(ev?.channel || '');
      const cur = sessionRef.current;
      if (!cur) return;
      if (ch && ch !== String(cur.channel)) return;
      discardHold();
      LiveAudioRoute.leaveLive('mini_kicked').catch(() => {});
      setSession(null);
    });
    return () => {
      try {
        offEnded?.();
      } catch (_e) {}
      try {
        offKicked?.();
      } catch (_e) {}
    };
  }, [socket]);

  const value = useMemo(
    () => ({
      session,
      minimized: Boolean(session?.minimized),
      minimize,
      expand,
      dismiss,
      prepareForRoom,
      clearIfChannel,
      clearSession,
      peekHold,
    }),
    [session, minimize, expand, dismiss, prepareForRoom, clearIfChannel, clearSession]
  );

  return <LiveMiniContext.Provider value={value}>{children}</LiveMiniContext.Provider>;
}

export function useLiveMini() {
  const ctx = useContext(LiveMiniContext);
  if (!ctx) {
    return {
      session: null,
      minimized: false,
      minimize: () => {},
      expand: () => {},
      dismiss: async () => {},
      prepareForRoom: () => {},
      clearIfChannel: () => {},
      clearSession: () => {},
      peekHold: () => null,
    };
  }
  return ctx;
}
