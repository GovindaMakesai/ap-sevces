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
    const kind = TOPIC_KINDS[i % TOPIC_KINDS.length];
    if (window.SocialUI?.themeCover) return SocialUI.themeCover(kind, label || 'Topic');
    if (window.SocialShell?.coverFallback) return SocialShell.coverFallback(label || 'Topic', kind === 'party');
    return '';
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

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveBlob(id, blob) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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

  async function generateVideoThumb(file) {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        video.onloadeddata = () => {
          video.currentTime = Math.min(0.25, (video.duration || 1) * 0.05);
        };
        video.onseeked = () => {
          const w = video.videoWidth || 720;
          const h = video.videoHeight || 1280;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(video, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve('');
        };
        video.src = url;
      } catch (_e) {
        resolve('');
      }
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

  async function getMediaUrl(post) {
    if (!post) return '';
    if (post.imageData) return post.imageData;
    if (post.mediaId) {
      try {
        const blob = await loadBlob(post.mediaId);
        if (blob) return URL.createObjectURL(blob);
      } catch (_e) {}
    }
    return post.image || post.thumb || (window.SocialUI ? SocialUI.avatarUrl(post.userName) : '');
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

  async function loadPosts() {
    if (window.API && localStorage.getItem('user')) {
      try {
        const res = await API.get('/social/posts');
        if (res.success && Array.isArray(res.data)) {
          return res.data.map((p) => {
            const mapped = {
              id: p.id,
              userId: p.user_id,
              userName: `${p.author?.first_name || ''} ${p.author?.last_name || ''}`.trim() || 'User',
              text: p.body,
              caption: p.body,
              image: p.media_url,
              likes: p.like_count || 0,
              comments: p.comment_count || 0,
              liked: !!p.liked,
              createdAt: p.created_at,
              fromApi: true,
              isVideo: isVideoMediaUrl(p.media_url),
            };
            if (mapped.liked) setLike(mapped.id, true);
            return mapped;
          });
        }
      } catch (_e) {
        /* fallback */
      }
    }
    return getPosts();
  }

  function savePosts(posts) {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts.slice(0, 50)));
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
      return raw.map((item) =>
        typeof item === 'string' ? { key: item, name: item.replace(/^@/, '') } : { key: item.key, name: item.name || item.key }
      );
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
    if (!window.API || !hasAuth()) return;
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    try {
      const res = await API.get('/social/following?limit=200');
      const rows = Array.isArray(res?.data) ? res.data : [];
      followIdCache = new Set(rows.map((u) => String(u.id)));
      const entries = rows.map((u) => ({
        key: String(u.id),
        id: String(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
      }));
      saveFollowEntries(entries);
    } catch (e) {
      console.warn('SocialInteractions: follow cache', e);
    }
  }

  async function toggleFollow(creatorId, creatorName) {
    const uid = String(creatorId || '').trim();
    if (window.API && hasAuth() && isUuid(uid)) {
      try {
        const following =
          followIdCache != null
            ? followIdCache.has(uid)
            : Boolean((await API.get(`/social/follow/${uid}/status`))?.data?.following);
        if (following) {
          await API.delete(`/social/follow/${uid}`);
          followIdCache?.delete(uid);
          toggleFollowLocal(uid, creatorName);
          return false;
        }
        await API.post(`/social/follow/${uid}`);
        if (!followIdCache) followIdCache = new Set();
        followIdCache.add(uid);
        toggleFollowLocal(uid, creatorName);
        return true;
      } catch (e) {
        console.warn('SocialInteractions: follow API fallback', e);
      }
    }
    return toggleFollowLocal(creatorId, creatorName);
  }

  async function getFollowStats(userId) {
    const uid = String(userId || window.Auth?.getUser?.()?.id || '').trim();
    if (window.API && hasAuth() && isUuid(uid)) {
      try {
        const res = await API.get(`/social/stats/${uid}`);
        const data = res?.data || {};
        let coins = 0;
        if (window.SocialWallet) {
          try {
            const b = await SocialWallet.fetchBalance();
            coins = b.coin_balance || 0;
          } catch (_e) {}
        }
        return {
          following: data.following || 0,
          followers: data.followers || 0,
          coins,
        };
      } catch (e) {
        console.warn('SocialInteractions: stats API', e);
      }
    }
    const following = getFollowEntries().length;
    const user = window.Auth?.getUser?.();
    const lookupId = String(userId || user?.id || user?.email || 'me');
    const map = getFollowersMap();
    const keys = new Set([lookupId, user?.email, user?.first_name, `${user?.first_name || ''} ${user?.last_name || ''}`.trim()].filter(Boolean).map(String));
    let followers = 0;
    keys.forEach((k) => {
      followers = Math.max(followers, (map[k] || []).length);
    });
    if (!followers && user) {
      const me = String(user.id || user.email || '');
      followers = Object.values(map).filter((arr) => arr.some((x) => String(x) === me)).length;
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
    document.addEventListener('DOMContentLoaded', () => refreshFollowCache());
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
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
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
      const b64 = await blobToBase64(blob);
      if (b64.length > 3_500_000) {
        throw new Error('File is too large for this device. Try a smaller photo or shorter video (under 3 MB).');
      }
      return { imageData: b64 };
    }
  }

  async function savePostFromForm(caption, visibility, file) {
    if (!caption && !file) {
      throw new Error('Add a caption or attach a photo/video.');
    }
    const user = window.Auth?.getUser?.();
    const id = Date.now();
    const post = {
      id,
      caption: caption || '',
      visibility,
      userName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'You' : 'You',
      userId: user?.id || 'me',
      minsAgo: 0,
      likes: 0,
      comments: 0,
      gifts: 0,
      shares: 0,
      isVideo: false,
      mediaId: null,
      imageData: null,
      thumb: window.SocialUI ? SocialUI.avatarUrl(user?.first_name || 'You') : '',
    };

    if (file) {
      post.isVideo = file.type.startsWith('video/');
      if (post.isVideo && file.size > 12 * 1024 * 1024) {
        throw new Error('Video must be under 12 MB. Trim the clip or pick a shorter one.');
      }
      let blob = file;
      if (!post.isVideo) blob = await compressImage(file);
      else {
        const thumb = await generateVideoThumb(file);
        if (thumb) post.thumb = thumb;
      }
      const mediaId = 'media-' + id;
      const stored = await storeMediaBlob(mediaId, blob);
      if (typeof stored === 'string') {
        post.mediaId = stored;
      } else {
        post.imageData = stored.imageData;
      }
    }

    const posts = getPosts();
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
    return (
      '/creator-profile.html?name=' +
      encodeURIComponent(item.userName || item.name || 'Creator') +
      '&app=1'
    );
  }

  /** Video reels page */
  let reelItems = [];
  let reelIndex = 0;

  async function buildReelItems(pros) {
    const userPosts = getPosts().filter((p) => canViewPost(p) && postIsVideo(p));
    const apiPosts = (await loadPosts()).filter((p) => canViewPost(p) && postIsVideo(p));
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
        isVideo: true,
        liked: isLiked(p.id, p),
        mediaUrl: await getMediaUrl(p),
        thumb: p.thumb || (await getMediaUrl(p)),
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

    return fromPosts.filter((x) => x.isVideo && (x.mediaUrl || x.thumb));
  }

  function openReelViewer(postId) {
    if (!postId) return;
    sessionStorage.setItem('social_reel_start', String(postId));
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
      avatar.src = window.SocialUI
        ? SocialUI.avatarUrl(item.name, item.thumb || item.mediaUrl)
        : item.thumb || item.mediaUrl;
      avatar.alt = item.name || 'Creator';
    }
    if (name) {
      name.textContent = '@' + String(item.name || 'Creator').replace(/\s+/g, '');
    }
    if (cap) cap.textContent = item.caption || '';
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
    reelItems = await buildReelItems(pros);
    const uiLayer = document.getElementById('reelUi');

    if (!reelItems.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#fff;text-align:center;padding:40px;pointer-events:auto';
      empty.textContent = 'No videos yet. Post from Square camera.';
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
          ? `<video src="${item.mediaUrl}" playsinline loop muted data-reel-video poster="${item.thumb || ''}"></video>`
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

    scroll.querySelectorAll('.social-reel-slide').forEach((slide) => {
      slide.addEventListener('click', (e) => {
        if (e.target.closest('#reelUi') || e.target.closest('[data-action]')) return;
        const vid = slide.querySelector('video[data-reel-video]');
        if (!vid) return;
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      });
    });

    updateReelUI(reelItems[0]);
    bindReelActionsPanel();

    const startPost =
      new URLSearchParams(location.search).get('post') ||
      sessionStorage.getItem('social_reel_start');
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
          if ((bal.coin_balance || 0) < coinCost) {
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
        const thumbUrl = p.thumb || url;
        const user = window.Auth?.getUser?.();
        const isOwner =
          !p.demo &&
          user &&
          (String(p.userId) === String(user.id) || p.userId === 'me' || String(p.userId) === String(user.email));
        const media = postIsVideo(p)
          ? `<video src="${url}" playsinline muted poster="${thumbUrl || ''}"></video>`
          : `<img src="${url || SocialShell?.avatarFallback(p.userName)}" alt="">`;
        const liked = !p.demo && isLiked(p.id, p);
        const openReel = postIsVideo(p) ? ' data-open-reel="1"' : '';
        return `
      <article class="social-post-card" data-post-id="${p.id}"${openReel}>
        <div class="social-post-media">${media}
          ${postIsVideo(p) ? '<span class="play-badge"><i class="fas fa-play"></i></span>' : ''}
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
          <img src="${SocialShell?.avatarFallback(p.userName) || thumbUrl}" alt="">
          <div>
            <div class="social-post-user-name">${escapeHtml(p.userName)} 🇮🇳</div>
            <div class="social-post-caption">${escapeHtml(p.caption || '')}</div>
          </div>
        </a>
      </article>`;
      })
    );
    feed.innerHTML = html.join('');

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
            <h3 style="font-size:15px;color:var(--gold-800);margin-bottom:6px">${t.title}</h3>
            <span class="social-flame"><i class="fas fa-fire"></i> ${t.heat.toLocaleString()}</span>
          </div>
          ${t.ended ? '<span style="color:#9ca3af;font-size:13px">ended</span>' : '<button type="button" class="social-join-btn" data-join-topic>Join room</button>'}
        </div>
        <div class="social-topic-videos">
          ${[0, 1, 2, 3]
            .map(
              (n) =>
                `<button type="button" class="thumb" data-go-video data-topic="${ti}">
                  <img src="${topicThumb(ti * 4 + n, 'Clip')}" alt="" loading="lazy" onerror="this.src='${fallbackThumb}'">
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
      btn.addEventListener('click', () => {
        document.querySelectorAll('.social-rank-sub-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
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
    toast,
    openComments,
    getFollowStats,
    getFollowingList,
    getFollowersList,
    toggleFollow,
    isFollowing,
    refreshFollowCache,
    getFollowEntries,
    openReelViewer,
    toggleLikePost,
    postIsVideo,
  };
})();
