/**
 * Toasts, modals, mention suggestions, avatar fallbacks
 */
(function () {
  const FRIENDLY_ERRORS = {
    INSUFFICIENT_BALANCE: 'Not enough coins. Head to Store to recharge.',
    'Insufficient coin balance': 'Not enough coins. Head to Store to recharge.',
    'Authentication required': 'Please sign in to continue.',
    'Invalid token': 'Your session expired. Please sign in again.',
    'Gift failed': 'We could not send that gift. Try again in a moment.',
    'Recharge submission failed': 'Recharge could not be submitted. Check your UTR and try again.',
  };

  function friendlyMessage(msg) {
    const text = String(msg || '').trim();
    if (!text) return 'Something went wrong. Please try again.';
    if (FRIENDLY_ERRORS[text]) return FRIENDLY_ERRORS[text];
    if (/network|fetch failed|failed to fetch/i.test(text)) {
      return 'Connection problem. Check your internet and try again.';
    }
    if (/unauthorized|401|403/i.test(text)) return 'Please sign in to continue.';
    if (/timeout/i.test(text)) return 'That took too long. Please try again.';
    return text;
  }

  function ensureToast() {
    let el = document.getElementById('socialToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'socialToast';
      el.className = 'social-toast';
      document.body.appendChild(el);
    }
    if (!el.querySelector('.social-toast-body')) {
      el.innerHTML =
        '<span class="social-toast-icon"></span>' +
        '<div class="social-toast-body">' +
        '<strong class="social-toast-title"></strong>' +
        '<span class="social-toast-msg"></span></div>';
    }
    return el;
  }

  function toast(msg, type, title) {
    const el = ensureToast();
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle',
    };
    const t = type || 'info';
    const icon = el.querySelector('.social-toast-icon');
    const titleEl = el.querySelector('.social-toast-title');
    const msgEl = el.querySelector('.social-toast-msg');
    if (icon) icon.innerHTML = '<i class="fas ' + (icons[t] || icons.info) + '"></i>';
    const friendly = t === 'error' ? friendlyMessage(msg) : msg;
    const defaultTitles = { success: 'Done', error: 'Oops', warning: 'Heads up', info: '' };
    if (titleEl) titleEl.textContent = title || defaultTitles[t] || '';
    if (msgEl) msgEl.textContent = friendly;
    el.className = 'social-toast show is-' + t;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), t === 'error' ? 4200 : 3200);
  }

  function showError(title, message) {
    toast(friendlyMessage(message), 'error', title || 'Something went wrong');
    let modal = document.getElementById('socialAlertModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'socialAlertModal';
      modal.className = 'social-alert-modal';
      modal.innerHTML =
        '<div class="social-alert-card">' +
        '<div class="social-alert-icon is-error"><i class="fas fa-exclamation-circle"></i></div>' +
        '<h3 id="socialAlertTitle">Something went wrong</h3>' +
        '<p id="socialAlertMsg"></p>' +
        '<button type="button" class="social-alert-btn" id="socialAlertOk">Got it</button></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
      document.getElementById('socialAlertOk').addEventListener('click', () => modal.classList.remove('open'));
    }
    document.getElementById('socialAlertTitle').textContent = title || 'Something went wrong';
    document.getElementById('socialAlertMsg').textContent = friendlyMessage(message);
    modal.classList.add('open');
  }

  function showSuccess(title, message) {
    toast(message || title, 'success', title && message ? title : 'Success');
  }

  function showInfo(title, message) {
    toast(message || title, 'info', title);
  }

  function openFollowSheet(kind, items) {
    let sheet = document.getElementById('socialFollowSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'socialFollowSheet';
      sheet.className = 'social-follow-sheet';
      sheet.innerHTML =
        '<div class="social-follow-panel">' +
        '<div class="social-follow-head">' +
        '<h3 id="socialFollowTitle">Following</h3>' +
        '<button type="button" id="socialFollowClose" aria-label="Close"><i class="fas fa-times"></i></button></div>' +
        '<div class="social-follow-list" id="socialFollowList"></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet) sheet.classList.remove('open');
      });
      sheet.querySelector('#socialFollowClose').addEventListener('click', () => sheet.classList.remove('open'));
    }
    document.getElementById('socialFollowTitle').textContent = kind === 'followers' ? 'Followers' : 'Following';
    const list = document.getElementById('socialFollowList');
    if (!items.length) {
      list.innerHTML =
        '<div class="social-follow-empty"><i class="fas fa-user-friends"></i><p>' +
        (kind === 'followers'
          ? 'No followers yet. Go live and share your profile!'
          : 'You are not following anyone yet.') +
        '</p><a href="/explore.html?app=1" class="social-follow-cta">Discover creators</a></div>';
    } else {
      list.innerHTML = items
        .map(function (item) {
          return (
            '<a class="social-follow-row" href="' +
            (item.href || '/creator-profile.html?name=' + encodeURIComponent(item.name)) +
            '"><img src="' +
            avatarUrl(item.name) +
            '" alt=""><span>' +
            item.name +
            '</span><i class="fas fa-chevron-right"></i></a>'
          );
        })
        .join('');
    }
    sheet.classList.add('open');
  }

  function avatarUrl(name, photoUrl) {
    if (photoUrl && String(photoUrl).startsWith('http')) return photoUrl;
    if (photoUrl && String(photoUrl).startsWith('data:')) return photoUrl;
    const n = encodeURIComponent(String(name || 'U').trim().slice(0, 2) || 'U');
    return 'https://ui-avatars.com/api/?name=' + n + '&background=c9a227&color=fff&size=256&bold=true';
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
    let follows = [];
    try {
      if (window.SocialInteractions?.getFollowingList) {
        follows = SocialInteractions.getFollowingList().map((e) => e.name);
      } else {
        follows = JSON.parse(localStorage.getItem('social_follows') || '[]').map((x) =>
          typeof x === 'string' ? x : x.name
        );
      }
    } catch (_e) {}
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
      box.innerHTML = items
        .map((n) => '<button type="button" data-name="' + n.replace(/"/g, '&quot;') + '">@' + n + '</button>')
        .join('');
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
    showInfo,
    friendlyMessage,
    openFollowSheet,
    avatarUrl,
    bindAvatarFallbacks,
    mentionSuggestions,
    attachMentionAutocomplete,
  };
})();
