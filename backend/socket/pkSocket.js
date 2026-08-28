const crypto = require('crypto');
const db = require('../config/database');
const pkBattleService = require('../services/pkBattleService');
const liveRoomService = require('../services/liveRoomService');
const permissionService = require('../services/permissionService');

function sanitizeChannel(raw) {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/** Find live/party channel where user is currently host */
async function resolveUserHostChannel(userId) {
  if (!userId) return '';
  try {
    const res = await db.query(
      `SELECT channel FROM live_rooms
       WHERE host_user_id = $1 AND status = 'active'
       ORDER BY updated_at DESC NULLS LAST, started_at DESC NULLS LAST
       LIMIT 1`,
      [userId]
    );
    if (res.rows[0]?.channel) return sanitizeChannel(res.rows[0].channel);
  } catch (_e) {
    /* ignore — fall through */
  }
  try {
    const rooms = await liveRoomService.listActiveRooms({ limit: 80, sort: 'trending' });
    const hit = (rooms || []).find((r) => String(r.host_user_id) === String(userId));
    if (hit?.channel) return sanitizeChannel(hit.channel);
  } catch (_e) {
    /* ignore */
  }
  return '';
}

function collectPkUserIds(snapshot) {
  const userIds = new Set();
  (snapshot?.participants || []).forEach((p) => {
    if (p?.user_id) userIds.add(String(p.user_id));
    if (p?.userId) userIds.add(String(p.userId));
  });
  if (snapshot?.challengerUserId) userIds.add(String(snapshot.challengerUserId));
  if (snapshot?.rivalUserId) userIds.add(String(snapshot.rivalUserId));
  if (snapshot?.battle?.host_user_id) userIds.add(String(snapshot.battle.host_user_id));
  return userIds;
}

function collectPkChannels(snapshot, channels = []) {
  const chans = new Set((channels || []).map(sanitizeChannel).filter(Boolean));
  if (snapshot?.challengerChannel) chans.add(sanitizeChannel(snapshot.challengerChannel));
  if (snapshot?.rivalChannel) chans.add(sanitizeChannel(snapshot.rivalChannel));
  if (snapshot?.battle?.channel) chans.add(sanitizeChannel(snapshot.battle.channel));
  (snapshot?.linkedChannels || []).forEach((c) => {
    const ch = sanitizeChannel(c);
    if (ch) chans.add(ch);
  });
  return chans;
}

function broadcastPkToLinked(io, snapshot, channels = [], event = 'pk:start') {
  if (!snapshot) return;
  const chans = collectPkChannels(snapshot, channels);
  for (const ch of chans) {
    io.to(`live:${ch}`).emit(event, snapshot);
  }
  /* Direct user push so WebView hosts always get battle even if room join lags */
  for (const uid of collectPkUserIds(snapshot)) {
    io.to(`user:${uid}`).emit(event, snapshot);
  }
}

/** Pending cross-host / friend challenges */
const pendingChallenges = new Map();

function clearChallenge(id) {
  const c = pendingChallenges.get(id);
  if (c?.timer) clearTimeout(c.timer);
  pendingChallenges.delete(id);
}

function registerPkSocket(io) {
  io.on('connection', (socket) => {
    socket.on('pk:start', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const room = await liveRoomService.findByChannel(channel);
        if (!room) return ack?.({ ok: false, message: 'Room not found' });

        const isRoomHost =
          String(room.host_user_id) === String(socket.userId) || Boolean(socket.data.isHost);
        const can = await permissionService.userHasPermission(socket.userId, 'pk.host');
        if (!can && !isRoomHost) return ack?.({ ok: false, message: 'No PK permission' });

        /* One active battle per room */
        const existing = await pkBattleService.getActiveBattleByChannel(channel);
        if (existing) {
          if (existing.status === 'active') {
            const snap = await pkBattleService.getBattleSnapshot(existing.id);
            return ack?.({ ok: true, battle: snap, alreadyActive: true });
          }
        }

        const mode = String(payload?.mode || 'random').toLowerCase();
        /* Friend / random with a person must use challenge → accept, not solo start */
        if (
          (mode === 'friend' || mode === 'random') &&
          payload?.opponentUserId &&
          !payload?.forceStart
        ) {
          return ack?.({
            ok: false,
            message: 'Wait for opponent to accept the PK challenge',
            needsAccept: true,
          });
        }

        let format = payload?.format || '1v1';
        if (mode === 'team' && (!payload?.format || payload.format === '1v1' || payload.format === '1v2')) {
          format = '1v4';
        }
        if (!['1v1', '1v2', '1v4', '1v8'].includes(format)) format = '1v1';

        if (mode === 'friend' && !payload?.opponentUserId && !payload?.forceStart) {
          return ack?.({ ok: false, message: 'Pick a friend for Friend PK' });
        }

        const battle = await pkBattleService.createBattle({
          channel,
          liveRoomId: room.id,
          format,
          durationSeconds: payload?.durationSeconds || 300,
        });

        const hostName =
          payload?.hostName ||
          socket.data.liveDisplayName ||
          socket.data.displayName ||
          'Host';

        await pkBattleService.seedBattleSides(battle.id, {
          hostUserId: socket.userId,
          hostName,
          opponentUserId: payload?.opponentUserId || null,
          opponentName: payload?.opponentName || 'Rival',
          teammateUserIds: payload?.teammateUserIds || [],
          extraOpponents: payload?.extraOpponents || payload?.extraOpponentUserIds || [],
        });

        const started = await pkBattleService.startBattle(battle.id);
        pkBattleService.linkChannelToBattle(channel, started.id);
        const fighters = Array.isArray(payload?.fighters) ? payload.fighters : [];
        const extraChannels = [];
        fighters.forEach((f) => {
          const ch = sanitizeChannel(f?.channel);
          if (ch && ch !== channel) extraChannels.push(ch);
        });
        extraChannels.forEach((ch) => pkBattleService.linkChannelToBattle(ch, started.id));
        pkBattleService.setBattleExtras(started.id, {
          mode,
          hostName,
          rivalName: payload?.opponentName || fighters[0]?.name || 'Rival',
          opponentName: payload?.opponentName || fighters[0]?.name || 'Rival',
          challengerUserId: String(socket.userId),
          rivalUserId: payload?.opponentUserId || fighters[0]?.userId || null,
          challengerChannel: channel,
          rivalChannel: extraChannels[0] || null,
          mutual: extraChannels.length > 0,
          fighters,
        });
        if (extraChannels.length) {
          await pkBattleService.setChannelsPkStatus([channel, ...extraChannels], 'active');
        }
        const snapshot = await pkBattleService.getBattleSnapshot(started.id);
        if (snapshot) snapshot.mode = mode;
        broadcastPkToLinked(io, snapshot, snapshot?.linkedChannels || [channel], 'pk:start');
        ack?.({ ok: true, battle: snapshot });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    /**
     * Challenge another user (in-room guest or another live host).
     * Battle only starts when they accept.
     */
    socket.on('pk:challenge', async (payload, ack) => {
      try {
        const fromChannel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const targetUserId = String(payload?.userId || payload?.opponentUserId || '').trim();
        if (!fromChannel || !targetUserId) {
          return ack?.({ ok: false, message: 'Channel and opponent required' });
        }
        if (String(targetUserId) === String(socket.userId)) {
          return ack?.({ ok: false, message: 'Cannot PK yourself' });
        }
        const room = await liveRoomService.findByChannel(fromChannel);
        if (!room) return ack?.({ ok: false, message: 'Room not found' });
        const isRoomHost =
          String(room.host_user_id) === String(socket.userId) || Boolean(socket.data.isHost);
        if (!isRoomHost) return ack?.({ ok: false, message: 'Host only' });

        const existing = await pkBattleService.getActiveBattleByChannel(fromChannel);
        if (existing?.status === 'active') {
          return ack?.({ ok: false, message: 'PK already active' });
        }

        let targetChannel = sanitizeChannel(payload?.targetChannel || payload?.rivalChannel || '');
        if (!targetChannel) {
          targetChannel = await resolveUserHostChannel(targetUserId);
        }

        const mode = String(payload?.mode || 'friend').toLowerCase();
        const fromName =
          payload?.hostName ||
          socket.data.liveDisplayName ||
          room.host_display_name ||
          'Host';
        const opponentName = payload?.opponentName || 'Rival';
        const challengeId = crypto.randomBytes(12).toString('hex');

        const challenge = {
          id: challengeId,
          fromUserId: String(socket.userId),
          fromChannel,
          fromName,
          targetUserId: String(targetUserId),
          targetChannel: targetChannel || '',
          opponentName,
          mode,
          format: mode === 'team' ? payload?.format || '1v4' : '1v1',
          durationSeconds: payload?.durationSeconds || 300,
          createdAt: Date.now(),
        };
        const waitMs = Math.min(
          Math.max(Number(challenge.durationSeconds) || 300, 60),
          300
        ) * 1000;
        challenge.timer = setTimeout(() => {
          if (!pendingChallenges.has(challengeId)) return;
          clearChallenge(challengeId);
          io.to(`live:${fromChannel}`).emit('pk:challenge:timeout', {
            challengeId,
            targetUserId,
          });
          io.to(`user:${challenge.fromUserId}`).emit('pk:challenge:timeout', {
            challengeId,
            targetUserId,
          });
          if (challenge.targetChannel) {
            io.to(`live:${challenge.targetChannel}`).emit('pk:challenge:timeout', {
              challengeId,
              targetUserId,
            });
          }
        }, waitMs);
        pendingChallenges.set(challengeId, challenge);

        const packet = {
          challengeId,
          channel: fromChannel,
          fromChannel,
          fromUserId: challenge.fromUserId,
          fromName,
          targetUserId: challenge.targetUserId,
          targetChannel: challenge.targetChannel || null,
          mode,
          opponentName,
        };

        io.to(`user:${targetUserId}`).emit('pk:challenge', packet);
        /* Always ping both rooms so either host WebView receives it */
        io.to(`live:${fromChannel}`).emit('pk:challenge', packet);
        if (challenge.targetChannel && challenge.targetChannel !== fromChannel) {
          io.to(`live:${challenge.targetChannel}`).emit('pk:challenge', packet);
        }

        ack?.({
          ok: true,
          challengeId,
          targetChannel: challenge.targetChannel || null,
          waiting: true,
        });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('pk:challenge:respond', async (payload, ack) => {
      try {
        const challengeId = String(payload?.challengeId || '');
        const challenge = pendingChallenges.get(challengeId);
        if (!challenge) {
          return ack?.({ ok: false, message: 'Challenge expired' });
        }
        if (String(socket.userId) !== String(challenge.targetUserId)) {
          return ack?.({ ok: false, message: 'Not your challenge' });
        }

        const accepted = Boolean(payload?.accept);
        clearChallenge(challengeId);

        if (!accepted) {
          const decline = {
            challengeId,
            fromUserId: challenge.fromUserId,
            targetUserId: challenge.targetUserId,
            fromName: challenge.fromName,
          };
          io.to(`live:${challenge.fromChannel}`).emit('pk:challenge:declined', decline);
          io.to(`user:${challenge.fromUserId}`).emit('pk:challenge:declined', decline);
          return ack?.({ ok: true, accepted: false });
        }

        /* Prefer rival's current host channel (mutual dual-room PK) */
        let targetChannel = sanitizeChannel(challenge.targetChannel || '');
        const accepterLive = sanitizeChannel(socket.data.liveChannel || '');
        if (accepterLive && accepterLive !== challenge.fromChannel) {
          targetChannel = accepterLive;
        }
        if (!targetChannel) {
          targetChannel = await resolveUserHostChannel(challenge.targetUserId);
        }
        /* Last resort: payload from client */
        if (!targetChannel) {
          targetChannel = sanitizeChannel(payload?.channel || payload?.targetChannel || '');
          if (targetChannel === challenge.fromChannel) targetChannel = '';
        }
        challenge.targetChannel = targetChannel || '';
        if (!challenge.targetChannel) {
          return ack?.({
            ok: false,
            message: 'Could not find your live room — reopen live and accept again',
          });
        }

        const room = await liveRoomService.findByChannel(challenge.fromChannel);
        if (!room) return ack?.({ ok: false, message: 'Challenger room closed' });

        const existing = await pkBattleService.getActiveBattleByChannel(challenge.fromChannel);
        if (existing?.status === 'active') {
          return ack?.({ ok: false, message: 'Challenger already in PK' });
        }
        const rivalBusy = await pkBattleService.getActiveBattleByChannel(challenge.targetChannel);
        if (rivalBusy?.status === 'active') {
          return ack?.({ ok: false, message: 'You are already in a PK' });
        }

        const battle = await pkBattleService.createBattle({
          channel: challenge.fromChannel,
          liveRoomId: room.id,
          format: challenge.format || '1v1',
          durationSeconds: challenge.durationSeconds || 300,
        });

        const rivalName =
          payload?.displayName ||
          socket.data.liveDisplayName ||
          challenge.opponentName ||
          'Rival';

        await pkBattleService.seedBattleSides(battle.id, {
          hostUserId: challenge.fromUserId,
          hostName: challenge.fromName,
          opponentUserId: challenge.targetUserId,
          opponentName: rivalName,
        });

        const started = await pkBattleService.startBattle(battle.id);
        /* Link BOTH host rooms so chat, gifts, scores, and end are mutual */
        pkBattleService.linkChannelToBattle(challenge.fromChannel, started.id);
        pkBattleService.linkChannelToBattle(challenge.targetChannel, started.id);
        pkBattleService.setBattleExtras(started.id, {
          mode: challenge.mode,
          hostName: challenge.fromName,
          rivalName,
          opponentName: rivalName,
          challengerUserId: challenge.fromUserId,
          rivalUserId: challenge.targetUserId,
          challengerChannel: challenge.fromChannel,
          rivalChannel: challenge.targetChannel,
          mutual: true,
        });
        await pkBattleService.setChannelsPkStatus(
          [challenge.fromChannel, challenge.targetChannel],
          'active'
        );

        const snapshot = await pkBattleService.getBattleSnapshot(started.id);

        /* Every path: live rooms + user rooms + direct socket */
        broadcastPkToLinked(io, snapshot, snapshot?.linkedChannels || [], 'pk:start');
        socket.emit('pk:start', snapshot);
        /* Force both rooms to re-sync UI (hosts + audiences late to the event) */
        for (const ch of [challenge.fromChannel, challenge.targetChannel]) {
          try {
            const state = await liveRoomService.buildSnapshot(ch, { bypassCache: true });
            if (state) {
              state.pkBattle = snapshot;
              state.pkStatus = 'active';
              io.to(`live:${ch}`).emit('live:state', state);
            }
          } catch (_st) {
            /* non-fatal */
          }
        }
        /* Second pulse — WebViews sometimes miss the first packet */
        setTimeout(() => {
          broadcastPkToLinked(io, snapshot, snapshot?.linkedChannels || [], 'pk:start');
        }, 800);

        const acceptPacket = { challengeId, battle: snapshot };
        io.to(`user:${challenge.fromUserId}`).emit('pk:challenge:accepted', acceptPacket);
        io.to(`user:${challenge.targetUserId}`).emit('pk:challenge:accepted', acceptPacket);
        io.to(`live:${challenge.fromChannel}`).emit('pk:challenge:accepted', acceptPacket);
        io.to(`live:${challenge.targetChannel}`).emit('pk:challenge:accepted', acceptPacket);
        socket.emit('pk:challenge:accepted', acceptPacket);

        ack?.({ ok: true, accepted: true, battle: snapshot });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('pk:challenge:cancel', async (payload, ack) => {
      try {
        const challengeId = String(payload?.challengeId || '');
        const challenge = pendingChallenges.get(challengeId);
        if (!challenge) return ack?.({ ok: true });
        if (String(socket.userId) !== String(challenge.fromUserId)) {
          return ack?.({ ok: false, message: 'Only challenger can cancel' });
        }
        clearChallenge(challengeId);
        if (challenge.targetUserId) {
          io.to(`user:${challenge.targetUserId}`).emit('pk:challenge:cancelled', {
            challengeId,
          });
        }
        if (challenge.targetChannel) {
          io.to(`live:${challenge.targetChannel}`).emit('pk:challenge:cancelled', {
            challengeId,
          });
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('pk:join', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const battle = await pkBattleService.getActiveBattleByChannel(channel);
        if (!battle) return ack?.({ ok: false, message: 'No active PK' });

        const snapshot = await pkBattleService.joinBattle(
          battle.id,
          socket.userId,
          payload?.team || 2,
          payload?.displayName || socket.data.liveDisplayName || 'User'
        );
        io.to(`live:${channel}`).emit('pk:join', snapshot);
        ack?.({ ok: true, battle: snapshot });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('pk:invite', async (payload, ack) => {
      /* Legacy — prefer pk:challenge. Still routes notifications. */
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const targetUserId = payload?.userId || payload?.opponentUserId;
        if (!targetUserId) return ack?.({ ok: false, message: 'User required' });
        const targetChannel = sanitizeChannel(payload?.targetChannel || payload?.rivalChannel || '');
        const packet = {
          channel,
          fromUserId: socket.userId,
          fromName: socket.data.liveDisplayName || 'Host',
          mode: payload?.mode || 'friend',
          targetUserId: String(targetUserId),
          targetChannel: targetChannel || null,
        };
        io.to(`user:${targetUserId}`).emit('pk:invite', packet);
        io.to(`live:${channel}`).emit('pk:invite', packet);
        if (targetChannel && targetChannel !== channel) {
          io.to(`live:${targetChannel}`).emit('pk:invite', packet);
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('pk:score', async (payload) => {
      const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
      const battle = await pkBattleService.getActiveBattleByChannel(channel);
      if (!battle) return;
      const snapshot = await pkBattleService.getBattleSnapshot(battle.id);
      io.to(`live:${channel}`).emit('pk:score', snapshot);
      const links = snapshot?.battle?.id;
      if (links) {
        /* score already on shared battle; clients on linked rooms hear via their channel if re-emitted */
      }
    });

    socket.on('pk:end', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const battle = await pkBattleService.getActiveBattleByChannel(channel);
        if (!battle) return ack?.({ ok: false, message: 'No active PK' });

        const room = await liveRoomService.findByChannel(channel);
        const snapPre = await pkBattleService.getBattleSnapshot(battle.id);
        const me = String(socket.userId || '');
        const isParticipant = (snapPre?.participants || []).some(
          (p) => String(p.user_id) === me
        );
        const isRoomHost = room && String(room.host_user_id) === me;
        /* Either linked room's host may end (dual-host PK) */
        let isLinkedRoomHost = false;
        if (!isRoomHost && !isParticipant) {
          const linked = pkBattleService.listChannelsForBattle(battle.id) || [];
          for (const ch of linked) {
            try {
              const r = await liveRoomService.findByChannel(ch);
              if (r && String(r.host_user_id) === me) {
                isLinkedRoomHost = true;
                break;
              }
            } catch (_e) {
              /* skip */
            }
          }
        }
        if (!isRoomHost && !isParticipant && !isLinkedRoomHost) {
          return ack?.({ ok: false, message: 'Only PK hosts can end this battle' });
        }

        const reason = String(payload?.reason || 'manual').toLowerCase();
        const natural =
          Boolean(payload?.natural) || reason === 'timeout' || reason === 'timeup' || reason === 'score';
        /* Leave / early stop / forfeit → leaver loses (not draw) */
        const forfeit =
          !natural &&
          (reason === 'forfeit' ||
            reason === 'leave' ||
            reason === 'quit' ||
            reason === 'manual' ||
            reason === 'end');

        const linked = pkBattleService.listChannelsForBattle(battle.id) || [];
        const channelsToClear = [
          sanitizeChannel(battle.channel),
          channel,
          ...linked.map(sanitizeChannel),
        ].filter(Boolean);
        const snapshot = await pkBattleService.endBattle(battle.id, {
          forfeitingUserId: forfeit ? socket.userId : null,
          reason: forfeit ? 'forfeit' : 'score',
        });
        try {
          await pkBattleService.setChannelsPkStatus(channelsToClear, 'ended');
        } catch (_e) {}
        if (snapshot) {
          snapshot.linkedChannels = channelsToClear;
        }
        broadcastPkToLinked(io, snapshot || {}, channelsToClear, 'pk:end');
        for (const p of snapPre?.participants || []) {
          if (p?.user_id) io.to(`user:${p.user_id}`).emit('pk:end', snapshot);
        }
        for (const ch of channelsToClear) {
          try {
            const state = await liveRoomService.buildSnapshot(ch, { bypassCache: true });
            if (state) io.to(`live:${ch}`).emit('live:state', state);
          } catch (_st) {}
        }
        ack?.({ ok: true, battle: snapshot });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });
  });
}

module.exports = { registerPkSocket };
