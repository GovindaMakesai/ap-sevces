/**
 * APAgoraLife — single authoritative Agora client lifecycle.
 *
 * Phase 1 rules:
 * - One serialized queue for create / join / leave / publish / unpublish / dispose / recover.
 * - Nested calls from inside an op run inline (no deadlock).
 * - Seat role changes must use publish/unpublish + token renew — not dispose/rejoin.
 * - Hard dispose/rejoin only for unrecoverable errors or intentional exit / channel change.
 */
(function (global) {
  'use strict';

  const BUILD = '20260724-phase1-life';

  let chain = Promise.resolve();
  let depth = 0;
  let client = null;
  let joined = false;
  let channel = null;
  let lastOp = '';
  const stats = {
    ops: 0,
    create: 0,
    join: 0,
    leave: 0,
    publish: 0,
    unpublish: 0,
    dispose: 0,
    recover: 0,
    skippedConcurrent: 0,
  };
  let logFn = null;

  function log(msg, data) {
    try {
      if (typeof logFn === 'function') logFn(msg, data);
      else if (global.console?.debug) global.console.debug('[APAgoraLife]', msg, data || '');
    } catch (_e) {}
  }

  function configure(opts = {}) {
    if (typeof opts.log === 'function') logFn = opts.log;
  }

  /**
   * Serialize every external lifecycle op. Nested calls (depth > 0) run inline
   * so dispose-from-create-retry cannot deadlock the queue.
   */
  function run(name, fn) {
    const label = String(name || 'op');
    if (depth > 0) {
      stats.ops += 1;
      lastOp = label + ':nested';
      return Promise.resolve().then(() => fn());
    }
    const exec = async () => {
      depth += 1;
      stats.ops += 1;
      lastOp = label;
      log('op_start', { name: label, depth });
      try {
        return await fn();
      } finally {
        depth -= 1;
        log('op_end', { name: label, depth });
      }
    };
    const next = chain.then(exec, exec);
    chain = next.catch(() => {});
    return next;
  }

  function getClient() {
    return client;
  }

  function isJoined() {
    return Boolean(joined && client);
  }

  function getChannel() {
    return channel;
  }

  function syncExternalClient(c, meta = {}) {
    client = c || null;
    if (meta.joined != null) joined = Boolean(meta.joined);
    if (meta.channel != null) channel = meta.channel ? String(meta.channel) : null;
  }

  function isUnrecoverableError(err) {
    const msg = String(err?.message || err || '');
    return /Cannot create so many PeerConnections|Failed to construct ['"]RTCPeerConnection['"]|INVALID_OPERATION|UID_CONFLICT|CAN_NOT_GET_GATEWAY|CLIENT_LEAVE|WS_ABORT|OPERATION_ABORTED/i.test(
      msg
    );
  }

  async function ensureClient(createFn) {
    return run('ensureClient', async () => {
      if (client) return client;
      if (typeof createFn !== 'function') throw new Error('APAgoraLife.ensureClient needs createFn');
      stats.create += 1;
      client = await createFn();
      joined = false;
      channel = null;
      return client;
    });
  }

  async function join(opts = {}) {
    return run('join', async () => {
      const c = opts.client || client;
      if (!c) throw new Error('join: no client');
      if (typeof opts.bindHandlers === 'function') opts.bindHandlers(c, opts.channel);
      await opts.joinFn(c);
      client = c;
      joined = true;
      channel = opts.channel ? String(opts.channel) : channel;
      stats.join += 1;
      return { client: c, channel, uid: opts.uid };
    });
  }

  async function leave(opts = {}) {
    return run('leave', async () => {
      const c = opts.client || client;
      if (!c) {
        joined = false;
        return;
      }
      stats.leave += 1;
      try {
        await c.leave();
      } catch (_e) {}
      joined = false;
      if (opts.clearChannel) channel = null;
    });
  }

  async function publish(tracks, opts = {}) {
    return run('publish', async () => {
      const c = opts.client || client;
      if (!c) throw new Error('publish: no client');
      const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);
      if (!list.length) return;
      stats.publish += 1;
      await c.publish(list.length === 1 ? list[0] : list);
    });
  }

  async function unpublish(tracks, opts = {}) {
    return run('unpublish', async () => {
      const c = opts.client || client;
      if (!c) return;
      const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);
      if (!list.length) return;
      stats.unpublish += 1;
      try {
        await c.unpublish(list.length === 1 ? list[0] : list);
      } catch (_e) {}
    });
  }

  /**
   * Full teardown. Caller supplies cleanup (tracks, remotes, sinks) via beforeLeave.
   */
  async function dispose(opts = {}) {
    return run('dispose', async () => {
      const reason = opts.reason || 'dispose';
      const c = client;
      client = null;
      joined = false;
      const prevChannel = channel;
      channel = null;
      stats.dispose += 1;
      log('dispose', { reason, hadClient: Boolean(c), channel: prevChannel });
      if (typeof opts.beforeLeave === 'function') {
        try {
          await opts.beforeLeave(c, reason);
        } catch (_e) {}
      }
      if (c) {
        try {
          await c.leave();
        } catch (_e2) {}
      }
      const waitMs =
        typeof opts.waitMs === 'number'
          ? opts.waitMs
          : reason === 'peerconnection_limit'
            ? 900
            : 400;
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    });
  }

  async function recover(name, fn) {
    return run('recover:' + (name || 'soft'), async () => {
      stats.recover += 1;
      return fn();
    });
  }

  function getStats() {
    return { ...stats, build: BUILD, joined, channel, lastOp, hasClient: Boolean(client), depth };
  }

  global.APAgoraLife = {
    BUILD,
    configure,
    run,
    getClient,
    isJoined,
    getChannel,
    syncExternalClient,
    isUnrecoverableError,
    ensureClient,
    join,
    leave,
    publish,
    unpublish,
    dispose,
    recover,
    getStats,
  };
})(typeof window !== 'undefined' ? window : globalThis);
