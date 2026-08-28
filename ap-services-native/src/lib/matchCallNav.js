/** Build Call screen params from match API / socket payload */
export function callParamsFromMatch(payload, balanceOverride) {
  if (!payload?.matchId) return null;
  const peer = payload.peer || {};
  return {
    matchId: payload.matchId,
    channel: payload.channel,
    peerId: peer.id,
    peerName: peer.name || 'Match',
    peerPic: peer.pic || null,
    audioOnly: payload.audioOnly ?? payload.mode === 'voice',
    cost: payload.cost,
    balance: balanceOverride != null ? balanceOverride : payload.balance,
    status: payload.status || 'matched',
  };
}

export function makeMatchRequestId(userId) {
  return `m-${userId || '0'}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
