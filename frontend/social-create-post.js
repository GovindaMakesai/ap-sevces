/**
 * Create post / moment — caption, media, @ # visibility (Public / Private).
 */
(function () {
  let pendingFile = null;

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
        <div class="social-create-preview" id="socialCreatePreview">
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
      pendingFile = f || null;
      if (!f) return;
      const prev = document.getElementById('socialCreatePreview');
      const img = document.getElementById('socialCreatePreviewImg');
      const vid = document.getElementById('socialCreatePreviewVideo');
      prev.style.display = 'block';
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video/')) {
        img.style.display = 'none';
        vid.style.display = 'block';
        vid.src = url;
      } else {
        vid.style.display = 'none';
        img.style.display = 'block';
        img.src = url;
      }
    });

    el.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById('socialCreateCaption');
        const ch = btn.dataset.insert;
        ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + ch;
        ta.focus();
      });
    });

    if (window.SocialUI) SocialUI.attachMentionAutocomplete(document.getElementById('socialCreateCaption'));

    return el;
  }

  function open() {
    if (!window.SocialInteractions?.savePostFromForm) {
      if (window.SocialUI) SocialUI.showError('Not ready', 'Please wait a moment and try again.');
      return;
    }
    const el = ensureOverlay();
    pendingFile = null;
    document.getElementById('socialCreateCaption').value = '';
    document.getElementById('socialCreatePreview').style.display = 'none';
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
  }

  async function submit() {
    const caption = document.getElementById('socialCreateCaption').value.trim();
    const vis = document.querySelector('input[name="socialVis"]:checked')?.value || 'public';
    const btn = document.getElementById('socialCreatePost');
    const prog = document.getElementById('socialCreateProgress');
    btn.disabled = true;
    btn.textContent = 'Posting…';
    if (prog) prog.style.display = 'block';
    try {
      if (!window.SocialInteractions?.savePostFromForm) {
        throw new Error('Upload module not loaded. Refresh the page and try again.');
      }
      await SocialInteractions.savePostFromForm(caption, vis, pendingFile);
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
