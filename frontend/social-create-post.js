/**
 * Create post / moment — caption, media crop & 10s video trim, @ # visibility.
 */
(function () {
  const MAX_VIDEO_SEC = 10;
  let pendingFile = null;
  let editorState = null;

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
            <p class="social-create-trim-hint" id="socialCreateTrimHint">Select up to 10 seconds</p>
          </div>
          <div class="social-create-crop-tools" id="socialCreateCropTools">
            <button type="button" data-ratio="1">1:1</button>
            <button type="button" data-ratio="0.8" class="active">4:5</button>
            <button type="button" data-ratio="1.777">16:9</button>
            <label class="social-create-zoom-label">Zoom
              <input type="range" id="socialCreateZoom" min="1" max="3" step="0.05" value="1">
            </label>
          </div>
        </div>
        <div class="social-create-preview" id="socialCreatePreview">
          <button type="button" class="social-create-preview-clear" id="socialCreatePreviewClear" aria-label="Remove media"><i class="fas fa-times"></i></button>
          <button type="button" class="social-create-preview-edit" id="socialCreatePreviewEdit" aria-label="Edit media"><i class="fas fa-crop"></i> Edit</button>
          <img alt="" id="socialCreatePreviewImg">
          <video id="socialCreatePreviewVideo" controls playsinline style="display:none;width:100%;max-height:200px;border-radius:12px"></video>
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
    document.querySelectorAll('#socialCreateCropTools [data-ratio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#socialCreateCropTools [data-ratio]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (editorState?.mode === 'image') {
          editorState.ratio = parseFloat(btn.dataset.ratio);
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
    const label = document.getElementById('socialCreateEditorLabel');
    const preview = document.getElementById('socialCreatePreview');
    if (preview) preview.style.display = 'none';
    if (editor) editor.style.display = 'block';

    if (file.type.startsWith('video/')) {
      editorState = { mode: 'video', file, trimStart: 0, trimEnd: MAX_VIDEO_SEC, duration: 0 };
      if (cropStage) cropStage.style.display = 'none';
      if (cropTools) cropTools.style.display = 'none';
      if (videoStage) videoStage.style.display = 'block';
      if (label) label.textContent = 'Trim video (max 10s)';

      const video = document.getElementById('socialCreateTrimVideo');
      const trimStart = document.getElementById('socialCreateTrimStart');
      const trimEnd = document.getElementById('socialCreateTrimEnd');
      if (!video || !trimStart || !trimEnd) return;

      const url = URL.createObjectURL(file);
      video.src = url;
      video.onloadedmetadata = () => {
        const dur = video.duration || MAX_VIDEO_SEC;
        editorState.duration = dur;
        trimStart.min = '0';
        trimStart.max = String(Math.max(0, dur - 0.1));
        trimStart.value = '0';
        trimEnd.min = '0.1';
        trimEnd.max = String(dur);
        trimEnd.value = String(Math.min(dur, MAX_VIDEO_SEC));
        editorState.trimStart = 0;
        editorState.trimEnd = Math.min(dur, MAX_VIDEO_SEC);
        onTrimChange();
      };
      return;
    }

    editorState = { mode: 'image', file, ratio: 0.8, zoom: 1, offsetX: 0, offsetY: 0 };
    if (cropStage) cropStage.style.display = 'block';
    if (cropTools) cropTools.style.display = 'flex';
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
    const ratio = editorState.ratio || 0.8;
    const stageH = Math.round(stageW / ratio);
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
    const scale = Math.max(stageW / img.width, stageH / img.height) * zoom;
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

  async function trimVideoBlob(file, start, end) {
    const clipLen = Math.min(end - start, MAX_VIDEO_SEC);
    if (clipLen <= 0) throw new Error('Invalid trim range');

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const src = URL.createObjectURL(file);
      video.src = src;

      video.onloadedmetadata = () => {
        const w = video.videoWidth || 720;
        const h = video.videoHeight || 1280;
        const scale = Math.min(1, 720 / Math.max(w, h));
        const cw = Math.round(w * scale) | 0;
        const ch = Math.round(h * scale) | 0;
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
        if (!mime || !canvas.captureStream) {
          URL.revokeObjectURL(src);
          resolve(file);
          return;
        }

        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1200000 });
        const chunks = [];
        recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
        recorder.onstop = () => {
          URL.revokeObjectURL(src);
          if (!chunks.length) {
            resolve(file);
            return;
          }
          resolve(new Blob(chunks, { type: mime.split(';')[0] }));
        };
        recorder.onerror = () => {
          URL.revokeObjectURL(src);
          resolve(file);
        };

        const stopAt = start + clipLen;
        video.currentTime = start;
        video.onseeked = () => {
          recorder.start(200);
          video.play().catch(() => {});
          const tick = () => {
            if (video.currentTime >= stopAt || video.ended) {
              video.pause();
              try {
                recorder.stop();
              } catch (_e) {
                resolve(file);
              }
              return;
            }
            ctx.drawImage(video, 0, 0, cw, ch);
            requestAnimationFrame(tick);
          };
          tick();
        };
      };
      video.onerror = () => {
        URL.revokeObjectURL(src);
        reject(new Error('Could not read video'));
      };
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
      prog.textContent = editorState.mode === 'video' ? 'Trimming video…' : 'Cropping photo…';
    }

    try {
      let out;
      if (editorState.mode === 'image') {
        const blob = await exportCroppedImage();
        out = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      } else {
        const blob = await trimVideoBlob(editorState.file, editorState.trimStart, editorState.trimEnd);
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
        out = new File([blob], 'clip.' + ext, { type: blob.type || 'video/webm' });
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
    } else {
      vid.style.display = 'none';
      img.style.display = 'block';
      img.src = url;
    }
  }

  function clearPreview() {
    pendingFile = null;
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
    editorState = null;
  }

  async function submit() {
    const caption = document.getElementById('socialCreateCaption').value.trim();
    const vis = document.querySelector('input[name="socialVis"]:checked')?.value || 'public';
    const btn = document.getElementById('socialCreatePost');
    const prog = document.getElementById('socialCreateProgress');
    btn.disabled = true;
    btn.textContent = 'Posting…';
    if (prog) {
      prog.style.display = 'block';
      prog.textContent = 'Saving…';
    }
    try {
      if (!window.SocialInteractions?.savePostFromForm) {
        throw new Error('Upload module not loaded. Refresh the page and try again.');
      }
      await SocialInteractions.savePostFromForm(caption, vis, pendingFile, { skipCompress: true });
      close();
      if (window.SocialUI) SocialUI.showSuccess('Posted!', 'Your moment is live on Square.');
      else if (window.SocialInteractions?.toast) SocialInteractions.toast('Posted to Square!', 'success');
      if ((window.location.pathname || '').endsWith('square.html')) {
        await SocialInteractions.renderSquareFeed('squareFeed');
      } else {
        window.location.href = '/square.html?app=1';
      }
    } catch (err) {
      if (window.SocialUI) SocialUI.showError('Could not post', err.message || 'Try a smaller photo or shorter video.');
      else alert(err.message || 'Could not post.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post';
      if (prog) prog.style.display = 'none';
    }
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
