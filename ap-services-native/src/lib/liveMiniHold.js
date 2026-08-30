/**
 * Parks the Agora engine across LiveRoom unmount so Back can minimize
 * like YouTube instead of tearing down the stream.
 */
let hold = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(hold);
    } catch (_e) {}
  });
}

export function peekHold() {
  return hold;
}

export function subscribeHold(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function parkEngine(payload) {
  hold = payload || null;
  if (hold?.engine && !hold._miniHandler) {
    const handler = {
      onUserJoined: (_c, uid) => {
        if (!hold) return;
        hold.remoteUid = uid;
        emit();
      },
      onUserOffline: (_c, uid) => {
        if (!hold) return;
        if (hold.remoteUid === uid) hold.remoteUid = null;
        emit();
      },
    };
    try {
      hold.engine.registerEventHandler?.(handler);
      hold._miniHandler = handler;
    } catch (_e) {}
  }
  emit();
}

export function patchHold(partial) {
  if (!hold || !partial) return;
  Object.assign(hold, partial);
  emit();
}

export function claimHold(channel) {
  if (!hold) return null;
  if (channel && String(hold.channel) !== String(channel)) return null;
  const next = hold;
  hold = null;
  emit();
  return next;
}

export function discardHold() {
  const next = hold;
  hold = null;
  emit();
  if (!next?.engine) return;
  try {
    next.engine.leaveChannel?.();
    next.engine.release?.();
  } catch (_e) {}
}

export function releaseHoldIfDifferent(channel) {
  if (!hold) return;
  if (String(hold.channel) === String(channel || '')) return;
  discardHold();
}
