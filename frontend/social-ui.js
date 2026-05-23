/**
 * Toasts, modals, mention suggestions, avatar fallbacks
 */
(function () {
  function ensureToast() {
    let el = document.getElementById('socialToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'socialToast';
      el.className = 'social-toast';
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg, type) {
    const el = ensureToast();
    el.textContent = msg;
    el.className = 'social-toast show' + (type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function showError(title, message) {
    toast(message || title, 'error');
    let modal = document.getElementById('socialAlertModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'socialAlertModal';
      modal.className = 'social-alert-modal';
      modal.innerHTML = `
        <div class="social-alert-card">
          <div class="social-alert-icon is-error"><i class="fas fa-exclamation-circle"></i></div>
          <h3 id="socialAlertTitle">Something went wrong</h3>
          <p id="socialAlertMsg"></p>
          <button type="button" class="social-alert-btn" id="socialAlertOk">OK</button>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
      document.getElementById('socialAlertOk').addEventListener('click', () => modal.classList.remove('open'));
    }
    document.getElementById('socialAlertTitle').textContent = title || 'Could not complete';
    document.getElementById('socialAlertMsg').textContent = message || '';
    modal.classList.add('open');
  }

  function showSuccess(title, message) {
    toast(message || title, 'success');
  }

  function avatarUrl(name, photoUrl) {
    if (photoUrl && String(photoUrl).startsWith('http')) return photoUrl;
    if (photoUrl && String(photoUrl).startsWith('data:')) return photoUrl;
    const n = encodeURIComponent(String(name || 'U').trim().slice(0, 2) || 'U');
    return `https://ui-avatars.com/api/?name=${n}&background=c9a227&color=fff&size=256&bold=true`;
  }

  function bindAvatarFallbacks(root) {
    (root || document).querySelectorAll('img').forEach((img) => {
      if (img.dataset.avBound) return;
      img.dataset.avBound = '1';
      const name = img.alt || img.dataset.name || 'User';
      if (!img.src || img.src === location.href) img.src = avatarUrl(name);
      img.addEventListener('error', () => {
        img.src = avatarUrl(name);
        img.onerror = null;
      });
    });
  }

  async function mentionSuggestions(query) {
    const q = String(query || '').toLowerCase();
    const follows = JSON.parse(localStorage.getItem('social_follows') || '[]');
    let pros = [];
    try {
      if (window.SocialShell?.fetchPros) pros = await SocialShell.fetchPros(20);
    } catch (_e) {}
    const names = new Set([
      ...follows,
      ...pros.map((p) => p.name),
      ...(window.Auth?.getUser?.() ? [`${Auth.getUser().first_name || ''} ${Auth.getUser().last_name || ''}`.trim()] : []),
    ]);
    return [...names]
      .filter(Boolean)
      .filter((n) => !q || n.toLowerCase().includes(q))
      .slice(0, 8);
  }

  function attachMentionAutocomplete(textarea) {
    if (!textarea || textarea.dataset.mentionBound) return;
    textarea.dataset.mentionBound = '1';
    let box = document.getElementById('socialMentionList');
    if (!box) {
      box = document.createElement('div');
      box.id = 'socialMentionList';
      box.className = 'social-mention-list';
      textarea.parentElement.appendChild(box);
    }
    textarea.addEventListener('input', async () => {
      const val = textarea.value;
      const at = val.slice(0, textarea.selectionStart).lastIndexOf('@');
      if (at < 0) {
        box.classList.remove('open');
        return;
      }
      const frag = val.slice(at + 1, textarea.selectionStart);
      if (/\s/.test(frag)) {
        box.classList.remove('open');
        return;
      }
      const items = await mentionSuggestions(frag);
      if (!items.length) {
        box.classList.remove('open');
        return;
      }
      box.innerHTML = items.map((n) => `<button type="button" data-name="${n.replace(/"/g, '&quot;')}">@${n}</button>`).join('');
      box.classList.add('open');
      box.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => {
          const before = val.slice(0, at);
          const after = val.slice(textarea.selectionStart);
          textarea.value = before + '@' + btn.dataset.name + ' ' + after;
          box.classList.remove('open');
          textarea.focus();
        };
      });
    });
  }

  window.SocialUI = {
    toast,
    showError,
    showSuccess,
    avatarUrl,
    bindAvatarFallbacks,
    mentionSuggestions,
    attachMentionAutocomplete,
  };
})();
