/**
 * BeautyPlugin — optional effect plugins registered at runtime.
 * Used for experimental looks without forking providers.
 *
 * @module beauty/BeautyPlugin
 */

export class BeautyPlugin {
  /**
   * @param {{ id: string, label?: string, onBeforeRender?: Function, onAfterRender?: Function }} opts
   */
  constructor(opts) {
    this.id = opts.id;
    this.label = opts.label || opts.id;
    this.onBeforeRender = opts.onBeforeRender || null;
    this.onAfterRender = opts.onAfterRender || null;
    this.enabled = true;
  }
}

export class BeautyPluginRegistry {
  constructor() {
    /** @type {Map<string, BeautyPlugin>} */
    this._plugins = new Map();
  }

  register(plugin) {
    if (!(plugin instanceof BeautyPlugin)) throw new Error('Invalid BeautyPlugin');
    this._plugins.set(plugin.id, plugin);
  }

  unregister(id) {
    this._plugins.delete(id);
  }

  list() {
    return [...this._plugins.values()];
  }

  async runBefore(ctx, canvas) {
    for (const p of this._plugins.values()) {
      if (p.enabled && p.onBeforeRender) await p.onBeforeRender(ctx, canvas);
    }
  }

  async runAfter(ctx, canvas) {
    for (const p of this._plugins.values()) {
      if (p.enabled && p.onAfterRender) await p.onAfterRender(ctx, canvas);
    }
  }
}
