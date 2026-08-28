/** Voice / video match API + socket helpers */

export function unwrapMatch(res, api) {
  const body = api?.unwrap ? api.unwrap(res) : res;
  return body?.data != null ? body.data : body;
}

export async function fetchMatchPricing(api) {
  const res = await api.get('/match/pricing', null, { cacheTtlMs: 60000 });
  return unwrapMatch(res, api);
}

export async function fetchActiveMatch(api) {
  const res = await api.get('/match/active', null, { skipCache: true });
  return unwrapMatch(res, api);
}

export async function fetchMatchAvailability(api) {
  const res = await api.get('/match/availability', null, { skipCache: true });
  return unwrapMatch(res, api);
}

export async function startMatch(api, { mode, clientRequestId }) {
  const res = await api.post('/match/enqueue', {
    mode,
    clientRequestId,
    requestId: clientRequestId,
  });
  return unwrapMatch(res, api);
}

export async function cancelMatch(api) {
  const res = await api.post('/match/cancel', {});
  return unwrapMatch(res, api);
}

export async function confirmMatchJoined(api, matchId) {
  const res = await api.post('/match/joined', { matchId });
  return unwrapMatch(res, api);
}

export async function hangupMatch(api, matchId) {
  const res = await api.post('/match/hangup', { matchId });
  return unwrapMatch(res, api);
}

export function matchSocketEnqueue(socket, { mode, clientRequestId }) {
  return socket.emit('match:enqueue', { mode, clientRequestId, requestId: clientRequestId });
}

export function matchSocketCancel(socket) {
  return socket.emit('match:cancel', {});
}

export function matchSocketJoined(socket, matchId) {
  return socket.emit('match:joined', { matchId });
}

export function matchSocketHangup(socket, matchId) {
  return socket.emit('match:hangup', { matchId });
}
