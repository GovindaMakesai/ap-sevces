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

        const battle = await pkBattleService.createBattle({
          channel,
          liveRoomId: room.id,
          format: payload?.format || '1v1',
          durationSeconds: payload?.durationSeconds || 300,
        });
        const started = await pkBattleService.startBattle(battle.id);
        const snapshot = await pkBattleService.getBattleSnapshot(started.id);
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
          payload?.team || 1,
          socket.data.liveDisplayName || 'User'
        );
        io.to(`live:${channel}`).emit('pk:join', snapshot);
        ack?.({ ok: true, battle: snapshot });
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
        if (!socket.data.isHost) return ack?.({ ok: false, message: 'Host only' });

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
