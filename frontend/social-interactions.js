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
    if (!post) return false;
    if (post.demo) return false; /* demo content removed from production */
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

  async function deletePostRemote(postId) {
    deletePost(postId);
    if (!window.API || !hasAuth()) return { deleted: true, localOnly: true };
    try {
      if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
      await API.delete(`/social/posts/${postId}`);
      return { deleted: true };
    } catch (e) {
      throw e;
    }
  }

  /** Soft realtime hook — Socket.IO can plug in later without refactoring callers */
  const SocialRealtime = (window.SocialRealtime = window.SocialRealtime || {
    subscribe(_channel, _handler) {
      return () => {};
    },
    emit(_event, _payload) {},
  });

  /** Bookmarks extension point (out of scope) */
  async function bookmarkPost(_postId) {
    return { supported: false };
  }

  function relativeTime(isoOrMs) {
    if (!isoOrMs && isoOrMs !== 0) return '';
    const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
    if (!Number.isFinite(t)) return '';
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 45) return 'Just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
    try {
      return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_e) {
      return '';
    }
  }

  function formatCaptionHtml(text) {
    const esc = escapeHtml(text || '');
    return esc.replace(/(#[\w\u0900-\u097F]+)/g, '<span class="social-hashtag">$1</span>');
  }

  function liveBadgeHtml(live) {
    if (!live || !live.href) return '';
    return (
      '<a class="social-live-pill" href="' +
      escapeHtml(live.href) +
      '" onclick="event.stopPropagation()"><i class="fas fa-circle"></i> LIVE</a>'
    );
  }

  function mapApiPost(p) {
    const mediaUrl = resolveMediaUrl(p.media_url || p.mediaUrl || p.media_items?.[0]?.url);
    const thumbUrl = resolveMediaUrl(p.thumb_url || p.thumbUrl || p.media_items?.[0]?.thumb);
    const mediaType = String(p.media_type || p.mediaType || p.media_items?.[0]?.type || '').toLowerCase();
    const isVideo = mediaType === 'video' || isVideoMediaUrl(mediaUrl);
    const live = p.author_live || null;
    const mapped = {
      id: p.id,
      userId: p.user_id || p.author?.id,
      userName: `${p.author?.first_name || ''} ${p.author?.last_name || ''}`.trim() || 'User',
      profilePic: p.author?.profile_pic || null,
      text: p.body,
      caption: p.body,
      image: mediaUrl,
      thumb: thumbUrl || (!isVideo ? mediaUrl : ''),
      mediaItems: Array.isArray(p.media_items) ? p.media_items : null,
      likes: p.like_count || 0,
      comments: p.comment_count || 0,
      shares: p.share_count || 0,
      liked: !!p.liked,
      createdAt: p.created_at,
      visibility: p.visibility || 'public',
      fromApi: true,
      isVideo,
      role: p.author?.role || null,
      isVerified: !!(p.author?.is_verified),
      agencyName: null,
      creatorLevel: null,
      authorLive: live
        ? {
            href: live.href,
            channel: live.channel,
            roomType: live.roomType || live.room_type,
            viewers: live.viewers,
          }
        : null,
    };
    if (mapped.liked) setLike(mapped.id, true);
    return mapped;
  }

  function currentFeedScope() {
    const qs = new URLSearchParams(location.search);
    const f = (qs.get('feed') || sessionStorage.getItem('social_feed_scope') || 'for_you').toLowerCase();
    return ['for_you', 'following', 'latest'].includes(f) ? f : 'for_you';
  }

  function setFeedScope(scope) {
    const s = ['for_you', 'following', 'latest'].includes(scope) ? scope : 'for_you';
    sessionStorage.setItem('social_feed_scope', s);
    const url = new URL(location.href);
    url.searchParams.set('feed', s);
    history.replaceState(null, '', url.pathname + url.search);
    return s;
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

  async function fetchApiPosts(options) {
    const opts = options || {};
    if (!window.API) return { posts: [], meta: null };
    const hasSession = !!(localStorage.getItem('user') || localStorage.getItem('token'));
    /* Public creator profiles can load without session when optionalAuth is used */
    if (!hasSession && !opts.userId) return { posts: [], meta: null };
    try {
      const params = new URLSearchParams();
      params.set('limit', String(opts.limit || 30));
      params.set('offset', String(opts.offset || 0));
      if (opts.userId) params.set('userId', opts.userId);
      if (opts.mediaType && opts.mediaType !== 'all') params.set('mediaType', opts.mediaType);
      const feed = opts.feed || (opts.userId ? 'latest' : currentFeedScope());
      if (feed) params.set('feed', feed);
      const res = await API.get('/social/posts?' + params.toString());
      if (res.success && Array.isArray(res.data)) {
        return { posts: res.data.map(mapApiPost), meta: res.meta || null };
      }
    } catch (_e) {
      /* fallback */
    }
    return { posts: [], meta: null };
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

  async function loadPosts(options) {
    const opts = options || {};
    const local = getPosts().filter((p) => canViewPost(p));
    const { posts: api, meta } = await fetchApiPosts(opts);
    if (opts._metaOut) opts._metaOut.meta = meta;
    const paging = Number(opts.offset || 0) > 0;
    if (!api.length) {
      if (paging) return [];
      if (opts.userId) {
        return local.filter((p) => String(p.userId) === String(opts.userId));
      }
      if (opts.feed === 'following') return [];
      return opts.feed === 'for_you' || opts.feed === 'latest' || !opts.feed ? local : local;
    }
    const byId = new Map();
    api.forEach((p) => byId.set(String(p.id), p));
    if (!paging && !opts.userId && opts.feed !== 'following') {
      local.forEach((p) => {
        const k = String(p.id);
        if (!byId.has(k)) byId.set(k, p);
      });
    }
    let list = Array.from(byId.values()).filter((p) => canViewPost(p));
    if (opts.userId) list = list.filter((p) => String(p.userId) === String(opts.userId));
    if (opts.mediaType === 'video') list = list.filter((p) => postIsVideo(p));
    if (opts.mediaType === 'image' || opts.mediaType === 'photo' || opts.mediaType === 'posts') {
      list = list.filter((p) => !postIsVideo(p));
    }
    /* For You keeps server order; Latest / profile sort by time */
    if (opts.feed === 'for_you' && !opts.userId) return list;
    return sortPostsNewest(list);
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

  const likeInFlight = new Set();

  async function toggleLikePost(postId, post) {
    const key = String(postId);
    if (likeInFlight.has(key)) return { liked: isLiked(postId, post), delta: 0, locked: true };
    likeInFlight.add(key);
    const wasLiked = isLiked(postId, post);
    const nextLiked = !wasLiked;
    setLike(postId, nextLiked);
    try {
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
    } finally {
      likeInFlight.delete(key);
    }
  }

  async function fetchCommentsApi(postId) {
    if (!window.API) return null;
    try {
      const res = await API.get(`/social/posts/${postId}/comments`);
      if (res?.success && Array.isArray(res.data)) {
        return res.data.map((c) => ({
          id: c.id,
          userId: c.user_id,
          postOwnerId: c.post_owner_id,
          parentId: c.parent_id || null,
          user:
            `${c.first_name || c.author?.first_name || ''} ${c.last_name || c.author?.last_name || ''}`.trim() ||
            'User',
          handle: c.display_id != null ? String(c.display_id) : '',
          text: c.body,
          likeCount: Number(c.like_count) || 0,
          liked: Boolean(c.liked),
          at: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
          fromApi: true,
        }));
      }
    } catch (_e) {
      return null;
    }
    return null;
  }

  async function postCommentApi(postId, text, parentId = null) {
    if (!window.API || !hasAuth()) throw new Error('Please log in to comment');
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    const payload = { body: text };
    if (parentId) payload.parent_id = parentId;
    const res = await API.post(`/social/posts/${postId}/comments`, payload);
    if (!res?.success) throw new Error(res?.message || 'Comment failed');
    const c = res.data;
    return {
      id: c.id,
      userId: c.user_id || c.author?.id,
      parentId: c.parent_id || parentId || null,
      user: `${c.author?.first_name || ''} ${c.author?.last_name || ''}`.trim() || 'You',
      handle: c.author?.display_id != null ? String(c.author.display_id) : '',
      text: c.body || text,
      likeCount: Number(c.like_count) || 0,
      liked: false,
      at: Date.now(),
      fromApi: true,
    };
  }

  async function likeCommentApi(commentId) {
    if (!window.API || !hasAuth()) throw new Error('Please log in');
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    const res = await API.post(`/social/comments/${commentId}/like`, {});
    if (!res?.success) throw new Error(res?.message || 'Like failed');
    return res.data;
  }

  async function deleteCommentApi(commentId) {
    if (!window.API || !hasAuth()) throw new Error('Please log in');
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    const res = await API.delete(`/social/comments/${commentId}`);
    if (!res?.success) throw new Error(res?.message || 'Delete failed');
    return res.data;
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

    try {
    if (file) {
      isVideo = String(file.type || '').startsWith('video/');
      if (isVideo && file.size > 40 * 1024 * 1024) {
        throw new Error('Video must be under 40 MB. Trim the clip or pick a shorter one.');
      }
      if (isVideo && opts.trimEnd != null && opts.trimStart != null) {
        const len = Number(opts.trimEnd) - Number(opts.trimStart);
        if (len > 60.5) throw new Error('Video clip must be 60 seconds or less.');
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
    window.SocialCreatorTelemetry?.track?.('upload_ok', 1, { mediaType: mediaType || 'none' });
    return post;
    } catch (err) {
      window.SocialCreatorTelemetry?.track?.('upload_fail', 1, {
        message: String(err?.message || 'fail').slice(0, 120),
      });
      throw err;
    }
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
        <div class="social-comment-reply-hint" id="socialCommentReplyHint" hidden></div>
        <div class="social-comment-input-row">
          <input type="text" id="socialCommentInput" placeholder="Add a comment… @ to mention" maxlength="280" autocomplete="off">
          <button type="button" id="socialCommentSend">Post</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        el.classList.remove('open');
        window.SocialCreatorPolish?.haptic?.('light');
      }
    });
    document.getElementById('socialCommentClose').addEventListener('click', () => {
      el.classList.remove('open');
      window.SocialCreatorPolish?.haptic?.('light');
    });
    const inp = document.getElementById('socialCommentInput');
    try {
      window.SocialUI?.attachMentionAutocomplete?.(inp);
    } catch (_e) { /* ignore */ }
    return el;
  }

  function currentCommentUser() {
    return window.Auth?.getUser?.() || window.Auth?.user || null;
  }

  function canDeleteComment(c) {
    const me = currentCommentUser();
    if (!me?.id || !c) return false;
    const myId = String(me.id);
    const role = String(me.role || '').toLowerCase();
    const isAdmin = ['admin', 'super_admin', 'founder', 'ceo'].includes(role);
    return (
      isAdmin ||
      String(c.userId || '') === myId ||
      String(c.postOwnerId || '') === myId
    );
  }

  function formatCommentText(text) {
    /* Highlight @Name (incl. first+last) — not numeric display ids */
    return escapeHtml(text).replace(
      /@([A-Za-z][A-Za-z0-9_]*(?:\s+[A-Za-z][A-Za-z0-9_]*){0,2})/g,
      '<span class="social-comment-mention">@$1</span>'
    );
  }

  function renderCommentItems(comments) {
    const roots = comments.filter((c) => !c.parentId);
    const byParent = new Map();
    comments.forEach((c) => {
      if (!c.parentId) return;
      const key = String(c.parentId);
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    });
    const renderOne = (c, isReply) => {
      const likedCls = c.liked ? ' is-liked' : '';
      const delBtn = canDeleteComment(c)
        ? `<button type="button" class="social-comment-act" data-act="delete" data-id="${escapeHtml(c.id)}" title="Delete"><i class="fas fa-trash"></i></button>`
        : '';
      return `<div class="social-comment-item${isReply ? ' is-reply' : ''}" data-id="${escapeHtml(c.id)}">
        <div class="social-comment-main">
          <strong>${escapeHtml(c.user)}</strong>
          <p class="social-comment-body">${formatCommentText(c.text)}</p>
          <div class="social-comment-actions">
            <button type="button" class="social-comment-act${likedCls}" data-act="like" data-id="${escapeHtml(c.id)}">
              <i class="fas fa-heart"></i> <span data-like-count>${Number(c.likeCount) || 0}</span>
            </button>
            <button type="button" class="social-comment-act" data-act="reply" data-id="${escapeHtml(c.id)}" data-user="${escapeHtml(c.user)}">Reply</button>
            ${delBtn}
          </div>
        </div>
      </div>`;
    };
    if (!roots.length && !comments.length) {
      return '<p class="social-comment-empty">No comments yet. Be the first!</p>';
    }
    /* Orphans (parent missing) still show as roots */
    const shown = new Set(roots.map((c) => String(c.id)));
    let html = roots
      .map((c) => {
        const kids = byParent.get(String(c.id)) || [];
        kids.forEach((k) => shown.add(String(k.id)));
        return renderOne(c, false) + kids.map((k) => renderOne(k, true)).join('');
      })
      .join('');
    comments.forEach((c) => {
      if (!shown.has(String(c.id))) html += renderOne(c, Boolean(c.parentId));
    });
    return html || '<p class="social-comment-empty">No comments yet. Be the first!</p>';
  }

  let commentPostId = null;
  let commentSending = false;
  let commentReplyToId = null;

  function clearCommentReply() {
    commentReplyToId = null;
    const hint = document.getElementById('socialCommentReplyHint');
    if (hint) {
      hint.hidden = true;
      hint.innerHTML = '';
    }
    const inp = document.getElementById('socialCommentInput');
    if (inp) inp.placeholder = 'Add a comment… @ to mention';
  }

  function setCommentReply(comment) {
    commentReplyToId = comment?.id || null;
    const hint = document.getElementById('socialCommentReplyHint');
    const name = String(comment?.user || '').trim() || 'comment';
    if (hint) {
      hint.hidden = false;
      hint.innerHTML = `Replying to <strong>${escapeHtml(name)}</strong> <button type="button" id="socialCommentReplyCancel">Cancel</button>`;
      document.getElementById('socialCommentReplyCancel')?.addEventListener('click', clearCommentReply);
    }
    const inp = document.getElementById('socialCommentInput');
    if (inp) {
      inp.focus();
      if (name && name !== 'comment' && !inp.value.includes(`@${name}`)) {
        inp.value = `@${name} ${inp.value}`.trimStart();
      }
    }
  }

  function bindCommentListActions(postId, listEl) {
    listEl.onclick = async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (!id) return;
      if (act === 'reply') {
        setCommentReply({
          id,
          user: btn.dataset.user,
        });
        return;
      }
      if (act === 'like') {
        if (!hasAuth()) {
          toast('Please log in to like', 'warning');
          return;
        }
        try {
          const data = await likeCommentApi(id);
          const countEl = btn.querySelector('[data-like-count]');
          if (countEl) countEl.textContent = String(data?.like_count ?? 0);
          btn.classList.toggle('is-liked', Boolean(data?.liked));
        } catch (err) {
          toast(err.message || 'Could not like', 'error');
        }
        return;
      }
      if (act === 'delete') {
        if (!confirm('Delete this comment?')) return;
        try {
          await deleteCommentApi(id);
          toast('Comment deleted', 'success');
          openComments(postId);
        } catch (err) {
          toast(err.message || 'Could not delete', 'error');
        }
      }
    };
  }

  async function openComments(postId) {
    const sheet = ensureCommentSheet();
    const list = document.getElementById('socialCommentList');
    list.innerHTML = '<p class="social-comment-empty">Loading…</p>';
    sheet.classList.add('open');
    commentPostId = postId;
    clearCommentReply();

    let comments = getComments(postId);
    const apiComments = await fetchCommentsApi(postId);
    if (apiComments) {
      comments = apiComments;
      try {
        const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}');
        all[postId] = apiComments;
        localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
      } catch (_e) { /* ignore */ }
    }
    list.innerHTML = renderCommentItems(comments);
    bindCommentListActions(postId, list);

    const sendBtn = document.getElementById('socialCommentSend');
    sendBtn.onclick = async () => {
      if (commentSending) return;
      const inp = document.getElementById('socialCommentInput');
      const t = (inp.value || '').trim();
      if (!t) return;
      commentSending = true;
      sendBtn.disabled = true;
      const replyParent = commentReplyToId;
      try {
        let n;
        try {
          const created = await postCommentApi(postId, t, replyParent);
          const local = getComments(postId);
          local.push(created);
          const all = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}');
          all[postId] = local;
          localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
          n = local.length;
        } catch (_apiErr) {
          n = addComment(postId, t);
        }
        inp.value = '';
        clearCommentReply();
        openComments(postId);
        document.dispatchEvent(new CustomEvent('social:comment', { detail: { postId, count: n } }));
        SocialRealtime.emit('social:comment', { postId, count: n });
        if (window.SocialCreatorPolish?.successFeedback) SocialCreatorPolish.successFeedback('Comment posted');
        else toast('Comment posted', 'success');
      } catch (err) {
        if (window.SocialCreatorPolish?.errorFeedback) {
          SocialCreatorPolish.errorFeedback(err.message || 'Could not post comment');
        } else toast(err.message || 'Could not post comment', 'error');
      } finally {
        commentSending = false;
        sendBtn.disabled = false;
      }
    };
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

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function sharePost(post) {
    const url = location.origin + '/square.html?post=' + post.id + '&app=1';
    const text = (post.caption || 'Check this out on AP Services').slice(0, 100);
    let shared = false;
    try {
      shared = window.SocialUI?.shareLink
        ? await SocialUI.shareLink({ title: 'AP Services', text, url })
        : false;
    } catch (_e) {
      shared = false;
    }
    if (shared) {
      const posts = getPosts();
      const p = posts.find((x) => String(x.id) === String(post.id));
      if (p) {
        p.shares = (p.shares || 0) + 1;
        savePosts(posts);
      }
      post.shares = (post.shares || 0) + 1;
      if (post.fromApi && window.API && hasAuth()) {
        try {
          const res = await API.post(`/social/posts/${post.id}/share`);
          if (res?.data?.share_count != null) post.shares = res.data.share_count;
        } catch (_e) { /* ignore */ }
      }
      if (window.SocialCreatorPolish?.successFeedback) SocialCreatorPolish.successFeedback('Shared');
      else toast('Shared', 'success');
    } else {
      toast('Share cancelled', 'info');
    }
    return shared;
  }

  let postGiftCatalog = [];
  let postGiftSelectedIdx = 0;
  let postGiftTarget = null;
  let postGiftBusy = false;

  function defaultPostGiftCatalog() {
    const catalog = window.AP_LIVE_EMOJI?.GIFT_CATALOG;
    if (catalog && typeof catalog === 'object') {
      const merged = [];
      const seen = new Set();
      Object.values(catalog).forEach((items) => {
        (items || []).forEach((g) => {
          const coin_cost = Number(g.cost ?? g.coin_cost) || 10;
          const slug = String(g.slug || `${(g.name || 'gift').toLowerCase().replace(/\s+/g, '_')}_${coin_cost}`);
          const key = `${slug}:${coin_cost}`;
          if (seen.has(key)) return;
          seen.add(key);
          merged.push({
            slug,
            emoji: g.emoji || '🎁',
            name: g.name || 'Gift',
            coin_cost,
          });
        });
      });
      if (merged.length) {
        merged.sort((a, b) => a.coin_cost - b.coin_cost);
        return merged.slice(0, 64);
      }
    }
    return [
      { slug: 'heart_10', emoji: '❤️', name: 'Heart', coin_cost: 10 },
      { slug: 'rose_50', emoji: '🌹', name: 'Rose', coin_cost: 50 },
      { slug: 'flowers_100', emoji: '💐', name: 'Flowers', coin_cost: 100 },
      { slug: 'cake_200', emoji: '🍰', name: 'Cake', coin_cost: 200 },
      { slug: 'diamond_500', emoji: '💎', name: 'Diamond', coin_cost: 500 },
      { slug: 'crown_1000', emoji: '👑', name: 'Crown', coin_cost: 1000 },
      { slug: 'car_5000', emoji: '🚗', name: 'Sports Car', coin_cost: 5000 },
      { slug: 'castle_10000', emoji: '🏰', name: 'Castle', coin_cost: 10000 },
    ];
  }

  function ensurePostGiftSheet() {
    let sheet = document.getElementById('apPostGiftSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'apPostGiftSheet';
    sheet.className = 'ap-post-gift-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="ap-post-gift-panel" role="dialog" aria-label="Send gift">
        <div class="ap-post-gift-head">
          <div>
            <h3>Send Gift</h3>
            <p class="ap-post-gift-to">To <strong id="apPostGiftTo">Creator</strong></p>
          </div>
          <button type="button" class="ap-post-gift-close" id="apPostGiftClose" aria-label="Close">&times;</button>
        </div>
        <div class="ap-post-gift-grid" id="apPostGiftGrid"></div>
        <p class="ap-post-gift-balance">Gift coins: <span id="apPostGiftBal">0</span></p>
        <button type="button" class="ap-post-gift-send" id="apPostGiftSend">Send Gift</button>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) closePostGiftSheet();
    });
    document.getElementById('apPostGiftClose')?.addEventListener('click', closePostGiftSheet);
    document.getElementById('apPostGiftSend')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirmPostGiftSend();
    });
    return sheet;
  }

  function renderPostGiftGrid() {
    const grid = document.getElementById('apPostGiftGrid');
    if (!grid) return;
    if (!postGiftCatalog.length) postGiftCatalog = defaultPostGiftCatalog();
    grid.innerHTML = postGiftCatalog
      .map((g, i) => {
        const cost = Number(g.coin_cost) || 0;
        return `<button type="button" class="ap-post-gift-item${i === postGiftSelectedIdx ? ' is-selected' : ''}" data-idx="${i}">
          <span class="g">${g.emoji || '🎁'}</span>
          <span class="n">${escapeHtml(g.name || 'Gift')}</span>
          <span class="c">${cost.toLocaleString('en-IN')}</span>
        </button>`;
      })
      .join('');
    grid.querySelectorAll('.ap-post-gift-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        postGiftSelectedIdx = parseInt(btn.dataset.idx, 10) || 0;
        grid.querySelectorAll('.ap-post-gift-item').forEach((b) => b.classList.toggle('is-selected', b === btn));
      });
    });
  }

  function closePostGiftSheet() {
    const sheet = document.getElementById('apPostGiftSheet');
    if (sheet) sheet.hidden = true;
    postGiftTarget = null;
  }

  async function loadPostGiftCatalog() {
    if (postGiftCatalog.length) return postGiftCatalog;
    postGiftCatalog = defaultPostGiftCatalog();
    try {
      if (!window.API?.get) return postGiftCatalog;
      const res = await API.get('/social/gifts/catalog');
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      if (rows.length) {
        postGiftCatalog = rows
          .map((g) => ({
            slug: g.slug || `gift_${g.coin_cost || 10}`,
            emoji: g.emoji || '🎁',
            name: g.name || 'Gift',
            coin_cost: Number(g.coin_cost ?? g.cost) || 10,
          }))
          .sort((a, b) => a.coin_cost - b.coin_cost)
          .slice(0, 80);
      }
    } catch (_e) { /* keep defaults */ }
    return postGiftCatalog;
  }

  async function openPostGiftSheet(postHint) {
    if (!window.SocialWallet) {
      toast('Please log in to send gifts', 'warning');
      return;
    }
    const me = window.Auth?.getUser?.();
    if (!me?.id && !localStorage.getItem('token') && !localStorage.getItem('accessToken')) {
      toast('Please log in to send gifts', 'warning');
      return;
    }
    const p = postHint || findPostById(postHint?.id);
    const receiverId = p?.userId || p?.user_id;
    if (!receiverId || receiverId === 'me') {
      toast('Cannot send gift to this post', 'error');
      return;
    }
    if (me?.id && String(receiverId) === String(me.id)) {
      toast('You can’t gift your own post', 'info');
      return;
    }

    postGiftTarget = {
      postId: p.id || postHint?.id || postHint?.postId,
      userId: receiverId,
      userName: p.userName || p.name || postHint?.userName || 'Creator',
      gifts: p.gifts || 0,
      post: p,
    };
    postGiftSelectedIdx = 0;

    const sheet = ensurePostGiftSheet();
    await loadPostGiftCatalog();
    renderPostGiftGrid();
    const toEl = document.getElementById('apPostGiftTo');
    if (toEl) toEl.textContent = postGiftTarget.userName;
    try {
      const b = await SocialWallet.fetchBalance(true);
      const giftBal = SocialWallet.getGiftableCoins
        ? SocialWallet.getGiftableCoins(b)
        : Number(b.giftable_coins ?? b.coin_balance ?? 0);
      const balEl = document.getElementById('apPostGiftBal');
      if (balEl) balEl.textContent = Number(giftBal || 0).toLocaleString('en-IN');
    } catch (_e) {
      const balEl = document.getElementById('apPostGiftBal');
      if (balEl) balEl.textContent = '0';
    }
    sheet.hidden = false;
    window.SocialCreatorPolish?.haptic?.('light');
  }

  async function confirmPostGiftSend() {
    if (postGiftBusy || !postGiftTarget) return;
    const g = postGiftCatalog[postGiftSelectedIdx];
    if (!g) {
      toast('Select a gift', 'warning');
      return;
    }
    const coinCost = Number(g.coin_cost) || 0;
    if (!coinCost) {
      toast('Invalid gift', 'warning');
      return;
    }
    const btn = document.getElementById('apPostGiftSend');
    postGiftBusy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    try {
      const bal = await SocialWallet.fetchBalance(true);
      const giftBal = SocialWallet.getGiftableCoins
        ? SocialWallet.getGiftableCoins(bal)
        : Number(bal.giftable_coins ?? bal.coin_balance ?? 0);
      if (giftBal < coinCost) {
        toast('Not enough coins — open Store to recharge', 'warning');
        setTimeout(() => (location.href = '/coins-recharge.html?app=1'), 600);
        return;
      }
      await SocialWallet.sendGift({
        receiver_id: postGiftTarget.userId,
        coin_amount: coinCost,
        gift_type: g.slug || 'post_gift',
        qty: 1,
      });

      const postId = postGiftTarget.postId;
      if (postGiftTarget.post) postGiftTarget.post.gifts = (postGiftTarget.post.gifts || 0) + 1;
      const local = getPosts();
      const lp = local.find((x) => String(x.id) === String(postId));
      if (lp) {
        lp.gifts = (lp.gifts || 0) + 1;
        savePosts(local);
      }
      const reel = (reelItems || []).find((x) => String(x.postId) === String(postId));
      if (reel) {
        reel.gifts = (reel.gifts || 0) + 1;
        try {
          updateReelUI(reel);
        } catch (_e) { /* ignore */ }
      }
      document.querySelectorAll(`[data-act="gift"][data-id="${postId}"] span`).forEach((span) => {
        const n = Number(span.textContent || 0) + 1;
        span.textContent = String(n);
      });

      if (window.SocialFX?.spawnGift) {
        SocialFX.spawnGift({
          emoji: g.emoji,
          name: g.name,
          gift_type: g.slug,
          amount: coinCost,
        });
      }

      toast(`${g.emoji || '🎁'} ${g.name || 'Gift'} sent`, 'success');
      window.SocialCreatorPolish?.haptic?.('success');
      document.dispatchEvent(
        new CustomEvent('social:gift', {
          detail: { postId, receiverId: postGiftTarget.userId, gift: g },
        })
      );
      closePostGiftSheet();
    } catch (e) {
      if (e.status === 400 || /insufficient/i.test(e.message)) {
        toast('Not enough coins — open Store to recharge', 'warning');
        setTimeout(() => (location.href = '/coins-recharge.html?app=1'), 600);
      } else {
        toast(window.SocialUI?.friendlyMessage(e.message) || e.message || 'Gift failed', 'error');
      }
    } finally {
      postGiftBusy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Gift';
      }
    }
  }

  function findPostById(postId) {
    const id = String(postId || '');
    if (!id) return null;
    const fromLocal = getPosts().find((x) => String(x.id) === id);
    if (fromLocal) return fromLocal;
    const fromReels = (reelItems || []).find((x) => String(x.postId) === id || String(x.id) === id);
    if (fromReels) {
      return {
        id: fromReels.postId || fromReels.id,
        userId: fromReels.userId,
        userName: fromReels.name,
        gifts: fromReels.gifts || 0,
        fromApi: true,
      };
    }
    try {
      const feeds = document.querySelectorAll('[id$="Feed"], .social-post-feed');
      for (const feed of feeds) {
        const hit = (feed._squarePosts || []).find((x) => String(x.id) === id);
        if (hit) return hit;
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  /** Opens live-style gift picker for a post/reel (does not send immediately). */
  async function sendGift(postId, postHint) {
    const p = postHint || findPostById(postId);
    if (!p && postHint?.userId) {
      await openPostGiftSheet({
        id: postId,
        userId: postHint.userId,
        userName: postHint.userName || postHint.name,
        gifts: postHint.gifts || 0,
      });
      return true;
    }
    if (!p) {
      toast('Cannot send gift to this post', 'error');
      return false;
    }
    await openPostGiftSheet({ ...p, id: p.id || postId });
    return true;
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

  function renderSquareSkeleton(count = 3) {
    return Array.from({ length: count }, () => `
      <article class="social-post-card social-post-card--skeleton" aria-hidden="true">
        <div class="social-skeleton-media"></div>
        <div class="social-skeleton-line social-skeleton-line--short"></div>
        <div class="social-skeleton-line"></div>
      </article>`).join('');
  }

  function paintReelSkeleton(wrap, uiLayer) {
    if (!wrap || wrap.querySelector('#reelsScroll')) return;
    const scroll = document.createElement('div');
    scroll.id = 'reelsScroll';
    scroll.className = 'social-reels-scroll social-reels-scroll--skeleton';
    scroll.innerHTML = Array.from({ length: 3 }, (_, i) => `
      <section class="social-reel-slide social-reel-slide--skeleton" data-index="${i}">
        <div class="social-skeleton-reel"></div>
      </section>`).join('');
    wrap.insertBefore(scroll, uiLayer || wrap.firstChild);
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
    const feedScope = opts.feed || currentFeedScope();
    const pageSize = opts.limit || 40;
    const offset = Number(opts.offset || 0);
    const skipLocal = offset > 0 || opts.skipLocal;

    function matchesFilter(p) {
      if (!canViewPost(p)) return false;
      if (startPostId && String(p.id) === String(startPostId)) return postHasMedia(p);
      return videosOnly ? postIsVideo(p) : postHasMedia(p);
    }

    const tMark = window.SocialCreatorTelemetry?.mark?.('feed_load_ms');
    const apiPosts = (
      await loadPosts({
        feed: feedScope,
        mediaType: videosOnly ? 'video' : 'all',
        limit: pageSize,
        offset,
      })
    ).filter(matchesFilter);
    tMark?.end?.({ feed: feedScope, surface: 'video', offset, count: apiPosts.length });

    const userPosts = skipLocal ? [] : getPosts().filter(matchesFilter);
    const merged = [];
    const seen = new Set(opts.excludeIds || []);
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
        profilePic: p.profilePic || null,
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
        authorLive: p.authorLive || null,
        role: p.role || p.author?.role || null,
        isVerified: !!(p.isVerified || p.author?.is_verified),
        agencyName: p.agencyName || null,
        creatorLevel: p.creatorLevel || p.vipLevel || null,
        workerId: null,
        fromApi: !!p.fromApi,
      }))
    );

    return fromPosts.filter((x) => x.mediaUrl || x.thumb);
  }

  function syncReelMediaSources(scroll, activeIndex) {
    if (!scroll) return;
    const slides = scroll.querySelectorAll('.social-reel-slide');
    slides.forEach((slide) => {
      const i = parseInt(slide.dataset.index, 10);
      const vid = slide.querySelector('video[data-reel-video]');
      const dist = Math.abs(i - activeIndex);
      if (!vid) return;
      const src = vid.dataset.src || '';
      if (dist <= 1) {
        if (src && vid.getAttribute('src') !== src) {
          vid.setAttribute('src', src);
          vid.preload = i === activeIndex ? 'auto' : 'metadata';
          try {
            vid.load();
          } catch (_e) { /* ignore */ }
        }
        if (i === activeIndex) {
          vid.setAttribute('playsinline', '');
        }
      } else if (dist === 2 && src && !vid.getAttribute('src')) {
        /* Warm decode path for ±2 without full attach on weak devices — poster only */
        vid.preload = 'none';
      } else if (dist > 1 && vid.getAttribute('src')) {
        try {
          vid.pause();
        } catch (_e) { /* ignore */ }
        vid.removeAttribute('src');
        try {
          vid.load();
        } catch (_e) { /* ignore */ }
      }
    });
  }

  function bindReelDoubleTapLike(scroll) {
    if (!scroll || scroll.dataset.dblLikeBound) return;
    scroll.dataset.dblLikeBound = '1';
    let lastTap = 0;
    let lastX = 0;
    let lastY = 0;
    const fire = (x, y) => {
      const item = reelItems[reelIndex];
      if (!item?.postId) return;
      handleReelAction('like');
      if (window.SocialFX?.spawnLike) SocialFX.spawnLike(x, y);
      else spawnInlineHeart(x, y);
    };
    scroll.addEventListener(
      'touchend',
      (e) => {
        if (e.target.closest('#reelUi, [data-action], .social-live-pill, button, a')) return;
        const t = e.changedTouches?.[0];
        if (!t) return;
        const now = Date.now();
        if (now - lastTap < 280 && Math.abs(t.clientX - lastX) < 40 && Math.abs(t.clientY - lastY) < 40) {
          fire(t.clientX, t.clientY);
          lastTap = 0;
          return;
        }
        lastTap = now;
        lastX = t.clientX;
        lastY = t.clientY;
      },
      { passive: true }
    );
    scroll.addEventListener('dblclick', (e) => {
      if (e.target.closest('#reelUi, [data-action], .social-live-pill, button, a')) return;
      fire(e.clientX, e.clientY);
    });
  }

  function spawnInlineHeart(x, y) {
    const el = document.createElement('div');
    el.className = 'ap-reel-heart-burst';
    el.innerHTML = '<i class="fas fa-heart"></i>';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function bindReelVisibilityResume(scroll) {
    if (bindReelVisibilityResume._bound) return;
    bindReelVisibilityResume._bound = true;
    document.addEventListener('visibilitychange', () => {
      const vid = getActiveReelVideo(scroll || document.getElementById('reelsScroll'));
      if (!vid) return;
      if (document.visibilityState === 'visible') {
        syncReelMediaSources(document.getElementById('reelsScroll'), reelIndex);
        applySocialVideoSound(vid, reelSoundEnabled());
        vid.play().catch(() => {});
      } else {
        try {
          vid.pause();
        } catch (_e) { /* ignore */ }
      }
    });
  }

  function setVideoImmersive(on) {
    const enabled = !!on;
    document.documentElement.classList.toggle('social-video-immersive', enabled);
    document.body?.classList.toggle('social-video-immersive', enabled);
    try {
      document.documentElement.style.setProperty('--social-video-tabs-h', enabled ? '0px' : '');
    } catch (_e) { /* ignore */ }
  }

  function shouldStartVideoImmersive() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('fullscreen') === '0') return false;
    /* Only when opened as a single reel — not the whole Video tab */
    return qs.get('fullscreen') === '1' || !!qs.get('post') || !!qs.get('topic');
  }

  function ensureReelCloseButton(onClose) {
    let btn = document.getElementById('reelCloseBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'reelCloseBtn';
      btn.className = 'social-reel-close-btn';
      btn.setAttribute('aria-label', 'Close');
      btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
      document.getElementById('reelUi')?.appendChild(btn);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onClose === 'function') onClose();
        else setVideoImmersive(false);
      });
    }
    btn.style.display = '';
  }

  function openReelViewer(postId) {
    if (!postId) return;
    sessionStorage.setItem('social_reel_start', String(postId));
    sessionStorage.setItem(REEL_SOUND_KEY, '1');
    location.href =
      '/video.html?post=' + encodeURIComponent(postId) + '&app=1&fullscreen=1';
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
        item.profilePic ||
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
      const handle = String(item.name || 'Creator');
      const identity = {
        id: item.userId,
        displayName: handle,
        profilePic: item.profilePic,
        role: item.role,
        isVerified: item.isVerified,
        agencyName: item.agencyName,
        creatorLevel: item.creatorLevel || item.vipLevel,
        authorLive: item.authorLive,
        isLive: !!item.authorLive,
        liveHref: item.authorLive?.href,
      };
      const badges = window.SocialCreatorIdentity?.renderBadgesHtml?.(identity, 'reel') ||
        (item.authorLive ? ' ' + liveBadgeHtml(item.authorLive) : '');
      name.innerHTML = '<span class="ap-reel-handle">@' + escapeHtml(handle.replace(/\s+/g, '')) + '</span> ' + badges;
    }
    if (cap) cap.innerHTML = formatCaptionHtml(item.caption || '');
    const scroll = document.getElementById('reelsScroll');
    syncReelMediaSources(scroll, reelIndex);
    const activeVid = getActiveReelVideo(scroll);
    if (activeVid) applySocialVideoSound(activeVid, reelSoundEnabled());
    if (follow) {
      const fid = item.userId || item.workerId || item.name;
      const on = isFollowing(fid, item.name);
      follow.textContent = on ? '✓' : '+';
      follow.classList.toggle('is-following', on);
      follow.setAttribute('aria-label', on ? 'Following' : 'Follow');
      follow.onclick = async (e) => {
        e.stopPropagation();
        if (!item.userId) {
          toast('Profile link incomplete', 'warning');
          return;
        }
        const now = await toggleFollow(item.userId, item.name);
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

  async function initVideoPage(containerId, options) {
    const pageOpts = options || {};
    ensureStarterCoins();
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const qs = new URLSearchParams(location.search);
    const startPost =
      qs.get('post') ||
      sessionStorage.getItem('social_reel_start');
    if (shouldStartVideoImmersive()) setVideoImmersive(true);
    if (startPost) {
      ensureReelCloseButton(() => {
        if (history.length > 1) history.back();
        else location.href = '/square.html?app=1';
      });
    } else {
      ensureReelCloseButton(() => setVideoImmersive(false));
    }
    const uiLayer = document.getElementById('reelUi');
    const soft = !!pageOpts.soft && wrap.querySelector('#reelsScroll');
    if (!soft) paintReelSkeleton(wrap, uiLayer);
    const pageSize = 40;
    const feedScope = pageOpts.feed || currentFeedScope();
    reelItems = await buildReelItems([], {
      videosOnly: true,
      startPostId: startPost,
      feed: feedScope,
      limit: pageSize,
      offset: 0,
    });
    wrap._reelOffset = reelItems.length;
    wrap._reelHasMore = reelItems.length >= pageSize;
    wrap._reelFeed = feedScope;
    wrap._reelPageSize = pageSize;
    wrap._reelLoadingMore = false;

    if (!reelItems.length) {
      let empty = wrap.querySelector('.social-reel-empty');
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'social-empty-state social-reel-empty';
        empty.style.cssText =
          'text-align:center;padding:48px 24px;pointer-events:auto;position:relative;z-index:2';
        wrap.insertBefore(empty, uiLayer || null);
      }
      empty.innerHTML = window.SocialCreatorPolish
        ? SocialCreatorPolish.emptyStateHtml({
            icon: '▶',
            title: 'No videos yet',
            body: 'Share a short clip from the camera — it will show up here.',
            ctaLabel: 'Create a video',
            ctaAction: 'create',
          }).replace('social-empty-state--feed ap-empty', 'social-empty-state--feed ap-empty social-reel-empty')
        : '<div class="illus" aria-hidden="true">▶</div><h3>No videos yet</h3><p>Share a short clip from the camera — it will show up here.</p>';
      if (window.SocialCreatorPolish) {
        SocialCreatorPolish.bindEmptyCta(empty, {
          create: () => document.querySelector('[data-social-camera]')?.click(),
        });
      }
      const stale = document.getElementById('reelsScroll');
      if (stale) stale.remove();
      if (uiLayer) uiLayer.style.display = 'none';
      return;
    }
    if (uiLayer) uiLayer.style.display = '';

    const stats = getReelStats();
    reelItems.forEach((item) => {
      const s = stats[reelKey(item)];
      if (s) {
        if (s.likes) item.likes = Math.max(item.likes || 0, s.likes);
        if (s.comments?.length) item.comments = Math.max(item.comments || 0, s.comments.length);
        if (s.gifts) item.gifts = Math.max(item.gifts || 0, s.gifts);
        if (s.shares) item.shares = Math.max(item.shares || 0, s.shares);
      }
    });

    let scroll = document.getElementById('reelsScroll');
    const keepIndex = soft ? reelIndex : 0;
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.id = 'reelsScroll';
      scroll.className = 'social-reels-scroll';
      wrap.insertBefore(scroll, uiLayer || wrap.firstChild);
    }
    scroll.classList.remove('social-reels-scroll--skeleton');
    scroll.innerHTML = reelItems
      .map((item, i) => {
        const media = item.isVideo
          ? `<video data-src="${item.mediaUrl || ''}" playsinline loop muted data-reel-video preload="none" poster="${item.thumb || ''}" class="social-reel-media"${item.trimStart != null ? ` data-trim-start="${item.trimStart}" data-trim-end="${item.trimEnd}"` : ''}></video>`
          : `<img src="${item.mediaUrl || item.thumb}" alt="" class="social-reel-media">`;
        return `<section class="social-reel-slide" data-index="${i}" data-item-id="${item.id}">
          ${media}
          <div class="social-reel-buffer" hidden aria-hidden="true"></div>
          <div class="social-reel-gradient"></div>
        </section>`;
      })
      .join('');

    wrap.querySelector('.social-reel-empty')?.remove();

    if (scroll._reelObserver) {
      try {
        scroll._reelObserver.disconnect();
      } catch (_e) { /* ignore */ }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const i = parseInt(en.target.dataset.index, 10);
            reelItems[i] && updateReelUI(reelItems[i]);
            syncReelMediaSources(scroll, i);
            if (wrap._reelHasMore && i >= reelItems.length - 3) {
              appendMoreReels(wrap, scroll, observer).catch(() => {});
            }
            en.target.querySelectorAll('video[data-reel-video]').forEach((v) => {
              applySocialVideoSound(v, reelSoundEnabled());
              const buf = en.target.querySelector('.social-reel-buffer');
              const onWaiting = () => {
                if (buf) buf.hidden = false;
              };
              const onReady = () => {
                if (buf) buf.hidden = true;
                v.classList.add('is-ready');
                en.target.classList.add('is-active-slide');
              };
              v.addEventListener('waiting', onWaiting);
              v.addEventListener('playing', onReady);
              v.addEventListener('canplay', onReady, { once: true });
              if (!v.dataset.ttfvBound) {
                v.dataset.ttfvBound = '1';
                const t0 = performance.now();
                const markFrame = () => {
                  window.SocialCreatorTelemetry?.track?.('ttfv_ms', Math.round(performance.now() - t0), {
                    postId: reelItems[i]?.postId,
                  });
                };
                v.addEventListener('playing', markFrame, { once: true });
                v.addEventListener('timeupdate', () => {
                  if (v.dataset.reelDone) return;
                  const dur = v.duration;
                  if (!dur || !Number.isFinite(dur)) return;
                  if (v.currentTime / dur >= 0.9) {
                    v.dataset.reelDone = '1';
                    window.SocialCreatorTelemetry?.track?.('reel_complete', 1, {
                      postId: reelItems[i]?.postId,
                    });
                  }
                });
              }
              const playP = v.play();
              if (playP?.catch) playP.catch(() => {});
            });
          } else {
            en.target.classList.remove('is-active-slide');
            en.target.querySelectorAll('video[data-reel-video]').forEach((v) => v.pause());
          }
        });
      },
      { root: scroll, threshold: 0.6 }
    );
    scroll._reelObserver = observer;
    scroll.querySelectorAll('.social-reel-slide').forEach((s) => observer.observe(s));

    scroll.querySelectorAll('.social-reel-slide video, .social-reel-slide img').forEach((el) => markMediaOrientation(el));
    bindVideoTrimPlayback(scroll);

    scroll.querySelectorAll('.social-reel-slide').forEach((slide) => {
      if (slide.dataset.clickBound) return;
      slide.dataset.clickBound = '1';
      slide.addEventListener('click', (e) => {
        if (e.target.closest('#reelUi') || e.target.closest('[data-action]') || e.target.closest('.social-live-pill')) return;
        const vid = slide.querySelector('video[data-reel-video]');
        if (!vid) return;
        setVideoImmersive(true);
        syncReelMediaSources(scroll, parseInt(slide.dataset.index, 10) || 0);
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

    const startIdx =
      startPost != null
        ? Math.max(
            0,
            reelItems.findIndex((x) => String(x.postId) === String(startPost))
          )
        : keepIndex;
    syncReelMediaSources(scroll, startIdx >= 0 ? startIdx : 0);
    updateReelUI(reelItems[startIdx >= 0 ? startIdx : 0] || reelItems[0]);
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
    } else if (soft && keepIndex > 0) {
      const slide = scroll.querySelector(`[data-index="${keepIndex}"]`);
      slide?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }

    bindReelDoubleTapLike(scroll);
    bindReelVisibilityResume(scroll);
    ensureReelRotateControl(scroll);

    const avatarBtn = document.getElementById('videoAvatarBtn');
    if (avatarBtn && !avatarBtn.dataset.bound) {
      avatarBtn.dataset.bound = '1';
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = reelItems[reelIndex];
        if (item) location.href = profileUrl(item);
      });
    }

    const nameEl = document.getElementById('videoName');
    if (nameEl && !nameEl.dataset.bound) {
      nameEl.dataset.bound = '1';
      nameEl.addEventListener('click', (e) => {
        if (e.target.closest('.social-live-pill')) return;
        e.stopPropagation();
        const item = reelItems[reelIndex];
        if (item) location.href = profileUrl(item);
      });
    }

    if (window.SocialUI) SocialUI.bindAvatarFallbacks(document);
    if (window.SocialNav?.registerRefresh && !wrap.dataset.refreshBound) {
      wrap.dataset.refreshBound = '1';
      SocialNav.registerRefresh(async () => {
        try {
          await initVideoPage(containerId, { soft: true, feed: currentFeedScope() });
        } catch (_e) { /* ignore */ }
      });
    }
  }

  async function appendMoreReels(wrap, scroll, observer) {
    if (!wrap || !scroll || wrap._reelLoadingMore || wrap._reelHasMore === false) return;
    wrap._reelLoadingMore = true;
    try {
      const pageSize = wrap._reelPageSize || 40;
      const excludeIds = new Set(reelItems.map((x) => String(x.postId)));
      const more = await buildReelItems([], {
        videosOnly: true,
        feed: wrap._reelFeed || currentFeedScope(),
        limit: pageSize,
        offset: Number(wrap._reelOffset || 0),
        skipLocal: true,
        excludeIds,
      });
      if (!more.length) {
        wrap._reelHasMore = false;
        return;
      }
      const startIdx = reelItems.length;
      reelItems = reelItems.concat(more);
      wrap._reelOffset = Number(wrap._reelOffset || 0) + more.length;
      wrap._reelHasMore = more.length >= pageSize;
      window.SocialCreatorTelemetry?.track?.('feed_page', more.length, { surface: 'video' });

      const stats = getReelStats();
      more.forEach((item) => {
        const s = stats[reelKey(item)];
        if (s) {
          if (s.likes) item.likes = Math.max(item.likes || 0, s.likes);
          if (s.comments?.length) item.comments = Math.max(item.comments || 0, s.comments.length);
          if (s.gifts) item.gifts = Math.max(item.gifts || 0, s.gifts);
          if (s.shares) item.shares = Math.max(item.shares || 0, s.shares);
        }
      });

      const frag = document.createDocumentFragment();
      more.forEach((item, j) => {
        const i = startIdx + j;
        const section = document.createElement('section');
        section.className = 'social-reel-slide';
        section.dataset.index = String(i);
        section.dataset.itemId = item.id;
        const media = item.isVideo
          ? `<video data-src="${item.mediaUrl || ''}" playsinline loop muted data-reel-video preload="none" poster="${item.thumb || ''}" class="social-reel-media"${item.trimStart != null ? ` data-trim-start="${item.trimStart}" data-trim-end="${item.trimEnd}"` : ''}></video>`
          : `<img src="${item.mediaUrl || item.thumb}" alt="" class="social-reel-media">`;
        section.innerHTML = `${media}<div class="social-reel-buffer" hidden aria-hidden="true"></div><div class="social-reel-gradient"></div>`;
        frag.appendChild(section);
        observer.observe(section);
        section.querySelectorAll('video, img').forEach((el) => markMediaOrientation(el));
        bindVideoTrimPlayback(section);
        if (!section.dataset.clickBound) {
          section.dataset.clickBound = '1';
          section.addEventListener('click', (e) => {
            if (e.target.closest('#reelUi') || e.target.closest('[data-action]') || e.target.closest('.social-live-pill')) return;
            const vid = section.querySelector('video[data-reel-video]');
            if (!vid) return;
            setVideoImmersive(true);
            syncReelMediaSources(scroll, parseInt(section.dataset.index, 10) || 0);
            if (vid.muted) {
              setReelSoundEnabled(true);
              applySocialVideoSound(vid, true);
              vid.play().catch(() => {});
              return;
            }
            if (vid.paused) vid.play().catch(() => {});
            else vid.pause();
          });
        }
      });
      scroll.appendChild(frag);
    } catch (_e) {
      window.SocialCreatorTelemetry?.track?.('api_error', 1, { where: 'video_feed_more' });
    } finally {
      wrap._reelLoadingMore = false;
    }
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
        const p =
          getPosts().find((x) => String(x.id) === String(item.postId)) || {
            id: item.postId,
            fromApi: item.fromApi !== false,
          };
        try {
          const { liked, delta, locked } = await toggleLikePost(item.postId, p);
          if (locked) return;
          if (delta) item.likes = Math.max(0, (item.likes || 0) + delta);
          const likeBtn = document.querySelector('#reelActions [data-action="like"]');
          if (liked && likeBtn) {
            likeBtn.classList.remove('social-like-pop');
            void likeBtn.offsetWidth;
            likeBtn.classList.add('social-like-pop');
          }
          window.SocialCreatorPolish?.haptic?.(liked ? 'success' : 'light');
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
      if (item.postId || item.userId) {
        await sendGift(item.postId || item.id, {
          id: item.postId || item.id,
          userId: item.userId,
          userName: item.name,
          gifts: item.gifts || 0,
        });
      } else {
        toast('Join their live room to send gifts', 'info');
      }
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

  async function renderSquareFeed(container, options) {
    const opts = options || {};
    const feed = typeof container === 'string' ? document.getElementById(container) : container;
    if (!feed) return;
    const append = !!opts.append;
    const pageSize = opts.limit || 30;
    if (append && (feed._squareLoading || feed._squareHasMore === false)) return;
    feed._squareLoading = true;
    const tMark = window.SocialCreatorTelemetry?.mark?.('feed_load_ms');

    if (!append && !feed.querySelector('.social-post-card') && !feed.querySelector('.social-empty-state')) {
      feed.innerHTML = renderSquareSkeleton(4);
    }

    const feedScope = opts.feed || currentFeedScope();
    const loadOpts = {
      feed: feedScope,
      userId: opts.userId || null,
      mediaType: opts.mediaType || 'all',
      limit: pageSize,
      offset: append ? Number(feed._squareOffset || 0) : opts.offset || 0,
    };
    let posts = [];
    try {
      posts = (await loadPosts(loadOpts)).filter((p) => canViewPost(p));
      tMark?.end?.({ feed: feedScope, append: append ? 1 : 0, count: posts.length });
    } catch (_err) {
      window.SocialCreatorTelemetry?.track?.('api_error', 1, { where: 'square_feed' });
      feed._squareLoading = false;
      if (append) {
        return;
      }
      const polish = window.SocialCreatorPolish;
      feed.innerHTML = polish
        ? polish.errorStateHtml({
            title: 'Couldn’t load posts',
            body: 'Check your connection and try again.',
          })
        : '<p style="text-align:center;padding:24px;color:#8b6914">Couldn’t load posts.</p>';
      if (polish) {
        polish.bindRetry(feed, () => renderSquareFeed(feed, { ...opts, append: false }));
      }
      return;
    }

    if (!append && !posts.length) {
      const polish = window.SocialCreatorPolish;
      const followingEmpty = feedScope === 'following';
      feed.innerHTML = polish
        ? polish.emptyStateHtml({
            icon: followingEmpty ? '◎' : '✦',
            title: followingEmpty ? 'No posts from people you follow' : 'No posts yet',
            body: followingEmpty
              ? 'Follow creators to see their updates here.'
              : 'Be the first to share a moment. Tap the camera to create.',
            ctaLabel: followingEmpty ? 'Discover creators' : 'Create a post',
            ctaAction: followingEmpty ? 'discover' : 'create',
            ctaHref: followingEmpty ? '/discover-creators.html?app=1' : undefined,
          })
        : `<div class="social-empty-state social-empty-state--feed"><div class="illus">✦</div><h3>No posts yet</h3><p>Be the first to share a moment.</p></div>`;
      if (polish) {
        polish.bindEmptyCta(feed, {
          create: () => document.querySelector('[data-social-camera]')?.click(),
          discover: () => (location.href = '/discover-creators.html?app=1'),
        });
      }
      feed._squareLoading = false;
      feed._squareHasMore = false;
      return;
    }

    if (append && !posts.length) {
      feed._squareHasMore = false;
      feed._squareLoading = false;
      const tip = feed.querySelector('.ap-feed-end');
      if (!tip) {
        const end = document.createElement('p');
        end.className = 'ap-feed-end';
        end.textContent = 'You’re all caught up';
        feed.appendChild(end);
      }
      return;
    }

    const feedPosts = append ? [...(feed._squarePosts || []), ...posts] : posts;
    feed._squarePosts = feedPosts;
    feed._squareOffset = (append ? Number(feed._squareOffset || 0) : 0) + posts.length;
    feed._squareHasMore = posts.length >= pageSize;
    feed._squareFeedOpts = { ...opts, feed: feedScope, append: false };

    const html = await Promise.all(
      posts.map(async (p) => {
        const url = await getMediaUrl(p);
        let thumbUrl = !isPlaceholderThumb(p.thumb) ? p.thumb : '';
        if (!thumbUrl && !postIsVideo(p) && url && !isPlaceholderThumb(url)) thumbUrl = url;
        const user = window.Auth?.getUser?.();
        const isOwner =
          user &&
          (String(p.userId) === String(user.id) || p.userId === 'me' || String(p.userId) === String(user.email));
        const hasMedia = !!(url || thumbUrl);
        const media = !hasMedia
          ? `<div class="social-post-text-only">${formatCaptionHtml(p.caption || p.text || '')}</div>`
          : postIsVideo(p)
            ? `<video ${thumbUrl ? `poster="${thumbUrl}"` : ''} playsinline muted preload="none" data-social-feed-video data-src="${url || ''}"${videoTagAttrs(p)}></video>`
            : `<img src="${url || SocialShell?.avatarFallback(p.userName)}" alt="" loading="lazy">`;
        const liked = isLiked(p.id, p);
        const openReel = hasMedia
          ? postIsVideo(p)
            ? ' data-open-reel="1" data-open-reel-video="1"'
            : ' data-open-reel="1"'
          : '';
        const avatarSrc = p.profilePic
          ? resolveMediaUrl(p.profilePic)
          : SocialShell?.avatarFallback(p.userName) || window.SocialUI?.avatarUrl?.(p.userName) || '';
        const when = relativeTime(p.createdAt || p.id);
        return `
      <article class="social-post-card" data-post-id="${p.id}"${openReel}>
        <div class="social-post-media">${media}
          ${hasMedia && postIsVideo(p) ? '<span class="play-badge play-badge--fullscreen"><i class="fas fa-expand"></i></span>' : ''}
          ${hasMedia && !postIsVideo(p) ? '<span class="play-badge play-badge--photo"><i class="fas fa-expand"></i></span>' : ''}
          ${p.visibility === 'private' ? '<span class="social-post-private-badge"><i class="fas fa-lock"></i> Private</span>' : ''}
          ${isOwner ? `<button type="button" class="social-post-delete" data-delete-post="${p.id}" aria-label="Delete post"><i class="fas fa-times"></i></button>` : ''}
        </div>
        <div class="social-post-meta">${escapeHtml(when)}</div>
        <div class="social-post-actions">
          <button type="button" class="social-act-btn" data-act="like" data-id="${p.id}"><i class="${liked ? 'fas' : 'far'} fa-heart"></i> <span>${p.likes || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="comment" data-id="${p.id}"><i class="far fa-comment"></i> <span>${p.comments || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="gift" data-id="${p.id}"><i class="fas fa-gift"></i> <span>${p.gifts || 0}</span></button>
          <button type="button" class="social-act-btn" data-act="share" data-id="${p.id}"><i class="far fa-paper-plane"></i> <span>${p.shares || 0}</span></button>
        </div>
        <div class="social-post-user">
          ${
            window.SocialCreatorIdentity
              ? SocialCreatorIdentity.renderIdentityHtml(
                  {
                    id: p.userId,
                    displayName: p.userName,
                    profilePic: p.profilePic,
                    role: p.role,
                    isVerified: p.isVerified,
                    agencyName: p.agencyName,
                    creatorLevel: p.creatorLevel,
                    authorLive: p.authorLive,
                  },
                  { variant: 'card', href: profileUrl({ userName: p.userName, userId: p.userId }) }
                )
              : `<a href="${profileUrl({ userName: p.userName, userId: p.userId })}"><img src="${avatarSrc}" alt=""><div class="social-post-user-name">${escapeHtml(p.userName)} ${liveBadgeHtml(p.authorLive)}</div></a>`
          }
          <div class="social-post-caption">${hasMedia ? formatCaptionHtml(p.caption || '') : ''}</div>
        </div>
      </article>`;
      })
    );
    const fragment = document.createElement('div');
    fragment.innerHTML = html.join('');
    const newCards = [...fragment.children];
    if (!append) {
      feed.innerHTML = '';
      newCards.forEach((n) => feed.appendChild(n));
    } else {
      const sentinel = feed.querySelector('.ap-feed-sentinel');
      newCards.forEach((n) => {
        if (sentinel) feed.insertBefore(n, sentinel);
        else feed.appendChild(n);
      });
      window.SocialCreatorTelemetry?.track?.('feed_page', posts.length, { feed: feedScope });
    }

    const qs = (sel) =>
      append ? newCards.flatMap((n) => [...n.querySelectorAll(sel)]) : [...feed.querySelectorAll(sel)];

    /* Lazy-attach video src when near viewport; prefer server thumb over seek-hack */
    const vidObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          const vid = en.target;
          if (!en.isIntersecting) return;
          const src = vid.getAttribute('data-src');
          if (src && !vid.getAttribute('src')) {
            vid.setAttribute('src', src);
            vid.load?.();
          }
        });
      },
      { rootMargin: '200px' }
    );
    qs('video[data-src]').forEach((vid) => {
      if (vid.getAttribute('poster')) {
        vidObserver.observe(vid);
        return;
      }
      vidObserver.observe(vid);
      vid.addEventListener(
        'loadeddata',
        () => {
          if (vid.getAttribute('poster') || !vid.videoWidth) return;
          try {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 360 / vid.videoWidth);
            canvas.width = Math.round(vid.videoWidth * scale);
            canvas.height = Math.round(vid.videoHeight * scale);
            canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
            vid.setAttribute('poster', canvas.toDataURL('image/jpeg', 0.7));
          } catch (_e) { /* ignore */ }
        },
        { once: true }
      );
    });

    qs('[data-delete-post]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.deletePost;
        if (!confirm('Delete this post?')) return;
        try {
          await deletePostRemote(id);
          await renderSquareFeed(feed, { ...feed._squareFeedOpts, append: false });
          toast('Post deleted');
        } catch (_err) {
          toast('Could not delete post', 'error');
        }
      });
    });
    qs('.social-post-media video, .social-post-media img').forEach((el) => markMediaOrientation(el));
    newCards.forEach((card) => bindVideoTrimPlayback(card));

    qs('.social-post-media video[data-social-feed-video]').forEach((vid) => {
      const mediaWrap = vid.closest('.social-post-media');
      const postId = vid.closest('[data-post-id]')?.dataset?.postId;
      vid.addEventListener('click', (e) => {
        if (e.target.closest('.social-feed-sound-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        if (postId) openReelViewer(postId);
      });
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
        if (!vid.getAttribute('src') && vid.getAttribute('data-src')) {
          vid.setAttribute('src', vid.getAttribute('data-src'));
        }
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

    qs('[data-open-reel]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-act], [data-delete-post], .social-post-user, button, a, .social-feed-sound-btn')) return;
        if (e.target.closest('video[data-social-feed-video]')) return;
        openReelViewer(card.dataset.postId);
      });
    });

    qs('[data-act="like"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const p = feedPosts.find((x) => String(x.id) === String(id));
        try {
          const { liked, delta, locked } = await toggleLikePost(id, p || { id, fromApi: true });
          if (locked) return;
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
          if (liked) {
            btn.classList.remove('social-like-pop');
            void btn.offsetWidth;
            btn.classList.add('social-like-pop');
          }
          btn.querySelector('span').textContent = p?.likes ?? btn.querySelector('span').textContent;
          SocialRealtime.emit('social:like', { postId: id, liked });
        } catch (_e) {
          toast('Could not update like', 'error');
        }
      });
    });
    qs('[data-act="comment"]').forEach((btn) => {
      btn.addEventListener('click', () => openComments(btn.dataset.id));
    });
    qs('[data-act="gift"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const p = feedPosts.find((x) => String(x.id) === String(id)) || findPostById(id);
        await sendGift(id, p);
      });
    });
    qs('[data-act="share"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const p = feedPosts.find((x) => String(x.id) === String(id)) || getPosts().find((x) => String(x.id) === String(id));
        if (p) {
          await sharePost(p);
          btn.querySelector('span').textContent = p.shares || 0;
        }
      });
    });

    feed._squareLoading = false;
    ensureSquareInfiniteScroll(feed);

    if (!feed._squareSoftBound) {
      feed._squareSoftBound = true;
      SocialRealtime.on('social:reconnect', () => {
        if (document.visibilityState === 'visible') {
          renderSquareFeed(feed, { ...feed._squareFeedOpts, soft: true, append: false });
        }
      });
    }
  }

  function ensureSquareInfiniteScroll(feed) {
    if (!feed) return;
    let sentinel = feed.querySelector('.ap-feed-sentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.className = 'ap-feed-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      feed.appendChild(sentinel);
      if (feed._squareIo) {
        try {
          feed._squareIo.disconnect();
        } catch (_e) { /* ignore */ }
        feed._squareIo = null;
      }
    }
    if (!feed._squareIo) {
      feed._squareIo = new IntersectionObserver(
        (entries) => {
          const hit = entries.some((e) => e.isIntersecting);
          if (!hit || feed._squareLoading || feed._squareHasMore === false) return;
          renderSquareFeed(feed, { ...feed._squareFeedOpts, append: true }).catch(() => {});
        },
        { root: null, rootMargin: '400px', threshold: 0 }
      );
    }
    feed._squareIo.observe(sentinel);
  }

  function renderTopics(containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;
    /* Extension: window.SocialTopicsProvider.getTopics() can replace hardcoded list later */
    const items =
      (typeof window.SocialTopicsProvider?.getTopics === 'function' &&
        window.SocialTopicsProvider.getTopics()) ||
      [
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
    loadPosts,
    fetchApiPosts,
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
    deletePostRemote,
    bookmarkPost,
    currentFeedScope,
    setFeedScope,
    relativeTime,
    postIsVideo,
    resolveMediaUrl,
    profileUrl,
    apiSocial,
  };
})();
