const { getAccessTokenFromRequest } = require('../services/authTokenService');
const giftService = require('../services/giftService');
const liveRoomService = require('../services/liveRoomService');
const permissionService = require('../services/permissionService');

const RATE_WINDOW_MS = 10_000;
const MAX_CHAT_PER_WINDOW = 20;
const MAX_GIFT_PER_WINDOW = 15;

function rateLimit(socket, bucket, max) {
  const now = Date.now();
  if (!socket.data.rateBuckets) socket.data.rateBuckets = {};
  const b = socket.data.rateBuckets[bucket] || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + RATE_WINDOW_MS;
  }
  b.count += 1;
  socket.data.rateBuckets[bucket] = b;
  return b.count <= max;
}

function sanitizeChannel(raw) {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

async function isRoomHost(socket, channel) {
  const room = await liveRoomService.findByChannel(channel);
  if (!room) return false;
  return String(room.host_user_id) === String(socket.userId);
}

function safeAck(ack, answeredRef, payload) {
  if (answeredRef.answered) return;
  answeredRef.answered = true;
  if (typeof ack === 'function') ack(payload);
}

function registerLiveSocket(io) {
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token) {
        token = getAccessTokenFromRequest({ headers: socket.handshake.headers });
      }
      if (!token) return next(new Error('Authentication required'));

      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.userId);
      socket.data.displayName =
        String(decoded.first_name || decoded.name || 'User').trim().slice(0, 32) || 'User';
      return next();
    } catch (_err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    let currentChannel = null;

    socket.on('live:join', async (payload, ack) => {
      const answeredRef = { answered: false };
      const joinTimer = setTimeout(() => {
        safeAck(ack, answeredRef, { ok: false, message: 'Room join timed out — try again' });
      }, 12000);

      try {
        const channel = sanitizeChannel(payload?.channel);
        if (!channel) {
          safeAck(ack, answeredRef, { ok: false, message: 'channel required' });
          return;
        }

        const canJoin = await permissionService.userHasPermission(socket.userId, 'live.join');
        if (!canJoin) {
          safeAck(ack, answeredRef, { ok: false, message: 'No permission to join live rooms' });
          return;
        }

        const displayName =
          String(socket.data.displayName || 'User').trim().slice(0, 32) || 'User';
        const roomType = payload?.type === 'live' ? 'live' : 'party';
        const clientWantsHost = Boolean(payload?.isHost);

        const existingRoom = await liveRoomService.findByChannel(channel);
        if (existingRoom && (await liveRoomService.isUserBanned(existingRoom.id, socket.userId))) {
          safeAck(ack, answeredRef, { ok: false, message: 'You are banned from this room' });
          return;
        }

        let isHost = false;
        if (!existingRoom) {
          if (!clientWantsHost) {
            safeAck(ack, answeredRef, { ok: false, message: 'Room does not exist' });
            return;
          }
          const canHost = await permissionService.userHasPermission(socket.userId, 'live.host');
          if (!canHost) {
            safeAck(ack, answeredRef, { ok: false, message: 'No permission to host' });
            return;
          }
          isHost = true;
          await liveRoomService.hostRoom({
            channel,
            roomType,
            hostUserId: socket.userId,
            hostDisplayName: displayName,
          });
        } else if (String(existingRoom.host_user_id) === String(socket.userId)) {
          isHost = true;
          if (existingRoom.status === 'ended' && clientWantsHost) {
            await liveRoomService.hostRoom({
              channel,
              roomType: existingRoom.room_type || roomType,
              hostUserId: socket.userId,
              hostDisplayName: displayName,
            });
          } else {
            await liveRoomService.joinRoom({
              channel,
              userId: socket.userId,
              displayName,
              asHost: true,
            });
          }
        } else {
          if (clientWantsHost) {
            safeAck(ack, answeredRef, { ok: false, message: 'You are not the host of this room' });
            return;
          }
          if (existingRoom.status === 'ended') {
            safeAck(ack, answeredRef, { ok: false, message: 'This live has ended' });
            return;
          }
          await liveRoomService.joinRoom({
            channel,
            userId: socket.userId,
            displayName,
            asHost: false,
          });
        }

        if (currentChannel) socket.leave(`live:${currentChannel}`);
        currentChannel = channel;
        socket.join(`live:${channel}`);
        socket.data.liveChannel = channel;
        socket.data.liveDisplayName = displayName;
        socket.data.isHost = isHost;

        try {
          await liveRoomService.touchHeartbeat(channel, socket.userId);
        } catch (hbErr) {
          console.warn('live:join heartbeat', hbErr.message);
        }

        let state = null;
        try {
          state = await liveRoomService.buildSnapshot(channel);
        } catch (snapErr) {
          console.error('live:join snapshot', snapErr.message);
        }
        if (!state) {
          state = {
            channel,
            type: roomType,
            hostId: isHost ? socket.userId : existingRoom?.host_user_id,
            hostName: displayName,
            viewers: 1,
            messages: [],
            gifts: [],
            seats: [],
          };
        }
        socket.emit('live:state', state);
        socket.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:viewer_count', { viewers: state?.viewers || 0 });

        safeAck(ack, answeredRef, { ok: true, state, isHost });
      } catch (err) {
        console.error('live:join', err.message);
        safeAck(ack, answeredRef, { ok: false, message: err.message || 'Room join failed' });
      } finally {
        clearTimeout(joinTimer);
      }
    });

    socket.on('live:heartbeat', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      if (!channel) return;
      await liveRoomService.touchHeartbeat(channel, socket.userId);
    });

    socket.on('live:kick', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomHost(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host can kick' });
          return;
        }
        const targetUserId = String(payload?.userId || '');
        if (!targetUserId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        await liveRoomService.kickMember({
          channel,
          userId: targetUserId,
          bannedBy: socket.userId,
          reason: payload?.reason || 'kicked_by_host',
        });
        io.to(`live:${channel}`).emit('live:kicked', { userId: targetUserId, channel });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:chat', async (payload) => {
      try {
        if (!rateLimit(socket, 'chat', MAX_CHAT_PER_WINDOW)) return;

        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const room = await liveRoomService.findByChannel(channel);
        if (!room) return;

        const text = String(payload?.text || '')
          .replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, 280);
        if (!text) return;

        const displayName = socket.data.liveDisplayName || 'User';
        const eventId = await liveRoomService.logChatEvent(room.id, socket.userId, {
          user: displayName,
          text,
          lvl: payload?.lvl || 1,
        });

        const msg = {
          id: eventId ? `evt-${eventId}` : `${Date.now()}-${socket.userId}`,
          type: 'chat',
          userId: socket.userId,
          user: displayName,
          lvl: payload?.lvl || 1,
          text,
          at: Date.now(),
        };

        io.to(`live:${channel}`).emit('live:chat', msg);
      } catch (err) {
        console.error('live:chat', err.message);
      }
    });

    socket.on('live:gift', async (payload, ack) => {
      try {
        if (!rateLimit(socket, 'gift', MAX_GIFT_PER_WINDOW)) {
          if (ack) ack({ ok: false, message: 'Too many gifts \u2014 slow down' });
          return;
        }

        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }

        const canGift = await permissionService.userHasPermission(socket.userId, 'wallet.gift');
        if (!canGift) {
          if (ack) ack({ ok: false, message: 'No permission to send gifts' });
          return;
        }

        const coinAmount = parseInt(payload?.amount, 10);
        if (!coinAmount || coinAmount <= 0) {
          if (ack) ack({ ok: false, message: 'Invalid gift amount' });
          return;
        }

        const receiverId = String(payload?.toUserId || room.host_user_id || '');
        if (!receiverId) {
          if (ack) ack({ ok: false, message: 'Receiver not found' });
          return;
        }

        const result = await giftService.sendGift({
          senderId: socket.userId,
          receiverId,
          liveRoomId: room.id,
          giftType: payload?.giftSlug || payload?.giftType || payload?.emoji || 'gift',
          coinAmount,
        });

        const gift = {
          id: result.gift.id,
          from: socket.data.liveDisplayName || 'User',
          to: String(payload?.to || room.host_display_name || 'Host').slice(0, 32),
          emoji: payload?.emoji || '\u{1F381}',
          amount: coinAmount,
          qty: payload?.qty || 1,
          at: Date.now(),
        };

        io.to(`live:${channel}`).emit('live:gift', gift);
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);

        const pkBattleService = require('../services/pkBattleService');
        const battle = await pkBattleService.getActiveBattleByChannel(channel);
        if (battle?.status === 'active') {
          const pkSnapshot = await pkBattleService.getBattleSnapshot(battle.id);
          io.to(`live:${channel}`).emit('pk:score', pkSnapshot);
        }

        if (ack) ack({ ok: true, data: { gift, balance: result } });
      } catch (err) {
        console.error('live:gift', err.message);
        if (ack) {
          ack({
            ok: false,
            message: err.code === 'INSUFFICIENT_BALANCE' ? 'Insufficient coins' : err.message,
          });
        }
      }
    });

    socket.on('live:mute', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      const room = await liveRoomService.findByChannel(channel);
      if (!room) return;
      const targetUserId = String(payload?.userId || socket.userId);
      if (targetUserId !== socket.userId && !(await isRoomHost(socket, channel))) return;
      const muted = payload?.muted !== false;
      await liveRoomService.setMemberMuted(room.id, targetUserId, muted);
      io.to(`live:${channel}`).emit('live:member_mute', {
        channel,
        userId: targetUserId,
        muted,
        at: Date.now(),
      });
    });

    socket.on('live:seat_request', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      if (!channel || (await isRoomHost(socket, channel))) return;
      io.to(`live:${channel}`).emit('live:seat_request', {
        userId: socket.userId,
        name: String(payload?.name || socket.data.liveDisplayName || 'Guest').slice(0, 32),
        at: Date.now(),
      });
    });

    socket.on('live:seat_response', async (payload) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel || !(await isRoomHost(socket, channel))) return;
        const userId = String(payload?.userId || '');
        if (!userId) return;
        const accepted = payload?.accepted !== false;

        if (accepted) {
          await liveRoomService.promoteToSpeaker({
            channel,
            userId,
            displayName: payload?.name,
          });
          const state = await liveRoomService.buildSnapshot(channel);
          io.to(`live:${channel}`).emit('live:state', state);
        }

        io.to(`live:${channel}`).emit('live:seat_response', {
          userId,
          accepted,
          at: Date.now(),
        });
      } catch (err) {
        console.error('live:seat_response', err.message);
      }
    });

    socket.on('live:end', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomHost(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host can end room' });
          return;
        }
        await liveRoomService.endRoom(channel);
        io.to(`live:${channel}`).emit('live:ended', { channel });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    const handleLeave = async ({ intentional = false } = {}) => {
      if (!currentChannel) return;
      const channel = currentChannel;
      const wasHost = Boolean(socket.data.isHost);
      currentChannel = null;
      socket.leave(`live:${channel}`);

      try {
        if (wasHost) {
          // Only end the room when the host explicitly leaves — not on brief socket drops
          // (mobile network / polling→websocket upgrade used to kill live for everyone).
          if (intentional) {
            await liveRoomService.endRoom(channel, 'host_left');
            io.to(`live:${channel}`).emit('live:ended', { channel });
          }
          return;
        }

        const updated = await liveRoomService.leaveRoom({
          channel,
          userId: socket.userId,
        });
        if (updated) {
          io.to(`live:${channel}`).emit('live:viewer_count', { viewers: updated.viewer_count });
          const state = await liveRoomService.buildSnapshot(channel);
          if (state) io.to(`live:${channel}`).emit('live:state', state);
          if (updated.viewer_count === 0) {
            await liveRoomService.endRoom(channel, 'empty_room');
            io.to(`live:${channel}`).emit('live:ended', { channel });
          }
        }
      } catch (err) {
        console.error('live:leave', err.message);
      }
    };

    socket.on('live:leave', () => handleLeave({ intentional: true }));

    socket.on('disconnect', async () => {
      if (!currentChannel) return;
      const channel = currentChannel;
      const wasHost = Boolean(socket.data.isHost);
      currentChannel = null;
      socket.leave(`live:${channel}`);

      if (wasHost) {
        // Host drop: room stays live; heartbeat prune + rejoin handles recovery.
        return;
      }

      // Viewer drop: grace period before DB leave (mobile background / brief network loss).
      // pruneStaleMembers (120s) removes stale rows; immediate leave caused unwanted ejects.
    });
  });
}

module.exports = { registerLiveSocket };
