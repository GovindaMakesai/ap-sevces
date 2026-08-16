/**
 * Reference-style creator profile panel (Data / Relationship / Gift / Posts).
 */
(function () {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(n) {
    const v = Number(n || 0);
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(v);
  }

  function apiRoot() {
    return (window.AP_SERVICES_API_ROOT || 'https://api.apservices.in/api').replace(/\/+$/, '');
  }

  function buildGiftSlugMap() {
    const map = new Map();
    const catalog = window.AP_LIVE_EMOJI?.GIFT_CATALOG;
    if (!catalog) return map;
    Object.values(catalog).forEach((arr) => {
      (arr || []).forEach((g) => {
        const base = String(g.name || 'gift')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        const slug = g.slug || `${base}_${g.cost || 0}`;
        map.set(slug, g);
        map.set(base, g);
      });
    });
    return map;
  }

  function resolveGift(giftType, slugMap) {
    const key = String(giftType || '').trim();
    if (!key) return { emoji: '🎁', name: 'Gift' };
    if (slugMap.has(key)) return slugMap.get(key);
    const base = key.replace(/_\d+$/, '');
    if (slugMap.has(base)) return slugMap.get(base);
    return { emoji: '🎁', name: key.replace(/_/g, ' ') };
  }

  function genderLabel(g) {
    const v = String(g || '').toLowerCase();
    if (v === 'male' || v === 'm') return { icon: '♂', label: 'Male' };
    if (v === 'female' || v === 'f') return { icon: '♀', label: 'Female' };
    return null;
  }

  const CreatorProfilePanel = {
    state: {
      userId: '',
      name: '',
      panel: null,
      engagement: null,
      following: false,
      isSelf: false,
      activeTab: 'gift',
      slugMap: buildGiftSlugMap(),
    },

    async boot() {
      const params = new URLSearchParams(location.search);
      const userId = (params.get('userId') || params.get('id') || '').trim();
      const name =
        (window.SocialUI?.safeDecodeURIComponent || ((v) => v))(params.get('name') || 'User');
      this.state.userId = userId;
      this.state.name = name;

      const me = window.Auth?.getUser?.() || null;
      this.state.isSelf = me && userId && String(me.id) === String(userId);

      if (userId && me?.id && String(me.id) !== String(userId)) {
        try {
          const token = localStorage.getItem('token');
          fetch(apiRoot() + '/social/profile/' + encodeURIComponent(userId) + '/visit', {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' },
          }).catch(() => {});
        } catch (_e) {}
      }

      this.paintShell(name);
      this.markReady();
      this.bindTabs();
      this.bindActions();

      if (!userId) {
        this.showEmpty('Open a profile from live or video to load their page.');
        return;
      }

      await this.loadAll();
    },

    paintShell(name) {
      const root = document.getElementById('cpRefRoot');
      if (!root) return;
      root.innerHTML =
        '<div class="cp-ref-top">' +
        '<div class="cp-ref-cover-zone" id="cpRefCoverZone">' +
        '<div class="cp-ref-cover-track" id="cpRefCoverTrack"></div>' +
        '<div class="cp-ref-cover-dots" id="cpRefCoverDots" hidden></div>' +
        '<img class="cp-ref-cover-mini" id="cpRefCoverMini" alt="" hidden>' +
        '<button type="button" class="cp-ref-cover-add" id="cpRefCoverAdd" hidden aria-label="Add background photo"><i class="fas fa-plus"></i></button>' +
        '<input type="file" accept="image/*" id="cpRefCoverInput" hidden>' +
        '</div>' +
        '<header class="cp-ref-header cp-ref-header--overlay">' +
        '<button type="button" class="cp-ref-icon-btn" id="cpRefBack" aria-label="Back"><i class="fas fa-arrow-left"></i></button>' +
        '<div class="cp-ref-header-title" id="cpRefHeaderTitle">' +
        esc(name) +
        '</div>' +
        '<div class="cp-ref-header-actions">' +
        '<a class="cp-ref-icon-btn" id="cpRefGiftLink" href="/store.html?app=1" aria-label="Gifts"><i class="fas fa-gift"></i></a>' +
        '<a class="cp-ref-edit-pill" id="cpRefEditPill" href="/profile-tab.html?app=1&edit=1" hidden><i class="fas fa-pen"></i> <span id="cpRefCompletion">0%</span></a>' +
        '</div></header>' +
        '</div>' +
        '<section class="cp-ref-hero cp-ref-hero--overlap" id="cpRefHero">' +
        '<div class="cp-ref-avatar-wrap"><img id="cpRefAvatar" alt=""></div>' +
        '<div class="cp-ref-name-row"><span class="cp-ref-name" id="cpRefName">' +
        esc(name) +
        '</span><span class="cp-ref-verified" id="cpRefVerified" hidden><i class="fas fa-check-circle"></i></span></div>' +
        '<div class="cp-ref-online-row">' +
        '<span class="cp-ref-online" id="cpRefOnline" hidden><i></i> Online</span>' +
        '<span class="cp-ref-id">ID:<strong id="cpRefDisplayId">—</strong>' +
        '<button type="button" class="cp-ref-copy" id="cpRefCopyId" aria-label="Copy ID"><i class="far fa-copy"></i></button></span>' +
        '</div>' +
        '<div class="cp-ref-meta-row" id="cpRefMeta"></div>' +
        '<div class="cp-ref-badge-row profile-status-badges" id="cpRefStatusBadges"></div>' +
        '<div class="cp-ref-actions" id="cpRefActions">' +
        '<button type="button" class="cp-ref-follow" id="cpRefFollow">Follow</button>' +
        '<button type="button" class="cp-ref-message" id="cpRefMessage"><i class="fas fa-comment"></i> Message</button>' +
        '</div></section>' +
        '<a class="cp-ref-live-banner" id="cpRefLive" hidden></a>' +
        '<div class="cp-ref-stats" id="cpRefStats"></div>' +
        '<a class="cp-ref-supporter-link" id="cpRefSupporterLink" href="#">' +
        '<span class="cp-ref-supporter-glow" aria-hidden="true"></span>' +
        '<span class="cp-ref-supporter-icon" aria-hidden="true"><i class="fas fa-trophy"></i></span>' +
        '<span class="cp-ref-supporter-text">' +
        '<strong>Supporters · Top gifts</strong>' +
        '<span>See who sent the most this month</span>' +
        '</span>' +
        '<i class="fas fa-chevron-right cp-ref-supporter-chevron" aria-hidden="true"></i>' +
        '</a>' +
        '<div class="cp-ref-medals" id="cpRefMedals"></div>' +
        '<nav class="cp-ref-tabs" id="cpRefTabs">' +
        '<button type="button" class="cp-ref-tab" data-tab="data">Data</button>' +
        '<button type="button" class="cp-ref-tab" data-tab="relationship">Relationship</button>' +
        '<button type="button" class="cp-ref-tab is-active" data-tab="gift">Gift</button>' +
        '<button type="button" class="cp-ref-tab" data-tab="posts">Posts</button>' +
        '</nav>' +
        '<div class="cp-ref-panel" id="cpRefPanelData" hidden></div>' +
        '<div class="cp-ref-panel" id="cpRefPanelRel" hidden></div>' +
        '<div class="cp-ref-panel" id="cpRefPanelGift"></div>' +
        '<div class="cp-ref-panel cp-ref-posts-wrap" id="cpRefPanelPosts" hidden><div class="social-post-feed" id="cpRefPostsFeed"></div></div>' +
        '<div class="cp-ref-mood" id="cpRefMood" hidden>What&apos;s your mood now? <span>🫘</span></div>' +
        '<button type="button" class="cp-ref-share" id="cpRefShare" hidden><i class="fas fa-paper-plane"></i> Share a Post</button>';

      document.getElementById('cpRefBack')?.addEventListener('click', () => {
        if (history.length > 1) history.back();
        else location.href = '/video.html?app=1';
      });

      document.getElementById('cpRefSupporterLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.state.userId) return;
        location.href =
          '/supporter.html?userId=' +
          encodeURIComponent(this.state.userId) +
          '&period=monthly&app=1';
      });
    },

    bindTabs() {
      document.getElementById('cpRefTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cp-ref-tab');
        if (!btn) return;
        this.switchTab(btn.dataset.tab);
      });
    },

    bindActions() {
      document.getElementById('cpRefFollow')?.addEventListener('click', async () => {
        if (!this.requireAuth()) return;
        const uid = this.state.userId;
        if (!uid) return;
        if (!window.SocialInteractions?.toggleFollow) {
          window.SocialUI?.toast?.('Please wait and try again', 'warning');
          return;
        }
        this.state.following = await SocialInteractions.toggleFollow(uid, this.state.name);
        this.syncFollowBtn();
      });

      document.getElementById('cpRefMessage')?.addEventListener('click', () => {
        if (!this.requireAuth()) return;
        if (!this.state.userId) return;
        location.href = '/chat.html?id=' + encodeURIComponent(this.state.userId) + '&app=1';
      });

      document.getElementById('cpRefShare')?.addEventListener('click', () => {
        location.href = '/square.html?app=1&compose=1';
      });

      document.getElementById('cpRefCopyId')?.addEventListener('click', async () => {
        const id = document.getElementById('cpRefDisplayId')?.textContent?.trim();
        if (!id || id === '—') return;
        try {
          await navigator.clipboard.writeText(id);
          window.SocialUI?.toast?.('User ID copied');
        } catch (_e) {
          alert('ID: ' + id);
        }
      });
    },

    requireAuth() {
      const authed = window.Auth?.hasSession?.() || window.Auth?.getToken?.() || localStorage.getItem('token');
      if (authed) return true;
      location.href =
        '/app-auth.html?app=1&redirect=' + encodeURIComponent(location.pathname + location.search);
      return false;
    },

    async loadAll() {
      const headers = { Accept: 'application/json' };
      const token = window.Auth?.getToken?.() || localStorage.getItem('token');
      if (token) headers.Authorization = 'Bearer ' + token;

      let panel = null;
      let engagement = null;

      try {
        if (window.Auth?.ensureAccessToken) await window.Auth.ensureAccessToken().catch(() => {});
        const [panelRes, engRes] = await Promise.all([
          fetch(apiRoot() + '/social/creators/' + encodeURIComponent(this.state.userId) + '/profile-panel', {
            credentials: 'include',
            headers,
          }).then((r) => r.json()),
          fetch(apiRoot() + '/social/creators/' + encodeURIComponent(this.state.userId) + '/engagement', {
            credentials: 'include',
            headers,
          }).then((r) => r.json()),
        ]);
        if (panelRes?.success) panel = panelRes.data;
        if (engRes?.success) engagement = engRes.data;
      } catch (e) {
        console.warn('[creator-profile]', e);
      }

      try {
        this.state.panel = panel;
        this.state.engagement = engagement;

        if (window.SocialInteractions?.isFollowing) {
          this.state.following = SocialInteractions.isFollowing(this.state.userId, this.state.name);
        } else if (engagement?.isFollowing) {
          this.state.following = true;
        }

        this.paintHeader(panel, engagement);
        this.paintCover(panel);
        this.paintStats(panel, engagement);
        this.paintMedals(panel);
        this.paintGiftGrid(document.getElementById('cpRefPanelGift'), panel);
        this.paintDataTab(panel);
        this.paintRelTab();
        this.state.cpMounted = true;
        this.updateTabCounts(panel, engagement);
        this.syncFollowBtn();
        this.switchTab(this.state.activeTab);

        if (this.state.isSelf) {
          document.getElementById('cpRefEditPill')?.removeAttribute('hidden');
          document.getElementById('cpRefShare')?.removeAttribute('hidden');
          document.getElementById('cpRefMood')?.removeAttribute('hidden');
          document.getElementById('cpRefCoverAdd')?.removeAttribute('hidden');
          document.getElementById('cpRefActions')?.setAttribute('hidden', '');
          document.getElementById('cpRefGiftLink')?.setAttribute('hidden', '');
          this.bindCoverAdd();
        }
      } catch (e) {
        console.error('[creator-profile] paint failed', e);
        this.showEmpty('Could not load this profile. Pull to refresh or try again.');
      } finally {
        this.markReady();
      }
    },

    markReady() {
      const root = document.getElementById('cpRefRoot');
      if (root) root.removeAttribute('aria-busy');
    },

    coverImageUrl(url, cacheKey) {
      if (!url) return '';
      return (
        window.SocialShell?.getImageUrl?.(url, cacheKey) ||
        window.SocialUI?.avatarUrl?.('', url) ||
        url
      );
    },

    paintCover(panel) {
      const track = document.getElementById('cpRefCoverTrack');
      const dots = document.getElementById('cpRefCoverDots');
      const mini = document.getElementById('cpRefCoverMini');
      if (!track) return;

      const album = panel?.album || [];
      const cacheKey = panel?.profileUpdatedAt || this.state.userId;

      if (!album.length) {
        track.innerHTML = '<div class="cp-ref-cover-slide cp-ref-cover-slide--empty"></div>';
        if (dots) {
          dots.hidden = true;
          dots.innerHTML = '';
        }
        if (mini) mini.hidden = true;
        return;
      }

      track.innerHTML = album
        .map((p, i) => {
          const src = this.coverImageUrl(p.url, cacheKey);
          return (
            '<div class="cp-ref-cover-slide" data-idx="' +
            i +
            '"><img src="' +
            esc(src) +
            '" alt="" loading="' +
            (i === 0 ? 'eager' : 'lazy') +
            '"></div>'
          );
        })
        .join('');

      track.querySelectorAll('img').forEach((img) => {
        img.onerror = () => {
          img.onerror = null;
          img.src = window.SocialUI?.avatarUrl?.('Photo');
        };
      });

      if (dots) {
        dots.hidden = album.length <= 1;
        dots.innerHTML = album
          .map(
            (_, i) =>
              '<button type="button" class="cp-ref-cover-dot' +
              (i === 0 ? ' is-active' : '') +
              '" data-idx="' +
              i +
              '" aria-label="Photo ' +
              (i + 1) +
              '"></button>'
          )
          .join('');
      }

      const syncCoverUi = () => {
        const width = track.clientWidth || 1;
        const idx = Math.max(0, Math.min(Math.round(track.scrollLeft / width), album.length - 1));
        dots?.querySelectorAll('.cp-ref-cover-dot').forEach((d, i) => {
          d.classList.toggle('is-active', i === idx);
        });
        const activeImg = track.querySelectorAll('.cp-ref-cover-slide img')[idx];
        if (mini && activeImg?.src) {
          mini.src = activeImg.src;
          mini.hidden = album.length <= 1;
        }
      };

      track.onscroll = () => {
        clearTimeout(this._coverScrollTimer);
        this._coverScrollTimer = setTimeout(syncCoverUi, 60);
      };

      if (dots) {
        dots.onclick = (e) => {
          const dot = e.target.closest('.cp-ref-cover-dot');
          if (!dot) return;
          const idx = Number(dot.dataset.idx || 0);
          track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
        };
      }

      syncCoverUi();
    },

    bindCoverAdd() {
      if (this._coverAddBound) return;
      this._coverAddBound = true;
      const addBtn = document.getElementById('cpRefCoverAdd');
      const input = document.getElementById('cpRefCoverInput');
      if (!addBtn || !input) return;

      addBtn.addEventListener('click', () => {
        const count = this.state.panel?.album?.length || 0;
        if (count >= 6) {
          window.SocialUI?.toast?.('Maximum 6 background photos', 'warning');
          return;
        }
        input.click();
      });

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
          window.SocialUI?.toast?.('Please choose an image file', 'warning');
          return;
        }
        addBtn.disabled = true;
        try {
          await window.Auth?.ensureAccessToken?.();
          const fd = new FormData();
          fd.append('photo', file);
          const token = window.Auth?.getToken?.() || localStorage.getItem('token');
          const res = await fetch(apiRoot() + '/auth/profile/album', {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: fd,
          }).then((r) => r.json());
          if (!res?.success) {
            window.SocialUI?.toast?.(res?.message || 'Upload failed', 'error');
            return;
          }
          if (this.state.panel) {
            this.state.panel.album = res.data?.album || [];
            this.state.panel.albumCount = this.state.panel.album.length;
          }
          try {
            const token2 = window.Auth?.getToken?.() || localStorage.getItem('token');
            const panelRes = await fetch(
              apiRoot() +
                '/social/creators/' +
                encodeURIComponent(this.state.userId) +
                '/profile-panel',
              {
                credentials: 'include',
                headers: token2
                  ? { Authorization: 'Bearer ' + token2, Accept: 'application/json' }
                  : { Accept: 'application/json' },
              }
            ).then((r) => r.json());
            if (panelRes?.success) {
              this.state.panel = panelRes.data;
            }
          } catch (_e) { /* keep local album */ }
          this.paintCover(this.state.panel);
          const compEl = document.getElementById('cpRefCompletion');
          if (compEl && this.state.panel?.profileCompletion != null) {
            compEl.textContent = this.state.panel.profileCompletion + '%';
          }
          window.SocialUI?.toast?.('Background photo added', 'success');
        } catch (e) {
          console.warn('[creator-profile] album upload', e);
          window.SocialUI?.toast?.('Failed to upload photo', 'error');
        } finally {
          addBtn.disabled = false;
        }
      });
    },

    paintHeader(panel, engagement) {
      const displayName = panel?.displayName || engagement?.displayName || this.state.name;
      this.state.name = displayName;
      document.getElementById('cpRefHeaderTitle').textContent = displayName;
      document.getElementById('cpRefName').textContent = displayName;

      const pic = panel?.profilePic || engagement?.profilePic;
      const av = document.getElementById('cpRefAvatar');
      if (av) {
        av.src = pic
          ? window.SocialShell?.getImageUrl?.(pic, panel?.profileUpdatedAt || this.state.userId) ||
            window.SocialUI?.avatarUrl?.(displayName, pic)
          : window.SocialUI?.avatarUrl?.(displayName);
        av.onerror = () => {
          av.onerror = null;
          av.src = window.SocialUI?.avatarUrl?.(displayName);
        };
      }

      const verified = panel?.isVerified || engagement?.isVerified;
      const verEl = document.getElementById('cpRefVerified');
      if (verEl) verEl.hidden = !verified;

      const displayId =
        window.formatUserDisplayId?.(engagement || panel) ||
        panel?.displayId ||
        engagement?.displayId ||
        '';
      const idEl = document.getElementById('cpRefDisplayId');
      if (idEl) idEl.textContent = displayId || '—';

      const onlineEl = document.getElementById('cpRefOnline');
      if (onlineEl) onlineEl.hidden = !engagement?.isLive;

      const live = document.getElementById('cpRefLive');
      if (live && engagement?.isLive) {
        live.hidden = false;
        live.href =
          engagement.liveHref ||
          ('/' +
            (engagement.liveRoomType === 'party' ? 'party-room' : 'live-room') +
            '.html?channel=' +
            encodeURIComponent(engagement.liveChannel || '') +
            '&app=1');
        live.textContent =
          '● LIVE now · ' + fmt(engagement.liveViewers) + ' watching — Tap to join';
      }

      const meta = document.getElementById('cpRefMeta');
      if (meta) {
        const pills = [];
        const g = genderLabel(panel?.gender);
        if (g) {
          const age = panel?.age ? ' ' + panel.age : '';
          pills.push(
            '<span class="cp-ref-pill cp-ref-pill--gender">' + esc(g.icon + age) + '</span>'
          );
        }
        const role = panel?.role || engagement?.role;
        if (role === 'agency' || engagement?.agencyName) {
          pills.push(
            '<span class="cp-ref-pill cp-ref-pill--agency"><i class="fas fa-user-tie"></i> Agency</span>'
          );
        } else if (role === 'creator' || role === 'host') {
          pills.push('<span class="cp-ref-pill"><i class="fas fa-video"></i> Host</span>');
        } else if (role === 'coin_seller') {
          pills.push('<span class="cp-ref-pill"><i class="fas fa-coins"></i> Seller</span>');
        }
        meta.innerHTML = pills.join('');
      }

      const badges = panel?.badges || engagement?.badges || engagement;
      const statusEl = document.getElementById('cpRefStatusBadges');
      if (statusEl && window.ProfileBadges?.paintBadges) {
        window.ProfileBadges.paintBadges(statusEl, badges, { link: true, hideLevel: true });
      }

      const completion = panel?.profileCompletion;
      const compEl = document.getElementById('cpRefCompletion');
      if (compEl && completion != null) compEl.textContent = completion + '%';

      this.bindAvatarLightbox(pic, displayName, panel);
    },

    bindAvatarLightbox(pic, displayName, panel) {
      const av = document.getElementById('cpRefAvatar');
      if (!av || av.dataset.lightboxBound) return;
      av.dataset.lightboxBound = '1';
      const fullSrc = pic
        ? window.SocialShell?.getImageUrl?.(pic, panel?.profileUpdatedAt || this.state.userId) ||
          window.SocialUI?.avatarUrl?.(displayName, pic)
        : '';
      av.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = fullSrc || av.src;
        if (!src) return;
        this.openImageLightbox(src, displayName);
      });
    },

    openImageLightbox(src, alt) {
      let lb = document.getElementById('cpRefImageLightbox');
      if (!lb) {
        lb = document.createElement('div');
        lb.id = 'cpRefImageLightbox';
        lb.className = 'cp-ref-image-lightbox';
        lb.innerHTML =
          '<button type="button" class="cp-ref-image-lightbox-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
          '<img alt="">';
        document.body.appendChild(lb);
        lb.addEventListener('click', (e) => {
          if (e.target === lb || e.target.closest('.cp-ref-image-lightbox-close')) {
            lb.classList.remove('is-open');
          }
        });
        lb.querySelector('.cp-ref-image-lightbox-close')?.addEventListener('click', () => {
          lb.classList.remove('is-open');
        });
      }
      const img = lb.querySelector('img');
      if (img) {
        img.src = src;
        img.alt = alt || 'Profile photo';
      }
      lb.classList.add('is-open');
    },

    paintStats(panel, engagement) {
      const el = document.getElementById('cpRefStats');
      if (!el) return;
      const friends = panel?.friendsCount ?? 0;
      const following = engagement?.following ?? panel?.following ?? 0;
      const followers = engagement?.followers ?? panel?.followers ?? 0;
      const visitors = panel?.visitorCount ?? 0;
      el.innerHTML =
        '<div class="cp-ref-stat"><strong>' +
        fmt(friends) +
        '</strong><span>Friends</span></div>' +
        '<div class="cp-ref-stat"><strong>' +
        fmt(following) +
        '</strong><span>Following</span></div>' +
        '<div class="cp-ref-stat"><strong>' +
        fmt(followers) +
        '</strong><span>Followers</span></div>' +
        '<div class="cp-ref-stat"><strong>' +
        fmt(visitors) +
        '</strong><span>Visitor</span></div>';
    },

    paintMedals(panel) {
      const el = document.getElementById('cpRefMedals');
      if (!el) return;
      const parts = [];
      const badges = panel?.badges;
      if (badges?.isSvip && badges.svipLevel > 0) {
        parts.push(
          '<div class="cp-ref-medal"><div class="cp-ref-medal-art cp-ref-medal-art--svip">SVIP ' +
            esc(badges.svipLevel) +
            '</div></div>'
        );
      }
      el.innerHTML = parts.join('') || '';
      el.hidden = !parts.length;
    },

    paintDataTab(panel) {
      const el = document.getElementById('cpRefPanelData');
      if (!el) return;
      const stats = panel?.giftStats;
      const periodLabel = stats?.periodLabel || 'This month';

      const recv = stats?.received || { giftCount: 0, giftCoins: 0 };
      const sent = stats?.sent || { giftCount: 0, giftCoins: 0 };
      const top = stats?.topSenders || [];

      const card = (label, count, coins, kind) =>
        '<div class="cp-ref-data-card cp-ref-data-card--' +
        kind +
        '">' +
        '<span class="cp-ref-data-card-label">' +
        esc(label) +
        '</span>' +
        '<strong class="cp-ref-data-card-count">' +
        fmt(count) +
        ' gifts</strong>' +
        '<span class="cp-ref-data-card-coins">' +
        fmt(coins) +
        ' coins</span>' +
        '</div>';

      let sendersHtml = '';
      if (top.length) {
        sendersHtml =
          '<h4 class="cp-ref-data-sub">Top supporters this month</h4>' +
          '<ul class="cp-ref-data-senders">' +
          top
            .map((s) => {
              const pic = s.profilePic
                ? this.coverImageUrl(s.profilePic, s.profileUpdatedAt || s.userId)
                : window.SocialUI?.avatarUrl?.(s.displayName);
              const profileHref =
                '/creator-profile.html?userId=' +
                encodeURIComponent(s.userId) +
                '&name=' +
                encodeURIComponent(s.displayName || 'User') +
                '&app=1';
              return (
                '<li class="cp-ref-data-sender">' +
                '<span class="cp-ref-data-sender-rank">#' +
                s.rank +
                '</span>' +
                '<img class="cp-ref-data-sender-av" src="' +
                esc(pic) +
                '" alt="">' +
                '<div class="cp-ref-data-sender-meta">' +
                '<a href="' +
                esc(profileHref) +
                '">' +
                esc(s.displayName) +
                '</a>' +
                '<span>' +
                fmt(s.giftCount) +
                ' gifts · ' +
                fmt(s.giftCoins) +
                ' coins</span>' +
                '</div></li>'
              );
            })
            .join('') +
          '</ul>';
      } else {
        sendersHtml =
          '<p class="cp-ref-data-empty">No gifts received this month yet.</p>';
      }

      el.innerHTML =
        '<div class="cp-ref-data">' +
        '<div class="cp-ref-data-head">' +
        '<h3>Gift stats</h3>' +
        '<span class="cp-ref-data-period">' +
        esc(periodLabel) +
        '</span>' +
        '</div>' +
        '<p class="cp-ref-data-note">Counts refresh monthly from the 1st.</p>' +
        '<div class="cp-ref-data-cards">' +
        card('Received', recv.giftCount, recv.giftCoins, 'recv') +
        card('Sent', sent.giftCount, sent.giftCoins, 'sent') +
        '</div>' +
        sendersHtml +
        '</div>';
    },

    paintGiftGrid(el, panel) {
      if (!el) return;
      const wall = panel?.giftWall || [];
      if (!wall.length) {
        el.innerHTML = '<div class="cp-ref-empty">No gifts received yet.</div>';
        return;
      }
      const cells = wall
        .map((item) => {
          const g = resolveGift(item.giftType, this.state.slugMap);
          return (
            '<div class="cp-ref-gift-cell">' +
            '<div class="cp-ref-gift-emoji">' +
            esc(g.emoji || '🎁') +
            '</div>' +
            '<div class="cp-ref-gift-qty">x' +
            fmt(item.count) +
            '</div></div>'
          );
        })
        .join('');
      el.innerHTML = '<div class="cp-ref-gift-grid">' + cells + '</div>';
    },

    paintRelTab() {
      const el = document.getElementById('cpRefPanelRel');
      if (!el) return;
      el.innerHTML = '<div id="cpRefCpMount" class="cp-ref-cp-mount"></div>';
      const mount = document.getElementById('cpRefCpMount');
      const uid = this.state.userId;
      if (!uid || !window.CpProfileCard?.fetchAndMount) {
        if (mount) {
          mount.innerHTML = '<div class="cp-ref-empty">No CP couple yet.</div>';
        }
        return;
      }
      window.CpProfileCard.fetchAndMount(mount, uid, {
        showLoveHouseLink: this.state.isSelf,
        ringSize: 'md',
        meLink: !this.state.isSelf,
      }).then((data) => {
        if (!data && mount) {
          mount.innerHTML =
            '<div class="cp-ref-rel-empty">' +
            '<p>No CP partner yet.</p>' +
            (this.state.isSelf
              ? '<a href="/cp-home.html?app=1" class="cp-ref-rel-cta"><i class="fas fa-heart"></i> Open CP House</a>'
              : '') +
            '</div>';
        }
      });
    },

    updateTabCounts(panel, engagement) {
      const giftTotal = panel?.giftCount ?? engagement?.giftCount ?? 0;
      const posts =
        (engagement?.postsCount ?? 0) + (engagement?.videosCount ?? 0);
      const giftTab = document.querySelector('.cp-ref-tab[data-tab="gift"]');
      const postsTab = document.querySelector('.cp-ref-tab[data-tab="posts"]');
      if (giftTab) giftTab.textContent = 'Gift·' + fmt(giftTotal);
      if (postsTab) postsTab.textContent = 'Posts·' + fmt(posts);
    },

    syncFollowBtn() {
      const btn = document.getElementById('cpRefFollow');
      if (!btn) return;
      if (this.state.isSelf) return;
      btn.textContent = this.state.following ? 'Following' : 'Follow';
      btn.classList.toggle('is-on', this.state.following);
    },

    switchTab(tab) {
      this.state.activeTab = tab;
      document.querySelectorAll('.cp-ref-tab').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === tab);
      });
      document.getElementById('cpRefPanelData').hidden = tab !== 'data';
      document.getElementById('cpRefPanelRel').hidden = tab !== 'relationship';
      document.getElementById('cpRefPanelGift').hidden = tab !== 'gift';
      document.getElementById('cpRefPanelPosts').hidden = tab !== 'posts';
      if (tab === 'relationship' && !this.state.cpMounted) {
        this.state.cpMounted = true;
        this.paintRelTab();
      }
      if (tab === 'posts' && !this.state.postsLoaded) {
        this.loadPosts();
      }
    },

    async loadPosts() {
      this.state.postsLoaded = true;
      const feed = document.getElementById('cpRefPostsFeed');
      if (!feed || !this.state.userId || !window.SocialInteractions?.renderSquareFeed) return;
      await SocialInteractions.renderSquareFeed(feed, {
        userId: this.state.userId,
        mediaType: 'all',
        feed: 'latest',
      });
    },

    showEmpty(msg) {
      const gift = document.getElementById('cpRefPanelGift');
      if (gift) gift.innerHTML = '<div class="cp-ref-empty">' + esc(msg) + '</div>';
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.SocialShell?.initPage) SocialShell.initPage({ activeNav: 'video' });
    CreatorProfilePanel.boot();
  });

  window.CreatorProfilePanel = CreatorProfilePanel;
})();
