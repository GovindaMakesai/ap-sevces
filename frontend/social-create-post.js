/**
 * Create post / moment — caption, media, @ # visibility (Public / Private).
 */
(function () {
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
        <div class="social-create-preview" id="socialCreatePreview"><img alt="" id="socialCreatePreviewImg"></div>
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
      if (!f) return;
      const url = URL.createObjectURL(f);
      const prev = document.getElementById('socialCreatePreview');
      const img = document.getElementById('socialCreatePreviewImg');
      prev.style.display = 'block';
      img.src = url;
    });

    el.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById('socialCreateCaption');
        const ch = btn.dataset.insert;
        ta.value += (ta.value && !ta.value.endsWith(' ') ? ' ' : '') + ch;
        ta.focus();
      });
    });

    return el;
  }

  function open() {
    const el = ensureOverlay();
    document.getElementById('socialCreateCaption').value = '';
    document.getElementById('socialCreatePreview').style.display = 'none';
    document.querySelector('input[name="socialVis"][value="public"]').checked = true;
    el.classList.add('is-open');
  }

  function close() {
    document.getElementById('social-create-overlay')?.classList.remove('is-open');
  }

  function submit() {
    const caption = document.getElementById('socialCreateCaption').value.trim();
    const vis = document.querySelector('input[name="socialVis"]:checked')?.value || 'public';
    const posts = JSON.parse(localStorage.getItem('social_posts') || '[]');
    const user = window.Auth?.getUser?.();
    posts.unshift({
      id: Date.now(),
      caption,
      visibility: vis,
      userName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'You',
      minsAgo: 0,
      likes: 0,
      comments: 0,
      image: document.getElementById('socialCreatePreviewImg')?.src || '',
    });
    localStorage.setItem('social_posts', JSON.stringify(posts.slice(0, 50)));
    close();
    if (window.Toast?.show) Toast.show('Posted to Square!', 'success');
    if ((window.location.pathname || '').endsWith('square.html')) {
      window.location.reload();
    } else {
      window.location.href = '/square.html?app=1';
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
