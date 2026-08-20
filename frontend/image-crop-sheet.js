/**
 * Full-screen image crop sheet for profile backgrounds (and similar uploads).
 * Usage: const file = await ImageCropSheet.open(pickedFile, { title: 'Crop background' });
 */
(function () {
  const RATIOS = [
    { id: 'original', label: 'Original', value: 0 },
    { id: '16:9', label: '16:9', value: 16 / 9 },
    { id: '4:3', label: '4:3', value: 4 / 3 },
    { id: '1:1', label: '1:1', value: 1 },
    { id: '4:5', label: '4:5', value: 4 / 5 },
  ];

  const STYLE_ID = 'image-crop-sheet-css';
  const CSS = `
#imageCropSheet.ics-root {
  position: fixed; inset: 0; z-index: 12000;
  display: none; flex-direction: column;
  background: #050b0b; color: #fff;
  font-family: inherit;
}
#imageCropSheet.ics-root.is-open { display: flex; }
.ics-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; padding-top: calc(10px + env(safe-area-inset-top, 0px));
  flex-shrink: 0;
}
.ics-head h3 { margin: 0; font-size: 16px; font-weight: 800; }
.ics-head button {
  border: 0; background: rgba(255,255,255,.1); color: #fff;
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
}
.ics-stage-wrap {
  flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
  padding: 8px 16px; background: #000;
}
.ics-stage {
  position: relative; overflow: hidden; touch-action: none;
  background: #111; border-radius: 10px; max-width: 100%;
  box-shadow: 0 0 0 1px rgba(255,255,255,.12);
  cursor: grab;
}
.ics-stage.is-dragging { cursor: grabbing; }
.ics-stage canvas { display: block; width: 100%; height: 100%; }
.ics-tools {
  flex-shrink: 0;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: #0a1616;
}
.ics-ratios { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none; }
.ics-ratios button {
  flex: 0 0 auto; border: 1px solid rgba(255,255,255,.18); background: transparent;
  color: #e5e7eb; padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer;
}
.ics-ratios button.is-active { background: #fff; color: #061a1a; border-color: #fff; }
.ics-zoom { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #9ca3af; margin-bottom: 12px; }
.ics-zoom input { flex: 1; accent-color: #ff4d9d; }
.ics-actions { display: flex; gap: 10px; }
.ics-actions button {
  flex: 1; border: 0; border-radius: 12px; padding: 12px 14px;
  font-size: 14px; font-weight: 800; cursor: pointer;
}
.ics-actions .ics-cancel { background: rgba(255,255,255,.1); color: #fff; }
.ics-actions .ics-use { background: linear-gradient(90deg, #ff4d9d, #f472b6); color: #fff; }
.ics-actions .ics-use:disabled { opacity: .55; cursor: wait; }
.ics-hint { margin: 0 0 10px; font-size: 12px; color: #9ca3af; text-align: center; }
`;

  let resolveOpen = null;
  let state = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function ensureDom() {
    ensureStyle();
    let root = document.getElementById('imageCropSheet');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'imageCropSheet';
    root.className = 'ics-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="ics-head">' +
      '<button type="button" class="ics-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
      '<h3 id="icsTitle">Crop photo</h3>' +
      '<span style="width:36px"></span>' +
      '</div>' +
      '<div class="ics-stage-wrap"><div class="ics-stage" id="icsStage"><canvas id="icsCanvas"></canvas></div></div>' +
      '<div class="ics-tools">' +
      '<p class="ics-hint">Choose a shape, zoom, then drag to position. The frame is what people will see.</p>' +
      '<div class="ics-ratios" id="icsRatios"></div>' +
      '<label class="ics-zoom">Zoom <input type="range" id="icsZoom" min="1" max="3" step="0.02" value="1"></label>' +
      '<div class="ics-actions">' +
      '<button type="button" class="ics-cancel">Cancel</button>' +
      '<button type="button" class="ics-use">Use photo</button>' +
      '</div></div>';
    document.body.appendChild(root);

    const ratios = document.getElementById('icsRatios');
    ratios.innerHTML = RATIOS.map(function (r, i) {
      return (
        '<button type="button" data-ratio="' +
        r.id +
        '"' +
        (i === 0 ? ' class="is-active"' : '') +
        '>' +
        r.label +
        '</button>'
      );
    }).join('');

    root.querySelector('.ics-close').addEventListener('click', cancel);
    root.querySelector('.ics-cancel').addEventListener('click', cancel);
    root.querySelector('.ics-use').addEventListener('click', apply);
    document.getElementById('icsZoom').addEventListener('input', function () {
      if (!state) return;
      state.zoom = parseFloat(this.value) || 1;
      clampPan();
      draw();
    });
    ratios.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-ratio]');
      if (!btn || !state) return;
      ratios.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      const found = RATIOS.find(function (r) {
        return r.id === btn.dataset.ratio;
      });
      state.ratioId = found ? found.id : 'original';
      state.ratio = found ? found.value : 0;
      state.offsetX = 0;
      state.offsetY = 0;
      layoutStage();
      clampPan();
      draw();
    });

    const stage = document.getElementById('icsStage');
    stage.addEventListener('pointerdown', function (e) {
      if (!state) return;
      state.dragging = true;
      state.dragX = e.clientX;
      state.dragY = e.clientY;
      state.originX = state.offsetX;
      state.originY = state.offsetY;
      stage.classList.add('is-dragging');
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!state?.dragging) return;
      state.offsetX = state.originX + (e.clientX - state.dragX);
      state.offsetY = state.originY + (e.clientY - state.dragY);
      clampPan();
      draw();
    });
    function endDrag(e) {
      if (!state) return;
      state.dragging = false;
      stage.classList.remove('is-dragging');
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch (_err) {}
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    window.addEventListener(
      'resize',
      function () {
        if (!state?.img) return;
        layoutStage();
        clampPan();
        draw();
      },
      { passive: true }
    );

    return root;
  }

  function aspect() {
    if (!state?.img) return 16 / 9;
    if (state.ratio > 0) return state.ratio;
    return state.img.width / Math.max(1, state.img.height);
  }

  function layoutStage() {
    const stage = document.getElementById('icsStage');
    if (!stage || !state?.img) return;
    const wrap = stage.parentElement;
    const maxW = Math.max(160, (wrap?.clientWidth || window.innerWidth) - 8);
    const maxH = Math.max(160, (wrap?.clientHeight || window.innerHeight * 0.5) - 8);
    const r = aspect();
    let w = maxW;
    let h = w / r;
    if (h > maxH) {
      h = maxH;
      w = h * r;
    }
    state.frameW = Math.round(w);
    state.frameH = Math.round(h);
    stage.style.width = state.frameW + 'px';
    stage.style.height = state.frameH + 'px';
    const canvas = document.getElementById('icsCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.frameW * dpr);
    canvas.height = Math.round(state.frameH * dpr);
    state.dpr = dpr;
  }

  function coverScale() {
    const img = state.img;
    return (
      Math.max(state.frameW / img.width, state.frameH / img.height) * (state.zoom || 1)
    );
  }

  function clampPan() {
    if (!state?.img) return;
    const scale = coverScale();
    const dw = state.img.width * scale;
    const dh = state.img.height * scale;
    const maxX = Math.max(0, (dw - state.frameW) / 2);
    const maxY = Math.max(0, (dh - state.frameH) / 2);
    state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX || 0));
    state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY || 0));
  }

  function draw() {
    const canvas = document.getElementById('icsCanvas');
    if (!canvas || !state?.img) return;
    const ctx = canvas.getContext('2d');
    const dpr = state.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, state.frameW, state.frameH);
    const scale = coverScale();
    const dw = state.img.width * scale;
    const dh = state.img.height * scale;
    const dx = (state.frameW - dw) / 2 + (state.offsetX || 0);
    const dy = (state.frameH - dh) / 2 + (state.offsetY || 0);
    ctx.drawImage(state.img, dx, dy, dw, dh);
  }

  function cropSourceRect() {
    const scale = coverScale();
    const dw = state.img.width * scale;
    const dh = state.img.height * scale;
    const dx = (state.frameW - dw) / 2 + (state.offsetX || 0);
    const dy = (state.frameH - dh) / 2 + (state.offsetY || 0);
    return {
      sx: -dx / scale,
      sy: -dy / scale,
      sw: state.frameW / scale,
      sh: state.frameH / scale,
    };
  }

  function isIdentityCrop() {
    if (state.ratioId !== 'original') return false;
    if ((state.zoom || 1) > 1.01) return false;
    if (Math.abs(state.offsetX || 0) > 1 || Math.abs(state.offsetY || 0) > 1) return false;
    return true;
  }

  function exportFile() {
    return new Promise(function (resolve, reject) {
      if (isIdentityCrop()) {
        resolve(state.file);
        return;
      }
      const img = state.img;
      const r = aspect();
      const outW = Math.min(1920, Math.max(720, img.width));
      const outH = Math.max(1, Math.round(outW / r));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      const crop = cropSourceRect();
      ctx.fillStyle = '#050f0f';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outW, outH);
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error('Could not crop photo'));
            return;
          }
          resolve(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.9
      );
    });
  }

  function finish(file) {
    const root = document.getElementById('imageCropSheet');
    root?.classList.remove('is-open');
    document.body.style.overflow = '';
    if (state?.objectUrl) {
      try {
        URL.revokeObjectURL(state.objectUrl);
      } catch (_e) {}
    }
    const done = resolveOpen;
    resolveOpen = null;
    state = null;
    if (done) done(file || null);
  }

  function cancel() {
    finish(null);
  }

  async function apply() {
    const btn = document.querySelector('#imageCropSheet .ics-use');
    if (!state || !btn || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const file = await exportFile();
      finish(file);
    } catch (err) {
      window.SocialUI?.toast?.(err.message || 'Crop failed', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Use photo';
      }
    }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        resolve({ img: img, url: url });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image'));
      };
      img.src = url;
    });
  }

  async function open(file, opts) {
    if (!file) return null;
    ensureDom();
    const title = (opts && opts.title) || 'Crop photo';
    document.getElementById('icsTitle').textContent = title;
    document.querySelectorAll('#icsRatios button').forEach(function (b, i) {
      b.classList.toggle('is-active', i === 0);
    });
    document.getElementById('icsZoom').value = '1';
    document.getElementById('imageCropSheet').classList.add('is-open');
    document.body.style.overflow = 'hidden';

    try {
      const loaded = await loadImage(file);
      state = {
        file: file,
        img: loaded.img,
        objectUrl: loaded.url,
        ratioId: 'original',
        ratio: 0,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        dragging: false,
        frameW: 320,
        frameH: 180,
        dpr: 1,
      };
      layoutStage();
      clampPan();
      draw();
    } catch (err) {
      window.SocialUI?.toast?.(err.message || 'Could not open image', 'error');
      document.getElementById('imageCropSheet')?.classList.remove('is-open');
      document.body.style.overflow = '';
      return null;
    }

    return new Promise(function (resolve) {
      resolveOpen = resolve;
    });
  }

  window.ImageCropSheet = { open: open };
})();
