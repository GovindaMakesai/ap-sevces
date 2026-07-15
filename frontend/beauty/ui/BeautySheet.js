/**
 * BeautySheet UI — bottom sheet: Beauty / Filters / Face / Makeup / Advanced
 * Talks only to BeautyEngine (never providers).
 *
 * @module beauty/ui/BeautySheet
 */

import { BeautyEngine } from '../BeautyEngine.js';
import { BEAUTY_EFFECT_CATALOG } from '../BeautyEffect.js';

const TABS = [
  { id: 'beauty', label: 'Beauty' },
  { id: 'filters', label: 'Filters' },
  { id: 'face', label: 'Face' },
  { id: 'makeup', label: 'Makeup' },
  { id: 'advanced', label: 'Advanced' },
];

const TAB_CATS = {
  beauty: ['skin'],
  filters: null, // presets
  face: ['face'],
  makeup: ['makeup'],
  advanced: ['color', 'advanced'],
};

export class BeautySheet {
  constructor() {
    this.engine = BeautyEngine.shared;
    this._tab = 'beauty';
    this._el = null;
    this._unsub = null;
  }

  ensureDom() {
    if (this._el) return this._el;
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="ap-beauty-sheet" id="apBeautySheet" aria-hidden="true">
        <div class="ap-beauty-panel">
          <div class="ap-beauty-head">
            <div>
              <h3>AI Beauty</h3>
              <p class="ap-beauty-sub">Earn4U Beauty Engine · live preview on your stream</p>
            </div>
            <button type="button" class="ap-beauty-close" id="apBeautyClose" aria-label="Close"><i class="fas fa-times"></i></button>
          </div>
          <div class="ap-beauty-tabs" id="apBeautyTabs"></div>
          <div class="ap-beauty-toolbar">
            <label class="ap-beauty-toggle"><input type="checkbox" id="apBeautyEnabled"> On</label>
            <button type="button" id="apBeautyCompare">Before / After</button>
            <button type="button" id="apBeautyReset">Reset</button>
            <span class="ap-beauty-fps" id="apBeautyFps"></span>
          </div>
          <div class="ap-beauty-body" id="apBeautyBody"></div>
        </div>
      </div>`
    );
    this._el = document.getElementById('apBeautySheet');
    this._bind();
    return this._el;
  }

  _bind() {
    const sheet = this._el;
    document.getElementById('apBeautyClose')?.addEventListener('click', () => this.close());
    sheet?.addEventListener('click', (e) => {
      if (e.target === sheet) this.close();
    });
    document.getElementById('apBeautyEnabled')?.addEventListener('change', (e) => {
      this.engine.setEnabled(e.target.checked);
    });
    document.getElementById('apBeautyCompare')?.addEventListener('click', () => {
      this.engine.setCompareMode(!this.engine.settings.compareMode);
      this.render();
    });
    document.getElementById('apBeautyReset')?.addEventListener('click', () => {
      this.engine.reset();
      this.render();
    });
    this._unsub = this.engine.onChange(() => this._syncChrome());
  }

  open() {
    this.ensureDom();
    this.render();
    this._el.classList.add('open');
    this._el.setAttribute('aria-hidden', 'false');
    this._fpsTimer = setInterval(() => {
      const el = document.getElementById('apBeautyFps');
      if (el) el.textContent = `${this.engine.getFps() || '—'} FPS`;
    }, 500);
  }

  close() {
    this._el?.classList.remove('open');
    this._el?.setAttribute('aria-hidden', 'true');
    if (this._fpsTimer) clearInterval(this._fpsTimer);
  }

  _syncChrome() {
    const en = document.getElementById('apBeautyEnabled');
    if (en) en.checked = this.engine.settings.enabled;
    const cmp = document.getElementById('apBeautyCompare');
    if (cmp) cmp.classList.toggle('is-on', this.engine.settings.compareMode);
  }

  render() {
    this.ensureDom();
    this._syncChrome();
    const tabs = document.getElementById('apBeautyTabs');
    if (tabs) {
      tabs.innerHTML = TABS.map(
        (t) =>
          `<button type="button" class="ap-beauty-tab${t.id === this._tab ? ' is-on' : ''}" data-tab="${t.id}">${t.label}</button>`
      ).join('');
      tabs.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this._tab = btn.dataset.tab;
          this.render();
        });
      });
    }
    const body = document.getElementById('apBeautyBody');
    if (!body) return;

    if (this._tab === 'filters') {
      const presets = this.engine.listPresets();
      body.innerHTML = `<div class="ap-beauty-presets">${presets
        .map(
          (p) => `<button type="button" class="ap-beauty-preset${
            this.engine.settings.activePresetId === p.id ? ' is-active' : ''
          }" data-preset="${p.id}">
            <span class="swatch" style="background:${p.swatch}"></span>
            <span>${p.label}</span>
          </button>`
        )
        .join('')}</div>
        <p class="ap-beauty-hint">Presets only change effect intensities. Provider stays the same.</p>`;
      body.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.engine.applyPreset(btn.dataset.preset);
          this.engine.setEnabled(btn.dataset.preset !== 'none');
          this.render();
          window.SocialLive?.applyBeautyEngineState?.();
        });
      });
      return;
    }

    const cats = TAB_CATS[this._tab] || ['skin'];
    const effects = BEAUTY_EFFECT_CATALOG.filter((e) => cats.includes(e.category));
    body.innerHTML = `<div class="ap-beauty-sliders">${effects
      .map((e) => {
        const v = this.engine.settings.getIntensity(e.id);
        return `<label class="ap-beauty-slider">
          <span class="lbl">${e.label}<strong id="bv_${e.id}">${v}</strong></span>
          <input type="range" min="0" max="100" value="${v}" data-effect="${e.id}">
        </label>`;
      })
      .join('')}</div>`;
    body.querySelectorAll('input[data-effect]').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.effect;
        const val = Number(input.value);
        this.engine.setIntensity(id, val);
        const lab = document.getElementById('bv_' + id);
        if (lab) lab.textContent = String(val);
        window.SocialLive?.applyBeautyEngineState?.();
      });
    });
  }
}

BeautySheet._shared = null;
BeautySheet.shared = function shared() {
  if (!BeautySheet._shared) BeautySheet._shared = new BeautySheet();
  return BeautySheet._shared;
};
