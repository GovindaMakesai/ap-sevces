/**
 * Real-time party / live room state (in-memory; scale with Redis later).
 */
const rooms = new Map();

function getRoom(channel) {
  const id = String(channel || '').slice(0, 64);
  if (!id) return null;
  if (!rooms.has(id)) {
    const defaultSeats = [
      { name: 'neetu5883', gifts: 21, muted: true },
      { name: 'Manash B.', gifts: 2, muted: false },
      { name: 'wasam ul haq', gifts: 0, muted: true },
      { name: 'Anayaa01', gifts: 5, muted: false },
      { name: 'shaista', gifts: 12, muted: true },
      { name: 'AYAN', gifts: 3, muted: false },
      { name: 'namrata21', gifts: 8, muted: true },
      { name: 'Naira', gifts: 1, muted: false },
    ];
    rooms.set(id, {
      channel: id,
      type: 'party',
      hostId: null,
      hostName: 'Host',
      viewers: 0,
      messages: [],
      gifts: [],
      seats: defaultSeats,
      updatedAt: Date.now(),
    });
  }
  return rooms.get(id);
}

function snapshot(room) {
  return {
    channel: room.channel,
    type: room.type,
    hostId: room.hostId,
    hostName: room.hostName,
    viewers: room.viewers,
    messages: room.messages.slice(-40),
    gifts: room.gifts.slice(-5),
    seats: room.seats.slice(0, 12),
    updatedAt: room.updatedAt,
  };
}

function registerLiveSocket(io) {
  io.on('connection', (socket) => {
    let currentChannel = null;

    socket.on('live:join', (payload, ack) => {
      try {
        const channel = String(payload?.channel || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64);
        if (!channel) {
          if (ack) ack({ ok: false, message: 'channel required' });
          return;
        }

        if (currentChannel) socket.leave(`live:${currentChannel}`);

        const room = getRoom(channel);
        room.type = payload?.type === 'live' ? 'live' : 'party';
        room.viewers = Math.max(0, room.viewers) + 1;
        room.updatedAt = Date.now();

        const displayName =
          String(payload?.displayName || 'Guest').trim().slice(0, 32) || 'Guest';
        const isHost = Boolean(payload?.isHost);

        if (isHost) {
          room.hostId = socket.userId;
          room.hostName = displayName;
        } else if (!room.seats.find((s) => s.userId === socket.userId)) {
          const empty = room.seats.find((s) => !s.userId);
          if (empty) {
            empty.userId = socket.userId;
            empty.name = displayName;
            empty.muted = false;
            empty.gifts = empty.gifts || 0;
          } else if (room.seats.length < 8) {
            room.seats.push({
              userId: socket.userId,
              name: displayName,
              muted: false,
              gifts: 0,
            });
          }
        }

        currentChannel = channel;
        socket.join(`live:${channel}`);
        socket.data.liveChannel = channel;
        socket.data.liveDisplayName = displayName;

        const state = snapshot(room);
        socket.emit('live:state', state);
        socket.to(`live:${channel}`).emit('live:state', state);
        io.to(`live:${channel}`).emit('live:viewer_count', { viewers: room.viewers });

        if (ack) ack({ ok: true, state });
      } catch (err) {
        console.error('live:join', err);
        if (ack) ack({ ok: false, message: err.message });
      }
    });

    socket.on('live:chat', (payload) => {
      const channel = payload?.channel || currentChannel;
      const room = getRoom(channel);
      if (!room) return;
      const text = String(payload?.text || '').trim().slice(0, 280);
      if (!text) return;

      const msg = {
        id: Date.now() + '-' + socket.userId,
        type: payload?.type === 'system' ? 'system' : 'chat',
        userId: socket.userId,
        user: socket.data.liveDisplayName || 'User',
        lvl: payload?.lvl || Math.floor(Math.random() * 12) + 1,
        text,
        at: Date.now(),
      };
      room.messages.push(msg);
      if (room.messages.length > 50) room.messages.shift();
      room.updatedAt = Date.now();
      io.to(`live:${channel}`).emit('live:chat', msg);
    });

    socket.on('live:gift', (payload) => {
      const channel = payload?.channel || currentChannel;
      const room = getRoom(channel);
      if (!room) return;
      const gift = {
        id: Date.now(),
        from: socket.data.liveDisplayName || 'User',
        to: String(payload?.to || room.hostName).slice(0, 32),
        emoji: payload?.emoji || '🎁',
        amount: Number(payload?.amount) || 100,
        at: Date.now(),
      };
      room.gifts.push(gift);
      const seat = room.seats.find((s) => s.name === gift.to || s.userId === payload?.toUserId);
      if (seat) seat.gifts = (seat.gifts || 0) + gift.amount;
      if (room.hostName === gift.to) {
        /* host gifts tracked in UI separately */
      }
      io.to(`live:${channel}`).emit('live:gift', gift);
      io.to(`live:${channel}`).emit('live:state', snapshot(room));
    });

    socket.on('live:mute', (payload) => {
      const channel = payload?.channel || currentChannel;
      const room = getRoom(channel);
      if (!room) return;
      const seat = room.seats.find((s) => s.userId === socket.userId);
      if (seat) {
        seat.muted = Boolean(payload?.muted);
        io.to(`live:${channel}`).emit('live:state', snapshot(room));
      }
    });

    socket.on('live:leave', () => {
      if (!currentChannel) return;
      const room = getRoom(currentChannel);
      if (room) {
        room.viewers = Math.max(0, room.viewers - 1);
        room.seats = room.seats.filter((s) => s.userId !== socket.userId);
        io.to(`live:${currentChannel}`).emit('live:viewer_count', { viewers: room.viewers });
        io.to(`live:${currentChannel}`).emit('live:state', snapshot(room));
      }
      socket.leave(`live:${currentChannel}`);
      currentChannel = null;
    });

    socket.on('disconnect', () => {
      if (!currentChannel) return;
      const room = getRoom(currentChannel);
      if (room) {
        room.viewers = Math.max(0, room.viewers - 1);
        room.seats = room.seats.filter((s) => s.userId !== socket.userId);
        socket.to(`live:${currentChannel}`).emit('live:viewer_count', { viewers: room.viewers });
        socket.to(`live:${currentChannel}`).emit('live:state', snapshot(room));
      }
    });
  });
}

module.exports = { registerLiveSocket, getRoom };
