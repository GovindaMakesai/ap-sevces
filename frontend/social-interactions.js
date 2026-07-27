/**
 * Posts, likes, comments, gifts, share — Square + Video reels
 */
(function () {
  const POSTS_KEY = 'social_posts';
  const LIKES_KEY = 'social_likes';
  const COMMENTS_KEY = 'social_comments';
  const FOLLOWS_KEY = 'social_follows';
  const IDB_NAME = 'ap_social_media';
  const IDB_STORE = 'blobs';

  const TOPIC_KINDS = ['topic', 'video', 'services', 'party', 'live', 'audio'];

  function topicThumb(i, label) {
    return topicCover(i, label);
  }

  function topicCover(i, label) {
    const palettes = [
      ['#1e1b4b', '#7c3aed', '#f472b6'],
      ['#0c4a6e', '#0284c7', '#38bdf8'],
      ['#7c2d12', '#ea580c', '#fbbf24'],
      ['#14532d', '#16a34a', '#86efac'],
      ['#4c0519', '#db2777', '#fda4af'],
      ['#312e81', '#6366f1', '#c4b5fd'],
    ];
    const icons = ['🎉', '💃', '🏠', '🎤', '✨', '🔥'];
    const [c0, c1, c2] = palettes[Number(i) % palettes.length];
    const icon = icons[Number(i) % icons.length];
    const title = String(label || 'Topic')
      .replace(/^#/, '')
      .slice(0, 22)
      .replace(/[<>&"]/g, '');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="' + c0 + '"/>' +
      '<stop offset="55%" stop-color="' + c1 + '"/>' +
      '<stop offset="100%" stop-color="' + c2 + '"/>' +
      '</linearGradient>' +
      '<radialGradient id="glow" cx="70%" cy="20%" r="50%">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<rect width="400" height="500" fill="url(#g)"/>' +
      '<rect width="400" height="500" fill="url(#glow)"/>' +
      '<circle cx="320" cy="90" r="48" fill="rgba(255,255,255,0.12)"/>' +
      '<circle cx="60" cy="420" r="70" fill="rgba(0,0,0,0.12)"/>' +
      '<text x="200" y="210" text-anchor="middle" font-size="64">' + icon + '</text>' +
      '<text x="200" y="280" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="22" font-weight="700" fill="#ffffff">' +
      title +
      '</text>' +
      '<text x="200" y="312" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="13" fill="rgba(255,255,255,0.85)">Tap to join</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  /* keep old name for callers */
  function topicPlaceholder(i, label) {
    return topicCover(i, label);
  }

  function toast(msg, type) {
    if (window.SocialUI?.toast) return SocialUI.toast(msg, type);
    let el = document.getElementById('socialToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'socialToast';
      el.className = 'social-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  const REEL_SOUND_KEY = 'social_reel_sound';

  function reelSoundEnabled() {
    try {
      return sessionStorage.getItem(REEL_SOUND_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function setReelSoundEnabled(on) {
    try {
      sessionStorage.setItem(REEL_SOUND_KEY, on ? '1' : '0');
    } catch (_e) { /* ignore */ }
  }

  function applySocialVideoSound(vid, enabled) {
    if (!vid || vid.tagName !== 'VIDEO') return;
    vid.muted = !enabled;
    vid.volume = enabled ? 1 : 0;
    if (enabled) vid.removeAttribute('muted');
    else vid.setAttribute('muted', '');
    updateReelSoundButton();
  }

  function getActiveReelVideo(scroll) {
    const root = scroll || document.getElementById('reelsScroll');
    const slide = root?.querySelector(`.social-reel-slide[data-index="${reelIndex}"]`);
    return slide?.querySelector('video[data-reel-video]') || null;
  }

  function updateReelSoundButton() {
    const btn = document.getElementById('reelSoundBtn');
    if (!btn) return;
    const on = reelSoundEnabled();
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn on sound');
    const icon = btn.querySelector('i');
    if (icon) icon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
  }

  function toggleReelSound(scroll) {
    const next = !reelSoundEnabled();
    setReelSoundEnabled(next);
    const vid = getActiveReelVideo(scroll);
    applySocialVideoSound(vid, next);
    if (next && vid) vid.play().catch(() => {});
  }

  function ensureReelSoundButton(scroll) {
    let btn = document.getElementById('reelSoundBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'reelSoundBtn';
      btn.className = 'social-reel-action social-reel-sound-btn';
      btn.setAttribute('aria-label', 'Turn on sound');
      btn.innerHTML =
        '<span class="social-reel-action-icon"><i class="fas fa-volume-xmark"></i></span>';
      document.getElementById('reelUi')?.appendChild(btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReelSound(scroll);
      });
    }
    updateReelSoundButton();
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('Storage timed out — try again'));
      }, 4000);
      try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          try {
            req.result.createObjectStore(IDB_STORE);
          } catch (_e) { /* already exists */ }
        };
        req.onsuccess = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(req.error || new Error('Storage unavailable'));
        };
        req.onblocked = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(new Error('Storage blocked — close other tabs and retry'));
        };
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function saveBlob(id, blob) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('Save timed out'));
      }, 8000);
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, id);
        tx.oncomplete = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        tx.onerror = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(tx.error || new Error('Save failed'));
        };
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function loadBlob(id) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function canViewPost(post) {
    if (!post || post.demo) return true;
    if (post.visibility !== 'private') return true;
    const user = window.Auth?.getUser?.();
    const uid = user?.id || user?.email;
    if (!uid) return false;
    return String(post.userId) === String(uid) || post.userId === 'me';
  }

  function deletePost(postId) {
    const posts = getPosts().filter((p) => String(p.id) !== String(postId));
    savePosts(posts);
  }

  function isPlaceholderThumb(url) {
    const u = String(url || '').trim();
    if (!u) return true;
    if (/dicebear|ui-avatars|avatar\.svg/i.test(u)) return true;
    /* Letter / initials SVG avatars must never be used as video posters */
    if (u.startsWith('data:image/svg')) return true;
    return false;
  }

  async function generateVideoThumb(file, seekAtSec) {
    if (!file) return '';
    const seekTo = Number(seekAtSec);
    return new Promise((resolve) => {
      let settled = false;
      let captureStarted = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try {
          URL.revokeObjectURL(url);
        } catch (_e) { /* ignore */ }
        clearTimeout(timer);
        resolve(value || '');
      };

      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      const url = URL.createObjectURL(file);
      const timer = setTimeout(() => finish(''), 2500);

      const capture = () => {
        if (settled) return;
        try {
          const w = video.videoWidth || 0;
          const h = video.videoHeight || 0;
          if (!w || !h) return;
          const maxW = 480;
          const scale = Math.min(1, maxW / w);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish('');
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/jpeg', 0.72));
        } catch (_e) {
          finish('');
        }
      };

      const seekAndCapture = () => {
        if (captureStarted || settled) return;
        captureStarted = true;
        const dur = Number(video.duration);
        let t = 0.15;
        if (Number.isFinite(seekTo) && seekTo >= 0) t = seekTo;
        else if (Number.isFinite(dur) && dur > 0) t = Math.min(0.35, Math.max(0.05, dur * 0.08));
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          capture();
        };
        video.addEventListener('seeked', onSeeked);
        try {
          if (typeof video.fastSeek === 'function') video.fastSeek(t);
          else video.currentTime = t;
        } catch (_e) {
          /* Some WebViews refuse seek — grab whatever frame is ready */
          setTimeout(capture, 120);
        }
        /* seeked can be skipped on some Android WebViews */
        setTimeout(() => {
          if (!settled) capture();
        }, 1200);
      };

      video.addEventListener('loadeddata', seekAndCapture, { once: true });
      video.addEventListener('loadedmetadata', () => {
        if (video.readyState >= 2) seekAndCapture();
      }, { once: true });
      video.onerror = () => finish('');
      video.src = url;
      try {
        video.load();
      } catch (_e) { /* ignore */ }
      /* Kick decode on stubborn mobile WebViews */
      video.play?.().then(() => {
        try {
          video.pause();
        } catch (_e2) { /* ignore */ }
        if (!settled) seekAndCapture();
      }).catch(() => { /* autoplay blocked — loadeddata path still runs */ });
    });
  }

  function markMediaOrientation(el) {
    if (!el) return;
    const apply = () => {
      if (!el.videoWidth && !el.naturalWidth) return;
      const w = el.videoWidth || el.naturalWidth;
      const h = el.videoHeight || el.naturalHeight;
      el.classList.toggle('is-portrait', h > w * 1.05);
      el.classList.toggle('is-landscape', w > h * 1.05);
      el.dataset.aspect = w > h * 1.05 ? 'landscape' : h > w * 1.05 ? 'portrait' : 'square';
    };
    if (el.tagName === 'VIDEO') {
      el.addEventListener('loadedmetadata', apply);
    } else {
      el.addEventListener('load', apply);
    }
  }

  function isVideoMediaUrl(url) {
    return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(String(url || ''));
  }

  function postIsVideo(post) {
    if (!post) return false;
    if (post.isVideo) return true;
    return isVideoMediaUrl(post.image || post.media_url || post.imageData);
  }

  function postHasMedia(post) {
    if (!post) return false;
    if (postIsVideo(post)) return true;
    if (post.mediaId || post.imageData) return true;
    return Boolean(post.image || post.thumb);
  }

  async function getMediaUrl(post) {
    if (!post) return '';
    if (post.imageData) return post.imageData;
    if (post.mediaId) {
      try {
        const mem = window.__apSessionMedia?.[post.mediaId];
        if (mem) return URL.createObjectURL(mem);
      } catch (_e0) { /* ignore */ }
      try {
        const blob = await loadBlob(post.mediaId);
        if (blob) {
          window.__apSessionMedia = window.__apSessionMedia || {};
          window.__apSessionMedia[post.mediaId] = blob;
          return URL.createObjectURL(blob);
        }
      } catch (_e) {}
    }
    if (post.image) return post.image;
    if (post.thumb && !isPlaceholderThumb(post.thumb)) return post.thumb;
    return '';
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read file'));
      r.readAsDataURL(blob);
    });
  }

  function getPosts() {
    try {
      return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]');
    } catch (_e) {
      return [];
    }
  }

  async function fetchApiPosts() {
    if (!window.API || !(localStorage.getItem('user') || localStorage.getItem('token'))) return [];
    try {
      const res = await API.get('/social/posts');
      if (res.success && Array.isArray(res.data)) {
        return res.data.map((p) => {
          const mediaUrl = resolveMediaUrl(p.media_url || p.mediaUrl);
          const thumbUrl = resolveMediaUrl(p.thumb_url || p.thumbUrl);
          const mediaType = String(p.media_type || p.mediaType || '').toLowerCase();
          const isVideo =
            mediaType === 'video' || isVideoMediaUrl(mediaUrl);
          const mapped = {
            id: p.id,
            userId: p.user_id,
            userName: `${p.author?.first_name || ''} ${p.author?.last_name || ''}`.trim() || 'User',
            text: p.body,
            caption: p.body,
            image: mediaUrl,
            thumb: thumbUrl || (!isVideo ? mediaUrl : ''),
            likes: p.like_count || 0,
            comments: p.comment_count || 0,
            shares: p.share_count || 0,
            liked: !!p.liked,
            createdAt: p.created_at,
            visibility: p.visibility || 'public',
            fromApi: true,
            isVideo,
          };
          if (mapped.liked) setLike(mapped.id, true);
          return mapped;
        });
      }
    } catch (_e) {
      /* fallback */
    }
    return [];
  }

  function resolveMediaUrl(path) {
    if (!path) return '';
    const p = String(path).trim();
    if (!p) return '';
    if (/^(https?:|data:|blob:)/i.test(p)) return p;
    if (window.SocialShell?.getImageUrl) {
      const built = SocialShell.getImageUrl(p);
      if (built) return built;
    }
    const base = String(
      window.CONFIG?.BACKEND_URL ||
        String(window.CONFIG?.API_URL || '').replace(/\/api\/?$/, '') ||
        ''
    ).replace(/\/$/, '');
    return base ? base + (p.startsWith('/') ? p : `/${p}`) : p;
  }

  async function uploadSocialMediaFile(file, progressLabel) {
    if (!window.API?.upload) throw new Error('Upload unavailable — please refresh');
    if (!file) throw new Error('No file selected');
    const fd = new FormData();
    fd.append('media', file, file.name || (String(file.type || '').startsWith('video/') ? 'clip.mp4' : 'photo.jpg'));
    try {
      if (progressLabel) {
        const prog = document.getElementById('socialCreateProgress');
        if (prog) {
          prog.style.display = 'block';
          prog.textContent = progressLabel;
        }
      }
    } catch (_e) { /* ignore */ }
    const res = await API.upload('/social/posts/media', fd);
    const data = res?.data?.data || res?.data || res;
    const url = data?.mediaUrl || data?.url;
    if (!url) throw new Error(res?.message || 'Media upload failed');
    return {
      url: resolveMediaUrl(url),
      path: url,
      mediaType: data.mediaType || (String(file.type || '').startsWith('video/') ? 'video' : 'image'),
    };
  }

  async function uploadThumbDataUrl(dataUrl) {
    if (!dataUrl || !String(dataUrl).startsWith('data:image')) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const uploaded = await uploadSocialMediaFile(
        new File([blob], 'thumb.jpg', { type: blob.type || 'image/jpeg' }),
        'Uploading thumbnail…'
      );
      return uploaded.path || uploaded.url;
    } catch (_e) {
      return null;
    }
  }

  async function createApiPost({ caption, visibility, mediaPath, thumbPath, mediaType }) {
    if (!window.API?.post) throw new Error('Not connected — please log in again');
    const res = await API.post('/social/posts', {
      body: caption || '',
      caption: caption || '',
      mediaUrl: mediaPath || null,
      thumbUrl: thumbPath || null,
      mediaType: mediaType || (mediaPath ? 'image' : 'none'),
      visibility: visibility === 'private' ? 'private' : 'public',
    });
    if (!res?.success && !res?.data) {
      throw new Error(res?.message || 'Could not save post to server');
    }
    return res.data || res;
  }

  function sortPostsNewest(posts) {
    return [...posts].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id) || 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id) || 0;
      return tb - ta;
    });
  }

  async function loadPosts() {
    const local = getPosts();
    const api = await fetchApiPosts();
    if (!api.length) return local;
    const byId = new Map();
    api.forEach((p) => byId.set(String(p.id), p));
    local.forEach((p) => {
      const k = String(p.id);
      byId.set(k, byId.has(k) ? { ...byId.get(k), ...p } : p);
    });
    return sortPostsNewest(Array.from(byId.values()));
  }

  function savePosts(posts) {
    const list = posts.slice(0, 50);
    try {
      localStorage.setItem(POSTS_KEY, JSON.stringify(list));
      return;
    } catch (_e) {
      /* Quota — drop heavy thumbs/imageData on older posts */
      try {
        const slim = list.map((p, i) => {
          if (i === 0) return p;
          const copy = { ...p };
          if (copy.thumb && String(copy.thumb).length > 80000) copy.thumb = '';
          if (copy.imageData && String(copy.imageData).length > 80000) delete copy.imageData;
          return copy;
        });
        localStorage.setItem(POSTS_KEY, JSON.stringify(slim));
      } catch (_e2) {
        console.warn('[social] could not save posts', _e2);
      }
    }
  }

  function getLikes() {
    try {
      return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}');
    } catch (_e) {
      return {};
    }
  }

  function setLike(postId, liked) {
    const likes = getLikes();
    likes[postId] = liked;
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
  }

  function isLiked(postId, post) {
    const likes = getLikes();
    if (Object.prototype.hasOwnProperty.call(likes, postId)) return !!likes[postId];
    return !!(post && post.liked);
  }

  async function toggleLikePost(postId, post) {
    const wasLiked = isLiked(postId, post);
    const nextLiked = !wasLiked;
    setLike(postId, nextLiked);
    if (post?.fromApi && window.API && hasAuth()) {
      try {
        if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
        const res = await API.post(`/social/posts/${postId}/like`);
        if (res?.success && res.data) {
          setLike(postId, !!res.data.liked);
          return { liked: !!res.data.liked, delta: res.data.liked ? (wasLiked ? 0 : 1) : wasLiked ? -1 : 0 };
        }
      } catch (_e) {
        setLike(postId, wasLiked);
        throw _e;
      }
    }
    return { liked: nextLiked, delta: nextLiked ? 1 : -1 };
  }

  function getComments(postId) {
    try {
      const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}');
      return all[postId] || [];
    } catch (_e) {
      return [];
    }
  }

  function addComment(postId, text) {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}');
    const user = window.Auth?.getUser?.();
    const name = user
      ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'You'
      : 'You';
    const list = all[postId] || [];
    list.push({ id: Date.now(), user: name, text, at: Date.now() });
    all[postId] = list;
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
    const posts = getPosts();
    const p = posts.find((x) => String(x.id) === String(postId));
    if (p) {
      p.comments = list.length;
      savePosts(posts);
    }
    return list.length;
  }

  function getFollowEntries() {
    try {
      const raw = JSON.parse(localStorage.getItem(FOLLOWS_KEY) || '[]');
      return raw.map((item) => {
        if (typeof item === 'string') {
          return { key: item, id: item, name: item.replace(/^@/, ''), photo: null };
        }
        const key = String(item.key || item.id || '').trim();
        const id = String(item.id || item.key || '').trim();
        return {
          key: key || id,
          id: id || key,
          name: item.name || key || 'User',
          photo: item.photo || item.profile_pic || item.profilePic || null,
        };
      });
    } catch (_e) {
      return [];
    }
  }

  function saveFollowEntries(entries) {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(entries));
  }

  function getFollows() {
    return getFollowEntries().map((e) => e.key);
  }

  function followKey(creatorId, creatorName) {
    return String(creatorId || creatorName || '').trim();
  }

  function getFollowersMap() {
    try {
      return JSON.parse(localStorage.getItem('social_followers_map') || '{}');
    } catch (_e) {
      return {};
    }
  }

  function saveFollowersMap(map) {
    localStorage.setItem('social_followers_map', JSON.stringify(map));
  }

  function myFollowerId() {
    const user = window.Auth?.getUser?.();
    return user ? String(user.id || user.email || user.first_name || 'me') : null;
  }

  function toggleFollowLocal(creatorId, creatorName) {
    const key = followKey(creatorId, creatorName);
    if (!key) return false;
    const entries = getFollowEntries();
    const label = creatorName || key;
    const i = entries.findIndex((e) => e.key === key);
    const nowFollowing = i < 0;
    if (nowFollowing) {
      entries.push({ key, name: label, id: creatorId });
    } else {
      entries.splice(i, 1);
    }
    saveFollowEntries(entries);

    const me = myFollowerId();
    if (me) {
      const map = getFollowersMap();
      if (!map[key]) map[key] = [];
      if (nowFollowing) {
        if (!map[key].includes(me)) map[key].push(me);
      } else {
        map[key] = map[key].filter((x) => String(x) !== me);
      }
      saveFollowersMap(map);
    }
    return nowFollowing;
  }

  let followIdCache = null;
  let blockIdCache = null;

  function socialApiRoot() {
    if (window.AP_SERVICES_API_ROOT) return window.AP_SERVICES_API_ROOT;
    if (window.joinApiUrl) return joinApiUrl('/').replace(/\/$/, '');
    if (window.normalizeApiUrl && window.CONFIG?.API_URL) return normalizeApiUrl(CONFIG.API_URL);
    return 'https://api.apservices.in/api';
  }

  function socialApiPath(endpoint) {
    const root = socialApiRoot().replace(/\/+$/, '');
    const path = String(endpoint || '');
    if (/^https?:\/\//i.test(path)) return path;
    return `${root}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function xhrSocial(method, url, body) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = 25000;
      const token = (window.Auth?.getToken?.() || localStorage.getItem('token'));
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (body != null && method !== 'GET' && method !== 'DELETE') {
        xhr.setRequestHeader('Content-Type', 'application/json');
      }
      xhr.onload = () => {
        let data;
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch (_e) {
          data = { message: xhr.responseText || 'Invalid response' };
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          const err = new Error(data.message || `HTTP ${xhr.status}`);
          err.status = xhr.status;
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timed out'));
      xhr.send(body != null ? JSON.stringify(body) : null);
    });
  }

  async function apiSocial(method, endpoint, body) {
    const m = (method || 'GET').toUpperCase();
    const path = String(endpoint || '');
    if (m !== 'GET') {
      window.API?.clearGetCache?.('/social/');
    }

    // Mutations: XHR is more reliable in Android WebView than fetch
    if (m === 'POST' || m === 'DELETE' || m === 'PUT' || m === 'PATCH') {
      await ensureFollowAuth().catch(() => {});
      return xhrSocial(m, socialApiPath(path), m === 'POST' && body == null ? {} : body);
    }

    try {
      if (window.API?.getFresh) {
        return await API.getFresh(path);
      }
      if (window.API?.request) {
        return await API.request(path, { method: m });
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/malformed|invalid url|failed to fetch|network/i.test(msg)) throw e;
    }
    await ensureFollowAuth().catch(() => {});
    return xhrSocial(m, socialApiPath(path));
  }

  function followBtnLabel(following) {
    return following ? 'Following' : 'Follow';
  }

  function friendBtnLabel(following) {
    return followBtnLabel(following);
  }

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id || '')
    );
  }

  function hasAuth() {
    return (
      (window.Auth?.hasSession && Auth.hasSession()) ||
      Boolean(localStorage.getItem('user') || localStorage.getItem('token'))
    );
  }

  async function refreshFollowCache() {
    if (!hasAuth()) return;
    try {
      await ensureFollowAuth();
      const res = await apiSocial('GET', '/social/following?limit=200');
      const rows = Array.isArray(res?.data) ? res.data : [];
      followIdCache = new Set(rows.map((u) => String(u.id)));
      const entries = rows.map((u) => ({
        key: String(u.id),
        id: String(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
        photo: u.profile_pic || null,
      }));
      saveFollowEntries(entries);
    } catch (e) {
      console.warn('SocialInteractions: follow cache', e);
    }
  }

  async function refreshBlockCache() {
    if (!hasAuth()) return;
    try {
      await ensureFollowAuth();
      const res = await apiSocial('GET', '/social/blocks?limit=200');
      const rows = Array.isArray(res?.data) ? res.data : [];
      blockIdCache = new Set(rows.map((u) => String(u.id)));
    } catch (e) {
      console.warn('SocialInteractions: block cache', e);
      blockIdCache = blockIdCache || new Set();
    }
  }

  async function refreshSocialCaches() {
    await Promise.all([refreshFollowCache(), refreshBlockCache()]);
  }

  async function ensureFollowAuth() {
    if (window.Auth?.ensureAccessToken) {
      await Promise.race([
        Auth.ensureAccessToken(),
        new Promise((r) => setTimeout(r, 8000)),
      ]).catch(() => {});
    }
    if (!(window.Auth?.getToken?.() || localStorage.getItem('token'))) {
      const err = new Error('Authentication required');
      err.status = 401;
      throw err;
    }
  }

  function followFailMessage(err) {
    const msg = String(err?.message || '');
    const status = err?.status;
    if (status === 401 || /authentication required|token expired|invalid token|sign in/i.test(msg)) {
      return { text: 'Your session expired. Please sign in again.', relogin: true };
    }
    const friendly = window.SocialUI?.friendlyMessage?.(msg) || msg;
    return { text: friendly || 'Could not update follow — try again', relogin: false };
  }

  async function toggleFollow(creatorId, creatorName) {
    const uid = String(creatorId || '').trim();
    if (hasAuth() && isUuid(uid)) {
      try {
        await ensureFollowAuth();
        if (isBlocked(uid)) {
          if (window.SocialUI?.toast) SocialUI.toast('Unblock this user first to follow', 'warning');
          return false;
        }
        let following = false;
        if (followIdCache != null) {
          following = followIdCache.has(uid);
        } else {
          const statusRes = await apiSocial('GET', `/social/follow/${uid}/status`);
          following = Boolean(statusRes?.data?.following);
          if (statusRes?.data?.blocked) {
            if (window.SocialUI?.toast) SocialUI.toast('You blocked this user', 'warning');
            return false;
          }
        }
        if (following) {
          await apiSocial('DELETE', `/social/follow/${uid}`);
          followIdCache?.delete(uid);
          toggleFollowLocal(uid, creatorName);
          refreshFollowCache().catch(() => {});
          return false;
        }
        await apiSocial('POST', `/social/follow/${uid}`, {});
        if (!followIdCache) followIdCache = new Set();
        followIdCache.add(uid);
        toggleFollowLocal(uid, creatorName);
        refreshFollowCache().catch(() => {});
        return true;
      } catch (e) {
        console.warn('SocialInteractions: follow API error', e);
        const fail = followFailMessage(e);
        if (window.SocialUI?.toast) {
          SocialUI.toast(fail.text, fail.relogin ? 'error' : 'warning', fail.relogin ? 'Sign in' : undefined);
        }
        if (fail.relogin) {
          setTimeout(() => {
            const redirect = encodeURIComponent(location.pathname + location.search);
            location.href = '/app-auth.html?app=1&redirect=' + redirect;
          }, 1400);
        }
        return isFollowing(uid, creatorName);
      }
    }
    if (!hasAuth()) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = '/app-auth.html?app=1&redirect=' + redirect;
      return false;
    }
    return toggleFollowLocal(creatorId, creatorName);
  }

  async function toggleFriend(creatorId, creatorName) {
    return toggleFollow(creatorId, creatorName);
  }

  async function toggleBlock(userId, userName) {
    const uid = String(userId || '').trim();
    if (!hasAuth() || !isUuid(uid)) {
      if (window.SocialUI?.toast) SocialUI.toast('Sign in to block users', 'warning');
      return false;
    }
    try {
      await ensureFollowAuth();
      let blocked = blockIdCache != null ? blockIdCache.has(uid) : false;
      if (blockIdCache == null) {
        const st = await apiSocial('GET', `/social/block/${uid}/status`);
        blocked = Boolean(st?.data?.blocked);
      }
      if (blocked) {
        await apiSocial('DELETE', `/social/block/${uid}`);
        blockIdCache?.delete(uid);
        if (window.SocialUI?.toast) SocialUI.toast(`Unblocked ${userName || 'user'}`, 'info');
        return false;
      }
      if (!window.confirm(
        `Block ${userName || 'this user'}? You will not see them in live chat, their streams, rankings, chats, or user lists.`
      )) {
        return false;
      }
      await apiSocial('POST', `/social/block/${uid}`, {});
      if (!blockIdCache) blockIdCache = new Set();
      blockIdCache.add(uid);
      followIdCache?.delete(uid);
      toggleFollowLocal(uid, userName);
      try {
        window.dispatchEvent(
          new CustomEvent('ap-user-blocked', { detail: { userId: uid, userName, blocked: true } })
        );
      } catch (_e) { /* ignore */ }
      if (window.SocialUI?.toast) SocialUI.toast(`Blocked ${userName || 'user'}`, 'success');
      return true;
    } catch (e) {
      console.warn('SocialInteractions: block API', e);
      if (window.SocialUI?.toast) SocialUI.toast(e?.message || 'Could not update block', 'error');
      return isBlocked(uid);
    }
  }

  function isBlocked(userId) {
    const uid = String(userId || '').trim();
    if (blockIdCache && uid) return blockIdCache.has(uid);
    return false;
  }

  function getBlockedIds() {
    return blockIdCache ? [...blockIdCache] : [];
  }

  /** Filter an array of objects by user id fields */
  function filterBlockedRows(rows, idKeys = ['id', 'userId', 'user_id', 'hostId', 'host_user_id', 'otherUserId', 'entity_id']) {
    if (!Array.isArray(rows) || !blockIdCache || !blockIdCache.size) return rows || [];
    return rows.filter((row) => {
      if (!row) return false;
      for (const key of idKeys) {
        const v = row[key];
        if (v != null && blockIdCache.has(String(v))) return false;
      }
      return true;
    });
  }

  async function getFollowStats(userId) {
    const uid = String(userId || window.Auth?.getUser?.()?.id || '').trim();
    if (isUuid(uid)) {
      try {
        if (hasAuth()) await ensureFollowAuth();
        const res = await apiSocial('GET', `/social/stats/${uid}`);
        const data = res?.data || {};
        let coins = 0;
        if (window.SocialWallet && hasAuth() && (!userId || String(userId) === String(window.Auth?.getUser?.()?.id))) {
          try {
            const b = await SocialWallet.fetchBalance();
            coins = b.coin_balance || 0;
          } catch (_e) {}
        }
        return {
          following: Number(data.following) || 0,
          followers: Number(data.followers) || 0,
          coins,
        };
      } catch (e) {
        console.warn('SocialInteractions: stats API', e);
      }
    }
    await refreshFollowCache().catch(() => {});
    const following = followIdCache ? followIdCache.size : getFollowEntries().length;
    const user = window.Auth?.getUser?.();
    const lookupId = String(userId || user?.id || user?.email || 'me');
    let followers = 0;
    if (hasAuth() && isUuid(String(userId || user?.id || ''))) {
      try {
        const list = await fetchFollowersList(userId || user?.id);
        followers = list.length;
      } catch (_e) {}
    }
    if (!followers) {
      const map = getFollowersMap();
      const keys = new Set([lookupId, user?.email, user?.first_name, `${user?.first_name || ''} ${user?.last_name || ''}`.trim()].filter(Boolean).map(String));
      keys.forEach((k) => {
        followers = Math.max(followers, (map[k] || []).length);
      });
      if (!followers && user) {
        const me = String(user.id || user.email || '');
        followers = Object.values(map).filter((arr) => arr.some((x) => String(x) === me)).length;
      }
    }
    let coins = 0;
    if (window.SocialWallet) {
      try {
        const b = await SocialWallet.fetchBalance();
        coins = b.coin_balance || 0;
      } catch (_e) {}
    }
    return { following, followers, coins };
  }

  function getFollowingList() {
    return getFollowEntries();
  }

  async function fetchFollowingList() {
    if (!hasAuth()) return getFollowEntries().map(mapFollowEntry);
    try {
      await refreshFollowCache();
    } catch (_e) {}
    return getFollowEntries().map(mapFollowEntry);
  }

  function mapFollowEntry(e) {
    return {
      key: e.key,
      id: e.id || e.key,
      name: e.name,
      photo: e.photo || null,
      userId: e.id || e.key,
    };
  }

  async function fetchFollowersList(userId) {
    const uid = String(userId || window.Auth?.getUser?.()?.id || '').trim();
    if (!hasAuth() || !isUuid(uid)) return getFollowersList(uid);
    try {
      await ensureFollowAuth();
      const res = await apiSocial('GET', `/social/followers/${uid}?limit=200`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      return rows.map((u) => ({
        key: String(u.id),
        id: String(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
        photo: u.profile_pic || null,
        userId: String(u.id),
      }));
    } catch (e) {
      console.warn('SocialInteractions: followers API', e);
      return getFollowersList(uid);
    }
  }

  function getFollowersList(userId) {
    const user = window.Auth?.getUser?.();
    const uid = String(userId || user?.id || user?.email || 'me');
    const map = getFollowersMap();
    const keys = [uid, user?.email, `${user?.first_name || ''} ${user?.last_name || ''}`.trim()].filter(Boolean).map(String);
    const ids = new Set();
    keys.forEach((k) => (map[k] || []).forEach((id) => ids.add(String(id))));
    return [...ids].map((id) => ({ key: id, name: id.includes('@') ? id.split('@')[0] : 'User' }));
  }

  function isFollowing(creatorId, creatorName) {
    const uid = String(creatorId || '').trim();
    if (followIdCache && isUuid(uid)) return followIdCache.has(uid);
    const key = followKey(creatorId, creatorName);
    return getFollowEntries().some((e) => e.key === key || e.id === uid || (creatorName && e.name === creatorName));
  }

  if (hasAuth()) {
    document.addEventListener('DOMContentLoaded', () => {
      const now = Date.now();
      if (!window.__apSocialCacheAt || now - window.__apSocialCacheAt > 60000) {
        window.__apSocialCacheAt = now;
        refreshSocialCaches().catch(() => {});
      }
    });
  }

  async function compressImage(file, maxW) {
    try {
      return await Promise.race([
        new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.width;
            let h = img.height;
            const max = maxW || 900;
            if (w > max) {
              h = (h * max) / w;
              w = max;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('compress failed'))),
              'image/jpeg',
              0.82
            );
          };
          img.onerror = reject;
          img.src = url;
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
    } catch (_e) {
      return file;
    }
  }

  async function storeMediaBlob(mediaId, blob) {
    try {
      await saveBlob(mediaId, blob);
      return mediaId;
    } catch (e) {
      /* IndexedDB often flakes after reinstall — fall back to in-memory / smaller path */
      console.warn('[social] idb save failed, using inline media', e?.message || e);
      if (blob && blob.type && String(blob.type).startsWith('video/')) {
        /* Large videos can't live in localStorage — keep a blob URL for this session only */
        try {
          const sessionKey = `ap_session_media_${mediaId}`;
          window.__apSessionMedia = window.__apSessionMedia || {};
          window.__apSessionMedia[mediaId] = blob;
          try {
            sessionStorage.setItem(sessionKey, '1');
          } catch (_s) { /* ignore */ }
          return mediaId;
        } catch (_e2) {
          throw new Error('Could not save video on this device. Reopen the app and try a shorter clip.');
        }
      }
      const b64 = await blobToBase64(blob);
      if (b64.length > 3_500_000) {
        throw new Error('File is too large for this device. Try a smaller photo or shorter video (under 3 MB).');
      }
      return { imageData: b64 };
    }
  }

  async function savePostFromForm(caption, visibility, file, options) {
    if (!caption && !file) {
      throw new Error('Add a caption or attach a photo/video.');
    }
    const opts = options || {};
    const user = window.Auth?.getUser?.();
    if (!user?.id && !localStorage.getItem('token') && !localStorage.getItem('accessToken')) {
      throw new Error('Please log in to post.');
    }

    let mediaPath = null;
    let thumbPath = null;
    let mediaType = 'none';
    let localThumb = '';
    let isVideo = false;

    if (file) {
      isVideo = String(file.type || '').startsWith('video/');
      if (isVideo && file.size > 12 * 1024 * 1024) {
        throw new Error('Video must be under 12 MB. Trim the clip or pick a shorter one.');
      }
      if (isVideo && opts.trimEnd != null && opts.trimStart != null) {
        const len = Number(opts.trimEnd) - Number(opts.trimStart);
        if (len > 10.5) throw new Error('Video clip must be 10 seconds or less.');
      }

      let uploadFile = file;
      if (!isVideo && !opts.skipCompress) {
        try {
          uploadFile = await compressImage(file, 1280);
        } catch (_e) {
          uploadFile = file;
        }
      }

      if (isVideo) {
        const seekAt =
          opts.trimStart != null && Number.isFinite(Number(opts.trimStart))
            ? Number(opts.trimStart) + 0.12
            : undefined;
        try {
          localThumb = await Promise.race([
            generateVideoThumb(file, seekAt),
            new Promise((r) => setTimeout(() => r(''), 2000)),
          ]);
        } catch (_e) {
          localThumb = '';
        }
        if (isPlaceholderThumb(localThumb)) localThumb = '';
      }

      const uploaded = await uploadSocialMediaFile(
        uploadFile,
        isVideo ? 'Uploading video…' : 'Uploading photo…'
      );
      mediaPath = uploaded.path;
      mediaType = uploaded.mediaType || (isVideo ? 'video' : 'image');

      if (isVideo && localThumb) {
        thumbPath = await uploadThumbDataUrl(localThumb);
      }
    }

    const apiPost = await createApiPost({
      caption,
      visibility,
      mediaPath,
      thumbPath,
      mediaType,
    });

    const mediaUrl = resolveMediaUrl(apiPost.media_url || mediaPath);
    const thumbUrl = resolveMediaUrl(apiPost.thumb_url || thumbPath) || localThumb || (!isVideo ? mediaUrl : '');
    const post = {
      id: apiPost.id || Date.now(),
      caption: apiPost.body || caption || '',
      visibility: apiPost.visibility || visibility || 'public',
      userName:
        `${apiPost.author?.first_name || ''} ${apiPost.author?.last_name || ''}`.trim() ||
        (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '') ||
        'You',
      userId: apiPost.user_id || user?.id || 'me',
      minsAgo: 0,
      likes: apiPost.like_count || 0,
      comments: apiPost.comment_count || 0,
      gifts: 0,
      shares: apiPost.share_count || 0,
      isVideo: mediaType === 'video' || isVideo,
      mediaId: null,
      imageData: null,
      image: mediaUrl,
      thumb: thumbUrl,
      fromApi: true,
      createdAt: apiPost.created_at || new Date().toISOString(),
    };
    if (opts.trimStart != null) post.trimStart = Number(opts.trimStart);
    if (opts.trimEnd != null) post.trimEnd = Number(opts.trimEnd);

    /* Keep a local cache copy for instant UI; server is source of truth */
    const posts = getPosts().filter((p) => String(p.id) !== String(post.id));
    posts.unshift(post);
    savePosts(posts);
    return post;
  }

  function ensureCommentSheet() {
    let el = document.getElementById('socialCommentSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'socialCommentSheet';
    el.className = 'social-comment-sheet';
    el.innerHTML = `
      <div class="social-comment-panel">
        <div class="social-comment-head">
          <h3>Comments</h3>
          <button type="button" id="socialCommentClose"><i class="fas fa-times"></i></button>
        </div>
        <div class="social-comment-list" id="socialCommentList"></div>
        <div class="social-comment-input-row">
          <input type="text" id="socialCommentInput" placeholder="Add a comment…" maxlength="280">
          <button type="button" id="socialCommentSend">Post</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el) el.classList.remove('open');
    });
    document.getElementById('socialCommentClose').addEventListener('click', () => el.classList.remove('open'));
    return el;
  }

  function getReelStats() {
    try {
      return JSON.parse(localStorage.getItem('social_reel_stats') || '{}');
    } catch (_e) {
      return {};
    }
  }

  function saveReelStats(stats) {
    localStorage.setItem('social_reel_stats', JSON.stringify(stats));
  }

  function reelKey(item) {
    return String(item?.postId || item?.id || 'reel');
  }

  function ensureStarterCoins() {
    /* Balances come from backend wallet — no client-side seeding */
    if (window.SocialWallet) SocialWallet.fetchBalance(true);
  }

  function openCommentsForItem(item) {
    const key = reelKey(item);
    if (item?.postId) {
      openComments(item.postId);
      return;
    }
    commentPostId = key;
    const sheet = ensureCommentSheet();
    const list = document.getElementById('socialCommentList');
    const stats = getReelStats();
    const comments = stats[key]?.comments || [];
    list.innerHTML = comments.length
      ? comments
          .map(
            (c) =>
              `<div class="social-comment-item"><strong>${escapeHtml(c.user)}</strong> ${escapeHtml(c.text)}</div>`
          )
          .join('')
      : '<p class="social-comment-empty">No comments yet. Be the first!</p>';
    sheet.classList.add('open');
    document.getElementById('socialCommentSend').onclick = () => {
      const inp = document.getElementById('socialCommentInput');
      const t = (inp.value || '').trim();
      if (!t) return;
      const user = window.Auth?.getUser?.();
      const name = user
        ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'You'
        : 'You';
      const all = getReelStats();
      if (!all[key]) all[key] = { comments: [], likes: 0, gifts: 0, shares: 0, liked: false };
      all[key].comments = all[key].comments || [];
      all[key].comments.push({ user: name, text: t, at: Date.now() });
      saveReelStats(all);
      item.comments = all[key].comments.length;
      inp.value = '';
      openCommentsForItem(item);
      updateReelUI(item);
      toast('Comment posted');
    };
  }

  let commentPostId = null;

  function openComments(postId) {
    const sheet = ensureCommentSheet();
    const list = document.getElementById('socialCommentList');
    const comments = getComments(postId);
    list.innerHTML = comments.length
      ? comments
          .map(
            (c) =>
              `<div class="social-comment-item"><strong>${escapeHtml(c.user)}</strong> ${escapeHtml(c.text)}</div>`
          )
          .join('')
      : '<p class="social-comment-empty">No comments yet. Be the first!</p>';
    sheet.classList.add('open');
    document.getElementById('socialCommentSend').onclick = () => {
      const inp = document.getElementById('socialCommentInput');
      const t = (inp.value || '').trim();
      if (!t) return;
      const n = addComment(postId, t);
      inp.value = '';
      openComments(postId);
      document.dispatchEvent(new CustomEvent('social:comment', { detail: { postId, count: n } }));
      toast('Comment posted');
    };
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function sharePost(post) {
    const url = location.origin + '/square.html?post=' + post.id + '&app=1';
    const text = (post.caption || 'Check this out on AP Services').slice(0, 100);
    const shared = window.SocialUI?.shareLink
      ? await SocialUI.shareLink({ title: 'AP Services', text, url })
      : false;
    if (shared) {
      const posts = getPosts();
      const p = posts.find((x) => String(x.id) === String(post.id));
      if (p) {
        p.shares = (p.shares || 0) + 1;
        savePosts(posts);
      }
    }
    return shared;
  }

  async function sendGift(postId) {
    if (!window.SocialWallet) {
      toast('Please log in to send gifts', 'warning');
      return;
    }
    const posts = getPosts();
    const p = posts.find((x) => String(x.id) === String(postId));
    const receiverId = p?.userId;
    if (!receiverId || receiverId === 'me') {
      toast('Cannot send gift to this post');
      return;
    }
    try {
      await SocialWallet.sendGift({
        receiver_id: receiverId,
        coin_amount: 10,
        gift_type: 'post_gift',
      });
      if (p) {
        p.gifts = (p.gifts || 0) + 1;
        savePosts(posts);
      }
      toast('Gift sent 🎁');
      document.dispatchEvent(new CustomEvent('social:gift', { detail: { postId } }));
    } catch (e) {
      if (e.status === 400 || /insufficient/i.test(e.message)) {
        toast('Not enough coins — open Store to recharge', 'warning');
        setTimeout(() => (location.href = '/coins-recharge.html?app=1'), 600);
      } else {
        toast(window.SocialUI?.friendlyMessage(e.message) || e.message || 'Gift failed', 'error');
      }
    }
  }

  function profileUrl(item) {
    if (item.workerId) return '/worker-profile.html?id=' + encodeURIComponent(item.workerId) + '&app=1';
    const uid = item.userId || item.id;
    const name = item.userName || item.name || 'Creator';
    if (uid) {
      return (
        '/creator-profile.html?userId=' +
        encodeURIComponent(uid) +
        '&name=' +
        encodeURIComponent(name) +
        '&app=1'
      );
    }
    return '/creator-profile.html?name=' + encodeURIComponent(name) + '&app=1';
  }

  /** Video reels page */
  let reelItems = [];
  let reelIndex = 0;

  function bindVideoTrimPlayback(root) {
    (root || document).querySelectorAll('video[data-trim-start]').forEach((v) => {
      if (v.dataset.trimBound) return;
      v.dataset.trimBound = '1';
      const start = parseFloat(v.dataset.trimStart) || 0;
      const end = parseFloat(v.dataset.trimEnd) || 0;
      if (end <= start) return;
      const seekStart = () => {
        try {
          v.currentTime = start;
        } catch (_e) {}
      };
      v.addEventListener('loadedmetadata', seekStart);
      v.addEventListener('timeupdate', () => {
        if (v.currentTime >= end - 0.05) seekStart();
      });
    });
  }

  function videoTagAttrs(post) {
    if (!postIsVideo(post)) return '';
    if (post.trimStart == null || post.trimEnd == null) return '';
    return ` data-trim-start="${post.trimStart}" data-trim-end="${post.trimEnd}"`;
  }

  async function buildReelItems(pros, options) {
    const opts = options || {};
    const videosOnly = opts.videosOnly !== false;
    const startPostId = opts.startPostId || null;

    function matchesFilter(p) {
      if (!canViewPost(p)) return false;
      if (startPostId && String(p.id) === String(startPostId)) return postHasMedia(p);
      return videosOnly ? postIsVideo(p) : postHasMedia(p);
    }

    const userPosts = getPosts().filter(matchesFilter);
    const apiPosts = (await loadPosts()).filter(matchesFilter);
    const merged = [];
    const seen = new Set();
    [...apiPosts, ...userPosts].forEach((p) => {
      const key = String(p.id);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(p);
    });
    const fromPosts = await Promise.all(
      merged.map(async (p) => ({
        id: 'post-' + p.id,
        postId: p.id,
        name: p.userName,
        userId: p.userId,
        caption: p.caption || p.text || '',
        likes: p.likes || 0,
        comments: p.comments || 0,
        gifts: p.gifts || 0,
        shares: p.shares || 0,
        isVideo: postIsVideo(p),
        trimStart: p.trimStart,
        trimEnd: p.trimEnd,
        liked: isLiked(p.id, p),
        mediaUrl: await getMediaUrl(p),
        thumb: !isPlaceholderThumb(p.thumb) ? p.thumb : '',
        workerId: null,
      }))
    );

    const fromPros = pros.map((p, i) => ({
      id: 'pro-' + (p.userId || p.id || i),
      postId: null,
      name: p.name,
      userId: p.userId || p.id || null,
      workerId: p.workerId || p.id || null,
      caption: p.category || 'Follow for more 🔥',
      likes: 200 + i * 47,
      comments: 4 + i,
      gifts: i % 3,
      shares: 40 + i * 10,
      isVideo: false,
      mediaUrl: p.image || (window.SocialUI?.themeCover('video', p.name) || p.image),
      thumb: p.image || (window.SocialUI?.themeCover('video', p.name) || p.image),
    }));

    return fromPosts.filter((x) => x.mediaUrl || x.thumb);
  }

  function openReelViewer(postId) {
    if (!postId) return;
    sessionStorage.setItem('social_reel_start', String(postId));
    sessionStorage.setItem(REEL_SOUND_KEY, '1');
    location.href = '/video.html?post=' + encodeURIComponent(postId) + '&app=1';
  }

  function updateReelUI(item) {
    if (!item) return;
    reelIndex = reelItems.indexOf(item);
    const avatar = document.getElementById('videoAvatar');
    const name = document.getElementById('videoName');
    const cap = document.getElementById('videoCaption');
    const follow = document.getElementById('followBtn');
    const likeBtn = document.querySelector('#reelActions [data-action="like"]');
    const likeCount = document.getElementById('likeCount');

    if (avatar) {
      const profilePic =
        (window.Auth?.getUser?.()?.id &&
          String(item.userId) === String(window.Auth.getUser().id) &&
          (window.Auth.getUser().profile_pic || window.Auth.getUser().profilePic)) ||
        null;
      avatar.src = window.SocialUI
        ? SocialUI.avatarUrl(item.name, profilePic)
        : '';
      avatar.alt = item.name || 'Creator';
    }
    if (name) {
      name.textContent = '@' + String(item.name || 'Creator').replace(/\s+/g, '');
    }
    if (cap) cap.textContent = item.caption || '';
    const scroll = document.getElementById('reelsScroll');
    const activeVid = getActiveReelVideo(scroll);
    if (activeVid) applySocialVideoSound(activeVid, reelSoundEnabled());
    if (follow) {
      const fid = item.workerId || item.userId || item.name;
      const on = isFollowing(fid, item.name);
      follow.textContent = on ? '✓' : '+';
      follow.classList.toggle('is-following', on);
      follow.setAttribute('aria-label', on ? 'Following' : 'Follow');
      follow.onclick = async (e) => {
        e.stopPropagation();
        const now = await toggleFollow(fid, item.name);
        follow.textContent = now ? '✓' : '+';
        follow.classList.toggle('is-following', now);
        follow.setAttribute('aria-label', now ? 'Following' : 'Follow');
        toast(
          now ? `You're now following ${item.name}` : `Unfollowed ${item.name}`,
          now ? 'success' : 'info'
        );
      };
    }

    const liked = item.postId
      ? isLiked(item.postId, item)
      : !!getReelStats()[reelKey(item)]?.liked;
    if (likeBtn) likeBtn.classList.toggle('is-liked', liked);
    if (likeCount) likeCount.textContent = formatCount(item.likes || 0);

    const cc = document.getElementById('commentCount');
    const gc = document.getElementById('giftCount');
    const sc = document.getElementById('shareCount');
    if (cc) cc.textContent = formatCount(item.comments);
    if (gc) gc.textContent = formatCount(item.gifts);
    if (sc) sc.textContent = formatCount(item.shares);
  }

  function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  async function initVideoPage(containerId) {
    ensureStarterCoins();
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const pros = window.SocialShell ? await SocialShell.fetchPros(8) : [];
    const startPost =
      new URLSearchParams(location.search).get('post') ||
      sessionStorage.getItem('social_reel_start');
    reelItems = await buildReelItems(pros, { videosOnly: true, startPostId: startPost });
    const uiLayer = document.getElementById('reelUi');

    if (!reelItems.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#fff;text-align:center;padding:40px;pointer-events:auto';
      empty.textContent = 'No videos yet. Post a video from the Square camera.';
      wrap.insertBefore(empty, uiLayer || null);
      if (uiLayer) uiLayer.style.display = 'none';
      return;
    }

    const stats = getReelStats();
    reelItems.forEach((item) => {
      const s = stats[reelKey(item)];
      if (s) {
        if (s.likes) item.likes = Math.max(item.likes || 0, s.likes);
        if (s.comments?.length) item.comments = s.comments.length;
        if (s.gifts) item.gifts = Math.max(item.gifts || 0, s.gifts);
        if (s.shares) item.shares = Math.max(item.shares || 0, s.shares);
      }
    });

    let scroll = document.getElementById('reelsScroll');
    if (scroll) scroll.remove();

    scroll = document.createElement('div');
    scroll.id = 'reelsScroll';
    scroll.className = 'social-reels-scroll';
    scroll.innerHTML = reelItems
      .map((item, i) => {
        const media = item.isVideo
          ? `<video src="${item.mediaUrl}" playsinline loop muted data-reel-video poster="${item.thumb || ''}"${item.trimStart != null ? ` data-trim-start="${item.trimStart}" data-trim-end="${item.trimEnd}"` : ''}></video>`
          : `<img src="${item.mediaUrl || item.thumb}" alt="">`;
        return `<section class="social-reel-slide" data-index="${i}" data-item-id="${item.id}">
          ${media}
          <div class="social-reel-gradient"></div>
        </section>`;
      })
      .join('');

    wrap.insertBefore(scroll, uiLayer || wrap.firstChild);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const i = parseInt(en.target.dataset.index, 10);
            reelItems[i] && updateReelUI(reelItems[i]);
            en.target.querySelectorAll('video[data-reel-video]').forEach((v) => {
              applySocialVideoSound(v, reelSoundEnabled());
              v.play().catch(() => {});
            });
          } else {
            en.target.querySelectorAll('video[data-reel-video]').forEach((v) => v.pause());
          }
        });
      },
      { root: scroll, threshold: 0.6 }
    );
    scroll.querySelectorAll('.social-reel-slide').forEach((s) => observer.observe(s));

    scroll.querySelectorAll('.social-reel-slide video, .social-reel-slide img').forEach((el) => markMediaOrientation(el));
    bindVideoTrimPlayback(scroll);

    scroll.querySelectorAll('.social-reel-slide').forEach((slide) => {
      slide.addEventListener('click', (e) => {
        if (e.target.closest('#reelUi') || e.target.closest('[data-action]')) return;
        const vid = slide.querySelector('video[data-reel-video]');
        if (!vid) return;
        if (vid.muted) {
          setReelSoundEnabled(true);
          applySocialVideoSound(vid, true);
          vid.play().catch(() => {});
          return;
        }
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      });
    });

    updateReelUI(reelItems[0]);
    bindReelActionsPanel();
    ensureReelSoundButton(scroll);

    if (startPost) {
      const idx = reelItems.findIndex((x) => String(x.postId) === String(startPost));
      if (idx > 0) {
        const slide = scroll.querySelector(`[data-index="${idx}"]`);
        slide?.scrollIntoView({ behavior: 'instant', block: 'start' });
        updateReelUI(reelItems[idx]);
      }
      sessionStorage.removeItem('social_reel_start');
    }

    ensureReelRotateControl(scroll);

    document.getElementById('videoAvatarBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = reelItems[reelIndex];
      if (item) location.href = profileUrl(item);
    });

    document.getElementById('videoName')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = reelItems[reelIndex];
      if (item) location.href = profileUrl(item);
    });

    if (window.SocialUI) SocialUI.bindAvatarFallbacks(document);
  }

  function ensureReelRotateControl(scroll) {
    let btn = document.getElementById('reelRotateBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'reelRotateBtn';
      btn.className = 'social-reel-rotate-btn';
      btn.setAttribute('aria-label', 'Rotate landscape video');
      btn.innerHTML = '<i class="fas fa-mobile-screen-button"></i>';
      btn.style.display = 'none';
      document.getElementById('reelUi')?.appendChild(btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slide = scroll?.querySelector(`.social-reel-slide[data-index="${reelIndex}"]`);
        const vid = slide?.querySelector('video[data-reel-video]');
        if (vid) vid.classList.toggle('is-rotated');
      });
    }
    const updateRotateBtn = () => {
      const slide = scroll?.querySelector(`.social-reel-slide[data-index="${reelIndex}"]`);
      const vid = slide?.querySelector('video[data-reel-video]');
      const show = vid && vid.dataset.aspect === 'landscape';
      btn.style.display = show ? 'flex' : 'none';
      if (!show && vid) vid.classList.remove('is-rotated');
    };
    scroll?.addEventListener('scroll', () => setTimeout(updateRotateBtn, 80), { passive: true });
    updateRotateBtn();
    const orig = updateReelUI;
    updateReelUI = function (item) {
      orig(item);
      updateRotateBtn();
    };
  }

  function bindReelActionsPanel() {
    const panel = document.getElementById('reelActions');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';

    panel.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || !panel.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        handleReelAction(btn.dataset.action);
      },
      true
    );
  }

  async function handleReelAction(action) {
    const item = reelItems[reelIndex];
    if (!item) return;
    const key = reelKey(item);
    const stats = getReelStats();
    if (!stats[key]) stats[key] = { comments: [], likes: 0, gifts: 0, shares: 0, liked: false };

    if (action === 'like') {
      if (item.postId) {
        const p = getPosts().find((x) => String(x.id) === String(item.postId)) || { id: item.postId, fromApi: true };
        try {
          const { liked, delta } = await toggleLikePost(item.postId, p);
          if (delta) item.likes = Math.max(0, (item.likes || 0) + delta);
          toast(liked ? 'Liked!' : 'Unliked');
        } catch (_e) {
          toast('Could not update like', 'error');
        }
      } else {
        stats[key].liked = !stats[key].liked;
        item.likes = Math.max(0, (item.likes || 0) + (stats[key].liked ? 1 : -1));
        stats[key].likes = item.likes;
        saveReelStats(stats);
        toast(stats[key].liked ? 'Liked!' : 'Unliked');
      }
      updateReelUI(item);
      return;
    }

    if (action === 'comment') {
      openCommentsForItem(item);
      return;
    }

    if (action === 'gift') {
      ensureStarterCoins();
      if (item.postId) {
        await sendGift(item.postId);
      } else if (item.userId && window.SocialWallet) {
        try {
          const bal = await SocialWallet.fetchBalance(true);
          const coinCost = 10;
          const giftBal = SocialWallet.getGiftableCoins
            ? SocialWallet.getGiftableCoins(bal)
            : Number(bal.giftable_coins ?? bal.coin_balance ?? 0);
          if (giftBal < coinCost) {
            toast('Not enough coins — opening recharge', 'warning');
            setTimeout(() => (location.href = '/coins-recharge.html?app=1'), 500);
            updateReelUI(item);
            return;
          }
          await SocialWallet.sendGift({
            receiver_id: item.userId,
            coin_amount: coinCost,
            gift_type: 'reel_gift',
          });
          item.gifts = (item.gifts || 0) + 1;
          stats[key].gifts = item.gifts;
          saveReelStats(stats);
          toast('Gift sent 🎁', 'success');
        } catch (e) {
          if (/insufficient/i.test(e.message)) {
            toast('Need coins — opening recharge', 'warning');
            setTimeout(() => (location.href = '/coins-recharge.html?app=1'), 500);
          } else {
            toast(window.SocialUI?.friendlyMessage(e.message) || e.message || 'Gift failed', 'error');
          }
        }
      } else {
        toast('Join their live room to send gifts', 'info');
      }
      updateReelUI(item);
      return;
    }

    if (action === 'share') {
      (async () => {
        let shared = false;
        if (item.postId) {
          shared = await sharePost(
            getPosts().find((x) => String(x.id) === String(item.postId)) || {
              id: item.postId,
              caption: item.caption,
            }
          );
        } else {
          const url = location.origin + profileUrl(item);
          shared = window.SocialUI?.shareLink
            ? await SocialUI.shareLink({ title: item.name || 'AP Services', url })
            : false;
        }
        if (shared) {
          item.shares = (item.shares || 0) + 1;
          stats[key].shares = item.shares;
          saveReelStats(stats);
        }
        updateReelUI(item);
      })();
    }
  }

  async function renderSquareFeed(container) {
    const feed = typeof container === 'string' ? document.getElementById(container) : container;
    if (!feed) return;

    let posts = (await loadPosts()).filter((p) => canViewPost(p));
    const feedPosts = posts;
    const pros = window.SocialShell ? await SocialShell.fetchPros(4) : [];
    if (!posts.length) {
      posts = pros.map((p, i) => ({
        id: 'demo-' + i,
        caption: i % 2 ? 'Great day! #APServices' : 'Book home services anytime',
        userName: p.name,
        minsAgo: 1 + i * 3,
        likes: 12 + i,
        comments: 2,
        gifts: 0,
        shares: 1,
        image: p.image,
        isVideo: false,
        demo: true,
      }));
    }

    const html = await Promise.all(
      posts.map(async (p) => {
        const url = p.demo ? p.image : await getMediaUrl(p);
        let thumbUrl = !isPlaceholderThumb(p.thumb) ? p.thumb : '';
        if (!thumbUrl && !postIsVideo(p) && url && !isPlaceholderThumb(url)) thumbUrl = url;
        const user = window.Auth?.getUser?.();
        const isOwner =
          !p.demo &&
          user &&
          (String(p.userId) === String(user.id) || p.userId === 'me' || String(p.userId) === String(user.email));
        const media = postIsVideo(p)
          ? `<video src="${url}" playsinline muted preload="metadata" data-social-feed-video poster="${thumbUrl || ''}"${videoTagAttrs(p)}></video>`
          : `<img src="${url || SocialShell?.avatarFallback(p.userName)}" alt="">`;
        const liked = !p.demo && isLiked(p.id, p);
        const openReel = !p.demo && postHasMedia(p) ? ' data-open-reel="1"' : '';
        return `
      <article class="social-post-card" data-post-id="${p.id}"${openReel}>
        <div class="social-post-media">${media}
          ${postIsVideo(p) ? '<span class="play-badge"><i class="fas fa-play"></i></span>' : '<span class="play-badge play-badge--photo"><i class="fas fa-expand"></i></span>'}
          ${p.visibility === 'private' ? '<span class="social-post-private-badge"><i class="fas fa-lock"></i> Private</span>' : ''}
          ${isOwner ? `<button type="button" class="social-post-delete" data-delete-post="${p.id}" aria-label="Delete post"><i class="fas fa-times"></i></button>` : ''}
        </div>
        <div class="social-post-meta">${p.minsAgo || 1} mins ago</div>
        <div class="social-post-actions">
          <button type="button" class="social-act-btn" data-act="like" data-id="${p.id}"><i class="${liked ? 'fas' : 'far'} fa-heart"></i> <span>${p.likes || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="comment" data-id="${p.id}"><i class="far fa-comment"></i> <span>${p.comments || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="gift" data-id="${p.id}"><i class="fas fa-gift"></i> <span>${p.gifts || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="share" data-id="${p.id}"><i class="far fa-paper-plane"></i> <span>${p.shares || 0}</span></button>
        </div>
        <a class="social-post-user" href="${profileUrl({ userName: p.userName, userId: p.userId })}">
          <img src="${SocialShell?.avatarFallback(p.userName) || (window.SocialUI?.avatarUrl?.(p.userName) || '')}" alt="">
          <div>
            <div class="social-post-user-name">${escapeHtml(p.userName)} 🇮🇳</div>
            <div class="social-post-caption">${escapeHtml(p.caption || '')}</div>
          </div>
        </a>
      </article>`;
      })
    );
    feed.innerHTML = html.join('');

    /* Backfill missing video posters from the first decoded frame */
    feed.querySelectorAll('.social-post-media video').forEach((vid) => {
      if (vid.getAttribute('poster')) return;
      const fillPoster = () => {
        try {
          if (!vid.videoWidth) return;
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 360 / vid.videoWidth);
          canvas.width = Math.round(vid.videoWidth * scale);
          canvas.height = Math.round(vid.videoHeight * scale);
          canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', 0.7);
          vid.setAttribute('poster', data);
          const postId = vid.closest('[data-post-id]')?.dataset?.postId;
          if (postId && data) {
            const posts = getPosts();
            const p = posts.find((x) => String(x.id) === String(postId));
            if (p && isPlaceholderThumb(p.thumb)) {
              p.thumb = data;
              savePosts(posts);
            }
          }
        } catch (_e) { /* ignore */ }
      };
      const onMeta = () => {
        const t = Math.min(0.2, (vid.duration || 1) * 0.05);
        const onSeeked = () => {
          vid.removeEventListener('seeked', onSeeked);
          fillPoster();
        };
        vid.addEventListener('seeked', onSeeked);
        try {
          vid.currentTime = t;
        } catch (_e) {
          fillPoster();
        }
      };
      if (vid.readyState >= 2) onMeta();
      else vid.addEventListener('loadeddata', onMeta, { once: true });
    });

    feed.querySelectorAll('[data-delete-post]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.deletePost;
        if (confirm('Delete this post?')) {
          deletePost(id);
          await renderSquareFeed(feed);
          toast('Post deleted');
        }
      });
    });
    feed.querySelectorAll('.social-post-media video, .social-post-media img').forEach((el) => markMediaOrientation(el));
    bindVideoTrimPlayback(feed);

    feed.querySelectorAll('.social-post-media video[data-social-feed-video]').forEach((vid) => {
      const mediaWrap = vid.closest('.social-post-media');
      if (!mediaWrap || mediaWrap.querySelector('.social-feed-sound-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'social-feed-sound-btn';
      btn.setAttribute('aria-label', 'Play with sound');
      btn.innerHTML = '<i class="fas fa-volume-xmark"></i>';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const enabling = vid.muted;
        vid.muted = !enabling;
        vid.volume = enabling ? 1 : 0;
        if (enabling) {
          vid.removeAttribute('muted');
          btn.innerHTML = '<i class="fas fa-volume-high"></i>';
          btn.classList.add('is-on');
          vid.play().catch(() => {});
        } else {
          vid.setAttribute('muted', '');
          btn.innerHTML = '<i class="fas fa-volume-xmark"></i>';
          btn.classList.remove('is-on');
        }
      });
      mediaWrap.appendChild(btn);
    });

    feed.querySelectorAll('[data-open-reel]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-act], [data-delete-post], .social-post-user, button, a')) return;
        openReelViewer(card.dataset.postId);
      });
    });

    feed.querySelectorAll('[data-act="like"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (String(id).startsWith('demo-')) {
          const s = btn.querySelector('span');
          const icon = btn.querySelector('i');
          const nowLiked = !icon.classList.contains('fas');
          icon.className = nowLiked ? 'fas fa-heart' : 'far fa-heart';
          const n = parseInt(s.textContent, 10) || 0;
          s.textContent = String(Math.max(0, n + (nowLiked ? 1 : -1)));
          return;
        }
        const p = feedPosts.find((x) => String(x.id) === String(id));
        try {
          const { liked, delta } = await toggleLikePost(id, p);
          if (p && delta) {
            p.likes = Math.max(0, (p.likes || 0) + delta);
            if (!p.fromApi) {
              const local = getPosts();
              const lp = local.find((x) => String(x.id) === String(id));
              if (lp) {
                lp.likes = p.likes;
                savePosts(local);
              }
            }
          }
          btn.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
          btn.classList.toggle('is-liked', liked);
          btn.querySelector('span').textContent = p?.likes ?? btn.querySelector('span').textContent;
        } catch (_e) {
          toast('Could not update like', 'error');
        }
      });
    });
    feed.querySelectorAll('[data-act="comment"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (String(btn.dataset.id).startsWith('demo-')) return toast('Sign in & post to comment');
        openComments(btn.dataset.id);
      });
    });
    feed.querySelectorAll('[data-act="gift"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (String(btn.dataset.id).startsWith('demo-')) return toast('Gift sent 🎁');
        sendGift(btn.dataset.id);
        const posts = getPosts();
        const p = posts.find((x) => String(x.id) === String(btn.dataset.id));
        if (p) btn.querySelector('span').textContent = p.gifts || 0;
      });
    });
    feed.querySelectorAll('[data-act="share"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (String(id).startsWith('demo-')) return toast('Link copied');
        const p = getPosts().find((x) => String(x.id) === String(id));
        if (p) {
          await sharePost(p);
          btn.querySelector('span').textContent = p.shares || 0;
        }
      });
    });
  }

  function renderTopics(containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;
    const items = [
      { title: '#Holi Video Collection Event', heat: 529819, ended: false },
      { title: '#Jayfol Dance Challenge', heat: 412200, ended: false },
      { title: '#Home Pro Tips', heat: 210440, ended: true },
      { title: '#Live Party Moments', heat: 188900, ended: false },
    ];
    const fallbackThumb = topicThumb(0, 'Topic');
    list.innerHTML = items
      .map(
        (t, ti) => `
      <section class="social-topic-block" data-topic-id="${ti}">
        <div class="social-topic-head">
          <img src="${topicThumb(ti, t.title)}" alt="" loading="lazy" onerror="this.src='${fallbackThumb}'">
          <div style="flex:1">
            <h3 class="social-topic-title">${t.title}</h3>
            <span class="social-topic-heat"><i class="fas fa-chart-line"></i> ${t.heat.toLocaleString()}</span>
          </div>
          ${t.ended ? '<span style="color:#9ca3af;font-size:13px">ended</span>' : '<button type="button" class="social-join-btn" data-join-topic>Join room</button>'}
        </div>
        <div class="social-topic-videos">
          ${[0, 1, 2, 3]
            .map(
              (n) =>
                `<button type="button" class="thumb social-topic-thumb-card" data-go-video data-topic="${ti}">
                  <img src="${topicThumb(ti * 4 + n, t.title)}" alt="" loading="lazy" onerror="this.src='${fallbackThumb}'">
                  <i class="fas fa-play"></i>
                </button>`
            )
            .join('')}
        </div>
      </section>`
      )
      .join('');
    list.querySelectorAll('[data-join-topic]').forEach((b) => {
      b.addEventListener('click', () => {
        const topic = b.closest('.social-topic-block')?.dataset?.topicId || '0';
        location.href = '/topic-watch.html?topic=' + topic + '&app=1';
      });
    });
    list.querySelectorAll('[data-go-video]').forEach((b) => {
      b.addEventListener('click', () => {
        const topic = b.dataset.topic || '0';
        location.href = '/topic-watch.html?topic=' + topic + '&app=1';
      });
    });
  }

  function initRankingsPage() {
    const tab = new URLSearchParams(location.search).get('tab') || 'host';
    document.querySelectorAll('.social-rank-main-tab').forEach((a) => {
      a.classList.toggle('active', a.dataset.tab === tab);
        a.addEventListener('click', (e) => {
        e.preventDefault();
        history.replaceState(null, '', '/rankings.html?tab=' + a.dataset.tab + '&app=1');
        document.querySelectorAll('.social-rank-main-tab').forEach((x) => x.classList.remove('active'));
        a.classList.add('active');
        const picked = a.dataset.tab;
        document.querySelectorAll('[data-rank-panel]').forEach((p) => {
          p.style.display = p.dataset.rankPanel === picked ? 'block' : 'none';
        });
        if (typeof window.refreshRanks === 'function') window.refreshRanks();
      });
    });

    document.querySelectorAll('.social-rank-sub-tab').forEach((btn) => {
      if (btn.dataset.periodBound) return;
      btn.dataset.periodBound = '1';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.social-rank-sub-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (typeof window.setRankingsPeriod === 'function') {
          window.setRankingsPeriod(btn.dataset.period || 'daily');
        }
      });
    });

    document.querySelectorAll('[data-rank-panel]').forEach((p) => {
      p.style.display = p.dataset.rankPanel === tab ? 'block' : 'none';
    });
  }

  function initVipPage() {
    const tier = new URLSearchParams(location.search).get('tier') || 'svip';
    const mainTab = new URLSearchParams(location.search).get('tab') || 'vip';
    const tiers = {
      normal: { name: 'Normal VIP', price: '1,290,000', emoji: '🥉' },
      super: { name: 'Super VIP', price: '3,990,000', emoji: '🥈' },
      diamond: { name: 'Diamond VIP', price: '8,990,000', emoji: '💎' },
      svip: { name: 'SVIP', price: '12,990,000', emoji: '👑' },
    };
    const t = tiers[tier] || tiers.svip;

    document.querySelectorAll('.social-vip-tier-tabs a').forEach((a) => {
      const active = a.dataset.tier === tier;
      a.classList.toggle('active', active);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        history.replaceState(null, '', '/vip.html?tier=' + a.dataset.tier + '&app=1');
        initVipPage();
      });
    });

    document.querySelectorAll('.social-vip-tabs a').forEach((a) => {
      a.classList.toggle('active', (a.dataset.vtab || 'vip') === mainTab);
      a.addEventListener('click', (e) => {
        if (a.dataset.vtab === 'guardian') return;
        e.preventDefault();
      });
    });

    const card = document.getElementById('vipTierCard');
    if (card) {
      card.innerHTML = `
        <div>
          <h2 style="font-size:28px;font-weight:800;color:var(--gold-700)">${t.name}</h2>
          <p style="color:var(--gold-600);font-size:14px;margin-top:8px">🪙 ${t.price} / Y</p>
          <p style="color:#8b6914;font-size:12px">Get VIP &amp; Enjoy Privileges</p>
        </div>
        <div style="font-size:56px">${t.emoji}</div>`;
    }
  }

  window.SocialInteractions = {
    getPosts,
    savePostFromForm,
    renderSquareFeed,
    initVideoPage,
    renderTopics,
    initRankingsPage,
    initVipPage,
    topicThumb,
    topicPlaceholder,
    toast,
    openComments,
    getFollowStats,
    getFollowingList,
    fetchFollowingList,
    fetchFollowersList,
    getFollowersList,
    toggleFollow,
    toggleFriend,
    toggleBlock,
    friendBtnLabel,
    followBtnLabel,
    isBlocked,
    getBlockedIds,
    filterBlockedRows,
    isFollowing,
    refreshFollowCache,
    refreshBlockCache,
    refreshSocialCaches,
    getFollowEntries,
    openReelViewer,
    toggleLikePost,
    postIsVideo,
    apiSocial,
  };
})();
