const pkBattleService = require('../services/pkBattleService');
const liveRoomService = require('../services/liveRoomService');
const permissionService = require('../services/permissionService');

function sanitizeChannel(raw) {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
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
        let format = payload?.format || '1v1';
        if (mode === 'team' && (!payload?.format || payload.format === '1v1')) {
          format = '1v2';
        }
        if (!['1v1', '1v2', '1v4', '1v8'].includes(format)) format = '1v1';

        if (mode === 'friend' && !payload?.opponentUserId) {
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
        });

        const started = await pkBattleService.startBattle(battle.id);
        const snapshot = await pkBattleService.getBattleSnapshot(started.id);
        /* attach mode for clients */
        if (snapshot) snapshot.mode = mode;
        io.to(`live:${channel}`).emit('pk:start', snapshot);
        ack?.({ ok: true, battle: snapshot });
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
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const targetUserId = payload?.userId || payload?.opponentUserId;
        if (!targetUserId) return ack?.({ ok: false, message: 'User required' });
        io.to(`user:${targetUserId}`).emit('pk:invite', {
          channel,
          fromUserId: socket.userId,
          fromName: socket.data.liveDisplayName || 'Host',
          mode: payload?.mode || 'friend',
        });
        /* also room ping so WebView clients (no user room) hear it */
        io.to(`live:${channel}`).emit('pk:invite', {
          channel,
          targetUserId: String(targetUserId),
          fromUserId: socket.userId,
          fromName: socket.data.liveDisplayName || 'Host',
          mode: payload?.mode || 'friend',
        });
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
    });

    socket.on('pk:end', async (payload, ack) => {
      try {
        const channel = sanitizeChannel(payload?.channel || socket.data.liveChannel);
        const battle = await pkBattleService.getActiveBattleByChannel(channel);
        if (!battle) return ack?.({ ok: false, message: 'No active PK' });
        const room = await liveRoomService.findByChannel(channel);
        const isHost = room && String(room.host_user_id) === String(socket.userId);
        if (!isHost) return ack?.({ ok: false, message: 'Host only' });

        const snapshot = await pkBattleService.endBattle(battle.id);
        io.to(`live:${channel}`).emit('pk:end', snapshot);
        ack?.({ ok: true, battle: snapshot });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });
  });
}

module.exports = { registerPkSocket };
