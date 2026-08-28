import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { accessToken } = useAuth();
  const socketRef = useRef(null);
  const handlersRef = useRef(new Map());

  const disconnect = useCallback(() => {
    try {
      socketRef.current?.removeAllListeners?.();
      socketRef.current?.disconnect();
    } catch (_e) {}
    socketRef.current = null;
  }, []);

  const connect = useCallback(async (token) => {
    const t = token || accessToken;
    if (!t) throw new Error('Not signed in');
    if (socketRef.current?.connected) return socketRef.current;
    disconnect();
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 25,
      auth: { token: t },
    });
    socketRef.current = socket;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live connection timed out')), 12000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }, [accessToken, disconnect]);

  const emit = useCallback((event, payload, ackTimeout = 10000) => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.reject(new Error('Not connected to live server'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Request timed out')), ackTimeout);
      socket.emit(event, payload, (res) => {
        clearTimeout(timer);
        if (res && res.ok === false) reject(new Error(res.message || 'Request failed'));
        else resolve(res);
      });
    });
  }, []);

  const on = useCallback((event, handler) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    const list = handlersRef.current.get(event) || [];
    list.push(handler);
    handlersRef.current.set(event, list);
    return () => {
      try {
        socket.off(event, handler);
      } catch (_e) {}
    };
  }, []);

  const joinLive = useCallback(
    (channel, { isParty = false, isHost = false, streamTitle, streamCoverUrl, displayName } = {}) =>
      emit('live:join', {
        channel,
        type: isParty ? 'party' : 'live',
        isHost: Boolean(isHost),
        displayName,
        streamTitle,
        streamCoverUrl,
      }),
    [emit]
  );

  const leaveLive = useCallback((channel) => emit('live:leave', { channel }).catch(() => {}), [emit]);
  const endLive = useCallback((channel) => emit('live:end', { channel }), [emit]);
  const sendChat = useCallback(
    (channel, message, extra = {}) => emit('live:chat', { channel, message, text: message, ...extra }),
    [emit]
  );
  const sendGift = useCallback(
    (channel, payload = {}) =>
      emit('live:gift', { channel, giftType: payload.giftSlug, ...payload }),
    [emit]
  );
  const requestSeat = useCallback((channel, seatIndex) => emit('live:seat_request', { channel, seatIndex }), [emit]);
  const respondSeat = useCallback(
    (channel, { userId, accept, seatIndex }) =>
      emit('live:seat_response', {
        channel,
        userId,
        accept: Boolean(accept),
        accepted: Boolean(accept),
        seatIndex,
      }),
    [emit]
  );
  const startPk = useCallback(
    (channel, opts = {}) => {
      const opponentUserId = String(opts.userId || opts.opponentUserId || opts.targetUserId || '').trim();
      const durationSeconds =
        Number(opts.durationSeconds || opts.durationSec) ||
        (opts.durationMinutes ? Number(opts.durationMinutes) * 60 : 300);
      const mode = String(opts.mode || opts.type || 'friend').toLowerCase();
      return emit('pk:challenge', {
        channel,
        userId: opponentUserId,
        opponentUserId,
        targetChannel: opts.targetChannel || opts.rivalChannel || '',
        rivalChannel: opts.targetChannel || opts.rivalChannel || '',
        mode,
        type: mode,
        durationSeconds,
        durationSec: durationSeconds,
        durationMinutes: opts.durationMinutes || Math.round(durationSeconds / 60),
        opponentName: opts.opponentName || opts.targetName || 'Rival',
        hostName: opts.hostName,
      });
    },
    [emit]
  );
  const respondPk = useCallback(
    (challengeId, accept) => emit('pk:challenge:respond', { challengeId, accept }),
    [emit]
  );
  const endPk = useCallback((channel) => emit('pk:end', { channel }), [emit]);

  const enqueueMatch = useCallback(
    ({ mode, clientRequestId }) =>
      emit('match:enqueue', {
        mode,
        clientRequestId,
        requestId: clientRequestId,
      }),
    [emit]
  );

  const cancelMatch = useCallback(() => emit('match:cancel', {}), [emit]);

  const matchJoined = useCallback((matchId) => emit('match:joined', { matchId }), [emit]);

  const matchHangup = useCallback((matchId) => emit('match:hangup', { matchId }), [emit]);

  const value = useMemo(
    () => ({
      connect,
      disconnect,
      emit,
      on,
      joinLive,
      leaveLive,
      endLive,
      sendChat,
      sendGift,
      requestSeat,
      respondSeat,
      startPk,
      respondPk,
      endPk,
      enqueueMatch,
      cancelMatch,
      matchJoined,
      matchHangup,
      get socket() {
        return socketRef.current;
      },
    }),
    [
      cancelMatch,
      connect,
      disconnect,
      emit,
      endLive,
      endPk,
      enqueueMatch,
      joinLive,
      leaveLive,
      matchHangup,
      matchJoined,
      on,
      requestSeat,
      respondPk,
      respondSeat,
      sendChat,
      sendGift,
      startPk,
    ]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
