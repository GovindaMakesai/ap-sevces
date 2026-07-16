const { getAccessTokenFromRequest } = require('../services/authTokenService');
const giftService = require('../services/giftService');
const liveRoomService = require('../services/liveRoomService');
const partyActivityService = require('../services/partyActivityService');
const permissionService = require('../services/permissionService');
const chatModerationService = require('../services/chatModerationService');
const db = require('../config/database');

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
  return liveRoomService.isRoomOwner(channel, socket.userId);
}

async function isRoomModerator(socket, channel) {
  return liveRoomService.isRoomModerator(channel, socket.userId);
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
      const userRes = await db.query(
        `SELECT is_active FROM users WHERE id = $1`,
        [decoded.userId]
      );
      if (!userRes.rows[0] || userRes.rows[0].is_active === false) {
        return next(new Error('Your account has been deactivated'));
      }
      socket.userId = String(decoded.userId);
      socket.userRole = decoded.role || null;
      socket.data.displayName =
        String(decoded.first_name || decoded.name || 'User').trim().slice(0, 32) || 'User';
      return next();
    } catch (_err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    let currentChannel = null;
    if (socket.userId) socket.join(`user:${socket.userId}`);

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
        if (existingRoom) {
          const ban = await liveRoomService.getActiveBan(existingRoom.id, socket.userId);
          if (ban) {
            const info = liveRoomService.banBlockPayload(ban);
            safeAck(ack, answeredRef, {
              ok: false,
              ...info,
            });
            return;
          }
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
          if (existingRoom.is_locked && !isHost) {
            const pwdOk = await liveRoomService.verifyRoomPassword(channel, payload?.password);
            if (!pwdOk) {
              safeAck(ack, answeredRef, {
                ok: false,
                message: 'This room is locked — enter the password',
                needsPassword: true,
              });
              return;
            }
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
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:viewer_count', { viewers: state?.viewers || 0 });

        safeAck(ack, answeredRef, { ok: true, state, isHost });

        try {
          const roomRow = await liveRoomService.findByChannel(channel);
          if (roomRow?.id) {
            await partyActivityService.recordActivity(socket.userId, 'join_room', {
              liveRoomId: roomRow.id,
              metadata: { channel },
            });
          }
        } catch (_actErr) {}
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

    socket.on('live:request_state', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel) {
          if (ack) ack({ ok: false, message: 'channel required' });
          return;
        }
        const state = await liveRoomService.buildSnapshot(channel);
        if (!state) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }
        if (ack) ack({ ok: true, state });
        else socket.emit('live:state', state);
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not load room state' });
      }
    });

    socket.on('live:kick', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can kick' });
          return;
        }
        const targetUserId = String(payload?.userId || '');
        if (!targetUserId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (room && String(room.host_user_id) === targetUserId) {
          if (ack) ack({ ok: false, message: 'Cannot remove the room host' });
          return;
        }
        const rawDuration =
          payload?.durationHours !== undefined
            ? payload.durationHours
            : payload?.duration_hours !== undefined
              ? payload.duration_hours
              : 2;
        const kickResult = await liveRoomService.kickMember({
          channel,
          userId: targetUserId,
          bannedBy: socket.userId,
          reason: payload?.reason || 'kicked_by_host',
          durationHours: rawDuration,
        });
        const banInfo =
          kickResult.ban ||
          liveRoomService.banBlockPayload({
            reason: payload?.reason || 'kicked_by_host',
            expires_at: kickResult.expiresAt,
          });
        const kickPayload = {
          userId: targetUserId,
          channel,
          expiresAt: banInfo?.expiresAt || kickResult.expiresAt || null,
          remainingHours: banInfo?.remainingHours ?? null,
          permanent: Boolean(banInfo?.permanent),
          message: banInfo?.message || 'You were blocked from this live',
          reason: payload?.reason || 'kicked_by_host',
        };
        io.to(`live:${channel}`).emit('live:kicked', kickPayload);

        /* Force-leave every socket for that user so they cannot linger in the room */
        try {
          const sockets = await io.fetchSockets();
          for (const s of sockets) {
            if (String(s.userId) !== targetUserId) continue;
            s.leave(`live:${channel}`);
            if (s.data?.liveChannel === channel) s.data.liveChannel = null;
            s.emit('live:kicked', kickPayload);
          }
        } catch (forceErr) {
          console.warn('live:kick force leave', forceErr.message);
          io.to(`user:${targetUserId}`).emit('live:kicked', kickPayload);
        }

        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        if (ack) {
          ack({
            ok: true,
            expiresAt: kickPayload.expiresAt,
            remainingHours: kickPayload.remainingHours,
            permanent: kickPayload.permanent,
            message: kickPayload.message,
          });
        }
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:chat', async (payload, ack) => {
      try {
        if (!rateLimit(socket, 'chat', MAX_CHAT_PER_WINDOW)) {
          if (ack) ack({ ok: false, message: 'Sending too fast — slow down' });
          return;
        }

        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }

        if (await liveRoomService.isUserBanned(room.id, socket.userId)) {
          if (ack) ack({ ok: false, message: 'You are blocked from this room' });
          return;
        }

        if (await liveRoomService.isMemberChatMuted(room.id, socket.userId)) {
          if (ack) ack({ ok: false, message: 'You are muted from chat by the host' });
          return;
        }

        if (room.is_chat_locked && !(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Host muted all chat in this live' });
          return;
        }

        const text = String(payload?.text || '')
          .replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, 280);
        if (!text) {
          if (ack) ack({ ok: false, message: 'Empty message' });
          return;
        }

        const displayName = socket.data.liveDisplayName || 'User';
        const isMod = await isRoomModerator(socket, channel);

        /* Auto-moderate abusive / sexual language — applies to everyone including hosts */
        const scan = chatModerationService.scanMessage(text);
        if (scan.blocked) {
          /* Hosts/admins: block the message only (never mute/kick themselves out of their room) */
          if (isMod) {
            if (ack) {
              ack({
                ok: false,
                code: 'ABUSE_WARN',
                strikes: 0,
                action: 'warn',
                message:
                  'This message was blocked. Sexual / abusive language is not allowed in live chat — including for hosts.',
              });
            }
            return;
          }

          const strike = chatModerationService.recordStrike(channel, socket.userId);
          const alert = {
            type: 'abuse',
            channel,
            userId: String(socket.userId),
            user: displayName,
            strikes: strike.strikes,
            action: strike.action,
            at: Date.now(),
          };
          io.to(`live:${channel}`).emit('live:mod_alert', alert);
          if (room.host_user_id) {
            io.to(`user:${room.host_user_id}`).emit('live:mod_alert', alert);
          }

          if (strike.action === 'mute') {
            try {
              await liveRoomService.setMemberChatMuted(room.id, socket.userId, true);
              io.to(`live:${channel}`).emit('live:member_chat_mute', {
                channel,
                userId: String(socket.userId),
                muted: true,
                reason: 'abusive_language',
                at: Date.now(),
              });
            } catch (_muteErr) { /* continue */ }
          }

          if (strike.action === 'ban') {
            try {
              const kickResult = await liveRoomService.kickMember({
                channel,
                userId: socket.userId,
                bannedBy: room.host_user_id || socket.userId,
                reason: 'abusive_chat',
                durationHours: strike.banHours || chatModerationService.BAN_HOURS,
              });
              const banInfo =
                kickResult.ban ||
                liveRoomService.banBlockPayload({
                  reason: 'abusive_chat',
                  expires_at: kickResult.expiresAt,
                });
              const kickPayload = {
                userId: String(socket.userId),
                channel,
                expiresAt: banInfo?.expiresAt || kickResult.expiresAt || null,
                remainingHours: banInfo?.remainingHours ?? strike.banHours,
                permanent: Boolean(banInfo?.permanent),
                message: strike.message,
                reason: 'abusive_chat',
              };
              io.to(`live:${channel}`).emit('live:kicked', kickPayload);
              socket.leave(`live:${channel}`);
              socket.data.liveChannel = null;
              socket.emit('live:kicked', kickPayload);
              const state = await liveRoomService.buildSnapshot(channel);
              if (state) io.to(`live:${channel}`).emit('live:state', state);
            } catch (_banErr) { /* still reject message */ }
          }

          if (ack) {
            ack({
              ok: false,
              code: `ABUSE_${String(strike.action || 'warn').toUpperCase()}`,
              strikes: strike.strikes,
              action: strike.action,
              message: strike.userMessage || strike.message,
            });
          }
          return;
        }

        const profilePic = await liveRoomService.getMemberProfilePic(socket.userId);
        const eventId = await liveRoomService.logChatEvent(room.id, socket.userId, {
          user: displayName,
          text,
          lvl: payload?.lvl || 1,
          profilePic,
        });

        const msg = {
          id: eventId ? `evt-${eventId}` : `${Date.now()}-${socket.userId}`,
          type: 'chat',
          userId: socket.userId,
          user: displayName,
          profilePic,
          role: socket.userRole || null,
          lvl: payload?.lvl || 1,
          text,
          at: Date.now(),
        };

        io.to(`live:${channel}`).emit('live:chat', msg);
        if (ack) ack({ ok: true, id: msg.id });
      } catch (err) {
        console.error('live:chat', err.message);
        if (ack) ack({ ok: false, message: err.message || 'Could not send' });
      }
    });

    socket.on('live:chat_delete', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can remove messages' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }
        const deleted = await liveRoomService.softDeleteChatEvent({
          liveRoomId: room.id,
          messageId: payload?.messageId || payload?.id,
          deletedBy: socket.userId,
        });
        io.to(`live:${channel}`).emit('live:chat_deleted', {
          channel,
          id: deleted.id,
          userId: deleted.userId,
          by: socket.userId,
          at: Date.now(),
        });
        if (ack) ack({ ok: true, id: deleted.id });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not remove message' });
      }
    });

    socket.on('live:chat_mute', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can mute chat' });
          return;
        }
        const targetUserId = String(payload?.userId || '');
        if (!targetUserId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }
        if (String(room.host_user_id) === targetUserId) {
          if (ack) ack({ ok: false, message: 'Cannot mute the host from chat' });
          return;
        }
        const muted = payload?.muted !== false;
        await liveRoomService.setMemberChatMuted(room.id, targetUserId, muted);
        io.to(`live:${channel}`).emit('live:member_chat_mute', {
          channel,
          userId: targetUserId,
          muted,
          at: Date.now(),
        });
        if (ack) ack({ ok: true, muted });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not mute chat' });
      }
    });

    socket.on('live:chat_lock', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can mute all chat' });
          return;
        }
        const locked = payload?.locked !== false;
        await liveRoomService.setRoomChatLocked({ channel, locked });
        io.to(`live:${channel}`).emit('live:chat_lock', {
          channel,
          locked,
          by: socket.userId,
          at: Date.now(),
        });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        if (ack) ack({ ok: true, locked });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not update chat lock' });
      }
    });

    socket.on('live:chat_mute_all', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can mute everyone' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }
        const muted = payload?.muted !== false;
        await liveRoomService.muteAllMembersChat({
          liveRoomId: room.id,
          muted,
          excludeUserIds: [socket.userId, room.host_user_id],
        });
        io.to(`live:${channel}`).emit('live:chat_mute_all', {
          channel,
          muted,
          by: socket.userId,
          at: Date.now(),
        });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        if (ack) ack({ ok: true, muted });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not mute everyone' });
      }
    });

    socket.on('live:chat_clear', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can clear chat' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          if (ack) ack({ ok: false, message: 'Room not found' });
          return;
        }
        const result = await liveRoomService.clearRoomChat({
          liveRoomId: room.id,
          clearedBy: socket.userId,
        });
        io.to(`live:${channel}`).emit('live:chat_cleared', {
          channel,
          cleared: result.cleared,
          by: socket.userId,
          at: Date.now(),
        });
        if (ack) ack({ ok: true, cleared: result.cleared });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message || 'Could not clear chat' });
      }
    });

    socket.on('live:gift', async (payload, ack) => {
      const answeredRef = { answered: false };
      const giftTimer = setTimeout(() => {
        safeAck(ack, answeredRef, { ok: false, message: 'Gift timed out' });
      }, 12000);
      try {
        if (!rateLimit(socket, 'gift', MAX_GIFT_PER_WINDOW)) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'Too many gifts \u2014 slow down' });
          return;
        }

        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const room = await liveRoomService.findByChannel(channel);
        if (!room) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'Room not found' });
          return;
        }

        const canGift = await permissionService.userHasPermission(socket.userId, 'wallet.gift');
        if (!canGift) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'No permission to send gifts' });
          return;
        }

        const coinAmount = parseInt(payload?.amount, 10);
        if (!coinAmount || coinAmount <= 0) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'Invalid gift amount' });
          return;
        }

        let receiverId = String(payload?.toUserId || '').trim();
        const senderId = String(socket.userId);
        const hostId = String(room.host_user_id || '');

        /* Never trust empty / self / garbage ids — viewers gift host by default */
        if (!receiverId || receiverId === senderId || receiverId === 'null' || receiverId === 'undefined') {
          receiverId = hostId;
        }

        /* If target is not host, they must still be in this room (seat / member) */
        if (receiverId && receiverId !== hostId) {
          const inRoom = await db.query(
            `SELECT 1 FROM live_room_members
             WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
             LIMIT 1`,
            [room.id, receiverId]
          ).catch(() => ({ rows: [] }));
          if (!inRoom.rows?.length) {
            receiverId = hostId;
          }
        }

        if (!receiverId) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'Receiver not found' });
          return;
        }
        if (receiverId === senderId) {
          clearTimeout(giftTimer);
          safeAck(ack, answeredRef, { ok: false, message: 'Pick someone else — you cannot gift yourself' });
          return;
        }

        const fromName = socket.data.liveDisplayName || socket.data.displayName || 'User';
        const toName = String(payload?.to || room.host_display_name || 'Host').slice(0, 32);
        const giftEmoji = payload?.emoji || '\u{1F381}';
        const result = await giftService.sendGift({
          senderId: socket.userId,
          receiverId,
          liveRoomId: room.id,
          giftType: payload?.giftSlug || payload?.giftType || payload?.emoji || 'gift',
          coinAmount,
          qty: payload?.qty || 1,
          emoji: giftEmoji,
          fromName,
          toName,
        });

        const charged = Number(result.gift?.coin_amount || coinAmount);
        const gift = {
          id: result.gift.id,
          gift_tx_id: result.gift.id,
          from: fromName,
          fromUserId: socket.userId,
          to: toName,
          toUserId: receiverId,
          emoji: giftEmoji,
          amount: charged,
          coins: charged,
          qty: payload?.qty || 1,
          at: Date.now(),
        };

        /* Ack immediately so Send never stays stuck on buildSnapshot / PK follow-up */
        clearTimeout(giftTimer);
        safeAck(ack, answeredRef, {
          ok: true,
          data: {
            gift,
            balance: result.sender_balance || null,
            platform_fee: result.platform_fee,
            creator_amount: result.creator_amount,
          },
        });

        /* Room broadcast only — sender is already in live:{channel}; a second
           socket.emit made gift banners/chat appear 2–3× for the sender. */
        io.to(`live:${channel}`).emit('live:gift', gift);

        try {
          const state = await liveRoomService.buildSnapshot(channel);
          io.to(`live:${channel}`).emit('live:state', state);
        } catch (_snapErr) {}

        try {
          const pkBattleService = require('../services/pkBattleService');
          const battle = await pkBattleService.getActiveBattleByChannel(channel);
          if (battle?.status === 'active') {
            const pkSnapshot = await pkBattleService.getBattleSnapshot(battle.id);
            io.to(`live:${channel}`).emit('pk:score', pkSnapshot);
          }
        } catch (_pkErr) {}

        try {
          await partyActivityService.recordActivity(socket.userId, 'send_gift', {
            liveRoomId: room.id,
            metadata: { receiverId, amount: charged },
          });
          await partyActivityService.recordActivity(receiverId, 'receive_gift', {
            liveRoomId: room.id,
            metadata: { senderId: socket.userId, amount: charged },
          });
        } catch (_actErr) {}
      } catch (err) {
        clearTimeout(giftTimer);
        console.error('live:gift', err.message);
        safeAck(ack, answeredRef, {
          ok: false,
          message:
            err.code === 'INSUFFICIENT_BALANCE'
              ? err.message && /gift coin/i.test(err.message)
                ? err.message
                : 'Insufficient coins'
              : err.message || 'Gift failed',
        });
      }
    });

    socket.on('live:mute', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || currentChannel);
      const room = await liveRoomService.findByChannel(channel);
      if (!room) return;
      const targetUserId = String(payload?.userId || socket.userId);
      if (targetUserId !== socket.userId && !(await isRoomModerator(socket, channel))) return;
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
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel || (await isRoomHost(socket, channel))) return;
        const displayName = String(
          payload?.name || socket.data.liveDisplayName || 'Guest'
        )
          .trim()
          .slice(0, 32);
        /* Keep membership alive so host accept does not fail with "not in room" */
        try {
          await liveRoomService.ensureMemberInRoom({
            channel,
            userId: socket.userId,
            displayName,
          });
          await liveRoomService.touchHeartbeat(channel, socket.userId);
        } catch (ensErr) {
          console.warn('live:seat_request ensure member', ensErr.message);
        }
        await liveRoomService.addSeatRequest(channel, socket.userId, displayName);
        let profilePic = null;
        try {
          profilePic = await liveRoomService.getMemberProfilePic(socket.userId);
        } catch (_e) {
          profilePic = null;
        }
        const payloadOut = {
          userId: socket.userId,
          name: displayName || 'Guest',
          profilePic,
          at: Date.now(),
        };
        io.to(`live:${channel}`).emit('live:seat_request', payloadOut);
        /* Also ping host + room admins so Agree/Decline is not missed */
        try {
          const room = await liveRoomService.findByChannel(channel);
          if (room?.host_user_id) {
            io.to(`user:${room.host_user_id}`).emit('live:seat_request', payloadOut);
          }
          if (room?.id) {
            const admins = await liveRoomService.listRoomAdminUserIds?.(room.id);
            if (Array.isArray(admins)) {
              admins.forEach((adminId) => {
                if (adminId && String(adminId) !== String(room.host_user_id)) {
                  io.to(`user:${adminId}`).emit('live:seat_request', payloadOut);
                }
              });
            }
          }
        } catch (_e) { /* ignore */ }
      } catch (err) {
        console.error('live:seat_request', err.message);
      }
    });

    socket.on('live:seat_response', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel || !(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can manage seats' });
          return;
        }
        const userId = String(payload?.userId || '');
        if (!userId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        const accepted = payload?.accepted !== false;

        if (accepted) {
          await liveRoomService.promoteToSpeaker({
            channel,
            userId,
            displayName: payload?.name,
            seatIndex: payload?.seatIndex ?? payload?.seat_index ?? null,
          });
          const state = await liveRoomService.buildSnapshot(channel);
          io.to(`live:${channel}`).emit('live:state', state);
        }

        await liveRoomService.removeSeatRequest(channel, userId);

        const seatPayload = {
          userId,
          accepted,
          at: Date.now(),
        };
        io.to(`live:${channel}`).emit('live:seat_response', seatPayload);
        io.to(`user:${userId}`).emit('live:seat_response', seatPayload);
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('live:seat_response', err.message);
        if (ack) ack({ ok: false, message: err.message || 'Seat update failed' });
      }
    });

    socket.on('live:guest_mic_ready', (payload) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!channel) return;
        io.to(`live:${channel}`).emit('live:guest_mic_ready', {
          userId: payload?.userId != null ? String(payload.userId) : '',
          agoraUid: payload?.agoraUid,
          at: Date.now(),
        });
      } catch (err) {
        console.error('live:guest_mic_ready', err.message);
      }
    });

    socket.on('live:admin_grant', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomHost(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only the room owner can grant admin' });
          return;
        }
        const userId = String(payload?.userId || '');
        if (!userId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        await liveRoomService.setMemberAdmin({ channel, userId, isAdmin: true });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:admin_changed', { userId, isAdmin: true });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:admin_revoke', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const userId = String(payload?.userId || '');
        if (!userId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        const asHost = await isRoomHost(socket, channel);
        const asMod = await isRoomModerator(socket, channel);
        if (!asHost && !asMod) {
          if (ack) ack({ ok: false, message: 'Only host or room admin can remove admin' });
          return;
        }
        if (await liveRoomService.isRoomOwner(channel, userId)) {
          if (ack) ack({ ok: false, message: 'Cannot remove admin from the room owner' });
          return;
        }
        /* Room admins may demote other admins; only the host can demote anyone including self-service via UI */
        if (!asHost && String(userId) === String(socket.userId)) {
          if (ack) ack({ ok: false, message: 'Ask the host to remove your admin role' });
          return;
        }
        await liveRoomService.setMemberAdmin({ channel, userId, isAdmin: false });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:admin_changed', { userId, isAdmin: false });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:room_lock', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomHost(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only the room owner can lock the room' });
          return;
        }
        await liveRoomService.setRoomLock({
          channel,
          locked: payload?.locked !== false,
          password: payload?.password,
        });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:room_lock', {
          locked: payload?.locked !== false,
          channel,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:seat_move', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const userId = String(payload?.userId || socket.userId);
        const seatIndex = payload?.seatIndex;
        const selfMove = userId === String(socket.userId);
        if (!selfMove && !(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Not allowed to move this user' });
          return;
        }
        await liveRoomService.moveMemberSeat({ channel, userId, seatIndex });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:seat_moved', { userId, seatIndex });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:demote_speaker', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        const userId = String(payload?.userId || '');
        if (!userId) {
          if (ack) ack({ ok: false, message: 'userId required' });
          return;
        }
        const selfLeave = String(socket.userId) === userId;
        if (!selfLeave && !(await isRoomModerator(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host or admin can remove from seat' });
          return;
        }
        const room = await liveRoomService.findByChannel(channel);
        if (room && String(room.host_user_id) === userId) {
          if (ack) ack({ ok: false, message: 'Cannot remove the room host' });
          return;
        }
        await liveRoomService.demoteSpeaker({ channel, userId });
        const state = await liveRoomService.buildSnapshot(channel);
        io.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:demoted', { userId });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:room_style', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || currentChannel);
        if (!(await isRoomHost(socket, channel))) {
          if (ack) ack({ ok: false, message: 'Only host can change background' });
          return;
        }
        const style = await liveRoomService.setRoomStyle(channel, {
          backgroundId: payload?.backgroundId,
        });
        io.to(`live:${channel}`).emit('live:room_style', style);
        if (ack) ack({ ok: true, data: style });
      } catch (err) {
        if (ack) ack({ ok: false, message: err.message });
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
      socket.data.liveChannel = null;
      socket.leave(`live:${channel}`);

      try {
        if (wasHost) {
          if (intentional) {
            const result = await liveRoomService.hostStepAway({
              channel,
              userId: socket.userId,
            });
            if (result.ended) {
              io.to(`live:${channel}`).emit('live:ended', { channel });
            } else {
              const state = await liveRoomService.buildSnapshot(channel);
              if (state) io.to(`live:${channel}`).emit('live:state', state);
              io.to(`live:${channel}`).emit('live:chat', {
                type: 'system',
                text: 'Host stepped away — room stays open for guests',
              });
            }
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
      socket.data.liveChannel = null;
      socket.leave(`live:${channel}`);

      if (wasHost) {
        // Host drop: room stays live; heartbeat prune + rejoin handles recovery.
        return;
      }

      const userId = socket.userId;
      // On-seat guests stay in the room across socket blips / Agora republish reconnects.
      // Intentional live:leave demotes them; pruneStaleMembers cleans true abandonments.
      try {
        if (await liveRoomService.isMemberOnStage(channel, userId)) return;
      } catch (_e) { }

      // Audience drop: grace period before DB leave (mobile background / brief network loss).
      // Reconnect creates a new socket — never wipe if another socket is already back in-room.
      setTimeout(async () => {
        try {
          if (socket.connected) return;
          try {
            if (await liveRoomService.isMemberOnStage(channel, userId)) return;
          } catch (_e0) { }
          let stillInRoom = false;
          try {
            const socketsInRoom = await io.in(`live:${channel}`).fetchSockets();
            stillInRoom = socketsInRoom.some((s) => String(s.userId) === String(userId));
          } catch (_e) {
            stillInRoom = false;
          }
          if (stillInRoom) return;
          try {
            const userSockets = await io.in(`user:${userId}`).fetchSockets();
            if (
              userSockets.some(
                (s) => s.connected && String(s.data?.liveChannel || '') === String(channel)
              )
            ) {
              return;
            }
          } catch (_e2) { }
          if (await liveRoomService.isMemberRecentlySeen(channel, userId, 30)) return;

          const updated = await liveRoomService.leaveRoom({ channel, userId });
          if (updated) {
            io.to(`live:${channel}`).emit('live:viewer_count', { viewers: updated.viewer_count });
            const state = await liveRoomService.buildSnapshot(channel);
            if (state) io.to(`live:${channel}`).emit('live:state', state);
          }
        } catch (_e) {}
      }, 45000);
    });
  });
}

module.exports = { registerLiveSocket };
