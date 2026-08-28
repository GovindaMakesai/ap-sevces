const matchCallService = require('../services/matchCallService');

function safeAck(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function registerMatchCallSocket(io) {
  matchCallService.setMatchIo(io);

  io.on('connection', (socket) => {
    socket.on('match:enqueue', async (payload, ack) => {
      try {
        const result = await matchCallService.enqueue(
          socket.userId,
          payload?.mode || payload?.type,
          payload?.clientRequestId || payload?.requestId
        );
        safeAck(ack, { ok: true, ...result });
      } catch (err) {
        const status = err.status || (err.code === 'INSUFFICIENT_BALANCE' ? 402 : err.code === 'USER_BUSY' ? 409 : 500);
        safeAck(ack, {
          ok: false,
          message: err.message || 'Could not start match',
          code: err.code || 'MATCH_ERROR',
          status,
          busy: err.code === 'USER_BUSY' ? err.data : undefined,
        });
      }
    });

    socket.on('match:cancel', async (_payload, ack) => {
      try {
        const result = await matchCallService.cancelSearch(socket.userId);
        safeAck(ack, { ok: true, ...result });
      } catch (err) {
        safeAck(ack, { ok: false, message: err.message });
      }
    });

    socket.on('match:joined', async (payload, ack) => {
      try {
        const result = await matchCallService.markJoined(socket.userId, payload?.matchId);
        safeAck(ack, { ok: true, ...result });
      } catch (err) {
        safeAck(ack, {
          ok: false,
          message: err.message || 'Join confirm failed',
          code: err.code || 'MATCH_ERROR',
        });
      }
    });

    socket.on('match:hangup', async (payload, ack) => {
      try {
        const result = await matchCallService.hangup(socket.userId, payload?.matchId);
        safeAck(ack, { ok: true, ...result });
      } catch (err) {
        safeAck(ack, { ok: false, message: err.message });
      }
    });

    socket.on('disconnect', () => {
      /* Keep queue for brief reconnects; search TTL + busy sweep cleans abandoned entries.
         Active matches end only via hangup / insufficient / timeout — not on brief disconnect. */
    });
  });
}

module.exports = { registerMatchCallSocket };
