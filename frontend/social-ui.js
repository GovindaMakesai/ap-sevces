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
    'This payment reference was already submitted': 'This UTR was already used. Check your payment or contact support if you need help.',
    'UTR must be 10–22 digits (check your UPI payment receipt)': 'Enter the full UTR number from your UPI app (10–22 digits).',
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
    const friendly = friendlyMessage(msg);
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
      sheet.querySelector('.social-follow-panel')?.addEventListener('click', (e) => e.stopPropagation());
    }
    document.getElementById('socialFollowTitle').textContent = kind === 'followers' ? 'Followers' : 'Following';
    const list = document.getElementById('socialFollowList');
    if (!items.length) {
      list.innerHTML =
        '<div class="social-follow-empty"><i class="fas fa-user-friends"></i><p>' +
        (kind === 'followers'
          ? 'No followers yet. Go live and share your profile!'
          : 'You are not following anyone yet.') +
        '</p><a href="/discover-creators.html?app=1" class="social-follow-cta">Discover creators</a></div>';
    } else {
      list.innerHTML = items
        .map(function (item) {
          const uid = String(item.userId || item.id || item.key || '').trim();
          const profileHref =
            item.href ||
            (uid
              ? '/creator-profile.html?userId=' + encodeURIComponent(uid) + '&name=' + safeEncodeURIComponent(item.name || 'User') + '&app=1'
              : '/creator-profile.html?name=' + safeEncodeURIComponent(item.name || 'User') + '&app=1');
          const following = uid && window.SocialInteractions?.isFollowing
            ? SocialInteractions.isFollowing(uid, item.name)
            : false;
          const followLabel = following ? 'Following' : 'Follow';
          const followBtn = uid
            ? '<button type="button" class="social-follow-action' + (following ? ' is-on' : '') + '" data-follow-id="' + encodeURIComponent(uid) + '" data-follow-name="' + safeEncodeURIComponent(item.name || 'User') + '">' + followLabel + '</button>'
            : '';
          const msgBtn = uid
            ? '<button type="button" class="social-follow-msg" data-msg-id="' + encodeURIComponent(uid) + '" aria-label="Message"><i class="fas fa-comment"></i></button>'
            : '';
          return (
            '<div class="social-follow-row">' +
            '<a class="social-follow-link" href="' + profileHref + '"><img src="' +
            avatarUrl(item.name, item.photo) +
            '" alt=""><span>' +
            (item.name || 'User') +
            '</span></a>' +
            followBtn +
            msgBtn +
            '</div>'
          );
        })
        .join('');
      list.querySelectorAll('.social-follow-msg').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = String(btn.getAttribute('data-msg-id') || '').trim();
          if (!id) return;
          sheet.classList.remove('open');
          location.href = '/chat.html?id=' + encodeURIComponent(id) + '&app=1';
        });
      });
      list.querySelectorAll('.social-follow-action').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = String(btn.getAttribute('data-follow-id') || '').trim();
          const name = safeDecodeURIComponent(btn.getAttribute('data-follow-name') || 'User');
          if (!id || !window.SocialInteractions?.toggleFollow) return;
          const now = await SocialInteractions.toggleFollow(id, name);
          btn.textContent = now ? 'Following' : 'Follow';
          btn.classList.toggle('is-on', now);
        });
      });
      list.querySelectorAll('.social-follow-link').forEach((link) => {
        link.addEventListener('click', () => sheet.classList.remove('open'));
      });
    }
    sheet.classList.add('open');
  }

  function firstGrapheme(str) {
    const s = String(str || '').trim();
    if (!s) return '';
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        const first = seg.segment(s)[Symbol.iterator]().next().value;
        return first?.segment || '';
      }
    } catch (_e) { /* fall through */ }
    try {
      return Array.from(s)[0] || '';
    } catch (_e2) {
      return s.charAt(0) || '';
    }
  }

  /** First safe A–Z / 0–9 letter inside a token (skips leading emoji). */
  function firstSafeLetter(part) {
    const s = String(part || '');
    try {
      for (const g of Array.from(s)) {
        const cp = g.codePointAt(0) || 0;
        if (cp > 0xffff || (cp >= 0x2600 && cp <= 0x27bf)) continue;
        if (g.length === 1 && /[A-Za-z0-9]/.test(g)) return g.toUpperCase();
      }
    } catch (_e) { /* ignore */ }
    return '';
  }

  function initials(name) {
    const parts = String(name || 'U')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const letters = parts.map(firstSafeLetter).filter(Boolean);
    return (letters.join('') || 'U').slice(0, 2);
  }

  function safeEncodeURIComponent(value) {
    const raw = String(value ?? '');
    try {
      return encodeURIComponent(raw);
    } catch (_e) {
      /* Strip lone surrogates / broken unicode that throw "URI malformed" */
      const cleaned = raw.replace(/[\uD800-\uDFFF]/g, '').replace(/[^\x20-\x7E]/g, '');
      try {
        return encodeURIComponent(cleaned || 'User');
      } catch (_e2) {
        return 'User';
      }
    }
  }

  function safeDecodeURIComponent(value) {
    const raw = String(value ?? '');
    try {
      return decodeURIComponent(raw);
    } catch (_e) {
      return raw;
    }
  }

  function svgDataUrl(svg) {
    try {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    } catch (_e) {
      /* Fallback without risky text if encode still fails */
      return (
        'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
            '<rect width="256" height="256" rx="128" fill="#c9a227"/>' +
            '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
            'font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="#fff">U</text></svg>'
        )
      );
    }
  }

  function avatarUrl(name, photoUrl) {
    if (photoUrl) {
      if (window.SocialShell?.getImageUrl) {
        const built = SocialShell.getImageUrl(photoUrl);
        if (built) return built;
      }
      const p = String(photoUrl).trim();
      if (p.startsWith('http') || p.startsWith('data:') || p.startsWith('blob:')) return p;
      if (p.startsWith('//')) return `https:${p}`;
      const embedded = p.match(/https?:\/\/[^\s"'<>]+/i);
      if (embedded) return embedded[0];
      const base = (window.CONFIG?.BACKEND_URL || String(window.CONFIG?.API_URL || '').replace(/\/api\/?$/, '') || '').replace(/\/$/, '');
      const path = p.startsWith('/') ? p : `/${p}`;
      return base ? base + path : path;
    }
    const label = initials(name);
    return svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#9a7218"/></linearGradient></defs>' +
        '<rect width="256" height="256" rx="128" fill="url(#g)"/>' +
        '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
        'font-family="Arial,sans-serif" font-size="96" font-weight="700" fill="#fff">' +
        label +
        '</text></svg>'
    );
  }

  /** Theme covers for live / party / video cards when no real photo exists */
  function themeCover(kind, label) {
    const kinds = {
      live: {
        c1: '#1a0f3a',
        c2: '#7c3aed',
        c3: '#c9a227',
        icon: '&#9679;',
        sub: 'AP LIVE',
      },
      party: {
        c1: '#12082a',
        c2: '#6d28d9',
        c3: '#f59e0b',
        icon: '&#9835;',
        sub: 'AP PARTY',
      },
      audio: {
        c1: '#0d0820',
        c2: '#4338ca',
        c3: '#e8c56a',
        icon: '&#127908;',
        sub: 'AP VOICE',
      },
      video: {
        c1: '#0a0618',
        c2: '#312e81',
        c3: '#f59e0b',
        icon: '&#9654;',
        sub: 'VIDEO',
      },
      services: {
        c1: '#fdf8eb',
        c2: '#c9a227',
        c3: '#8b6914',
        icon: '&#128736;',
        sub: 'AP Services',
      },
      topic: {
        c1: '#2e1064',
        c2: '#a855f7',
        c3: '#fbbf24',
        icon: '#',
        sub: 'TOPIC',
      },
    };
    const k = kinds[kind] || kinds.live;
    const title = String(label || k.sub).slice(0, 18).replace(/[<>&"]/g, '');
    return svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">' +
        '<defs><linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">' +
        '<stop offset="0%" stop-color="' +
        k.c1 +
        '"/><stop offset="55%" stop-color="' +
        k.c2 +
        '"/><stop offset="100%" stop-color="' +
        k.c3 +
        '"/></linearGradient>' +
        '<pattern id="d" width="40" height="40" patternUnits="userSpaceOnUse">' +
        '<circle cx="20" cy="20" r="1.2" fill="#fff" opacity="0.08"/></pattern></defs>' +
        '<rect width="400" height="500" fill="url(#bg)"/><rect width="400" height="500" fill="url(#d)"/>' +
        '<circle cx="200" cy="190" r="72" fill="rgba(255,255,255,0.12)"/>' +
        '<text x="200" y="205" text-anchor="middle" font-size="52" fill="#fff" opacity="0.9">' +
        k.icon +
        '</text>' +
        '<text x="200" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" ' +
        'font-weight="700" fill="#fff">' +
        title +
        '</text>' +
        '<text x="200" y="340" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" ' +
        'fill="rgba(255,255,255,0.65)">' +
        k.sub +
        '</text>' +
        '<text x="200" y="470" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" ' +
        'font-weight="700" fill="rgba(255,255,255,0.45)" letter-spacing="2">AP SERVICES</text></svg>'
    );
  }

  function bindAvatarFallbacks(root) {
    (root || document).querySelectorAll('img').forEach((img) => {
      if (img.dataset.avBound || img.dataset.profileAvatar) return;
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

  function isShareUserCancel(err) {
    return err?.name === 'AbortError' || err?.code === 20;
  }

  function isNativeWebView() {
    return Boolean(window.__AP_NATIVE_APP__ || window.ReactNativeWebView || window.Capacitor);
  }

  /** Native share sheet when available; clipboard only as last resort */
  async function shareLink(opts) {
    const hasUrl = opts && Object.prototype.hasOwnProperty.call(opts, 'url');
    const url = hasUrl ? String(opts.url || '') : String(opts?.url || location.href);
    const title = opts?.title || 'AP Services';
    const text = opts?.text || 'Join me on AP Services';
    const textOnly = hasUrl && !opts.url;

    async function copyLink() {
      const payload = textOnly ? text : url;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        toast(textOnly ? 'Invite copied' : 'Link copied', 'success');
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) {
        toast(textOnly ? 'Invite copied' : 'Link copied', 'success');
        return true;
      }
      window.prompt(textOnly ? 'Copy and share this invite:' : 'Copy this link:', payload);
      return true;
    }

    if (navigator.share) {
      const payloads = textOnly
        ? [{ title, text }, { text }]
        : [
            { title, text, url },
            { title, url },
            { url },
          ];
      for (const payload of payloads) {
        try {
          if (navigator.canShare && !navigator.canShare(payload)) continue;
          await navigator.share(payload);
          return true;
        } catch (e) {
          if (isShareUserCancel(e)) return false;
        }
      }
    }

    if (isNativeWebView() && window.ReactNativeWebView?.postMessage) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify(
            textOnly ? { type: 'share', title, text } : { type: 'share', title, text, url }
          )
        );
        return true;
      } catch (_e) {}
    }

    return copyLink();
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
    themeCover,
    initials,
    safeEncodeURIComponent,
    safeDecodeURIComponent,
    bindAvatarFallbacks,
    mentionSuggestions,
    attachMentionAutocomplete,
    shareLink,
  };
})();
