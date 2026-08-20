/**
 * Create post / moment — caption, media crop & 60s video trim, @ # visibility.
 */
(function () {
  const MAX_VIDEO_SEC = 60;
  let pendingFile = null;
  let pendingTrim = null;
  let pendingFit = 'original';
  let editorState = null;

  function normalizeFit(value) {
    const s = String(value || 'original').toLowerCase();
    if (s === '9:16' || s === 'portrait') return '9:16';
    if (s === '16:9' || s === 'landscape') return '16:9';
    if (s === '1:1' || s === 'square') return '1:1';
    if (s === '4:5') return '4:5';
    return 'original';
  }

  function detectFitFromSize(w, h) {
    const nw = Number(w) || 0;
    const nh = Number(h) || 0;
    if (!nw || !nh) return 'original';
    const r = nw / nh;
    if (Math.abs(r - 1) <= 0.08) return '1:1';
    if (Math.abs(r - 16 / 9) <= 0.12) return '16:9';
    if (Math.abs(r - 9 / 16) <= 0.08) return '9:16';
    if (Math.abs(r - 4 / 5) <= 0.08) return '4:5';
    return 'original';
  }

  function fitToRatio(fit) {
    const f = normalizeFit(fit);
    if (f === '9:16') return 9 / 16;
    if (f === '1:1') return 1;
    if (f === '4:5') return 0.8;
    if (f === '16:9') return 16 / 9;
    return 0;
  }

  function setFitButtons(fit) {
    const wanted = normalizeFit(fit);
    document.querySelectorAll('#socialCreateCropTools [data-fit]').forEach((b) => {
      b.classList.toggle('active', b.dataset.fit === wanted);
    });
  }

  function ensureOverlay() {
    let el = document.getElementById('social-create-overlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'social-create-overlay';
    el.className = 'social-create-overlay';
    el.innerHTML = `
      <div class="social-create-sheet" role="dialog" aria-labelledby="socialCreateTitle">
        <h3 id="socialCreateTitle">New moment</h3>
        <textarea id="socialCreateCaption" placeholder="Write a caption… Use @mention and #hashtag"></textarea>
        <div class="social-create-toolbar">
          <button type="button" data-pick="image"><i class="fas fa-image"></i> Photo</button>
          <button type="button" data-pick="video"><i class="fas fa-video"></i> Video</button>
          <button type="button" data-insert="@">@ Mention</button>
          <button type="button" data-insert="#"># Hashtag</button>
        </div>
        <div class="social-create-editor" id="socialCreateEditor" style="display:none">
          <div class="social-create-editor-head">
            <span id="socialCreateEditorLabel">Edit media</span>
            <button type="button" class="social-create-editor-apply" id="socialCreateEditorApply">Apply</button>
          </div>
          <div class="social-create-crop-stage" id="socialCreateCropStage">
            <canvas id="socialCreateCropCanvas"></canvas>
            <div class="social-create-crop-frame" id="socialCreateCropFrame"></div>
          </div>
          <div class="social-create-video-stage" id="socialCreateVideoStage" style="display:none">
            <video id="socialCreateTrimVideo" playsinline muted></video>
            <div class="social-create-trim-bar">
              <input type="range" id="socialCreateTrimStart" min="0" max="0" step="0.1" value="0">
              <input type="range" id="socialCreateTrimEnd" min="0" max="0" step="0.1" value="0">
            </div>
            <p class="social-create-trim-hint" id="socialCreateTrimHint">Select up to 60 seconds</p>
          </div>
          <div class="social-create-crop-tools" id="socialCreateCropTools">
            <button type="button" data-fit="original">Original</button>
            <button type="button" data-fit="9:16">9:16</button>
            <button type="button" data-fit="1:1">1:1</button>
            <button type="button" data-fit="4:5">4:5</button>
            <button type="button" data-fit="16:9">16:9</button>
            <label class="social-create-zoom-label" id="socialCreateZoomLabel">Zoom
              <input type="range" id="socialCreateZoom" min="1" max="3" step="0.05" value="1">
            </label>
          </div>
        </div>
        <div class="social-create-preview" id="socialCreatePreview">
          <button type="button" class="social-create-preview-clear" id="socialCreatePreviewClear" aria-label="Remove media"><i class="fas fa-times"></i></button>
          <button type="button" class="social-create-preview-edit" id="socialCreatePreviewEdit" aria-label="Edit media"><i class="fas fa-crop"></i> Edit</button>
          <img alt="" id="socialCreatePreviewImg">
          <video id="socialCreatePreviewVideo" controls playsinline style="display:none;width:auto;max-width:100%;max-height:240px;border-radius:12px;margin:0 auto;object-fit:contain;background:#000"></video>
          <p class="social-create-progress" id="socialCreateProgress" style="display:none">Uploading…</p>
        </div>
        <input type="file" id="socialCreateFile" accept="image/*,video/*" hidden>
        <div class="social-create-visibility">
          <label><input type="radio" name="socialVis" value="public" checked><span> Public</span></label>
          <label><input type="radio" name="socialVis" value="private"><span> Private</span></label>
        </div>
        <div class="social-create-actions">
          <button type="button" class="cancel" id="socialCreateCancel">Cancel</button>
          <button type="button" class="post" id="socialCreatePost">Post</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
    document.getElementById('socialCreateCancel').addEventListener('click', close);
    document.getElementById('socialCreatePost').addEventListener('click', submit);
    document.getElementById('socialCreatePreviewClear')?.addEventListener('click', clearPreview);
    document.getElementById('socialCreatePreviewEdit')?.addEventListener('click', () => {
      if (pendingFile) openEditor(pendingFile);
    });
    document.getElementById('socialCreateEditorApply')?.addEventListener('click', applyEditor);

    const fileInput = document.getElementById('socialCreateFile');
    el.querySelector('[data-pick="image"]').addEventListener('click', () => {
      fileInput.accept = 'image/*';
      fileInput.click();
    });
    el.querySelector('[data-pick="video"]').addEventListener('click', () => {
      fileInput.accept = 'video/*';
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      pendingFile = f;
      openEditor(f);
    });

    el.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById('socialCreateCaption');
        const ch = btn.dataset.insert;
        ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + ch;
        ta.focus();
      });
    });

    document.getElementById('socialCreateZoom')?.addEventListener('input', () => {
      if (editorState?.mode === 'image') drawCropPreview();
    });
    document.querySelectorAll('#socialCreateCropTools [data-fit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fit = normalizeFit(btn.dataset.fit);
        setFitButtons(fit);
        pendingFit = fit;
        if (editorState) editorState.fit = fit;
        const videoStage = document.getElementById('socialCreateVideoStage');
        if (videoStage) videoStage.dataset.fit = fit;
        if (editorState?.mode === 'image') {
          editorState.ratio = fitToRatio(fit);
          drawCropPreview();
        }
      });
    });

    const trimStart = document.getElementById('socialCreateTrimStart');
    const trimEnd = document.getElementById('socialCreateTrimEnd');
    trimStart?.addEventListener('input', onTrimChange);
    trimEnd?.addEventListener('input', onTrimChange);

    if (window.SocialUI) SocialUI.attachMentionAutocomplete(document.getElementById('socialCreateCaption'));

    return el;
  }

  function onTrimChange() {
    const trimStart = document.getElementById('socialCreateTrimStart');
    const trimEnd = document.getElementById('socialCreateTrimEnd');
    const video = document.getElementById('socialCreateTrimVideo');
    const hint = document.getElementById('socialCreateTrimHint');
    if (!editorState || editorState.mode !== 'video' || !trimStart || !trimEnd) return;

    let start = parseFloat(trimStart.value);
    let end = parseFloat(trimEnd.value);
    const dur = editorState.duration || 0;

    if (end - start > MAX_VIDEO_SEC) {
      if (trimStart === document.activeElement) end = start + MAX_VIDEO_SEC;
      else start = end - MAX_VIDEO_SEC;
    }
    if (end <= start) end = Math.min(start + 0.5, dur);
    start = Math.max(0, start);
    end = Math.min(dur, end);

    trimStart.value = String(start);
    trimEnd.value = String(end);
    editorState.trimStart = start;
    editorState.trimEnd = end;

    if (video) video.currentTime = start;
    if (hint) {
      const len = (end - start).toFixed(1);
      hint.textContent = len + 's selected (max ' + MAX_VIDEO_SEC + 's)';
    }
  }

  function openEditor(file) {
    const editor = document.getElementById('socialCreateEditor');
    const cropStage = document.getElementById('socialCreateCropStage');
    const videoStage = document.getElementById('socialCreateVideoStage');
    const cropTools = document.getElementById('socialCreateCropTools');
    const zoomLabel = document.getElementById('socialCreateZoomLabel');
    const label = document.getElementById('socialCreateEditorLabel');
    const preview = document.getElementById('socialCreatePreview');
    if (preview) preview.style.display = 'none';
    if (editor) editor.style.display = 'block';

    if (file.type.startsWith('video/')) {
      editorState = { mode: 'video', file, fit: 'original', trimStart: 0, trimEnd: MAX_VIDEO_SEC, duration: 0 };
      pendingFit = 'original';
      setFitButtons('original');
      if (cropStage) cropStage.style.display = 'none';
      if (cropTools) cropTools.style.display = 'flex';
      if (zoomLabel) zoomLabel.style.display = 'none';
      if (videoStage) {
        videoStage.style.display = 'block';
        videoStage.dataset.fit = 'original';
      }
      if (label) label.textContent = 'Trim & frame (max 60s)';

      const video = document.getElementById('socialCreateTrimVideo');
      const trimStart = document.getElementById('socialCreateTrimStart');
      const trimEnd = document.getElementById('socialCreateTrimEnd');
      const hint = document.getElementById('socialCreateTrimHint');
      if (!video || !trimStart || !trimEnd) return;

      const url = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.playsInline = true;
      video.muted = true;
      video.src = url;
      video.onloadedmetadata = () => {
        const dur = Number.isFinite(video.duration) ? video.duration : MAX_VIDEO_SEC;
        editorState.duration = dur;
        trimStart.min = '0';
        trimStart.max = String(Math.max(0, dur - 0.1));
        trimStart.value = '0';
        trimEnd.min = '0.1';
        trimEnd.max = String(dur);
        trimEnd.value = String(Math.min(dur, MAX_VIDEO_SEC));
        editorState.trimStart = 0;
        editorState.trimEnd = Math.min(dur, MAX_VIDEO_SEC);
        const native = detectFitFromSize(video.videoWidth, video.videoHeight);
        pendingFit = native;
        editorState.fit = native;
        setFitButtons(native);
        if (videoStage) {
          videoStage.dataset.fit = native;
          videoStage.dataset.native = native;
        }
        if (video.videoWidth && video.videoHeight) {
          video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        }
        onTrimChange();
      };
      video.onerror = () => {
        editorState.duration = MAX_VIDEO_SEC;
        editorState.trimStart = 0;
        editorState.trimEnd = MAX_VIDEO_SEC;
        editorState.previewFailed = true;
        trimStart.value = '0';
        trimEnd.value = String(MAX_VIDEO_SEC);
        if (hint) hint.textContent = 'Preview unavailable — apply to upload (max 60s clip)';
      };
      return;
    }

    editorState = { mode: 'image', file, fit: '4:5', ratio: 0.8, zoom: 1, offsetX: 0, offsetY: 0 };
    pendingFit = '4:5';
    setFitButtons('4:5');
    if (cropStage) cropStage.style.display = 'block';
    if (cropTools) cropTools.style.display = 'flex';
    if (zoomLabel) zoomLabel.style.display = '';
    if (videoStage) videoStage.style.display = 'none';
    if (label) label.textContent = 'Crop photo';

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      editorState.img = img;
      editorState.naturalW = img.width;
      editorState.naturalH = img.height;
      drawCropPreview();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showPreview(file);
    };
    img.src = url;
  }

  function drawCropPreview() {
    if (!editorState?.img) return;
    const canvas = document.getElementById('socialCreateCropCanvas');
    const zoomEl = document.getElementById('socialCreateZoom');
    if (!canvas) return;

    const stageW = Math.min(360, window.innerWidth - 48);
    const ratio = editorState.ratio || fitToRatio(editorState.fit);
    const stageH = ratio > 0 ? Math.round(stageW / ratio) : Math.round(stageW * (editorState.naturalH / Math.max(1, editorState.naturalW)));
    canvas.width = stageW;
    canvas.height = stageH;
    canvas.style.width = stageW + 'px';
    canvas.style.height = stageH + 'px';

    const zoom = parseFloat(zoomEl?.value || '1');
    editorState.zoom = zoom;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, stageW, stageH);

    const img = editorState.img;
    const cover = ratio > 0;
    const scale = (cover
      ? Math.max(stageW / img.width, stageH / img.height)
      : Math.min(stageW / img.width, stageH / img.height)) * zoom;
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (stageW - dw) / 2 + (editorState.offsetX || 0);
    const dy = (stageH - dh) / 2 + (editorState.offsetY || 0);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  async function exportCroppedImage() {
    const canvas = document.getElementById('socialCreateCropCanvas');
    if (!canvas) throw new Error('Crop failed');
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))),
        'image/jpeg',
        0.88
      );
    });
  }

  async function applyEditor() {
    const applyBtn = document.getElementById('socialCreateEditorApply');
    const prog = document.getElementById('socialCreateProgress');
    if (!editorState) return;
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';
    if (prog) {
      prog.style.display = 'block';
      prog.textContent = editorState.mode === 'video' ? 'Preparing video…' : 'Cropping photo…';
    }

    try {
      let out;
      pendingFit = normalizeFit(editorState.fit || pendingFit);
      if (editorState.mode === 'image') {
        if (pendingFit === 'original') {
          out = editorState.file;
        } else {
          const blob = await exportCroppedImage();
          out = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        }
        pendingTrim = null;
      } else {
        const selLen = (editorState.trimEnd || 0) - (editorState.trimStart || 0);
        if (selLen <= 0) throw new Error('Select a valid clip range.');
        if (selLen > MAX_VIDEO_SEC + 0.15) {
          throw new Error('Clip must be 60 seconds or less. Adjust the trim sliders.');
        }
        out = editorState.file;
        pendingTrim = { start: editorState.trimStart || 0, end: editorState.trimEnd || MAX_VIDEO_SEC };
      }
      pendingFile = out;
      document.getElementById('socialCreateEditor').style.display = 'none';
      showPreview(out);
    } catch (err) {
      if (window.SocialUI) SocialUI.showError('Edit failed', err.message || 'Try another file.');
      else alert(err.message || 'Edit failed');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply';
      if (prog) prog.style.display = 'none';
    }
  }

  function showPreview(file) {
    const prev = document.getElementById('socialCreatePreview');
    const img = document.getElementById('socialCreatePreviewImg');
    const vid = document.getElementById('socialCreatePreviewVideo');
    prev.style.display = 'block';
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.src = url;
      vid.onloadedmetadata = () => {
        if (vid.videoWidth && vid.videoHeight) {
          vid.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
        }
      };
    } else {
      vid.style.display = 'none';
      img.style.display = 'block';
      img.src = url;
    }
  }

  function clearPreview() {
    pendingFile = null;
    pendingTrim = null;
    pendingFit = 'original';
    editorState = null;
    const prev = document.getElementById('socialCreatePreview');
    const editor = document.getElementById('socialCreateEditor');
    const img = document.getElementById('socialCreatePreviewImg');
    const vid = document.getElementById('socialCreatePreviewVideo');
    const fileInput = document.getElementById('socialCreateFile');
    if (editor) editor.style.display = 'none';
    if (prev) prev.style.display = 'none';
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    if (vid) {
      vid.src = '';
      vid.style.display = 'none';
    }
    if (fileInput) fileInput.value = '';
  }

  function open() {
    if (!window.SocialInteractions?.savePostFromForm) {
      if (window.SocialUI) SocialUI.showError('Not ready', 'Please wait a moment and try again.');
      return;
    }
    const el = ensureOverlay();
    pendingFile = null;
    pendingTrim = null;
    pendingFit = 'original';
    editorState = null;
    document.getElementById('socialCreateCaption').value = '';
    document.getElementById('socialCreatePreview').style.display = 'none';
    document.getElementById('socialCreateEditor').style.display = 'none';
    document.getElementById('socialCreateProgress').style.display = 'none';
    document.getElementById('socialCreateFile').value = '';
    const pub = document.querySelector('input[name="socialVis"][value="public"]');
    if (pub) pub.checked = true;
    el.classList.add('is-open');
    if (window.SocialUI) SocialUI.attachMentionAutocomplete(document.getElementById('socialCreateCaption'));
  }

  function close() {
    document.getElementById('social-create-overlay')?.classList.remove('is-open');
    pendingFile = null;
    pendingTrim = null;
    pendingFit = 'original';
    editorState = null;
  }

  async function submit() {
    const caption = document.getElementById('socialCreateCaption').value.trim();
    const vis = document.querySelector('input[name="socialVis"]:checked')?.value || 'public';
    const btn = document.getElementById('socialCreatePost');
    const prog = document.getElementById('socialCreateProgress');
    if (btn?.dataset.posting === '1') return;
    if (btn) {
      btn.dataset.posting = '1';
      btn.disabled = true;
      btn.textContent = 'Posting…';
    }
    if (prog) {
      prog.style.display = 'block';
      prog.textContent = fileIsVideo(pendingFile) ? 'Saving video…' : 'Saving…';
    }
    const unlock = () => {
      if (btn) {
        btn.dataset.posting = '0';
        btn.disabled = false;
        btn.textContent = 'Post';
      }
      if (prog) prog.style.display = 'none';
    };
    const hardTimeout = setTimeout(() => {
      unlock();
      if (window.SocialUI) {
        SocialUI.showError('Posting timed out', 'Close this sheet and try a shorter video (under 10s).');
      } else {
        alert('Posting timed out. Try a shorter video.');
      }
    }, 20000);
    try {
      if (!window.SocialInteractions?.savePostFromForm) {
        throw new Error('Upload module not loaded. Refresh the page and try again.');
      }
      await Promise.race([
        SocialInteractions.savePostFromForm(caption, vis, pendingFile, {
          skipCompress: true,
          trimStart: pendingTrim?.start,
          trimEnd: pendingTrim?.end,
          aspectRatio: pendingFit,
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Posting took too long. Try a shorter video.')), 18000)
        ),
      ]);
      clearTimeout(hardTimeout);
      close();
      if (window.SocialUI) SocialUI.showSuccess('Posted!', 'Your moment is live on Square.');
      else if (window.SocialInteractions?.toast) SocialInteractions.toast('Posted to Square!', 'success');
      if ((window.location.pathname || '').endsWith('square.html')) {
        await SocialInteractions.renderSquareFeed('squareFeed');
      } else {
        window.location.href = '/square.html?app=1';
      }
    } catch (err) {
      clearTimeout(hardTimeout);
      if (window.SocialUI) SocialUI.showError('Could not post', err.message || 'Try a smaller photo or shorter video.');
      else alert(err.message || 'Could not post.');
    } finally {
      clearTimeout(hardTimeout);
      unlock();
    }
  }

  function fileIsVideo(file) {
    return Boolean(file && String(file.type || '').startsWith('video/'));
  }

  function bindCameraButtons() {
    document.querySelectorAll('[data-social-camera]').forEach((btn) => {
      if (btn.dataset.cameraBound) return;
      btn.dataset.cameraBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    });
  }

  window.SocialCreatePost = { open, close, bindCameraButtons };
})();
