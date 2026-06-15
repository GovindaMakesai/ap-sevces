/**
 * Live socket ΓÇö JWT auth, DB-backed rooms, server-side gift debits.
 * TODO: Redis adapter for multi-instance socket scaling.
 */
const jwt = require('jsonwebtoken');
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

function registerLiveSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

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
      try {
        const channel = sanitizeChannel(payload?.channel);
        if (!channel) {
          if (ack) ack({ ok: false, message: 'channel required' });
          return;
        }

        const canJoin = await permissionService.userHasPermission(socket.userId, 'live.join');
        if (!canJoin) {
          console.warn('[live] live.join RBAC missing for user', socket.userId, '— allowing authenticated user');
        }

        const displayName =
          String(payload?.displayName || socket.data.displayName || 'User').trim().slice(0, 32) ||
          'User';
        const isHost = Boolean(payload?.isHost);
        const roomType = payload?.type === 'live' ? 'live' : 'party';

        const existingRoom = await liveRoomService.findByChannel(channel);
        if (existingRoom && !isHost && (await liveRoomService.isUserBanned(existingRoom.id, socket.userId))) {
          if (ack) ack({ ok: false, message: 'You are banned from this room' });
          return;
        }

        if (isHost) {
          await liveRoomService.hostRoom({
            channel,
            roomType,
            hostUserId: socket.userId,
            hostDisplayName: displayName,
          });
        } else {
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

        const state = await liveRoomService.buildSnapshot(channel);
        socket.emit('live:state', state);
        socket.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:viewer_count', { viewers: state?.viewers || 0 });

        if (ack) ack({ ok: true, state });
      } catch (err) {
        console.error('live:join', err.message);
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:heartbeat', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      if (!channel) return;
      await liveRoomService.touchHeartbeat(channel, socket.userId);
    });

    socket.on('live:kick', async (payload, ack) => {
      try {
        if (!socket.data.isHost) {
          if (ack) ack({ ok: false, message: 'Only host can kick' });
          return;
        }
        const channel = sanitizeChannel(payload?.channel || currentChannel);
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

        const text = String(payload?.text || '').trim().slice(0, 280);
        if (!text) return;

        const msg = {
          id: Date.now() + '-' + socket.userId,
          type: payload?.type === 'system' ? 'system' : 'chat',
          userId: socket.userId,
          user: socket.data.liveDisplayName || 'User',
          lvl: payload?.lvl || 1,
          text,
          at: Date.now(),
        };

        await liveRoomService.logChatEvent(room.id, socket.userId, {
          user: msg.user,
          text: msg.text,
          lvl: msg.lvl,
        });

        io.to(`live:${channel}`).emit('live:chat', msg);
      } catch (err) {
        console.error('live:chat', err.message);
      }
    });

    socket.on('live:gift', async (payload, ack) => {
      try {
        if (!rateLimit(socket, 'gift', MAX_GIFT_PER_WINDOW)) {
          if (ack) ack({ ok: false, message: 'Too many gifts ΓÇö slow down' });
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
          giftType: payload?.emoji || payload?.giftType || 'gift',
          coinAmount,
        });

        const gift = {
          id: result.gift.id,
          from: socket.data.liveDisplayName || 'User',
          to: String(payload?.to || room.host_display_name || 'Host').slice(0, 32),
          emoji: payload?.emoji || '≡ƒÄü',
          amount: coinAmount,
          at: Date.now(),
        };

        io.to(`live:${channel}`).emit('live:gift', gift);
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);

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
      if (targetUserId !== socket.userId && !socket.data.isHost) return;
      await liveRoomService.setMemberMuted(room.id, targetUserId, payload?.muted !== false);
      const state = await liveRoomService.buildSnapshot(channel);
      io.to(`live:${channel}`).emit('live:state', state);
    });

    socket.on('live:seat_request', (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      if (!channel || socket.data.isHost) return;
      io.to(`live:${channel}`).emit('live:seat_request', {
        userId: socket.userId,
        name: String(payload?.name || socket.data.liveDisplayName || 'Guest').slice(0, 32),
        at: Date.now(),
      });
    });

    socket.on('live:seat_response', async (payload) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel || !socket.data.isHost) return;
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
        if (!socket.data.isHost) {
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

    const handleLeave = async () => {
      if (!currentChannel) return;
      try {
        const updated = await liveRoomService.leaveRoom({
          channel: currentChannel,
          userId: socket.userId,
        });
        if (updated) {
          io.to(`live:${currentChannel}`).emit('live:viewer_count', { viewers: updated.viewer_count });
          const state = await liveRoomService.buildSnapshot(currentChannel);
          io.to(`live:${currentChannel}`).emit('live:state', state);
        }
      } catch (err) {
        console.error('live:leave', err.message);
      }
      socket.leave(`live:${currentChannel}`);
      currentChannel = null;
    };

    socket.on('live:leave', handleLeave);
    socket.on('disconnect', handleLeave);
  });
}

module.exports = { registerLiveSocket };
