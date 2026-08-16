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
        '<header class="cp-ref-header">' +
        '<button type="button" class="cp-ref-icon-btn" id="cpRefBack" aria-label="Back"><i class="fas fa-arrow-left"></i></button>' +
        '<div class="cp-ref-header-title" id="cpRefHeaderTitle">' +
        esc(name) +
        '</div>' +
        '<div class="cp-ref-header-actions">' +
        '<a class="cp-ref-icon-btn" id="cpRefGiftLink" href="/store.html?app=1" aria-label="Gifts"><i class="fas fa-gift"></i></a>' +
        '<a class="cp-ref-edit-pill" id="cpRefEditPill" href="/profile-tab.html?app=1" hidden><i class="fas fa-pen"></i> <span id="cpRefCompletion">0%</span></a>' +
        '</div></header>' +
        '<section class="cp-ref-hero" id="cpRefHero">' +
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
        '<a class="cp-ref-supporter-link" id="cpRefSupporterLink" href="#">Supporters · Top gifts</a>' +
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
          '&app=1';
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

      this.state.panel = panel;
      this.state.engagement = engagement;

      if (window.SocialInteractions?.isFollowing) {
        this.state.following = SocialInteractions.isFollowing(this.state.userId, this.state.name);
      } else if (engagement?.isFollowing) {
        this.state.following = true;
      }

      this.paintHeader(panel, engagement);
      this.paintStats(panel, engagement);
      this.paintMedals(panel);
      this.paintGiftTab(panel);
      this.paintDataTab(panel, engagement);
      this.paintRelTab(panel, engagement);
      this.updateTabCounts(panel, engagement);
      this.syncFollowBtn();
      this.switchTab(this.state.activeTab);

      if (this.state.isSelf) {
        document.getElementById('cpRefEditPill')?.removeAttribute('hidden');
        document.getElementById('cpRefShare')?.removeAttribute('hidden');
        document.getElementById('cpRefMood')?.removeAttribute('hidden');
        document.getElementById('cpRefActions')?.setAttribute('hidden', '');
        document.getElementById('cpRefGiftLink')?.setAttribute('hidden', '');
      }
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
        const lvl = panel?.personalLevel || panel?.badges?.personalLevel || engagement?.personalLevel;
        if (lvl) {
          pills.push('<span class="cp-ref-level-chip"><i class="fas fa-gem"></i> ' + esc(lvl) + '</span>');
        }
        const cpLvl = panel?.cp?.cpLevel;
        if (cpLvl) {
          pills.push('<span class="cp-ref-level-chip">CP ' + esc(cpLvl) + '</span>');
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
        window.ProfileBadges.paintBadges(statusEl, badges, { link: true });
      }

      const completion = panel?.profileCompletion;
      const compEl = document.getElementById('cpRefCompletion');
      if (compEl && completion != null) compEl.textContent = completion + '%';
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
      (panel?.wealthMilestones || []).forEach((m) => {
        const cls = m.key === '100m' ? 'cp-ref-medal-art--wealth-teal' : 'cp-ref-medal-art--wealth';
        parts.push(
          '<div class="cp-ref-medal"><div class="cp-ref-medal-art ' +
            cls +
            '">' +
            esc(m.label) +
            '</div></div>'
        );
      });
      el.innerHTML = parts.join('') || '';
      el.hidden = !parts.length;
    },

    paintGiftTab(panel) {
      const el = document.getElementById('cpRefPanelGift');
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

    paintDataTab(panel, engagement) {
      const el = document.getElementById('cpRefPanelData');
      if (!el) return;
      const giftCoins = panel?.giftCoins ?? engagement?.giftEarnings ?? 0;
      const giftCount = panel?.giftCount ?? engagement?.giftCount ?? 0;
      const posts = engagement?.postsCount ?? 0;
      const videos = engagement?.videosCount ?? 0;
      const liveH = engagement?.liveHoursTotal;
      el.innerHTML =
        '<div class="cp-ref-data-grid">' +
        '<div class="cp-ref-data-card"><strong>' +
        fmt(giftCoins) +
        '</strong><span>Gift coins received</span></div>' +
        '<div class="cp-ref-data-card"><strong>' +
        fmt(giftCount) +
        '</strong><span>Gifts count</span></div>' +
        '<div class="cp-ref-data-card"><strong>' +
        fmt(posts) +
        '</strong><span>Posts</span></div>' +
        '<div class="cp-ref-data-card"><strong>' +
        fmt(videos) +
        '</strong><span>Videos</span></div>' +
        (liveH != null
          ? '<div class="cp-ref-data-card"><strong>' +
            esc(String(liveH)) +
            'h</strong><span>Live hours</span></div>'
          : '') +
        '<div class="cp-ref-data-card"><strong>Lv.' +
        esc(panel?.personalLevel || 1) +
        '</strong><span>Personal level</span></div></div>';
    },

    paintRelTab(panel, engagement) {
      const el = document.getElementById('cpRefPanelRel');
      if (!el) return;
      const cp = panel?.cp;
      let html = '';
      if (cp?.hasCp && cp.partnerName) {
        html +=
          '<div class="cp-ref-rel-card"><h4>CP Partner</h4><p>💕 ' +
          esc(cp.partnerName) +
          (cp.cpLevel ? ' · CP Level ' + esc(cp.cpLevel) : '') +
          '</p></div>';
      } else {
        html +=
          '<div class="cp-ref-rel-card"><h4>CP</h4><p>No active CP couple yet.</p></div>';
      }
      html +=
        '<div class="cp-ref-rel-card"><h4>Social</h4><p>' +
        fmt(engagement?.followers) +
        ' followers · ' +
        fmt(panel?.friendsCount) +
        ' friends · ' +
        fmt(panel?.visitorCount) +
        ' profile visitors</p></div>';
      if (engagement?.agencyName) {
        html +=
          '<div class="cp-ref-rel-card"><h4>Agency</h4><p>' +
          esc(engagement.agencyName) +
          '</p></div>';
      }
      el.innerHTML = html;
    },

    updateTabCounts(panel, engagement) {
      const giftTotal = panel?.giftCount ?? engagement?.giftCount ?? 0;
      const posts = engagement?.postsCount ?? 0;
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
        mediaType: 'posts',
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
